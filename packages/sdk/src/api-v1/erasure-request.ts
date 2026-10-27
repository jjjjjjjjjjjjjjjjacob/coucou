import type { ApiErasure, ApiErasureInput, ApiErasureResponse, ApiErrorBody } from "./types";

export type CoucouErasureResult =
  | { ok: true; erasure: ApiErasure }
  | { ok: false; status: number; error: ApiErrorBody["error"] };

/**
 * Calls POST /api/v1/erasures with a partner API key. Server-side only: the key
 * must never reach a browser. The call is idempotent, so retry it until `ok`.
 */
export async function requestCoucouErasure({
  apiBaseUrl,
  apiKey,
  input,
  fetchImplementation = fetch,
}: {
  /** The workspace's partner API base URL, ending in /api/v1. */
  apiBaseUrl: string;
  apiKey: string;
  input: ApiErasureInput;
  fetchImplementation?: typeof fetch;
}): Promise<CoucouErasureResult> {
  const response = await fetchImplementation(`${apiBaseUrl.replace(/\/+$/, "")}/erasures`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (response.ok) {
    const body = (await response.json()) as ApiErasureResponse;
    return { ok: true, erasure: body.erasure };
  }
  const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return {
    ok: false,
    status: response.status,
    error: errorBody?.error ?? {
      code: "internal_error",
      message: `Coucou erasure request failed with HTTP ${response.status}`,
    },
  };
}

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { API_CLIENT_KEY_PREFIX, type ApiClientScope, hashApiClientKey } from "./apiKeys";

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "method_not_allowed"
  | "internal_error";

const API_ERROR_CODE_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  conflict: 409,
  method_not_allowed: 405,
  internal_error: 500,
};

export function buildApiErrorResponse(code: ApiErrorCode, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status: API_ERROR_CODE_STATUS[code],
    headers: { "Content-Type": "application/json" },
  });
}

export function buildApiJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface AuthenticatedApiRequest {
  ok: true;
  apiClient: Doc<"apiClients">;
  workspaceId: Id<"workspaces">;
  workspaceSlug: string;
}

export interface RejectedApiRequest {
  ok: false;
  response: Response;
}

export type ApiRequestAuthResult = AuthenticatedApiRequest | RejectedApiRequest;

// How stale lastUsedAt may get before we schedule a write to refresh it.
const LAST_USED_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export async function authenticateApiRequest(
  ctx: ActionCtx,
  request: Request,
  requiredScope: ApiClientScope,
): Promise<ApiRequestAuthResult> {
  const authorizationHeader = request.headers.get("Authorization");
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: buildApiErrorResponse("unauthorized", "Missing Authorization: Bearer header"),
    };
  }

  const plaintextKey = authorizationHeader.slice("Bearer ".length).trim();
  if (!plaintextKey.startsWith(API_CLIENT_KEY_PREFIX)) {
    return {
      ok: false,
      response: buildApiErrorResponse("unauthorized", "Invalid API key"),
    };
  }

  const keyHash = await hashApiClientKey(plaintextKey);
  const resolvedApiClient = await ctx.runQuery(internal.apiClients.resolveByKeyHash, { keyHash });

  if (!resolvedApiClient || resolvedApiClient.apiClient.revokedAt !== undefined) {
    return {
      ok: false,
      response: buildApiErrorResponse("unauthorized", "Invalid API key"),
    };
  }

  if (!resolvedApiClient.apiClient.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: buildApiErrorResponse(
        "forbidden",
        `API key is missing the required scope: ${requiredScope}`,
      ),
    };
  }

  const lastUsedAt = resolvedApiClient.apiClient.lastUsedAt ?? 0;
  if (Date.now() - lastUsedAt > LAST_USED_REFRESH_INTERVAL_MS) {
    await ctx.scheduler.runAfter(0, internal.apiClients.recordUsage, {
      apiClientId: resolvedApiClient.apiClient._id,
    });
  }

  return {
    ok: true,
    apiClient: resolvedApiClient.apiClient,
    workspaceId: resolvedApiClient.apiClient.workspaceId,
    workspaceSlug: resolvedApiClient.workspaceSlug,
  };
}

import { describe, expect, it } from "bun:test";
import { requestCoucouErasure } from "../src/api-v1/erasure-request";

function recordingFetch(response: Response) {
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return response;
  }) as typeof fetch;
  return { requests, fetchImplementation };
}

describe("requestCoucouErasure", () => {
  it("posts the selectors with the partner key and returns the erasure", async () => {
    const erasure = {
      status: "completed",
      erasedRsvpIds: ["rsvp_1"],
      retainedRsvpIds: [],
      completedAt: 1761566400000,
    };
    const { requests, fetchImplementation } = recordingFetch(
      new Response(JSON.stringify({ erasure }), { status: 200 }),
    );

    const result = await requestCoucouErasure({
      apiBaseUrl: "https://example.convex.site/api/v1/",
      apiKey: "coucou_sk_test",
      input: { phone: "+15551230100", rsvpIds: ["rsvp_1"] },
      fetchImplementation,
    });

    expect(result).toEqual({ ok: true, erasure });
    expect(requests).toEqual([
      {
        url: "https://example.convex.site/api/v1/erasures",
        init: {
          method: "POST",
          headers: {
            Authorization: "Bearer coucou_sk_test",
            "Content-Type": "application/json",
          },
          body: '{"phone":"+15551230100","rsvpIds":["rsvp_1"]}',
        },
      },
    ]);
  });

  it("returns the API error for a rejected request", async () => {
    const { fetchImplementation } = recordingFetch(
      new Response(
        JSON.stringify({
          error: {
            code: "forbidden",
            message: "API key is missing the required scope: rsvps:write",
          },
        }),
        { status: 403 },
      ),
    );

    const result = await requestCoucouErasure({
      apiBaseUrl: "https://example.convex.site/api/v1",
      apiKey: "coucou_sk_read_only",
      input: { phone: "+15551230100" },
      fetchImplementation,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: { code: "forbidden", message: "API key is missing the required scope: rsvps:write" },
    });
  });
});

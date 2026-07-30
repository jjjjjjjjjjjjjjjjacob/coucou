import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { API_VERSION, WEBHOOK_EVENT_TYPES } from "../../packages/sdk/src/api-v1/constants.ts";

const repositoryDocumentation = readFileSync(
  new URL("../../docs/partner-api.md", import.meta.url),
  "utf8",
);
const dashboardDocumentation = readFileSync(
  new URL(
    "../../apps/coucou/app/workspaces/[workspaceSlug]/host/developers/docs/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const sdkTypes = readFileSync(
  new URL("../../packages/sdk/src/api-v1/types.ts", import.meta.url),
  "utf8",
);

describe("partner API documentation parity", () => {
  it("uses the SDK API version everywhere", () => {
    expect(repositoryDocumentation).toContain(API_VERSION);
    expect(dashboardDocumentation).toContain("API_VERSION");
  });

  it("documents every webhook event type in both references", () => {
    for (const webhookEventType of WEBHOOK_EVENT_TYPES) {
      expect(repositoryDocumentation).toContain(webhookEventType);
      expect(dashboardDocumentation).toContain(`"${webhookEventType}"`);
    }
  });

  it("documents the public routes and matching SDK contracts", () => {
    for (const route of [
      "/api/v1/events",
      "/api/v1/events/{eventRouteId}",
      "/api/v1/events/{eventRouteId}/rsvps",
      "/api/v1/events/{eventRouteId}/rsvps/lookup",
      "/api/v1/events/{eventRouteId}/rsvps/sms-consent",
      "/api/v1/rsvps/{rsvpId}",
    ]) {
      expect(repositoryDocumentation).toContain(route);
    }
    expect(sdkTypes).toContain("interface ApiRsvpContactList");
    expect(sdkTypes).toContain('{ type: "api"; apiClientId: string }');
  });
});

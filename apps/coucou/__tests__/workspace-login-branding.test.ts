import { describe, expect, it } from "bun:test";
import { siteConfigurations } from "@coucou/sdk";
import {
  buildWorkspaceAllowedRedirectOrigins,
  extractEventIdFromRedirectUrl,
  normalizeDomainOrigin,
  resolvePrimaryClientSiteConfiguration,
} from "../lib/workspace-login-branding";

describe("workspace login branding helpers", () => {
  it("extracts an event id from absolute tenant redirect URLs", () => {
    expect(
      extractEventIdFromRedirectUrl(
        "https://dojopomodoro.club/events/j97em3czdnek1t1g0jkkw4493x83ncrc?__clerk_synced=false",
      ),
    ).toBe("j97em3czdnek1t1g0jkkw4493x83ncrc");
  });

  it("extracts an event id from relative redirects", () => {
    expect(extractEventIdFromRedirectUrl("/events/event_123/ticket?source=menu")).toBe("event_123");
  });

  it("normalizes workspace domains to origins", () => {
    expect(normalizeDomainOrigin("dojopomodoro.club")).toBe("https://dojopomodoro.club");
    expect(normalizeDomainOrigin("https://dojopomodoro.club/path")).toBe(
      "https://dojopomodoro.club",
    );
    expect(normalizeDomainOrigin("localhost:5679")).toBe("http://localhost:5679");
    expect(normalizeDomainOrigin("http://localhost:5679/events/sample")).toBe(
      "http://localhost:5679",
    );
  });

  it("selects the configured client site for tenant auth copy and preset", () => {
    expect(
      resolvePrimaryClientSiteConfiguration([
        {
          siteKey: "dojo",
          domain: "https://dojopomodoro.club",
        },
      ]),
    ).toEqual(siteConfigurations.dojo);
  });

  it("allows redirects to workspace and configured client-site origins", () => {
    expect(
      buildWorkspaceAllowedRedirectOrigins({
        primaryDomain: "dojopomodoro.club",
        sites: [
          {
            siteKey: "dojo",
            domain: "https://dojopomodoro.club/events",
          },
        ],
      }),
    ).toEqual(["https://dojopomodoro.club"]);
  });

  it("allows local workspace redirects over http", () => {
    expect(
      buildWorkspaceAllowedRedirectOrigins({
        primaryDomain: "localhost:5679",
        sites: [
          {
            siteKey: "club-chlorine",
            domain: "localhost:5679",
          },
        ],
      }),
    ).toEqual(["http://localhost:5679", "https://clubchlorine.party"]);
  });
});

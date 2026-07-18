import { afterEach, describe, expect, it } from "bun:test";
import { buildReferralUrl } from "@coucou/sdk/shared/event-routes";
import {
  buildListShareUrl,
  copyTextToClipboard,
  resolvePreparedShareEventBaseUrl,
  resolveShareEventBaseUrl,
  resolveShareEventUrlWithRouteId,
} from "../components/share-event-popover";
import { buildPublicEventUrl } from "../lib/event-public-url";

describe("event sharing", () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: originalExecCommand,
    });
  });

  it("uses the resolved public tenant URL instead of the dashboard origin", () => {
    const publicEventUrl = buildPublicEventUrl(
      {
        primaryDomain: "clubchlorine.party",
      },
      { _id: "event_123", shortId: "abc1234" },
    );

    expect(publicEventUrl).toBe("https://clubchlorine.party/events/abc1234");
    expect(
      resolveShareEventBaseUrl({
        eventId: "event_123",
        eventUrl: publicEventUrl,
        origin: "https://coucou.events",
      }),
    ).toBe("https://clubchlorine.party/events/abc1234");
  });

  it("uses the event owner's configured primary URL for Club Chlorine share links", () => {
    const publicEventUrl = buildPublicEventUrl(
      {
        primaryDomain: "clubchlorine.club",
        sites: [{ siteKey: "club-chlorine", domain: "clubchlorine.party", appKind: "client" }],
      },
      { _id: "event_123", shortId: "abc1234" },
      { currentOrigin: "https://coucou.events" },
    );

    expect(publicEventUrl).toBe("https://clubchlorine.club/events/abc1234");
  });

  it("falls back to the Club Chlorine production event URL when workspace data is unavailable", () => {
    expect(
      resolveShareEventBaseUrl({
        eventId: "event_123",
        origin: "https://coucou.events",
        siteKey: "club-chlorine",
      }),
    ).toBe("https://clubchlorine.party/events/event_123");
  });

  it("uses the current Club Chlorine origin when it is a configured domain alias", () => {
    expect(
      resolveShareEventBaseUrl({
        eventId: "event_123",
        origin: "https://clubchlorine.club",
        siteKey: "club-chlorine",
      }),
    ).toBe("https://clubchlorine.club/events/event_123");
  });

  it("uses local client origins when sharing from a local coucou dashboard", () => {
    const publicEventUrl = buildPublicEventUrl(
      {
        primaryDomain: "clubchlorine.party",
        sites: [{ siteKey: "club-chlorine", appKind: "client" }],
      },
      { _id: "event_123", shortId: "abc1234" },
      { currentOrigin: "http://localhost:5680" },
    );

    expect(publicEventUrl).toBe("http://localhost:5679/events/abc1234");
  });

  it("falls back to the local Club Chlorine event URL from a local coucou dashboard", () => {
    expect(
      resolveShareEventBaseUrl({
        eventId: "event_123",
        origin: "http://localhost:5680",
        siteKey: "club-chlorine",
      }),
    ).toBe("http://localhost:5679/events/event_123");
  });

  it("uses dev client origins when sharing from a dev deployment", () => {
    const publicEventUrl = buildPublicEventUrl(
      {
        primaryDomain: "clubchlorine.party",
        sites: [{ siteKey: "club-chlorine", appKind: "client" }],
      },
      { _id: "event_123", shortId: "abc1234" },
      { currentOrigin: "https://dev.coucou.events" },
    );

    expect(publicEventUrl).toBe("https://dev.clubchlorine.party/events/abc1234");
  });

  it("replaces a long event route id with a short event route id", () => {
    expect(
      resolveShareEventUrlWithRouteId("https://clubchlorine.party/events/event_123", "abc1234"),
    ).toBe("https://clubchlorine.party/events/abc1234");
  });

  it("prefers a short event route id when one is available", () => {
    expect(
      resolvePreparedShareEventBaseUrl({
        fallbackBaseUrl: "https://clubchlorine.party/events/event_123",
        shortEventRouteId: "abc1234",
      }),
    ).toEqual({
      baseUrl: "https://clubchlorine.party/events/abc1234",
      linkKind: "short",
    });
  });

  it("falls back to a long event route id when a short id is unavailable", () => {
    expect(
      resolvePreparedShareEventBaseUrl({
        fallbackBaseUrl: "https://clubchlorine.party/events/event_123",
        shortEventRouteId: null,
      }),
    ).toEqual({
      baseUrl: "https://clubchlorine.party/events/event_123",
      linkKind: "long",
    });
  });

  it("adds referral codes without dropping existing route state", () => {
    expect(
      buildReferralUrl("https://clubchlorine.party/events/abc1234?password=guest", "ABCD1234"),
    ).toBe("https://clubchlorine.party/events/abc1234?password=guest&ref=ABCD1234");
  });

  it("adds list route state without dropping referral codes", () => {
    const listShareUrl = buildListShareUrl(
      "https://clubchlorine.party/events/abc1234?ref=ABCD1234",
      {
        listKey: "vip",
        password: "guest",
      },
    );

    expect(listShareUrl).toBe(
      "https://clubchlorine.party/events/abc1234?ref=ABCD1234&list=vip&password=guest",
    );
  });

  it("falls back to document copy when navigator clipboard rejects", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: (command: string) => command === "copy",
    });

    await expect(
      copyTextToClipboard("https://clubchlorine.party/events/event_123"),
    ).resolves.toEqual({
      copied: true,
    });
  });

  it("returns the copy failure reason when every clipboard path fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("clipboard blocked");
        },
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    });

    await expect(
      copyTextToClipboard("https://clubchlorine.party/events/event_123"),
    ).resolves.toEqual({
      copied: false,
      errorMessage: "clipboard blocked",
    });
  });
});

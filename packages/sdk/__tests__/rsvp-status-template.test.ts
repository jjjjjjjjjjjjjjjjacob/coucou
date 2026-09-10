import { describe, expect, it } from "bun:test";
import {
  appendRsvpStatusCta,
  applyMessageTemplateVariables,
  messageContainsMultiEventRestrictedVariables,
  RSVP_STATUS_CTA,
} from "../src/shared/message-template";
import { getRsvpSourceLabel } from "../src/shared/rsvp-source";

describe("RSVP message helpers", () => {
  it("appends the editable CTA once and renders all occurrences literally", () => {
    const template = appendRsvpStatusCta("Request received.");
    expect(template).toBe(`Request received.\n\n${RSVP_STATUS_CTA}`);
    expect(appendRsvpStatusCta(template)).toBe(template);
    const rendered = applyMessageTemplateVariables("{{ eventStatusUrl }} {{eventStatusUrl}}", {
      firstName: "Ava",
      eventName: "Night",
      eventDate: "",
      eventLocation: "",
      eventStatusUrl: "https://example.com/events/night/status",
    });
    expect(rendered).toBe(
      "https://example.com/events/night/status https://example.com/events/night/status",
    );
    expect(messageContainsMultiEventRestrictedVariables(RSVP_STATUS_CTA)).toBe(true);
  });

  it("labels sources without guessing historical records", () => {
    expect(
      ["text", "form", "api", "unknown"].map((source) =>
        getRsvpSourceLabel(source as "text" | "form" | "api" | "unknown"),
      ),
    ).toEqual(["Text", "Form", "API", "Unknown"]);
    expect(getRsvpSourceLabel(undefined)).toBe("Unknown");
  });
});

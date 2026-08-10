import { describe, expect, it } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import {
  eventPartnersToDrafts,
  sanitizeEventPartnerDraftsForSubmit,
} from "../components/event-partners-editor";

describe("Coucou event partner editor values", () => {
  it("hydrates ordered records into editable drafts", () => {
    expect(
      eventPartnersToDrafts([
        {
          label: "The Market",
          logoStorageId: "market" as Id<"_storage">,
          url: "https://themarket.nyc/",
        },
        { label: "Nothing Radio", logoStorageId: "radio" as Id<"_storage"> },
      ]),
    ).toEqual([
      { label: "The Market", logoStorageId: "market", url: "https://themarket.nyc/" },
      { label: "Nothing Radio", logoStorageId: "radio", url: "" },
    ]);
  });

  it("sanitizes populated drafts and drops untouched add-entry rows", () => {
    expect(
      sanitizeEventPartnerDraftsForSubmit([
        { label: " The Market ", logoStorageId: "market", url: " https://themarket.nyc " },
        { label: "", logoStorageId: null, url: "" },
      ]),
    ).toEqual([
      {
        label: "The Market",
        logoStorageId: "market",
        url: "https://themarket.nyc/",
      },
    ]);
  });

  it("rejects a partially completed record before persistence", () => {
    expect(() =>
      sanitizeEventPartnerDraftsForSubmit([{ label: "The Market", logoStorageId: null, url: "" }]),
    ).toThrow("The Market logo is required");
  });
});

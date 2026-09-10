import { describe, expect, it } from "bun:test";
import { sortTextBlastMessageEventsNewestFirst } from "@/lib/text-blast-message";

describe("text blast message events", () => {
  it("sorts the message event dropdown from furthest future to furthest past", () => {
    const events = [
      { name: "Past", eventDate: 1_000 },
      { name: "Future", eventDate: 3_000 },
      { name: "Unknown" },
      { name: "Present", eventDate: 2_000 },
    ];

    expect(sortTextBlastMessageEventsNewestFirst(events).map((event) => event.name)).toEqual([
      "Future",
      "Present",
      "Past",
      "Unknown",
    ]);
    expect(events.map((event) => event.name)).toEqual(["Past", "Future", "Unknown", "Present"]);
  });
});

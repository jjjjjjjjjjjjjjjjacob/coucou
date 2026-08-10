import { describe, expect, it } from "bun:test";
import {
  DANZA_LOGO_OPEN_GRAPH_IMAGE_URL,
  resolveDanzaOpenGraphImageUrl,
} from "@/lib/event-open-graph";

describe("Danza event Open Graph image", () => {
  it("uses the thumbnail by default for existing events", () => {
    expect(
      resolveDanzaOpenGraphImageUrl({ thumbnailUrl: "https://images.example/event.jpg" }),
    ).toBe("https://images.example/event.jpg");
  });

  it("uses the globe image when selected even if a thumbnail exists", () => {
    expect(
      resolveDanzaOpenGraphImageUrl({
        source: "logo",
        thumbnailUrl: "https://images.example/event.jpg",
      }),
    ).toBe(DANZA_LOGO_OPEN_GRAPH_IMAGE_URL);
  });

  it("falls back to the globe image when a thumbnail is unavailable", () => {
    expect(resolveDanzaOpenGraphImageUrl({ source: "thumbnail", thumbnailUrl: null })).toBe(
      DANZA_LOGO_OPEN_GRAPH_IMAGE_URL,
    );
  });
});

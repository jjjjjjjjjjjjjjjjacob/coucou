import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ASSET_PATHS,
  BEATS_PER_MINUTE,
  COMPOSITION_DURATION_IN_FRAMES,
  COMPOSITION_FRAMES_PER_SECOND,
  COMPOSITION_HEIGHT,
  COMPOSITION_ID,
  COMPOSITION_WIDTH,
  DATE_COMPOSITION_DURATION_IN_FRAMES,
  DATE_COMPOSITION_ID,
  DATE_INTRO_SCENES,
  DATE_SCENE_DOWNBEAT_FRAMES,
  DATE_SCENE_TIMELINE,
  DATE_TOTAL_BEATS,
  FRAMES_PER_BEAT,
  MOVING_FLYER_COMPOSITION_ID,
  MOVING_FLYER_DURATION_IN_FRAMES,
  MOVING_FLYER_EVENT_TIME,
  OFFER_STEPS,
  SCENE_TIMELINE,
  TOMORROW_COMPOSITION_ID,
  TOMORROW_DATE_INTRO_SCENES,
  TONIGHT_COMPOSITION_ID,
  TONIGHT_DATE_INTRO_SCENES,
  TOTAL_BEATS,
} from "./constants";

function expectContiguousTimeline(
  sceneTimeline: Readonly<Record<string, { readonly start: number; readonly duration: number }>>,
  compositionDurationInFrames: number,
) {
  const orderedScenes = Object.values(sceneTimeline);
  expect(orderedScenes[0].start).toBe(0);

  for (let sceneIndex = 1; sceneIndex < orderedScenes.length; sceneIndex += 1) {
    const previousScene = orderedScenes[sceneIndex - 1];
    const currentScene = orderedScenes[sceneIndex];
    expect(currentScene.start).toBe(previousScene.start + previousScene.duration);
  }

  const finalScene = orderedScenes.at(-1);
  expect(finalScene).toBeDefined();
  expect((finalScene?.start ?? 0) + (finalScene?.duration ?? 0)).toBe(compositionDurationInFrames);
}

describe("Danza Organica promo timeline", () => {
  test("is a 14-second portrait composition on a 120 BPM grid", () => {
    expect(COMPOSITION_ID).toBe("danza-organica-drinks-on-us-9x16");
    expect(COMPOSITION_WIDTH).toBe(1080);
    expect(COMPOSITION_HEIGHT).toBe(1920);
    expect(COMPOSITION_FRAMES_PER_SECOND).toBe(30);
    expect(BEATS_PER_MINUTE).toBe(120);
    expect(FRAMES_PER_BEAT).toBe(15);
    expect(TOTAL_BEATS).toBe(28);
    expect(COMPOSITION_DURATION_IN_FRAMES).toBe(420);
    expect(SCENE_TIMELINE.endCard.duration).toBe(FRAMES_PER_BEAT * 10);
  });

  test("covers every frame exactly once with contiguous scenes", () => {
    expectContiguousTimeline(SCENE_TIMELINE, COMPOSITION_DURATION_IN_FRAMES);
  });

  test("adds a 15-second date-intro variant on the same beat grid", () => {
    expect(DATE_COMPOSITION_ID).toBe("danza-organica-drinks-on-us-date-9x16");
    expect(DATE_TOTAL_BEATS).toBe(30);
    expect(DATE_COMPOSITION_DURATION_IN_FRAMES).toBe(450);
    expect(DATE_SCENE_TIMELINE.howItWorks.duration).toBe(FRAMES_PER_BEAT * 2);
    expect(DATE_SCENE_TIMELINE.endCard.duration).toBe(FRAMES_PER_BEAT * 10);
    expectContiguousTimeline(DATE_SCENE_TIMELINE, DATE_COMPOSITION_DURATION_IN_FRAMES);

    for (const sceneTiming of Object.values(DATE_SCENE_TIMELINE)) {
      expect(sceneTiming.start % FRAMES_PER_BEAT).toBe(0);
      expect(sceneTiming.duration % FRAMES_PER_BEAT).toBe(0);
    }

    expect([...DATE_SCENE_DOWNBEAT_FRAMES]).toEqual(
      Object.values(DATE_SCENE_TIMELINE).map((sceneTiming) => sceneTiming.start),
    );
  });

  test("adds an eight-second portrait moving flyer based on the promo end card", () => {
    expect(MOVING_FLYER_COMPOSITION_ID).toBe("danza-organica-moving-flyer-9x16");
    expect(MOVING_FLYER_DURATION_IN_FRAMES).toBe(COMPOSITION_FRAMES_PER_SECOND * 8);
    expect(MOVING_FLYER_EVENT_TIME).toBe("10pm-LATE");
  });

  test("uses the approved date-intro copy and choreography", () => {
    expect(DATE_INTRO_SCENES.map(({ text, position }) => ({ text, position }))).toEqual([
      { text: "FRIDAY", position: "top" },
      { text: "AUGUST 21", position: "middle" },
      { text: "LAISSEZ FAIRE", position: "bottom" },
    ]);
  });

  test("adds tomorrow and tonight variants on the unchanged date-intro timeline", () => {
    expect(TOMORROW_COMPOSITION_ID).toBe("danza-organica-drinks-on-us-tomorrow-9x16");
    expect(TONIGHT_COMPOSITION_ID).toBe("danza-organica-drinks-on-us-tonight-9x16");
    expect(TOMORROW_DATE_INTRO_SCENES.map(({ text }) => text)).toEqual([
      "TOMORROW",
      "AUGUST 21",
      "LAISSEZ FAIRE",
    ]);
    expect(TONIGHT_DATE_INTRO_SCENES.map(({ text }) => text)).toEqual([
      "TONIGHT",
      "AUGUST 21",
      "LAISSEZ FAIRE",
    ]);
    expect(TOMORROW_DATE_INTRO_SCENES.map(({ start, duration }) => ({ start, duration }))).toEqual(
      DATE_INTRO_SCENES.map(({ start, duration }) => ({ start, duration })),
    );
    expect(TONIGHT_DATE_INTRO_SCENES.map(({ start, duration }) => ({ start, duration }))).toEqual(
      DATE_INTRO_SCENES.map(({ start, duration }) => ({ start, duration })),
    );
  });

  test("keeps the approved offer copy and ordering", () => {
    expect(OFFER_STEPS).toEqual([
      {
        identifier: "download",
        number: "01",
        title: "Download",
        body: "Get The Market on your phone.",
      },
      {
        identifier: "onboard",
        number: "02",
        title: "Onboard",
        body: "Finish your profile in the app.",
      },
      {
        identifier: "match",
        number: "03",
        title: "Match",
        body: "Match with someone at the event.",
      },
      {
        identifier: "redeem",
        number: "04",
        title: "Redeem",
        body: "Show the match to claim your drinks.",
      },
    ]);
  });

  test("all bundled visual and guide-audio assets exist", () => {
    const publicDirectory = resolve(import.meta.dir, "../../../../danza-organica/public");

    for (const assetPath of Object.values(ASSET_PATHS)) {
      expect(existsSync(resolve(publicDirectory, assetPath))).toBe(true);
    }
  });
});

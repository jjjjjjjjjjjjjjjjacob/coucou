export const COMPOSITION_ID = "danza-organica-drinks-on-us-9x16";
export const DATE_COMPOSITION_ID = "danza-organica-drinks-on-us-date-9x16";
export const TOMORROW_COMPOSITION_ID = "danza-organica-drinks-on-us-tomorrow-9x16";
export const TONIGHT_COMPOSITION_ID = "danza-organica-drinks-on-us-tonight-9x16";
export const MOVING_FLYER_COMPOSITION_ID = "danza-organica-moving-flyer-9x16";
export const COMPOSITION_WIDTH = 1080;
export const COMPOSITION_HEIGHT = 1920;
export const COMPOSITION_FRAMES_PER_SECOND = 30;
export const BEATS_PER_MINUTE = 120;
export const FRAMES_PER_BEAT = (COMPOSITION_FRAMES_PER_SECOND * 60) / BEATS_PER_MINUTE;
export const TOTAL_BEATS = 28;
export const DATE_TOTAL_BEATS = 30;
export const COMPOSITION_DURATION_IN_FRAMES = FRAMES_PER_BEAT * TOTAL_BEATS;
export const DATE_COMPOSITION_DURATION_IN_FRAMES = FRAMES_PER_BEAT * DATE_TOTAL_BEATS;
export const MOVING_FLYER_DURATION_IN_FRAMES = COMPOSITION_FRAMES_PER_SECOND * 8;
export const MOVING_FLYER_EVENT_TIME = "10pm-LATE";
export const SCENE_PREMOUNT_IN_FRAMES = FRAMES_PER_BEAT;

export const COLORS = {
  turquoise: "#17E1E5",
  orange: "#FC7243",
  nearBlack: "#0A0A0A",
  white: "#FFFFFF",
} as const;

export const ASSET_PATHS = {
  guideClick: "audio/guide-click.wav",
  guideDownbeat: "audio/guide-downbeat.wav",
  laissezFaire: "partners/laissez-faire.png",
  marketHeart: "brand/the-market-heart-black.svg",
  marketWordmark: "partners/logo-wordmark-orange.svg",
  marketWordmarkFlash: "partners/the-market-logo-wordmark-black.svg",
  nothingRadio: "partners/nothing-radio-flash.svg",
  nothingRadioEndCard: "partners/nothing-radio-black-orange.svg",
} as const;

export const SCENE_TIMELINE = {
  nothingRadio: { start: 0, duration: FRAMES_PER_BEAT },
  market: { start: FRAMES_PER_BEAT, duration: FRAMES_PER_BEAT },
  laissezFaire: { start: FRAMES_PER_BEAT * 2, duration: FRAMES_PER_BEAT },
  danzaTitle: { start: FRAMES_PER_BEAT * 3, duration: FRAMES_PER_BEAT * 3 },
  drinksHero: { start: FRAMES_PER_BEAT * 6, duration: FRAMES_PER_BEAT * 4 },
  download: { start: FRAMES_PER_BEAT * 10, duration: FRAMES_PER_BEAT * 2 },
  onboard: { start: FRAMES_PER_BEAT * 12, duration: FRAMES_PER_BEAT * 2 },
  match: { start: FRAMES_PER_BEAT * 14, duration: FRAMES_PER_BEAT * 2 },
  redeem: { start: FRAMES_PER_BEAT * 16, duration: FRAMES_PER_BEAT * 2 },
  endCard: { start: FRAMES_PER_BEAT * 18, duration: FRAMES_PER_BEAT * 10 },
} as const;

export const DATE_SCENE_TIMELINE = {
  friday: { start: 0, duration: FRAMES_PER_BEAT },
  augustTwentyFirst: { start: FRAMES_PER_BEAT, duration: FRAMES_PER_BEAT },
  laissezFaire: { start: FRAMES_PER_BEAT * 2, duration: FRAMES_PER_BEAT },
  danzaTitle: { start: FRAMES_PER_BEAT * 3, duration: FRAMES_PER_BEAT * 3 },
  drinksHero: { start: FRAMES_PER_BEAT * 6, duration: FRAMES_PER_BEAT * 4 },
  howItWorks: { start: FRAMES_PER_BEAT * 10, duration: FRAMES_PER_BEAT * 2 },
  download: { start: FRAMES_PER_BEAT * 12, duration: FRAMES_PER_BEAT * 2 },
  onboard: { start: FRAMES_PER_BEAT * 14, duration: FRAMES_PER_BEAT * 2 },
  match: { start: FRAMES_PER_BEAT * 16, duration: FRAMES_PER_BEAT * 2 },
  redeem: { start: FRAMES_PER_BEAT * 18, duration: FRAMES_PER_BEAT * 2 },
  endCard: { start: FRAMES_PER_BEAT * 20, duration: FRAMES_PER_BEAT * 10 },
} as const;

interface DateIntroFirstFlash {
  readonly text: string;
  readonly fontSize: number;
}

export interface DateIntroScene extends DateIntroFirstFlash {
  readonly start: number;
  readonly duration: number;
  readonly position: "top" | "middle" | "bottom";
}

export const DATE_INTRO_FIRST_FLASHES = {
  friday: { text: "FRIDAY", fontSize: 250 },
  tomorrow: { text: "TOMORROW", fontSize: 143 },
  tonight: { text: "TONIGHT", fontSize: 203 },
} as const satisfies Record<string, DateIntroFirstFlash>;

export function createDateIntroScenes(firstFlash: DateIntroFirstFlash): readonly DateIntroScene[] {
  return [
    {
      ...DATE_SCENE_TIMELINE.friday,
      ...firstFlash,
      position: "top",
    },
    {
      ...DATE_SCENE_TIMELINE.augustTwentyFirst,
      text: "AUGUST 21",
      fontSize: 166,
      position: "middle",
    },
    {
      ...DATE_SCENE_TIMELINE.laissezFaire,
      text: "LAISSEZ FAIRE",
      fontSize: 126,
      position: "bottom",
    },
  ];
}

export const DATE_INTRO_SCENES = createDateIntroScenes(DATE_INTRO_FIRST_FLASHES.friday);
export const TOMORROW_DATE_INTRO_SCENES = createDateIntroScenes(DATE_INTRO_FIRST_FLASHES.tomorrow);
export const TONIGHT_DATE_INTRO_SCENES = createDateIntroScenes(DATE_INTRO_FIRST_FLASHES.tonight);

export const SCENE_DOWNBEAT_FRAMES = [
  SCENE_TIMELINE.nothingRadio.start,
  SCENE_TIMELINE.market.start,
  SCENE_TIMELINE.laissezFaire.start,
  SCENE_TIMELINE.danzaTitle.start,
  SCENE_TIMELINE.drinksHero.start,
  SCENE_TIMELINE.download.start,
  SCENE_TIMELINE.onboard.start,
  SCENE_TIMELINE.match.start,
  SCENE_TIMELINE.redeem.start,
  SCENE_TIMELINE.endCard.start,
] as const;

export const DATE_SCENE_DOWNBEAT_FRAMES = [
  DATE_SCENE_TIMELINE.friday.start,
  DATE_SCENE_TIMELINE.augustTwentyFirst.start,
  DATE_SCENE_TIMELINE.laissezFaire.start,
  DATE_SCENE_TIMELINE.danzaTitle.start,
  DATE_SCENE_TIMELINE.drinksHero.start,
  DATE_SCENE_TIMELINE.howItWorks.start,
  DATE_SCENE_TIMELINE.download.start,
  DATE_SCENE_TIMELINE.onboard.start,
  DATE_SCENE_TIMELINE.match.start,
  DATE_SCENE_TIMELINE.redeem.start,
  DATE_SCENE_TIMELINE.endCard.start,
] as const;

export type OfferStepIdentifier = "download" | "onboard" | "match" | "redeem";

export interface OfferStep {
  readonly identifier: OfferStepIdentifier;
  readonly number: string;
  readonly title: string;
  readonly body: string;
}

export const OFFER_STEPS: readonly OfferStep[] = [
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
] as const;

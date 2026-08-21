import { Audio } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { z } from "zod";
import {
  ASSET_PATHS,
  COLORS,
  DATE_INTRO_SCENES,
  DATE_SCENE_DOWNBEAT_FRAMES,
  DATE_SCENE_TIMELINE,
  DATE_TOTAL_BEATS,
  type DateIntroScene,
  MOVING_FLYER_EVENT_TIME,
  OFFER_STEPS,
  SCENE_DOWNBEAT_FRAMES,
  SCENE_PREMOUNT_IN_FRAMES,
  SCENE_TIMELINE,
  TOMORROW_DATE_INTRO_SCENES,
  TONIGHT_DATE_INTRO_SCENES,
  TOTAL_BEATS,
} from "./constants";
import { GuideClickTrack } from "./guide-audio";
import {
  DanzaTitleScene,
  DrinksHeroScene,
  EndCardScene,
  EventDetailFlashScene,
  HowItWorksScene,
  OfferStepScene,
  PartnerFlashScene,
} from "./scenes";

export const danzaOrganicaDrinksPromoSchema = z.object({
  musicFileName: z.string().nullable(),
  includeGuideClicks: z.boolean(),
});

export type DanzaOrganicaDrinksPromoProps = z.infer<typeof danzaOrganicaDrinksPromoSchema>;

export function DanzaOrganicaMovingFlyer() {
  return <EndCardScene eventTime={MOVING_FLYER_EVENT_TIME} />;
}

interface SceneTiming {
  readonly start: number;
  readonly duration: number;
}

interface SharedSceneTimeline {
  readonly danzaTitle: SceneTiming;
  readonly drinksHero: SceneTiming;
  readonly howItWorks?: SceneTiming;
  readonly download: SceneTiming;
  readonly onboard: SceneTiming;
  readonly match: SceneTiming;
  readonly redeem: SceneTiming;
  readonly endCard: SceneTiming;
}

interface SharedPromoCompositionProps extends DanzaOrganicaDrinksPromoProps {
  readonly openingScenes: ReactNode;
  readonly sceneTimeline: SharedSceneTimeline;
  readonly sceneDownbeatFrames: readonly number[];
  readonly totalBeats: number;
}

function SharedPromoComposition({
  musicFileName,
  includeGuideClicks,
  openingScenes,
  sceneTimeline,
  sceneDownbeatFrames,
  totalBeats,
}: SharedPromoCompositionProps) {
  return (
    <AbsoluteFill>
      {openingScenes}
      <Sequence
        from={sceneTimeline.danzaTitle.start}
        durationInFrames={sceneTimeline.danzaTitle.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <DanzaTitleScene />
      </Sequence>
      <Sequence
        from={sceneTimeline.drinksHero.start}
        durationInFrames={sceneTimeline.drinksHero.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <DrinksHeroScene />
      </Sequence>
      {sceneTimeline.howItWorks ? (
        <Sequence
          from={sceneTimeline.howItWorks.start}
          durationInFrames={sceneTimeline.howItWorks.duration}
          premountFor={SCENE_PREMOUNT_IN_FRAMES}
        >
          <HowItWorksScene />
        </Sequence>
      ) : null}
      <Sequence
        from={sceneTimeline.download.start}
        durationInFrames={sceneTimeline.download.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <OfferStepScene step={OFFER_STEPS[0]} />
      </Sequence>
      <Sequence
        from={sceneTimeline.onboard.start}
        durationInFrames={sceneTimeline.onboard.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <OfferStepScene step={OFFER_STEPS[1]} />
      </Sequence>
      <Sequence
        from={sceneTimeline.match.start}
        durationInFrames={sceneTimeline.match.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <OfferStepScene step={OFFER_STEPS[2]} />
      </Sequence>
      <Sequence
        from={sceneTimeline.redeem.start}
        durationInFrames={sceneTimeline.redeem.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <OfferStepScene step={OFFER_STEPS[3]} />
      </Sequence>
      <Sequence
        from={sceneTimeline.endCard.start}
        durationInFrames={sceneTimeline.endCard.duration}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <EndCardScene />
      </Sequence>

      {musicFileName ? <Audio src={staticFile(musicFileName)} /> : null}
      {includeGuideClicks && !musicFileName ? (
        <GuideClickTrack totalBeats={totalBeats} sceneDownbeatFrames={sceneDownbeatFrames} />
      ) : null}
    </AbsoluteFill>
  );
}

export function DanzaOrganicaDrinksPromo({
  musicFileName,
  includeGuideClicks,
}: DanzaOrganicaDrinksPromoProps) {
  return (
    <SharedPromoComposition
      musicFileName={musicFileName}
      includeGuideClicks={includeGuideClicks}
      sceneTimeline={SCENE_TIMELINE}
      sceneDownbeatFrames={SCENE_DOWNBEAT_FRAMES}
      totalBeats={TOTAL_BEATS}
      openingScenes={
        <>
          <Sequence
            from={SCENE_TIMELINE.nothingRadio.start}
            durationInFrames={SCENE_TIMELINE.nothingRadio.duration}
            premountFor={SCENE_PREMOUNT_IN_FRAMES}
          >
            <PartnerFlashScene
              assetPath={ASSET_PATHS.nothingRadio}
              color={COLORS.turquoise}
              position="top"
              width={680}
              height={406}
            />
          </Sequence>
          <Sequence
            from={SCENE_TIMELINE.market.start}
            durationInFrames={SCENE_TIMELINE.market.duration}
            premountFor={SCENE_PREMOUNT_IN_FRAMES}
          >
            <PartnerFlashScene
              assetPath={ASSET_PATHS.marketWordmarkFlash}
              color={COLORS.turquoise}
              position="middle"
              width={800}
              height={246}
            />
          </Sequence>
          <Sequence
            from={SCENE_TIMELINE.laissezFaire.start}
            durationInFrames={SCENE_TIMELINE.laissezFaire.duration}
            premountFor={SCENE_PREMOUNT_IN_FRAMES}
          >
            <PartnerFlashScene
              assetPath={ASSET_PATHS.laissezFaire}
              color={COLORS.turquoise}
              position="bottom"
              width={820}
              height={207}
            />
          </Sequence>
        </>
      }
    />
  );
}

interface DanzaOrganicaDateDrinksPromoVariantProps extends DanzaOrganicaDrinksPromoProps {
  readonly dateIntroScenes: readonly DateIntroScene[];
}

function DanzaOrganicaDateDrinksPromoVariant({
  musicFileName,
  includeGuideClicks,
  dateIntroScenes,
}: DanzaOrganicaDateDrinksPromoVariantProps) {
  return (
    <SharedPromoComposition
      musicFileName={musicFileName}
      includeGuideClicks={includeGuideClicks}
      sceneTimeline={DATE_SCENE_TIMELINE}
      sceneDownbeatFrames={DATE_SCENE_DOWNBEAT_FRAMES}
      totalBeats={DATE_TOTAL_BEATS}
      openingScenes={dateIntroScenes.map((eventDetailScene) => (
        <Sequence
          key={eventDetailScene.text}
          from={eventDetailScene.start}
          durationInFrames={eventDetailScene.duration}
          premountFor={SCENE_PREMOUNT_IN_FRAMES}
        >
          <EventDetailFlashScene
            fontSize={eventDetailScene.fontSize}
            text={eventDetailScene.text}
            position={eventDetailScene.position}
          />
        </Sequence>
      ))}
    />
  );
}

export function DanzaOrganicaDateDrinksPromo(props: DanzaOrganicaDrinksPromoProps) {
  return <DanzaOrganicaDateDrinksPromoVariant {...props} dateIntroScenes={DATE_INTRO_SCENES} />;
}

export function DanzaOrganicaTomorrowDrinksPromo(props: DanzaOrganicaDrinksPromoProps) {
  return (
    <DanzaOrganicaDateDrinksPromoVariant {...props} dateIntroScenes={TOMORROW_DATE_INTRO_SCENES} />
  );
}

export function DanzaOrganicaTonightDrinksPromo(props: DanzaOrganicaDrinksPromoProps) {
  return (
    <DanzaOrganicaDateDrinksPromoVariant {...props} dateIntroScenes={TONIGHT_DATE_INTRO_SCENES} />
  );
}

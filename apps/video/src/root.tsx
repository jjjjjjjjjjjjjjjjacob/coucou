import { Composition } from "remotion";
import {
  DanzaOrganicaDateDrinksPromo,
  DanzaOrganicaDrinksPromo,
  type DanzaOrganicaDrinksPromoProps,
  DanzaOrganicaMovingFlyer,
  DanzaOrganicaTomorrowDrinksPromo,
  DanzaOrganicaTonightDrinksPromo,
  danzaOrganicaDrinksPromoSchema,
} from "./projects/danza-organica/composition";
import {
  COMPOSITION_DURATION_IN_FRAMES,
  COMPOSITION_FRAMES_PER_SECOND,
  COMPOSITION_HEIGHT,
  COMPOSITION_ID,
  COMPOSITION_WIDTH,
  DATE_COMPOSITION_DURATION_IN_FRAMES,
  DATE_COMPOSITION_ID,
  MOVING_FLYER_COMPOSITION_ID,
  MOVING_FLYER_DURATION_IN_FRAMES,
  TOMORROW_COMPOSITION_ID,
  TONIGHT_COMPOSITION_ID,
} from "./projects/danza-organica/constants";

const defaultCompositionProps: DanzaOrganicaDrinksPromoProps = {
  musicFileName: null,
  includeGuideClicks: true,
};

export function VideoRoot() {
  return (
    <>
      <Composition<typeof danzaOrganicaDrinksPromoSchema, DanzaOrganicaDrinksPromoProps>
        id={COMPOSITION_ID}
        component={DanzaOrganicaDrinksPromo}
        schema={danzaOrganicaDrinksPromoSchema}
        durationInFrames={COMPOSITION_DURATION_IN_FRAMES}
        fps={COMPOSITION_FRAMES_PER_SECOND}
        width={COMPOSITION_WIDTH}
        height={COMPOSITION_HEIGHT}
        defaultProps={defaultCompositionProps}
      />
      <Composition<typeof danzaOrganicaDrinksPromoSchema, DanzaOrganicaDrinksPromoProps>
        id={DATE_COMPOSITION_ID}
        component={DanzaOrganicaDateDrinksPromo}
        schema={danzaOrganicaDrinksPromoSchema}
        durationInFrames={DATE_COMPOSITION_DURATION_IN_FRAMES}
        fps={COMPOSITION_FRAMES_PER_SECOND}
        width={COMPOSITION_WIDTH}
        height={COMPOSITION_HEIGHT}
        defaultProps={defaultCompositionProps}
      />
      <Composition<typeof danzaOrganicaDrinksPromoSchema, DanzaOrganicaDrinksPromoProps>
        id={TOMORROW_COMPOSITION_ID}
        component={DanzaOrganicaTomorrowDrinksPromo}
        schema={danzaOrganicaDrinksPromoSchema}
        durationInFrames={DATE_COMPOSITION_DURATION_IN_FRAMES}
        fps={COMPOSITION_FRAMES_PER_SECOND}
        width={COMPOSITION_WIDTH}
        height={COMPOSITION_HEIGHT}
        defaultProps={defaultCompositionProps}
      />
      <Composition<typeof danzaOrganicaDrinksPromoSchema, DanzaOrganicaDrinksPromoProps>
        id={TONIGHT_COMPOSITION_ID}
        component={DanzaOrganicaTonightDrinksPromo}
        schema={danzaOrganicaDrinksPromoSchema}
        durationInFrames={DATE_COMPOSITION_DURATION_IN_FRAMES}
        fps={COMPOSITION_FRAMES_PER_SECOND}
        width={COMPOSITION_WIDTH}
        height={COMPOSITION_HEIGHT}
        defaultProps={defaultCompositionProps}
      />
      <Composition
        id={MOVING_FLYER_COMPOSITION_ID}
        component={DanzaOrganicaMovingFlyer}
        durationInFrames={MOVING_FLYER_DURATION_IN_FRAMES}
        fps={COMPOSITION_FRAMES_PER_SECOND}
        width={COMPOSITION_WIDTH}
        height={COMPOSITION_HEIGHT}
      />
    </>
  );
}

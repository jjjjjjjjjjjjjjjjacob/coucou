import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import { ASSET_PATHS, FRAMES_PER_BEAT, SCENE_PREMOUNT_IN_FRAMES } from "./constants";

interface GuideClickTrackProps {
  readonly totalBeats: number;
  readonly sceneDownbeatFrames: readonly number[];
}

export function GuideClickTrack({ totalBeats, sceneDownbeatFrames }: GuideClickTrackProps) {
  const sceneDownbeatFrameSet = new Set<number>(sceneDownbeatFrames);

  return Array.from({ length: totalBeats }, (_, beatIndex) => {
    const beatFrame = beatIndex * FRAMES_PER_BEAT;
    const isSceneDownbeat = sceneDownbeatFrameSet.has(beatFrame);

    return (
      <Sequence
        key={beatFrame}
        from={beatFrame}
        durationInFrames={3}
        premountFor={SCENE_PREMOUNT_IN_FRAMES}
      >
        <Audio
          src={staticFile(isSceneDownbeat ? ASSET_PATHS.guideDownbeat : ASSET_PATHS.guideClick)}
          volume={isSceneDownbeat ? 0.72 : 0.38}
        />
      </Sequence>
    );
  });
}

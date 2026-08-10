import type { CSSProperties } from "react";

const BAUHAUS_ENTRANCE_INITIAL_DELAY_MILLISECONDS = 180;
const BAUHAUS_ENTRANCE_STAGGER_MILLISECONDS = 90;

type BauhausEntranceStyle = CSSProperties & {
  "--danza-bauhaus-enter-delay": string;
};

export function createBauhausEntranceStyle(sequenceIndex: number): BauhausEntranceStyle {
  const delayMilliseconds =
    BAUHAUS_ENTRANCE_INITIAL_DELAY_MILLISECONDS +
    sequenceIndex * BAUHAUS_ENTRANCE_STAGGER_MILLISECONDS;

  return {
    "--danza-bauhaus-enter-delay": `${delayMilliseconds}ms`,
  };
}

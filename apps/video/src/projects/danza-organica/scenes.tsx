import { loadFont } from "@remotion/google-fonts/Geist";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BrandMask } from "./brand-mask";
import { ASSET_PATHS, COLORS, type OfferStep } from "./constants";
import { OfferIcon } from "./offer-icons";
import { PerspectiveDotField } from "./perspective-dot-field";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800", "900"],
  subsets: ["latin"],
});

const CRISP_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const OVERSHOOT_EASING = Easing.bezier(0.34, 1.56, 0.64, 1);

function TurquoiseSurface() {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.turquoise,
        backgroundImage:
          "radial-gradient(circle at 15% 10%, rgba(255,255,255,0.2), transparent 28%), radial-gradient(circle at 88% 92%, rgba(252,114,67,0.2), transparent 32%)",
      }}
    />
  );
}

interface PartnerFlashSceneProps {
  readonly assetPath: string;
  readonly color: string;
  readonly position: "top" | "middle" | "bottom";
  readonly width: number;
  readonly height: number;
  readonly renderOriginalColors?: boolean;
}

const partnerPositionStyle = {
  top: { justifyContent: "flex-start", paddingTop: 210 },
  middle: { justifyContent: "center", paddingTop: 0 },
  bottom: { justifyContent: "flex-end", paddingBottom: 220 },
} as const;

const eventDetailLineOffset = {
  top: -145,
  middle: 0,
  bottom: 145,
} as const;

function useFlashAnimation() {
  const frame = useCurrentFrame();

  return {
    opacity: interpolate(frame, [0, 1, 3, 11, 14], [0, 1, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    scale: interpolate(frame, [0, 3, 9, 14], [1.5, 1.06, 1, 0.92], {
      easing: CRISP_EASING,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  };
}

export function PartnerFlashScene({
  assetPath,
  color,
  position,
  width,
  height,
  renderOriginalColors = false,
}: PartnerFlashSceneProps) {
  const { opacity, scale } = useFlashAnimation();
  const colorFilterIdentifier = `orange-to-turquoise-${position}`;
  const renderBrand = (brandWidth: number, brandHeight: number) =>
    renderOriginalColors ? (
      <Img
        src={staticFile(assetPath)}
        style={{
          width: brandWidth,
          height: brandHeight,
          objectFit: "contain",
          filter: color === COLORS.turquoise ? `url(#${colorFilterIdentifier})` : undefined,
        }}
      />
    ) : (
      <BrandMask assetPath={assetPath} color={color} width={brandWidth} height={brandHeight} />
    );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        backgroundColor: COLORS.nearBlack,
        overflow: "hidden",
        ...partnerPositionStyle[position],
      }}
    >
      {renderOriginalColors && color === COLORS.turquoise ? (
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <defs>
            <filter id={colorFilterIdentifier} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values="0.09127 0 0 0 0  0 1.97368 0 0 0  0 0 3.41791 0 0  0 0 0 1 0"
              />
            </filter>
          </defs>
        </svg>
      ) : null}
      <div
        style={{
          opacity,
          scale,
          filter: "drop-shadow(0 0 14px rgba(23, 225, 229, 0.42))",
        }}
      >
        {renderBrand(width, height)}
      </div>
    </AbsoluteFill>
  );
}

interface EventDetailFlashSceneProps {
  readonly fontSize: number;
  readonly text: string;
  readonly position: "top" | "middle" | "bottom";
}

export function EventDetailFlashScene({ fontSize, text, position }: EventDetailFlashSceneProps) {
  const { opacity, scale } = useFlashAnimation();

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.nearBlack,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 880,
          height: 130,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          translate: `0 ${eventDetailLineOffset[position]}px`,
        }}
      >
        <span
          style={{
            display: "inline-block",
            color: COLORS.turquoise,
            fontFamily,
            fontSize,
            fontWeight: 900,
            letterSpacing: -3,
            lineHeight: 1,
            textAlign: "left",
            textShadow: "0 0 18px rgba(23, 225, 229, 0.42)",
            whiteSpace: "nowrap",
            opacity,
            scale,
            transformOrigin: "center center",
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
}

export function DanzaTitleScene() {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 5], [0, 1], {
    easing: OVERSHOOT_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [38, 44], [0, 1], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = entrance * (1 - exit);
  const titleStyle = {
    margin: 0,
    color: COLORS.turquoise,
    fontFamily,
    fontSize: 176,
    fontWeight: 900,
    letterSpacing: -12,
    lineHeight: 0.77,
    textAlign: "left",
    textShadow: "0 0 18px rgba(23, 225, 229, 0.42)",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  } as const;
  const titleGroupStyle = {
    position: "absolute",
    left: 84,
    right: 84,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    transformOrigin: "center center",
  } as const;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.nearBlack,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          ...titleGroupStyle,
          opacity,
          scale: 1 + (1 - entrance) * 0.15 + exit * 0.12,
          translate: `0 ${interpolate(entrance, [0, 1], [55, 0])}px`,
        }}
      >
        <p style={titleStyle}>DANZA</p>
        <p style={titleStyle}>ORGANICA</p>
        <div
          style={{
            marginTop: 34,
            padding: "14px 22px",
            backgroundColor: COLORS.turquoise,
            color: COLORS.nearBlack,
            fontFamily,
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: 8,
          }}
        >
          VOL. 4
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function DrinksHeroScene() {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 5], [0, 1], {
    easing: CRISP_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const downbeatFrame = frame % 15;
  const heartScale = interpolate(downbeatFrame, [0, 2, 6], [1.08, 1.02, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const designScale = 960 / 1194;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <TurquoiseSurface />
      <div
        style={{
          position: "relative",
          width: 1194,
          height: 422,
          flex: "none",
          scale: designScale * (0.94 + entrance * 0.06),
          opacity: entrance,
          translate: `${interpolate(entrance, [0, 1], [-55, 0])}px 0`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 46,
            top: 59,
            height: 57,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            backgroundColor: COLORS.nearBlack,
            color: COLORS.turquoise,
            fontFamily,
            fontSize: 23,
            fontWeight: 800,
            letterSpacing: 4.5,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          THE MARKET × DANZA ORGANICA
        </div>
        <p
          style={{
            position: "absolute",
            left: 46,
            top: 181,
            margin: 0,
            color: COLORS.nearBlack,
            fontFamily,
            fontSize: 23,
            fontWeight: 900,
            letterSpacing: 3.8,
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          FIRST 50 MATCHES
        </p>
        <div
          style={{
            position: "absolute",
            left: 46,
            top: 220,
            display: "flex",
            alignItems: "center",
            gap: 23,
            color: COLORS.nearBlack,
            fontFamily,
            fontSize: 116,
            fontWeight: 900,
            letterSpacing: -8.5,
            lineHeight: 0.9,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          <span>DRINKS ON US</span>
          <Img
            src={staticFile(ASSET_PATHS.marketHeart)}
            style={{
              width: 175,
              height: 165,
              objectFit: "contain",
              scale: heartScale,
              flex: "none",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}

export function HowItWorksScene() {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 6], [0, 1], {
    easing: OVERSHOOT_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [24, 29], [0, 1], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: COLORS.nearBlack,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 920,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: COLORS.turquoise,
          fontFamily,
          fontSize: 180,
          fontWeight: 900,
          letterSpacing: -10,
          lineHeight: 0.78,
          textAlign: "center",
          textShadow: "0 0 18px rgba(23, 225, 229, 0.42)",
          opacity: entrance * (1 - exit),
          scale: 0.9 + entrance * 0.1 + exit * 0.08,
          translate: `0 ${interpolate(entrance - exit, [0, 1], [48, 0])}px`,
        }}
      >
        <span>HOW IT</span>
        <span>WORKS</span>
      </div>
    </AbsoluteFill>
  );
}

interface OfferStepSceneProps {
  readonly step: OfferStep;
}

export function OfferStepScene({ step }: OfferStepSceneProps) {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 6], [0, 1], {
    easing: OVERSHOOT_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [26, 29], [0, 1], {
    easing: Easing.in(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visibility = entrance * (1 - exit);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <TurquoiseSurface />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          boxSizing: "border-box",
          padding: "190px 86px 280px",
          display: "flex",
          flexDirection: "column",
          color: COLORS.nearBlack,
          fontFamily,
          opacity: visibility,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `5px solid ${COLORS.nearBlack}`,
            paddingBottom: 22,
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 7,
            textTransform: "uppercase",
            translate: `0 ${interpolate(entrance, [0, 1], [-16, 0])}px`,
          }}
        >
          <span>DRINKS ON US</span>
          <span>{step.number} / 04</span>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "relative", width: 460, height: 506 }}>
            <div
              style={{
                position: "absolute",
                inset: 45,
                borderRadius: "50%",
                backgroundColor: COLORS.orange,
                opacity: 0.65 * visibility,
                scale: 1.2,
                filter: "blur(70px)",
              }}
            />
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                scale: 0.7 + entrance * 0.3 - exit * 0.08,
                rotate: `${interpolate(entrance, [0, 1], [-5, 0])}deg`,
              }}
            >
              <OfferIcon identifier={step.identifier} />
            </div>
          </div>
        </div>
        <div
          style={{
            borderTop: `5px solid ${COLORS.nearBlack}`,
            paddingTop: 34,
            translate: `${interpolate(entrance - exit, [0, 1], [70, 0])}px 0`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 28,
              color: COLORS.orange,
              fontSize: 136,
              fontWeight: 900,
              letterSpacing: -8,
              lineHeight: 0.82,
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                color: COLORS.nearBlack,
                fontSize: 42,
                letterSpacing: 2,
                lineHeight: 1,
                paddingTop: 4,
              }}
            >
              {step.number}
            </span>
            {step.title}
          </div>
          <p
            style={{
              maxWidth: 820,
              margin: "34px 0 0",
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: -1.6,
              lineHeight: 1.05,
            }}
          >
            {step.body}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
}

interface EndCardSceneProps {
  readonly eventTime?: string;
}

export function EndCardScene({ eventTime = "9PM–4AM" }: EndCardSceneProps) {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 8], [0, 1], {
    easing: CRISP_EASING,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.turquoise,
        isolation: "isolate",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <PerspectiveDotField />
      </div>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: 920,
          height: "100%",
          margin: "0 auto",
          padding: "118px 0 106px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.nearBlack,
          fontFamily,
          textAlign: "center",
          opacity: entrance,
          scale: 0.95 + entrance * 0.05,
          translate: `0 ${interpolate(entrance, [0, 1], [42, 0])}px`,
        }}
      >
        <div
          style={{
            color: COLORS.orange,
            fontSize: 31,
            fontWeight: 900,
            letterSpacing: 8,
          }}
        >
          VOL. 4
        </div>
        <h1
          style={{
            margin: "34px 0 0",
            color: COLORS.orange,
            fontSize: 154,
            fontWeight: 900,
            letterSpacing: -10,
            lineHeight: 0.78,
            textTransform: "uppercase",
          }}
        >
          DANZA
          <br />
          ORGANICA
        </h1>
        <div
          style={{
            marginTop: 48,
            position: "relative",
            zIndex: 1,
            color: COLORS.orange,
            fontSize: 27,
            fontWeight: 900,
            letterSpacing: 7,
            textTransform: "uppercase",
          }}
        >
          FEATURING
        </div>
        <Img
          src={staticFile(ASSET_PATHS.nothingRadioEndCard)}
          style={{ width: 392, height: 220, marginTop: 42, objectFit: "contain" }}
        />
        <div
          style={{
            marginTop: 0,
            color: COLORS.orange,
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: -1,
            lineHeight: 1.2,
            textTransform: "uppercase",
          }}
        >
          FRI 08.21 · <span style={{ textTransform: "none" }}>{eventTime}</span>
          <br />
          LAISSEZ-FAIRE
        </div>
        <div
          style={{
            marginTop: 42,
            minWidth: 210,
            padding: "22px 38px",
            borderRadius: 14,
            backgroundColor: COLORS.orange,
            boxShadow: `9px 9px 0 ${COLORS.nearBlack}`,
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: 7,
            textTransform: "uppercase",
          }}
        >
          RSVP
        </div>
        <div
          style={{
            marginTop: 52,
            color: COLORS.orange,
            fontSize: 23,
            fontWeight: 800,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          POWERED BY
        </div>
        <BrandMask
          assetPath={ASSET_PATHS.marketWordmark}
          color={COLORS.orange}
          width={360}
          height={111}
          style={{ marginTop: 8 }}
        />
      </div>
    </AbsoluteFill>
  );
}

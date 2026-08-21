import type { OfferStepIdentifier } from "./constants";
import { COLORS } from "./constants";

interface OfferIconProps {
  readonly identifier: OfferStepIdentifier;
}

const sharedIconStyle = {
  fill: "none",
  stroke: COLORS.nearBlack,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 20,
  vectorEffect: "non-scaling-stroke",
} as const;

function DownloadIcon() {
  return (
    <>
      <rect x="45" y="26" width="110" height="168" rx="28" {...sharedIconStyle} />
      <path d="M100 55v75m0 0-25-25m25 25 25-25M73 165h54" {...sharedIconStyle} />
    </>
  );
}

function OnboardIcon() {
  return (
    <>
      <defs>
        <mask
          id="onboard-neck-cutout"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="200"
          height="220"
        >
          <rect width="200" height="220" fill="white" />
          <circle cx="85" cy="76" r="32" fill="black" />
        </mask>
      </defs>
      <path
        d="M34 183c8-51 25-78 51-78s44 27 52 78"
        mask="url(#onboard-neck-cutout)"
        {...sharedIconStyle}
      />
      <circle cx="85" cy="76" r="32" {...sharedIconStyle} />
      <circle {...sharedIconStyle} cx="145" cy="59" r="32" fill={COLORS.turquoise} />
      <path d="m130 60 11 11 22-28" {...sharedIconStyle} />
    </>
  );
}

function MatchIcon() {
  return (
    <>
      <defs>
        <mask
          id="match-neck-cutout"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="200"
          height="220"
        >
          <rect width="200" height="220" fill="white" />
          <circle cx="58" cy="114" r="27" fill="black" />
          <circle cx="142" cy="114" r="27" fill="black" />
        </mask>
      </defs>
      <g mask="url(#match-neck-cutout)">
        <path d="M15 190c7-37 21-56 43-56s37 19 44 56" {...sharedIconStyle} />
        <path d="M98 190c7-37 22-56 44-56s36 19 43 56" {...sharedIconStyle} />
      </g>
      <circle cx="58" cy="114" r="27" {...sharedIconStyle} />
      <circle cx="142" cy="114" r="27" {...sharedIconStyle} />
      <path
        {...sharedIconStyle}
        d="M100 42c-17-23-50 6 0 42 50-36 17-65 0-42Z"
        fill={COLORS.turquoise}
      />
    </>
  );
}

function RedeemIcon() {
  return (
    <>
      <path d="M42 66h116l-15 121H58L42 66Z" {...sharedIconStyle} />
      <path d="m67 66 17-44m31 44 22-58M62 127h85" {...sharedIconStyle} />
      <path
        {...sharedIconStyle}
        d="m29 43 8-19 8 19 19 8-19 8-8 19-8-19-19-8 19-8Z"
        fill={COLORS.turquoise}
      />
    </>
  );
}

export function OfferIcon({ identifier }: OfferIconProps) {
  return (
    <svg viewBox="0 0 200 220" width="100%" height="100%" aria-hidden="true">
      {identifier === "download" ? <DownloadIcon /> : null}
      {identifier === "onboard" ? <OnboardIcon /> : null}
      {identifier === "match" ? <MatchIcon /> : null}
      {identifier === "redeem" ? <RedeemIcon /> : null}
    </svg>
  );
}

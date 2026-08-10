import Image from "next/image";
import Link from "next/link";
import { createBauhausEntranceStyle } from "@/lib/bauhaus-entrance";

const MARKET_DOWNLOAD_URL = "https://the-market.app/downloads";

const offerSteps = [
  { identifier: "download", title: "Download", body: "Get The Market on your phone." },
  { identifier: "onboard", title: "Onboard", body: "Finish your profile in the app." },
  { identifier: "match", title: "Match", body: "Match with someone at the event." },
  { identifier: "redeem", title: "Redeem", body: "Show the match to claim your drinks." },
] as const;

interface DanzaMarketDrinksOfferProps {
  ticketHref: string;
}

export function DanzaMarketDrinksOffer({ ticketHref }: DanzaMarketDrinksOfferProps) {
  return (
    <section
      className="danza-market-offer danza-bauhaus-frame-enter"
      aria-labelledby="danza-market-offer-title"
      style={createBauhausEntranceStyle(0)}
    >
      <div
        className="danza-market-offer__collaboration danza-bauhaus-enter"
        style={createBauhausEntranceStyle(0)}
      >
        The Market × Danza Organica
      </div>
      <div className="danza-market-offer__hero">
        <p
          className="danza-market-offer__eyebrow danza-bauhaus-enter"
          style={createBauhausEntranceStyle(1)}
        >
          First 50 matches
        </p>
        <div className="danza-market-offer__headline">
          <h2
            id="danza-market-offer-title"
            className="danza-bauhaus-enter"
            style={createBauhausEntranceStyle(2)}
          >
            Drinks on{" "}
            <span className="danza-market-offer__headline-lockup">
              us
              <Image
                className="danza-market-offer__heart danza-bauhaus-enter"
                src="/brand/the-market-heart-black.svg"
                alt=""
                width={135}
                height={127}
                aria-hidden="true"
                style={createBauhausEntranceStyle(3)}
              />
            </span>
          </h2>
        </div>
      </div>

      <div
        className="danza-market-offer__illustration danza-bauhaus-enter"
        role="img"
        aria-label="Download The Market, onboard, match at the event, and redeem free drinks"
        style={createBauhausEntranceStyle(4)}
      >
        <svg viewBox="0 0 760 210" aria-hidden="true">
          <path
            className="danza-market-offer__route danza-market-offer__route--one"
            pathLength="1"
            d="M155 105H225"
          />
          <path
            className="danza-market-offer__route danza-market-offer__route--two"
            pathLength="1"
            d="M345 105H398"
          />
          <path
            className="danza-market-offer__route danza-market-offer__route--three"
            pathLength="1"
            d="M552 105H605"
          />

          <g className="danza-market-offer__step danza-market-offer__step--download">
            <rect
              className="danza-market-offer__icon-plate"
              x="35"
              y="30"
              width="120"
              height="150"
              rx="28"
            />
            <rect x="61" y="49" width="68" height="112" rx="12" />
            <path
              className="danza-market-offer__micro danza-market-offer__micro--download"
              d="M95 69v48m0 0-15-15m15 15 15-15M77 139h36"
            />
          </g>

          <g className="danza-market-offer__step danza-market-offer__step--onboard">
            <rect
              className="danza-market-offer__icon-plate"
              x="225"
              y="30"
              width="120"
              height="150"
              rx="28"
            />
            <circle cx="270" cy="78" r="21" />
            <path d="M237 147c5-30 16-46 33-46s29 16 34 46" />
            <g className="danza-market-offer__micro danza-market-offer__micro--check">
              <circle className="danza-market-offer__detail-badge" cx="319" cy="62" r="17" />
              <path d="m311 64 6 6 11-14" />
            </g>
          </g>

          <g className="danza-market-offer__step danza-market-offer__step--match">
            <rect
              className="danza-market-offer__icon-plate"
              x="398"
              y="30"
              width="154"
              height="150"
              rx="28"
            />
            <g className="danza-market-offer__micro danza-market-offer__micro--heart">
              <circle className="danza-market-offer__detail-badge" cx="475" cy="61" r="22" />
              <path d="M475 55c-9-12-25 3 0 20 25-17 9-32 0-20Z" />
            </g>
            <circle cx="438" cy="101" r="17" />
            <circle cx="512" cy="101" r="17" />
            <path d="M409 149c5-21 14-32 29-32s25 11 30 32M482 149c5-21 15-32 30-32s24 11 29 32" />
          </g>

          <g className="danza-market-offer__step danza-market-offer__step--redeem">
            <rect
              className="danza-market-offer__icon-plate"
              x="605"
              y="30"
              width="120"
              height="150"
              rx="28"
            />
            <path d="M633 68h64l-8 76h-48l-8-76Z" />
            <path d="m647 68 9-25m19 25 12-33m-42 72h46" />
            <path
              className="danza-market-offer__micro danza-market-offer__micro--sparkle"
              d="m618 53 5-12 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z"
            />
          </g>
        </svg>
      </div>

      <ol
        className="danza-market-offer__steps danza-bauhaus-border-enter"
        style={createBauhausEntranceStyle(5)}
      >
        {offerSteps.map((step, stepIndex) => (
          <li
            className={`danza-market-offer__text-step danza-market-offer__text-step--${step.identifier} danza-bauhaus-border-enter`}
            key={step.title}
            style={createBauhausEntranceStyle(5 + stepIndex)}
          >
            <div className="danza-bauhaus-enter" style={createBauhausEntranceStyle(5 + stepIndex)}>
              <span>{String(stepIndex + 1).padStart(2, "0")}</span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="danza-market-offer__actions">
        <a
          className="danza-market-offer__cta danza-bauhaus-enter"
          href={MARKET_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          style={createBauhausEntranceStyle(9)}
        >
          Download The Market <span aria-hidden="true">↗</span>
        </a>
        <Link
          className="danza-market-offer__ticket-link danza-bauhaus-enter"
          href={ticketHref}
          style={createBauhausEntranceStyle(10)}
        >
          Go to ticket <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import Image from "next/image";
import { siteConfiguration } from "@/lib/site";
import { coucouSmsProgram } from "@/lib/sms-program";

export default function SmsProgramPage() {
  return (
    <LegalPage
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
      title="SMS Program"
      lastUpdated={coucouSmsProgram.lastUpdated}
      intro={
        <>
          Public evidence of how guests voluntarily enroll in the Coucou recurring SMS program,
          operated by Soluo LLC.
        </>
      }
    >
      <LegalSection title="How guests opt in" rule={false}>
        <p>
          Guests enter a mobile number on a Coucou or Coucou-powered RSVP page and may select a
          separate, optional SMS checkbox. The checkbox is unchecked by default, and guests can
          submit an RSVP without selecting it. The event organizer is identified as context, while
          Coucou is identified as the sender and messaging-program operator.
        </p>
        <p>
          A live example is available at{" "}
          <a
            href={coucouSmsProgram.exampleOptInUrl}
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            {coucouSmsProgram.exampleOptInUrl}
          </a>
          .
        </p>

        <figure className="space-y-4 border p-5" aria-labelledby="sms-opt-in-evidence-caption">
          <figcaption
            id="sms-opt-in-evidence-caption"
            className="text-[13px] uppercase tracking-[0.06em]"
            style={{ color: "var(--tt-fg-mute)" }}
          >
            Coucou-powered Danza Organica RSVP opt-in evidence
          </figcaption>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">First name</span>
              <span className="block border px-3 py-2" aria-hidden="true">
                Guest
              </span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Mobile number</span>
              <span className="block border px-3 py-2" aria-hidden="true">
                (555) 555-0100
              </span>
            </label>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={false}
                readOnly
                aria-label={coucouSmsProgram.consentLabel}
                className="mt-0.5 shrink-0"
              />
              <span className="font-medium">
                I agree to receive recurring SMS messages from Coucou, a Soluo LLC service, about
                Danza Organica events.
              </span>
            </label>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--tt-fg-mute)" }}>
              Coucou may send account notifications, RSVP and guest-list updates, tickets or QR
              codes, event updates, and replies about Danza Organica events or reservations. Danza
              Organica supplies the event context; Coucou is the sender and operates this messaging
              program. Message frequency varies. Message and data rates may apply. Reply STOP to opt
              out or HELP for help. Consent is not a condition of purchase, RSVP, or admission.{" "}
              <a href="/terms" className="underline">
                Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>
          <div className="flex justify-end">
            <span className="border px-4 py-2 text-sm font-medium" aria-hidden="true">
              Submit RSVP
            </span>
          </div>
        </figure>
        <p>
          A directly hosted image of this disclosure is available at{" "}
          <a href="/sms-opt-in-evidence.svg" className="underline">
            https://coucou.events/sms-opt-in-evidence.svg
          </a>
          .
        </p>
        <a
          href="/sms-opt-in-evidence.svg"
          className="block border"
          aria-label="Open the full-size Coucou SMS opt-in evidence image"
        >
          <Image
            src="/sms-opt-in-evidence.svg"
            alt="Coucou-powered RSVP form showing the optional Coucou SMS consent checkbox unchecked"
            width={1600}
            height={900}
            className="h-auto w-full"
            priority
          />
        </a>
      </LegalSection>

      <LegalSection title="Messages guests may receive">
        <p>
          Coucou may send account notifications, RSVP and guest-list updates, tickets or QR codes,
          event schedule or venue updates, and replies to guest-initiated questions about events or
          reservations. This consent does not cover marketing or promotional offers.
        </p>
        <p>
          Event organizers supply event context. Coucou, a Soluo LLC service, remains the sender and
          operator of the messaging program. Twilio provides telecommunications delivery.
        </p>
      </LegalSection>

      <LegalSection title="Immediate confirmation">
        <div className="border p-4 font-mono text-sm leading-relaxed">
          {coucouSmsProgram.confirmationMessage}
        </div>
      </LegalSection>

      <LegalSection title="Stopping messages and getting help">
        <p>
          Reply <strong>STOP</strong> to opt out. Reply <strong>HELP</strong> for assistance. After
          opting out, reply <strong>START</strong> to resubscribe.
        </p>
        <p>
          For additional help, contact{" "}
          <a href={`mailto:${coucouSmsProgram.supportEmail}`} className="underline">
            {coucouSmsProgram.supportEmail}
          </a>
          . Message frequency varies. Message and data rates may apply.
        </p>
      </LegalSection>

      <LegalSection title="Program policies">
        <p>
          Review the Coucou{" "}
          <a href="/terms" className="underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          . Both pages are public and do not require an account or login.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

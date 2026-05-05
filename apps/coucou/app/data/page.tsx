import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";

export default function DataCollection() {
  const brandName = siteConfiguration.brandName;
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <LegalPage
      preset={siteConfiguration.preset}
      brandName={brandName}
      title="Data Collection"
      lastUpdated={lastUpdated}
      intro={
        <>
          Transparency about what data we collect, why we collect it, and how
          you can control your information.
        </>
      }
    >
      <LegalSection title="1. Overview" rule={false}>
        <p>
          We collect only the data necessary to provide our event management
          services effectively and securely. All data collection follows
          privacy-by-design principles and complies with GDPR, CCPA, and other
          applicable privacy regulations.
        </p>
        <p style={{ color: "var(--tt-fg)" }}>
          <strong>We never sell your personal data to third parties.</strong>
        </p>
      </LegalSection>

      <LegalSection title="2. Required Data for Core Services">
        <p className="text-[13px] uppercase tracking-[0.06em]" style={{ color: "var(--tt-fg-mute)" }}>
          Account creation
        </p>
        <p>Collected data:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Email address (required).</li>
          <li>Name (first and last).</li>
          <li>Phone number (optional but recommended).</li>
          <li>Password hash (never stored in plain text).</li>
        </ul>
        <p className="mt-4">Purpose:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>User authentication and account security.</li>
          <li>Event notifications and communications.</li>
          <li>Customer support and assistance.</li>
          <li>Legal compliance and verification.</li>
        </ul>

        <p className="mt-6 text-[13px] uppercase tracking-[0.06em]" style={{ color: "var(--tt-fg-mute)" }}>
          RSVP and event participation
        </p>
        <p>Collected data:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Event-specific custom field responses.</li>
          <li>Attendance confirmation and check-ins.</li>
          <li>Notes and special requests for hosts.</li>
          <li>Number of attendees in your party.</li>
          <li>SMS consent status, timestamp, IP address, and opt-in method.</li>
        </ul>
        <p className="mt-4">Purpose:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Process RSVP requests and approvals.</li>
          <li>Generate digital tickets and QR codes.</li>
          <li>Manage event capacity and logistics.</li>
          <li>Send event updates and reminders from the event host you RSVP&apos;d to.</li>
          <li>Provide personalized event experiences.</li>
          <li>Document express consent for compliance requirements.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. SMS and Communication Data">
        <p>How we handle phone numbers:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li><strong>Storage:</strong> Phone numbers are stored for account, RSVP, and SMS delivery features.</li>
          <li><strong>Display:</strong> Host-facing views use obfuscated phone numbers where full numbers are not required.</li>
          <li><strong>Access:</strong> Authorized systems use phone numbers for message delivery and event operations.</li>
          <li><strong>Deletion:</strong> Phone numbers are permanently deleted when consent is withdrawn, while minimal consent logs are retained for compliance.</li>
        </ul>
        <p className="mt-4">SMS consent tracking:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Explicit opt-in captured through an unchecked consent checkbox on RSVP forms.</li>
          <li>Timestamp when consent was given or withdrawn.</li>
          <li>IP address for legal compliance and fraud prevention.</li>
          <li>Method of consent (RSVP form, direct opt-in, etc.).</li>
          <li>Associated event host for each consent.</li>
          <li>Opt-out history and reasons for legal compliance.</li>
        </ul>
        <p style={{ color: "var(--tt-fg-dim)" }}>
          SMS messages are sent by Coucou on behalf of the event host you
          RSVP&apos;d to using {brandName} as a messaging platform service
          provider, and delivered through Twilio SMS infrastructure.
        </p>
      </LegalSection>

      <LegalSection title="4. Operational Diagnostics">
        <p>Service reliability data:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Request metadata needed to deliver web pages and secure access.</li>
          <li>Application errors and failure states surfaced during normal use.</li>
          <li>Browser type and device characteristics relevant to compatibility.</li>
          <li>Performance timing signals needed to diagnose reliability issues.</li>
          <li>Security-related activity reviewed to prevent abuse.</li>
        </ul>
        <p className="mt-4">Privacy protections:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>No third-party product analytics service is currently enabled.</li>
          <li>No advertising profiles or cross-site tracking cookies are used.</li>
          <li>Operational data is used only for reliability, security, and support.</li>
          <li>Retention is limited to what is needed for incident response and maintenance.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Data We Do Not Collect">
        <ul className="ml-5 list-disc space-y-2">
          <li><strong>Financial information:</strong> Credit card numbers, bank account details.</li>
          <li><strong>Biometric data:</strong> Fingerprints, facial recognition, voice prints.</li>
          <li><strong>Social media content:</strong> Posts or activity from other platforms.</li>
          <li><strong>Browsing history:</strong> Your activity on other websites.</li>
          <li><strong>Private communications:</strong> Content of messages or calls outside our platform.</li>
          <li><strong>Sensitive personal data:</strong> Political views, religious beliefs, health information (unless voluntarily provided for accessibility).</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Data Retention Periods">
        <ul className="ml-5 list-disc space-y-2">
          <li><strong>Account data:</strong> Retained while your account is active. Deleted within 30 days of account closure unless legal obligations require longer retention.</li>
          <li><strong>Event and RSVP data:</strong> Maintained for historical records and host analytics. Personal identifiers anonymized after 2 years unless consent is maintained.</li>
          <li><strong>SMS consent and phone data:</strong> Deleted immediately upon consent withdrawal. Opt-out records maintained indefinitely for compliance.</li>
          <li><strong>Operational diagnostics:</strong> Retained only as long as needed to investigate incidents, prevent abuse, and maintain reliability.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Your Data Control Options">
        <p>You can:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Access all personal data we have about you.</li>
          <li>Correct or update inaccurate information.</li>
          <li>Delete your account and associated data.</li>
          <li>Export your data in a portable format.</li>
          <li>Withdraw SMS consent at any time (text STOP).</li>
          <li>Clear browser cookies and local storage from your device.</li>
          <li>Limit data processing for specific purposes.</li>
          <li>File complaints with data protection authorities.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Data Sharing and Third Parties">
        <p>Service providers we share data with:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li><strong>Clerk:</strong> User authentication and account management.</li>
          <li><strong>Twilio:</strong> SMS message delivery on behalf of the hosting business.</li>
          <li><strong>Convex:</strong> Secure database hosting and real-time features.</li>
        </ul>
        <p className="mt-4">We never share data for:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Marketing by third parties.</li>
          <li>Data broker sales or purchases.</li>
          <li>Advertising networks or ad targeting.</li>
          <li>Social media integration beyond authentication.</li>
          <li>Any commercial purposes unrelated to our service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. International Data Transfers">
        <p>
          Your data may be processed in countries other than your residence.
          We ensure appropriate safeguards are in place, including standard
          contractual clauses and adequacy decisions where applicable.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>
          To exercise your data rights or ask questions about data collection,
          visit{" "}
          <a
            href={siteConfiguration.domain}
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            {siteConfiguration.domain.replace(/^https?:\/\//, "")}
          </a>{" "}
          or read our{" "}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";

export default function PrivacyPolicy() {
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
      title="Privacy Policy"
      lastUpdated={lastUpdated}
      intro={
        <>
          Your privacy is important to us. This policy explains how we collect, use, and protect
          your personal information.
        </>
      }
    >
      <LegalSection title="1. Information We Collect" rule={false}>
        <p
          className="text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Personal information
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Account Information:</strong> Name, email address, phone number.
          </li>
          <li>
            <strong>Profile Data:</strong> Custom fields for events, preferences, and metadata.
          </li>
          <li>
            <strong>Authentication Data:</strong> Managed securely through Clerk authentication
            service.
          </li>
          <li>
            <strong>Event Information:</strong> RSVP details, notes, attendance records.
          </li>
        </ul>
        <p
          className="mt-6 text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Usage and technical information
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Technical Request Data:</strong> Browser type, IP address, and device
            information transmitted during normal web requests.
          </li>
          <li>
            <strong>Operational Diagnostics:</strong> Error details and performance signals used to
            keep the platform reliable.
          </li>
          <li>
            <strong>Security Signals:</strong> Activity patterns reviewed to detect abuse and
            protect the platform.
          </li>
          <li>
            <strong>Feature Usage Within Core Workflows:</strong> RSVP activity, approvals,
            attendance records, and similar actions needed to operate the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How We Use Your Information">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Service Delivery:</strong> Process RSVPs, manage events, send notifications.
          </li>
          <li>
            <strong>Communication:</strong> Send event updates, confirmations, occasional marketing
            offers, and important notices via SMS/email from the specific event host you opted in
            to. Messages are sent by Coucou on behalf of the event host using {brandName} as a
            messaging platform service provider when you provide explicit consent.
          </li>
          <li>
            <strong>Platform Improvement:</strong> Analyze usage patterns to enhance user
            experience.
          </li>
          <li>
            <strong>Security:</strong> Detect fraud, prevent abuse, and maintain platform security.
          </li>
          <li>
            <strong>Legal Compliance:</strong> Meet regulatory requirements and respond to legal
            requests.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. SMS and Communication Privacy">
        <ul className="ml-5 list-disc space-y-2">
          <li>Phone numbers are stored for account, RSVP, and SMS delivery features.</li>
          <li>
            SMS messages are sent by Coucou on behalf of the event host using {brandName} as a
            messaging platform service provider, and are delivered through Twilio, a SOC 2 compliant
            SMS infrastructure provider.
          </li>
          <li>
            We use obfuscated phone numbers for display purposes where full numbers are not required
            (e.g., ***-***-1234).
          </li>
          <li>Message content is not stored beyond delivery confirmation.</li>
          <li>Opt-out requests are processed immediately and permanently honored.</li>
          <li>
            SMS consent is logged with the timestamp and originating IP address for compliance
            purposes.
          </li>
          <li>SMS consent can be withdrawn at any time by texting STOP.</li>
          <li>You can manage SMS preferences from your RSVP status page or profile at any time.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Data Storage and Security">
        <p
          className="text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Data storage
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Data stored in Convex (real-time database).</li>
          <li>Encrypted at rest and in transit.</li>
          <li>Regular automated backups.</li>
          <li>Geographically distributed storage.</li>
        </ul>
        <p
          className="mt-6 text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Security measures
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Multi-factor authentication support.</li>
          <li>Regular security audits and updates.</li>
          <li>Access controls and audit logs.</li>
          <li>Access controls for account and event data.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Third-Party Services">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Clerk (Authentication):</strong> Manages user accounts and authentication
            securely.
          </li>
          <li>
            <strong>Twilio (SMS Infrastructure):</strong> Provides SMS delivery infrastructure.
            Messages are sent by Coucou on behalf of the event host using {brandName} as the
            messaging platform, with Twilio handling the technical delivery.
          </li>
          <li>
            <strong>Convex (Database):</strong> Secure, real-time database for application data.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Your Rights (GDPR &amp; CCPA)">
        <p>Depending on your location, you may have the following rights:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Access:</strong> Request copies of your personal data.
          </li>
          <li>
            <strong>Rectification:</strong> Correct inaccurate or incomplete data.
          </li>
          <li>
            <strong>Erasure:</strong> Request deletion of your personal data.
          </li>
          <li>
            <strong>Portability:</strong> Receive your data in a structured, machine-readable
            format.
          </li>
          <li>
            <strong>Restriction:</strong> Limit how we process your data.
          </li>
          <li>
            <strong>Objection:</strong> Object to certain types of processing.
          </li>
          <li>
            <strong>Opt-out:</strong> Withdraw consent for SMS communications at any time.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Data Retention">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Account Data:</strong> Retained while your account is active.
          </li>
          <li>
            <strong>Event Data:</strong> Maintained for historical records and analytics.
          </li>
          <li>
            <strong>SMS Data:</strong> Phone numbers are deleted when consent is withdrawn, while
            minimal consent records (timestamp, IP address, and the event host associated with
            consent) are retained for legal compliance.
          </li>
          <li>
            <strong>Operational Diagnostics:</strong> Retained only as long as needed to investigate
            issues, prevent abuse, and maintain reliability.
          </li>
          <li>
            <strong>Legal Requirements:</strong> Some data may be retained longer for compliance
            purposes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Cookies and Tracking">
        <p>
          We use cookies and similar technologies to improve your experience. For detailed
          information about our cookie usage, please see our{" "}
          <a href="/cookies" className="underline">
            Cookies Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="9. International Data Transfers">
        <p>
          Your data may be transferred to and processed in countries other than your country of
          residence. We ensure appropriate safeguards are in place to protect your data in
          accordance with applicable privacy laws.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any material
          changes by posting the new policy on this page and updating the &ldquo;last updated&rdquo;
          date.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact">
        <p>
          For questions about this Privacy Policy or to exercise your rights, visit{" "}
          <a href={siteConfiguration.domain} className="underline" target="_blank" rel="noreferrer">
            {siteConfiguration.domain.replace(/^https?:\/\//, "")}
          </a>{" "}
          or text STOP to any message we send.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";
import { danzaOrganicaSmsProgram } from "@/lib/sms-program";

export default function PrivacyPolicy() {
  const brandName = siteConfiguration.brandName;
  const lastUpdated = danzaOrganicaSmsProgram.lastUpdated;

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
            <strong>Communication:</strong> Send account notifications, RSVP and guest-list updates,
            tickets or QR codes, event updates, and replies about Danza Organica events or
            reservations when you provide explicit consent. Danza Organica is the SMS sender, and
            Coucou provides its event-management and messaging technology.
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

      <LegalSection title="3. Mobile Messaging Privacy">
        <p>
          When you use Danza Organica&apos;s SMS features, we may collect your mobile number, SMS
          consent status, consent timestamp, IP address, associated account and RSVP information,
          message content, delivery information, and opt-out or help requests. We use this
          information to operate the Danza Organica messaging program, deliver requested event
          communications, respond to questions, maintain security, document consent, and comply with
          legal obligations.
        </p>
        <p>
          Mobile information, text-messaging originator opt-in data, and consent will not be shared
          with third parties or affiliates for marketing or promotional purposes. Danza Organica
          does not sell, rent, purchase, or use this information for third-party marketing or lead
          generation.
        </p>
        <p>
          Coucou and Twilio process mobile information only as service providers necessary to
          operate and deliver the Danza Organica messaging program. They may not use Danza Organica
          SMS consent data for their own marketing purposes.
        </p>
        <p>
          If you opt in, message frequency varies and message and data rates may apply. You may
          withdraw consent by replying STOP. Reply HELP for assistance. You can also manage SMS
          preferences from your RSVP status page or profile.
        </p>
        <p>
          Danza Organica retains consent, opt-out, delivery, and messaging records for as long as
          reasonably necessary to operate the service, honor messaging preferences, resolve
          disputes, maintain security, and satisfy legal obligations.
        </p>
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
            <strong>Twilio (SMS Infrastructure):</strong> Provides SMS delivery infrastructure. Club
            Danza Organica is the sender, Coucou provides the messaging technology, and Twilio
            handles telecommunications delivery as a service provider.
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
            <strong>SMS Data:</strong> Consent, opt-out, delivery, and messaging records are
            retained for as long as reasonably necessary to operate the service, honor preferences,
            resolve disputes, maintain security, and satisfy legal obligations.
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
          For questions about this Privacy Policy or to exercise your rights, email{" "}
          <a href={`mailto:${danzaOrganicaSmsProgram.supportEmail}`} className="underline">
            {danzaOrganicaSmsProgram.supportEmail}
          </a>{" "}
          or visit{" "}
          <a href={siteConfiguration.domain} className="underline" target="_blank" rel="noreferrer">
            {siteConfiguration.domain.replace(/^https?:\/\//, "")}
          </a>{" "}
          or text STOP to any message we send.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

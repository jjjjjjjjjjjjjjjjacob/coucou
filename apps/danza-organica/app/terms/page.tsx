import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";
import { danzaOrganicaSmsProgram } from "@/lib/sms-program";

export default function TermsOfService() {
  const brandName = siteConfiguration.brandName;
  const lastUpdated = danzaOrganicaSmsProgram.lastUpdated;

  return (
    <LegalPage
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
      title="Terms of Service"
      lastUpdated={lastUpdated}
      intro={
        <>
          These terms govern your use of {siteConfiguration.brandName}, an event management platform
          for exclusive gatherings and experiences.
        </>
      }
    >
      <LegalSection title="1. Acceptance of Terms" rule={false}>
        <p>
          By creating an account, accessing, or using {brandName}
          (&ldquo;Service&rdquo;), you agree to be bound by these Terms of Service
          (&ldquo;Terms&rdquo;). If you disagree with any part of these terms, you may not access
          the Service.
        </p>
        <p>
          SMS notifications are optional. When you affirmatively select the separate SMS consent
          checkbox, you consent to receive recurring messages from Danza Organica. Coucou provides
          Danza Organica&apos;s event-management and messaging technology. You may withhold or
          withdraw SMS consent at any time without affecting your ability to RSVP, purchase, or
          attend.
        </p>
      </LegalSection>

      <LegalSection title="2. Roles and Responsibilities">
        <p>
          Danza Organica is the operator and sender of the Danza Organica SMS program. Authorized
          event organizers may use Danza Organica&apos;s tools to communicate about Danza Organica
          events, but those organizers do not become separate SMS senders under this program.
        </p>
        <p>
          Coucou supplies software, event-management workflows, consent-recording tools, and
          operational messaging services to Danza Organica. Twilio supplies telecommunications
          delivery infrastructure. Coucou and Twilio are service providers and are not separate
          messaging programs that you join.
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Danza Organica obligations:</strong> Determine the program&apos;s operational
            message content, publish clear opt-in disclosures, and honor messaging preferences.
          </li>
          <li>
            <strong>Coucou obligations:</strong> Provide the software used to capture consent,
            transmit messages, and process messaging preferences on Danza Organica&apos;s behalf.
          </li>
          <li>
            <strong>Twilio obligations:</strong> Provide telecommunications infrastructure for SMS
            delivery, subject to carrier availability.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Description of Service">
        <p>
          {brandName} is an event management platform that allows hosts to create exclusive events
          and manage guest lists, while providing guests with secure access through
          password-protected RSVPs and digital tickets.
        </p>
      </LegalSection>

      <LegalSection title="4. User Accounts and Registration">
        <ul className="ml-5 list-disc space-y-2">
          <li>You must provide accurate, current, and complete information during registration.</li>
          <li>You are responsible for safeguarding your account credentials.</li>
          <li>You must notify us immediately of any unauthorized use of your account.</li>
          <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Danza Organica SMS Program">
        <p>
          Danza Organica offers an optional recurring text messaging program for account
          notifications, RSVP and guest-list status, tickets or QR codes, event updates, schedule or
          venue changes, and replies to questions about Danza Organica events or reservations.
        </p>
        <p>
          By affirmatively selecting the separate SMS consent checkbox, you agree to receive these
          messages from Danza Organica. Coucou provides Danza Organica&apos;s event-management and
          messaging technology, and Twilio provides message-delivery infrastructure. Coucou and
          Twilio are service providers and are not separate messaging programs you are joining.
        </p>
        <p>
          Message frequency varies based on your account, RSVPs, event activity, and conversations
          with Danza Organica. Message and data rates may apply. Consent is not a condition of
          purchase, RSVP, admission, or use of the Danza Organica service. Promotional and marketing
          messages are not covered by this consent.
        </p>
        <p>
          <strong>Reply STOP to opt out at any time. Reply HELP for assistance.</strong> After
          opting out, you may reply START to resubscribe. For additional support, contact{" "}
          <a href={`mailto:${danzaOrganicaSmsProgram.supportEmail}`} className="underline">
            {danzaOrganicaSmsProgram.supportEmail}
          </a>
          .
        </p>
        <p>
          Wireless carriers are not liable for delayed or undelivered messages. SMS delivery may not
          be available through every carrier or in every location.
        </p>
        <p>
          Danza Organica handles mobile information according to its{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Event Access and Passwords">
        <ul className="ml-5 list-disc space-y-2">
          <li>Event access is controlled through password-protected guest lists.</li>
          <li>Do not share event passwords with unauthorized individuals.</li>
          <li>Event hosts reserve the right to approve or deny RSVP requests.</li>
          <li>Digital tickets are non-transferable unless explicitly permitted by the host.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Privacy and Data Protection">
        <p>
          Your privacy is important to us. Please review our{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{" "}
          to understand how we collect, use, and protect your personal information. We comply with
          applicable data protection laws including GDPR and CCPA.
        </p>
      </LegalSection>

      <LegalSection title="8. User Conduct">
        <p>You agree not to:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Use the Service for any unlawful purpose or in violation of any laws.</li>
          <li>Impersonate another person or entity.</li>
          <li>Interfere with or disrupt the Service or servers connected to the Service.</li>
          <li>Attempt to gain unauthorized access to any portion of the Service.</li>
          <li>Harass, abuse, or harm other users.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Intellectual Property">
        <p>
          The Service and its original content, features, and functionality are owned by {brandName}{" "}
          and are protected by international copyright, trademark, patent, trade secret, and other
          intellectual property laws.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitation of Liability">
        <p>
          In no event shall {brandName}, its directors, employees, partners, agents, suppliers, or
          affiliates be liable for any indirect, incidental, special, consequential, or punitive
          damages, including without limitation, loss of profits, data, use, goodwill, or other
          intangible losses.
        </p>
      </LegalSection>

      <LegalSection title="11. Termination">
        <p>
          We may terminate or suspend your account and access to the Service immediately, without
          prior notice, for conduct that we believe violates these Terms or is harmful to other
          users, us, or third parties.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to Terms">
        <p>
          We reserve the right to modify or replace these Terms at any time. If a revision is
          material, we will provide at least 30 days notice prior to any new terms taking effect.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          If you have questions about these Terms, email{" "}
          <a href={`mailto:${danzaOrganicaSmsProgram.supportEmail}`} className="underline">
            {danzaOrganicaSmsProgram.supportEmail}
          </a>{" "}
          or visit{" "}
          <a href={siteConfiguration.domain} className="underline" target="_blank" rel="noreferrer">
            {siteConfiguration.domain.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

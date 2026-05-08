import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";

export default function TermsOfService() {
  const brandName = siteConfiguration.brandName;
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
          SMS notifications are optional. When you affirmatively select the SMS opt-in for a
          specific event, you consent to receive messages from that event&apos;s host (for example,
          Party Nights Presents). Messages are sent by Coucou on behalf of the event host using{" "}
          {brandName} as a messaging platform service provider. You may withhold or withdraw that
          consent at any time.
        </p>
      </LegalSection>

      <LegalSection title="2. Roles and Responsibilities">
        <p>
          Coucou operates {brandName} as an Independent Software Vendor (&ldquo;ISV&rdquo;) that
          supplies communication tooling, event management workflows, and SMS delivery
          infrastructure. Coucou does not author or control the messaging content that event
          attendees receive.
        </p>
        <p>
          The &ldquo;End Business&rdquo; for each event is the specific host or organizer identified
          on the RSVP form and event materials. This host brand creates the message content, manages
          opt-ins, and is the organization you are consenting to hear from when you enable SMS
          updates.
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>End Business obligations:</strong> Provide accurate branding, publish clear
            opt-in disclosures, and honor unsubscribe requests immediately.
          </li>
          <li>
            <strong>Coucou (ISV) obligations:</strong> Capture SMS consent records, transmit opt-out
            commands to the End Business, and deliver messages securely via Twilio while enforcing
            compliance safeguards.
          </li>
          <li>
            Every consent checkbox, dialog, and confirmation screen prominently displays the End
            Business name so you always know which organization will send SMS messages.
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

      <LegalSection title="5. SMS and Text Messaging Services">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            SMS consent is captured through an unchecked opt-in checkbox on every RSVP submission,
            and the End Business brand name appears directly alongside the checkbox.
          </li>
          <li>
            By opting in, you agree to receive RSVP status updates, event reminders, account
            notifications, and occasional marketing messages from the event host named on the RSVP
            form (for example, Party Nights Presents). That event host controls message content and
            frequency.
          </li>
          <li>Message frequency varies based on event activity and marketing campaigns.</li>
          <li>Message and data rates may apply from your wireless carrier.</li>
          <li>
            SMS messages are transmitted by Coucou on behalf of the event host using {brandName} as
            a messaging platform service provider.
          </li>
          <li>Reply STOP to cancel SMS messages or HELP for assistance at any time.</li>
          <li>Consent is not a condition of purchase or admission to any event.</li>
          <li>
            We use Twilio as our SMS infrastructure provider to deliver messages securely on behalf
            of the End Business, facilitated through the {brandName} platform.
          </li>
          <li>
            We do not sell or rent your phone number and only share it with the hosting business as
            required to deliver SMS services.
          </li>
          <li>
            You can manage your SMS preferences from your RSVP status page or profile at any time.
          </li>
        </ul>
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
          If you have questions about these Terms, contact us through our platform or visit{" "}
          <a href={siteConfiguration.domain} className="underline" target="_blank" rel="noreferrer">
            {siteConfiguration.domain.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

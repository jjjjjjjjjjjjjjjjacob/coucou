import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";

export default function TermsOfService() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <DojoPomodoreIcon size={64} className="mr-4" />
            <h1 className="text-4xl font-bold text-primary">Terms of Service</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            These terms govern your use of Dojo Pomodoro, our event management platform for
            exclusive gatherings and experiences.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated:{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none dark:prose-invert">
          <div className="bg-card rounded-lg p-8 border shadow-sm space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">1. Acceptance of Terms</h2>
              <p>
                By creating an account, accessing, or using Dojo Pomodoro (&ldquo;Service&rdquo;),
                you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you
                disagree with any part of these terms, you may not access the Service.
              </p>
              <p className="mt-3 font-semibold text-primary">
                SMS notifications are optional. When you affirmatively select the SMS opt-in for a
                specific event, you consent to receive messages from that event&apos;s host (for
                example, Party Nights Presents). Messages are sent by Coucou on behalf of the event
                host using Dojo Pomodoro as a messaging platform service provider. You may withhold
                or withdraw that consent at any time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                2. Roles and Responsibilities
              </h2>
              <div className="space-y-3">
                <p>
                  Coucou operates Dojo Pomodoro as an Independent Software Vendor
                  (&ldquo;ISV&rdquo;) that supplies communication tooling, event management
                  workflows, and SMS delivery infrastructure. Coucou does not author or control the
                  messaging content that event attendees receive.
                </p>
                <p>
                  The &ldquo;End Business&rdquo; for each event is the specific host or organizer
                  identified on the RSVP form and event materials. This host brand creates the
                  message content, manages opt-ins, and is the organization you are consenting to
                  hear from when you enable SMS updates.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <span className="font-semibold text-primary">End Business obligations:</span>{" "}
                    Provide accurate branding, publish clear opt-in disclosures, and honor
                    unsubscribe requests immediately.
                  </li>
                  <li>
                    <span className="font-semibold text-primary">Coucou (ISV) obligations:</span>{" "}
                    Capture SMS consent records, transmit opt-out commands to the End Business, and
                    deliver messages securely via Twilio while enforcing compliance safeguards.
                  </li>
                  <li>
                    Every consent checkbox, dialog, and confirmation screen prominently displays the
                    End Business name so you always know which organization will send SMS messages.
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                3. Description of Service
              </h2>
              <p>
                Dojo Pomodoro is an event management platform that allows hosts to create exclusive
                events and manage guest lists, while providing guests with secure access through
                password-protected RSVPs and digital tickets.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                4. User Accounts and Registration
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  You must provide accurate, current, and complete information during registration
                </li>
                <li>You are responsible for safeguarding your account credentials</li>
                <li>You must notify us immediately of any unauthorized use of your account</li>
                <li>
                  We reserve the right to suspend or terminate accounts that violate these terms
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                5. SMS and Text Messaging Services
              </h2>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                <h3 className="text-xl font-semibold text-primary mb-3">SMS Service and Terms</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    SMS consent is captured through an unchecked opt-in checkbox on every RSVP
                    submission, and the End Business brand name appears directly alongside the
                    checkbox.
                  </li>
                  <li>
                    By opting in, you agree to receive RSVP status updates, event reminders, account
                    notifications, and occasional marketing messages from the event host named on
                    the RSVP form (for example, Party Nights Presents). That event host controls
                    message content and frequency.
                  </li>
                  <li>Message frequency varies based on event activity and marketing campaigns</li>
                  <li>Message and data rates may apply from your wireless carrier</li>
                  <li>
                    SMS messages are transmitted by Coucou on behalf of the event host (for example,
                    Party Nights Presents or Max, Orson, Danya) using Dojo Pomodoro as a messaging
                    platform service provider
                  </li>
                  <li>Reply STOP to cancel SMS messages or HELP for assistance at any time</li>
                  <li>Consent is not a condition of purchase or admission to any event</li>
                  <li>
                    We use Twilio as our SMS infrastructure provider to deliver messages securely on
                    behalf of the End Business, facilitated through the Dojo Pomodoro platform
                  </li>
                  <li>
                    We do not sell or rent your phone number and only share it with the hosting
                    business as required to deliver SMS services
                  </li>
                  <li>
                    You can manage your SMS preferences from your RSVP status page or profile at any
                    time
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                6. Event Access and Passwords
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Event access is controlled through password-protected guest lists</li>
                <li>Do not share event passwords with unauthorized individuals</li>
                <li>Event hosts reserve the right to approve or deny RSVP requests</li>
                <li>
                  Digital tickets are non-transferable unless explicitly permitted by the host
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                7. Privacy and Data Protection
              </h2>
              <p>
                Your privacy is important to us. Please review our{" "}
                <a href="/privacy" className="text-primary hover:underline font-semibold">
                  Privacy Policy
                </a>{" "}
                to understand how we collect, use, and protect your personal information. We comply
                with applicable data protection laws including GDPR and CCPA.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">8. User Conduct</h2>
              <p>You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for any unlawful purpose or in violation of any laws</li>
                <li>Impersonate another person or entity</li>
                <li>Interfere with or disrupt the Service or servers connected to the Service</li>
                <li>Attempt to gain unauthorized access to any portion of the Service</li>
                <li>Harass, abuse, or harm other users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">9. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by Dojo
                Pomodoro and are protected by international copyright, trademark, patent, trade
                secret, and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                10. Limitation of Liability
              </h2>
              <p>
                In no event shall Dojo Pomodoro, its directors, employees, partners, agents,
                suppliers, or affiliates be liable for any indirect, incidental, special,
                consequential, or punitive damages, including without limitation, loss of profits,
                data, use, goodwill, or other intangible losses.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">11. Termination</h2>
              <p>
                We may terminate or suspend your account and access to the Service immediately,
                without prior notice, for conduct that we believe violates these Terms or is harmful
                to other users, us, or third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">12. Changes to Terms</h2>
              <p>
                We reserve the right to modify or replace these Terms at any time. If a revision is
                material, we will provide at least 30 days notice prior to any new terms taking
                effect.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">13. Contact Information</h2>
              <p>
                If you have any questions about these Terms, please contact us through our platform
                or visit our website at{" "}
                <a
                  href="https://dojopomodoro.club"
                  className="text-primary hover:underline font-semibold"
                >
                  dojopomodoro.club
                </a>
                .
              </p>
            </section>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-12 text-center space-x-6">
          <a href="/privacy" className="text-primary hover:underline font-medium">
            Privacy Policy
          </a>
          <a href="/cookies" className="text-primary hover:underline font-medium">
            Cookies Policy
          </a>
          <a href="/data" className="text-primary hover:underline font-medium">
            Data Collection
          </a>
        </div>
      </div>
    </main>
  );
}

import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";

export default function DataCollection() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <DojoPomodoreIcon size={64} className="mr-4" />
            <h1 className="text-4xl font-bold text-primary">Data Collection</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transparency about what data we collect, why we collect it, and how you can control your
            information.
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
              <h2 className="text-2xl font-semibold text-primary mb-4">
                1. Data Collection Overview
              </h2>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="mb-4">
                  We collect only the data necessary to provide our event management services
                  effectively and securely. All data collection follows privacy-by-design principles
                  and complies with GDPR, CCPA, and other applicable privacy regulations.
                </p>
                <p className="font-semibold text-primary">
                  We never sell your personal data to third parties.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                2. Required Data for Core Services
              </h2>

              <div className="space-y-6">
                <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Account Creation</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Collected Data:</h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm">
                        <li>Email address (required)</li>
                        <li>Name (first and last)</li>
                        <li>Phone number (optional but recommended)</li>
                        <li>Password hash (never stored in plain text)</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Purpose:</h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm">
                        <li>User authentication and account security</li>
                        <li>Event notifications and communications</li>
                        <li>Customer support and assistance</li>
                        <li>Legal compliance and verification</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">
                    RSVP and Event Participation
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Collected Data:</h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm">
                        <li>Event-specific custom field responses</li>
                        <li>Attendance confirmation and check-ins</li>
                        <li>Notes and special requests for hosts</li>
                        <li>Number of attendees in your party</li>
                        <li>SMS consent status and timestamp</li>
                        <li>SMS consent IP address and opt-in method</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Purpose:</h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm">
                        <li>Process RSVP requests and approvals</li>
                        <li>Generate digital tickets and QR codes</li>
                        <li>Manage event capacity and logistics</li>
                        <li>
                          Send event updates and reminders from the event host you RSVP&apos;d to
                        </li>
                        <li>Provide personalized event experiences</li>
                        <li>Document express consent for compliance requirements</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                3. SMS and Communication Data
              </h2>
              <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                <h3 className="text-xl font-semibold text-primary mb-3">
                  Text Message Communications
                </h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">How We Handle Phone Numbers:</h4>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>
                        <strong>Storage:</strong> Phone numbers are stored for account, RSVP, and
                        SMS delivery features
                      </li>
                      <li>
                        <strong>Display:</strong> Host-facing views use obfuscated phone numbers
                        where full numbers are not required
                      </li>
                      <li>
                        <strong>Access:</strong> Authorized systems use phone numbers for message
                        delivery and event operations
                      </li>
                      <li>
                        <strong>Deletion:</strong> Phone numbers are permanently deleted when
                        consent is withdrawn, while minimal consent logs (timestamp and IP address)
                        are retained for compliance
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">SMS Consent Tracking:</h4>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>
                        Explicit opt-in captured through an unchecked consent checkbox on RSVP forms
                      </li>
                      <li>Timestamp when consent was given or withdrawn</li>
                      <li>IP address for legal compliance and fraud prevention</li>
                      <li>Method of consent (RSVP form, direct opt-in, etc.)</li>
                      <li>Associated event host (e.g., Neon District Events) for each consent</li>
                      <li>Opt-out history and reasons for legal compliance</li>
                    </ul>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    SMS messages are sent by Coucou on behalf of the event host you RSVP&apos;d to
                    (for example, Party Nights Presents or Max, Orson, Danya) using Dojo Pomodoro as
                    a messaging platform service provider, and are delivered through Twilio SMS
                    infrastructure.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                4. Operational Diagnostics
              </h2>

              <div className="space-y-6">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">
                    Service Reliability Data
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Collected Data:</h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm">
                        <li>Request metadata needed to deliver web pages and secure access</li>
                        <li>Application errors and failure states surfaced during normal use</li>
                        <li>Browser type and device characteristics relevant to compatibility</li>
                        <li>Performance timing signals needed to diagnose reliability issues</li>
                        <li>Security-related activity reviewed to prevent abuse</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Privacy Protections:</h4>
                      <ul className="list-disc pl-6 space-y-1 text-sm">
                        <li>No third-party product analytics service is currently enabled</li>
                        <li>No advertising profiles or cross-site tracking cookies are used</li>
                        <li>
                          Operational data is used only for reliability, security, and support
                        </li>
                        <li>
                          Retention is limited to what is needed for incident response and
                          maintenance
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                5. Technical and Security Data
              </h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Security Monitoring</h3>
                  <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Login attempts and authentication events</li>
                    <li>Suspicious activity detection</li>
                    <li>API usage patterns and rate limiting</li>
                    <li>Security incident logs</li>
                  </ul>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900/20 p-6 rounded-lg border border-gray-200 dark:border-gray-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">System Performance</h3>
                  <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Load times and response rates</li>
                    <li>Error rates and crash reports</li>
                    <li>Database query performance</li>
                    <li>Infrastructure usage and scaling data</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                6. Data We Do NOT Collect
              </h2>
              <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                <h3 className="text-xl font-semibold text-primary mb-3">
                  We Explicitly Do Not Collect:
                </h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Financial Information:</strong> Credit card numbers, bank account
                    details
                  </li>
                  <li>
                    <strong>Biometric Data:</strong> Fingerprints, facial recognition, voice prints
                  </li>
                  <li>
                    <strong>Social Media Content:</strong> Posts, messages, or activity from other
                    platforms
                  </li>
                  <li>
                    <strong>Browsing History:</strong> Your activity on other websites
                  </li>
                  <li>
                    <strong>Private Communications:</strong> Content of your messages or calls
                    outside our platform
                  </li>
                  <li>
                    <strong>Sensitive Personal Data:</strong> Political views, religious beliefs,
                    health information (unless voluntarily provided for event accessibility)
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                7. Data Retention Periods
              </h2>

              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Account Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Retained while your account is active. Deleted within 30 days of account closure
                    unless legal obligations require longer retention.
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Event and RSVP Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Maintained for historical records and host analytics. Personal identifiers are
                    anonymized after 2 years unless consent is maintained.
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">SMS Consent and Phone Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Deleted immediately upon consent withdrawal. Opt-out records maintained
                    indefinitely for compliance purposes.
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Operational Diagnostics</h4>
                  <p className="text-sm text-muted-foreground">
                    Retained only as long as needed to investigate incidents, prevent abuse, and
                    maintain service reliability.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                8. Your Data Control Options
              </h2>

              <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="text-xl font-semibold text-primary mb-3">You Can:</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Access all personal data we have about you</li>
                    <li>Correct or update inaccurate information</li>
                    <li>Delete your account and associated data</li>
                    <li>Export your data in a portable format</li>
                  </ul>
                  <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Withdraw SMS consent at any time (text STOP)</li>
                    <li>Clear browser cookies and local storage from your device</li>
                    <li>Limit data processing for specific purposes</li>
                    <li>File complaints with data protection authorities</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                9. Data Sharing and Third Parties
              </h2>

              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Service Providers</h3>
                  <p className="mb-3">
                    We only share data with trusted service providers who help us deliver our
                    services:
                  </p>
                  <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>
                      <strong>Clerk:</strong> User authentication and account management
                    </li>
                    <li>
                      <strong>Twilio:</strong> SMS message delivery on behalf of the hosting
                      business
                    </li>
                    <li>
                      <strong>Convex:</strong> Secure database hosting and real-time features
                    </li>
                  </ul>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">
                    We Never Share Data For:
                  </h3>
                  <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Marketing by third parties</li>
                    <li>Data broker sales or purchases</li>
                    <li>Advertising networks or ad targeting</li>
                    <li>Social media integration beyond authentication</li>
                    <li>Any commercial purposes unrelated to our service</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                10. International Data Transfers
              </h2>
              <p>
                Your data may be processed in countries other than your residence. We ensure
                appropriate safeguards are in place, including standard contractual clauses and
                adequacy decisions where applicable.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">
                11. Contact Us About Your Data
              </h2>
              <div className="bg-gray-50 dark:bg-gray-900/20 p-6 rounded-lg border">
                <p className="mb-4">
                  To exercise your data rights or ask questions about data collection:
                </p>
                <ul className="space-y-2">
                  <li>
                    <strong>Data Requests:</strong> Contact us through our platform for access,
                    correction, or deletion requests
                  </li>
                  <li>
                    <strong>SMS Opt-out:</strong> Text STOP to any message we send
                  </li>
                  <li>
                    <strong>General Questions:</strong> Visit{" "}
                    <a href="https://dojopomodoro.club" className="text-primary hover:underline">
                      dojopomodoro.club
                    </a>
                  </li>
                  <li>
                    <strong>Privacy Policy:</strong>{" "}
                    <a href="/privacy" className="text-primary hover:underline">
                      Full Privacy Policy
                    </a>
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>

        {/* Footer Links */}
        <div className="mt-12 text-center space-x-6">
          <a href="/terms" className="text-primary hover:underline font-medium">
            Terms of Service
          </a>
          <a href="/privacy" className="text-primary hover:underline font-medium">
            Privacy Policy
          </a>
          <a href="/cookies" className="text-primary hover:underline font-medium">
            Cookies Policy
          </a>
        </div>
      </div>
    </main>
  );
}

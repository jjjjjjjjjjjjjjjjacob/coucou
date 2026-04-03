import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <DojoPomodoreIcon size={64} className="mr-4" />
            <h1 className="text-4xl font-bold text-primary">Privacy Policy</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Your privacy is important to us. This policy explains how we collect, use, and protect your personal information.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none dark:prose-invert">
          <div className="bg-card rounded-lg p-8 border shadow-sm space-y-8">

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">1. Information We Collect</h2>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800 mb-4">
                <h3 className="text-xl font-semibold text-primary mb-3">Personal Information</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Account Information:</strong> Name, email address, phone number (encrypted)</li>
                  <li><strong>Profile Data:</strong> Custom fields for events, preferences, and metadata</li>
                  <li><strong>Authentication Data:</strong> Managed securely through Clerk authentication service</li>
                  <li><strong>Event Information:</strong> RSVP details, notes, attendance records</li>
                </ul>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="text-xl font-semibold text-primary mb-3">Usage and Technical Information</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Technical Request Data:</strong> Browser type, IP address, and device information transmitted during normal web requests</li>
                  <li><strong>Operational Diagnostics:</strong> Error details and performance signals used to keep the platform reliable</li>
                  <li><strong>Security Signals:</strong> Activity patterns reviewed to detect abuse and protect the platform</li>
                  <li><strong>Feature Usage Within Core Workflows:</strong> RSVP activity, approvals, attendance records, and similar actions needed to operate the service</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">2. How We Use Your Information</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Service Delivery:</strong> Process RSVPs, manage events, send notifications</li>
                <li><strong>Communication:</strong> Send event updates, confirmations, occasional marketing offers, and important notices via SMS/email from the specific event host you opted in to (e.g., Party Nights Presents). Messages are sent by Jeans on behalf of the event host using Dojo Pomodoro as a messaging platform service provider when you provide explicit consent</li>
                <li><strong>Platform Improvement:</strong> Analyze usage patterns to enhance user experience</li>
                <li><strong>Security:</strong> Detect fraud, prevent abuse, and maintain platform security</li>
                <li><strong>Legal Compliance:</strong> Meet regulatory requirements and respond to legal requests</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">3. SMS and Communication Privacy</h2>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                <h3 className="text-xl font-semibold text-primary mb-3">Text Message Privacy</h3>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Phone numbers are encrypted using industry-standard AES-256 encryption</li>
                  <li>SMS messages are sent by Jeans on behalf of the event host (for example, Party Nights Presents or Max, Orson, Danya) using Dojo Pomodoro as a messaging platform service provider, and are delivered through Twilio, a SOC 2 compliant SMS infrastructure provider</li>
                  <li>We store only obfuscated phone numbers for display purposes (e.g., ***-***-1234)</li>
                  <li>Message content is not stored beyond delivery confirmation</li>
                  <li>Opt-out requests are processed immediately and permanently honored</li>
                  <li>SMS consent is logged with the timestamp and originating IP address for compliance purposes</li>
                  <li>SMS consent can be withdrawn at any time by texting STOP</li>
                  <li>You can manage SMS preferences from your RSVP status page or profile at any time</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">4. Data Storage and Security</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Data Storage</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Data stored in Convex (real-time database)</li>
                    <li>Encrypted at rest and in transit</li>
                    <li>Regular automated backups</li>
                    <li>Geographically distributed storage</li>
                  </ul>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Security Measures</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Multi-factor authentication support</li>
                    <li>Regular security audits and updates</li>
                    <li>Access controls and audit logs</li>
                    <li>Industry-standard encryption protocols</li>
                  </ul>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">5. Third-Party Services</h2>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary">Clerk (Authentication)</h4>
                  <p className="text-sm text-muted-foreground">Manages user accounts and authentication securely</p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary">Twilio (SMS Infrastructure)</h4>
                  <p className="text-sm text-muted-foreground">Provides SMS delivery infrastructure. Messages are sent by Jeans on behalf of the event host using Dojo Pomodoro as the messaging platform, with Twilio handling the technical delivery</p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary">Convex (Database)</h4>
                  <p className="text-sm text-muted-foreground">Secure, real-time database for application data</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">6. Your Rights (GDPR & CCPA)</h2>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="mb-4">Depending on your location, you may have the following rights:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access:</strong> Request copies of your personal data</li>
                  <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
                  <li><strong>Erasure:</strong> Request deletion of your personal data</li>
                  <li><strong>Portability:</strong> Receive your data in a structured, machine-readable format</li>
                  <li><strong>Restriction:</strong> Limit how we process your data</li>
                  <li><strong>Objection:</strong> Object to certain types of processing</li>
                  <li><strong>Opt-out:</strong> Withdraw consent for SMS communications at any time</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">7. Data Retention</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Data:</strong> Retained while your account is active</li>
                <li><strong>Event Data:</strong> Maintained for historical records and analytics</li>
                <li><strong>SMS Data:</strong> Phone numbers are deleted when consent is withdrawn, while minimal consent records (timestamp, IP address, and the event host associated with consent) are retained for legal compliance</li>
                <li><strong>Operational Diagnostics:</strong> Retained only as long as needed to investigate issues, prevent abuse, and maintain reliability</li>
                <li><strong>Legal Requirements:</strong> Some data may be retained longer for compliance purposes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">8. Cookies and Tracking</h2>
              <p>
                We use cookies and similar technologies to improve your experience. For detailed information about our cookie
                usage, please see our <a href="/cookies" className="text-primary hover:underline font-semibold">Cookies Policy</a>.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">9. International Data Transfers</h2>
              <p>
                Your data may be transferred to and processed in countries other than your country of residence. We ensure
                appropriate safeguards are in place to protect your data in accordance with applicable privacy laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any material changes by posting
                the new policy on this page and updating the &ldquo;last updated&rdquo; date.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">11. Contact Us</h2>
              <div className="bg-gray-50 dark:bg-gray-900/20 p-6 rounded-lg border">
                <p className="mb-4">For questions about this Privacy Policy or to exercise your rights, contact us:</p>
                <ul className="space-y-2">
                  <li><strong>Website:</strong> <a href="https://dojopomodoro.club" className="text-primary hover:underline">dojopomodoro.club</a></li>
                  <li><strong>Data Protection:</strong> Contact us through the platform for privacy-related requests</li>
                  <li><strong>SMS Opt-out:</strong> Text STOP to any message we send</li>
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

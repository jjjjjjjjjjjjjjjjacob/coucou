import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";

export default function CookiesPolicy() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <DojoPomodoreIcon size={64} className="mr-4" />
            <h1 className="text-4xl font-bold text-primary">Cookies Policy</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Learn about how we use cookies and similar tracking technologies to improve your experience on Dojo Pomodoro.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray max-w-none dark:prose-invert">
          <div className="bg-card rounded-lg p-8 border shadow-sm space-y-8">

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">1. What Are Cookies?</h2>
              <p>
                Cookies are small text files that are stored on your device when you visit our website. They help us provide you
                with a better experience by remembering your preferences, analyzing how you use our platform, and improving our
                services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">2. Types of Cookies We Use</h2>

              <div className="space-y-6">
                <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg border border-green-200 dark:border-green-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Essential Cookies</h3>
                  <p className="mb-3">These cookies are necessary for the platform to function properly:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Authentication:</strong> Managed by Clerk to keep you logged in securely</li>
                    <li><strong>Session Management:</strong> Maintain your session state across pages</li>
                    <li><strong>Security:</strong> Protect against cross-site request forgery (CSRF) attacks</li>
                    <li><strong>Load Balancing:</strong> Ensure optimal server performance</li>
                  </ul>
                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Retention:</strong> Session cookies are deleted when you close your browser. Persistent authentication cookies last for up to 30 days.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">No Analytics or Advertising Cookies</h3>
                  <p className="mb-3">We do not currently use third-party analytics or advertising cookies on Dojo Pomodoro.</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>No Product Analytics Cookies:</strong> We are not using a browser analytics platform to track page views or click behavior</li>
                    <li><strong>No Advertising Cookies:</strong> We do not use cookies for ad targeting or remarketing</li>
                    <li><strong>No Cross-Site Tracking:</strong> We do not use cookies to follow your activity across other websites</li>
                    <li><strong>No Third-Party A/B Testing Cookies:</strong> Feature experiments are not currently powered by third-party tracking cookies</li>
                  </ul>
                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Retention:</strong> Not applicable while analytics and advertising cookies remain disabled.
                  </p>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg border border-purple-200 dark:border-purple-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Functional Cookies</h3>
                  <p className="mb-3">These cookies enhance your experience:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>User Preferences:</strong> Remember your theme, language, and display settings</li>
                    <li><strong>Form Data:</strong> Temporarily store form information to prevent data loss</li>
                    <li><strong>Event Access:</strong> Remember recently accessed events for quick navigation</li>
                    <li><strong>Haptic Feedback:</strong> Store your haptic feedback preferences for mobile devices</li>
                  </ul>
                  <p className="text-sm text-muted-foreground mt-3">
                    <strong>Retention:</strong> Typically last 30-90 days depending on the specific function.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">3. Third-Party Cookies</h2>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Clerk Authentication</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Manages secure user authentication and session management.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>Purpose:</strong> Login state, multi-factor authentication, security
                    <br />
                    <strong>Privacy Policy:</strong> <a href="https://clerk.com/privacy" className="text-primary hover:underline">clerk.com/privacy</a>
                  </p>
                </div>

                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Convex Real-time Database</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Enables real-time features and secure data synchronization.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong>Purpose:</strong> Real-time updates, data synchronization, offline support
                    <br />
                    <strong>Privacy Policy:</strong> <a href="https://convex.dev/privacy" className="text-primary hover:underline">convex.dev/privacy</a>
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">4. Local Storage and Similar Technologies</h2>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="mb-4">In addition to cookies, we may use:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Local Storage:</strong> Store user preferences and application state locally</li>
                  <li><strong>Session Storage:</strong> Temporary storage for the current browser session</li>
                  <li><strong>IndexedDB:</strong> Local database for offline functionality and caching</li>
                  <li><strong>Service Workers:</strong> Enable offline features and push notifications</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">5. Managing Your Cookie Preferences</h2>

              <div className="space-y-6">
                <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg border border-orange-200 dark:border-orange-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Browser Controls</h3>
                  <p className="mb-3">You can control cookies through your browser settings:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Block all cookies (may affect website functionality)</li>
                    <li>Delete existing cookies</li>
                    <li>Set preferences for specific websites</li>
                    <li>Receive notifications when cookies are set</li>
                  </ul>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
                  <h3 className="text-xl font-semibold text-primary mb-3">Important Note</h3>
                  <p>
                    Disabling essential cookies will prevent core platform features from working properly, including
                    user authentication, event access, and RSVP functionality.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">6. Browser-Specific Instructions</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Chrome</h4>
                  <p className="text-sm text-muted-foreground">
                    Settings → Privacy and security → Cookies and other site data
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Firefox</h4>
                  <p className="text-sm text-muted-foreground">
                    Preferences → Privacy & Security → Cookies and Site Data
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Safari</h4>
                  <p className="text-sm text-muted-foreground">
                    Preferences → Privacy → Manage Website Data
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold text-primary mb-2">Edge</h4>
                  <p className="text-sm text-muted-foreground">
                    Settings → Cookies and site permissions → Cookies and data stored
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">7. Mobile Apps and Progressive Web Apps</h2>
              <p>
                If you access Dojo Pomodoro through a mobile app or as a Progressive Web App (PWA), similar data storage
                technologies may be used to provide the best possible experience. You can manage these through your device&apos;s
                app settings.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">8. Updates to This Policy</h2>
              <p>
                We may update this Cookies Policy to reflect changes in technology or legal requirements. We will post any
                changes on this page and update the &ldquo;last updated&rdquo; date at the top.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-primary mb-4">9. Contact Us</h2>
              <div className="bg-gray-50 dark:bg-gray-900/20 p-6 rounded-lg border">
                <p className="mb-4">For questions about our use of cookies or this policy:</p>
                <ul className="space-y-2">
                  <li><strong>Website:</strong> <a href="https://dojopomodoro.club" className="text-primary hover:underline">dojopomodoro.club</a></li>
                  <li><strong>Privacy Concerns:</strong> Contact us through our platform</li>
                  <li><strong>More Information:</strong> See our full <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a></li>
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
          <a href="/data" className="text-primary hover:underline font-medium">
            Data Collection
          </a>
        </div>
      </div>
    </main>
  );
}

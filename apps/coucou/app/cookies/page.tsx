import { LegalPage, LegalSection } from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";

export default function CookiesPolicy() {
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
      title="Cookies Policy"
      lastUpdated={lastUpdated}
      intro={
        <>How we use cookies and similar technologies to improve your experience on {brandName}.</>
      }
    >
      <LegalSection title="1. What Are Cookies?" rule={false}>
        <p>
          Cookies are small text files stored on your device when you visit our site. They help us
          provide a better experience by remembering your preferences, analyzing how you use the
          platform, and improving our services.
        </p>
      </LegalSection>

      <LegalSection title="2. Types of Cookies We Use">
        <p
          className="text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Essential cookies
        </p>
        <p>These are necessary for the platform to function properly:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Authentication:</strong> Managed by Clerk to keep you logged in securely.
          </li>
          <li>
            <strong>Session Management:</strong> Maintain your session state across pages.
          </li>
          <li>
            <strong>Security:</strong> Protect against cross-site request forgery (CSRF) attacks.
          </li>
          <li>
            <strong>Load Balancing:</strong> Ensure optimal server performance.
          </li>
        </ul>
        <p style={{ color: "var(--tt-fg-dim)" }}>
          <strong>Retention:</strong> Session cookies are deleted when you close your browser.
          Persistent authentication cookies last up to 30 days.
        </p>

        <p
          className="mt-6 text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          No analytics or advertising cookies
        </p>
        <p>We do not currently use third-party analytics or advertising cookies on {brandName}.</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>No product analytics cookies.</strong>
          </li>
          <li>
            <strong>No advertising cookies.</strong>
          </li>
          <li>
            <strong>No cross-site tracking.</strong>
          </li>
          <li>
            <strong>No third-party A/B testing cookies.</strong>
          </li>
        </ul>

        <p
          className="mt-6 text-[13px] uppercase tracking-[0.06em]"
          style={{ color: "var(--tt-fg-mute)" }}
        >
          Functional cookies
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>User Preferences:</strong> Remember your theme, language, and display settings.
          </li>
          <li>
            <strong>Form Data:</strong> Temporarily store form information to prevent data loss.
          </li>
          <li>
            <strong>Event Access:</strong> Remember recently accessed events for quick navigation.
          </li>
          <li>
            <strong>Haptic Feedback:</strong> Store your haptic feedback preferences for mobile.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Third-Party Cookies">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Clerk Authentication.</strong> Manages secure user authentication and session
            management. See{" "}
            <a
              href="https://clerk.com/privacy"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              clerk.com/privacy
            </a>
            .
          </li>
          <li>
            <strong>Convex Real-time Database.</strong> Enables real-time features and secure data
            sync. See{" "}
            <a
              href="https://convex.dev/privacy"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              convex.dev/privacy
            </a>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Local Storage and Similar Technologies">
        <p>In addition to cookies, we may use:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Local Storage</strong> for user preferences and application state.
          </li>
          <li>
            <strong>Session Storage</strong> for the current browser session.
          </li>
          <li>
            <strong>IndexedDB</strong> for offline functionality and caching.
          </li>
          <li>
            <strong>Service Workers</strong> for offline features and push notifications.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Managing Your Cookie Preferences">
        <p>You can control cookies through your browser settings:</p>
        <ul className="ml-5 list-disc space-y-2">
          <li>Block all cookies (may affect website functionality).</li>
          <li>Delete existing cookies.</li>
          <li>Set preferences for specific websites.</li>
          <li>Receive notifications when cookies are set.</li>
        </ul>
        <p>
          Disabling essential cookies will prevent core features from working properly, including
          user authentication, event access, and RSVP functionality.
        </p>
      </LegalSection>

      <LegalSection title="6. Browser-Specific Instructions">
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data.
          </li>
          <li>
            <strong>Firefox:</strong> Preferences → Privacy &amp; Security → Cookies and Site Data.
          </li>
          <li>
            <strong>Safari:</strong> Preferences → Privacy → Manage Website Data.
          </li>
          <li>
            <strong>Edge:</strong> Settings → Cookies and site permissions → Cookies and data
            stored.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Mobile Apps and Progressive Web Apps">
        <p>
          If you access {brandName} through a mobile app or as a Progressive Web App, similar data
          storage technologies may be used to provide the best possible experience. You can manage
          these through your device&apos;s app settings.
        </p>
      </LegalSection>

      <LegalSection title="8. Updates to This Policy">
        <p>
          We may update this Cookies Policy to reflect changes in technology or legal requirements.
          We will post any changes here and update the &ldquo;last updated&rdquo; date at the top.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          For questions about our use of cookies or this policy, visit{" "}
          <a href={siteConfiguration.domain} className="underline" target="_blank" rel="noreferrer">
            {siteConfiguration.domain.replace(/^https?:\/\//, "")}
          </a>{" "}
          or read our full{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

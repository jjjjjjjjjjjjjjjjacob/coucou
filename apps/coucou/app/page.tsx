import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { TenantTemplateProvider } from "@coucou/ui/tenant-template";
import HeaderClient from "./header-client";
import { Footer } from "@/components/footer";
import { RedirectIfAuthed } from "@/components/redirect-if-authed";

const PRINCIPLES: Array<{ number: string; title: string; description: string }> = [
  {
    number: "01",
    title: "Yours, not ours.",
    description:
      "The list, the tags, the threads — exportable, never shared.",
  },
  {
    number: "02",
    title: "No feed. No discovery.",
    description: "Guests see your night. Nothing else.",
  },
  {
    number: "03",
    title: "No advertising.",
    description:
      "Subscription is our only business — your guests are not the product.",
  },
  {
    number: "04",
    title: "White-label, by engagement.",
    description:
      "Bespoke branding for every house. We set it up with you. Coucou never appears.",
  },
];

const APPARATUS: Array<{ label: string; meta: string }> = [
  { label: "Tiered guest lists", meta: "2–5 tiers, your names." },
  { label: "Approval queue", meta: "Read the note. Decide." },
  { label: "Reputation tags", meta: "Private to you. Forever." },
  { label: "Text blasts, segmented", meta: "Filter by anything." },
  { label: "A line of correspondence", meta: "One thread per guest." },
  { label: "Event pages", meta: "Look like you. Not us." },
];

const sectionClass =
  "flex min-h-[100dvh] flex-col justify-center [scroll-snap-align:start] py-24";

const contentClass =
  "mx-auto flex w-full max-w-[980px] flex-col px-6 sm:px-12 md:px-20";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <TenantTemplateProvider siteConfigurationPreset="coucou">
      <RedirectIfAuthed to="/dashboard" />
      <div
        className="coucou-scroller"
        style={{
          background: "var(--tt-bg)",
          color: "var(--tt-fg)",
          fontFamily: "var(--tt-text)",
        }}
      >
        <HeaderClient sticky />

        <section className={sectionClass}>
          <div className={contentClass}>
            <div className="max-w-[720px]">
              <h1
                className="m-0 text-[28px] sm:text-[32px]"
                style={{
                  fontFamily: "var(--tt-display)",
                  fontWeight: 400,
                  lineHeight: 1.3,
                  letterSpacing: "-0.01em",
                  color: "var(--tt-fg)",
                }}
              >
                The guest list is yours.
              </h1>
              <p
                className="mb-16 mt-8 max-w-[540px] text-[14px]"
                style={{
                  lineHeight: 1.7,
                  color: "var(--tt-fg-dim)",
                }}
              >
                Quiet infrastructure for members&apos; clubs, recurring parties,
                and operators who know their room by name.
              </p>
              <div className="flex gap-8 text-[14px]">
                <Link
                  href="mailto:hello@coucou.events"
                  style={{
                    color: "var(--tt-fg)",
                    borderBottom: "1px solid var(--tt-fg)",
                    paddingBottom: 2,
                  }}
                >
                  Inquire →
                </Link>
                <Link href="/sign-in" style={{ color: "var(--tt-fg-dim)" }}>
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          className={sectionClass}
          style={{ borderTop: "1px solid var(--tt-rule)" }}
        >
          <div className={contentClass}>
            {PRINCIPLES.map((principle) => (
              <div
                key={principle.number}
                className="grid grid-cols-[40px_1fr] items-baseline gap-x-4 gap-y-2 py-6 sm:grid-cols-[60px_200px_1fr] sm:gap-x-6"
                style={{ borderBottom: "1px solid var(--tt-rule)" }}
              >
                <span
                  className="text-[13px]"
                  style={{ color: "var(--tt-fg-mute)" }}
                >
                  {principle.number}
                </span>
                <span
                  className="text-[14px]"
                  style={{ color: "var(--tt-fg)" }}
                >
                  {principle.title}
                </span>
                <span
                  className="col-span-2 text-[14px] sm:col-span-1"
                  style={{ color: "var(--tt-fg-dim)" }}
                >
                  {principle.description}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section
          className={sectionClass}
          style={{ borderTop: "1px solid var(--tt-rule)" }}
        >
          <div className={contentClass}>
            <div
              className="mb-12 text-[12px] uppercase tracking-[0.06em]"
              style={{ color: "var(--tt-fg-mute)" }}
            >
              Apparatus
            </div>
            <div>
              {APPARATUS.map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between gap-4 py-5 text-[14px]"
                  style={{ borderBottom: "1px solid var(--tt-rule)" }}
                >
                  <span>{row.label}</span>
                  <span
                    className="text-right"
                    style={{ color: "var(--tt-fg-dim)" }}
                  >
                    {row.meta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="inquire"
          className={sectionClass}
          style={{ borderTop: "1px solid var(--tt-rule)" }}
        >
          <div className={contentClass}>
            <div
              className="mb-12 text-[12px] uppercase tracking-[0.06em]"
              style={{ color: "var(--tt-fg-mute)" }}
            >
              Terms
            </div>
            <div className="max-w-[640px]">
              <h2
                className="m-0 text-[28px] sm:text-[32px]"
                style={{
                  fontFamily: "var(--tt-display)",
                  fontWeight: 400,
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                  color: "var(--tt-fg)",
                }}
              >
                Every Coucou is built to fit.
              </h2>
              <p
                className="mb-12 mt-8 max-w-[540px] text-[14px]"
                style={{
                  lineHeight: 1.7,
                  color: "var(--tt-fg-dim)",
                }}
              >
                We&apos;re enterprise-only for now. Every Coucou is white-labeled
                and stood up by us in collaboration with your team — domain,
                brand, voice. Pricing by negotiation.
              </p>
              <Link
                href="mailto:hello@coucou.events"
                className="inline-block text-[14px]"
                style={{
                  color: "var(--tt-fg)",
                  borderBottom: "1px solid var(--tt-fg)",
                  paddingBottom: 2,
                }}
              >
                Inquire — hello@coucou.events →
              </Link>
            </div>
          </div>
        </section>

        <div className="[scroll-snap-align:end]">
          <Footer />
        </div>
      </div>
    </TenantTemplateProvider>
  );
}

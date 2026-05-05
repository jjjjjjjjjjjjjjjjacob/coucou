"use client";

import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { usePreset } from "../use-preset";
import { useMobile } from "../use-mobile";
import { TenantShell } from "./tenant-shell";
import { Eyebrow } from "./primitives/eyebrow";
import { TenantButton } from "./primitives/button";

export type RsvpGateState = "idle" | "wrong" | "submitting";

export interface RsvpGateProps {
  password: string;
  onPasswordChange: (next: string) => void;
  onSubmit: () => void | Promise<void>;
  state?: RsvpGateState;
  /**
   * Custom error message overriding the preset default. Only shown when
   * state === "wrong".
   */
  errorMessage?: ReactNode;
  /**
   * Optional contact email surfaced under the wrong-password message.
   */
  contactEmail?: string;
  /**
   * Optional secondary CTA — e.g. magic-link escape hatch.
   */
  magicLinkSlot?: ReactNode;
  /**
   * Override the heading copy.
   */
  heading?: string;
  /**
   * Override the sub copy.
   */
  sub?: string;
  /**
   * Override the placeholder string for the password input.
   */
  placeholder?: string;
  /**
   * Page-level brand copy (footer contact). Optional.
   */
  footerContact?: string;
}

const DEFAULT_HEADING: Record<string, string> = {
  dojo: "List password.",
  atrium: "The password.",
  maison: "The password.",
};

const DEFAULT_SUB: Record<string, string> = {
  dojo: "Enter the password you received from your host. Case-insensitive.",
  atrium:
    "Enter the password you were given. We do not mind about case.",
  maison:
    "You will have received it. Type it as it was sent — we are not particular about case.",
};

export function RsvpGate({
  password,
  onPasswordChange,
  onSubmit,
  state = "idle",
  errorMessage,
  contactEmail,
  magicLinkSlot,
  heading,
  sub,
  placeholder = "•••••••",
  footerContact,
}: RsvpGateProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();
  const wrong = state === "wrong";
  const submitting = state === "submitting";

  const resolvedHeading = heading ?? DEFAULT_HEADING[presetKey];
  const resolvedSub = sub ?? DEFAULT_SUB[presetKey];

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPasswordChange(event.target.value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit();
  };

  return (
    <TenantShell>
      <section
        style={{
          padding: isMobile ? "80px 0 60px" : "140px 0 100px",
          maxWidth: 480,
        }}
      >
        <Eyebrow>RSVP</Eyebrow>
        <h2
          className="m-0 mb-4"
          style={{
            fontFamily: "var(--tt-display)",
            fontWeight: presetKey === "dojo" ? 700 : 400,
            fontSize: isMobile ? 22 : 26,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            color: "var(--tt-fg)",
          }}
        >
          {resolvedHeading}
        </h2>
        <p
          className="m-0 mb-10 max-w-[420px]"
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--tt-fg-dim)",
          }}
        >
          {resolvedSub}
        </p>

        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-center gap-3"
          style={{ marginBottom: 16 }}
        >
          <input
            value={password}
            onChange={handlePasswordChange}
            placeholder={placeholder}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={submitting}
            className="bg-transparent outline-none"
            style={{
              fontFamily: "var(--tt-text)",
              fontSize: 18,
              color: "var(--tt-fg)",
              padding: "12px 0",
              border: "none",
              borderBottom: `1px solid ${wrong ? "var(--tt-fg)" : "var(--tt-rule-strong)"}`,
              flex: 1,
              minWidth: isMobile ? "100%" : 0,
              letterSpacing: "0.2em",
            }}
          />
          <TenantButton type="submit" disabled={submitting || !password}>
            {submitting ? "Checking…" : "Continue"}
          </TenantButton>
        </form>

        {wrong ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--tt-fg-dim)",
              marginTop: 16,
            }}
          >
            {errorMessage ?? (
              <>
                That isn&apos;t the one. Try again
                {contactEmail ? (
                  <>
                    , or write to{" "}
                    <span style={{ color: "var(--tt-fg)" }}>
                      {contactEmail}
                    </span>
                  </>
                ) : null}
                .
              </>
            )}
          </div>
        ) : null}

        {magicLinkSlot ? (
          <div
            className="mt-20 flex justify-between border-t pt-6 text-[13px]"
            style={{ borderTopColor: "var(--tt-rule)" }}
          >
            <span style={{ color: "var(--tt-fg-dim)" }}>
              or, if you&apos;ve a code
            </span>
            {magicLinkSlot}
          </div>
        ) : null}
      </section>
    </TenantShell>
  );
}

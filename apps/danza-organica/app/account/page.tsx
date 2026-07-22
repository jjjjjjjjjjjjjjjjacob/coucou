"use client";

import { UserProfile } from "@clerk/nextjs";
import type { Appearance } from "@clerk/types";
import type { CSSProperties } from "react";

const displayHeadingStyle: CSSProperties = {
  fontFamily: 'var(--font-bowlby-one), "Bowlby One", "Fugaz One", "Anton", "Impact", sans-serif',
  textTransform: "uppercase",
  letterSpacing: "0.01em",
  lineHeight: 1.05,
};

const textBodyStyle: CSSProperties = {
  fontFamily: "var(--tt-text)",
};

// Strip the default Clerk card chrome — no rounded corners, no shadow,
// no tinted background — so the surface flows with the rest of Club
// Danza Organica's black-on-turquoise aesthetic. Form labels match the uppercase
// tracking pattern used by the RSVP forms.
const accountSettingsAppearance: Appearance = {
  elements: {
    rootBox: "w-full max-w-6xl mx-auto",
    card: "w-full bg-transparent border-none shadow-none rounded-none",
    page: "px-0 bg-transparent",
    main: "px-0 bg-transparent",
    content: "px-0 sm:px-2 lg:px-4 pb-10",
    headerTitle: "text-xl tracking-[0.01em] uppercase text-primary",
    headerSubtitle: "text-sm text-primary/70",
    navbar: "border-r-0 bg-transparent",
    navbarScrollBox: "px-0 sm:px-2 lg:px-4 py-6 bg-transparent",
    navbarButtons: "gap-1",
    navbarItemButton:
      "text-[11px] uppercase tracking-[0.12em] font-medium rounded-none data-[active=true]:bg-transparent data-[active=true]:text-primary text-primary/60 hover:text-primary",
    navbarItemIcon: "text-primary",
    profileSection: "border-none rounded-none bg-transparent px-0",
    profileSectionTitle: "text-[11px] uppercase tracking-[0.12em] font-medium text-primary",
    profileSectionContent: "text-primary",
    formFieldLabel: "text-[11px] uppercase tracking-[0.12em] font-medium text-primary",
    formFieldInput:
      "border border-primary/20 rounded-none bg-transparent text-primary focus:border-primary focus-visible:ring-primary/40",
    formButtonPrimary:
      "rounded-none bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40",
    formButtonReset: "rounded-none",
    badge:
      "rounded-none border border-primary/30 text-[10px] uppercase tracking-[0.1em] text-primary",
    accordionTriggerButton: "border-none rounded-none bg-transparent text-primary",
  },
  variables: {
    fontFamily: "var(--tt-text)",
    borderRadius: "0",
  },
};

export default function AccountSettingsPage() {
  return (
    <div className="w-full pb-12 pt-10" style={textBodyStyle}>
      <div className="mx-auto flex w-full max-w-6xl flex-col space-y-8">
        <div className="px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl text-primary sm:text-4xl" style={displayHeadingStyle}>
            Account Settings
          </h1>
          <p className="mt-2 text-sm text-primary/70">
            Manage your sign-in methods, contact information, and security preferences.
          </p>
        </div>
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <UserProfile routing="hash" appearance={accountSettingsAppearance} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { UserProfile } from "@clerk/nextjs";
import type { Appearance } from "@clerk/types";

const accountSettingsAppearance: Appearance = {
  elements: {
    rootBox: "w-full max-w-6xl mx-auto",
    card: "w-full rounded-2xl border border-primary/15 bg-background shadow-none",
    page: "px-0",
    main: "px-0",
    content: "px-4 sm:px-6 lg:px-8 pb-10",
    headerTitle: "text-2xl font-semibold",
    headerSubtitle: "text-sm text-muted-foreground",
    navbar: "border-r border-primary/10 bg-transparent",
    navbarScrollBox: "px-4 sm:px-6 lg:px-8 py-6",
    navbarItemButton:
      "text-sm font-medium data-[active=true]:bg-primary/10 data-[active=true]:text-primary",
    navbarItemIcon: "text-primary",
    profileSection: "border border-primary/10 rounded-xl",
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "border border-primary/20 focus:border-primary focus-visible:ring-primary/40",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40",
  },
};

export default function AccountSettingsPage() {
  return (
    <div className="w-full pb-12 pt-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col space-y-6">
        <div className="px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">Account Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your sign-in methods, contact information, and security preferences.
          </p>
        </div>
        <div className="w-full">
          <UserProfile routing="hash" appearance={accountSettingsAppearance} />
        </div>
      </div>
    </div>
  );
}


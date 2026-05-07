import type { PresetKey } from "./theming/presets";

export type SiteKey = "dojo" | "club-chlorine" | "coucou";

export type AuthMethod = "phone" | "email";

export interface SiteAuthConfiguration {
  siteKey: SiteKey;
  brandName: string;
  accentMark: string;
  heading: string;
  description: string;
  allowedMethods: AuthMethod[];
  defaultMethod: AuthMethod;
  signInRedirectPath: string;
  verificationDescription: string;
}

export interface SiteConfiguration {
  siteKey: SiteKey;
  workspaceSlug: string;
  brandName: string;
  shortName: string;
  domain: string;
  description: string;
  accentMark: string;
  homeTitle: string;
  homeDescription: string;
  appKind: "client" | "admin";
  preset: PresetKey;
  auth: SiteAuthConfiguration;
}

export const siteConfigurations: Record<SiteKey, SiteConfiguration> = {
  dojo: {
    siteKey: "dojo",
    workspaceSlug: "dojo-pomodoro",
    brandName: "Dojo Pomodoro",
    shortName: "Dojo",
    domain: "https://dojopomodoro.club",
    description:
      "Event management platform for exclusive gatherings and experiences",
    accentMark: "DP",
    homeTitle: "Enter Event Password",
    homeDescription:
      "Enter the password you received to access your event.",
    appKind: "client",
    preset: "dojo",
    auth: {
      siteKey: "dojo",
      brandName: "Dojo Pomodoro",
      accentMark: "DP",
      heading: "Sign in to Dojo Pomodoro",
      description:
        "Use your phone number to open your tickets, RSVP updates, and event access.",
      allowedMethods: ["phone"],
      defaultMethod: "phone",
      signInRedirectPath: "/",
      verificationDescription:
        "Enter the verification code we texted to finish signing in.",
    },
  },
  "club-chlorine": {
    siteKey: "club-chlorine",
    workspaceSlug: "club-chlorine",
    brandName: "Club Chlorine",
    shortName: "Chlorine",
    domain: "https://clubchlorine.party",
    description:
      "Guest list and event access for Club Chlorine and curated nightlife experiences",
    accentMark: "CC",
    homeTitle: "Club Chlorine",
    homeDescription:
      "Three nights. One pool. Choose a date and RSVP — guest list codes optional.",
    appKind: "client",
    preset: "chlorine",
    auth: {
      siteKey: "club-chlorine",
      brandName: "Club Chlorine",
      accentMark: "CC",
      heading: "Sign in to Club Chlorine",
      description:
        "Use your phone number to open guest access, tickets, and event updates.",
      allowedMethods: ["phone"],
      defaultMethod: "phone",
      signInRedirectPath: "/",
      verificationDescription:
        "Enter the verification code we texted to continue.",
    },
  },
  coucou: {
    siteKey: "coucou",
    workspaceSlug: "coucou",
    brandName: "Coucou",
    shortName: "Coucou",
    domain: "https://coucou.events",
    description:
      "Headless event operations for client sites, organizers, and door teams",
    accentMark: "CO",
    homeTitle: "Coucou",
    homeDescription:
      "Private event operations for branded client sites and organizer teams.",
    appKind: "admin",
    preset: "coucou",
    auth: {
      siteKey: "coucou",
      brandName: "Coucou",
      accentMark: "CO",
      heading: "Sign in to Coucou",
      description:
        "Access your workspaces, event operations, and organizer tools.",
      allowedMethods: ["phone", "email"],
      defaultMethod: "phone",
      signInRedirectPath: "/dashboard",
      verificationDescription:
        "Enter the verification code we sent to finish signing in.",
    },
  },
};

export const siteAuthConfigurations: Record<SiteKey, SiteAuthConfiguration> = {
  dojo: siteConfigurations.dojo.auth,
  "club-chlorine": siteConfigurations["club-chlorine"].auth,
  coucou: siteConfigurations.coucou.auth,
};

import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { SiteAuthConfiguration, SiteKey } from "@coucou/sdk/site-config";
import { resolveSafeRedirectUrl } from "@coucou/sdk/routes";
import { SignInClient } from "../../../sign-in/[[...sign-in]]/sign-in-client";
import { siteConfiguration as coucouSiteConfiguration } from "@/lib/site";
import {
  buildWorkspaceOperationPath,
  isCoucouWorkspaceSlug,
} from "@/lib/workspace-config";
import {
  buildWorkspaceAllowedRedirectOrigins,
  extractEventIdFromRedirectUrl,
  resolvePrimaryClientSiteConfiguration,
} from "@/lib/workspace-login-branding";

type RawSearchParams = Record<string, string | string[] | undefined>;
type ThemedEvent = {
  _id: Id<"events">;
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
};

interface TenantLoginPageParams {
  workspaceSlug: string;
}

function ensureString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function buildAccentMark(brandName: string): string {
  const words = brandName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  if (initials) {
    return initials;
  }

  return brandName.trim().slice(0, 2).toUpperCase() || "CO";
}

function mapEventToThemedEvent(event: {
  _id: Id<"events">;
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
}): ThemedEvent {
  return {
    _id: event._id,
    themeBackgroundColor: event.themeBackgroundColor ?? null,
    themeTextColor: event.themeTextColor ?? null,
  };
}

async function loadEventForTheme({
  eventId,
  siteKey,
}: {
  eventId: string | null;
  siteKey?: SiteKey;
}): Promise<ThemedEvent | null> {
  if (!eventId) {
    return null;
  }

  try {
    const event = await fetchQuery(api.events.get, {
      eventId: eventId as Id<"events">,
      siteKey,
    });
    return event ? mapEventToThemedEvent(event) : null;
  } catch (error) {
    console.error("Failed to load event for workspace login theme", error);
    return null;
  }
}

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<TenantLoginPageParams>;
  searchParams?: Promise<RawSearchParams>;
}) {
  const { workspaceSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const fallbackRedirectPath = buildWorkspaceOperationPath(
    workspaceSlug,
    "host",
  );

  const workspace = await fetchQuery(api.workspaces.getWorkspaceBySlug, {
    slug: workspaceSlug,
  });

  if (
    !workspace ||
    workspace.kind === "admin" ||
    isCoucouWorkspaceSlug(workspace.slug)
  ) {
    notFound();
  }

  const primaryClientSiteConfiguration = resolvePrimaryClientSiteConfiguration(
    workspace.sites,
  );
  const siteAuthConfiguration = primaryClientSiteConfiguration?.auth ?? null;
  const workspaceAllowedRedirectOrigins =
    buildWorkspaceAllowedRedirectOrigins(workspace);

  const redirectUrl = resolveSafeRedirectUrl(
    ensureString(resolvedSearchParams.redirect_url),
    fallbackRedirectPath,
    workspaceAllowedRedirectOrigins,
  );
  const authObject = await auth();
  if (authObject.userId) {
    redirect(redirectUrl);
  }

  const themedEvent = await loadEventForTheme({
    eventId: extractEventIdFromRedirectUrl(redirectUrl),
    siteKey: primaryClientSiteConfiguration?.siteKey,
  });

  const tenantAuthConfiguration: SiteAuthConfiguration = siteAuthConfiguration ?? {
    siteKey: "coucou",
    brandName: workspace.name,
    accentMark: buildAccentMark(workspace.name),
    heading: `Sign in to ${workspace.name}`,
    description:
      "Use your organization account to open tenant dashboard operations.",
    allowedMethods: ["phone", "email"],
    defaultMethod: "phone",
    signInRedirectPath: buildWorkspaceOperationPath(workspace.slug, "host"),
    verificationDescription:
      "Enter the verification code we sent to continue.",
  };
  const fallbackEyebrow = siteAuthConfiguration
    ? "Event login"
    : "Organization login";

  return (
    <SignInClient
      redirectUrl={redirectUrl}
      preset={primaryClientSiteConfiguration?.preset ?? coucouSiteConfiguration.preset}
      siteAuthConfiguration={tenantAuthConfiguration}
      eventThemeBackgroundColor={themedEvent?.themeBackgroundColor ?? null}
      eventThemeTextColor={themedEvent?.themeTextColor ?? null}
      authBranding={{
        heading:
          workspace.authBranding?.heading ?? tenantAuthConfiguration.heading,
        sub:
          workspace.authBranding?.sub ?? tenantAuthConfiguration.description,
        eyebrow: workspace.authBranding?.eyebrow ?? fallbackEyebrow,
        brandMarkStyle:
          workspace.authBranding?.brandMarkStyle ?? "square-serif",
        showCoucouAttribution:
          workspace.authBranding?.showCoucouAttribution ?? true,
      }}
    />
  );
}

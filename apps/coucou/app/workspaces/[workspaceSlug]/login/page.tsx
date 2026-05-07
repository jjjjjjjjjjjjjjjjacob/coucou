import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { getSiteOrigin, siteConfigurations } from "@coucou/sdk";
import type {
  SiteAuthConfiguration,
  SiteKey,
} from "@coucou/sdk/site-config";
import { resolveSafeRedirectUrl } from "@coucou/sdk/routes";
import { SignInClient } from "../../../sign-in/[[...sign-in]]/sign-in-client";
import {
  buildWorkspaceOperationPath,
  isCoucouWorkspaceSlug,
} from "@/lib/workspace-config";

type RawSearchParams = Record<string, string | string[] | undefined>;

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

function isSiteKey(value: string | null | undefined): value is SiteKey {
  return (
    value === "dojo" || value === "club-chlorine" || value === "coucou"
  );
}

function normalizeDomainOrigin(domain: string | null | undefined): string | null {
  const trimmedDomain = domain?.trim();
  if (!trimmedDomain) {
    return null;
  }

  try {
    const domainUrl = new URL(
      trimmedDomain.match(/^https?:\/\//)
        ? trimmedDomain
        : `https://${trimmedDomain}`,
    );
    return domainUrl.origin;
  } catch {
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

  const primaryWorkspaceSite = workspace.sites.find(
    (workspaceSite) =>
      isSiteKey(workspaceSite.siteKey) &&
      siteConfigurations[workspaceSite.siteKey].appKind === "client",
  );
  const siteAuthConfiguration =
    primaryWorkspaceSite && isSiteKey(primaryWorkspaceSite.siteKey)
      ? siteConfigurations[primaryWorkspaceSite.siteKey].auth
      : null;

  const workspaceAllowedRedirectOrigins = new Set<string>();
  const workspacePrimaryOrigin = normalizeDomainOrigin(workspace.primaryDomain);
  if (workspacePrimaryOrigin) {
    workspaceAllowedRedirectOrigins.add(workspacePrimaryOrigin);
  }
  for (const workspaceSite of workspace.sites) {
    const workspaceSiteOrigin = normalizeDomainOrigin(workspaceSite.domain);
    if (workspaceSiteOrigin) {
      workspaceAllowedRedirectOrigins.add(workspaceSiteOrigin);
    }
    if (isSiteKey(workspaceSite.siteKey)) {
      workspaceAllowedRedirectOrigins.add(
        getSiteOrigin(siteConfigurations[workspaceSite.siteKey]),
      );
    }
  }

  const redirectUrl = resolveSafeRedirectUrl(
    ensureString(resolvedSearchParams.redirect_url),
    fallbackRedirectPath,
    [...workspaceAllowedRedirectOrigins],
  );
  const authObject = await auth();
  if (authObject.userId) {
    redirect(redirectUrl);
  }

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
      siteAuthConfiguration={tenantAuthConfiguration}
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

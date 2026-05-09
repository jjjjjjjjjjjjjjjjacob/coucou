import { api } from "@convex/_generated/api";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { type SiteKey, siteConfigurations } from "@coucou/sdk/site-config";
import { fetchQuery } from "convex/nextjs";
import { notFound, redirect } from "next/navigation";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import type { Event } from "@/lib/types";

type RawSearchParams = Record<string, string | string[] | undefined>;
type RoutableEvent = Event & {
  siteKey?: string;
  workspaceSlug?: string;
};

interface PublicEventRedirectPageProps {
  params: Promise<{ eventRoute?: string[] }>;
  searchParams?: Promise<RawSearchParams>;
}

function isSiteKey(value: string | undefined): value is SiteKey {
  return Boolean(value && value in siteConfigurations);
}

function resolveEventWorkspaceSlug(event: RoutableEvent): string | null {
  if (event.workspaceSlug?.trim()) {
    return event.workspaceSlug;
  }

  if (isSiteKey(event.siteKey)) {
    return siteConfigurations[event.siteKey].workspaceSlug;
  }

  return event.siteKey?.trim() || null;
}

function appendRouteSuffix(publicEventUrl: string, routeSuffixSegments: string[]): string {
  if (routeSuffixSegments.length === 0) {
    return publicEventUrl;
  }

  const parsedUrl = new URL(publicEventUrl);
  const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, "");
  const encodedSuffix = routeSuffixSegments.map((segment) => encodeURIComponent(segment)).join("/");
  parsedUrl.pathname = `${normalizedPathname}/${encodedSuffix}`;
  return parsedUrl.toString();
}

function appendSearchParams(publicEventUrl: string, searchParams: RawSearchParams): string {
  const parsedUrl = new URL(publicEventUrl);
  for (const [searchParamKey, searchParamValue] of Object.entries(searchParams)) {
    if (Array.isArray(searchParamValue)) {
      for (const value of searchParamValue) {
        parsedUrl.searchParams.append(searchParamKey, value);
      }
      continue;
    }

    if (typeof searchParamValue === "string") {
      parsedUrl.searchParams.append(searchParamKey, searchParamValue);
    }
  }
  return parsedUrl.toString();
}

function buildKnownSitePublicEventUrl(event: RoutableEvent): string | null {
  if (!isSiteKey(event.siteKey)) {
    return null;
  }

  const siteConfiguration = siteConfigurations[event.siteKey];
  return `${siteConfiguration.domain.replace(/\/+$/, "")}/events/${getEventRouteId(event)}`;
}

export default async function PublicEventRedirectPage({
  params,
  searchParams,
}: PublicEventRedirectPageProps) {
  const { eventRoute } = await params;
  const [eventRouteId, ...routeSuffixSegments] = eventRoute ?? [];
  if (!eventRouteId) {
    notFound();
  }

  const event = (await fetchQuery(api.events.getByRouteId, {
    eventRouteId,
  })) as RoutableEvent | null;

  if (!event) {
    notFound();
  }

  const workspaceSlug = resolveEventWorkspaceSlug(event);
  const workspace = workspaceSlug
    ? await fetchQuery(api.workspaces.getWorkspaceBySlug, { slug: workspaceSlug })
    : null;
  const basePublicEventUrl =
    buildPublicEventUrl(workspace ?? null, event) ?? buildKnownSitePublicEventUrl(event);

  if (!basePublicEventUrl) {
    notFound();
  }

  const publicEventUrlWithSuffix = appendRouteSuffix(basePublicEventUrl, routeSuffixSegments);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  redirect(appendSearchParams(publicEventUrlWithSuffix, resolvedSearchParams));
}

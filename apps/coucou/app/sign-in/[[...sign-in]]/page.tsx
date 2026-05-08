import { auth } from "@clerk/nextjs/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getClientSiteRedirectOrigins } from "@coucou/sdk";
import { resolveSafeRedirectUrl } from "@coucou/sdk/routes";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { siteConfiguration } from "@/lib/site";
import type { Event } from "@/lib/types";
import { SignInClient } from "./sign-in-client";

type RawSearchParams = Record<string, string | string[] | undefined>;
type ThemedEvent = Pick<
  Event,
  "_id" | "themeBackgroundColor" | "themeTextColor" | "customIconStorageId"
>;

function ensureString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function extractEventIdFromRedirect(redirectUrl: string | undefined): string | null {
  if (!redirectUrl) return null;
  try {
    const parsed = new URL(redirectUrl);
    const match = parsed.pathname.match(/\/events\/([^/]+)/);
    return match?.[1] ?? null;
  } catch {
    const match = redirectUrl.match(/\/events\/([^/?#]+)/);
    return match?.[1] ?? null;
  }
}

function mapEventToThemedEvent(event: {
  _id: Id<"events">;
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
  customIconStorageId?: Id<"_storage"> | null;
}): ThemedEvent {
  return {
    _id: event._id,
    themeBackgroundColor: event.themeBackgroundColor ?? undefined,
    themeTextColor: event.themeTextColor ?? undefined,
    customIconStorageId: event.customIconStorageId ?? null,
  };
}

async function loadEventForTheme(eventRouteId: string | null): Promise<ThemedEvent | null> {
  if (!eventRouteId) return null;
  try {
    const event = await fetchQuery(api.events.getByRouteId, {
      eventRouteId,
    });
    if (!event) return null;
    return mapEventToThemedEvent(event);
  } catch (error) {
    console.error("Failed to load event for sign-in theme", error);
    return null;
  }
}

async function resolveEventForTheme(
  eventIdFromRedirect: string | null,
): Promise<ThemedEvent | null> {
  return loadEventForTheme(eventIdFromRedirect);
}

async function resolveIconUrl(event: ThemedEvent | null): Promise<string | null> {
  if (!event?.customIconStorageId) return null;
  try {
    const response = await fetchQuery(api.files.getUrl, {
      storageId: event.customIconStorageId,
    });
    return response?.url ?? null;
  } catch (error) {
    console.error("Failed to load event icon for sign-in theme", error);
    return null;
  }
}

export default async function Page({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const redirectParam = ensureString(resolvedSearchParams.redirect_url);
  const redirectUrl = resolveSafeRedirectUrl(
    redirectParam,
    siteConfiguration.auth.signInRedirectPath,
    getClientSiteRedirectOrigins(),
  );
  const authObject = await auth();
  if (authObject.userId) {
    redirect(redirectUrl);
  }
  const eventId = extractEventIdFromRedirect(redirectUrl);
  const themedEvent = await resolveEventForTheme(eventId);
  const iconUrl = await resolveIconUrl(themedEvent);

  return (
    <EventThemeProvider
      event={themedEvent ?? null}
      iconUrl={iconUrl}
      brandingSourceId={themedEvent ? `event:${themedEvent._id}` : null}
    >
      <SignInClient
        redirectUrl={redirectUrl}
        eventThemeBackgroundColor={themedEvent?.themeBackgroundColor ?? null}
        eventThemeTextColor={themedEvent?.themeTextColor ?? null}
      />
    </EventThemeProvider>
  );
}

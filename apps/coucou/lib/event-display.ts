import type { Event } from "./types";
export {
  resolveEventMessagingBrandName,
  type EventMessagingBrandSource,
  type ResolveEventMessagingBrandNameOptions,
} from "@coucou/sdk/shared/event-branding";

type EventTitleSource = Pick<Event, "name" | "secondaryTitle"> | null | undefined;

export interface FormatEventDisplayNameOptions {
  separator?: string;
  fallback?: string;
}

export interface FormatEventTitleInlineOptions extends FormatEventDisplayNameOptions {}

export function formatEventDisplayName(
  event: EventTitleSource,
  { separator = " — ", fallback = "Untitled Event" }: FormatEventDisplayNameOptions = {},
): string {
  const name = event?.name?.trim();
  const secondaryTitle = event?.secondaryTitle?.trim();
  if (!name && !secondaryTitle) {
    return fallback;
  }
  if (!name) {
    return secondaryTitle ?? fallback;
  }
  if (!secondaryTitle) {
    return name;
  }
  return `${name}${separator}${secondaryTitle}`;
}

export function hasEventSecondaryTitle(event: EventTitleSource): boolean {
  return Boolean(event?.secondaryTitle && event.secondaryTitle.trim().length > 0);
}

export function formatEventTitleInline(
  event: EventTitleSource,
  { separator = ": ", fallback = "Untitled Event" }: FormatEventTitleInlineOptions = {},
): string {
  const name = event?.name?.trim();
  const secondaryTitle = event?.secondaryTitle?.trim();
  if (!name && !secondaryTitle) {
    return fallback;
  }
  if (!secondaryTitle) {
    return name ?? fallback;
  }
  if (!name) {
    return secondaryTitle;
  }
  return `${name}${separator}${secondaryTitle}`;
}

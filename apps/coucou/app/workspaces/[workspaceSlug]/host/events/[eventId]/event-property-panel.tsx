"use client";

import { api } from "@convex/_generated/api";
import { resolveEventEndTimestamp } from "@convex/lib/eventTiming";
import { useMutation, useQuery } from "convex/react";
import {
  Calendar,
  CheckCircle,
  Clock3,
  Copy,
  ExternalLink,
  Globe,
  MapPin,
  Mic2,
  Palette,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DateTimePicker } from "@/components/date-time-picker";
import { InlineEditableText } from "@/components/inline-editable-text";
import { PropertyRow, PropertySection, PropertyValue } from "@/components/property-panel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createTimestamp,
  extractDateFromTimestamp,
  extractTimeFromTimestamp,
} from "@/lib/date-utils";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import type { Event } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { formatEventDateTime } from "@/lib/utils";
import { useEventEditContext } from "./event-edit-context";

interface EventPropertyPanelProps {
  event: Event;
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="size-5 rounded border border-[var(--border-subtle)]"
        style={{ backgroundColor: color }}
        aria-label={label}
      />
      <span className="text-xs text-[var(--text-secondary)]">{label}</span>
    </div>
  );
}

export function EventPropertyPanel({ event }: EventPropertyPanelProps) {
  const workspaceScope = useWorkspaceScope();
  const [copied, setCopied] = useState(false);
  const [isEditingEventDate, setIsEditingEventDate] = useState(false);
  const updateEvent = useMutation(api.events.update);
  const editContext = useEventEditContext();

  interface EventDetailsPatch {
    name?: string;
    secondaryTitle?: string;
    description?: string;
    hosts?: string[];
    location?: string;
  }

  const updateEventDetails = async (
    patch: EventDetailsPatch,
    unsetFields?: Array<"secondaryTitle">,
  ) => {
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update this event");
      return;
    }
    try {
      await updateEvent({
        eventId: event._id,
        ...workspaceScope.queryArgs,
        ...patch,
        ...(unsetFields && unsetFields.length > 0 ? { unsetFields } : {}),
      });
      toast.success("Event updated");
      if (editContext) {
        if (patch.name !== undefined) editContext.setFormValue("name", patch.name);
        if (patch.secondaryTitle !== undefined) {
          editContext.setFormValue("secondaryTitle", patch.secondaryTitle);
        }
        if (patch.description !== undefined) {
          editContext.setFormValue("description", patch.description);
        }
        if (patch.hosts !== undefined) {
          editContext.setFormValue("hosts", patch.hosts.join(", "));
        }
        if (patch.location !== undefined) editContext.setFormValue("location", patch.location);
        if (unsetFields?.includes("secondaryTitle")) {
          editContext.setFormValue("secondaryTitle", "");
        }
      }
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to update event");
    }
  };

  const defaultEventTimezone =
    event.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const eventDateInputValue = (() => {
    if (!event.eventDate) return "";
    try {
      return extractDateFromTimestamp(event.eventDate, defaultEventTimezone);
    } catch {
      return "";
    }
  })();
  const eventTimeInputValue = (() => {
    if (!event.eventDate) return "";
    try {
      return extractTimeFromTimestamp(event.eventDate, defaultEventTimezone);
    } catch {
      return "";
    }
  })();

  const updateEventDateTime = async (nextDate: string, nextTime: string) => {
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update this event");
      return;
    }
    if (!nextDate || !event.eventDate) {
      return;
    }
    const resolvedTime = nextTime || eventTimeInputValue || "19:00";
    const computedStartTimestamp = createTimestamp(nextDate, resolvedTime, defaultEventTimezone);
    if (!Number.isFinite(computedStartTimestamp) || computedStartTimestamp === event.eventDate) {
      return;
    }
    const datePatch: { eventDate: number; eventEndDate?: number } = {
      eventDate: computedStartTimestamp,
    };
    if (event.eventEndDate) {
      // Shift the automatic close by the same delta so it never ends up before the start.
      datePatch.eventEndDate = event.eventEndDate + (computedStartTimestamp - event.eventDate);
    }
    try {
      await updateEvent({
        eventId: event._id,
        ...workspaceScope.queryArgs,
        ...datePatch,
      });
      toast.success("Event updated");
      if (editContext) {
        editContext.setFormValue("eventDate", nextDate);
        editContext.setFormValue("eventTime", resolvedTime);
      }
    } catch (error: unknown) {
      toast.error((error as Error).message || "Failed to update event");
    }
  };

  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );

  const lifecycle = event.lifecycle ?? "published";
  const isDraft = lifecycle === "draft";

  const now = Date.now();
  const endTimestamp =
    resolveEventEndTimestamp({ eventDate: event.eventDate, eventEndDate: event.eventEndDate }) ?? 0;
  const isPast = !isDraft && endTimestamp > 0 && endTimestamp < now;
  const statusVariant = isDraft ? "draft" : isPast ? "past" : "published";

  const publicEventUrl = buildPublicEventUrl(
    workspace ? { ...workspace, primaryDomain: workspace.primaryDomain ?? undefined } : null,
    event,
    {
      currentOrigin: typeof window !== "undefined" ? window.location.origin : null,
      vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
    },
  );

  const hostList = (event.hosts || []).filter(Boolean).join(", ") || "No hosts listed";

  const handleCopyUrl = async () => {
    if (!publicEventUrl) return;
    try {
      await navigator.clipboard.writeText(publicEventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied event URL to clipboard");
    } catch {
      toast.error("Failed to copy URL");
    }
  };

  return (
    <>
      <PropertySection title="Overview">
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              <InlineEditableText
                value={event.name}
                placeholder="Event name"
                validate={(value) => (value.length > 0 ? null : "Event name is required")}
                onChange={(value) => updateEventDetails({ name: value })}
                className="text-sm font-medium text-[var(--text-primary)]"
              />
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              <InlineEditableText
                value={event.secondaryTitle ?? ""}
                placeholder="No secondary title"
                onChange={(value) => {
                  if (value.length === 0) {
                    return updateEventDetails({}, ["secondaryTitle"]);
                  }
                  return updateEventDetails({ secondaryTitle: value });
                }}
              />
            </p>
          </div>

          <PropertyRow icon={<Calendar className="h-3.5 w-3.5" />} label="Date">
            {isEditingEventDate && event.eventDate ? (
              <div className="space-y-2">
                <DateTimePicker
                  date={eventDateInputValue || undefined}
                  time={eventTimeInputValue || undefined}
                  onDateChange={(nextDate) => {
                    void updateEventDateTime(nextDate, eventTimeInputValue);
                  }}
                  onTimeChange={(nextTime) => {
                    void updateEventDateTime(eventDateInputValue, nextTime);
                  }}
                  className="gap-2"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[var(--border-subtle)] bg-transparent"
                    onClick={() => setIsEditingEventDate(false)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onDoubleClick={() => {
                  if (event.eventDate) {
                    setIsEditingEventDate(true);
                  }
                }}
                className="group block w-full text-left"
                title="Double-click to edit"
                aria-label="Double-click to edit event date"
              >
                <span className="border-b border-dashed border-[var(--border-subtle)] pb-0.5 transition-colors group-hover:border-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                  <PropertyValue>
                    {event.eventDate
                      ? formatEventDateTime(event.eventDate, event.eventTimezone)
                      : "Not set"}
                  </PropertyValue>
                </span>
              </button>
            )}
          </PropertyRow>

          <PropertyRow icon={<MapPin className="h-3.5 w-3.5" />} label="Location">
            <InlineEditableText
              value={event.location || ""}
              placeholder="Not set"
              onChange={(value) => updateEventDetails({ location: value })}
            />
          </PropertyRow>

          <PropertyRow icon={<Users className="h-3.5 w-3.5" />} label="Hosts">
            <InlineEditableText
              value={hostList === "No hosts listed" ? "" : hostList}
              placeholder="No hosts listed"
              onChange={(value) => {
                const hostArray = value
                  .split(",")
                  .map((host) => host.trim())
                  .filter(Boolean);
                return updateEventDetails({ hosts: hostArray });
              }}
            />
          </PropertyRow>

          <PropertyRow label="Description">
            <InlineEditableText
              value={event.description ?? ""}
              placeholder="No description"
              multiline
              onChange={(value) => updateEventDetails({ description: value })}
              className="text-[var(--text-secondary)]"
            />
          </PropertyRow>

          <PropertyRow icon={<Clock3 className="h-3.5 w-3.5" />} label="Record history">
            <div className="space-y-1 text-xs tabular-nums">
              <div className="flex justify-between gap-3 text-[var(--text-secondary)]">
                <span>Created</span>
                <time dateTime={new Date(event.createdAt).toISOString()}>
                  {new Date(event.createdAt).toLocaleString()}
                </time>
              </div>
              <div className="flex justify-between gap-3 text-[var(--text-secondary)]">
                <span>Updated</span>
                <time dateTime={new Date(event.updatedAt).toISOString()}>
                  {new Date(event.updatedAt).toLocaleString()}
                </time>
              </div>
              {event.publishedAt ? (
                <div className="flex justify-between gap-3 text-[var(--text-secondary)]">
                  <span>Published</span>
                  <time dateTime={new Date(event.publishedAt).toISOString()}>
                    {new Date(event.publishedAt).toLocaleString()}
                  </time>
                </div>
              ) : null}
            </div>
          </PropertyRow>
        </div>
      </PropertySection>

      <PropertySection title="Status">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={statusVariant} />
          {event.isFeatured ? <StatusBadge variant="issued" label="Featured" /> : null}
        </div>
      </PropertySection>

      <PropertySection title="Branding">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <ColorSwatch color={event.themeBackgroundColor || "#000000"} label="Background" />
            <ColorSwatch color={event.themeTextColor || "#ffffff"} label="Text" />
            <ColorSwatch
              color={event.themeAccentColor || event.themeTextColor || "#ffffff"}
              label="Accent"
            />
            <ColorSwatch color={event.qrCodeColor || "#000000"} label="QR" />
          </div>

          {event.acts && event.acts.length > 0 ? (
            <PropertyRow icon={<Mic2 className="h-3.5 w-3.5" />} label="Lineup">
              <PropertyValue>
                {event.acts.length} act{event.acts.length === 1 ? "" : "s"}
              </PropertyValue>
            </PropertyRow>
          ) : null}

          {event.eventPartners && event.eventPartners.length > 0 ? (
            <PropertyRow icon={<Palette className="h-3.5 w-3.5" />} label="Event partners">
              <PropertyValue>
                {event.eventPartners.length} partner{event.eventPartners.length === 1 ? "" : "s"}
              </PropertyValue>
            </PropertyRow>
          ) : null}

          {event.sponsors && event.sponsors.length > 0 ? (
            <PropertyRow icon={<Palette className="h-3.5 w-3.5" />} label="Sponsors">
              <PropertyValue>
                {event.sponsors.length} sponsor{event.sponsors.length === 1 ? "" : "s"}
              </PropertyValue>
            </PropertyRow>
          ) : null}

          {event.guestPortalLinkLabel ? (
            <PropertyRow icon={<Palette className="h-3.5 w-3.5" />} label="Guest page link">
              <PropertyValue>{event.guestPortalLinkLabel}</PropertyValue>
            </PropertyRow>
          ) : null}
        </div>
      </PropertySection>

      <PropertySection title="Sharing">
        <PropertyRow icon={<Globe className="h-3.5 w-3.5" />} label="Public page">
          {publicEventUrl ? (
            <div className="space-y-2">
              <PropertyValue className="break-all">{publicEventUrl}</PropertyValue>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-[var(--border-subtle)] bg-transparent"
                  onClick={handleCopyUrl}
                >
                  {copied ? (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  {copied ? "Copied" : "Copy URL"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  asChild
                  className="border-[var(--border-subtle)] bg-transparent"
                >
                  <a href={publicEventUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <PropertyValue muted>
              Public URL is not available for this workspace or event status.
            </PropertyValue>
          )}
        </PropertyRow>
      </PropertySection>
    </>
  );
}

export default EventPropertyPanel;

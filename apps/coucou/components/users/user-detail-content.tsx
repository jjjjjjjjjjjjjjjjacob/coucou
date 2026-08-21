"use client";

import { api } from "@convex/_generated/api";
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import { ArrowLeft, Mail, Phone, User, X } from "lucide-react";
import Link from "next/link";
import React from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { GuestAnnotationsFields } from "@/components/guests/guest-annotations-fields";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageCard } from "@/components/ui/page-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserTextHistory } from "@/components/users/user-text-history";
import type {
  GuestDirectoryFacets,
  GuestProfileLookupResult,
  OrganizationUserDetail,
  UserRsvpHistoryEntry,
  UserSmsThreadHistoryEntry,
} from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn, formatEventDateTime } from "@/lib/utils";

function getRoleLabel(role: string): string {
  const normalized = role?.replace(/^org:/, "").toLowerCase() || role;
  switch (normalized) {
    case "admin":
      return "Admin";
    case "host":
      return "Host";
    case "door":
      return "Door";
    case "member":
      return "Member";
    default:
      return "Guest";
  }
}

function getRoleBadgeVariant(role: string): "approved" | "pending" | "default" | "issued" {
  const normalized = role?.replace(/^org:/, "").toLowerCase() || role;
  switch (normalized) {
    case "admin":
    case "host":
      return "approved";
    case "door":
      return "issued";
    case "member":
      return "default";
    default:
      return "default";
  }
}

function getTicketStatusVariant(
  ticketStatus: string,
): "approved" | "issued" | "redeemed" | "disabled" | "default" {
  switch (ticketStatus) {
    case "issued":
      return "issued";
    case "redeemed":
      return "redeemed";
    case "disabled":
      return "disabled";
    default:
      return "default";
  }
}

export function UserDetailSkeleton() {
  return (
    <div className="flex-1 space-y-5">
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--surface-3)]" />
      <div className="h-4 w-64 animate-pulse rounded bg-[var(--surface-3)]" />
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-[var(--surface-3)]" />
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-[var(--surface-3)]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-3)]" />
        </div>
      </div>
      <div className="h-96 animate-pulse rounded-lg bg-[var(--surface-3)]" />
    </div>
  );
}

function UserProfileCard({ user }: { user: OrganizationUserDetail }) {
  return (
    <PageCard title="Saved info" description="Contact details and account metadata">
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <User className="h-4 w-4" />
            <span>Name</span>
          </div>
          <span className="font-medium text-[var(--text-primary)]">
            {`${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Phone className="h-4 w-4" />
            <span>Phone</span>
          </div>
          <span className="font-medium text-[var(--text-primary)]">{user.phone || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Mail className="h-4 w-4" />
            <span>Clerk ID</span>
          </div>
          <span className="font-mono text-xs text-[var(--text-primary)]">
            {user.clerkUserId || "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3">
          <span className="text-[var(--text-secondary)]">Joined</span>
          <span className="text-[var(--text-primary)]">
            {new Date(user.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--text-secondary)]">Referral code</span>
          <span className="font-mono text-xs text-[var(--text-primary)]">
            {user.referralCode || "—"}
          </span>
        </div>
      </div>
    </PageCard>
  );
}

function GuestAnnotationsCard({
  userReference,
  listKeyOptions,
  tagSuggestions,
}: {
  userReference: string;
  listKeyOptions: string[];
  tagSuggestions: string[];
}) {
  const workspaceScope = useWorkspaceScope();

  const profileLookup = useQuery(
    api.guestDirectory.getGuestProfileByUserReference,
    workspaceScope ? { userReference, ...workspaceScope.queryArgs } : "skip",
  ) as GuestProfileLookupResult | undefined;

  const upsertGuestProfile = useMutation({
    mutationFn: useConvexMutation(api.guestDirectory.upsertGuestProfile),
  });

  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [defaultListKey, setDefaultListKey] = React.useState("");
  const [hasHydratedProfile, setHasHydratedProfile] = React.useState(false);

  React.useEffect(() => {
    setHasHydratedProfile(false);
  }, [userReference]);

  React.useEffect(() => {
    if (profileLookup === undefined || hasHydratedProfile) {
      return;
    }
    setTags(profileLookup.profile?.tags ?? []);
    setTagInput("");
    setNotes(profileLookup.profile?.notes ?? "");
    setDefaultListKey(profileLookup.profile?.defaultListKey ?? "");
    setHasHydratedProfile(true);
  }, [profileLookup, hasHydratedProfile]);

  const canSaveProfile =
    profileLookup !== undefined &&
    (profileLookup.personKey.clerkUserId !== undefined ||
      profileLookup.personKey.guestPhoneHash !== undefined);

  const handleSave = async () => {
    if (!workspaceScope || !profileLookup || !canSaveProfile) return;
    try {
      await upsertGuestProfile.mutateAsync({
        personKey: profileLookup.personKey,
        tags,
        notes,
        defaultListKey,
        ...workspaceScope.queryArgs,
      });
      toast.success("Guest profile saved");
    } catch (error) {
      toast.error(`Failed to save guest profile: ${(error as Error).message}`);
    }
  };

  return (
    <PageCard title="Tags & notes" description="Organizer-only annotations for this guest">
      {profileLookup === undefined ? (
        <div className="h-48 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      ) : (
        <div className="space-y-4">
          <GuestAnnotationsFields
            tags={tags}
            onTagsChange={setTags}
            tagInput={tagInput}
            onTagInputChange={setTagInput}
            notes={notes}
            onNotesChange={setNotes}
            defaultListKey={defaultListKey}
            onDefaultListKeyChange={setDefaultListKey}
            listKeyOptions={listKeyOptions}
            tagSuggestions={tagSuggestions}
            idPrefix="user-detail-annotations"
          />
          <Button onClick={handleSave} disabled={!canSaveProfile || upsertGuestProfile.isPending}>
            {upsertGuestProfile.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </PageCard>
  );
}

function RsvpHistoryList({ rsvps }: { rsvps: UserRsvpHistoryEntry[] }) {
  if (rsvps.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No RSVPs found.</p>;
  }

  return (
    <div className="space-y-2">
      {rsvps.map((rsvp) => (
        <div
          key={rsvp.id}
          className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="font-medium text-[var(--text-primary)]">{rsvp.eventName}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {formatEventDateTime(rsvp.eventDate)}
            </div>
            {rsvp.invitedByName ? (
              <div className="text-xs text-[var(--text-tertiary)]">
                Invited by {rsvp.invitedByName}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              variant={rsvp.approvalStatus}
              label={rsvp.approvalStatus.charAt(0).toUpperCase() + rsvp.approvalStatus.slice(1)}
              showDot={false}
            />
            <StatusBadge
              variant={getTicketStatusVariant(rsvp.ticketStatus)}
              label={rsvp.ticketStatus}
              showDot={false}
            />
            <span className="text-xs text-[var(--text-tertiary)]">
              {rsvp.attendees} attendee{rsvp.attendees === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventHistoryList({ rsvps }: { rsvps: UserRsvpHistoryEntry[] }) {
  if (rsvps.length === 0) {
    return <p className="text-sm text-[var(--text-secondary)]">No events found.</p>;
  }

  return (
    <div className="space-y-2">
      {rsvps.map((rsvp) => (
        <div
          key={rsvp.id}
          className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="font-medium text-[var(--text-primary)]">{rsvp.eventName}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {formatEventDateTime(rsvp.eventDate)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-[var(--surface-3)] px-2 py-1 text-xs font-medium text-[var(--text-primary)]">
              {rsvp.listKey.toUpperCase()}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">RSVP {rsvp.approvalStatus}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function InviterHistoryCard({
  rsvps,
  storedInvitedByNames,
}: {
  rsvps: UserRsvpHistoryEntry[];
  storedInvitedByNames: string[];
}) {
  const invitedByNames = Array.from(
    new Map(
      [
        ...storedInvitedByNames,
        ...rsvps
          .map((rsvp) => rsvp.invitedByName)
          .filter((value): value is string => Boolean(value)),
      ]
        .map((invitedByName) => invitedByName.trim())
        .filter(Boolean)
        .map((invitedByName) => [invitedByName.toLocaleLowerCase(), invitedByName]),
    ).values(),
  ).filter((invitedByName): invitedByName is string => Boolean(invitedByName));

  return (
    <PageCard title="Invited by" description="Every distinct inviter across this contact’s RSVPs">
      {invitedByNames.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {invitedByNames.map((invitedByName) => (
            <span
              key={invitedByName.toLocaleLowerCase()}
              className="rounded-full bg-[var(--surface-3)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
            >
              {invitedByName}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">No inviter history.</p>
      )}
    </PageCard>
  );
}

export interface UserDetailContentProps {
  /** Already-decoded user reference: a users id or "rsvp~<rsvpId>". */
  userReference: string;
  variant: "page" | "panel";
  backHref?: string;
  backLabel?: string;
  onClose?: () => void;
}

/**
 * The person abstraction: identity, organizer annotations, and RSVP/event/
 * text history. Renders as a standalone page or as a compact details panel.
 */
export function UserDetailContent({
  userReference,
  variant,
  backHref,
  backLabel,
  onClose,
}: UserDetailContentProps) {
  const workspaceScope = useWorkspaceScope();
  const isPanelVariant = variant === "panel";

  const facets = useQuery(
    api.guestDirectory.getGuestDirectoryFacets,
    workspaceScope ? { ...workspaceScope.queryArgs } : "skip",
  ) as GuestDirectoryFacets | undefined;
  const listKeyOptions = facets?.workspaceListKeys ?? [];
  const tagSuggestions = facets?.tags ?? [];

  const user = useQuery(
    api.users.getOrganizationUserByReference,
    workspaceScope ? { userReference, ...workspaceScope.queryArgs } : "skip",
  ) as OrganizationUserDetail | undefined;

  const rsvps = useQuery(
    api.rsvps.listByClerkUser,
    user?.clerkUserId && workspaceScope
      ? { clerkUserId: user.clerkUserId, ...workspaceScope.queryArgs }
      : "skip",
  ) as UserRsvpHistoryEntry[] | undefined;

  const threads = useQuery(
    api.smsConversations.listThreadsByUserReference,
    workspaceScope ? { userReference, ...workspaceScope.queryArgs } : "skip",
  ) as UserSmsThreadHistoryEntry[] | undefined;

  if (!user) {
    return <UserDetailSkeleton />;
  }

  const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User";
  const initials = (user.firstName || "U").charAt(0).toUpperCase();

  return (
    <div className={cn("flex-1", isPanelVariant ? "space-y-4" : "space-y-5")}>
      {isPanelVariant ? (
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.imageUrl} />
              <AvatarFallback className="bg-[var(--surface-3)] font-medium text-[var(--text-primary)]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
                {displayName}
              </h2>
              <div className="mt-0.5 flex items-center gap-2">
                <StatusBadge
                  variant={getRoleBadgeVariant(user.role)}
                  label={getRoleLabel(user.role)}
                  showDot={false}
                />
                <span className="text-xs text-[var(--text-tertiary)]">
                  {user.hasOrganizationMembership ? "Organization member" : "Guest"}
                </span>
              </div>
            </div>
          </div>
          {onClose ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close guest details"
              className="shrink-0 text-[var(--text-secondary)]"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          {backHref ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="border-[var(--border-subtle)]">
                <Link href={backHref}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {backLabel ?? "Back"}
                </Link>
              </Button>
            </div>
          ) : null}

          <DashboardTitleBar
            title={displayName}
            subtitle="Guest profile, RSVP history, and text history"
            breadcrumb={[{ label: "Workspace" }]}
          />

          <div className="flex items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.imageUrl} />
              <AvatarFallback className="bg-[var(--surface-3)] text-lg font-medium text-[var(--text-primary)]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">{displayName}</h2>
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {user.clerkUserId || "No Clerk ID"}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <StatusBadge
                  variant={getRoleBadgeVariant(user.role)}
                  label={getRoleLabel(user.role)}
                  showDot={false}
                />
                {user.hasOrganizationMembership ? (
                  <span className="text-xs text-[var(--text-tertiary)]">Organization member</span>
                ) : (
                  <span className="text-xs text-[var(--text-tertiary)]">Guest</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <Tabs defaultValue="profile">
        <TabsList variant="line" className="border-b border-[var(--border-subtle)]">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="rsvps">
            RSVPs
            {rsvps ? (
              <span className="ml-1 text-xs text-[var(--text-tertiary)]">({rsvps.length})</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="events">
            Events
            {rsvps ? (
              <span className="ml-1 text-xs text-[var(--text-tertiary)]">({rsvps.length})</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="texts">
            Texts
            {threads ? (
              <span className="ml-1 text-xs text-[var(--text-tertiary)]">({threads.length})</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 pt-4">
          <GuestAnnotationsCard
            userReference={userReference}
            listKeyOptions={listKeyOptions}
            tagSuggestions={tagSuggestions}
          />
          <InviterHistoryCard rsvps={rsvps ?? []} storedInvitedByNames={user.invitedByNames} />
          <UserProfileCard user={user} />
        </TabsContent>

        <TabsContent value="rsvps" className="pt-4">
          <PageCard title="RSVP history" description="All RSVPs submitted by this user">
            <RsvpHistoryList rsvps={rsvps ?? []} />
          </PageCard>
        </TabsContent>

        <TabsContent value="events" className="pt-4">
          <PageCard title="Event history" description="Events this user has RSVPed to">
            <EventHistoryList rsvps={rsvps ?? []} />
          </PageCard>
        </TabsContent>

        <TabsContent value="texts" className="pt-4">
          <PageCard title="Text history" description="SMS conversations involving this user">
            <UserTextHistory threads={threads} />
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

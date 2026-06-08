"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Instagram,
  Save,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { toast } from "sonner";
import {
  type ApprovalStatusOption,
  getApprovalStatusClassName,
  getApprovalStatusLabel,
  getAttendanceStatusLabel,
  getHostRsvpCustomFieldValue,
  getHostRsvpGuestDisplayValue,
  getTicketStatusLabel,
  getTimestampDateTimeLabels,
  normalizeTicketStatus,
  RsvpApprovalStatusControl,
  RsvpListKeyControl,
} from "@/components/rsvps/rsvp-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import {
  getRsvpReviewFeedDiffs,
  getRsvpReviewFeedInstagramProfile,
  getRsvpReviewFeedSelectedIds,
  type RsvpReviewFeedComparableState,
  type RsvpReviewFeedDraftState,
} from "@/lib/rsvp-review-feed";
import type { Event, HostRsvp, ListCredential } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

interface BulkUpdateResult {
  success: number;
  failed: number;
  errors: string[];
}

function getInitialDraftState(rsvp: HostRsvp): RsvpReviewFeedDraftState {
  return {
    approvalStatus: rsvp.approvalStatus,
    listKey: rsvp.listKey,
  };
}

function getBaselineState(
  rsvp: HostRsvp,
  baselineStatesByRsvpId: Record<string, RsvpReviewFeedDraftState | undefined>,
): RsvpReviewFeedComparableState {
  return {
    rsvpId: rsvp.id,
    ...(baselineStatesByRsvpId[rsvp.id] ?? getInitialDraftState(rsvp)),
  };
}

function getDisplayRsvp(
  rsvp: HostRsvp,
  draftStatesByRsvpId: Record<string, RsvpReviewFeedDraftState | undefined>,
): HostRsvp {
  const draftState = draftStatesByRsvpId[rsvp.id];
  if (!draftState) {
    return rsvp;
  }

  return {
    ...rsvp,
    approvalStatus: draftState.approvalStatus,
    listKey: draftState.listKey,
  };
}

function ReviewMetadataItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-border/70 pt-2">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 min-w-0 truncate text-sm">{value}</div>
    </div>
  );
}

function ReviewEmptyState({
  title,
  description,
  backPath,
}: {
  title: string;
  description: string;
  backPath: string;
}) {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col justify-center gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="outline" className="w-fit" onClick={() => router.push(backPath)}>
        <ArrowLeft className="h-4 w-4" />
        Back to RSVPs
      </Button>
    </div>
  );
}

export default function RsvpReviewFeedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const workspaceAccess = useWorkspaceAccess();
  const isReadOnly = workspaceAccess?.canWrite === false;
  const eventId = searchParams.get("eventId");
  const selectedRsvpIds = React.useMemo(
    () => getRsvpReviewFeedSelectedIds(searchParams),
    [searchParams],
  );
  const backPath = useWorkspaceOperationPath(
    "host",
    eventId ? `rsvps?eventId=${encodeURIComponent(eventId)}` : "rsvps",
  );

  const currentEvent = useQuery(
    api.events.get,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as Event | null | undefined;
  const listCredentials = useQuery(
    api.credentials.getCredsForEvent,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as ListCredential[] | undefined;
  const selectedRsvps = useQuery(
    api.rsvps.listReviewFeedForEvent,
    eventId && workspaceScope && selectedRsvpIds.length > 0
      ? {
          eventId: eventId as Id<"events">,
          rsvpIds: selectedRsvpIds as Id<"rsvps">[],
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as HostRsvp[] | undefined;

  const bulkUpdateListKeyMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateListKey),
  });
  const bulkUpdateApprovalMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateApproval),
  });

  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [baselineStatesByRsvpId, setBaselineStatesByRsvpId] = React.useState<
    Record<string, RsvpReviewFeedDraftState | undefined>
  >({});
  const [draftStatesByRsvpId, setDraftStatesByRsvpId] = React.useState<
    Record<string, RsvpReviewFeedDraftState | undefined>
  >({});

  React.useEffect(() => {
    if (!selectedRsvps) {
      return;
    }

    setBaselineStatesByRsvpId((previousBaselineStatesByRsvpId) => {
      const nextBaselineStatesByRsvpId: Record<string, RsvpReviewFeedDraftState | undefined> = {};
      for (const rsvp of selectedRsvps) {
        nextBaselineStatesByRsvpId[rsvp.id] =
          previousBaselineStatesByRsvpId[rsvp.id] ?? getInitialDraftState(rsvp);
      }
      return nextBaselineStatesByRsvpId;
    });

    setDraftStatesByRsvpId((previousDraftStatesByRsvpId) => {
      const nextDraftStatesByRsvpId: Record<string, RsvpReviewFeedDraftState | undefined> = {};
      for (const rsvp of selectedRsvps) {
        nextDraftStatesByRsvpId[rsvp.id] =
          previousDraftStatesByRsvpId[rsvp.id] ?? getInitialDraftState(rsvp);
      }
      return nextDraftStatesByRsvpId;
    });
  }, [selectedRsvps]);

  React.useEffect(() => {
    if (!selectedRsvps || selectedRsvps.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((previousCurrentIndex) =>
      Math.min(previousCurrentIndex, selectedRsvps.length - 1),
    );
  }, [selectedRsvps]);

  const displayRsvps = React.useMemo(
    () => (selectedRsvps ?? []).map((rsvp) => getDisplayRsvp(rsvp, draftStatesByRsvpId)),
    [draftStatesByRsvpId, selectedRsvps],
  );
  const baselineStates = React.useMemo(
    () => (selectedRsvps ?? []).map((rsvp) => getBaselineState(rsvp, baselineStatesByRsvpId)),
    [baselineStatesByRsvpId, selectedRsvps],
  );
  const reviewFeedDiffs = React.useMemo(
    () => getRsvpReviewFeedDiffs(baselineStates, draftStatesByRsvpId),
    [baselineStates, draftStatesByRsvpId],
  );
  const unsavedChangeCount =
    reviewFeedDiffs.listUpdates.length + reviewFeedDiffs.approvalUpdates.length;
  const currentRsvp = displayRsvps[currentIndex] ?? null;
  const currentOriginalRsvp = selectedRsvps?.[currentIndex] ?? null;
  const currentInstagramProfile = currentRsvp
    ? getRsvpReviewFeedInstagramProfile(currentRsvp, currentEvent)
    : null;
  const isLoading =
    selectedRsvpIds.length > 0 &&
    (selectedRsvps === undefined || currentEvent === undefined || listCredentials === undefined);
  const saveIsPending = bulkUpdateListKeyMutation.isPending || bulkUpdateApprovalMutation.isPending;

  const setDraftState = React.useCallback(
    (rsvp: HostRsvp, nextDraftState: Partial<RsvpReviewFeedDraftState>) => {
      setDraftStatesByRsvpId((previousDraftStatesByRsvpId) => {
        const previousDraftState =
          previousDraftStatesByRsvpId[rsvp.id] ?? getInitialDraftState(rsvp);
        return {
          ...previousDraftStatesByRsvpId,
          [rsvp.id]: {
            ...previousDraftState,
            ...nextDraftState,
          },
        };
      });
    },
    [],
  );

  const handleDraftListKeyChange = React.useCallback(
    (rsvp: HostRsvp, newListKey: string) => {
      setDraftState(rsvp, { listKey: newListKey });
    },
    [setDraftState],
  );

  const handleDraftApprovalChange = React.useCallback(
    (rsvp: HostRsvp, approvalStatus: ApprovalStatusOption) => {
      setDraftState(rsvp, { approvalStatus });
    },
    [setDraftState],
  );

  const handleDecision = React.useCallback(
    (approvalStatus: ApprovalStatusOption) => {
      if (!currentRsvp) {
        return;
      }
      setDraftState(currentRsvp, { approvalStatus });
      setCurrentIndex((previousCurrentIndex) =>
        Math.min(previousCurrentIndex + 1, Math.max(displayRsvps.length - 1, 0)),
      );
    },
    [currentRsvp, displayRsvps.length, setDraftState],
  );

  const handleSave = React.useCallback(async () => {
    if (!workspaceScope || isReadOnly || unsavedChangeCount === 0) {
      return;
    }

    try {
      if (reviewFeedDiffs.listUpdates.length > 0) {
        const listUpdateResult = (await bulkUpdateListKeyMutation.mutateAsync({
          updates: reviewFeedDiffs.listUpdates.map((listUpdate) => ({
            rsvpId: listUpdate.rsvpId as Id<"rsvps">,
            listKey: listUpdate.listKey,
          })),
          ...workspaceScope.queryArgs,
        })) as BulkUpdateResult;

        if (listUpdateResult.failed > 0) {
          toast.warning(
            `Saved ${listUpdateResult.success} list changes. ${listUpdateResult.failed} failed.`,
          );
          return;
        }
      }

      if (reviewFeedDiffs.approvalUpdates.length > 0) {
        const approvalUpdateResult = (await bulkUpdateApprovalMutation.mutateAsync({
          updates: reviewFeedDiffs.approvalUpdates.map((approvalUpdate) => ({
            rsvpId: approvalUpdate.rsvpId as Id<"rsvps">,
            approvalStatus: approvalUpdate.approvalStatus,
          })),
          ...workspaceScope.queryArgs,
        })) as BulkUpdateResult;

        if (approvalUpdateResult.failed > 0) {
          toast.warning(
            `Saved ${approvalUpdateResult.success} approval changes. ${approvalUpdateResult.failed} failed.`,
          );
          return;
        }
      }

      setBaselineStatesByRsvpId((previousBaselineStatesByRsvpId) => {
        const nextBaselineStatesByRsvpId = { ...previousBaselineStatesByRsvpId };
        for (const baselineState of baselineStates) {
          const draftState = draftStatesByRsvpId[baselineState.rsvpId];
          if (draftState) {
            nextBaselineStatesByRsvpId[baselineState.rsvpId] = draftState;
          }
        }
        return nextBaselineStatesByRsvpId;
      });
      toast.success(`Saved ${unsavedChangeCount} RSVP changes`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to save review feed: ${errorMessage}`);
    }
  }, [
    baselineStates,
    bulkUpdateApprovalMutation,
    bulkUpdateListKeyMutation,
    draftStatesByRsvpId,
    isReadOnly,
    reviewFeedDiffs,
    unsavedChangeCount,
    workspaceScope,
  ]);

  if (!eventId || selectedRsvpIds.length === 0) {
    return (
      <ReviewEmptyState
        title="No RSVPs selected"
        description="Select RSVPs from the CRM before opening the review feed."
        backPath={backPath}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-primary">
        <Spinner />
      </div>
    );
  }

  if (!currentRsvp || !currentOriginalRsvp) {
    return (
      <ReviewEmptyState
        title="Selected RSVPs unavailable"
        description="The selected RSVPs may have been deleted or moved to another event."
        backPath={backPath}
      />
    );
  }

  const [createdDateLabel, createdTimeLabel] = getTimestampDateTimeLabels(currentRsvp.createdAt);
  const currentGuestName = getHostRsvpGuestDisplayValue(currentRsvp);
  const currentTicketStatus = normalizeTicketStatus(currentRsvp.redemptionStatus);
  const customFieldEntries =
    currentEvent?.customFields
      ?.map((customField) => ({
        key: customField.key,
        label: customField.label.replace(/:\s*$/, "").trim(),
        value: getHostRsvpCustomFieldValue(currentRsvp, customField.key),
      }))
      .filter((customFieldEntry) => customFieldEntry.value.trim().length > 0) ?? [];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-4xl flex-col gap-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backPath)}>
          <ArrowLeft className="h-4 w-4" />
          RSVPs
        </Button>
        <div className="text-sm text-muted-foreground">
          {currentIndex + 1} of {displayRsvps.length}
        </div>
      </div>

      <header className="rounded-lg border bg-background p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-3xl font-semibold tracking-tight">
                {currentGuestName}
              </h1>
              <Badge variant="secondary">{currentRsvp.listKey.toUpperCase()}</Badge>
              <Badge
                variant="secondary"
                className={cn("text-xs", getApprovalStatusClassName(currentRsvp.approvalStatus))}
              >
                {getApprovalStatusLabel(currentRsvp.approvalStatus)}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {currentEvent ? currentEvent.name : "RSVP review"} - {createdDateLabel}{" "}
              {createdTimeLabel}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous RSVP"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((previousCurrentIndex) => previousCurrentIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next RSVP"
              disabled={currentIndex >= displayRsvps.length - 1}
              onClick={() => setCurrentIndex((previousCurrentIndex) => previousCurrentIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReviewMetadataItem
            label="Attendance"
            value={getAttendanceStatusLabel(currentRsvp.attendanceStatus)}
          />
          <ReviewMetadataItem label="Attendees" value={currentRsvp.attendees ?? 1} />
          <ReviewMetadataItem label="Ticket" value={getTicketStatusLabel(currentTicketStatus)} />
          <ReviewMetadataItem
            label="SMS"
            value={currentRsvp.smsConsent === true ? "Consented" : "Not recorded"}
          />
          {currentRsvp.invitedByName && (
            <ReviewMetadataItem label="Invited By" value={currentRsvp.invitedByName} />
          )}
          {(currentRsvp.referredByName || currentRsvp.referralCode) && (
            <ReviewMetadataItem
              label="Referred By"
              value={currentRsvp.referredByName || currentRsvp.referralCode}
            />
          )}
          {currentRsvp.note && <ReviewMetadataItem label="Note" value={currentRsvp.note} />}
          {customFieldEntries.map((customFieldEntry) => (
            <ReviewMetadataItem
              key={customFieldEntry.key}
              label={customFieldEntry.label}
              value={customFieldEntry.value}
            />
          ))}
        </div>
      </header>

      <main className="min-h-[560px] overflow-hidden rounded-lg border bg-muted/20">
        {currentInstagramProfile ? (
          <div className="flex h-full min-h-[560px] flex-col">
            {currentInstagramProfile.embedUrl ? (
              <iframe
                key={currentInstagramProfile.embedUrl}
                title={`${currentGuestName} Instagram`}
                src={currentInstagramProfile.embedUrl}
                className="h-[70dvh] min-h-[520px] w-full flex-1 bg-background"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
              />
            ) : (
              <div className="flex min-h-[520px] flex-1 items-center justify-center bg-background p-6 text-center">
                <div className="flex max-w-sm flex-col items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted">
                    <Instagram className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">@{currentInstagramProfile.handle}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Open the profile directly in Instagram.
                    </p>
                  </div>
                  <Button asChild>
                    <a href={currentInstagramProfile.profileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open Instagram
                    </a>
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                @{currentInstagramProfile.handle}
              </span>
              <Button variant="outline" size="sm" asChild>
                <a href={currentInstagramProfile.profileUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open Instagram
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[560px] items-center justify-center p-6 text-center">
            <div>
              <h2 className="text-xl font-semibold">No Instagram</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                This RSVP does not include an Instagram profile.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="sticky bottom-4 z-20 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Approval</span>
            <RsvpApprovalStatusControl
              rsvp={currentRsvp}
              isReadOnly={isReadOnly}
              isUpdating={false}
              onChange={handleDraftApprovalChange}
              className="h-8 px-3 text-sm"
            />
            <span className="ml-2 text-sm font-medium">List</span>
            <RsvpListKeyControl
              rsvp={currentRsvp}
              isReadOnly={isReadOnly}
              listCredentials={listCredentials}
              isUpdating={false}
              onChange={handleDraftListKeyChange}
              className="h-8 px-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {unsavedChangeCount > 0 && (
              <span className="mr-auto text-sm text-muted-foreground lg:mr-2">
                {unsavedChangeCount} unsaved
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => handleDecision("denied")}
              disabled={isReadOnly}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDecision("approved")}
              disabled={isReadOnly}
              className="border-green-200 text-green-700 hover:bg-green-50 hover:text-green-700"
            >
              <Check className="h-4 w-4" />
              Approve
            </Button>
            <Button
              onClick={handleSave}
              disabled={isReadOnly || saveIsPending || unsavedChangeCount === 0}
              className="ml-auto"
            >
              {saveIsPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

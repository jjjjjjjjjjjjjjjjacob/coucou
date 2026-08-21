"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import {
  type CellContext,
  type ColumnDef,
  getCoreRowModel,
  type HeaderContext,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useAction, useMutation as useConvexReactMutation, useQuery } from "convex/react";
import {
  CheckCircle,
  Columns,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Link,
  MoreHorizontal,
  QrCode,
  Share,
  Trash2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import {
  APPROVAL_STATUS_OPTIONS,
  type ApprovalStatusOption,
  ATTENDANCE_STATUS_OPTIONS,
  type AttendanceStatusOption,
  formatTicketViewedTimestamp,
  getApprovalStatusLabel,
  getAttendanceStatusLabel,
  getHostRsvpCustomFieldValue,
  getHostRsvpGuestDisplayValue,
  getTicketStatusLabel,
  getTimestampDateTimeLabels,
  normalizeTicketStatus,
  RsvpApprovalStatusControl,
  RsvpAttendanceStatusControl,
  RsvpListKeyControl,
  RsvpTicketStatusControl,
  TICKET_STATUS_OPTIONS,
  type TicketStatusOption,
} from "@/components/rsvps/rsvp-controls";
import { RsvpExportDialog } from "@/components/rsvps/rsvp-export-dialog";
import { RsvpPagination } from "@/components/rsvps/rsvp-pagination";
import { type RsvpPendingChanges, RsvpTable } from "@/components/rsvps/rsvp-table";
import { RsvpToolbar } from "@/components/rsvps/rsvp-toolbar";
import { ShareEventPopover } from "@/components/share-event-popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import {
  areDashboardTableColumnIdsEqual,
  type DashboardTablePreference,
  getDefaultVisibleHostRsvpsTableColumnIds,
  HOST_RSVPS_TABLE_KEY,
  mergeDashboardTablePreferenceState,
  serializeDashboardTablePreferenceState,
  shouldHydrateDashboardTablePreferenceState,
  shouldResetHostRsvpsSavedTablePreference,
} from "@/lib/dashboard-table-preferences";
import { formatEventTitleInline } from "@/lib/event-display";
import {
  getEventLifecycleActionLabel,
  runEventLifecycleAction,
} from "@/lib/event-lifecycle-actions";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { buildRsvpReviewFeedSearchParams } from "@/lib/rsvp-review-feed";
import {
  getRsvpContextActionTargets,
  getRsvpSelectionRangeIds,
  getRsvpTableColumnSizing,
  getRsvpTableDisplayWidth,
  getRsvpTableFillerColumnWidth,
  hasStringAccessorKey,
  RSVP_SELECT_COLUMN_SIZING,
} from "@/lib/rsvp-table-layout";
import type { Event, HostRsvp, ListCredential } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn, ensureAbsoluteUrl, sanitizeFieldValue } from "@/lib/utils";

type PaginatedHostRsvpResult = {
  page: HostRsvp[];
  nextCursor: string | null;
  isDone: boolean;
};

type ApprovalFilterOption = "all" | ApprovalStatusOption;
type ExportableApprovalStatusOption = "pending" | "approved" | "denied";
type QrDeliveryFilterOption = "all" | "received" | "not-received";

const DEFAULT_EXPORT_STATUS_OPTIONS: ExportableApprovalStatusOption[] = ["approved"];

function stopRsvpTableInteractiveEventPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

interface RsvpTableContextValue {
  isReadOnly: boolean;
  listCredentials: ListCredential[] | undefined;
  loadingListUpdates: Set<string>;
  loadingApprovalUpdates: Set<string>;
  loadingAttendanceUpdates: Set<string>;
  loadingTicketUpdates: Set<string>;
  selectedRows: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  deleteRsvpCompleteIsPending: boolean;
  canEditTicketForRsvp: (rsvp: HostRsvp) => boolean;
  handleSingleListKeyChange: (rsvp: HostRsvp, newListKey: string) => void;
  handleSingleApprovalChange: (rsvp: HostRsvp, value: ApprovalStatusOption) => void;
  handleSingleAttendanceStatusChange: (rsvp: HostRsvp, value: AttendanceStatusOption) => void;
  handleSingleTicketStatusChange: (rsvp: HostRsvp, value: TicketStatusOption) => void;
  openRsvpQrCode: (rsvp: HostRsvp) => void;
  onDeleteRsvp: (rsvp: HostRsvp) => void;
  beginSelectionDrag: (rsvpId: string) => void;
  extendSelectionDrag: (rsvpId: string) => void;
  toggleSelectAllCurrent: () => void;
}

const RsvpTableContext = React.createContext<RsvpTableContextValue | null>(null);

export function useRsvpTableContext(): RsvpTableContextValue {
  const contextValue = React.useContext(RsvpTableContext);
  if (!contextValue) {
    throw new Error("useRsvpTableContext must be used within an RsvpTableContext.Provider");
  }
  return contextValue;
}

function RsvpListKeyCell({ row }: CellContext<HostRsvp, unknown>) {
  const { isReadOnly, listCredentials, loadingListUpdates, handleSingleListKeyChange } =
    useRsvpTableContext();
  const rsvp = row.original;

  return (
    <RsvpListKeyControl
      rsvp={rsvp}
      isReadOnly={isReadOnly}
      listCredentials={listCredentials}
      isUpdating={loadingListUpdates.has(rsvp.id)}
      onChange={handleSingleListKeyChange}
    />
  );
}

function RsvpApprovalStatusCell({ row }: CellContext<HostRsvp, unknown>) {
  const { isReadOnly, loadingApprovalUpdates, handleSingleApprovalChange } = useRsvpTableContext();
  const rsvp = row.original;

  return (
    <RsvpApprovalStatusControl
      rsvp={rsvp}
      isReadOnly={isReadOnly}
      isUpdating={loadingApprovalUpdates.has(rsvp.id)}
      onChange={handleSingleApprovalChange}
    />
  );
}

function RsvpAttendanceStatusCell({ row }: CellContext<HostRsvp, unknown>) {
  const { isReadOnly, loadingAttendanceUpdates, handleSingleAttendanceStatusChange } =
    useRsvpTableContext();
  const rsvp = row.original;

  return (
    <RsvpAttendanceStatusControl
      rsvp={rsvp}
      isReadOnly={isReadOnly}
      isUpdating={loadingAttendanceUpdates.has(rsvp.id)}
      onChange={handleSingleAttendanceStatusChange}
    />
  );
}

function RsvpTicketStatusCell({ row }: CellContext<HostRsvp, unknown>) {
  const {
    isReadOnly,
    loadingTicketUpdates,
    canEditTicketForRsvp,
    handleSingleTicketStatusChange,
    openRsvpQrCode,
  } = useRsvpTableContext();
  const rsvp = row.original;

  return (
    <RsvpTicketStatusControl
      rsvp={rsvp}
      isReadOnly={isReadOnly}
      isUpdating={loadingTicketUpdates.has(rsvp.id)}
      canEditTicketForRsvp={canEditTicketForRsvp}
      onChange={handleSingleTicketStatusChange}
      onOpenQrCode={openRsvpQrCode}
    />
  );
}

function RsvpActionsCell({ row }: CellContext<HostRsvp, unknown>) {
  const { deleteRsvpCompleteIsPending, onDeleteRsvp } = useRsvpTableContext();
  const rsvp = row.original;

  return (
    <div className="flex gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={deleteRsvpCompleteIsPending}
          >
            {deleteRsvpCompleteIsPending && <Spinner className="mr-1 h-3 w-3" />}
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete RSVP</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this RSVP? This will permanently remove the RSVP, any
              associated ticket/redemption codes, and approval history. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDeleteRsvp(rsvp)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete RSVP
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RsvpSelectHeaderCell(_context: HeaderContext<HostRsvp, unknown>) {
  const { allSelected, someSelected, toggleSelectAllCurrent } = useRsvpTableContext();
  const selectAllCheckboxLabel = allSelected
    ? "Clear selected RSVPs on this page"
    : "Select all RSVPs on this page";

  return (
    <div className="flex h-full w-full items-center pl-2">
      <Checkbox
        checked={allSelected || someSelected ? true : false}
        onCheckedChange={toggleSelectAllCurrent}
        aria-label={selectAllCheckboxLabel}
        title={selectAllCheckboxLabel}
        data-rsvp-table-interactive="true"
        onClick={stopRsvpTableInteractiveEventPropagation}
        onPointerDown={stopRsvpTableInteractiveEventPropagation}
        ref={(checkboxRootElement: HTMLButtonElement | null) => {
          if (checkboxRootElement) {
            const innerInputElement = checkboxRootElement.querySelector(
              'input[type="checkbox"]',
            ) as HTMLInputElement | null;
            if (innerInputElement) {
              innerInputElement.indeterminate = someSelected;
            }
          }
        }}
      />
    </div>
  );
}

function RsvpSelectCell({ row }: CellContext<HostRsvp, unknown>) {
  const { selectedRows, beginSelectionDrag, extendSelectionDrag } = useRsvpTableContext();
  const rsvp = row.original;
  const isSelected = selectedRows.has(rsvp.id);

  return (
    <div
      data-rsvp-table-interactive="true"
      className="flex h-full w-full items-center pl-2 select-none"
      onPointerDown={(pointerDownEvent) => {
        if (pointerDownEvent.button !== 0) {
          return;
        }
        pointerDownEvent.preventDefault();
        pointerDownEvent.stopPropagation();
        window.getSelection()?.removeAllRanges();
        beginSelectionDrag(rsvp.id);
      }}
      onPointerEnter={(pointerEnterEvent) => {
        if (pointerEnterEvent.buttons === 0) {
          return;
        }
        extendSelectionDrag(rsvp.id);
      }}
    >
      <Checkbox
        checked={isSelected}
        tabIndex={-1}
        aria-label="Select row"
        className="pointer-events-none"
        hapticFeedback={false}
      />
    </div>
  );
}

interface GuestManagerProps {
  initialEventId?: string;
  embedded?: boolean;
  lockEvent?: boolean;
}

export function GuestManager({
  initialEventId,
  embedded = false,
  lockEvent = false,
}: GuestManagerProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const workspaceAccess = useWorkspaceAccess();
  const isReadOnly = workspaceAccess?.canWrite === false;
  const rsvpsPath = useWorkspaceOperationPath("host", "rsvps");
  const eventsPath = useWorkspaceOperationPath("host", "events");
  const usersPath = useWorkspaceOperationPath("host", "users");
  const rsvpReviewFeedPath = useWorkspaceOperationPath("host", "rsvps/review");
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );

  // Use Convex queries
  const events = useQuery(api.events.listAll, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as Event[] | undefined;
  const eventsSorted = React.useMemo<Event[]>(
    () =>
      (events ?? [])
        .slice()
        .sort(
          (firstEvent, secondEvent) => (secondEvent.eventDate ?? 0) - (firstEvent.eventDate ?? 0),
        ),
    [events],
  );
  const initialId = initialEventId ?? searchParams.get("eventId") ?? eventsSorted[0]?._id;
  const [eventId, setEventId] = React.useState<string | undefined>(initialId);
  React.useEffect(() => {
    if (initialEventId && eventId !== initialEventId) {
      setEventId(initialEventId);
      return;
    }
    if (!eventId && eventsSorted[0]?._id) {
      setEventId(eventsSorted[0]._id);
    }
  }, [eventId, eventsSorted, initialEventId]);

  /*
  React.useEffect(() => {
    if (!eventId) return;
    const currentEventId = searchParams.get("eventId");
    if (currentEventId !== eventId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("eventId", eventId);
      router.replace(`${rsvpsPath}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  */

  // Cursor-based pagination state with history for Previous button
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = React.useState<(string | null)[]>([]);
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // Filter state - moved before useQuery to avoid uninitialized variable error
  const [guestSearch, setGuestSearch] = React.useState("");
  const debouncedGuest = useDebounce(guestSearch, 250);
  const [approvalFilter, setApprovalFilter] = React.useState<ApprovalFilterOption>("all");
  const [listFilter, setListFilter] = React.useState<string>("all");
  const [redemptionFilter, setRedemptionFilter] = React.useState<string>("all");
  const [qrDeliveryFilter, setQrDeliveryFilter] = React.useState<QrDeliveryFilterOption>("all");
  const [socialPlatformFilter, setSocialPlatformFilter] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<string>("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  // Reset cursor and history when filters change
  React.useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
    // Clear table sorting state when global sort changes
    setSorting([]);
  }, [
    debouncedGuest,
    approvalFilter,
    listFilter,
    redemptionFilter,
    qrDeliveryFilter,
    socialPlatformFilter,
    sortBy,
    sortOrder,
  ]);

  const rsvpsPaginated = useQuery(
    api.rsvps.listForEventPaginated,
    eventId && workspaceScope
      ? {
          eventId: eventId as Id<"events">,
          ...workspaceScope.queryArgs,
          ...(cursor && { cursor }),
          pageSize,
          guestSearch: debouncedGuest,
          approvalFilter,
          listFilter,
          redemptionFilter,
          qrDeliveryFilter,
          socialPlatformFilter,
          sortBy,
          sortOrder,
        }
      : "skip",
  ) as PaginatedHostRsvpResult | undefined;

  // Get total count using the aggregate-based count query
  const totalCount = useQuery(
    api.rsvps.countForEventFiltered,
    eventId && workspaceScope
      ? {
          eventId: eventId as Id<"events">,
          ...workspaceScope.queryArgs,
          guestSearch: debouncedGuest,
          approvalFilter,
          listFilter,
          redemptionFilter,
          qrDeliveryFilter,
          socialPlatformFilter,
        }
      : "skip",
  ) as number | undefined;

  // Extract the page data
  const rsvps = React.useMemo<HostRsvp[]>(() => rsvpsPaginated?.page ?? [], [rsvpsPaginated]);

  const currentEvent = useQuery(
    api.events.get,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as Event | null | undefined;
  const publicEventUrl = React.useMemo(() => {
    if (!currentEvent) {
      return null;
    }

    return buildPublicEventUrl(workspace ?? null, currentEvent, {
      currentOrigin: typeof window !== "undefined" ? window.location.origin : null,
      vercelEnvironment: process.env.NEXT_PUBLIC_VERCEL_ENV,
    });
  }, [currentEvent, workspace]);
  const canShareCurrentEvent = Boolean(
    currentEvent && (!workspaceScope || workspace !== undefined),
  );

  // Event lifecycle / management mutations + state mirrored from event-card-client.
  const publishCurrentEventMutation = useConvexReactMutation(api.events.publishEvent);
  const unpublishCurrentEventMutation = useConvexReactMutation(api.events.unpublishEvent);
  const setFeaturedEventMutation = useConvexReactMutation(api.events.setFeaturedEvent);
  const removeCurrentEventMutation = useConvexReactMutation(api.events.remove);
  const sendDeferredQrBatchAction = useAction(api.qrDelivery.sendDeferredQrBatch);
  const pendingDeferredQrCount = useQuery(
    api.qrDelivery.countPendingDeferredRecipients,
    currentEvent && workspaceScope
      ? { eventId: currentEvent._id, ...workspaceScope.queryArgs }
      : "skip",
  );
  const [showDeleteEventDialog, setShowDeleteEventDialog] = React.useState(false);
  const [isSendingQrBatch, setIsSendingQrBatch] = React.useState(false);

  const currentEventInlineTitle = currentEvent ? formatEventTitleInline(currentEvent) : "";
  const isCurrentEventDraft = (currentEvent?.lifecycle ?? "published") === "draft";
  const currentEventLifecycleActionLabel = getEventLifecycleActionLabel(isCurrentEventDraft);
  const showSendPendingQrCodesAction = !isCurrentEventDraft && (pendingDeferredQrCount ?? 0) > 0;

  const handleOpenCurrentEventView = React.useCallback(() => {
    if (!currentEvent) {
      return;
    }
    if (isCurrentEventDraft) {
      const editDraftPath = `/workspaces/${workspaceScope?.workspaceSlug ?? ""}/host/new?draftId=${currentEvent._id}`;
      router.push(editDraftPath);
      return;
    }
    if (publicEventUrl) {
      window.open(publicEventUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(`/events/${currentEvent._id}`, "_blank", "noopener,noreferrer");
  }, [currentEvent, isCurrentEventDraft, publicEventUrl, router, workspaceScope]);

  const handleToggleCurrentEventLifecycle = React.useCallback(async () => {
    if (!currentEvent) {
      return;
    }
    try {
      const lifecycleActionResult = await runEventLifecycleAction({
        eventId: currentEvent._id,
        isDraft: isCurrentEventDraft,
        workspaceScope,
        publishEvent: publishCurrentEventMutation,
        unpublishEvent: unpublishCurrentEventMutation,
      });
      if (lifecycleActionResult === "published") {
        toast.success("Event published");
      } else if (lifecycleActionResult === "unpublished") {
        toast.success("Event unpublished");
      }
    } catch (lifecycleError: unknown) {
      toast.error((lifecycleError as Error).message || "Failed to update lifecycle");
    }
  }, [
    currentEvent,
    isCurrentEventDraft,
    publishCurrentEventMutation,
    unpublishCurrentEventMutation,
    workspaceScope,
  ]);

  const handleSetCurrentEventFeatured = React.useCallback(async () => {
    if (!currentEvent || !workspaceScope) {
      return;
    }
    try {
      await setFeaturedEventMutation({
        eventId: currentEvent._id,
        ...workspaceScope.queryArgs,
      });
      toast.success(`"${currentEventInlineTitle}" is now the featured event`);
    } catch (featuredError) {
      toast.error("Failed to set featured event: " + (featuredError as Error).message);
    }
  }, [currentEvent, currentEventInlineTitle, setFeaturedEventMutation, workspaceScope]);

  const handleDeleteCurrentEvent = React.useCallback(async () => {
    if (!currentEvent || !workspaceScope) {
      return;
    }
    try {
      await removeCurrentEventMutation({
        eventId: currentEvent._id,
        ...workspaceScope.queryArgs,
      });
      toast.success("Event deleted");
      setShowDeleteEventDialog(false);
      setEventId(undefined);
    } catch (removeError) {
      toast.error("Failed to delete event: " + (removeError as Error).message);
    }
  }, [currentEvent, removeCurrentEventMutation, workspaceScope]);

  const handleSendCurrentEventPendingQrCodes = React.useCallback(async () => {
    if (!currentEvent || !workspaceScope || !pendingDeferredQrCount) {
      return;
    }
    setIsSendingQrBatch(true);
    try {
      const sendQrResult = await sendDeferredQrBatchAction({
        eventId: currentEvent._id,
        ...workspaceScope.queryArgs,
      });
      const successMessage =
        sendQrResult.failed > 0
          ? `Sent ${sendQrResult.sent} QR codes (${sendQrResult.failed} failed, ${sendQrResult.skipped} skipped)`
          : `Sent ${sendQrResult.sent} QR codes`;
      toast.success(successMessage);
    } catch (sendQrError) {
      toast.error((sendQrError as Error).message || "Failed to send QR codes");
    } finally {
      setIsSendingQrBatch(false);
    }
  }, [currentEvent, pendingDeferredQrCount, sendDeferredQrBatchAction, workspaceScope]);
  const currentEventSocialPlatforms = React.useMemo(
    () => currentEvent?.primaryFieldConfig?.socialPlatforms ?? [],
    [currentEvent?.primaryFieldConfig?.socialPlatforms],
  );
  const currentEventInvitedByPrimaryFieldConfig = currentEvent?.primaryFieldConfig?.invitedBy;
  const currentEventSocialPlatformKeys = React.useMemo(
    () => currentEventSocialPlatforms.map((platform) => platform.platformKey),
    [currentEventSocialPlatforms],
  );
  const shouldShowSocialPlatformFilter = currentEventSocialPlatforms.length > 1;

  React.useEffect(() => {
    if (!shouldShowSocialPlatformFilter && socialPlatformFilter !== "all") {
      setSocialPlatformFilter("all");
    }
  }, [shouldShowSocialPlatformFilter, socialPlatformFilter]);

  const listCredentials = useQuery(
    api.credentials.getCredsForEvent,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as ListCredential[] | undefined;

  const [exportOptionsOpen, setExportOptionsOpen] = React.useState(false);
  const [selectedListsForExport, setSelectedListsForExport] = React.useState<string[]>([]);
  const [selectedStatusesForExport, setSelectedStatusesForExport] = React.useState<
    ExportableApprovalStatusOption[]
  >(DEFAULT_EXPORT_STATUS_OPTIONS);
  const [selectedSocialPlatformKeysForExport, setSelectedSocialPlatformKeysForExport] =
    React.useState<string[]>([]);
  const [includeInvitedBy, setIncludeInvitedBy] = React.useState(true);
  const [includeAttendees, setIncludeAttendees] = React.useState(true);
  const [includeNote, setIncludeNote] = React.useState(true);
  const [includeCustomFields, setIncludeCustomFields] = React.useState(true);
  const [includePhone, setIncludePhone] = React.useState(true);
  const [isExportingCsv, setIsExportingCsv] = React.useState(false);
  const runExportRsvpsCsv = useAction(api.exports.exportRsvpsCsv);
  const savedDashboardTablePreference = useQuery(
    api.dashboardPreferences.getCurrentUserTablePreference,
    eventId && workspaceScope
      ? {
          ...workspaceScope.queryArgs,
          tableKey: HOST_RSVPS_TABLE_KEY,
          scopeKey: eventId,
        }
      : "skip",
  ) as DashboardTablePreference | null | undefined;
  const saveDashboardTablePreference = useConvexReactMutation(
    api.dashboardPreferences.upsertCurrentUserTablePreference,
  );

  // Column visibility state
  const [columnVisibilityOpen, setColumnVisibilityOpen] = React.useState(false);

  // Get all available column IDs (static + dynamic custom fields)
  const getAllAvailableColumnIds = React.useCallback((): string[] => {
    const socialFieldColumnIds = currentEventSocialPlatforms.map(
      (platform) => `social_${platform.platformKey}`,
    );
    const customFieldColumnIds =
      currentEvent?.customFields?.map((field) => `custom_${field.key}`) ?? [];

    return [
      ...(isReadOnly ? [] : ["select"]),
      "guest",
      "listKey",
      ...socialFieldColumnIds,
      ...(currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true ? ["invitedByName"] : []),
      "approvalStatus",
      "attendanceStatus",
      "referredByName",
      "createdAt",
      "attendees",
      "smsConsent",
      "ticketStatus",
      "ticketViewedAt",
      "noteForHosts",
      ...customFieldColumnIds,
      ...(isReadOnly ? [] : ["actions"]),
    ];
  }, [
    currentEvent?.customFields,
    currentEvent?.primaryFieldConfig?.invitedBy?.enabled,
    currentEventSocialPlatforms,
    isReadOnly,
  ]);

  const allAvailableColumnIds = React.useMemo(
    () => getAllAvailableColumnIds(),
    [getAllAvailableColumnIds],
  );
  const forcedHiddenColumnIds = React.useMemo(
    () => (isReadOnly ? ["select", "actions"] : []),
    [isReadOnly],
  );
  const defaultVisibleColumnIds = React.useMemo(
    () => getDefaultVisibleHostRsvpsTableColumnIds(allAvailableColumnIds, forcedHiddenColumnIds),
    [allAvailableColumnIds, forcedHiddenColumnIds],
  );
  const [visibleColumns, setVisibleColumns] = React.useState<Set<string>>(
    () => new Set(defaultVisibleColumnIds),
  );
  const hasPendingLocalDashboardTablePreferenceEditRef = React.useRef(false);

  // Convert visibleColumns Set to columnVisibility object for TanStack Table
  const columnVisibility = React.useMemo(() => {
    const visibility: Record<string, boolean> = {};
    allAvailableColumnIds.forEach((columnId) => {
      visibility[columnId] =
        visibleColumns.has(columnId) &&
        (!isReadOnly || (columnId !== "select" && columnId !== "actions"));
    });
    return visibility;
  }, [allAvailableColumnIds, visibleColumns, isReadOnly]);

  // Handle column visibility changes from TanStack Table
  const handleColumnVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      hasPendingLocalDashboardTablePreferenceEditRef.current = true;
      setVisibleColumns((prevVisibleColumns) => {
        const newVisibility = typeof updater === "function" ? updater(columnVisibility) : updater;
        const newVisibleColumns = new Set(prevVisibleColumns);

        // Update based on new visibility object
        Object.entries(newVisibility).forEach(([columnId, isVisible]) => {
          if (isVisible) {
            newVisibleColumns.add(columnId);
          } else {
            newVisibleColumns.delete(columnId);
          }
        });

        return newVisibleColumns;
      });
    },
    [columnVisibility],
  );

  React.useEffect(() => {
    if (listCredentials && selectedListsForExport.length === 0) {
      setSelectedListsForExport(
        listCredentials.map((listCredential) => listCredential.listKey) || [],
      );
    }
  }, [listCredentials, selectedListsForExport.length]);

  React.useEffect(() => {
    setSelectedSocialPlatformKeysForExport(currentEventSocialPlatformKeys);
    setIncludeInvitedBy(true);
  }, [currentEventSocialPlatformKeys, eventId]);

  // Convert mutations to TanStack Query
  const updateRsvpCompleteMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateRsvpComplete),
  });
  const updateRsvpListKeyMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateRsvpListKey),
  });
  const updateAttendanceStatusMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateAttendanceStatus),
  });
  const deleteRsvpCompleteMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.deleteRsvpComplete),
  });

  // Bulk mutations
  const bulkUpdateListKeyMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateListKey),
  });
  const bulkUpdateApprovalMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateApproval),
  });
  const bulkUpdateAttendanceStatusMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateAttendanceStatus),
  });
  const bulkUpdateTicketStatusMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateTicketStatus),
  });
  const bulkDeleteRsvpsMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkDeleteRsvps),
  });
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "guest", desc: false }]);
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>({});
  const [pendingChanges, setPendingChanges] = React.useState<Record<string, RsvpPendingChanges>>(
    {},
  );
  const [showQR, setShowQR] = React.useState(false);
  const [qr, setQr] = React.useState<{
    code: string;
    url: string;
    status?: string;
    listKey?: string;
  } | null>(null);
  const [rsvpsPendingDeletion, setRsvpsPendingDeletion] = React.useState<HostRsvp[]>([]);

  // Selection state management (basic state only)
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [previousSelection, setPreviousSelection] = React.useState<Set<string> | null>(null);

  // Loading state tracking for individual row updates
  const [loadingListUpdates, setLoadingListUpdates] = React.useState<Set<string>>(new Set());
  const [loadingApprovalUpdates, setLoadingApprovalUpdates] = React.useState<Set<string>>(
    new Set(),
  );
  const [loadingAttendanceUpdates, setLoadingAttendanceUpdates] = React.useState<Set<string>>(
    new Set(),
  );
  const [loadingTicketUpdates, setLoadingTicketUpdates] = React.useState<Set<string>>(new Set());

  // Monitor loading states for overall feedback
  React.useEffect(() => {
    const totalLoading =
      loadingListUpdates.size +
      loadingApprovalUpdates.size +
      loadingAttendanceUpdates.size +
      loadingTicketUpdates.size;

    if (totalLoading > 0) {
      // Could add a persistent loading indicator here if needed
      // For now, the individual toasts and spinners provide sufficient feedback
    }
  }, [loadingListUpdates, loadingApprovalUpdates, loadingAttendanceUpdates, loadingTicketUpdates]);

  const canEditTicketForRsvp = React.useCallback((rsvp: HostRsvp): boolean => {
    return rsvp.approvalStatus === "approved";
  }, []);

  const getRsvpGuestName = React.useCallback((rsvp: HostRsvp): string => {
    const displayValue = getHostRsvpGuestDisplayValue(rsvp);
    return displayValue === "(no contact)" ? "Guest" : displayValue;
  }, []);

  const openRsvpQrCode = React.useCallback((rsvp: HostRsvp) => {
    const currentTicketStatus = normalizeTicketStatus(rsvp.redemptionStatus);
    const redemptionCode = rsvp.redemptionCode;
    if (!redemptionCode) {
      return;
    }

    const url = `${window.location.origin}/redeem/${redemptionCode}`;
    setQr({
      code: redemptionCode,
      url,
      status: currentTicketStatus,
      listKey: rsvp.listKey,
    });
    setShowQR(true);
  }, []);

  const canShowRsvpQrCode = React.useCallback((rsvp: HostRsvp): boolean => {
    const currentTicketStatus = normalizeTicketStatus(rsvp.redemptionStatus);
    return (
      (currentTicketStatus === "issued" || currentTicketStatus === "redeemed") &&
      Boolean(rsvp.redemptionCode)
    );
  }, []);

  const handleSingleListKeyChange = React.useCallback(
    (rsvp: HostRsvp, newListKey: string) => {
      if (isReadOnly || newListKey === rsvp.listKey) {
        return;
      }
      if (!workspaceScope) {
        toast.error("Workspace scope is required to update RSVPs");
        return;
      }

      const guestName = getRsvpGuestName(rsvp);
      setLoadingListUpdates((previousLoadingListUpdates) =>
        new Set(previousLoadingListUpdates).add(rsvp.id),
      );
      toast.info(`Updating ${guestName}'s list...`);

      updateRsvpListKeyMutation.mutate(
        {
          rsvpId: rsvp.id,
          listKey: newListKey,
          ...workspaceScope.queryArgs,
        },
        {
          onSuccess: () => {
            toast.success(`Changed ${guestName}'s list to '${newListKey.toUpperCase()}'`);
            setLoadingListUpdates((previousLoadingListUpdates) => {
              const nextLoadingListUpdates = new Set(previousLoadingListUpdates);
              nextLoadingListUpdates.delete(rsvp.id);
              return nextLoadingListUpdates;
            });
          },
          onError: (error) => {
            toast.error(`Failed to update ${guestName}'s list: ${(error as Error).message}`);
            setLoadingListUpdates((previousLoadingListUpdates) => {
              const nextLoadingListUpdates = new Set(previousLoadingListUpdates);
              nextLoadingListUpdates.delete(rsvp.id);
              return nextLoadingListUpdates;
            });
          },
        },
      );
    },
    [getRsvpGuestName, isReadOnly, updateRsvpListKeyMutation, workspaceScope],
  );

  const handleSingleApprovalChange = React.useCallback(
    (rsvp: HostRsvp, newStatus: ApprovalStatusOption) => {
      if (isReadOnly || loadingApprovalUpdates.has(rsvp.id) || newStatus === rsvp.approvalStatus) {
        return;
      }
      if (newStatus === "pending" && rsvp.redemptionStatus === "redeemed") {
        return;
      }
      if (!workspaceScope) {
        toast.error("Workspace scope is required to update RSVPs");
        return;
      }

      const guestName = getRsvpGuestName(rsvp);
      setLoadingApprovalUpdates((previousLoadingApprovalUpdates) =>
        new Set(previousLoadingApprovalUpdates).add(rsvp.id),
      );
      toast.info(`Updating ${guestName}'s approval status...`);

      updateRsvpCompleteMutation.mutate(
        {
          rsvpId: rsvp.id,
          approvalStatus: newStatus,
          ...workspaceScope.queryArgs,
        },
        {
          onSuccess: () => {
            toast.success(`Changed ${guestName}'s RSVP to '${getApprovalStatusLabel(newStatus)}'`);
            setLoadingApprovalUpdates((previousLoadingApprovalUpdates) => {
              const nextLoadingApprovalUpdates = new Set(previousLoadingApprovalUpdates);
              nextLoadingApprovalUpdates.delete(rsvp.id);
              return nextLoadingApprovalUpdates;
            });
          },
          onError: (error) => {
            toast.error(
              `Failed to update ${guestName}'s approval status: ${(error as Error).message}`,
            );
            setLoadingApprovalUpdates((previousLoadingApprovalUpdates) => {
              const nextLoadingApprovalUpdates = new Set(previousLoadingApprovalUpdates);
              nextLoadingApprovalUpdates.delete(rsvp.id);
              return nextLoadingApprovalUpdates;
            });
          },
        },
      );
    },
    [
      getRsvpGuestName,
      isReadOnly,
      loadingApprovalUpdates,
      updateRsvpCompleteMutation,
      workspaceScope,
    ],
  );

  const handleSingleAttendanceStatusChange = React.useCallback(
    (rsvp: HostRsvp, newStatus: AttendanceStatusOption) => {
      if (isReadOnly || newStatus === rsvp.attendanceStatus) {
        return;
      }
      if (!workspaceScope) {
        toast.error("Workspace scope is required to update RSVPs");
        return;
      }

      const guestName = getRsvpGuestName(rsvp);
      setLoadingAttendanceUpdates((previousLoadingAttendanceUpdates) =>
        new Set(previousLoadingAttendanceUpdates).add(rsvp.id),
      );
      toast.info(`Updating ${guestName}'s attendance...`);

      updateAttendanceStatusMutation.mutate(
        {
          rsvpId: rsvp.id,
          attendanceStatus: newStatus,
          ...workspaceScope.queryArgs,
        },
        {
          onSuccess: () => {
            toast.success(
              `Changed ${guestName}'s attendance to '${getAttendanceStatusLabel(newStatus)}'`,
            );
            setLoadingAttendanceUpdates((previousLoadingAttendanceUpdates) => {
              const nextLoadingAttendanceUpdates = new Set(previousLoadingAttendanceUpdates);
              nextLoadingAttendanceUpdates.delete(rsvp.id);
              return nextLoadingAttendanceUpdates;
            });
          },
          onError: (error) => {
            toast.error(`Failed to update ${guestName}'s attendance: ${(error as Error).message}`);
            setLoadingAttendanceUpdates((previousLoadingAttendanceUpdates) => {
              const nextLoadingAttendanceUpdates = new Set(previousLoadingAttendanceUpdates);
              nextLoadingAttendanceUpdates.delete(rsvp.id);
              return nextLoadingAttendanceUpdates;
            });
          },
        },
      );
    },
    [getRsvpGuestName, isReadOnly, updateAttendanceStatusMutation, workspaceScope],
  );

  const handleSingleTicketStatusChange = React.useCallback(
    (rsvp: HostRsvp, newStatus: TicketStatusOption) => {
      const currentTicketStatus = normalizeTicketStatus(rsvp.redemptionStatus);
      if (isReadOnly || !canEditTicketForRsvp(rsvp)) {
        return;
      }
      if (currentTicketStatus === "redeemed" || newStatus === currentTicketStatus) {
        return;
      }
      if (!workspaceScope) {
        toast.error("Workspace scope is required to update RSVPs");
        return;
      }

      const guestName = getRsvpGuestName(rsvp);
      setLoadingTicketUpdates((previousLoadingTicketUpdates) =>
        new Set(previousLoadingTicketUpdates).add(rsvp.id),
      );
      toast.info(`Updating ${guestName}'s ticket status...`);

      updateRsvpCompleteMutation.mutate(
        {
          rsvpId: rsvp.id,
          ticketStatus: newStatus,
          ...workspaceScope.queryArgs,
        },
        {
          onSuccess: () => {
            toast.success(`Changed ${guestName}'s ticket to '${getTicketStatusLabel(newStatus)}'`);
            setLoadingTicketUpdates((previousLoadingTicketUpdates) => {
              const nextLoadingTicketUpdates = new Set(previousLoadingTicketUpdates);
              nextLoadingTicketUpdates.delete(rsvp.id);
              return nextLoadingTicketUpdates;
            });
          },
          onError: (error) => {
            toast.error(
              `Failed to update ${guestName}'s ticket status: ${(error as Error).message}`,
            );
            setLoadingTicketUpdates((previousLoadingTicketUpdates) => {
              const nextLoadingTicketUpdates = new Set(previousLoadingTicketUpdates);
              nextLoadingTicketUpdates.delete(rsvp.id);
              return nextLoadingTicketUpdates;
            });
          },
        },
      );
    },
    [
      canEditTicketForRsvp,
      getRsvpGuestName,
      isReadOnly,
      updateRsvpCompleteMutation,
      workspaceScope,
    ],
  );

  const deleteRsvps = React.useCallback(
    async (targetRsvps: HostRsvp[]) => {
      const uniqueTargetRsvps = Array.from(
        new Map(targetRsvps.map((targetRsvp) => [targetRsvp.id, targetRsvp])).values(),
      );
      if (uniqueTargetRsvps.length === 0) {
        return;
      }

      if (!workspaceScope) {
        toast.error("Workspace scope is required to delete RSVPs");
        return;
      }

      const targetRsvpIds = uniqueTargetRsvps.map((targetRsvp) => targetRsvp.id);

      if (uniqueTargetRsvps.length === 1) {
        const [targetRsvp] = uniqueTargetRsvps;
        if (!targetRsvp) {
          return;
        }

        const guestName = getRsvpGuestName(targetRsvp);
        await deleteRsvpCompleteMutation.mutateAsync({
          rsvpId: targetRsvp.id,
          ...workspaceScope.queryArgs,
        });
        setPendingChanges((previousPendingChanges) => {
          const updatedPendingChanges = { ...previousPendingChanges };
          delete updatedPendingChanges[targetRsvp.id];
          return updatedPendingChanges;
        });
        setSelectedRows((previousSelectedRows) => {
          const nextSelectedRows = new Set(previousSelectedRows);
          nextSelectedRows.delete(targetRsvp.id);
          return nextSelectedRows;
        });
        toast.success(`Deleted ${guestName}'s RSVP`);
        return;
      }

      const result = await bulkDeleteRsvpsMutation.mutateAsync({
        rsvpIds: targetRsvpIds,
        ...workspaceScope.queryArgs,
      });

      setPendingChanges((previousPendingChanges) => {
        const updatedPendingChanges = { ...previousPendingChanges };
        for (const targetRsvpId of targetRsvpIds) {
          delete updatedPendingChanges[targetRsvpId];
        }
        return updatedPendingChanges;
      });
      setSelectedRows((previousSelectedRows) => {
        const nextSelectedRows = new Set(previousSelectedRows);
        for (const targetRsvpId of targetRsvpIds) {
          nextSelectedRows.delete(targetRsvpId);
        }
        return nextSelectedRows;
      });

      if (result.failed > 0) {
        toast.warning(
          `Deleted ${result.success} of ${uniqueTargetRsvps.length} RSVPs. ${result.failed} failed: ${result.errors.join(", ")}`,
        );
        return;
      }

      toast.success(`Deleted ${uniqueTargetRsvps.length} RSVPs`);
    },
    [bulkDeleteRsvpsMutation, deleteRsvpCompleteMutation, getRsvpGuestName, workspaceScope],
  );

  const handleConfirmPendingDelete = React.useCallback(async () => {
    const targetRsvps = rsvpsPendingDeletion;
    if (targetRsvps.length === 0) {
      return;
    }
    if (!workspaceScope) {
      toast.error("Workspace scope is required to delete RSVPs");
      return;
    }

    try {
      await deleteRsvps(targetRsvps);
      setRsvpsPendingDeletion([]);
    } catch (error) {
      const [firstTargetRsvp] = targetRsvps;
      const fallbackLabel =
        targetRsvps.length === 1 && firstTargetRsvp
          ? `${getRsvpGuestName(firstTargetRsvp)}'s RSVP`
          : `${targetRsvps.length} RSVPs`;
      toast.error(`Failed to delete ${fallbackLabel}: ${(error as Error).message}`);
    }
  }, [deleteRsvps, getRsvpGuestName, rsvpsPendingDeletion, workspaceScope]);

  const listKeyColumnContentValues = React.useMemo(() => {
    const visibleListKeys = rsvps.map((rsvp) => rsvp.listKey?.toUpperCase() ?? "");
    const availableListKeys =
      listCredentials?.map((credential) => credential.listKey.toUpperCase()) ?? [];

    return Array.from(new Set([...visibleListKeys, ...availableListKeys])).filter(
      (listKey) => listKey.length > 0,
    );
  }, [listCredentials, rsvps]);

  const createdAtColumnContentValues = React.useMemo(
    () => rsvps.flatMap((rsvp) => getTimestampDateTimeLabels(rsvp.createdAt)),
    [rsvps],
  );

  const ticketViewedAtColumnContentValues = React.useMemo(
    () => [
      "Not viewed",
      ...rsvps.flatMap((rsvp) =>
        rsvp.ticketViewedAt === undefined ? [] : getTimestampDateTimeLabels(rsvp.ticketViewedAt),
      ),
    ],
    [rsvps],
  );

  // Generate dynamic custom field columns
  const customFieldColumns = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    if (!currentEvent?.customFields) return [];

    return currentEvent.customFields.map((field) => {
      const fieldLabel = field.label.replace(/:\s*$/, "").trim();

      return {
        id: `custom_${field.key}`,
        header: fieldLabel, // Remove trailing colon and spaces
        ...getRsvpTableColumnSizing({
          label: fieldLabel,
          contentValues: rsvps.map((rsvp) => getHostRsvpCustomFieldValue(rsvp, field.key)),
          contentWidthCap: 160,
          contentHorizontalAffordance: field.prependUrl || field.copyEnabled ? 56 : 32,
        }),
        accessorFn: (row: HostRsvp) => getHostRsvpCustomFieldValue(row, field.key),
        cell: ({ getValue }) => {
          const rawValue = (getValue() as string | undefined) ?? "";
          const hasPrependUrl = !!field.prependUrl;
          const isCopyEnabled = field.copyEnabled;

          const handleCopyClick = async () => {
            if (!rawValue || rawValue === "-") return;

            try {
              await navigator.clipboard.writeText(rawValue);
              toast.success(`Copied: ${rawValue}`);
            } catch (_err) {
              toast.error("Failed to copy to clipboard");
            }
          };

          const handleCopyFullUrl = async (fullUrl: string) => {
            try {
              await navigator.clipboard.writeText(fullUrl);
              toast.success(`Copied URL: ${fullUrl}`);
            } catch (_err) {
              toast.error("Failed to copy URL to clipboard");
            }
          };

          // Handle fields with prependUrl
          if (hasPrependUrl && rawValue && rawValue !== "-") {
            const sanitizedValue = sanitizeFieldValue(rawValue, field.key);
            const fullUrl = ensureAbsoluteUrl(`${field.prependUrl}${sanitizedValue}`);

            return (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    data-rsvp-table-interactive="true"
                    className="group -mx-2 -my-1 flex max-w-full min-w-0 cursor-pointer items-center gap-1 overflow-hidden rounded px-2 py-1 hover:bg-muted/50"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent row selection
                      window.open(fullUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate group-hover:underline">
                      {rawValue}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    onClick={() => window.open(fullUrl, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in new tab
                  </ContextMenuItem>
                  {isCopyEnabled && (
                    <ContextMenuItem onClick={handleCopyClick}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy value
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onClick={() => handleCopyFullUrl(fullUrl)}>
                    <Link className="h-4 w-4 mr-2" />
                    Copy full URL
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          }

          // Handle regular copy-enabled fields
          if (isCopyEnabled && rawValue && rawValue !== "-") {
            return (
              <div
                data-rsvp-table-interactive="true"
                className={cn(
                  "group -mx-2 -my-1 flex max-w-full min-w-0 cursor-pointer items-center justify-between overflow-hidden rounded px-2 py-1 transition-colors duration-150",
                )}
                onClick={handleCopyClick}
              >
                <span className="min-w-0 flex-1 truncate">{rawValue}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 bg-muted transition-opacity duration-150 ml-2 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent align="center" variant="secondary" className="py-1 px-2 z-10">
                    copy
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          }

          // Handle regular fields without special functionality
          return <span className="block max-w-full truncate">{rawValue || "-"}</span>;
        },
      };
    });
  }, [currentEvent?.customFields, rsvps]);

  const socialProfileColumns = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    const socialPlatforms = currentEvent?.primaryFieldConfig?.socialPlatforms ?? [];
    return socialPlatforms.map((platform) => ({
      id: `social_${platform.platformKey}`,
      header: platform.label,
      ...getRsvpTableColumnSizing({
        label: platform.label,
        contentValues: rsvps.map(
          (rsvp) =>
            rsvp.socialProfiles.find((profile) => profile.platformKey === platform.platformKey)
              ?.handle ?? "",
        ),
        contentWidthCap: 144,
      }),
      accessorFn: (rsvp: HostRsvp): string =>
        rsvp.socialProfiles.find((profile) => profile.platformKey === platform.platformKey)
          ?.handle ?? "",
      cell: ({ getValue }) => {
        const handle = (getValue() as string | undefined) ?? "";
        if (!handle) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        const profileUrl = platform.profileUrlPrefix
          ? `${platform.profileUrlPrefix}${handle}`
          : null;
        if (!profileUrl) {
          return <span className="block max-w-full truncate">{handle}</span>;
        }
        return (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
            data-rsvp-table-interactive="true"
            className="block max-w-full truncate text-sm underline underline-offset-4"
            onClick={stopRsvpTableInteractiveEventPropagation}
          >
            {handle}
          </a>
        );
      },
    }));
  }, [currentEvent?.primaryFieldConfig?.socialPlatforms, rsvps]);

  // Create base columns without selection functionality first
  const baseCols = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    const columns: ColumnDef<HostRsvp>[] = [
      {
        id: "guest",
        header: "Guest",
        ...getRsvpTableColumnSizing({
          label: "Guest",
          contentValues: rsvps.map(getHostRsvpGuestDisplayValue),
          contentWidthCap: 192,
        }),
        accessorFn: getHostRsvpGuestDisplayValue,
        cell: ({ row }) => {
          const rsvp = row.original;
          const guestName = getHostRsvpGuestDisplayValue(rsvp);
          if (!rsvp.userId) {
            return <span className="block max-w-full truncate">{guestName}</span>;
          }
          return (
            <button
              type="button"
              data-rsvp-table-interactive="true"
              className="block max-w-full truncate text-left font-medium underline decoration-[var(--border-strong)] underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
              title={`Open ${guestName}'s user profile`}
              onClick={(event) => {
                stopRsvpTableInteractiveEventPropagation(event);
                router.push(`${usersPath}/${rsvp.userId}`);
              }}
            >
              {guestName}
            </button>
          );
        },
      },
      {
        id: "listKey",
        header: "List",
        accessorKey: "listKey",
        ...getRsvpTableColumnSizing({
          label: "List",
          contentValues: listKeyColumnContentValues,
          contentHorizontalAffordance: isReadOnly ? 32 : 48,
        }),
        cell: RsvpListKeyCell,
      },
      {
        id: "attendees",
        header: "Attendees",
        accessorFn: (rsvp: HostRsvp): number => rsvp.attendees ?? 1,
        ...getRsvpTableColumnSizing({
          label: "Attendees",
          contentValues: rsvps.map((rsvp) => rsvp.attendees ?? 1),
        }),
        cell: ({ row }) => {
          const attendees = row.original.attendees ?? 1;
          return <span className="text-sm">{attendees}</span>;
        },
      },
      {
        id: "smsConsent",
        header: "SMS Consent",
        ...getRsvpTableColumnSizing({
          label: "SMS Consent",
          contentValues: ["Yes", "No"],
          contentHorizontalAffordance: 48,
        }),
        accessorFn: (rsvp: HostRsvp): string => {
          return rsvp.smsConsent === true ? "Yes" : rsvp.smsConsent === false ? "No" : "—";
        },
        cell: ({ row }) => {
          const consent = row.original.smsConsent;
          if (consent === true) {
            return (
              <Badge variant="success" className="text-xs">
                Yes
              </Badge>
            );
          } else if (consent === false) {
            return (
              <Badge variant="secondary" className="text-xs">
                No
              </Badge>
            );
          } else {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
        },
      },
      ...(currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true
        ? [
            {
              id: "invitedByName",
              header: currentEvent.primaryFieldConfig.invitedBy.label ?? "Invited By",
              accessorKey: "invitedByName",
              ...getRsvpTableColumnSizing({
                label: currentEvent.primaryFieldConfig.invitedBy.label ?? "Invited By",
                contentValues: rsvps.map((rsvp) => rsvp.invitedByName?.trim() ?? ""),
                contentWidthCap: 144,
              }),
              cell: ({ row }) => {
                const invitedByName = row.original.invitedByName?.trim();
                if (!invitedByName) {
                  return <span className="text-sm text-muted-foreground">—</span>;
                }
                return <span className="block max-w-full truncate text-sm">{invitedByName}</span>;
              },
            } satisfies ColumnDef<HostRsvp>,
          ]
        : []),
      {
        id: "referredByName",
        header: "Referred By",
        accessorKey: "referredByName",
        ...getRsvpTableColumnSizing({
          label: "Referred By",
          contentValues: rsvps.map(
            (rsvp) => rsvp.referredByName?.trim() || rsvp.referralCode?.trim() || "",
          ),
          contentWidthCap: 144,
        }),
        cell: ({ row }) => {
          const referredByName =
            row.original.referredByName?.trim() || row.original.referralCode?.trim();
          if (!referredByName) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          return <span className="block max-w-full truncate text-sm">{referredByName}</span>;
        },
      },
      ...socialProfileColumns,
      {
        id: "noteForHosts",
        header: "Note for Hosts",
        accessorKey: "note",
        ...getRsvpTableColumnSizing({
          label: "Note for Hosts",
          contentValues: rsvps.map((rsvp) => rsvp.note?.trim() ?? ""),
          contentWidthCap: 256,
        }),
        cell: ({ row }) => {
          const noteForHosts = row.original.note?.trim();
          if (!noteForHosts) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block max-w-full cursor-default truncate text-sm">
                  {noteForHosts}
                </span>
              </TooltipTrigger>
              <TooltipContent align="start" className="max-w-xs whitespace-pre-line">
                {noteForHosts}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "createdAt",
        header: "Created",
        accessorKey: "createdAt",
        ...getRsvpTableColumnSizing({
          label: "Created",
          contentValues: createdAtColumnContentValues,
        }),
        cell: ({ row }) => {
          const [dateLabel, timeLabel] = getTimestampDateTimeLabels(row.original.createdAt);
          return (
            <div className="text-xs">
              <div>{dateLabel}</div>
              <div className="text-muted-foreground">{timeLabel}</div>
            </div>
          );
        },
      },
      // Insert custom field columns here
      ...customFieldColumns,
      {
        id: "approvalStatus",
        header: "Approval",
        accessorKey: "approvalStatus",
        ...getRsvpTableColumnSizing({
          label: "Approval",
          contentValues: APPROVAL_STATUS_OPTIONS.map(getApprovalStatusLabel),
          contentHorizontalAffordance: 48,
        }),
        cell: RsvpApprovalStatusCell,
      },
      {
        id: "attendanceStatus",
        header: "Attendance",
        accessorKey: "attendanceStatus",
        ...getRsvpTableColumnSizing({
          label: "Attendance",
          contentValues: ATTENDANCE_STATUS_OPTIONS.map(getAttendanceStatusLabel),
          contentHorizontalAffordance: 48,
        }),
        cell: RsvpAttendanceStatusCell,
      },
      {
        id: "ticketStatus",
        header: "Ticket",
        accessorFn: (rsvp: HostRsvp) => rsvp.redemptionStatus,
        ...getRsvpTableColumnSizing({
          label: "Ticket",
          contentValues: TICKET_STATUS_OPTIONS.map(getTicketStatusLabel),
          contentHorizontalAffordance: 48,
        }),
        cell: RsvpTicketStatusCell,
      },
      {
        id: "ticketViewedAt",
        header: "Ticket Viewed",
        accessorKey: "ticketViewedAt",
        ...getRsvpTableColumnSizing({
          label: "Ticket Viewed",
          contentValues: ticketViewedAtColumnContentValues,
          contentHorizontalAffordance: 48,
        }),
        cell: ({ row }) => {
          const ticketViewedAt = row.original.ticketViewedAt;
          if (ticketViewedAt === undefined) {
            return (
              <Badge variant="secondary" className="text-xs">
                Not viewed
              </Badge>
            );
          }

          const formattedTicketViewedAt = formatTicketViewedTimestamp(ticketViewedAt);
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="success" className="text-xs cursor-default">
                  Viewed
                </Badge>
              </TooltipTrigger>
              <TooltipContent align="start">{formattedTicketViewedAt}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        ...getRsvpTableColumnSizing({
          label: "Action",
          contentValues: ["Delete"],
          contentHorizontalAffordance: 48,
        }),
        cell: RsvpActionsCell,
      },
    ];

    const columnById = new Map(
      columns
        .filter(
          (column): column is ColumnDef<HostRsvp> & { id: string } => typeof column.id === "string",
        )
        .map((column) => [column.id, column]),
    );
    const socialProfileColumnIds = socialProfileColumns
      .map((column) => column.id)
      .filter((columnId): columnId is string => typeof columnId === "string");
    const customFieldColumnIds = customFieldColumns
      .map((column) => column.id)
      .filter((columnId): columnId is string => typeof columnId === "string");
    const preferredColumnOrder = [
      "guest",
      "listKey",
      ...socialProfileColumnIds,
      ...(currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true ? ["invitedByName"] : []),
      "approvalStatus",
      "attendanceStatus",
      "referredByName",
      "createdAt",
      "attendees",
      "smsConsent",
      "ticketStatus",
      "ticketViewedAt",
      "noteForHosts",
      ...customFieldColumnIds,
      "actions",
    ];

    return preferredColumnOrder
      .map((columnId) => columnById.get(columnId))
      .filter((column): column is ColumnDef<HostRsvp> & { id: string } => column !== undefined)
      .filter((column) => !isReadOnly || column.id !== "actions");
  }, [
    createdAtColumnContentValues,
    customFieldColumns,
    currentEvent?.primaryFieldConfig,
    isReadOnly,
    listKeyColumnContentValues,
    rsvps,
    router,
    socialProfileColumns,
    ticketViewedAtColumnContentValues,
    usersPath,
  ]);

  // Filtering is now handled by the backend

  // Get unique values for filter dropdowns - use all available options, not just filtered results
  const uniqueListKeys = React.useMemo<string[]>(() => {
    return (
      listCredentials
        ?.map((cred) => cred.listKey)
        .filter((key): key is string => key !== null)
        .sort() || []
    );
  }, [listCredentials]);

  const uniqueApprovalStatuses = React.useMemo<ApprovalStatusOption[]>(() => {
    return ["pending", "approved", "denied"];
  }, []);

  // Clear all filters function
  const clearAllFilters = () => {
    setGuestSearch("");
    setApprovalFilter("all");
    setListFilter("all");
    setRedemptionFilter("all");
    setQrDeliveryFilter("all");
    setSocialPlatformFilter("all");
    setSortBy("createdAt");
    setSortOrder("desc");
  };

  // Check if any filters are active
  const hasActiveFilters =
    guestSearch.trim() !== "" ||
    approvalFilter !== "all" ||
    listFilter !== "all" ||
    redemptionFilter !== "all" ||
    qrDeliveryFilter !== "all" ||
    (shouldShowSocialPlatformFilter && socialPlatformFilter !== "all");

  // Drag-aware selection handlers — pointerdown on the select cell starts a paint drag.
  // The anchor row's prior state decides the drag mode: an unchecked anchor paints "select"
  // (adds every row in the range), a checked anchor paints "deselect" (removes every row in
  // the range). The pre-drag selection is preserved for rows not touched by the drag.
  const orderedRsvpIds = React.useMemo(() => rsvps.map((rsvp) => rsvp.id), [rsvps]);
  const selectedRsvpIdsInCurrentOrder = React.useMemo(
    () => orderedRsvpIds.filter((rsvpId) => selectedRows.has(rsvpId)),
    [orderedRsvpIds, selectedRows],
  );
  const dragAnchorRsvpIdRef = React.useRef<string | null>(null);
  const dragStartSelectionRef = React.useRef<Set<string> | null>(null);
  const dragModeRef = React.useRef<"select" | "deselect" | null>(null);
  const [selectionDragMode, setSelectionDragMode] = React.useState<"select" | "deselect" | null>(
    null,
  );
  const isSelectionDragActive = selectionDragMode !== null;

  const applySelectionDragPaint = React.useCallback(
    (focusRsvpId: string) => {
      const anchorRsvpId = dragAnchorRsvpIdRef.current;
      const dragStartSelection = dragStartSelectionRef.current;
      const dragMode = dragModeRef.current;
      if (!anchorRsvpId || !dragStartSelection || !dragMode) {
        return;
      }
      const rangeRsvpIds = getRsvpSelectionRangeIds(orderedRsvpIds, anchorRsvpId, focusRsvpId);
      if (rangeRsvpIds.length === 0) {
        return;
      }
      const nextSelectedRows = new Set(dragStartSelection);
      if (dragMode === "select") {
        for (const rangeRsvpId of rangeRsvpIds) {
          nextSelectedRows.add(rangeRsvpId);
        }
      } else {
        for (const rangeRsvpId of rangeRsvpIds) {
          nextSelectedRows.delete(rangeRsvpId);
        }
      }
      setSelectedRows(nextSelectedRows);
    },
    [orderedRsvpIds],
  );

  const beginSelectionDrag = React.useCallback(
    (rsvpId: string) => {
      if (isReadOnly) {
        return;
      }
      let resolvedDragMode: "select" | "deselect" = "select";
      setSelectedRows((previousSelectedRows) => {
        dragStartSelectionRef.current = new Set(previousSelectedRows);
        dragAnchorRsvpIdRef.current = rsvpId;
        resolvedDragMode = previousSelectedRows.has(rsvpId) ? "deselect" : "select";
        dragModeRef.current = resolvedDragMode;
        const nextSelectedRows = new Set(previousSelectedRows);
        if (resolvedDragMode === "select") {
          nextSelectedRows.add(rsvpId);
        } else {
          nextSelectedRows.delete(rsvpId);
        }
        return nextSelectedRows;
      });
      setSelectionDragMode(resolvedDragMode);
    },
    [isReadOnly],
  );

  const extendSelectionDrag = React.useCallback(
    (rsvpId: string) => {
      if (isReadOnly) {
        return;
      }
      applySelectionDragPaint(rsvpId);
    },
    [isReadOnly, applySelectionDragPaint],
  );

  const endSelectionDrag = React.useCallback(() => {
    dragAnchorRsvpIdRef.current = null;
    dragStartSelectionRef.current = null;
    dragModeRef.current = null;
    setSelectionDragMode(null);
  }, []);

  React.useEffect(() => {
    window.addEventListener("pointerup", endSelectionDrag);
    window.addEventListener("pointercancel", endSelectionDrag);
    return () => {
      window.removeEventListener("pointerup", endSelectionDrag);
      window.removeEventListener("pointercancel", endSelectionDrag);
    };
  }, [endSelectionDrag]);

  // Suppress browser text selection (and the caret) while a drag is in progress so the user
  // doesn't accidentally select cell text as the pointer crosses other rows.
  React.useEffect(() => {
    if (!isSelectionDragActive) {
      return;
    }
    const previousUserSelect = document.body.style.userSelect;
    const previousWebkitUserSelect = (
      document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }
    ).webkitUserSelect;
    document.body.style.userSelect = "none";
    (document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect =
      "none";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      (
        document.body.style as CSSStyleDeclaration & { webkitUserSelect?: string }
      ).webkitUserSelect = previousWebkitUserSelect ?? "";
    };
  }, [isSelectionDragActive]);

  const handleDeleteSingleRsvp = React.useCallback(
    (rsvp: HostRsvp) => {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to delete RSVPs");
        return;
      }
      deleteRsvpCompleteMutation.mutate(
        { rsvpId: rsvp.id, ...workspaceScope.queryArgs },
        {
          onSuccess: () => {
            setPendingChanges((previousPendingChanges) => {
              const nextPendingChanges = { ...previousPendingChanges };
              delete nextPendingChanges[rsvp.id];
              return nextPendingChanges;
            });
            toast.success("RSVP deleted successfully");
          },
          onError: (error) => {
            toast.error("Failed to delete RSVP: " + (error as Error).message);
          },
        },
      );
    },
    [deleteRsvpCompleteMutation, workspaceScope],
  );

  React.useEffect(() => {
    if (isReadOnly) {
      setSelectedRows(new Set());
      setPreviousSelection(null);
    }
  }, [isReadOnly]);

  // Clear selection when filters change or page changes
  React.useEffect(() => {
    setSelectedRows(new Set());
  }, [
    debouncedGuest,
    approvalFilter,
    listFilter,
    redemptionFilter,
    qrDeliveryFilter,
    socialPlatformFilter,
    cursor,
  ]);

  // Calculate pagination info for cursor-based pagination
  const currentPage = cursorHistory.length + 1;
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, startItem + (rsvps?.length || 0) - 1);

  // Navigation handlers for cursor-based pagination
  const goToNextPage = React.useCallback(() => {
    if (rsvpsPaginated?.nextCursor && !rsvpsPaginated.isDone) {
      // Always save current cursor to history before moving to next (even if null)
      setCursorHistory((prev) => [...prev, cursor]);
      setCursor(rsvpsPaginated.nextCursor);
    }
  }, [rsvpsPaginated?.nextCursor, rsvpsPaginated?.isDone, cursor]);

  const goToPreviousPage = React.useCallback(() => {
    if (cursorHistory.length > 0) {
      // Get the previous cursor from history
      const previousCursor = cursorHistory[cursorHistory.length - 1];
      // Remove it from history
      setCursorHistory((prev) => prev.slice(0, -1));
      // Set as current cursor
      setCursor(previousCursor);
    } else {
      // Go to first page if no history
      setCursor(null);
    }
  }, [cursorHistory]);

  // Bulk action handlers
  const handleBulkListChange = async (newListKey: string) => {
    if (isReadOnly) return;
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update RSVPs");
      return;
    }
    const selectedRsvps = rsvps.filter((rsvp) => selectedRows.has(rsvp.id));
    const count = selectedRsvps.length;

    if (count === 0) return;

    // Add all selected IDs to loading state
    setLoadingListUpdates((prev) => {
      const next = new Set(prev);
      selectedRsvps.forEach((rsvp) => next.add(rsvp.id));
      return next;
    });

    // Show updating toast
    toast.info(`Updating ${count} RSVPs...`);

    // Execute bulk update in single mutation
    const updates = selectedRsvps.map((rsvp) => ({
      rsvpId: rsvp.id,
      listKey: newListKey,
    }));

    try {
      const result = await bulkUpdateListKeyMutation.mutateAsync({
        updates,
        ...workspaceScope.queryArgs,
      });

      if (result.failed > 0) {
        toast.warning(
          `Updated ${result.success} of ${count} RSVPs. ${result.failed} failed: ${result.errors.join(", ")}`,
        );
      } else {
        toast.success(`Changed list to '${newListKey.toUpperCase()}' for ${count} RSVPs`);
      }

      setSelectedRows(new Set());
      // Clear loading state
      setLoadingListUpdates((prev) => {
        const next = new Set(prev);
        selectedRsvps.forEach((rsvp) => next.delete(rsvp.id));
        return next;
      });
    } catch (error) {
      toast.error(`Failed to update list: ${(error as Error).message}`);
      // Clear loading state on error
      setLoadingListUpdates((prev) => {
        const next = new Set(prev);
        selectedRsvps.forEach((rsvp) => next.delete(rsvp.id));
        return next;
      });
    }
  };

  const handleBulkApprovalChange = async (newStatus: ApprovalStatusOption) => {
    if (isReadOnly) return;
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update RSVPs");
      return;
    }
    const selectedRsvps = rsvps.filter((rsvp) => selectedRows.has(rsvp.id));
    const count = selectedRsvps.length;

    if (count === 0) return;

    // Add all selected IDs to loading state
    setLoadingApprovalUpdates((prev) => {
      const next = new Set(prev);
      selectedRsvps.forEach((rsvp) => next.add(rsvp.id));
      return next;
    });

    // Show updating toast
    toast.info(`Updating ${count} RSVPs...`);

    // Execute bulk update in single mutation
    const updates = selectedRsvps.map((rsvp) => ({
      rsvpId: rsvp.id,
      approvalStatus: newStatus,
    }));

    try {
      const result = await bulkUpdateApprovalMutation.mutateAsync({
        updates,
        ...workspaceScope.queryArgs,
      });

      if (result.failed > 0) {
        const _statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
        toast.warning(
          `Updated ${result.success} of ${count} RSVPs. ${result.failed} failed: ${result.errors.join(", ")}`,
        );
      } else {
        const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
        toast.success(`Changed approval to '${statusText}' for ${count} RSVPs`);
      }

      setSelectedRows(new Set());
      // Clear loading state
      setLoadingApprovalUpdates((prev) => {
        const next = new Set(prev);
        selectedRsvps.forEach((rsvp) => next.delete(rsvp.id));
        return next;
      });
    } catch (error) {
      toast.error(`Failed to update approval status: ${(error as Error).message}`);
      // Clear loading state on error
      setLoadingApprovalUpdates((prev) => {
        const next = new Set(prev);
        selectedRsvps.forEach((rsvp) => next.delete(rsvp.id));
        return next;
      });
    }
  };

  const handleBulkAttendanceStatusChange = async (newStatus: AttendanceStatusOption) => {
    if (isReadOnly) return;
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update RSVPs");
      return;
    }
    const selectedRsvps = rsvps.filter((rsvp) => selectedRows.has(rsvp.id));
    const count = selectedRsvps.length;

    if (count === 0) return;

    setLoadingAttendanceUpdates((previousLoadingAttendanceUpdates) => {
      const nextLoadingAttendanceUpdates = new Set(previousLoadingAttendanceUpdates);
      selectedRsvps.forEach((rsvp) => nextLoadingAttendanceUpdates.add(rsvp.id));
      return nextLoadingAttendanceUpdates;
    });

    toast.info(`Updating ${count} RSVPs...`);

    const updates = selectedRsvps.map((rsvp) => ({
      rsvpId: rsvp.id,
      attendanceStatus: newStatus,
    }));

    try {
      const result = await bulkUpdateAttendanceStatusMutation.mutateAsync({
        updates,
        ...workspaceScope.queryArgs,
      });

      if (result.failed > 0) {
        toast.warning(
          `Updated ${result.success} of ${count} RSVPs. ${result.failed} failed: ${result.errors.join(", ")}`,
        );
      } else {
        toast.success(
          `Changed attendance to '${getAttendanceStatusLabel(newStatus)}' for ${count} RSVPs`,
        );
      }

      setSelectedRows(new Set());
      setLoadingAttendanceUpdates((previousLoadingAttendanceUpdates) => {
        const nextLoadingAttendanceUpdates = new Set(previousLoadingAttendanceUpdates);
        selectedRsvps.forEach((rsvp) => nextLoadingAttendanceUpdates.delete(rsvp.id));
        return nextLoadingAttendanceUpdates;
      });
    } catch (error) {
      toast.error(`Failed to update attendance: ${(error as Error).message}`);
      setLoadingAttendanceUpdates((previousLoadingAttendanceUpdates) => {
        const nextLoadingAttendanceUpdates = new Set(previousLoadingAttendanceUpdates);
        selectedRsvps.forEach((rsvp) => nextLoadingAttendanceUpdates.delete(rsvp.id));
        return nextLoadingAttendanceUpdates;
      });
    }
  };

  const handleBulkTicketStatusChange = async (newStatus: TicketStatusOption) => {
    if (isReadOnly) return;
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update RSVPs");
      return;
    }
    const selectedRsvps = rsvps.filter((rsvp) => selectedRows.has(rsvp.id));
    // Filter out tickets that cannot be edited in the current approval state.
    const changeableRsvps = selectedRsvps.filter(
      (rsvp) => rsvp.redemptionStatus !== "redeemed" && canEditTicketForRsvp(rsvp),
    );
    const count = changeableRsvps.length;
    const skippedCount = selectedRsvps.length - changeableRsvps.length;

    if (count === 0) {
      if (skippedCount > 0) {
        toast.error("Ticket changes are only available for approved RSVPs with unredeemed tickets");
      }
      return;
    }

    // Add all changeable IDs to loading state
    setLoadingTicketUpdates((prev) => {
      const next = new Set(prev);
      changeableRsvps.forEach((rsvp) => next.add(rsvp.id));
      return next;
    });

    // Show updating toast
    toast.info(`Updating ${count} RSVPs...`);

    // Execute bulk update in single mutation
    const updates = changeableRsvps.map((rsvp) => ({
      rsvpId: rsvp.id,
      ticketStatus: newStatus,
    }));

    try {
      const result = await bulkUpdateTicketStatusMutation.mutateAsync({
        updates,
        ...workspaceScope.queryArgs,
      });

      const statusLabel =
        newStatus === "not-issued"
          ? "None"
          : newStatus === "issued"
            ? "Issued"
            : newStatus === "disabled"
              ? "Disabled"
              : newStatus;

      if (result.failed > 0) {
        let message = `Updated ${result.success} of ${count} RSVPs. ${result.failed} failed: ${result.errors.join(", ")}`;
        if (skippedCount > 0) {
          message += ` (${skippedCount} RSVPs skipped because their ticket state is locked)`;
        }
        toast.warning(message);
      } else {
        let message = `Changed ticket status to '${statusLabel}' for ${count} RSVPs`;
        if (skippedCount > 0) {
          message += ` (${skippedCount} RSVPs skipped because their ticket state is locked)`;
        }
        toast.success(message);
      }

      setSelectedRows(new Set());
      // Clear loading state
      setLoadingTicketUpdates((prev) => {
        const next = new Set(prev);
        changeableRsvps.forEach((rsvp) => next.delete(rsvp.id));
        return next;
      });
    } catch (error) {
      toast.error(`Failed to update ticket status: ${(error as Error).message}`);
      // Clear loading state on error
      setLoadingTicketUpdates((prev) => {
        const next = new Set(prev);
        changeableRsvps.forEach((rsvp) => next.delete(rsvp.id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (isReadOnly) return;
    const selectedRsvps = rsvps.filter((rsvp) => selectedRows.has(rsvp.id));
    try {
      await deleteRsvps(selectedRsvps);
    } catch (error) {
      toast.error(`Failed to delete RSVPs: ${(error as Error).message}`);
    }
  };

  const handleOpenReviewFeed = React.useCallback(() => {
    if (!eventId || selectedRsvpIdsInCurrentOrder.length === 0) {
      return;
    }

    const reviewFeedSearchParams = buildRsvpReviewFeedSearchParams({
      eventId,
      rsvpIds: selectedRsvpIdsInCurrentOrder,
    });
    router.push(`${rsvpReviewFeedPath}?${reviewFeedSearchParams.toString()}`);
  }, [eventId, router, rsvpReviewFeedPath, selectedRsvpIdsInCurrentOrder]);

  // Create initial columns with the same selection header used after table state hydrates.
  const initialCols = React.useMemo<ColumnDef<HostRsvp>[]>(
    () =>
      isReadOnly
        ? baseCols
        : [
            {
              id: "select",
              header: RsvpSelectHeaderCell,
              meta: { label: "Select all" },
              ...RSVP_SELECT_COLUMN_SIZING,
              cell: RsvpSelectCell,
              enableSorting: false,
              enableHiding: false,
            },
            ...baseCols,
          ],
    [baseCols, isReadOnly],
  );

  const computedInitialColumnIdentifiers = React.useMemo(() => {
    return initialCols
      .map((column, columnIndex) => {
        if (column.id) {
          return column.id.toString();
        }
        if (hasStringAccessorKey(column)) {
          return column.accessorKey;
        }
        return `column_${columnIndex}`;
      })
      .filter((identifier): identifier is string => identifier.length > 0);
  }, [initialCols]);
  const computedInitialColumnIdentifierSignature = React.useMemo(
    () => computedInitialColumnIdentifiers.join("\u001f"),
    [computedInitialColumnIdentifiers],
  );
  const defaultVisibleColumnIdentifierSignature = React.useMemo(
    () => defaultVisibleColumnIds.join("\u001f"),
    [defaultVisibleColumnIds],
  );
  const forcedHiddenColumnIdentifierSignature = React.useMemo(
    () => forcedHiddenColumnIds.join("\u001f"),
    [forcedHiddenColumnIds],
  );
  const dashboardTableStructureSignature = React.useMemo(
    () =>
      [
        eventId ?? "",
        computedInitialColumnIdentifierSignature,
        defaultVisibleColumnIdentifierSignature,
        forcedHiddenColumnIdentifierSignature,
      ].join("\u001e"),
    [
      computedInitialColumnIdentifierSignature,
      defaultVisibleColumnIdentifierSignature,
      eventId,
      forcedHiddenColumnIdentifierSignature,
    ],
  );
  const savedDashboardTablePreferenceSignature = React.useMemo(() => {
    if (savedDashboardTablePreference === undefined) {
      return "loading";
    }
    if (savedDashboardTablePreference === null) {
      return "empty";
    }
    return serializeDashboardTablePreferenceState(
      savedDashboardTablePreference.columnOrder,
      savedDashboardTablePreference.hiddenColumnIds,
    );
  }, [savedDashboardTablePreference]);
  const shouldResetSavedDashboardTablePreference = React.useMemo(() => {
    if (!savedDashboardTablePreference) {
      return false;
    }

    return shouldResetHostRsvpsSavedTablePreference({
      availableColumnIds: computedInitialColumnIdentifiers,
      defaultVisibleColumnIds,
      savedColumnOrder: savedDashboardTablePreference.columnOrder,
      hiddenColumnIds: savedDashboardTablePreference.hiddenColumnIds,
      forcedHiddenColumnIds,
    });
  }, [
    computedInitialColumnIdentifiers,
    defaultVisibleColumnIds,
    forcedHiddenColumnIds,
    savedDashboardTablePreference,
  ]);

  const [columnOrder, setColumnOrder] = React.useState<string[]>(
    () => computedInitialColumnIdentifiers,
  );
  const lastSavedDashboardTablePreferenceSignatureRef = React.useRef<string | null>(null);
  const hydratedDashboardTablePreferenceKeyRef = React.useRef<string | null>(null);
  const previousDashboardTableStructureSignatureRef = React.useRef(
    dashboardTableStructureSignature,
  );

  React.useEffect(() => {
    if (previousDashboardTableStructureSignatureRef.current === dashboardTableStructureSignature) {
      return;
    }

    previousDashboardTableStructureSignatureRef.current = dashboardTableStructureSignature;
    hasPendingLocalDashboardTablePreferenceEditRef.current = false;
    hydratedDashboardTablePreferenceKeyRef.current = null;
    setColumnSizing({});
  }, [dashboardTableStructureSignature]);

  React.useEffect(() => {
    setColumnOrder((previousColumnOrder) => {
      const filteredColumnOrder = previousColumnOrder.filter((identifier) =>
        computedInitialColumnIdentifiers.includes(identifier),
      );
      const missingColumnIdentifiers = computedInitialColumnIdentifiers.filter(
        (identifier) => !filteredColumnOrder.includes(identifier),
      );

      const isSameOrder =
        missingColumnIdentifiers.length === 0 &&
        filteredColumnOrder.length === previousColumnOrder.length &&
        filteredColumnOrder.every((identifier, index) => identifier === previousColumnOrder[index]);

      if (isSameOrder) {
        return previousColumnOrder;
      }

      return [...filteredColumnOrder, ...missingColumnIdentifiers];
    });
  }, [computedInitialColumnIdentifiers]);

  const dashboardTablePreferencePayload = React.useMemo(() => {
    const normalizedColumnOrder = columnOrder.filter((columnId) =>
      computedInitialColumnIdentifiers.includes(columnId),
    );
    const missingColumnIds = computedInitialColumnIdentifiers.filter(
      (columnId) => !normalizedColumnOrder.includes(columnId),
    );
    const completeColumnOrder = [...normalizedColumnOrder, ...missingColumnIds];
    const hiddenColumnIds = computedInitialColumnIdentifiers.filter(
      (columnId) => !visibleColumns.has(columnId),
    );

    return {
      columnOrder: completeColumnOrder,
      hiddenColumnIds,
      signature: serializeDashboardTablePreferenceState(completeColumnOrder, hiddenColumnIds),
    };
  }, [columnOrder, computedInitialColumnIdentifiers, visibleColumns]);

  const handleColumnOrderChange = React.useCallback(
    (updater: string[] | ((old: string[]) => string[])) => {
      hasPendingLocalDashboardTablePreferenceEditRef.current = true;
      setColumnOrder(updater);
    },
    [],
  );

  React.useEffect(() => {
    if (
      savedDashboardTablePreference === undefined ||
      computedInitialColumnIdentifiers.length === 0
    ) {
      return;
    }
    if (
      !shouldHydrateDashboardTablePreferenceState({
        currentPreferenceSignature: dashboardTablePreferencePayload.signature,
        savedPreferenceSignature: savedDashboardTablePreferenceSignature,
        hasLocalPreferenceEdits: hasPendingLocalDashboardTablePreferenceEditRef.current,
      })
    ) {
      return;
    }
    if (dashboardTablePreferencePayload.signature === savedDashboardTablePreferenceSignature) {
      hasPendingLocalDashboardTablePreferenceEditRef.current = false;
    }
    const hydrationKey = [
      dashboardTableStructureSignature,
      savedDashboardTablePreferenceSignature,
      shouldResetSavedDashboardTablePreference ? "reset" : "preserve",
    ].join("\u001e");
    if (hydratedDashboardTablePreferenceKeyRef.current === hydrationKey) {
      return;
    }
    hydratedDashboardTablePreferenceKeyRef.current = hydrationKey;

    const mergedPreferenceState = mergeDashboardTablePreferenceState({
      availableColumnIds: computedInitialColumnIdentifiers,
      defaultVisibleColumnIds,
      savedColumnOrder: shouldResetSavedDashboardTablePreference
        ? undefined
        : savedDashboardTablePreference?.columnOrder,
      hiddenColumnIds: shouldResetSavedDashboardTablePreference
        ? undefined
        : savedDashboardTablePreference?.hiddenColumnIds,
      forcedHiddenColumnIds,
    });

    setColumnOrder((previousColumnOrder) =>
      areDashboardTableColumnIdsEqual(previousColumnOrder, mergedPreferenceState.columnOrder)
        ? previousColumnOrder
        : mergedPreferenceState.columnOrder,
    );
    setVisibleColumns((previousVisibleColumns) => {
      const previousVisibleColumnIds = computedInitialColumnIdentifiers.filter((columnId) =>
        previousVisibleColumns.has(columnId),
      );
      if (
        areDashboardTableColumnIdsEqual(
          previousVisibleColumnIds,
          mergedPreferenceState.visibleColumnIds,
        )
      ) {
        return previousVisibleColumns;
      }
      return new Set(mergedPreferenceState.visibleColumnIds);
    });
    lastSavedDashboardTablePreferenceSignatureRef.current = shouldResetSavedDashboardTablePreference
      ? savedDashboardTablePreferenceSignature
      : serializeDashboardTablePreferenceState(
          mergedPreferenceState.columnOrder,
          mergedPreferenceState.hiddenColumnIds,
        );
    hasPendingLocalDashboardTablePreferenceEditRef.current = false;
  }, [
    dashboardTablePreferencePayload.signature,
    dashboardTableStructureSignature,
    computedInitialColumnIdentifierSignature,
    computedInitialColumnIdentifiers,
    defaultVisibleColumnIds,
    forcedHiddenColumnIds,
    savedDashboardTablePreference,
    savedDashboardTablePreferenceSignature,
    shouldResetSavedDashboardTablePreference,
  ]);
  const debouncedDashboardTablePreferencePayload = useDebounce(
    dashboardTablePreferencePayload,
    500,
  );

  React.useEffect(() => {
    if (!workspaceScope || !eventId || savedDashboardTablePreference === undefined) {
      return;
    }
    if (
      debouncedDashboardTablePreferencePayload.signature !==
      dashboardTablePreferencePayload.signature
    ) {
      return;
    }
    if (
      lastSavedDashboardTablePreferenceSignatureRef.current ===
      debouncedDashboardTablePreferencePayload.signature
    ) {
      return;
    }

    lastSavedDashboardTablePreferenceSignatureRef.current =
      debouncedDashboardTablePreferencePayload.signature;
    void saveDashboardTablePreference({
      ...workspaceScope.queryArgs,
      tableKey: HOST_RSVPS_TABLE_KEY,
      scopeKey: eventId,
      columnOrder: debouncedDashboardTablePreferencePayload.columnOrder,
      hiddenColumnIds: debouncedDashboardTablePreferencePayload.hiddenColumnIds,
    }).catch((error: unknown) => {
      lastSavedDashboardTablePreferenceSignatureRef.current = null;
      console.error("Failed to save RSVP table preferences", error);
    });
  }, [
    dashboardTablePreferencePayload.signature,
    debouncedDashboardTablePreferencePayload,
    eventId,
    saveDashboardTablePreference,
    savedDashboardTablePreference,
    workspaceScope,
  ]);

  const table = useReactTable({
    data: rsvps,
    columns: initialCols,
    state: { sorting, columnOrder, columnSizing, columnVisibility },
    manualPagination: true, // Enable manual pagination
    manualSorting: true, // Enable manual sorting (server-side)
    enableSorting: false, // Disable column header sorting - use global sort dropdowns instead
    onSortingChange: setSorting,
    onColumnOrderChange: handleColumnOrderChange,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    // Don't use getSortedRowModel() since we're doing server-side sorting
    // getSortedRowModel: getSortedRowModel(),
  });

  const [tableContainerElement, setTableContainerElement] = React.useState<HTMLDivElement | null>(
    null,
  );
  const [tableContainerWidth, setTableContainerWidth] = React.useState(0);

  React.useEffect(() => {
    if (!tableContainerElement) {
      return;
    }

    const measureTableContainer = () => {
      setTableContainerWidth(tableContainerElement.clientWidth);
    };

    measureTableContainer();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureTableContainer);
      return () => window.removeEventListener("resize", measureTableContainer);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const [entry] = entries;
      setTableContainerWidth(entry?.contentRect.width ?? tableContainerElement.clientWidth);
    });
    resizeObserver.observe(tableContainerElement);

    return () => resizeObserver.disconnect();
  }, [tableContainerElement]);

  const [draggedColumnIdentifier, setDraggedColumnIdentifier] = React.useState<string | null>(null);
  const draggedColumnIdentifierRef = React.useRef<string | null>(null);
  const [dragHoverDetails, setDragHoverDetails] = React.useState<{
    columnId: string;
    position: "before" | "after";
  } | null>(null);
  const dragPreviewElementRef = React.useRef<HTMLDivElement | null>(null);
  const dragPreviewFollowPointerRef = React.useRef(false);

  const formatColumnIdentifier = React.useCallback((identifier: string) => {
    if (!identifier) {
      return "Column";
    }
    const withSpacing = identifier.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
    return withSpacing
      .split(" ")
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(" ");
  }, []);

  const removeDragPreviewElement = React.useCallback(() => {
    const existingPreviewElement = dragPreviewElementRef.current;
    if (existingPreviewElement && existingPreviewElement.parentNode) {
      existingPreviewElement.parentNode.removeChild(existingPreviewElement);
    }
    dragPreviewElementRef.current = null;
    dragPreviewFollowPointerRef.current = false;
  }, []);

  const updateDragPreviewPosition = React.useCallback(
    (clientX: number | null | undefined, clientY: number | null | undefined) => {
      if (!dragPreviewFollowPointerRef.current) {
        return;
      }
      if (typeof clientX !== "number" || typeof clientY !== "number") {
        return;
      }
      const previewElement = dragPreviewElementRef.current;
      if (!previewElement) {
        return;
      }
      const previewWidth = previewElement.offsetWidth || 0;
      const previewHeight = previewElement.offsetHeight || 0;
      previewElement.style.transform = `translate3d(${clientX - previewWidth / 2}px, ${clientY - previewHeight / 2}px, 0)`;
    },
    [],
  );

  const hasCoarsePointer = React.useCallback((): boolean => {
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) {
      return true;
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      try {
        return window.matchMedia("(pointer: coarse)").matches;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const createDragPreviewElement = React.useCallback(
    (event: React.DragEvent<HTMLTableHeaderCellElement>, columnDisplayLabel: string) => {
      if (typeof document === "undefined" || typeof window === "undefined") {
        return;
      }

      removeDragPreviewElement();

      const headerElement = event.currentTarget;
      const headerStyles = window.getComputedStyle(headerElement);
      const headerBackgroundColor = headerStyles.backgroundColor.trim();
      const hasHeaderBackgroundColor =
        headerBackgroundColor.length > 0 &&
        headerBackgroundColor !== "rgba(0, 0, 0, 0)" &&
        headerBackgroundColor !== "transparent";
      const resolvedBackgroundColor = hasHeaderBackgroundColor
        ? headerBackgroundColor
        : "rgba(255, 255, 255, 0.96)";
      const resolvedTextColor =
        hasHeaderBackgroundColor && headerStyles.color && headerStyles.color.trim().length > 0
          ? headerStyles.color
          : "rgba(15, 23, 42, 0.9)";
      const resolvedBorderColor =
        headerStyles.borderColor && headerStyles.borderColor !== "rgba(0, 0, 0, 0)"
          ? headerStyles.borderColor
          : "rgba(148, 163, 184, 0.4)";

      const previewLabel =
        columnDisplayLabel.trim().length > 0
          ? columnDisplayLabel
          : formatColumnIdentifier(headerElement.id);

      const previewElement = document.createElement("div");
      previewElement.textContent = previewLabel;
      previewElement.style.padding = "6px 14px";
      previewElement.style.borderRadius = "9999px";
      previewElement.style.background = resolvedBackgroundColor;
      previewElement.style.color = resolvedTextColor;
      previewElement.style.fontSize = "12px";
      previewElement.style.fontWeight = "600";
      previewElement.style.letterSpacing = "0.01em";
      previewElement.style.border = `1px solid ${resolvedBorderColor}`;
      previewElement.style.pointerEvents = "none";
      previewElement.style.zIndex = "9999";
      previewElement.style.fontFamily =
        headerStyles.fontFamily && headerStyles.fontFamily.trim().length > 0
          ? headerStyles.fontFamily
          : "inherit";
      previewElement.style.whiteSpace = "nowrap";
      previewElement.style.display = "inline-flex";
      previewElement.style.alignItems = "center";
      previewElement.style.justifyContent = "center";
      previewElement.style.position = "fixed";
      previewElement.style.transform = "translate3d(-10000px, -10000px, 0)";

      const shouldFollowPointer = hasCoarsePointer();
      dragPreviewFollowPointerRef.current = shouldFollowPointer;

      if (shouldFollowPointer) {
        previewElement.style.left = "0";
        previewElement.style.top = "0";
      } else {
        previewElement.style.top = "-1000px";
        previewElement.style.left = "-1000px";
      }

      document.body.appendChild(previewElement);
      dragPreviewElementRef.current = previewElement;

      const previewWidth = previewElement.offsetWidth || 1;
      const previewHeight = previewElement.offsetHeight || 1;

      const dataTransfer = event.dataTransfer;
      if (dataTransfer && typeof dataTransfer.setDragImage === "function") {
        try {
          dataTransfer.setDragImage(previewElement, previewWidth / 2, previewHeight / 2);
        } catch {
          // Some browsers (iOS Safari) may throw - ignore and continue
        }
      }

      if (shouldFollowPointer) {
        updateDragPreviewPosition(
          event.clientX ?? event.nativeEvent?.clientX ?? null,
          event.clientY ?? event.nativeEvent?.clientY ?? null,
        );
      }
    },
    [formatColumnIdentifier, hasCoarsePointer, removeDragPreviewElement, updateDragPreviewPosition],
  );

  const handleColumnDragStart = React.useCallback(
    (
      event: React.DragEvent<HTMLTableHeaderCellElement>,
      columnIdentifier: string,
      columnDisplayLabel: string,
    ) => {
      if (!columnIdentifier) {
        return;
      }
      draggedColumnIdentifierRef.current = columnIdentifier;
      setDraggedColumnIdentifier(columnIdentifier);
      setDragHoverDetails(null);
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", columnIdentifier);
      }
      createDragPreviewElement(event, columnDisplayLabel);
      updateDragPreviewPosition(
        event.clientX ?? event.nativeEvent?.clientX ?? null,
        event.clientY ?? event.nativeEvent?.clientY ?? null,
      );
    },
    [createDragPreviewElement, updateDragPreviewPosition],
  );

  const handleColumnDragOver = React.useCallback(
    (event: React.DragEvent<HTMLTableHeaderCellElement>, targetColumnIdentifier: string) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      updateDragPreviewPosition(
        event.clientX ?? event.nativeEvent?.clientX ?? null,
        event.clientY ?? event.nativeEvent?.clientY ?? null,
      );

      const activeColumnIdentifier = draggedColumnIdentifierRef.current ?? draggedColumnIdentifier;
      if (!activeColumnIdentifier || activeColumnIdentifier === targetColumnIdentifier) {
        setDragHoverDetails(null);
        return;
      }

      const targetElement = event.currentTarget as HTMLElement;
      const targetBounds = targetElement.getBoundingClientRect();
      const pointerOffset = event.clientX - targetBounds.left;
      const position: "before" | "after" =
        pointerOffset < targetBounds.width / 2 ? "before" : "after";

      setDragHoverDetails({
        columnId: targetColumnIdentifier,
        position,
      });
    },
    [draggedColumnIdentifier, updateDragPreviewPosition],
  );

  const handleColumnDrop = React.useCallback(
    (event: React.DragEvent<HTMLTableHeaderCellElement>, targetColumnIdentifier: string) => {
      event.preventDefault();
      event.stopPropagation();

      const activeColumnIdentifier = draggedColumnIdentifierRef.current ?? draggedColumnIdentifier;
      if (!activeColumnIdentifier) {
        setDragHoverDetails(null);
        removeDragPreviewElement();
        return;
      }

      if (activeColumnIdentifier === targetColumnIdentifier) {
        draggedColumnIdentifierRef.current = null;
        setDraggedColumnIdentifier(null);
        setDragHoverDetails(null);
        removeDragPreviewElement();
        return;
      }

      const dropPosition =
        dragHoverDetails && dragHoverDetails.columnId === targetColumnIdentifier
          ? dragHoverDetails.position
          : "before";

      hasPendingLocalDashboardTablePreferenceEditRef.current = true;
      setColumnOrder((previousColumnOrder) => {
        if (
          !previousColumnOrder.includes(activeColumnIdentifier) ||
          !previousColumnOrder.includes(targetColumnIdentifier)
        ) {
          return previousColumnOrder;
        }

        const updatedOrder = previousColumnOrder.filter(
          (identifier) => identifier !== activeColumnIdentifier,
        );
        const targetIndex = updatedOrder.indexOf(targetColumnIdentifier);
        if (targetIndex === -1) {
          return previousColumnOrder;
        }
        const insertionIndex = dropPosition === "after" ? targetIndex + 1 : targetIndex;
        updatedOrder.splice(insertionIndex, 0, activeColumnIdentifier);
        return updatedOrder;
      });

      draggedColumnIdentifierRef.current = null;
      setDraggedColumnIdentifier(null);
      setDragHoverDetails(null);
      removeDragPreviewElement();
    },
    [draggedColumnIdentifier, dragHoverDetails, removeDragPreviewElement, setColumnOrder],
  );

  const handleColumnDragEnd = React.useCallback(() => {
    draggedColumnIdentifierRef.current = null;
    setDraggedColumnIdentifier(null);
    setDragHoverDetails(null);
    removeDragPreviewElement();
  }, [removeDragPreviewElement]);

  React.useEffect(() => {
    return () => {
      removeDragPreviewElement();
    };
  }, [removeDragPreviewElement]);

  // Selection state management (computed values after table creation)
  const currentPageRows = table.getRowModel().rows;
  const currentPageIds = currentPageRows.map((row) => row.original.id);
  const currentPageSelectedCount = currentPageIds.filter((id) => selectedRows.has(id)).length;

  const allSelected = React.useMemo(() => {
    return currentPageRows.length > 0 && currentPageSelectedCount === currentPageRows.length;
  }, [currentPageSelectedCount, currentPageRows.length]);

  const someSelected = React.useMemo(() => {
    return currentPageSelectedCount > 0 && currentPageSelectedCount < currentPageRows.length;
  }, [currentPageSelectedCount, currentPageRows.length]);

  // Update the toggle select all function with proper logic
  const toggleSelectAllCurrent = React.useCallback(() => {
    if (isReadOnly) {
      return;
    }
    if (allSelected) {
      // If user had previous selections and we're unchecking, restore them
      if (previousSelection && previousSelection.size > 0) {
        setSelectedRows(new Set(previousSelection));
        setPreviousSelection(null);
      } else {
        setSelectedRows(new Set());
      }
    } else {
      // Save current selection as previous selection
      if (selectedRows.size > 0) {
        setPreviousSelection(new Set(selectedRows));
      }
      // Select all items on current page
      const newSelection = new Set(selectedRows);
      currentPageIds.forEach((id) => newSelection.add(id));
      setSelectedRows(newSelection);
    }
  }, [
    allSelected,
    isReadOnly,
    previousSelection,
    selectedRows,
    currentPageIds,
    setPreviousSelection,
  ]);

  // Keyboard shortcuts
  React.useEffect(() => {
    if (isReadOnly) {
      return;
    }

    const handleKeydown = (e: KeyboardEvent) => {
      // Cmd+A / Ctrl+A to select all
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && !e.shiftKey) {
        // Only handle if we're not typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          toggleSelectAllCurrent();
        }
      }
      // Escape to clear selection
      if (e.key === "Escape") {
        setSelectedRows(new Set());
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [isReadOnly, toggleSelectAllCurrent]);

  // Create the final columns with the select-all header checkbox.
  const finalCols = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    if (isReadOnly) {
      return baseCols;
    }

    return [
      {
        id: "select",
        ...RSVP_SELECT_COLUMN_SIZING,
        header: RsvpSelectHeaderCell,
        meta: { label: "Select all" },
        cell: RsvpSelectCell,
        enableSorting: false,
        enableHiding: false,
      },
      ...baseCols,
    ];
  }, [baseCols, isReadOnly]);

  // Update table columns when they change
  React.useEffect(() => {
    table.setOptions((prev) => ({
      ...prev,
      columns: finalCols,
    }));
  }, [finalCols, table]);

  // Check if any main queries are loading
  const isLoading =
    events === undefined ||
    rsvpsPaginated === undefined ||
    currentEvent === undefined ||
    totalCount === undefined;

  // Helper function to get column display name
  const getColumnDisplayName = React.useCallback(
    (columnId: string): string => {
      if (columnId.startsWith("custom_")) {
        const fieldKey = columnId.replace("custom_", "");
        const field = currentEvent?.customFields?.find((f) => f.key === fieldKey);
        return field ? field.label.replace(/:\s*$/, "").trim() : formatColumnIdentifier(columnId);
      }
      if (columnId.startsWith("social_")) {
        const platformKey = columnId.replace("social_", "");
        const platform = currentEventSocialPlatforms.find(
          (socialPlatform) => socialPlatform.platformKey === platformKey,
        );
        return platform?.label ?? formatColumnIdentifier(columnId);
      }

      const columnMap: Record<string, string> = {
        select: "Select",
        guest: "Guest",
        listKey: "List",
        attendees: "Attendees",
        smsConsent: "SMS Consent",
        referredByName: "Referred By",
        noteForHosts: "Note for Hosts",
        createdAt: "Created",
        approvalStatus: "Approval",
        attendanceStatus: "Attendance",
        ticketStatus: "Ticket",
        ticketViewedAt: "Ticket Viewed",
        actions: "Action",
      };

      return columnMap[columnId] || formatColumnIdentifier(columnId);
    },
    [currentEvent?.customFields, currentEventSocialPlatforms, formatColumnIdentifier],
  );

  const handleExportCsv = React.useCallback(async (): Promise<boolean> => {
    if (!eventId) {
      toast.error("Select an event before exporting");
      return false;
    }
    if (!workspaceScope) {
      toast.error("Workspace scope is required to export RSVPs");
      return false;
    }

    if (selectedListsForExport.length === 0) {
      toast.error("Select at least one list to export");
      return false;
    }

    if (selectedStatusesForExport.length === 0) {
      toast.error("Select at least one status to export");
      return false;
    }

    setIsExportingCsv(true);
    try {
      const exportResult = await runExportRsvpsCsv({
        eventId: eventId as Id<"events">,
        listKeys: selectedListsForExport,
        statusFilters: selectedStatusesForExport,
        includeAttendees,
        includeNote,
        includeCustomFields,
        includePhone,
        includeSocialPlatformKeys: selectedSocialPlatformKeysForExport,
        includeInvitedBy,
        ...workspaceScope.queryArgs,
        exportTimestamp: new Date().toLocaleString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      });

      const blob = new Blob([exportResult.csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to export CSV: ${errorMessage}`);
      return false;
    } finally {
      setIsExportingCsv(false);
    }
  }, [
    eventId,
    includeAttendees,
    includeCustomFields,
    includeInvitedBy,
    includeNote,
    includePhone,
    runExportRsvpsCsv,
    selectedListsForExport,
    selectedSocialPlatformKeysForExport,
    selectedStatusesForExport,
    workspaceScope,
  ]);

  const renderRowContextMenuContent = (rsvp: HostRsvp) => {
    const availableListKeys = listCredentials?.map((credential) => credential.listKey) ?? [];
    const contextActionRsvps = getRsvpContextActionTargets({
      contextRow: rsvp,
      rows: rsvps,
      selectedRowIds: selectedRows,
    });
    const usesSelectionBatch = contextActionRsvps.length > 1;
    const selectionBatchLabel = usesSelectionBatch
      ? ` (${contextActionRsvps.length} selected)`
      : "";
    const currentTicketStatus = normalizeTicketStatus(rsvp.redemptionStatus);
    const canViewQrCode = canShowRsvpQrCode(rsvp);
    const isUpdatingList = contextActionRsvps.some((targetRsvp) =>
      loadingListUpdates.has(targetRsvp.id),
    );
    const isUpdatingApproval = contextActionRsvps.some((targetRsvp) =>
      loadingApprovalUpdates.has(targetRsvp.id),
    );
    const isUpdatingAttendance = contextActionRsvps.some((targetRsvp) =>
      loadingAttendanceUpdates.has(targetRsvp.id),
    );
    const isUpdatingTicket = contextActionRsvps.some((targetRsvp) =>
      loadingTicketUpdates.has(targetRsvp.id),
    );
    const handleContextListChange = (listKey: string) => {
      if (usesSelectionBatch) {
        void handleBulkListChange(listKey);
        return;
      }
      handleSingleListKeyChange(rsvp, listKey);
    };
    const handleContextApprovalChange = (approvalStatusOption: ApprovalStatusOption) => {
      if (usesSelectionBatch) {
        void handleBulkApprovalChange(approvalStatusOption);
        return;
      }
      handleSingleApprovalChange(rsvp, approvalStatusOption);
    };
    const handleContextAttendanceStatusChange = (
      attendanceStatusOption: AttendanceStatusOption,
    ) => {
      if (usesSelectionBatch) {
        void handleBulkAttendanceStatusChange(attendanceStatusOption);
        return;
      }
      handleSingleAttendanceStatusChange(rsvp, attendanceStatusOption);
    };
    const handleContextTicketStatusChange = (ticketStatusOption: TicketStatusOption) => {
      if (usesSelectionBatch) {
        void handleBulkTicketStatusChange(ticketStatusOption);
        return;
      }
      handleSingleTicketStatusChange(rsvp, ticketStatusOption);
    };

    if (isReadOnly) {
      return (
        <ContextMenuContent className="w-56">
          {canViewQrCode ? (
            <ContextMenuItem onSelect={() => openRsvpQrCode(rsvp)}>
              <QrCode className="h-4 w-4" />
              View QR Code
            </ContextMenuItem>
          ) : (
            <ContextMenuItem disabled>No row actions</ContextMenuItem>
          )}
        </ContextMenuContent>
      );
    }

    return (
      <ContextMenuContent className="w-56">
        <ContextMenuItem
          onSelect={() => router.push(`${usersPath}/${encodeURIComponent(`rsvp~${rsvp.id}`)}`)}
        >
          <ExternalLink className="h-4 w-4" />
          Open User Profile
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={availableListKeys.length <= 1 || isUpdatingList}>
            Change List{selectionBatchLabel}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {availableListKeys.map((listKey) => (
              <ContextMenuItem
                key={listKey}
                disabled={
                  contextActionRsvps.every((targetRsvp) => targetRsvp.listKey === listKey) ||
                  isUpdatingList
                }
                onSelect={() => handleContextListChange(listKey)}
              >
                {isUpdatingList && listKey === rsvp.listKey && <Spinner className="h-3 w-3" />}
                {listKey.toUpperCase()}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={isUpdatingApproval}>
            Change Approval{selectionBatchLabel}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {APPROVAL_STATUS_OPTIONS.map((approvalStatusOption) => {
              const allTargetsAlreadyHaveApprovalStatus = contextActionRsvps.every(
                (targetRsvp) => targetRsvp.approvalStatus === approvalStatusOption,
              );
              const allTargetsLockPendingApproval =
                approvalStatusOption === "pending" &&
                contextActionRsvps.every(
                  (targetRsvp) => targetRsvp.redemptionStatus === "redeemed",
                );
              const approvalStatusClassName =
                approvalStatusOption === "approved"
                  ? "text-green-700"
                  : approvalStatusOption === "denied"
                    ? "text-red-700"
                    : "text-amber-700";

              return (
                <ContextMenuItem
                  key={approvalStatusOption}
                  disabled={
                    allTargetsAlreadyHaveApprovalStatus ||
                    allTargetsLockPendingApproval ||
                    isUpdatingApproval
                  }
                  onSelect={() => handleContextApprovalChange(approvalStatusOption)}
                >
                  {isUpdatingApproval && approvalStatusOption === rsvp.approvalStatus && (
                    <Spinner className="h-3 w-3" />
                  )}
                  <span className={approvalStatusClassName}>
                    {getApprovalStatusLabel(approvalStatusOption)}
                  </span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={isUpdatingAttendance}>
            Change Attendance{selectionBatchLabel}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {ATTENDANCE_STATUS_OPTIONS.map((attendanceStatusOption) => {
              const allTargetsAlreadyHaveAttendanceStatus = contextActionRsvps.every(
                (targetRsvp) => targetRsvp.attendanceStatus === attendanceStatusOption,
              );
              const attendanceStatusClassName =
                attendanceStatusOption === "yes"
                  ? "text-green-700"
                  : attendanceStatusOption === "maybe"
                    ? "text-amber-700"
                    : "text-red-700";

              return (
                <ContextMenuItem
                  key={attendanceStatusOption}
                  disabled={allTargetsAlreadyHaveAttendanceStatus || isUpdatingAttendance}
                  onSelect={() => handleContextAttendanceStatusChange(attendanceStatusOption)}
                >
                  {isUpdatingAttendance && attendanceStatusOption === rsvp.attendanceStatus && (
                    <Spinner className="h-3 w-3" />
                  )}
                  <span className={attendanceStatusClassName}>
                    {getAttendanceStatusLabel(attendanceStatusOption)}
                  </span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger
            disabled={
              !contextActionRsvps.some(
                (targetRsvp) =>
                  canEditTicketForRsvp(targetRsvp) &&
                  normalizeTicketStatus(targetRsvp.redemptionStatus) !== "redeemed",
              ) || isUpdatingTicket
            }
          >
            Change Ticket{selectionBatchLabel}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {TICKET_STATUS_OPTIONS.map((ticketStatusOption) => {
              const hasChangeableTarget = contextActionRsvps.some(
                (targetRsvp) =>
                  canEditTicketForRsvp(targetRsvp) &&
                  normalizeTicketStatus(targetRsvp.redemptionStatus) !== "redeemed" &&
                  normalizeTicketStatus(targetRsvp.redemptionStatus) !== ticketStatusOption,
              );
              const ticketStatusClassName =
                ticketStatusOption === "issued"
                  ? "text-purple-700"
                  : ticketStatusOption === "disabled"
                    ? "text-red-700"
                    : "text-gray-700";

              return (
                <ContextMenuItem
                  key={ticketStatusOption}
                  disabled={!hasChangeableTarget || isUpdatingTicket}
                  onSelect={() => handleContextTicketStatusChange(ticketStatusOption)}
                >
                  {isUpdatingTicket && ticketStatusOption === currentTicketStatus && (
                    <Spinner className="h-3 w-3" />
                  )}
                  <span className={ticketStatusClassName}>
                    {getTicketStatusLabel(ticketStatusOption)}
                  </span>
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        {canViewQrCode && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => openRsvpQrCode(rsvp)}>
              <QrCode className="h-4 w-4" />
              View QR Code
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          disabled={deleteRsvpCompleteMutation.isPending || bulkDeleteRsvpsMutation.isPending}
          onSelect={() => setRsvpsPendingDeletion(contextActionRsvps)}
        >
          {usesSelectionBatch
            ? `Delete ${contextActionRsvps.length} Selected RSVPs`
            : "Delete RSVP"}
        </ContextMenuItem>
      </ContextMenuContent>
    );
  };

  const tableColumnTotalWidth = table.getTotalSize();
  const tableFillerColumnWidth = getRsvpTableFillerColumnWidth({
    containerWidth: tableContainerWidth,
    columnTotalWidth: tableColumnTotalWidth,
  });
  const tableDisplayWidth = getRsvpTableDisplayWidth({
    containerWidth: tableContainerWidth,
    columnTotalWidth: tableColumnTotalWidth,
  });
  const shouldRenderTableFillerColumn = tableFillerColumnWidth > 0;
  const pendingDeletionCount = rsvpsPendingDeletion.length;
  const deletionMutationIsPending =
    deleteRsvpCompleteMutation.isPending || bulkDeleteRsvpsMutation.isPending;
  const pendingDeletionTitle = pendingDeletionCount > 1 ? "Delete Selected RSVPs" : "Delete RSVP";
  const pendingDeletionGuestName =
    pendingDeletionCount === 1 && rsvpsPendingDeletion[0]
      ? getRsvpGuestName(rsvpsPendingDeletion[0])
      : null;
  const pendingDeletionDescription =
    pendingDeletionCount > 1
      ? `Are you sure you want to delete ${pendingDeletionCount} selected RSVPs? This will permanently remove the RSVPs, any associated ticket/redemption codes, and approval history. This action cannot be undone.`
      : `Are you sure you want to delete ${
          pendingDeletionGuestName ? `${pendingDeletionGuestName}'s RSVP` : "this RSVP"
        }? This will permanently remove the RSVP, any associated ticket/redemption codes, and approval history. This action cannot be undone.`;
  const pendingDeletionActionLabel =
    pendingDeletionCount > 1 ? `Delete ${pendingDeletionCount} RSVPs` : "Delete RSVP";

  const rsvpTableContextValue = React.useMemo<RsvpTableContextValue>(
    () => ({
      isReadOnly,
      listCredentials,
      loadingListUpdates,
      loadingApprovalUpdates,
      loadingAttendanceUpdates,
      loadingTicketUpdates,
      selectedRows,
      allSelected,
      someSelected,
      deleteRsvpCompleteIsPending: deleteRsvpCompleteMutation.isPending,
      canEditTicketForRsvp,
      handleSingleListKeyChange,
      handleSingleApprovalChange,
      handleSingleAttendanceStatusChange,
      handleSingleTicketStatusChange,
      openRsvpQrCode,
      onDeleteRsvp: handleDeleteSingleRsvp,
      beginSelectionDrag,
      extendSelectionDrag,
      toggleSelectAllCurrent,
    }),
    [
      isReadOnly,
      listCredentials,
      loadingListUpdates,
      loadingApprovalUpdates,
      loadingAttendanceUpdates,
      loadingTicketUpdates,
      selectedRows,
      allSelected,
      someSelected,
      deleteRsvpCompleteMutation.isPending,
      canEditTicketForRsvp,
      handleSingleListKeyChange,
      handleSingleApprovalChange,
      handleSingleAttendanceStatusChange,
      handleSingleTicketStatusChange,
      openRsvpQrCode,
      handleDeleteSingleRsvp,
      beginSelectionDrag,
      extendSelectionDrag,
      toggleSelectAllCurrent,
    ],
  );

  // Hidden anchor ref used to keep the Share popover anchored to the (...) trigger after the
  // dropdown menu closes. The invisible button shares the (...) button's bounding box (via
  // `absolute inset-0`), so the popover renders in the same place as if the user had clicked a
  // visible Share button.
  const shareEventTriggerRef = React.useRef<HTMLButtonElement>(null);

  return (
    <RsvpTableContext.Provider value={rsvpTableContextValue}>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:gap-1">
            <h2
              className={
                embedded
                  ? "text-xl font-semibold tracking-tight"
                  : "text-3xl font-bold tracking-tight"
              }
            >
              {embedded ? "Guest manager" : "Guests"}
            </h2>
            <p className="text-muted-foreground">Manage guest responses, tickets, and attendance</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative inline-block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-center px-3"
                    aria-label="Open event actions"
                    disabled={!currentEvent}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onSelect={(menuEvent) => {
                      menuEvent.preventDefault();
                      handleOpenCurrentEventView();
                    }}
                    disabled={!currentEvent}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {isCurrentEventDraft ? "Continue editing" : "View Event"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(menuEvent) => {
                      menuEvent.preventDefault();
                      requestAnimationFrame(() => shareEventTriggerRef.current?.click());
                    }}
                    disabled={!canShareCurrentEvent}
                  >
                    <Share className="h-4 w-4 mr-2" />
                    Share Event
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(menuEvent) => {
                      menuEvent.preventDefault();
                      if (currentEvent) {
                        router.push(`${eventsPath}/${currentEvent._id}`);
                      }
                    }}
                    disabled={!currentEvent || isReadOnly}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Configure Event
                  </DropdownMenuItem>
                  {showSendPendingQrCodesAction && (
                    <DropdownMenuItem
                      disabled={isSendingQrBatch}
                      onSelect={(menuEvent) => {
                        menuEvent.preventDefault();
                        void handleSendCurrentEventPendingQrCodes();
                      }}
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      {isSendingQrBatch
                        ? "Sending QR codes..."
                        : `Send QR codes (${pendingDeferredQrCount})`}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={(menuEvent) => {
                      menuEvent.preventDefault();
                      void handleToggleCurrentEventLifecycle();
                    }}
                    disabled={!currentEvent || isReadOnly}
                  >
                    {isCurrentEventDraft ? (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    ) : (
                      <EyeOff className="h-4 w-4 mr-2" />
                    )}
                    {currentEventLifecycleActionLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(menuEvent) => {
                      menuEvent.preventDefault();
                      void handleSetCurrentEventFeatured();
                    }}
                    disabled={!currentEvent || isReadOnly || currentEvent?.isFeatured === true}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {currentEvent?.isFeatured ? "Already Featured" : "Set as Featured"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {!isReadOnly && (
                    <DropdownMenuItem
                      onSelect={() => setExportOptionsOpen(true)}
                      disabled={!eventId}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={(menuEvent) => {
                      menuEvent.preventDefault();
                      setColumnVisibilityOpen(true);
                    }}
                  >
                    <Columns className="h-4 w-4 mr-2" />
                    Columns
                  </DropdownMenuItem>
                  {!isReadOnly && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(menuEvent) => {
                          menuEvent.preventDefault();
                          setShowDeleteEventDialog(true);
                        }}
                        disabled={!currentEvent}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Event
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Hidden popover anchor sits on top of the (...) button so Share positions cleanly
                  after the menu closes. */}
              {currentEvent && canShareCurrentEvent && (
                <ShareEventPopover
                  eventId={currentEvent._id}
                  eventUrl={publicEventUrl}
                  siteKey={workspaceScope?.siteKey}
                  workspaceSlug={workspaceScope?.workspaceSlug}
                >
                  <button
                    ref={shareEventTriggerRef}
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="pointer-events-none absolute inset-0 opacity-0"
                  />
                </ShareEventPopover>
              )}
            </div>
          </div>
        </div>
        <RsvpExportDialog
          isOpen={exportOptionsOpen}
          onOpenChange={setExportOptionsOpen}
          listCredentials={listCredentials}
          selectedListsForExport={selectedListsForExport}
          setSelectedListsForExport={setSelectedListsForExport}
          selectedStatusesForExport={selectedStatusesForExport}
          setSelectedStatusesForExport={setSelectedStatusesForExport}
          selectedSocialPlatformKeysForExport={selectedSocialPlatformKeysForExport}
          setSelectedSocialPlatformKeysForExport={setSelectedSocialPlatformKeysForExport}
          includeInvitedBy={includeInvitedBy}
          setIncludeInvitedBy={setIncludeInvitedBy}
          includeAttendees={includeAttendees}
          setIncludeAttendees={setIncludeAttendees}
          includeNote={includeNote}
          setIncludeNote={setIncludeNote}
          includeCustomFields={includeCustomFields}
          setIncludeCustomFields={setIncludeCustomFields}
          includePhone={includePhone}
          setIncludePhone={setIncludePhone}
          currentEventInvitedByPrimaryFieldConfig={currentEventInvitedByPrimaryFieldConfig}
          currentEventSocialPlatforms={currentEventSocialPlatforms}
          isExportingCsv={isExportingCsv}
          isLoading={isLoading}
          onExport={handleExportCsv}
        />
        <RsvpToolbar
          eventsSorted={eventsSorted}
          eventId={eventId}
          setEventId={setEventId}
          guestSearch={guestSearch}
          setGuestSearch={setGuestSearch}
          approvalFilter={approvalFilter}
          setApprovalFilter={setApprovalFilter}
          listFilter={listFilter}
          setListFilter={setListFilter}
          redemptionFilter={redemptionFilter}
          setRedemptionFilter={setRedemptionFilter}
          qrDeliveryFilter={qrDeliveryFilter}
          setQrDeliveryFilter={setQrDeliveryFilter}
          socialPlatformFilter={socialPlatformFilter}
          setSocialPlatformFilter={setSocialPlatformFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          uniqueApprovalStatuses={uniqueApprovalStatuses}
          uniqueListKeys={uniqueListKeys}
          shouldShowSocialPlatformFilter={shouldShowSocialPlatformFilter}
          currentEventSocialPlatforms={currentEventSocialPlatforms}
          currentEvent={currentEvent}
          columnVisibilityOpen={columnVisibilityOpen}
          setColumnVisibilityOpen={setColumnVisibilityOpen}
          visibleColumns={visibleColumns}
          columnVisibility={columnVisibility}
          handleColumnVisibilityChange={handleColumnVisibilityChange}
          getAllAvailableColumnIds={getAllAvailableColumnIds}
          getColumnDisplayName={getColumnDisplayName}
          hasActiveFilters={hasActiveFilters}
          clearAllFilters={clearAllFilters}
          rsvpCount={rsvps.length}
          showEventSelector={!lockEvent}
        />

        {/* Bulk Actions Bar — hidden during a "select" paint drag (to avoid a jumpy bar as rows
          are added). During a "deselect" paint drag the bar stays mounted even if the count
          briefly hits zero, so it doesn't flicker out under the user's pointer. */}
        {!isReadOnly &&
          selectionDragMode !== "select" &&
          (selectionDragMode === "deselect" || selectedRows.size > 0) && (
            <div className="flex items-center justify-between bg-muted/50 border rounded-md p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{selectedRows.size} selected</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedRows(new Set())}>
                  Clear selection
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenReviewFeed}
                  disabled={selectedRsvpIdsInCurrentOrder.length === 0}
                >
                  <Eye className="h-4 w-4" />
                  Review feed
                </Button>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="inline-block">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={(e) => {
                          // Programmatically trigger context menu on left click
                          const rect = e.currentTarget.getBoundingClientRect();
                          const contextMenuEvent = new MouseEvent("contextmenu", {
                            bubbles: true,
                            clientX: rect.left,
                            clientY: rect.bottom,
                          });
                          e.currentTarget.dispatchEvent(contextMenuEvent);
                        }}
                      >
                        <span className="text-lg leading-none">⋯</span>
                      </Button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Change List</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-48">
                        {(listCredentials?.map((cred) => cred.listKey) || []).map((listKey) => (
                          <ContextMenuItem
                            key={listKey}
                            onSelect={() => handleBulkListChange(listKey)}
                          >
                            {listKey.toUpperCase()}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Change Approval</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-48">
                        <ContextMenuItem onSelect={() => handleBulkApprovalChange("pending")}>
                          <span className="text-amber-700">Pending</span>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => handleBulkApprovalChange("approved")}>
                          <span className="text-green-700">Approved</span>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => handleBulkApprovalChange("denied")}>
                          <span className="text-red-700">Denied</span>
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Change Attendance</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-48">
                        <ContextMenuItem onSelect={() => handleBulkAttendanceStatusChange("yes")}>
                          <span className="text-green-700">Yes</span>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => handleBulkAttendanceStatusChange("maybe")}>
                          <span className="text-amber-700">Maybe</span>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => handleBulkAttendanceStatusChange("no")}>
                          <span className="text-red-700">No</span>
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>Change Ticket</ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-48">
                        <ContextMenuItem
                          onSelect={() => handleBulkTicketStatusChange("not-issued")}
                        >
                          <span className="text-gray-700">None</span>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => handleBulkTicketStatusChange("issued")}>
                          <span className="text-purple-700">Issued</span>
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => handleBulkTicketStatusChange("disabled")}>
                          <span className="text-red-700">Disabled</span>
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <ContextMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                          Delete Selected
                        </ContextMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Selected RSVPs</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedRows.size} selected RSVPs? This
                            will permanently remove the RSVPs, any associated ticket/redemption
                            codes, and approval history. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleBulkDelete}
                            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                          >
                            Delete {selectedRows.size} RSVPs
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>
          )}

        <RsvpTable
          table={table}
          isLoading={isLoading}
          setTableContainerElement={setTableContainerElement}
          tableDisplayWidth={tableDisplayWidth}
          tableFillerColumnWidth={tableFillerColumnWidth}
          shouldRenderTableFillerColumn={shouldRenderTableFillerColumn}
          draggedColumnIdentifier={draggedColumnIdentifier}
          dragHoverDetails={dragHoverDetails}
          handleColumnDragStart={handleColumnDragStart}
          handleColumnDragOver={handleColumnDragOver}
          handleColumnDrop={handleColumnDrop}
          handleColumnDragEnd={handleColumnDragEnd}
          formatColumnIdentifier={formatColumnIdentifier}
          getColumnDisplayName={getColumnDisplayName}
          pendingChanges={pendingChanges}
          renderRowContextMenuContent={renderRowContextMenuContent}
        />

        <RsvpPagination
          isLoading={isLoading}
          rsvpsPaginated={rsvpsPaginated}
          rsvps={rsvps}
          startItem={startItem}
          endItem={endItem}
          totalCount={totalCount}
          hasActiveFilters={hasActiveFilters}
          pageSize={pageSize}
          searchParams={searchParams}
          router={router}
          rsvpsPath={rsvpsPath}
          cursor={cursor}
          cursorHistory={cursorHistory}
          setCursor={setCursor}
          setCursorHistory={setCursorHistory}
          goToPreviousPage={goToPreviousPage}
          goToNextPage={goToNextPage}
          currentPage={currentPage}
        />

        <AlertDialog
          open={pendingDeletionCount > 0}
          onOpenChange={(open) => {
            if (!open) {
              setRsvpsPendingDeletion([]);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pendingDeletionTitle}</AlertDialogTitle>
              <AlertDialogDescription>{pendingDeletionDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmPendingDelete}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                disabled={deletionMutationIsPending}
              >
                {deletionMutationIsPending && <Spinner className="mr-1 h-3 w-3" />}
                {pendingDeletionActionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={showQR} onOpenChange={setShowQR}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Guest QR Code</DialogTitle>
              <DialogDescription>
                QR code for guest entry. Show this at the door for admission.
              </DialogDescription>
            </DialogHeader>
            {qr && (
              <div className="flex flex-col items-center gap-3 py-2">
                <QRCode value={qr.url} size={200} />

                {/* Status and List Key Info */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Status:</span>
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs ${
                        qr.status === "disabled"
                          ? "bg-gray-200 text-gray-800"
                          : qr.status === "redeemed"
                            ? "bg-blue-100 text-blue-800"
                            : qr.status === "issued"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-foreground/10 text-foreground/80"
                      }`}
                    >
                      {qr.status === "disabled"
                        ? "Disabled"
                        : qr.status === "redeemed"
                          ? "Redeemed"
                          : qr.status === "issued"
                            ? "Issued"
                            : "Unknown"}
                    </span>
                  </div>

                  {qr.listKey && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">List:</span>
                      <span className="text-sm">{qr.listKey.toUpperCase()}</span>
                    </div>
                  )}
                </div>

                <div className="text-xs break-all text-center text-foreground/70">{qr.url}</div>

                {qr.status === "disabled" && (
                  <div className="text-xs text-red-600 text-center font-medium">
                    ⚠️ This QR code is disabled and cannot be redeemed
                  </div>
                )}

                {qr.status === "redeemed" && (
                  <div className="text-xs text-blue-600 text-center font-medium">
                    ✅ This QR code has already been redeemed
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(qr.url);
                      toast.success("Link copied");
                    }}
                  >
                    Copy link
                  </Button>
                  <Button size="sm" onClick={() => setShowQR(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={showDeleteEventDialog} onOpenChange={setShowDeleteEventDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this event?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the event and its list credentials. RSVPs will be
                preserved but can no longer be redeemed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(deleteEventClick) => {
                  deleteEventClick.preventDefault();
                  void handleDeleteCurrentEvent();
                }}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                Delete Event
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RsvpTableContext.Provider>
  );
}

export default function RsvpsPage() {
  return <GuestManager />;
}

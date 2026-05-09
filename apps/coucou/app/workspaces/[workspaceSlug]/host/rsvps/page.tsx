"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import {
  type CellContext,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type HeaderContext,
  type RowData,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useAction, useQuery } from "convex/react";
import {
  Columns,
  Copy,
  Download,
  ExternalLink,
  Eye,
  GripVertical,
  Link,
  QrCode,
  Share,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import { formatEventTitleInline } from "@/lib/event-display";
import { buildPublicEventUrl } from "@/lib/event-public-url";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { Event, HostRsvp, ListCredential } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn, ensureAbsoluteUrl, sanitizeFieldValue } from "@/lib/utils";

type PaginatedHostRsvpResult = {
  page: HostRsvp[];
  nextCursor: string | null;
  isDone: boolean;
};

type ApprovalStatusOption = "pending" | "approved" | "denied";
type ApprovalFilterOption = "all" | ApprovalStatusOption;
type TicketStatusOption = "issued" | "not-issued" | "disabled";
type TicketDisplayStatus = TicketStatusOption | "redeemed";
type UpdateRsvpCompleteInput = {
  rsvpId: Id<"rsvps">;
  siteKey: string;
  workspaceSlug: string;
  approvalStatus?: ApprovalStatusOption;
  ticketStatus?: TicketStatusOption;
};
type ExportableApprovalStatusOption = "pending" | "approved" | "denied" | "attending";

const hasStringAccessorKey = <TData extends RowData>(
  columnDefinition: ColumnDef<TData>,
): columnDefinition is ColumnDef<TData> & { accessorKey: string } => {
  const candidateAccessorKey = (columnDefinition as { accessorKey?: unknown }).accessorKey;
  return typeof candidateAccessorKey === "string";
};

const EXPORT_STATUS_OPTIONS: ExportableApprovalStatusOption[] = [
  "pending",
  "approved",
  "denied",
  "attending",
];

export default function RsvpsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const workspaceAccess = useWorkspaceAccess();
  const isReadOnly = workspaceAccess?.canWrite === false;
  const rsvpsPath = useWorkspaceOperationPath("host", "rsvps");
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
  const initialId = searchParams.get("eventId") ?? eventsSorted[0]?._id;
  const [eventId, setEventId] = React.useState<string | undefined>(initialId);
  React.useEffect(() => {
    if (!eventId && eventsSorted[0]?._id) {
      setEventId(eventsSorted[0]._id);
    }
  }, [eventId, eventsSorted]);

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
  const [socialPlatformFilter, setSocialPlatformFilter] = React.useState<string>("all");
  const [socialSearch, setSocialSearch] = React.useState("");
  const debouncedSocialSearch = useDebounce(socialSearch, 250);
  const [invitedBySearch, setInvitedBySearch] = React.useState("");
  const debouncedInvitedBySearch = useDebounce(invitedBySearch, 250);
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
    socialPlatformFilter,
    debouncedSocialSearch,
    debouncedInvitedBySearch,
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
          socialPlatformFilter,
          socialSearch: debouncedSocialSearch,
          invitedBySearch: debouncedInvitedBySearch,
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
          socialPlatformFilter,
          socialSearch: debouncedSocialSearch,
          invitedBySearch: debouncedInvitedBySearch,
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

  const listCredentials = useQuery(
    api.credentials.getCredsForEvent,
    eventId && workspaceScope
      ? { eventId: eventId as Id<"events">, ...workspaceScope.queryArgs }
      : "skip",
  ) as ListCredential[] | undefined;

  const [exportOptionsOpen, setExportOptionsOpen] = React.useState(false);
  const [selectedListsForExport, setSelectedListsForExport] = React.useState<string[]>([]);
  const [selectedStatusesForExport, setSelectedStatusesForExport] =
    React.useState<ExportableApprovalStatusOption[]>(EXPORT_STATUS_OPTIONS);
  const [includeAttendees, setIncludeAttendees] = React.useState(true);
  const [includeNote, setIncludeNote] = React.useState(true);
  const [includeCustomFields, setIncludeCustomFields] = React.useState(true);
  const [includePhone, setIncludePhone] = React.useState(true);
  const [isExportingCsv, setIsExportingCsv] = React.useState(false);
  const runExportRsvpsCsv = useAction(api.exports.exportRsvpsCsv);

  // Column visibility state
  const [columnVisibilityOpen, setColumnVisibilityOpen] = React.useState(false);

  // Get all available column IDs (static + dynamic custom fields)
  const getAllAvailableColumnIds = React.useCallback((): string[] => {
    const staticColumnIds = [
      ...(isReadOnly ? [] : ["select"]),
      "guest",
      "listKey",
      "attendees",
      "smsConsent",
      ...(currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true ? ["invitedByName"] : []),
      "referredByName",
      "noteForHosts",
      "createdAt",
      "approvalStatus",
      "ticketStatus",
      ...(isReadOnly ? [] : ["actions"]),
    ];
    const customFieldColumnIds =
      currentEvent?.customFields?.map((field) => `custom_${field.key}`) || [];
    const socialFieldColumnIds =
      currentEvent?.primaryFieldConfig?.socialPlatforms?.map(
        (platform) => `social_${platform.platformKey}`,
      ) || [];
    return [...staticColumnIds, ...socialFieldColumnIds, ...customFieldColumnIds];
  }, [currentEvent?.customFields, currentEvent?.primaryFieldConfig, isReadOnly]);

  // Initialize visible columns: all except "noteForHosts"
  const [visibleColumns, setVisibleColumns] = React.useState<Set<string>>(() => {
    const allColumnIds = [
      ...(isReadOnly ? [] : ["select"]),
      "guest",
      "listKey",
      "attendees",
      "smsConsent",
      ...(currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true ? ["invitedByName"] : []),
      "referredByName",
      "createdAt",
      "approvalStatus",
      "ticketStatus",
      ...(isReadOnly ? [] : ["actions"]),
    ];
    return new Set(allColumnIds);
  });

  // Convert visibleColumns Set to columnVisibility object for TanStack Table
  const columnVisibility = React.useMemo(() => {
    const visibility: Record<string, boolean> = {};
    getAllAvailableColumnIds().forEach((columnId) => {
      visibility[columnId] =
        visibleColumns.has(columnId) &&
        (!isReadOnly || (columnId !== "select" && columnId !== "actions"));
    });
    return visibility;
  }, [visibleColumns, getAllAvailableColumnIds, isReadOnly]);

  // Handle column visibility changes from TanStack Table
  const handleColumnVisibilityChange = React.useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
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

  // Update visible columns when custom fields change
  React.useEffect(() => {
    setVisibleColumns((previousVisibleColumns) => {
      const allColumnIds = getAllAvailableColumnIds();
      const updatedVisibleColumns = new Set(previousVisibleColumns);

      // Add new custom field columns (they'll be visible by default)
      allColumnIds.forEach((columnId) => {
        if (columnId.startsWith("custom_")) {
          updatedVisibleColumns.add(columnId);
        }
        if (columnId.startsWith("social_") || columnId === "invitedByName") {
          updatedVisibleColumns.add(columnId);
        }
      });

      // Remove columns that no longer exist
      Array.from(updatedVisibleColumns).forEach((columnId) => {
        if (
          !allColumnIds.includes(columnId) ||
          (isReadOnly && (columnId === "select" || columnId === "actions"))
        ) {
          updatedVisibleColumns.delete(columnId);
        }
      });

      return updatedVisibleColumns;
    });
  }, [getAllAvailableColumnIds, isReadOnly]);

  React.useEffect(() => {
    if (listCredentials && selectedListsForExport.length === 0) {
      setSelectedListsForExport(listCredentials.map((cred) => cred.listKey) || []);
    }
  }, [listCredentials, selectedListsForExport.length]);

  // Convert mutations to TanStack Query
  const updateRsvpCompleteMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateRsvpComplete),
  });
  const updateRsvpListKeyMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.updateRsvpListKey),
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
  const bulkUpdateTicketStatusMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkUpdateTicketStatus),
  });
  const bulkDeleteRsvpsMutation = useMutation({
    mutationFn: useConvexMutation(api.rsvps.bulkDeleteRsvps),
  });
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "guest", desc: false }]);
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>({});
  const [pendingChanges, setPendingChanges] = React.useState<
    Record<
      string,
      {
        originalApprovalStatus: ApprovalStatusOption;
        originalTicketStatus: TicketDisplayStatus;
        currentApprovalStatus: ApprovalStatusOption;
        currentTicketStatus: TicketDisplayStatus;
      }
    >
  >({});
  const [showQR, setShowQR] = React.useState(false);
  const [qr, setQr] = React.useState<{
    code: string;
    url: string;
    status?: string;
    listKey?: string;
  } | null>(null);

  // Selection state management (basic state only)
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(new Set());
  const [previousSelection, setPreviousSelection] = React.useState<Set<string> | null>(null);

  // Loading state tracking for individual row updates
  const [loadingListUpdates, setLoadingListUpdates] = React.useState<Set<string>>(new Set());
  const [loadingApprovalUpdates, setLoadingApprovalUpdates] = React.useState<Set<string>>(
    new Set(),
  );
  const [loadingTicketUpdates, setLoadingTicketUpdates] = React.useState<Set<string>>(new Set());

  // Monitor loading states for overall feedback
  React.useEffect(() => {
    const totalLoading =
      loadingListUpdates.size + loadingApprovalUpdates.size + loadingTicketUpdates.size;

    if (totalLoading > 0) {
      // Could add a persistent loading indicator here if needed
      // For now, the individual toasts and spinners provide sufficient feedback
    }
  }, [loadingListUpdates, loadingApprovalUpdates, loadingTicketUpdates]);

  // Normalize a field key for shared field lookup
  const normalizeFieldKey = (key: string): string => {
    return key
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") // Remove all non-alphanumeric characters
      .trim();
  };

  const normalizeTicketStatus = (status: HostRsvp["redemptionStatus"]): TicketDisplayStatus => {
    if (status === "none") {
      return "not-issued";
    }
    return status;
  };

  const coerceTicketStatusOption = (
    status: TicketDisplayStatus,
  ): TicketStatusOption | undefined => {
    if (status === "redeemed") {
      return undefined;
    }
    return status;
  };

  const canEditTicketForRsvp = (rsvp: HostRsvp): boolean => {
    return rsvp.approvalStatus === "approved";
  };

  // Generate dynamic custom field columns
  const customFieldColumns = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    if (!currentEvent?.customFields) return [];

    return currentEvent.customFields.map((field) => ({
      id: `custom_${field.key}`,
      header: field.label.replace(/:\s*$/, "").trim(), // Remove trailing colon and spaces
      enableResizing: true,
      size: 150,
      minSize: 100,
      maxSize: 300,
      accessorFn: (row: HostRsvp) => {
        if (!row.customFieldValues) return "";

        // Try exact match first
        if (row.customFieldValues[field.key]) {
          return row.customFieldValues[field.key] ?? "";
        }

        // Try normalized key
        const normalizedKey = normalizeFieldKey(field.key);

        // Check all stored keys for a normalized match
        for (const [metaKey, metaValue] of Object.entries(row.customFieldValues)) {
          if (normalizeFieldKey(metaKey) === normalizedKey) {
            return metaValue;
          }
        }

        return "";
      },
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
                  className="flex items-center gap-1 cursor-pointer group hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent row selection
                    window.open(fullUrl, "_blank", "noopener,noreferrer");
                  }}
                >
                  <span className="truncate max-w-32 group-hover:underline">{rawValue}</span>
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
              className={cn(
                "flex items-center justify-between w-full group cursor-pointer transition-colors duration-150 rounded px-2 py-1 -mx-2 -my-1",
              )}
              onClick={handleCopyClick}
            >
              <span className="truncate max-w-32">{rawValue}</span>
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
        return <span className="truncate max-w-32">{rawValue || "-"}</span>;
      },
    }));
  }, [currentEvent?.customFields]);

  const socialProfileColumns = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    const socialPlatforms = currentEvent?.primaryFieldConfig?.socialPlatforms ?? [];
    return socialPlatforms.map((platform) => ({
      id: `social_${platform.platformKey}`,
      header: platform.label,
      enableResizing: true,
      size: 150,
      minSize: 100,
      maxSize: 260,
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
          return <span className="truncate max-w-32">{handle}</span>;
        }
        return (
          <a
            href={profileUrl}
            target="_blank"
            rel="noreferrer"
            className="truncate max-w-32 text-sm underline underline-offset-4"
          >
            {handle}
          </a>
        );
      },
    }));
  }, [currentEvent?.primaryFieldConfig?.socialPlatforms]);

  // Create base columns without selection functionality first
  const baseCols = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    const columns: ColumnDef<HostRsvp>[] = [
      {
        id: "guest",
        header: "Guest",
        enableResizing: true,
        size: 150,
        minSize: 100,
        maxSize: 300,
        accessorFn: (rsvp: HostRsvp) => {
          const displayName = `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
          return displayName || rsvp.contact?.email || rsvp.contact?.phone || "(no contact)";
        },
        cell: ({ row }) => {
          const rsvp = row.original;
          const displayName = `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
          const guestName =
            displayName || rsvp.contact?.email || rsvp.contact?.phone || "(no contact)";
          return <span>{guestName}</span>;
        },
      },
      {
        id: "listKey",
        header: "List",
        accessorKey: "listKey",
        enableResizing: true,
        size: 80,
        minSize: 60,
        maxSize: 150,
        cell: ({ row }) => {
          const rsvp = row.original;
          const currentListKey = rsvp.listKey;
          const availableListKeys = listCredentials?.map((credential) => credential.listKey) || [];

          // Use shared loading state for this row
          const isUpdatingList = loadingListUpdates.has(rsvp.id);

          const handleListKeyChange = async (newListKey: string) => {
            if (newListKey === currentListKey) return;
            if (!workspaceScope) {
              toast.error("Workspace scope is required to update RSVPs");
              return;
            }

            // Get guest name for toast
            const displayName = `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
            const guestName = displayName || rsvp.contact?.email || rsvp.contact?.phone || "Guest";

            // Add to loading state
            setLoadingListUpdates((prev) => new Set(prev).add(rsvp.id));

            // Show updating toast for single update
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
                  // Remove from loading state
                  setLoadingListUpdates((prev) => {
                    const next = new Set(prev);
                    next.delete(rsvp.id);
                    return next;
                  });
                },
                onError: (error) => {
                  toast.error(`Failed to update ${guestName}'s list: ` + (error as Error).message);
                  // Remove from loading state
                  setLoadingListUpdates((prev) => {
                    const next = new Set(prev);
                    next.delete(rsvp.id);
                    return next;
                  });
                },
              },
            );
          };

          if (isReadOnly || availableListKeys.length <= 1) {
            // If only one list or no lists, show as text
            return <span>{currentListKey?.toUpperCase()}</span>;
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 px-2 text-xs"
                  disabled={isUpdatingList}
                >
                  {isUpdatingList && <Spinner className="mr-1 h-3 w-3" />}
                  {!isUpdatingList && currentListKey?.toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup value={currentListKey} onValueChange={handleListKeyChange}>
                  {availableListKeys.map((listKey) => (
                    <DropdownMenuRadioItem key={listKey} value={listKey}>
                      {listKey.toUpperCase()}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "attendees",
        header: "Attendees",
        accessorFn: (rsvp: HostRsvp): number => rsvp.attendees ?? 1,
        enableResizing: true,
        size: 90,
        minSize: 70,
        maxSize: 120,
        cell: ({ row }) => {
          const attendees = row.original.attendees ?? 1;
          return <span className="text-sm">{attendees}</span>;
        },
      },
      {
        id: "smsConsent",
        header: "SMS Consent",
        enableResizing: true,
        size: 120,
        minSize: 100,
        maxSize: 150,
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
              enableResizing: true,
              size: 150,
              minSize: 100,
              maxSize: 260,
              cell: ({ row }) => {
                const invitedByName = row.original.invitedByName?.trim();
                if (!invitedByName) {
                  return <span className="text-sm text-muted-foreground">—</span>;
                }
                return <span className="text-sm truncate max-w-32">{invitedByName}</span>;
              },
            } satisfies ColumnDef<HostRsvp>,
          ]
        : []),
      {
        id: "referredByName",
        header: "Referred By",
        accessorKey: "referredByName",
        enableResizing: true,
        size: 150,
        minSize: 100,
        maxSize: 260,
        cell: ({ row }) => {
          const referredByName =
            row.original.referredByName?.trim() || row.original.referralCode?.trim();
          if (!referredByName) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          return <span className="text-sm truncate max-w-32">{referredByName}</span>;
        },
      },
      ...socialProfileColumns,
      {
        id: "noteForHosts",
        header: "Note for Hosts",
        accessorKey: "note",
        enableResizing: true,
        size: 200,
        minSize: 150,
        maxSize: 400,
        cell: ({ row }) => {
          const noteForHosts = row.original.note?.trim();
          if (!noteForHosts) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate max-w-[16rem] cursor-default">
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
        enableResizing: true,
        size: 120,
        minSize: 100,
        maxSize: 150,
        cell: ({ row }) => {
          const timestamp = row.original.createdAt;
          const date = new Date(timestamp);
          return (
            <div className="text-xs">
              <div>{date.toLocaleDateString()}</div>
              <div className="text-muted-foreground">
                {date.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
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
        enableResizing: true,
        size: 110,
        minSize: 90,
        maxSize: 150,
        cell: ({ row }) => {
          const rsvp = row.original;
          const originalApprovalStatus = rsvp.approvalStatus;
          const currentApprovalStatus = originalApprovalStatus;
          const isAttendingRsvp = rsvp.status === "attending";

          // Use shared loading state for this row
          const isUpdatingApproval = loadingApprovalUpdates.has(rsvp.id);

          const handleStatusChange = async (newStatus: ApprovalStatusOption) => {
            if (newStatus === originalApprovalStatus) return;
            if (!workspaceScope) {
              toast.error("Workspace scope is required to update RSVPs");
              return;
            }

            // Get guest name for toast
            const displayName = `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
            const guestName = displayName || rsvp.contact?.email || rsvp.contact?.phone || "Guest";

            // Add to loading state
            setLoadingApprovalUpdates((prev) => new Set(prev).add(rsvp.id));

            // Show updating toast for single update
            toast.info(`Updating ${guestName}'s approval status...`);

            updateRsvpCompleteMutation.mutate(
              {
                rsvpId: rsvp.id,
                approvalStatus: newStatus,
                ...workspaceScope.queryArgs,
              },
              {
                onSuccess: () => {
                  const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
                  toast.success(`Changed ${guestName}'s RSVP to '${statusText}'`);
                  // Remove from loading state
                  setLoadingApprovalUpdates((prev) => {
                    const next = new Set(prev);
                    next.delete(rsvp.id);
                    return next;
                  });
                },
                onError: (error) => {
                  toast.error(
                    `Failed to update ${guestName}'s approval status: ` + (error as Error).message,
                  );
                  // Remove from loading state
                  setLoadingApprovalUpdates((prev) => {
                    const next = new Set(prev);
                    next.delete(rsvp.id);
                    return next;
                  });
                },
              },
            );
          };

          const getStatusColor = (currentStatus: ApprovalStatusOption): string => {
            switch (currentStatus) {
              case "approved":
                return "text-green-700 border-green-200 bg-green-50 hover:bg-green-10 hover:text-green-700";
              case "denied":
                return "text-red-700 border-red-200 bg-red-50 hover:bg-red-10 hover:text-red-700";
              case "pending":
              default:
                return "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-10 hover:text-amber-700";
            }
          };

          if (isReadOnly) {
            return (
              <Badge variant="secondary" className="text-xs">
                {currentApprovalStatus.charAt(0).toUpperCase() + currentApprovalStatus.slice(1)}
              </Badge>
            );
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-18" asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className={cn(getStatusColor(currentApprovalStatus))}
                  disabled={isUpdatingApproval}
                >
                  {isUpdatingApproval && <Spinner className="mr-1 h-3 w-3" />}
                  {!isUpdatingApproval &&
                    currentApprovalStatus.charAt(0).toUpperCase() + currentApprovalStatus.slice(1)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentApprovalStatus}
                  onValueChange={(value) => handleStatusChange(value as ApprovalStatusOption)}
                >
                  <DropdownMenuRadioItem
                    value="pending"
                    disabled={isAttendingRsvp || rsvp.redemptionStatus === "redeemed"}
                  >
                    <span className="text-amber-700">Pending</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="approved">
                    <span className="text-green-700">Approved</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="denied">
                    <span className="text-red-700">Denied</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
              {isAttendingRsvp && (
                <div className="mt-1 text-[11px] text-muted-foreground">Attending</div>
              )}
            </DropdownMenu>
          );
        },
      },
      {
        id: "ticketStatus",
        header: "Ticket",
        accessorFn: (rsvp: HostRsvp) => rsvp.redemptionStatus,
        enableResizing: true,
        size: 110,
        minSize: 90,
        maxSize: 150,
        cell: ({ row }) => {
          const rsvp = row.original;
          const originalTicketStatus = normalizeTicketStatus(rsvp.redemptionStatus);
          const currentTicketStatus = originalTicketStatus;
          const isRedeemed = originalTicketStatus === "redeemed";
          const ticketEditingIsAllowed = canEditTicketForRsvp(rsvp);

          // Use shared loading state for this row
          const isUpdatingTicket = loadingTicketUpdates.has(rsvp.id);

          const handleTicketStatusChange = async (newStatus: TicketStatusOption) => {
            if (!ticketEditingIsAllowed) return;
            if (isRedeemed) return; // Cannot change redeemed status
            if (newStatus === originalTicketStatus) return;
            if (!workspaceScope) {
              toast.error("Workspace scope is required to update RSVPs");
              return;
            }

            // Get guest name for toast
            const displayName = `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
            const guestName = displayName || rsvp.contact?.email || rsvp.contact?.phone || "Guest";

            // Add to loading state
            setLoadingTicketUpdates((prev) => new Set(prev).add(rsvp.id));

            // Show updating toast for single update
            toast.info(`Updating ${guestName}'s ticket status...`);

            updateRsvpCompleteMutation.mutate(
              {
                rsvpId: rsvp.id,
                ticketStatus: newStatus,
                ...workspaceScope.queryArgs,
              },
              {
                onSuccess: () => {
                  const statusText = getTicketStatusLabel(newStatus);
                  toast.success(`Changed ${guestName}'s ticket to '${statusText}'`);
                  // Remove from loading state
                  setLoadingTicketUpdates((prev) => {
                    const next = new Set(prev);
                    next.delete(rsvp.id);
                    return next;
                  });
                },
                onError: (error) => {
                  toast.error(
                    `Failed to update ${guestName}'s ticket status: ` + (error as Error).message,
                  );
                  // Remove from loading state
                  setLoadingTicketUpdates((prev) => {
                    const next = new Set(prev);
                    next.delete(rsvp.id);
                    return next;
                  });
                },
              },
            );
          };

          const getTicketStatusColor = (status: TicketDisplayStatus): string => {
            switch (status) {
              case "issued":
                return "text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-10 hover:text-purple-700";
              case "redeemed":
                return "text-blue-700 border-blue-200 bg-blue-50 hover:text-blue-700 hover:bg-blue-10";
              case "disabled":
                return "text-red-700 border-red-200 bg-red-50 hover:bg-red-10 hover:text-red-700";
              case "not-issued":
              default:
                return "text-gray-700 border-gray-200 bg-gray-50";
            }
          };

          const getTicketStatusLabel = (status: TicketDisplayStatus): string => {
            switch (status) {
              case "issued":
                return "Issued";
              case "redeemed":
                return "Redeemed";
              case "disabled":
                return "Disabled";
              case "not-issued":
              default:
                return "None";
            }
          };

          if (isReadOnly) {
            const canViewQrCode =
              (currentTicketStatus === "issued" || currentTicketStatus === "redeemed") &&
              Boolean(rsvp.redemptionCode);

            return (
              <Button
                variant="outline"
                size="xs"
                className={cn(getTicketStatusColor(currentTicketStatus))}
                disabled={!canViewQrCode}
                onClick={() => {
                  const redemptionCode = rsvp.redemptionCode;
                  if (!redemptionCode) return;
                  const url = `${window.location.origin}/redeem/${redemptionCode}`;
                  setQr({
                    code: redemptionCode,
                    url,
                    status: currentTicketStatus,
                    listKey: rsvp.listKey,
                  });
                  setShowQR(true);
                }}
              >
                {getTicketStatusLabel(currentTicketStatus)}
              </Button>
            );
          }

          return (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex w-16" asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className={cn(getTicketStatusColor(currentTicketStatus))}
                  disabled={isRedeemed || isUpdatingTicket || !ticketEditingIsAllowed}
                >
                  {isUpdatingTicket && <Spinner className="mr-1 h-3 w-3" />}
                  {!isUpdatingTicket && getTicketStatusLabel(currentTicketStatus)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={currentTicketStatus}
                  onValueChange={(value) => handleTicketStatusChange(value as TicketStatusOption)}
                >
                  <DropdownMenuRadioItem value="not-issued">
                    <span className="text-gray-700">None</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="issued">
                    <span className="text-purple-700">Issued</span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="disabled">
                    <span className="text-red-700">Disabled</span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                {(currentTicketStatus === "issued" || currentTicketStatus === "redeemed") &&
                  rsvp.redemptionCode && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          const redemptionCode = rsvp.redemptionCode;
                          if (!redemptionCode) return;
                          const url = `${window.location.origin}/redeem/${redemptionCode}`;
                          setQr({
                            code: redemptionCode,
                            url,
                            status: currentTicketStatus,
                            listKey: rsvp.listKey,
                          });
                          setShowQR(true);
                        }}
                      >
                        <QrCode className="w-4 h-4 mr-2" />
                        View QR Code
                      </DropdownMenuItem>
                    </>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        enableResizing: true,
        size: 100,
        minSize: 80,
        maxSize: 150,
        cell: ({ row }) => {
          const rsvp = row.original;
          const changes = pendingChanges[rsvp.id];
          const hasChanges =
            changes &&
            (changes.currentApprovalStatus !== changes.originalApprovalStatus ||
              changes.currentTicketStatus !== changes.originalTicketStatus);

          const _handleSave = async () => {
            if (!changes || !hasChanges) return;
            if (!workspaceScope) {
              toast.error("Workspace scope is required to update RSVPs");
              return;
            }

            const approvalStatusUpdate =
              changes.currentApprovalStatus !== changes.originalApprovalStatus
                ? changes.currentApprovalStatus
                : undefined;
            const ticketStatusUpdate =
              changes.currentTicketStatus !== changes.originalTicketStatus
                ? coerceTicketStatusOption(changes.currentTicketStatus)
                : undefined;

            const mutationInput: UpdateRsvpCompleteInput = {
              rsvpId: rsvp.id,
              ...workspaceScope.queryArgs,
            };
            if (approvalStatusUpdate) {
              mutationInput.approvalStatus = approvalStatusUpdate;
            }
            if (ticketStatusUpdate) {
              mutationInput.ticketStatus = ticketStatusUpdate;
            }

            updateRsvpCompleteMutation.mutate(mutationInput, {
              onSuccess: () => {
                // Clear pending changes for this row
                setPendingChanges((prev) => {
                  const updated = { ...prev };
                  delete updated[rsvp.id];
                  return updated;
                });

                toast.success("Changes saved successfully");
              },
              onError: (error) => {
                toast.error("Failed to save changes: " + (error as Error).message);
              },
            });
          };

          const handleDelete = async () => {
            if (!workspaceScope) {
              toast.error("Workspace scope is required to delete RSVPs");
              return;
            }
            deleteRsvpCompleteMutation.mutate(
              { rsvpId: rsvp.id, ...workspaceScope.queryArgs },
              {
                onSuccess: () => {
                  // Clear pending changes for this row
                  setPendingChanges((prev) => {
                    const updated = { ...prev };
                    delete updated[rsvp.id];
                    return updated;
                  });

                  toast.success("RSVP deleted successfully");
                },
                onError: (error) => {
                  toast.error("Failed to delete RSVP: " + (error as Error).message);
                },
              },
            );
          };

          return (
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deleteRsvpCompleteMutation.isPending}
                  >
                    {deleteRsvpCompleteMutation.isPending && <Spinner className="mr-1 h-3 w-3" />}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete RSVP</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this RSVP? This will permanently remove the
                      RSVP, any associated ticket/redemption codes, and approval history. This
                      action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                    >
                      Delete RSVP
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ];

    return columns.filter((column) => !isReadOnly || column.id !== "actions");
  }, [
    isReadOnly,
    pendingChanges,
    updateRsvpCompleteMutation,
    deleteRsvpCompleteMutation,
    updateRsvpListKeyMutation,
    listCredentials,
    currentEvent?.primaryFieldConfig,
    socialProfileColumns,
    customFieldColumns,
    loadingListUpdates,
    loadingApprovalUpdates,
    loadingTicketUpdates,
    workspaceScope,
  ]);

  // Filtering is now handled by the backend

  // Get unique values for filter dropdowns - use all available options, not just filtered results
  const uniqueListKeys = React.useMemo(() => {
    return listCredentials?.map((cred) => cred.listKey).sort() || [];
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
    setSocialPlatformFilter("all");
    setSocialSearch("");
    setInvitedBySearch("");
    setSortBy("createdAt");
    setSortOrder("desc");
  };

  // Check if any filters are active
  const hasActiveFilters =
    guestSearch.trim() !== "" ||
    approvalFilter !== "all" ||
    listFilter !== "all" ||
    redemptionFilter !== "all" ||
    socialPlatformFilter !== "all" ||
    socialSearch.trim() !== "" ||
    invitedBySearch.trim() !== "";

  // Selection handlers (basic implementations, will be updated after table creation)
  const toggleSelectRow = React.useCallback(
    (rsvpId: string) => {
      if (isReadOnly) {
        return;
      }
      const newSelectedRows = new Set(selectedRows);
      if (newSelectedRows.has(rsvpId)) {
        newSelectedRows.delete(rsvpId);
      } else {
        newSelectedRows.add(rsvpId);
      }
      setSelectedRows(newSelectedRows);
    },
    [isReadOnly, selectedRows],
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
  }, [debouncedGuest, approvalFilter, listFilter, redemptionFilter, cursor]);

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
    if (!workspaceScope) {
      toast.error("Workspace scope is required to delete RSVPs");
      return;
    }
    const selectedRsvps = rsvps.filter((rsvp) => selectedRows.has(rsvp.id));
    const count = selectedRsvps.length;

    if (count === 0) return;

    // Execute bulk deletion in single mutation
    const rsvpIds = selectedRsvps.map((rsvp) => rsvp.id);

    try {
      const result = await bulkDeleteRsvpsMutation.mutateAsync({
        rsvpIds,
        ...workspaceScope.queryArgs,
      });

      if (result.failed > 0) {
        toast.warning(
          `Deleted ${result.success} of ${count} RSVPs. ${result.failed} failed: ${result.errors.join(", ")}`,
        );
      } else {
        toast.success(`Deleted ${count} RSVPs`);
      }

      setSelectedRows(new Set());
    } catch (error) {
      toast.error(`Failed to delete RSVPs: ${(error as Error).message}`);
    }
  };

  // Create initial columns without selection functionality
  const initialCols = React.useMemo<ColumnDef<HostRsvp>[]>(
    () =>
      isReadOnly
        ? baseCols
        : [
            {
              id: "select",
              header: "Select",
              enableResizing: false,
              size: 60,
              minSize: 50,
              maxSize: 70,
              cell: ({ row }) => (
                <Checkbox
                  checked={selectedRows.has(row.original.id)}
                  onCheckedChange={() => toggleSelectRow(row.original.id)}
                  aria-label="Select row"
                  className="ml-2"
                />
              ),
              enableSorting: false,
              enableHiding: false,
            },
            ...baseCols,
          ],
    [baseCols, isReadOnly, selectedRows, toggleSelectRow],
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

  const [columnOrder, setColumnOrder] = React.useState<string[]>(
    () => computedInitialColumnIdentifiers,
  );

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

  const table = useReactTable({
    data: rsvps,
    columns: initialCols,
    state: { sorting, columnOrder, columnSizing, columnVisibility },
    manualPagination: true, // Enable manual pagination
    manualSorting: true, // Enable manual sorting (server-side)
    enableSorting: false, // Disable column header sorting - use global sort dropdowns instead
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    enableColumnResizing: false,
    getCoreRowModel: getCoreRowModel(),
    // Don't use getSortedRowModel() since we're doing server-side sorting
    // getSortedRowModel: getSortedRowModel(),
  });

  const [draggedColumnIdentifier, setDraggedColumnIdentifier] = React.useState<string | null>(null);
  const [dragHoverDetails, setDragHoverDetails] = React.useState<{
    columnId: string;
    position: "before" | "after";
  } | null>(null);
  const isDraggingColumn = draggedColumnIdentifier !== null;
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
      const resolvedBackgroundColor =
        headerStyles.backgroundColor && headerStyles.backgroundColor !== "rgba(0, 0, 0, 0)"
          ? headerStyles.backgroundColor
          : "rgba(255, 255, 255, 0.96)";
      const resolvedTextColor =
        headerStyles.color && headerStyles.color.trim().length > 0
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

      if (!draggedColumnIdentifier || draggedColumnIdentifier === targetColumnIdentifier) {
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

      const activeColumnIdentifier = draggedColumnIdentifier;
      if (!activeColumnIdentifier) {
        setDragHoverDetails(null);
        removeDragPreviewElement();
        return;
      }

      if (activeColumnIdentifier === targetColumnIdentifier) {
        setDraggedColumnIdentifier(null);
        setDragHoverDetails(null);
        removeDragPreviewElement();
        return;
      }

      const dropPosition =
        dragHoverDetails && dragHoverDetails.columnId === targetColumnIdentifier
          ? dragHoverDetails.position
          : "before";

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

      setDraggedColumnIdentifier(null);
      setDragHoverDetails(null);
      removeDragPreviewElement();
    },
    [draggedColumnIdentifier, dragHoverDetails, removeDragPreviewElement, setColumnOrder],
  );

  const handleColumnDragEnd = React.useCallback(() => {
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

  // Create the final columns with proper header checkbox
  const finalCols = React.useMemo<ColumnDef<HostRsvp>[]>(() => {
    if (isReadOnly) {
      return baseCols;
    }

    return [
      {
        id: "select",
        header: (_context: HeaderContext<HostRsvp, unknown>) => (
          <Checkbox
            checked={allSelected || someSelected ? true : false}
            onCheckedChange={toggleSelectAllCurrent}
            aria-label="Select all"
            className="ml-2"
            ref={(el: HTMLButtonElement | null) => {
              if (el) {
                // For button-based checkbox, we need to find the actual input element
                const input = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
                if (input) {
                  input.indeterminate = someSelected;
                }
              }
            }}
          />
        ),
        cell: ({ row }: CellContext<HostRsvp, unknown>) => (
          <Checkbox
            checked={selectedRows.has(row.original.id)}
            onCheckedChange={() => toggleSelectRow(row.original.id)}
            aria-label="Select row"
            className="ml-2"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...baseCols,
    ];
  }, [
    baseCols,
    isReadOnly,
    selectedRows,
    allSelected,
    someSelected,
    toggleSelectAllCurrent,
    toggleSelectRow,
  ]);

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
        ticketStatus: "Ticket",
        actions: "Action",
      };

      return columnMap[columnId] || formatColumnIdentifier(columnId);
    },
    [currentEvent?.customFields, formatColumnIdentifier],
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
    includeNote,
    includePhone,
    runExportRsvpsCsv,
    selectedListsForExport,
    selectedStatusesForExport,
    workspaceScope,
  ]);

  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:gap-1">
          <div className="flex items-start justify-between gap-3 sm:block">
            <h2 className="text-3xl font-bold tracking-tight">RSVPs</h2>
            <div className="flex items-center gap-2 sm:hidden">
              {currentEvent && canShareCurrentEvent ? (
                <ShareEventPopover
                  eventId={currentEvent._id}
                  eventUrl={publicEventUrl}
                  siteKey={workspaceScope?.siteKey}
                  workspaceSlug={workspaceScope?.workspaceSlug}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-center px-3"
                    aria-label="Share event"
                  >
                    <Share className="h-4 w-4" />
                  </Button>
                </ShareEventPopover>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-center px-3"
                  aria-label="Share event"
                  disabled
                >
                  <Share className="h-4 w-4" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-center px-3"
                    aria-label="Open actions"
                  >
                    <span className="text-lg leading-none">⋯</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={() => {
                      if (eventId) {
                        window.open(`/events/${eventId}`, "_blank");
                      }
                    }}
                    disabled={!eventId}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Event
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setExportOptionsOpen(true)} disabled={!eventId}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setColumnVisibilityOpen(true)}>
                    <Columns className="h-4 w-4 mr-2" />
                    Columns
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className="text-muted-foreground">Manage guest responses and ticket status</p>
        </div>
        <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-end sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (eventId) {
                window.open(`/events/${eventId}`, "_blank");
              }
            }}
            disabled={!eventId}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Event
          </Button>
          {currentEvent && canShareCurrentEvent ? (
            <ShareEventPopover
              eventId={currentEvent._id}
              eventUrl={publicEventUrl}
              siteKey={workspaceScope?.siteKey}
              workspaceSlug={workspaceScope?.workspaceSlug}
            >
              <Button variant="outline" size="sm">
                <Share className="h-4 w-4 mr-2" />
                Share Event
              </Button>
            </ShareEventPopover>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Share className="h-4 w-4 mr-2" />
              Share Event
            </Button>
          )}
          <Popover open={exportOptionsOpen} onOpenChange={setExportOptionsOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm mb-2">Export Options</h4>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Select Lists</label>
                  <div className="space-y-2">
                    {(listCredentials || []).map((cred) => (
                      <div key={cred.listKey} className="flex items-center">
                        <Checkbox
                          id={`list-${cred.listKey}`}
                          checked={selectedListsForExport.includes(cred.listKey)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedListsForExport([...selectedListsForExport, cred.listKey]);
                            } else {
                              setSelectedListsForExport(
                                selectedListsForExport.filter((k) => k !== cred.listKey),
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor={`list-${cred.listKey}`}
                          className="ml-2 text-sm cursor-pointer"
                        >
                          {cred.listKey.toUpperCase()}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Select Statuses</label>
                  <div className="space-y-2">
                    {EXPORT_STATUS_OPTIONS.map((statusOption) => {
                      const label =
                        statusOption === "attending"
                          ? "Attending"
                          : statusOption.charAt(0).toUpperCase() + statusOption.slice(1);
                      return (
                        <div key={statusOption} className="flex items-center">
                          <Checkbox
                            id={`status-${statusOption}`}
                            checked={selectedStatusesForExport.includes(statusOption)}
                            onCheckedChange={(checked) => {
                              setSelectedStatusesForExport((previous) => {
                                if (checked === true) {
                                  if (previous.includes(statusOption)) {
                                    return previous;
                                  }
                                  const next = [...previous, statusOption];
                                  return EXPORT_STATUS_OPTIONS.filter((option) =>
                                    next.includes(option),
                                  );
                                }
                                return previous.filter((option) => option !== statusOption);
                              });
                            }}
                          />
                          <label
                            htmlFor={`status-${statusOption}`}
                            className="ml-2 text-sm cursor-pointer"
                          >
                            {label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Select Columns</label>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <Checkbox
                        id="col-attendees"
                        checked={includeAttendees}
                        onCheckedChange={(checked) => setIncludeAttendees(checked === true)}
                      />
                      <label htmlFor="col-attendees" className="ml-2 text-sm cursor-pointer">
                        Attendees
                      </label>
                    </div>
                    <div className="flex items-center">
                      <Checkbox
                        id="col-note"
                        checked={includeNote}
                        onCheckedChange={(checked) => setIncludeNote(checked === true)}
                      />
                      <label htmlFor="col-note" className="ml-2 text-sm cursor-pointer">
                        Note
                      </label>
                    </div>
                    <div className="flex items-center">
                      <Checkbox
                        id="col-phone"
                        checked={includePhone}
                        onCheckedChange={(checked) => setIncludePhone(checked === true)}
                      />
                      <label htmlFor="col-phone" className="ml-2 text-sm cursor-pointer">
                        Phone
                      </label>
                    </div>
                    <div className="flex items-center">
                      <Checkbox
                        id="col-custom"
                        checked={includeCustomFields}
                        onCheckedChange={(checked) => setIncludeCustomFields(checked === true)}
                      />
                      <label htmlFor="col-custom" className="ml-2 text-sm cursor-pointer">
                        Custom Fields
                      </label>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={async () => {
                    const exported = await handleExportCsv();
                    if (exported) {
                      setExportOptionsOpen(false);
                    }
                  }}
                  disabled={
                    isLoading ||
                    isExportingCsv ||
                    selectedListsForExport.length === 0 ||
                    selectedStatusesForExport.length === 0
                  }
                  className="w-full"
                  size="sm"
                >
                  {isExportingCsv ? (
                    <Spinner className="h-4 w-4 mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {isExportingCsv ? "Exporting..." : "Export"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {/* Event Selector */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm text-foreground/70">Event:</span>
        <Select value={eventId} onValueChange={setEventId} className="max-w-sm">
          {eventsSorted.map((event) => {
            const inlineTitle = formatEventTitleInline(event);
            return (
              <SelectOption key={event._id} value={event._id}>
                {new Date(event.eventDate).toLocaleDateString()} • {inlineTitle}
              </SelectOption>
            );
          })}
        </Select>
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <Input
          className="h-8 max-w-xs text-sm"
          placeholder="Search guest"
          value={guestSearch}
          onChange={(e) => setGuestSearch(e.target.value)}
        />
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Select
          value={approvalFilter}
          onValueChange={(value) => setApprovalFilter(value as ApprovalFilterOption)}
          className="w-32"
        >
          <SelectOption value="all">All Approval</SelectOption>
          {uniqueApprovalStatuses.map((status) => (
            <SelectOption key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </SelectOption>
          ))}
        </Select>
        <Select value={listFilter} onValueChange={setListFilter} className="w-32">
          <SelectOption value="all">All Lists</SelectOption>
          {uniqueListKeys.map((listKey) => (
            <SelectOption key={listKey} value={listKey}>
              {listKey.toUpperCase()}
            </SelectOption>
          ))}
        </Select>
        <Select value={redemptionFilter} onValueChange={setRedemptionFilter} className="w-36">
          <SelectOption value="all">All Tickets</SelectOption>
          <SelectOption value="issued">Issued</SelectOption>
          <SelectOption value="redeemed">Redeemed</SelectOption>
          <SelectOption value="disabled">Disabled</SelectOption>
          <SelectOption value="not-issued">None</SelectOption>
        </Select>
        {(currentEvent?.primaryFieldConfig?.socialPlatforms?.length ?? 0) > 0 && (
          <>
            <Select
              value={socialPlatformFilter}
              onValueChange={setSocialPlatformFilter}
              className="w-36"
            >
              <SelectOption value="all">All Socials</SelectOption>
              {currentEvent?.primaryFieldConfig?.socialPlatforms?.map((platform) => (
                <SelectOption key={platform.platformKey} value={platform.platformKey}>
                  {platform.label}
                </SelectOption>
              ))}
            </Select>
            <Input
              className="h-8 max-w-[10rem] text-sm"
              placeholder="Social handle"
              value={socialSearch}
              onChange={(event) => setSocialSearch(event.target.value)}
            />
          </>
        )}
        {currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true && (
          <Input
            className="h-8 max-w-[10rem] text-sm"
            placeholder="Invited by"
            value={invitedBySearch}
            onChange={(event) => setInvitedBySearch(event.target.value)}
          />
        )}
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Select value={sortBy} onValueChange={setSortBy} className="w-36">
          <SelectOption value="createdAt">Created Date</SelectOption>
          <SelectOption value="updatedAt">Updated Date</SelectOption>
          <SelectOption value="name">Guest Name</SelectOption>
          <SelectOption value="firstName">First Name</SelectOption>
          <SelectOption value="lastName">Last Name</SelectOption>
          <SelectOption value="approvalStatus">Approval Status</SelectOption>
          <SelectOption value="ticketStatus">Ticket Status</SelectOption>
          <SelectOption value="listKey">List</SelectOption>
          <SelectOption value="attendees">Attendees</SelectOption>
          {currentEvent?.primaryFieldConfig?.invitedBy?.enabled === true && (
            <SelectOption value="invitedByName">Invited By</SelectOption>
          )}
          <SelectOption value="referredByName">Referred By</SelectOption>
          {currentEvent?.primaryFieldConfig?.socialPlatforms?.map((platform) => (
            <SelectOption
              key={`sort-${platform.platformKey}`}
              value={`social:${platform.platformKey}`}
            >
              {platform.label}
            </SelectOption>
          ))}
        </Select>
        <Select
          value={sortOrder}
          onValueChange={(value) => setSortOrder(value as "asc" | "desc")}
          className="w-28"
        >
          <SelectOption value="desc">Descending</SelectOption>
          <SelectOption value="asc">Ascending</SelectOption>
        </Select>
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Popover open={columnVisibilityOpen} onOpenChange={setColumnVisibilityOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Columns className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Show Columns</h4>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {getAllAvailableColumnIds()
                  .filter(
                    (columnId) => columnId !== "select" && (!isReadOnly || columnId !== "actions"),
                  )
                  .map((columnId) => {
                    const displayName = getColumnDisplayName(columnId);
                    const isVisible = visibleColumns.has(columnId);
                    return (
                      <div key={columnId} className="flex items-center">
                        <Checkbox
                          id={`column-${columnId}`}
                          checked={isVisible}
                          onCheckedChange={(checked) => {
                            handleColumnVisibilityChange({
                              ...columnVisibility,
                              [columnId]: checked === true,
                            });
                          }}
                        />
                        <label
                          htmlFor={`column-${columnId}`}
                          className="ml-2 text-sm cursor-pointer"
                        >
                          {displayName}
                        </label>
                      </div>
                    );
                  })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {hasActiveFilters && (
          <Button size="sm" variant="outline" onClick={clearAllFilters} className="text-xs">
            Clear All
          </Button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-foreground/70">Active filters:</span>
          {guestSearch.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Search: &ldquo;{guestSearch}&rdquo;
              <button
                onClick={() => setGuestSearch("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {approvalFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Approval: {approvalFilter.charAt(0).toUpperCase() + approvalFilter.slice(1)}
              <button
                onClick={() => setApprovalFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {listFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              List: {listFilter.toUpperCase()}
              <button
                onClick={() => setListFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {redemptionFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Ticket:{" "}
              {redemptionFilter === "not-issued"
                ? "None"
                : redemptionFilter.charAt(0).toUpperCase() + redemptionFilter.slice(1)}
              <button
                onClick={() => setRedemptionFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {socialPlatformFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Social:{" "}
              {currentEvent?.primaryFieldConfig?.socialPlatforms?.find(
                (platform) => platform.platformKey === socialPlatformFilter,
              )?.label ?? socialPlatformFilter}
              <button
                onClick={() => setSocialPlatformFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {socialSearch.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Social handle: &ldquo;{socialSearch}&rdquo;
              <button
                onClick={() => setSocialSearch("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {invitedBySearch.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Invited by: &ldquo;{invitedBySearch}&rdquo;
              <button
                onClick={() => setInvitedBySearch("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-foreground/60">
            (Showing {rsvps.length} RSVPs on this page)
          </span>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {!isReadOnly && selectedRows.size > 0 && (
        <div className="flex items-center justify-between bg-muted/50 border rounded-md p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selectedRows.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => setSelectedRows(new Set())}>
              Clear selection
            </Button>
          </div>
          <div className="flex items-center gap-2">
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
                      <ContextMenuItem key={listKey} onClick={() => handleBulkListChange(listKey)}>
                        {listKey.toUpperCase()}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Change Approval</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    <ContextMenuItem onClick={() => handleBulkApprovalChange("pending")}>
                      <span className="text-amber-700">Pending</span>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleBulkApprovalChange("approved")}>
                      <span className="text-green-700">Approved</span>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleBulkApprovalChange("denied")}>
                      <span className="text-red-700">Denied</span>
                    </ContextMenuItem>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Change Ticket</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    <ContextMenuItem onClick={() => handleBulkTicketStatusChange("not-issued")}>
                      <span className="text-gray-700">None</span>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleBulkTicketStatusChange("issued")}>
                      <span className="text-purple-700">Issued</span>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleBulkTicketStatusChange("disabled")}>
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
                        will permanently remove the RSVPs, any associated ticket/redemption codes,
                        and approval history. This action cannot be undone.
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

      {isLoading ? (
        <TableSkeleton rows={10} columns={8} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" style={{ tableLayout: "fixed" }}>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="text-left text-foreground/70">
                  {headerGroup.headers.map((header) => {
                    const columnIdentifier =
                      header.column.id ??
                      (hasStringAccessorKey(header.column.columnDef)
                        ? header.column.columnDef.accessorKey
                        : header.id);
                    const sortingHandler = header.column.getCanSort()
                      ? header.column.getToggleSortingHandler()
                      : undefined;
                    const isDragSourceEnabled = columnIdentifier !== "select";
                    const columnMeta = header.column.columnDef.meta as
                      | { label?: string }
                      | undefined;
                    const columnDisplayLabel =
                      typeof header.column.columnDef.header === "string" &&
                      header.column.columnDef.header.trim().length > 0
                        ? header.column.columnDef.header
                        : columnMeta?.label && columnMeta.label.trim().length > 0
                          ? columnMeta.label
                          : formatColumnIdentifier(columnIdentifier);

                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "px-2 py-1 select-none group border-b border-foreground/10 relative",
                          isDraggingColumn ? "cursor-grabbing" : "cursor-pointer",
                          dragHoverDetails?.columnId === columnIdentifier &&
                            dragHoverDetails.position === "before" &&
                            "border-l-2 border-l-foreground/40",
                          dragHoverDetails?.columnId === columnIdentifier &&
                            dragHoverDetails.position === "after" &&
                            "border-r-2 border-r-foreground/40",
                          draggedColumnIdentifier === columnIdentifier && "opacity-60",
                        )}
                        style={{
                          width: header.getSize(),
                          minWidth: header.column.columnDef.minSize,
                          maxWidth: header.column.columnDef.maxSize,
                        }}
                        title={columnDisplayLabel}
                        onDragOver={(event) => {
                          event.preventDefault();
                          handleColumnDragOver(event, columnIdentifier);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleColumnDrop(event, columnIdentifier);
                        }}
                        onClick={(event) => {
                          if (isDraggingColumn) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                          }

                          if (sortingHandler) {
                            sortingHandler(event);
                          }
                        }}
                      >
                        <div
                          className="flex items-center gap-1"
                          draggable={isDragSourceEnabled}
                          onDragStart={
                            isDragSourceEnabled
                              ? (event) => {
                                  // Get the header element since we're dragging from a div
                                  const headerElement = event.currentTarget.closest(
                                    "th",
                                  ) as HTMLTableHeaderCellElement | null;
                                  if (!headerElement) return;

                                  // Create a synthetic event with the header element as currentTarget
                                  const syntheticEvent = {
                                    ...event,
                                    currentTarget: headerElement,
                                  } as React.DragEvent<HTMLTableHeaderCellElement>;
                                  handleColumnDragStart(
                                    syntheticEvent,
                                    columnIdentifier,
                                    columnDisplayLabel,
                                  );
                                }
                              : undefined
                          }
                          onDragEnd={handleColumnDragEnd}
                        >
                          {isDragSourceEnabled && (
                            <GripVertical
                              aria-hidden="true"
                              className={cn(
                                "h-3 w-3 text-muted-foreground transition-opacity",
                                "opacity-0 group-hover:opacity-100",
                              )}
                            />
                          )}
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: " ▲", desc: " ▼" }[header.column.getIsSorted() as string] ??
                              null}
                          </div>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const rsvp = row.original;
                const changes = pendingChanges[rsvp.id];
                const hasChanges =
                  changes &&
                  (changes.currentApprovalStatus !== changes.originalApprovalStatus ||
                    changes.currentTicketStatus !== changes.originalTicketStatus);

                const isSelected = selectedRows.has(rsvp.id);

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-t border-foreground/10 transition-colors hover:bg-muted/50",
                      hasChanges && "bg-yellow-50 border-yellow-200",
                      isSelected &&
                        "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-2 py-1",
                          !isReadOnly &&
                            cell.column.id !== "select" &&
                            cell.column.id !== "listKey" &&
                            cell.column.id !== "approvalStatus" &&
                            cell.column.id !== "ticketStatus" &&
                            cell.column.id !== "actions" &&
                            "cursor-pointer",
                        )}
                        style={{
                          width: cell.column.getSize(),
                          minWidth: cell.column.columnDef.minSize,
                          maxWidth: cell.column.columnDef.maxSize,
                        }}
                        onClick={
                          cell.column.id !== "select" &&
                          !isReadOnly &&
                          cell.column.id !== "listKey" &&
                          cell.column.id !== "approvalStatus" &&
                          cell.column.id !== "ticketStatus" &&
                          cell.column.id !== "actions"
                            ? () => toggleSelectRow(rsvp.id)
                            : undefined
                        }
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && rsvpsPaginated && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <div className="flex items-center gap-4">
            <div className="text-sm text-foreground/70">
              {!rsvps || rsvps.length === 0 ? (
                <span>No RSVPs found{hasActiveFilters && " (filtered)"}</span>
              ) : (
                <span>
                  Showing {startItem}-{endItem} of {totalCount || "?"} RSVPs
                  {hasActiveFilters && " (filtered)"}
                </span>
              )}
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("pageSize", value);
                router.replace(`${rsvpsPath}?${params.toString()}`, {
                  scroll: false,
                });
                setCursor(null);
                setCursorHistory([]);
              }}
            >
              {[10, 20, 50, 100].map((number) => (
                <SelectOption key={number} value={String(number)}>
                  {number} per page
                </SelectOption>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <Pagination className="justify-end">
              <PaginationContent className="gap-1 sm:gap-2">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={goToPreviousPage}
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                      cursor === null && cursorHistory.length === 0
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                    )}
                  />
                </PaginationItem>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Page {currentPage}</span>
                </div>

                <PaginationItem>
                  <PaginationNext
                    onClick={goToNextPage}
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                      rsvpsPaginated?.isDone || !rsvpsPaginated?.nextCursor
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      )}

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
    </div>
  );
}

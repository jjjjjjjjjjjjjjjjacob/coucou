"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import { useQuery as useConvexQuery } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { Select, SelectOption } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Copy,
  Columns,
  X,
  GripVertical,
} from "lucide-react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  RowData,
  HeaderContext,
  CellContext,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { formatEventTitleInline } from "@/lib/event-display";
import type { Event } from "@/lib/types";
import {
  useWorkspaceOperationPath,
  useWorkspaceScope,
} from "@/lib/use-workspace-scope";

type PaginatedSmsNotificationResult = {
  page: Array<{
    _id: Id<"smsNotifications">;
    eventId: Id<"events">;
    recipientClerkUserId: string;
    recipientPhoneObfuscated: string;
    type: string;
    message: string;
    status: string;
    messageId?: string;
    errorMessage?: string;
    sentAt?: number;
    createdAt: number;
    recipientName?: string;
    eventName?: string;
  }>;
  nextCursor: string | null;
  isDone: boolean;
};

const hasStringAccessorKey = <TData extends RowData>(
  columnDefinition: ColumnDef<TData>,
): columnDefinition is ColumnDef<TData> & { accessorKey: string } => {
  const candidateAccessorKey = (
    columnDefinition as { accessorKey?: unknown }
  ).accessorKey;
  return typeof candidateAccessorKey === "string";
};

export default function TextsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const textsPath = useWorkspaceOperationPath("host", "texts");

  // Use Convex queries
  const events = useConvexQuery(api.events.listAll, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as Event[] | undefined;
  const eventsSorted = React.useMemo<Event[]>(
    () =>
      (events ?? [])
        .slice()
        .sort(
          (firstEvent, secondEvent) =>
            (secondEvent.eventDate ?? 0) - (firstEvent.eventDate ?? 0),
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

  // Cursor-based pagination state with history for Previous button
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = React.useState<(string | null)[]>(
    [],
  );
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  // Filter state
  const [phoneSearch, setPhoneSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");

  // Reset cursor and history when filters change
  React.useEffect(() => {
    setCursor(null);
    setCursorHistory([]);
  }, [phoneSearch, statusFilter, typeFilter]);

  const notificationsPaginated = useConvexQuery(
    api.sms.listForEventPaginated,
    eventId && workspaceScope
      ? {
          eventId: eventId as Id<"events">,
          ...workspaceScope.queryArgs,
          ...(cursor && { cursor }),
          pageSize,
          phoneSearch,
          statusFilter,
          typeFilter,
        }
      : "skip",
  ) as PaginatedSmsNotificationResult | undefined;

  // Get total count
  const totalCount = useConvexQuery(
    api.sms.countForEventFiltered,
    eventId && workspaceScope
      ? {
          eventId: eventId as Id<"events">,
          ...workspaceScope.queryArgs,
          phoneSearch,
          statusFilter,
          typeFilter,
        }
      : "skip",
  ) as number | undefined;

  // Extract the page data
  const notifications = React.useMemo(
    () => notificationsPaginated?.page ?? [],
    [notificationsPaginated],
  );

  // Column visibility state
  const [columnVisibilityOpen, setColumnVisibilityOpen] =
    React.useState(false);

  // Get all available column IDs
  const getAllAvailableColumnIds = React.useCallback((): string[] => {
    return [
      "select",
      "recipient",
      "phone",
      "event",
      "type",
      "status",
      "message",
      "errorMessage",
      "createdAt",
      "sentAt",
    ];
  }, []);

  // Initialize visible columns
  const [visibleColumns, setVisibleColumns] = React.useState<Set<string>>(
    () => {
      const allColumnIds = [
        "select",
        "recipient",
        "phone",
        "event",
        "type",
        "status",
        "message",
        "createdAt",
      ];
      return new Set(allColumnIds);
    },
  );

  // Create base columns
  const baseCols = React.useMemo<ColumnDef<PaginatedSmsNotificationResult["page"][0]>[]>(
    () => [
      {
        id: "recipient",
        header: "Recipient",
        enableResizing: true,
        size: 150,
        minSize: 100,
        maxSize: 300,
        accessorFn: (notification) => notification.recipientName || "Unknown",
        cell: ({ row }) => {
          const recipientName = row.original.recipientName || "Unknown";
          return <span>{recipientName}</span>;
        },
      },
      {
        id: "phone",
        header: "Phone",
        accessorKey: "recipientPhoneObfuscated",
        enableResizing: true,
        size: 130,
        minSize: 100,
        maxSize: 200,
        cell: ({ row }) => {
          const phone = row.original.recipientPhoneObfuscated;
          return (
            <div className="flex items-center gap-1">
              <span>{phone}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(phone);
                        // toast.success("Phone number copied");
                      } catch (err) {
                        // toast.error("Failed to copy");
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy phone number</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
      {
        id: "event",
        header: "Event",
        accessorFn: (notification) => notification.eventName || "Unknown",
        enableResizing: true,
        size: 180,
        minSize: 120,
        maxSize: 300,
        cell: ({ row }) => {
          const eventName = row.original.eventName || "Unknown";
          return <span>{eventName}</span>;
        },
      },
      {
        id: "type",
        header: "Type",
        accessorKey: "type",
        enableResizing: true,
        size: 130,
        minSize: 100,
        maxSize: 200,
        cell: ({ row }) => {
          const type = row.original.type;
          const typeLabels: Record<string, string> = {
            approval: "Approval",
            blast: "Blast",
            reminder: "Reminder",
            sms_consent_enabled: "SMS Consent Enabled",
            sms_consent_disabled: "SMS Consent Disabled",
          };
          return (
            <Badge variant="outline" className="text-xs">
              {typeLabels[type] || type}
            </Badge>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        enableResizing: true,
        size: 100,
        minSize: 80,
        maxSize: 150,
        cell: ({ row }) => {
          const status = row.original.status;
          const statusColors: Record<string, string> = {
            sent: "bg-green-100 text-green-800 border-green-200",
            failed: "bg-red-100 text-red-800 border-red-200",
            pending: "bg-amber-100 text-amber-800 border-amber-200",
          };
          return (
            <Badge
              variant="outline"
              className={cn("text-xs", statusColors[status] || "")}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          );
        },
      },
      {
        id: "message",
        header: "Message",
        accessorKey: "message",
        enableResizing: true,
        size: 250,
        minSize: 150,
        maxSize: 500,
        cell: ({ row }) => {
          const message = row.original.message;
          const truncatedMessage =
            message.length > 50 ? `${message.substring(0, 50)}...` : message;
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate max-w-[16rem] cursor-default">
                  {truncatedMessage}
                </span>
              </TooltipTrigger>
              <TooltipContent
                align="start"
                className="max-w-xs whitespace-pre-line"
              >
                {message}
              </TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "errorMessage",
        header: "Error Message",
        accessorKey: "errorMessage",
        enableResizing: true,
        size: 200,
        minSize: 150,
        maxSize: 400,
        cell: ({ row }) => {
          const errorMessage = row.original.errorMessage;
          if (!errorMessage) {
            return (
              <span className="text-sm text-muted-foreground">—</span>
            );
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm truncate max-w-[16rem] cursor-default text-red-600">
                  {errorMessage}
                </span>
              </TooltipTrigger>
              <TooltipContent
                align="start"
                className="max-w-xs whitespace-pre-line"
              >
                {errorMessage}
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
      {
        id: "sentAt",
        header: "Sent At",
        accessorKey: "sentAt",
        enableResizing: true,
        size: 120,
        minSize: 100,
        maxSize: 150,
        cell: ({ row }) => {
          const timestamp = row.original.sentAt;
          if (!timestamp) {
            return (
              <span className="text-sm text-muted-foreground">—</span>
            );
          }
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
    ],
    [],
  );

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>({});

  // Selection state management
  const [selectedRows, setSelectedRows] = React.useState<Set<string>>(
    new Set(),
  );

  // Clear selection when filters change or page changes
  React.useEffect(() => {
    setSelectedRows(new Set());
  }, [phoneSearch, statusFilter, typeFilter, cursor]);

  // Calculate pagination info
  const currentPage = cursorHistory.length + 1;
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(
    currentPage * pageSize,
    startItem + (notifications?.length || 0) - 1,
  );

  // Navigation handlers
  const goToNextPage = React.useCallback(() => {
    if (notificationsPaginated?.nextCursor && !notificationsPaginated.isDone) {
      setCursorHistory((prev) => [...prev, cursor]);
      setCursor(notificationsPaginated.nextCursor);
    }
  }, [notificationsPaginated?.nextCursor, notificationsPaginated?.isDone, cursor]);

  const goToPreviousPage = React.useCallback(() => {
    if (cursorHistory.length > 0) {
      const previousCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setCursor(previousCursor);
    } else {
      setCursor(null);
    }
  }, [cursorHistory]);

  // Selection handlers
  const toggleSelectRow = React.useCallback(
    (notificationId: string) => {
      const newSelectedRows = new Set(selectedRows);
      if (newSelectedRows.has(notificationId)) {
        newSelectedRows.delete(notificationId);
      } else {
        newSelectedRows.add(notificationId);
      }
      setSelectedRows(newSelectedRows);
    },
    [selectedRows],
  );

  // Create initial columns with selection
  const initialCols = React.useMemo<ColumnDef<PaginatedSmsNotificationResult["page"][0]>[]>(
    () => [
      {
        id: "select",
        header: "Select",
        enableResizing: false,
        size: 60,
        minSize: 50,
        maxSize: 70,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedRows.has(row.original._id)}
            onCheckedChange={() => toggleSelectRow(row.original._id)}
            aria-label="Select row"
            className="ml-2"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      ...baseCols,
    ],
    [baseCols, selectedRows, toggleSelectRow],
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
        filteredColumnOrder.every(
          (identifier, index) => identifier === previousColumnOrder[index],
        );

      if (isSameOrder) {
        return previousColumnOrder;
      }

      return [...filteredColumnOrder, ...missingColumnIdentifiers];
    });
  }, [computedInitialColumnIdentifiers]);

  // useReactTable returns a mutable instance with non-memoizable callbacks; suppress lint warning.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: notifications,
    columns: initialCols,
    state: { sorting, columnOrder, columnSizing },
    manualPagination: true,
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    enableColumnResizing: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const [draggedColumnIdentifier, setDraggedColumnIdentifier] =
    React.useState<string | null>(null);
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
    const withSpacing = identifier
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ");
    return withSpacing
      .split(" ")
      .filter(Boolean)
      .map(
        (segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
      )
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
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      try {
        return window.matchMedia("(pointer: coarse)").matches;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const createDragPreviewElement = React.useCallback(
    (
      event: React.DragEvent<HTMLTableHeaderCellElement>,
      columnDisplayLabel: string,
    ) => {
      if (typeof document === "undefined" || typeof window === "undefined") {
        return;
      }

      removeDragPreviewElement();

      const headerElement = event.currentTarget;
      const headerStyles = window.getComputedStyle(headerElement);
      const resolvedBackgroundColor =
        headerStyles.backgroundColor &&
        headerStyles.backgroundColor !== "rgba(0, 0, 0, 0)"
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
          dataTransfer.setDragImage(
            previewElement,
            previewWidth / 2,
            previewHeight / 2,
          );
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
    [
      formatColumnIdentifier,
      hasCoarsePointer,
      removeDragPreviewElement,
      updateDragPreviewPosition,
    ],
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
    (
      event: React.DragEvent<HTMLTableHeaderCellElement>,
      targetColumnIdentifier: string,
    ) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      updateDragPreviewPosition(
        event.clientX ?? event.nativeEvent?.clientX ?? null,
        event.clientY ?? event.nativeEvent?.clientY ?? null,
      );

      if (
        !draggedColumnIdentifier ||
        draggedColumnIdentifier === targetColumnIdentifier
      ) {
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
    (
      event: React.DragEvent<HTMLTableHeaderCellElement>,
      targetColumnIdentifier: string,
    ) => {
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
        dragHoverDetails &&
        dragHoverDetails.columnId === targetColumnIdentifier
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
        const insertionIndex =
          dropPosition === "after" ? targetIndex + 1 : targetIndex;
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
  const currentPageIds = currentPageRows.map((row) => row.original._id);
  const currentPageSelectedCount = currentPageIds.filter((id) =>
    selectedRows.has(id),
  ).length;

  const allSelected = React.useMemo(() => {
    return (
      currentPageRows.length > 0 &&
      currentPageSelectedCount === currentPageRows.length
    );
  }, [currentPageSelectedCount, currentPageRows.length]);

  const someSelected = React.useMemo(() => {
    return (
      currentPageSelectedCount > 0 &&
      currentPageSelectedCount < currentPageRows.length
    );
  }, [currentPageSelectedCount, currentPageRows.length]);

  // Update the toggle select all function
  const toggleSelectAllCurrent = React.useCallback(() => {
    if (allSelected) {
      setSelectedRows(new Set());
    } else {
      const newSelection = new Set(selectedRows);
      currentPageIds.forEach((id) => newSelection.add(id));
      setSelectedRows(newSelection);
    }
  }, [allSelected, selectedRows, currentPageIds]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && !e.shiftKey) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          toggleSelectAllCurrent();
        }
      }
      if (e.key === "Escape") {
        setSelectedRows(new Set());
      }
    };

    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [toggleSelectAllCurrent]);

  // Create the final columns with proper header checkbox, filtered by visibility
  const finalCols = React.useMemo<ColumnDef<PaginatedSmsNotificationResult["page"][0]>[]>(
    () => {
      const allCols = [
        {
          id: "select",
          header: ({ table }: HeaderContext<PaginatedSmsNotificationResult["page"][0], unknown>) => (
            <Checkbox
              checked={allSelected || someSelected ? true : false}
              onCheckedChange={toggleSelectAllCurrent}
              aria-label="Select all"
              className="ml-2"
              ref={(el: HTMLButtonElement | null) => {
                if (el) {
                  const input = el.querySelector(
                    'input[type="checkbox"]',
                  ) as HTMLInputElement;
                  if (input) {
                    input.indeterminate = someSelected;
                  }
                }
              }}
            />
          ),
          cell: ({ row }: CellContext<PaginatedSmsNotificationResult["page"][0], unknown>) => (
            <Checkbox
              checked={selectedRows.has(row.original._id)}
              onCheckedChange={() => toggleSelectRow(row.original._id)}
              aria-label="Select row"
              className="ml-2"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        },
        ...baseCols,
      ];

      // Filter columns based on visibility (always show select column)
      return allCols.filter((col) => {
        const columnId = col.id;
        if (columnId === "select") {
          return true; // Always show select column
        }
        return columnId ? visibleColumns.has(columnId) : true;
      });
    },
    [
      baseCols,
      selectedRows,
      allSelected,
      someSelected,
      toggleSelectAllCurrent,
      toggleSelectRow,
      visibleColumns,
    ],
  );

  // Update table columns
  React.useEffect(() => {
    table.setOptions((prev) => ({
      ...prev,
      columns: finalCols,
    }));
  }, [finalCols, table]);

  // Check if any main queries are loading
  const isLoading =
    events === undefined ||
    notificationsPaginated === undefined ||
    totalCount === undefined;

  // Helper function to get column display name
  const getColumnDisplayName = React.useCallback(
    (columnId: string): string => {
      const columnMap: Record<string, string> = {
        select: "Select",
        recipient: "Recipient",
        phone: "Phone",
        event: "Event",
        type: "Type",
        status: "Status",
        message: "Message",
        errorMessage: "Error Message",
        createdAt: "Created",
        sentAt: "Sent At",
      };

      return columnMap[columnId] || formatColumnIdentifier(columnId);
    },
    [formatColumnIdentifier],
  );

  // Clear all filters function
  const clearAllFilters = () => {
    setPhoneSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  // Check if any filters are active
  const hasActiveFilters =
    phoneSearch.trim() !== "" ||
    statusFilter !== "all" ||
    typeFilter !== "all";

  // Get unique values for filter dropdowns
  const uniqueStatuses = React.useMemo(() => {
    return ["sent", "failed", "pending"];
  }, []);

  const uniqueTypes = React.useMemo(() => {
    return ["approval", "blast", "reminder", "sms_consent_enabled", "sms_consent_disabled"];
  }, []);

  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:gap-1">
          <div className="flex items-start justify-between gap-3 sm:block">
            <h2 className="text-3xl font-bold tracking-tight">Texts</h2>
          </div>
          <p className="text-muted-foreground">
            View SMS message logs and delivery status
          </p>
        </div>
      </div>

      {/* Event Selector */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm text-foreground/70">Event:</span>
        <Select value={eventId} onValueChange={setEventId} className="max-w-sm">
          <SelectOption value="">All Events</SelectOption>
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
          placeholder="Search phone number"
          value={phoneSearch}
          onChange={(e) => setPhoneSearch(e.target.value)}
        />
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
          className="w-32"
        >
          <SelectOption value="all">All Status</SelectOption>
          {uniqueStatuses.map((status) => (
            <SelectOption key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </SelectOption>
          ))}
        </Select>
        <Select
          value={typeFilter}
          onValueChange={setTypeFilter}
          className="w-32"
        >
          <SelectOption value="all">All Types</SelectOption>
          {uniqueTypes.map((type) => (
            <SelectOption key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ")}
            </SelectOption>
          ))}
        </Select>
        <span className="mx-2 h-6 w-px bg-foreground/20" />
        <Popover open={columnVisibilityOpen} onOpenChange={setColumnVisibilityOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8"
            >
              <Columns className="h-4 w-4 mr-2" />
              Columns
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Show Columns</h4>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {getAllAvailableColumnIds()
                  .filter((columnId) => columnId !== "select")
                  .map((columnId) => {
                    const displayName = getColumnDisplayName(columnId);
                    const isVisible = visibleColumns.has(columnId);
                    return (
                      <div key={columnId} className="flex items-center">
                        <Checkbox
                          id={`column-${columnId}`}
                          checked={isVisible}
                          onCheckedChange={(checked) => {
                            setVisibleColumns((previousVisibleColumns) => {
                              const updatedVisibleColumns = new Set(
                                previousVisibleColumns,
                              );
                              if (checked === true) {
                                updatedVisibleColumns.add(columnId);
                              } else {
                                updatedVisibleColumns.delete(columnId);
                              }
                              return updatedVisibleColumns;
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
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8 text-xs"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm text-foreground/70">Active filters:</span>
          {phoneSearch.trim() !== "" && (
            <Badge variant="secondary" className="gap-1">
              Phone: &ldquo;{phoneSearch}&rdquo;
              <button
                onClick={() => setPhoneSearch("")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Status:{" "}
              {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
              <button
                onClick={() => setStatusFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          {typeFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              Type:{" "}
              {typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1).replace(/_/g, " ")}
              <button
                onClick={() => setTypeFilter("all")}
                className="ml-1 hover:bg-foreground/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
          <span className="text-xs text-foreground/60">
            (Showing {notifications.length} messages on this page)
          </span>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedRows.size > 0 && (
        <div className="flex items-center justify-between bg-muted/50 border rounded-md p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {selectedRows.size} selected
            </span>
            <button
              onClick={() => setSelectedRows(new Set())}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8"
            >
              Clear selection
            </button>
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
                <tr
                  key={headerGroup.id}
                  className="text-left text-foreground/70"
                >
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
                    const columnMeta = header.column
                      .columnDef.meta as { label?: string } | undefined;
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
                          isDraggingColumn
                            ? "cursor-grabbing"
                            : "cursor-pointer",
                          dragHoverDetails?.columnId === columnIdentifier &&
                            dragHoverDetails.position === "before" &&
                            "border-l-2 border-l-foreground/40",
                          dragHoverDetails?.columnId === columnIdentifier &&
                            dragHoverDetails.position === "after" &&
                            "border-r-2 border-r-foreground/40",
                          draggedColumnIdentifier === columnIdentifier &&
                            "opacity-60",
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
                                  const headerElement = event.currentTarget.closest('th') as HTMLTableHeaderCellElement | null;
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
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {{ asc: " ▲", desc: " ▼" }[
                              header.column.getIsSorted() as string
                            ] ?? null}
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
                const notification = row.original;
                const isSelected = selectedRows.has(notification._id);

                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-t border-foreground/10 transition-colors hover:bg-muted/50",
                      isSelected &&
                        "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-2 py-1",
                          cell.column.id !== "select" && "cursor-pointer",
                        )}
                        style={{
                          width: cell.column.getSize(),
                          minWidth: cell.column.columnDef.minSize,
                          maxWidth: cell.column.columnDef.maxSize,
                        }}
                        onClick={
                          cell.column.id !== "select"
                            ? () => toggleSelectRow(notification._id)
                            : undefined
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && notificationsPaginated && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <div className="flex items-center gap-4">
            <div className="text-sm text-foreground/70">
              {!notifications || notifications.length === 0 ? (
                <span>No messages found{hasActiveFilters && " (filtered)"}</span>
              ) : (
                <span>
                  Showing {startItem}-{endItem} of {totalCount || "?"} messages
                  {hasActiveFilters && " (filtered)"}
                </span>
              )}
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("pageSize", value);
                router.replace(`${textsPath}?${params.toString()}`, {
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
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage}
                  </span>
                </div>

                <PaginationItem>
                  <PaginationNext
                    onClick={goToNextPage}
                    className={cn(
                      "h-8 w-8 sm:h-9 sm:w-auto sm:px-3",
                      notificationsPaginated?.isDone || !notificationsPaginated?.nextCursor
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
    </div>
  );
}

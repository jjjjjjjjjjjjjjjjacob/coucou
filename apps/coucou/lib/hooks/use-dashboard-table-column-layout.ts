"use client";

import { api } from "@convex/_generated/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnSizingState, OnChangeFn, VisibilityState } from "@tanstack/react-table";
import React from "react";
import {
  areDashboardTableColumnIdsEqual,
  mergeDashboardTablePreferenceState,
  moveDashboardTableColumnId,
  serializeDashboardTablePreferenceState,
  shouldHydrateDashboardTablePreferenceState,
} from "@/lib/dashboard-table-preferences";
import { useDebounce } from "@/lib/hooks/use-debounce";

const PREFERENCE_SAVE_DEBOUNCE_MS = 500;

export interface DashboardTableDragHoverDetails {
  columnId: string;
  position: "before" | "after";
}

export interface DashboardTableColumnLayout {
  columnOrder: string[];
  columnVisibility: VisibilityState;
  columnSizing: ColumnSizingState;
  onColumnSizingChange: OnChangeFn<ColumnSizingState>;
  hiddenColumnIds: string[];
  setHiddenColumnIds: (nextHiddenColumnIds: string[]) => void;
  hasHydratedPreference: boolean;
  draggedColumnIdentifier: string | null;
  dragHoverDetails: DashboardTableDragHoverDetails | null;
  handleColumnDragStart: (
    event: React.DragEvent<HTMLTableHeaderCellElement>,
    columnIdentifier: string,
    columnDisplayLabel: string,
  ) => void;
  handleColumnDragOver: (
    event: React.DragEvent<HTMLTableHeaderCellElement>,
    targetColumnIdentifier: string,
  ) => void;
  handleColumnDrop: (
    event: React.DragEvent<HTMLTableHeaderCellElement>,
    targetColumnIdentifier: string,
  ) => void;
  handleColumnDragEnd: () => void;
  setTableContainerElement: (element: HTMLDivElement | null) => void;
  tableContainerWidth: number;
}

interface UseDashboardTableColumnLayoutOptions {
  tableKey: string;
  scopeKey: string;
  availableColumnIds: readonly string[];
  defaultVisibleColumnIds: readonly string[];
  isEnabled: boolean;
  queryArgs: { siteKey?: string; workspaceSlug?: string };
}

/**
 * Owns a dashboard table's column order, visibility, sizing, and header
 * drag-to-reorder state, persisting order + visibility (never widths) per
 * user via dashboardPreferences. Extracted from the GuestManager pattern in
 * host/rsvps/page.tsx so other tables can reuse it; migrating GuestManager
 * itself onto this hook is a flagged follow-up.
 */
export function useDashboardTableColumnLayout(
  options: UseDashboardTableColumnLayoutOptions,
): DashboardTableColumnLayout {
  const availableColumnIdSignature = options.availableColumnIds.join("");
  const availableColumnIds = React.useMemo(
    () => [...options.availableColumnIds],
    [availableColumnIdSignature],
  );
  const defaultVisibleColumnIdSignature = options.defaultVisibleColumnIds.join("");
  const defaultVisibleColumnIds = React.useMemo(
    () => [...options.defaultVisibleColumnIds],
    [defaultVisibleColumnIdSignature],
  );

  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => [...availableColumnIds]);
  const [hiddenColumnIds, setHiddenColumnIdsState] = React.useState<string[]>(() =>
    availableColumnIds.filter((columnId) => !defaultVisibleColumnIds.includes(columnId)),
  );
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [hasHydratedPreference, setHasHydratedPreference] = React.useState(false);

  const hasPendingLocalPreferenceEditRef = React.useRef(false);
  const lastSavedPreferenceSignatureRef = React.useRef<string | null>(null);
  const hydratedPreferenceKeyRef = React.useRef<string | null>(null);
  const previousStructureSignatureRef = React.useRef(availableColumnIdSignature);

  React.useEffect(() => {
    if (previousStructureSignatureRef.current === availableColumnIdSignature) {
      return;
    }
    previousStructureSignatureRef.current = availableColumnIdSignature;
    hasPendingLocalPreferenceEditRef.current = false;
    hydratedPreferenceKeyRef.current = null;
    setColumnSizing({});
  }, [availableColumnIdSignature]);

  const savedPreferenceQuery = useQuery({
    ...convexQuery(api.dashboardPreferences.getCurrentUserTablePreference, {
      tableKey: options.tableKey,
      scopeKey: options.scopeKey,
      ...options.queryArgs,
    }),
    enabled: options.isEnabled,
  });
  const savedPreference = savedPreferenceQuery.data as
    | { columnOrder?: string[]; hiddenColumnIds?: string[] }
    | null
    | undefined;
  const savedPreferenceSignature =
    savedPreference === undefined
      ? ""
      : serializeDashboardTablePreferenceState(
          savedPreference?.columnOrder ?? [],
          savedPreference?.hiddenColumnIds ?? [],
        );

  const saveTablePreference = useMutation({
    mutationFn: useConvexMutation(api.dashboardPreferences.upsertCurrentUserTablePreference),
  });
  const saveTablePreferenceAsync = saveTablePreference.mutateAsync;

  const preferencePayload = React.useMemo(() => {
    const normalizedColumnOrder = columnOrder.filter((columnId) =>
      availableColumnIds.includes(columnId),
    );
    const missingColumnIds = availableColumnIds.filter(
      (columnId) => !normalizedColumnOrder.includes(columnId),
    );
    const completeColumnOrder = [...normalizedColumnOrder, ...missingColumnIds];
    const normalizedHiddenColumnIds = availableColumnIds.filter((columnId) =>
      hiddenColumnIds.includes(columnId),
    );

    return {
      columnOrder: completeColumnOrder,
      hiddenColumnIds: normalizedHiddenColumnIds,
      signature: serializeDashboardTablePreferenceState(
        completeColumnOrder,
        normalizedHiddenColumnIds,
      ),
    };
  }, [availableColumnIds, columnOrder, hiddenColumnIds]);

  // Hydrate saved preferences (skipped while unsaved local edits are pending).
  React.useEffect(() => {
    if (savedPreference === undefined || availableColumnIds.length === 0) {
      return;
    }
    if (
      !shouldHydrateDashboardTablePreferenceState({
        currentPreferenceSignature: preferencePayload.signature,
        savedPreferenceSignature,
        hasLocalPreferenceEdits: hasPendingLocalPreferenceEditRef.current,
      })
    ) {
      return;
    }
    if (preferencePayload.signature === savedPreferenceSignature) {
      hasPendingLocalPreferenceEditRef.current = false;
    }
    const hydrationKey = [availableColumnIdSignature, savedPreferenceSignature].join("");
    if (hydratedPreferenceKeyRef.current === hydrationKey) {
      return;
    }
    hydratedPreferenceKeyRef.current = hydrationKey;

    const mergedPreferenceState = mergeDashboardTablePreferenceState({
      availableColumnIds,
      defaultVisibleColumnIds,
      savedColumnOrder: savedPreference?.columnOrder,
      hiddenColumnIds: savedPreference?.hiddenColumnIds,
    });

    setColumnOrder((previousColumnOrder) =>
      areDashboardTableColumnIdsEqual(previousColumnOrder, mergedPreferenceState.columnOrder)
        ? previousColumnOrder
        : mergedPreferenceState.columnOrder,
    );
    setHiddenColumnIdsState((previousHiddenColumnIds) =>
      areDashboardTableColumnIdsEqual(
        previousHiddenColumnIds,
        mergedPreferenceState.hiddenColumnIds,
      )
        ? previousHiddenColumnIds
        : mergedPreferenceState.hiddenColumnIds,
    );
    lastSavedPreferenceSignatureRef.current = serializeDashboardTablePreferenceState(
      mergedPreferenceState.columnOrder,
      mergedPreferenceState.hiddenColumnIds,
    );
    hasPendingLocalPreferenceEditRef.current = false;
    setHasHydratedPreference(true);
  }, [
    availableColumnIdSignature,
    availableColumnIds,
    defaultVisibleColumnIds,
    preferencePayload.signature,
    savedPreference,
    savedPreferenceSignature,
  ]);

  const debouncedPreferencePayload = useDebounce(preferencePayload, PREFERENCE_SAVE_DEBOUNCE_MS);

  React.useEffect(() => {
    if (!options.isEnabled || savedPreference === undefined) {
      return;
    }
    if (debouncedPreferencePayload.signature !== preferencePayload.signature) {
      return;
    }
    if (lastSavedPreferenceSignatureRef.current === debouncedPreferencePayload.signature) {
      return;
    }

    lastSavedPreferenceSignatureRef.current = debouncedPreferencePayload.signature;
    void saveTablePreferenceAsync({
      tableKey: options.tableKey,
      scopeKey: options.scopeKey,
      columnOrder: debouncedPreferencePayload.columnOrder,
      hiddenColumnIds: debouncedPreferencePayload.hiddenColumnIds,
      ...options.queryArgs,
    }).catch((error: unknown) => {
      lastSavedPreferenceSignatureRef.current = null;
      console.error("Failed to save table preferences", error);
    });
  }, [
    debouncedPreferencePayload,
    options.isEnabled,
    options.queryArgs,
    options.scopeKey,
    options.tableKey,
    preferencePayload.signature,
    savedPreference,
    saveTablePreferenceAsync,
  ]);

  const setHiddenColumnIds = React.useCallback((nextHiddenColumnIds: string[]) => {
    hasPendingLocalPreferenceEditRef.current = true;
    setHiddenColumnIdsState(nextHiddenColumnIds);
  }, []);

  const columnVisibility = React.useMemo(() => {
    const visibility: VisibilityState = {};
    for (const columnId of hiddenColumnIds) {
      visibility[columnId] = false;
    }
    return visibility;
  }, [hiddenColumnIds]);

  // --- Header drag-to-reorder (HTML5 drag events + floating preview pill) ---

  const [draggedColumnIdentifier, setDraggedColumnIdentifier] = React.useState<string | null>(null);
  const draggedColumnIdentifierRef = React.useRef<string | null>(null);
  const [dragHoverDetails, setDragHoverDetails] =
    React.useState<DashboardTableDragHoverDetails | null>(null);
  const dragPreviewElementRef = React.useRef<HTMLDivElement | null>(null);
  const dragPreviewFollowPointerRef = React.useRef(false);

  const removeDragPreviewElement = React.useCallback(() => {
    const existingPreviewElement = dragPreviewElementRef.current;
    if (existingPreviewElement?.parentNode) {
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

      const previewElement = document.createElement("div");
      previewElement.textContent = columnDisplayLabel || "Column";
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
    [hasCoarsePointer, removeDragPreviewElement, updateDragPreviewPosition],
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

      const targetBounds = event.currentTarget.getBoundingClientRect();
      const pointerOffset = event.clientX - targetBounds.left;
      const position: "before" | "after" =
        pointerOffset < targetBounds.width / 2 ? "before" : "after";

      setDragHoverDetails({ columnId: targetColumnIdentifier, position });
    },
    [draggedColumnIdentifier, updateDragPreviewPosition],
  );

  const handleColumnDrop = React.useCallback(
    (event: React.DragEvent<HTMLTableHeaderCellElement>, targetColumnIdentifier: string) => {
      event.preventDefault();
      event.stopPropagation();

      const activeColumnIdentifier = draggedColumnIdentifierRef.current ?? draggedColumnIdentifier;
      const dropPosition =
        dragHoverDetails && dragHoverDetails.columnId === targetColumnIdentifier
          ? dragHoverDetails.position
          : "before";

      draggedColumnIdentifierRef.current = null;
      setDraggedColumnIdentifier(null);
      setDragHoverDetails(null);
      removeDragPreviewElement();

      if (!activeColumnIdentifier || activeColumnIdentifier === targetColumnIdentifier) {
        return;
      }

      hasPendingLocalPreferenceEditRef.current = true;
      setColumnOrder((previousColumnOrder) =>
        moveDashboardTableColumnId(
          previousColumnOrder,
          activeColumnIdentifier,
          targetColumnIdentifier,
          dropPosition,
        ),
      );
    },
    [draggedColumnIdentifier, dragHoverDetails, removeDragPreviewElement],
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

  // --- Container width tracking for filler-column math ---

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

  return {
    columnOrder,
    columnVisibility,
    columnSizing,
    onColumnSizingChange: setColumnSizing,
    hiddenColumnIds,
    setHiddenColumnIds,
    hasHydratedPreference,
    draggedColumnIdentifier,
    dragHoverDetails,
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDrop,
    handleColumnDragEnd,
    setTableContainerElement,
    tableContainerWidth,
  };
}

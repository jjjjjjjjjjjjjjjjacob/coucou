"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageSquare,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import posthog from "posthog-js";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatEventTitleInline } from "@/lib/event-display";
import type {
  RecipientApprovalStatus,
  RecipientFilterState,
  RecipientHistoryFilterState,
} from "@/lib/text-blast-filters";
import {
  DEFAULT_STATUS_FILTER,
  decodeRecipientFilter,
  describeRecipientFilter,
  encodeRecipientFilter,
  isRecipientFilterConfigured,
  RECIPIENT_FILTER_LABELS,
  RECIPIENT_STATUS_LABELS,
  recipientHistoryFilterIsConfigured,
} from "@/lib/text-blast-filters";
import {
  applyMessageTemplateVariables,
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  MESSAGE_TEMPLATE_VARIABLES,
  messageContainsMultiEventRestrictedVariables,
  messageContainsQrCodeUrlVariable,
  resolveEffectiveIncludeQrCodes,
} from "@/lib/text-blast-message";
import type { Event, TextBlast, TextBlastReplyAction } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

interface TextBlastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  blastId?: Id<"textBlasts"> | null;
  mode?: "full" | "replyActions";
}

interface FormData {
  eventIds: Id<"events">[];
  name: string;
  message: string;
  targetLists: string[];
  recipientFilter: RecipientFilterState;
  recipientHistoryFilter: RecipientHistoryFilterState;
  includeQrCodes: boolean;
  selectedRsvpIds: Id<"rsvps">[];
  replyActions: ReplyActionFormRow[];
}

interface ReplyActionFormRow {
  clientId: string;
  replyCode: string;
  targetEventId: Id<"events"> | "";
  targetListKey: string;
  isEnabled: boolean;
}

interface ReplyActionTargetOption {
  eventId: Id<"events">;
  eventName: string;
  eventSecondaryTitle?: string;
  eventDate: number;
  eventTimezone?: string;
  lists: Array<{ listKey: string; password?: string }>;
}

interface RecipientSelectionRow {
  rsvpId: Id<"rsvps">;
  name: string;
  listKey: string;
  eventId: Id<"events">;
  eventName: string;
  approvalStatus: RecipientApprovalStatus;
  attendanceStatus: "yes" | "no" | "maybe";
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
  smsConsent: boolean;
  createdAt: number;
}

const SMS_CHAR_LIMIT = 160;
const SMS_CONCAT_LIMIT = 320;
const RECIPIENT_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
type MessageTemplateVariableName = (typeof MESSAGE_TEMPLATE_VARIABLES)[number];
type RecipientTableSortOption =
  | "name"
  | "eventName"
  | "listKey"
  | "approvalStatus"
  | "attendanceStatus"
  | "ticketStatus"
  | "createdAt";
type RecipientTableSortOrder = "asc" | "desc";
type SendBlastResult =
  | {
      success: true;
      blastId: Id<"textBlasts">;
      totalRecipients: number;
      status: "sending";
    }
  | {
      success: false;
      message?: string;
    };

function createReplyActionClientId(): string {
  return `reply-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapStoredReplyActionToFormRow(replyAction: TextBlastReplyAction): ReplyActionFormRow {
  return {
    clientId: replyAction._id ?? createReplyActionClientId(),
    replyCode: replyAction.replyCode,
    targetEventId: replyAction.targetEventId,
    targetListKey: replyAction.targetListKey,
    isEnabled: replyAction.isEnabled,
  };
}

function normalizeReplyCodeForValidation(replyCode: string): string {
  return replyCode.trim().toLowerCase();
}

function getAttendanceStatusLabel(attendanceStatus: RecipientSelectionRow["attendanceStatus"]) {
  switch (attendanceStatus) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "maybe":
      return "Maybe";
    default:
      return "Maybe";
  }
}

function getTicketStatusLabel(ticketStatus: RecipientSelectionRow["ticketStatus"]) {
  switch (ticketStatus) {
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
}

function getRecipientTableSortValue(
  recipient: RecipientSelectionRow,
  sortBy: RecipientTableSortOption,
): number | string {
  switch (sortBy) {
    case "eventName":
      return recipient.eventName;
    case "listKey":
      return recipient.listKey;
    case "approvalStatus":
      return recipient.approvalStatus;
    case "attendanceStatus":
      return recipient.attendanceStatus;
    case "ticketStatus":
      return recipient.ticketStatus;
    case "createdAt":
      return recipient.createdAt;
    case "name":
    default:
      return recipient.name;
  }
}

export default function TextBlastDialog({
  isOpen,
  onClose,
  blastId,
  mode = "full",
}: TextBlastDialogProps) {
  const workspaceScope = useWorkspaceScope();
  const isReplyActionsOnlyMode = mode === "replyActions";
  const events = useQuery(api.events.listAll, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as Event[] | undefined;
  const eventsSorted = useMemo<Event[]>(
    () =>
      (events ?? [])
        .slice()
        .sort(
          (firstEvent, secondEvent) => (secondEvent.eventDate ?? 0) - (firstEvent.eventDate ?? 0),
        ),
    [events],
  );
  const existingBlast = useQuery(
    api.textBlasts.getBlastById,
    blastId && workspaceScope ? { blastId, ...workspaceScope.queryArgs } : "skip",
  ) as TextBlast | null | undefined;
  const createDraftMutation = useMutation(api.textBlasts.createDraft);
  const updateDraftMutation = useMutation(api.textBlasts.updateDraft);
  const updateReplyActionsMutation = useMutation(api.textBlasts.updateReplyActions);
  const sendBlastAction = useAction(api.textBlasts.sendBlast);
  const sendBlastDirectAction = useAction(api.textBlasts.sendBlastDirect);
  const replyActionTargetOptions = useQuery(
    api.textBlasts.getReplyActionTargetOptions,
    workspaceScope ? { ...workspaceScope.queryArgs } : "skip",
  ) as ReplyActionTargetOption[] | undefined;

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    eventIds: [],
    name: "",
    message: "",
    targetLists: [],
    recipientFilter: { type: "all" },
    recipientHistoryFilter: { type: "none", textBlastIds: [] },
    includeQrCodes: false,
    selectedRsvpIds: [],
    replyActions: [],
  });
  const [previewMode, setPreviewMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState("");
  const [recipientTableListFilter, setRecipientTableListFilter] = useState("all");
  const [recipientTableApprovalFilter, setRecipientTableApprovalFilter] = useState<
    "all" | RecipientApprovalStatus
  >("all");
  const [recipientTableSortBy, setRecipientTableSortBy] =
    useState<RecipientTableSortOption>("name");
  const [recipientTableSortOrder, setRecipientTableSortOrder] =
    useState<RecipientTableSortOrder>("asc");
  const [recipientTablePageSize, setRecipientTablePageSize] = useState<number>(20);
  const [recipientTablePage, setRecipientTablePage] = useState(1);
  const [isEventPopoverOpen, setIsEventPopoverOpen] = useState(false);

  const isEditMode = !!blastId;
  const selectedEvents = useMemo(() => {
    const eventMap = new Map((events ?? []).map((event) => [event._id, event]));
    return formData.eventIds
      .map((eventId) => eventMap.get(eventId))
      .filter((event): event is Event => event !== undefined);
  }, [events, formData.eventIds]);
  const primaryEvent = selectedEvents[0];
  const isMultiEventBlast = formData.eventIds.length > 1;
  const customFields = useMemo(() => {
    const fieldMap = new Map<string, NonNullable<Event["customFields"]>[number]>();
    for (const event of selectedEvents) {
      for (const customField of event.customFields ?? []) {
        fieldMap.set(customField.key, customField);
      }
    }
    return Array.from(fieldMap.values());
  }, [selectedEvents]);
  const recipientFilterIsConfigured = isRecipientFilterConfigured(formData.recipientFilter);
  const historyFilterIsConfigured = recipientHistoryFilterIsConfigured(
    formData.recipientHistoryFilter,
  );
  const encodedRecipientFilter = useMemo(
    () => encodeRecipientFilter(formData.recipientFilter),
    [formData.recipientFilter],
  );
  const encodedRecipientHistoryFilter = useMemo(() => {
    if (formData.recipientHistoryFilter.type === "none") return undefined;
    return {
      type: formData.recipientHistoryFilter.type,
      textBlastIds: formData.recipientHistoryFilter.textBlastIds as Id<"textBlasts">[],
    };
  }, [formData.recipientHistoryFilter]);
  const primaryEventId = formData.eventIds[0] ?? "";

  // Fetch available lists with counts for the selected event
  const availableListsWithCounts = useQuery(
    api.textBlasts.getAvailableListsForEvents,
    primaryEventId && workspaceScope
      ? {
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          recipientFilter: encodedRecipientFilter,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          ...(workspaceScope?.queryArgs ?? {}),
        }
      : "skip",
  ) as Array<{ listKey: string; recipientCount: number; totalRsvps: number }> | undefined;

  // Fetch recipients for selection (when target lists are selected)
  const recipientsForSelection = useQuery(
    api.textBlasts.getRecipientsForSelection,
    primaryEventId &&
      workspaceScope &&
      formData.targetLists.length > 0 &&
      recipientFilterIsConfigured &&
      historyFilterIsConfigured
      ? {
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          ...(workspaceScope?.queryArgs ?? {}),
        }
      : "skip",
  ) as RecipientSelectionRow[] | undefined;

  const recipientCountFromBackend = useQuery(
    api.textBlasts.countRecipientsForTargeting,
    primaryEventId &&
      workspaceScope &&
      formData.targetLists.length > 0 &&
      recipientFilterIsConfigured &&
      historyFilterIsConfigured
      ? {
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          selectedRsvpIds:
            formData.selectedRsvpIds.length > 0 ? formData.selectedRsvpIds : undefined,
          ...(workspaceScope?.queryArgs ?? {}),
        }
      : "skip",
  ) as number | undefined;
  const recipientCount = recipientCountFromBackend ?? 0;

  const historyBlastOptions = useQuery(
    api.textBlasts.getBlastsByWorkspaceWithSenderNames,
    workspaceScope
      ? {
          ...workspaceScope.queryArgs,
          limit: 100,
        }
      : "skip",
  ) as Array<TextBlast & { sentByName: string }> | undefined;
  const selectedHistoryBlastIds =
    formData.recipientHistoryFilter.type === "none"
      ? []
      : formData.recipientHistoryFilter.textBlastIds;
  const replyActionTargetOptionMap = useMemo(
    () => new Map((replyActionTargetOptions ?? []).map((option) => [option.eventId, option])),
    [replyActionTargetOptions],
  );
  const replyActionValidationMessage = useMemo(() => {
    const normalizedReplyCodes = new Set<string>();

    for (const replyAction of formData.replyActions) {
      const replyCode = replyAction.replyCode.trim();
      const normalizedReplyCode = normalizeReplyCodeForValidation(replyCode);
      if (!replyCode) {
        return "Reply action code is required.";
      }
      if (!replyAction.targetEventId) {
        return "Reply action destination event is required.";
      }
      if (!replyAction.targetListKey.trim()) {
        return "Reply action destination list is required.";
      }
      if (normalizedReplyCodes.has(normalizedReplyCode)) {
        return "Reply action codes must be unique.";
      }
      normalizedReplyCodes.add(normalizedReplyCode);
    }

    return null;
  }, [formData.replyActions]);
  const replyActionsAreValid = replyActionValidationMessage === null;

  // Get available lists for selected event from query result
  const availableLists = useMemo(() => {
    if (!availableListsWithCounts) return [];
    return availableListsWithCounts.map((list) => list.listKey);
  }, [availableListsWithCounts]);

  const selectedRsvpIdsSet = useMemo(
    () => new Set(formData.selectedRsvpIds),
    [formData.selectedRsvpIds],
  );
  const recipientTableFilteredRows = useMemo(() => {
    const normalizedSearchQuery = recipientSearchQuery.trim().toLowerCase();
    const filteredRows = (recipientsForSelection ?? []).filter((recipient) => {
      if (
        normalizedSearchQuery &&
        ![
          recipient.name,
          recipient.eventName,
          recipient.listKey,
          recipient.approvalStatus,
          recipient.attendanceStatus,
          recipient.ticketStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearchQuery)
      ) {
        return false;
      }

      if (recipientTableListFilter !== "all" && recipient.listKey !== recipientTableListFilter) {
        return false;
      }

      if (
        recipientTableApprovalFilter !== "all" &&
        recipient.approvalStatus !== recipientTableApprovalFilter
      ) {
        return false;
      }

      return true;
    });

    return filteredRows.sort((firstRecipient, secondRecipient) => {
      const firstValue = getRecipientTableSortValue(firstRecipient, recipientTableSortBy);
      const secondValue = getRecipientTableSortValue(secondRecipient, recipientTableSortBy);
      const directionMultiplier = recipientTableSortOrder === "asc" ? 1 : -1;
      const comparison =
        typeof firstValue === "number" && typeof secondValue === "number"
          ? firstValue - secondValue
          : String(firstValue).localeCompare(String(secondValue));

      if (comparison === 0) {
        return firstRecipient.name.localeCompare(secondRecipient.name);
      }

      return directionMultiplier * comparison;
    });
  }, [
    recipientsForSelection,
    recipientSearchQuery,
    recipientTableApprovalFilter,
    recipientTableListFilter,
    recipientTableSortBy,
    recipientTableSortOrder,
  ]);
  const recipientTableTotalPages = Math.max(
    1,
    Math.ceil(recipientTableFilteredRows.length / recipientTablePageSize),
  );
  const boundedRecipientTablePage = Math.min(recipientTablePage, recipientTableTotalPages);
  const recipientTablePageRows = useMemo(() => {
    const startIndex = (boundedRecipientTablePage - 1) * recipientTablePageSize;
    return recipientTableFilteredRows.slice(startIndex, startIndex + recipientTablePageSize);
  }, [boundedRecipientTablePage, recipientTableFilteredRows, recipientTablePageSize]);
  const recipientTablePageSelectedCount = recipientTablePageRows.filter((recipient) =>
    selectedRsvpIdsSet.has(recipient.rsvpId),
  ).length;
  const recipientTableAllPageRowsSelected =
    recipientTablePageRows.length > 0 &&
    recipientTablePageSelectedCount === recipientTablePageRows.length;
  const recipientTableSomePageRowsSelected =
    recipientTablePageSelectedCount > 0 &&
    recipientTablePageSelectedCount < recipientTablePageRows.length;
  const allMatchingRecipientsSelected =
    recipientTableFilteredRows.length > 0 &&
    recipientTableFilteredRows.every((recipient) => selectedRsvpIdsSet.has(recipient.rsvpId));

  useEffect(() => {
    setRecipientTablePage(1);
  }, [
    recipientSearchQuery,
    recipientTableApprovalFilter,
    recipientTableListFilter,
    recipientTablePageSize,
    recipientTableSortBy,
    recipientTableSortOrder,
  ]);

  useEffect(() => {
    if (recipientTablePage > recipientTableTotalPages) {
      setRecipientTablePage(recipientTableTotalPages);
    }
  }, [recipientTablePage, recipientTableTotalPages]);

  useEffect(() => {
    const currentFilter = formData.recipientFilter;
    if (currentFilter.type !== "custom_field_missing") {
      return;
    }

    if (customFields.length === 0) {
      if (currentFilter.fieldKey !== "") {
        setFormData((prev) => ({
          ...prev,
          recipientFilter: { type: "custom_field_missing", fieldKey: "" },
          selectedRsvpIds: [],
        }));
      }
      return;
    }

    const hasCurrentField = customFields.some((field) => field.key === currentFilter.fieldKey);
    if (!hasCurrentField) {
      setFormData((prev) => ({
        ...prev,
        recipientFilter: {
          type: "custom_field_missing",
          fieldKey: customFields[0].key,
        },
        selectedRsvpIds: [],
      }));
    }
  }, [formData.recipientFilter, customFields]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      if (existingBlast) {
        const targetEventIds =
          existingBlast.targetEventIds && existingBlast.targetEventIds.length > 0
            ? existingBlast.targetEventIds
            : [existingBlast.eventId];
        setFormData({
          eventIds: targetEventIds,
          name: existingBlast.name,
          message: existingBlast.message,
          targetLists: existingBlast.targetLists,
          recipientFilter: decodeRecipientFilter(existingBlast.recipientFilter ?? undefined),
          recipientHistoryFilter: existingBlast.recipientHistoryFilter
            ? {
                type: existingBlast.recipientHistoryFilter.type,
                textBlastIds: existingBlast.recipientHistoryFilter.textBlastIds,
              }
            : { type: "none", textBlastIds: [] },
          includeQrCodes: existingBlast.includeQrCodes ?? false,
          selectedRsvpIds: existingBlast.selectedRsvpIds ?? [],
          replyActions: (existingBlast.replyActions ?? []).map(mapStoredReplyActionToFormRow),
        });
        // Recipient count will be calculated by the useEffect above when targetLists are set
        setCurrentStep(1);
      } else {
        setFormData({
          eventIds: [],
          name: "",
          message: "",
          targetLists: [],
          recipientFilter: { type: "all" },
          recipientHistoryFilter: { type: "none", textBlastIds: [] },
          includeQrCodes: false,
          selectedRsvpIds: [],
          replyActions: [],
        });
        setCurrentStep(1);
      }
      setPreviewMode(false);
      setRecipientSearchQuery("");
      setRecipientTableListFilter("all");
      setRecipientTableApprovalFilter("all");
      setRecipientTableSortBy("name");
      setRecipientTableSortOrder("asc");
      setRecipientTablePage(1);
      setIsEventPopoverOpen(false);
    }
  }, [isOpen, existingBlast]);

  // Calculate character count and message type
  const messageLength = formData.message.length;
  const messageType =
    messageLength <= SMS_CHAR_LIMIT
      ? "SMS"
      : messageLength <= SMS_CONCAT_LIMIT
        ? "Long SMS"
        : "Too Long";
  const isMessageTooLong = messageLength > SMS_CONCAT_LIMIT;

  // Template variables for message preview
  const sampleData = {
    firstName: "John",
    eventName: primaryEvent ? formatEventTitleForMessageTemplate(primaryEvent) : "Sample Event",
    eventDate: primaryEvent
      ? formatEventDateForMessageTemplate(primaryEvent.eventDate, primaryEvent.eventTimezone)
      : "12.31.2024",
    eventLocation: primaryEvent?.location || "Sample Location",
    qrCodeUrl: "https://example.com/ticket",
  };

  const hasMultiEventRestrictedVariables =
    isMultiEventBlast && messageContainsMultiEventRestrictedVariables(formData.message);
  const qrCodesAreForcedByMessage =
    !isMultiEventBlast && messageContainsQrCodeUrlVariable(formData.message);
  const effectiveIncludeQrCodes = resolveEffectiveIncludeQrCodes({
    isMultiEventBlast,
    includeQrCodes: formData.includeQrCodes,
    message: formData.message,
  });
  const availableMessageTemplateVariables: readonly MessageTemplateVariableName[] =
    isMultiEventBlast ? ["firstName"] : MESSAGE_TEMPLATE_VARIABLES;
  const qrImageCheckboxDisabled = !primaryEventId || isMultiEventBlast || qrCodesAreForcedByMessage;
  const qrImageCheckboxChecked = Boolean(primaryEventId) && effectiveIncludeQrCodes;
  const qrImageHelperText = !primaryEventId
    ? "Select one event to enable QR code image attachments."
    : isMultiEventBlast
      ? "QR attachments are only available for single-event blasts."
      : qrCodesAreForcedByMessage
        ? "The {{qrCodeUrl}} variable automatically enables QR code image delivery for recipients with redemption codes."
        : "When enabled, QR code images will be generated and sent as MMS attachments for recipients with redemption codes. Use {{qrCodeUrl}} in your message to include the QR code URL in the text.";

  const previewMessage = applyMessageTemplateVariables(formData.message, sampleData);

  const handleEventToggle = (eventId: Id<"events">, checked: boolean) => {
    setFormData((prev) => {
      // Reset filter to "all" when event changes if it's event-specific (custom_field_missing)
      const newRecipientFilter =
        prev.recipientFilter.type === "custom_field_missing"
          ? { type: "all" as const }
          : prev.recipientFilter;
      const nextEventIds = checked
        ? [...prev.eventIds, eventId]
        : prev.eventIds.filter((selectedEventId) => selectedEventId !== eventId);
      const nextIsMultiEvent = nextEventIds.length > 1;

      return {
        ...prev,
        eventIds: nextEventIds,
        targetLists: [], // Reset target lists when event changes
        selectedRsvpIds: [],
        recipientFilter: newRecipientFilter,
        includeQrCodes: nextIsMultiEvent ? false : prev.includeQrCodes,
      };
    });
  };

  const handleTargetListChange = (listKey: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      targetLists: checked
        ? [...prev.targetLists, listKey]
        : prev.targetLists.filter((key) => key !== listKey),
      selectedRsvpIds: [],
    }));
  };

  const toggleRecipientSelection = (rsvpId: Id<"rsvps">) => {
    setFormData((prev) => {
      const isSelected = prev.selectedRsvpIds.includes(rsvpId);
      return {
        ...prev,
        selectedRsvpIds: isSelected
          ? prev.selectedRsvpIds.filter((selectedRsvpId) => selectedRsvpId !== rsvpId)
          : [...prev.selectedRsvpIds, rsvpId],
      };
    });
  };

  const toggleRecipientPageSelection = (checked: boolean) => {
    setFormData((prev) => {
      const pageRsvpIds = recipientTablePageRows.map((recipient) => recipient.rsvpId);
      const nextSelectedRsvpIds = new Set(prev.selectedRsvpIds);
      for (const rsvpId of pageRsvpIds) {
        if (checked) {
          nextSelectedRsvpIds.add(rsvpId);
        } else {
          nextSelectedRsvpIds.delete(rsvpId);
        }
      }
      return { ...prev, selectedRsvpIds: Array.from(nextSelectedRsvpIds) };
    });
  };

  const selectAllMatchingRecipients = () => {
    setFormData((prev) => {
      const nextSelectedRsvpIds = new Set(prev.selectedRsvpIds);
      for (const recipient of recipientTableFilteredRows) {
        nextSelectedRsvpIds.add(recipient.rsvpId);
      }
      return { ...prev, selectedRsvpIds: Array.from(nextSelectedRsvpIds) };
    });
  };

  const clearRecipientSelection = () => {
    setFormData((prev) => ({ ...prev, selectedRsvpIds: [] }));
  };

  const getReplyActionListOptions = (targetEventId: Id<"events"> | "") => {
    if (!targetEventId) return [];
    return replyActionTargetOptionMap.get(targetEventId)?.lists ?? [];
  };

  const buildReplyActionPayload = () =>
    formData.replyActions.map((replyAction) => ({
      replyCode: replyAction.replyCode.trim(),
      targetEventId: replyAction.targetEventId as Id<"events">,
      targetListKey: replyAction.targetListKey.trim(),
      isEnabled: replyAction.isEnabled,
    }));

  const addReplyAction = () => {
    const firstTargetOption = replyActionTargetOptions?.[0];
    const firstListOption = firstTargetOption?.lists[0];
    setFormData((prev) => ({
      ...prev,
      replyActions: [
        ...prev.replyActions,
        {
          clientId: createReplyActionClientId(),
          replyCode: firstListOption?.password ?? "",
          targetEventId: firstTargetOption?.eventId ?? "",
          targetListKey: firstListOption?.listKey ?? "",
          isEnabled: true,
        },
      ],
    }));
  };

  const removeReplyAction = (clientId: string) => {
    setFormData((prev) => ({
      ...prev,
      replyActions: prev.replyActions.filter((replyAction) => replyAction.clientId !== clientId),
    }));
  };

  const setReplyAction = (
    clientId: string,
    patch: Partial<Omit<ReplyActionFormRow, "clientId">>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      replyActions: prev.replyActions.map((replyAction) =>
        replyAction.clientId === clientId ? { ...replyAction, ...patch } : replyAction,
      ),
    }));
  };

  const handleReplyActionTargetEventChange = (
    clientId: string,
    targetEventId: Id<"events"> | "",
  ) => {
    const targetOption = targetEventId ? replyActionTargetOptionMap.get(targetEventId) : undefined;
    const firstListOption = targetOption?.lists[0];
    setFormData((prev) => ({
      ...prev,
      replyActions: prev.replyActions.map((replyAction) => {
        if (replyAction.clientId !== clientId) return replyAction;
        return {
          ...replyAction,
          targetEventId,
          targetListKey: firstListOption?.listKey ?? "",
          replyCode: replyAction.replyCode.trim() || firstListOption?.password || "",
        };
      }),
    }));
  };

  const handleReplyActionTargetListChange = (clientId: string, targetListKey: string) => {
    setFormData((prev) => ({
      ...prev,
      replyActions: prev.replyActions.map((replyAction) => {
        if (replyAction.clientId !== clientId) return replyAction;
        const listOption = getReplyActionListOptions(replyAction.targetEventId).find(
          (option) => option.listKey === targetListKey,
        );
        return {
          ...replyAction,
          targetListKey,
          replyCode: replyAction.replyCode.trim() || listOption?.password || "",
        };
      }),
    }));
  };

  const handleRecipientFilterTypeChange = (value: RecipientFilterState["type"]) => {
    setFormData((prev) => {
      switch (value) {
        case "all":
          return { ...prev, recipientFilter: { type: "all" }, selectedRsvpIds: [] };
        case "approved_no_approval_sms":
          return {
            ...prev,
            recipientFilter: { type: "approved_no_approval_sms" },
            selectedRsvpIds: [],
          };
        case "approved_with_approval_sms":
          return {
            ...prev,
            recipientFilter: { type: "approved_with_approval_sms" },
            selectedRsvpIds: [],
          };
        case "status": {
          const nextStatus =
            prev.recipientFilter.type === "status"
              ? prev.recipientFilter.status
              : DEFAULT_STATUS_FILTER;
          return {
            ...prev,
            recipientFilter: { type: "status", status: nextStatus },
            selectedRsvpIds: [],
          };
        }
        case "custom_field_missing": {
          const nextFieldKey = customFields.length > 0 ? customFields[0].key : "";
          return {
            ...prev,
            recipientFilter: {
              type: "custom_field_missing",
              fieldKey: nextFieldKey,
            },
            selectedRsvpIds: [],
          };
        }
        case "rsvp_before": {
          const nextValue =
            prev.recipientFilter.type === "rsvp_before" ? prev.recipientFilter.isoDateTime : "";
          return {
            ...prev,
            recipientFilter: { type: "rsvp_before", isoDateTime: nextValue },
            selectedRsvpIds: [],
          };
        }
        case "previous_approved_not_rsvped": {
          const nextExcludedEventId =
            prev.recipientFilter.type === "previous_approved_not_rsvped"
              ? prev.recipientFilter.excludedEventId
              : "";
          return {
            ...prev,
            recipientFilter: {
              type: "previous_approved_not_rsvped",
              excludedEventId: nextExcludedEventId,
            },
            selectedRsvpIds: [],
          };
        }
        default:
          return prev;
      }
    });
  };

  const handleRecipientHistoryFilterTypeChange = (value: RecipientHistoryFilterState["type"]) => {
    setFormData((prev) => ({
      ...prev,
      recipientHistoryFilter:
        value === "none"
          ? { type: "none", textBlastIds: [] }
          : {
              type: value,
              textBlastIds:
                prev.recipientHistoryFilter.type === "none"
                  ? []
                  : prev.recipientHistoryFilter.textBlastIds,
            },
      selectedRsvpIds: [],
    }));
  };

  const handleRecipientHistoryBlastToggle = (textBlastId: Id<"textBlasts">, checked: boolean) => {
    setFormData((prev) => {
      if (prev.recipientHistoryFilter.type === "none") {
        return prev;
      }
      return {
        ...prev,
        recipientHistoryFilter: {
          ...prev.recipientHistoryFilter,
          textBlastIds: checked
            ? [...prev.recipientHistoryFilter.textBlastIds, textBlastId]
            : prev.recipientHistoryFilter.textBlastIds.filter(
                (selectedBlastId) => selectedBlastId !== textBlastId,
              ),
        },
        selectedRsvpIds: [],
      };
    });
  };

  const handleSaveDraft = async () => {
    if (!recipientFilterIsConfigured) {
      toast.error("Complete the recipient filter details before saving.");
      return;
    }
    if (!historyFilterIsConfigured) {
      toast.error("Select at least one text blast for the recipient history filter.");
      return;
    }
    if (hasMultiEventRestrictedVariables) {
      toast.error("Remove event-specific variables before saving a multi-event blast.");
      return;
    }
    if (!replyActionsAreValid) {
      toast.error(replyActionValidationMessage ?? "Complete reply action details before saving.");
      return;
    }
    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to save text blasts");
        return;
      }
      if (isEditMode && blastId) {
        if (!primaryEventId) {
          toast.error("Select at least one event before saving the draft");
          return;
        }
        await updateDraftMutation({
          blastId,
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          selectedRsvpIds: formData.selectedRsvpIds,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          clearRecipientHistoryFilter: encodedRecipientHistoryFilter === undefined,
          includeQrCodes: effectiveIncludeQrCodes,
          replyActions: buildReplyActionPayload(),
          ...workspaceScope.queryArgs,
        });
        posthog.capture("text_blast_draft_saved", {
          blast_name: formData.name,
          target_lists: formData.targetLists,
          recipient_filter_type: formData.recipientFilter.type,
          is_edit: true,
          workspace_slug: workspaceScope.workspaceSlug,
        });
        toast.success("Text blast updated successfully");
      } else {
        if (!primaryEventId) {
          toast.error("Select at least one event before saving the draft");
          return;
        }
        await createDraftMutation({
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          selectedRsvpIds: formData.selectedRsvpIds,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          includeQrCodes: effectiveIncludeQrCodes,
          replyActions: buildReplyActionPayload(),
          ...workspaceScope.queryArgs,
        });
        posthog.capture("text_blast_draft_saved", {
          blast_name: formData.name,
          event_ids: formData.eventIds,
          target_lists: formData.targetLists,
          recipient_filter_type: formData.recipientFilter.type,
          is_edit: false,
          workspace_slug: workspaceScope.workspaceSlug,
        });
        toast.success("Text blast draft saved successfully");
      }
      onClose();
    } catch (error: unknown) {
      posthog.captureException(error);
      toast.error(error instanceof Error ? error.message : "Failed to save text blast");
    }
  };

  const handleSaveReplyActions = async () => {
    if (!blastId) {
      toast.error("Select a text blast before updating reply actions.");
      return;
    }
    if (!workspaceScope) {
      toast.error("Workspace scope is required to update reply actions");
      return;
    }
    if (!replyActionsAreValid) {
      toast.error(replyActionValidationMessage ?? "Complete reply action details before saving.");
      return;
    }

    try {
      await updateReplyActionsMutation({
        blastId,
        replyActions: buildReplyActionPayload(),
        ...workspaceScope.queryArgs,
      });
      posthog.capture("text_blast_reply_actions_saved", {
        blast_id: blastId,
        reply_action_count: formData.replyActions.length,
        workspace_slug: workspaceScope.workspaceSlug,
      });
      toast.success("Reply actions updated.");
      onClose();
    } catch (error: unknown) {
      posthog.captureException(error);
      toast.error(error instanceof Error ? error.message : "Failed to update reply actions");
    }
  };

  const handleSendBlast = async () => {
    if (
      !primaryEventId ||
      !formData.name ||
      !formData.message ||
      formData.targetLists.length === 0
    ) {
      toast.error("Please complete all fields before sending");
      return;
    }

    setIsSending(true);
    if (!workspaceScope) {
      toast.error("Workspace scope is required to send text blasts");
      setIsSending(false);
      return;
    }
    if (!recipientFilterIsConfigured) {
      toast.error("Complete the recipient filter details before sending.");
      setIsSending(false);
      return;
    }
    if (!historyFilterIsConfigured) {
      toast.error("Select at least one text blast for the recipient history filter.");
      setIsSending(false);
      return;
    }
    if (hasMultiEventRestrictedVariables) {
      toast.error("Remove event-specific variables before sending a multi-event blast.");
      setIsSending(false);
      return;
    }
    if (!replyActionsAreValid) {
      toast.error(replyActionValidationMessage ?? "Complete reply action details before sending.");
      setIsSending(false);
      return;
    }
    try {
      let result: SendBlastResult;
      if (blastId && isEditMode) {
        await updateDraftMutation({
          blastId,
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          selectedRsvpIds: formData.selectedRsvpIds,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          clearRecipientHistoryFilter: encodedRecipientHistoryFilter === undefined,
          includeQrCodes: effectiveIncludeQrCodes,
          replyActions: buildReplyActionPayload(),
          ...workspaceScope.queryArgs,
        });
        result = await sendBlastAction({
          blastId,
          ...workspaceScope.queryArgs,
        });
      } else {
        // Send directly without saving draft first
        result = await sendBlastDirectAction({
          eventId: primaryEventId as Id<"events">,
          targetEventIds: formData.eventIds,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          selectedRsvpIds:
            formData.selectedRsvpIds.length > 0 ? formData.selectedRsvpIds : undefined,
          recipientHistoryFilter: encodedRecipientHistoryFilter,
          includeQrCodes: effectiveIncludeQrCodes,
          replyActions: buildReplyActionPayload(),
          ...workspaceScope.queryArgs,
        });
      }

      if (result.success) {
        posthog.capture("text_blast_queued", {
          blast_name: formData.name,
          event_ids: formData.eventIds,
          event_name: primaryEvent?.name,
          target_lists: formData.targetLists,
          recipient_count: result.totalRecipients,
          recipient_filter_type: formData.recipientFilter.type,
          include_qr_codes: effectiveIncludeQrCodes,
          has_manual_recipient_selection: formData.selectedRsvpIds.length > 0,
          blast_id: result.blastId,
          workspace_slug: workspaceScope.workspaceSlug,
        });
        toast.success(
          `Text blast queued. Sending to ${result.totalRecipients} recipient${result.totalRecipients !== 1 ? "s" : ""}.`,
        );
      } else {
        toast.error(result.message || "Failed to send text blast");
      }
      onClose();
    } catch (error: unknown) {
      posthog.captureException(error);
      toast.error(error instanceof Error ? error.message : "Failed to send text blast");
    } finally {
      setIsSending(false);
    }
  };

  const canProceedToStep2 =
    formData.eventIds.length > 0 &&
    formData.targetLists.length > 0 &&
    recipientFilterIsConfigured &&
    historyFilterIsConfigured;
  const canProceedToStep3 =
    canProceedToStep2 &&
    formData.name.trim().length > 0 &&
    formData.message.trim().length > 0 &&
    !isMessageTooLong &&
    !hasMultiEventRestrictedVariables &&
    replyActionsAreValid;
  const canSave = canProceedToStep3 && !isMessageTooLong;

  const renderReplyActionsEditor = () => (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label>Reply Actions</Label>
          <p className="text-xs text-muted-foreground">
            Let guests reply with a code to submit a pending RSVP for another event.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addReplyAction}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {formData.replyActions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">
          No reply actions configured.
        </div>
      ) : (
        <div className="space-y-3">
          {formData.replyActions.map((replyAction, index) => {
            const listOptions = getReplyActionListOptions(replyAction.targetEventId);
            const selectedListOption = listOptions.find(
              (listOption) => listOption.listKey === replyAction.targetListKey,
            );
            return (
              <div
                key={replyAction.clientId}
                className="grid gap-3 rounded-md border border-border/60 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Action {index + 1}</div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`reply-action-enabled-${replyAction.clientId}`}
                      checked={replyAction.isEnabled}
                      onCheckedChange={(checked) =>
                        setReplyAction(replyAction.clientId, { isEnabled: checked === true })
                      }
                    />
                    <Label
                      htmlFor={`reply-action-enabled-${replyAction.clientId}`}
                      className="text-xs"
                    >
                      Enabled
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeReplyAction(replyAction.clientId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_0.8fr_0.7fr]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`reply-action-event-${replyAction.clientId}`}>
                      Destination Event
                    </Label>
                    <Select
                      id={`reply-action-event-${replyAction.clientId}`}
                      value={replyAction.targetEventId}
                      onValueChange={(value) =>
                        handleReplyActionTargetEventChange(
                          replyAction.clientId,
                          value ? (value as Id<"events">) : "",
                        )
                      }
                    >
                      <SelectOption value="">Select event</SelectOption>
                      {(replyActionTargetOptions ?? []).map((targetOption) => (
                        <SelectOption key={targetOption.eventId} value={targetOption.eventId}>
                          {targetOption.eventName}
                          {targetOption.eventSecondaryTitle
                            ? `: ${targetOption.eventSecondaryTitle}`
                            : ""}
                        </SelectOption>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`reply-action-list-${replyAction.clientId}`}>
                      Destination List
                    </Label>
                    <Select
                      id={`reply-action-list-${replyAction.clientId}`}
                      value={replyAction.targetListKey}
                      disabled={!replyAction.targetEventId}
                      onValueChange={(value) =>
                        handleReplyActionTargetListChange(replyAction.clientId, value)
                      }
                    >
                      <SelectOption value="">Select list</SelectOption>
                      {listOptions.map((listOption) => (
                        <SelectOption key={listOption.listKey} value={listOption.listKey}>
                          {listOption.listKey.toUpperCase()}
                        </SelectOption>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`reply-action-code-${replyAction.clientId}`}>Reply Code</Label>
                    <Input
                      id={`reply-action-code-${replyAction.clientId}`}
                      value={replyAction.replyCode}
                      placeholder={selectedListOption?.password ? "List password" : "Reply code"}
                      onChange={(event) =>
                        setReplyAction(replyAction.clientId, {
                          replyCode: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {selectedListOption && !selectedListOption.password && !replyAction.replyCode && (
                  <div className="text-xs text-muted-foreground">
                    Open lists need a manual reply code.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {replyActionValidationMessage && (
        <div className="text-xs text-destructive">{replyActionValidationMessage}</div>
      )}
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source Events</Label>
              <Popover open={isEventPopoverOpen} onOpenChange={setIsEventPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between" type="button">
                    <span className="truncate">
                      {selectedEvents.length === 0
                        ? "Select events"
                        : selectedEvents.length === 1
                          ? formatEventTitleInline(selectedEvents[0])
                          : `${selectedEvents.length} events selected`}
                    </span>
                    <Users className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <div className="max-h-72 overflow-y-auto p-2">
                    {eventsSorted.map((event) => {
                      const isSelected = formData.eventIds.includes(event._id);
                      const inlineTitle = formatEventTitleInline(event);
                      return (
                        <div
                          key={event._id}
                          role="button"
                          tabIndex={0}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
                          onClick={() => handleEventToggle(event._id, !isSelected)}
                          onKeyDown={(keyboardEvent) => {
                            if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                              keyboardEvent.preventDefault();
                              handleEventToggle(event._id, !isSelected);
                            }
                          }}
                        >
                          <Checkbox checked={isSelected} />
                          <span className="min-w-0 flex-1 truncate text-sm">{inlineTitle}</span>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="text-xs text-muted-foreground">
                Choose the event RSVP lists that should feed this blast audience.
              </div>
            </div>

            <div className="space-y-2">
              <Label>Audience Segment</Label>
              <Select
                value={formData.recipientFilter.type}
                onValueChange={(value) =>
                  handleRecipientFilterTypeChange(value as RecipientFilterState["type"])
                }
              >
                <SelectOption value="all">{RECIPIENT_FILTER_LABELS.all}</SelectOption>
                <SelectOption value="approved_no_approval_sms">
                  {RECIPIENT_FILTER_LABELS.approved_no_approval_sms}
                </SelectOption>
                <SelectOption value="approved_with_approval_sms">
                  {RECIPIENT_FILTER_LABELS.approved_with_approval_sms}
                </SelectOption>
                <SelectOption value="status">{RECIPIENT_FILTER_LABELS.status}</SelectOption>
                <SelectOption value="custom_field_missing" disabled={customFields.length === 0}>
                  {RECIPIENT_FILTER_LABELS.custom_field_missing}
                </SelectOption>
                <SelectOption value="rsvp_before">
                  {RECIPIENT_FILTER_LABELS.rsvp_before}
                </SelectOption>
                <SelectOption value="previous_approved_not_rsvped">
                  {RECIPIENT_FILTER_LABELS.previous_approved_not_rsvped}
                </SelectOption>
              </Select>
              <div className="text-xs text-muted-foreground">
                {describeRecipientFilter(formData.recipientFilter, {
                  resolveCustomFieldLabel: (key) =>
                    customFields.find((field) => field.key === key)?.label,
                })}
              </div>
              {!recipientFilterIsConfigured && (
                <div className="text-xs text-destructive">
                  Complete the filter details to apply this segment.
                </div>
              )}
            </div>

            {formData.recipientFilter.type === "status" && (
              <div className="space-y-2">
                <Label>RSVP Status</Label>
                <Select
                  value={formData.recipientFilter.status}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      recipientFilter: {
                        type: "status",
                        status: value as RecipientApprovalStatus,
                      },
                      selectedRsvpIds: [],
                    }))
                  }
                >
                  {Object.entries(RECIPIENT_STATUS_LABELS).map(([status, label]) => (
                    <SelectOption key={status} value={status}>
                      {label}
                    </SelectOption>
                  ))}
                </Select>
              </div>
            )}

            {formData.recipientFilter.type === "custom_field_missing" && (
              <div className="space-y-2">
                <Label>Custom Field</Label>
                {customFields.length > 0 ? (
                  <Select
                    value={formData.recipientFilter.fieldKey}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        recipientFilter: {
                          type: "custom_field_missing",
                          fieldKey: value,
                        },
                        selectedRsvpIds: [],
                      }))
                    }
                  >
                    {customFields.map((field) => (
                      <SelectOption key={field.key} value={field.key}>
                        {field.label}
                      </SelectOption>
                    ))}
                  </Select>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    This event does not have custom fields configured. Add custom fields in the
                    event settings first.
                  </div>
                )}
              </div>
            )}

            {formData.recipientFilter.type === "rsvp_before" && (
              <div className="space-y-2">
                <Label htmlFor="rsvpBefore">RSVP Created Before</Label>
                <Input
                  id="rsvpBefore"
                  type="datetime-local"
                  value={formData.recipientFilter.isoDateTime}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      recipientFilter: {
                        type: "rsvp_before",
                        isoDateTime: event.target.value,
                      },
                      selectedRsvpIds: [],
                    }))
                  }
                />
                <div className="text-xs text-muted-foreground">
                  Only guests who submitted their RSVP before this timestamp will receive the
                  message.
                </div>
              </div>
            )}

            {formData.recipientFilter.type === "previous_approved_not_rsvped" && (
              <div className="space-y-2">
                <Label>Exclude Event</Label>
                <Select
                  value={formData.recipientFilter.excludedEventId}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      recipientFilter: {
                        type: "previous_approved_not_rsvped",
                        excludedEventId: value,
                      },
                      selectedRsvpIds: [],
                    }))
                  }
                >
                  <SelectOption value="">Select event to exclude</SelectOption>
                  {eventsSorted.map((event) => (
                    <SelectOption key={event._id} value={event._id}>
                      {formatEventTitleInline(event)}
                    </SelectOption>
                  ))}
                </Select>
                <div className="text-xs text-muted-foreground">
                  Anyone who has already RSVP&apos;d to this event is removed from the source-event
                  audience.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Recipient History</Label>
              <Select
                value={formData.recipientHistoryFilter.type}
                onValueChange={(value) =>
                  handleRecipientHistoryFilterTypeChange(
                    value as RecipientHistoryFilterState["type"],
                  )
                }
              >
                <SelectOption value="none">No history filter</SelectOption>
                <SelectOption value="received_any">Has received any of</SelectOption>
                <SelectOption value="not_received_any">Has not received any of</SelectOption>
              </Select>
              {formData.recipientHistoryFilter.type !== "none" && (
                <div className="grid gap-2 rounded-md border p-2">
                  {(historyBlastOptions ?? []).map((historyBlast) => {
                    const isCurrentBlast = historyBlast._id === blastId;
                    const isTracked = historyBlast.deliveryTrackingEnabled === true;
                    const isSentOrPartiallySent =
                      historyBlast.status === "sent" || historyBlast.sentCount > 0;
                    const isDisabled = isCurrentBlast || !isTracked || !isSentOrPartiallySent;
                    const isSelected = selectedHistoryBlastIds.includes(historyBlast._id);
                    return (
                      <div key={historyBlast._id} className="flex items-center gap-2">
                        <Checkbox
                          id={`history-${historyBlast._id}`}
                          checked={isSelected}
                          disabled={isDisabled}
                          onCheckedChange={(checked) =>
                            handleRecipientHistoryBlastToggle(historyBlast._id, checked === true)
                          }
                        />
                        <Label
                          htmlFor={`history-${historyBlast._id}`}
                          className={`min-w-0 flex-1 cursor-pointer text-sm ${
                            isDisabled ? "text-muted-foreground" : ""
                          }`}
                        >
                          <span className="block truncate">{historyBlast.name}</span>
                        </Label>
                        {!isTracked && (
                          <Badge variant="outline" className="shrink-0 text-xs">
                            Untracked
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                  {(historyBlastOptions ?? []).length === 0 && (
                    <div className="text-sm text-muted-foreground">No text blasts yet.</div>
                  )}
                </div>
              )}
              {!historyFilterIsConfigured && (
                <div className="text-xs text-destructive">
                  Select at least one tracked text blast.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Lists</Label>
              {availableLists.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {primaryEventId
                    ? "No recipient lists available for this event. Make sure there are approved RSVPs for this event."
                    : "Select an event to see available recipient lists."}
                </div>
              ) : (
                <div className="grid gap-3">
                  {availableLists.map((listKey) => {
                    const listData = availableListsWithCounts?.find((l) => l.listKey === listKey);
                    const count = listData?.recipientCount ?? 0;
                    const totalRsvps = listData?.totalRsvps ?? 0;
                    return (
                      <div key={listKey} className="flex items-center space-x-2">
                        <Checkbox
                          id={listKey}
                          checked={formData.targetLists.includes(listKey)}
                          onCheckedChange={(checked) =>
                            handleTargetListChange(listKey, checked as boolean)
                          }
                        />
                        <Label htmlFor={listKey} className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium capitalize">{listKey}</span>
                            <Badge variant="outline">
                              <Users className="h-3 w-3 mr-1" />
                              {recipientFilterIsConfigured ? (
                                <>
                                  {count} {count === 1 ? "recipient" : "recipients"}
                                  {totalRsvps > 0 && count === 0 && (
                                    <span className="ml-1 text-xs text-muted-foreground">
                                      ({totalRsvps} RSVP
                                      {totalRsvps !== 1 ? "s" : ""} without SMS consent/phone)
                                    </span>
                                  )}
                                </>
                              ) : (
                                "Recipients pending"
                              )}
                            </Badge>
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              )}
              {formData.targetLists.length === 0 && availableLists.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Please select at least one recipient list.
                </div>
              )}
            </div>

            {formData.targetLists.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Total Recipients</span>
                    <Badge>
                      <Users className="h-3 w-3 mr-1" />
                      {recipientCount}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label>Recipients</Label>
                  <p className="text-xs text-muted-foreground">
                    Select rows to lock this blast to exact people. With no selected rows, the
                    dynamic audience above is used.
                  </p>
                </div>
                {formData.selectedRsvpIds.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearRecipientSelection}
                  >
                    Clear selection
                  </Button>
                )}
              </div>
              {formData.targetLists.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Select recipient lists above to enable recipient selection
                </div>
              ) : !recipientFilterIsConfigured ? (
                <div className="text-sm text-muted-foreground">
                  Complete the filter details above to select specific recipients.
                </div>
              ) : !historyFilterIsConfigured ? (
                <div className="text-sm text-muted-foreground">
                  Complete the history filter above to select specific recipients.
                </div>
              ) : recipientsForSelection && recipientsForSelection.length > 0 ? (
                <div className="rounded-md border border-border/70">
                  <div className="grid gap-2 border-b p-3 lg:grid-cols-[1fr_140px_150px_150px_120px]">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search recipients..."
                        value={recipientSearchQuery}
                        onChange={(event) => setRecipientSearchQuery(event.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Select
                      value={recipientTableListFilter}
                      onValueChange={setRecipientTableListFilter}
                    >
                      <SelectOption value="all">All Lists</SelectOption>
                      {availableLists.map((listKey) => (
                        <SelectOption key={listKey} value={listKey}>
                          {listKey.toUpperCase()}
                        </SelectOption>
                      ))}
                    </Select>
                    <Select
                      value={recipientTableApprovalFilter}
                      onValueChange={(value) =>
                        setRecipientTableApprovalFilter(value as "all" | RecipientApprovalStatus)
                      }
                    >
                      <SelectOption value="all">All Approval</SelectOption>
                      {Object.entries(RECIPIENT_STATUS_LABELS).map(([status, label]) => (
                        <SelectOption key={status} value={status}>
                          {label}
                        </SelectOption>
                      ))}
                    </Select>
                    <Select
                      value={recipientTableSortBy}
                      onValueChange={(value) =>
                        setRecipientTableSortBy(value as RecipientTableSortOption)
                      }
                    >
                      <SelectOption value="name">Sort by Guest</SelectOption>
                      <SelectOption value="eventName">Sort by Event</SelectOption>
                      <SelectOption value="listKey">Sort by List</SelectOption>
                      <SelectOption value="approvalStatus">Sort by Approval</SelectOption>
                      <SelectOption value="attendanceStatus">Sort by Attendance</SelectOption>
                      <SelectOption value="ticketStatus">Sort by Ticket</SelectOption>
                      <SelectOption value="createdAt">Sort by Created</SelectOption>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setRecipientTableSortOrder((previousSortOrder) =>
                          previousSortOrder === "asc" ? "desc" : "asc",
                        )
                      }
                    >
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      {recipientTableSortOrder === "asc" ? "Asc" : "Desc"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                    <div className="text-sm text-muted-foreground">
                      {formData.selectedRsvpIds.length} selected /{" "}
                      {recipientTableFilteredRows.length} matching / {recipientCount} sendable
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectAllMatchingRecipients}
                        disabled={
                          recipientTableFilteredRows.length === 0 || allMatchingRecipientsSelected
                        }
                      >
                        Select all matching
                      </Button>
                      <Select
                        value={String(recipientTablePageSize)}
                        onValueChange={(value) => setRecipientTablePageSize(Number(value))}
                      >
                        {RECIPIENT_TABLE_PAGE_SIZE_OPTIONS.map((pageSizeOption) => (
                          <SelectOption key={pageSizeOption} value={String(pageSizeOption)}>
                            {pageSizeOption} per page
                          </SelectOption>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                        <tr className="border-b">
                          <th className="w-10 px-3 py-2">
                            <Checkbox
                              aria-label="Select current page"
                              checked={
                                recipientTableAllPageRowsSelected
                                  ? true
                                  : recipientTableSomePageRowsSelected
                                    ? "indeterminate"
                                    : false
                              }
                              onCheckedChange={(checked) =>
                                toggleRecipientPageSelection(checked === true)
                              }
                            />
                          </th>
                          <th className="px-3 py-2">Guest</th>
                          <th className="px-3 py-2">Event</th>
                          <th className="px-3 py-2">List</th>
                          <th className="px-3 py-2">Approval</th>
                          <th className="px-3 py-2">Attendance</th>
                          <th className="px-3 py-2">Ticket</th>
                          <th className="px-3 py-2">SMS</th>
                          <th className="px-3 py-2">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipientTablePageRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                              No recipients match the current table filters.
                            </td>
                          </tr>
                        ) : (
                          recipientTablePageRows.map((recipient) => {
                            const isSelected = selectedRsvpIdsSet.has(recipient.rsvpId);
                            return (
                              <tr
                                key={recipient.rsvpId}
                                className="border-b last:border-b-0 hover:bg-muted/50"
                              >
                                <td className="px-3 py-2">
                                  <Checkbox
                                    aria-label={`Select ${recipient.name}`}
                                    checked={isSelected}
                                    onCheckedChange={() =>
                                      toggleRecipientSelection(recipient.rsvpId)
                                    }
                                  />
                                </td>
                                <td className="max-w-40 px-3 py-2">
                                  <button
                                    type="button"
                                    className="block max-w-full truncate text-left font-medium"
                                    onClick={() => toggleRecipientSelection(recipient.rsvpId)}
                                  >
                                    {recipient.name}
                                  </button>
                                </td>
                                <td className="max-w-44 px-3 py-2">
                                  <span className="block truncate">{recipient.eventName}</span>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline">{recipient.listKey.toUpperCase()}</Badge>
                                </td>
                                <td className="px-3 py-2 capitalize">{recipient.approvalStatus}</td>
                                <td className="px-3 py-2">
                                  {getAttendanceStatusLabel(recipient.attendanceStatus)}
                                </td>
                                <td className="px-3 py-2">
                                  {getTicketStatusLabel(recipient.ticketStatus)}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant={recipient.smsConsent ? "success" : "secondary"}>
                                    {recipient.smsConsent ? "Yes" : "No"}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {new Date(recipient.createdAt).toLocaleDateString()}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="text-sm text-muted-foreground">
                      Page {boundedRecipientTablePage} of {recipientTableTotalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={boundedRecipientTablePage <= 1}
                        onClick={() =>
                          setRecipientTablePage((previousPage) => Math.max(1, previousPage - 1))
                        }
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={boundedRecipientTablePage >= recipientTableTotalPages}
                        onClick={() =>
                          setRecipientTablePage((previousPage) =>
                            Math.min(recipientTableTotalPages, previousPage + 1),
                          )
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No recipients available for the selected lists
                </div>
              )}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                placeholder="e.g. Event Reminder, Last Call, etc."
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Message</Label>
                <div className="flex items-center gap-2 text-sm">
                  <Badge
                    variant={
                      isMessageTooLong
                        ? "destructive"
                        : messageLength > SMS_CHAR_LIMIT
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {messageLength}/{SMS_CONCAT_LIMIT}
                  </Badge>
                  <span className="text-muted-foreground">{messageType}</span>
                </div>
              </div>
              <Textarea
                id="message"
                placeholder="Your message here... Use {{firstName}}, {{eventName}}, {{eventDate}}, {{eventLocation}}, {{qrCodeUrl}} for personalization"
                value={formData.message}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, message: event.target.value }))
                }
                rows={6}
                className={isMessageTooLong ? "border-destructive" : ""}
              />
              <MessageTemplateVariableButtons
                message={formData.message}
                variableNames={availableMessageTemplateVariables}
                onMessageChange={(message) =>
                  setFormData((prev) => ({
                    ...prev,
                    message,
                  }))
                }
              />
              {hasMultiEventRestrictedVariables && (
                <div className="text-xs text-destructive">
                  Multi-event blasts cannot use event-specific variables.
                </div>
              )}
              {isMessageTooLong && (
                <div className="text-xs text-destructive">
                  Message is too long. Please keep it under {SMS_CONCAT_LIMIT} characters.
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-border/70 p-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeQrCodes"
                  checked={qrImageCheckboxChecked}
                  disabled={qrImageCheckboxDisabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      includeQrCodes:
                        primaryEventId && !isMultiEventBlast ? checked === true : false,
                    }))
                  }
                />
                <Label htmlFor="includeQrCodes" className="cursor-pointer">
                  Include QR Code Images
                </Label>
              </div>
              <div className="text-xs text-muted-foreground">{qrImageHelperText}</div>
            </div>

            {renderReplyActionsEditor()}

            {formData.message && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Preview</Label>
                  <Button variant="outline" size="sm" onClick={() => setPreviewMode(!previewMode)}>
                    <Eye className="h-4 w-4 mr-1" />
                    {previewMode ? "Hide" : "Show"} Preview
                  </Button>
                </div>
                {previewMode && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-sm whitespace-pre-wrap">{previewMessage}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Review & Send
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Events</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvents.map((event) => formatEventTitleInline(event)).join(", ")}
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Campaign Name</Label>
                  <p className="text-sm text-muted-foreground">{formData.name}</p>
                </div>

                <div>
                  <Label className="text-sm font-medium">Message</Label>
                  <Card>
                    <CardContent className="p-3">
                      <div className="text-sm whitespace-pre-wrap">{previewMessage}</div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Label className="text-sm font-medium">Recipients</Label>
                  <div className="flex gap-2 mt-1">
                    {formData.targetLists.map((listKey) => (
                      <Badge key={listKey} variant="outline">
                        {listKey.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {recipientCount} total recipients
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Filter:{" "}
                    {describeRecipientFilter(formData.recipientFilter, {
                      resolveCustomFieldLabel: (key) =>
                        customFields.find((field) => field.key === key)?.label,
                    })}
                  </p>
                  {formData.recipientHistoryFilter.type !== "none" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      History: {selectedHistoryBlastIds.length} tracked blast
                      {selectedHistoryBlastIds.length !== 1 ? "s" : ""}
                    </p>
                  )}
                  {effectiveIncludeQrCodes && (
                    <p className="text-xs text-muted-foreground mt-1">QR Code Images: Enabled</p>
                  )}
                  {formData.selectedRsvpIds.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Exact audience: {formData.selectedRsvpIds.length} selected recipient
                      {formData.selectedRsvpIds.length !== 1 ? "s" : ""}
                    </p>
                  )}
                  {formData.replyActions.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reply Actions: {formData.replyActions.length} code
                      {formData.replyActions.length !== 1 ? "s" : ""} configured
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };
  const stepLabels = ["Who", "What", "Review"] as const;
  const currentStepLabel = stepLabels[currentStep - 1] ?? "Review";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReplyActionsOnlyMode
              ? "Manage Reply Actions"
              : isEditMode
                ? "Edit Text Blast"
                : "Create Text Blast"}
          </DialogTitle>
          <DialogDescription>
            {isReplyActionsOnlyMode
              ? "Update the SMS reply codes attached to this text blast."
              : `${currentStepLabel}: send bulk SMS messages to event attendees.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicators */}
        {!isReplyActionsOnlyMode && (
          <div className="flex items-center justify-center gap-3 py-4">
            {stepLabels.map((stepLabel, stepIndex) => {
              const step = stepIndex + 1;
              return (
                <div key={stepLabel} className="flex items-center">
                  <div
                    className={`flex h-9 min-w-20 items-center justify-center rounded-full px-3 text-sm font-medium ${
                      step === currentStep
                        ? "bg-primary text-primary-foreground"
                        : step < currentStep
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step}. {stepLabel}
                  </div>
                  {step < 3 && (
                    <div
                      className={`mx-2 h-0.5 w-8 ${step < currentStep ? "bg-green-500" : "bg-muted"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Separator />

        {/* Step Content */}
        <div className="py-4">
          {isReplyActionsOnlyMode ? renderReplyActionsEditor() : renderStepContent()}
        </div>

        <DialogFooter className="flex justify-between">
          {isReplyActionsOnlyMode ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSaveReplyActions} disabled={!replyActionsAreValid}>
                Save Reply Actions
              </Button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                {currentStep > 1 && (
                  <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>
                    Back
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                {currentStep < 3 ? (
                  <Button
                    onClick={() => setCurrentStep(currentStep + 1)}
                    disabled={
                      (currentStep === 1 && !canProceedToStep2) ||
                      (currentStep === 2 && !canProceedToStep3)
                    }
                  >
                    Next
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleSaveDraft} disabled={!canSave}>
                      <Save className="h-4 w-4 mr-2" />
                      Save Draft
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button disabled={!canSave || isSending || recipientCount === 0}>
                          <Send className="h-4 w-4 mr-2" />
                          {isSending ? "Sending..." : "Send Now"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Send Text Blast</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to send this text blast to {recipientCount}{" "}
                            recipient
                            {recipientCount !== 1 ? "s" : ""}? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleSendBlast}>
                            Send {recipientCount} Message
                            {recipientCount !== 1 ? "s" : ""}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

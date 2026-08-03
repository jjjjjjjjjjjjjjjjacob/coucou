"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Eye, MessageSquare, Plus, Save, Send, Trash2, Users } from "lucide-react";
import posthog from "posthog-js";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GuestDirectoryFilters } from "@/components/guests/guest-directory-filters";
import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import {
  type TextBlastRecipientRow,
  TextBlastRecipientTable,
} from "@/components/text-blasts/text-blast-recipient-table";
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
import { Select, SelectOption } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatEventTitleInline } from "@/lib/event-display";
import type {
  GuestDirectoryFilterState,
  RecipientFilterState,
  RecipientHistoryFilterState,
} from "@/lib/text-blast-filters";
import {
  createDefaultGuestDirectoryFilterState,
  decodeRecipientFilter,
  describeRecipientFilter,
  encodeRecipientFilter,
  isRecipientFilterConfigured,
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

export interface TextBlastInitialTargeting {
  eventIds: Id<"events">[];
  selectedRsvpIds: Id<"rsvps">[];
  targetLists: string[];
}

interface TextBlastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  blastId?: Id<"textBlasts"> | null;
  mode?: "full" | "replyActions";
  /**
   * Seeds the "Who" step when creating a new blast (ignored in edit mode),
   * e.g. from the Contacts directory bulk action.
   */
  initialTargeting?: TextBlastInitialTargeting;
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

const SMS_CHAR_LIMIT = 160;
const SMS_CONCAT_LIMIT = 320;
type MessageTemplateVariableName = (typeof MESSAGE_TEMPLATE_VARIABLES)[number];
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

export default function TextBlastDialog({
  isOpen,
  onClose,
  blastId,
  mode = "full",
  initialTargeting,
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
  const replyActionRoutingIsFrozen = Boolean(existingBlast && existingBlast.sentCount > 0);
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
  ) as TextBlastRecipientRow[] | undefined;

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
      const selectedListOption = replyActionTargetOptionMap
        .get(replyAction.targetEventId as Id<"events">)
        ?.lists.find((listOption) => listOption.listKey === replyAction.targetListKey);
      if (
        selectedListOption?.password &&
        normalizeReplyCodeForValidation(selectedListOption.password) === normalizedReplyCode
      ) {
        return `The list password “${selectedListOption.password}” already works as the default. Choose a different custom reply code.`;
      }
      normalizedReplyCodes.add(normalizedReplyCode);
    }

    return null;
  }, [formData.replyActions, replyActionTargetOptionMap]);
  const replyActionsAreValid = replyActionValidationMessage === null;

  // Get available lists for selected event from query result
  const availableLists = useMemo(() => {
    if (!availableListsWithCounts) return [];
    return availableListsWithCounts.map((list) => list.listKey);
  }, [availableListsWithCounts]);

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
          eventIds: initialTargeting?.eventIds ?? [],
          name: "",
          message: "",
          targetLists: initialTargeting?.targetLists ?? [],
          recipientFilter: { type: "all" },
          recipientHistoryFilter: { type: "none", textBlastIds: [] },
          includeQrCodes: false,
          selectedRsvpIds: initialTargeting?.selectedRsvpIds ?? [],
          replyActions: [],
        });
        setCurrentStep(1);
      }
      setPreviewMode(false);
    }
  }, [isOpen, existingBlast, initialTargeting]);

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

  const whoStepFilterValue = useMemo<GuestDirectoryFilterState>(
    () => ({
      ...createDefaultGuestDirectoryFilterState(),
      eventIds: formData.eventIds,
      recipientFilter: formData.recipientFilter,
      recipientHistoryFilter: formData.recipientHistoryFilter,
    }),
    [formData.eventIds, formData.recipientFilter, formData.recipientHistoryFilter],
  );

  const handleWhoStepFilterChange = (nextFilterState: GuestDirectoryFilterState) => {
    setFormData((prev) => {
      const nextEventIds = nextFilterState.eventIds as Id<"events">[];
      const eventIdsChanged =
        nextEventIds.length !== prev.eventIds.length ||
        nextEventIds.some((eventId, eventIndex) => eventId !== prev.eventIds[eventIndex]);
      const nextIsMultiEvent = nextEventIds.length > 1;
      // Reset the event-specific segment when the event selection changes.
      const nextRecipientFilter =
        eventIdsChanged && nextFilterState.recipientFilter.type === "custom_field_missing"
          ? { type: "all" as const }
          : nextFilterState.recipientFilter;

      return {
        ...prev,
        eventIds: nextEventIds,
        targetLists: eventIdsChanged ? [] : prev.targetLists,
        includeQrCodes: eventIdsChanged && nextIsMultiEvent ? false : prev.includeQrCodes,
        recipientFilter: nextRecipientFilter,
        recipientHistoryFilter: nextFilterState.recipientHistoryFilter,
        selectedRsvpIds: [],
      };
    });
  };

  const whoStepEventOptions = useMemo(
    () =>
      eventsSorted.map((event) => ({
        eventId: event._id as string,
        eventName: formatEventTitleInline(event),
        eventDate: event.eventDate ?? 0,
      })),
    [eventsSorted],
  );

  const whoStepBlastOptions = useMemo(
    () =>
      (historyBlastOptions ?? [])
        .filter(
          (historyBlast) =>
            historyBlast._id !== blastId &&
            historyBlast.deliveryTrackingEnabled === true &&
            (historyBlast.status === "sent" || historyBlast.sentCount > 0),
        )
        .map((historyBlast) => ({
          id: historyBlast._id as string,
          name: historyBlast.name,
          deliveryTrackingEnabled: true,
          status: "sent",
        })),
    [historyBlastOptions, blastId],
  );

  const whoStepCustomFieldOptions = useMemo(
    () => customFields.map((customField) => ({ key: customField.key, label: customField.label })),
    [customFields],
  );

  const handleTargetListChange = (listKey: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      targetLists: checked
        ? [...prev.targetLists, listKey]
        : prev.targetLists.filter((key) => key !== listKey),
      selectedRsvpIds: [],
    }));
  };

  const handleSelectedRsvpIdsChange = (selectedRsvpIds: Id<"rsvps">[]) => {
    setFormData((previousFormData) => ({ ...previousFormData, selectedRsvpIds }));
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
          replyCode: "",
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
        };
      }),
    }));
  };

  const handleReplyActionTargetListChange = (clientId: string, targetListKey: string) => {
    setFormData((prev) => ({
      ...prev,
      replyActions: prev.replyActions.map((replyAction) => {
        if (replyAction.clientId !== clientId) return replyAction;
        return {
          ...replyAction,
          targetListKey,
        };
      }),
    }));
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
          <Label>Custom Reply Actions</Label>
          <p className="text-xs text-muted-foreground">
            Active event list passwords always submit an RSVP to that list for any sender. Add
            recipient-scoped custom codes here when a blast needs another reply.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addReplyAction}
          disabled={replyActionRoutingIsFrozen}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      {replyActionRoutingIsFrozen && (
        <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This blast has successful deliveries. Reply codes, destination events, and destination
          lists are frozen; only enable or disable can be changed.
        </div>
      )}

      {formData.replyActions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">
          No custom reply actions configured. Event list passwords still work automatically.
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
                      disabled={replyActionRoutingIsFrozen}
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
                      disabled={replyActionRoutingIsFrozen}
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
                      disabled={!replyAction.targetEventId || replyActionRoutingIsFrozen}
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
                      placeholder="Custom reply code"
                      disabled={replyActionRoutingIsFrozen}
                      onChange={(event) =>
                        setReplyAction(replyAction.clientId, {
                          replyCode: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                {selectedListOption?.password && (
                  <div className="text-xs text-muted-foreground">
                    The list password “{selectedListOption.password}” already works as the default
                    reply for everyone. Choose a different code for this custom action.
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
            <section className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
              <div>
                <Label>Audience filters</Label>
                <p className="text-xs text-muted-foreground">
                  Choose the events and RSVP segments that feed this blast audience.
                </p>
              </div>
              <GuestDirectoryFilters
                variant="compact"
                value={whoStepFilterValue}
                onChange={handleWhoStepFilterChange}
                eventOptions={whoStepEventOptions}
                blastOptions={whoStepBlastOptions}
                tagOptions={[]}
                defaultListKeyOptions={[]}
                customFieldOptions={whoStepCustomFieldOptions}
              />
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
              {!historyFilterIsConfigured && (
                <div className="text-xs text-destructive">
                  Select at least one tracked text blast.
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div>
                <Label>Lists</Label>
                <p className="text-xs text-muted-foreground">
                  Select one or more event lists to include in the audience.
                </p>
              </div>
              {availableLists.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {primaryEventId
                    ? "No recipient lists available for this event. Make sure there are approved RSVPs for this event."
                    : "Select an event to see available recipient lists."}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {availableLists.map((listKey, listIndex) => {
                    const listData = availableListsWithCounts?.find(
                      (availableList) => availableList.listKey === listKey,
                    );
                    const count = listData?.recipientCount ?? 0;
                    const totalRsvps = listData?.totalRsvps ?? 0;
                    const checkboxIdentifier = `text-blast-list-${listIndex}`;
                    return (
                      <Label
                        key={listKey}
                        htmlFor={checkboxIdentifier}
                        className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-3)]"
                      >
                        <Checkbox
                          id={checkboxIdentifier}
                          checked={formData.targetLists.includes(listKey)}
                          onCheckedChange={(checkedState) =>
                            handleTargetListChange(listKey, checkedState === true)
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium capitalize">{listKey}</span>
                          <span className="block text-xs text-muted-foreground">
                            {recipientFilterIsConfigured
                              ? `${count} ${count === 1 ? "recipient" : "recipients"}`
                              : "Recipients pending"}
                            {totalRsvps > 0 && count === 0
                              ? ` · ${totalRsvps} without SMS consent or phone`
                              : ""}
                          </span>
                        </span>
                      </Label>
                    );
                  })}
                </div>
              )}
              {formData.targetLists.length === 0 && availableLists.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  Please select at least one recipient list.
                </div>
              )}
            </section>

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

            <section className="space-y-2">
              <div>
                <Label>Guests</Label>
                <p className="text-xs text-muted-foreground">
                  Select rows to lock this blast to exact guests. Leave every row unselected to use
                  the dynamic audience above.
                </p>
              </div>
              {formData.targetLists.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center text-sm text-muted-foreground">
                  Select recipient lists above to browse guests.
                </div>
              ) : !recipientFilterIsConfigured ? (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center text-sm text-muted-foreground">
                  Complete the audience filter details above to browse guests.
                </div>
              ) : !historyFilterIsConfigured ? (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center text-sm text-muted-foreground">
                  Complete the text history filter above to browse guests.
                </div>
              ) : (
                <TextBlastRecipientTable
                  recipients={recipientsForSelection}
                  selectedRsvpIds={formData.selectedRsvpIds}
                  sendableRecipientCount={recipientCount}
                  listOptions={availableLists}
                  onSelectedRsvpIdsChange={handleSelectedRsvpIdsChange}
                />
              )}
            </section>
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
                      Exact audience: {recipientCount} selected recipient
                      {recipientCount !== 1 ? "s" : ""}
                    </p>
                  )}
                  {formData.replyActions.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Custom Reply Actions: {formData.replyActions.length} code
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
      <DialogContent className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="px-6 pt-6">
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
          <div className="flex items-center justify-center gap-3 px-6 py-4">
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
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {isReplyActionsOnlyMode ? renderReplyActionsEditor() : renderStepContent()}
        </div>

        <DialogFooter className="border-t border-[var(--border-subtle)] px-6 py-4 sm:justify-between">
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

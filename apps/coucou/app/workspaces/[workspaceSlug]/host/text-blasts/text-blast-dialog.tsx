"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Eye, MessageSquare, Save, Search, Send, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import type { RecipientFilterState } from "@/lib/text-blast-filters";
import {
  DEFAULT_STATUS_FILTER,
  decodeRecipientFilter,
  describeRecipientFilter,
  encodeRecipientFilter,
  isRecipientFilterConfigured,
  RECIPIENT_STATUS_LABELS,
} from "@/lib/text-blast-filters";
import type { Event, RSVP, TextBlast } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

interface TextBlastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  blastId?: Id<"textBlasts"> | null;
}

interface FormData {
  eventId: Id<"events"> | "";
  name: string;
  message: string;
  targetLists: string[];
  recipientFilter: RecipientFilterState;
  includeQrCodes: boolean;
  selectedRsvpIds: Id<"rsvps">[]; // For testing: filter to specific recipients
}

const SMS_CHAR_LIMIT = 160;
const SMS_CONCAT_LIMIT = 320;
type SendBlastResult = {
  success: boolean;
  sentCount?: number;
  message?: string;
};

export default function TextBlastDialog({ isOpen, onClose, blastId }: TextBlastDialogProps) {
  const workspaceScope = useWorkspaceScope();
  const events = useQuery(api.events.listAll, {
    ...(workspaceScope?.queryArgs ?? {}),
  }) as Event[] | undefined;
  const existingBlast = useQuery(
    api.textBlasts.getBlastById,
    blastId && workspaceScope ? { blastId, ...workspaceScope.queryArgs } : "skip",
  ) as TextBlast | null | undefined;
  const createDraftMutation = useMutation(api.textBlasts.createDraft);
  const updateDraftMutation = useMutation(api.textBlasts.updateDraft);
  const sendBlastAction = useAction(api.textBlasts.sendBlast);
  const sendBlastDirectAction = useAction(api.textBlasts.sendBlastDirect);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    eventId: "",
    name: "",
    message: "",
    targetLists: [],
    recipientFilter: { type: "all" },
    includeQrCodes: false,
    selectedRsvpIds: [],
  });
  const [recipientCount, setRecipientCount] = useState(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState("");
  const [isRecipientPopoverOpen, setIsRecipientPopoverOpen] = useState(false);

  const isEditMode = !!blastId;
  const selectedEvent = events?.find((event) => event._id === formData.eventId);
  const customFields = selectedEvent?.customFields ?? [];
  const recipientFilterIsConfigured = isRecipientFilterConfigured(formData.recipientFilter);
  const encodedRecipientFilter = useMemo(
    () => encodeRecipientFilter(formData.recipientFilter),
    [formData.recipientFilter],
  );

  // Fetch available lists with counts for the selected event
  const availableListsWithCounts = useQuery(
    api.textBlasts.getAvailableListsForEvent,
    formData.eventId && workspaceScope
      ? {
          eventId: formData.eventId as Id<"events">,
          recipientFilter: encodedRecipientFilter,
          ...(workspaceScope?.queryArgs ?? {}),
        }
      : "skip",
  ) as Array<{ listKey: string; recipientCount: number; totalRsvps: number }> | undefined;

  // Fetch recipients for selection (when target lists are selected)
  const recipientsForSelection = useQuery(
    api.textBlasts.getRecipientsForSelection,
    formData.eventId &&
      workspaceScope &&
      formData.targetLists.length > 0 &&
      recipientFilterIsConfigured
      ? {
          eventId: formData.eventId as Id<"events">,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          ...(workspaceScope?.queryArgs ?? {}),
        }
      : "skip",
  ) as Array<{ rsvpId: Id<"rsvps">; name: string; listKey: string }> | undefined;

  // Get available lists for selected event from query result
  const availableLists = useMemo(() => {
    if (!availableListsWithCounts) return [];
    return availableListsWithCounts.map((list) => list.listKey);
  }, [availableListsWithCounts]);

  // Create a map of listKey to recipient count for quick lookup
  const listCountMap = useMemo(() => {
    if (!availableListsWithCounts) return new Map<string, number>();
    return new Map(availableListsWithCounts.map((list) => [list.listKey, list.recipientCount]));
  }, [availableListsWithCounts]);

  // Update recipient count when target lists, filter, or selected RSVPs change
  useEffect(() => {
    if (!recipientFilterIsConfigured) {
      setRecipientCount(0);
      return;
    }

    if (formData.targetLists.length === 0) {
      setRecipientCount(0);
      return;
    }

    // If specific RSVPs are selected, use that count
    if (formData.selectedRsvpIds.length > 0) {
      setRecipientCount(formData.selectedRsvpIds.length);
      return;
    }

    // Otherwise, use the listCountMap
    let totalCount = 0;
    for (const listKey of formData.targetLists) {
      const count = listCountMap.get(listKey) || 0;
      totalCount += count;
    }
    setRecipientCount(totalCount);
  }, [formData.targetLists, formData.selectedRsvpIds, listCountMap, recipientFilterIsConfigured]);

  useEffect(() => {
    setFormData((prev) => {
      if (prev.selectedRsvpIds.length === 0) {
        return prev;
      }
      return { ...prev, selectedRsvpIds: [] };
    });
  }, [encodedRecipientFilter, formData.targetLists]);

  useEffect(() => {
    const currentFilter = formData.recipientFilter;
    if (currentFilter.type !== "custom_field_missing") {
      return;
    }

    const customFields = selectedEvent?.customFields ?? [];
    if (customFields.length === 0) {
      if (currentFilter.fieldKey !== "") {
        setFormData((prev) => ({
          ...prev,
          recipientFilter: { type: "custom_field_missing", fieldKey: "" },
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
      }));
    }
  }, [formData.recipientFilter, selectedEvent]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      if (existingBlast) {
        setFormData({
          eventId: existingBlast.eventId,
          name: existingBlast.name,
          message: existingBlast.message,
          targetLists: existingBlast.targetLists,
          recipientFilter: decodeRecipientFilter(existingBlast.recipientFilter ?? undefined),
          includeQrCodes: existingBlast.includeQrCodes ?? false,
          selectedRsvpIds: [],
        });
        // Recipient count will be calculated by the useEffect above when targetLists are set
        setCurrentStep(1);
      } else {
        setFormData({
          eventId: "",
          name: "",
          message: "",
          targetLists: [],
          recipientFilter: { type: "all" },
          includeQrCodes: false,
          selectedRsvpIds: [],
        });
        setRecipientCount(0);
        setCurrentStep(1);
      }
      setPreviewMode(false);
      setRecipientSearchQuery("");
      setIsRecipientPopoverOpen(false);
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
    eventName: selectedEvent?.name || "Sample Event",
    eventDate: selectedEvent
      ? new Date(selectedEvent.eventDate).toLocaleDateString()
      : "Dec 31, 2024",
    eventLocation: selectedEvent?.location || "Sample Location",
  };

  const previewMessage = formData.message
    .replace(/\{\{firstName\}\}/g, sampleData.firstName)
    .replace(/\{\{eventName\}\}/g, sampleData.eventName)
    .replace(/\{\{eventDate\}\}/g, sampleData.eventDate)
    .replace(/\{\{eventLocation\}\}/g, sampleData.eventLocation);

  const handleEventChange = (eventId: Id<"events"> | "") => {
    setFormData((prev) => {
      // Reset filter to "all" when event changes if it's event-specific (custom_field_missing)
      const newRecipientFilter =
        prev.recipientFilter.type === "custom_field_missing"
          ? { type: "all" as const }
          : prev.recipientFilter;

      return {
        ...prev,
        eventId,
        targetLists: [], // Reset target lists when event changes
        selectedRsvpIds: [],
        recipientFilter: newRecipientFilter,
      };
    });
    setRecipientCount(0);
  };

  const handleTargetListChange = (listKey: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      targetLists: checked
        ? [...prev.targetLists, listKey]
        : prev.targetLists.filter((key) => key !== listKey),
    }));
  };

  const handleRecipientFilterTypeChange = (value: RecipientFilterState["type"]) => {
    setFormData((prev) => {
      switch (value) {
        case "all":
          return { ...prev, recipientFilter: { type: "all" } };
        case "approved_no_approval_sms":
          return {
            ...prev,
            recipientFilter: { type: "approved_no_approval_sms" },
          };
        case "status": {
          const nextStatus =
            prev.recipientFilter.type === "status"
              ? prev.recipientFilter.status
              : DEFAULT_STATUS_FILTER;
          return {
            ...prev,
            recipientFilter: { type: "status", status: nextStatus },
          };
        }
        case "custom_field_missing": {
          const customFields = selectedEvent?.customFields ?? [];
          const nextFieldKey = customFields.length > 0 ? customFields[0].key : "";
          return {
            ...prev,
            recipientFilter: {
              type: "custom_field_missing",
              fieldKey: nextFieldKey,
            },
          };
        }
        case "rsvp_before": {
          const nextValue =
            prev.recipientFilter.type === "rsvp_before" ? prev.recipientFilter.isoDateTime : "";
          return {
            ...prev,
            recipientFilter: { type: "rsvp_before", isoDateTime: nextValue },
          };
        }
        default:
          return prev;
      }
    });
  };

  const handleSaveDraft = async () => {
    if (!recipientFilterIsConfigured) {
      toast.error("Complete the recipient filter details before saving.");
      return;
    }
    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to save text blasts");
        return;
      }
      if (isEditMode && blastId) {
        await updateDraftMutation({
          blastId,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          includeQrCodes: formData.includeQrCodes,
          ...workspaceScope.queryArgs,
        });
        toast.success("Text blast updated successfully");
      } else {
        if (!formData.eventId) {
          toast.error("Select an event before saving the draft");
          return;
        }
        await createDraftMutation({
          eventId: formData.eventId,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          includeQrCodes: formData.includeQrCodes,
          ...workspaceScope.queryArgs,
        });
        toast.success("Text blast draft saved successfully");
      }
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to save text blast");
    }
  };

  const handleSendBlast = async () => {
    if (
      !formData.eventId ||
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
    try {
      let result: SendBlastResult;
      if (blastId && isEditMode) {
        // Send existing draft
        result = await sendBlastAction({
          blastId,
          ...workspaceScope.queryArgs,
        });
      } else {
        // Send directly without saving draft first
        result = await sendBlastDirectAction({
          eventId: formData.eventId as Id<"events">,
          name: formData.name,
          message: formData.message,
          targetLists: formData.targetLists,
          recipientFilter: encodedRecipientFilter,
          includeQrCodes: formData.includeQrCodes,
          selectedRsvpIds:
            formData.selectedRsvpIds.length > 0 ? formData.selectedRsvpIds : undefined,
          ...workspaceScope.queryArgs,
        });
      }

      if (result.success) {
        toast.success(`Text blast sent successfully! ${result.sentCount ?? 0} messages delivered.`);
      } else {
        toast.error(result.message || "Failed to send text blast");
      }
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send text blast");
    } finally {
      setIsSending(false);
    }
  };

  const canProceedToStep2 = formData.eventId && formData.name && formData.message;
  const canProceedToStep3 =
    canProceedToStep2 && formData.targetLists.length > 0 && recipientFilterIsConfigured;
  const canSave = canProceedToStep3 && !isMessageTooLong;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventId">Event</Label>
              <Select
                value={formData.eventId || ""}
                onValueChange={(value) => handleEventChange(value ? (value as Id<"events">) : "")}
              >
                <SelectOption value="">Select an event</SelectOption>
                {events?.map((event) => {
                  const inlineTitle = formatEventTitleInline(event);
                  return (
                    <SelectOption key={event._id} value={event._id}>
                      {inlineTitle}
                    </SelectOption>
                  );
                })}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                placeholder="e.g. Event Reminder, Last Call, etc."
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
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
                onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                rows={6}
                className={isMessageTooLong ? "border-destructive" : ""}
              />
              <div className="text-xs text-muted-foreground">
                Available variables: &#123;&#123;firstName&#125;&#125;,
                &#123;&#123;eventName&#125;&#125;, &#123;&#123;eventDate&#125;&#125;,
                &#123;&#123;eventLocation&#125;&#125;, &#123;&#123;qrCodeUrl&#125;&#125;
              </div>
              {isMessageTooLong && (
                <div className="text-xs text-destructive">
                  Message is too long. Please keep it under {SMS_CONCAT_LIMIT} characters.
                </div>
              )}
            </div>

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

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recipient Filter</Label>
              <Select
                value={formData.recipientFilter.type}
                onValueChange={(value) =>
                  handleRecipientFilterTypeChange(value as RecipientFilterState["type"])
                }
              >
                <SelectOption value="all">All Approved/Attending</SelectOption>
                <SelectOption value="approved_no_approval_sms">
                  Approved but No Approval SMS Sent
                </SelectOption>
                <SelectOption value="status">Filter by RSVP Status</SelectOption>
                <SelectOption value="custom_field_missing" disabled={customFields.length === 0}>
                  Missing Custom Field
                </SelectOption>
                <SelectOption value="rsvp_before">RSVP Before Date/Time</SelectOption>
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
                        status: value as RSVP["status"],
                      },
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
                    }))
                  }
                />
                <div className="text-xs text-muted-foreground">
                  Only guests who submitted their RSVP before this timestamp will receive the
                  message.
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeQrCodes"
                  checked={formData.includeQrCodes}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({
                      ...prev,
                      includeQrCodes: checked === true,
                    }))
                  }
                />
                <Label htmlFor="includeQrCodes" className="cursor-pointer">
                  Include QR Code Images
                </Label>
              </div>
              <div className="text-xs text-muted-foreground">
                When enabled, QR code images will be generated and sent as MMS attachments for
                recipients with redemption codes. Use &#123;&#123;qrCodeUrl&#125;&#125; in your
                message to include the QR code URL in the text.
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Recipient Lists</Label>
              {availableLists.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {formData.eventId
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
              <Label>Test Recipients (Optional)</Label>
              <p className="text-xs text-muted-foreground">
                Select specific recipients to safely test your text blast. If none are selected, all
                recipients matching the lists above will be used.
              </p>
              {formData.targetLists.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Select recipient lists above to enable recipient selection
                </div>
              ) : !recipientFilterIsConfigured ? (
                <div className="text-sm text-muted-foreground">
                  Complete the filter details above to select specific recipients.
                </div>
              ) : recipientsForSelection && recipientsForSelection.length > 0 ? (
                <>
                  <Popover open={isRecipientPopoverOpen} onOpenChange={setIsRecipientPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between" type="button">
                        <span className="truncate">
                          {formData.selectedRsvpIds.length === 0
                            ? "Select recipients to test..."
                            : `${formData.selectedRsvpIds.length} recipient${formData.selectedRsvpIds.length !== 1 ? "s" : ""} selected`}
                        </span>
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <div className="p-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search by name..."
                            value={recipientSearchQuery}
                            onChange={(e) => setRecipientSearchQuery(e.target.value)}
                            className="pl-8"
                          />
                        </div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {(() => {
                          const filteredRecipients = recipientsForSelection.filter((recipient) =>
                            recipient.name
                              .toLowerCase()
                              .includes(recipientSearchQuery.toLowerCase()),
                          );
                          return filteredRecipients.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              No recipients found
                            </div>
                          ) : (
                            filteredRecipients.map((recipient) => {
                              const isSelected = formData.selectedRsvpIds.includes(
                                recipient.rsvpId,
                              );
                              return (
                                <div
                                  key={recipient.rsvpId}
                                  className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent cursor-pointer"
                                  onClick={() => {
                                    setFormData((prev) => ({
                                      ...prev,
                                      selectedRsvpIds: isSelected
                                        ? prev.selectedRsvpIds.filter(
                                            (id) => id !== recipient.rsvpId,
                                          )
                                        : [...prev.selectedRsvpIds, recipient.rsvpId],
                                    }));
                                  }}
                                >
                                  <Checkbox checked={isSelected} />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">{recipient.name}</div>
                                    <div className="text-xs text-muted-foreground capitalize">
                                      {recipient.listKey}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          );
                        })()}
                      </div>
                      {formData.selectedRsvpIds.length > 0 && (
                        <div className="border-t p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                selectedRsvpIds: [],
                              }));
                            }}
                          >
                            Clear Selection
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                  {formData.selectedRsvpIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {formData.selectedRsvpIds.map((rsvpId) => {
                        const recipient = recipientsForSelection?.find((r) => r.rsvpId === rsvpId);
                        if (!recipient) return null;
                        return (
                          <Badge
                            key={rsvpId}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {recipient.name}
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({
                                  ...prev,
                                  selectedRsvpIds: prev.selectedRsvpIds.filter(
                                    (id) => id !== rsvpId,
                                  ),
                                }));
                              }}
                              className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No recipients available for the selected lists
                </div>
              )}
            </div>
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
                  <Label className="text-sm font-medium">Event</Label>
                  <p className="text-sm text-muted-foreground">{selectedEvent?.name}</p>
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
                  {formData.includeQrCodes && (
                    <p className="text-xs text-muted-foreground mt-1">QR Code Images: Enabled</p>
                  )}
                  {formData.selectedRsvpIds.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Test Mode: {formData.selectedRsvpIds.length} specific recipient
                      {formData.selectedRsvpIds.length !== 1 ? "s" : ""} selected
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Text Blast" : "Create Text Blast"}</DialogTitle>
          <DialogDescription>
            Send bulk SMS messages to event attendees. Step {currentStep} of 3.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicators */}
        <div className="flex items-center justify-center space-x-4 py-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === currentStep
                    ? "bg-primary text-primary-foreground"
                    : step < currentStep
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {step}
              </div>
              {step < 3 && (
                <div
                  className={`w-12 h-0.5 mx-2 ${step < currentStep ? "bg-green-500" : "bg-muted"}`}
                />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step Content */}
        <div className="py-4">{renderStepContent()}</div>

        <DialogFooter className="flex justify-between">
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
                        Are you sure you want to send this text blast to {recipientCount} recipient
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

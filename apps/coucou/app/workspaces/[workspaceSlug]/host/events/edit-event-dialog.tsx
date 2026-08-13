"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  getDefaultApprovalMessage,
  sanitizeOptionalApprovalMessage,
} from "@coucou/sdk/shared/approval-messages";
import { sanitizeOptionalAutomatedEventMessage } from "@coucou/sdk/shared/automated-event-messages";
import { DEFAULT_OPEN_GRAPH_IMAGE_SOURCE } from "@coucou/sdk/shared/open-graph";
import {
  getDefaultRsvpConfirmationMessage,
  sanitizeOptionalRsvpConfirmationMessage,
} from "@coucou/sdk/shared/rsvp-confirmation-messages";
import { useAction, useQuery } from "convex/react";
import {
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  Save,
  Trash2,
} from "lucide-react";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  QrDeliveryTextSection,
  SmsSubscriptionTextsSection,
} from "@/components/automated-event-texts-section";
import { type CustomFieldDef, CustomFieldsEditor } from "@/components/custom-fields-builder";
import { EventActsEditor } from "@/components/event-acts-editor";
import { EventDetailsSection } from "@/components/event-form-sections/event-details-section";
import { EventGuestPageSection } from "@/components/event-form-sections/event-guest-page-section";
import { EventLookSection } from "@/components/event-form-sections/event-look-section";
import { EventScheduleSection } from "@/components/event-form-sections/event-schedule-section";
import {
  type EventPartnerDraft,
  eventPartnersToDrafts,
  sanitizeEventPartnerDraftsForSubmit,
} from "@/components/event-partners-editor";
import { LinearTabs, LinearTabsList, LinearTabsTrigger } from "@/components/linear-tabs";
import { ListConfirmationTextsSection } from "@/components/list-confirmation-texts-section";
import {
  draftToPrimaryFieldConfig,
  EMPTY_PRIMARY_FIELD_CONFIG,
  type PrimaryFieldConfigDraft,
  PrimaryFieldConfigOverrideEditor,
  primaryFieldConfigToDraft,
} from "@/components/primary-field-config-editor";
import { RsvpConfirmationTextSection } from "@/components/rsvp-confirmation-text-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldSwitchRow,
  FieldTitle,
} from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectOption } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type AutoApproveDelayUnit,
  parseAutoApproveDelayInput,
  parseAutoApproveLimitInput,
  splitAutoApproveDelayMinutes,
} from "@/lib/auto-approval";
import { buildConfirmationPreviewVariables } from "@/lib/confirmation-text-preview";
import {
  createTimestamp,
  extractDateFromTimestamp,
  extractTimeFromTimestamp,
} from "@/lib/date-utils";
import { sanitizeEventActsForSubmit } from "@/lib/event-metadata";
import {
  EVENT_THEME_DEFAULT_ACCENT_COLOR,
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  normalizeHexColorInput,
} from "@/lib/event-theme";
import type {
  ApplicationError,
  CredentialResponse,
  EditEventFormData,
  Event,
  EventAct,
  EventPartner,
  ListCredentialEdit,
} from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";
import { type EventEditorController, useEventEditContext } from "./[eventId]/event-edit-context";

type EventUpdatePatch = {
  name?: string;
  secondaryTitle?: string;
  description?: string;
  acts?: EventAct[];
  eventPartners?: EventPartner[];
  sponsors?: EventPartner[];
  hosts?: string[];
  productionCompany?: string;
  location?: string;
  flyerUrl?: string;
  flyerStorageId?: Id<"_storage">;
  openGraphImageSource?: Event["openGraphImageSource"];
  customIconStorageId?: Id<"_storage"> | null;
  guestPortalImageStorageId?: Id<"_storage">;
  guestPortalLinkLabel?: string;
  guestPortalLinkUrl?: string;
  eventDate?: number;
  eventEndDate?: number;
  eventTimezone?: string;
  maxAttendees?: number;
  status?: Event["status"];
  isFeatured?: boolean;
  customFields?: Event["customFields"];
  primaryFieldConfig?: Event["primaryFieldConfig"];
  themeBackgroundColor?: string;
  themeTextColor?: string;
  themeAccentColor?: string;
  qrCodeColor?: string;
  sendQrOnApproval?: boolean;
  attendanceQuestionEnabled?: boolean;
  referralSharingEnabled?: boolean;
  rsvpConfirmationMessageEnabled?: boolean;
  rsvpConfirmationMessage?: string;
  smsOptInConfirmationMessage?: string;
  smsOptOutConfirmationMessage?: string;
  qrDeliveryMessage?: string;
};

type EventUnsetField =
  | "secondaryTitle"
  | "productionCompany"
  | "eventEndDate"
  | "flyerStorageId"
  | "guestPortalImageStorageId"
  | "guestPortalLinkLabel"
  | "guestPortalLinkUrl"
  | "primaryFieldConfig"
  | "rsvpConfirmationMessage"
  | "smsOptInConfirmationMessage"
  | "smsOptOutConfirmationMessage"
  | "qrDeliveryMessage";

function sanitizeCustomFieldsForSubmit(customFields: CustomFieldDef[]): Event["customFields"] {
  return customFields.map((field) => ({
    key: field.key.trim(),
    label: field.label.trim(),
    placeholder: field.placeholder?.trim() ? field.placeholder.trim() : undefined,
    required: field.required ?? false,
    copyEnabled: field.copyEnabled ?? false,
    prependUrl: field.prependUrl?.trim() ? field.prependUrl.trim() : undefined,
    trimWhitespace: field.trimWhitespace !== false,
  }));
}

function primaryFieldConfigDraftHasContent(draft: PrimaryFieldConfigDraft): boolean {
  return draft.socialPlatforms.length > 0 || draft.invitedBy.enabled;
}

function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type EventEditorSection = "details" | "confirmations" | "rsvp" | "lists";

const EVENT_EDITOR_SECTION_LABELS: Record<EventEditorSection, string> = {
  details: "Details",
  confirmations: "Messages",
  rsvp: "RSVP Setup",
  lists: "Lists & Access",
};

const EVENT_EDITOR_PATCH_FIELDS: Record<EventEditorSection, readonly (keyof EventUpdatePatch)[]> = {
  details: [
    "name",
    "secondaryTitle",
    "description",
    "hosts",
    "productionCompany",
    "location",
    "eventDate",
    "eventEndDate",
    "eventTimezone",
    "maxAttendees",
    "status",
    "flyerStorageId",
    "openGraphImageSource",
    "customIconStorageId",
    "themeBackgroundColor",
    "themeTextColor",
    "themeAccentColor",
    "qrCodeColor",
    "guestPortalImageStorageId",
    "guestPortalLinkLabel",
    "guestPortalLinkUrl",
    "referralSharingEnabled",
    "acts",
    "eventPartners",
    "sponsors",
  ],
  confirmations: [
    "smsOptInConfirmationMessage",
    "smsOptOutConfirmationMessage",
    "rsvpConfirmationMessageEnabled",
    "rsvpConfirmationMessage",
    "qrDeliveryMessage",
  ],
  rsvp: ["sendQrOnApproval", "attendanceQuestionEnabled", "customFields", "primaryFieldConfig"],
  lists: [],
};

const EVENT_EDITOR_FORM_FIELDS: Record<
  EventEditorSection,
  readonly Extract<keyof EditEventFormData, string>[]
> = {
  details: [
    "name",
    "secondaryTitle",
    "description",
    "hosts",
    "productionCompany",
    "location",
    "eventDate",
    "eventTime",
    "endsLate",
    "eventTimezone",
    "maxAttendees",
    "status",
    "flyerStorageId",
    "openGraphImageSource",
    "customIconStorageId",
    "themeBackgroundColor",
    "themeTextColor",
    "themeAccentColor",
    "qrCodeColor",
    "guestPortalImageStorageId",
    "guestPortalLinkLabel",
    "guestPortalLinkUrl",
    "referralSharingEnabled",
  ],
  confirmations: [
    "smsOptInConfirmationMessage",
    "smsOptOutConfirmationMessage",
    "rsvpConfirmationMessageEnabled",
    "rsvpConfirmationMessage",
    "qrDeliveryMessage",
  ],
  rsvp: ["sendQrOnApproval", "attendanceQuestionEnabled"],
  lists: [],
};

const EVENT_EDITOR_UNSET_FIELDS: Record<EventEditorSection, readonly EventUnsetField[]> = {
  details: [
    "secondaryTitle",
    "productionCompany",
    "flyerStorageId",
    "guestPortalImageStorageId",
    "guestPortalLinkLabel",
    "guestPortalLinkUrl",
  ],
  confirmations: [
    "smsOptInConfirmationMessage",
    "smsOptOutConfirmationMessage",
    "rsvpConfirmationMessage",
    "qrDeliveryMessage",
  ],
  rsvp: ["primaryFieldConfig"],
  lists: [],
};

interface EditEventDialogProps {
  showTrigger?: boolean;
  event: Event;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  inline?: boolean;
  initialTab?: string;
  variant?: "default" | "linear";
  additionalTabTriggers?: React.ReactNode;
  trailingTabTriggers?: React.ReactNode;
  additionalTabContents?: React.ReactNode;
}

export default function EditEventDialog({
  showTrigger = true,
  event,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  inline = false,
  initialTab = "details",
  variant = "default",
  additionalTabTriggers,
  trailingTabTriggers,
  additionalTabContents,
}: EditEventDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(initialTab);
  const TabRoot = variant === "linear" ? LinearTabs : Tabs;
  const TabList = variant === "linear" ? LinearTabsList : TabsList;
  const TabTrigger = variant === "linear" ? LinearTabsTrigger : TabsTrigger;
  const workspaceScope = useWorkspaceScope();
  const editContext = useEventEditContext();
  const open = inline || (externalOpen !== undefined ? externalOpen : internalOpen);
  const setOpen = externalOnOpenChange || setInternalOpen;
  const activeEditorSection = Object.hasOwn(EVENT_EDITOR_SECTION_LABELS, activeTab)
    ? (activeTab as EventEditorSection)
    : null;
  const defaultTimezone = React.useMemo(
    () => event.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    [event.eventTimezone],
  );
  const defaultDate = React.useMemo(() => {
    try {
      return extractDateFromTimestamp(event.eventDate, defaultTimezone);
    } catch {
      return "";
    }
  }, [event.eventDate, defaultTimezone]);
  const defaultTime = React.useMemo(() => {
    try {
      return extractTimeFromTimestamp(event.eventDate, defaultTimezone);
    } catch {
      return "";
    }
  }, [event.eventDate, defaultTimezone]);
  const defaultEndsLate = React.useMemo(() => {
    if (!event.eventEndDate) return true;
    try {
      return (
        extractDateFromTimestamp(event.eventEndDate, defaultTimezone) !==
        extractDateFromTimestamp(event.eventDate, defaultTimezone)
      );
    } catch {
      return true;
    }
  }, [event.eventDate, event.eventEndDate, defaultTimezone]);
  const normalizedEventBackgroundColor =
    normalizeHexColorInput(event.themeBackgroundColor) ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
  const normalizedEventTextColor =
    normalizeHexColorInput(event.themeTextColor) ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
  const normalizedEventAccentColor =
    normalizeHexColorInput(event.themeAccentColor) ?? normalizedEventTextColor;
  const form = useForm<EditEventFormData>({
    defaultValues: {
      name: event.name || "",
      secondaryTitle: event.secondaryTitle ?? "",
      description: event.description ?? "",
      hosts: (event.hosts || []).join(", "),
      productionCompany: event.productionCompany ?? "",
      location: event.location || "",
      flyerStorageId: event.flyerStorageId ?? null,
      openGraphImageSource: event.openGraphImageSource ?? DEFAULT_OPEN_GRAPH_IMAGE_SOURCE,
      customIconStorageId: event.customIconStorageId ?? null,
      guestPortalImageStorageId: event.guestPortalImageStorageId ?? null,
      guestPortalLinkLabel: event.guestPortalLinkLabel ?? "",
      guestPortalLinkUrl: event.guestPortalLinkUrl ?? "",
      eventDate: defaultDate,
      eventTime: defaultTime,
      endsLate: defaultEndsLate,
      eventTimezone: defaultTimezone,
      maxAttendees: event.maxAttendees ?? 1,
      status: event.status ?? "inactive",
      themeBackgroundColor: normalizedEventBackgroundColor,
      themeTextColor: normalizedEventTextColor,
      themeAccentColor: normalizedEventAccentColor,
      qrCodeColor: normalizeHexColorInput(event.qrCodeColor) ?? "#000000",
      sendQrOnApproval:
        typeof event.sendQrOnApproval === "boolean"
          ? event.sendQrOnApproval
          : typeof event.defersQrDelivery === "boolean"
            ? !event.defersQrDelivery
            : false,
      attendanceQuestionEnabled: event.attendanceQuestionEnabled ?? false,
      referralSharingEnabled: event.referralSharingEnabled ?? false,
      rsvpConfirmationMessageEnabled: event.rsvpConfirmationMessageEnabled ?? true,
      rsvpConfirmationMessage: event.rsvpConfirmationMessage ?? "",
      smsOptInConfirmationMessage: event.smsOptInConfirmationMessage ?? "",
      smsOptOutConfirmationMessage: event.smsOptOutConfirmationMessage ?? "",
      qrDeliveryMessage: event.qrDeliveryMessage ?? "",
    },
  });
  const [flyerStorageId, setFlyerStorageId] = React.useState<string | null>(
    event.flyerStorageId ?? null,
  );
  const [savedFlyerStorageId, setSavedFlyerStorageId] = React.useState<string | null>(
    event.flyerStorageId ?? null,
  );
  const [eventIconStorageId, setEventIconStorageId] = React.useState<string | null>(
    event.customIconStorageId ?? null,
  );
  const [savedEventIconStorageId, setSavedEventIconStorageId] = React.useState<string | null>(
    event.customIconStorageId ?? null,
  );
  const [guestPortalImageStorageId, setGuestPortalImageStorageId] = React.useState<string | null>(
    event.guestPortalImageStorageId ?? null,
  );
  const [savedGuestPortalImageStorageId, setSavedGuestPortalImageStorageId] = React.useState<
    string | null
  >(event.guestPortalImageStorageId ?? null);
  const [saving, setSaving] = React.useState(false);
  const update = useAction(api.eventsNode.update);
  const creds = useQuery(
    api.credentials.getHostCredsForEvent,
    open && workspaceScope
      ? {
          eventId: event._id,
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as CredentialResponse[] | undefined;
  const [lists, setLists] = React.useState<ListCredentialEdit[]>([]);
  const [savedLists, setSavedLists] = React.useState<ListCredentialEdit[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>(
    event.customFields ?? [],
  );
  const [savedCustomFields, setSavedCustomFields] = React.useState<CustomFieldDef[]>(
    event.customFields ?? [],
  );
  const [acts, setActs] = React.useState<EventAct[]>(event.acts ?? []);
  const [savedActs, setSavedActs] = React.useState<EventAct[]>(event.acts ?? []);
  const [eventPartners, setEventPartners] = React.useState<EventPartnerDraft[]>(
    eventPartnersToDrafts(event.eventPartners),
  );
  const [savedEventPartners, setSavedEventPartners] = React.useState<EventPartnerDraft[]>(
    eventPartnersToDrafts(event.eventPartners),
  );
  const [sponsors, setSponsors] = React.useState<EventPartnerDraft[]>(
    eventPartnersToDrafts(event.sponsors),
  );
  const [savedSponsors, setSavedSponsors] = React.useState<EventPartnerDraft[]>(
    eventPartnersToDrafts(event.sponsors),
  );
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    open && workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );
  const workspacePrimaryFieldDefaultsDraft: PrimaryFieldConfigDraft = React.useMemo(
    () =>
      primaryFieldConfigToDraft({
        socialPlatforms: workspace?.eventDefaults?.socialPlatforms,
        invitedBy: workspace?.eventDefaults?.invitedBy,
      }),
    [workspace?.eventDefaults?.socialPlatforms, workspace?.eventDefaults?.invitedBy],
  );
  const [usePrimaryFieldDefaults, setUsePrimaryFieldDefaults] = React.useState(
    !event.primaryFieldConfig,
  );
  const [primaryFieldConfigDraft, setPrimaryFieldConfigDraft] =
    React.useState<PrimaryFieldConfigDraft>(() =>
      event.primaryFieldConfig
        ? primaryFieldConfigToDraft(event.primaryFieldConfig)
        : EMPTY_PRIMARY_FIELD_CONFIG,
    );
  const [savedPrimaryFieldConfigDraft, setSavedPrimaryFieldConfigDraft] =
    React.useState<PrimaryFieldConfigDraft>(() =>
      event.primaryFieldConfig
        ? primaryFieldConfigToDraft(event.primaryFieldConfig)
        : EMPTY_PRIMARY_FIELD_CONFIG,
    );
  const [savedUsePrimaryFieldDefaults, setSavedUsePrimaryFieldDefaults] = React.useState(
    !event.primaryFieldConfig,
  );

  React.useEffect(() => {
    if (usePrimaryFieldDefaults) {
      setPrimaryFieldConfigDraft(workspacePrimaryFieldDefaultsDraft);
    }
  }, [usePrimaryFieldDefaults, workspacePrimaryFieldDefaultsDraft]);
  const getStoredPasswords = useAction(api.credentialsNode.getPasswordsForEvent);
  const [storedPasswords, setStoredPasswords] = React.useState<Map<string, string>>(new Map());
  const currentEventName = form.watch("name");
  const currentEventSecondaryTitle = form.watch("secondaryTitle");
  const currentEventLocation = form.watch("location");
  const currentEventDate = form.watch("eventDate");
  const currentEventTime = form.watch("eventTime");
  const currentEventTimezone = form.watch("eventTimezone");
  const currentSendQrOnApproval = form.watch("sendQrOnApproval") ?? false;
  const currentRsvpConfirmationMessageEnabled =
    form.watch("rsvpConfirmationMessageEnabled") ?? true;
  const currentRsvpConfirmationMessage = form.watch("rsvpConfirmationMessage") ?? "";
  const currentSmsOptInConfirmationMessage = form.watch("smsOptInConfirmationMessage") ?? "";
  const currentSmsOptOutConfirmationMessage = form.watch("smsOptOutConfirmationMessage") ?? "";
  const currentQrDeliveryMessage = form.watch("qrDeliveryMessage") ?? "";
  const defaultApprovalMessage = getDefaultApprovalMessage(currentEventName);
  const defaultRsvpConfirmationMessage = getDefaultRsvpConfirmationMessage({
    name: currentEventName,
    secondaryTitle: currentEventSecondaryTitle,
  });
  const confirmationPreviewVariables = React.useMemo(
    () =>
      buildConfirmationPreviewVariables({
        name: currentEventName,
        secondaryTitle: currentEventSecondaryTitle,
        eventDate: currentEventDate,
        eventTime: currentEventTime,
        eventTimezone: currentEventTimezone,
        location: currentEventLocation,
      }),
    [
      currentEventName,
      currentEventSecondaryTitle,
      currentEventDate,
      currentEventTime,
      currentEventTimezone,
      currentEventLocation,
    ],
  );

  const listsAreDirty = JSON.stringify(lists) !== JSON.stringify(savedLists);
  const actsAreDirty = JSON.stringify(acts) !== JSON.stringify(savedActs);
  const eventPartnersAreDirty =
    JSON.stringify(eventPartners) !== JSON.stringify(savedEventPartners);
  const sponsorsAreDirty = JSON.stringify(sponsors) !== JSON.stringify(savedSponsors);
  const customFieldsAreDirty = JSON.stringify(customFields) !== JSON.stringify(savedCustomFields);
  const primaryFieldsAreDirty =
    usePrimaryFieldDefaults !== savedUsePrimaryFieldDefaults ||
    JSON.stringify(primaryFieldConfigDraft) !== JSON.stringify(savedPrimaryFieldConfigDraft);

  const isSectionDirty = React.useCallback(
    (section: EventEditorSection) => {
      const hasDirtyFormField = EVENT_EDITOR_FORM_FIELDS[section].some(
        (fieldName) => form.formState.dirtyFields[fieldName] === true,
      );
      if (hasDirtyFormField) return true;
      if (section === "details") {
        return actsAreDirty || eventPartnersAreDirty || sponsorsAreDirty;
      }
      if (section === "confirmations" || section === "lists") return listsAreDirty;
      if (section === "rsvp") return customFieldsAreDirty || primaryFieldsAreDirty;
      return false;
    },
    [
      actsAreDirty,
      customFieldsAreDirty,
      eventPartnersAreDirty,
      form.formState.dirtyFields,
      listsAreDirty,
      primaryFieldsAreDirty,
      sponsorsAreDirty,
    ],
  );

  const activeSectionIsDirty = activeEditorSection ? isSectionDirty(activeEditorSection) : false;

  const handleTabChange = (nextTab: string) => {
    if (activeEditorSection && activeSectionIsDirty) {
      toast.error("Save or undo this tab before switching sections");
      return;
    }
    setActiveTab(nextTab);
  };

  const handleUndoSection = (section: EventEditorSection) => {
    for (const fieldName of EVENT_EDITOR_FORM_FIELDS[section]) {
      form.resetField(fieldName);
    }
    if (section === "details") {
      setFlyerStorageId(savedFlyerStorageId);
      setEventIconStorageId(savedEventIconStorageId);
      setGuestPortalImageStorageId(savedGuestPortalImageStorageId);
      setActs(savedActs.map((act) => ({ ...act })));
      setEventPartners(savedEventPartners.map((partner) => ({ ...partner })));
      setSponsors(savedSponsors.map((sponsor) => ({ ...sponsor })));
    }
    if (section === "confirmations" || section === "lists") {
      setLists(savedLists.map((list) => ({ ...list })));
    }
    if (section === "rsvp") {
      setCustomFields(savedCustomFields.map((field) => ({ ...field })));
      setUsePrimaryFieldDefaults(savedUsePrimaryFieldDefaults);
      setPrimaryFieldConfigDraft(savedPrimaryFieldConfigDraft);
    }
  };

  useEffect(() => {
    if (open && creds && workspaceScope) {
      const nextLists = creds.map((credential) => {
        const autoApproveDelay = splitAutoApproveDelayMinutes(credential.autoApproveDelayMinutes);
        return {
          id: credential._id,
          listKey: credential.listKey,
          password: "",
          passwordEdited: false,
          requirePassword: credential.hasPassword ?? false,
          generateQR: credential.generateQR ?? false,
          sendQrOnApprovalOverride:
            typeof credential.sendQrOnApproval === "boolean"
              ? credential.sendQrOnApproval
              : typeof credential.defersQrDelivery === "boolean"
                ? !credential.defersQrDelivery
                : undefined,
          includeTicketLinkOnApproval: credential.includeTicketLinkOnApproval,
          approvalMessage: credential.approvalMessage ?? event.approvalMessage ?? "",
          autoApproveLimit:
            typeof credential.autoApproveLimit === "number" && credential.autoApproveLimit > 0
              ? String(credential.autoApproveLimit)
              : "",
          autoApproveDelay: autoApproveDelay.value,
          autoApproveDelayUnit: autoApproveDelay.unit,
        };
      });
      setLists(nextLists);
      setSavedLists(nextLists.map((list) => ({ ...list })));
      // Fetch stored passwords for display.
      getStoredPasswords({
        eventId: event._id,
        ...(workspaceScope?.queryArgs ?? {}),
      })
        .then((results) => {
          const passwordMap = new Map<string, string>();
          for (const result of results) {
            if (result.password) {
              passwordMap.set(result.credentialId, result.password);
            }
          }
          setStoredPasswords(passwordMap);
        })
        .catch(() => {
          // Silently fail - passwords just won't be shown
          setStoredPasswords(new Map());
        });
    }
  }, [open, creds, event._id, event.approvalMessage, getStoredPasswords, workspaceScope]);

  const addList = () =>
    setLists((array) => [
      ...array,
      {
        listKey: "",
        password: "",
        passwordEdited: true,
        requirePassword: false,
        generateQR: false,
        sendQrOnApprovalOverride: undefined,
        includeTicketLinkOnApproval: true,
        approvalMessage: "",
        autoApproveLimit: "",
        autoApproveDelay: "",
        autoApproveDelayUnit: "hours",
      },
    ]);
  const setList = <Key extends keyof ListCredentialEdit>(
    index: number,
    key: Key,
    value: ListCredentialEdit[Key],
  ) =>
    setLists((array) =>
      array.map((item, position) => (position === index ? { ...item, [key]: value } : item)),
    );
  const setListPassword = (index: number, value: string) =>
    setLists((array) =>
      array.map((item, position) =>
        position === index ? { ...item, password: value, passwordEdited: true } : item,
      ),
    );
  const setListApprovalMessage = React.useCallback((listIndex: number, approvalMessage: string) => {
    setLists((currentLists) =>
      currentLists.map((list, currentIndex) =>
        currentIndex === listIndex ? { ...list, approvalMessage } : list,
      ),
    );
  }, []);
  const setListQrAttachmentEnabled = React.useCallback(
    (listIndex: number, qrAttachmentEnabled: boolean) => {
      setLists((currentLists) =>
        currentLists.map((list, currentIndex) => {
          if (currentIndex !== listIndex) return list;
          return qrAttachmentEnabled
            ? {
                ...list,
                generateQR: true,
                sendQrOnApprovalOverride: true,
              }
            : {
                ...list,
                sendQrOnApprovalOverride: false,
              };
        }),
      );
    },
    [],
  );
  const setListTicketLinkEnabled = React.useCallback(
    (listIndex: number, ticketLinkEnabled: boolean) => {
      setLists((currentLists) =>
        currentLists.map((list, currentIndex) =>
          currentIndex === listIndex
            ? { ...list, includeTicketLinkOnApproval: ticketLinkEnabled }
            : list,
        ),
      );
    },
    [],
  );
  const removeList = (index: number) =>
    setLists((array) => array.filter((_, position) => position !== index));

  const handleSubmit = async (values: EditEventFormData, section: EventEditorSection) => {
    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to update events");
        return;
      }
      setSaving(true);
      const patch: EventUpdatePatch = {};
      const unsetFields: EventUnsetField[] = [];
      const trimmedName = values.name.trim();
      if (trimmedName && trimmedName !== event.name) {
        patch.name = trimmedName;
      }
      const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
      if (trimmedSecondaryTitle !== (event.secondaryTitle ?? "")) {
        if (trimmedSecondaryTitle) {
          patch.secondaryTitle = trimmedSecondaryTitle;
        } else {
          unsetFields.push("secondaryTitle");
        }
      }
      const trimmedDescription = values.description?.trim() ?? "";
      if (trimmedDescription !== (event.description ?? "")) {
        patch.description = trimmedDescription;
      }
      const sanitizedActs = sanitizeEventActsForSubmit(acts);
      const existingSanitizedActs = sanitizeEventActsForSubmit(event.acts ?? []);
      if (JSON.stringify(sanitizedActs ?? []) !== JSON.stringify(existingSanitizedActs ?? [])) {
        patch.acts = sanitizedActs ?? [];
      }
      const sanitizedEventPartners = sanitizeEventPartnerDraftsForSubmit(eventPartners);
      if (JSON.stringify(sanitizedEventPartners) !== JSON.stringify(event.eventPartners ?? [])) {
        patch.eventPartners = sanitizedEventPartners;
      }
      const sanitizedSponsors = sanitizeEventPartnerDraftsForSubmit(sponsors);
      if (JSON.stringify(sanitizedSponsors) !== JSON.stringify(event.sponsors ?? [])) {
        patch.sponsors = sanitizedSponsors;
      }
      const hostArray = values.hosts
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);
      if (JSON.stringify(hostArray) !== JSON.stringify(event.hosts)) {
        patch.hosts = hostArray;
      }
      const trimmedProductionCompany = values.productionCompany?.trim() ?? "";
      if (trimmedProductionCompany !== (event.productionCompany ?? "")) {
        if (trimmedProductionCompany) {
          patch.productionCompany = trimmedProductionCompany;
        } else {
          unsetFields.push("productionCompany");
        }
      }
      const trimmedLocation = values.location.trim();
      if (trimmedLocation && trimmedLocation !== event.location) {
        patch.location = trimmedLocation;
      }
      if ((flyerStorageId ?? undefined) !== (event.flyerStorageId ?? undefined)) {
        if (flyerStorageId) {
          patch.flyerStorageId = flyerStorageId as Id<"_storage">;
        } else {
          unsetFields.push("flyerStorageId");
        }
      }
      const nextOpenGraphImageSource =
        values.openGraphImageSource ?? DEFAULT_OPEN_GRAPH_IMAGE_SOURCE;
      const previousOpenGraphImageSource =
        event.openGraphImageSource ?? DEFAULT_OPEN_GRAPH_IMAGE_SOURCE;
      if (nextOpenGraphImageSource !== previousOpenGraphImageSource) {
        patch.openGraphImageSource = nextOpenGraphImageSource;
      }
      if ((eventIconStorageId ?? null) !== (event.customIconStorageId ?? null)) {
        patch.customIconStorageId = (eventIconStorageId as Id<"_storage">) ?? null;
      }
      if ((guestPortalImageStorageId ?? null) !== (event.guestPortalImageStorageId ?? null)) {
        if (guestPortalImageStorageId) {
          patch.guestPortalImageStorageId = guestPortalImageStorageId as Id<"_storage">;
        } else {
          unsetFields.push("guestPortalImageStorageId");
        }
      }
      if (values.maxAttendees !== undefined && values.maxAttendees !== (event.maxAttendees ?? 1)) {
        patch.maxAttendees = values.maxAttendees;
      }
      if ((values.status ?? "inactive") !== (event.status ?? "inactive")) {
        patch.status = values.status ?? "inactive";
      }
      const nextThemeBackgroundColor =
        normalizeHexColorInput(values.themeBackgroundColor) ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
      if (nextThemeBackgroundColor !== normalizedEventBackgroundColor) {
        patch.themeBackgroundColor = nextThemeBackgroundColor;
      }
      const nextThemeTextColor =
        normalizeHexColorInput(values.themeTextColor) ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
      if (nextThemeTextColor !== normalizedEventTextColor) {
        patch.themeTextColor = nextThemeTextColor;
      }
      const nextThemeAccentColor =
        normalizeHexColorInput(values.themeAccentColor) ?? EVENT_THEME_DEFAULT_ACCENT_COLOR;
      if (nextThemeAccentColor !== normalizedEventAccentColor) {
        patch.themeAccentColor = nextThemeAccentColor;
      }
      const nextQrCodeColor = normalizeHexColorInput(values.qrCodeColor) ?? "#000000";
      const normalizedEventQrCodeColor = normalizeHexColorInput(event.qrCodeColor) ?? "#000000";
      if (nextQrCodeColor !== normalizedEventQrCodeColor) {
        patch.qrCodeColor = nextQrCodeColor;
      }
      const trimmedGuestPortalLinkLabel = values.guestPortalLinkLabel?.trim() ?? "";
      const trimmedGuestPortalLinkUrl = values.guestPortalLinkUrl?.trim() ?? "";
      const hasLabel = trimmedGuestPortalLinkLabel.length > 0;
      const hasUrl = trimmedGuestPortalLinkUrl.length > 0;
      if (section === "details" && ((hasLabel && !hasUrl) || (hasUrl && !hasLabel))) {
        toast.error("Provide both a guest link label and URL or leave both blank");
        setSaving(false);
        return;
      }
      if (hasLabel || hasUrl || event.guestPortalLinkLabel || event.guestPortalLinkUrl) {
        const previousLabel = event.guestPortalLinkLabel ?? "";
        const previousUrl = event.guestPortalLinkUrl ?? "";
        if (trimmedGuestPortalLinkLabel !== previousLabel) {
          if (hasLabel) {
            patch.guestPortalLinkLabel = trimmedGuestPortalLinkLabel;
          } else {
            unsetFields.push("guestPortalLinkLabel");
          }
        }
        if (trimmedGuestPortalLinkUrl !== previousUrl) {
          if (hasUrl) {
            patch.guestPortalLinkUrl = trimmedGuestPortalLinkUrl;
          } else {
            unsetFields.push("guestPortalLinkUrl");
          }
        }
      }
      const timezoneValue = values.eventTimezone || defaultTimezone;
      const dateFieldsDirty = Boolean(
        form.formState.dirtyFields.eventDate ||
          form.formState.dirtyFields.eventTime ||
          form.formState.dirtyFields.eventTimezone,
      );
      const computedTimestamp =
        values.eventDate && (values.eventTime || defaultTime)
          ? createTimestamp(
              values.eventDate,
              values.eventTime || defaultTime || "19:00",
              timezoneValue,
            )
          : undefined;
      if (
        dateFieldsDirty &&
        computedTimestamp &&
        Number.isFinite(computedTimestamp) &&
        computedTimestamp !== event.eventDate
      ) {
        patch.eventDate = computedTimestamp;
      }
      const endPolicyDirty = Boolean(
        dateFieldsDirty || form.formState.dirtyFields.endsLate || event.eventEndDate === undefined,
      );
      if (section === "details" && values.eventDate && endPolicyDirty) {
        const endsLate = values.endsLate ?? true;
        const eventEndDate = endsLate ? addDaysToDateString(values.eventDate, 1) : values.eventDate;
        const computedEndTimestamp = createTimestamp(
          eventEndDate,
          endsLate ? "04:00" : "23:59",
          timezoneValue,
        );
        const targetStartTimestamp = computedTimestamp ?? event.eventDate;
        if (computedEndTimestamp <= targetStartTimestamp) {
          toast.error("Event end must be after the event start");
          setSaving(false);
          return;
        }
        if (computedEndTimestamp !== event.eventEndDate) {
          patch.eventEndDate = computedEndTimestamp;
        }
      }
      if (timezoneValue && timezoneValue !== event.eventTimezone) {
        patch.eventTimezone = timezoneValue;
      }
      const previousSendQrOnApproval =
        typeof event.sendQrOnApproval === "boolean"
          ? event.sendQrOnApproval
          : typeof event.defersQrDelivery === "boolean"
            ? !event.defersQrDelivery
            : false;
      const nextSendQrOnApproval = values.sendQrOnApproval ?? false;
      if (nextSendQrOnApproval !== previousSendQrOnApproval) {
        patch.sendQrOnApproval = nextSendQrOnApproval;
      }
      const nextAttendanceQuestionEnabled = values.attendanceQuestionEnabled ?? false;
      if (nextAttendanceQuestionEnabled !== (event.attendanceQuestionEnabled ?? false)) {
        patch.attendanceQuestionEnabled = nextAttendanceQuestionEnabled;
      }
      const nextReferralSharingEnabled = values.referralSharingEnabled ?? false;
      if (nextReferralSharingEnabled !== (event.referralSharingEnabled ?? false)) {
        patch.referralSharingEnabled = nextReferralSharingEnabled;
      }
      const nextRsvpConfirmationMessageEnabled = values.rsvpConfirmationMessageEnabled ?? true;
      if (nextRsvpConfirmationMessageEnabled !== (event.rsvpConfirmationMessageEnabled ?? true)) {
        patch.rsvpConfirmationMessageEnabled = nextRsvpConfirmationMessageEnabled;
      }
      const nextRsvpConfirmationMessage = sanitizeOptionalRsvpConfirmationMessage(
        values.rsvpConfirmationMessage,
      );
      const previousRsvpConfirmationMessage = sanitizeOptionalRsvpConfirmationMessage(
        event.rsvpConfirmationMessage,
      );
      if (nextRsvpConfirmationMessage !== previousRsvpConfirmationMessage) {
        if (nextRsvpConfirmationMessage) {
          patch.rsvpConfirmationMessage = nextRsvpConfirmationMessage;
        } else {
          unsetFields.push("rsvpConfirmationMessage");
        }
      }
      const automatedMessageFields = [
        "smsOptInConfirmationMessage",
        "smsOptOutConfirmationMessage",
        "qrDeliveryMessage",
      ] as const;
      for (const fieldName of automatedMessageFields) {
        const nextMessage = sanitizeOptionalAutomatedEventMessage(values[fieldName]);
        const previousMessage = sanitizeOptionalAutomatedEventMessage(event[fieldName]);
        if (nextMessage === previousMessage) continue;
        if (nextMessage) {
          patch[fieldName] = nextMessage;
        } else {
          unsetFields.push(fieldName);
        }
      }
      const outgoingLists = lists.map((list) => {
        let password: string | undefined;
        if (!list.requirePassword) {
          password = "";
        } else if (list.passwordEdited && list.password.trim()) {
          password = list.password.trim();
        } else {
          password = undefined;
        }
        const autoApproveLimit = parseAutoApproveLimitInput(list.autoApproveLimit);
        const autoApproveDelayMinutes = parseAutoApproveDelayInput(
          list.autoApproveDelay,
          list.autoApproveDelayUnit,
        );
        return {
          id: list.id as Id<"listCredentials"> | undefined,
          listKey: list.listKey.trim(),
          password,
          generateQR: list.generateQR,
          sendQrOnApproval: list.sendQrOnApprovalOverride,
          includeTicketLinkOnApproval: list.includeTicketLinkOnApproval,
          approvalMessage: sanitizeOptionalApprovalMessage(list.approvalMessage),
          autoApproveLimit: autoApproveLimit ?? 0,
          autoApproveDelayMinutes: autoApproveDelayMinutes ?? 0,
        };
      });
      const nextCustomFields = sanitizeCustomFieldsForSubmit(customFields);
      const previousCustomFields = sanitizeCustomFieldsForSubmit(event.customFields ?? []);
      if (JSON.stringify(nextCustomFields) !== JSON.stringify(previousCustomFields)) {
        patch.customFields = nextCustomFields;
      }
      const nextPrimaryFieldConfig = usePrimaryFieldDefaults
        ? undefined
        : draftToPrimaryFieldConfig(primaryFieldConfigDraft);
      const previousPrimaryFieldConfigKey = JSON.stringify(event.primaryFieldConfig ?? null);
      const nextPrimaryFieldConfigKey = JSON.stringify(nextPrimaryFieldConfig ?? null);
      if (usePrimaryFieldDefaults) {
        if (event.primaryFieldConfig) {
          unsetFields.push("primaryFieldConfig");
        }
      } else if (!primaryFieldConfigDraftHasContent(primaryFieldConfigDraft)) {
        if (event.primaryFieldConfig) {
          unsetFields.push("primaryFieldConfig");
        }
      } else if (previousPrimaryFieldConfigKey !== nextPrimaryFieldConfigKey) {
        patch.primaryFieldConfig = nextPrimaryFieldConfig;
      }
      const allowedPatchFields = new Set(EVENT_EDITOR_PATCH_FIELDS[section]);
      const scopedPatch = Object.fromEntries(
        Object.entries(patch).filter(([fieldKey]) =>
          allowedPatchFields.has(fieldKey as keyof EventUpdatePatch),
        ),
      ) as EventUpdatePatch;
      const allowedUnsetFields = new Set(EVENT_EDITOR_UNSET_FIELDS[section]);
      const scopedUnsetFields = unsetFields.filter((fieldKey) => allowedUnsetFields.has(fieldKey));
      const shouldSaveLists = section === "confirmations" || section === "lists";

      await update({
        eventId: event._id,
        ...workspaceScope.queryArgs,
        ...(Object.keys(scopedPatch).length > 0 ? { patch: scopedPatch } : {}),
        ...(scopedUnsetFields.length > 0 ? { unsetFields: scopedUnsetFields } : {}),
        ...(shouldSaveLists ? { lists: outgoingLists } : {}),
      });
      form.reset(values);
      if (section === "details") {
        setSavedFlyerStorageId(flyerStorageId);
        setSavedEventIconStorageId(eventIconStorageId);
        setSavedGuestPortalImageStorageId(guestPortalImageStorageId);
        setSavedActs(acts.map((act) => ({ ...act })));
        setSavedEventPartners(eventPartners.map((partner) => ({ ...partner })));
        setSavedSponsors(sponsors.map((sponsor) => ({ ...sponsor })));
      }
      if (section === "confirmations" || section === "lists") {
        setSavedLists(lists.map((list) => ({ ...list })));
      }
      if (section === "rsvp") {
        setSavedCustomFields(customFields.map((field) => ({ ...field })));
        setSavedUsePrimaryFieldDefaults(usePrimaryFieldDefaults);
        setSavedPrimaryFieldConfigDraft(primaryFieldConfigDraft);
      }
      toast.success(`${EVENT_EDITOR_SECTION_LABELS[section]} saved`);
      if (!inline) {
        setOpen(false);
      }
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  const activeEditorSectionRef = React.useRef(activeEditorSection);
  activeEditorSectionRef.current = activeEditorSection;

  const handleSubmitRef = React.useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const handleUndoSectionRef = React.useRef(handleUndoSection);
  handleUndoSectionRef.current = handleUndoSection;

  const editorController = React.useMemo<EventEditorController>(
    () => ({
      save: async () => {
        const section = activeEditorSectionRef.current;
        if (!section) return;
        await form.handleSubmit((values) => handleSubmitRef.current(values, section))();
      },
      undo: () => {
        const section = activeEditorSectionRef.current;
        if (!section) return;
        handleUndoSectionRef.current(section);
      },
      setFormValue: (field, value) => {
        form.setValue(field, value, { shouldDirty: false });
      },
    }),
    [form],
  );

  React.useEffect(() => {
    if (!editContext || !inline) return;
    editContext.registerController(editorController);
    return () => editContext.unregisterController();
  }, [editContext, inline, editorController]);

  React.useEffect(() => {
    if (!editContext) return;
    editContext.setIsDirty(activeSectionIsDirty);
  }, [editContext, activeSectionIsDirty]);

  React.useEffect(() => {
    if (!editContext) return;
    editContext.setSaving(saving);
  }, [editContext, saving]);

  React.useEffect(() => {
    if (!editContext) return;
    editContext.setSectionLabel(
      activeEditorSection ? EVENT_EDITOR_SECTION_LABELS[activeEditorSection] : "",
    );
  }, [editContext, activeEditorSection]);

  React.useEffect(() => {
    // Keep the main editor form in sync with inline edits from the property panel
    // so that a later save does not overwrite a value that was just updated inline.
    if (!form.formState.dirtyFields.name) {
      form.setValue("name", event.name || "", { shouldDirty: false });
    }
    if (!form.formState.dirtyFields.secondaryTitle) {
      form.setValue("secondaryTitle", event.secondaryTitle ?? "", { shouldDirty: false });
    }
    if (!form.formState.dirtyFields.description) {
      form.setValue("description", event.description ?? "", { shouldDirty: false });
    }
    if (!form.formState.dirtyFields.hosts) {
      form.setValue("hosts", (event.hosts || []).join(", "), { shouldDirty: false });
    }
    if (!form.formState.dirtyFields.location) {
      form.setValue("location", event.location || "", { shouldDirty: false });
    }
  }, [event.name, event.secondaryTitle, event.description, event.hosts, event.location, form]);

  const showBottomSaveBar = !inline || !editContext;

  const editorForm = (
    <div
      className={
        inline
          ? "min-w-0 pb-8"
          : "mx-auto w-full max-w-[1200px] px-5 pb-5 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8"
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            activeEditorSection ? handleSubmit(values, activeEditorSection) : Promise.resolve(),
          )}
          className="space-y-6"
        >
          <TabRoot
            value={activeTab}
            onValueChange={handleTabChange}
            className={
              activeSectionIsDirty
                ? "[&_[data-slot=tabs-trigger]:not([data-state=active])]:pointer-events-none [&_[data-slot=tabs-trigger]:not([data-state=active])]:opacity-40"
                : undefined
            }
          >
            <TabList
              className={cn(
                "w-full justify-start overflow-x-auto overflow-y-hidden border-b border-[var(--border-subtle)] px-1",
                inline && "sticky top-0 z-20 bg-[var(--surface-2)]",
              )}
            >
              {additionalTabTriggers}
              <TabTrigger value="details" className="flex-none gap-1.5">
                <LayoutDashboard className="h-4 w-4" /> Details
              </TabTrigger>
              <TabTrigger value="rsvp" className="flex-none gap-1.5">
                <ClipboardList className="h-4 w-4" /> RSVP Setup
              </TabTrigger>
              <TabTrigger value="lists" className="flex-none gap-1.5">
                <KeyRound className="h-4 w-4" /> Lists &amp; Access
              </TabTrigger>
              <TabTrigger value="confirmations" className="flex-none gap-1.5">
                <MessageSquareText className="h-4 w-4" /> Messages
              </TabTrigger>
              {trailingTabTriggers}
            </TabList>

            <TabsContent value="details" className="space-y-4 pt-5">
              <EventDetailsSection form={form} />
              <EventScheduleSection form={form} showEndPolicy />
              <EventLookSection
                form={form}
                eventIconStorageId={eventIconStorageId}
                onEventIconChange={(value) => {
                  setEventIconStorageId(value);
                  form.setValue("customIconStorageId", value, {
                    shouldDirty: true,
                  });
                }}
                flyerStorageId={flyerStorageId}
                onFlyerChange={(value) => {
                  setFlyerStorageId(value);
                  form.setValue("flyerStorageId", value, {
                    shouldDirty: true,
                  });
                }}
                showOpenGraphImageSource={workspaceScope?.workspaceSlug === "danza-organica"}
                eventPartners={eventPartners}
                onEventPartnersChange={setEventPartners}
                sponsors={sponsors}
                onSponsorsChange={setSponsors}
              />
              <EventGuestPageSection
                form={form}
                guestPortalImageStorageId={guestPortalImageStorageId}
                onGuestPortalImageChange={(value) => {
                  setGuestPortalImageStorageId(value);
                  form.setValue("guestPortalImageStorageId", value, {
                    shouldDirty: true,
                  });
                }}
              />
              <SectionCard
                title="Lineup"
                description="Performers, billing descriptors, social links, and secret guests."
              >
                <EventActsEditor acts={acts} onChange={setActs} />
              </SectionCard>
            </TabsContent>

            <TabsContent value="confirmations" className="pt-5">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    Event text templates
                  </h3>
                  <p className="text-pretty text-sm text-[var(--text-secondary)]">
                    Customize each reusable message in the order guests may receive it. Text blasts
                    and direct replies are edited when you compose them.
                  </p>
                </div>
                <SmsSubscriptionTextsSection
                  organizerName={workspace?.name ?? workspaceScope?.workspaceSlug ?? "Event Host"}
                  smsOptInConfirmationMessage={currentSmsOptInConfirmationMessage}
                  smsOptOutConfirmationMessage={currentSmsOptOutConfirmationMessage}
                  onSmsOptInConfirmationMessageChange={(message) =>
                    form.setValue("smsOptInConfirmationMessage", message, {
                      shouldDirty: true,
                    })
                  }
                  onSmsOptOutConfirmationMessageChange={(message) =>
                    form.setValue("smsOptOutConfirmationMessage", message, {
                      shouldDirty: true,
                    })
                  }
                  previewVariables={confirmationPreviewVariables}
                />
                <RsvpConfirmationTextSection
                  organizerName={workspace?.name ?? workspaceScope?.workspaceSlug ?? "Event Host"}
                  rsvpConfirmationMessageEnabled={currentRsvpConfirmationMessageEnabled}
                  rsvpConfirmationMessage={currentRsvpConfirmationMessage}
                  defaultRsvpConfirmationMessage={defaultRsvpConfirmationMessage}
                  onEnabledChange={(enabled) =>
                    form.setValue("rsvpConfirmationMessageEnabled", enabled, {
                      shouldDirty: true,
                    })
                  }
                  onMessageChange={(message) =>
                    form.setValue("rsvpConfirmationMessage", message, {
                      shouldDirty: true,
                    })
                  }
                  previewVariables={confirmationPreviewVariables}
                />
                <ListConfirmationTextsSection
                  lists={lists}
                  defaultApprovalMessage={defaultApprovalMessage}
                  onApprovalMessageChange={setListApprovalMessage}
                  resolveQrAttachmentEnabled={(list) =>
                    list.generateQR && (list.sendQrOnApprovalOverride ?? currentSendQrOnApproval)
                  }
                  onQrAttachmentChange={setListQrAttachmentEnabled}
                  resolveTicketLinkEnabled={(list) =>
                    list.includeTicketLinkOnApproval ??
                    (!list.generateQR || (list.sendQrOnApprovalOverride ?? currentSendQrOnApproval))
                  }
                  onTicketLinkChange={setListTicketLinkEnabled}
                  previewVariables={confirmationPreviewVariables}
                />
                <QrDeliveryTextSection
                  qrDeliveryMessage={currentQrDeliveryMessage}
                  onQrDeliveryMessageChange={(message) =>
                    form.setValue("qrDeliveryMessage", message, {
                      shouldDirty: true,
                    })
                  }
                  previewVariables={confirmationPreviewVariables}
                />
              </div>
            </TabsContent>

            <TabsContent value="lists" className="space-y-4 pt-5">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Lists &amp; access
                </h3>
                <p className="text-pretty text-sm text-[var(--text-secondary)]">
                  Leave a password blank for an open list — the first list with no password receives
                  RSVPs that skip the password step. Auto-approval applies only to the first
                  submissions on that list; manual approvals do not count toward the limit.
                </p>
              </div>
              {lists.map((listPassword, index) => (
                <SectionCard
                  key={listPassword.id ?? index}
                  title={listPassword.listKey.trim() || `List ${index + 1}`}
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeList(index)}
                      aria-label={`Remove ${listPassword.listKey.trim() || `list ${index + 1}`}`}
                      className="relative h-8 w-8 text-[var(--text-secondary)] after:absolute after:-inset-1.5 after:content-[''] hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                >
                  <div className="space-y-4">
                    <Field className="max-w-sm">
                      <FieldLabel htmlFor={`edit-list-name-${index}`}>List name</FieldLabel>
                      <Input
                        id={`edit-list-name-${index}`}
                        placeholder="e.g. vip, general, backstage"
                        value={listPassword.listKey}
                        onChange={(event) => setList(index, "listKey", event.target.value)}
                      />
                    </Field>
                    <div className="space-y-3">
                      <FieldSwitchRow
                        title="Require password"
                        description="Guests must enter this list's password before they can RSVP."
                        checked={listPassword.requirePassword}
                        onCheckedChange={(checked) => setList(index, "requirePassword", checked)}
                        switchId={`edit-require-password-${index}`}
                      />
                      {listPassword.requirePassword ? (
                        <div className="ml-3 border-l-2 border-[var(--border-subtle)] pl-4">
                          <Field className="max-w-sm">
                            <FieldLabel htmlFor={`edit-list-password-${index}`}>
                              Password
                            </FieldLabel>
                            {(() => {
                              const storedPassword = listPassword.id
                                ? storedPasswords.get(listPassword.id)
                                : undefined;
                              if (storedPassword && !listPassword.passwordEdited) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <Input
                                      id={`edit-list-password-${index}`}
                                      value={storedPassword}
                                      readOnly
                                      className="bg-muted/40 text-muted-foreground"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="shrink-0 text-xs"
                                      onClick={() => setListPassword(index, "")}
                                    >
                                      Change
                                    </Button>
                                  </div>
                                );
                              }
                              return (
                                <Input
                                  id={`edit-list-password-${index}`}
                                  placeholder="Enter password"
                                  value={listPassword.password}
                                  onChange={(event) => setListPassword(index, event.target.value)}
                                />
                              );
                            })()}
                          </Field>
                        </div>
                      ) : null}
                      <Field
                        orientation="horizontal"
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5"
                      >
                        <FieldContent>
                          <FieldTitle>
                            <label
                              htmlFor={`edit-list-auto-approve-limit-${index}`}
                              className="cursor-pointer"
                            >
                              Auto-approve first
                            </label>
                          </FieldTitle>
                          <FieldDescription>
                            Automatically approve this many submissions. Manual approvals do not
                            count toward the limit.
                          </FieldDescription>
                        </FieldContent>
                        <Input
                          id={`edit-list-auto-approve-limit-${index}`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          placeholder="Off"
                          value={listPassword.autoApproveLimit}
                          onChange={(event) =>
                            setList(index, "autoApproveLimit", event.target.value)
                          }
                          className="w-24 shrink-0 text-right tabular-nums"
                        />
                      </Field>
                      {listPassword.autoApproveLimit.trim() ? (
                        <Field
                          orientation="horizontal"
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5"
                        >
                          <FieldContent>
                            <FieldTitle>
                              <label
                                htmlFor={`edit-list-auto-approve-delay-${index}`}
                                className="cursor-pointer"
                              >
                                Approval timing
                              </label>
                            </FieldTitle>
                            <FieldDescription>
                              Wait after the RSVP, or approve at event start if it comes sooner.
                              Leave blank to approve immediately.
                            </FieldDescription>
                          </FieldContent>
                          <div className="flex w-64 shrink-0 gap-2">
                            <Input
                              id={`edit-list-auto-approve-delay-${index}`}
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              placeholder="Immediately"
                              value={listPassword.autoApproveDelay}
                              onChange={(event) =>
                                setList(index, "autoApproveDelay", event.target.value)
                              }
                              className="min-w-0 flex-1 text-right tabular-nums"
                            />
                            <Select
                              aria-label={`Auto-approve delay unit for ${listPassword.listKey || `list ${index + 1}`}`}
                              value={listPassword.autoApproveDelayUnit}
                              onValueChange={(value) =>
                                setList(
                                  index,
                                  "autoApproveDelayUnit",
                                  value as AutoApproveDelayUnit,
                                )
                              }
                              className="w-28 shrink-0"
                            >
                              <SelectOption value="minutes">Minutes</SelectOption>
                              <SelectOption value="hours">Hours</SelectOption>
                              <SelectOption value="days">Days</SelectOption>
                            </Select>
                          </div>
                        </Field>
                      ) : null}
                      <FieldSwitchRow
                        title="Generate QR codes"
                        description="Approved guests on this list receive a scannable door QR code."
                        checked={listPassword.generateQR ?? false}
                        onCheckedChange={(checked) => setList(index, "generateQR", checked)}
                        switchId={`edit-generate-qr-${index}`}
                      />
                      {listPassword.generateQR ? (
                        <div className="ml-3 border-l-2 border-[var(--border-subtle)] pl-4">
                          <Field className="max-w-sm">
                            <FieldLabel htmlFor={`edit-send-qr-on-approval-${index}`}>
                              Send QR on approval
                            </FieldLabel>
                            <select
                              id={`edit-send-qr-on-approval-${index}`}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={
                                listPassword.sendQrOnApprovalOverride === true
                                  ? "on"
                                  : listPassword.sendQrOnApprovalOverride === false
                                    ? "off"
                                    : "inherit"
                              }
                              onChange={(eventChange) => {
                                const next = eventChange.target.value;
                                setList(
                                  index,
                                  "sendQrOnApprovalOverride",
                                  next === "on" ? true : next === "off" ? false : undefined,
                                );
                              }}
                            >
                              <option value="inherit">
                                Inherit from event ({currentSendQrOnApproval ? "on" : "off"})
                              </option>
                              <option value="on">On (always send)</option>
                              <option value="off">Off (always defer)</option>
                            </select>
                            <FieldDescription>
                              Overrides the event-level QR delivery setting for this list only.
                            </FieldDescription>
                          </Field>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </SectionCard>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addList}
                className="w-full border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                + Add Another List
              </Button>
            </TabsContent>

            <TabsContent value="rsvp" className="space-y-4 pt-5">
              <SectionCard
                title="RSVP behavior"
                description="How guests respond and when approval texts include QR codes."
              >
                <div className="space-y-3">
                  <FieldSwitchRow
                    title="Ask attendance question"
                    description="When on, guests choose Yes, No, or Maybe during RSVP. When off, new RSVPs default to Yes."
                    checked={form.watch("attendanceQuestionEnabled") ?? false}
                    onCheckedChange={(checked) =>
                      form.setValue("attendanceQuestionEnabled", checked, {
                        shouldDirty: true,
                      })
                    }
                  />
                  <FieldSwitchRow
                    title="Send QR on approval"
                    description={
                      <>
                        When on, approval texts include the QR code immediately. Default off — most
                        hosts send a manual blast closer to the event from the &quot;Send QR
                        Codes&quot; button on the event card.
                      </>
                    }
                    checked={currentSendQrOnApproval}
                    onCheckedChange={(checked) =>
                      form.setValue("sendQrOnApproval", checked, {
                        shouldDirty: true,
                      })
                    }
                  />
                </div>
              </SectionCard>
              <SectionCard
                title="Primary guest fields"
                description="Social fields and the “invited by” question for this event. Defaults come from workspace settings; override here if needed."
              >
                <PrimaryFieldConfigOverrideEditor
                  value={primaryFieldConfigDraft}
                  onChange={setPrimaryFieldConfigDraft}
                  useDefaults={usePrimaryFieldDefaults}
                  onUseDefaultsChange={setUsePrimaryFieldDefaults}
                  workspaceDefaults={workspacePrimaryFieldDefaultsDraft}
                />
              </SectionCard>
              <CustomFieldsEditor
                initial={event.customFields ?? []}
                onChange={setCustomFields}
                reservedKeys={primaryFieldConfigDraft.socialPlatforms.map(
                  (platform) => platform.platformKey,
                )}
              />
            </TabsContent>
            {additionalTabContents}

            {showBottomSaveBar && activeEditorSection && activeSectionIsDirty ? (
              <div className="sticky bottom-0 z-20 mt-6 flex flex-col gap-3 rounded-xl bg-[var(--surface-2)]/95 p-3 shadow-[var(--shadow-card)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Save {EVENT_EDITOR_SECTION_LABELS[activeEditorSection]}
                  </p>
                  <p className="text-pretty text-xs text-[var(--text-secondary)]">
                    Only settings in this tab are saved. Changes in other tabs stay untouched.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {!inline ? (
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleUndoSection(activeEditorSection)}
                    className="transition-transform duration-150 ease-out active:scale-[0.96]"
                  >
                    Undo changes
                  </Button>
                  <Button
                    type="submit"
                    disabled={saving}
                    className="min-w-36 transition-transform duration-150 ease-out active:scale-[0.96]"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saving
                      ? "Saving..."
                      : `Save ${EVENT_EDITOR_SECTION_LABELS[activeEditorSection]}`}
                  </Button>
                </div>
              </div>
            ) : null}
          </TabRoot>
        </form>
      </Form>
    </div>
  );

  if (inline) {
    return editorForm;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!externalOpen && showTrigger ? (
        <DialogTrigger asChild>
          <button className="min-h-10 rounded-md px-3 text-sm shadow-[var(--shadow-card)] transition-transform duration-150 ease-out active:scale-[0.96]">
            Edit
          </button>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[1200px]">
        <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <DialogTitle className="text-balance">Edit Event</DialogTitle>
          <DialogDescription className="text-pretty">
            Update event details and save each configuration tab independently.
          </DialogDescription>
        </DialogHeader>
        {editorForm}
      </DialogContent>
    </Dialog>
  );
}

"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { resolvePreset, siteConfigurations } from "@coucou/sdk";
import {
  getDefaultApprovalMessage,
  sanitizeOptionalApprovalMessage,
} from "@coucou/sdk/shared/approval-messages";
import type { PrimaryFieldConfig } from "@coucou/sdk/shared/primary-fields";
import {
  getDefaultRsvpConfirmationMessage,
  sanitizeOptionalRsvpConfirmationMessage,
} from "@coucou/sdk/shared/rsvp-confirmation-messages";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { type Path, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type CustomFieldDef, CustomFieldsEditor } from "@/components/custom-fields-builder";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { DateTimePicker } from "@/components/date-time-picker";
import { EventActsEditor } from "@/components/event-acts-editor";
import { EventIconUpload } from "@/components/event-icon-upload";
import { FlyerUpload, StorageImageUpload } from "@/components/flyer-upload";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buildConfirmationPreviewVariables } from "@/lib/confirmation-text-preview";
import {
  createTimestamp,
  extractDateFromTimestamp,
  extractTimeFromTimestamp,
} from "@/lib/date-utils";
import { formatActSummary, sanitizeEventActsForSubmit } from "@/lib/event-metadata";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  isValidHexColor,
  normalizeHexColorInput,
} from "@/lib/event-theme";
import type { ApplicationError, EventAct, EventFormData } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

// `sendQrOnApprovalOverride` is a tri-state: undefined inherits the
// event-level toggle, `true` forces immediate send for that list,
// `false` forces deferral. Wired into the per-list controls in
// `StepLists`.
type ListRow = {
  listKey: string;
  password: string;
  shouldGenerateQrCode: boolean;
  sendQrOnApprovalOverride?: boolean;
  approvalMessage: string;
};

type WizardField = Path<EventFormData>;

type WizardStep = {
  number: string;
  title: string;
  description: string;
  validate: WizardField[];
};

type DraftEventPatchPayload = {
  name: string;
  secondaryTitle?: string;
  description: string;
  acts: EventAct[];
  hosts: string[];
  productionCompany?: string;
  location: string;
  flyerStorageId?: Id<"_storage">;
  customIconStorageId?: Id<"_storage"> | null;
  guestPortalImageStorageId?: Id<"_storage">;
  guestPortalLinkLabel?: string;
  guestPortalLinkUrl?: string;
  eventDate?: number;
  eventEndDate?: number;
  eventTimezone: string;
  maxAttendees?: number;
  themeBackgroundColor?: string;
  themeTextColor?: string;
  qrCodeColor?: string;
  customFields: Array<{
    key: string;
    label: string;
    placeholder?: string;
    required: boolean;
    copyEnabled: boolean;
    prependUrl?: string;
    trimWhitespace: boolean;
  }>;
  primaryFieldConfig?: PrimaryFieldConfig;
  sendQrOnApproval: boolean;
  attendanceQuestionEnabled: boolean;
  referralSharingEnabled: boolean;
  rsvpConfirmationMessageEnabled: boolean;
  rsvpConfirmationMessage?: string;
};

type DraftEventUnsetField = "rsvpConfirmationMessage";

type DraftListPayload = {
  id?: Id<"listCredentials">;
  listKey: string;
  password?: string;
  generateQR?: boolean;
  sendQrOnApproval?: boolean;
  approvalMessage?: string;
};

type DraftPayload = {
  patch: DraftEventPatchPayload;
  unsetFields: DraftEventUnsetField[];
  lists: DraftListPayload[];
};

type EventWizardWorkspaceDefaults = {
  themeBackgroundColor?: string | null;
  themeTextColor?: string | null;
  listKeys?: readonly string[] | null;
  referralSharingEnabled?: boolean | null;
};

type EventWizardWorkspace = {
  preset?: string | null;
  eventDefaults?: EventWizardWorkspaceDefaults | null;
};

type EventWizardDefaults = {
  themeBackgroundColor: string;
  themeTextColor: string;
  listKeys: readonly string[];
  referralSharingEnabled: boolean;
};

type KnownSiteKey = keyof typeof siteConfigurations;

const DEFAULT_LIST_KEYS = ["vip", "ga"] as const;

const STEPS: WizardStep[] = [
  {
    number: "01",
    title: "Event details",
    description: "Add the event name, guest-facing description, and lineup.",
    validate: ["name"],
  },
  {
    number: "02",
    title: "Schedule & capacity",
    description: "Set the location, start time, attendee limit, and RSVP status.",
    validate: ["location", "eventDate"],
  },
  {
    number: "03",
    title: "Branding",
    description: "Choose the event colors and optional icon used across the guest experience.",
    validate: ["themeBackgroundColor", "themeTextColor"],
  },
  {
    number: "04",
    title: "Flyer",
    description: "Upload the optional event flyer shown on the landing page and ticket.",
    validate: [],
  },
  {
    number: "05",
    title: "Guest page",
    description: "Configure the approved ticket view, guest image, link, and sharing options.",
    validate: ["guestPortalLinkLabel", "guestPortalLinkUrl"],
  },
  {
    number: "06",
    title: "Lists & access",
    description: "Create guest lists, passwords, and QR delivery rules.",
    validate: [],
  },
  {
    number: "07",
    title: "Messages",
    description: "Configure the initial RSVP confirmation and approval message for each list.",
    validate: [],
  },
  {
    number: "08",
    title: "RSVP setup",
    description: "Choose the guest information and custom fields collected during RSVP.",
    validate: [],
  },
  {
    number: "09",
    title: "Review & publish",
    description: "Review the event settings before publishing.",
    validate: [],
  },
];

function validateLists(lists: ListRow[]): string[] {
  const filtered = lists.filter((list) => list.listKey?.trim());
  if (filtered.length === 0) {
    return ["Add at least one list before continuing"];
  }
  return [];
}

function validateColors(values: EventFormData): string[] {
  const errors: string[] = [];
  if (values.themeBackgroundColor && !isValidHexColor(values.themeBackgroundColor)) {
    errors.push("Background color must be a valid hex color (e.g. #FFFFFF)");
  }
  if (values.themeTextColor && !isValidHexColor(values.themeTextColor)) {
    errors.push("Text color must be a valid hex color (e.g. #EF4444)");
  }
  return errors;
}

function isKnownSiteKey(value: string | null | undefined): value is KnownSiteKey {
  return typeof value === "string" && value in siteConfigurations;
}

function resolveEventWizardDefaults({
  workspace,
  siteKey,
}: {
  workspace: EventWizardWorkspace | null | undefined;
  siteKey: string | null | undefined;
}): EventWizardDefaults {
  const siteConfiguration = isKnownSiteKey(siteKey) ? siteConfigurations[siteKey] : null;
  const resolvedPreset = resolvePreset({
    workspacePreset: workspace?.preset ?? null,
    siteConfigurationPreset: siteConfiguration?.preset ?? null,
  });
  const eventDefaults = workspace?.eventDefaults;
  const themeBackgroundColor =
    normalizeHexColorInput(eventDefaults?.themeBackgroundColor) ?? resolvedPreset.effective.bg;
  const themeTextColor =
    normalizeHexColorInput(eventDefaults?.themeTextColor) ?? resolvedPreset.effective.fg;
  const listKeys =
    eventDefaults?.listKeys && eventDefaults.listKeys.length > 0
      ? eventDefaults.listKeys
      : DEFAULT_LIST_KEYS;

  return {
    themeBackgroundColor,
    themeTextColor,
    listKeys,
    referralSharingEnabled: eventDefaults?.referralSharingEnabled ?? false,
  };
}

function createListRows(listKeys: readonly string[]): ListRow[] {
  return listKeys.map((listKey) => ({
    listKey,
    password: "",
    shouldGenerateQrCode: false,
    approvalMessage: "",
  }));
}

function areListRowsPristine(currentLists: readonly ListRow[], defaultListKeys: readonly string[]) {
  if (currentLists.length !== defaultListKeys.length) return false;
  return currentLists.every((list, index) => {
    return (
      list.listKey === defaultListKeys[index] &&
      list.password === "" &&
      list.shouldGenerateQrCode === false &&
      list.sendQrOnApprovalOverride === undefined &&
      list.approvalMessage === ""
    );
  });
}

function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createAutomaticEventEndTimestamp(
  values: Pick<EventFormData, "eventDate" | "eventTimezone" | "endsLate">,
): number | undefined {
  if (!values.eventDate) return undefined;
  const endsLate = values.endsLate ?? true;
  return createTimestamp(
    endsLate ? addDaysToDateString(values.eventDate, 1) : values.eventDate,
    endsLate ? "04:00" : "23:59",
    values.eventTimezone,
  );
}

function createDefaultEventFormValues(defaults: EventWizardDefaults): EventFormData {
  return {
    name: "",
    secondaryTitle: "",
    description: "",
    hosts: "",
    productionCompany: "",
    location: "",
    eventDate: "",
    eventTime: "19:00",
    endsLate: true,
    eventTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    flyerStorageId: null,
    customIconStorageId: null,
    guestPortalImageStorageId: null,
    guestPortalLinkLabel: "",
    guestPortalLinkUrl: "",
    maxAttendees: 1,
    status: "inactive",
    themeBackgroundColor: defaults.themeBackgroundColor,
    themeTextColor: defaults.themeTextColor,
    qrCodeColor: "#000000",
    attendanceQuestionEnabled: false,
    referralSharingEnabled: defaults.referralSharingEnabled,
    rsvpConfirmationMessageEnabled: true,
    rsvpConfirmationMessage: "",
  };
}

export default function EventCreateWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );
  const eventsPath = useWorkspaceOperationPath("host", "events?created=1");
  const eventListPath = useWorkspaceOperationPath("host", "events");
  const draftsPath = useWorkspaceOperationPath("host", "events?saved=1");
  const create = useAction(api.eventsNode.create);
  const updateEventAction = useAction(api.eventsNode.update);
  const updateAndPublishEventAction = useAction(api.eventsNode.updateAndPublish);
  const createDraft = useMutation(api.events.createDraft);
  const hasAppliedNewEventDefaults = React.useRef(false);

  const draftIdParam = searchParams?.get("draftId") ?? null;
  const [draftEventId, setDraftEventId] = React.useState<Id<"events"> | null>(
    draftIdParam as Id<"events"> | null,
  );
  const [hydratedDraftEventId, setHydratedDraftEventId] = React.useState<Id<"events"> | null>(null);
  const draftQueryArgs = React.useMemo(() => {
    if (!draftEventId || !workspaceScope) return null;
    return { eventId: draftEventId, ...workspaceScope.queryArgs };
  }, [draftEventId, workspaceScope]);
  const draftEvent = useQuery(api.events.get, draftQueryArgs ?? "skip");
  const draftCredentials = useQuery(api.credentials.getHostCredsForEvent, draftQueryArgs ?? "skip");
  const eventWizardDefaults = React.useMemo(
    () =>
      resolveEventWizardDefaults({
        workspace,
        siteKey: workspaceScope?.siteKey,
      }),
    [workspace, workspaceScope?.siteKey],
  );
  const initialFormValues = React.useMemo(
    () => createDefaultEventFormValues(eventWizardDefaults),
    [eventWizardDefaults],
  );

  const form = useForm<EventFormData>({
    defaultValues: initialFormValues,
    mode: "onTouched",
  });

  const [stepIndex, setStepIndex] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [lists, setLists] = React.useState<ListRow[]>(() =>
    createListRows(eventWizardDefaults.listKeys),
  );
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>([]);
  const [acts, setActs] = React.useState<EventAct[]>([]);
  const [usePrimaryFieldDefaults, setUsePrimaryFieldDefaults] = React.useState(true);
  const [primaryFieldConfigDraft, setPrimaryFieldConfigDraft] =
    React.useState<PrimaryFieldConfigDraft>(EMPTY_PRIMARY_FIELD_CONFIG);
  // `sendQrOnApproval` is the new explicit opt-in for sending QR codes
  // immediately at approval time. Default off — most hosts trigger a
  // manual blast (or scheduled batch) closer to the event from the
  // dashboard's "Send QR Codes" button.
  const [sendQrOnApproval, setSendQrOnApproval] = React.useState(false);
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
                shouldGenerateQrCode: true,
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

  const workspacePrimaryFieldDefaultsDraft: PrimaryFieldConfigDraft = React.useMemo(
    () =>
      primaryFieldConfigToDraft({
        socialPlatforms: workspace?.eventDefaults?.socialPlatforms,
        invitedBy: workspace?.eventDefaults?.invitedBy,
      }),
    [workspace?.eventDefaults?.socialPlatforms, workspace?.eventDefaults?.invitedBy],
  );

  React.useEffect(() => {
    if (usePrimaryFieldDefaults) {
      setPrimaryFieldConfigDraft(workspacePrimaryFieldDefaultsDraft);
    }
  }, [usePrimaryFieldDefaults, workspacePrimaryFieldDefaultsDraft]);

  const flyerStorageId = form.watch("flyerStorageId") ?? null;
  const eventIconStorageId = form.watch("customIconStorageId") ?? null;
  const guestPortalImageStorageId = form.watch("guestPortalImageStorageId") ?? null;
  const eventName = form.watch("name");
  const eventSecondaryTitle = form.watch("secondaryTitle");
  const eventLocation = form.watch("location");
  const eventDateValue = form.watch("eventDate");
  const eventTimeValue = form.watch("eventTime");
  const eventTimezoneValue = form.watch("eventTimezone");
  const rsvpConfirmationMessageEnabled = form.watch("rsvpConfirmationMessageEnabled") ?? true;
  const rsvpConfirmationMessage = form.watch("rsvpConfirmationMessage") ?? "";
  const defaultApprovalMessage = getDefaultApprovalMessage(eventName);
  const defaultRsvpConfirmationMessage = getDefaultRsvpConfirmationMessage({
    name: eventName,
    secondaryTitle: eventSecondaryTitle,
  });
  const confirmationPreviewVariables = React.useMemo(
    () =>
      buildConfirmationPreviewVariables({
        name: eventName,
        secondaryTitle: eventSecondaryTitle,
        eventDate: eventDateValue,
        eventTime: eventTimeValue,
        eventTimezone: eventTimezoneValue,
        location: eventLocation,
      }),
    [
      eventName,
      eventSecondaryTitle,
      eventDateValue,
      eventTimeValue,
      eventTimezoneValue,
      eventLocation,
    ],
  );

  React.useEffect(() => {
    const nextDraftEventId = draftIdParam as Id<"events"> | null;
    setDraftEventId((currentDraftEventId) =>
      currentDraftEventId === nextDraftEventId ? currentDraftEventId : nextDraftEventId,
    );
  }, [draftIdParam]);

  React.useEffect(() => {
    if (draftEventId || workspace === undefined || hasAppliedNewEventDefaults.current) return;

    if (!form.getFieldState("themeBackgroundColor").isDirty) {
      form.setValue("themeBackgroundColor", eventWizardDefaults.themeBackgroundColor);
    }
    if (!form.getFieldState("themeTextColor").isDirty) {
      form.setValue("themeTextColor", eventWizardDefaults.themeTextColor);
    }
    if (!form.getFieldState("referralSharingEnabled").isDirty) {
      form.setValue("referralSharingEnabled", eventWizardDefaults.referralSharingEnabled);
    }
    setLists((currentLists) =>
      areListRowsPristine(currentLists, DEFAULT_LIST_KEYS)
        ? createListRows(eventWizardDefaults.listKeys)
        : currentLists,
    );

    hasAppliedNewEventDefaults.current = true;
  }, [draftEventId, eventWizardDefaults, form, workspace]);

  React.useEffect(() => {
    if (!draftEventId) return;
    if (hydratedDraftEventId === draftEventId) return;
    if (workspace === undefined || !draftEvent || draftCredentials === undefined) return;

    const timezone = draftEvent.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formatTimestampDate = (timestamp: number | undefined | null) => {
      if (!timestamp) return "";
      try {
        return extractDateFromTimestamp(timestamp, timezone);
      } catch {
        return "";
      }
    };
    const formatTimestampTime = (timestamp: number | undefined | null) => {
      if (!timestamp) return "";
      try {
        return extractTimeFromTimestamp(timestamp, timezone);
      } catch {
        return "";
      }
    };

    form.reset({
      name: draftEvent.name ?? "",
      secondaryTitle: draftEvent.secondaryTitle ?? "",
      description: draftEvent.description ?? "",
      hosts: (draftEvent.hosts ?? []).join(", "),
      productionCompany: draftEvent.productionCompany ?? "",
      location: draftEvent.location ?? "",
      flyerStorageId: (draftEvent.flyerStorageId as string | undefined) ?? null,
      customIconStorageId: (draftEvent.customIconStorageId as string | undefined) ?? null,
      guestPortalImageStorageId:
        (draftEvent.guestPortalImageStorageId as string | undefined) ?? null,
      guestPortalLinkLabel: draftEvent.guestPortalLinkLabel ?? "",
      guestPortalLinkUrl: draftEvent.guestPortalLinkUrl ?? "",
      eventDate: formatTimestampDate(draftEvent.eventDate),
      eventTime: formatTimestampTime(draftEvent.eventDate) || "19:00",
      endsLate: draftEvent.eventEndDate
        ? formatTimestampDate(draftEvent.eventEndDate) !== formatTimestampDate(draftEvent.eventDate)
        : true,
      eventTimezone: timezone,
      maxAttendees: draftEvent.maxAttendees ?? 1,
      status: draftEvent.status ?? "inactive",
      themeBackgroundColor:
        normalizeHexColorInput(draftEvent.themeBackgroundColor) ??
        eventWizardDefaults.themeBackgroundColor,
      themeTextColor:
        normalizeHexColorInput(draftEvent.themeTextColor) ?? eventWizardDefaults.themeTextColor,
      qrCodeColor: draftEvent.qrCodeColor ?? "#000000",
      attendanceQuestionEnabled: draftEvent.attendanceQuestionEnabled ?? false,
      referralSharingEnabled:
        draftEvent.referralSharingEnabled ?? eventWizardDefaults.referralSharingEnabled,
      rsvpConfirmationMessageEnabled: draftEvent.rsvpConfirmationMessageEnabled ?? true,
      rsvpConfirmationMessage: draftEvent.rsvpConfirmationMessage ?? "",
    });

    setActs(draftEvent.acts && draftEvent.acts.length > 0 ? (draftEvent.acts as EventAct[]) : []);
    setCustomFields(
      draftEvent.customFields && draftEvent.customFields.length > 0
        ? (draftEvent.customFields as CustomFieldDef[])
        : [],
    );
    if (draftEvent.primaryFieldConfig) {
      setUsePrimaryFieldDefaults(false);
      setPrimaryFieldConfigDraft(primaryFieldConfigToDraft(draftEvent.primaryFieldConfig));
    } else {
      setUsePrimaryFieldDefaults(true);
      setPrimaryFieldConfigDraft(workspacePrimaryFieldDefaultsDraft);
    }
    // Hydrate the new opt-in toggle from a v(n+1) draft (`sendQrOnApproval`).
    // Drafts written before this change only carry `defersQrDelivery`;
    // surface that as the inverse so historical opt-ins (`defersQrDelivery: false`)
    // continue to author "send on approval" until the host edits the event.
    if (typeof draftEvent.sendQrOnApproval === "boolean") {
      setSendQrOnApproval(draftEvent.sendQrOnApproval);
    } else if (typeof draftEvent.defersQrDelivery === "boolean") {
      setSendQrOnApproval(!draftEvent.defersQrDelivery);
    } else {
      setSendQrOnApproval(false);
    }
    if (draftCredentials.length > 0) {
      setLists(
        draftCredentials.map((credential) => ({
          listKey: credential.listKey,
          password: credential.password ?? "",
          shouldGenerateQrCode: credential.generateQR ?? false,
          sendQrOnApprovalOverride:
            typeof credential.sendQrOnApproval === "boolean"
              ? credential.sendQrOnApproval
              : typeof credential.defersQrDelivery === "boolean"
                ? !credential.defersQrDelivery
                : undefined,
          approvalMessage: credential.approvalMessage ?? "",
        })),
      );
    } else {
      setLists(createListRows(eventWizardDefaults.listKeys));
    }

    hasAppliedNewEventDefaults.current = true;
    setHydratedDraftEventId(draftEventId);
    setFurthest(STEPS.length - 1);
  }, [
    draftEventId,
    draftEvent,
    draftCredentials,
    eventWizardDefaults,
    form,
    hydratedDraftEventId,
    workspace,
    workspacePrimaryFieldDefaultsDraft,
  ]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;
  const isDraftHydrating = Boolean(draftEventId) && hydratedDraftEventId !== draftEventId;

  const goTo = (index: number) => {
    if (index <= furthest) setStepIndex(index);
  };

  const back = () => {
    if (!isFirst) setStepIndex((current) => Math.max(0, current - 1));
  };

  const next = async () => {
    const fieldsValid = step.validate.length ? await form.trigger(step.validate) : true;

    if (stepIndex === 2) {
      const errors = validateColors(form.getValues());
      if (errors.length) {
        errors.forEach((message) => toast.error(message));
        return;
      }
    }

    if (stepIndex === 4) {
      const values = form.getValues();
      const labelTrimmed = values.guestPortalLinkLabel?.trim() ?? "";
      const urlTrimmed = values.guestPortalLinkUrl?.trim() ?? "";
      if ((labelTrimmed && !urlTrimmed) || (urlTrimmed && !labelTrimmed)) {
        toast.error("Provide both a guest link label and URL or leave both blank");
        return;
      }
    }

    if (stepIndex === 5) {
      const errors = validateLists(lists);
      if (errors.length) {
        errors.forEach((message) => toast.error(message));
        return;
      }
    }

    if (!fieldsValid) {
      const fieldErrors = form.formState.errors;
      const messages = Object.values(fieldErrors)
        .map((entry) =>
          typeof entry === "object" && entry && "message" in entry
            ? String((entry as { message?: unknown }).message ?? "")
            : "",
        )
        .filter(Boolean);
      messages.forEach((message) => toast.error(message));
      return;
    }

    const nextIndex = Math.min(STEPS.length - 1, stepIndex + 1);
    setStepIndex(nextIndex);
    setFurthest((current) => Math.max(current, nextIndex));
  };

  const buildDraftPayload = (): DraftPayload => {
    const values = form.getValues();
    const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
    const trimmedProductionCompany = values.productionCompany?.trim() ?? "";
    const trimmedLabel = values.guestPortalLinkLabel?.trim() ?? "";
    const trimmedUrl = values.guestPortalLinkUrl?.trim() ?? "";
    const hostNames = (values.hosts ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    const startTimestamp = values.eventDate
      ? createTimestamp(values.eventDate, values.eventTime, values.eventTimezone)
      : undefined;
    const endTimestamp = createAutomaticEventEndTimestamp(values);

    const themeBackground =
      normalizeHexColorInput(values.themeBackgroundColor) ??
      eventWizardDefaults.themeBackgroundColor;
    const themeText =
      normalizeHexColorInput(values.themeTextColor) ?? eventWizardDefaults.themeTextColor;
    const sanitizedRsvpConfirmationMessage = sanitizeOptionalRsvpConfirmationMessage(
      values.rsvpConfirmationMessage,
    );
    const unsetFields: DraftEventUnsetField[] = [];

    const patch: DraftEventPatchPayload = {
      name: values.name?.trim() || "Untitled event",
      secondaryTitle: trimmedSecondaryTitle || undefined,
      description: values.description?.trim() ?? "",
      acts: sanitizeEventActsForSubmit(acts) ?? [],
      hosts: hostNames,
      productionCompany: trimmedProductionCompany || undefined,
      location: values.location?.trim() ?? "",
      flyerStorageId: values.flyerStorageId
        ? (values.flyerStorageId as unknown as Id<"_storage">)
        : undefined,
      customIconStorageId: values.customIconStorageId
        ? (values.customIconStorageId as unknown as Id<"_storage">)
        : null,
      guestPortalImageStorageId: values.guestPortalImageStorageId
        ? (values.guestPortalImageStorageId as unknown as Id<"_storage">)
        : undefined,
      guestPortalLinkLabel: trimmedLabel || undefined,
      guestPortalLinkUrl: trimmedUrl || undefined,
      eventTimezone: values.eventTimezone,
      maxAttendees: values.maxAttendees,
      themeBackgroundColor: themeBackground,
      themeTextColor: themeText,
      qrCodeColor: normalizeHexColorInput(values.qrCodeColor) || undefined,
      customFields: customFields.map((field) => ({
        key: field.key.trim(),
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() || undefined,
        required: field.required ?? false,
        copyEnabled: field.copyEnabled ?? false,
        prependUrl: field.prependUrl?.trim() || undefined,
        trimWhitespace: field.trimWhitespace !== false,
      })),
      primaryFieldConfig: usePrimaryFieldDefaults
        ? undefined
        : draftToPrimaryFieldConfig(primaryFieldConfigDraft),
      sendQrOnApproval,
      attendanceQuestionEnabled: values.attendanceQuestionEnabled ?? false,
      referralSharingEnabled: values.referralSharingEnabled ?? false,
      rsvpConfirmationMessageEnabled: values.rsvpConfirmationMessageEnabled ?? true,
    };
    if (startTimestamp !== undefined) patch.eventDate = startTimestamp;
    if (endTimestamp !== undefined) patch.eventEndDate = endTimestamp;
    if (sanitizedRsvpConfirmationMessage) {
      patch.rsvpConfirmationMessage = sanitizedRsvpConfirmationMessage;
    } else if (draftEvent?.rsvpConfirmationMessage) {
      unsetFields.push("rsvpConfirmationMessage");
    }

    const credentialIdByKey = new Map<string, Id<"listCredentials">>();
    if (draftCredentials) {
      for (const credential of draftCredentials) {
        credentialIdByKey.set(credential.listKey, credential._id as Id<"listCredentials">);
      }
    }

    const listsForPatch = lists
      .filter((list) => list.listKey?.trim())
      .map((list) => {
        const listKey = list.listKey.trim();
        const trimmedPassword = list.password?.trim() ?? "";
        return {
          id: credentialIdByKey.get(listKey),
          listKey,
          password: trimmedPassword,
          generateQR: list.shouldGenerateQrCode,
          sendQrOnApproval: list.sendQrOnApprovalOverride,
          approvalMessage: sanitizeOptionalApprovalMessage(list.approvalMessage),
        };
      });

    return { patch, unsetFields, lists: listsForPatch };
  };

  const ensureDraftEventId = async (): Promise<Id<"events">> => {
    if (draftEventId) return draftEventId;
    if (!workspaceScope) {
      throw new Error("Workspace scope is required to create events");
    }
    const result = await createDraft({
      ...workspaceScope.queryArgs,
      name: form.getValues().name?.trim() || undefined,
    });
    setDraftEventId(result.eventId);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("draftId", result.eventId);
    router.replace(`?${params.toString()}`);
    return result.eventId;
  };

  const saveAsDraft = async () => {
    if (!workspaceScope) {
      toast.error("Workspace scope is required to save drafts");
      return;
    }
    if (draftEventId && isDraftHydrating) {
      toast.error("Draft is still loading");
      return;
    }
    setSubmitting(true);
    try {
      const eventId = await ensureDraftEventId();
      const { patch, unsetFields, lists: listsForPatch } = buildDraftPayload();
      await updateEventAction({
        eventId,
        ...workspaceScope.queryArgs,
        patch,
        unsetFields: unsetFields.length > 0 ? unsetFields : undefined,
        lists: listsForPatch,
      });
      toast.success("Draft saved");
      router.replace(draftsPath);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to save draft");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (draftEventId && isDraftHydrating) {
      toast.error("Draft is still loading");
      return;
    }
    const values = form.getValues();
    const baseValid = await form.trigger(["name", "location", "eventDate"]);
    const colorErrors = validateColors(values);
    const listErrors = validateLists(lists);
    if (colorErrors.length) {
      colorErrors.forEach((message) => toast.error(message));
      return;
    }
    if (listErrors.length) {
      listErrors.forEach((message) => toast.error(message));
      return;
    }
    if (!baseValid) {
      const fieldErrors = form.formState.errors;
      const messages = Object.values(fieldErrors)
        .map((entry) =>
          typeof entry === "object" && entry && "message" in entry
            ? String((entry as { message?: unknown }).message ?? "")
            : "",
        )
        .filter(Boolean);
      if (messages.length > 0) {
        messages.forEach((message) => toast.error(message));
      } else {
        toast.error("A few required fields are still empty.");
      }
      return;
    }
    if (!workspaceScope) {
      toast.error("Workspace scope is required to create events");
      return;
    }
    setSubmitting(true);
    try {
      const timestamp = createTimestamp(values.eventDate, values.eventTime, values.eventTimezone);
      const eventEndTimestamp = createAutomaticEventEndTimestamp(values);

      if (draftEventId) {
        const { patch, unsetFields, lists: listsForPatch } = buildDraftPayload();
        await updateAndPublishEventAction({
          eventId: draftEventId,
          ...workspaceScope.queryArgs,
          patch,
          unsetFields: unsetFields.length > 0 ? unsetFields : undefined,
          lists: listsForPatch,
        });
        toast.success("Event published");
        router.replace(eventsPath);
        return;
      }

      const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
      const trimmedProductionCompany = values.productionCompany?.trim() ?? "";
      const trimmedLabel = values.guestPortalLinkLabel?.trim() ?? "";
      const trimmedUrl = values.guestPortalLinkUrl?.trim() ?? "";
      const hostNames = values.hosts
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      const listsFiltered = lists
        .map((list) => ({
          listKey: list.listKey.trim(),
          password: list.password.trim(),
          generateQR: list.shouldGenerateQrCode,
          sendQrOnApproval: list.sendQrOnApprovalOverride,
          approvalMessage: sanitizeOptionalApprovalMessage(list.approvalMessage),
        }))
        .filter((list) => list.listKey);
      const themeBackground =
        normalizeHexColorInput(values.themeBackgroundColor) ??
        eventWizardDefaults.themeBackgroundColor;
      const themeText =
        normalizeHexColorInput(values.themeTextColor) ?? eventWizardDefaults.themeTextColor;
      await create({
        name: values.name.trim(),
        secondaryTitle: trimmedSecondaryTitle || undefined,
        description: values.description?.trim() || undefined,
        acts: sanitizeEventActsForSubmit(acts),
        hosts: hostNames,
        productionCompany: trimmedProductionCompany || undefined,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId
          ? (values.flyerStorageId as unknown as Id<"_storage"> | undefined)
          : undefined,
        customIconStorageId: values.customIconStorageId
          ? (values.customIconStorageId as unknown as Id<"_storage"> | null)
          : null,
        guestPortalImageStorageId: values.guestPortalImageStorageId
          ? (values.guestPortalImageStorageId as unknown as Id<"_storage">)
          : undefined,
        guestPortalLinkLabel: trimmedLabel || undefined,
        guestPortalLinkUrl: trimmedUrl || undefined,
        eventDate: timestamp,
        eventEndDate: eventEndTimestamp,
        eventTimezone: values.eventTimezone,
        maxAttendees: values.maxAttendees,
        status: values.status ?? "inactive",
        sendQrOnApproval,
        attendanceQuestionEnabled: values.attendanceQuestionEnabled ?? false,
        referralSharingEnabled: values.referralSharingEnabled ?? false,
        rsvpConfirmationMessageEnabled: values.rsvpConfirmationMessageEnabled ?? true,
        rsvpConfirmationMessage: sanitizeOptionalRsvpConfirmationMessage(
          values.rsvpConfirmationMessage,
        ),
        lists: listsFiltered,
        customFields: customFields.map((field) => ({
          key: field.key.trim(),
          label: field.label.trim(),
          placeholder: field.placeholder?.trim() || undefined,
          required: field.required ?? false,
          copyEnabled: field.copyEnabled ?? false,
          prependUrl: field.prependUrl?.trim() || undefined,
          trimWhitespace: field.trimWhitespace !== false,
        })),
        primaryFieldConfig: usePrimaryFieldDefaults
          ? undefined
          : draftToPrimaryFieldConfig(primaryFieldConfigDraft),
        themeBackgroundColor: themeBackground,
        themeTextColor: themeText,
        qrCodeColor: normalizeHexColorInput(values.qrCodeColor) || undefined,
        ...workspaceScope.queryArgs,
      });
      toast.success("Event published");
      router.replace(eventsPath);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to publish event");
      setSubmitting(false);
    }
  };

  const handleAdvance = isLast ? handleSubmit : next;
  const actionsDisabled = submitting || isDraftHydrating;
  const stepUsesOwnCards = stepIndex === 6 || stepIndex === 7;

  const stepContent = (
    <>
      {stepIndex === 0 && <StepIdentity form={form} acts={acts} onActsChange={setActs} />}
      {stepIndex === 1 && (
        <StepWhereWhen
          form={form}
          eventDate={form.watch("eventDate")}
          eventTime={form.watch("eventTime")}
          eventTimezone={form.watch("eventTimezone")}
        />
      )}
      {stepIndex === 2 && (
        <StepLook
          form={form}
          eventIconStorageId={eventIconStorageId}
          onEventIconChange={(value) =>
            form.setValue("customIconStorageId", value, {
              shouldDirty: true,
            })
          }
        />
      )}
      {stepIndex === 3 && (
        <StepFlyer
          flyerStorageId={flyerStorageId}
          onFlyerChange={(value) => form.setValue("flyerStorageId", value, { shouldDirty: true })}
        />
      )}
      {stepIndex === 4 && (
        <StepGuestExperience
          form={form}
          guestPortalImageStorageId={guestPortalImageStorageId}
          onGuestPortalImageChange={(value) =>
            form.setValue("guestPortalImageStorageId", value, {
              shouldDirty: true,
            })
          }
        />
      )}
      {stepIndex === 5 && (
        <StepLists
          sendQrOnApproval={sendQrOnApproval}
          onSendQrOnApprovalChange={setSendQrOnApproval}
          attendanceQuestionEnabled={form.watch("attendanceQuestionEnabled") ?? false}
          onAttendanceQuestionEnabledChange={(value) =>
            form.setValue("attendanceQuestionEnabled", value, {
              shouldDirty: true,
            })
          }
          lists={lists}
          setLists={setLists}
        />
      )}
      {stepIndex === 6 && (
        <div className="space-y-4">
          <RsvpConfirmationTextSection
            rsvpConfirmationMessageEnabled={rsvpConfirmationMessageEnabled}
            rsvpConfirmationMessage={rsvpConfirmationMessage}
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
              list.shouldGenerateQrCode && (list.sendQrOnApprovalOverride ?? sendQrOnApproval)
            }
            onQrAttachmentChange={setListQrAttachmentEnabled}
            previewVariables={confirmationPreviewVariables}
          />
        </div>
      )}
      {stepIndex === 7 && (
        <StepCustomFields
          onChange={setCustomFields}
          initial={customFields}
          primaryFieldConfigDraft={primaryFieldConfigDraft}
          onPrimaryFieldConfigChange={setPrimaryFieldConfigDraft}
          usePrimaryFieldDefaults={usePrimaryFieldDefaults}
          onUsePrimaryFieldDefaultsChange={setUsePrimaryFieldDefaults}
          workspacePrimaryFieldDefaults={workspacePrimaryFieldDefaultsDraft}
        />
      )}
      {stepIndex === 8 && (
        <StepReview
          values={form.getValues()}
          acts={acts}
          lists={lists}
          customFields={customFields}
          onJump={goTo}
        />
      )}
    </>
  );

  return (
    <Form {...form}>
      <form
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            const target = event.target as HTMLElement;
            const isTextarea = target.tagName === "TEXTAREA";
            if (!isTextarea) event.preventDefault();
          }
        }}
        onSubmit={(event) => event.preventDefault()}
        className="flex min-h-0 w-full flex-1 flex-col"
      >
        <DashboardTitleBar
          title={draftEventId ? "Continue creating event" : "Create event"}
          subtitle="Set up the event details, guest experience, access, and messages."
          breadcrumb={[
            { label: "Workspace" },
            { label: "Events", href: eventListPath },
            { label: draftEventId ? "Draft event" : "New event" },
          ]}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={saveAsDraft}
              disabled={actionsDisabled}
              className="border-[var(--border-subtle)] bg-transparent"
            >
              Save &amp; finish later
            </Button>
          }
        />

        <nav
          aria-label="Event creation steps"
          className="flex w-full items-center gap-1 overflow-x-auto border-b border-[var(--border-subtle)] px-1"
        >
          {STEPS.map((entry, index) => {
            const isCurrent = index === stepIndex;
            const isReached = index <= furthest;
            const isComplete = index < furthest || index < stepIndex;
            return (
              <button
                key={entry.number}
                type="button"
                onClick={() => goTo(index)}
                disabled={!isReached}
                className={cn(
                  "relative flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
                  isCurrent
                    ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                    : isReached
                      ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] opacity-45",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="flex h-4 w-4 items-center justify-center text-[11px] tabular-nums text-current">
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : entry.number}
                </span>
                {entry.title}
              </button>
            );
          })}
        </nav>

        <section className="flex-1 py-5">
          <div className="max-w-5xl">
            {stepUsesOwnCards ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-4 px-1">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                      {step.title}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">{step.description}</p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                    Step {stepIndex + 1} of {STEPS.length}
                  </span>
                </div>
                {stepContent}
              </>
            ) : (
              <SectionCard
                title={step.title}
                description={step.description}
                action={
                  <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                    Step {stepIndex + 1} of {STEPS.length}
                  </span>
                }
              >
                {stepContent}
              </SectionCard>
            )}
          </div>
        </section>

        <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/95 py-4 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFirst}
            onClick={back}
            className="border-[var(--border-subtle)] bg-transparent"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-xs tabular-nums text-[var(--text-tertiary)] sm:hidden">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <Button type="button" size="sm" onClick={handleAdvance} disabled={actionsDisabled}>
            {isLast ? (submitting ? "Publishing…" : "Publish event") : "Continue"}
            {!isLast && <ArrowRight className="h-4 w-4" />}
          </Button>
        </footer>
      </form>
    </Form>
  );
}

// ─── Step 01 — Identity ─────────────────────────────────────────

type StepFormProps = {
  form: ReturnType<typeof useForm<EventFormData>>;
};

function StepIdentity({
  form,
  acts,
  onActsChange,
}: StepFormProps & {
  acts: EventAct[];
  onActsChange: (acts: EventAct[]) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="name"
          rules={{ required: "Name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Pomodoro 14" value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="secondaryTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Secondary title <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="Garden Party · with the Quartet"
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>
                Event description <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="A short description guests will see before they RSVP."
                  value={field.value ?? ""}
                  rows={4}
                  className="resize-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="space-y-4 border-t border-[var(--border-subtle)] pt-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Lineup</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Add performers, billing descriptors, social links, and secret guests.
          </p>
        </div>
        <EventActsEditor acts={acts} onChange={onActsChange} />
      </div>
    </div>
  );
}

// ─── Step 02 — When & where ─────────────────────────────────────

function StepWhereWhen({
  form,
  eventDate,
  eventTime,
  eventTimezone,
}: StepFormProps & {
  eventDate: string | undefined;
  eventTime: string | undefined;
  eventTimezone: string | undefined;
}) {
  return (
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="location"
        rules={{ required: "Location is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location</FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Bushwick · address sent on confirmation"
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="eventDate"
        rules={{ required: "Event date is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Date, time &amp; timezone</FormLabel>
            <FormDescription>
              The event closes at midnight, or 4:00 AM when marked late.
            </FormDescription>
            <FormControl>
              <DateTimePicker
                date={eventDate}
                time={eventTime ?? "19:00"}
                timezone={eventTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
                onDateChange={(value) => field.onChange(value)}
                onTimeChange={(value) => form.setValue("eventTime", value, { shouldDirty: true })}
                onTimezoneChange={(value) =>
                  form.setValue("eventTimezone", value, { shouldDirty: true })
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="endsLate"
        render={({ field }) => (
          <FormItem>
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
              <FormControl>
                <Checkbox
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                  className="mt-0.5"
                />
              </FormControl>
              <span className="space-y-1">
                <span className="block text-sm font-medium">Late event</span>
                <span className="block text-xs text-muted-foreground">
                  Keep the event open until 4:00 AM the following day. Otherwise it closes at
                  midnight.
                </span>
              </span>
            </label>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="maxAttendees"
        render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>Max attendees per RSVP</FormLabel>
            <FormControl>
              <Select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={field.value ? String(field.value) : "1"}
                onValueChange={(value) => field.onChange(Number.parseInt(value, 10))}
              >
                <SelectOption value="1">1 (no plus-ones)</SelectOption>
                <SelectOption value="2">2</SelectOption>
                <SelectOption value="3">3</SelectOption>
                <SelectOption value="4">4</SelectOption>
                <SelectOption value="5">5</SelectOption>
                <SelectOption value="6">6</SelectOption>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="status"
        render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel>RSVP status</FormLabel>
            <FormControl>
              <Select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={field.value ?? "inactive"}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectOption value="inactive">Inactive</SelectOption>
                <SelectOption value="active">Active</SelectOption>
                <SelectOption value="past">Past</SelectOption>
              </Select>
            </FormControl>
            <FormDescription>Active events can receive RSVP submissions.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

// ─── Step 03 — Look ─────────────────────────────────────────────

function StepLook({
  form,
  eventIconStorageId,
  onEventIconChange,
}: StepFormProps & {
  eventIconStorageId: string | null;
  onEventIconChange: (value: string | null) => void;
}) {
  const background = form.watch("themeBackgroundColor") ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
  const text = form.watch("themeTextColor") ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
  const eventName = form.watch("name") || "Your event";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="themeBackgroundColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Background</FormLabel>
              <FormControl>
                <ColorRow
                  value={
                    (field.value as string | undefined) ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR
                  }
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="themeTextColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Text color</FormLabel>
              <FormControl>
                <ColorRow
                  value={(field.value as string | undefined) ?? EVENT_THEME_DEFAULT_TEXT_COLOR}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div
        className="rounded-lg border border-[var(--border-subtle)] p-6 transition-colors"
        style={{ background, color: text }}
      >
        <div className="text-xs font-medium opacity-60">Live preview</div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{eventName}</div>
        <div className="mt-2 text-sm opacity-70">The next night · doors at nine</div>
        <div className="mt-6 inline-flex items-center gap-2 border-b" style={{ borderColor: text }}>
          RSVP →
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-[var(--text-primary)]">
          Event icon <span className="text-muted-foreground">(optional)</span>
        </div>
        <p className="mb-3 max-w-lg text-sm text-[var(--text-secondary)]">
          Overrides the favicon and the navigation icon wherever custom theming is applied.
        </p>
        <EventIconUpload value={eventIconStorageId} onChange={onEventIconChange} />
      </div>
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-border/60 bg-transparent p-0"
        aria-label="Color"
      />
      <Input
        value={value.toUpperCase()}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-32 border-0 bg-transparent font-mono text-xs uppercase tracking-wider shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

// ─── Step 04 — Flyer ────────────────────────────────────────────

function StepFlyer({
  flyerStorageId,
  onFlyerChange,
}: {
  flyerStorageId: string | null;
  onFlyerChange: (value: string | null) => void;
}) {
  return (
    <div>
      <FlyerUpload value={flyerStorageId} onChange={onFlyerChange} />
    </div>
  );
}

// ─── Step 05 — Guest experience ─────────────────────────────────

function StepGuestExperience({
  form,
  guestPortalImageStorageId,
  onGuestPortalImageChange,
}: StepFormProps & {
  guestPortalImageStorageId: string | null;
  onGuestPortalImageChange: (value: string | null) => void;
}) {
  const themeBackground =
    normalizeHexColorInput(form.watch("themeBackgroundColor")) ??
    EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
  const themeText =
    normalizeHexColorInput(form.watch("themeTextColor")) ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
  const eventName = form.watch("name") || "Your event";
  const guestLinkLabel = form.watch("guestPortalLinkLabel");

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 text-sm font-medium text-[var(--text-primary)]">Preview</div>
        <p className="mb-3 max-w-lg text-sm text-muted-foreground">
          Approved-status screen and QR ticket inherit these colors from step 03.
        </p>
        <div
          className="rounded-lg border border-[var(--border-subtle)] p-6"
          style={{ backgroundColor: themeBackground, color: themeText }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-24 w-24 items-center justify-center rounded"
              style={{ backgroundColor: themeText }}
            >
              <div
                className="grid grid-cols-5 grid-rows-5 gap-0.5"
                style={{ width: 60, height: 60 }}
                aria-hidden
              >
                {Array.from({ length: 25 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-sm"
                    style={{
                      backgroundColor: index % 3 === 0 ? themeBackground : "transparent",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-xs font-medium opacity-60">Approved</div>
              <div className="text-xl font-semibold leading-tight" style={{ color: themeText }}>
                {eventName}
              </div>
              <div className="text-xs opacity-70">
                Sample QR colors — change them in step 03 (Look).
              </div>
              {guestLinkLabel ? (
                <div
                  className="mt-3 inline-flex rounded border px-3 py-1.5 text-xs"
                  style={{ borderColor: themeText }}
                >
                  {guestLinkLabel}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-[var(--text-primary)]">
          Status &amp; ticket image <span className="text-muted-foreground">(optional)</span>
        </div>
        <p className="mb-3 max-w-lg text-sm text-muted-foreground">
          Shown on the pending status screen and beneath approved tickets.
        </p>
        <StorageImageUpload
          value={guestPortalImageStorageId}
          onChange={onGuestPortalImageChange}
          emptyStateTitle="Drag & drop guest image"
          emptyStateDescription="or click to upload an image"
          uploadedTitle="Guest image uploaded"
          previewAlt="Guest experience image preview"
          helperText="Recommended size: square or portrait."
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          control={form.control}
          name="guestPortalLinkLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Guest link label <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="View event guide" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="guestPortalLinkUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Guest link URL <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  type="url"
                  placeholder="https://example.com/arrival-details"
                />
              </FormControl>
              <FormDescription>
                Button appears on the guest portal when both label and URL are set.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="referralSharingEnabled"
        render={({ field }) => (
          <FormItem>
            <label className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
              <FormControl>
                <Checkbox
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(Boolean(checked))}
                  className="mt-0.5"
                />
              </FormControl>
              <span className="space-y-1">
                <span className="block text-sm font-medium">Show referral sharing CTA</span>
                <FormDescription>
                  Adds the guest sharing button on pending status pages and approved tickets.
                </FormDescription>
              </span>
            </label>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

// ─── Step 06 — Lists ────────────────────────────────────────────

// Tri-state for the per-list "send QR on approval" override. Stored as
// `boolean | undefined` on the list row; the radio control encodes the
// undefined case as the literal string "inherit" so React doesn't lose
// the value through stringification.
type SendQrOnApprovalOverrideOption = "inherit" | "on" | "off";

function overrideValueToOption(value: boolean | undefined): SendQrOnApprovalOverrideOption {
  if (value === true) return "on";
  if (value === false) return "off";
  return "inherit";
}

function overrideOptionToValue(option: SendQrOnApprovalOverrideOption): boolean | undefined {
  if (option === "on") return true;
  if (option === "off") return false;
  return undefined;
}

function StepLists({
  lists,
  setLists,
  sendQrOnApproval,
  onSendQrOnApprovalChange,
  attendanceQuestionEnabled,
  onAttendanceQuestionEnabledChange,
}: {
  lists: ListRow[];
  setLists: React.Dispatch<React.SetStateAction<ListRow[]>>;
  sendQrOnApproval: boolean;
  onSendQrOnApprovalChange: (value: boolean) => void;
  attendanceQuestionEnabled: boolean;
  onAttendanceQuestionEnabledChange: (value: boolean) => void;
}) {
  const update = <Key extends keyof ListRow>(index: number, key: Key, value: ListRow[Key]) =>
    setLists((current) =>
      current.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)),
    );
  const remove = (index: number) =>
    setLists((current) => current.filter((_, idx) => idx !== index));
  const add = () =>
    setLists((current) => [
      ...current,
      {
        listKey: "",
        password: "",
        shouldGenerateQrCode: false,
        sendQrOnApprovalOverride: undefined,
        approvalMessage: "",
      },
    ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[200px_1fr_80px_100px] items-baseline gap-4 border-b border-border/60 pb-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>List name</span>
        <span>Password (optional)</span>
        <span>QR</span>
        <span className="text-right">Actions</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Leave password blank for an open list — the first list with no password receives RSVPs that
        skip the password step.
      </p>
      <label className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
        <Checkbox
          checked={sendQrOnApproval}
          onCheckedChange={(checked) => onSendQrOnApprovalChange(Boolean(checked))}
          className="mt-0.5"
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium">Send QR on approval</span>
          <span className="block text-xs text-muted-foreground">
            When on, approval texts include the QR code immediately. Default off — most hosts send a
            manual blast closer to the event.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
        <Checkbox
          checked={attendanceQuestionEnabled}
          onCheckedChange={(checked) => onAttendanceQuestionEnabledChange(Boolean(checked))}
          className="mt-0.5"
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium">Ask attendance question</span>
          <span className="block text-xs text-muted-foreground">
            When on, guests choose Yes, No, or Maybe during RSVP. When off, new RSVPs default to
            Yes.
          </span>
        </span>
      </label>
      {lists.map((list, index) => (
        <div key={index} className="space-y-3 border-b border-border/60 pb-6 last:border-b-0">
          <div className="grid grid-cols-[200px_1fr_80px_100px] items-center gap-4">
            <Input
              placeholder="vip, ga, backstage"
              value={list.listKey}
              onChange={(event) => update(index, "listKey", event.target.value)}
              className="h-10 font-mono text-sm"
            />
            <Input
              placeholder="Leave blank for no password"
              value={list.password}
              onChange={(event) => update(index, "password", event.target.value)}
              className="h-10"
            />
            <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={list.shouldGenerateQrCode}
                onCheckedChange={(checked) =>
                  update(index, "shouldGenerateQrCode", Boolean(checked))
                }
              />
            </label>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                className="text-muted-foreground hover:text-foreground"
              >
                Remove
              </Button>
            </div>
          </div>
          {list.shouldGenerateQrCode ? (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Send QR on approval (this list)
              </label>
              <Select
                className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                value={overrideValueToOption(list.sendQrOnApprovalOverride)}
                onValueChange={(value) =>
                  update(
                    index,
                    "sendQrOnApprovalOverride",
                    overrideOptionToValue(value as SendQrOnApprovalOverrideOption),
                  )
                }
              >
                <SelectOption value="inherit">
                  Inherit from event ({sendQrOnApproval ? "on" : "off"})
                </SelectOption>
                <SelectOption value="on">On (always send)</SelectOption>
                <SelectOption value="off">Off (always defer)</SelectOption>
              </Select>
            </div>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
        + Add another list
      </Button>
    </div>
  );
}

// ─── Step 08 — Custom RSVP fields ───────────────────────────────

function StepCustomFields({
  initial,
  onChange,
  primaryFieldConfigDraft,
  onPrimaryFieldConfigChange,
  usePrimaryFieldDefaults,
  onUsePrimaryFieldDefaultsChange,
  workspacePrimaryFieldDefaults,
}: {
  initial: CustomFieldDef[];
  onChange: (fields: CustomFieldDef[]) => void;
  primaryFieldConfigDraft: PrimaryFieldConfigDraft;
  onPrimaryFieldConfigChange: (next: PrimaryFieldConfigDraft) => void;
  usePrimaryFieldDefaults: boolean;
  onUsePrimaryFieldDefaultsChange: (next: boolean) => void;
  workspacePrimaryFieldDefaults: PrimaryFieldConfigDraft;
}) {
  return (
    <div className="space-y-4">
      <SectionCard
        title="Primary fields"
        description="Choose the social fields and invited-by question for this event, or use the workspace defaults."
      >
        <PrimaryFieldConfigOverrideEditor
          value={primaryFieldConfigDraft}
          onChange={onPrimaryFieldConfigChange}
          useDefaults={usePrimaryFieldDefaults}
          onUseDefaultsChange={onUsePrimaryFieldDefaultsChange}
          workspaceDefaults={workspacePrimaryFieldDefaults}
        />
      </SectionCard>
      <CustomFieldsEditor
        initial={initial}
        onChange={onChange}
        reservedKeys={primaryFieldConfigDraft.socialPlatforms.map(
          (platform) => platform.platformKey,
        )}
      />
    </div>
  );
}

// ─── Step 09 — Review ───────────────────────────────────────────

function StepReview({
  values,
  acts,
  lists,
  customFields,
  onJump,
}: {
  values: EventFormData;
  acts: EventAct[];
  lists: ListRow[];
  customFields: CustomFieldDef[];
  onJump: (index: number) => void;
}) {
  const filteredLists = lists.filter((list) => list.listKey?.trim());
  const customConfirmationTextCount = filteredLists.filter((list) =>
    list.approvalMessage.trim(),
  ).length;
  const dateLabel = values.eventDate
    ? `${values.eventDate} · ${values.eventTime ?? ""} ${values.eventTimezone ?? ""}`.trim()
    : "—";

  const rows: { stepIndex: number; key: string; value: React.ReactNode }[] = [
    { stepIndex: 0, key: "Name", value: values.name || "—" },
    {
      stepIndex: 0,
      key: "Lineup",
      value: formatActSummary(sanitizeEventActsForSubmit(acts) ?? []),
    },
    {
      stepIndex: 0,
      key: "Hosts",
      value: values.hosts || "—",
    },
    { stepIndex: 1, key: "When", value: dateLabel },
    { stepIndex: 1, key: "Where", value: values.location || "—" },
    {
      stepIndex: 1,
      key: "Max",
      value: `${values.maxAttendees ?? 1} per RSVP`,
    },
    {
      stepIndex: 1,
      key: "Status",
      value: values.status ?? "inactive",
    },
    {
      stepIndex: 2,
      key: "Colors",
      value: (
        <span className="inline-flex items-center gap-2 font-mono text-xs">
          <span
            className="inline-block h-4 w-4 rounded-sm border border-border/60"
            style={{ background: values.themeBackgroundColor }}
          />
          <span
            className="inline-block h-4 w-4 rounded-sm border border-border/60"
            style={{ background: values.themeTextColor }}
          />
          <span>
            {values.themeBackgroundColor} / {values.themeTextColor}
          </span>
        </span>
      ),
    },
    {
      stepIndex: 4,
      key: "Guest sharing",
      value: values.referralSharingEnabled ? "On" : "Off",
    },
    {
      stepIndex: 5,
      key: "Lists",
      value: filteredLists.length ? filteredLists.map((list) => list.listKey).join(", ") : "—",
    },
    {
      stepIndex: 5,
      key: "Attendance",
      value: values.attendanceQuestionEnabled ? "Ask Yes / No / Maybe" : "Default Yes",
    },
    {
      stepIndex: 6,
      key: "Texts",
      value:
        customConfirmationTextCount > 0
          ? `${customConfirmationTextCount} custom confirmation text${
              customConfirmationTextCount === 1 ? "" : "s"
            }`
          : "Default confirmations",
    },
    {
      stepIndex: 7,
      key: "RSVP fields",
      value: customFields.length
        ? customFields.map((field) => field.label || field.key).join(", ")
        : "—",
    },
  ];

  return (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={() => onJump(row.stepIndex)}
          className="grid w-full grid-cols-[140px_1fr_auto] items-baseline gap-4 py-4 text-left transition-colors hover:bg-muted/30"
        >
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {row.key}
          </span>
          <span className="text-sm text-foreground">{row.value}</span>
          <span className="text-xs text-muted-foreground">edit →</span>
        </button>
      ))}
    </div>
  );
}

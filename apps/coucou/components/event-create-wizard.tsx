"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  getDefaultApprovalMessage,
  sanitizeOptionalApprovalMessage,
} from "@coucou/sdk/shared/approval-messages";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { type Path, useForm } from "react-hook-form";
import { toast } from "sonner";
import { type CustomFieldDef, CustomFieldsEditor } from "@/components/custom-fields-builder";
import { DateTimePicker } from "@/components/date-time-picker";
import { EventActsEditor } from "@/components/event-acts-editor";
import { EventIconUpload } from "@/components/event-icon-upload";
import { FlyerUpload, StorageImageUpload } from "@/components/flyer-upload";
import {
  draftToPrimaryFieldConfig,
  EMPTY_PRIMARY_FIELD_CONFIG,
  type PrimaryFieldConfigDraft,
  PrimaryFieldConfigOverrideEditor,
  primaryFieldConfigToDraft,
} from "@/components/primary-field-config-editor";
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
import { Select, SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  eyebrow: string;
  title: string;
  description: string;
  validate: WizardField[];
};

const STEPS: WizardStep[] = [
  {
    number: "01",
    eyebrow: "Identity",
    title: "Name the night.",
    description: "What guests will see across invites, tickets, and the front door.",
    validate: ["name"],
  },
  {
    number: "02",
    eyebrow: "Time & place",
    title: "Where, when, how many.",
    description: "We'll show this on the public landing and use it on the door list.",
    validate: ["location", "eventDate"],
  },
  {
    number: "03",
    eyebrow: "Look",
    title: "Pick the colors.",
    description: "Two colors carry the whole guest experience — invitation, status, ticket.",
    validate: ["themeBackgroundColor", "themeTextColor"],
  },
  {
    number: "04",
    eyebrow: "Flyer",
    title: "Drop the flyer.",
    description: "Optional. We'll show it on the landing and the ticket.",
    validate: [],
  },
  {
    number: "05",
    eyebrow: "Guest experience",
    title: "Status & ticket details.",
    description: "Optional image and a button to give guests something to read while they wait.",
    validate: ["guestPortalLinkLabel", "guestPortalLinkUrl"],
  },
  {
    number: "06",
    eyebrow: "Lists",
    title: "How they get in.",
    description: "Each password routes its guest to a list. Add a list per crowd.",
    validate: [],
  },
  {
    number: "07",
    eyebrow: "RSVP fields",
    title: "What you want to know.",
    description: "Optional. Anything you'd like guests to tell you when they RSVP.",
    validate: [],
  },
  {
    number: "08",
    eyebrow: "Review",
    title: "Last look.",
    description: "Glance over everything, then send it live.",
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

export default function EventCreateWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceScope = useWorkspaceScope();
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );
  const eventsPath = useWorkspaceOperationPath("host", "events?created=1");
  const draftsPath = useWorkspaceOperationPath("host", "events?saved=1");
  const create = useAction(api.eventsNode.create);
  const updateEventAction = useAction(api.eventsNode.update);
  const createDraft = useMutation(api.events.createDraft);
  const publishEvent = useMutation(api.events.publishEvent);
  const hasAppliedWorkspaceDefaults = React.useRef(false);
  const hasHydratedFromDraft = React.useRef(false);

  const draftIdParam = searchParams?.get("draftId") ?? null;
  const [draftEventId, setDraftEventId] = React.useState<Id<"events"> | null>(
    draftIdParam as Id<"events"> | null,
  );
  const draftQueryArgs = React.useMemo(() => {
    if (!draftEventId || !workspaceScope) return null;
    return { eventId: draftEventId, ...workspaceScope.queryArgs };
  }, [draftEventId, workspaceScope]);
  const draftEvent = useQuery(api.events.get, draftQueryArgs ?? "skip");
  const draftCredentials = useQuery(api.credentials.getHostCredsForEvent, draftQueryArgs ?? "skip");

  const form = useForm<EventFormData>({
    defaultValues: {
      name: "",
      secondaryTitle: "",
      description: "",
      hosts: "",
      productionCompany: "",
      location: "",
      eventDate: "",
      eventTime: "19:00",
      eventTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      flyerStorageId: null,
      customIconStorageId: null,
      guestPortalImageStorageId: null,
      guestPortalLinkLabel: "",
      guestPortalLinkUrl: "",
      maxAttendees: 1,
      status: "inactive",
      themeBackgroundColor: EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
      themeTextColor: EVENT_THEME_DEFAULT_TEXT_COLOR,
      qrCodeColor: "#000000",
    },
    mode: "onTouched",
  });

  const [stepIndex, setStepIndex] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [lists, setLists] = React.useState<ListRow[]>([
    {
      listKey: "vip",
      password: "",
      shouldGenerateQrCode: false,
      approvalMessage: "",
    },
    {
      listKey: "ga",
      password: "",
      shouldGenerateQrCode: false,
      approvalMessage: "",
    },
  ]);
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
  const defaultApprovalMessage = getDefaultApprovalMessage(eventName);

  React.useEffect(() => {
    const eventDefaults = workspace?.eventDefaults;
    if (!eventDefaults || hasAppliedWorkspaceDefaults.current) return;

    if (eventDefaults.themeBackgroundColor) {
      form.setValue("themeBackgroundColor", eventDefaults.themeBackgroundColor);
    }
    if (eventDefaults.themeTextColor) {
      form.setValue("themeTextColor", eventDefaults.themeTextColor);
    }
    if (eventDefaults.listKeys && eventDefaults.listKeys.length > 0) {
      setLists(
        eventDefaults.listKeys.map((listKey) => ({
          listKey,
          password: "",
          shouldGenerateQrCode: false,
          approvalMessage: "",
        })),
      );
    }

    hasAppliedWorkspaceDefaults.current = true;
  }, [form, workspace?.eventDefaults]);

  React.useEffect(() => {
    if (!draftEventId) return;
    if (hasHydratedFromDraft.current) return;
    if (!draftEvent || draftCredentials === undefined) return;

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
      eventTimezone: timezone,
      maxAttendees: draftEvent.maxAttendees ?? 1,
      status: draftEvent.status ?? "inactive",
      themeBackgroundColor: draftEvent.themeBackgroundColor ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
      themeTextColor: draftEvent.themeTextColor ?? EVENT_THEME_DEFAULT_TEXT_COLOR,
      qrCodeColor: draftEvent.qrCodeColor ?? "#000000",
    });

    if (draftEvent.acts && draftEvent.acts.length > 0) {
      setActs(draftEvent.acts as EventAct[]);
    }
    if (draftEvent.customFields && draftEvent.customFields.length > 0) {
      setCustomFields(draftEvent.customFields as CustomFieldDef[]);
    }
    if (draftEvent.primaryFieldConfig) {
      setUsePrimaryFieldDefaults(false);
      setPrimaryFieldConfigDraft(primaryFieldConfigToDraft(draftEvent.primaryFieldConfig));
    }
    // Hydrate the new opt-in toggle from a v(n+1) draft (`sendQrOnApproval`).
    // Drafts written before this change only carry `defersQrDelivery`;
    // surface that as the inverse so historical opt-ins (`defersQrDelivery: false`)
    // continue to author "send on approval" until the host edits the event.
    if (typeof draftEvent.sendQrOnApproval === "boolean") {
      setSendQrOnApproval(draftEvent.sendQrOnApproval);
    } else if (typeof draftEvent.defersQrDelivery === "boolean") {
      setSendQrOnApproval(!draftEvent.defersQrDelivery);
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
    }

    hasAppliedWorkspaceDefaults.current = true;
    hasHydratedFromDraft.current = true;
    setFurthest(STEPS.length - 1);
  }, [draftEventId, draftEvent, draftCredentials, form]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

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

  const buildDraftPayload = (): {
    patch: Record<string, unknown>;
    lists: Array<{
      id?: Id<"listCredentials">;
      listKey: string;
      password?: string;
      generateQR?: boolean;
      sendQrOnApproval?: boolean;
      approvalMessage?: string;
    }>;
  } => {
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

    const themeBackground = normalizeHexColorInput(values.themeBackgroundColor) ?? undefined;
    const themeText = normalizeHexColorInput(values.themeTextColor) ?? undefined;

    const patch: Record<string, unknown> = {
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
    };
    if (startTimestamp !== undefined) patch.eventDate = startTimestamp;

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

    return { patch, lists: listsForPatch };
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
    setSubmitting(true);
    try {
      const eventId = await ensureDraftEventId();
      const { patch, lists: listsForPatch } = buildDraftPayload();
      await updateEventAction({
        eventId,
        ...workspaceScope.queryArgs,
        patch: patch as never,
        lists: listsForPatch as never,
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

      if (draftEventId) {
        const { patch, lists: listsForPatch } = buildDraftPayload();
        await updateEventAction({
          eventId: draftEventId,
          ...workspaceScope.queryArgs,
          patch: patch as never,
          lists: listsForPatch as never,
        });
        await publishEvent({
          eventId: draftEventId,
          ...workspaceScope.queryArgs,
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
        normalizeHexColorInput(values.themeBackgroundColor) ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
      const themeText =
        normalizeHexColorInput(values.themeTextColor) ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
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
        eventTimezone: values.eventTimezone,
        maxAttendees: values.maxAttendees,
        status: values.status ?? "inactive",
        sendQrOnApproval,
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
        className="mx-auto flex w-full max-w-3xl flex-col"
      >
        <header className="flex items-center justify-between border-b border-border/60 py-6">
          <div className="text-sm uppercase tracking-[0.18em] text-foreground">New event</div>
          <div className="text-sm tabular-nums text-muted-foreground">
            {step.number} <span className="text-muted-foreground/50">/ 08</span>
          </div>
          <button
            type="button"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            onClick={saveAsDraft}
            disabled={submitting}
          >
            save & finish later
          </button>
        </header>

        <nav className="flex items-center gap-3 overflow-x-auto border-b border-border/60 py-5">
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
                  "group flex shrink-0 items-center gap-2 text-xs tabular-nums transition-colors",
                  isReached ? "cursor-pointer" : "cursor-default",
                  isCurrent
                    ? "text-foreground"
                    : isComplete
                      ? "text-foreground/70 hover:text-foreground"
                      : "text-muted-foreground/40",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] tabular-nums",
                    isCurrent
                      ? "border-foreground bg-foreground text-background"
                      : isComplete
                        ? "border-foreground/70 text-foreground/70"
                        : "border-border text-muted-foreground/60",
                  )}
                >
                  {isComplete ? <Check className="h-3 w-3" /> : entry.number}
                </span>
                <span className="hidden text-xs uppercase tracking-[0.12em] sm:inline">
                  {entry.eyebrow}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="flex-1 py-12">
          <div className="mb-12">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {step.number} · {step.eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-light tracking-tight text-foreground sm:text-4xl">
              {step.title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </div>

          <div className="space-y-12">
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
                onFlyerChange={(value) =>
                  form.setValue("flyerStorageId", value, { shouldDirty: true })
                }
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
                lists={lists}
                setLists={setLists}
                defaultApprovalMessage={defaultApprovalMessage}
              />
            )}
            {stepIndex === 6 && (
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
            {stepIndex === 7 && (
              <StepReview
                values={form.getValues()}
                acts={acts}
                lists={lists}
                customFields={customFields}
                onJump={goTo}
              />
            )}
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-border/60 py-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isFirst}
            onClick={back}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground/70">
            autosaved locally
          </span>
          <Button type="button" size="sm" onClick={handleAdvance} disabled={submitting}>
            {isLast ? (submitting ? "Publishing…" : "Publish") : "Continue"}
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
    <div className="space-y-10">
      <FormField
        control={form.control}
        name="name"
        rules={{ required: "Name is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Event name
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Pomodoro 14"
                value={field.value ?? ""}
                className="h-12 border-0 border-b border-border/80 px-0 text-2xl shadow-none focus-visible:border-foreground focus-visible:ring-0"
              />
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
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Secondary title{" "}
              <span className="normal-case text-muted-foreground/70">(optional)</span>
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Garden Party · with the Quartet"
                value={field.value ?? ""}
                className="h-11 border-0 border-b border-border/60 px-0 text-base shadow-none focus-visible:border-foreground focus-visible:ring-0"
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
          <FormItem>
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Description <span className="normal-case text-muted-foreground/70">(optional)</span>
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
      <EventActsEditor acts={acts} onChange={onActsChange} />
      <FormField
        control={form.control}
        name="hosts"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Hosts{" "}
              <span className="normal-case text-muted-foreground/70">
                (optional, comma-separated)
              </span>
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Marcel, Sam"
                value={field.value ?? ""}
                className="h-11 border-0 border-b border-border/60 px-0 text-base shadow-none focus-visible:border-foreground focus-visible:ring-0"
              />
            </FormControl>
            <FormDescription>Whoever guests should ask for at the door.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="productionCompany"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Production company{" "}
              <span className="normal-case text-muted-foreground/70">(optional)</span>
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="House of Pomodoro"
                value={field.value ?? ""}
                className="h-11 border-0 border-b border-border/60 px-0 text-base shadow-none focus-visible:border-foreground focus-visible:ring-0"
              />
            </FormControl>
            <FormDescription>
              Overrides host names in consent and SMS notifications.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
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
    <div className="space-y-10">
      <FormField
        control={form.control}
        name="location"
        rules={{ required: "Location is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Location
            </FormLabel>
            <FormControl>
              <Input
                {...field}
                placeholder="Bushwick · address sent on confirmation"
                value={field.value ?? ""}
                className="h-12 border-0 border-b border-border/80 px-0 text-xl shadow-none focus-visible:border-foreground focus-visible:ring-0"
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
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Date, time & timezone
            </FormLabel>
            <FormDescription>RSVPs close 24 hours after this start time.</FormDescription>
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
        name="maxAttendees"
        render={({ field }) => (
          <FormItem className="max-w-xs">
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Max attendees per RSVP
            </FormLabel>
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
            <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              RSVP status
            </FormLabel>
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
    <div className="space-y-10">
      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          control={form.control}
          name="themeBackgroundColor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Background
              </FormLabel>
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
              <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Ink (primary text)
              </FormLabel>
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
        className="rounded-md border border-border/60 p-8 transition-colors"
        style={{ background, color: text }}
      >
        <div className="text-[10px] uppercase tracking-[0.18em] opacity-60">Live preview</div>
        <div className="mt-3 text-3xl font-light tracking-tight">{eventName}</div>
        <div className="mt-2 text-sm opacity-70">The next night · doors at nine</div>
        <div className="mt-6 inline-flex items-center gap-2 border-b" style={{ borderColor: text }}>
          RSVP →
        </div>
      </div>

      <div>
        <div className="mb-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Event icon <span className="normal-case text-muted-foreground/70">(optional)</span>
        </div>
        <p className="mb-3 max-w-lg text-sm text-muted-foreground">
          Overrides the favicon and the navigation icon wherever custom theming is applied.
        </p>
        <EventIconUpload value={eventIconStorageId} onChange={onEventIconChange} />
      </div>
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
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
    <div className="space-y-10">
      <div>
        <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Preview
        </div>
        <p className="mb-3 max-w-lg text-sm text-muted-foreground">
          Approved-status screen and QR ticket inherit these colors from step 03.
        </p>
        <div
          className="rounded border border-border/40 p-6"
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
              <div className="text-xs uppercase tracking-[0.12em] opacity-60">Approved</div>
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
        <div className="mb-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Status & ticket image{" "}
          <span className="normal-case text-muted-foreground/70">(optional)</span>
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
              <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Guest link label{" "}
                <span className="normal-case text-muted-foreground/70">(optional)</span>
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
              <FormLabel className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Guest link URL{" "}
                <span className="normal-case text-muted-foreground/70">(optional)</span>
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
  defaultApprovalMessage,
  sendQrOnApproval,
  onSendQrOnApprovalChange,
}: {
  lists: ListRow[];
  setLists: React.Dispatch<React.SetStateAction<ListRow[]>>;
  defaultApprovalMessage: string;
  sendQrOnApproval: boolean;
  onSendQrOnApprovalChange: (value: boolean) => void;
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
      <label className="flex items-start gap-3 rounded border border-border/60 p-3">
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
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Approval message{" "}
              <span className="normal-case text-muted-foreground/70">(optional)</span>
            </label>
            <Textarea
              rows={2}
              placeholder={defaultApprovalMessage}
              value={list.approvalMessage}
              onChange={(event) => update(index, "approvalMessage", event.target.value)}
            />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
        + Add another list
      </Button>
    </div>
  );
}

// ─── Step 07 — Custom RSVP fields ───────────────────────────────

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
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h3 className="font-medium text-sm text-muted-foreground">PRIMARY FIELDS</h3>
        <p className="text-sm text-muted-foreground">
          Social fields and the &ldquo;invited by&rdquo; question for this event. Defaults come from
          workspace settings; override here if needed.
        </p>
        <PrimaryFieldConfigOverrideEditor
          value={primaryFieldConfigDraft}
          onChange={onPrimaryFieldConfigChange}
          useDefaults={usePrimaryFieldDefaults}
          onUseDefaultsChange={onUsePrimaryFieldDefaultsChange}
          workspaceDefaults={workspacePrimaryFieldDefaults}
        />
      </div>
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

// ─── Step 08 — Review ───────────────────────────────────────────

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
  const filteredLists = lists.filter((list) => list.listKey?.trim() && list.password?.trim());
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
      stepIndex: 5,
      key: "Lists",
      value: filteredLists.length ? filteredLists.map((list) => list.listKey).join(", ") : "—",
    },
    {
      stepIndex: 6,
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

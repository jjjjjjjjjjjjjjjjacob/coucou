"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  getDefaultApprovalMessage,
  sanitizeOptionalApprovalMessage,
} from "@coucou/sdk/shared/approval-messages";
import { useAction, useQuery } from "convex/react";
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type CustomFieldDef, CustomFieldsEditor } from "@/components/custom-fields-builder";
import { EventActsEditor } from "@/components/event-acts-editor";
import { EventDetailsSection } from "@/components/event-form-sections/event-details-section";
import { EventGuestPageSection } from "@/components/event-form-sections/event-guest-page-section";
import { EventLookSection } from "@/components/event-form-sections/event-look-section";
import { EventScheduleSection } from "@/components/event-form-sections/event-schedule-section";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  createTimestamp,
  extractDateFromTimestamp,
  extractTimeFromTimestamp,
} from "@/lib/date-utils";
import { sanitizeEventActsForSubmit } from "@/lib/event-metadata";
import {
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
  ListCredentialEdit,
} from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

type EventUpdatePatch = {
  name?: string;
  secondaryTitle?: string;
  description?: string;
  acts?: EventAct[];
  hosts?: string[];
  productionCompany?: string;
  location?: string;
  flyerUrl?: string;
  flyerStorageId?: Id<"_storage">;
  customIconStorageId?: Id<"_storage"> | null;
  guestPortalImageStorageId?: Id<"_storage">;
  guestPortalLinkLabel?: string;
  guestPortalLinkUrl?: string;
  eventDate?: number;
  eventTimezone?: string;
  maxAttendees?: number;
  status?: Event["status"];
  isFeatured?: boolean;
  customFields?: Event["customFields"];
  primaryFieldConfig?: Event["primaryFieldConfig"];
  themeBackgroundColor?: string;
  themeTextColor?: string;
  qrCodeColor?: string;
  sendQrOnApproval?: boolean;
};

export default function EditEventDialog({
  showTrigger = true,
  event,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: {
  steve?: string;
  showTrigger?: boolean;
  event: Event;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const workspaceScope = useWorkspaceScope();
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;
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
  const normalizedEventBackgroundColor =
    normalizeHexColorInput(event.themeBackgroundColor) ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
  const normalizedEventTextColor =
    normalizeHexColorInput(event.themeTextColor) ?? EVENT_THEME_DEFAULT_TEXT_COLOR;
  const form = useForm<EditEventFormData>({
    defaultValues: {
      name: event.name || "",
      secondaryTitle: event.secondaryTitle ?? "",
      description: event.description ?? "",
      hosts: (event.hosts || []).join(", "),
      productionCompany: event.productionCompany ?? "",
      location: event.location || "",
      flyerStorageId: event.flyerStorageId ?? null,
      customIconStorageId: event.customIconStorageId ?? null,
      guestPortalImageStorageId: event.guestPortalImageStorageId ?? null,
      guestPortalLinkLabel: event.guestPortalLinkLabel ?? "",
      guestPortalLinkUrl: event.guestPortalLinkUrl ?? "",
      eventDate: defaultDate,
      eventTime: defaultTime,
      eventTimezone: defaultTimezone,
      maxAttendees: event.maxAttendees ?? 1,
      status: event.status ?? "inactive",
      themeBackgroundColor: normalizedEventBackgroundColor,
      themeTextColor: normalizedEventTextColor,
      qrCodeColor: normalizeHexColorInput(event.qrCodeColor) ?? "#000000",
      sendQrOnApproval:
        typeof event.sendQrOnApproval === "boolean"
          ? event.sendQrOnApproval
          : typeof event.defersQrDelivery === "boolean"
            ? !event.defersQrDelivery
            : false,
    },
  });
  const [flyerStorageId, setFlyerStorageId] = React.useState<string | null>(
    event.flyerStorageId ?? null,
  );
  const [eventIconStorageId, setEventIconStorageId] = React.useState<string | null>(
    event.customIconStorageId ?? null,
  );
  const [guestPortalImageStorageId, setGuestPortalImageStorageId] = React.useState<string | null>(
    event.guestPortalImageStorageId ?? null,
  );
  const [saving, setSaving] = React.useState(false);
  const update = useAction(api.eventsNode.update);
  const creds = useQuery(
    api.credentials.getCredsForEvent,
    open && workspaceScope
      ? {
          eventId: event._id,
          ...workspaceScope.queryArgs,
        }
      : "skip",
  ) as CredentialResponse[] | undefined;
  const [lists, setLists] = React.useState<ListCredentialEdit[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>(
    event.customFields ?? [],
  );
  const [acts, setActs] = React.useState<EventAct[]>(event.acts ?? []);
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

  React.useEffect(() => {
    if (usePrimaryFieldDefaults) {
      setPrimaryFieldConfigDraft(workspacePrimaryFieldDefaultsDraft);
    }
  }, [usePrimaryFieldDefaults, workspacePrimaryFieldDefaultsDraft]);
  const getStoredPasswords = useAction(api.credentialsNode.getPasswordsForEvent);
  const [storedPasswords, setStoredPasswords] = React.useState<Map<string, string>>(new Map());
  const currentEventName = form.watch("name");
  const defaultApprovalMessage = getDefaultApprovalMessage(currentEventName);

  useEffect(() => {
    if (open && creds && workspaceScope) {
      setLists(
        creds.map((credential) => ({
          id: credential._id,
          listKey: credential.listKey,
          password: "",
          passwordEdited: false,
          requirePassword: credential.hasPassword ?? false,
          generateQR: credential.generateQR ?? false,
          // v(n+1) tri-state override mirrors the wizard's `sendQrOnApprovalOverride`:
          // undefined inherits the event toggle, true/false explicitly opt this list
          // in or out of immediate QR send.
          sendQrOnApprovalOverride:
            typeof credential.sendQrOnApproval === "boolean"
              ? credential.sendQrOnApproval
              : typeof credential.defersQrDelivery === "boolean"
                ? !credential.defersQrDelivery
                : undefined,
          approvalMessage: credential.approvalMessage ?? event.approvalMessage ?? "",
        })),
      );
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
        approvalMessage: "",
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
  const removeList = (index: number) =>
    setLists((array) => array.filter((_, position) => position !== index));

  const handleSubmit = async (values: EditEventFormData) => {
    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to update events");
        return;
      }
      setSaving(true);
      const patch: EventUpdatePatch = {};
      const trimmedName = values.name.trim();
      if (trimmedName && trimmedName !== event.name) {
        patch.name = trimmedName;
      }
      const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
      if (trimmedSecondaryTitle !== (event.secondaryTitle ?? "")) {
        patch.secondaryTitle = trimmedSecondaryTitle || undefined;
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
      const hostArray = values.hosts
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);
      if (JSON.stringify(hostArray) !== JSON.stringify(event.hosts)) {
        patch.hosts = hostArray;
      }
      const trimmedProductionCompany = values.productionCompany?.trim() ?? "";
      if (trimmedProductionCompany !== (event.productionCompany ?? "")) {
        patch.productionCompany = trimmedProductionCompany || undefined;
      }
      const trimmedLocation = values.location.trim();
      if (trimmedLocation && trimmedLocation !== event.location) {
        patch.location = trimmedLocation;
      }
      if ((flyerStorageId ?? undefined) !== (event.flyerStorageId ?? undefined)) {
        patch.flyerStorageId = (flyerStorageId as Id<"_storage">) ?? undefined;
      }
      if ((eventIconStorageId ?? null) !== (event.customIconStorageId ?? null)) {
        patch.customIconStorageId = (eventIconStorageId as Id<"_storage">) ?? null;
      }
      if ((guestPortalImageStorageId ?? null) !== (event.guestPortalImageStorageId ?? null)) {
        patch.guestPortalImageStorageId =
          (guestPortalImageStorageId as Id<"_storage">) ?? undefined;
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
      const nextQrCodeColor = normalizeHexColorInput(values.qrCodeColor) ?? "#000000";
      const normalizedEventQrCodeColor = normalizeHexColorInput(event.qrCodeColor) ?? "#000000";
      if (nextQrCodeColor !== normalizedEventQrCodeColor) {
        patch.qrCodeColor = nextQrCodeColor;
      }
      const trimmedGuestPortalLinkLabel = values.guestPortalLinkLabel?.trim() ?? "";
      const trimmedGuestPortalLinkUrl = values.guestPortalLinkUrl?.trim() ?? "";
      const hasLabel = trimmedGuestPortalLinkLabel.length > 0;
      const hasUrl = trimmedGuestPortalLinkUrl.length > 0;
      if ((hasLabel && !hasUrl) || (hasUrl && !hasLabel)) {
        toast.error("Provide both a guest link label and URL or leave both blank");
        setSaving(false);
        return;
      }
      if (hasLabel || hasUrl || event.guestPortalLinkLabel || event.guestPortalLinkUrl) {
        const previousLabel = event.guestPortalLinkLabel ?? "";
        const previousUrl = event.guestPortalLinkUrl ?? "";
        if (trimmedGuestPortalLinkLabel !== previousLabel) {
          patch.guestPortalLinkLabel = hasLabel ? trimmedGuestPortalLinkLabel : undefined;
        }
        if (trimmedGuestPortalLinkUrl !== previousUrl) {
          patch.guestPortalLinkUrl = hasUrl ? trimmedGuestPortalLinkUrl : undefined;
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
      const outgoingLists = lists.map((list) => {
        let password: string | undefined;
        if (!list.requirePassword) {
          password = "";
        } else if (list.passwordEdited && list.password.trim()) {
          password = list.password.trim();
        } else {
          password = undefined;
        }
        return {
          id: list.id as Id<"listCredentials"> | undefined,
          listKey: list.listKey.trim(),
          password,
          generateQR: list.generateQR,
          sendQrOnApproval: list.sendQrOnApprovalOverride,
          approvalMessage: sanitizeOptionalApprovalMessage(list.approvalMessage),
        };
      });
      patch.customFields = customFields.map((field) => ({
        key: field.key.trim(),
        label: field.label.trim(),
        placeholder: field.placeholder?.trim() ? field.placeholder.trim() : undefined,
        required: field.required ?? false,
        copyEnabled: field.copyEnabled ?? false,
        prependUrl: field.prependUrl?.trim() ? field.prependUrl.trim() : undefined,
        trimWhitespace: field.trimWhitespace !== false,
      }));
      const nextPrimaryFieldConfig = usePrimaryFieldDefaults
        ? undefined
        : draftToPrimaryFieldConfig(primaryFieldConfigDraft);
      const previousPrimaryFieldConfigKey = JSON.stringify(event.primaryFieldConfig ?? null);
      const nextPrimaryFieldConfigKey = JSON.stringify(nextPrimaryFieldConfig ?? null);
      if (previousPrimaryFieldConfigKey !== nextPrimaryFieldConfigKey) {
        patch.primaryFieldConfig = nextPrimaryFieldConfig;
      }
      await update({
        eventId: event._id,
        ...workspaceScope.queryArgs,
        patch,
        lists: outgoingLists,
      });
      toast.success("Event updated");
      setOpen(false);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!externalOpen && showTrigger && (
        <DialogTrigger asChild>
          <button className="text-sm px-2 py-1 border rounded">Edit</button>
        </DialogTrigger>
      )}
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[1200px] max-h-[calc(100vh-2rem)] gap-0 overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>
            Update event details, list access, and per-list approval messages.
          </DialogDescription>
        </DialogHeader>
        <div className="mx-auto w-full max-w-[1200px] px-5 pb-5 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <Tabs defaultValue="details">
                <TabsList className="bg-foreground/5 dark:bg-foreground/10">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="schedule">Schedule</TabsTrigger>
                  <TabsTrigger value="look">Look</TabsTrigger>
                  <TabsTrigger value="lineup">Lineup</TabsTrigger>
                  <TabsTrigger value="guest">Guest Page</TabsTrigger>
                  <TabsTrigger value="rsvp">RSVP &amp; Lists</TabsTrigger>
                </TabsList>

                <TabsContent value="details">
                  <EventDetailsSection form={form} />
                </TabsContent>

                <TabsContent value="schedule">
                  <EventScheduleSection form={form} />
                </TabsContent>

                <TabsContent value="look">
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
                  />
                </TabsContent>

                <TabsContent value="lineup">
                  <div className="rounded-lg border bg-card p-4">
                    <EventActsEditor acts={acts} onChange={setActs} />
                  </div>
                </TabsContent>

                <TabsContent value="guest">
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
                </TabsContent>

                <TabsContent value="rsvp" className="space-y-6">
                  <div className="space-y-3 rounded-lg border bg-card p-4">
                    <h4 className="font-medium text-sm text-muted-foreground">NOTIFICATIONS</h4>
                    <label className="flex items-start gap-3 rounded border border-border/60 p-3">
                      <Checkbox
                        checked={form.watch("sendQrOnApproval") ?? false}
                        onCheckedChange={(checked) =>
                          form.setValue("sendQrOnApproval", Boolean(checked), {
                            shouldDirty: true,
                          })
                        }
                        className="mt-0.5"
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">Send QR on approval</span>
                        <span className="block text-xs text-muted-foreground">
                          When on, approval texts include the QR code immediately. Default off —
                          most hosts send a manual blast closer to the event from the &quot;Send QR
                          Codes&quot; button on the event card.
                        </span>
                      </span>
                    </label>
                  </div>
                  <div className="space-y-3 rounded-lg border bg-card p-4">
                    <h4 className="font-medium text-sm text-muted-foreground">
                      ACCESS LISTS & PASSWORDS
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Leave a password blank for an open list — the first list with no password
                      receives RSVPs that skip the password step.
                    </p>
                    <div className="space-y-3">
                      {lists.map((listPassword, index) => (
                        <div
                          key={listPassword.id ?? index}
                          className="space-y-4 rounded border bg-muted/20 p-4"
                        >
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                            <div className="flex flex-col">
                              <label className="text-xs font-medium text-muted-foreground">
                                List Name
                              </label>
                              <Input
                                placeholder="e.g. vip, general, backstage"
                                value={listPassword.listKey}
                                onChange={(event) => setList(index, "listKey", event.target.value)}
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <label className="text-xs font-medium text-muted-foreground">
                                Password
                              </label>
                              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                <Checkbox
                                  id={`edit-require-password-${index}`}
                                  checked={listPassword.requirePassword}
                                  onCheckedChange={(checked) =>
                                    setList(index, "requirePassword", Boolean(checked))
                                  }
                                />
                                <label
                                  htmlFor={`edit-require-password-${index}`}
                                  className="text-sm text-muted-foreground leading-tight"
                                >
                                  Require password
                                </label>
                              </div>
                              {(() => {
                                const storedPassword = listPassword.id
                                  ? storedPasswords.get(listPassword.id)
                                  : undefined;
                                if (!listPassword.requirePassword) {
                                  return (
                                    <Input
                                      placeholder="Open list — no password"
                                      value=""
                                      disabled
                                    />
                                  );
                                }
                                if (storedPassword && !listPassword.passwordEdited) {
                                  return (
                                    <div className="flex items-center gap-2">
                                      <Input
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
                                    placeholder="Enter password"
                                    value={listPassword.password}
                                    onChange={(event) => setListPassword(index, event.target.value)}
                                  />
                                );
                              })()}
                            </div>
                            <div className="flex flex-col gap-2">
                              <label
                                htmlFor={`edit-generate-qr-${index}`}
                                className="text-xs font-medium text-muted-foreground"
                              >
                                QR Code Generation
                              </label>
                              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                <Checkbox
                                  id={`edit-generate-qr-${index}`}
                                  checked={listPassword.generateQR ?? false}
                                  onCheckedChange={(checked) =>
                                    setList(index, "generateQR", Boolean(checked))
                                  }
                                />
                                <label
                                  htmlFor={`edit-generate-qr-${index}`}
                                  className="text-sm text-muted-foreground leading-tight"
                                >
                                  Generate QR code for guests on this list
                                </label>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => removeList(index)}
                              className="h-10 lg:self-end"
                            >
                              Remove
                            </Button>
                          </div>
                          {listPassword.generateQR ? (
                            <div className="space-y-2">
                              <label
                                htmlFor={`edit-send-qr-on-approval-${index}`}
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Send QR on approval (this list)
                              </label>
                              <select
                                id={`edit-send-qr-on-approval-${index}`}
                                className="h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
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
                                  Inherit from event (
                                  {form.watch("sendQrOnApproval") ? "on" : "off"})
                                </option>
                                <option value="on">On (always send)</option>
                                <option value="off">Off (always defer)</option>
                              </select>
                            </div>
                          ) : null}
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">
                              Approval Message{" "}
                              <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <p className="text-xs text-muted-foreground">
                              Sent when a guest on this list is approved.
                            </p>
                            <Textarea
                              placeholder={defaultApprovalMessage}
                              value={listPassword.approvalMessage}
                              onChange={(event) =>
                                setList(index, "approvalMessage", event.target.value)
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addList}
                        className="w-full"
                      >
                        + Add Another List
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <h3 className="font-medium text-sm text-muted-foreground">PRIMARY FIELDS</h3>
                    <p className="text-sm text-muted-foreground">
                      Social fields and the &ldquo;invited by&rdquo; question for this event.
                      Defaults come from workspace settings; override here if needed.
                    </p>
                    <PrimaryFieldConfigOverrideEditor
                      value={primaryFieldConfigDraft}
                      onChange={setPrimaryFieldConfigDraft}
                      useDefaults={usePrimaryFieldDefaults}
                      onUseDefaultsChange={setUsePrimaryFieldDefaults}
                      workspaceDefaults={workspacePrimaryFieldDefaultsDraft}
                    />
                  </div>
                  <CustomFieldsEditor
                    initial={event.customFields ?? []}
                    onChange={setCustomFields}
                    reservedKeys={primaryFieldConfigDraft.socialPlatforms.map(
                      (platform) => platform.platformKey,
                    )}
                  />
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

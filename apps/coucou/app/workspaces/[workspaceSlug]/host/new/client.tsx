"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { HostEventForm } from "@/components/host-event-form";
import {
  CustomFieldsEditor,
  type CustomFieldDef,
} from "@/components/custom-fields-builder";
import { createTimestamp } from "@/lib/date-utils";
import { toast } from "sonner";
import { ApplicationError, EventFormData } from "@/lib/types";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  isValidHexColor,
  normalizeHexColorInput,
} from "@/lib/event-theme";
import { Id } from "@convex/_generated/dataModel";
import {
  getDefaultApprovalMessage,
  sanitizeOptionalApprovalMessage,
} from "@coucou/sdk/shared/approval-messages";
import {
  useWorkspaceOperationPath,
  useWorkspaceScope,
} from "@/lib/use-workspace-scope";

type ListRow = {
  listKey: string;
  password: string;
  shouldGenerateQrCode: boolean;
  approvalMessage: string;
};

function validateCreate(values: EventFormData, lists: ListRow[]): string[] {
  const validationErrors: string[] = [];
  if (!values.name?.trim()) validationErrors.push("Name is required");
  if (!values.hosts?.trim()) validationErrors.push("Hosts are required");
  if (!values.location?.trim()) validationErrors.push("Location is required");
  if (!values.eventDate) validationErrors.push("Event date is required");
  const filteredLists = lists.filter(
    (list) => list.listKey?.trim() && list.password?.trim(),
  );
  if (filteredLists.length === 0) {
    validationErrors.push("Add at least one list/password");
  }
  if (
    values.themeBackgroundColor &&
    !isValidHexColor(values.themeBackgroundColor)
  ) {
    validationErrors.push(
      "Background color must be a valid hex color (e.g. #FFFFFF)",
    );
  }
  if (values.themeTextColor && !isValidHexColor(values.themeTextColor)) {
    validationErrors.push(
      "Text color must be a valid hex color (e.g. #EF4444)",
    );
  }
  return validationErrors;
}

export default function NewEventClient() {
  const router = useRouter();
  const workspaceScope = useWorkspaceScope();
  const eventsPath = useWorkspaceOperationPath("host", "events?created=1");
  const create = useAction(api.eventsNode.create);
  const form = useForm<EventFormData>({
    defaultValues: {
      name: "",
      secondaryTitle: "",
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
      themeBackgroundColor: EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
      themeTextColor: EVENT_THEME_DEFAULT_TEXT_COLOR,
      qrCodeColor: "#000000",
    },
  });

  const flyerStorageId = form.watch("flyerStorageId") ?? null;
  const eventIconStorageId = form.watch("customIconStorageId") ?? null;
  const guestPortalImageStorageId =
    form.watch("guestPortalImageStorageId") ?? null;
  const eventName = form.watch("name");
  const defaultApprovalMessage = getDefaultApprovalMessage(eventName);
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

  const addList = () =>
    setLists((current) => [
      ...current,
      {
        listKey: "",
        password: "",
        shouldGenerateQrCode: false,
        approvalMessage: "",
      },
    ]);
  const setList = <Key extends keyof ListRow>(
    index: number,
    key: Key,
    value: ListRow[Key],
  ) => {
    setLists((current) =>
      current.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  };
  const removeList = (index: number) =>
    setLists((current) => current.filter((_, idx) => idx !== index));

  const onSubmit = async (values: EventFormData) => {
    const validationErrors = validateCreate(values, lists);
    if (validationErrors.length) {
      validationErrors.forEach((message) => toast.error(message));
      return;
    }
    const trimmedGuestPortalLinkLabel =
      values.guestPortalLinkLabel?.trim() ?? "";
    const trimmedGuestPortalLinkUrl =
      values.guestPortalLinkUrl?.trim() ?? "";
    const hasLabel = trimmedGuestPortalLinkLabel.length > 0;
    const hasUrl = trimmedGuestPortalLinkUrl.length > 0;
    if ((hasLabel && !hasUrl) || (hasUrl && !hasLabel)) {
      toast.error(
        "Provide both a guest link label and URL or leave both blank",
      );
      return;
    }

    try {
      if (!workspaceScope) {
        toast.error("Workspace scope is required to create events");
        return;
      }
      const hostNames = values.hosts
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      const timestamp = createTimestamp(
        values.eventDate,
        values.eventTime,
        values.eventTimezone,
      );
      const listsFiltered = lists
        .map((list) => ({
          listKey: list.listKey.trim(),
          password: list.password.trim(),
          generateQR: list.shouldGenerateQrCode,
          approvalMessage: sanitizeOptionalApprovalMessage(list.approvalMessage),
        }))
        .filter((list) => list.listKey && list.password);
      const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
      const trimmedProductionCompany = values.productionCompany?.trim() ?? "";
      const normalizedThemeBackgroundColor =
        normalizeHexColorInput(values.themeBackgroundColor) ??
        EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
      const normalizedThemeTextColor =
        normalizeHexColorInput(values.themeTextColor) ??
        EVENT_THEME_DEFAULT_TEXT_COLOR;
      await create({
        name: values.name.trim(),
        secondaryTitle: trimmedSecondaryTitle || undefined,
        hosts: hostNames,
        productionCompany: trimmedProductionCompany || undefined,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId ? (values.flyerStorageId as unknown as Id<"_storage"> | undefined) : undefined,
        customIconStorageId: values.customIconStorageId
          ? (values.customIconStorageId as unknown as Id<"_storage"> | null)
          : null,
        guestPortalImageStorageId: values.guestPortalImageStorageId
          ? (values.guestPortalImageStorageId as unknown as Id<"_storage">)
          : undefined,
        guestPortalLinkLabel: hasLabel ? trimmedGuestPortalLinkLabel : undefined,
        guestPortalLinkUrl: hasUrl ? trimmedGuestPortalLinkUrl : undefined,
        eventDate: timestamp,
        eventTimezone: values.eventTimezone,
        maxAttendees: values.maxAttendees,
        lists: listsFiltered,
        customFields: customFields.map((field) => ({
          key: field.key.trim(),
          label: field.label.trim(),
          placeholder: field.placeholder?.trim()
            ? field.placeholder.trim()
            : undefined,
          required: field.required ?? false,
          copyEnabled: field.copyEnabled ?? false,
          prependUrl: field.prependUrl?.trim()
            ? field.prependUrl.trim()
            : undefined,
          trimWhitespace: field.trimWhitespace !== false,
        })),
        themeBackgroundColor: normalizedThemeBackgroundColor,
        themeTextColor: normalizedThemeTextColor,
        qrCodeColor: normalizeHexColorInput(values.qrCodeColor) || undefined,
        ...workspaceScope.queryArgs,
      });
      toast.success("Event created");
      router.replace(eventsPath);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to create event");
    }
  };

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Event</h2>
          <p className="text-muted-foreground">
            Set up a new event with custom fields and guest lists
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 sm:px-6 lg:px-8">
        <HostEventForm
          form={form}
          onSubmit={onSubmit}
          submitLabel="Create Event"
        submittingLabel="Creating Event..."
        isSubmitting={form.formState.isSubmitting}
        flyerStorageId={flyerStorageId}
        onFlyerChange={(value) =>
          form.setValue("flyerStorageId", value, { shouldDirty: true })
        }
        eventIconStorageId={eventIconStorageId}
        onEventIconChange={(value) =>
          form.setValue("customIconStorageId", value, { shouldDirty: true })
        }
        guestPortalImageStorageId={guestPortalImageStorageId}
        onGuestPortalImageChange={(value) =>
          form.setValue("guestPortalImageStorageId", value, {
            shouldDirty: true,
          })
        }
        listsSection={
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground">
                ACCESS LISTS & PASSWORDS
              </h3>
              <div className="space-y-3">
                {lists.map((list, idx) => (
                  <div
                    key={idx}
                    className="space-y-4 rounded-lg border bg-background p-4"
                  >
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-muted-foreground">
                          List Name
                        </label>
                        <Input
                          placeholder="e.g. vip, general, backstage"
                          value={list.listKey}
                          onChange={(event) =>
                            setList(idx, "listKey", event.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-muted-foreground">
                          Password
                        </label>
                        <Input
                          placeholder="Enter secure password"
                          value={list.password}
                          onChange={(event) =>
                            setList(idx, "password", event.target.value)
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor={`generate-qr-${idx}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          QR Code Generation
                        </label>
                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                          <Checkbox
                            id={`generate-qr-${idx}`}
                            checked={list.shouldGenerateQrCode}
                            onCheckedChange={(checked) =>
                              setList(
                                idx,
                                "shouldGenerateQrCode",
                                Boolean(checked),
                              )
                            }
                          />
                          <label
                            htmlFor={`generate-qr-${idx}`}
                            className="text-sm text-muted-foreground leading-tight"
                          >
                            Generate QR code for guests on this list
                          </label>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => removeList(idx)}
                        className="h-10 lg:self-end"
                      >
                        Remove
                      </Button>
                    </div>
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
                        value={list.approvalMessage}
                        onChange={(event) =>
                          setList(idx, "approvalMessage", event.target.value)
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
          }
          customFieldsSection={
            <CustomFieldsEditor onChange={setCustomFields} />
          }
        />
      </div>
    </div>
  );
}

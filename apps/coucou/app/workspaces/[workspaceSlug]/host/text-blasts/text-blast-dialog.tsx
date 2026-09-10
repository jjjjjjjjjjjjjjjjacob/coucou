"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ContactAudience } from "@convex/lib/contactValidators";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ContactAudiencePicker } from "@/components/guests/contact-audience-picker";
import { ContactAudiencePreview } from "@/components/guests/contact-audience-preview";
import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  messageContainsQrCodeUrlVariable,
  sortTextBlastMessageEventsNewestFirst,
} from "@/lib/text-blast-message";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

export interface TextBlastInitialTargeting {
  contactIds: Id<"workspaceContacts">[];
}
interface TextBlastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  blastId?: Id<"textBlasts"> | null;
  mode?: "full" | "replyActions";
  initialTargeting?: TextBlastInitialTargeting;
}
interface ReplyActionRow {
  key: string;
  replyCode: string;
  targetEventId: Id<"events"> | "";
  targetListKey: string;
  isEnabled: boolean;
}

const EVENT_SPECIFIC_MESSAGE_VARIABLES = [
  "eventName",
  "eventDate",
  "eventLocation",
  "qrCodeUrl",
] as const;
const MESSAGE_EVENT_REQUIRED_REASON =
  "Choose a message event above to use event details or a QR code.";

export default function TextBlastDialog(props: TextBlastDialogProps) {
  return props.isOpen ? <ContactBlastComposer {...props} /> : null;
}

function ContactBlastComposer({
  onClose,
  blastId: initialBlastId,
  initialTargeting,
  mode = "full",
}: TextBlastDialogProps) {
  const workspace = useWorkspaceScope();
  const [blastId, setBlastId] = useState(initialBlastId ?? undefined);
  const [loaded, setLoaded] = useState(!initialBlastId);
  const [step, setStep] = useState(mode === "replyActions" ? 2 : 1);
  const [audience, setAudience] = useState<ContactAudience | null>(
    initialTargeting?.contactIds.length
      ? { type: "contacts", contactIds: initialTargeting.contactIds }
      : null,
  );
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [messageEventId, setMessageEventId] = useState<Id<"events"> | "">("");
  const [includeQrCodes, setIncludeQrCodes] = useState(false);
  const [replyActions, setReplyActions] = useState<ReplyActionRow[]>([]);
  const [previewState, setPreviewState] = useState<{
    id: Id<"contactAudiencePreviews">;
    key: string;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const existingQuery = useQuery({
    ...convexQuery(api.textBlasts.getBlastById, {
      ...workspace?.queryArgs,
      blastId: initialBlastId as Id<"textBlasts">,
    }),
    enabled: Boolean(workspace && initialBlastId),
  });
  const eventsQuery = useQuery({
    ...convexQuery(api.events.listAll, workspace?.queryArgs ?? {}),
    enabled: Boolean(workspace),
  });
  const targetsQuery = useQuery({
    ...convexQuery(api.textBlasts.getReplyActionTargetOptions, workspace?.queryArgs ?? {}),
    enabled: Boolean(workspace),
  });
  const messageEventOptions = useMemo(
    () => sortTextBlastMessageEventsNewestFirst(eventsQuery.data ?? []),
    [eventsQuery.data],
  );
  const effectiveQrCodes = includeQrCodes || messageContainsQrCodeUrlVariable(message);
  const previewKey = JSON.stringify({
    audience,
    messageEventId,
    includeQrCodes: effectiveQrCodes,
    replyActions: replyActions.map(({ key: _key, ...row }) => row),
  });
  const previewId = previewState?.key === previewKey ? previewState.id : undefined;
  const previewQuery = useQuery({
    ...convexQuery(api.contactAudiences.get, {
      ...workspace?.queryArgs,
      workspaceSlug: workspace?.workspaceSlug ?? "",
      previewId: previewId as Id<"contactAudiencePreviews">,
    }),
    enabled: Boolean(workspace && previewId),
  });
  const retrying = existingQuery.data?.status === "failed" && Boolean(existingQuery.data.audience);
  const prepareAudience = useMutation(api.contactAudiences.prepare);
  const saveDraft = useMutation(api.contactBlasts.save);
  const sendBlast = useMutation(api.contactBlasts.send);
  const updateReplyActions = useMutation(api.textBlasts.updateReplyActions);

  useEffect(() => {
    const blast = existingQuery.data;
    if (!blast || loaded) return;
    setName(blast.name);
    setMessage(blast.message);
    setMessageEventId(blast.eventId ?? "");
    setIncludeQrCodes(blast.includeQrCodes ?? false);
    setAudience(
      blast.audience ?? {
        type: "legacy_events",
        eventIds: blast.targetEventIds?.length
          ? blast.targetEventIds
          : blast.eventId
            ? [blast.eventId]
            : [],
        targetLists: blast.targetLists,
        recipientFilter: blast.recipientFilter,
        recipientHistoryFilter: blast.recipientHistoryFilter,
        selectedRsvpIds: blast.selectedRsvpIds,
      },
    );
    setReplyActions(
      blast.replyActions.map((action) => ({
        key: action._id,
        replyCode: action.replyCode,
        targetEventId: action.targetEventId,
        targetListKey: action.targetListKey,
        isEnabled: action.isEnabled,
      })),
    );
    if (blast.status === "failed" && blast.audience && blast.audiencePreviewId) {
      setPreviewState({
        id: blast.audiencePreviewId,
        key: JSON.stringify({
          audience: blast.audience,
          messageEventId: blast.eventId ?? "",
          includeQrCodes: blast.includeQrCodes ?? false,
          replyActions: blast.replyActions.map((action) => ({
            replyCode: action.replyCode,
            targetEventId: action.targetEventId,
            targetListKey: action.targetListKey,
            isEnabled: action.isEnabled,
          })),
        }),
      });
      setStep(3);
    }
    setLoaded(true);
  }, [existingQuery.data, loaded]);

  const resolveReplyActions = () =>
    replyActions.map((row) => {
      if (!row.replyCode.trim() || !row.targetEventId || !row.targetListKey)
        throw new Error("Complete each reply code, event, and list.");
      return {
        replyCode: row.replyCode,
        targetEventId: row.targetEventId,
        targetListKey: row.targetListKey,
        isEnabled: row.isEnabled,
      };
    });
  const withBusy = async (operation: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await operation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The text blast could not be updated");
    } finally {
      setIsBusy(false);
    }
  };
  const save = async (): Promise<Id<"textBlasts">> => {
    if (!workspace || !audience) throw new Error("Select an audience first");
    const identifier = await saveDraft({
      ...workspace.queryArgs,
      blastId,
      name,
      message,
      audience,
      previewId,
      messageEventId: messageEventId || undefined,
      includeQrCodes: effectiveQrCodes,
      replyActions: resolveReplyActions(),
    });
    setBlastId(identifier);
    return identifier;
  };
  const review = () =>
    withBusy(async () => {
      if (retrying) {
        await previewQuery.refetch();
        return;
      }
      if (!workspace || !audience) throw new Error("Select contacts first");
      if (!name.trim() || !message.trim()) throw new Error("Enter a blast name and message");
      resolveReplyActions();
      const identifier = await prepareAudience({
        blastId,
        replyActions: resolveReplyActions(),
        ...workspace.queryArgs,
        audience,
        messageEventId: messageEventId || undefined,
        includeQrCodes: effectiveQrCodes,
      });
      setPreviewState({ id: identifier, key: previewKey });
      setStep(3);
    });
  const preview = previewQuery.data;
  const ready = previewId && preview?.status === "ready" && preview.eligibleCount > 0;
  const updateReplyRow = (key: string, patch: Partial<ReplyActionRow>) =>
    setReplyActions((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isBusy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "replyActions"
              ? "Reply actions"
              : blastId
                ? "Edit text blast"
                : "New text blast"}
          </DialogTitle>
          <DialogDescription>
            Choose contacts, write your message, and review who will receive it.
          </DialogDescription>
        </DialogHeader>
        {mode === "full" ? (
          <nav
            aria-label="Text blast steps"
            className="flex gap-5 border-b border-[var(--border-subtle)] pb-3 text-sm"
          >
            {["Who", "What", "Review"].map((label, index) => (
              <span
                key={label}
                aria-current={step === index + 1 ? "step" : undefined}
                className={step === index + 1 ? "font-semibold" : "text-[var(--text-secondary)]"}
              >
                {index + 1}. {label}
              </span>
            ))}
          </nav>
        ) : null}
        {existingQuery.error ? (
          <div role="alert">
            Could not load the draft.{" "}
            <Button variant="outline" onClick={() => void existingQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : !loaded ? (
          <p role="status">Loading draft…</p>
        ) : (
          <>
            {step === 1 ? (
              <ContactAudiencePicker audience={audience} onChange={setAudience} />
            ) : null}
            {step === 2 ? (
              <div className="space-y-5">
                {mode === "full" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="contact-blast-name">Blast name</Label>
                      <Input
                        id="contact-blast-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Message event</Label>
                      <Select
                        value={messageEventId}
                        onValueChange={(value) => {
                          setMessageEventId(value as Id<"events"> | "");
                          if (!value) setIncludeQrCodes(false);
                        }}
                      >
                        <SelectOption value="">General workspace message</SelectOption>
                        {messageEventOptions.map((event) => (
                          <SelectOption key={event._id} value={event._id}>
                            {event.name}
                          </SelectOption>
                        ))}
                      </Select>
                      <p className="text-xs text-[var(--text-secondary)]">
                        An event supplies message details and tickets. It does not change the
                        selected audience.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-blast-message">Message</Label>
                      <Textarea
                        id="contact-blast-message"
                        rows={6}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                      />
                      <MessageTemplateVariableButtons
                        message={message}
                        onMessageChange={setMessage}
                        disabledVariableNames={
                          messageEventId ? undefined : EVENT_SPECIFIC_MESSAGE_VARIABLES
                        }
                        disabledVariableReason={MESSAGE_EVENT_REQUIRED_REASON}
                      />
                      <p className="text-xs tabular-nums text-[var(--text-secondary)]">
                        {message.length} characters before personalization and branding
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={effectiveQrCodes}
                        disabled={!messageEventId || messageContainsQrCodeUrlVariable(message)}
                        onCheckedChange={(checked) => setIncludeQrCodes(checked === true)}
                      />
                      Include this event’s QR ticket. Contacts without an eligible ticket will be
                      excluded.
                    </label>
                  </>
                ) : null}
                <section className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Reply actions</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setReplyActions((rows) => [
                          ...rows,
                          {
                            key: crypto.randomUUID(),
                            replyCode: "",
                            targetEventId: "",
                            targetListKey: "",
                            isEnabled: true,
                          },
                        ])
                      }
                    >
                      Add reply action
                    </Button>
                  </div>
                  {replyActions.map((row) => (
                    <div key={row.key} className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label="Reply code"
                        className="w-32"
                        value={row.replyCode}
                        onChange={(event) =>
                          updateReplyRow(row.key, { replyCode: event.target.value })
                        }
                      />
                      <Select
                        value={row.targetEventId}
                        onValueChange={(value) =>
                          updateReplyRow(row.key, {
                            targetEventId: value as Id<"events">,
                            targetListKey: "",
                          })
                        }
                      >
                        <SelectOption value="">Destination event</SelectOption>
                        {(targetsQuery.data ?? []).map((event) => (
                          <SelectOption key={event.eventId} value={event.eventId}>
                            {event.eventName}
                          </SelectOption>
                        ))}
                      </Select>
                      <Select
                        value={row.targetListKey}
                        onValueChange={(value) => updateReplyRow(row.key, { targetListKey: value })}
                      >
                        <SelectOption value="">Destination list</SelectOption>
                        {(targetsQuery.data ?? [])
                          .find((event) => event.eventId === row.targetEventId)
                          ?.lists.map((list) => (
                            <SelectOption key={list.listKey} value={list.listKey}>
                              {list.listKey}
                            </SelectOption>
                          ))}
                      </Select>
                      <label className="flex gap-2 text-sm">
                        <Checkbox
                          checked={row.isEnabled}
                          onCheckedChange={(checked) =>
                            updateReplyRow(row.key, { isEnabled: checked === true })
                          }
                        />
                        Enabled
                      </label>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setReplyActions((rows) => rows.filter((action) => action.key !== row.key))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </section>
              </div>
            ) : null}
            {step === 3 ? (
              <div className="space-y-4">
                <h3 className="font-medium">{name}</h3>
                <div className="whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] p-4">
                  {message}
                </div>
                {previewQuery.error || preview?.status === "failed" ? (
                  <div role="alert">
                    {previewQuery.error?.message ?? preview?.error}
                    <Button variant="outline" onClick={() => void review()}>
                      {retrying ? "Retry loading reviewed audience" : "Prepare again"}
                    </Button>
                  </div>
                ) : !preview || preview.status === "building" ? (
                  <p role="status">
                    Preparing audience… {preview?.processedCount ?? 0} contacts checked.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="font-medium tabular-nums">
                      {preview.eligibleCount} recipients · {preview.excludedCount} excluded
                    </p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      This reviewed audience is saved for sending. Contacts who revoke consent or
                      opt out before delivery will be excluded.
                    </p>
                    {previewId ? (
                      <ContactAudiencePreview key={previewId} previewId={previewId} />
                    ) : null}
                    {Object.entries(preview.exclusionCounts ?? {}).map(([reason, count]) => (
                      <p className="text-sm" key={reason}>
                        {count}{" "}
                        {(
                          {
                            missing_phone: "without a valid phone",
                            no_consent: "without SMS consent",
                            opted_out: "opted out",
                            missing_ticket: "without an eligible ticket",
                          } as Record<string, string>
                        )[reason] ?? reason}
                      </p>
                    ))}
                    {preview.eligibleCount === 0 ? (
                      <p>No eligible contacts. Go back to adjust your selection.</p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={isBusy} onClick={onClose}>
            Cancel
          </Button>
          {mode === "replyActions" ? (
            <Button
              disabled={isBusy || !loaded}
              onClick={() =>
                void withBusy(async () => {
                  if (!workspace || !blastId) return;
                  await updateReplyActions({
                    blastId,
                    ...workspace.queryArgs,
                    replyActions: resolveReplyActions(),
                  });
                  toast.success("Reply actions saved");
                  onClose();
                })
              }
            >
              Save reply actions
            </Button>
          ) : (
            <>
              {step > 1 && !retrying ? (
                <Button variant="outline" disabled={isBusy} onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={isBusy || !loaded || !audience || !name.trim() || retrying}
                onClick={() =>
                  void withBusy(async () => {
                    await save();
                    toast.success("Draft saved");
                    onClose();
                  })
                }
              >
                Save draft
              </Button>
              {step === 1 ? (
                <Button disabled={!audience || !loaded} onClick={() => setStep(2)}>
                  Continue
                </Button>
              ) : step === 2 ? (
                <Button disabled={isBusy || !audience} onClick={() => void review()}>
                  Review audience
                </Button>
              ) : (
                <Button
                  disabled={isBusy || !ready}
                  onClick={() =>
                    void withBusy(async () => {
                      if (!workspace || !ready) return;
                      const identifier = retrying && blastId ? blastId : await save();
                      await sendBlast({ ...workspace.queryArgs, blastId: identifier });
                      toast.success("Text blast queued");
                      onClose();
                    })
                  }
                >
                  Send to {preview?.eligibleCount ?? 0} contacts
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

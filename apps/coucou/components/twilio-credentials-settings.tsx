"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Check, KeyRound, Save, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { runMutationWithToast } from "@/lib/toast-mutation";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

type EventOption = {
  event: {
    _id: Id<"events">;
    name: string;
    secondaryTitle?: string;
    eventDate: number;
  };
};

type CredentialScopeValue = "workspace" | `event:${string}`;

interface TwilioCredentialsSettingsProps {
  workspaceSlug: string;
  canWrite: boolean;
}

function getEventIdFromScope(scopeValue: CredentialScopeValue): Id<"events"> | undefined {
  if (scopeValue === "workspace") {
    return undefined;
  }
  return scopeValue.slice("event:".length) as Id<"events">;
}

function formatEventOptionLabel(eventOption: EventOption): string {
  const title = eventOption.event.secondaryTitle
    ? `${eventOption.event.name} — ${eventOption.event.secondaryTitle}`
    : eventOption.event.name;
  return `${title} · ${new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(eventOption.event.eventDate)}`;
}

export function TwilioCredentialsSettings({
  workspaceSlug,
  canWrite,
}: TwilioCredentialsSettingsProps) {
  const workspaceScope = useWorkspaceScope();
  const credentialConfigurations = useQuery(
    api.twilioCredentials.listForWorkspace,
    canWrite ? { workspaceSlug } : "skip",
  );
  const eventOptions = useQuery(
    api.events.listAllWithFlyerUrls,
    canWrite && workspaceScope ? workspaceScope.queryArgs : "skip",
  ) as EventOption[] | undefined;
  const upsertCredentials = useMutation(api.twilioCredentials.upsert);
  const removeCredentials = useMutation(api.twilioCredentials.remove);
  const [scopeValue, setScopeValue] = useState<CredentialScopeValue>("workspace");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromPhoneNumber, setFromPhoneNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const selectedEventId = getEventIdFromScope(scopeValue);
  const selectedEvent = useMemo(
    () => eventOptions?.find((eventOption) => eventOption.event._id === selectedEventId)?.event,
    [eventOptions, selectedEventId],
  );
  const selectedCredential = selectedEventId
    ? credentialConfigurations?.events.find(
        (configuration) => configuration.eventId === selectedEventId,
      )
    : credentialConfigurations?.workspace;
  const effectiveSource = selectedCredential
    ? selectedEventId
      ? "event"
      : "workspace"
    : selectedEventId && credentialConfigurations?.workspace
      ? "workspace"
      : "global";

  function handleScopeChange(value: string) {
    setScopeValue(value as CredentialScopeValue);
    setAccountSid("");
    setAuthToken("");
    setFromPhoneNumber("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await runMutationWithToast(
        () =>
          upsertCredentials({
            workspaceSlug,
            eventId: selectedEventId,
            accountSid,
            authToken,
            fromPhoneNumber,
          }),
        {
          loading: "Saving Twilio credentials...",
          success: selectedEventId
            ? "Event Twilio override saved"
            : "Organizer Twilio account saved",
        },
      );
      setAccountSid("");
      setAuthToken("");
      setFromPhoneNumber("");
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsRemoving(true);
    try {
      await runMutationWithToast(
        () => removeCredentials({ workspaceSlug, eventId: selectedEventId }),
        {
          loading: "Removing Twilio credentials...",
          success: selectedEventId
            ? "Event override removed; inherited account restored"
            : "Organizer account removed; Coucou fallback restored",
        },
      );
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              Twilio delivery
            </CardTitle>
            <CardDescription>
              Use an organizer account by default, then override it for individual events when
              needed.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <ShieldCheck className="size-3" />
            Auth tokens stay server-side
          </Badge>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-3" aria-label="Twilio account precedence">
          {[
            { key: "event", label: "Event override", detail: "Highest priority" },
            { key: "workspace", label: "Organizer account", detail: "Workspace default" },
            { key: "global", label: "Coucou fallback", detail: "Always last" },
          ].map((source) => (
            <div
              key={source.key}
              className={`rounded-md border px-3 py-2 ${
                effectiveSource === source.key
                  ? "border-primary/40 bg-primary/5 text-foreground"
                  : "bg-muted/25 text-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {effectiveSource === source.key ? <Check className="size-3" /> : null}
                {source.label}
              </div>
              <div className="mt-0.5 opacity-75">{source.detail}</div>
            </div>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {!canWrite ? (
          <p className="text-sm text-muted-foreground">
            Dashboard write access is required to manage delivery credentials.
          </p>
        ) : (
          <form className="space-y-5" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="twilio-credential-scope">Apply credentials to</Label>
              <Select
                id="twilio-credential-scope"
                value={scopeValue}
                onValueChange={handleScopeChange}
                disabled={isSaving || isRemoving}
              >
                <SelectOption value="workspace">All organizer events (default)</SelectOption>
                {(eventOptions ?? [])
                  .slice()
                  .sort(
                    (firstEvent, secondEvent) =>
                      secondEvent.event.eventDate - firstEvent.event.eventDate,
                  )
                  .map((eventOption) => (
                    <SelectOption
                      key={eventOption.event._id}
                      value={`event:${eventOption.event._id}`}
                    >
                      {formatEventOptionLabel(eventOption)}
                    </SelectOption>
                  ))}
              </Select>
            </div>

            <div className="rounded-md border bg-muted/25 px-3 py-2.5 text-sm">
              {selectedCredential ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {selectedEventId
                        ? "Event override configured"
                        : "Organizer account configured"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCredential.maskedAccountSid} · {selectedCredential.fromPhoneNumber}
                    </p>
                  </div>
                  <Badge>Active</Badge>
                </div>
              ) : (
                <div>
                  <p className="font-medium">
                    {effectiveSource === "workspace"
                      ? "Using the organizer account"
                      : "Using Coucou’s global account"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedEvent
                      ? `${selectedEvent.name} has no event-specific override.`
                      : "Save credentials here to replace the global fallback for this organizer."}
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="twilio-account-sid">Account SID</Label>
                <Input
                  id="twilio-account-sid"
                  value={accountSid}
                  onChange={(event) => setAccountSid(event.target.value)}
                  placeholder="AC••••••••••••••••••••••••••••••••"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isSaving || isRemoving}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="twilio-from-phone-number">Sender phone number</Label>
                <Input
                  id="twilio-from-phone-number"
                  value={fromPhoneNumber}
                  onChange={(event) => setFromPhoneNumber(event.target.value)}
                  placeholder="+15551234567"
                  inputMode="tel"
                  autoComplete="tel"
                  disabled={isSaving || isRemoving}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="twilio-auth-token">Auth Token</Label>
              <Input
                id="twilio-auth-token"
                type="password"
                value={authToken}
                onChange={(event) => setAuthToken(event.target.value)}
                placeholder="Enter a new token to save or replace credentials"
                autoComplete="new-password"
                spellCheck={false}
                disabled={isSaving || isRemoving}
                required
              />
              <p className="text-xs text-muted-foreground">
                Coucou uses this token to send messages and verify Twilio webhook signatures. It is
                never returned to the dashboard after you save it.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isSaving || isRemoving}>
                <Save className="size-4" />
                {selectedCredential ? "Replace credentials" : "Save credentials"}
              </Button>
              {selectedCredential ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" disabled={isSaving || isRemoving}>
                      <Trash2 className="size-4" />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove these Twilio credentials?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {selectedEventId
                          ? "This event will immediately inherit the organizer account, or Coucou’s global fallback if none is set."
                          : "All events without their own override will immediately use Coucou’s global fallback."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void handleRemove()}>
                        Remove credentials
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

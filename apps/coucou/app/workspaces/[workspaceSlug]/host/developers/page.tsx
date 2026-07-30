"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { WEBHOOK_EVENT_TYPES } from "@coucou/sdk/api-v1";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  BookOpen,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageCard } from "@/components/ui/page-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { buildWorkspaceOperationPath } from "@/lib/workspace-config";

const API_KEY_SCOPES = [
  { scope: "events:read" as const, label: "Read events" },
  { scope: "events:write" as const, label: "Write events" },
  { scope: "rsvps:read" as const, label: "Read RSVPs" },
  { scope: "rsvps:write" as const, label: "Write RSVPs" },
];

type ApiClientScope = (typeof API_KEY_SCOPES)[number]["scope"];
type PartnerEventAccessMode = "all" | "selected";

interface PartnerEventOption {
  eventId: Id<"events">;
  label: string;
}

function EventAccessFields({
  eventAccessMode,
  allowedEventIds,
  eventOptions,
  onEventAccessModeChange,
  onAllowedEventIdsChange,
}: {
  eventAccessMode: PartnerEventAccessMode;
  allowedEventIds: Id<"events">[];
  eventOptions: PartnerEventOption[];
  onEventAccessModeChange: (eventAccessMode: PartnerEventAccessMode) => void;
  onAllowedEventIdsChange: (allowedEventIds: Id<"events">[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Event access</Label>
      <label className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
        <Checkbox
          checked={eventAccessMode === "all"}
          onCheckedChange={(checked) =>
            onEventAccessModeChange(checked === true ? "all" : "selected")
          }
        />
        <span>
          All current and future events
          <span className="block text-xs text-[var(--text-secondary)]">
            Use only for trusted integrations that need workspace-wide access.
          </span>
        </span>
      </label>
      {eventAccessMode === "selected" && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2">
          {eventOptions.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Create an event before provisioning selected-event access.
            </p>
          ) : (
            eventOptions.map((eventOption) => (
              <label
                key={eventOption.eventId}
                className="flex items-center gap-2 rounded px-1 py-1 text-sm text-[var(--text-primary)]"
              >
                <Checkbox
                  checked={allowedEventIds.includes(eventOption.eventId)}
                  onCheckedChange={(checked) =>
                    onAllowedEventIdsChange(
                      checked === true
                        ? [...new Set([...allowedEventIds, eventOption.eventId])]
                        : allowedEventIds.filter(
                            (allowedEventId) => allowedEventId !== eventOption.eventId,
                          ),
                    )
                  }
                />
                <span className="truncate">{eventOption.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function describeEventAccess({
  eventAccessMode,
  allowedEventIds,
  isLegacyAllEventsAccess,
  eventOptions,
}: {
  eventAccessMode: PartnerEventAccessMode;
  allowedEventIds: Id<"events">[];
  isLegacyAllEventsAccess: boolean;
  eventOptions: PartnerEventOption[];
}): string {
  if (eventAccessMode === "all") {
    return isLegacyAllEventsAccess ? "All events (legacy)" : "All events";
  }
  const allowedEventNames = allowedEventIds
    .map(
      (allowedEventId) =>
        eventOptions.find((eventOption) => eventOption.eventId === allowedEventId)?.label,
    )
    .filter((eventName): eventName is string => Boolean(eventName));
  if (allowedEventNames.length === 0) {
    return `${allowedEventIds.length} selected event${allowedEventIds.length === 1 ? "" : "s"}`;
  }
  return allowedEventNames.join(", ");
}

function resolveApiBaseUrl(): string | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return null;
  return `${convexUrl.replace(".convex.cloud", ".convex.site")}/api/v1`;
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      onClick={() => copyToClipboard(value, label)}
      aria-label={`Copy ${label}`}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

function ApiBaseUrlCard() {
  const apiBaseUrl = resolveApiBaseUrl();
  return (
    <PageCard title="API base URL" description="Point partner integrations at this origin.">
      {apiBaseUrl ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]">
          <span className="truncate">{apiBaseUrl}</span>
          <CopyButton value={apiBaseUrl} label="API base URL" />
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          NEXT_PUBLIC_CONVEX_URL is not configured in this environment.
        </p>
      )}
    </PageCard>
  );
}

function ApiKeysCard({
  workspaceSlug,
  eventOptions,
}: {
  workspaceSlug: string;
  eventOptions: PartnerEventOption[];
}) {
  const apiClients = useQuery(api.apiClients.listForWorkspace, { workspaceSlug });
  const createApiClient = useMutation(api.apiClients.create);
  const revokeApiClient = useMutation(api.apiClients.revoke);
  const updateDefaultRsvpListKey = useMutation(api.apiClients.updateDefaultRsvpListKey);
  const updateApiClientEventAccess = useMutation(api.apiClients.updateEventAccess);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<ApiClientScope[]>(["events:read"]);
  const [newKeyDefaultRsvpListKey, setNewKeyDefaultRsvpListKey] = useState("");
  const [newKeyEventAccessMode, setNewKeyEventAccessMode] =
    useState<PartnerEventAccessMode>("selected");
  const [newKeyAllowedEventIds, setNewKeyAllowedEventIds] = useState<Id<"events">[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdPlaintextKey, setCreatedPlaintextKey] = useState<string | null>(null);
  const [createdApiClientId, setCreatedApiClientId] = useState<Id<"apiClients"> | null>(null);
  const [editingApiClientId, setEditingApiClientId] = useState<Id<"apiClients"> | null>(null);
  const [editingDefaultRsvpListKey, setEditingDefaultRsvpListKey] = useState("");
  const [isSavingDefaultList, setIsSavingDefaultList] = useState(false);
  const [editingApiClientAccessId, setEditingApiClientAccessId] = useState<Id<"apiClients"> | null>(
    null,
  );
  const [editingApiClientAccessMode, setEditingApiClientAccessMode] =
    useState<PartnerEventAccessMode>("selected");
  const [editingApiClientAllowedEventIds, setEditingApiClientAllowedEventIds] = useState<
    Id<"events">[]
  >([]);
  const [isSavingApiClientAccess, setIsSavingApiClientAccess] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error("Give the key a name");
      return;
    }
    if (newKeyScopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }
    if (newKeyEventAccessMode === "selected" && newKeyAllowedEventIds.length === 0) {
      toast.error("Select at least one event or grant all events");
      return;
    }
    setIsCreating(true);
    try {
      const created = await createApiClient({
        workspaceSlug,
        displayName: newKeyName.trim(),
        scopes: newKeyScopes,
        defaultRsvpListKey: newKeyDefaultRsvpListKey.trim() || undefined,
        eventAccessMode: newKeyEventAccessMode,
        allowedEventIds: newKeyEventAccessMode === "selected" ? newKeyAllowedEventIds : undefined,
      });
      setCreatedPlaintextKey(created.plaintextKey);
      setCreatedApiClientId(created.apiClientId);
      setIsCreateDialogOpen(false);
      setNewKeyName("");
      setNewKeyScopes(["events:read"]);
      setNewKeyDefaultRsvpListKey("");
      setNewKeyEventAccessMode("selected");
      setNewKeyAllowedEventIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the API key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveApiClientAccess = async () => {
    if (!editingApiClientAccessId) return;
    if (editingApiClientAccessMode === "selected" && editingApiClientAllowedEventIds.length === 0) {
      toast.error("Select at least one event or grant all events");
      return;
    }
    setIsSavingApiClientAccess(true);
    try {
      await updateApiClientEventAccess({
        workspaceSlug,
        apiClientId: editingApiClientAccessId,
        eventAccessMode: editingApiClientAccessMode,
        allowedEventIds:
          editingApiClientAccessMode === "selected" ? editingApiClientAllowedEventIds : undefined,
      });
      setEditingApiClientAccessId(null);
      toast.success("API key event access updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update event access");
    } finally {
      setIsSavingApiClientAccess(false);
    }
  };

  const handleSaveDefaultList = async () => {
    if (!editingApiClientId) return;
    setIsSavingDefaultList(true);
    try {
      await updateDefaultRsvpListKey({
        workspaceSlug,
        apiClientId: editingApiClientId,
        defaultRsvpListKey: editingDefaultRsvpListKey.trim() || undefined,
      });
      setEditingApiClientId(null);
      toast.success("Default RSVP list updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the default list");
    } finally {
      setIsSavingDefaultList(false);
    }
  };

  const handleRevoke = async (apiClientId: Id<"apiClients">, displayName: string) => {
    if (!window.confirm(`Revoke "${displayName}"? Integrations using it stop working immediately.`))
      return;
    try {
      await revokeApiClient({ workspaceSlug, apiClientId });
      toast.success("API key revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the API key");
    }
  };

  return (
    <PageCard
      title={
        <span className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> API keys
        </span>
      }
      description="Server-side credentials for the partner API. Keys are shown once at creation and never again."
      action={
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Create key
        </Button>
      }
    >
      <div className="space-y-2">
        {apiClients === undefined ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : apiClients.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No API keys yet.</p>
        ) : (
          apiClients.map((apiClient) => (
            <div
              key={apiClient.apiClientId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {apiClient.displayName}
                  </span>
                  <code className="text-xs text-[var(--text-secondary)]">
                    {apiClient.keyPrefix}…
                  </code>
                  <CopyButton value={apiClient.apiClientId} label="API client ID" />
                  {apiClient.revokedAt !== null && (
                    <StatusBadge variant="disabled" label="Revoked" />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  {apiClient.scopes.map((scope) => (
                    <Badge
                      key={scope}
                      variant="outline"
                      className="border-[var(--border-subtle)] text-[10px] text-[var(--text-primary)]"
                    >
                      {scope}
                    </Badge>
                  ))}
                  <span>· Created {formatTimestamp(apiClient.createdAt)}</span>
                  <span>· Last used {formatTimestamp(apiClient.lastUsedAt)}</span>
                  <span>
                    · Default RSVP list {apiClient.defaultRsvpListKey ?? "event fallback"}
                  </span>
                  <span>
                    · Events{" "}
                    {describeEventAccess({
                      eventAccessMode: apiClient.eventAccessMode,
                      allowedEventIds: apiClient.allowedEventIds,
                      isLegacyAllEventsAccess: apiClient.isLegacyAllEventsAccess,
                      eventOptions,
                    })}
                  </span>
                </div>
              </div>
              {apiClient.revokedAt === null && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingApiClientAccessId(apiClient.apiClientId);
                      setEditingApiClientAccessMode(apiClient.eventAccessMode);
                      setEditingApiClientAllowedEventIds(apiClient.allowedEventIds);
                    }}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Event access
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingApiClientId(apiClient.apiClientId);
                      setEditingDefaultRsvpListKey(apiClient.defaultRsvpListKey ?? "");
                    }}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Default list
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(apiClient.apiClientId, apiClient.displayName)}
                  >
                    Revoke
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Name the key after the integration that will use it and grant only the scopes it
              needs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                placeholder="e.g. Club app backend"
                value={newKeyName}
                onChange={(event) => setNewKeyName(event.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              {API_KEY_SCOPES.map(({ scope, label }) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                >
                  <Checkbox
                    checked={newKeyScopes.includes(scope)}
                    onCheckedChange={(checked) =>
                      setNewKeyScopes((currentScopes) =>
                        checked
                          ? [...currentScopes, scope]
                          : currentScopes.filter((currentScope) => currentScope !== scope),
                      )
                    }
                  />
                  {label} <code className="text-xs text-[var(--text-secondary)]">{scope}</code>
                </label>
              ))}
            </div>
            <EventAccessFields
              eventAccessMode={newKeyEventAccessMode}
              allowedEventIds={newKeyAllowedEventIds}
              eventOptions={eventOptions}
              onEventAccessModeChange={setNewKeyEventAccessMode}
              onAllowedEventIdsChange={setNewKeyAllowedEventIds}
            />
            <div className="space-y-2">
              <Label htmlFor="api-key-default-rsvp-list">Default RSVP list (optional)</Label>
              <Input
                id="api-key-default-rsvp-list"
                placeholder="e.g. ga"
                value={newKeyDefaultRsvpListKey}
                onChange={(event) => setNewKeyDefaultRsvpListKey(event.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
              />
              <p className="text-xs text-[var(--text-secondary)]">
                Used when this client submits an RSVP without a password or explicit list key.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              className="border-[var(--border-subtle)]"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingApiClientId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingApiClientId(null);
        }}
      >
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Edit default RSVP list</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              The configured list must exist on every event this integration submits to. Leave it
              empty to retain the legacy event fallback.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-api-key-default-rsvp-list">List key</Label>
            <Input
              id="edit-api-key-default-rsvp-list"
              placeholder="e.g. ga"
              value={editingDefaultRsvpListKey}
              onChange={(event) => setEditingDefaultRsvpListKey(event.target.value)}
              className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingApiClientId(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDefaultList} disabled={isSavingDefaultList}>
              {isSavingDefaultList ? "Saving…" : "Save default"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingApiClientAccessId !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingApiClientAccess) setEditingApiClientAccessId(null);
        }}
      >
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Edit API key event access</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Requests for events outside this grant return 404 without revealing that the event
              exists.
            </DialogDescription>
          </DialogHeader>
          <EventAccessFields
            eventAccessMode={editingApiClientAccessMode}
            allowedEventIds={editingApiClientAllowedEventIds}
            eventOptions={eventOptions}
            onEventAccessModeChange={setEditingApiClientAccessMode}
            onAllowedEventIdsChange={setEditingApiClientAllowedEventIds}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingApiClientAccessId(null)}
              disabled={isSavingApiClientAccess}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveApiClientAccess} disabled={isSavingApiClientAccess}>
              {isSavingApiClientAccess ? "Saving…" : "Save event access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdPlaintextKey !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedPlaintextKey(null);
            setCreatedApiClientId(null);
          }
        }}
      >
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Copy your API key now</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              This is the only time the full key is shown. If you lose it, revoke it and create a
              new one.
            </DialogDescription>
          </DialogHeader>
          {createdPlaintextKey && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]">
              <span className="truncate">{createdPlaintextKey}</span>
              <CopyButton value={createdPlaintextKey} label="API key" />
            </div>
          )}
          {createdApiClientId && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm text-[var(--text-primary)]">
              <span className="w-24 shrink-0 font-sans text-xs text-[var(--text-secondary)]">
                Client ID
              </span>
              <span className="truncate">{createdApiClientId}</span>
              <CopyButton value={createdApiClientId} label="API client ID" />
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setCreatedPlaintextKey(null);
                setCreatedApiClientId(null);
              }}
            >
              <Check className="mr-1 h-4 w-4" /> I saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageCard>
  );
}

interface RevealedEndpointSecrets {
  encryptionSecretBase64: string;
  signingSecretBase64: string;
  secretGeneration: number;
}

function EndpointSecretsBlock({ secrets }: { secrets: RevealedEndpointSecrets }) {
  return (
    <div className="space-y-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-36 shrink-0 text-[var(--text-secondary)]">Encryption secret</span>
        <code className="truncate text-[var(--text-primary)]">
          {secrets.encryptionSecretBase64}
        </code>
        <CopyButton value={secrets.encryptionSecretBase64} label="Encryption secret" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-36 shrink-0 text-[var(--text-secondary)]">Signing secret</span>
        <code className="truncate text-[var(--text-primary)]">{secrets.signingSecretBase64}</code>
        <CopyButton value={secrets.signingSecretBase64} label="Signing secret" />
      </div>
      <p className="text-[var(--text-secondary)]">
        Secret generation {secrets.secretGeneration}. Payloads are AES-256-GCM encrypted with the
        encryption secret; request signatures use the signing secret.
      </p>
    </div>
  );
}

function EndpointDeliveries({
  workspaceSlug,
  endpointId,
}: {
  workspaceSlug: string;
  endpointId: Id<"webhookEndpoints">;
}) {
  const deliveries = useQuery(api.webhookDeliveries.listRecentForEndpoint, {
    workspaceSlug,
    endpointId,
    limit: 10,
  });
  const retryDelivery = useMutation(api.webhookDeliveries.retryDelivery);

  const handleRetry = async (deliveryId: Id<"webhookDeliveries">) => {
    try {
      await retryDelivery({ workspaceSlug, deliveryId });
      toast.success("Delivery re-queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry the delivery");
    }
  };

  if (deliveries === undefined) {
    return <p className="text-xs text-[var(--text-secondary)]">Loading deliveries…</p>;
  }
  if (deliveries.deliveries.length === 0) {
    return <p className="text-xs text-[var(--text-secondary)]">No deliveries yet.</p>;
  }

  return (
    <div className="space-y-1">
      {deliveries.deliveries.map((delivery) => (
        <div
          key={delivery.deliveryId}
          className="flex flex-wrap items-center gap-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1.5 text-xs"
        >
          <code className="text-[var(--text-primary)]">{delivery.eventType}</code>
          <StatusBadge
            variant={
              delivery.status === "success"
                ? "approved"
                : delivery.status === "pending"
                  ? "pending"
                  : "denied"
            }
            label={delivery.status}
          />
          <span className="text-[var(--text-secondary)]">
            {formatTimestamp(delivery.occurredAt)} · {delivery.attemptCount} attempt
            {delivery.attemptCount === 1 ? "" : "s"}
            {delivery.lastResponseStatus !== null && ` · HTTP ${delivery.lastResponseStatus}`}
          </span>
          {delivery.lastErrorMessage && (
            <span className="truncate text-[var(--status-denied)]">
              {delivery.lastErrorMessage}
            </span>
          )}
          {delivery.status !== "pending" && delivery.status !== "success" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => handleRetry(delivery.deliveryId)}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function WebhookEndpointsCard({
  workspaceSlug,
  eventOptions,
}: {
  workspaceSlug: string;
  eventOptions: PartnerEventOption[];
}) {
  const endpoints = useQuery(api.webhookEndpoints.listForWorkspace, { workspaceSlug });
  const createEndpoint = useMutation(api.webhookEndpoints.create);
  const updateEndpoint = useMutation(api.webhookEndpoints.update);
  const updateEndpointEventAccess = useMutation(api.webhookEndpoints.updateEventAccess);
  const rotateSecrets = useMutation(api.webhookEndpoints.rotateSecrets);
  const removeEndpoint = useMutation(api.webhookEndpoints.remove);
  const sendTestDelivery = useMutation(api.webhookEndpoints.sendTestDelivery);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEndpointId, setEditingEndpointId] = useState<Id<"webhookEndpoints"> | null>(null);
  const [editingEndpointUrl, setEditingEndpointUrl] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newEndpointDescription, setNewEndpointDescription] = useState("");
  const [newEndpointEventTypes, setNewEndpointEventTypes] = useState<string[]>([
    "rsvp.created",
    "rsvp.approved",
    "rsvp.denied",
    "rsvp.attendance_updated",
  ]);
  const [newEndpointEventAccessMode, setNewEndpointEventAccessMode] =
    useState<PartnerEventAccessMode>("selected");
  const [newEndpointAllowedEventIds, setNewEndpointAllowedEventIds] = useState<Id<"events">[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [revealedSecretsByEndpointId, setRevealedSecretsByEndpointId] = useState<
    Record<string, RevealedEndpointSecrets>
  >({});

  const [expandedEndpointId, setExpandedEndpointId] = useState<Id<"webhookEndpoints"> | null>(null);
  const [editingEndpointAccessId, setEditingEndpointAccessId] =
    useState<Id<"webhookEndpoints"> | null>(null);
  const [editingEndpointAccessMode, setEditingEndpointAccessMode] =
    useState<PartnerEventAccessMode>("selected");
  const [editingEndpointAllowedEventIds, setEditingEndpointAllowedEventIds] = useState<
    Id<"events">[]
  >([]);
  const [isSavingEndpointAccess, setIsSavingEndpointAccess] = useState(false);

  const [revealingEndpointId, setRevealingEndpointId] = useState<Id<"webhookEndpoints"> | null>(
    null,
  );
  const revealedSecretsQueryResult = useQuery(
    api.webhookEndpoints.revealSecrets,
    revealingEndpointId ? { workspaceSlug, endpointId: revealingEndpointId } : "skip",
  );
  useEffect(() => {
    if (revealingEndpointId && revealedSecretsQueryResult) {
      setRevealedSecretsByEndpointId((currentSecrets) => ({
        ...currentSecrets,
        [revealingEndpointId]: revealedSecretsQueryResult,
      }));
      setRevealingEndpointId(null);
    }
  }, [revealingEndpointId, revealedSecretsQueryResult]);

  const handleCreate = async () => {
    try {
      new URL(newEndpointUrl);
    } catch {
      toast.error("Enter a valid https:// URL");
      return;
    }
    if (newEndpointEventTypes.length === 0) {
      toast.error("Subscribe to at least one event type");
      return;
    }
    if (newEndpointEventAccessMode === "selected" && newEndpointAllowedEventIds.length === 0) {
      toast.error("Select at least one event or grant all events");
      return;
    }
    setIsCreating(true);
    try {
      const created = await createEndpoint({
        workspaceSlug,
        url: newEndpointUrl.trim(),
        description: newEndpointDescription.trim() || undefined,
        subscribedEventTypes: newEndpointEventTypes,
        eventAccessMode: newEndpointEventAccessMode,
        allowedEventIds:
          newEndpointEventAccessMode === "selected" ? newEndpointAllowedEventIds : undefined,
      });
      setRevealedSecretsByEndpointId((currentSecrets) => ({
        ...currentSecrets,
        [created.endpointId]: {
          encryptionSecretBase64: created.encryptionSecretBase64,
          signingSecretBase64: created.signingSecretBase64,
          secretGeneration: created.secretGeneration,
        },
      }));
      setIsCreateDialogOpen(false);
      setNewEndpointUrl("");
      setNewEndpointDescription("");
      setNewEndpointEventAccessMode("selected");
      setNewEndpointAllowedEventIds([]);
      toast.success("Webhook endpoint created — copy its secrets below");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the endpoint");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveEndpointAccess = async () => {
    if (!editingEndpointAccessId) return;
    if (editingEndpointAccessMode === "selected" && editingEndpointAllowedEventIds.length === 0) {
      toast.error("Select at least one event or grant all events");
      return;
    }
    setIsSavingEndpointAccess(true);
    try {
      await updateEndpointEventAccess({
        workspaceSlug,
        endpointId: editingEndpointAccessId,
        eventAccessMode: editingEndpointAccessMode,
        allowedEventIds:
          editingEndpointAccessMode === "selected" ? editingEndpointAllowedEventIds : undefined,
      });
      setEditingEndpointAccessId(null);
      toast.success("Webhook event access updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update event access");
    } finally {
      setIsSavingEndpointAccess(false);
    }
  };

  const handleRotate = async (endpointId: Id<"webhookEndpoints">) => {
    if (
      !window.confirm(
        "Rotate secrets? Deliveries immediately switch to the new secrets — update your consumer first if it can only hold one config.",
      )
    )
      return;
    try {
      const rotated = await rotateSecrets({ workspaceSlug, endpointId });
      setRevealedSecretsByEndpointId((currentSecrets) => ({
        ...currentSecrets,
        [endpointId]: rotated,
      }));
      toast.success(`Secrets rotated (generation ${rotated.secretGeneration})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate secrets");
    }
  };

  const openUrlEditDialog = (endpointId: Id<"webhookEndpoints">, currentUrl: string) => {
    setEditingEndpointId(endpointId);
    setEditingEndpointUrl(currentUrl);
  };

  const handleToggleActive = async (
    endpointId: Id<"webhookEndpoints">,
    isCurrentlyActive: boolean,
  ) => {
    try {
      await updateEndpoint({
        workspaceSlug,
        endpointId,
        isActive: !isCurrentlyActive,
      });
      toast.success(isCurrentlyActive ? "Endpoint disabled" : "Endpoint enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update endpoint");
    }
  };

  const handleUpdateEndpoint = async () => {
    if (!editingEndpointId) return;
    try {
      const parsedUrl = new URL(editingEndpointUrl.trim());
      if (parsedUrl.protocol !== "https:") throw new Error("Webhook URLs must use https://");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enter a valid https:// URL");
      return;
    }
    setIsUpdating(true);
    try {
      await updateEndpoint({
        workspaceSlug,
        endpointId: editingEndpointId,
        url: editingEndpointUrl.trim(),
      });
      setEditingEndpointId(null);
      toast.success("Webhook endpoint updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the endpoint");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (endpointId: Id<"webhookEndpoints">, url: string) => {
    if (!window.confirm(`Delete the endpoint for ${url}? Its delivery history is kept.`)) return;
    try {
      await removeEndpoint({ workspaceSlug, endpointId });
      toast.success("Endpoint deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the endpoint");
    }
  };

  const handleSendTest = async (endpointId: Id<"webhookEndpoints">) => {
    try {
      await sendTestDelivery({ workspaceSlug, endpointId });
      toast.success("Test event queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the test event");
    }
  };

  return (
    <PageCard
      title={
        <span className="flex items-center gap-2">
          <Webhook className="h-4 w-4" /> Webhook endpoints
        </span>
      }
      description="Receive encrypted, signed notifications when RSVPs or events change."
      action={
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add endpoint
        </Button>
      }
    >
      <div className="space-y-3">
        {endpoints === undefined ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No webhook endpoints yet.</p>
        ) : (
          endpoints.map((endpoint) => {
            const revealedSecrets = revealedSecretsByEndpointId[endpoint.endpointId];
            const isExpanded = expandedEndpointId === endpoint.endpointId;
            return (
              <div
                key={endpoint.endpointId}
                className="space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3"
              >
                {endpoint.disabledReason === "auto_failure" && (
                  <div className="flex items-center gap-2 rounded-md border border-[var(--status-denied)]/40 bg-[var(--status-denied-bg)] px-3 py-2 text-xs text-[var(--status-denied)]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Disabled automatically after repeated delivery failures. Fix the consumer and
                    re-enable.
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1">
                      <code
                        className="cursor-text truncate text-sm text-[var(--text-primary)] underline-offset-4 decoration-dotted hover:underline"
                        title="Double-click to edit URL"
                        onDoubleClick={() => openUrlEditDialog(endpoint.endpointId, endpoint.url)}
                      >
                        {endpoint.url}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-[var(--text-secondary)]"
                        aria-label="Edit webhook URL"
                        onClick={() => openUrlEditDialog(endpoint.endpointId, endpoint.url)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <StatusBadge
                        variant={endpoint.isActive ? "approved" : "disabled"}
                        label={endpoint.isActive ? "Active" : "Disabled"}
                      />
                    </div>
                    {endpoint.description && (
                      <p className="text-xs text-[var(--text-secondary)]">{endpoint.description}</p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)]">
                      Events:{" "}
                      {describeEventAccess({
                        eventAccessMode: endpoint.eventAccessMode,
                        allowedEventIds: endpoint.allowedEventIds,
                        isLegacyAllEventsAccess: endpoint.isLegacyAllEventsAccess,
                        eventOptions,
                      })}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {endpoint.subscribedEventTypes.map((eventType) => (
                        <Badge
                          key={eventType}
                          variant="outline"
                          className="border-[var(--border-subtle)] text-[10px] text-[var(--text-primary)]"
                        >
                          {eventType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-[var(--text-secondary)]"
                      onClick={() => {
                        setEditingEndpointAccessId(endpoint.endpointId);
                        setEditingEndpointAccessMode(endpoint.eventAccessMode);
                        setEditingEndpointAllowedEventIds(endpoint.allowedEventIds);
                      }}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> Event access
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-[var(--text-secondary)]"
                      onClick={() => {
                        if (revealedSecrets) {
                          setRevealedSecretsByEndpointId((currentSecrets) => {
                            const { [endpoint.endpointId]: _removed, ...rest } = currentSecrets;
                            return rest;
                          });
                          if (revealingEndpointId === endpoint.endpointId) {
                            setRevealingEndpointId(null);
                          }
                        } else {
                          setRevealingEndpointId(endpoint.endpointId);
                        }
                      }}
                    >
                      {revealedSecrets ? (
                        <>
                          <EyeOff className="mr-1 h-3 w-3" /> Hide secrets
                        </>
                      ) : (
                        <>
                          <Eye className="mr-1 h-3 w-3" /> Reveal secrets
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-[var(--text-secondary)]"
                      onClick={() => handleRotate(endpoint.endpointId)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" /> Rotate
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-[var(--text-secondary)]"
                          aria-label="Endpoint actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-[var(--border-subtle)] bg-[var(--surface-2)]"
                      >
                        <DropdownMenuItem
                          onSelect={() =>
                            handleToggleActive(endpoint.endpointId, endpoint.isActive)
                          }
                        >
                          {endpoint.isActive ? "Disable" : "Enable"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!endpoint.isActive}
                          onSelect={() => handleSendTest(endpoint.endpointId)}
                        >
                          <Send className="mr-2 h-3.5 w-3.5" /> Send test
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => handleRemove(endpoint.endpointId, endpoint.url)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {revealedSecrets && <EndpointSecretsBlock secrets={revealedSecrets} />}
                <Button
                  variant="link"
                  size="sm"
                  className="h-6 px-0 text-xs text-[var(--text-secondary)]"
                  onClick={() => setExpandedEndpointId(isExpanded ? null : endpoint.endpointId)}
                >
                  {isExpanded ? "Hide recent deliveries" : "Show recent deliveries"}
                </Button>
                {isExpanded && (
                  <EndpointDeliveries
                    workspaceSlug={workspaceSlug}
                    endpointId={endpoint.endpointId}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Coucou will POST encrypted event notifications to this HTTPS URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="endpoint-url">HTTPS URL</Label>
              <Input
                id="endpoint-url"
                placeholder="https://example.com/webhooks/coucou"
                value={newEndpointUrl}
                onChange={(event) => setNewEndpointUrl(event.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint-description">Description (optional)</Label>
              <Input
                id="endpoint-description"
                placeholder="e.g. Club app production"
                value={newEndpointDescription}
                onChange={(event) => setNewEndpointDescription(event.target.value)}
                className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
              />
            </div>
            <EventAccessFields
              eventAccessMode={newEndpointEventAccessMode}
              allowedEventIds={newEndpointAllowedEventIds}
              eventOptions={eventOptions}
              onEventAccessModeChange={setNewEndpointEventAccessMode}
              onAllowedEventIdsChange={setNewEndpointAllowedEventIds}
            />
            <div className="space-y-2">
              <Label>Subscribed events</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {WEBHOOK_EVENT_TYPES.map((eventType) => (
                  <label
                    key={eventType}
                    className="flex items-center gap-2 text-sm text-[var(--text-primary)]"
                  >
                    <Checkbox
                      checked={newEndpointEventTypes.includes(eventType)}
                      onCheckedChange={(checked) =>
                        setNewEndpointEventTypes((currentEventTypes) =>
                          checked
                            ? [...currentEventTypes, eventType]
                            : currentEventTypes.filter(
                                (currentEventType) => currentEventType !== eventType,
                              ),
                        )
                      }
                    />
                    <code className="text-xs">{eventType}</code>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              className="border-[var(--border-subtle)]"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating…" : "Add endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingEndpointAccessId !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingEndpointAccess) setEditingEndpointAccessId(null);
        }}
      >
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Edit webhook event access</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Removing an event also prevents pending retries for that event from delivering.
            </DialogDescription>
          </DialogHeader>
          <EventAccessFields
            eventAccessMode={editingEndpointAccessMode}
            allowedEventIds={editingEndpointAllowedEventIds}
            eventOptions={eventOptions}
            onEventAccessModeChange={setEditingEndpointAccessMode}
            onAllowedEventIdsChange={setEditingEndpointAllowedEventIds}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEndpointAccessId(null)}
              disabled={isSavingEndpointAccess}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEndpointAccess} disabled={isSavingEndpointAccess}>
              {isSavingEndpointAccess ? "Saving…" : "Save event access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingEndpointId !== null}
        onOpenChange={(open) => {
          if (!open && !isUpdating) setEditingEndpointId(null);
        }}
      >
        <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
          <DialogHeader>
            <DialogTitle>Edit webhook endpoint</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Update the HTTPS destination. Existing signing and encryption secrets remain
              unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-endpoint-url">HTTPS URL</Label>
            <Input
              id="edit-endpoint-url"
              placeholder="https://example.com/webhooks/coucou"
              value={editingEndpointUrl}
              onChange={(event) => setEditingEndpointUrl(event.target.value)}
              className="border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEndpointId(null)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateEndpoint} disabled={isUpdating}>
              {isUpdating ? "Saving…" : "Save URL"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageCard>
  );
}

export default function DevelopersPage() {
  const workspaceScope = useWorkspaceScope();
  const workspaceEvents = useQuery(
    api.events.listAll,
    workspaceScope ? { workspaceSlug: workspaceScope.workspaceSlug } : "skip",
  );

  if (!workspaceScope) {
    return <p className="text-sm text-[var(--text-secondary)]">Loading workspace…</p>;
  }

  const eventOptions: PartnerEventOption[] = (workspaceEvents ?? [])
    .slice()
    .sort((firstEvent, secondEvent) => secondEvent.eventDate - firstEvent.eventDate)
    .map((event) => ({
      eventId: event._id,
      label: `${event.name} · ${formatTimestamp(event.eventDate)}`,
    }));

  return (
    <div className="space-y-5">
      <DashboardTitleBar
        title="Developers"
        subtitle={`API keys and webhooks for integrating ${workspaceScope.brandName} with other apps.`}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link
              href={buildWorkspaceOperationPath(
                workspaceScope.workspaceSlug,
                "host",
                "developers/docs",
              )}
            >
              <BookOpen className="mr-1 h-4 w-4" /> API documentation
            </Link>
          </Button>
        }
        breadcrumb={[{ label: "Workspace" }]}
      />
      <ApiBaseUrlCard />
      <ApiKeysCard workspaceSlug={workspaceScope.workspaceSlug} eventOptions={eventOptions} />
      <WebhookEndpointsCard
        workspaceSlug={workspaceScope.workspaceSlug}
        eventOptions={eventOptions}
      />
    </div>
  );
}

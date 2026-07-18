"use client";

import { WEBHOOK_EVENT_TYPES } from "@coucou/sdk/api-v1";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

const API_KEY_SCOPES = [
  { scope: "events:read" as const, label: "Read events" },
  { scope: "rsvps:read" as const, label: "Read RSVPs" },
  { scope: "rsvps:write" as const, label: "Write RSVPs" },
];

type ApiClientScope = (typeof API_KEY_SCOPES)[number]["scope"];

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">API base URL</CardTitle>
        <CardDescription>
          Point partner integrations at this origin. Requests authenticate with an API key in the
          Authorization header: <code className="text-xs">Authorization: Bearer coucou_sk_…</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {apiBaseUrl ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
            <span className="truncate">{apiBaseUrl}</span>
            <CopyButton value={apiBaseUrl} label="API base URL" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            NEXT_PUBLIC_CONVEX_URL is not configured in this environment.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ApiKeysCard({ workspaceSlug }: { workspaceSlug: string }) {
  const apiClients = useQuery(api.apiClients.listForWorkspace, { workspaceSlug });
  const createApiClient = useMutation(api.apiClients.create);
  const revokeApiClient = useMutation(api.apiClients.revoke);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<ApiClientScope[]>(["events:read"]);
  const [isCreating, setIsCreating] = useState(false);
  const [createdPlaintextKey, setCreatedPlaintextKey] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error("Give the key a name");
      return;
    }
    if (newKeyScopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }
    setIsCreating(true);
    try {
      const created = await createApiClient({
        workspaceSlug,
        displayName: newKeyName.trim(),
        scopes: newKeyScopes,
      });
      setCreatedPlaintextKey(created.plaintextKey);
      setIsCreateDialogOpen(false);
      setNewKeyName("");
      setNewKeyScopes(["events:read"]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the API key");
    } finally {
      setIsCreating(false);
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> API keys
          </CardTitle>
          <CardDescription>
            Server-side credentials for the partner API. Keys are shown once at creation and never
            again — store them in your integration&apos;s secret manager, never in a browser.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Create key
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {apiClients === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : apiClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          apiClients.map((apiClient) => (
            <div
              key={apiClient.apiClientId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{apiClient.displayName}</span>
                  <code className="text-xs text-muted-foreground">{apiClient.keyPrefix}…</code>
                  {apiClient.revokedAt !== null && <Badge variant="destructive">Revoked</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {apiClient.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-[10px]">
                      {scope}
                    </Badge>
                  ))}
                  <span>· Created {formatTimestamp(apiClient.createdAt)}</span>
                  <span>· Last used {formatTimestamp(apiClient.lastUsedAt)}</span>
                </div>
              </div>
              {apiClient.revokedAt === null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleRevoke(apiClient.apiClientId, apiClient.displayName)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
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
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              {API_KEY_SCOPES.map(({ scope, label }) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
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
                  {label} <code className="text-xs text-muted-foreground">{scope}</code>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdPlaintextKey !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedPlaintextKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key now</DialogTitle>
            <DialogDescription>
              This is the only time the full key is shown. If you lose it, revoke it and create a
              new one.
            </DialogDescription>
          </DialogHeader>
          {createdPlaintextKey && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
              <span className="truncate">{createdPlaintextKey}</span>
              <CopyButton value={createdPlaintextKey} label="API key" />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedPlaintextKey(null)}>
              <Check className="mr-1 h-4 w-4" /> I saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface RevealedEndpointSecrets {
  encryptionSecretBase64: string;
  signingSecretBase64: string;
  secretGeneration: number;
}

function EndpointSecretsBlock({ secrets }: { secrets: RevealedEndpointSecrets }) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-36 shrink-0 text-muted-foreground">Encryption secret</span>
        <code className="truncate">{secrets.encryptionSecretBase64}</code>
        <CopyButton value={secrets.encryptionSecretBase64} label="Encryption secret" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-36 shrink-0 text-muted-foreground">Signing secret</span>
        <code className="truncate">{secrets.signingSecretBase64}</code>
        <CopyButton value={secrets.signingSecretBase64} label="Signing secret" />
      </div>
      <p className="text-muted-foreground">
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
    return <p className="text-xs text-muted-foreground">Loading deliveries…</p>;
  }
  if (deliveries.deliveries.length === 0) {
    return <p className="text-xs text-muted-foreground">No deliveries yet.</p>;
  }

  return (
    <div className="space-y-1">
      {deliveries.deliveries.map((delivery) => (
        <div
          key={delivery.deliveryId}
          className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-xs"
        >
          <code>{delivery.eventType}</code>
          <Badge
            variant={
              delivery.status === "success"
                ? "default"
                : delivery.status === "pending"
                  ? "secondary"
                  : "destructive"
            }
            className="text-[10px]"
          >
            {delivery.status}
          </Badge>
          <span className="text-muted-foreground">
            {formatTimestamp(delivery.occurredAt)} · {delivery.attemptCount} attempt
            {delivery.attemptCount === 1 ? "" : "s"}
            {delivery.lastResponseStatus !== null && ` · HTTP ${delivery.lastResponseStatus}`}
          </span>
          {delivery.lastErrorMessage && (
            <span className="truncate text-destructive">{delivery.lastErrorMessage}</span>
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

function WebhookEndpointsCard({ workspaceSlug }: { workspaceSlug: string }) {
  const endpoints = useQuery(api.webhookEndpoints.listForWorkspace, { workspaceSlug });
  const createEndpoint = useMutation(api.webhookEndpoints.create);
  const updateEndpoint = useMutation(api.webhookEndpoints.update);
  const rotateSecrets = useMutation(api.webhookEndpoints.rotateSecrets);
  const removeEndpoint = useMutation(api.webhookEndpoints.remove);
  const sendTestDelivery = useMutation(api.webhookEndpoints.sendTestDelivery);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [newEndpointDescription, setNewEndpointDescription] = useState("");
  const [newEndpointEventTypes, setNewEndpointEventTypes] = useState<string[]>([
    "rsvp.created",
    "rsvp.approved",
    "rsvp.denied",
    "rsvp.attendance_updated",
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [revealedSecretsByEndpointId, setRevealedSecretsByEndpointId] = useState<
    Record<string, RevealedEndpointSecrets>
  >({});

  const [expandedEndpointId, setExpandedEndpointId] = useState<Id<"webhookEndpoints"> | null>(
    null,
  );

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
    setIsCreating(true);
    try {
      const created = await createEndpoint({
        workspaceSlug,
        url: newEndpointUrl.trim(),
        description: newEndpointDescription.trim() || undefined,
        subscribedEventTypes: newEndpointEventTypes,
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
      toast.success("Webhook endpoint created — copy its secrets below");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the endpoint");
    } finally {
      setIsCreating(false);
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4" /> Webhook endpoints
          </CardTitle>
          <CardDescription>
            Receive encrypted, signed notifications when RSVPs or events change. Payloads are
            AES-256-GCM encrypted; verify the signature and decrypt with the endpoint&apos;s
            secrets.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add endpoint
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {endpoints === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>
        ) : (
          endpoints.map((endpoint) => {
            const revealedSecrets = revealedSecretsByEndpointId[endpoint.endpointId];
            const isExpanded = expandedEndpointId === endpoint.endpointId;
            return (
              <div key={endpoint.endpointId} className="space-y-2 rounded-md border p-3">
                {endpoint.disabledReason === "auto_failure" && (
                  <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Disabled automatically after repeated delivery failures. Fix the consumer and
                    re-enable.
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="truncate text-sm">{endpoint.url}</code>
                      <Badge variant={endpoint.isActive ? "default" : "secondary"}>
                        {endpoint.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    {endpoint.description && (
                      <p className="text-xs text-muted-foreground">{endpoint.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {endpoint.subscribedEventTypes.map((eventType) => (
                        <Badge key={eventType} variant="outline" className="text-[10px]">
                          {eventType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
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
                      className="h-7 px-2 text-xs"
                      onClick={() => handleRotate(endpoint.endpointId)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" /> Rotate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={!endpoint.isActive}
                      onClick={() => handleSendTest(endpoint.endpointId)}
                    >
                      <Send className="mr-1 h-3 w-3" /> Send test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        updateEndpoint({
                          workspaceSlug,
                          endpointId: endpoint.endpointId,
                          isActive: !endpoint.isActive,
                        })
                          .then(() =>
                            toast.success(endpoint.isActive ? "Endpoint disabled" : "Endpoint enabled"),
                          )
                          .catch((error) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not update endpoint",
                            ),
                          )
                      }
                    >
                      {endpoint.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleRemove(endpoint.endpointId, endpoint.url)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Delete
                    </Button>
                  </div>
                </div>
                {revealedSecrets && <EndpointSecretsBlock secrets={revealedSecrets} />}
                <Button
                  variant="link"
                  size="sm"
                  className="h-6 px-0 text-xs"
                  onClick={() =>
                    setExpandedEndpointId(isExpanded ? null : endpoint.endpointId)
                  }
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
      </CardContent>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endpoint-description">Description (optional)</Label>
              <Input
                id="endpoint-description"
                placeholder="e.g. Club app production"
                value={newEndpointDescription}
                onChange={(event) => setNewEndpointDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Subscribed events</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {WEBHOOK_EVENT_TYPES.map((eventType) => (
                  <label key={eventType} className="flex items-center gap-2 text-sm">
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
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating…" : "Add endpoint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function DevelopersPage() {
  const workspaceScope = useWorkspaceScope();

  if (!workspaceScope) {
    return <p className="text-sm text-muted-foreground">Loading workspace…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Developers</h1>
        <p className="text-sm text-muted-foreground">
          API keys and webhooks for integrating {workspaceScope.brandName} with other apps.
        </p>
      </div>
      <ApiBaseUrlCard />
      <ApiKeysCard workspaceSlug={workspaceScope.workspaceSlug} />
      <WebhookEndpointsCard workspaceSlug={workspaceScope.workspaceSlug} />
    </div>
  );
}

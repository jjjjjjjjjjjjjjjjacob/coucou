"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SOCIAL_PLATFORM_CONFIGS,
  dedupeSocialPlatformConfigs,
  normalizeSocialPlatformKey,
  type PrimarySocialPlatformConfig,
} from "@coucou/sdk/shared/primary-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import { runMutationWithToast } from "@/lib/toast-mutation";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

function optionalPrimaryDomain(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function readPrimaryDomainFromMutationResult(
  mutationResult: unknown,
): string | null | undefined {
  if (typeof mutationResult !== "object" || mutationResult === null) {
    return undefined;
  }

  const resultRecord = mutationResult as { primaryDomain?: unknown };
  if (typeof resultRecord.primaryDomain === "string") {
    return resultRecord.primaryDomain;
  }
  if (resultRecord.primaryDomain === null) {
    return null;
  }
  return undefined;
}

export default function WorkspaceDashboardSettingsPage() {
  const workspaceScope = useWorkspaceScope();
  const workspaceAccess = useWorkspaceAccess();
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceScope ? { slug: workspaceScope.workspaceSlug } : "skip",
  );
  const setTenantWorkspacePrimaryDomain = useMutation(
    api.workspaces.setTenantWorkspacePrimaryDomain,
  );
  const setTenantWorkspaceDefaults = useMutation(
    api.workspaces.setTenantWorkspaceDefaults,
  );
  const [primaryDomainDraft, setPrimaryDomainDraft] = useState("");
  const [isSavingPrimaryDomain, setIsSavingPrimaryDomain] = useState(false);
  const [themeBackgroundColorDraft, setThemeBackgroundColorDraft] =
    useState("#FFFFFF");
  const [themeTextColorDraft, setThemeTextColorDraft] = useState("#EF4444");
  const [listKeysDraft, setListKeysDraft] = useState("vip, ga");
  const [socialPlatformDrafts, setSocialPlatformDrafts] = useState<
    PrimarySocialPlatformConfig[]
  >([]);
  const [invitedByEnabledDraft, setInvitedByEnabledDraft] = useState(false);
  const [invitedByLabelDraft, setInvitedByLabelDraft] = useState("Invited by");
  const [invitedByPlaceholderDraft, setInvitedByPlaceholderDraft] =
    useState("Who invited you?");
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const canWriteSettings = workspaceAccess?.canWrite === true;

  useEffect(() => {
    setPrimaryDomainDraft(workspaceScope?.primaryDomain ?? "");
  }, [workspaceScope?.primaryDomain]);

  useEffect(() => {
    const eventDefaults = workspace?.eventDefaults;
    setThemeBackgroundColorDraft(
      eventDefaults?.themeBackgroundColor ?? "#FFFFFF",
    );
    setThemeTextColorDraft(eventDefaults?.themeTextColor ?? "#EF4444");
    setListKeysDraft((eventDefaults?.listKeys ?? ["vip", "ga"]).join(", "));
    setSocialPlatformDrafts(eventDefaults?.socialPlatforms ?? []);
    setInvitedByEnabledDraft(eventDefaults?.invitedBy?.enabled ?? false);
    setInvitedByLabelDraft(eventDefaults?.invitedBy?.label ?? "Invited by");
    setInvitedByPlaceholderDraft(
      eventDefaults?.invitedBy?.placeholder ?? "Who invited you?",
    );
  }, [workspace?.eventDefaults]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceScope || !workspaceAccess) {
      toast.error("Workspace scope is required to update settings");
      return;
    }

    if (!canWriteSettings) {
      toast.error("Dashboard write access is required to update settings");
      return;
    }

    const primaryDomain = optionalPrimaryDomain(primaryDomainDraft);
    if (!primaryDomain) {
      toast.error("Primary URL is required");
      return;
    }

    setIsSavingPrimaryDomain(true);
    try {
      const mutationResult = await runMutationWithToast(
        () =>
          setTenantWorkspacePrimaryDomain({
            slug: workspaceScope.workspaceSlug,
            clerkOrganizationId: workspaceAccess.clerkOrganizationId,
            primaryDomain,
          }),
        {
          loading: "Saving settings...",
          success: "Settings saved",
        },
      );
      const savedPrimaryDomain =
        readPrimaryDomainFromMutationResult(mutationResult);
      if (savedPrimaryDomain !== undefined) {
        setPrimaryDomainDraft(savedPrimaryDomain ?? "");
      }
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsSavingPrimaryDomain(false);
    }
  }

  function addSocialPlatform(platform: PrimarySocialPlatformConfig) {
    setSocialPlatformDrafts((currentDrafts) =>
      dedupeSocialPlatformConfigs([...currentDrafts, platform]),
    );
  }

  function updateSocialPlatform(
    index: number,
    patch: Partial<PrimarySocialPlatformConfig>,
  ) {
    setSocialPlatformDrafts((currentDrafts) =>
      currentDrafts.map((platform, platformIndex) =>
        platformIndex === index ? { ...platform, ...patch } : platform,
      ),
    );
  }

  function removeSocialPlatform(index: number) {
    setSocialPlatformDrafts((currentDrafts) =>
      currentDrafts.filter((_, platformIndex) => platformIndex !== index),
    );
  }

  async function handleDefaultsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceScope || !workspaceAccess) {
      toast.error("Workspace scope is required to update settings");
      return;
    }

    if (!canWriteSettings) {
      toast.error("Dashboard write access is required to update settings");
      return;
    }

    const socialPlatforms = dedupeSocialPlatformConfigs(
      socialPlatformDrafts.map((platform) => ({
        platformKey: normalizeSocialPlatformKey(platform.platformKey),
        label: platform.label.trim(),
        placeholder: platform.placeholder?.trim() || undefined,
        profileUrlPrefix: platform.profileUrlPrefix?.trim() || undefined,
      })),
    );
    const listKeys = listKeysDraft
      .split(",")
      .map((listKey) => listKey.trim())
      .filter(Boolean);

    setIsSavingDefaults(true);
    try {
      await runMutationWithToast(
        () =>
          setTenantWorkspaceDefaults({
            slug: workspaceScope.workspaceSlug,
            clerkOrganizationId: workspaceAccess.clerkOrganizationId,
            eventDefaults: {
              themeBackgroundColor: themeBackgroundColorDraft,
              themeTextColor: themeTextColorDraft,
              listKeys,
              socialPlatforms,
              invitedBy: {
                enabled: invitedByEnabledDraft,
                label: invitedByLabelDraft.trim() || undefined,
                placeholder: invitedByPlaceholderDraft.trim() || undefined,
              },
            },
          }),
        {
          loading: "Saving event defaults...",
          success: "Event defaults saved",
        },
      );
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsSavingDefaults(false);
    }
  }

  return (
    <main className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Workspace routing and tenant configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primary URL</CardTitle>
          <CardDescription>
            The main domain Coucou associates with this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="primary-domain">Primary URL</Label>
              <Input
                id="primary-domain"
                value={primaryDomainDraft}
                onChange={(event) =>
                  setPrimaryDomainDraft(event.target.value)
                }
                disabled={!canWriteSettings || isSavingPrimaryDomain}
                placeholder="dojopomodoro.club"
                inputMode="url"
              />
            </div>
            {canWriteSettings ? (
              <Button type="submit" disabled={isSavingPrimaryDomain}>
                <Save className="size-4" />
                Save settings
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your role can view settings but cannot edit them.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event defaults</CardTitle>
          <CardDescription>
            Prefilled values for new events in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleDefaultsSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-background-color">
                  Background color
                </Label>
                <Input
                  id="default-background-color"
                  type="color"
                  value={themeBackgroundColorDraft}
                  onChange={(event) =>
                    setThemeBackgroundColorDraft(event.target.value)
                  }
                  disabled={!canWriteSettings || isSavingDefaults}
                  className="h-10 cursor-pointer p-1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-text-color">Primary text color</Label>
                <Input
                  id="default-text-color"
                  type="color"
                  value={themeTextColorDraft}
                  onChange={(event) =>
                    setThemeTextColorDraft(event.target.value)
                  }
                  disabled={!canWriteSettings || isSavingDefaults}
                  className="h-10 cursor-pointer p-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default-list-names">Default list names</Label>
              <Input
                id="default-list-names"
                value={listKeysDraft}
                onChange={(event) => setListKeysDraft(event.target.value)}
                disabled={!canWriteSettings || isSavingDefaults}
                placeholder="vip, ga, backstage"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Default social fields</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_SOCIAL_PLATFORM_CONFIGS.map((platform) => (
                    <Button
                      key={platform.platformKey}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addSocialPlatform(platform)}
                      disabled={!canWriteSettings || isSavingDefaults}
                    >
                      Add {platform.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {socialPlatformDrafts.map((platform, index) => (
                  <div
                    key={`${platform.platformKey}-${index}`}
                    className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <Input
                      value={platform.platformKey}
                      onChange={(event) =>
                        updateSocialPlatform(index, {
                          platformKey: event.target.value,
                        })
                      }
                      disabled={!canWriteSettings || isSavingDefaults}
                      placeholder="instagram"
                    />
                    <Input
                      value={platform.label}
                      onChange={(event) =>
                        updateSocialPlatform(index, {
                          label: event.target.value,
                        })
                      }
                      disabled={!canWriteSettings || isSavingDefaults}
                      placeholder="Instagram"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeSocialPlatform(index)}
                      disabled={!canWriteSettings || isSavingDefaults}
                      aria-label={`Remove ${platform.label}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    <Input
                      value={platform.placeholder ?? ""}
                      onChange={(event) =>
                        updateSocialPlatform(index, {
                          placeholder: event.target.value,
                        })
                      }
                      disabled={!canWriteSettings || isSavingDefaults}
                      placeholder="@handle"
                      className="sm:col-span-1"
                    />
                    <Input
                      value={platform.profileUrlPrefix ?? ""}
                      onChange={(event) =>
                        updateSocialPlatform(index, {
                          profileUrlPrefix: event.target.value,
                        })
                      }
                      disabled={!canWriteSettings || isSavingDefaults}
                      placeholder="https://instagram.com/"
                      className="sm:col-span-2"
                    />
                  </div>
                ))}
                {socialPlatformDrafts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No default social fields configured.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="invited-by-enabled"
                  checked={invitedByEnabledDraft}
                  onCheckedChange={(checked) =>
                    setInvitedByEnabledDraft(Boolean(checked))
                  }
                  disabled={!canWriteSettings || isSavingDefaults}
                />
                <Label htmlFor="invited-by-enabled">
                  Ask for invited by
                </Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={invitedByLabelDraft}
                  onChange={(event) =>
                    setInvitedByLabelDraft(event.target.value)
                  }
                  disabled={
                    !canWriteSettings ||
                    isSavingDefaults ||
                    !invitedByEnabledDraft
                  }
                  placeholder="Invited by"
                />
                <Input
                  value={invitedByPlaceholderDraft}
                  onChange={(event) =>
                    setInvitedByPlaceholderDraft(event.target.value)
                  }
                  disabled={
                    !canWriteSettings ||
                    isSavingDefaults ||
                    !invitedByEnabledDraft
                  }
                  placeholder="Who invited you?"
                />
              </div>
            </div>

            {canWriteSettings ? (
              <Button type="submit" disabled={isSavingDefaults}>
                <Save className="size-4" />
                Save event defaults
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your role can view event defaults but cannot edit them.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

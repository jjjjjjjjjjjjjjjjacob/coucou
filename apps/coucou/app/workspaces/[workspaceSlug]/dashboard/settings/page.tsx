"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Save } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { StorageImageUpload } from "@/components/flyer-upload";
import {
  draftToPrimaryFieldConfig,
  EMPTY_PRIMARY_FIELD_CONFIG,
  type PrimaryFieldConfigDraft,
  PrimaryFieldConfigEditor,
  primaryFieldConfigToDraft,
} from "@/components/primary-field-config-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import { runMutationWithToast } from "@/lib/toast-mutation";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

type BrandMarkStyle =
  | "filled-circle"
  | "square-serif"
  | "thin-ring"
  | "logo-upload"
  | "wordmark-only";

const BRAND_MARK_STYLES: { value: BrandMarkStyle; label: string }[] = [
  { value: "filled-circle", label: "Filled circle" },
  { value: "square-serif", label: "Square serif" },
  { value: "thin-ring", label: "Thin ring" },
  { value: "logo-upload", label: "Logo upload" },
  { value: "wordmark-only", label: "Wordmark only" },
];

function optionalPrimaryDomain(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function readPrimaryDomainFromMutationResult(mutationResult: unknown): string | null | undefined {
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
  const workspaceSites = useQuery(
    api.workspaces.listTenantWorkspaceSites,
    workspaceScope && workspaceAccess?.clerkOrganizationId
      ? {
          slug: workspaceScope.workspaceSlug,
          clerkOrganizationId: workspaceAccess.clerkOrganizationId,
        }
      : "skip",
  );
  const setTenantWorkspacePrimaryDomain = useMutation(
    api.workspaces.setTenantWorkspacePrimaryDomain,
  );
  const setTenantWorkspaceDefaults = useMutation(api.workspaces.setTenantWorkspaceDefaults);
  const setTenantWorkspaceAuthBranding = useMutation(api.workspaces.setTenantWorkspaceAuthBranding);
  const setTenantWorkspaceProfileLinkSettings = useMutation(
    api.workspaces.setTenantWorkspaceProfileLinkSettings,
  );
  const [primaryDomainDraft, setPrimaryDomainDraft] = useState("");
  const [isSavingPrimaryDomain, setIsSavingPrimaryDomain] = useState(false);
  const [themeBackgroundColorDraft, setThemeBackgroundColorDraft] = useState("#FFFFFF");
  const [themeTextColorDraft, setThemeTextColorDraft] = useState("#EF4444");
  const [listKeysDraft, setListKeysDraft] = useState("vip, ga");
  const [referralSharingEnabledDraft, setReferralSharingEnabledDraft] = useState(false);
  const [primaryFieldConfigDraft, setPrimaryFieldConfigDraft] = useState<PrimaryFieldConfigDraft>(
    EMPTY_PRIMARY_FIELD_CONFIG,
  );
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [authHeadingDraft, setAuthHeadingDraft] = useState("");
  const [authSubDraft, setAuthSubDraft] = useState("");
  const [authEyebrowDraft, setAuthEyebrowDraft] = useState("");
  const [brandMarkStyleDraft, setBrandMarkStyleDraft] = useState<BrandMarkStyle>("filled-circle");
  const [authLogoStorageId, setAuthLogoStorageId] = useState<string | null>(null);
  const [authShowAttribution, setAuthShowAttribution] = useState(true);
  const [isSavingAuthBranding, setIsSavingAuthBranding] = useState(false);
  const [showCoucouProfileLinkDraft, setShowCoucouProfileLinkDraft] = useState(false);
  const [isSavingProfileLink, setIsSavingProfileLink] = useState(false);
  const canWriteSettings = workspaceAccess?.canWrite === true;

  useEffect(() => {
    setPrimaryDomainDraft(workspaceScope?.primaryDomain ?? "");
  }, [workspaceScope?.primaryDomain]);

  useEffect(() => {
    const eventDefaults = workspace?.eventDefaults;
    setThemeBackgroundColorDraft(eventDefaults?.themeBackgroundColor ?? "#FFFFFF");
    setThemeTextColorDraft(eventDefaults?.themeTextColor ?? "#EF4444");
    setListKeysDraft((eventDefaults?.listKeys ?? ["vip", "ga"]).join(", "));
    setReferralSharingEnabledDraft(eventDefaults?.referralSharingEnabled ?? false);
    setPrimaryFieldConfigDraft(
      primaryFieldConfigToDraft({
        socialPlatforms: eventDefaults?.socialPlatforms,
        invitedBy: eventDefaults?.invitedBy,
      }),
    );
  }, [workspace?.eventDefaults]);

  useEffect(() => {
    const branding = workspace?.authBranding;
    setAuthHeadingDraft(branding?.heading ?? "");
    setAuthSubDraft(branding?.sub ?? "");
    setAuthEyebrowDraft(branding?.eyebrow ?? "");
    setBrandMarkStyleDraft(
      (branding?.brandMarkStyle as BrandMarkStyle | undefined) ?? "filled-circle",
    );
    setAuthLogoStorageId(branding?.logoStorageId ?? null);
    setAuthShowAttribution(branding?.showCoucouAttribution ?? true);
  }, [workspace?.authBranding]);

  useEffect(() => {
    setShowCoucouProfileLinkDraft(workspace?.showCoucouProfileLink ?? false);
  }, [workspace?.showCoucouProfileLink]);

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
      const savedPrimaryDomain = readPrimaryDomainFromMutationResult(mutationResult);
      if (savedPrimaryDomain !== undefined) {
        setPrimaryDomainDraft(savedPrimaryDomain ?? "");
      }
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsSavingPrimaryDomain(false);
    }
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

    const sanitizedConfig = draftToPrimaryFieldConfig(primaryFieldConfigDraft);
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
              socialPlatforms: sanitizedConfig.socialPlatforms ?? [],
              invitedBy: sanitizedConfig.invitedBy ?? {
                enabled: false,
              },
              referralSharingEnabled: referralSharingEnabledDraft,
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

  async function handleAuthBrandingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceScope || !workspaceAccess) {
      toast.error("Workspace scope is required to update settings");
      return;
    }

    if (!canWriteSettings) {
      toast.error("Dashboard write access is required to update settings");
      return;
    }

    setIsSavingAuthBranding(true);
    try {
      await runMutationWithToast(
        () =>
          setTenantWorkspaceAuthBranding({
            slug: workspaceScope.workspaceSlug,
            clerkOrganizationId: workspaceAccess.clerkOrganizationId,
            authBranding: {
              heading: authHeadingDraft.trim() || undefined,
              sub: authSubDraft.trim() || undefined,
              eyebrow: authEyebrowDraft.trim() || undefined,
              brandMarkStyle: brandMarkStyleDraft,
              logoStorageId:
                brandMarkStyleDraft === "logo-upload" && authLogoStorageId
                  ? (authLogoStorageId as Id<"_storage">)
                  : undefined,
              showCoucouAttribution: authShowAttribution,
            },
          }),
        {
          loading: "Saving login branding...",
          success: "Login branding saved",
        },
      );
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsSavingAuthBranding(false);
    }
  }

  async function handleProfileLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!workspaceScope || !workspaceAccess) {
      toast.error("Workspace scope is required to update settings");
      return;
    }

    if (!canWriteSettings) {
      toast.error("Dashboard write access is required to update settings");
      return;
    }

    setIsSavingProfileLink(true);
    try {
      await runMutationWithToast(
        () =>
          setTenantWorkspaceProfileLinkSettings({
            slug: workspaceScope.workspaceSlug,
            clerkOrganizationId: workspaceAccess.clerkOrganizationId,
            showCoucouProfileLink: showCoucouProfileLinkDraft,
          }),
        {
          loading: "Saving profile link...",
          success: "Profile link saved",
        },
      );
    } catch {
      // Error toast is handled by runMutationWithToast.
    } finally {
      setIsSavingProfileLink(false);
    }
  }

  return (
    <main className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Workspace routing and tenant configuration.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primary URL</CardTitle>
          <CardDescription>The main domain Coucou associates with this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="primary-domain">Primary URL</Label>
              <Input
                id="primary-domain"
                value={primaryDomainDraft}
                onChange={(event) => setPrimaryDomainDraft(event.target.value)}
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
          <CardDescription>Prefilled values for new events in this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleDefaultsSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-background-color">Background color</Label>
                <Input
                  id="default-background-color"
                  type="color"
                  value={themeBackgroundColorDraft}
                  onChange={(event) => setThemeBackgroundColorDraft(event.target.value)}
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
                  onChange={(event) => setThemeTextColorDraft(event.target.value)}
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

            <PrimaryFieldConfigEditor
              value={primaryFieldConfigDraft}
              onChange={setPrimaryFieldConfigDraft}
              disabled={!canWriteSettings || isSavingDefaults}
            />

            <label className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Checkbox
                checked={referralSharingEnabledDraft}
                onCheckedChange={(checked) => setReferralSharingEnabledDraft(Boolean(checked))}
                disabled={!canWriteSettings || isSavingDefaults}
              />
              <span>
                Show the guest referral sharing CTA on pending status pages and approved tickets.
                Off by default.
              </span>
            </label>

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

      <Card>
        <CardHeader>
          <CardTitle>Login experience</CardTitle>
          <CardDescription>Branding shown on this workspace&apos;s sign-in page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleAuthBrandingSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="auth-eyebrow">Eyebrow</Label>
                <Input
                  id="auth-eyebrow"
                  value={authEyebrowDraft}
                  onChange={(event) => setAuthEyebrowDraft(event.target.value)}
                  disabled={!canWriteSettings || isSavingAuthBranding}
                  placeholder="Members"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="auth-heading">Heading</Label>
                <Input
                  id="auth-heading"
                  value={authHeadingDraft}
                  onChange={(event) => setAuthHeadingDraft(event.target.value)}
                  disabled={!canWriteSettings || isSavingAuthBranding}
                  placeholder="Welcome back"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-sub">Sub-heading</Label>
              <Input
                id="auth-sub"
                value={authSubDraft}
                onChange={(event) => setAuthSubDraft(event.target.value)}
                disabled={!canWriteSettings || isSavingAuthBranding}
                placeholder="Sign in to view your tickets and RSVPs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-mark-style">Brand mark style</Label>
              <Select
                id="brand-mark-style"
                value={brandMarkStyleDraft}
                onValueChange={(value) => setBrandMarkStyleDraft(value as BrandMarkStyle)}
                disabled={!canWriteSettings || isSavingAuthBranding}
              >
                {BRAND_MARK_STYLES.map((style) => (
                  <SelectOption key={style.value} value={style.value}>
                    {style.label}
                  </SelectOption>
                ))}
              </Select>
            </div>
            {brandMarkStyleDraft === "logo-upload" ? (
              <div className="space-y-2">
                <Label>Logo</Label>
                <StorageImageUpload
                  value={authLogoStorageId}
                  onChange={(value) => setAuthLogoStorageId(value ?? null)}
                  emptyStateTitle="Drag & drop logo"
                  emptyStateDescription="or click to upload an image"
                  uploadedTitle="Logo uploaded"
                  previewAlt="Workspace logo preview"
                  helperText="PNG or SVG recommended."
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Checkbox
                checked={authShowAttribution}
                onCheckedChange={(checked) => setAuthShowAttribution(Boolean(checked))}
                disabled={!canWriteSettings || isSavingAuthBranding}
              />
              <span>Show &ldquo;Powered by Coucou&rdquo; attribution</span>
            </label>

            {canWriteSettings ? (
              <Button type="submit" disabled={isSavingAuthBranding}>
                <Save className="size-4" />
                Save login branding
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your role can view login branding but cannot edit it.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile sharing</CardTitle>
          <CardDescription>
            Optionally surface a link from this tenant&apos;s profile page to the user&apos;s
            aggregated Coucou profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleProfileLinkSubmit}>
            <label className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Checkbox
                checked={showCoucouProfileLinkDraft}
                onCheckedChange={(checked) => setShowCoucouProfileLinkDraft(Boolean(checked))}
                disabled={!canWriteSettings || isSavingProfileLink}
              />
              <span>
                Show a &ldquo;View your full Coucou profile&rdquo; link on this tenant&apos;s
                profile page. Off by default; signed-in users still navigate to coucou.com without
                re-authenticating.
              </span>
            </label>

            {canWriteSettings ? (
              <Button type="submit" disabled={isSavingProfileLink}>
                <Save className="size-4" />
                Save profile link
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your role can view this setting but cannot edit it.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domain authentication</CardTitle>
          <CardDescription>
            Clerk satellite verification status for each connected domain. Verification and frontend
            API URL changes are managed by Coucou staff — contact support to make changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workspaceSites === undefined ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : workspaceSites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connected domains.</p>
          ) : (
            <div className="space-y-3">
              {workspaceSites.map((site) => (
                <div
                  key={site._id}
                  className="border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{site.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      Site key: {site.siteKey}
                      {site.clerkFrontendApiUrl ? ` · Clerk URL: ${site.clerkFrontendApiUrl}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="capitalize">
                      {site.clerkSatelliteVerificationStatus ?? "unconfigured"}
                    </Badge>
                    {site.clerkSatelliteAuthEnabled ? (
                      <Badge variant="default">Satellite auth on</Badge>
                    ) : (
                      <Badge variant="outline">Satellite auth off</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

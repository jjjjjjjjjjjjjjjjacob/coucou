"use client";

import {
  DEFAULT_SOCIAL_PLATFORM_CONFIGS,
  dedupeSocialPlatformConfigs,
  type InvitedByPrimaryFieldConfig,
  isPresetSocialPlatformKey,
  normalizeSocialPlatformKey,
  type PrimaryFieldConfig,
  type PrimarySocialPlatformConfig,
} from "@coucou/sdk/shared/primary-fields";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type InvitedByConfigDraft = {
  enabled: boolean;
  label: string;
  placeholder: string;
  required: boolean;
};

export type PrimaryFieldConfigDraft = {
  socialPlatforms: PrimarySocialPlatformConfig[];
  invitedBy: InvitedByConfigDraft;
};

const EMPTY_INVITED_BY: InvitedByConfigDraft = {
  enabled: false,
  label: "Invited by",
  placeholder: "Who invited you?",
  required: true,
};

export const EMPTY_PRIMARY_FIELD_CONFIG: PrimaryFieldConfigDraft = {
  socialPlatforms: [],
  invitedBy: EMPTY_INVITED_BY,
};

export function primaryFieldConfigToDraft(
  config: PrimaryFieldConfig | undefined,
): PrimaryFieldConfigDraft {
  const invitedByConfig = config?.invitedBy;
  return {
    socialPlatforms: config?.socialPlatforms ?? [],
    invitedBy: {
      enabled: invitedByConfig?.enabled ?? false,
      label: invitedByConfig?.label ?? EMPTY_INVITED_BY.label,
      placeholder: invitedByConfig?.placeholder ?? EMPTY_INVITED_BY.placeholder,
      required: invitedByConfig ? invitedByConfig.required === true : EMPTY_INVITED_BY.required,
    },
  };
}

export function draftToPrimaryFieldConfig(draft: PrimaryFieldConfigDraft): PrimaryFieldConfig {
  const socialPlatforms = dedupeSocialPlatformConfigs(
    draft.socialPlatforms.map((platform) => ({
      platformKey: normalizeSocialPlatformKey(platform.platformKey),
      label: platform.label.trim(),
      placeholder: platform.placeholder?.trim() || undefined,
      profileUrlPrefix: platform.profileUrlPrefix?.trim() || undefined,
      required: platform.required === true ? true : undefined,
    })),
  );
  const invitedBy: InvitedByPrimaryFieldConfig | undefined = draft.invitedBy.enabled
    ? {
        enabled: true,
        label: draft.invitedBy.label.trim() || undefined,
        placeholder: draft.invitedBy.placeholder.trim() || undefined,
        required: draft.invitedBy.required === true ? true : undefined,
      }
    : undefined;
  return {
    socialPlatforms: socialPlatforms.length > 0 ? socialPlatforms : undefined,
    invitedBy,
  };
}

export interface PrimaryFieldConfigEditorProps {
  value: PrimaryFieldConfigDraft;
  onChange: (next: PrimaryFieldConfigDraft) => void;
  disabled?: boolean;
}

export function PrimaryFieldConfigEditor({
  value,
  onChange,
  disabled = false,
}: PrimaryFieldConfigEditorProps) {
  const addSocialPlatform = (platform: PrimarySocialPlatformConfig) => {
    onChange({
      ...value,
      socialPlatforms: dedupeSocialPlatformConfigs([...value.socialPlatforms, platform]),
    });
  };

  const updateSocialPlatform = (index: number, patch: Partial<PrimarySocialPlatformConfig>) => {
    onChange({
      ...value,
      socialPlatforms: value.socialPlatforms.map((platform, platformIndex) =>
        platformIndex === index ? { ...platform, ...patch } : platform,
      ),
    });
  };

  const removeSocialPlatform = (index: number) => {
    onChange({
      ...value,
      socialPlatforms: value.socialPlatforms.filter((_, platformIndex) => platformIndex !== index),
    });
  };

  const updateInvitedBy = (patch: Partial<InvitedByConfigDraft>) => {
    onChange({ ...value, invitedBy: { ...value.invitedBy, ...patch } });
  };

  const updateInvitedByEnabled = (enabled: boolean) => {
    updateInvitedBy(
      enabled && !value.invitedBy.enabled ? { enabled, required: true } : { enabled },
    );
  };

  const addCustomPlatform = () => {
    onChange({
      ...value,
      socialPlatforms: [
        ...value.socialPlatforms,
        {
          platformKey: "",
          label: "",
          placeholder: "",
          profileUrlPrefix: "",
          required: false,
        },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label>Social fields</Label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_SOCIAL_PLATFORM_CONFIGS.map((platform) => (
              <Button
                key={platform.platformKey}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSocialPlatform(platform)}
                disabled={disabled}
              >
                Add {platform.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCustomPlatform}
              disabled={disabled}
            >
              Add custom
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {value.socialPlatforms.map((platform, index) => {
            const isPreset = isPresetSocialPlatformKey(platform.platformKey);
            return (
              <div
                key={`${platform.platformKey}-${index}`}
                className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div className="flex flex-col gap-1">
                  <Input
                    value={platform.platformKey}
                    onChange={(event) =>
                      updateSocialPlatform(index, {
                        platformKey: event.target.value,
                      })
                    }
                    disabled={disabled || isPreset}
                    placeholder="instagram"
                    aria-label="Platform key"
                  />
                  {isPreset ? (
                    <p className="text-[11px] text-muted-foreground">
                      Preset key — locked so this platform stays consistent across events.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Custom key. Use lowercase letters, numbers, or dashes.
                    </p>
                  )}
                </div>
                <Input
                  value={platform.label}
                  onChange={(event) => updateSocialPlatform(index, { label: event.target.value })}
                  disabled={disabled}
                  placeholder="Instagram"
                  aria-label="Display label"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeSocialPlatform(index)}
                  disabled={disabled}
                  aria-label={`Remove ${platform.label || platform.platformKey}`}
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
                  disabled={disabled}
                  placeholder="@handle"
                  className="sm:col-span-1"
                  aria-label="Placeholder"
                />
                <Input
                  value={platform.profileUrlPrefix ?? ""}
                  onChange={(event) =>
                    updateSocialPlatform(index, {
                      profileUrlPrefix: event.target.value,
                    })
                  }
                  disabled={disabled}
                  placeholder="https://instagram.com/"
                  className="sm:col-span-2"
                  aria-label="Profile URL prefix"
                />
                <div className="flex items-center gap-2 sm:col-span-3">
                  <Checkbox
                    id={`social-required-${index}`}
                    checked={platform.required === true}
                    onCheckedChange={(checked) =>
                      updateSocialPlatform(index, {
                        required: Boolean(checked),
                      })
                    }
                    disabled={disabled}
                  />
                  <Label
                    htmlFor={`social-required-${index}`}
                    className="text-sm font-normal text-muted-foreground"
                  >
                    Required
                  </Label>
                </div>
              </div>
            );
          })}
          {value.socialPlatforms.length === 0 && (
            <p className="text-sm text-muted-foreground">No social fields configured.</p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="invited-by-enabled"
            checked={value.invitedBy.enabled}
            onCheckedChange={(checked) => updateInvitedByEnabled(Boolean(checked))}
            disabled={disabled}
          />
          <Label htmlFor="invited-by-enabled">Ask for invited by</Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={value.invitedBy.label}
            onChange={(event) => updateInvitedBy({ label: event.target.value })}
            disabled={disabled || !value.invitedBy.enabled}
            placeholder="Invited by"
          />
          <Input
            value={value.invitedBy.placeholder}
            onChange={(event) => updateInvitedBy({ placeholder: event.target.value })}
            disabled={disabled || !value.invitedBy.enabled}
            placeholder="Who invited you?"
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="invited-by-required"
            checked={value.invitedBy.required}
            onCheckedChange={(checked) => updateInvitedBy({ required: Boolean(checked) })}
            disabled={disabled || !value.invitedBy.enabled}
          />
          <Label
            htmlFor="invited-by-required"
            className="text-sm font-normal text-muted-foreground"
          >
            Required
          </Label>
        </div>
      </div>
    </div>
  );
}

export interface PrimaryFieldConfigOverrideEditorProps {
  value: PrimaryFieldConfigDraft;
  onChange: (next: PrimaryFieldConfigDraft) => void;
  useDefaults: boolean;
  onUseDefaultsChange: (next: boolean) => void;
  workspaceDefaults: PrimaryFieldConfigDraft;
  disabled?: boolean;
}

export function PrimaryFieldConfigOverrideEditor({
  value,
  onChange,
  useDefaults,
  onUseDefaultsChange,
  workspaceDefaults,
  disabled = false,
}: PrimaryFieldConfigOverrideEditorProps) {
  const handleToggle = (nextUseDefaults: boolean) => {
    onUseDefaultsChange(nextUseDefaults);
    if (nextUseDefaults) {
      onChange(workspaceDefaults);
    }
  };

  // Auto-clear the "use defaults" checkbox the moment the user makes any change
  // so the change actually persists per-event.
  const handleEditorChange = (next: PrimaryFieldConfigDraft) => {
    if (useDefaults) {
      onUseDefaultsChange(false);
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <Checkbox
          checked={useDefaults}
          onCheckedChange={(checked) => handleToggle(Boolean(checked))}
          disabled={disabled}
        />
        <div className="space-y-0.5">
          <span className="font-medium">Use workspace defaults</span>
          <p className="text-xs text-muted-foreground">
            Currently inheriting the workspace&apos;s social fields and invited-by settings. Edit
            anything below to customize for this event.
          </p>
        </div>
      </label>
      <PrimaryFieldConfigEditor value={value} onChange={handleEditorChange} disabled={disabled} />
    </div>
  );
}

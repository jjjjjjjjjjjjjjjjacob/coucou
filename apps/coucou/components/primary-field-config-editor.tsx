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
import { Field, FieldDescription, FieldLabel, FieldSwitchRow } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
                className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor={`social-platform-key-${index}`}>Platform key</FieldLabel>
                      <Input
                        id={`social-platform-key-${index}`}
                        value={platform.platformKey}
                        onChange={(event) =>
                          updateSocialPlatform(index, {
                            platformKey: event.target.value,
                          })
                        }
                        disabled={disabled || isPreset}
                        placeholder="instagram"
                      />
                      <FieldDescription className="text-xs">
                        {isPreset
                          ? "Preset key — locked so this platform stays consistent across events."
                          : "Custom key. Use lowercase letters, numbers, or dashes."}
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`social-label-${index}`}>Display label</FieldLabel>
                      <Input
                        id={`social-label-${index}`}
                        value={platform.label}
                        onChange={(event) =>
                          updateSocialPlatform(index, { label: event.target.value })
                        }
                        disabled={disabled}
                        placeholder="Instagram"
                      />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSocialPlatform(index)}
                    disabled={disabled}
                    aria-label={`Remove ${platform.label || platform.platformKey}`}
                    className="relative h-8 w-8 shrink-0 text-[var(--text-secondary)] after:absolute after:-inset-1.5 after:content-[''] hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`social-placeholder-${index}`}>Placeholder</FieldLabel>
                    <Input
                      id={`social-placeholder-${index}`}
                      value={platform.placeholder ?? ""}
                      onChange={(event) =>
                        updateSocialPlatform(index, {
                          placeholder: event.target.value,
                        })
                      }
                      disabled={disabled}
                      placeholder="@handle"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`social-url-prefix-${index}`}>
                      Profile URL prefix
                    </FieldLabel>
                    <Input
                      id={`social-url-prefix-${index}`}
                      value={platform.profileUrlPrefix ?? ""}
                      onChange={(event) =>
                        updateSocialPlatform(index, {
                          profileUrlPrefix: event.target.value,
                        })
                      }
                      disabled={disabled}
                      placeholder="https://instagram.com/"
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`social-required-${index}`}
                    checked={platform.required === true}
                    onCheckedChange={(checked) =>
                      updateSocialPlatform(index, {
                        required: checked,
                      })
                    }
                    disabled={disabled}
                  />
                  <Label
                    htmlFor={`social-required-${index}`}
                    className="text-sm font-normal text-[var(--text-secondary)]"
                  >
                    Required
                  </Label>
                </div>
              </div>
            );
          })}
          {value.socialPlatforms.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center text-sm text-[var(--text-secondary)]">
              No social fields configured.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Label htmlFor="invited-by-enabled">Ask for invited by</Label>
            <p className="text-pretty text-sm text-[var(--text-secondary)]">
              Guests say who invited them during RSVP.
            </p>
          </div>
          <Switch
            id="invited-by-enabled"
            checked={value.invitedBy.enabled}
            onCheckedChange={(checked) => updateInvitedByEnabled(checked)}
            disabled={disabled}
          />
        </div>
        {value.invitedBy.enabled ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="invited-by-label">Question label</FieldLabel>
                <Input
                  id="invited-by-label"
                  value={value.invitedBy.label}
                  onChange={(event) => updateInvitedBy({ label: event.target.value })}
                  disabled={disabled}
                  placeholder="Invited by"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invited-by-placeholder">Placeholder</FieldLabel>
                <Input
                  id="invited-by-placeholder"
                  value={value.invitedBy.placeholder}
                  onChange={(event) => updateInvitedBy({ placeholder: event.target.value })}
                  disabled={disabled}
                  placeholder="Who invited you?"
                />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="invited-by-required"
                checked={value.invitedBy.required}
                onCheckedChange={(checked) => updateInvitedBy({ required: checked })}
                disabled={disabled}
              />
              <Label
                htmlFor="invited-by-required"
                className="text-sm font-normal text-[var(--text-secondary)]"
              >
                Required
              </Label>
            </div>
          </>
        ) : null}
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
      <FieldSwitchRow
        title="Use workspace defaults"
        description="Currently inheriting the workspace's social fields and invited-by settings. Edit anything below to customize for this event."
        checked={useDefaults}
        onCheckedChange={handleToggle}
        disabled={disabled}
      />
      <PrimaryFieldConfigEditor value={value} onChange={handleEditorChange} disabled={disabled} />
    </div>
  );
}

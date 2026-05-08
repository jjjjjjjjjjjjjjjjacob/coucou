"use client";

import type { PresetDefinition, PresetKey } from "@coucou/sdk";
import { useTenantTemplate, useTenantTemplateOptional } from "./provider";

/**
 * Hook for components that must render inside <TenantTemplateProvider>.
 * Throws if not.
 */
export function usePreset(): {
  preset: PresetDefinition;
  presetKey: PresetKey;
} {
  const { preset, presetKey } = useTenantTemplate();
  return { preset, presetKey };
}

/**
 * Hook for components that may render outside the provider (previews, demos).
 * Falls back to the dojo preset by default.
 */
export function usePresetOptional(fallback: PresetKey = "dojo"): {
  preset: PresetDefinition;
  presetKey: PresetKey;
} {
  const { preset, presetKey } = useTenantTemplateOptional(fallback);
  return { preset, presetKey };
}

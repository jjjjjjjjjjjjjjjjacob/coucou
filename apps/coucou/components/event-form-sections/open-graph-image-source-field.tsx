"use client";

import {
  DEFAULT_OPEN_GRAPH_IMAGE_SOURCE,
  type OpenGraphImageSource,
} from "@coucou/sdk/shared/open-graph";
import { Globe2, ImageIcon } from "lucide-react";
import type { Path } from "react-hook-form";
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { BaseEventFormValues, UseFormReturn } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPEN_GRAPH_IMAGE_OPTIONS: Array<{
  value: OpenGraphImageSource;
  label: string;
  description: string;
  icon: typeof Globe2;
}> = [
  {
    value: "thumbnail",
    label: "Event thumbnail",
    description: "Use the uploaded flyer, with the Danza globe as a fallback.",
    icon: ImageIcon,
  },
  {
    value: "logo",
    label: "Danza globe",
    description: "Always show the globe mark, even when this event has a flyer.",
    icon: Globe2,
  },
];

export function OpenGraphImageSourceField<FormValues extends BaseEventFormValues>({
  form,
}: {
  form: UseFormReturn<FormValues>;
}) {
  return (
    <FormField
      control={form.control}
      name={"openGraphImageSource" as Path<FormValues>}
      render={({ field }) => {
        const selectedSource =
          field.value === "logo" || field.value === "thumbnail"
            ? field.value
            : DEFAULT_OPEN_GRAPH_IMAGE_SOURCE;

        return (
          <FormItem className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
            <div>
              <FormLabel>Social preview image</FormLabel>
              <FormDescription>
                Choose the image shown when this Danza event link is shared.
              </FormDescription>
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Social preview image</legend>
              {OPEN_GRAPH_IMAGE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedSource === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors",
                      "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                      isSelected
                        ? "border-[var(--text-primary)] bg-[var(--surface-2)]"
                        : "border-[var(--border-subtle)] hover:border-[var(--text-tertiary)]",
                    )}
                  >
                    <input
                      type="radio"
                      name={field.name}
                      value={option.value}
                      aria-label={option.label}
                      checked={isSelected}
                      onBlur={field.onBlur}
                      onChange={() => field.onChange(option.value)}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-1)]"
                          : "border-[var(--border-subtle)] text-[var(--text-secondary)]",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--text-primary)]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

"use client";
import React from "react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FlyerUpload } from "@/components/flyer-upload";
import { EventIconUpload } from "@/components/event-icon-upload";
import type { UseFormReturn, BaseEventFormValues } from "@/lib/types";
import type { Path } from "react-hook-form";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
} from "@/lib/event-theme";

export interface EventLookSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
  eventIconStorageId: string | null;
  onEventIconChange: (value: string | null) => void;
  flyerStorageId: string | null;
  onFlyerChange: (value: string | null) => void;
}

export function EventLookSection<FormValues extends BaseEventFormValues>({
  form,
  eventIconStorageId,
  onEventIconChange,
  flyerStorageId,
  onFlyerChange,
}: EventLookSectionProps<FormValues>) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">LOOK</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={"themeBackgroundColor" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange } = field;
            return (
              <FormItem>
                <FormLabel>Background Color</FormLabel>
                <FormDescription>
                  Applied to guest RSVP and ticket pages.
                </FormDescription>
                <FormControl>
                  <Input
                    type="color"
                    value={
                      (typeof value === "string" ? value : undefined) ??
                      EVENT_THEME_DEFAULT_BACKGROUND_COLOR
                    }
                    onChange={(event) => onChange(event.target.value)}
                    className="h-10 w-full cursor-pointer p-1"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name={"themeTextColor" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange } = field;
            return (
              <FormItem>
                <FormLabel>Primary Text Color</FormLabel>
                <FormDescription>
                  Used for emphasis across guest experiences.
                </FormDescription>
                <FormControl>
                  <Input
                    type="color"
                    value={
                      (typeof value === "string" ? value : undefined) ??
                      EVENT_THEME_DEFAULT_TEXT_COLOR
                    }
                    onChange={(event) => onChange(event.target.value)}
                    className="h-10 w-full cursor-pointer p-1"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name={"customIconStorageId" as Path<FormValues>}
          render={() => (
            <FormItem className="md:col-span-2">
              <FormLabel>
                Event Icon{" "}
                <span className="text-sm text-muted-foreground">
                  (optional)
                </span>
              </FormLabel>
              <FormDescription>
                Overrides the default favicon and navigation icon wherever
                custom theming is applied.
              </FormDescription>
              <FormControl>
                <EventIconUpload
                  value={eventIconStorageId}
                  onChange={onEventIconChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={form.control}
        name={"flyerStorageId" as Path<FormValues>}
        render={() => (
          <FormItem>
            <FormLabel>Upload Flyer (Optional)</FormLabel>
            <FormControl>
              <FlyerUpload value={flyerStorageId} onChange={onFlyerChange} />
            </FormControl>
          </FormItem>
        )}
      />
      <details className="rounded-md border bg-muted/20 p-3">
        <summary className="text-xs font-medium text-muted-foreground cursor-pointer select-none">
          Advanced — legacy QR color
        </summary>
        <div className="pt-3">
          <FormField
            control={form.control}
            name={"qrCodeColor" as Path<FormValues>}
            render={({ field }) => {
              const { value, onChange } = field;
              return (
                <FormItem>
                  <FormLabel>
                    QR Code Color{" "}
                    <span className="text-sm text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormDescription>
                    Guest QR codes now use the event theme colors above. This
                    legacy field is kept for compatibility.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="color"
                      value={
                        (typeof value === "string" ? value : undefined) ??
                        "#000000"
                      }
                      onChange={(event) => onChange(event.target.value)}
                      disabled
                      className="h-10 w-full p-1 disabled:cursor-not-allowed"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>
      </details>
    </div>
  );
}

"use client";
import type { Path } from "react-hook-form";
import { EventIconUpload } from "@/components/event-icon-upload";
import { type EventPartnerDraft, EventPartnersEditor } from "@/components/event-partners-editor";
import { FlyerUpload } from "@/components/flyer-upload";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import {
  EVENT_THEME_DEFAULT_ACCENT_COLOR,
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
} from "@/lib/event-theme";
import type { BaseEventFormValues, UseFormReturn } from "@/lib/types";
import { OpenGraphImageSourceField } from "./open-graph-image-source-field";

export interface EventLookSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
  eventIconStorageId: string | null;
  onEventIconChange: (value: string | null) => void;
  flyerStorageId: string | null;
  onFlyerChange: (value: string | null) => void;
  showOpenGraphImageSource?: boolean;
  eventPartners?: EventPartnerDraft[];
  onEventPartnersChange?: (entries: EventPartnerDraft[]) => void;
  sponsors?: EventPartnerDraft[];
  onSponsorsChange?: (entries: EventPartnerDraft[]) => void;
}

export function EventLookSection<FormValues extends BaseEventFormValues>({
  form,
  eventIconStorageId,
  onEventIconChange,
  flyerStorageId,
  onFlyerChange,
  showOpenGraphImageSource = false,
  eventPartners = [],
  onEventPartnersChange,
  sponsors = [],
  onSponsorsChange,
}: EventLookSectionProps<FormValues>) {
  return (
    <SectionCard
      title="Branding"
      description="Theme colors, event icon, flyer, and guest QR appearance."
      contentClassName="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name={"themeBackgroundColor" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange } = field;
            return (
              <FormItem>
                <FormLabel>Background Color</FormLabel>
                <FormDescription>Applied to guest RSVP and ticket pages.</FormDescription>
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
                <FormDescription>Used for emphasis across guest experiences.</FormDescription>
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
          name={"themeAccentColor" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange } = field;
            return (
              <FormItem>
                <FormLabel>Accent Color</FormLabel>
                <FormDescription>Used for actions, links, and focus highlights.</FormDescription>
                <FormControl>
                  <Input
                    type="color"
                    value={
                      (typeof value === "string" ? value : undefined) ??
                      EVENT_THEME_DEFAULT_ACCENT_COLOR
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
            <FormItem className="md:col-span-3">
              <FormLabel>
                Event Icon <span className="text-sm text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormDescription>
                Overrides the default favicon and navigation icon wherever custom theming is
                applied.
              </FormDescription>
              <FormControl>
                <EventIconUpload value={eventIconStorageId} onChange={onEventIconChange} />
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
      {showOpenGraphImageSource ? <OpenGraphImageSourceField form={form} /> : null}
      {onEventPartnersChange ? (
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <div>
            <div className="text-sm font-medium">Event partners</div>
            <p className="text-sm text-muted-foreground">
              Wordmarks shown in tenant-defined placements on the guest experience.
            </p>
          </div>
          <EventPartnersEditor
            entries={eventPartners}
            entryName="partner"
            onChange={onEventPartnersChange}
          />
        </div>
      ) : null}
      {onSponsorsChange ? (
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <div>
            <div className="text-sm font-medium">Sponsors</div>
            <p className="text-sm text-muted-foreground">
              Ordered sponsor marks displayed with event editorial details.
            </p>
          </div>
          <EventPartnersEditor entries={sponsors} entryName="sponsor" onChange={onSponsorsChange} />
        </div>
      ) : null}
      <details className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5">
        <summary className="cursor-pointer select-none text-sm font-medium text-[var(--text-primary)]">
          Advanced QR appearance
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
                    QR Code Color <span className="text-sm text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormDescription>
                    Sets the foreground color used by generated guest QR codes where supported.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="color"
                      value={(typeof value === "string" ? value : undefined) ?? "#000000"}
                      onChange={(event) => onChange(event.target.value)}
                      className="h-10 w-full cursor-pointer p-1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>
      </details>
    </SectionCard>
  );
}

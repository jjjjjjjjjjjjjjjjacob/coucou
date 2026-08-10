"use client";
import type React from "react";
import { EventDetailsSection } from "@/components/event-form-sections/event-details-section";
import { EventGuestPageSection } from "@/components/event-form-sections/event-guest-page-section";
import { EventLookSection } from "@/components/event-form-sections/event-look-section";
import { EventScheduleSection } from "@/components/event-form-sections/event-schedule-section";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import type { BaseEventFormValues, UseFormReturn } from "@/lib/types";

export interface HostEventFormProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
  onSubmit: (values: FormValues) => Promise<void> | void;
  submitLabel: string;
  submittingLabel?: string;
  isSubmitting: boolean;
  flyerStorageId: string | null;
  onFlyerChange: (value: string | null) => void;
  eventIconStorageId: string | null;
  onEventIconChange: (value: string | null) => void;
  showOpenGraphImageSource?: boolean;
  guestPortalImageStorageId: string | null;
  onGuestPortalImageChange: (value: string | null) => void;
  listsSection?: React.ReactNode;
  actsSection?: React.ReactNode;
  customFieldsSection?: React.ReactNode;
  footer?: React.ReactNode;
}

export function HostEventForm<FormValues extends BaseEventFormValues>({
  form,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting,
  flyerStorageId,
  onFlyerChange,
  eventIconStorageId,
  onEventIconChange,
  showOpenGraphImageSource = false,
  guestPortalImageStorageId,
  onGuestPortalImageChange,
  listsSection,
  actsSection,
  customFieldsSection,
  footer,
}: HostEventFormProps<FormValues>) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <EventDetailsSection form={form} />
        {actsSection ? <div className="rounded-lg border bg-card p-4">{actsSection}</div> : null}
        <EventGuestPageSection
          form={form}
          guestPortalImageStorageId={guestPortalImageStorageId}
          onGuestPortalImageChange={onGuestPortalImageChange}
        />
        <EventScheduleSection form={form} />
        <EventLookSection
          form={form}
          eventIconStorageId={eventIconStorageId}
          onEventIconChange={onEventIconChange}
          flyerStorageId={flyerStorageId}
          onFlyerChange={onFlyerChange}
          showOpenGraphImageSource={showOpenGraphImageSource}
        />
        {listsSection}
        {customFieldsSection}
        {footer ?? (
          <div className="flex justify-end pt-4 border-t">
            <Button type="submit" disabled={isSubmitting} size="lg">
              {isSubmitting ? (submittingLabel ?? `${submitLabel}...`) : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}

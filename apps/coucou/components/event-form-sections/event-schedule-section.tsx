"use client";
import type { Path, PathValue } from "react-hook-form";
import { DateTimePicker } from "@/components/date-time-picker";
import { FieldSwitchRow } from "@/components/ui/field";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectOption } from "@/components/ui/select";
import type { BaseEventFormValues, UseFormReturn } from "@/lib/types";

export interface EventScheduleSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
  showEndPolicy?: boolean;
}

export function EventScheduleSection<FormValues extends BaseEventFormValues>({
  form,
  showEndPolicy = false,
}: EventScheduleSectionProps<FormValues>) {
  const selectedEventTime = form.watch("eventTime" as Path<FormValues>) as string | undefined;
  const selectedEventTimezone = form.watch("eventTimezone" as Path<FormValues>) as
    | string
    | undefined;
  const selectedEventDate = form.watch("eventDate" as Path<FormValues>) as string | undefined;

  const displayTime = selectedEventTime ?? "19:00";
  const displayTimezone = selectedEventTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayDate = selectedEventDate;

  return (
    <SectionCard
      title="Schedule & capacity"
      description="Start time, automatic event close, attendee limits, and RSVP availability."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={"eventDate" as Path<FormValues>}
          rules={{ required: "Event date is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start Date, Time & Timezone</FormLabel>
              <FormDescription>
                The event closes automatically at midnight or 4:00 AM for late events.
              </FormDescription>
              <FormControl>
                <DateTimePicker
                  date={displayDate}
                  time={displayTime}
                  timezone={displayTimezone}
                  onDateChange={(value) => field.onChange(value)}
                  onTimeChange={(value) =>
                    form.setValue(
                      "eventTime" as Path<FormValues>,
                      value as PathValue<FormValues, Path<FormValues>>,
                      { shouldDirty: true },
                    )
                  }
                  onTimezoneChange={(value) =>
                    form.setValue(
                      "eventTimezone" as Path<FormValues>,
                      value as PathValue<FormValues, Path<FormValues>>,
                      { shouldDirty: true },
                    )
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {showEndPolicy ? (
          <FormField
            control={form.control}
            name={"endsLate" as Path<FormValues>}
            render={({ field }) => (
              <FormItem>
                <FieldSwitchRow
                  title="Late event"
                  description="Late events close at 4:00 AM the following day. Standard events close at midnight on the event date."
                  checked={Boolean(field.value)}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}
        <FormField
          control={form.control}
          name={"maxAttendees" as Path<FormValues>}
          render={({ field }) => (
            <FormItem className="w-full max-w-xs md:max-w-[12rem] md:ml-auto">
              <FormLabel>Max Attendees</FormLabel>
              <FormControl>
                <Select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={field.value ? String(field.value) : "1"}
                  onValueChange={(value) =>
                    field.onChange(
                      Number.parseInt(value, 10) as PathValue<FormValues, Path<FormValues>>,
                    )
                  }
                >
                  <SelectOption value="1">1 (No plus-ones)</SelectOption>
                  <SelectOption value="2">2</SelectOption>
                  <SelectOption value="3">3</SelectOption>
                  <SelectOption value="4">4</SelectOption>
                  <SelectOption value="5">5</SelectOption>
                  <SelectOption value="6">6</SelectOption>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}

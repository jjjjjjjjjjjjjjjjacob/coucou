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
import { Select, SelectOption } from "@/components/ui/select";
import { DateTimePicker } from "@/components/date-time-picker";
import type { UseFormReturn, BaseEventFormValues } from "@/lib/types";
import type { Path, PathValue } from "react-hook-form";

export interface EventScheduleSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
}

export function EventScheduleSection<FormValues extends BaseEventFormValues>({
  form,
}: EventScheduleSectionProps<FormValues>) {
  const selectedEventTime = form.watch("eventTime" as Path<FormValues>) as
    | string
    | undefined;
  const selectedEventTimezone = form.watch(
    "eventTimezone" as Path<FormValues>,
  ) as string | undefined;
  const selectedEventDate = form.watch("eventDate" as Path<FormValues>) as
    | string
    | undefined;

  const displayTime = selectedEventTime ?? "19:00";
  const displayTimezone =
    selectedEventTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayDate = selectedEventDate;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        DATE & CAPACITY
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={"eventDate" as Path<FormValues>}
          rules={{ required: "Event date is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Start Date, Time & Timezone</FormLabel>
              <FormDescription>
                RSVPs close 24 hours after this start time.
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
                      Number.parseInt(value, 10) as PathValue<
                        FormValues,
                        Path<FormValues>
                      >,
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
        <FormField
          control={form.control}
          name={"status" as Path<FormValues>}
          render={({ field }) => (
            <FormItem className="w-full max-w-xs">
              <FormLabel>RSVP Status</FormLabel>
              <FormDescription>
                Active events can receive RSVP submissions.
              </FormDescription>
              <FormControl>
                <Select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={(field.value as string | undefined) ?? "inactive"}
                  onValueChange={(value) =>
                    field.onChange(
                      value as PathValue<FormValues, Path<FormValues>>,
                    )
                  }
                >
                  <SelectOption value="inactive">Inactive</SelectOption>
                  <SelectOption value="active">Active</SelectOption>
                  <SelectOption value="past">Past</SelectOption>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}

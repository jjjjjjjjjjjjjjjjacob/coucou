"use client";
import type { Path } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import type { BaseEventFormValues, UseFormReturn } from "@/lib/types";

export interface EventDetailsSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
}

export function EventDetailsSection<FormValues extends BaseEventFormValues>({
  form,
}: EventDetailsSectionProps<FormValues>) {
  return (
    <SectionCard
      title="Overview"
      description="Names, guest-facing description, location, and organizers."
      contentClassName="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={"name" as Path<FormValues>}
          rules={{ required: "Name is required" }}
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field;
            return (
              <FormItem>
                <FormLabel>Event Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter event name"
                    value={(value as string | undefined) ?? ""}
                    onChange={onChange}
                    ref={ref}
                    {...rest}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name={"secondaryTitle" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field;
            return (
              <FormItem>
                <FormLabel>
                  Secondary Title <span className="text-sm text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="After Party, Hosted by..."
                    value={(value as string | undefined) ?? ""}
                    onChange={onChange}
                    ref={ref}
                    {...rest}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
        <FormField
          control={form.control}
          name={"description" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field;
            return (
              <FormItem className="md:col-span-2">
                <FormLabel>
                  Event Description{" "}
                  <span className="text-sm text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Short guest-facing description"
                    value={(value as string | undefined) ?? ""}
                    onChange={onChange}
                    ref={ref}
                    rows={4}
                    {...rest}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>
      <FormField
        control={form.control}
        name={"location" as Path<FormValues>}
        rules={{ required: "Location is required" }}
        render={({ field }) => {
          const { value, onChange, ref, ...rest } = field;
          return (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter venue or location"
                  value={(value as string | undefined) ?? ""}
                  onChange={onChange}
                  ref={ref}
                  {...rest}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </SectionCard>
  );
}

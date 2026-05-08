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
import { Textarea } from "@/components/ui/textarea";
import type { UseFormReturn, BaseEventFormValues } from "@/lib/types";
import type { Path } from "react-hook-form";

export interface EventDetailsSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
}

export function EventDetailsSection<FormValues extends BaseEventFormValues>({
  form,
}: EventDetailsSectionProps<FormValues>) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        EVENT DETAILS
      </h3>
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
                  Secondary Title{" "}
                  <span className="text-sm text-muted-foreground">
                    (optional)
                  </span>
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
                  <span className="text-sm text-muted-foreground">
                    (optional)
                  </span>
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
      <FormField
        control={form.control}
        name={"hosts" as Path<FormValues>}
        render={({ field }) => {
          const { value, onChange, ref, ...rest } = field;
          return (
            <FormItem>
              <FormLabel>Host Names (optional, comma-separated)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Host Name 1, Host Name 2"
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
        name={"productionCompany" as Path<FormValues>}
        render={({ field }) => {
          const { value, onChange, ref, ...rest } = field;
          return (
            <FormItem>
              <FormLabel>
                Production Company{" "}
                <span className="text-sm text-muted-foreground">
                  (optional)
                </span>
              </FormLabel>
              <FormDescription>
                Overrides host names in consent messaging and SMS notifications.
              </FormDescription>
              <FormControl>
                <Input
                  placeholder="Production Company Name"
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
    </div>
  );
}

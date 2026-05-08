"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import type { Event, CustomField, UseFormReturn, RSVPFormData } from "@/lib/types";
import type { Path } from "react-hook-form";
import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export function GuestInfoFields({
  form,
  event,
  name,
  setName,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  custom,
  setCustom,
  socialProfiles,
  setSocialProfiles,
  invitedByName,
  setInvitedByName,
  phone,
  openUserProfile,
  isSignedIn,
}: {
  form: UseFormReturn<RSVPFormData>;
  event: Event;
  name: string; // Keep during migration phase
  setName: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  custom: Record<string, string>;
  setCustom: (
    updater: (m: Record<string, string>) => Record<string, string>,
  ) => void;
  socialProfiles: Record<string, string>;
  setSocialProfiles: (
    updater: (current: Record<string, string>) => Record<string, string>,
  ) => void;
  invitedByName: string;
  setInvitedByName: (value: string) => void;
  phone: string;
  openUserProfile?: () => void;
  isSignedIn?: boolean;
}) {
  return (
    <div className="rounded border border-primary/30 p-3 space-y-2">
      <div className="font-semibold text-sm text-primary">YOUR INFO</div>
      <div className="grid grid-cols-2 gap-2">
        <FormField
          control={form.control}
          name="firstName"
          rules={{ required: "First name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-primary text-xs font-medium">
                FIRST NAME <span className="text-xs text-primary/70">(required)</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="First name"
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={firstName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFirstName(value);
                    field.onChange(value);
                    setName(`${value} ${lastName}`.trim());
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          rules={{ required: "Last name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-primary text-xs font-medium">
                LAST NAME <span className="text-xs text-primary/70">(required)</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Last name"
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={lastName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLastName(value);
                    field.onChange(value);
                    setName(`${firstName} ${value}`.trim());
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {(event?.customFields || []).map((customField: CustomField) => (
        <FormField
          key={customField.key}
          control={form.control}
          name={`custom.${customField.key}` as Path<RSVPFormData>}
          rules={
            customField.required
              ? {
                  required: `${customField.label || customField.key} is required`,
                }
              : undefined
          }
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field
            return (
              <FormItem>
                <FormLabel className="text-primary text-xs font-medium flex items-center gap-1">
                  {customField.label || customField.key}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="How hosts use custom field information"
                        className="size-4 flex items-center justify-center rounded-full border border-primary/40 text-primary/70 hover:border-primary hover:text-primary transition-colors"
                      >
                        <Info className="size-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="text-xs leading-relaxed text-primary/80">
                      <p className="mb-2">
                        Hosts review these answers to understand guest needs, manage capacity, and make approval decisions. Provide accurate details so they can plan properly.
                      </p>
                      <p className="mb-2">
                        After your RSVP is submitted you can revisit and update these values anytime from your account dashboard.
                      </p>
                      <a
                        href="/profile"
                        className="text-primary font-semibold underline underline-offset-4"
                      >
                        Go to account dashboard
                      </a>
                    </PopoverContent>
                  </Popover>
                  {customField.required && (
                    <span className="text-xs text-primary/70"> (required)</span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      customField.placeholder ||
                      customField.label ||
                      customField.key
                    }
                    className="border border-primary/20 placeholder:text-primary/50 text-primary"
                    value={(value as string | undefined) ?? ""}
                    onChange={(event) => {
                      const rawValue = event.target.value
                      const shouldTrim = customField.trimWhitespace !== false
                      const nextValue = shouldTrim ? rawValue.trim() : rawValue
                      setCustom((m) => ({
                        ...m,
                        [customField.key]: nextValue,
                      }))
                      onChange(nextValue)
                    }}
                    ref={ref}
                    {...rest}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )
          }}
        />
      ))}

      {(event.primaryFieldConfig?.socialPlatforms ?? []).map((platform) => (
        <FormField
          key={platform.platformKey}
          control={form.control}
          name={`socialProfiles.${platform.platformKey}` as Path<RSVPFormData>}
          rules={
            platform.required
              ? {
                  required: `${platform.label} is required`,
                }
              : undefined
          }
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field;
            return (
              <FormItem>
                <FormLabel className="text-primary text-xs font-medium">
                  {platform.label}
                  {platform.required && (
                    <span className="text-xs text-primary/70"> (required)</span>
                  )}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={platform.placeholder ?? "@handle"}
                    className="border border-primary/20 placeholder:text-primary/50 text-primary"
                    value={(value as string | undefined) ?? ""}
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      setSocialProfiles((current) => ({
                        ...current,
                        [platform.platformKey]: nextValue,
                      }));
                      onChange(nextValue);
                    }}
                    ref={ref}
                    {...rest}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      ))}

      {event.primaryFieldConfig?.invitedBy?.enabled === true && (
        <FormField
          control={form.control}
          name="invitedByName"
          rules={
            event.primaryFieldConfig?.invitedBy?.required
              ? {
                  required: `${event.primaryFieldConfig?.invitedBy?.label ?? "Invited by"} is required`,
                }
              : undefined
          }
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-primary text-xs font-medium">
                {event.primaryFieldConfig?.invitedBy?.label ?? "Invited by"}
                {event.primaryFieldConfig?.invitedBy?.required && (
                  <span className="text-xs text-primary/70"> (required)</span>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    event.primaryFieldConfig?.invitedBy?.placeholder ??
                    "Who invited you?"
                  }
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={invitedByName}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setInvitedByName(nextValue);
                    field.onChange(nextValue);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <div className="flex flex-col gap-1">
        <Label className="text-sm flex items-center gap-2 text-xs text-primary font-medium">
          PHONE
        </Label>
        <div className="flex gap-4">
          <Input
            key="phone"
            className="text-sm text-primary/90 border border-primary/20 placeholder:text-primary/50 text-primary/80 disabled:opacity-100"
            value={phone}
            disabled
          />
          {isSignedIn ? (
            <Button
              variant="outline"
              onClick={() => openUserProfile?.()}
              className="border-primary/30 text-primary/70"
            >
              UPDATE
            </Button>
          ) : (
            <div className="text-xs text-primary/60 flex items-center">
              Sign in to update
            </div>
          )}
        </div>
      </div>

      {/* Attendees selection */}
      <FormField
        control={form.control}
        name="attendees"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-primary font-medium">
              ATTENDEES{" "}
              {event.maxAttendees && event.maxAttendees > 1
                ? `(${event.maxAttendees} max)`
                : null}
            </FormLabel>
            <FormControl>
              {(event?.maxAttendees ?? 1) === 1 ? (
                <Select
                  value="1"
                  disabled
                  className="border border-primary/20 text-primary disabled:opacity-100"
                >
                  <SelectOption value="1">1 (No Plus Ones)</SelectOption>
                </Select>
              ) : (
                <Select
                  value={field.value?.toString() || "1"}
                  onValueChange={(value) => field.onChange(parseInt(value, 10))}
                  className="border border-primary/20 text-primary"
                >
                  {Array.from({ length: event?.maxAttendees ?? 1 }, (_, i) => (
                    <SelectOption key={i + 1} value={(i + 1).toString()}>
                      {i + 1}
                    </SelectOption>
                  ))}
                </Select>
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export function NoteForHostsField({
  note,
  setNote,
}: {
  note: string;
  setNote: (value: string) => void;
}) {
  return (
    <div className="rounded border border-primary/30 p-3 space-y-2">
      <div className="font-medium text-xs text-primary">
        NOTE FOR HOSTS (optional)
      </div>
      <Textarea
        placeholder="Anything hosts should know"
        className="border border-primary/20 placeholder:text-primary/30 text-primary"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
    </div>
  );
}

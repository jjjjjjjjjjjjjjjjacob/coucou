"use client";
import { Info } from "lucide-react";
import type { ReactNode } from "react";
import type { Path } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import type { CustomField, Event, RSVPFormData, UseFormReturn } from "@/lib/types";

export function GuestInfoFields({
  form,
  event,
  setName,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  setCustom,
  setSocialProfiles,
  invitedByName,
  setInvitedByName,
  afterNameFields,
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
  setCustom: (updater: (m: Record<string, string>) => Record<string, string>) => void;
  socialProfiles: Record<string, string>;
  setSocialProfiles: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  invitedByName: string;
  setInvitedByName: (value: string) => void;
  afterNameFields?: ReactNode;
}) {
  return (
    <div className="space-y-3">
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

      {afterNameFields}

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
            const { value, onChange, ref, ...rest } = field;
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
                    <PopoverContent
                      align="start"
                      className="text-xs leading-relaxed text-primary/80"
                    >
                      <p className="mb-2">
                        Hosts review these answers to understand guest needs, manage capacity, and
                        make approval decisions. Provide accurate details so they can plan properly.
                      </p>
                      <p className="mb-2">
                        After your RSVP is submitted you can revisit and update these values anytime
                        from your account dashboard.
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
                    placeholder={customField.placeholder || customField.label || customField.key}
                    className="border border-primary/20 placeholder:text-primary/50 text-primary"
                    value={(value as string | undefined) ?? ""}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      const shouldTrim = customField.trimWhitespace !== false;
                      const nextValue = shouldTrim ? rawValue.trim() : rawValue;
                      setCustom((m) => ({
                        ...m,
                        [customField.key]: nextValue,
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
                    event.primaryFieldConfig?.invitedBy?.placeholder ?? "Who invited you?"
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
    <div className="space-y-2">
      <div className="font-medium text-xs text-primary">NOTE FOR HOSTS (optional)</div>
      <Textarea
        placeholder="Anything hosts should know"
        className="border border-primary/20 placeholder:text-primary/30 text-primary"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
    </div>
  );
}

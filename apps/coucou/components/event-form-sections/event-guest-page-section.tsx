"use client";
import type { Path, PathValue } from "react-hook-form";
import { StorageImageUpload } from "@/components/flyer-upload";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { BaseEventFormValues, UseFormReturn } from "@/lib/types";

export interface EventGuestPageSectionProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
  guestPortalImageStorageId: string | null;
  onGuestPortalImageChange: (value: string | null) => void;
}

export function EventGuestPageSection<FormValues extends BaseEventFormValues>({
  form,
  guestPortalImageStorageId,
  onGuestPortalImageChange,
}: EventGuestPageSectionProps<FormValues>) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">GUEST EXPERIENCE</h3>
      <FormField
        control={form.control}
        name={"guestPortalImageStorageId" as Path<FormValues>}
        render={() => (
          <FormItem className="md:col-span-2">
            <FormLabel>
              Status & Ticket Image{" "}
              <span className="text-sm text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormDescription>
              Displayed on the guest status screen while approval is pending and beneath approved
              tickets.
            </FormDescription>
            <FormControl>
              <StorageImageUpload
                value={guestPortalImageStorageId ?? null}
                onChange={(value) => {
                  onGuestPortalImageChange(value ?? null);
                  form.setValue(
                    "guestPortalImageStorageId" as Path<FormValues>,
                    value as PathValue<FormValues, Path<FormValues>>,
                    { shouldDirty: true },
                  );
                }}
                emptyStateTitle="Drag & drop guest image"
                emptyStateDescription="or click to upload an image"
                uploadedTitle="Guest image uploaded"
                previewAlt="Guest experience image preview"
                helperText="Recommended size: square or portrait image."
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name={"guestPortalLinkLabel" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field;
            return (
              <FormItem>
                <FormLabel>
                  Guest Link Button Label{" "}
                  <span className="text-sm text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormDescription>Provide a descriptive call-to-action for guests.</FormDescription>
                <FormControl>
                  <Input
                    placeholder="View event guide"
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
          name={"guestPortalLinkUrl" as Path<FormValues>}
          render={({ field }) => {
            const { value, onChange, ref, ...rest } = field;
            return (
              <FormItem>
                <FormLabel>
                  Guest Link URL <span className="text-sm text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormDescription>
                  Must be a full URL (https://example.com). Button appears only when both label and
                  URL are provided.
                </FormDescription>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://example.com/arrival-details"
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
    </div>
  );
}

"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CustomFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  copyEnabled?: boolean;
  prependUrl?: string;
  trimWhitespace?: boolean;
};

function CustomFieldPreview({ field }: { field: CustomFieldDef }) {
  if (!field.label || !field.key) return null;

  return (
    <div className="bg-muted/50 rounded p-3 border-l-2 border-primary/20">
      <div className="text-xs text-muted-foreground mb-1">PREVIEW:</div>
      <div className="space-y-1">
        <label className="text-sm font-medium">
          {field.label}{" "}
          {field.required && <span className="text-red-500">*</span>}
        </label>
        <Input
          placeholder={
            field.placeholder || `Enter ${field.label.toLowerCase()}`
          }
          disabled
          className="opacity-60"
        />
      </div>
    </div>
  );
}

/**
 * Base component for custom fields management
 * Handles all shared logic between form and controlled modes
 */
function CustomFieldsBuilder({
  mode,
  initialFields,
  onChange,
}: {
  mode: "form" | "controlled";
  initialFields?: CustomFieldDef[];
  onChange?: (fields: CustomFieldDef[]) => void;
}) {
  const isMobile = useIsMobile();
  const withDefaults = React.useCallback(
    (array: CustomFieldDef[]): CustomFieldDef[] =>
      array.map((field) => ({
        key: field.key ?? "",
        label: field.label ?? "",
        placeholder: field.placeholder ?? "",
        required: field.required ?? false,
        copyEnabled: field.copyEnabled ?? false,
        prependUrl: field.prependUrl ?? "",
        trimWhitespace:
          field.trimWhitespace === undefined ? true : field.trimWhitespace,
      })),
    [],
  );
  const [fields, setFields] = React.useState<CustomFieldDef[]>(
    withDefaults(initialFields ?? []),
  );

  React.useEffect(() => {
    if (mode === "controlled" && initialFields) {
      setFields(withDefaults(initialFields));
    }
  }, [initialFields, mode, withDefaults]);

  // Call onChange when fields change (controlled mode only)
  React.useEffect(() => {
    if (mode === "controlled" && onChange) {
      onChange(fields);
    }
  }, [fields, onChange, mode]);

  const set = (
    index: number,
    key: keyof CustomFieldDef,
    value: string | boolean,
  ) =>
    setFields((array) =>
      array.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );

  const remove = (index: number) =>
    setFields((array) => array.filter((_, idx) => idx !== index));

  const add = () =>
    setFields((array) => [
      ...array,
      {
        key: "",
        label: "",
        placeholder: "",
        required: false,
        copyEnabled: false,
        prependUrl: "",
        trimWhitespace: true,
      },
    ]);

  const copy = (index: number) => {
    const fieldToCopy = fields[index];
    const copiedField: CustomFieldDef = {
      ...fieldToCopy,
      key: fieldToCopy.key ? `${fieldToCopy.key}_copy` : "",
      label: fieldToCopy.label ? `${fieldToCopy.label} (Copy)` : "",
    };
    setFields((array) => {
      const newArray = [...array];
      newArray.splice(index + 1, 0, copiedField);
      return newArray;
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        CUSTOM RSVP FIELDS
      </h3>
      <div className="space-y-6">
        {fields.map((field, index) => (
          <div key={index} className="space-y-4">
            {index > 0 && <div className="border-t" />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Field Configuration */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Field Key
                    </label>
                    <Input
                      placeholder="e.g. instagram, phone, dietary"
                      value={field.key}
                      onChange={(e) => set(index, "key", e.target.value.trim())}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Display Label
                    </label>
                    <Input
                      placeholder="e.g. Instagram Handle"
                      value={field.label}
                      onChange={(e) =>
                        set(index, "label", e.target.value.trim())
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Placeholder Text
                  </label>
                  <Input
                    placeholder="e.g. @username or Enter your dietary restrictions"
                    value={field.placeholder || ""}
                    onChange={(e) =>
                      set(index, "placeholder", e.target.value.trim())
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Prepend URL (optional)
                  </label>
                  <Input
                    placeholder="e.g. https://instagram.com/ or https://twitter.com/"
                    value={field.prependUrl || ""}
                    onChange={(e) =>
                      set(index, "prependUrl", e.target.value.trim())
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    When provided, creates clickable links by prepending this URL to field values
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size={!isMobile ? "default" : "sm"}
                        className="justify-between"
                      >
                        Options
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-52">
                      <DropdownMenuLabel>Toggle behaviors</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={!!field.required}
                        onCheckedChange={(isRequired) =>
                          set(index, "required", Boolean(isRequired))
                        }
                      >
                        Required response
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={field.trimWhitespace !== false}
                        onCheckedChange={(shouldTrim) =>
                          set(
                            index,
                            "trimWhitespace",
                            shouldTrim === undefined ? true : Boolean(shouldTrim),
                          )
                        }
                      >
                        Trim whitespace on submit
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>RSVP display</DropdownMenuLabel>
                      <DropdownMenuCheckboxItem
                        checked={!!field.copyEnabled}
                        onCheckedChange={(copyEnabled) =>
                          set(index, "copyEnabled", Boolean(copyEnabled))
                        }
                      >
                        Enable copy shortcut
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size={!isMobile ? "default" : "sm"}
                      onClick={() => copy(index)}
                      className="flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size={!isMobile ? "default" : "sm"}
                      onClick={() => remove(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {field.required && (
                    <Badge variant="secondary" className="text-xs">
                      Required
                    </Badge>
                  )}
                  {field.copyEnabled && (
                    <Badge variant="secondary" className="text-xs">
                      Copy shortcut
                    </Badge>
                  )}
                  {field.trimWhitespace === false && (
                    <Badge variant="secondary" className="text-xs">
                      Preserve whitespace
                    </Badge>
                  )}
                  {field.prependUrl && (
                    <Badge variant="secondary" className="text-xs">
                      Link enabled
                    </Badge>
                  )}
                </div>
                <CustomFieldPreview field={field} />
              </div>
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No custom fields added yet.</p>
            <p className="text-xs">
              Custom fields allow you to collect additional information from
              guests during RSVP.
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={add}
          className="w-full"
        >
          + Add Custom Field
        </Button>
      </div>

      {/* Hidden form input for form mode */}
      {mode === "form" && (
        <input
          type="hidden"
          name="customFields"
          value={JSON.stringify(fields)}
        />
      )}
    </div>
  );
}

/**
 * Form-integrated version for event creation
 * Outputs custom fields via hidden form input
 */
export function CustomFieldsBuilderForm() {
  return <CustomFieldsBuilder mode="form" />;
}

/**
 * Controlled version for event editing
 * Takes initial fields and onChange callback
 */
export function CustomFieldsEditor({
  initial,
  onChange,
}: {
  initial?: CustomFieldDef[];
  onChange: (fields: CustomFieldDef[]) => void;
}) {
  return (
    <CustomFieldsBuilder
      mode="controlled"
      initialFields={initial}
      onChange={onChange}
    />
  );
}

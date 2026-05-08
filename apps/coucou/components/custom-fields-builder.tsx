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
const RESERVED_PRIMARY_FIELD_KEYS = ["invitedBy", "invitedByName"];

function normalizeReservedKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildReservedKeyMap(
  reservedKeys: string[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const reservedKey of [
    ...RESERVED_PRIMARY_FIELD_KEYS,
    ...(reservedKeys ?? []),
  ]) {
    const normalized = normalizeReservedKey(reservedKey);
    if (!normalized) continue;
    if (!map.has(normalized)) {
      map.set(normalized, reservedKey);
    }
  }
  return map;
}

function applyCustomFieldDefaults(
  customFields: CustomFieldDef[],
): CustomFieldDef[] {
  return customFields.map((customField) => ({
    key: customField.key ?? "",
    label: customField.label ?? "",
    placeholder: customField.placeholder ?? "",
    required: customField.required ?? false,
    copyEnabled: customField.copyEnabled ?? false,
    prependUrl: customField.prependUrl ?? "",
    trimWhitespace:
      customField.trimWhitespace === undefined
        ? true
        : customField.trimWhitespace,
  }));
}

function areCustomFieldDefinitionsEqual(
  previousFields: CustomFieldDef[],
  nextFields: CustomFieldDef[],
): boolean {
  if (previousFields.length !== nextFields.length) {
    return false;
  }

  return previousFields.every((previousField, fieldIndex) => {
    const nextField = nextFields[fieldIndex];
    return (
      previousField.key === nextField.key &&
      previousField.label === nextField.label &&
      previousField.placeholder === nextField.placeholder &&
      previousField.required === nextField.required &&
      previousField.copyEnabled === nextField.copyEnabled &&
      previousField.prependUrl === nextField.prependUrl &&
      previousField.trimWhitespace === nextField.trimWhitespace
    );
  });
}

function CustomFieldsBuilder({
  mode,
  initialFields,
  onChange,
  reservedKeys,
}: {
  mode: "form" | "controlled";
  initialFields?: CustomFieldDef[];
  onChange?: (fields: CustomFieldDef[]) => void;
  reservedKeys?: string[];
}) {
  const isMobile = useIsMobile();
  const [fields, setFields] = React.useState<CustomFieldDef[]>(() =>
    applyCustomFieldDefaults(initialFields ?? []),
  );

  React.useEffect(() => {
    if (mode === "controlled" && initialFields) {
      const fieldsWithDefaults = applyCustomFieldDefaults(initialFields);
      setFields((currentFields) =>
        areCustomFieldDefinitionsEqual(currentFields, fieldsWithDefaults)
          ? currentFields
          : fieldsWithDefaults,
      );
    }
  }, [initialFields, mode]);

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
    setFields((currentFields) =>
      currentFields.map((customField, fieldIndex) =>
        fieldIndex === index ? { ...customField, [key]: value } : customField,
      ),
    );

  const remove = (index: number) =>
    setFields((currentFields) =>
      currentFields.filter((_, fieldIndex) => fieldIndex !== index),
    );

  const add = () =>
    setFields((currentFields) => [
      ...currentFields,
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
    setFields((currentFields) => {
      const fieldsWithCopy = [...currentFields];
      fieldsWithCopy.splice(index + 1, 0, copiedField);
      return fieldsWithCopy;
    });
  };

  const reservedKeyMap = React.useMemo(
    () => buildReservedKeyMap(reservedKeys),
    [reservedKeys],
  );

  const reservedKeyConflict = React.useCallback(
    (key: string): string | null => {
      const normalized = normalizeReservedKey(key);
      if (!normalized) return null;
      const original = reservedKeyMap.get(normalized);
      return original ?? null;
    },
    [reservedKeyMap],
  );

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-medium text-sm text-muted-foreground">
        CUSTOM RSVP FIELDS
      </h3>
      <div className="space-y-6">
        {fields.map((field, index) => {
          const conflict = reservedKeyConflict(field.key);
          return (
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
                      onChange={(e) => set(index, "key", e.target.value)}
                      aria-invalid={conflict ? true : undefined}
                    />
                    {conflict ? (
                      <p className="text-xs text-destructive mt-1">
                        &ldquo;{conflict}&rdquo; is reserved for a primary
                        field. Pick a different key or remove that primary
                        field above.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Display Label
                    </label>
                    <Input
                      placeholder="e.g. Instagram Handle"
                      value={field.label}
                      onChange={(e) => set(index, "label", e.target.value)}
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
                      set(index, "placeholder", e.target.value)
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
                      set(index, "prependUrl", e.target.value)
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
          );
        })}

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
  reservedKeys,
}: {
  initial?: CustomFieldDef[];
  onChange: (fields: CustomFieldDef[]) => void;
  reservedKeys?: string[];
}) {
  return (
    <CustomFieldsBuilder
      mode="controlled"
      initialFields={initial}
      onChange={onChange}
      reservedKeys={reservedKeys}
    />
  );
}

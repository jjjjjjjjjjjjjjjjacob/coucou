"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface InlineEditableTextProps {
  value: string;
  onChange: (value: string) => void | Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  validate?: (value: string) => string | null;
  disabled?: boolean;
}

export function InlineEditableText({
  value,
  onChange,
  multiline = false,
  placeholder,
  className,
  inputClassName,
  validate,
  disabled = false,
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState(value);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setDraftValue(value);
    }
  }, [value, isEditing]);

  const startEditing = () => {
    if (disabled) return;
    setDraftValue(value);
    setErrorMessage(null);
    setIsEditing(true);
  };

  const commit = async () => {
    if (isSubmitting) return;
    const trimmedValue = draftValue.trim();
    if (validate) {
      const validationError = validate(trimmedValue);
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
    }
    if (trimmedValue === value.trim()) {
      setIsEditing(false);
      setErrorMessage(null);
      return;
    }
    setIsSubmitting(true);
    try {
      await onChange(trimmedValue);
      setIsEditing(false);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage((error as Error).message || "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancel = () => {
    setIsEditing(false);
    setDraftValue(value);
    setErrorMessage(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      void commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.target.select();
  };

  if (isEditing) {
    const commonInputClasses = cn(
      "h-auto w-full rounded border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1 text-sm focus-visible:border-[var(--border-focus)] focus-visible:ring-1 focus-visible:ring-[var(--border-focus)]",
      inputClassName,
    );
    return (
      <div className={cn("w-full", className)}>
        {multiline ? (
          <Textarea
            autoFocus
            value={draftValue}
            onChange={(event) => {
              setDraftValue(event.target.value);
              setErrorMessage(null);
            }}
            onBlur={() => void commit()}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            disabled={isSubmitting}
            className={commonInputClasses}
            rows={3}
          />
        ) : (
          <Input
            autoFocus
            value={draftValue}
            onChange={(event) => {
              setDraftValue(event.target.value);
              setErrorMessage(null);
            }}
            onBlur={() => void commit()}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder={placeholder}
            disabled={isSubmitting}
            className={commonInputClasses}
          />
        )}
        {errorMessage ? (
          <p className="mt-1 text-xs text-[var(--status-denied)]">{errorMessage}</p>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={startEditing}
      className={cn(
        "group block w-full text-left",
        !value && "italic text-[var(--text-secondary)]",
        className,
      )}
      title="Double-click to edit"
      aria-label={value ? `Double-click to edit ${value}` : "Double-click to edit"}
      disabled={disabled}
    >
      <span className="border-b border-dashed border-[var(--border-subtle)] pb-0.5 transition-colors group-hover:border-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
        {value || placeholder || "Double-click to edit"}
      </span>
    </button>
  );
}

export default InlineEditableText;

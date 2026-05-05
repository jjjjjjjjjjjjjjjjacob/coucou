"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useHapticContext } from "@/contexts/haptic-context";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  onValueChange?: (value: string) => void;
  hapticFeedback?: boolean;
};

export function Select({
  className,
  onChange,
  onValueChange,
  hapticFeedback = true,
  children,
  ...props
}: SelectProps) {
  const { trigger } = useHapticContext();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (hapticFeedback) {
      trigger("selection");
    }
    onChange?.(event);
    onValueChange?.(event.target.value);
  };

  return (
    <select
      className={cn(
        "border-input h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-ring/40",
        className,
      )}
      onChange={handleChange}
      {...props}
    >
      {children}
    </select>
  );
}

export function SelectOption({
  className,
  ...props
}: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option className={cn(className)} {...props} />;
}

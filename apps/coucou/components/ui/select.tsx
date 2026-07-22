"use client";
import type * as React from "react";
import { useHapticContext } from "@/contexts/haptic-context";
import { cn } from "@/lib/utils";

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
  style,
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
        "border-input h-9 w-full min-w-0 appearance-none rounded-md border bg-background py-1 pr-10 pl-3 text-sm transition-colors focus-visible:border-ring focus-visible:ring-ring/40",
        className,
      )}
      onChange={handleChange}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M6 8l4 4 4-4' stroke='%23a0a0a0' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 0.75rem center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "1rem",
        ...style,
      }}
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

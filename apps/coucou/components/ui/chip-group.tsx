"use client";

import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface ChipProps {
  label: React.ReactNode;
  detail?: React.ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

export function Chip({ label, detail, onRemove, removeLabel, className }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-3)] py-0.5 pl-2.5 text-xs font-medium text-[var(--text-primary)]",
        onRemove ? "pr-1" : "pr-2.5",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {detail ? <span className="shrink-0 text-[var(--text-secondary)]">{detail}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          onKeyDown={(keyboardEvent) => {
            if (keyboardEvent.key === "Backspace" || keyboardEvent.key === "Delete") {
              keyboardEvent.preventDefault();
              onRemove();
            }
          }}
          aria-label={removeLabel ?? "Remove"}
          className="rounded-full p-0.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

interface ChipGroupProps {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function ChipGroup({ children, className, ...props }: ChipGroupProps) {
  return (
    <div
      role="list"
      aria-label={props["aria-label"]}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {children}
    </div>
  );
}

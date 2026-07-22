import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

type StatusBadgeVariant =
  | "approved"
  | "pending"
  | "denied"
  | "issued"
  | "redeemed"
  | "disabled"
  | "draft"
  | "published"
  | "past"
  | "default";

const statusBadgeVariants = cva(
  "inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        approved: "border-transparent",
        pending: "border-transparent",
        denied: "border-transparent",
        issued: "border-transparent",
        redeemed: "border-transparent",
        disabled: "border-transparent",
        draft: "border-transparent",
        published: "border-transparent",
        past: "border-transparent",
        default: "border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const statusDotVariants = cva("size-[6px] rounded-full", {
  variants: {
    variant: {
      approved: "bg-[var(--status-approved)]",
      pending: "bg-[var(--status-pending)]",
      denied: "bg-[var(--status-denied)]",
      issued: "bg-[var(--status-issued)]",
      redeemed: "bg-[var(--status-redeemed)]",
      disabled: "bg-[var(--status-default)]",
      draft: "bg-[var(--status-draft)]",
      published: "bg-[var(--status-published)]",
      past: "bg-[var(--status-past)]",
      default: "bg-[var(--status-default)]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const STATUS_LABELS: Record<StatusBadgeVariant, string> = {
  approved: "Approved",
  pending: "Pending",
  denied: "Denied",
  issued: "Issued",
  redeemed: "Redeemed",
  disabled: "Disabled",
  draft: "Draft",
  published: "Published",
  past: "Past",
  default: "Unknown",
};

const STATUS_FOREGROUND_CLASSES: Record<StatusBadgeVariant, string> = {
  approved: "text-[var(--status-approved)]",
  pending: "text-[var(--status-pending)]",
  denied: "text-[var(--status-denied)]",
  issued: "text-[var(--status-issued)]",
  redeemed: "text-[var(--status-redeemed)]",
  disabled: "text-[var(--status-default)]",
  draft: "text-[var(--status-draft)]",
  published: "text-[var(--status-published)]",
  past: "text-[var(--status-past)]",
  default: "text-[var(--status-default)]",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  label?: string;
  showDot?: boolean;
}

function StatusBadge({
  className,
  variant = "default",
  label,
  showDot = true,
  ...props
}: StatusBadgeProps) {
  const safeVariant = variant ?? "default";
  const displayLabel = label ?? STATUS_LABELS[safeVariant];
  return (
    <span
      className={cn(
        statusBadgeVariants({ variant }),
        STATUS_FOREGROUND_CLASSES[safeVariant],
        "bg-transparent",
        className,
      )}
      title={displayLabel}
      {...props}
    >
      {showDot ? <span className={cn(statusDotVariants({ variant }))} /> : null}
      <span>{displayLabel}</span>
    </span>
  );
}

export { STATUS_LABELS, StatusBadge, statusBadgeVariants, statusDotVariants };

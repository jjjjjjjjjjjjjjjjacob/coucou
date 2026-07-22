"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface PropertyPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PropertyPanel({ children, className, ...props }: PropertyPanelProps) {
  return (
    <aside
      className={cn(
        "shrink-0 lg:flex lg:w-[300px] lg:flex-col lg:border-l lg:border-[var(--border-subtle)] xl:w-[340px]",
        className,
      )}
      {...props}
    >
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-6 lg:pl-6">
        <div className="space-y-5 [&>*+*]:border-t [&>*+*]:border-[var(--border-subtle)] [&>*+*]:pt-5">
          {children}
        </div>
      </div>
    </aside>
  );
}

interface PropertySectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: React.ReactNode;
}

export function PropertySection({ title, children, className, ...props }: PropertySectionProps) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      {title ? (
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          {title}
        </h4>
      ) : null}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface PropertyRowProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function PropertyRow({
  icon,
  label,
  children,
  action,
  className,
  ...props
}: PropertyRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 text-sm", className)} {...props}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {icon ? <span className="mt-0.5 text-[var(--text-tertiary)]">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="text-[var(--text-tertiary)]">{label}</div>
          <div className="text-[var(--text-primary)]">{children}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface PropertyValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  muted?: boolean;
  mono?: boolean;
}

export function PropertyValue({ children, muted, mono, className, ...props }: PropertyValueProps) {
  return (
    <span
      className={cn(
        "block truncate tabular-nums",
        muted ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
        mono ? "font-mono text-xs" : "text-sm",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

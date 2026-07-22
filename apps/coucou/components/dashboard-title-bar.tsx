"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useWorkspaceOperationPath } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface DashboardTitleBarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
  backHref?: string;
  actions?: React.ReactNode;
  /** @deprecated Use actions instead */
  action?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  /** @deprecated Use secondaryActions instead */
  secondaryAction?: React.ReactNode;
}

export function DashboardTitleBar({
  title,
  subtitle,
  icon,
  breadcrumb = [],
  backHref,
  actions,
  action,
  secondaryActions,
  secondaryAction,
  className,
  ...props
}: DashboardTitleBarProps) {
  const workspaceOverviewHref = useWorkspaceOperationPath("host");

  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              const resolvedHref =
                item.href ?? (item.label === "Workspace" ? workspaceOverviewHref : undefined);
              return (
                <React.Fragment key={item.label}>
                  {index === 0 && icon ? (
                    <li className="flex items-center gap-1.5">
                      <span className="text-[var(--text-secondary)]">{icon}</span>
                    </li>
                  ) : null}
                  <li className="flex items-center">
                    {resolvedHref ? (
                      <Link
                        href={resolvedHref}
                        className="hover:text-[var(--text-primary)] hover:underline"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className={isLast ? "text-[var(--text-secondary)]" : undefined}>
                        {item.label}
                      </span>
                    )}
                  </li>
                  {!isLast ? (
                    <li aria-hidden="true">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </li>
                  ) : null}
                </React.Fragment>
              );
            })}
          </ol>
        </nav>

        <div className="space-y-1">
          {backHref ? (
            <Button
              variant="link"
              size="sm"
              asChild
              className="h-auto p-0 text-[var(--text-secondary)]"
            >
              <Link href={backHref}>← Back</Link>
            </Button>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] text-pretty">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {secondaryActions || secondaryAction ? (
          <div className="hidden items-center gap-2 sm:flex">
            {secondaryActions || secondaryAction}
          </div>
        ) : null}
        {actions || action ? (
          <div className="flex items-center gap-2">{actions || action}</div>
        ) : null}
      </div>
    </div>
  );
}

export default DashboardTitleBar;

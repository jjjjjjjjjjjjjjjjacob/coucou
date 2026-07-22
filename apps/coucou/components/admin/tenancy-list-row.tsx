"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { TenancyContextMenu } from "@/components/admin/tenancy-context-menu";
import { TenancyListRowActions } from "@/components/admin/tenancy-list-row-actions";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { copyTextWithToast } from "@/lib/clipboard";
import { buildWorkspaceOperationPath } from "@/lib/workspace-config";

export interface TenancyListItem {
  _id: string;
  slug: string;
  name: string;
  kind?: string;
  primaryDomain?: string;
  eventCount: number;
  guestCount: number;
  plan?: { tier: string; priceCents?: number; billingStatus?: string };
}

export interface TenancyActions {
  onOpenDashboard: () => void;
  onOpenPublicSite: () => void;
  onCopyDomain: () => Promise<void>;
  onOpenBilling: () => void;
}

type TenancyStatusVariant = "published" | "pending" | "denied" | "default";

function getTenancyStatus(tenancy: TenancyListItem): {
  variant: TenancyStatusVariant;
  label: string;
} {
  const billingStatus = tenancy.plan?.billingStatus;
  if (billingStatus === "overdue") return { variant: "denied", label: "Overdue" };
  if (billingStatus === "watch") return { variant: "pending", label: "Watch" };
  if (billingStatus === "ok") return { variant: "published", label: "Active" };
  return { variant: "default", label: tenancy.plan ? "Active" : "No plan" };
}

function formatTenancySubtitle(tenancy: TenancyListItem): string {
  const segments = [
    tenancy.primaryDomain ?? "No domain",
    `${tenancy.eventCount} ${tenancy.eventCount === 1 ? "event" : "events"}`,
    `${tenancy.guestCount} ${tenancy.guestCount === 1 ? "guest" : "guests"}`,
  ];
  if (tenancy.plan) {
    const mrr = tenancy.plan.priceCents
      ? ` · $${(tenancy.plan.priceCents / 100).toLocaleString()}/mo`
      : "";
    segments.push(`${tenancy.plan.tier}${mrr}`);
  }
  return segments.join(" • ");
}

export function useTenancyActions(tenancy: TenancyListItem): TenancyActions {
  const router = useRouter();

  return {
    onOpenDashboard: () => {
      router.push(buildWorkspaceOperationPath(tenancy.slug, "host"));
    },
    onOpenPublicSite: () => {
      if (!tenancy.primaryDomain) return;
      window.open(`https://${tenancy.primaryDomain}`, "_blank", "noopener,noreferrer");
    },
    onCopyDomain: async () => {
      if (!tenancy.primaryDomain) return;
      await copyTextWithToast(tenancy.primaryDomain, "Domain copied");
    },
    onOpenBilling: () => {
      router.push("/admin/billing");
    },
  };
}

interface TenancyListRowProps {
  tenancy: TenancyListItem;
}

/**
 * Event-list-style card row for a tenancy: title + status badge, subtitle
 * metadata, hover-revealed actions, and a right-click context menu.
 */
export function TenancyListRow({ tenancy }: TenancyListRowProps) {
  const actions = useTenancyActions(tenancy);
  const status = getTenancyStatus(tenancy);
  const dashboardPath = buildWorkspaceOperationPath(tenancy.slug, "host");

  const handleRowClick = (clickEvent: MouseEvent<HTMLDivElement>) => {
    if (
      clickEvent.target instanceof Element &&
      clickEvent.target.closest("button, a, input, select, textarea, [role='menuitem']")
    ) {
      return;
    }
    actions.onOpenDashboard();
  };

  const handleRowKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      actions.onOpenDashboard();
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="link"
          tabIndex={0}
          aria-label={`Open ${tenancy.name} dashboard`}
          onClick={handleRowClick}
          onKeyDown={handleRowKeyDown}
          className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-[var(--tt-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-primary)]/30"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={dashboardPath}
                onClick={(clickEvent) => {
                  clickEvent.preventDefault();
                  actions.onOpenDashboard();
                }}
                className="max-w-[24rem] truncate text-sm font-medium text-[var(--text-primary)] hover:underline"
              >
                {tenancy.name}
              </Link>
              <StatusBadge variant={status.variant} label={status.label} />
            </div>
            <div className="text-xs tabular-nums text-[var(--text-secondary)]">
              {formatTenancySubtitle(tenancy)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <TenancyListRowActions
                hasPrimaryDomain={Boolean(tenancy.primaryDomain)}
                actions={actions}
              />
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <TenancyContextMenu
        workspaceName={tenancy.name}
        hasPrimaryDomain={Boolean(tenancy.primaryDomain)}
        actions={actions}
      />
    </ContextMenu>
  );
}

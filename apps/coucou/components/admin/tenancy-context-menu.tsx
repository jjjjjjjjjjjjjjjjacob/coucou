"use client";

import { Copy, CreditCard, ExternalLink, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import type { TenancyActions } from "@/components/admin/tenancy-list-row";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

export interface TenancyContextMenuProps {
  workspaceName: string;
  hasPrimaryDomain: boolean;
  actions: TenancyActions;
}

export function TenancyContextMenu({
  workspaceName,
  hasPrimaryDomain,
  actions,
}: TenancyContextMenuProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyDomain = async () => {
    await actions.onCopyDomain();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ContextMenuContent className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[var(--shadow-card)]">
      <ContextMenuItem onSelect={actions.onOpenDashboard}>
        <LayoutDashboard className="h-4 w-4" />
        Open dashboard
      </ContextMenuItem>

      <ContextMenuItem
        disabled={!hasPrimaryDomain}
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          actions.onOpenPublicSite();
        }}
      >
        <ExternalLink className="h-4 w-4" />
        View public site
      </ContextMenuItem>

      <ContextMenuItem
        disabled={!hasPrimaryDomain}
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          void handleCopyDomain();
        }}
      >
        <Copy className="h-4 w-4" />
        {copied ? "Copied" : "Copy domain"}
      </ContextMenuItem>

      <ContextMenuSeparator className="bg-[var(--border-subtle)]" />

      <ContextMenuItem onSelect={actions.onOpenBilling}>
        <CreditCard className="h-4 w-4" />
        Billing for {workspaceName}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

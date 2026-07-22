"use client";

import { Copy, CreditCard, ExternalLink, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { TenancyActions } from "@/components/admin/tenancy-list-row";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TenancyListRowActionsProps {
  hasPrimaryDomain: boolean;
  actions: TenancyActions;
}

export function TenancyListRowActions({ hasPrimaryDomain, actions }: TenancyListRowActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyDomain = async () => {
    await actions.onCopyDomain();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-1">
      {hasPrimaryDomain ? (
        <Button
          variant="outline"
          size="sm"
          className="size-8 border-[var(--border-subtle)] bg-transparent"
          aria-label="View public site"
          onClick={actions.onOpenPublicSite}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        className="hidden border-[var(--border-subtle)] bg-transparent sm:inline-flex"
        onClick={actions.onOpenDashboard}
      >
        <LayoutDashboard className="h-4 w-4" /> View
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="size-8 border-[var(--border-subtle)] bg-transparent"
            aria-label="Open tenancy actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]"
        >
          <DropdownMenuItem onSelect={actions.onOpenDashboard}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Open dashboard
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!hasPrimaryDomain}
            onSelect={(selectEvent) => {
              selectEvent.preventDefault();
              actions.onOpenPublicSite();
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View public site
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={!hasPrimaryDomain}
            onSelect={(selectEvent) => {
              selectEvent.preventDefault();
              void handleCopyDomain();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copied" : "Copy domain"}
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />

          <DropdownMenuItem onSelect={actions.onOpenBilling}>
            <CreditCard className="mr-2 h-4 w-4" />
            Billing
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

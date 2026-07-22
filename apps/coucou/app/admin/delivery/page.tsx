"use client";

import { api } from "@convex/_generated/api";
import { AdminEmptyState, AdminHeader, AdminSection, Kpi, KpiRow } from "@coucou/ui/admin";
import { useQuery } from "convex/react";
import { Building2, Copy, MessageSquare } from "lucide-react";
import { useState } from "react";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { copyTextWithToast } from "@/lib/clipboard";
import { buildWorkspaceOperationPath } from "@/lib/workspace-config";

interface DeliveryRow {
  workspaceId: string;
  slug: string;
  name: string;
  primaryDomain: string | null;
  sends30d: number;
  sent30d: number;
  failed30d: number;
  deliveredRate: number;
  failedRate: number;
  optOutCount: number;
}

export default function AdminDeliveryPage() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const summary = useQuery(api.dashboard.getDeliverySummaryByWorkspacePaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
  });

  const totalSends = (summary?.page ?? []).reduce(
    (sum: number, row: DeliveryRow) => sum + row.sends30d,
    0,
  );
  const totalFailed = (summary?.page ?? []).reduce(
    (sum: number, row: DeliveryRow) => sum + row.failed30d,
    0,
  );
  const overallDeliveredRate =
    totalSends > 0 ? Math.round(((totalSends - totalFailed) / totalSends) * 1000) / 10 : 0;

  const columns: AdminDataTableColumn<DeliveryRow>[] = [
    {
      key: "name",
      label: "Workspace",
      width: "26%",
      render: (row) => row.name,
    },
    {
      key: "domain",
      label: "Domain",
      width: "20%",
      render: (row) => row.primaryDomain ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "sends",
      label: "Sends · 30d",
      width: "12%",
      render: (row) => row.sends30d.toLocaleString(),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "delivered",
      label: "Delivered",
      width: "12%",
      render: (row) => `${row.deliveredRate}%`,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "failed",
      label: "Failed",
      width: "12%",
      render: (row) => `${row.failedRate}%`,
      cellStyle: (row) => ({
        color: row.failedRate > 5 ? "var(--tt-fg)" : "var(--tt-fg-dim)",
      }),
    },
    {
      key: "optOuts",
      label: "Opt-outs",
      width: "10%",
      alignRight: true,
      render: (row) => row.optOutCount,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "view",
      label: "",
      width: "8%",
      alignRight: true,
      render: (row) => (
        <a
          href={buildWorkspaceOperationPath(row.slug, "host", "texts")}
          style={{ color: "var(--tt-fg)" }}
          className="hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          view →
        </a>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        eyebrow="System"
        title="SMS delivery health."
        status={<span>· last 30 days</span>}
      />

      <KpiRow columns={3}>
        <Kpi label="Sends · 30d" value={totalSends.toLocaleString()} />
        <Kpi label="Delivered" value={`${overallDeliveredRate}%`} />
        <Kpi label="Failed" value={totalFailed.toLocaleString()} last />
      </KpiRow>

      <AdminSection title="By workspace">
        <AdminDataTable<DeliveryRow>
          columns={columns}
          rows={summary?.page as DeliveryRow[] | undefined}
          rowKey={(row) => row.workspaceId}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value);
              setCursor(null);
              setCursorStack([]);
            },
          }}
          pagination={{
            cursor,
            nextCursor: summary?.nextCursor ?? null,
            isDone: summary?.isDone ?? true,
            onCursorChange: setCursor,
            cursorStack,
            onCursorStackChange: setCursorStack,
            totalCount: summary?.totalCount,
          }}
          emptyMessage={
            <AdminEmptyState
              title="No SMS activity yet."
              description="Once any workspace sends a message, its 30-day delivery summary will show up here."
            />
          }
          renderRowContextMenu={(row) => (
            <ContextMenuContent className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[var(--shadow-card)]">
              <ContextMenuItem asChild>
                <a href={buildWorkspaceOperationPath(row.slug, "host", "texts")}>
                  <MessageSquare className="h-4 w-4" />
                  View texts
                </a>
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-[var(--border-subtle)]" />
              <ContextMenuItem asChild>
                <a href={buildWorkspaceOperationPath(row.slug, "host")}>
                  <Building2 className="h-4 w-4" />
                  Open {row.name}
                </a>
              </ContextMenuItem>
              {row.primaryDomain ? (
                <ContextMenuItem
                  onSelect={(selectEvent) => {
                    selectEvent.preventDefault();
                    void copyTextWithToast(row.primaryDomain ?? "", "Domain copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy domain
                </ContextMenuItem>
              ) : null}
            </ContextMenuContent>
          )}
        />
      </AdminSection>
    </>
  );
}

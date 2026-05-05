"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  AdminEmptyState,
  AdminHeader,
  AdminSection,
  Kpi,
  KpiRow,
} from "@coucou/ui/admin";
import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "@/components/admin/admin-data-table";
import { Button } from "@/components/ui/button";
import { PlanEditDialog } from "@/components/admin/plan-edit-dialog";

interface WorkspaceRow {
  _id: string;
  slug: string;
  name: string;
  primaryDomain?: string;
  plan?: {
    tier: string;
    priceCents?: number;
    billingStatus?: "ok" | "watch" | "overdue";
    nextInvoiceAt?: number;
    lastInvoiceAt?: number;
  };
}

function formatDateOrDash(timestamp?: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminBillingPage() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<WorkspaceRow | null>(null);

  const tenancies = useQuery(api.workspaces.listWorkspacesPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
  });

  const totalMrr = (tenancies?.page ?? []).reduce(
    (sum: number, row: WorkspaceRow) => sum + (row.plan?.priceCents ?? 0),
    0,
  );
  const billedCount = (tenancies?.page ?? []).filter(
    (row: WorkspaceRow) => row.plan?.priceCents,
  ).length;

  const columns: AdminDataTableColumn<WorkspaceRow>[] = [
    { key: "name", label: "Workspace", width: "22%", render: (row) => row.name },
    {
      key: "tier",
      label: "Tier",
      width: "12%",
      render: (row) => row.plan?.tier ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "mrr",
      label: "MRR",
      width: "12%",
      render: (row) =>
        row.plan?.priceCents
          ? `$${(row.plan.priceCents / 100).toLocaleString()}`
          : "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "lastInvoice",
      label: "Last invoice",
      width: "16%",
      render: (row) => formatDateOrDash(row.plan?.lastInvoiceAt),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "nextInvoice",
      label: "Next invoice",
      width: "16%",
      render: (row) => formatDateOrDash(row.plan?.nextInvoiceAt),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "status",
      label: "Status",
      width: "10%",
      render: (row) => row.plan?.billingStatus ?? "—",
      cellStyle: (row) => ({
        color:
          row.plan?.billingStatus === "overdue"
            ? "var(--tt-fg)"
            : "var(--tt-fg-dim)",
      }),
    },
    {
      key: "edit",
      label: "",
      width: "12%",
      alignRight: true,
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[12px]"
          style={{ color: "var(--tt-fg)" }}
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row);
          }}
        >
          edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        eyebrow="Oversight"
        title="Billing snapshot."
        status={<span>· no provider attached</span>}
      />

      <KpiRow columns={3}>
        <Kpi label="Tenancies" value={tenancies?.totalCount ?? 0} />
        <Kpi label="Billed" value={billedCount} />
        <Kpi
          label="Page MRR"
          value={`$${(totalMrr / 100).toLocaleString()}`}
          last
        />
      </KpiRow>

      <AdminSection
        title="Tenancies"
        meta="Stripe / billing not yet wired — values are workspace metadata only"
      >
        <AdminDataTable<WorkspaceRow>
          columns={columns}
          rows={tenancies?.page as WorkspaceRow[] | undefined}
          rowKey={(row) => row._id}
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
            nextCursor: tenancies?.nextCursor ?? null,
            isDone: tenancies?.isDone ?? true,
            onCursorChange: setCursor,
            cursorStack,
            onCursorStackChange: setCursorStack,
            totalCount: tenancies?.totalCount,
          }}
          emptyMessage={
            <AdminEmptyState
              title="No tenancies yet."
              description="Once a workspace exists you can attach a tier and price for it here."
            />
          }
        />
      </AdminSection>

      <PlanEditDialog
        workspace={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

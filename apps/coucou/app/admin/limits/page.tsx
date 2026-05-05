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
import { LimitsEditDialog } from "@/components/admin/limits-edit-dialog";

interface WorkspaceRow {
  _id: string;
  slug: string;
  name: string;
  primaryDomain?: string;
  eventCount: number;
  guestCount: number;
  limits?: {
    smsPerDay?: number;
    smsPerMonth?: number;
    rsvpsPerEvent?: number;
  };
}

export default function AdminLimitsPage() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<WorkspaceRow | null>(null);

  const tenancies = useQuery(api.workspaces.listWorkspacesPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
  });

  const configuredCount = (tenancies?.page ?? []).filter(
    (row: WorkspaceRow) => row.limits,
  ).length;

  const columns: AdminDataTableColumn<WorkspaceRow>[] = [
    { key: "name", label: "Workspace", width: "22%", render: (row) => row.name },
    {
      key: "smsDay",
      label: "SMS / day",
      width: "14%",
      render: (row) => row.limits?.smsPerDay ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "smsMonth",
      label: "SMS / month",
      width: "14%",
      render: (row) => row.limits?.smsPerMonth ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "rsvpEvent",
      label: "RSVPs / event",
      width: "14%",
      render: (row) => row.limits?.rsvpsPerEvent ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "events",
      label: "Events",
      width: "10%",
      render: (row) => row.eventCount,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "guests",
      label: "Guests",
      width: "12%",
      render: (row) => row.guestCount,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "edit",
      label: "",
      width: "14%",
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
        eyebrow="System"
        title="Rate & quota limits."
        status={<span>· advisory only — enforcement not wired</span>}
      />

      <KpiRow columns={3}>
        <Kpi label="Tenancies" value={tenancies?.totalCount ?? 0} />
        <Kpi label="Configured · view" value={configuredCount} />
        <Kpi label="Breaches" value={0} last />
      </KpiRow>

      <AdminSection title="Tenancies">
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
              description="Once a workspace exists you can attach advisory rate caps for it here."
            />
          }
        />
      </AdminSection>

      <LimitsEditDialog
        workspace={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

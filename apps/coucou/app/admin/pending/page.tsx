"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  AdminHeader,
  AdminSection,
  Kpi,
  KpiRow,
} from "@coucou/ui/admin";
import {
  AdminDataTable,
  type AdminDataTableColumn,
} from "@/components/admin/admin-data-table";
import { TenantApplicationDetailDialog } from "@/components/admin/tenant-application-detail-dialog";
import { Select, SelectOption } from "@/components/ui/select";

interface ApplicationRow {
  _id: Id<"tenantApplications">;
  name: string;
  city?: string;
  operator: string;
  operatorEmail?: string;
  body?: string;
  submittedAt: number;
  status: "pending" | "accepted" | "denied";
  tenantAdminEmail?: string;
  clerkOrganizationId?: string;
  clerkOrganizationSlug?: string;
  clerkInvitationId?: string;
  denialReason?: string;
}

function formatRelative(timestamp: number): string {
  const now = Date.now();
  const elapsedMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export default function AdminPendingPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "accepted" | "denied" | "all"
  >("pending");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<ApplicationRow | null>(null);

  const applications = useQuery(api.tenantApplications.listPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
    statusFilter: statusFilter === "all" ? undefined : statusFilter,
  });

  const columns: AdminDataTableColumn<ApplicationRow>[] = [
    {
      key: "name",
      label: "House",
      width: "26%",
      render: (row) => row.name,
    },
    {
      key: "city",
      label: "City",
      width: "16%",
      render: (row) => row.city ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "operator",
      label: "Operator",
      width: "26%",
      render: (row) =>
        row.operatorEmail ? `${row.operator} · ${row.operatorEmail}` : row.operator,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "submittedAt",
      label: "Submitted",
      width: "12%",
      render: (row) => formatRelative(row.submittedAt),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "status",
      label: "Status",
      width: "10%",
      render: (row) => row.status,
      cellStyle: (row) => ({
        color: row.status === "pending" ? "var(--tt-fg)" : "var(--tt-fg-dim)",
      }),
    },
    {
      key: "action",
      label: "",
      width: "10%",
      alignRight: true,
      render: () => (
        <span style={{ color: "var(--tt-fg)" }}>read →</span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader
        eyebrow="Oversight"
        title="Pending applications."
        status={
          <span>
            ·{" "}
            {applications?.totalCount ?? 0}{" "}
            {statusFilter === "all" ? "total" : statusFilter}
          </span>
        }
      />

      <KpiRow columns={3}>
        <Kpi label="Pending" value={applications?.totalCount ?? 0} />
        <Kpi label="Filter" value={statusFilter} />
        <Kpi label="Cursor" value={cursor ?? "—"} last />
      </KpiRow>

      <AdminSection title="Applications">
        <AdminDataTable<ApplicationRow>
          columns={columns}
          rows={applications?.page as ApplicationRow[] | undefined}
          rowKey={(row) => row._id}
          onRowClick={setSelected}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value);
              setCursor(null);
              setCursorStack([]);
            },
          }}
          filters={
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as
                    | "pending"
                    | "accepted"
                    | "denied"
                    | "all",
                );
                setCursor(null);
                setCursorStack([]);
              }}
              className="h-8 border-0 bg-transparent text-[13px]"
              style={{
                borderBottom: "1px solid var(--tt-rule)",
                borderRadius: 0,
                color: "var(--tt-fg)",
              }}
            >
              <SelectOption value="pending">Pending</SelectOption>
              <SelectOption value="accepted">Accepted</SelectOption>
              <SelectOption value="denied">Denied</SelectOption>
              <SelectOption value="all">All</SelectOption>
            </Select>
          }
          pagination={{
            cursor,
            nextCursor: applications?.nextCursor ?? null,
            isDone: applications?.isDone ?? true,
            onCursorChange: setCursor,
            cursorStack,
            onCursorStackChange: setCursorStack,
            totalCount: applications?.totalCount,
          }}
          emptyMessage={
            statusFilter === "pending"
              ? "No applications waiting."
              : "No applications match this filter."
          }
        />
      </AdminSection>

      <TenantApplicationDetailDialog
        application={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

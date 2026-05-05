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
import { Select, SelectOption } from "@/components/ui/select";

interface AuditRow {
  _id: string;
  at: number;
  actorClerkUserId?: string;
  actorEmail?: string;
  action: string;
  targetKind?: string;
  targetId?: string;
  workspace: { name: string; slug: string } | null;
  summary?: string;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditPage() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const log = useQuery(api.audit.listPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 50,
    actorSearch: search.trim() ? search.trim() : undefined,
    actionFilter: actionFilter === "all" ? undefined : actionFilter,
  });

  const distinctActions = useQuery(api.audit.listDistinctActions);

  const columns: AdminDataTableColumn<AuditRow>[] = [
    {
      key: "at",
      label: "When",
      width: "16%",
      render: (row) => formatTimestamp(row.at),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "actor",
      label: "Actor",
      width: "18%",
      render: (row) =>
        row.actorEmail ?? row.actorClerkUserId ?? "system",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "action",
      label: "Action",
      width: "18%",
      render: (row) => row.action,
    },
    {
      key: "workspace",
      label: "Workspace",
      width: "14%",
      render: (row) => row.workspace?.name ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "summary",
      label: "Summary",
      width: "34%",
      render: (row) => row.summary ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
  ];

  return (
    <>
      <AdminHeader
        eyebrow="Internal"
        title="Audit log."
        status={<span>· {log?.totalCount ?? 0} entries in view</span>}
      />

      <KpiRow columns={3}>
        <Kpi label="In view" value={log?.totalCount ?? 0} />
        <Kpi label="Filter" value={actionFilter} />
        <Kpi label="Distinct actions" value={distinctActions?.length ?? 0} last />
      </KpiRow>

      <AdminSection title="Entries">
        <AdminDataTable<AuditRow>
          columns={columns}
          rows={log?.page as AuditRow[] | undefined}
          rowKey={(row) => row._id}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value);
              setCursor(null);
              setCursorStack([]);
            },
            placeholder: "search by actor…",
          }}
          filters={
            <Select
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value);
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
              <SelectOption value="all">All actions</SelectOption>
              {(distinctActions ?? []).map((action) => (
                <SelectOption key={action} value={action}>
                  {action}
                </SelectOption>
              ))}
            </Select>
          }
          pagination={{
            cursor,
            nextCursor: log?.nextCursor ?? null,
            isDone: log?.isDone ?? true,
            onCursorChange: setCursor,
            cursorStack,
            onCursorStackChange: setCursorStack,
            totalCount: log?.totalCount,
          }}
          emptyMessage={
            <AdminEmptyState
              title="No audit entries yet."
              description="Audit entries appear as soon as someone touches a workspace, application, flag, or sender."
            />
          }
        />
      </AdminSection>
    </>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { Select, SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FlagRow {
  _id: Id<"attentionFlags">;
  kind: "flag" | "watch";
  label: string;
  detail?: string;
  observedAt: number;
  status: "open" | "ack" | "resolved";
  workspace: { name: string; slug: string } | null;
  sourceModule?: string;
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

export default function AdminFlagsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "open" | "ack" | "resolved" | "all"
  >("open");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const flags = useQuery(api.attentionFlags.listPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
    statusFilter: statusFilter === "all" ? "all" : statusFilter,
  });

  const ackMutation = useMutation(api.attentionFlags.ackFlag);
  const resolveMutation = useMutation(api.attentionFlags.resolveFlag);

  const columns: AdminDataTableColumn<FlagRow>[] = [
    {
      key: "kind",
      label: "Kind",
      width: "8%",
      render: (row) => row.kind,
      cellStyle: (row) => ({
        color: row.kind === "flag" ? "var(--tt-fg)" : "var(--tt-fg-dim)",
      }),
    },
    {
      key: "label",
      label: "Label",
      width: "30%",
      render: (row) => (
        <>
          {row.label}
          {row.detail ? (
            <span style={{ color: "var(--tt-fg-dim)" }}> — {row.detail}</span>
          ) : null}
        </>
      ),
    },
    {
      key: "workspace",
      label: "Workspace",
      width: "16%",
      render: (row) => row.workspace?.name ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "source",
      label: "Source",
      width: "14%",
      render: (row) => row.sourceModule ?? "manual",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "observed",
      label: "Observed",
      width: "10%",
      render: (row) => formatRelative(row.observedAt),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "status",
      label: "Status",
      width: "10%",
      render: (row) => row.status,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "action",
      label: "",
      width: "12%",
      alignRight: true,
      render: (row) =>
        row.status === "resolved" ? null : (
          <div className="flex justify-end gap-2">
            {row.status === "open" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px]"
                style={{ color: "var(--tt-fg-dim)" }}
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    await ackMutation({ id: row._id });
                    toast.success("Flag acknowledged");
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Failed",
                    );
                  }
                }}
              >
                ack
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12px]"
              style={{ color: "var(--tt-fg)" }}
              onClick={async (event) => {
                event.stopPropagation();
                try {
                  await resolveMutation({ id: row._id });
                  toast.success("Flag resolved");
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Failed",
                  );
                }
              }}
            >
              resolve
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <AdminHeader
        eyebrow="Oversight"
        title="Attention flags."
        status={<span>· {flags?.openCount ?? 0} open</span>}
      />

      <KpiRow columns={3}>
        <Kpi label="Open" value={flags?.openCount ?? 0} />
        <Kpi label="Filter" value={statusFilter} />
        <Kpi label="Total · view" value={flags?.totalCount ?? 0} last />
      </KpiRow>

      <AdminSection title="Flags">
        <AdminDataTable<FlagRow>
          columns={columns}
          rows={flags?.page as FlagRow[] | undefined}
          rowKey={(row) => row._id}
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
                  event.target.value as "open" | "ack" | "resolved" | "all",
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
              <SelectOption value="open">Open</SelectOption>
              <SelectOption value="ack">Acknowledged</SelectOption>
              <SelectOption value="resolved">Resolved</SelectOption>
              <SelectOption value="all">All</SelectOption>
            </Select>
          }
          pagination={{
            cursor,
            nextCursor: flags?.nextCursor ?? null,
            isDone: flags?.isDone ?? true,
            onCursorChange: setCursor,
            cursorStack,
            onCursorStackChange: setCursorStack,
            totalCount: flags?.totalCount,
          }}
          emptyMessage={
            statusFilter === "open"
              ? "No flags right now."
              : "No flags match this filter."
          }
        />
      </AdminSection>
    </>
  );
}

"use client";

import { api } from "@convex/_generated/api";
import { AdminEmptyState, AdminHeader, AdminSection, Kpi, KpiRow } from "@coucou/ui/admin";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminDataTable, type AdminDataTableColumn } from "@/components/admin/admin-data-table";
import { Select, SelectOption } from "@/components/ui/select";

interface MembershipRow {
  _id: string;
  clerkUserId: string;
  organizationId: string;
  role: string;
  updatedAt: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  workspace: { name: string; slug: string; _id: string } | null;
  tenancyCount: number;
}

const ROLE_OPTIONS = ["admin", "host", "door", "member"];

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

function buildDisplayName(row: MembershipRow): string {
  const fromName = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return fromName || row.email || row.clerkUserId;
}

export default function AdminStaffPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const memberships = useQuery(api.orgMemberships.listAllMembershipsPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
    roleFilter: roleFilter === "all" ? undefined : roleFilter,
  });

  const updateRole = useMutation(api.orgMemberships.updateMembershipRole);

  const columns: AdminDataTableColumn<MembershipRow>[] = [
    {
      key: "user",
      label: "User",
      width: "26%",
      render: (row) => (
        <div className="flex flex-col">
          <span>{buildDisplayName(row)}</span>
          {row.email ? (
            <span style={{ color: "var(--tt-fg-mute)", fontSize: 11 }}>{row.email}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "workspace",
      label: "Workspace",
      width: "22%",
      render: (row) =>
        row.workspace ? row.workspace.name : `Clerk org ${row.organizationId.slice(0, 8)}…`,
      cellStyle: (row) => ({
        color: row.workspace ? "var(--tt-fg-dim)" : "var(--tt-fg-mute)",
      }),
    },
    {
      key: "role",
      label: "Role",
      width: "16%",
      render: (row) => (
        <Select
          value={row.role}
          onChange={async (event) => {
            const next = event.target.value;
            try {
              await updateRole({
                clerkUserId: row.clerkUserId,
                organizationId: row.organizationId,
                role: next,
              });
              toast.success(`Role updated to ${next}`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed");
            }
          }}
          onClick={(event) => event.stopPropagation()}
          className="h-7 border-0 bg-transparent text-[12px]"
          style={{
            borderBottom: "1px solid var(--tt-rule)",
            borderRadius: 0,
            color: "var(--tt-fg)",
          }}
        >
          {ROLE_OPTIONS.includes(row.role) ? null : (
            <SelectOption value={row.role}>{row.role}</SelectOption>
          )}
          {ROLE_OPTIONS.map((role) => (
            <SelectOption key={role} value={role}>
              {role}
            </SelectOption>
          ))}
        </Select>
      ),
    },
    {
      key: "tenancies",
      label: "Tenancies",
      width: "14%",
      render: (row) => row.tenancyCount,
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "lastActive",
      label: "Updated",
      width: "12%",
      render: (row) => formatRelative(row.updatedAt),
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
    {
      key: "phone",
      label: "Phone",
      width: "10%",
      alignRight: true,
      render: (row) => row.phone ?? "—",
      cellStyle: () => ({ color: "var(--tt-fg-dim)" }),
    },
  ];

  return (
    <>
      <AdminHeader
        eyebrow="Internal"
        title="Operators across tenancies."
        status={<span>· {memberships?.totalCount ?? 0} memberships</span>}
      />

      <KpiRow columns={3}>
        <Kpi label="Memberships" value={memberships?.totalCount ?? 0} />
        <Kpi label="Filter" value={roleFilter} />
        <Kpi label="Cursor" value={cursor ?? "—"} last />
      </KpiRow>

      <AdminSection title="Roster">
        <AdminDataTable<MembershipRow>
          columns={columns}
          rows={memberships?.page as MembershipRow[] | undefined}
          rowKey={(row) => row._id}
          search={{
            value: search,
            onChange: (value) => {
              setSearch(value);
              setCursor(null);
              setCursorStack([]);
            },
            placeholder: "search by name or email…",
          }}
          filters={
            <Select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
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
              <SelectOption value="all">All roles</SelectOption>
              {ROLE_OPTIONS.map((role) => (
                <SelectOption key={role} value={role}>
                  {role}
                </SelectOption>
              ))}
            </Select>
          }
          pagination={{
            cursor,
            nextCursor: memberships?.nextCursor ?? null,
            isDone: memberships?.isDone ?? true,
            onCursorChange: setCursor,
            cursorStack,
            onCursorStackChange: setCursorStack,
            totalCount: memberships?.totalCount,
          }}
          emptyMessage={
            <AdminEmptyState
              title="No memberships in view."
              description="As soon as users join a workspace's Clerk organization they'll appear here."
            />
          }
        />
      </AdminSection>
    </>
  );
}

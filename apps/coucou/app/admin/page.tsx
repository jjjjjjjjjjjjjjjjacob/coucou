"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import {
  AdminHeader,
  AdminSection,
  AttentionEmptyRow,
  AttentionRow,
  Kpi,
  KpiRow,
} from "@coucou/ui/admin";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TenancyList } from "@/components/admin/tenancy-list";
import { buildWorkspaceOperationPath, getCoucouOrganizationSlug } from "@/lib/workspace-config";

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

interface TenancyRow {
  _id: string;
  slug: string;
  name: string;
  kind?: string;
  primaryDomain?: string;
  clerkOrganizationId?: string;
  clerkOrganizationSlug?: string;
  eventCount: number;
  guestCount: number;
  plan?: { tier: string; priceCents?: number; billingStatus?: string };
}

export default function CoucouAdminPage() {
  const router = useRouter();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const memberships = userMemberships?.data ?? [];

  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const tenancies = useQuery(api.workspaces.listWorkspacesPaginated, {
    cursor: cursor ?? undefined,
    pageSize: 25,
    search: search.trim() ? search.trim() : undefined,
  });
  const attentionFlags = useQuery(api.workspaces.listAttentionFlags);
  const pendingApplications = useQuery(api.workspaces.listPendingApplications);

  const partnerCount = tenancies?.totalCount ?? 0;
  const flagCount = attentionFlags?.length ?? 0;
  const pendingCount = pendingApplications?.length ?? 0;
  const tenantMemberships = memberships.filter(
    (membership) => membership.organization.slug?.toLowerCase() !== getCoucouOrganizationSlug(),
  );

  return (
    <>
      <AdminHeader
        eyebrow="Tenancies"
        title={
          partnerCount === 0
            ? "No partners yet."
            : partnerCount === 1
              ? "One partner."
              : `${partnerCount} partners.`
        }
        status={<span>· all systems nominal</span>}
      />

      <KpiRow columns={5}>
        <Kpi label="Active" value={partnerCount} />
        <Kpi label="Routed · 30d" value="—" />
        <Kpi label="MRR" value="—" />
        <Kpi label="Flags" value={flagCount} />
        <Kpi label="Breaches" value={0} last />
      </KpiRow>

      <AdminSection title="Attention" meta={`${flagCount} ${flagCount === 1 ? "item" : "items"}`}>
        {!attentionFlags ? (
          <AttentionEmptyRow>Loading…</AttentionEmptyRow>
        ) : attentionFlags.length === 0 ? (
          <AttentionEmptyRow>No flags right now.</AttentionEmptyRow>
        ) : (
          attentionFlags.slice(0, 6).map((flag, index) => (
            <AttentionRow
              key={index}
              kind={flag.kind}
              label={
                <>
                  {flag.label} <span style={{ color: "var(--tt-fg-dim)" }}>— {flag.detail}</span>
                </>
              }
              timestamp={formatRelative(flag.observedAt)}
            />
          ))
        )}
      </AdminSection>

      <AdminSection
        title="Partners"
        meta={tenancies?.totalCount ? `${tenancies.totalCount} active` : undefined}
      >
        <TenancyList
          rows={tenancies?.page as TenancyRow[] | undefined}
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
          emptyMessage="No workspaces yet."
        />
      </AdminSection>

      {pendingCount > 0 && (
        <AdminSection
          title="Pending"
          meta={
            <Link
              href="/admin/pending"
              className="hover:underline"
              style={{ color: "var(--tt-fg)" }}
            >
              {pendingCount === 1 ? "1 application" : `${pendingCount} applications`} ↗
            </Link>
          }
        >
          <div className="space-y-3 py-4 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
            {pendingApplications?.slice(0, 4).map((application, index) => (
              <div
                key={index}
                className="flex items-center justify-between"
                style={{
                  borderBottom: "1px solid var(--tt-rule)",
                  paddingBottom: 12,
                }}
              >
                <span style={{ color: "var(--tt-fg)" }}>{application.name}</span>
                <span>
                  {application.operator}
                  {application.city ? ` · ${application.city}` : ""} ·{" "}
                  {formatRelative(application.submittedAt)}
                </span>
              </div>
            ))}
          </div>
        </AdminSection>
      )}

      <AdminSection title="Workspaces · Switch" meta="Operator memberships">
        {tenantMemberships.length === 0 ? (
          <div className="py-6 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
            No organizations attached to this account yet.{" "}
            <Link href="/orgs/select" className="underline" style={{ color: "var(--tt-fg)" }}>
              Refresh memberships
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 pt-6">
            {tenantMemberships.map((membership) => (
              <button
                key={membership.id}
                type="button"
                onClick={async () => {
                  const organizationSlug = membership.organization.slug;
                  if (!organizationSlug) return;
                  await setActive?.({
                    organization: membership.organization.id,
                  });
                  router.push(buildWorkspaceOperationPath(organizationSlug, "host"));
                }}
                className="px-4 py-2 text-[13px] transition-opacity hover:opacity-80"
                style={{
                  background: "transparent",
                  color: "var(--tt-fg)",
                  border: "1px solid var(--tt-rule-strong)",
                }}
              >
                {membership.organization.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3 text-[13px]">
          <Link href="/orgs/select" className="underline" style={{ color: "var(--tt-fg-dim)" }}>
            Switch workspace
          </Link>
        </div>
      </AdminSection>
    </>
  );
}

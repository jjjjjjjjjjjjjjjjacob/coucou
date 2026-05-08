"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AdminEmptyState, AdminHeader, AdminSection, Kpi, KpiRow } from "@coucou/ui/admin";
import { useQuery } from "convex/react";
import { useState } from "react";
import { SenderEditDialog } from "@/components/admin/sender-edit-dialog";
import { Button } from "@/components/ui/button";

interface WorkspaceShape {
  _id: Id<"workspaces">;
  name: string;
  slug: string;
}

interface SenderShape {
  _id: Id<"smsSenders">;
  phoneNumber: string;
  brandLabel?: string;
  isDefault?: boolean;
  verifiedAt?: number;
  lastUsedAt?: number;
}

interface GroupedRow {
  workspace: WorkspaceShape;
  senders: SenderShape[];
}

function formatDateOrDash(timestamp?: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function AdminSendersPage() {
  const grouped = useQuery(api.smsSenders.listForWorkspaces);
  const [editing, setEditing] = useState<{
    workspace: WorkspaceShape;
    sender: SenderShape | null;
  } | null>(null);

  const totalSenders = (grouped ?? []).reduce(
    (sum: number, group: GroupedRow) => sum + group.senders.length,
    0,
  );

  return (
    <>
      <AdminHeader
        eyebrow="System"
        title="SMS senders."
        status={
          <span>
            · {totalSenders} configured across {grouped?.length ?? 0} workspaces
          </span>
        }
      />

      <KpiRow columns={3}>
        <Kpi label="Workspaces" value={grouped?.length ?? 0} />
        <Kpi label="Senders" value={totalSenders} />
        <Kpi
          label="Verified"
          value={(grouped ?? []).reduce(
            (sum: number, group: GroupedRow) =>
              sum + group.senders.filter((sender) => sender.verifiedAt).length,
            0,
          )}
          last
        />
      </KpiRow>

      {grouped === undefined ? (
        <AdminSection title="Loading">
          <AdminEmptyState title="Loading…" />
        </AdminSection>
      ) : grouped.length === 0 ? (
        <AdminSection title="Senders">
          <AdminEmptyState
            title="No workspaces yet."
            description="Create a workspace first; senders attach to a workspace."
          />
        </AdminSection>
      ) : (
        grouped.map((group: GroupedRow) => (
          <AdminSection
            key={group.workspace._id}
            title={group.workspace.name}
            meta={
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[12px]"
                style={{ color: "var(--tt-fg)" }}
                onClick={() => setEditing({ workspace: group.workspace, sender: null })}
              >
                + add sender
              </Button>
            }
          >
            {group.senders.length === 0 ? (
              <AdminEmptyState
                title="No senders for this workspace yet."
                description="Add a sender to make outbound SMS routable to a brand identity."
              />
            ) : (
              <div>
                <div
                  className="flex pt-4 pb-4 text-[11px] uppercase tracking-[0.06em]"
                  style={{
                    borderBottom: "1px solid var(--tt-rule)",
                    color: "var(--tt-fg-mute)",
                  }}
                >
                  <div style={{ width: "26%" }}>Phone</div>
                  <div style={{ width: "26%" }}>Brand</div>
                  <div style={{ width: "12%" }}>Default</div>
                  <div style={{ width: "14%" }}>Verified</div>
                  <div style={{ width: "12%" }}>Last used</div>
                  <div style={{ width: "10%" }} className="text-right" />
                </div>
                {group.senders.map((sender: SenderShape) => (
                  <div
                    key={sender._id}
                    className="flex items-center py-4 text-[13px]"
                    style={{
                      borderBottom: "1px solid var(--tt-rule)",
                      color: "var(--tt-fg)",
                    }}
                  >
                    <div style={{ width: "26%" }}>{sender.phoneNumber}</div>
                    <div style={{ width: "26%", color: "var(--tt-fg-dim)" }}>
                      {sender.brandLabel ?? "—"}
                    </div>
                    <div style={{ width: "12%", color: "var(--tt-fg-dim)" }}>
                      {sender.isDefault ? "default" : "—"}
                    </div>
                    <div style={{ width: "14%", color: "var(--tt-fg-dim)" }}>
                      {sender.verifiedAt ? formatDateOrDash(sender.verifiedAt) : "—"}
                    </div>
                    <div style={{ width: "12%", color: "var(--tt-fg-dim)" }}>
                      {formatDateOrDash(sender.lastUsedAt)}
                    </div>
                    <div style={{ width: "10%" }} className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[12px]"
                        style={{ color: "var(--tt-fg)" }}
                        onClick={() => setEditing({ workspace: group.workspace, sender })}
                      >
                        edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminSection>
        ))
      )}

      <SenderEditDialog
        workspace={editing?.workspace ?? null}
        sender={editing?.sender ?? null}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

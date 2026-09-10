"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

export function ContactAudiencePreview({
  previewId,
}: {
  previewId: Id<"contactAudiencePreviews">;
}) {
  const workspace = useWorkspaceScope();
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const recipients = useQuery(
    api.contactAudiences.members,
    workspace
      ? {
          workspaceSlug: workspace.workspaceSlug,
          previewId,
          cursor: cursors[cursors.length - 1],
        }
      : "skip",
  );
  return (
    <div className="space-y-3">
      {recipients === undefined ? (
        <p role="status">Loading recipients…</p>
      ) : (
        <ul className="max-h-48 overflow-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {recipients.people.map((person) => (
            <li className="flex justify-between gap-4 p-3 text-sm" key={person.contactId}>
              <span>{person.name}</span>
              <span className="text-[var(--text-secondary)]">{person.phoneObfuscated}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={cursors.length === 1}
          onClick={() => setCursors((values) => values.slice(0, -1))}
        >
          Previous recipients
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!recipients?.nextCursor}
          onClick={() => {
            const next = recipients?.nextCursor;
            if (next) setCursors((values) => [...values, next]);
          }}
        >
          Next recipients
        </Button>
      </div>
    </div>
  );
}

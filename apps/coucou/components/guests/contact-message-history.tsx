"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

export function ContactMessageHistory({ contactId }: { contactId: Id<"workspaceContacts"> }) {
  const workspace = useWorkspaceScope();
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const history = useQuery(
    convexQuery(
      api.contacts.messageHistory,
      workspace
        ? {
            workspaceSlug: workspace.workspaceSlug,
            contactId,
            cursor: cursors[cursors.length - 1],
          }
        : "skip",
    ),
  );
  return (
    <section className="mt-5 space-y-3">
      <h3 className="font-medium">Text blast history</h3>
      {history.error ? (
        <p role="alert">
          Messages could not be loaded.{" "}
          <Button variant="link" onClick={() => void history.refetch()}>
            Retry
          </Button>
        </p>
      ) : history.isLoading ? (
        <p role="status">Loading messages…</p>
      ) : history.data?.page.length ? (
        <ul className="space-y-3 text-sm">
          {history.data.page.map((message) => (
            <li key={message.deliveryId}>
              <div className="font-medium">{message.blastName}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {new Date(message.sentAt).toLocaleString()}
              </div>
              <p className="whitespace-pre-wrap">{message.message}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">No text blasts received yet.</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={cursors.length === 1}
          onClick={() => setCursors((values) => values.slice(0, -1))}
        >
          Previous messages
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!history.data?.nextCursor}
          onClick={() => {
            const next = history.data?.nextCursor;
            if (next) setCursors((values) => [...values, next]);
          }}
        >
          Next messages
        </Button>
      </div>
    </section>
  );
}

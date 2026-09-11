"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ListName } from "@/components/list-name";
import { Button } from "@/components/ui/button";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { ContactMessageHistory } from "./contact-message-history";

export function ContactHistory({ contactId }: { contactId: Id<"workspaceContacts"> }) {
  const workspace = useWorkspaceScope();
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const history = useQuery(
    convexQuery(
      api.contacts.history,
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
    <section className="space-y-3 border-b border-[var(--border-subtle)] pb-4 mb-4">
      <h3 className="font-medium">Event history</h3>
      {history.error ? (
        <p role="alert">
          History could not be loaded.{" "}
          <Button variant="link" onClick={() => void history.refetch()}>
            Retry
          </Button>
        </p>
      ) : history.isLoading ? (
        <p role="status">Loading history…</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {history.data?.page.map((entry) => (
            <li key={entry.rsvpId}>
              <div>{entry.eventName}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {new Date(entry.eventDate).toLocaleDateString()} · {entry.approvalStatus}
                {entry.listKey ? (
                  <>
                    {" "}
                    · <ListName eventId={entry.eventId} listKey={entry.listKey} />
                  </>
                ) : (
                  ""
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={cursors.length === 1}
          onClick={() => setCursors((values) => values.slice(0, -1))}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!history.data?.nextCursor}
          onClick={() => {
            if (history.data?.nextCursor)
              setCursors((values) => [...values, history.data?.nextCursor ?? undefined]);
          }}
        >
          Next
        </Button>
      </div>
      <ContactMessageHistory key={contactId} contactId={contactId} />
    </section>
  );
}

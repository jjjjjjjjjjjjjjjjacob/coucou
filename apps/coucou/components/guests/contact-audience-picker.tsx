"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ContactAudience } from "@convex/lib/contactValidators";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useContactDirectory } from "@/lib/hooks/use-contact-directory";
import { useContactFilterOptions } from "@/lib/hooks/use-contact-filter-options";
import {
  createDefaultGuestDirectoryFilterState,
  decodeRecipientFilter,
  encodeGuestDirectoryFilterArgs,
  type GuestDirectoryFilterState,
} from "@/lib/text-blast-filters";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { GuestDirectoryFilters } from "./guest-directory-filters";

export function ContactAudiencePicker({
  audience,
  onChange,
}: {
  audience: ContactAudience | null;
  onChange: (audience: ContactAudience | null) => void;
}) {
  const workspace = useWorkspaceScope();
  const [filters, setFilters] = useState<GuestDirectoryFilterState>(() => {
    const defaults = {
      ...createDefaultGuestDirectoryFilterState(),
      smsConsentFilter: "consented" as const,
    };
    if (audience?.type !== "filter") return defaults;
    return {
      ...defaults,
      ...audience.filters,
      searchText: audience.filters.searchText ?? "",
      eventIds: audience.filters.eventIds ?? [],
      tags: audience.filters.tags ?? [],
      defaultListKeys: audience.filters.defaultListKeys ?? [],
      recipientFilter: decodeRecipientFilter(audience.filters.recipientFilter),
      recipientHistoryFilter:
        audience.filters.recipientHistoryFilter ?? defaults.recipientHistoryFilter,
    };
  });
  const directory = useContactDirectory(filters, workspace);
  const facetsQuery = useContactFilterOptions(workspace);
  const facets = facetsQuery.data;
  const blastsQuery = useQuery({
    ...convexQuery(api.textBlasts.getBlastsByWorkspaceWithSenderNames, {
      ...workspace?.queryArgs,
      limit: 100,
    }),
    enabled: Boolean(workspace),
  });
  const selectedIds = audience?.type === "contacts" ? audience.contactIds : [];
  const allMatching = audience?.type === "filter";
  const setSelected = (identifiers: Id<"workspaceContacts">[]) =>
    onChange(identifiers.length ? { type: "contacts", contactIds: identifiers } : null);
  const updateFilters = (next: GuestDirectoryFilterState) => {
    const changedAudience =
      JSON.stringify({ ...filters, sortBy: undefined, sortDirection: undefined }) !==
      JSON.stringify({ ...next, sortBy: undefined, sortDirection: undefined });
    setFilters(next);
    if (changedAudience) onChange(null);
  };
  const selectAllMatching = () => {
    const {
      sortBy: _sortBy,
      sortDirection: _sortDirection,
      ...encoded
    } = encodeGuestDirectoryFilterArgs(filters);
    onChange({
      type: "filter",
      filters: {
        ...encoded,
        eventIds: encoded.eventIds as Id<"events">[] | undefined,
        recipientHistoryFilter: encoded.recipientHistoryFilter
          ? {
              ...encoded.recipientHistoryFilter,
              textBlastIds: encoded.recipientHistoryFilter.textBlastIds as Id<"textBlasts">[],
            }
          : undefined,
      },
    });
  };
  return (
    <div className="space-y-3">
      {audience?.type === "legacy_events" ? (
        <div className="rounded-md border border-[var(--border-subtle)] p-3 text-sm">
          This draft keeps its original event, list, RSVP status, and guest selections.{" "}
          <Button variant="link" onClick={() => onChange(null)}>
            Choose a different audience
          </Button>
        </div>
      ) : (
        <>
          <GuestDirectoryFilters
            value={filters}
            onChange={updateFilters}
            variant="full"
            eventOptions={facets?.events ?? []}
            tagOptions={facets?.tags ?? []}
            defaultListKeyOptions={facets?.defaultListKeys ?? []}
            listKeyOptions={facets?.workspaceListKeys ?? []}
            customFieldOptions={facets?.customFieldOptions ?? []}
            blastOptions={(blastsQuery.data ?? []).map((blast) => ({
              id: blast._id,
              name: blast.name,
              deliveryTrackingEnabled: blast.deliveryTrackingEnabled === true,
              status: blast.status,
            }))}
          />
          {facetsQuery.error ? (
            <p role="alert">
              Filters could not be loaded.{" "}
              <Button variant="link" onClick={() => void facetsQuery.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {allMatching ? "All matching contacts selected" : `${selectedIds.length} selected`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!directory.configured || directory.isPreparing || Boolean(directory.error)}
              onClick={selectAllMatching}
            >
              Select all matching
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Clear selection
            </Button>
          </div>
          {directory.error ? (
            <div role="alert">
              {directory.error}{" "}
              <Button variant="outline" onClick={() => void directory.retry()}>
                Retry
              </Button>
            </div>
          ) : directory.isPreparing ? (
            <p role="status">Preparing the contact directory…</p>
          ) : !directory.configured ? (
            <p>Complete the filter details to search contacts.</p>
          ) : directory.isLoading ? (
            <p role="status">Searching contacts…</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="p-3">
                      <Checkbox
                        aria-label="Select contacts on this page"
                        disabled={allMatching}
                        checked={
                          directory.people.length > 0 &&
                          directory.people.every(
                            (person) => allMatching || selectedIds.includes(person.contactId),
                          )
                        }
                        onCheckedChange={(checked) =>
                          setSelected(
                            checked === true
                              ? Array.from(
                                  new Set([
                                    ...selectedIds,
                                    ...directory.people.map((person) => person.contactId),
                                  ]),
                                )
                              : selectedIds.filter(
                                  (identifier) =>
                                    !directory.people.some(
                                      (person) => person.contactId === identifier,
                                    ),
                                ),
                          )
                        }
                      />
                    </th>
                    <th>Contact</th>
                    <th>Tags</th>
                    <th>SMS</th>
                    <th className="pr-3">Events</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.people.map((person) => (
                    <tr
                      key={person.contactId}
                      className="border-b border-[var(--border-subtle)] last:border-0"
                    >
                      <td className="p-3">
                        <Checkbox
                          aria-label={`Select ${person.name}`}
                          checked={allMatching || selectedIds.includes(person.contactId)}
                          disabled={allMatching}
                          onCheckedChange={(checked) =>
                            setSelected(
                              checked === true
                                ? [...selectedIds, person.contactId]
                                : selectedIds.filter(
                                    (identifier) => identifier !== person.contactId,
                                  ),
                            )
                          }
                        />
                      </td>
                      <td className="py-3">
                        <div>{person.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {person.phoneObfuscated ?? "No phone"}
                        </div>
                      </td>
                      <td>{person.tags.join(", ")}</td>
                      <td>
                        {person.smsConsent && person.hasPhone
                          ? "Eligible"
                          : person.hasOptedOut
                            ? "Opted out"
                            : !person.hasPhone
                              ? "No phone"
                              : "No consent"}
                      </td>
                      <td className="tabular-nums">{person.eventCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {directory.people.length === 0 ? (
                <p className="p-6 text-center text-[var(--text-secondary)]">
                  No contacts match these filters.
                </p>
              ) : null}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!directory.hasPreviousPage || directory.isLoading}
              onClick={directory.previousPage}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!directory.hasNextPage || directory.isLoading}
              onClick={directory.nextPage}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

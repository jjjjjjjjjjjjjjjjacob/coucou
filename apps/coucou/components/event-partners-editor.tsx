"use client";

import type { Id } from "@convex/_generated/dataModel";
import { sanitizeEventPartners } from "@coucou/sdk/shared/event-partners";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { StorageImageUpload } from "@/components/flyer-upload";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EventPartner } from "@/lib/types";

export interface EventPartnerDraft {
  label: string;
  logoStorageId: string | null;
  url: string;
}

export interface EventPartnersEditorProps {
  entries: EventPartnerDraft[];
  entryName: string;
  onChange: (entries: EventPartnerDraft[]) => void;
}

const EMPTY_EVENT_PARTNER: EventPartnerDraft = {
  label: "",
  logoStorageId: null,
  url: "",
};

function getSafeEventPartnerUrl(value: string): string | null {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}

export function EventPartnersEditor({ entries, entryName, onChange }: EventPartnersEditorProps) {
  const updateEntry = <Key extends keyof EventPartnerDraft>(
    entryIndex: number,
    key: Key,
    value: EventPartnerDraft[Key],
  ) => {
    onChange(
      entries.map((entry, currentEntryIndex) =>
        currentEntryIndex === entryIndex ? { ...entry, [key]: value } : entry,
      ),
    );
  };

  return (
    <div className="space-y-3">
      {entries.map((entry, entryIndex) => (
        <div
          key={`${entryName}-${entryIndex}`}
          className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium capitalize">
              {entry.label.trim() || `${entryName} ${entryIndex + 1}`}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                onChange(entries.filter((_, currentEntryIndex) => currentEntryIndex !== entryIndex))
              }
              className="relative h-8 w-8 text-[var(--text-secondary)] after:absolute after:-inset-1.5 after:content-[''] hover:text-destructive"
              aria-label={`Remove ${entry.label.trim() || `${entryName} ${entryIndex + 1}`}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${entryName}-label-${entryIndex}`}>Label</FieldLabel>
              <Input
                id={`${entryName}-label-${entryIndex}`}
                value={entry.label}
                placeholder={entryName === "sponsor" ? "The Market" : "Nothing Radio"}
                onChange={(event) => updateEntry(entryIndex, "label", event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${entryName}-url-${entryIndex}`}>
                Link <span className="text-muted-foreground">(optional)</span>
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id={`${entryName}-url-${entryIndex}`}
                  type="url"
                  value={entry.url}
                  placeholder="https://example.com"
                  onChange={(event) => updateEntry(entryIndex, "url", event.target.value)}
                />
                {getSafeEventPartnerUrl(entry.url) ? (
                  <a
                    href={getSafeEventPartnerUrl(entry.url) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    aria-label={`Open ${entry.label.trim() || entryName} link`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </Field>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Wordmark or logo</div>
            <StorageImageUpload
              value={entry.logoStorageId}
              onChange={(logoStorageId) => updateEntry(entryIndex, "logoStorageId", logoStorageId)}
              emptyStateTitle={`Upload ${entryName} logo`}
              emptyStateDescription="Drag & drop or click to select an image"
              uploadedTitle={`${entryName[0].toUpperCase()}${entryName.slice(1)} logo uploaded`}
              previewAlt={`${entry.label.trim() || entryName} logo preview`}
              previewClassName="object-contain bg-white"
              helperText="Transparent PNG or SVG recommended. Wide wordmarks are supported."
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...entries, { ...EMPTY_EVENT_PARTNER }])}
        className="w-full border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <Plus className="h-4 w-4" />
        Add {entryName}
      </Button>
    </div>
  );
}

export function eventPartnersToDrafts(
  entries: readonly { label: string; logoStorageId: string; url?: string }[] | null | undefined,
): EventPartnerDraft[] {
  return (entries ?? []).map((entry) => ({
    label: entry.label,
    logoStorageId: entry.logoStorageId,
    url: entry.url ?? "",
  }));
}

export function sanitizeEventPartnerDraftsForSubmit(
  partnerDrafts: EventPartnerDraft[],
): EventPartner[] {
  const populatedDrafts = partnerDrafts.filter(
    (partnerDraft) =>
      partnerDraft.label.trim() || partnerDraft.logoStorageId || partnerDraft.url.trim(),
  );
  const partnerInputs = populatedDrafts.map((partnerDraft) => ({
    label: partnerDraft.label,
    logoStorageId: partnerDraft.logoStorageId as Id<"_storage">,
    url: partnerDraft.url || undefined,
  }));
  return sanitizeEventPartners(partnerInputs) ?? [];
}

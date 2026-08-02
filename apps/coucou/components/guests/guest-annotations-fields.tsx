"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface GuestAnnotationsFieldsProps {
  tags: string[];
  onTagsChange: (nextTags: string[]) => void;
  tagInput: string;
  onTagInputChange: (nextTagInput: string) => void;
  notes: string;
  onNotesChange: (nextNotes: string) => void;
  defaultListKey: string;
  onDefaultListKeyChange: (nextDefaultListKey: string) => void;
  listKeyOptions: string[];
  tagSuggestions: string[];
  idPrefix: string;
}

/**
 * Controlled tags/notes/default-list field group shared by the guest profile
 * sheet and the user detail page's annotations card.
 */
export function GuestAnnotationsFields({
  tags,
  onTagsChange,
  tagInput,
  onTagInputChange,
  notes,
  onNotesChange,
  defaultListKey,
  onDefaultListKeyChange,
  listKeyOptions,
  tagSuggestions,
  idPrefix,
}: GuestAnnotationsFieldsProps) {
  const addTag = (rawTag: string) => {
    const normalizedTag = rawTag.trim().toLowerCase();
    if (!normalizedTag || tags.includes(normalizedTag)) {
      onTagInputChange("");
      return;
    }
    onTagsChange([...tags, normalizedTag]);
    onTagInputChange("");
  };

  const unusedTagSuggestions = tagSuggestions.filter((suggestion) => !tags.includes(suggestion));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-tags-input`}>Tags</Label>
        {tags.length > 0 ? (
          <ChipGroup aria-label="Contact tags">
            {tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                onRemove={() => onTagsChange(tags.filter((existingTag) => existingTag !== tag))}
                removeLabel={`Remove tag ${tag}`}
              />
            ))}
          </ChipGroup>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">No tags yet.</p>
        )}
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-tags-input`}
            placeholder="Add a tag…"
            value={tagInput}
            onChange={(changeEvent) => onTagInputChange(changeEvent.target.value)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === ",") {
                keyboardEvent.preventDefault();
                addTag(tagInput);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!tagInput.trim()}
            onClick={() => addTag(tagInput)}
            className="border-[var(--border-subtle)]"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {unusedTagSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {unusedTagSuggestions.slice(0, 8).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addTag(suggestion)}
                className="rounded-full border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-default-list`}>Default list</Label>
        <Select
          id={`${idPrefix}-default-list`}
          value={defaultListKey}
          onValueChange={onDefaultListKeyChange}
        >
          <SelectOption value="">No default list</SelectOption>
          {listKeyOptions.map((listKeyOption) => (
            <SelectOption key={listKeyOption} value={listKeyOption}>
              {listKeyOption}
            </SelectOption>
          ))}
        </Select>
        <p className="text-xs text-[var(--text-secondary)]">
          Suggested when adding this contact to future events that have a matching list.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          placeholder="Private notes about this contact…"
          value={notes}
          onChange={(changeEvent) => onNotesChange(changeEvent.target.value)}
          rows={5}
        />
      </div>
    </div>
  );
}

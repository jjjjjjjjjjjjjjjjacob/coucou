"use client";

import React from "react";
import { GuestAnnotationsFields } from "@/components/guests/guest-annotations-fields";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { GuestDirectoryPerson } from "@/lib/types";

export interface GuestProfilePatch {
  tags: string[];
  notes: string;
  defaultListKey: string;
}

interface GuestProfileSheetProps {
  person: GuestDirectoryPerson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (person: GuestDirectoryPerson, patch: GuestProfilePatch) => Promise<void>;
  listKeyOptions: string[];
  tagSuggestions: string[];
  isSaving: boolean;
}

export function GuestProfileSheet({
  person,
  open,
  onOpenChange,
  onSave,
  listKeyOptions,
  tagSuggestions,
  isSaving,
}: GuestProfileSheetProps) {
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [defaultListKey, setDefaultListKey] = React.useState("");

  React.useEffect(() => {
    if (person && open) {
      setTags(person.tags);
      setTagInput("");
      setNotes(person.notes ?? "");
      setDefaultListKey(person.defaultListKey ?? "");
    }
  }, [person, open]);

  if (!person) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{person.name}</SheetTitle>
          <SheetDescription>
            Contact history plus organizer-only tags, notes, and default list.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="mb-5 space-y-2">
            <div className="text-sm font-medium text-[var(--text-primary)]">Invited by</div>
            {person.invitedByNames.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {person.invitedByNames.map((invitedByName) => (
                  <span
                    key={invitedByName.toLocaleLowerCase()}
                    className="rounded-full bg-[var(--surface-3)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                  >
                    {invitedByName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">No inviter history.</p>
            )}
          </div>
          <GuestAnnotationsFields
            tags={tags}
            onTagsChange={setTags}
            tagInput={tagInput}
            onTagInputChange={setTagInput}
            notes={notes}
            onNotesChange={setNotes}
            defaultListKey={defaultListKey}
            onDefaultListKeyChange={setDefaultListKey}
            listKeyOptions={listKeyOptions}
            tagSuggestions={tagSuggestions}
            idPrefix="guest-profile-sheet"
          />
        </div>

        <SheetFooter>
          <Button
            onClick={async () => {
              await onSave(person, { tags, notes, defaultListKey });
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-[var(--border-subtle)]"
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

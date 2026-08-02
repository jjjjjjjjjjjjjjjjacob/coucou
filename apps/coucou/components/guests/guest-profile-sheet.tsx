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
            Organizer-only tags, notes, and default list for this contact.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
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

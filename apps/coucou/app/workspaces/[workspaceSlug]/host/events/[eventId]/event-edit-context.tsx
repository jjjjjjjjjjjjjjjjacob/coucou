"use client";

import { Loader2, RotateCcw, Save } from "lucide-react";
import * as React from "react";
import { Path } from "react-hook-form";
import { Button } from "@/components/ui/button";
import type { EditEventFormData } from "@/lib/types";

export interface EventEditorController {
  save: () => Promise<void>;
  undo: () => void;
  setFormValue: (field: Path<EditEventFormData>, value: unknown) => void;
}

interface EventEditContextValue {
  isDirty: boolean;
  saving: boolean;
  sectionLabel: string;
  save: () => Promise<void>;
  undo: () => void;
  setFormValue: (field: Path<EditEventFormData>, value: unknown) => void;
  registerController: (controller: EventEditorController) => void;
  unregisterController: () => void;
  setIsDirty: (isDirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSectionLabel: (sectionLabel: string) => void;
}

const EventEditContext = React.createContext<EventEditContextValue | null>(null);

export function useEventEditContext() {
  return React.useContext(EventEditContext);
}

export function EventEditProvider({ children }: { children: React.ReactNode }) {
  const [controller, setController] = React.useState<EventEditorController | null>(null);
  const [isDirty, setIsDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [sectionLabel, setSectionLabel] = React.useState("");

  const save = React.useCallback(async () => {
    if (!controller) return;
    setSaving(true);
    try {
      await controller.save();
    } finally {
      setSaving(false);
    }
  }, [controller]);

  const undo = React.useCallback(() => {
    controller?.undo();
  }, [controller]);

  const setFormValue = React.useCallback(
    (field: Path<EditEventFormData>, value: unknown) => {
      controller?.setFormValue(field, value);
    },
    [controller],
  );

  const registerController = React.useCallback((nextController: EventEditorController) => {
    setController(nextController);
  }, []);

  const unregisterController = React.useCallback(() => {
    setController(null);
  }, []);

  const value = React.useMemo<EventEditContextValue>(
    () => ({
      isDirty,
      saving,
      sectionLabel,
      save,
      undo,
      setFormValue,
      registerController,
      unregisterController,
      setIsDirty,
      setSaving,
      setSectionLabel,
    }),
    [
      isDirty,
      saving,
      sectionLabel,
      save,
      undo,
      setFormValue,
      registerController,
      unregisterController,
    ],
  );

  return (
    <EventEditContext.Provider value={value}>
      {isDirty ? (
        <div
          className="z-40 mb-4 flex shrink-0 flex-col items-start justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]/95 p-3 shadow-[var(--shadow-card)] backdrop-blur animate-in fade-in slide-in-from-top-2 sm:flex-row sm:items-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--status-pending)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Unsaved changes in {sectionLabel}
            </span>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void undo()}
              disabled={saving}
              className="border-[var(--border-subtle)] bg-transparent"
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Undo changes
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-2 h-3.5 w-3.5" />
              )}
              Save {sectionLabel}
            </Button>
          </div>
        </div>
      ) : null}
      {children}
    </EventEditContext.Provider>
  );
}

export default EventEditContext;

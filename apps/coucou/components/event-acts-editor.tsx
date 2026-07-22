"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SECRET_GUEST_DISPLAY_NAME } from "@/lib/event-metadata";
import type { EventAct } from "@/lib/types";

export interface EventActsEditorProps {
  acts: EventAct[];
  onChange: (acts: EventAct[]) => void;
}

const EMPTY_ACT: EventAct = {
  name: "",
  descriptorBadges: [],
  socialUrl: "",
  isSecretGuest: false,
  secretDisplayName: DEFAULT_SECRET_GUEST_DISPLAY_NAME,
};

export function EventActsEditor({ acts, onChange }: EventActsEditorProps) {
  const displayedActs = acts.length > 0 ? acts : [EMPTY_ACT];

  const updateAct = <Key extends keyof EventAct>(
    actIndex: number,
    key: Key,
    value: EventAct[Key],
  ) => {
    const nextActs = displayedActs.map((act, currentActIndex) =>
      currentActIndex === actIndex ? { ...act, [key]: value } : act,
    );
    onChange(nextActs);
  };

  const updateDescriptorBadges = (actIndex: number, value: string) => {
    updateAct(
      actIndex,
      "descriptorBadges",
      value
        .split(",")
        .map((descriptorBadge) => descriptorBadge.trim())
        .filter((descriptorBadge) => descriptorBadge.length > 0),
    );
  };

  const addAct = () => {
    onChange([...displayedActs, { ...EMPTY_ACT }]);
  };

  const removeAct = (actIndex: number) => {
    const nextActs = displayedActs.filter((_, currentActIndex) => currentActIndex !== actIndex);
    onChange(nextActs.length > 0 ? nextActs : []);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {displayedActs.map((act, actIndex) => {
          const descriptorBadges = act.descriptorBadges ?? [];
          const isSecretGuest = act.isSecretGuest === true;
          return (
            <div
              key={actIndex}
              className="space-y-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Field>
                  <FieldLabel htmlFor={`act-name-${actIndex}`}>Act name</FieldLabel>
                  <Input
                    id={`act-name-${actIndex}`}
                    placeholder="Malice K"
                    value={act.name}
                    onChange={(event) => updateAct(actIndex, "name", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`act-social-${actIndex}`}>Social link</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`act-social-${actIndex}`}
                      type="url"
                      placeholder="https://instagram.com/..."
                      value={act.socialUrl ?? ""}
                      onChange={(event) => updateAct(actIndex, "socialUrl", event.target.value)}
                    />
                    {act.socialUrl ? (
                      <a
                        href={act.socialUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                        aria-label="Open act social link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAct(actIndex)}
                  className="relative h-8 w-8 justify-self-end text-[var(--text-secondary)] after:absolute after:-inset-1.5 after:content-[''] hover:text-destructive lg:self-end lg:justify-self-auto"
                  aria-label={`Remove ${act.name.trim() || `act ${actIndex + 1}`}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Field>
                  <FieldLabel htmlFor={`act-badges-${actIndex}`}>Descriptor badges</FieldLabel>
                  <Input
                    id={`act-badges-${actIndex}`}
                    placeholder="DJ, LIVE, FR"
                    value={descriptorBadges.join(", ")}
                    onChange={(event) => updateDescriptorBadges(actIndex, event.target.value)}
                  />
                  {descriptorBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {descriptorBadges.map((descriptorBadge) => (
                        <Badge key={descriptorBadge} variant="outline">
                          {descriptorBadge}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </Field>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 pt-0.5 lg:pt-6">
                    <Switch
                      id={`act-secret-${actIndex}`}
                      checked={isSecretGuest}
                      onCheckedChange={(checked) => updateAct(actIndex, "isSecretGuest", checked)}
                    />
                    <Label
                      htmlFor={`act-secret-${actIndex}`}
                      className="text-sm font-normal text-[var(--text-secondary)]"
                    >
                      Hide the real name publicly
                    </Label>
                  </div>
                  {isSecretGuest ? (
                    <Field>
                      <FieldLabel htmlFor={`act-secret-label-${actIndex}`}>
                        Public secret label
                      </FieldLabel>
                      <Input
                        id={`act-secret-label-${actIndex}`}
                        placeholder={DEFAULT_SECRET_GUEST_DISPLAY_NAME}
                        value={act.secretDisplayName ?? DEFAULT_SECRET_GUEST_DISPLAY_NAME}
                        onChange={(event) =>
                          updateAct(actIndex, "secretDisplayName", event.target.value)
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addAct}
        className="w-full border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <Plus className="h-4 w-4" />
        Add Act
      </Button>
    </div>
  );
}

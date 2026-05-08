"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
      <div className="space-y-1">
        <h3 className="font-medium text-sm text-muted-foreground">LINEUP ACTS</h3>
        <p className="text-sm text-muted-foreground">
          Add ordered acts, descriptor badges, social links, and public secret guest labels.
        </p>
      </div>

      <div className="space-y-4">
        {displayedActs.map((act, actIndex) => {
          const descriptorBadges = act.descriptorBadges ?? [];
          const isSecretGuest = act.isSecretGuest === true;
          return (
            <div key={actIndex} className="space-y-4 rounded-md border bg-background p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Act Name</label>
                  <Input
                    placeholder="Malice K"
                    value={act.name}
                    onChange={(event) => updateAct(actIndex, "name", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Social Link</label>
                  <div className="flex items-center gap-2">
                    <Input
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
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Open act social link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAct(actIndex)}
                  className="h-10 lg:self-end"
                  aria-label="Remove act"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Descriptor Badges
                  </label>
                  <Input
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
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Visibility</label>
                  <label className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                    <Checkbox
                      checked={isSecretGuest}
                      onCheckedChange={(checked) =>
                        updateAct(actIndex, "isSecretGuest", Boolean(checked))
                      }
                    />
                    <span>Hide the real name publicly</span>
                  </label>
                  {isSecretGuest ? (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Public Secret Label
                      </label>
                      <Input
                        placeholder={DEFAULT_SECRET_GUEST_DISPLAY_NAME}
                        value={act.secretDisplayName ?? DEFAULT_SECRET_GUEST_DISPLAY_NAME}
                        onChange={(event) =>
                          updateAct(actIndex, "secretDisplayName", event.target.value)
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addAct} className="w-full">
        <Plus className="h-4 w-4" />
        Add Act
      </Button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface WorkspaceLike {
  slug: string;
  name: string;
  limits?: {
    smsPerDay?: number;
    smsPerMonth?: number;
    rsvpsPerEvent?: number;
  };
}

export function LimitsEditDialog({
  workspace,
  open,
  onClose,
}: {
  workspace: WorkspaceLike | null;
  open: boolean;
  onClose: () => void;
}) {
  const setLimits = useMutation(api.workspaces.setWorkspaceLimits);
  const [smsPerDay, setSmsPerDay] = useState("");
  const [smsPerMonth, setSmsPerMonth] = useState("");
  const [rsvpsPerEvent, setRsvpsPerEvent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSmsPerDay(workspace?.limits?.smsPerDay?.toString() ?? "");
    setSmsPerMonth(workspace?.limits?.smsPerMonth?.toString() ?? "");
    setRsvpsPerEvent(workspace?.limits?.rsvpsPerEvent?.toString() ?? "");
  }, [workspace, open]);

  if (!workspace) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Limits · {workspace.name}</DialogTitle>
          <DialogDescription>
            Stored on the workspace. Enforcement is not yet wired in — these
            are advisory caps for the superadmin view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              SMS per day
            </label>
            <Input
              type="number"
              min="0"
              value={smsPerDay}
              onChange={(event) => setSmsPerDay(event.target.value)}
              placeholder="e.g. 500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              SMS per month
            </label>
            <Input
              type="number"
              min="0"
              value={smsPerMonth}
              onChange={(event) => setSmsPerMonth(event.target.value)}
              placeholder="e.g. 10000"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              RSVPs per event
            </label>
            <Input
              type="number"
              min="0"
              value={rsvpsPerEvent}
              onChange={(event) => setRsvpsPerEvent(event.target.value)}
              placeholder="e.g. 250"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={async () => {
              try {
                setSubmitting(true);
                await setLimits({ slug: workspace.slug, limits: undefined });
                toast.success("Limits cleared");
                onClose();
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={async () => {
              try {
                setSubmitting(true);
                const parse = (value: string) =>
                  value.trim() ? parseInt(value, 10) : undefined;
                await setLimits({
                  slug: workspace.slug,
                  limits: {
                    smsPerDay: parse(smsPerDay),
                    smsPerMonth: parse(smsPerMonth),
                    rsvpsPerEvent: parse(rsvpsPerEvent),
                  },
                });
                toast.success("Limits saved");
                onClose();
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Failed",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

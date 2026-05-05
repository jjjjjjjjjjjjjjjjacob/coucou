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
import { Select, SelectOption } from "@/components/ui/select";
import { toast } from "sonner";

interface WorkspaceLike {
  slug: string;
  name: string;
  plan?: {
    tier: string;
    priceCents?: number;
    billingStatus?: "ok" | "watch" | "overdue";
  };
}

export function PlanEditDialog({
  workspace,
  open,
  onClose,
}: {
  workspace: WorkspaceLike | null;
  open: boolean;
  onClose: () => void;
}) {
  const setPlan = useMutation(api.workspaces.setWorkspacePlan);
  const [tier, setTier] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [billingStatus, setBillingStatus] =
    useState<"ok" | "watch" | "overdue">("ok");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (workspace?.plan) {
      setTier(workspace.plan.tier);
      setPriceDollars(
        workspace.plan.priceCents
          ? (workspace.plan.priceCents / 100).toString()
          : "",
      );
      setBillingStatus(workspace.plan.billingStatus ?? "ok");
    } else {
      setTier("");
      setPriceDollars("");
      setBillingStatus("ok");
    }
  }, [workspace]);

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
          <DialogTitle>Plan · {workspace.name}</DialogTitle>
          <DialogDescription>
            Stored on the workspace. No external billing provider is wired up
            yet — values are display-only metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              Tier
            </label>
            <Input
              value={tier}
              onChange={(event) => setTier(event.target.value)}
              placeholder="house, white-label, resident…"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              Monthly price (USD)
            </label>
            <Input
              type="number"
              min="0"
              value={priceDollars}
              onChange={(event) => setPriceDollars(event.target.value)}
              placeholder="180"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              Billing status
            </label>
            <Select
              value={billingStatus}
              onChange={(event) =>
                setBillingStatus(
                  event.target.value as "ok" | "watch" | "overdue",
                )
              }
            >
              <SelectOption value="ok">ok</SelectOption>
              <SelectOption value="watch">watch</SelectOption>
              <SelectOption value="overdue">overdue</SelectOption>
            </Select>
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
                await setPlan({ slug: workspace.slug, plan: undefined });
                toast.success("Plan cleared");
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
            disabled={submitting || !tier.trim()}
            onClick={async () => {
              try {
                setSubmitting(true);
                const priceCents = priceDollars.trim()
                  ? Math.round(parseFloat(priceDollars) * 100)
                  : undefined;
                await setPlan({
                  slug: workspace.slug,
                  plan: {
                    tier: tier.trim(),
                    priceCents,
                    billingStatus,
                  },
                });
                toast.success("Plan saved");
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

"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface WorkspaceLike {
  _id: Id<"workspaces">;
  name: string;
}

interface SenderLike {
  _id: Id<"smsSenders">;
  phoneNumber: string;
  brandLabel?: string;
  isDefault?: boolean;
  verifiedAt?: number;
}

export function SenderEditDialog({
  workspace,
  sender,
  open,
  onClose,
}: {
  workspace: WorkspaceLike | null;
  sender: SenderLike | null;
  open: boolean;
  onClose: () => void;
}) {
  const upsert = useMutation(api.smsSenders.upsert);
  const remove = useMutation(api.smsSenders.remove);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [brandLabel, setBrandLabel] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sender) {
      setPhoneNumber(sender.phoneNumber);
      setBrandLabel(sender.brandLabel ?? "");
      setIsDefault(sender.isDefault ?? false);
      setVerified(Boolean(sender.verifiedAt));
    } else {
      setPhoneNumber("");
      setBrandLabel("");
      setIsDefault(false);
      setVerified(false);
    }
  }, [sender, open]);

  if (!workspace) return null;

  const isEditing = sender !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit sender" : "Add sender"} · {workspace.name}
          </DialogTitle>
          <DialogDescription>
            Stored locally. No Twilio provisioning happens — values are display metadata for this
            superadmin view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              Phone number
            </label>
            <Input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+15551234567"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
              Brand label (optional)
            </label>
            <Input
              value={brandLabel}
              onChange={(event) => setBrandLabel(event.target.value)}
              placeholder="DOJO POMODORO"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sender-is-default"
              checked={isDefault}
              onCheckedChange={(value) => setIsDefault(Boolean(value))}
            />
            <label htmlFor="sender-is-default" className="text-[13px]">
              Default sender for this workspace
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sender-verified"
              checked={verified}
              onCheckedChange={(value) => setVerified(Boolean(value))}
            />
            <label htmlFor="sender-verified" className="text-[13px]">
              Mark as verified
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isEditing ? (
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={async () => {
                if (!sender) return;
                try {
                  setSubmitting(true);
                  await remove({ id: sender._id });
                  toast.success("Sender removed");
                  onClose();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed");
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Remove
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={submitting || !phoneNumber.trim()}
            onClick={async () => {
              try {
                setSubmitting(true);
                await upsert({
                  id: sender?._id,
                  workspaceId: workspace._id,
                  phoneNumber: phoneNumber.trim(),
                  brandLabel: brandLabel.trim() || undefined,
                  isDefault,
                  verifiedAt: verified ? (sender?.verifiedAt ?? Date.now()) : undefined,
                });
                toast.success(isEditing ? "Sender updated" : "Sender added");
                onClose();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {isEditing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useOrganizationList } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getToastErrorMessage, runMutationWithToast } from "@/lib/toast-mutation";

function optionalString(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function readPrimaryDomainFromMutationResult(mutationResult: unknown): string | null | undefined {
  if (typeof mutationResult !== "object" || mutationResult === null) {
    return undefined;
  }

  const resultRecord = mutationResult as { primaryDomain?: unknown };
  if (typeof resultRecord.primaryDomain === "string") {
    return resultRecord.primaryDomain;
  }
  if (resultRecord.primaryDomain === null) {
    return null;
  }
  return undefined;
}

export interface WorkspaceDomainDialogWorkspace {
  slug: string;
  name: string;
  primaryDomain?: string | null;
  clerkOrganizationId?: string | null;
  organizationId: string;
}

interface WorkspaceDomainDialogProps {
  workspace: WorkspaceDomainDialogWorkspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (primaryDomain: string | null) => void;
}

/**
 * Dialog for editing a tenant workspace's primary URL. Triggered from the
 * workspace card row (pencil action or right-click context menu).
 */
export function WorkspaceDomainDialog({
  workspace,
  open,
  onOpenChange,
  onSaved,
}: WorkspaceDomainDialogProps) {
  const { setActive } = useOrganizationList();
  const setTenantWorkspacePrimaryDomain = useMutation(
    api.workspaces.setTenantWorkspacePrimaryDomain,
  );
  const [primaryDomainDraft, setPrimaryDomainDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPrimaryDomainDraft(workspace?.primaryDomain ?? "");
    }
  }, [open, workspace?.primaryDomain]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;

    const clerkOrganizationId = workspace.organizationId ?? workspace.clerkOrganizationId;
    if (!clerkOrganizationId) {
      toast.error("Workspace organization is not configured.");
      return;
    }

    const primaryDomain = optionalString(primaryDomainDraft);
    if (!primaryDomain) {
      toast.error("Primary URL is required.");
      return;
    }

    setIsSaving(true);
    try {
      const mutationResult = await runMutationWithToast(
        () =>
          setTenantWorkspacePrimaryDomain({
            slug: workspace.slug,
            clerkOrganizationId,
            primaryDomain,
          }),
        {
          loading: "Saving tenant URL...",
          success: "Tenant URL updated",
        },
      );
      if (setActive) {
        void setActive({ organization: clerkOrganizationId }).catch(() => undefined);
      }
      const savedPrimaryDomain = readPrimaryDomainFromMutationResult(mutationResult);
      onSaved?.(savedPrimaryDomain === undefined ? primaryDomain : savedPrimaryDomain);
      onOpenChange(false);
    } catch (error) {
      toast.error(getToastErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit primary URL</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            Set the primary URL for {workspace?.name ?? "this workspace"}. Guests are redirected
            here from shared links.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="workspace-primary-domain">Primary URL</Label>
            <Input
              id="workspace-primary-domain"
              value={primaryDomainDraft}
              onChange={(event) => setPrimaryDomainDraft(event.target.value)}
              placeholder="dojopomodoro.club"
              inputMode="url"
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-[var(--border-subtle)] bg-transparent"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} aria-busy={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save URL
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

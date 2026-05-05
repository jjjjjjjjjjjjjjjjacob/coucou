"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
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
import { Textarea } from "@/components/ui/textarea";
import {
  getToastErrorMessage,
  runMutationWithToast,
} from "@/lib/toast-mutation";

interface ApplicationLike {
  _id: Id<"tenantApplications">;
  name: string;
  city?: string;
  operator: string;
  operatorEmail?: string;
  body?: string;
  submittedAt: number;
  status: "pending" | "accepted" | "denied";
  tenantAdminEmail?: string;
  clerkOrganizationId?: string;
  clerkOrganizationSlug?: string;
  clerkInvitationId?: string;
  denialReason?: string;
}

export function TenantApplicationDetailDialog({
  application,
  open,
  onClose,
}: {
  application: ApplicationLike | null;
  open: boolean;
  onClose: () => void;
}) {
  const accept = useAction(api.tenantApplications.acceptApplication);
  const deny = useMutation(api.tenantApplications.denyApplication);
  const [slug, setSlug] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [tenantAdminEmail, setTenantAdminEmail] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!application || !open) {
      return;
    }

    setTenantAdminEmail(
      application.tenantAdminEmail ?? application.operatorEmail ?? "",
    );
  }, [application, open]);

  if (!application) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{application.name}</DialogTitle>
          <DialogDescription>
            Submitted by {application.operator}
            {application.operatorEmail ? ` (${application.operatorEmail})` : ""}
            {application.city ? ` · ${application.city}` : ""}
          </DialogDescription>
        </DialogHeader>

        {application.body ? (
          <div
            className="rounded border p-3 text-[13px]"
            style={{
              borderColor: "var(--tt-rule)",
              color: "var(--tt-fg-dim)",
            }}
          >
            {application.body}
          </div>
        ) : null}

        {application.status === "pending" ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
                Workspace slug
              </label>
              <Input
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="e.g. salon-du-nord"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
                Primary domain (optional)
              </label>
              <Input
                value={primaryDomain}
                onChange={(event) => setPrimaryDomain(event.target.value)}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
                Tenant admin email
              </label>
              <Input
                value={tenantAdminEmail}
                onChange={(event) => setTenantAdminEmail(event.target.value)}
                placeholder="operator@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[12px]" style={{ color: "var(--tt-fg-mute)" }}>
                Denial reason (optional)
              </label>
              <Textarea
                value={denialReason}
                onChange={(event) => setDenialReason(event.target.value)}
                placeholder="Visible only in audit log"
                rows={2}
              />
            </div>
          </div>
        ) : (
          <div className="pt-2 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
            Already {application.status}.
            {application.denialReason ? ` Reason: ${application.denialReason}` : ""}
          </div>
        )}

        <DialogFooter className="gap-2">
          {application.status === "pending" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={async () => {
                  try {
                    setSubmitting(true);
                    await runMutationWithToast(
                      () =>
                        deny({
                          id: application._id,
                          denialReason: denialReason.trim() || undefined,
                        }),
                      {
                        loading: "Denying application...",
                        success: "Application denied",
                        error: (error) =>
                          getToastErrorMessage(error, "Failed to deny"),
                      },
                    );
                    onClose();
                  } catch {
                    // Error toast is handled by runMutationWithToast.
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                Deny
              </Button>
              <Button
                type="button"
                disabled={submitting || !slug.trim() || !tenantAdminEmail.trim()}
                onClick={async () => {
                  try {
                    setSubmitting(true);
                    await runMutationWithToast(
                      () =>
                        accept({
                          id: application._id,
                          slug: slug.trim(),
                          primaryDomain: primaryDomain.trim() || undefined,
                          tenantAdminEmail: tenantAdminEmail.trim(),
                        }),
                      {
                        loading: "Accepting application...",
                        success: "Application accepted",
                        error: (error) =>
                          getToastErrorMessage(error, "Failed to accept"),
                      },
                    );
                    onClose();
                  } catch {
                    // Error toast is handled by runMutationWithToast.
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                Accept
              </Button>
            </>
          ) : (
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

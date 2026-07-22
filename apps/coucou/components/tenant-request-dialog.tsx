"use client";

import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { getToastErrorMessage, runMutationWithToast } from "@/lib/toast-mutation";

function optionalString(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}

interface TenantRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOperatorName: string;
  defaultOperatorEmail: string;
}

/**
 * "Request a new tenant" dialog — submitted applications go to Coucou review.
 * Triggered by the + New tenant button on the dashboard.
 */
export function TenantRequestDialog({
  open,
  onOpenChange,
  defaultOperatorName,
  defaultOperatorEmail,
}: TenantRequestDialogProps) {
  const submitApplication = useMutation(api.tenantApplications.submitApplication);
  const [tenantName, setTenantName] = useState("");
  const [tenantCity, setTenantCity] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [operatorEmail, setOperatorEmail] = useState("");
  const [requestDetails, setRequestDetails] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestStatusMessage, setRequestStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOperatorName((current) => current || defaultOperatorName);
      setOperatorEmail((current) => current || defaultOperatorEmail);
    }
  }, [open, defaultOperatorName, defaultOperatorEmail]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTenantName = tenantName.trim();
    const trimmedOperatorName = operatorName.trim() || defaultOperatorName;

    if (!trimmedTenantName) {
      setRequestStatusMessage("Tenant name is required.");
      return;
    }

    setIsSubmittingRequest(true);
    setRequestStatusMessage(null);
    try {
      await runMutationWithToast(
        () =>
          submitApplication({
            name: trimmedTenantName,
            city: optionalString(tenantCity),
            operator: trimmedOperatorName,
            operatorEmail: optionalString(operatorEmail),
            body: optionalString(requestDetails),
          }),
        {
          loading: "Submitting tenant request...",
          success: "Tenant request submitted",
        },
      );
      setTenantName("");
      setTenantCity("");
      setRequestDetails("");
      onOpenChange(false);
    } catch (error) {
      setRequestStatusMessage(getToastErrorMessage(error));
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a new tenant</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            Submit a tenant for Coucou review. We&apos;ll follow up with the operator email.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="tenant-name">Tenant name</Label>
            <Input
              id="tenant-name"
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              placeholder="Dojo Pomodoro"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-city">City</Label>
            <Input
              id="tenant-city"
              value={tenantCity}
              onChange={(event) => setTenantCity(event.target.value)}
              placeholder="New York"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operator-name">Operator</Label>
            <Input
              id="operator-name"
              value={operatorName}
              onChange={(event) => setOperatorName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operator-email">Operator email</Label>
            <Input
              id="operator-email"
              type="email"
              value={operatorEmail}
              onChange={(event) => setOperatorEmail(event.target.value)}
              placeholder="operator@example.com"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="request-details">Notes</Label>
            <Textarea
              id="request-details"
              value={requestDetails}
              onChange={(event) => setRequestDetails(event.target.value)}
              placeholder="Audience, launch timing, or setup details."
              className="min-h-24"
            />
          </div>

          {requestStatusMessage ? (
            <p className="text-[13px] sm:col-span-2" style={{ color: "var(--tt-fg-dim)" }}>
              {requestStatusMessage}
            </p>
          ) : null}

          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              className="border-[var(--border-subtle)] bg-transparent"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingRequest} aria-busy={isSubmittingRequest}>
              {isSubmittingRequest ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Submit request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

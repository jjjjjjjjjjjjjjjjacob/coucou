"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildReferralUrl } from "@coucou/sdk/shared/event-routes";
import { useAction, useMutation } from "convex/react";
import { Check, Copy } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { siteConfiguration } from "@/lib/site";

type StoredCredentialPassword = {
  listKey: string;
  password: string | null;
  credentialId: string;
};

export interface ShareEventPopoverProps {
  eventId: Id<"events">;
  eventUrl?: string | null;
  children: React.ReactNode;
}

export function resolveShareEventBaseUrl({
  eventId,
  eventUrl,
  origin,
}: {
  eventId: string;
  eventUrl?: string | null;
  origin?: string | null;
}): string {
  const trimmedEventUrl = eventUrl?.trim();
  if (trimmedEventUrl) {
    return trimmedEventUrl.replace(/\/+$/, "");
  }

  if (origin) {
    return `${origin.replace(/\/+$/, "")}/events/${eventId}`;
  }

  return `/events/${eventId}`;
}

export function resolveShareEventUrlWithRouteId(baseUrl: string, eventRouteId: string): string {
  try {
    const parsedUrl = new URL(baseUrl);
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/events\/[^/]+/, `/events/${eventRouteId}`);
    return parsedUrl.toString();
  } catch {
    const parsedUrl = new URL(baseUrl, "https://coucou.local");
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/events\/[^/]+/, `/events/${eventRouteId}`);
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback below.
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
}

export function ShareEventPopover({ eventId, eventUrl, children }: ShareEventPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [storedCredentialPasswords, setStoredCredentialPasswords] = useState<
    StoredCredentialPassword[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedBasic, setCopiedBasic] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const getStoredPasswords = useAction(api.credentialsNode.getPasswordsForEvent);
  const ensureEventShortId = useMutation(api.events.ensureShortId);
  const ensureCurrentReferralCode = useMutation(api.users.ensureCurrentReferralCode);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      getStoredPasswords({
        eventId,
        siteKey: siteConfiguration.siteKey,
      })
        .then((results) => {
          setStoredCredentialPasswords(results);
        })
        .catch(() => {
          setStoredCredentialPasswords([]);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, eventId, getStoredPasswords]);

  const baseUrl = resolveShareEventBaseUrl({
    eventId,
    eventUrl,
    origin: typeof window !== "undefined" ? window.location.origin : null,
  });

  const resolveShortBaseUrl = async () => {
    try {
      const result = await ensureEventShortId({ eventId });
      return resolveShareEventUrlWithRouteId(baseUrl, result.shortId);
    } catch {
      return baseUrl;
    }
  };

  const copyToClipboard = async (text: string, index: number | "basic" | "referral") => {
    const copied = await copyTextToClipboard(text);
    if (!copied) {
      toast.error("Failed to copy link");
      return;
    }
    if (index === "basic") {
      setCopiedBasic(true);
      setTimeout(() => setCopiedBasic(false), 2000);
    } else if (index === "referral") {
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2000);
    } else {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
    toast.success("Link copied to clipboard");
  };

  const copyBasicLink = async () => {
    const shortBaseUrl = await resolveShortBaseUrl();
    await copyToClipboard(shortBaseUrl, "basic");
  };

  const copyReferralLink = async () => {
    try {
      const shortBaseUrl = await resolveShortBaseUrl();
      const { referralCode } = await ensureCurrentReferralCode({});
      await copyToClipboard(buildReferralUrl(shortBaseUrl, referralCode), "referral");
    } catch (error) {
      const errorDetails = error as Error;
      toast.error(errorDetails.message || "Failed to create referral link");
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Share Event Link</h4>

          {/* Basic link without password */}
          <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Link only (no password)</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={copyBasicLink}>
              {copiedBasic ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Link with your referral</p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" onClick={copyReferralLink}>
              {copiedReferral ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          {/* Per-list links with passwords */}
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2">Loading lists...</p>
          ) : storedCredentialPasswords.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Links with password:</p>
              {storedCredentialPasswords.map((credential, index) => {
                return (
                  <div
                    key={credential.credentialId}
                    className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {credential.listKey.toUpperCase()}
                        </Badge>
                        {credential.password ? (
                          <span className="text-xs text-muted-foreground truncate">
                            pw: {credential.password}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            no password stored
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={async () => {
                        const shortBaseUrl = await resolveShortBaseUrl();
                        const shortListUrl = credential.password
                          ? `${shortBaseUrl}?list=${encodeURIComponent(credential.listKey)}&password=${encodeURIComponent(credential.password)}`
                          : `${shortBaseUrl}?list=${encodeURIComponent(credential.listKey)}`;
                        await copyToClipboard(shortListUrl, index);
                      }}
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

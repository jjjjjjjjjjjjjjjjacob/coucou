"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildReferralUrl } from "@coucou/sdk/shared/event-routes";
import { useAction, useMutation } from "convex/react";
import { Check, Copy } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type StoredCredentialPassword = {
  listKey: string;
  password: string | null;
  credentialId: string;
};

type ListShareRouteState = {
  listKey: string;
  password?: string | null;
};

type ShareCopyTarget =
  | "basic"
  | "referral"
  | { type: "list"; index: number }
  | { type: "listReferral"; index: number };

interface ClipboardCopyResult {
  copied: boolean;
  errorMessage?: string;
}

export interface ShareEventPopoverProps {
  eventId: Id<"events">;
  eventUrl?: string | null;
  siteKey?: string;
  workspaceSlug?: string;
  children: React.ReactNode;
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
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

export function buildListShareUrl(
  baseUrl: string,
  listShareRouteState: ListShareRouteState,
): string {
  const trimmedListKey = listShareRouteState.listKey.trim();
  const trimmedPassword = listShareRouteState.password?.trim();

  try {
    const parsedUrl = new URL(baseUrl);
    parsedUrl.searchParams.set("list", trimmedListKey);
    if (trimmedPassword) {
      parsedUrl.searchParams.set("password", trimmedPassword);
    } else {
      parsedUrl.searchParams.delete("password");
    }
    return parsedUrl.toString();
  } catch {
    const parsedUrl = new URL(baseUrl, "https://coucou.local");
    parsedUrl.searchParams.set("list", trimmedListKey);
    if (trimmedPassword) {
      parsedUrl.searchParams.set("password", trimmedPassword);
    } else {
      parsedUrl.searchParams.delete("password");
    }
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  }
}

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  let clipboardErrorMessage: string | undefined;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { copied: true };
    }
  } catch (error) {
    clipboardErrorMessage = getErrorMessage(error);
    // Fall through to the textarea fallback below.
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return {
      copied: false,
      errorMessage: clipboardErrorMessage ?? "Clipboard copy is unavailable in this browser.",
    };
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    const copied = document.execCommand("copy");
    return {
      copied,
      errorMessage: copied
        ? undefined
        : (clipboardErrorMessage ?? "Document copy fallback failed."),
    };
  } catch (error) {
    return {
      copied: false,
      errorMessage: getErrorMessage(error) ?? clipboardErrorMessage,
    };
  } finally {
    document.body.removeChild(textArea);
  }
}

export function ShareEventPopover({
  eventId,
  eventUrl,
  siteKey,
  workspaceSlug,
  children,
}: ShareEventPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [storedCredentialPasswords, setStoredCredentialPasswords] = useState<
    StoredCredentialPassword[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [credentialLoadErrorMessage, setCredentialLoadErrorMessage] = useState<string | null>(null);
  const [isPreparingShareLinks, setIsPreparingShareLinks] = useState(false);
  const [preparedShortBaseUrl, setPreparedShortBaseUrl] = useState<string | null>(null);
  const [preparedReferralCode, setPreparedReferralCode] = useState<string | null>(null);
  const [sharePreparationErrorMessage, setSharePreparationErrorMessage] = useState<string | null>(
    null,
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedReferralIndex, setCopiedReferralIndex] = useState<number | null>(null);
  const [copiedBasic, setCopiedBasic] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const getStoredPasswords = useAction(api.credentialsNode.getPasswordsForEvent);
  const ensureEventShortId = useMutation(api.events.ensureShortId);
  const ensureCurrentReferralCode = useMutation(api.users.ensureCurrentReferralCode);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setCredentialLoadErrorMessage(null);
      getStoredPasswords({
        eventId,
        siteKey,
        workspaceSlug,
      })
        .then((results) => {
          setStoredCredentialPasswords(results);
        })
        .catch((error: unknown) => {
          console.warn("Failed to load share list links.", error);
          setCredentialLoadErrorMessage(
            getErrorMessage(error) ?? "List links could not be loaded.",
          );
          setStoredCredentialPasswords([]);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, eventId, siteKey, workspaceSlug, getStoredPasswords]);

  const baseUrl = resolveShareEventBaseUrl({
    eventId,
    eventUrl,
    origin: typeof window !== "undefined" ? window.location.origin : null,
  });

  const resolvePreparedShortBaseUrl = useCallback(async () => {
    if (!eventUrl?.trim() && (siteKey || workspaceSlug)) {
      throw new Error("Public event URL is not ready yet. Try again in a moment.");
    }

    try {
      const result = await ensureEventShortId({ eventId, siteKey, workspaceSlug });
      if (!result.shortId.trim()) {
        throw new Error("The event short link service returned an empty short ID.");
      }
      return resolveShareEventUrlWithRouteId(baseUrl, result.shortId);
    } catch (error) {
      throw new Error(getErrorMessage(error) ?? "Failed to create a short event link.");
    }
  }, [baseUrl, eventId, eventUrl, ensureEventShortId, siteKey, workspaceSlug]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;

    async function prepareShareLinks() {
      setIsPreparingShareLinks(true);
      setPreparedShortBaseUrl(null);
      setPreparedReferralCode(null);
      setSharePreparationErrorMessage(null);

      try {
        const shortBaseUrl = await resolvePreparedShortBaseUrl();
        if (isCancelled) {
          return;
        }

        setPreparedShortBaseUrl(shortBaseUrl);

        try {
          const { referralCode } = await ensureCurrentReferralCode({});
          if (!isCancelled) {
            setPreparedReferralCode(referralCode);
          }
        } catch (error) {
          console.warn("Failed to prepare referral code for share links.", error);
          if (!isCancelled) {
            setSharePreparationErrorMessage(
              `Referral links unavailable: ${getErrorMessage(error) ?? "Failed to create referral code."}`,
            );
          }
        }
      } catch (error) {
        console.warn("Failed to prepare admin share links.", error);
        if (!isCancelled) {
          setSharePreparationErrorMessage(
            getErrorMessage(error) ?? "Failed to prepare share links.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsPreparingShareLinks(false);
        }
      }
    }

    void prepareShareLinks();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, resolvePreparedShortBaseUrl, ensureCurrentReferralCode]);

  const copyToClipboard = async (text: string, target: ShareCopyTarget) => {
    const copyResult = await copyTextToClipboard(text);
    if (!copyResult.copied) {
      console.warn("Failed to copy share link.", {
        target,
        reason: copyResult.errorMessage,
      });
      toast.error("Failed to copy link", {
        description: copyResult.errorMessage,
      });
      return false;
    }
    if (target === "basic") {
      setCopiedBasic(true);
      setTimeout(() => setCopiedBasic(false), 2000);
    } else if (target === "referral") {
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2000);
    } else if (target.type === "list") {
      setCopiedIndex(target.index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopiedReferralIndex(target.index);
      setTimeout(() => setCopiedReferralIndex(null), 2000);
    }
    toast.success("Link copied to clipboard");
    return true;
  };

  const reportUnpreparedLink = (linkType: string) => {
    toast.error(`${linkType} is still preparing`, {
      description: sharePreparationErrorMessage ?? "Open the share menu again and try once more.",
    });
  };

  const copyBasicLink = async () => {
    if (!preparedShortBaseUrl) {
      reportUnpreparedLink("Short link");
      return;
    }

    await copyToClipboard(preparedShortBaseUrl, "basic");
  };

  const copyReferralLink = async () => {
    if (!preparedShortBaseUrl || !preparedReferralCode) {
      reportUnpreparedLink("Referral link");
      return;
    }

    await copyToClipboard(buildReferralUrl(preparedShortBaseUrl, preparedReferralCode), "referral");
  };

  const copyListLink = async (credential: StoredCredentialPassword, index: number) => {
    if (!preparedShortBaseUrl) {
      reportUnpreparedLink("List link");
      return;
    }

    await copyToClipboard(buildListShareUrl(preparedShortBaseUrl, credential), {
      type: "list",
      index,
    });
  };

  const copyListReferralLink = async (credential: StoredCredentialPassword, index: number) => {
    if (!preparedShortBaseUrl || !preparedReferralCode) {
      reportUnpreparedLink("List referral link");
      return;
    }

    const shortListUrl = buildListShareUrl(preparedShortBaseUrl, credential);
    await copyToClipboard(buildReferralUrl(shortListUrl, preparedReferralCode), {
      type: "listReferral",
      index,
    });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Share Event Link</h4>

          {isPreparingShareLinks ? (
            <p className="rounded border bg-muted/20 p-2 text-xs text-muted-foreground">
              Preparing share links...
            </p>
          ) : sharePreparationErrorMessage ? (
            <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {sharePreparationErrorMessage}
            </p>
          ) : null}

          {/* Basic link without password */}
          <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Short link (no referral)</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={copyBasicLink}
              disabled={isPreparingShareLinks || !preparedShortBaseUrl}
            >
              {copiedBasic ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2 p-2 rounded border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Short referral link</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={copyReferralLink}
              disabled={isPreparingShareLinks || !preparedShortBaseUrl || !preparedReferralCode}
            >
              {copiedReferral ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>

          {/* Per-list links with passwords */}
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2">Loading lists...</p>
          ) : credentialLoadErrorMessage ? (
            <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {credentialLoadErrorMessage}
            </p>
          ) : storedCredentialPasswords.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">List links with passwords:</p>
              {storedCredentialPasswords.map((credential, index) => {
                return (
                  <div
                    key={credential.credentialId}
                    className="space-y-2 p-2 rounded border bg-muted/20"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
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
                    <div className="grid grid-cols-2 gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1"
                        onClick={() => copyListLink(credential, index)}
                        disabled={isPreparingShareLinks || !preparedShortBaseUrl}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span className="text-xs">Short</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1"
                        onClick={() => copyListReferralLink(credential, index)}
                        disabled={
                          isPreparingShareLinks || !preparedShortBaseUrl || !preparedReferralCode
                        }
                      >
                        {copiedReferralIndex === index ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        <span className="text-xs">Referral</span>
                      </Button>
                    </div>
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

"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildPublicEventUrl, buildReferralUrl } from "@coucou/sdk/shared/event-routes";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Share } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildEventReferralShareButtonThemeStyle,
  type EventReferralShareButtonVariant,
} from "@/lib/event-referral-share-theme";
import { siteConfiguration } from "@/lib/site";

interface EventReferralShareButtonProps {
  event: {
    _id: Id<"events">;
    workspaceSlug?: string | null;
    siteKey?: string | null;
    shortId?: string | null;
    name?: string | null;
  };
  className?: string;
  showLabel?: boolean;
  variant?: EventReferralShareButtonVariant;
}

interface ClipboardCopyResult {
  copied: boolean;
  errorMessage?: string;
}

type ShareWorkspaceSite = {
  siteKey: string;
  domain?: string;
  appKind?: string;
};

type ShareWorkspace = {
  primaryDomain?: string;
  sites?: ShareWorkspaceSite[];
} | null;

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function isShareAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveConfiguredShareDomain(
  workspace: ShareWorkspace | undefined,
  siteKey: string,
): string | null {
  const primaryDomain = workspace?.primaryDomain?.trim();
  if (primaryDomain) return primaryDomain;

  const sites = workspace?.sites ?? [];
  const matchingClientSite =
    sites.find((site) => site.siteKey === siteKey && site.appKind !== "admin") ??
    sites.find((site) => site.appKind === "client") ??
    sites.find((site) => site.appKind !== "admin");
  return matchingClientSite?.domain?.trim() || null;
}

async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  let clipboardErrorMessage: string | undefined;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { copied: true };
    }
  } catch (error) {
    clipboardErrorMessage = getErrorMessage(error);
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return {
      copied: false,
      errorMessage: clipboardErrorMessage ?? "Clipboard API is unavailable in this browser.",
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

export function EventReferralShareButton({
  event,
  className,
  showLabel = true,
  variant = "outline",
}: EventReferralShareButtonProps) {
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexAuthLoading } =
    useConvexAuth();
  const ensureCurrentReferralCode = useMutation(api.users.ensureCurrentReferralCode);
  const ensureEventShortId = useMutation(api.events.ensureShortId);
  const [preparedReferralUrl, setPreparedReferralUrl] = useState<string | null>(null);
  const [preparationErrorMessage, setPreparationErrorMessage] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const eventDocumentId = event._id;
  const eventWorkspaceSlug = event.workspaceSlug?.trim() || null;
  const eventShortId = event.shortId;
  const vercelEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    eventWorkspaceSlug ? { slug: eventWorkspaceSlug } : "skip",
  ) as ShareWorkspace | undefined;
  const configuredShareDomain = resolveConfiguredShareDomain(workspace, siteConfiguration.siteKey);
  const isWorkspaceLoading = Boolean(eventWorkspaceSlug) && workspace === undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isWorkspaceLoading) {
      setIsPreparing(true);
      return;
    }
    if (isConvexAuthLoading) {
      setIsPreparing(true);
      return;
    }
    if (!isConvexAuthenticated) {
      setIsPreparing(false);
      setPreparedReferralUrl(null);
      setPreparationErrorMessage("Sign in is still syncing. Try again in a moment.");
      return;
    }

    let isCancelled = false;

    async function prepareReferralUrl() {
      setIsPreparing(true);
      setPreparationErrorMessage(null);
      try {
        const { referralCode } = await ensureCurrentReferralCode({});
        const eventShortIdResult = await ensureEventShortId({
          eventId: eventDocumentId,
          siteKey: siteConfiguration.siteKey,
        }).catch((error: unknown) => {
          console.warn("Failed to prepare event short link for referral sharing.", error);
          return null;
        });
        const eventRouteRecord = {
          _id: eventDocumentId,
          shortId: eventShortIdResult?.shortId ?? eventShortId,
        };
        const publicEventUrl = configuredShareDomain
          ? buildPublicEventUrl({
              event: eventRouteRecord,
              siteConfiguration,
              currentOrigin: window.location.origin,
              domain: configuredShareDomain,
              localOrigin: window.location.origin,
              vercelEnvironment,
            })
          : `${trimTrailingSlash(window.location.origin)}/events/${
              eventRouteRecord.shortId?.trim() || eventRouteRecord._id
            }`;
        const eventUrl = buildReferralUrl(publicEventUrl, referralCode);
        if (!isCancelled) {
          setPreparedReferralUrl(eventUrl);
        }
      } catch (error) {
        console.warn("Failed to prepare referral link.", error);
        if (!isCancelled) {
          setPreparedReferralUrl(null);
          setPreparationErrorMessage(getErrorMessage(error) ?? "Failed to prepare referral link.");
        }
      } finally {
        if (!isCancelled) {
          setIsPreparing(false);
        }
      }
    }

    void prepareReferralUrl();

    return () => {
      isCancelled = true;
    };
  }, [
    configuredShareDomain,
    eventDocumentId,
    eventShortId,
    ensureCurrentReferralCode,
    ensureEventShortId,
    isConvexAuthenticated,
    isConvexAuthLoading,
    isWorkspaceLoading,
    vercelEnvironment,
  ]);

  const handleShare = async () => {
    if (typeof window === "undefined") return;
    if (!preparedReferralUrl) {
      toast.error(preparationErrorMessage ?? "Referral link is still preparing.");
      return;
    }

    setIsSharing(true);
    try {
      const copyResult = await copyTextToClipboard(preparedReferralUrl);
      if (!copyResult.copied) {
        console.warn("Referral link copy failed.", {
          reason: copyResult.errorMessage,
          url: preparedReferralUrl,
        });
      }

      let openedNativeShareSheet = false;
      const shareData: ShareData = {
        title: event.name ?? "Event",
        url: preparedReferralUrl,
      };
      if (
        navigator.share &&
        (typeof navigator.canShare !== "function" || navigator.canShare(shareData))
      ) {
        try {
          await navigator.share(shareData);
          openedNativeShareSheet = true;
        } catch (error) {
          if (!isShareAbortError(error)) {
            console.warn("Referral native share failed.", error);
          }
        }
      }

      if (copyResult.copied) {
        toast.success("Referral link copied");
      } else if (openedNativeShareSheet) {
        toast.success("Referral link shared", {
          description: "Your browser blocked clipboard copy, but the share sheet opened.",
        });
      } else {
        toast.error("Failed to copy referral link", {
          description: copyResult.errorMessage,
        });
      }
    } catch (error) {
      console.warn("Unexpected referral share failure.", error);
      toast.error("Failed to share referral link", {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSharing(false);
    }
  };

  const isProminent = variant === "prominent";
  const buttonVariant = isProminent ? "default" : "outline";
  const buttonSize = isProminent ? "lg" : showLabel ? "sm" : "icon";
  const baseClassName = isProminent
    ? "gap-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:opacity-90"
    : showLabel
      ? "rounded-full gap-2 hover:opacity-80"
      : "size-8 gap-2 hover:opacity-80";
  const iconClassName = "h-4 w-4";
  const prominentLabel = isPreparing ? "Preparing…" : "Share with your friends";
  const subtleLabel = isPreparing ? "Preparing…" : "Share";
  const buttonThemeStyle = buildEventReferralShareButtonThemeStyle(variant);

  return (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      className={[baseClassName, className].filter(Boolean).join(" ")}
      style={buttonThemeStyle}
      onClick={handleShare}
      disabled={isSharing || isPreparing}
      aria-label="Share referral link"
    >
      <Share className={iconClassName} />
      {isProminent ? prominentLabel : showLabel ? subtleLabel : null}
    </Button>
  );
}

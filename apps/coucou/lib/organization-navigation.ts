"use client";

import { toast, type ExternalToast } from "sonner";

type SetActiveOrganization = (params: {
  organization: string;
}) => Promise<void>;

interface OrganizationNavigationToastMessages {
  loading: string;
  error?: string | ((error: unknown) => string);
  className?: ExternalToast["className"];
  style?: ExternalToast["style"];
}

export const MAISON_OBSCUR_TOAST_OPTIONS = {
  className: "maison-obscur-toast",
  style: {
    background: "#0F0F0F",
    color: "#E8E6E1",
    border: "1px solid rgba(232, 230, 225, 0.18)",
  },
} satisfies Pick<ExternalToast, "className" | "style">;

function navigateWithDocument(href: string, mode: "assign" | "replace") {
  if (typeof window === "undefined") {
    return;
  }

  if (mode === "replace") {
    window.location.replace(href);
    return;
  }

  window.location.assign(href);
}

export async function activateOrganizationBeforeNavigation({
  organizationId,
  href,
  setActive,
  fallbackNavigate,
  mode = "assign",
  toastMessages,
}: {
  organizationId?: string | null;
  href: string;
  setActive?: SetActiveOrganization | null;
  fallbackNavigate: (href: string) => void;
  mode?: "assign" | "replace";
  toastMessages?: OrganizationNavigationToastMessages;
}): Promise<void> {
  if (!organizationId || !setActive) {
    fallbackNavigate(href);
    return;
  }

  const toastIdentifier = toastMessages
    ? toast.loading(toastMessages.loading, {
        className: toastMessages.className,
        style: toastMessages.style,
      })
    : null;

  try {
    await setActive({ organization: organizationId });
    navigateWithDocument(href, mode);
  } catch (error) {
    if (toastIdentifier !== null) {
      const errorMessage =
        typeof toastMessages?.error === "function"
          ? toastMessages.error(error)
          : toastMessages?.error ??
            (error instanceof Error
              ? error.message
              : "Unable to switch workspace.");
      toast.error(errorMessage, {
        id: toastIdentifier,
        className: toastMessages?.className,
        style: toastMessages?.style,
      });
    }
    throw error;
  }
}

export function replaceCurrentDocument() {
  if (typeof window === "undefined") {
    return;
  }

  window.location.replace(window.location.href);
}

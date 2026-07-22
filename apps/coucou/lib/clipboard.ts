import { toast } from "sonner";

/**
 * Copies text to the clipboard and surfaces a toast on success/failure.
 * Used by admin row context menus (copy domain, copy email, copy phone…).
 */
export async function copyTextWithToast(text: string, successMessage = "Copied"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

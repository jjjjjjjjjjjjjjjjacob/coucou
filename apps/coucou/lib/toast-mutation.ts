"use client";

import { toast } from "sonner";

type ToastMessage<Result> = string | ((result: Result) => string);

interface ToastMutationMessages<Result> {
  loading: string;
  success: ToastMessage<Result>;
  error?: string | ((error: unknown) => string);
}

function resolveToastMessage<Result>(
  message: ToastMessage<Result>,
  result: Result,
): string {
  return typeof message === "function" ? message(result) : message;
}

export function getToastErrorMessage(
  error: unknown,
  fallback = "Something went wrong.",
): string {
  return error instanceof Error ? error.message : fallback;
}

export async function runMutationWithToast<Result>(
  operation: () => Promise<Result>,
  messages: ToastMutationMessages<Result>,
): Promise<Result> {
  const toastIdentifier = toast.loading(messages.loading);

  try {
    const result = await operation();
    toast.success(resolveToastMessage(messages.success, result), {
      id: toastIdentifier,
    });
    return result;
  } catch (error) {
    const errorMessage =
      typeof messages.error === "function"
        ? messages.error(error)
        : messages.error ?? getToastErrorMessage(error);
    toast.error(errorMessage, { id: toastIdentifier });
    throw error;
  }
}

import { toast } from "sonner";

/**
 * Centralized error handling utilities
 */

/**
 * Extracts a user-friendly error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return "An unexpected error occurred";
}

/**
 * Shows an error toast with proper error handling
 */
export function showErrorToast(error: unknown, fallbackMessage?: string): void {
  const message = getErrorMessage(error);
  toast.error(fallbackMessage || "Error", {
    description: message,
  });
}

/**
 * Shows a success toast
 */
export function showSuccessToast(message: string, description?: string): void {
  toast.success(message, {
    description,
  });
}

/**
 * Handles async operations with error toasts
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  options: {
    successMessage?: string;
    errorMessage?: string;
    onSuccess?: (result: T) => void;
    onError?: (error: unknown) => void;
  } = {}
): Promise<T | null> {
  try {
    const result = await operation();

    if (options.successMessage) {
      showSuccessToast(options.successMessage);
    }

    options.onSuccess?.(result);
    return result;
  } catch (error) {
    showErrorToast(error, options.errorMessage);
    options.onError?.(error);
    return null;
  }
}

/**
 * Validates required fields and returns error messages
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: Array<{ key: string; label: string }>
): string[] {
  const errors: string[] = [];

  for (const field of requiredFields) {
    const value = data[field.key];
    if (!value || (typeof value === "string" && !value.trim())) {
      errors.push(`${field.label} is required`);
    }
  }

  return errors;
}

/**
 * Custom error class for application-specific errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Handles form submission with validation and error handling
 */
export async function handleFormSubmission<T>(
  formData: T,
  validator: (data: T) => string[],
  submitter: (data: T) => Promise<void>,
  options: {
    successMessage?: string;
    onSuccess?: () => void;
  } = {}
): Promise<boolean> {
  // Validate form data
  const validationErrors = validator(formData);
  if (validationErrors.length > 0) {
    validationErrors.forEach(error => toast.error(error));
    return false;
  }

  // Submit form
  try {
    await submitter(formData);

    if (options.successMessage) {
      showSuccessToast(options.successMessage);
    }

    options.onSuccess?.();
    return true;
  } catch (error) {
    showErrorToast(error, "Failed to submit form");
    return false;
  }
}
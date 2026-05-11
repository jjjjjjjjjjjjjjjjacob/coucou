import type { Doc, Id } from "../_generated/dataModel";

/**
 * Custom error types for better error handling
 */
export class ConvexError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ConvexError";
  }
}

export class ValidationError extends ConvexError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ConvexError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class DuplicateError extends ConvexError {
  constructor(resource: string) {
    super(`${resource} already exists`, "DUPLICATE");
    this.name = "DuplicateError";
  }
}

/**
 * Type-safe API response types
 */
export type ApiResult<T> =
  | {
      ok: true;
      data?: T;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Event patch type for better type safety
 */
export type EventPatch = Partial<
  Pick<
    Doc<"events">,
    | "name"
    | "secondaryTitle"
    | "description"
    | "acts"
    | "hosts"
    | "productionCompany"
    | "location"
    | "flyerUrl"
    | "flyerStorageId"
    | "customIconStorageId"
    | "guestPortalImageStorageId"
    | "guestPortalLinkLabel"
    | "guestPortalLinkUrl"
    | "eventDate"
    | "eventEndDate"
    | "eventTimezone"
    | "maxAttendees"
    | "status"
    | "isFeatured"
    | "customFields"
    | "primaryFieldConfig"
    | "themeBackgroundColor"
    | "themeTextColor"
    | "approvalMessage"
    | "qrCodeColor"
    | "defersQrDelivery"
    | "sendQrOnApproval"
    | "attendanceQuestionEnabled"
  >
>;

export type EventUnsetField =
  | "secondaryTitle"
  | "productionCompany"
  | "flyerStorageId"
  | "guestPortalImageStorageId"
  | "guestPortalLinkLabel"
  | "guestPortalLinkUrl"
  | "primaryFieldConfig";

/**
 * List credential patch type
 */
export type ListCredentialPatch = Partial<
  Pick<
    Doc<"listCredentials">,
    | "listKey"
    | "password"
    | "passwordNormalized"
    | "generateQR"
    | "defersQrDelivery"
    | "sendQrOnApproval"
    | "approvalMessage"
  >
>;

/**
 * List update type for events
 */
export type ListUpdate = {
  id?: Id<"listCredentials">;
  listKey: string;
  password?: string;
  generateQR?: boolean;
  approvalMessage?: string;
};

/**
 * Credential data for event creation
 */
export type CredentialData = {
  listKey: string;
  password?: string;
  passwordNormalized?: string;
  generateQR?: boolean;
  /**
   * Per-list override of the event-level `sendQrOnApproval` opt-in.
   * Omit to inherit the event default (which itself defaults to off).
   */
  sendQrOnApproval?: boolean;
  approvalMessage?: string;
};

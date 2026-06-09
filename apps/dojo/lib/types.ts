import type { Id } from "@convex/_generated/dataModel";
import type {
  PrimaryFieldConfig,
  PrimarySocialPlatformConfig,
  WorkspaceEventDefaults,
} from "@coucou/sdk/shared/primary-fields";

export type { PrimaryFieldConfig, PrimarySocialPlatformConfig, WorkspaceEventDefaults };

// Core domain interfaces based on Convex schema
export interface User {
  _id: Id<"users">;
  clerkUserId?: string;
  phone?: string;
  name?: string; // Keep during migration phase
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  referralCode?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrgMembership {
  _id: Id<"orgMemberships">;
  clerkUserId: string;
  organizationId: string;
  role: string;
  createdAt: number;
  updatedAt: number;
}

export type OrganizationUserSortOption = "createdAt" | "name" | "role";
export type OrganizationUserSortDirection = "asc" | "desc";

export interface OrganizationUserListItem {
  _id: Id<"users">;
  clerkUserId?: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  createdAt: number;
  role: string;
  organizationId: string | null;
  hasOrganizationMembership: boolean;
}

export interface OrganizationUsersPagination {
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
  sortBy: OrganizationUserSortOption;
  sortDirection: OrganizationUserSortDirection;
}

export interface OrganizationUsersResponse {
  users: OrganizationUserListItem[];
  pagination: OrganizationUsersPagination;
}

export interface CustomField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  copyEnabled?: boolean;
  prependUrl?: string;
  trimWhitespace?: boolean;
}

export type EventStatus = "active" | "inactive" | "past";

export interface EventAct {
  name: string;
  descriptorBadges?: string[];
  socialUrl?: string;
  isSecretGuest?: boolean;
  secretDisplayName?: string;
}

export interface Event {
  _id: Id<"events">;
  shortId?: string;
  name: string;
  secondaryTitle?: string;
  description?: string;
  acts?: EventAct[];
  hosts: string[];
  productionCompany?: string;
  location: string;
  flyerUrl?: string;
  flyerStorageId?: Id<"_storage">;
  customIconStorageId?: Id<"_storage"> | null;
  guestPortalImageStorageId?: Id<"_storage"> | null;
  guestPortalLinkLabel?: string;
  guestPortalLinkUrl?: string;
  isFeatured?: boolean;
  eventDate: number;
  eventEndDate?: number;
  eventTimezone?: string;
  maxAttendees?: number;
  status?: EventStatus;
  attendanceQuestionEnabled?: boolean;
  referralSharingEnabled?: boolean;
  customFields?: CustomField[];
  primaryFieldConfig?: PrimaryFieldConfig;
  themeBackgroundColor?: string;
  themeTextColor?: string;
  approvalMessage?: string; // deprecated fallback during per-list rollout
  qrCodeColor?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ListCredential {
  _id: Id<"listCredentials">;
  eventId: Id<"events">;
  listKey: string;
  password?: string;
  generateQR?: boolean;
  approvalMessage?: string;
  createdAt: number;
}

export interface Profile {
  _id: Id<"profiles">;
  clerkUserId: string;
  phoneObfuscated?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RSVP {
  _id: Id<"rsvps">;
  eventId: Id<"events">;
  clerkUserId: string;
  listKey: string;
  ticketStatus?: "not-issued" | "issued" | "disabled" | "redeemed";
  shareContact: boolean;
  note?: string;
  attendees?: number;
  smsConsent?: boolean;
  smsConsentTimestamp?: number;
  smsConsentIpAddress?: string;
  customFieldValues?: Record<string, string>;
  invitedByName?: string;
  invitedByNormalizedName?: string;
  invitedBySocialPlatformKey?: string;
  invitedBySocialHandle?: string;
  referralCode?: string;
  referrerUserId?: Id<"users">;
  referrerClerkUserId?: string;
  referredByName?: string;
  status: "pending" | "approved" | "denied" | "attending";
  approvalStatus?: "pending" | "approved" | "denied";
  attendanceStatus?: "yes" | "no" | "maybe";
  ticketViewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  _id: Id<"approvals">;
  eventId: Id<"events">;
  rsvpId: Id<"rsvps">;
  clerkUserId: string;
  listKey: string;
  decision: "pending" | "approved" | "denied";
  decidedBy: string;
  decidedAt: number;
  denialReason?: string;
}

export interface Redemption {
  _id: Id<"redemptions">;
  eventId: Id<"events">;
  clerkUserId: string;
  listKey: string;
  code: string;
  createdAt: number;
  disabledAt?: number;
  redeemedAt?: number;
  redeemedByClerkUserId?: string;
  unredeemHistory: Array<{
    at: number;
    byClerkUserId: string;
    reason?: string;
  }>;
}

export interface UserSharedEventField {
  key: string;
  label: string;
  value?: string;
  required?: boolean;
  copyEnabled?: boolean;
  prependUrl?: string;
  trimWhitespace?: boolean;
}

export type TextBlastStatus = "draft" | "sending" | "sent" | "failed";

export interface TextBlast {
  _id: Id<"textBlasts">;
  eventId: Id<"events">;
  name: string;
  message: string;
  targetLists: string[];
  recipientFilter?: string;
  includeQrCodes?: boolean;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentBy: string;
  status: TextBlastStatus;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
}

export interface UserEventSharing {
  rsvpId: string;
  eventId: Id<"events">;
  eventName: string;
  eventSecondaryTitle?: string;
  eventDate: number | null;
  eventTimezone?: string;
  eventHostNames: string[];
  productionCompany?: string;
  listKey: string;
  smsConsent: boolean;
  shareContact: boolean;
  updatedAt?: number;
  customFields: UserSharedEventField[];
  socialProfiles?: Array<{
    platformKey: string;
    handle: string;
  }>;
  invitedByName?: string;
  referralCode?: string;
  referredByName?: string;
}

export interface RecentActivityEntry {
  id: string;
  guestName: string;
  eventName: string;
  status: RSVP["status"];
  createdAt: number;
  type: "rsvp";
}

export interface HostRsvp {
  id: Id<"rsvps">;
  clerkUserId: string;
  name: string;
  firstName: string;
  lastName: string;
  listKey: string;
  note?: string;
  status: RSVP["status"];
  approvalStatus: "pending" | "approved" | "denied";
  attendanceStatus: "yes" | "no" | "maybe";
  ticketViewedAt?: number;
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
  attendees?: number;
  contact?: {
    email?: string;
    phone?: string;
  };
  customFieldValues?: Record<string, string>;
  socialProfiles: Array<{
    platformKey: string;
    handle: string;
    normalizedHandle: string;
  }>;
  invitedByName?: string;
  invitedByNormalizedName?: string;
  invitedBySocialPlatformKey?: string;
  invitedBySocialHandle?: string;
  referralCode?: string;
  referrerUserId?: Id<"users">;
  referrerClerkUserId?: string;
  referredByName?: string;
  redemptionStatus: "none" | "issued" | "redeemed" | "disabled";
  redemptionCode?: string;
  createdAt: number;
  smsConsent?: boolean;
}

export interface UserTicket {
  rsvp: RSVP;
  event: Event | null;
  redemption: {
    code: string;
    listKey: string;
    redeemedAt?: number;
  } | null;
}

// React Hook Form types
export type UseFormReturn<FormValues extends Record<string, unknown>> =
  import("react-hook-form").UseFormReturn<FormValues>;

// Component prop interfaces
export interface EventCardProps {
  event: Event;
  fileUrl?: string | null;
}

export interface GuestInfoFieldsProps {
  form: UseFormReturn<RSVPFormData>;
  event: Event;
  name: string;
  setName: (value: string) => void;
  custom: Record<string, string>;
  setCustom: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  phone: string;
  openUserProfile?: () => void;
}

export interface EditEventDialogProps {
  ev: Event;
}

export interface EventCardClientProps {
  ev: Event;
  fileUrl?: string | null;
}

// List credential interface for edit dialog
export interface ListCredentialEdit {
  id?: string;
  listKey: string;
  password: string;
  generateQR: boolean;
  approvalMessage: string;
}

// Credential from API response
export interface CredentialResponse {
  _id: string;
  listKey: string;
  // password is never returned from API
  generateQR?: boolean;
  approvalMessage?: string;
}

export interface DateTimePickerProps {
  date?: string;
  time?: string;
  timezone?: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onTimezoneChange?: (timezone: string) => void;
  className?: string;
  buttonClassName?: string;
}

// Form interfaces
export interface BaseEventFormValues extends Record<string, unknown> {
  name: string;
  secondaryTitle?: string;
  hosts: string;
  productionCompany?: string;
  location: string;
  flyerStorageId?: string | null;
  customIconStorageId?: string | null;
  guestPortalImageStorageId?: string | null;
  guestPortalLinkLabel?: string;
  guestPortalLinkUrl?: string;
  description?: string;
  eventDate: string;
  eventTime: string;
  eventEndDate: string;
  eventEndTime: string;
  eventTimezone: string;
  maxAttendees?: number;
  status?: EventStatus;
  themeBackgroundColor?: string;
  themeTextColor?: string;
  qrCodeColor?: string;
  referralSharingEnabled?: boolean;
}

export interface EventFormData extends BaseEventFormValues {
  lists?: ListCredentialInput[];
}

export interface EditEventFormData extends BaseEventFormValues {}

export interface RSVPFormData extends Record<string, unknown> {
  name: string; // Keep during migration phase
  firstName: string;
  lastName: string;
  custom: Record<string, string>;
  socialProfiles?: Record<string, string>;
  invitedByName?: string;
  attendees?: number;
  attendanceStatus?: "yes" | "no" | "maybe";
}

export interface ListCredentialInput {
  id?: string;
  listKey: string;
  password: string;
  generateQR?: boolean;
  approvalMessage?: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface RSVPStatusResponse {
  status?: "pending" | "approved" | "denied" | "attending";
  approvalStatus?: "pending" | "approved" | "denied";
  attendanceStatus?: "yes" | "no" | "maybe";
  ticketViewedAt?: number;
  listKey?: string;
}

export interface CredentialResolutionResponse {
  ok: boolean;
  listKey?: string;
}

// Custom field definition for builders
export interface CustomFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  copyEnabled?: boolean;
  prependUrl?: string;
  trimWhitespace?: boolean;
}

// Error types
export interface ApplicationError extends Error {
  code?: string;
  details?: Record<string, unknown>;
}

// Authentication types for rbac
export interface AuthObject {
  userId?: string;
  orgRole?: string;
  has?: (arg: { role: string }) => boolean;
}

export interface ClerkUser {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  primaryPhoneNumber?: {
    phoneNumber: string;
  };
  phoneNumbers?: Array<{
    phoneNumber: string;
  }>;
}

// Redemption status response
export interface RedemptionStatusResponse {
  status: "valid" | "redeemed" | "expired" | "invalid";
  name?: string;
  listKey?: string;
  eventId?: string;
}

// Organization interface for Clerk
export interface ClerkOrganization {
  createMembershipRequest?: (options: { role: string }) => Promise<unknown>;
  membershipRequests?: {
    create?: () => Promise<unknown>;
  };
}

// Utility types
export type RSVPStatus = RSVP["status"];
export type ApprovalDecision = Approval["decision"];
export interface RSVPDashboardRow {
  listKey: string;
  name: string;
  attendees: number;
  note: string;
  customFieldValues: Record<string, string>;
}

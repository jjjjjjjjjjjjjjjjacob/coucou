import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  eventActValidator,
  eventLifecycleValidator,
  eventStatusValidator,
  openGraphImageSourceValidator,
} from "./eventMetadata";
import { eventPartnerValidator } from "./eventPartners";
import { primaryFieldConfigValidator } from "./primaryFields";

const eventUnsetFieldValidator = v.union(
  v.literal("secondaryTitle"),
  v.literal("productionCompany"),
  v.literal("eventEndDate"),
  v.literal("flyerStorageId"),
  v.literal("guestPortalImageStorageId"),
  v.literal("guestPortalLinkLabel"),
  v.literal("guestPortalLinkUrl"),
  v.literal("primaryFieldConfig"),
  v.literal("rsvpConfirmationMessage"),
  v.literal("smsOptInConfirmationMessage"),
  v.literal("smsOptOutConfirmationMessage"),
  v.literal("qrDeliveryMessage"),
);

const eventUpdatePatchValidator = v.object({
  name: v.optional(v.string()),
  secondaryTitle: v.optional(v.string()),
  description: v.optional(v.string()),
  acts: v.optional(v.array(eventActValidator)),
  eventPartners: v.optional(v.array(eventPartnerValidator)),
  sponsors: v.optional(v.array(eventPartnerValidator)),
  hosts: v.optional(v.array(v.string())),
  productionCompany: v.optional(v.string()),
  location: v.optional(v.string()),
  flyerStorageId: v.optional(v.id("_storage")),
  openGraphImageSource: v.optional(openGraphImageSourceValidator),
  customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  guestPortalImageStorageId: v.optional(v.id("_storage")),
  guestPortalLinkLabel: v.optional(v.string()),
  guestPortalLinkUrl: v.optional(v.string()),
  eventDate: v.optional(v.number()),
  eventEndDate: v.optional(v.number()),
  eventTimezone: v.optional(v.string()),
  maxAttendees: v.optional(v.number()),
  status: v.optional(eventStatusValidator),
  lifecycle: v.optional(eventLifecycleValidator),
  defersQrDelivery: v.optional(v.boolean()),
  sendQrOnApproval: v.optional(v.boolean()),
  attendanceQuestionEnabled: v.optional(v.boolean()),
  referralSharingEnabled: v.optional(v.boolean()),
  customFields: v.optional(
    v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        placeholder: v.optional(v.string()),
        required: v.optional(v.boolean()),
        copyEnabled: v.optional(v.boolean()),
        prependUrl: v.optional(v.string()),
        trimWhitespace: v.optional(v.boolean()),
      }),
    ),
  ),
  primaryFieldConfig: v.optional(primaryFieldConfigValidator),
  themeBackgroundColor: v.optional(v.string()),
  themeTextColor: v.optional(v.string()),
  themeAccentColor: v.optional(v.string()),
  approvalMessage: v.optional(v.string()),
  rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
  rsvpConfirmationMessage: v.optional(v.string()),
  smsOptInConfirmationMessage: v.optional(v.string()),
  smsOptOutConfirmationMessage: v.optional(v.string()),
  qrDeliveryMessage: v.optional(v.string()),
  qrCodeColor: v.optional(v.string()),
});

const listUpdateValidator = v.object({
  id: v.optional(v.id("listCredentials")),
  listKey: v.string(),
  displayName: v.optional(v.string()),
  archived: v.optional(v.boolean()),
  password: v.optional(v.string()),
  generateQR: v.optional(v.boolean()),
  defersQrDelivery: v.optional(v.boolean()),
  sendQrOnApproval: v.optional(v.union(v.boolean(), v.null())),
  includeTicketLinkOnApproval: v.optional(v.union(v.boolean(), v.null())),
  approvalMessage: v.optional(v.string()),
  autoApproveLimit: v.optional(v.number()),
  autoApproveDelayMinutes: v.optional(v.number()),
});

export const eventUpdateActionArgs = {
  expectedListsRevision: v.optional(v.number()),
  eventId: v.id("events"),
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
  patch: v.optional(eventUpdatePatchValidator),
  unsetFields: v.optional(v.array(eventUnsetFieldValidator)),
  lists: v.optional(v.array(listUpdateValidator)),
};

export const createEventArgs = {
  workspaceSlug: v.optional(v.string()),
  siteKey: v.optional(v.string()),
  name: v.string(),
  secondaryTitle: v.optional(v.string()),
  description: v.optional(v.string()),
  acts: v.optional(v.array(eventActValidator)),
  eventPartners: v.optional(v.array(eventPartnerValidator)),
  sponsors: v.optional(v.array(eventPartnerValidator)),
  hosts: v.optional(v.array(v.string())),
  productionCompany: v.optional(v.string()),
  location: v.string(),
  flyerUrl: v.optional(v.string()),
  flyerStorageId: v.optional(v.id("_storage")),
  openGraphImageSource: v.optional(openGraphImageSourceValidator),
  customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  guestPortalImageStorageId: v.optional(v.id("_storage")),
  guestPortalLinkLabel: v.optional(v.string()),
  guestPortalLinkUrl: v.optional(v.string()),
  eventDate: v.number(),
  eventEndDate: v.optional(v.number()),
  eventTimezone: v.optional(v.string()),
  status: v.optional(eventStatusValidator),
  maxAttendees: v.optional(v.number()),
  sendQrOnApproval: v.optional(v.boolean()),
  attendanceQuestionEnabled: v.optional(v.boolean()),
  referralSharingEnabled: v.optional(v.boolean()),
  lists: v.array(
    v.object({
      listKey: v.string(),
      displayName: v.optional(v.string()),
      password: v.string(),
      generateQR: v.optional(v.boolean()),
      sendQrOnApproval: v.optional(v.boolean()),
      includeTicketLinkOnApproval: v.optional(v.boolean()),
      approvalMessage: v.optional(v.string()),
      autoApproveLimit: v.optional(v.number()),
      autoApproveDelayMinutes: v.optional(v.number()),
    }),
  ),
  customFields: v.optional(
    v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        placeholder: v.optional(v.string()),
        required: v.optional(v.boolean()),
        copyEnabled: v.optional(v.boolean()),
        prependUrl: v.optional(v.string()),
        trimWhitespace: v.optional(v.boolean()),
      }),
    ),
  ),
  primaryFieldConfig: v.optional(primaryFieldConfigValidator),
  themeBackgroundColor: v.optional(v.string()),
  themeTextColor: v.optional(v.string()),
  themeAccentColor: v.optional(v.string()),
  approvalMessage: v.optional(v.string()),
  rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
  rsvpConfirmationMessage: v.optional(v.string()),
  smsOptInConfirmationMessage: v.optional(v.string()),
  smsOptOutConfirmationMessage: v.optional(v.string()),
  qrDeliveryMessage: v.optional(v.string()),
  qrCodeColor: v.optional(v.string()),
};

export interface EventEditorSaveResult {
  ok: true;
  listsRevision?: number;
  lists?: Array<{ id: Id<"listCredentials">; listKey: string }>;
}

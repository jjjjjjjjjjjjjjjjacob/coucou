import { v } from "convex/values";
import { submittedSocialProfileValidator } from "./primaryFields";

export const guestRsvpSubmissionFields = {
  eventId: v.id("events"),
  siteKey: v.optional(v.string()),
  listKey: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  phone: v.string(),
  note: v.optional(v.string()),
  shareContact: v.boolean(),
  attendees: v.optional(v.number()),
  attendanceStatus: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("maybe"))),
  smsConsent: v.optional(v.boolean()),
  smsConsentIpAddress: v.optional(v.string()),
  customFields: v.optional(v.record(v.string(), v.string())),
  socialProfiles: v.optional(v.array(submittedSocialProfileValidator)),
  invitedByName: v.optional(v.string()),
  referralCode: v.optional(v.string()),
};

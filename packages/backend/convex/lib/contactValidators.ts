import { type Infer, v } from "convex/values";
import { recipientHistoryFilterValidator } from "./recipientFiltering";

export const contactFilterFields = {
  searchText: v.optional(v.string()),
  eventIds: v.optional(v.array(v.id("events"))),
  listKeys: v.optional(v.array(v.string())),
  recipientFilter: v.optional(v.string()),
  recipientHistoryFilter: recipientHistoryFilterValidator,
  smsConsentFilter: v.optional(
    v.union(v.literal("any"), v.literal("consented"), v.literal("not_consented")),
  ),
  tags: v.optional(v.array(v.string())),
  defaultListKeys: v.optional(v.array(v.string())),
  rsvpedToLatestEvent: v.optional(v.union(v.literal("any"), v.literal("yes"), v.literal("no"))),
};
export const contactFiltersValidator = v.object(contactFilterFields);
export type ContactFilters = Infer<typeof contactFiltersValidator>;
export const contactAudienceValidator = v.union(
  v.object({
    type: v.literal("legacy_events"),
    eventIds: v.array(v.id("events")),
    targetLists: v.array(v.string()),
    recipientFilter: v.optional(v.string()),
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))),
    recipientHistoryFilter: recipientHistoryFilterValidator,
  }),
  v.object({ type: v.literal("contacts"), contactIds: v.array(v.id("workspaceContacts")) }),
  v.object({ type: v.literal("filter"), filters: contactFiltersValidator }),
);
export type ContactAudience = Infer<typeof contactAudienceValidator>;
export const contactSortValidator = v.union(
  v.literal("name"),
  v.literal("latestRsvpAt"),
  v.literal("firstRsvpAt"),
  v.literal("eventCount"),
);
export const contactDirectionValidator = v.union(v.literal("asc"), v.literal("desc"));
export const CONTACT_BATCH_SIZE = 40;

export const contactReplyActionValidator = v.object({
  replyCode: v.string(),
  targetEventId: v.id("events"),
  targetListKey: v.string(),
  isEnabled: v.optional(v.boolean()),
});

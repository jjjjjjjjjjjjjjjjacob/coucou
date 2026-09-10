export const GUEST_DIRECTORY_COLUMN_IDS = [
  "select",
  "person",
  "socials",
  "tags",
  "notes",
  "defaultListKey",
  "latestEventStatus",
  "smsConsent",
  "receivedTexts",
  "eventCount",
  "eventsAttended",
  "role",
  "firstRsvpAt",
  "events",
  "actions",
] as const;

export const GUEST_DIRECTORY_COLUMN_LABELS: Record<string, string> = {
  person: "Contact",
  socials: "Socials",
  tags: "Tags",
  notes: "Notes",
  defaultListKey: "Default List",
  latestEventStatus: "Latest Event",
  smsConsent: "SMS Consent",
  receivedTexts: "Received Texts",
  eventCount: "Events",
  eventsAttended: "Attended",
  role: "Role",
  firstRsvpAt: "First RSVP",
  events: "Recent events",
  actions: "Actions",
};

const DEFAULT_HIDDEN_COLUMN_IDS = ["events"] as const;

export const GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS = GUEST_DIRECTORY_COLUMN_IDS.filter(
  (columnId) => !(DEFAULT_HIDDEN_COLUMN_IDS as readonly string[]).includes(columnId),
);

export const GUEST_DIRECTORY_TOGGLEABLE_COLUMN_IDS = GUEST_DIRECTORY_COLUMN_IDS.filter(
  (columnId) => columnId !== "select" && columnId !== "person",
);

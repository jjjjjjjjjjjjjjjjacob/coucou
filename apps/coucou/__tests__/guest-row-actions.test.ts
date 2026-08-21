import { describe, expect, it, mock } from "bun:test";
import { buildGuestRowActionDescriptors } from "../components/guests/guest-row-actions";
import type { GuestDirectoryPerson } from "../lib/types";

function createPerson(hasOrganizationMembership: boolean): GuestDirectoryPerson {
  return {
    personKey: "user:user_123",
    clerkUserIds: ["user_123"],
    primaryClerkUserId: "user_123",
    detailReference: "user_document_123",
    name: "Taylor Guest",
    hasPhone: true,
    events: [],
    eventCount: 0,
    eventsAttendedCount: 0,
    firstRsvpAt: 1,
    latestRsvpAt: 1,
    rsvpedToLatestEvent: false,
    smsConsent: false,
    hasOptedOut: false,
    receivedTextCount: 0,
    tags: [],
    invitedByNames: [],
    role: hasOrganizationMembership ? "org:door" : null,
    hasOrganizationMembership,
  };
}

describe("guest row role actions", () => {
  it("offers Member alongside Host, Door, and Admin promotion", () => {
    const onRoleChange = mock(() => {});
    const descriptors = buildGuestRowActionDescriptors({
      person: createPerson(false),
      canManageRoles: true,
      onEditProfile: () => {},
      onViewDetails: () => {},
      onRoleChange,
    });

    expect(descriptors.map((descriptor) => descriptor.label)).toEqual([
      "Edit tags & notes",
      "View details",
      "Promote to Host",
      "Promote to Door",
      "Promote to Member",
      "Promote to Admin",
    ]);

    descriptors.find((descriptor) => descriptor.id === "role-member")?.onSelect();
    expect(onRoleChange).toHaveBeenCalledWith(createPerson(false), "member");
  });

  it("offers changing an existing organization membership to Member", () => {
    const descriptors = buildGuestRowActionDescriptors({
      person: createPerson(true),
      canManageRoles: true,
      onEditProfile: () => {},
      onViewDetails: () => {},
      onRoleChange: () => {},
    });

    expect(descriptors.map((descriptor) => descriptor.label)).toContain("Change to Member");
  });
});

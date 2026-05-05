import { mock } from "bun:test";

// Mock Convex hooks
export const mockUseQuery = (queryFn: any, args: any) => {
  // Return mock data based on the query
  if (queryFn?.name?.includes("events.get")) {
    return {
      _id: "event_123",
      name: "Test Event",
      location: "Test Location",
      eventDate: Date.now(),
      status: "active",
      customFields: [],
    };
  }

  if (queryFn?.name?.includes("rsvps.statusForUserEvent")) {
    return {
      status: "approved",
      listKey: "vip",
      shareContact: true,
    };
  }

  if (queryFn?.name?.includes("redemptions.forCurrentUserEvent")) {
    return {
      code: "abc123",
      listKey: "vip",
    };
  }

  if (queryFn?.name?.includes("events.listAll")) {
    return [
      {
        _id: "event_123",
        name: "Test Event",
        eventDate: Date.now(),
        location: "Test Location",
      },
    ];
  }

  if (queryFn?.name?.includes("rsvps.listForEvent")) {
    return [
      {
        id: "rsvp_123",
        name: "Test Guest",
        status: "approved",
        listKey: "vip",
        redemptionStatus: "issued",
      },
    ];
  }

  return null;
};

export const mockUseMutation = mock(() => ({
  mutate: mock(),
  isPending: false,
  isError: false,
  error: null,
}));

export const mockUseAction = mock(() => mock().mockResolvedValue({ ok: true }));

// Mock Convex query functions
export const mockConvexQuery = mock((queryFn, args) => ({
  queryFn,
  args,
}));

export const mockUseConvexMutation = mock(() => mock());


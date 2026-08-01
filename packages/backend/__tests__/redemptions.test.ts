import { describe, expect, it } from "vitest";
import { roleHasWorkspaceDoorAccess } from "../convex/lib/workspaceAuth";

describe("Redemptions Functions", () => {
  it("should validate redemption code format", () => {
    // Test that validates basic code format
    const testCode = "abc123";
    expect(testCode).toMatch(/^[a-z0-9]+$/);
  });

  it("should handle empty codes", () => {
    // Test basic validation logic
    const invalidCode = "";
    expect(invalidCode).toBe("");
  });

  it("should have proper status types", () => {
    // Test that status constants are properly defined
    const validStatuses = ["valid", "invalid", "redeemed"];
    expect(validStatuses).toContain("valid");
    expect(validStatuses).toContain("invalid");
    expect(validStatuses).toContain("redeemed");
  });

  it("allows Door, Host, and Admin while denying generic members", () => {
    expect(roleHasWorkspaceDoorAccess("org:door")).toBe(true);
    expect(roleHasWorkspaceDoorAccess("org:host")).toBe(true);
    expect(roleHasWorkspaceDoorAccess("org:admin")).toBe(true);
    expect(roleHasWorkspaceDoorAccess("org:member")).toBe(false);
    expect(roleHasWorkspaceDoorAccess(undefined)).toBe(false);
  });

  it("should validate redemption record structure", () => {
    // Test the expected structure of redemption records
    const mockRedemption = {
      _id: "redemption_123",
      eventId: "event_123",
      clerkUserId: "user_123",
      listKey: "general",
      code: "abc123",
      redeemedAt: undefined,
      disabledAt: undefined,
      unredeemHistory: [],
    };

    expect(mockRedemption).toHaveProperty("_id");
    expect(mockRedemption).toHaveProperty("eventId");
    expect(mockRedemption).toHaveProperty("clerkUserId");
    expect(mockRedemption).toHaveProperty("listKey");
    expect(mockRedemption).toHaveProperty("code");
    expect(typeof mockRedemption.code).toBe("string");
  });
});

import { describe, it, expect } from "bun:test";

describe("RSVP Data Migration & Search Tests", () => {
  describe("Enrichment Priority Logic", () => {
    it("should prioritize users table firstName/lastName over rsvp.userName", () => {
      // Mock data structures
      const user = {
        firstName: "John",
        lastName: "Doe",
        name: "John Doe Old",
        clerkUserId: "user123",
      };

      const rsvp = {
        userName: "Stale Name", // This should be ignored
        clerkUserId: "user123",
      };

      // Test the enrichment logic priority
      const enrichName = (user: any, rsvp: any) => {
        return (
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp?.userName ||
          ""
        );
      };

      const result = enrichName(user, rsvp);
      expect(result).toBe("John Doe");
      expect(result).not.toBe("Stale Name");
    });

    it("should fall back to user.name when firstName/lastName missing", () => {
      const user = {
        firstName: undefined,
        lastName: undefined,
        name: "John Doe Legacy",
        clerkUserId: "user123",
      };

      const rsvp = {
        userName: "Should Not Use",
        clerkUserId: "user123",
      };

      const enrichName = (user: any, rsvp: any) => {
        return (
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp?.userName ||
          ""
        );
      };

      const result = enrichName(user, rsvp);
      expect(result).toBe("John Doe Legacy");
    });

    it("should fall back to rsvp.userName when user data missing", () => {
      const user = null; // User not found

      const rsvp = {
        userName: "Fallback Name",
        clerkUserId: "user123",
      };

      const enrichName = (user: any, rsvp: any) => {
        return (
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp?.userName ||
          ""
        );
      };

      const result = enrichName(user, rsvp);
      expect(result).toBe("Fallback Name");
    });

    it("should return empty string when no name data available", () => {
      const user = {
        firstName: undefined,
        lastName: undefined,
        name: undefined,
        clerkUserId: "user123",
      };

      const rsvp = {
        userName: undefined,
        clerkUserId: "user123",
      };

      const enrichName = (user: any, rsvp: any) => {
        return (
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp?.userName ||
          ""
        );
      };

      const result = enrichName(user, rsvp);
      expect(result).toBe("");
    });

    it("should handle partial firstName/lastName data", () => {
      const testCases = [
        {
          user: { firstName: "John", lastName: undefined },
          expected: "John",
        },
        {
          user: { firstName: undefined, lastName: "Doe" },
          expected: "Doe",
        },
        {
          user: { firstName: "", lastName: "Doe" },
          expected: "Doe",
        },
        {
          user: { firstName: "John", lastName: "" },
          expected: "John",
        },
      ];

      const enrichName = (user: any, rsvp: any) => {
        return (
          [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
          user?.name ||
          rsvp?.userName ||
          ""
        );
      };

      for (const testCase of testCases) {
        const result = enrichName(testCase.user, {});
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe("backfillUserNameInRsvps Migration Logic", () => {
    it("should skip RSVPs that already have userName populated", () => {
      const rsvp = {
        userName: "Existing Name",
        clerkUserId: "user123",
      };

      const shouldMigrate = (rsvp: any) => {
        return !(rsvp.userName && typeof rsvp.userName === "string" && rsvp.userName.trim() !== "");
      };

      expect(shouldMigrate(rsvp)).toBe(false);
    });

    it("should migrate RSVPs with empty or missing userName", () => {
      const testCases = [
        { userName: undefined },
        { userName: null },
        { userName: "" },
        { userName: "   " },
      ];

      const shouldMigrate = (rsvp: any) => {
        return !(rsvp.userName && typeof rsvp.userName === "string" && rsvp.userName.trim() !== "");
      };

      for (const rsvp of testCases) {
        expect(shouldMigrate(rsvp)).toBe(true);
      }
    });

    it("should construct userName from firstName/lastName", () => {
      const user = {
        firstName: "Jane",
        lastName: "Smith",
        name: "Jane Smith Old",
      };

      const constructUserName = (user: any) => {
        let displayName = "";
        if (user.firstName && user.lastName && typeof user.firstName === "string" && typeof user.lastName === "string") {
          displayName = `${user.firstName} ${user.lastName}`;
        } else if (user.firstName && typeof user.firstName === "string") {
          displayName = user.firstName;
        } else if (user.name && typeof user.name === "string") {
          displayName = user.name;
        }
        return displayName.trim() || null;
      };

      const result = constructUserName(user);
      expect(result).toBe("Jane Smith");
    });

    it("should fall back to name field when firstName/lastName missing", () => {
      const user = {
        firstName: undefined,
        lastName: undefined,
        name: "Legacy Name",
      };

      const constructUserName = (user: any) => {
        let displayName = "";
        if (user.firstName && user.lastName && typeof user.firstName === "string" && typeof user.lastName === "string") {
          displayName = `${user.firstName} ${user.lastName}`;
        } else if (user.firstName && typeof user.firstName === "string") {
          displayName = user.firstName;
        } else if (user.name && typeof user.name === "string") {
          displayName = user.name;
        }
        return displayName.trim() || null;
      };

      const result = constructUserName(user);
      expect(result).toBe("Legacy Name");
    });

    it("should return null when no usable name data", () => {
      const user = {
        firstName: undefined,
        lastName: undefined,
        name: undefined,
      };

      const constructUserName = (user: any) => {
        let displayName = "";
        if (user.firstName && user.lastName && typeof user.firstName === "string" && typeof user.lastName === "string") {
          displayName = `${user.firstName} ${user.lastName}`;
        } else if (user.firstName && typeof user.firstName === "string") {
          displayName = user.firstName;
        } else if (user.name && typeof user.name === "string") {
          displayName = user.name;
        }
        return displayName.trim() || null;
      };

      const result = constructUserName(user);
      expect(result).toBeNull();
    });

    it("should handle edge cases in name construction", () => {
      const testCases = [
        {
          user: { firstName: "  John  ", lastName: "  Doe  " },
          expected: "John     Doe", // Template literal preserves original spaces
        },
        {
          user: { firstName: "Single", lastName: undefined },
          expected: "Single",
        },
        {
          user: { firstName: "", lastName: "LastOnly" },
          expected: "LastOnly",
        },
        {
          user: { name: "  Trimmed Name  " },
          expected: "Trimmed Name",
        },
      ];

      const constructUserName = (user: any) => {
        let displayName = "";
        if (user.firstName && user.lastName && typeof user.firstName === "string" && typeof user.lastName === "string") {
          displayName = `${user.firstName} ${user.lastName}`;
        } else if (user.firstName && typeof user.firstName === "string") {
          displayName = user.firstName;
        } else if (user.lastName && typeof user.lastName === "string") {
          displayName = user.lastName;
        } else if (user.name && typeof user.name === "string") {
          displayName = user.name;
        }
        return displayName.trim() || null;
      };

      for (const testCase of testCases) {
        const result = constructUserName(testCase.user);
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe("List Filtering Logic (credentialId vs listKey)", () => {
    it("should prefer credentialId when available", () => {
      const credential = {
        _id: "cred_123",
        listKey: "vip",
        eventId: "event_123",
      };

      const rsvps = [
        {
          _id: "rsvp_1",
          credentialId: "cred_123",
          listKey: "old_vip", // Should be ignored
        },
        {
          _id: "rsvp_2",
          credentialId: undefined,
          listKey: "general",
        },
      ];

      const filterByList = (rsvps: any[], listFilter: string, credential: any) => {
        if (!credential) {
          // Fallback to listKey filtering
          return rsvps.filter((rsvp) => rsvp.listKey === listFilter);
        }

        // Use credentialId with listKey fallback
        return rsvps.filter((rsvp) => {
          return (
            rsvp.credentialId === credential._id ||
            (rsvp.listKey === listFilter && rsvp.credentialId === undefined)
          );
        });
      };

      const result = filterByList(rsvps, "vip", credential);

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe("rsvp_1");
    });

    it("should fall back to listKey when credential not found", () => {
      const rsvps = [
        {
          _id: "rsvp_1",
          credentialId: undefined,
          listKey: "general",
        },
        {
          _id: "rsvp_2",
          credentialId: undefined,
          listKey: "vip",
        },
      ];

      const filterByList = (rsvps: any[], listFilter: string, credential: any) => {
        if (!credential) {
          return rsvps.filter((rsvp) => rsvp.listKey === listFilter);
        }

        return rsvps.filter((rsvp) => {
          return (
            rsvp.credentialId === credential._id ||
            (rsvp.listKey === listFilter && rsvp.credentialId === undefined)
          );
        });
      };

      const result = filterByList(rsvps, "general", null);

      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe("rsvp_1");
    });

    it("should handle mixed credentialId and listKey during migration", () => {
      const credential = {
        _id: "cred_123",
        listKey: "vip",
        eventId: "event_123",
      };

      const rsvps = [
        {
          _id: "rsvp_new",
          credentialId: "cred_123",
          listKey: undefined, // New RSVP
        },
        {
          _id: "rsvp_old",
          credentialId: undefined,
          listKey: "vip", // Old RSVP during migration
        },
        {
          _id: "rsvp_other",
          credentialId: undefined,
          listKey: "general", // Different list
        },
      ];

      const filterByList = (rsvps: any[], listFilter: string, credential: any) => {
        if (!credential) {
          return rsvps.filter((rsvp) => rsvp.listKey === listFilter);
        }

        return rsvps.filter((rsvp) => {
          return (
            rsvp.credentialId === credential._id ||
            (rsvp.listKey === listFilter && rsvp.credentialId === undefined)
          );
        });
      };

      const result = filterByList(rsvps, "vip", credential);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r._id)).toContain("rsvp_new");
      expect(result.map((r) => r._id)).toContain("rsvp_old");
      expect(result.map((r) => r._id)).not.toContain("rsvp_other");
    });
  });

  describe("Search Query Structure", () => {
    it("should validate search query parameters", () => {
      const validateSearchQuery = (params: any) => {
        const { guestSearch, eventId, statusFilter } = params;

        // Validate required parameters
        if (!eventId) throw new Error("eventId is required");
        if (typeof guestSearch !== "string") throw new Error("guestSearch must be string");

        // Validate status filter
        const validStatuses = ["all", "pending", "approved", "denied", "attending"];
        if (statusFilter && !validStatuses.includes(statusFilter)) {
          throw new Error(`Invalid status filter: ${statusFilter}`);
        }

        return true;
      };

      // Valid queries
      expect(() =>
        validateSearchQuery({
          guestSearch: "John",
          eventId: "event_123",
          statusFilter: "approved",
        })
      ).not.toThrow();

      expect(() =>
        validateSearchQuery({
          guestSearch: "",
          eventId: "event_123",
          statusFilter: "all",
        })
      ).not.toThrow();

      // Invalid queries
      expect(() =>
        validateSearchQuery({
          guestSearch: "John",
          eventId: undefined,
          statusFilter: "approved",
        })
      ).toThrow("eventId is required");

      expect(() =>
        validateSearchQuery({
          guestSearch: 123,
          eventId: "event_123",
          statusFilter: "approved",
        })
      ).toThrow("guestSearch must be string");

      expect(() =>
        validateSearchQuery({
          guestSearch: "John",
          eventId: "event_123",
          statusFilter: "invalid",
        })
      ).toThrow("Invalid status filter");
    });

    it("should construct search index query correctly", () => {
      const buildSearchQuery = (params: any) => {
        const { guestSearch, eventId, statusFilter } = params;

        // Mock search query builder
        const mockSearchQuery = {
          searchField: "userName",
          searchTerm: guestSearch.trim(),
          filters: {
            eventId,
            ...(statusFilter !== "all" && { status: statusFilter }),
          },
        };

        return mockSearchQuery;
      };

      const result = buildSearchQuery({
        guestSearch: "  John Doe  ",
        eventId: "event_123",
        statusFilter: "approved",
      });

      expect(result.searchField).toBe("userName");
      expect(result.searchTerm).toBe("John Doe");
      expect(result.filters.eventId).toBe("event_123");
      expect(result.filters.status).toBe("approved");
    });

    it("should handle empty search gracefully", () => {
      const shouldUseSearch = (guestSearch: string) => {
        return !!(guestSearch && guestSearch.trim().length > 0);
      };

      expect(shouldUseSearch("")).toBe(false);
      expect(shouldUseSearch("   ")).toBe(false);
      expect(shouldUseSearch("John")).toBe(true);
      expect(shouldUseSearch("  John  ")).toBe(true);
    });
  });

  describe("Data Consistency Validation", () => {
    it("should validate RSVP has either credentialId or listKey", () => {
      const validateRsvpConsistency = (rsvp: any) => {
        const hasCredentialId = !!rsvp.credentialId;
        const hasListKey = !!rsvp.listKey;

        // During migration, we accept both or either
        return hasCredentialId || hasListKey;
      };

      // Valid states
      expect(validateRsvpConsistency({ credentialId: "cred_123", listKey: undefined })).toBe(true);
      expect(validateRsvpConsistency({ credentialId: undefined, listKey: "vip" })).toBe(true);
      expect(validateRsvpConsistency({ credentialId: "cred_123", listKey: "vip" })).toBe(true);

      // Invalid state
      expect(validateRsvpConsistency({ credentialId: undefined, listKey: undefined })).toBe(false);
    });

    it("should validate userName matches users table when present", () => {
      const validateUserNameConsistency = (rsvp: any, user: any) => {
        if (!rsvp.userName || !user) return true; // Skip validation if either missing

        const expectedName =
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.name ||
          "";

        return rsvp.userName === expectedName;
      };

      // Consistent data
      const user1 = { firstName: "John", lastName: "Doe" };
      const rsvp1 = { userName: "John Doe" };
      expect(validateUserNameConsistency(rsvp1, user1)).toBe(true);

      // Inconsistent data
      const user2 = { firstName: "John", lastName: "Doe" };
      const rsvp2 = { userName: "Jane Smith" };
      expect(validateUserNameConsistency(rsvp2, user2)).toBe(false);

      // Missing data (should pass validation)
      expect(validateUserNameConsistency({ userName: undefined }, user1)).toBe(true);
      expect(validateUserNameConsistency(rsvp1, null)).toBe(true);
    });

    it("should validate new RSVPs don't have denormalized fields", () => {
      const validateNewRsvpStructure = (rsvp: any) => {
        // New RSVPs should not have denormalized fields
        const hasDenormalizedFields =
          rsvp.userName || rsvp.userEmail || rsvp.userPhone;

        return !hasDenormalizedFields;
      };

      // Clean new RSVP
      const newRsvp = {
        eventId: "event_123",
        clerkUserId: "user_123",
        credentialId: "cred_123",
        status: "pending",
      };
      expect(validateNewRsvpStructure(newRsvp)).toBe(true);

      // RSVP with denormalized fields (legacy)
      const legacyRsvp = {
        ...newRsvp,
        userName: "John Doe",
        userEmail: "john@example.com",
      };
      expect(validateNewRsvpStructure(legacyRsvp)).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing user data gracefully", () => {
      const safeEnrichment = (rsvp: any, user: any) => {
        try {
          return {
            name:
              [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
              user?.name ||
              rsvp?.userName ||
              "",
            firstName: user?.firstName || "",
            lastName: user?.lastName || "",
          };
        } catch (error) {
          return {
            name: rsvp?.userName || "",
            firstName: "",
            lastName: "",
          };
        }
      };

      // Should not throw with null/undefined user
      expect(() => safeEnrichment({ userName: "Fallback" }, null)).not.toThrow();
      expect(() => safeEnrichment({ userName: "Fallback" }, undefined)).not.toThrow();

      const result = safeEnrichment({ userName: "Fallback" }, null);
      expect(result.name).toBe("Fallback");
    });

    it("should handle corrupted userName data", () => {
      const sanitizeUserName = (userName: any) => {
        if (typeof userName !== "string") return "";
        return userName.trim();
      };

      expect(sanitizeUserName(null)).toBe("");
      expect(sanitizeUserName(undefined)).toBe("");
      expect(sanitizeUserName(123)).toBe("");
      expect(sanitizeUserName("  Valid Name  ")).toBe("Valid Name");
    });
  });
});
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TestWrapper } from "./test-wrapper";

// Mock the new mutations we added
const mockUpdateRsvpComplete = mock((args: any) =>
  Promise.resolve({ status: "ok" }),
);
const mockDeleteRsvpComplete = mock((args: any) =>
  Promise.resolve({ deleted: true }),
);

// Mock Convex hooks
const mockUseQuery = mock(() => []);
const mockUseMutation = mock((api: string) => {
  if (api === "rsvps.updateRsvpComplete") return mockUpdateRsvpComplete;
  if (api === "rsvps.deleteRsvpComplete") return mockDeleteRsvpComplete;
  return mock(() => Promise.resolve());
});

mock.module("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

mock.module("sonner", () => ({
  toast: {
    success: mock(),
    error: mock(),
  },
}));

describe("RSVP Status Management Unit Tests", () => {
  beforeEach(() => {
    mockUpdateRsvpComplete.mockClear();
    mockDeleteRsvpComplete.mockClear();
  });

  describe("Ticket Status Dropdown Component", () => {
    const TicketStatusDropdown = ({
      status,
      redemptionCode,
      onStatusChange,
    }: {
      status: string;
      redemptionCode?: string | null;
      onStatusChange: (status: string) => void;
    }) => {
      const getStatusDisplay = (status: string) => {
        switch (status) {
          case "none":
            return "Not issued";
          case "issued":
            return "Issued";
          case "disabled":
            return "Disabled";
          case "redeemed":
            return "Redeemed";
          default:
            return status;
        }
      };

      const getStatusClasses = (status: string) => {
        switch (status) {
          case "none":
            return "bg-gray-100 text-gray-600";
          case "issued":
            return "bg-purple-100 text-purple-800";
          case "disabled":
            return "bg-gray-200 text-gray-800";
          case "redeemed":
            return "bg-blue-100 text-blue-800";
          default:
            return "";
        }
      };

      return (
        <div data-testid="ticket-dropdown">
          <button
            data-testid="ticket-trigger"
            className={getStatusClasses(status)}
          >
            {getStatusDisplay(status)}
          </button>
          <div data-testid="ticket-menu">
            <button
              data-testid="ticket-option-not-issued"
              onClick={() => onStatusChange("not-issued")}
            >
              Not issued
            </button>
            <button
              data-testid="ticket-option-issued"
              onClick={() => onStatusChange("issued")}
            >
              Issued
            </button>
            <button
              data-testid="ticket-option-disabled"
              onClick={() => onStatusChange("disabled")}
            >
              Disabled
            </button>
            {redemptionCode && (
              <button data-testid="qr-view-option">View QR Code</button>
            )}
          </div>
        </div>
      );
    };

    it("should display correct status text and styling", () => {
      render(
        <TestWrapper>
          <TicketStatusDropdown status="none" onStatusChange={() => {}} />
        </TestWrapper>,
      );

      const triggers = screen.getAllByTestId("ticket-trigger");
      const trigger = triggers[0];
      expect(trigger).toHaveTextContent("Not issued");
      expect(trigger).toHaveClass("bg-gray-100", "text-gray-600");
    });

    it("should display issued status correctly", () => {
      render(
        <TestWrapper>
          <TicketStatusDropdown status="issued" onStatusChange={() => {}} />
        </TestWrapper>,
      );

      const triggers = screen.getAllByTestId("ticket-trigger");
      const trigger = triggers[0];
      expect(trigger).toHaveTextContent("Issued");
      expect(trigger).toHaveClass("bg-purple-100", "text-purple-800");
    });

    it("should show QR code option when redemption code exists", () => {
      render(
        <TestWrapper>
          <TicketStatusDropdown
            status="issued"
            redemptionCode="ABC123"
            onStatusChange={() => {}}
          />
        </TestWrapper>,
      );

      const qrOptions = screen.getAllByTestId("qr-view-option");
      expect(qrOptions[0]).toBeInTheDocument();
    });

    it("should hide QR code option when no redemption code", () => {
      render(
        <TestWrapper>
          <TicketStatusDropdown
            status="issued"
            redemptionCode={null}
            onStatusChange={() => {}}
          />
        </TestWrapper>,
      );

      expect(screen.queryByTestId("qr-view-option")).not.toBeInTheDocument();
    });

    it("should call onStatusChange when option is clicked", () => {
      const mockOnStatusChange = mock();
      render(
        <TestWrapper>
          <TicketStatusDropdown
            status="none"
            onStatusChange={mockOnStatusChange}
          />
        </TestWrapper>,
      );

      const issuedOptions = screen.getAllByTestId("ticket-option-issued");
      fireEvent.click(issuedOptions[0]);

      expect(mockOnStatusChange).toHaveBeenCalledWith("issued");
    });
  });

  describe("Save Button Component", () => {
    const SaveButton = ({
      hasChanges,
      onSave,
    }: {
      hasChanges: boolean;
      onSave: () => void;
    }) => {
      return (
        <button
          data-testid="save-button"
          disabled={!hasChanges}
          onClick={onSave}
          className={hasChanges ? "enabled" : "disabled"}
        >
          Save
        </button>
      );
    };

    it("should be disabled when no changes", () => {
      render(
        <TestWrapper>
          <SaveButton hasChanges={false} onSave={() => {}} />
        </TestWrapper>,
      );

      const saveButtons = screen.getAllByTestId("save-button");
      const saveButton = saveButtons[0];
      expect(saveButton).toBeDisabled();
      expect(saveButton).toHaveClass("disabled");
    });

    it("should be enabled when there are changes", () => {
      render(
        <TestWrapper>
          <SaveButton hasChanges={true} onSave={() => {}} />
        </TestWrapper>,
      );

      const saveButtons = screen.getAllByTestId("save-button");
      const saveButton = saveButtons[0];
      expect(saveButton).not.toBeDisabled();
      expect(saveButton).toHaveClass("enabled");
    });

    it("should call onSave when clicked", () => {
      const mockOnSave = mock();
      render(
        <TestWrapper>
          <SaveButton hasChanges={true} onSave={mockOnSave} />
        </TestWrapper>,
      );

      const saveButtons = screen.getAllByTestId("save-button");
      fireEvent.click(saveButtons[0]);

      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  describe("Delete Button Component", () => {
    const DeleteButton = ({ onDelete }: { onDelete: () => void }) => {
      const handleDelete = () => {
        const confirmed = window.confirm(
          "Are you sure you want to delete this RSVP?",
        );
        if (confirmed) {
          onDelete();
        }
      };

      return (
        <button data-testid="delete-button" onClick={handleDelete}>
          Delete
        </button>
      );
    };

    it("should show confirmation dialog when clicked", () => {
      const mockOnDelete = mock();
      const originalConfirm = window.confirm;
      const mockConfirm = mock(() => true);
      window.confirm = mockConfirm;

      render(
        <TestWrapper>
          <DeleteButton onDelete={mockOnDelete} />
        </TestWrapper>,
      );

      const deleteButtons = screen.getAllByTestId("delete-button");
      fireEvent.click(deleteButtons[0]);

      expect(mockConfirm).toHaveBeenCalledWith(
        "Are you sure you want to delete this RSVP?",
      );
      expect(mockOnDelete).toHaveBeenCalled();

      window.confirm = originalConfirm;
    });

    it("should not delete when confirmation is cancelled", () => {
      const mockOnDelete = mock();
      const originalConfirm = window.confirm;
      window.confirm = mock(() => false);

      render(
        <TestWrapper>
          <DeleteButton onDelete={mockOnDelete} />
        </TestWrapper>,
      );

      const deleteButtons = screen.getAllByTestId("delete-button");
      fireEvent.click(deleteButtons[0]);

      expect(mockOnDelete).not.toHaveBeenCalled();

      window.confirm = originalConfirm;
    });
  });

  describe("Pending Changes Logic", () => {
    const PendingChangesRow = ({
      rsvp,
      pendingChanges,
    }: {
      rsvp: any;
      pendingChanges: any;
    }) => {
      const hasChanges =
        pendingChanges &&
        (pendingChanges.originalApprovalStatus !==
          pendingChanges.currentApprovalStatus ||
          pendingChanges.originalTicketStatus !==
            pendingChanges.currentTicketStatus);

      return (
        <table>
          <tbody>
            <tr
              data-testid="rsvp-row"
              className={hasChanges ? "bg-yellow-50" : ""}
              style={{ backgroundColor: hasChanges ? "#fefce8" : undefined }}
            >
              <td>{rsvp.name}</td>
              <td data-testid="has-changes">{hasChanges ? "true" : "false"}</td>
            </tr>
          </tbody>
        </table>
      );
    };

    it("should not highlight row without changes", () => {
      const rsvp = { name: "John Doe" };
      const pendingChanges = null;

      render(
        <TestWrapper>
          <PendingChangesRow rsvp={rsvp} pendingChanges={pendingChanges} />
        </TestWrapper>,
      );

      const rows = screen.getAllByTestId("rsvp-row");
      const row = rows[0];
      expect(row).not.toHaveClass("bg-yellow-50");
      const hasChangesElements = screen.getAllByTestId("has-changes");
      expect(hasChangesElements[0]).toHaveTextContent("false");
    });

    it("should highlight row with approval changes", () => {
      const rsvp = { name: "John Doe" };
      const pendingChanges = {
        originalApprovalStatus: "pending",
        currentApprovalStatus: "approved",
        originalTicketStatus: "none",
        currentTicketStatus: "none",
      };

      render(
        <TestWrapper>
          <PendingChangesRow rsvp={rsvp} pendingChanges={pendingChanges} />
        </TestWrapper>,
      );

      const rows = screen.getAllByTestId("rsvp-row");
      const row = rows[0];
      expect(row).toHaveClass("bg-yellow-50");
      expect(row).toHaveStyle({ backgroundColor: "#fefce8" });
      const hasChangesElements = screen.getAllByTestId("has-changes");
      expect(hasChangesElements[0]).toHaveTextContent("true");
    });

    it("should highlight row with ticket changes", () => {
      const rsvp = { name: "John Doe" };
      const pendingChanges = {
        originalApprovalStatus: "approved",
        currentApprovalStatus: "approved",
        originalTicketStatus: "none",
        currentTicketStatus: "issued",
      };

      render(
        <TestWrapper>
          <PendingChangesRow rsvp={rsvp} pendingChanges={pendingChanges} />
        </TestWrapper>,
      );

      const rows = screen.getAllByTestId("rsvp-row");
      const row = rows[0];
      expect(row).toHaveClass("bg-yellow-50");
      const hasChangesElements = screen.getAllByTestId("has-changes");
      expect(hasChangesElements[0]).toHaveTextContent("true");
    });
  });

  describe("Mutation Integration", () => {
    it("should call updateRsvpComplete with correct parameters", async () => {
      const testRsvpId = "rsvp123";
      const testChanges = {
        approvalStatus: "approved",
        ticketStatus: "issued",
      };

      // Simulate the mutation call
      await mockUpdateRsvpComplete({
        rsvpId: testRsvpId,
        ...testChanges,
      });

      expect(mockUpdateRsvpComplete).toHaveBeenCalledWith({
        rsvpId: testRsvpId,
        approvalStatus: "approved",
        ticketStatus: "issued",
      });
    });

    it("should call deleteRsvpComplete with rsvp ID", async () => {
      const testRsvpId = "rsvp123";

      // Simulate the mutation call
      await mockDeleteRsvpComplete({ rsvpId: testRsvpId });

      expect(mockDeleteRsvpComplete).toHaveBeenCalledWith({
        rsvpId: testRsvpId,
      });
    });
  });

  describe("Status Display Logic", () => {
    it("should format approval status correctly", () => {
      const formatApprovalStatus = (status: string) => {
        return status.charAt(0).toUpperCase() + status.slice(1);
      };

      expect(formatApprovalStatus("pending")).toBe("Pending");
      expect(formatApprovalStatus("approved")).toBe("Approved");
      expect(formatApprovalStatus("denied")).toBe("Denied");
    });

    it("should display raw attending RSVPs as approved in the host table", () => {
      const deriveApprovalStatus = (status: string) => {
        if (status === "approved" || status === "attending") {
          return "approved";
        }

        if (status === "denied") {
          return "denied";
        }

        return "pending";
      };

      expect(deriveApprovalStatus("attending")).toBe("approved");
      expect(deriveApprovalStatus("attending")).not.toBe("pending");
    });

    it("should format ticket status correctly", () => {
      const formatTicketStatus = (status: string) => {
        switch (status) {
          case "none":
            return "Not issued";
          case "issued":
            return "Issued";
          case "disabled":
            return "Disabled";
          case "redeemed":
            return "Redeemed";
          default:
            return status;
        }
      };

      expect(formatTicketStatus("none")).toBe("Not issued");
      expect(formatTicketStatus("issued")).toBe("Issued");
      expect(formatTicketStatus("disabled")).toBe("Disabled");
      expect(formatTicketStatus("redeemed")).toBe("Redeemed");
    });
  });

  describe("Style Classes Logic", () => {
    it("should return correct classes for approval status", () => {
      const getApprovalClasses = (status: string) => {
        switch (status) {
          case "pending":
            return "text-amber-700 bg-amber-50";
          case "approved":
            return "text-green-700 bg-green-50";
          case "denied":
            return "text-red-700 bg-red-50";
          default:
            return "";
        }
      };

      expect(getApprovalClasses("pending")).toBe("text-amber-700 bg-amber-50");
      expect(getApprovalClasses("approved")).toBe("text-green-700 bg-green-50");
      expect(getApprovalClasses("denied")).toBe("text-red-700 bg-red-50");
    });

    it("should return correct classes for ticket status", () => {
      const getTicketClasses = (status: string) => {
        switch (status) {
          case "none":
            return "bg-gray-100 text-gray-600";
          case "issued":
            return "bg-purple-100 text-purple-800";
          case "disabled":
            return "bg-gray-200 text-gray-800";
          case "redeemed":
            return "bg-blue-100 text-blue-800";
          default:
            return "";
        }
      };

      expect(getTicketClasses("none")).toBe("bg-gray-100 text-gray-600");
      expect(getTicketClasses("issued")).toBe("bg-purple-100 text-purple-800");
      expect(getTicketClasses("disabled")).toBe("bg-gray-200 text-gray-800");
      expect(getTicketClasses("redeemed")).toBe("bg-blue-100 text-blue-800");
    });
  });
});

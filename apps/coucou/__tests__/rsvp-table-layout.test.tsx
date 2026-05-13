import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  canToggleRsvpTableRowFromBodyCell,
  getRsvpContextActionTargets,
  getRsvpTableBodyCellClassName,
  getRsvpTableColumnSizing,
  getRsvpTableDisplayWidth,
  getRsvpTableFillerColumnWidth,
  RSVP_SELECT_COLUMN_SIZING,
  RSVP_TABLE_BODY_ALIGNMENT_GUTTER_CLASS,
  RSVP_TABLE_COLUMN_MAX_WIDTH,
  RSVP_TABLE_RESIZE_HANDLE_TEST_ID,
  shouldRenderRsvpTableResizeHandle,
} from "../lib/rsvp-table-layout";

interface RsvpTableCellFixtureProps {
  columnIdentifier: string;
  isReadOnly?: boolean;
}

function RsvpTableCellFixture({ columnIdentifier, isReadOnly = false }: RsvpTableCellFixtureProps) {
  return (
    <table>
      <tbody>
        <tr>
          <td className={getRsvpTableBodyCellClassName({ columnIdentifier, isReadOnly })}>
            {columnIdentifier}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

interface RsvpResizeHandleFixtureProps {
  columnIdentifier: string;
  canResize: boolean;
}

function RsvpResizeHandleFixture({ columnIdentifier, canResize }: RsvpResizeHandleFixtureProps) {
  if (!shouldRenderRsvpTableResizeHandle({ columnIdentifier, canResize })) {
    return null;
  }

  return <div data-testid={RSVP_TABLE_RESIZE_HANDLE_TEST_ID}>{columnIdentifier}</div>;
}

describe("RSVP table layout", () => {
  it("renders non-select body cells with the header drag-gutter alignment class", () => {
    render(
      <table>
        <tbody>
          <tr>
            {[
              "guest",
              "listKey",
              "social_instagram",
              "invitedByName",
              "approvalStatus",
              "referredByName",
              "createdAt",
              "actions",
            ].map((columnIdentifier) => (
              <td
                key={columnIdentifier}
                className={getRsvpTableBodyCellClassName({
                  columnIdentifier,
                  isReadOnly: false,
                })}
              >
                {columnIdentifier}
              </td>
            ))}
          </tr>
        </tbody>
      </table>,
    );

    const bodyCells = screen.getAllByRole("cell");
    expect(bodyCells.length).toBe(8);
    for (const bodyCell of bodyCells) {
      expect(bodyCell.className).toContain(RSVP_TABLE_BODY_ALIGNMENT_GUTTER_CLASS);
      expect(bodyCell.className).toContain("overflow-hidden");
    }
  });

  it("keeps the select column fixed, compact, and non-resizable", () => {
    render(<RsvpTableCellFixture columnIdentifier="select" />);

    const selectCell = screen.getByRole("cell", { name: "select" });
    expect(selectCell.className).not.toContain(RSVP_TABLE_BODY_ALIGNMENT_GUTTER_CLASS);
    expect(selectCell.className).toContain("pl-2");
    expect(RSVP_SELECT_COLUMN_SIZING).toEqual({
      enableResizing: false,
      size: 60,
      minSize: 50,
      maxSize: 70,
    });
    expect(
      canToggleRsvpTableRowFromBodyCell({
        columnIdentifier: "select",
        isReadOnly: false,
      }),
    ).toBe(false);
  });

  it("renders header resize handles only for resizable non-select columns", () => {
    render(
      <>
        <RsvpResizeHandleFixture columnIdentifier="guest" canResize />
        <RsvpResizeHandleFixture columnIdentifier="select" canResize />
        <RsvpResizeHandleFixture columnIdentifier="approvalStatus" canResize={false} />
      </>,
    );

    const resizeHandles = screen.getAllByTestId(RSVP_TABLE_RESIZE_HANDLE_TEST_ID);
    expect(resizeHandles).toHaveLength(1);
    expect(resizeHandles[0]?.textContent).toBe("guest");
  });

  it("fills extra container width with a trailing filler column", () => {
    expect(
      getRsvpTableDisplayWidth({
        containerWidth: 1200,
        columnTotalWidth: 760,
      }),
    ).toBe(1200);
    expect(
      getRsvpTableFillerColumnWidth({
        containerWidth: 1200,
        columnTotalWidth: 760,
      }),
    ).toBe(440);
    expect(
      getRsvpTableDisplayWidth({
        containerWidth: 640,
        columnTotalWidth: 760,
      }),
    ).toBe(760);
    expect(
      getRsvpTableFillerColumnWidth({
        containerWidth: 640,
        columnTotalWidth: 760,
      }),
    ).toBe(0);
  });

  it("derives resizable column minimums from labels and body content", () => {
    const referredBySizing = getRsvpTableColumnSizing({
      label: "Referred By",
      contentValues: ["Half the lineup"],
      contentWidthCap: 144,
    });
    const approvalSizing = getRsvpTableColumnSizing({
      label: "Approval",
      contentValues: ["Pending", "Approved", "Denied"],
      contentHorizontalAffordance: 48,
    });

    expect(referredBySizing.enableResizing).toBe(true);
    expect(referredBySizing.minSize).toBeGreaterThanOrEqual(140);
    expect(referredBySizing.size).toBe(referredBySizing.minSize);
    expect(approvalSizing.minSize).toBeGreaterThanOrEqual(112);
    expect(approvalSizing.maxSize).toBe(RSVP_TABLE_COLUMN_MAX_WIDTH);
  });

  it("fits compact list controls for visible list key content", () => {
    const listSizing = getRsvpTableColumnSizing({
      label: "List",
      contentValues: ["GA", "ARTIST GUEST"],
      contentHorizontalAffordance: 48,
    });

    expect(listSizing.size).toBe(listSizing.minSize);
    expect(listSizing.minSize).toBeGreaterThanOrEqual(144);
  });

  it("caps long text content when deriving default sizes", () => {
    const cappedGuestSizing = getRsvpTableColumnSizing({
      label: "Guest",
      contentValues: ["A very long guest name that should not make the table enormous"],
      contentWidthCap: 128,
    });

    expect(cappedGuestSizing.size).toBe(cappedGuestSizing.minSize);
    expect(cappedGuestSizing.minSize).toBeLessThan(240);
    expect(cappedGuestSizing.maxSize).toBe(RSVP_TABLE_COLUMN_MAX_WIDTH);
  });

  it("never creates a resizable column max width below its computed minimum", () => {
    const oversizedLabelSizing = getRsvpTableColumnSizing({
      label: "Very Long Custom Field Label That Exceeds The Requested Cap",
      minContentWidth: 80,
      maxSize: 160,
    });

    expect(oversizedLabelSizing.maxSize).toBeGreaterThanOrEqual(oversizedLabelSizing.minSize);
    expect(oversizedLabelSizing.size).toBe(oversizedLabelSizing.minSize);
  });

  it("resolves selected row context actions to the selected batch", () => {
    const rows = [{ id: "rsvp_1" }, { id: "rsvp_2" }, { id: "rsvp_3" }];

    expect(
      getRsvpContextActionTargets({
        contextRow: rows[0]!,
        rows,
        selectedRowIds: new Set(["rsvp_1", "rsvp_2"]),
      }).map((row) => row.id),
    ).toEqual(["rsvp_1", "rsvp_2"]);

    expect(
      getRsvpContextActionTargets({
        contextRow: rows[2]!,
        rows,
        selectedRowIds: new Set(["rsvp_1", "rsvp_2"]),
      }).map((row) => row.id),
    ).toEqual(["rsvp_3"]);
  });
});

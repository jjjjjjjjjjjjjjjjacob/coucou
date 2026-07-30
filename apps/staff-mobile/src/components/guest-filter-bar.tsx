import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { type SelectionOption, SelectionSheet } from "@/components/selection-sheet";
import { spacing } from "@/theme";
import type { ApprovalFilter, AttendanceFilter, StaffGuestFilters, TicketFilter } from "@/types";

interface GuestFilterBarProps {
  filters: StaffGuestFilters;
  listKeys: string[];
  onChange: (filters: StaffGuestFilters) => void;
}

type ActiveSheet = "approval" | "attendance" | "list" | "ticket" | null;

const approvalOptions: SelectionOption[] = [
  { key: "all", label: "All approvals" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "denied", label: "Denied" },
];
const attendanceOptions: SelectionOption[] = [
  { key: "all", label: "All RSVP replies" },
  { key: "yes", label: "Attending" },
  { key: "maybe", label: "Maybe" },
  { key: "no", label: "Not attending" },
];
const ticketOptions: SelectionOption[] = [
  { key: "all", label: "All ticket states" },
  { key: "not-issued", label: "Not issued" },
  { key: "issued", label: "Issued" },
  { key: "redeemed", label: "Checked in" },
  { key: "disabled", label: "Disabled" },
];

function selectedLabel(options: SelectionOption[], selectedKey: string): string {
  return options.find((option) => option.key === selectedKey)?.label ?? selectedKey;
}

export function GuestFilterBar({
  filters,
  listKeys,
  onChange,
}: GuestFilterBarProps): React.JSX.Element {
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const listOptions: SelectionOption[] = [
    { key: "all", label: "All lists" },
    ...listKeys.map((listKey) => ({ key: listKey, label: listKey })),
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <SelectionSheet
        accessibilityLabel="Approval filter"
        label={selectedLabel(approvalOptions, filters.approval)}
        onClose={() => setActiveSheet(null)}
        onOpen={() => setActiveSheet("approval")}
        onSelect={(option) => {
          onChange({
            ...filters,
            approval: option.key as ApprovalFilter,
          });
          setActiveSheet(null);
        }}
        options={approvalOptions}
        selectedKey={filters.approval}
        visible={activeSheet === "approval"}
      />
      <SelectionSheet
        accessibilityLabel="Attendance filter"
        label={selectedLabel(attendanceOptions, filters.attendance)}
        onClose={() => setActiveSheet(null)}
        onOpen={() => setActiveSheet("attendance")}
        onSelect={(option) => {
          onChange({
            ...filters,
            attendance: option.key as AttendanceFilter,
          });
          setActiveSheet(null);
        }}
        options={attendanceOptions}
        selectedKey={filters.attendance}
        visible={activeSheet === "attendance"}
      />
      <SelectionSheet
        accessibilityLabel="Guest list filter"
        label={selectedLabel(listOptions, filters.list)}
        onClose={() => setActiveSheet(null)}
        onOpen={() => setActiveSheet("list")}
        onSelect={(option) => {
          onChange({ ...filters, list: option.key });
          setActiveSheet(null);
        }}
        options={listOptions}
        selectedKey={filters.list}
        visible={activeSheet === "list"}
      />
      <SelectionSheet
        accessibilityLabel="Ticket filter"
        label={selectedLabel(ticketOptions, filters.ticket)}
        onClose={() => setActiveSheet(null)}
        onOpen={() => setActiveSheet("ticket")}
        onSelect={(option) => {
          onChange({
            ...filters,
            ticket: option.key as TicketFilter,
          });
          setActiveSheet(null);
        }}
        options={ticketOptions}
        selectedKey={filters.ticket}
        visible={activeSheet === "ticket"}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.small,
    paddingRight: spacing.large,
  },
});

import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SelectionSheet, type SelectionOption } from "@/components/selection-sheet";
import { useStaffSession } from "@/providers/staff-session-provider";
import { spacing } from "@/theme";

function formatEventDate(eventDate: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(eventDate));
}

export function WorkspaceEventControls(): React.JSX.Element {
  const {
    workspaces,
    events,
    selectedWorkspace,
    selectedEvent,
    selectWorkspace,
    selectEvent,
  } = useStaffSession();
  const [workspaceSheetVisible, setWorkspaceSheetVisible] = useState(false);
  const [eventSheetVisible, setEventSheetVisible] = useState(false);

  const workspaceOptions: SelectionOption[] = workspaces.map((workspace) => ({
    key: workspace.workspaceId,
    label: workspace.name,
    description: workspace.membershipRole.replace("org:", ""),
  }));
  const eventOptions: SelectionOption[] = events.map((event) => ({
    key: event.eventId,
    label: event.name,
    description: `${formatEventDate(event.eventDate)} · ${event.location}`,
  }));

  return (
    <View style={styles.container}>
      <SelectionSheet
        accessibilityLabel="Workspace"
        label={selectedWorkspace?.name ?? "Choose workspace"}
        onClose={() => setWorkspaceSheetVisible(false)}
        onOpen={() => setWorkspaceSheetVisible(true)}
        onSelect={(option) => {
          const workspace = workspaces.find(
            (candidate) => candidate.workspaceId === option.key,
          );
          setWorkspaceSheetVisible(false);
          if (workspace) {
            void selectWorkspace(workspace);
          }
        }}
        options={workspaceOptions}
        selectedKey={selectedWorkspace?.workspaceId}
        visible={workspaceSheetVisible}
      />
      <SelectionSheet
        accessibilityLabel="Event"
        label={selectedEvent?.name ?? "Choose event"}
        onClose={() => setEventSheetVisible(false)}
        onOpen={() => setEventSheetVisible(true)}
        onSelect={(option) => {
          const event = events.find(
            (candidate) => candidate.eventId === option.key,
          );
          setEventSheetVisible(false);
          if (event) {
            void selectEvent(event);
          }
        }}
        options={eventOptions}
        selectedKey={selectedEvent?.eventId}
        visible={eventSheetVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
});

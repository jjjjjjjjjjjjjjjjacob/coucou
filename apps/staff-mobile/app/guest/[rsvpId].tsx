import { api } from "@coucou/backend/api";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Minus, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionButton } from "@/components/action-button";
import { type SelectionOption, SelectionSheet } from "@/components/selection-sheet";
import { StatusPill } from "@/components/status-pill";
import { ThresholdMark } from "@/components/threshold-mark";
import { readGuestSnapshot } from "@/lib/cache";
import { useConvexConnection } from "@/lib/connectivity";
import { useStaffSession } from "@/providers/staff-session-provider";
import { colors, spacing, typography } from "@/theme";
import type { StaffGuestSummary } from "@/types";

type GetGuestArguments = FunctionArgs<typeof api.mobileStaff.getGuest>;
type EditingField = "approval" | "attendance" | "list" | "ticket" | null;

const approvalOptions: SelectionOption[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];
const attendanceOptions: SelectionOption[] = [
  { key: "yes", label: "Attending" },
  { key: "maybe", label: "Maybe" },
  { key: "no", label: "Not attending" },
];
const ticketOptions: SelectionOption[] = [
  { key: "not-issued", label: "Not issued" },
  { key: "issued", label: "Issued" },
  { key: "disabled", label: "Disabled" },
];

export default function GuestDetailScreen(): React.JSX.Element {
  const router = useRouter();
  const { rsvpId } = useLocalSearchParams<{ rsvpId: string }>();
  const { selectedWorkspace, selectedEvent } = useStaffSession();
  const isConnected = useConvexConnection();
  const [offlineGuest, setOfflineGuest] = useState<StaffGuestSummary | undefined>();
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [mutationError, setMutationError] = useState("");
  const [isMutating, setIsMutating] = useState(false);

  const updateRsvpComplete = useMutation(api.rsvps.updateRsvpComplete);
  const updateAttendanceStatus = useMutation(api.rsvps.updateAttendanceStatus);
  const updateRsvpListKey = useMutation(api.rsvps.updateRsvpListKey);
  const setEntryStatus = useMutation(api.mobileStaff.setEntryStatus);

  const typedRsvpId = rsvpId as GetGuestArguments["rsvpId"];
  const liveGuest = useQuery(
    api.mobileStaff.getGuest,
    selectedWorkspace && rsvpId && isConnected
      ? {
          rsvpId: typedRsvpId,
          siteKey: selectedWorkspace.siteKey,
          workspaceSlug: selectedWorkspace.workspaceSlug,
        }
      : "skip",
  );

  useEffect(() => {
    if (isConnected || !selectedEvent || !rsvpId) {
      return;
    }
    void readGuestSnapshot(selectedEvent.eventId).then((snapshot) => {
      setOfflineGuest(snapshot?.guests.find((guest) => guest.rsvpId === rsvpId));
    });
  }, [isConnected, rsvpId, selectedEvent]);

  const guest = liveGuest ?? offlineGuest;
  const canEdit =
    isConnected && selectedWorkspace?.capabilities.canEditGuests === true && Boolean(guest);

  const runMutation = async (operation: () => Promise<unknown>): Promise<void> => {
    setMutationError("");
    setIsMutating(true);
    try {
      await operation();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The guest update failed.");
    } finally {
      setIsMutating(false);
    }
  };

  const commonScope = selectedWorkspace
    ? {
        siteKey: selectedWorkspace.siteKey,
        workspaceSlug: selectedWorkspace.workspaceSlug,
      }
    : undefined;

  if (liveGuest === undefined && isConnected && !offlineGuest) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.admit} size="large" />
      </SafeAreaView>
    );
  }

  if (!guest || !selectedWorkspace || !commonScope) {
    return (
      <SafeAreaView style={styles.screen}>
        <Header onBack={() => router.back()} />
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>Guest unavailable</Text>
          <Text style={styles.notFoundMessage}>
            This guest is not in the current event snapshot.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const listOptions: SelectionOption[] = (selectedEvent?.listKeys ?? [guest.listKey]).map(
    (listKey) => ({ key: listKey, label: listKey }),
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Header onBack={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.identity}>
          <ThresholdMark
            color={guest.entryStatus === "checked_in" ? colors.success : colors.admit}
            height={72}
          />
          <View style={styles.identityText}>
            <Text style={styles.name}>{guest.name}</Text>
            <Text style={styles.contact}>
              {guest.contact ?? "Contact hidden by guest preference"}
            </Text>
            <View style={styles.pills}>
              <StatusPill
                label={guest.entryStatus}
                tone={guest.entryStatus === "checked_in" ? "success" : "neutral"}
              />
              <StatusPill label={`${guest.attendees} in party`} />
            </View>
          </View>
        </View>

        {!isConnected ? (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>OFFLINE SNAPSHOT · READ ONLY</Text>
          </View>
        ) : !selectedWorkspace.capabilities.canEditGuests ? (
          <View style={styles.readOnlyBanner}>
            <Text style={styles.readOnlyText}>DOOR ROLE · READ ONLY</Text>
          </View>
        ) : null}

        <View style={styles.fields}>
          <EditableField
            canEdit={canEdit}
            label="Approval"
            onPress={() => setEditingField("approval")}
            value={guest.approvalStatus}
          />
          <EditableField
            canEdit={canEdit}
            label="Attendance"
            onPress={() => setEditingField("attendance")}
            value={guest.attendanceStatus}
          />
          <EditableField
            canEdit={canEdit}
            label="Guest list"
            onPress={() => setEditingField("list")}
            value={guest.listKey}
          />
          <EditableField
            canEdit={canEdit && guest.ticketStatus !== "redeemed"}
            label="Ticket"
            onPress={() => setEditingField("ticket")}
            value={guest.ticketStatus}
          />
        </View>

        {mutationError ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {mutationError}
          </Text>
        ) : null}

        {selectedWorkspace.capabilities.canEditGuests ? (
          <ActionButton
            disabled={!canEdit}
            isLoading={isMutating}
            label={guest.entryStatus === "checked_in" ? "Check guest out" : "Check guest in"}
            onPress={() => {
              void runMutation(() =>
                setEntryStatus({
                  checkedIn: guest.entryStatus !== "checked_in",
                  reason: "Manual mobile entry update",
                  rsvpId: guest.rsvpId,
                  ...commonScope,
                }),
              );
            }}
            variant={guest.entryStatus === "checked_in" ? "secondary" : "primary"}
          />
        ) : null}
      </View>

      <SelectionSheet
        accessibilityLabel="Approval status"
        label={guest.approvalStatus}
        onClose={() => setEditingField(null)}
        onOpen={() => setEditingField("approval")}
        onSelect={(option) => {
          setEditingField(null);
          void runMutation(() =>
            updateRsvpComplete({
              approvalStatus: option.key as "pending" | "approved" | "denied",
              rsvpId: guest.rsvpId,
              ...commonScope,
            }),
          );
        }}
        options={approvalOptions}
        renderTrigger={false}
        selectedKey={guest.approvalStatus}
        visible={editingField === "approval"}
      />
      <SelectionSheet
        accessibilityLabel="Attendance status"
        label={guest.attendanceStatus}
        onClose={() => setEditingField(null)}
        onOpen={() => setEditingField("attendance")}
        onSelect={(option) => {
          setEditingField(null);
          void runMutation(() =>
            updateAttendanceStatus({
              attendanceStatus: option.key as "yes" | "no" | "maybe",
              rsvpId: guest.rsvpId,
              ...commonScope,
            }),
          );
        }}
        options={attendanceOptions}
        renderTrigger={false}
        selectedKey={guest.attendanceStatus}
        visible={editingField === "attendance"}
      />
      <SelectionSheet
        accessibilityLabel="Guest list"
        label={guest.listKey}
        onClose={() => setEditingField(null)}
        onOpen={() => setEditingField("list")}
        onSelect={(option) => {
          setEditingField(null);
          void runMutation(() =>
            updateRsvpListKey({
              listKey: option.key,
              rsvpId: guest.rsvpId,
              ...commonScope,
            }),
          );
        }}
        options={listOptions}
        renderTrigger={false}
        selectedKey={guest.listKey}
        visible={editingField === "list"}
      />
      <SelectionSheet
        accessibilityLabel="Ticket status"
        label={guest.ticketStatus}
        onClose={() => setEditingField(null)}
        onOpen={() => setEditingField("ticket")}
        onSelect={(option) => {
          setEditingField(null);
          void runMutation(() =>
            updateRsvpComplete({
              rsvpId: guest.rsvpId,
              ticketStatus: option.key as "not-issued" | "issued" | "disabled",
              ...commonScope,
            }),
          );
        }}
        options={ticketOptions}
        renderTrigger={false}
        selectedKey={guest.ticketStatus}
        visible={editingField === "ticket"}
      />
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back to guests"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <ArrowLeft color={colors.paper} size={23} />
      </Pressable>
      <Text style={styles.headerTitle}>Guest detail</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function EditableField({
  label,
  value,
  canEdit,
  onPress,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole={canEdit ? "button" : "text"}
      disabled={!canEdit}
      onPress={onPress}
      style={({ pressed }) => [styles.field, pressed && styles.pressed]}
    >
      <View>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value.replaceAll("-", " ")}</Text>
      </View>
      {canEdit ? (
        <View style={styles.editGlyph}>
          <Minus color={colors.steel} size={12} />
          <Plus color={colors.admit} size={14} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.night,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.night,
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomColor: colors.rule,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.small,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.62,
  },
  headerTitle: {
    flex: 1,
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 17,
    textAlign: "center",
  },
  headerSpacer: {
    width: 48,
  },
  content: {
    flex: 1,
    gap: spacing.extraLarge,
    padding: spacing.large,
  },
  identity: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.large,
  },
  identityText: {
    flex: 1,
    gap: spacing.extraSmall,
  },
  name: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 27,
    lineHeight: 32,
  },
  contact: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 13,
  },
  pills: {
    flexDirection: "row",
    gap: spacing.small,
    marginTop: spacing.extraSmall,
  },
  offlineBanner: {
    borderLeftColor: colors.warning,
    borderLeftWidth: 3,
    backgroundColor: colors.booth,
    padding: spacing.medium,
  },
  offlineText: {
    color: colors.warning,
    fontFamily: typography.mono,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  readOnlyBanner: {
    borderLeftColor: colors.steel,
    borderLeftWidth: 3,
    backgroundColor: colors.booth,
    padding: spacing.medium,
  },
  readOnlyText: {
    color: colors.steel,
    fontFamily: typography.mono,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  fields: {
    borderTopColor: colors.rule,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  field: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomColor: colors.rule,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 12,
  },
  fieldValue: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 16,
    textTransform: "capitalize",
  },
  editGlyph: {
    flexDirection: "row",
    alignItems: "center",
  },
  error: {
    color: colors.failure,
    fontFamily: typography.medium,
    fontSize: 13,
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.small,
    padding: spacing.extraLarge,
  },
  notFoundTitle: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 22,
  },
  notFoundMessage: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 14,
    textAlign: "center",
  },
});

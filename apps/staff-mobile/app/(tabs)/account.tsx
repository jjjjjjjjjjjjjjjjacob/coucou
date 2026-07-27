import AsyncStorage from "@react-native-async-storage/async-storage";
import { useClerk, useUser } from "@clerk/expo";
import { LogOut, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ActionButton } from "@/components/action-button";
import { AppScreen } from "@/components/app-screen";
import { StatusPill } from "@/components/status-pill";
import { ThresholdMark } from "@/components/threshold-mark";
import { WorkspaceEventControls } from "@/components/workspace-event-controls";
import { purgeAllGuestSnapshots } from "@/lib/cache";
import { useConvexConnection } from "@/lib/connectivity";
import { useStaffSession } from "@/providers/staff-session-provider";
import { colors, radii, spacing, typography } from "@/theme";

export default function AccountScreen(): React.JSX.Element {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { selectedWorkspace, selectedEvent } = useStaffSession();
  const isConnected = useConvexConnection();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const performSignOut = async (): Promise<void> => {
    setIsSigningOut(true);
    try {
      await purgeAllGuestSnapshots();
      await AsyncStorage.multiRemove([
        "coucou-staff:last-workspace",
      ]);
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  const accountName =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    user?.primaryPhoneNumber?.phoneNumber ??
    "Staff account";

  return (
    <AppScreen eyebrow="Session and access" scroll title="Account">
      <View style={styles.content}>
        <View style={styles.identity}>
          <ThresholdMark height={54} />
          <View style={styles.identityText}>
            <Text style={styles.identityName}>{accountName}</Text>
            <Text style={styles.identityContact}>
              {user?.primaryEmailAddress?.emailAddress ??
                user?.primaryPhoneNumber?.phoneNumber ??
                "Authenticated with Clerk"}
            </Text>
          </View>
          <StatusPill
            label={isConnected ? "Live" : "Offline"}
            tone={isConnected ? "success" : "warning"}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIVE ASSIGNMENT</Text>
          <WorkspaceEventControls />
          <View style={styles.assignment}>
            <Text style={styles.assignmentTitle}>
              {selectedEvent?.name ?? "No event selected"}
            </Text>
            <Text style={styles.assignmentMeta}>
              {selectedEvent
                ? `${new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(selectedEvent.eventDate))} · ${selectedEvent.location}`
                : "Choose an event before scanning."}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ROLE CAPABILITIES</Text>
          <View style={styles.capabilityGroup}>
            <View style={styles.capabilityHeader}>
              <ShieldCheck color={colors.admit} size={21} />
              <Text style={styles.capabilityRole}>
                {selectedWorkspace?.membershipRole.replace("org:", "") ??
                  "No role"}
              </Text>
            </View>
            <CapabilityRow
              enabled={selectedWorkspace?.capabilities.canScan === true}
              label="Scan and undo entry"
            />
            <CapabilityRow
              enabled={selectedWorkspace?.capabilities.canViewGuests === true}
              label="View and search guests"
            />
            <CapabilityRow
              enabled={selectedWorkspace?.capabilities.canEditGuests === true}
              label="Edit guest status"
            />
            <CapabilityRow
              enabled={selectedWorkspace?.capabilities.canExportGuests === true}
              label="Export CSV"
            />
          </View>
        </View>

        <View style={styles.privacy}>
          <Text style={styles.privacyTitle}>Protected on this device</Text>
          <Text style={styles.privacyBody}>
            Clerk tokens use SecureStore. Offline snapshots expire after 24
            hours and omit contact data, notes, custom fields, and ticket codes.
            Check-ins and edits are never queued.
          </Text>
        </View>

        <ActionButton
          isLoading={isSigningOut}
          label="Sign out and clear cache"
          onPress={() => {
            void performSignOut();
          }}
          variant="danger"
        />
        <View style={styles.signOutIcon}>
          <LogOut color={colors.failure} size={18} />
        </View>
      </View>
    </AppScreen>
  );
}

function CapabilityRow({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}): React.JSX.Element {
  return (
    <View style={styles.capabilityRow}>
      <View
        style={[
          styles.capabilityDot,
          { backgroundColor: enabled ? colors.success : colors.rule },
        ]}
      />
      <Text
        style={[
          styles.capabilityLabel,
          !enabled && styles.capabilityDisabled,
        ]}
      >
        {label}
      </Text>
      <Text style={styles.capabilityValue}>
        {enabled ? "ALLOWED" : "BLOCKED"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.extraLarge,
  },
  identity: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.medium,
    borderTopColor: colors.rule,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.rule,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 18,
  },
  identityContact: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 13,
  },
  section: {
    gap: spacing.medium,
  },
  sectionLabel: {
    color: colors.steel,
    fontFamily: typography.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  assignment: {
    gap: spacing.extraSmall,
    borderLeftColor: colors.admit,
    borderLeftWidth: 2,
    paddingLeft: spacing.medium,
  },
  assignmentTitle: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 16,
  },
  assignmentMeta: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  capabilityGroup: {
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    backgroundColor: colors.booth,
    padding: spacing.large,
  },
  capabilityHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.small,
    borderBottomColor: colors.rule,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.small,
  },
  capabilityRole: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 16,
    textTransform: "capitalize",
  },
  capabilityRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.small,
  },
  capabilityDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  capabilityLabel: {
    flex: 1,
    color: colors.paper,
    fontFamily: typography.regular,
    fontSize: 14,
  },
  capabilityDisabled: {
    color: colors.steel,
  },
  capabilityValue: {
    color: colors.steel,
    fontFamily: typography.mono,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  privacy: {
    gap: spacing.small,
    backgroundColor: colors.booth,
    padding: spacing.large,
  },
  privacyTitle: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 15,
  },
  privacyBody: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  signOutIcon: {
    position: "absolute",
    bottom: 15,
    left: spacing.large,
  },
});

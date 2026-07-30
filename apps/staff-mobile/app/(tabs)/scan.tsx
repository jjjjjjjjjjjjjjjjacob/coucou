import { api } from "@coucou/backend/api";
import { useMutation } from "convex/react";
import type { BarcodeScanningResult } from "expo-camera";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect } from "expo-router";
import { Flashlight, Keyboard, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ActionButton } from "@/components/action-button";
import { OperationalEmptyState } from "@/components/operational-empty-state";
import { ThresholdMark } from "@/components/threshold-mark";
import { WorkspaceEventControls } from "@/components/workspace-event-controls";
import { useConvexConnection } from "@/lib/connectivity";
import { parseRedemptionPayload } from "@/lib/qr";
import {
  SCAN_UNDO_WINDOW_MILLISECONDS,
  scanMachineReducer,
  shouldSuppressDuplicateScan,
} from "@/lib/scan-machine";
import { useStaffSession } from "@/providers/staff-session-provider";
import { colors, radii, spacing, typography } from "@/theme";
import type { StaffScanOutcome } from "@/types";

interface OutcomePresentation {
  title: string;
  message: string;
  color: string;
  haptic: "success" | "warning" | "error";
}

interface UndoNotice {
  code: string;
  guestName: string;
  expiresAt: number;
}

const SCANNER_KEEP_AWAKE_TAG = "coucou-staff-scanner";

function outcomePresentation(outcome: StaffScanOutcome): OutcomePresentation {
  switch (outcome.outcome) {
    case "redeemed":
      return {
        title: "Admit",
        message: `${outcome.guest.name} checked in.`,
        color: colors.success,
        haptic: "success",
      };
    case "already_redeemed":
      return {
        title: "Already inside",
        message: `${outcome.guest.name} was checked in earlier.`,
        color: colors.warning,
        haptic: "warning",
      };
    case "wrong_event":
      return {
        title: "Wrong event",
        message: `This ticket belongs to ${outcome.eventName}.`,
        color: colors.failure,
        haptic: "error",
      };
    case "disabled":
      return {
        title: "Ticket disabled",
        message: outcome.message,
        color: colors.warning,
        haptic: "warning",
      };
    case "not_eligible":
      return {
        title: "Not eligible",
        message: outcome.message,
        color: colors.failure,
        haptic: "error",
      };
    case "invalid":
      return {
        title: "Not recognized",
        message: outcome.message,
        color: colors.failure,
        haptic: "error",
      };
    case "network_error":
      return {
        title: "Connection lost",
        message: outcome.message,
        color: colors.warning,
        haptic: "warning",
      };
    case "undone":
      return {
        title: "Entry undone",
        message: outcome.message,
        color: colors.admit,
        haptic: "success",
      };
  }
}

async function announceOutcome(outcome: StaffScanOutcome): Promise<void> {
  const presentation = outcomePresentation(outcome);
  const notificationType =
    presentation.haptic === "success"
      ? Haptics.NotificationFeedbackType.Success
      : presentation.haptic === "warning"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  await Haptics.notificationAsync(notificationType);
  AccessibilityInfo.announceForAccessibility(`${presentation.title}. ${presentation.message}`);
}

export default function ScanScreen(): React.JSX.Element {
  const { selectedWorkspace, selectedEvent, workspaces, isLoading } = useStaffSession();
  const isConnected = useConvexConnection();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scanTicket = useMutation(api.mobileStaff.scanTicket);
  const undoScan = useMutation(api.mobileStaff.undoScan);
  const [scanState, dispatchScanAction] = useReducer(scanMachineReducer, {
    status: "ready",
  });
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const lastReadRef = useRef<{ code: string; readAt: number } | undefined>(undefined);
  const thresholdAnimation = useRef(new Animated.Value(0)).current;
  const [reducedMotionEnabled, setReducedMotionEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void activateKeepAwakeAsync(SCANNER_KEEP_AWAKE_TAG);
      return () => {
        void deactivateKeepAwake(SCANNER_KEEP_AWAKE_TAG);
      };
    }, []),
  );

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotionEnabled,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!undoNotice) {
      return;
    }
    const remainingMilliseconds = Math.max(0, undoNotice.expiresAt - Date.now());
    const timeout = setTimeout(() => setUndoNotice(null), remainingMilliseconds);
    return () => clearTimeout(timeout);
  }, [undoNotice]);

  const feedbackPresentation = useMemo(
    () => (scanState.status === "feedback" ? outcomePresentation(scanState.outcome) : undefined),
    [scanState],
  );

  const playThresholdAnimation = (): void => {
    thresholdAnimation.setValue(0);
    Animated.sequence([
      Animated.timing(thresholdAnimation, {
        toValue: 1,
        duration: reducedMotionEnabled ? 120 : 180,
        useNativeDriver: true,
      }),
      Animated.timing(thresholdAnimation, {
        toValue: 0,
        duration: reducedMotionEnabled ? 180 : 320,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const resolveCode = async (code: string): Promise<void> => {
    if (!selectedWorkspace || !selectedEvent || scanState.status !== "ready") {
      return;
    }

    if (!isConnected) {
      const networkOutcome: StaffScanOutcome = {
        outcome: "network_error",
        message: "Reconnect before checking in a guest.",
      };
      dispatchScanAction({ type: "SUBMIT", code });
      dispatchScanAction({
        type: "RESOLVE",
        code,
        outcome: networkOutcome,
        receivedAt: Date.now(),
      });
      await announceOutcome(networkOutcome);
      setTimeout(() => dispatchScanAction({ type: "REARM" }), 1800);
      return;
    }

    dispatchScanAction({ type: "SUBMIT", code });
    let outcome: StaffScanOutcome;
    try {
      outcome = await scanTicket({
        code,
        eventId: selectedEvent.eventId,
        siteKey: selectedWorkspace.siteKey,
        workspaceSlug: selectedWorkspace.workspaceSlug,
      });
    } catch {
      outcome = {
        outcome: "network_error",
        message: "The scan did not reach Coucou. Try again.",
      };
    }

    dispatchScanAction({
      type: "RESOLVE",
      code,
      outcome,
      receivedAt: Date.now(),
    });
    if (outcome.outcome === "redeemed") {
      setUndoNotice({
        code,
        guestName: outcome.guest.name,
        expiresAt: Date.now() + SCAN_UNDO_WINDOW_MILLISECONDS,
      });
      playThresholdAnimation();
    }
    await announceOutcome(outcome);
    setTimeout(() => dispatchScanAction({ type: "REARM" }), 1800);
  };

  const acceptPayload = (payload: string): void => {
    if (scanState.status !== "ready") {
      return;
    }
    const parsedPayload = parseRedemptionPayload(payload);
    if (!parsedPayload.valid) {
      const invalidCode = "INVALID";
      dispatchScanAction({ type: "SUBMIT", code: invalidCode });
      const invalidOutcome: StaffScanOutcome = {
        outcome: "invalid",
        message: "Use a Coucou ticket QR or an eight-character code.",
      };
      dispatchScanAction({
        type: "RESOLVE",
        code: invalidCode,
        outcome: invalidOutcome,
        receivedAt: Date.now(),
      });
      void announceOutcome(invalidOutcome);
      setTimeout(() => dispatchScanAction({ type: "REARM" }), 1800);
      return;
    }

    const now = Date.now();
    if (
      shouldSuppressDuplicateScan(
        lastReadRef.current?.code,
        lastReadRef.current?.readAt,
        parsedPayload.code,
        now,
      )
    ) {
      return;
    }
    lastReadRef.current = { code: parsedPayload.code, readAt: now };
    void resolveCode(parsedPayload.code);
  };

  const handleBarcodeScanned = (barcodeResult: BarcodeScanningResult): void => {
    acceptPayload(barcodeResult.data);
  };

  const undoMostRecentScan = async (): Promise<void> => {
    if (!undoNotice || !selectedEvent || !selectedWorkspace || !isConnected) {
      return;
    }
    setIsUndoing(true);
    try {
      const outcome = await undoScan({
        code: undoNotice.code,
        eventId: selectedEvent.eventId,
        reason: "Immediate mobile scan undo",
        siteKey: selectedWorkspace.siteKey,
        workspaceSlug: selectedWorkspace.workspaceSlug,
      });
      await announceOutcome(outcome);
      setUndoNotice(null);
    } finally {
      setIsUndoing(false);
    }
  };

  if (!isLoading && workspaces.length === 0) {
    return (
      <View style={styles.screen}>
        <OperationalEmptyState
          message="Ask an administrator to assign Door, Host, or Admin access in Clerk."
          title="No mobile access"
        />
      </View>
    );
  }

  if (!selectedWorkspace || !selectedEvent) {
    return (
      <View style={styles.screen}>
        <View style={styles.selectionOnly}>
          <WorkspaceEventControls />
          <OperationalEmptyState
            message="Choose an accessible workspace and event to begin."
            title="Select an event"
          />
        </View>
      </View>
    );
  }

  if (!cameraPermission) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.admit} size="large" />
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.permission}>
        <ThresholdMark color={colors.warning} height={64} />
        <Text style={styles.permissionTitle}>Camera access is off</Text>
        <Text style={styles.permissionMessage}>
          Camera access is used only to read ticket QR codes. Manual code entry remains available.
        </Text>
        <ActionButton
          label="Allow camera"
          onPress={() => {
            void requestCameraPermission();
          }}
        />
        <ActionButton
          label="Enter a code"
          onPress={() => setManualEntryVisible(true)}
          variant="secondary"
        />
        <ManualEntryModal
          code={manualCode}
          isConnected={isConnected}
          onChangeCode={setManualCode}
          onClose={() => setManualEntryVisible(false)}
          onSubmit={() => {
            setManualEntryVisible(false);
            acceptPayload(manualCode);
            setManualCode("");
          }}
          visible={manualEntryVisible}
        />
      </View>
    );
  }

  const apertureScale = reducedMotionEnabled
    ? thresholdAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1],
      })
    : thresholdAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.34],
      });
  const feedbackOpacity = thresholdAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.65],
  });

  return (
    <View style={styles.screen}>
      <CameraView
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        enableTorch={torchEnabled}
        facing="back"
        onBarcodeScanned={
          scanState.status === "ready" && isConnected ? handleBarcodeScanned : undefined
        }
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topControls}>
          <WorkspaceEventControls />
          <View style={styles.controlRow}>
            <Pressable
              accessibilityLabel={torchEnabled ? "Turn torch off" : "Turn torch on"}
              accessibilityRole="button"
              onPress={() => setTorchEnabled((current) => !current)}
              style={({ pressed }) => [
                styles.roundButton,
                torchEnabled && styles.roundButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Flashlight color={torchEnabled ? colors.night : colors.paper} size={22} />
            </Pressable>
            <Pressable
              accessibilityLabel="Enter ticket code"
              accessibilityRole="button"
              onPress={() => setManualEntryVisible(true)}
              style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
            >
              <Keyboard color={colors.paper} size={22} />
            </Pressable>
          </View>
        </View>

        <View style={styles.apertureArea} pointerEvents="none">
          <Animated.View
            style={[
              styles.aperture,
              {
                borderColor: feedbackPresentation?.color ?? colors.admit,
                transform: [{ scaleX: apertureScale }],
              },
            ]}
          >
            <View style={styles.apertureCap} />
            <View style={styles.apertureCapBottom} />
          </Animated.View>
          <Animated.View
            style={[
              styles.successWash,
              {
                backgroundColor: feedbackPresentation?.color ?? colors.success,
                opacity: feedbackOpacity,
              },
            ]}
          />
        </View>

        <View style={styles.bottomArea}>
          {!isConnected ? (
            <View style={styles.offlineNotice}>
              <Text style={styles.offlineLabel}>OFFLINE · SCANNING PAUSED</Text>
            </View>
          ) : null}
          {scanState.status === "submitting" ? (
            <View style={styles.outcome}>
              <ActivityIndicator color={colors.admit} />
              <Text style={styles.outcomeTitle}>Checking ticket</Text>
            </View>
          ) : feedbackPresentation ? (
            <View accessibilityLiveRegion="assertive" style={styles.outcome}>
              <ThresholdMark color={feedbackPresentation.color} height={42} />
              <View style={styles.outcomeText}>
                <Text style={[styles.outcomeTitle, { color: feedbackPresentation.color }]}>
                  {feedbackPresentation.title}
                </Text>
                <Text style={styles.outcomeMessage}>{feedbackPresentation.message}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.scanInstruction}>Hold the guest ticket inside the threshold.</Text>
          )}

          {undoNotice ? (
            <View style={styles.undoNotice}>
              <View style={styles.undoText}>
                <Text style={styles.undoTitle}>{undoNotice.guestName}</Text>
                <Text style={styles.undoMessage}>Entry recorded</Text>
              </View>
              <ActionButton
                isLoading={isUndoing}
                label="Undo"
                onPress={() => {
                  void undoMostRecentScan();
                }}
                style={styles.undoButton}
                variant="secondary"
              />
            </View>
          ) : null}
        </View>
      </View>

      <ManualEntryModal
        code={manualCode}
        isConnected={isConnected}
        onChangeCode={setManualCode}
        onClose={() => setManualEntryVisible(false)}
        onSubmit={() => {
          setManualEntryVisible(false);
          acceptPayload(manualCode);
          setManualCode("");
        }}
        visible={manualEntryVisible}
      />
    </View>
  );
}

function ManualEntryModal({
  code,
  isConnected,
  onChangeCode,
  onClose,
  onSubmit,
  visible,
}: {
  code: string;
  isConnected: boolean;
  onChangeCode: (code: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  visible: boolean;
}): React.JSX.Element {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalScrim}>
        <View style={styles.manualPanel}>
          <View style={styles.manualHeader}>
            <View>
              <Text style={styles.manualEyebrow}>MANUAL ENTRY</Text>
              <Text style={styles.manualTitle}>Ticket code</Text>
            </View>
            <Pressable
              accessibilityLabel="Close manual entry"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={colors.paper} size={22} />
            </Pressable>
          </View>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={256}
            onChangeText={onChangeCode}
            onSubmitEditing={onSubmit}
            placeholder="AB12CD34"
            placeholderTextColor={colors.steel}
            returnKeyType="done"
            style={styles.manualInput}
            value={code}
          />
          <ActionButton
            disabled={!code.trim() || !isConnected}
            label="Check ticket"
            onPress={onSubmit}
          />
        </View>
      </View>
    </Modal>
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
  selectionOnly: {
    flex: 1,
    paddingHorizontal: spacing.large,
    paddingTop: 64,
  },
  permission: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.large,
    backgroundColor: colors.night,
    paddingHorizontal: spacing.extraLarge,
  },
  permissionTitle: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 26,
  },
  permissionMessage: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: "space-between",
    backgroundColor: "rgba(11,13,16,0.24)",
    paddingTop: 60,
    paddingHorizontal: spacing.large,
    paddingBottom: spacing.large,
  },
  topControls: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.small,
  },
  controlRow: {
    flexDirection: "row",
    gap: spacing.small,
  },
  roundButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "rgba(243,240,232,0.26)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    backgroundColor: "rgba(11,13,16,0.72)",
  },
  roundButtonActive: {
    backgroundColor: colors.admit,
  },
  pressed: {
    opacity: 0.68,
  },
  apertureArea: {
    alignItems: "center",
    justifyContent: "center",
  },
  aperture: {
    width: "62%",
    aspectRatio: 0.54,
    borderLeftWidth: 3,
    borderRightWidth: 3,
  },
  apertureCap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.admit,
  },
  apertureCapBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(130,167,255,0.48)",
  },
  successWash: {
    position: "absolute",
    width: "62%",
    aspectRatio: 0.54,
  },
  bottomArea: {
    gap: spacing.medium,
  },
  offlineNotice: {
    alignSelf: "flex-start",
    borderColor: colors.warning,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.small,
    backgroundColor: "rgba(11,13,16,0.9)",
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  offlineLabel: {
    color: colors.warning,
    fontFamily: typography.mono,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  scanInstruction: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 15,
    textAlign: "center",
    textShadowColor: colors.night,
    textShadowRadius: 3,
  },
  outcome: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.medium,
    borderColor: "rgba(243,240,232,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    backgroundColor: "rgba(11,13,16,0.92)",
    padding: spacing.medium,
  },
  outcomeText: {
    flex: 1,
    gap: 2,
  },
  outcomeTitle: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 18,
  },
  outcomeMessage: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  undoNotice: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.medium,
    borderTopColor: colors.success,
    borderTopWidth: 2,
    borderRadius: radii.medium,
    backgroundColor: colors.booth,
    paddingHorizontal: spacing.medium,
  },
  undoText: {
    flex: 1,
  },
  undoTitle: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 15,
  },
  undoMessage: {
    color: colors.success,
    fontFamily: typography.mono,
    fontSize: 11,
    textTransform: "uppercase",
  },
  undoButton: {
    minHeight: 42,
  },
  modalScrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  manualPanel: {
    gap: spacing.large,
    backgroundColor: colors.night,
    paddingHorizontal: spacing.extraLarge,
    paddingTop: spacing.extraLarge,
    paddingBottom: 44,
  },
  manualHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  manualEyebrow: {
    color: colors.admit,
    fontFamily: typography.mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  manualTitle: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 25,
  },
  closeButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  manualInput: {
    minHeight: 58,
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    backgroundColor: colors.booth,
    color: colors.paper,
    fontFamily: typography.mono,
    fontSize: 24,
    letterSpacing: 5,
    paddingHorizontal: spacing.large,
    textAlign: "center",
  },
});

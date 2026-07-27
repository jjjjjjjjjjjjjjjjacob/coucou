import { api } from "@coucou/backend/api";
import { useAction, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Download, Search, UsersRound } from "lucide-react-native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { AppScreen } from "@/components/app-screen";
import { GuestFilterBar } from "@/components/guest-filter-bar";
import { OperationalEmptyState } from "@/components/operational-empty-state";
import { StatusPill } from "@/components/status-pill";
import { ThresholdMark } from "@/components/threshold-mark";
import { WorkspaceEventControls } from "@/components/workspace-event-controls";
import {
  createGuestSnapshot,
  readGuestSnapshot,
  writeGuestSnapshot,
} from "@/lib/cache";
import { useConvexConnection } from "@/lib/connectivity";
import { shareTemporaryCsv } from "@/lib/csv";
import {
  DEFAULT_GUEST_FILTERS,
  guestMatchesFilters,
  serializeGuestFilters,
} from "@/lib/filters";
import { useStaffSession } from "@/providers/staff-session-provider";
import { colors, radii, spacing, typography } from "@/theme";
import type { StaffGuestFilters, StaffGuestSummary } from "@/types";

function approvalTone(
  approvalStatus: StaffGuestSummary["approvalStatus"],
): "success" | "warning" | "failure" {
  if (approvalStatus === "approved") {
    return "success";
  }
  return approvalStatus === "denied" ? "failure" : "warning";
}

function mergeGuestPages(
  existingGuests: StaffGuestSummary[],
  incomingGuests: StaffGuestSummary[],
): StaffGuestSummary[] {
  const guestsById = new Map(
    existingGuests.map((guest) => [guest.rsvpId, guest]),
  );
  for (const guest of incomingGuests) {
    guestsById.set(guest.rsvpId, guest);
  }
  return [...guestsById.values()];
}

export default function GuestsScreen(): React.JSX.Element {
  const router = useRouter();
  const {
    selectedWorkspace,
    selectedEvent,
    workspaces,
    isLoading,
  } = useStaffSession();
  const isConnected = useConvexConnection();
  const exportGuestList = useAction(api.exports.exportRsvpsCsv);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<StaffGuestFilters>(
    DEFAULT_GUEST_FILTERS,
  );
  const [requestedCursor, setRequestedCursor] = useState<string | undefined>();
  const [guests, setGuests] = useState<StaffGuestSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isPageDone, setIsPageDone] = useState(true);
  const [isUsingOfflineSnapshot, setIsUsingOfflineSnapshot] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const filterKey = serializeGuestFilters(filters);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setGuests([]);
    setRequestedCursor(undefined);
    setNextCursor(null);
    setIsPageDone(false);
    setIsUsingOfflineSnapshot(false);
  }, [debouncedSearch, filterKey, selectedEvent?.eventId]);

  const queryArguments = useMemo(
    () =>
      selectedWorkspace && selectedEvent && isConnected
        ? {
            approvalFilter: filters.approval,
            attendanceFilter: filters.attendance,
            cursor: requestedCursor,
            eventId: selectedEvent.eventId,
            listFilter: filters.list,
            pageSize: 75,
            search: debouncedSearch,
            siteKey: selectedWorkspace.siteKey,
            ticketFilter: filters.ticket,
            workspaceSlug: selectedWorkspace.workspaceSlug,
          }
        : undefined,
    [
      debouncedSearch,
      filters,
      isConnected,
      requestedCursor,
      selectedEvent,
      selectedWorkspace,
    ],
  );
  const guestPage = useQuery(
    api.mobileStaff.listGuests,
    queryArguments ?? "skip",
  );

  useEffect(() => {
    if (!guestPage || !selectedEvent || !selectedWorkspace) {
      return;
    }
    setNextCursor(guestPage.nextCursor);
    setIsPageDone(guestPage.isDone);
    setIsUsingOfflineSnapshot(false);
    setGuests((existingGuests) => {
      const nextGuests = requestedCursor
        ? mergeGuestPages(existingGuests, guestPage.page)
        : guestPage.page;
      void writeGuestSnapshot(
        createGuestSnapshot(
          selectedWorkspace.workspaceId,
          selectedEvent.eventId,
          nextGuests,
        ),
      );
      return nextGuests;
    });
  }, [guestPage, requestedCursor, selectedEvent, selectedWorkspace]);

  useEffect(() => {
    if (isConnected || !selectedEvent) {
      return;
    }
    let isCancelled = false;
    void readGuestSnapshot(selectedEvent.eventId).then((snapshot) => {
      if (!isCancelled) {
        setGuests(snapshot?.guests ?? []);
        setIsUsingOfflineSnapshot(Boolean(snapshot));
        setIsPageDone(true);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [isConnected, selectedEvent]);

  const displayedGuests = isUsingOfflineSnapshot
    ? guests.filter((guest) =>
        guestMatchesFilters(guest, debouncedSearch, filters),
      )
    : guests;

  const exportCsv = async (): Promise<void> => {
    if (
      !selectedWorkspace ||
      !selectedEvent ||
      !selectedWorkspace.capabilities.canExportGuests ||
      !isConnected
    ) {
      return;
    }
    setExportError("");
    setIsExporting(true);
    try {
      const result = await exportGuestList({
        attendanceFilters:
          filters.attendance === "all" ? undefined : [filters.attendance],
        eventId: selectedEvent.eventId,
        includeAttendees: true,
        includeCustomFields: true,
        includeInvitedBy: true,
        includeNote: true,
        includePhone: true,
        includePrimaryFields: true,
        listKeys: filters.list === "all" ? undefined : [filters.list],
        search: debouncedSearch || undefined,
        siteKey: selectedWorkspace.siteKey,
        statusFilters:
          filters.approval === "all" ? undefined : [filters.approval],
        ticketStatusFilters:
          filters.ticket === "all" ? undefined : [filters.ticket],
        workspaceSlug: selectedWorkspace.workspaceSlug,
      });
      await shareTemporaryCsv(result.filename, result.csvContent);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Export failed. Try again.",
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (!isLoading && workspaces.length === 0) {
    return (
      <AppScreen eyebrow="Guest operations" title="Guests">
        <OperationalEmptyState
          message="Door, Host, or Admin access is required to view event guests."
          title="No mobile access"
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      eyebrow={
        isUsingOfflineSnapshot ? "Offline snapshot · read only" : "Live guest list"
      }
      headerAccessory={
        selectedWorkspace?.capabilities.canExportGuests ? (
          <Pressable
            accessibilityLabel="Export filtered guest list"
            accessibilityRole="button"
            disabled={!isConnected || isExporting || !selectedEvent}
            onPress={() => {
              void exportCsv();
            }}
            style={({ pressed }) => [
              styles.exportButton,
              pressed && styles.pressed,
              (!isConnected || !selectedEvent) && styles.disabled,
            ]}
          >
            {isExporting ? (
              <ActivityIndicator color={colors.admit} />
            ) : (
              <Download color={colors.admit} size={21} />
            )}
          </Pressable>
        ) : null
      }
      title="Guests"
    >
      <View style={styles.controls}>
        <WorkspaceEventControls />
        <View style={styles.search}>
          <Search color={colors.steel} size={19} />
          <TextInput
            accessibilityLabel="Search guests"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setSearch}
            placeholder="Search name or contact"
            placeholderTextColor={colors.steel}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
        </View>
        <GuestFilterBar
          filters={filters}
          listKeys={selectedEvent?.listKeys ?? []}
          onChange={setFilters}
        />
        {!isConnected ? (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>
              OFFLINE · CHANGES AND EXPORTS ARE BLOCKED
            </Text>
          </View>
        ) : null}
        {exportError ? (
          <Text accessibilityLiveRegion="assertive" style={styles.exportError}>
            {exportError}
          </Text>
        ) : null}
      </View>

      {!selectedEvent ? (
        <OperationalEmptyState
          message="Choose an event above to load its guest list."
          title="Select an event"
        />
      ) : guestPage === undefined &&
        isConnected &&
        displayedGuests.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.admit} size="large" />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={
            displayedGuests.length === 0
              ? styles.emptyList
              : styles.listContent
          }
          data={displayedGuests}
          getItemLayout={(_data, index) => ({
            index,
            length: 79,
            offset: 79 * index,
          })}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(guest) => guest.rsvpId}
          ListEmptyComponent={
            <View style={styles.empty}>
              <UsersRound color={colors.rule} size={36} strokeWidth={1.4} />
              <Text style={styles.emptyTitle}>No guests found</Text>
              <Text style={styles.emptyMessage}>
                Try a different search or filter.
              </Text>
            </View>
          }
          ListFooterComponent={
            !isPageDone && nextCursor ? (
              <ActionButton
                label="Load more guests"
                onPress={() => setRequestedCursor(nextCursor)}
                style={styles.loadMore}
                variant="secondary"
              />
            ) : null
          }
          onEndReached={() => {
            if (!isPageDone && nextCursor && guestPage !== undefined) {
              setRequestedCursor(nextCursor);
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => (
            <Pressable
              accessibilityHint={
                selectedWorkspace?.capabilities.canEditGuests
                  ? "Opens guest details and controls"
                  : "Opens read-only guest details"
              }
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/guest/[rsvpId]",
                  params: { rsvpId: item.rsvpId },
                })
              }
              style={({ pressed }) => [
                styles.guestRow,
                pressed && styles.pressed,
              ]}
            >
              <ThresholdMark
                color={
                  item.entryStatus === "checked_in"
                    ? colors.success
                    : colors.rule
                }
                height={44}
              />
              <View style={styles.guestText}>
                <Text numberOfLines={1} style={styles.guestName}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={styles.guestMeta}>
                  {item.listKey} · {item.attendees}{" "}
                  {item.attendees === 1 ? "guest" : "guests"}
                </Text>
              </View>
              <View style={styles.guestStatuses}>
                <StatusPill
                  label={item.approvalStatus}
                  tone={approvalTone(item.approvalStatus)}
                />
                <StatusPill
                  label={
                    item.entryStatus === "checked_in"
                      ? "inside"
                      : item.ticketStatus
                  }
                  tone={
                    item.entryStatus === "checked_in" ? "admit" : "neutral"
                  }
                />
              </View>
            </Pressable>
          )}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  controls: {
    gap: spacing.medium,
    paddingBottom: spacing.medium,
  },
  exportButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.65,
  },
  search: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.small,
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.medium,
    backgroundColor: colors.booth,
    paddingHorizontal: spacing.medium,
  },
  searchInput: {
    flex: 1,
    color: colors.paper,
    fontFamily: typography.regular,
    fontSize: 15,
  },
  offlineBanner: {
    borderLeftColor: colors.warning,
    borderLeftWidth: 3,
    backgroundColor: colors.booth,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  offlineText: {
    color: colors.warning,
    fontFamily: typography.mono,
    fontSize: 10,
    letterSpacing: 0.55,
  },
  exportError: {
    color: colors.failure,
    fontFamily: typography.medium,
    fontSize: 13,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: spacing.huge,
  },
  emptyList: {
    flexGrow: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.rule,
  },
  guestRow: {
    height: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.medium,
  },
  guestText: {
    flex: 1,
    gap: 3,
  },
  guestName: {
    color: colors.paper,
    fontFamily: typography.medium,
    fontSize: 16,
  },
  guestMeta: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 12,
  },
  guestStatuses: {
    alignItems: "flex-end",
    gap: spacing.extraSmall,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.small,
  },
  emptyTitle: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 19,
  },
  emptyMessage: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 14,
  },
  loadMore: {
    marginTop: spacing.large,
  },
});

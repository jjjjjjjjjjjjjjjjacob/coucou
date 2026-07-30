import { useAuth, useOrganizationList } from "@clerk/expo";
import { api } from "@coucou/backend/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useConvexAuth, useQuery } from "convex/react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { purgeAllGuestSnapshots, purgeWorkspaceGuestSnapshots } from "@/lib/cache";
import { chooseDefaultEvent } from "@/lib/event-selection";
import type { StaffEventSummary, StaffWorkspace } from "@/types";

const LAST_WORKSPACE_KEY = "coucou-staff:last-workspace";
const LAST_EVENT_KEY_PREFIX = "coucou-staff:last-event:";

interface StaffSessionContextValue {
  workspaces: StaffWorkspace[];
  events: StaffEventSummary[];
  selectedWorkspace: StaffWorkspace | undefined;
  selectedEvent: StaffEventSummary | undefined;
  isLoading: boolean;
  isSwitchingWorkspace: boolean;
  selectWorkspace: (workspace: StaffWorkspace) => Promise<void>;
  selectEvent: (event: StaffEventSummary) => Promise<void>;
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null);

export function StaffSessionProvider({ children }: PropsWithChildren): React.JSX.Element {
  const { isSignedIn, orgId } = useAuth();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const organizationList = useOrganizationList();
  const bootstrap = useQuery(api.mobileStaff.getBootstrap, isAuthenticated ? {} : "skip");
  const [selectedWorkspace, setSelectedWorkspace] = useState<StaffWorkspace | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<StaffEventSummary | undefined>();
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);

  const workspaceTokenIsActive =
    bootstrap?.platformOverride === true || selectedWorkspace?.clerkOrganizationId === orgId;
  const eventsResult = useQuery(
    api.mobileStaff.listEvents,
    selectedWorkspace && workspaceTokenIsActive
      ? {
          siteKey: selectedWorkspace.siteKey,
          workspaceSlug: selectedWorkspace.workspaceSlug,
        }
      : "skip",
  );
  const events = eventsResult ?? [];

  const selectWorkspace = useCallback(
    async (workspace: StaffWorkspace): Promise<void> => {
      setIsSwitchingWorkspace(true);
      try {
        if (bootstrap?.platformOverride !== true && orgId !== workspace.clerkOrganizationId) {
          if (!organizationList.isLoaded) {
            throw new Error("Organizations are still loading.");
          }
          await organizationList.setActive({
            organization: workspace.clerkOrganizationId,
          });
        }
        setSelectedEvent(undefined);
        setSelectedWorkspace(workspace);
        await AsyncStorage.setItem(LAST_WORKSPACE_KEY, workspace.workspaceId);
      } finally {
        setIsSwitchingWorkspace(false);
      }
    },
    [bootstrap?.platformOverride, orgId, organizationList],
  );

  const selectEvent = useCallback(
    async (event: StaffEventSummary): Promise<void> => {
      setSelectedEvent(event);
      if (selectedWorkspace) {
        await AsyncStorage.setItem(
          `${LAST_EVENT_KEY_PREFIX}${selectedWorkspace.workspaceId}`,
          event.eventId,
        );
      }
    },
    [selectedWorkspace],
  );

  useEffect(() => {
    if (isSignedIn !== false) {
      return;
    }
    setSelectedWorkspace(undefined);
    setSelectedEvent(undefined);
    void purgeAllGuestSnapshots();
  }, [isSignedIn]);

  useEffect(() => {
    if (!bootstrap || selectedWorkspace) {
      return;
    }

    let isCancelled = false;
    void (async () => {
      const accessibleWorkspaceIds = new Set(
        bootstrap.workspaces.map((workspace) => workspace.workspaceId),
      );
      await purgeWorkspaceGuestSnapshots(accessibleWorkspaceIds);
      const lastWorkspaceId = await AsyncStorage.getItem(LAST_WORKSPACE_KEY);
      const initialWorkspace =
        bootstrap.workspaces.find((workspace) => workspace.workspaceId === lastWorkspaceId) ??
        bootstrap.workspaces[0];
      if (!isCancelled && initialWorkspace) {
        await selectWorkspace(initialWorkspace);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [bootstrap, selectWorkspace, selectedWorkspace]);

  useEffect(() => {
    if (
      !bootstrap ||
      !selectedWorkspace ||
      bootstrap.workspaces.some(
        (workspace) => workspace.workspaceId === selectedWorkspace.workspaceId,
      )
    ) {
      return;
    }
    setSelectedWorkspace(undefined);
    setSelectedEvent(undefined);
    void purgeWorkspaceGuestSnapshots(
      new Set(bootstrap.workspaces.map((workspace) => workspace.workspaceId)),
    );
  }, [bootstrap, selectedWorkspace]);

  useEffect(() => {
    if (
      !selectedEvent ||
      eventsResult === undefined ||
      events.some((event) => event.eventId === selectedEvent.eventId)
    ) {
      return;
    }
    setSelectedEvent(undefined);
  }, [events, eventsResult, selectedEvent]);

  useEffect(() => {
    if (!selectedWorkspace || selectedEvent || events.length === 0) {
      return;
    }

    let isCancelled = false;
    void (async () => {
      const lastEventId = await AsyncStorage.getItem(
        `${LAST_EVENT_KEY_PREFIX}${selectedWorkspace.workspaceId}`,
      );
      const initialEvent =
        events.find((event) => event.eventId === lastEventId) ?? chooseDefaultEvent(events);
      if (!isCancelled && initialEvent) {
        await selectEvent(initialEvent);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [events, selectEvent, selectedEvent, selectedWorkspace]);

  const contextValue = useMemo<StaffSessionContextValue>(
    () => ({
      workspaces: bootstrap?.workspaces ?? [],
      events,
      selectedWorkspace,
      selectedEvent,
      isLoading:
        isConvexAuthLoading ||
        (isAuthenticated && bootstrap === undefined) ||
        Boolean(selectedWorkspace && workspaceTokenIsActive && eventsResult === undefined),
      isSwitchingWorkspace,
      selectWorkspace,
      selectEvent,
    }),
    [
      bootstrap,
      events,
      eventsResult,
      isAuthenticated,
      isConvexAuthLoading,
      isSwitchingWorkspace,
      selectEvent,
      selectWorkspace,
      selectedEvent,
      selectedWorkspace,
      workspaceTokenIsActive,
    ],
  );

  return (
    <StaffSessionContext.Provider value={contextValue}>{children}</StaffSessionContext.Provider>
  );
}

export function useStaffSession(): StaffSessionContextValue {
  const contextValue = useContext(StaffSessionContext);
  if (!contextValue) {
    throw new Error("useStaffSession must be used within StaffSessionProvider.");
  }
  return contextValue;
}

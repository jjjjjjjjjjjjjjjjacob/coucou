"use client";

import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import * as React from "react";

import { DashboardTitleBar, type DashboardTitleBarProps } from "@/components/dashboard-title-bar";
import { PropertyPanel } from "@/components/property-panel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface EventDetailLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  titleBarProps: DashboardTitleBarProps;
  children: React.ReactNode;
  propertyPanel: React.ReactNode;
  preferenceQueryArgs?: { siteKey?: string; workspaceSlug?: string };
  defaultPanelOpen?: boolean;
}

const EVENT_DETAILS_PANEL_PREFERENCE_KEY = "event-details";

export function EventDetailLayout({
  titleBarProps,
  children,
  propertyPanel,
  preferenceQueryArgs,
  defaultPanelOpen = false,
  className,
  ...props
}: EventDetailLayoutProps) {
  const [isPanelOpen, setIsPanelOpen] = React.useState(defaultPanelOpen);
  const panelOpenState = React.useRef(defaultPanelOpen);
  const hasPendingPanelPreferenceChange = React.useRef(false);
  const savedPanelPreference = useQuery(
    api.dashboardPreferences.getCurrentUserPanelPreference,
    preferenceQueryArgs
      ? {
          ...preferenceQueryArgs,
          panelKey: EVENT_DETAILS_PANEL_PREFERENCE_KEY,
        }
      : "skip",
  );
  const savePanelPreference = useMutation(
    api.dashboardPreferences.upsertCurrentUserPanelPreference,
  );
  const titleBarActions = titleBarProps.actions || titleBarProps.action;

  React.useEffect(() => {
    if (
      savedPanelPreference === undefined ||
      (savedPanelPreference !== null && typeof savedPanelPreference !== "boolean")
    ) {
      return;
    }

    if (hasPendingPanelPreferenceChange.current) {
      if (savedPanelPreference === panelOpenState.current) {
        hasPendingPanelPreferenceChange.current = false;
      }
      return;
    }

    const nextPanelOpenState = savedPanelPreference ?? defaultPanelOpen;
    panelOpenState.current = nextPanelOpenState;
    setIsPanelOpen(nextPanelOpenState);
  }, [defaultPanelOpen, savedPanelPreference]);

  const togglePanel = React.useCallback(() => {
    const previousPanelOpenState = panelOpenState.current;
    const nextPanelOpenState = !previousPanelOpenState;

    panelOpenState.current = nextPanelOpenState;
    setIsPanelOpen(nextPanelOpenState);

    if (!preferenceQueryArgs) {
      return;
    }

    hasPendingPanelPreferenceChange.current = true;
    void savePanelPreference({
      ...preferenceQueryArgs,
      panelKey: EVENT_DETAILS_PANEL_PREFERENCE_KEY,
      isOpen: nextPanelOpenState,
    }).catch(() => {
      hasPendingPanelPreferenceChange.current = false;
      panelOpenState.current = previousPanelOpenState;
      setIsPanelOpen(previousPanelOpenState);
    });
  }, [preferenceQueryArgs, savePanelPreference]);

  const toggleButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 border-[var(--border-subtle)] bg-transparent"
          onClick={togglePanel}
          aria-label={isPanelOpen ? "Hide event details" : "Show event details"}
          aria-pressed={isPanelOpen}
        >
          {isPanelOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={6}>
        {isPanelOpen ? "Hide details" : "Show details"}
      </TooltipContent>
    </Tooltip>
  );

  const titleBarControls = (
    <div className="flex flex-col items-end gap-2">
      {titleBarActions}
      {toggleButton}
    </div>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} {...props}>
      <DashboardTitleBar
        {...titleBarProps}
        action={undefined}
        actions={titleBarControls}
        secondaryAction={undefined}
        secondaryActions={undefined}
        className={cn("shrink-0", titleBarProps.className)}
      />

      {/* One scroll section for the whole page so the bottom inset stays visible;
          the details panel sticks at lg+ and keeps its own scroll section. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row">
        <div className="min-w-0 flex-1 pb-6 lg:pr-6">{children}</div>
        {isPanelOpen ? (
          <PropertyPanel className="mt-8 lg:sticky lg:top-0 lg:mt-0 lg:max-h-full lg:self-start">
            {propertyPanel}
          </PropertyPanel>
        ) : null}
      </div>
    </div>
  );
}

export default EventDetailLayout;

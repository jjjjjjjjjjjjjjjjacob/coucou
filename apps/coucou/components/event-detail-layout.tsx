"use client";

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
  defaultPanelOpen?: boolean;
}

export function EventDetailLayout({
  titleBarProps,
  children,
  propertyPanel,
  defaultPanelOpen = true,
  className,
  ...props
}: EventDetailLayoutProps) {
  const [isPanelOpen, setIsPanelOpen] = React.useState(defaultPanelOpen);
  const titleBarActions = titleBarProps.actions || titleBarProps.action;

  const toggleButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 border-[var(--border-subtle)] bg-transparent"
          onClick={() => setIsPanelOpen((value) => !value)}
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

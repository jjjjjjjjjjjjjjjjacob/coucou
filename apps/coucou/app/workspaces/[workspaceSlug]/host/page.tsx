"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, DoorOpen, Users } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PageCard } from "@/components/ui/page-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RecentActivityEntry } from "@/lib/types";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";

const QUICK_ACTIONS = [
  { title: "Events", href: "events", icon: CalendarDays },
  { title: "RSVPs", href: "rsvps", icon: Users },
  { title: "Door Scan", href: "/door/scan", icon: DoorOpen, isAbsolute: true },
];

function resolveQuickHref(base: string, workspaceSlug: string): string {
  if (base.startsWith("/")) return base;
  return `/workspaces/${workspaceSlug}/host/${base}`;
}

export default function HostDashboard() {
  const { isSignedIn } = useAuth();
  const workspaceScope = useWorkspaceScope();
  const queryArgs = workspaceScope?.queryArgs ?? {};
  const dashboardStatsQuery = useQuery({
    ...convexQuery(api.dashboard.getDashboardStats, queryArgs),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const dashboardStats = dashboardStatsQuery.data;

  const rsvpTrendsQuery = useQuery({
    ...convexQuery(api.dashboard.getRsvpTrends, queryArgs),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const rsvpTrends = rsvpTrendsQuery.data;

  const eventPerformanceQuery = useQuery({
    ...convexQuery(api.dashboard.getEventPerformance, queryArgs),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const eventPerformance = eventPerformanceQuery.data;

  const recentActivityQuery = useQuery({
    ...convexQuery(api.dashboard.getRecentActivity, queryArgs),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const recentActivity = recentActivityQuery.data as RecentActivityEntry[] | undefined;

  const rsvpsPath = useWorkspaceOperationPath("host", "rsvps");

  if (!workspaceScope || !dashboardStats) {
    return <DashboardSkeleton />;
  }

  const chartConfig = {
    rsvps: {
      label: "RSVPs",
      color: "hsl(var(--primary))",
    },
  };

  const eventChartConfig = {
    totalRsvps: {
      label: "Total RSVPs",
      color: "hsl(var(--primary))",
    },
    approvedRsvps: {
      label: "Approved",
      color: "hsl(var(--chart-2))",
    },
    redeemedTickets: {
      label: "Redeemed",
      color: "hsl(var(--chart-3))",
    },
  };

  const quickActions = QUICK_ACTIONS.map((action) => ({
    ...action,
    href: action.isAbsolute
      ? action.href
      : resolveQuickHref(action.href, workspaceScope.workspaceSlug),
  }));

  return (
    <div className="flex-1 space-y-6">
      <DashboardTitleBar
        title="Overview"
        subtitle="A quick look at your events and guests."
        breadcrumb={[{ label: "Workspace" }, { label: "Overview" }]}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {quickActions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="group flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--surface-3)]"
          >
            <action.icon className="h-5 w-5 text-[var(--text-secondary)]" />
            <span className="text-sm font-medium text-[var(--text-primary)]">{action.title}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PageCard title="Total Events" description="Events created">
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.totalEvents}
          </div>
        </PageCard>
        <PageCard title="Total RSVPs" description="Guests across all events">
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.totalRsvps}
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {dashboardStats.rsvpTrend >= 0 ? "+" : ""}
            {dashboardStats.rsvpTrend}% from last month
          </p>
        </PageCard>
        <PageCard title="Approval Rate" description="RSVPs approved">
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.approvalRate}%
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {dashboardStats.approvedRsvps} of {dashboardStats.totalRsvps} approved
          </p>
        </PageCard>
        <PageCard title="Redemption Rate" description="Tickets redeemed">
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.redemptionRate}%
          </div>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {dashboardStats.redeemedTickets} tickets redeemed
          </p>
        </PageCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <PageCard
          title="RSVP Trends"
          description="Daily submissions over the last 30 days"
          className="col-span-4"
        >
          <div className="min-h-[16rem]">
            <ChartContainer config={chartConfig}>
              <AreaChart
                accessibilityLayer
                data={rsvpTrends || []}
                margin={{ left: 12, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis domain={[0, "dataMax"]} tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Area
                  dataKey="rsvps"
                  type="natural"
                  fill="var(--color-rsvps)"
                  fillOpacity={0.4}
                  stroke="var(--color-rsvps)"
                  stackId="a"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </PageCard>

        <PageCard
          title="Recent Activity"
          description="Latest RSVPs from the past week"
          className="col-span-3"
          action={
            <Link
              href={rsvpsPath}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              View all
            </Link>
          }
        >
          <div className="space-y-3">
            {recentActivity?.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {activity.guestName}
                  </p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">
                    {activity.eventName}
                  </p>
                </div>
                <StatusBadge
                  variant={
                    activity.status === "approved"
                      ? "approved"
                      : activity.status === "denied"
                        ? "denied"
                        : "pending"
                  }
                  label={activity.status}
                />
              </div>
            )) || <p className="text-sm text-[var(--text-secondary)]">No recent activity</p>}
          </div>
        </PageCard>
      </div>

      <PageCard title="Event Performance" description="RSVP breakdown by event (last 10 events)">
        <div className="min-h-[20rem]">
          <ChartContainer config={eventChartConfig}>
            <BarChart
              accessibilityLayer
              data={eventPerformance || []}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="eventName"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="totalRsvps" fill="var(--color-totalRsvps)" radius={[0, 0, 4, 4]} />
              <Bar
                dataKey="approvedRsvps"
                fill="var(--color-approvedRsvps)"
                radius={[0, 0, 4, 4]}
              />
              <Bar
                dataKey="redeemedTickets"
                fill="var(--color-redeemedTickets)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>
      </PageCard>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-6">
      <div className="h-8 w-40 animate-pulse rounded bg-[var(--surface-3)]" />
      <div className="h-4 w-64 animate-pulse rounded bg-[var(--surface-3)]" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 h-80 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        <div className="col-span-3 h-80 animate-pulse rounded-lg bg-[var(--surface-3)]" />
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, Users, TrendingUp, TicketCheck } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { navigationItems, quickActions } from "@/components/app-sidebar";
import Link from "next/link";
import type { RecentActivityEntry } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import {
  buildWorkspaceOperationPath,
  type WorkspaceOperationSurface,
} from "@/lib/workspace-config";

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
  const recentActivity = recentActivityQuery.data as
    | RecentActivityEntry[]
    | undefined;

  if (!workspaceScope) {
    return <DashboardSkeleton />;
  }

  if (!dashboardStats) {
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

  const allQuickLinks = [...navigationItems, ...quickActions]
    .filter((item) => item.url !== "/host")
    .map((item) => {
      const match = item.url.match(/^\/(host|door)(?:\/(.*))?$/);
      if (!match) {
        return item;
      }

      return {
        ...item,
        url: buildWorkspaceOperationPath(
          workspaceScope.workspaceSlug,
          match[1] as WorkspaceOperationSurface,
          match[2] ?? "",
        ),
      };
    });

  return (
    <div className="flex-1 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your events and RSVPs
          </p>
        </div>
      </div>

      {/* Quick Links Section */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {allQuickLinks.map((item) => (
          <Link key={item.url} href={item.url}>
            <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50">
              <CardContent className="flex flex-col items-center justify-center p-4 text-center gap-2">
                <item.icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">{item.title}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.totalEvents}
            </div>
            <p className="text-xs text-muted-foreground">Events created</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total RSVPs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.totalRsvps}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.rsvpTrend >= 0 ? "+" : ""}
              {dashboardStats.rsvpTrend}% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.approvalRate}%
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.approvedRsvps} of {dashboardStats.totalRsvps}{" "}
              approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Redemption Rate
            </CardTitle>
            <TicketCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.redemptionRate}%
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.redeemedTickets} tickets redeemed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* RSVP Trends Chart */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>RSVP Trends</CardTitle>
            <CardDescription>
              Daily RSVP submissions over the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer config={chartConfig}>
              <AreaChart
                accessibilityLayer
                data={rsvpTrends || []}
                margin={{
                  left: 12,
                  right: 12,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, "dataMax"]}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
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
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest RSVPs from the past week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity?.slice(0, 5).map((activity) => (
                <div key={activity.id} className="flex items-center">
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {activity.guestName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {activity.eventName}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        activity.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : activity.status === "denied"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {activity.status}
                    </span>
                  </div>
                </div>
              )) || (
                <p className="text-sm text-muted-foreground">
                  No recent activity
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Event Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Event Performance</CardTitle>
          <CardDescription>
            RSVP breakdown by event (last 10 events)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={eventChartConfig}>
            <BarChart
              accessibilityLayer
              data={eventPerformance || []}
              margin={{
                left: 12,
                right: 12,
              }}
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
              <Bar
                dataKey="totalRsvps"
                fill="var(--color-totalRsvps)"
                radius={[0, 0, 4, 4]}
              />
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
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-2" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-24 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded animate-pulse" />
              <div className="h-3 w-32 bg-muted rounded animate-pulse mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded animate-pulse" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-16 bg-muted rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

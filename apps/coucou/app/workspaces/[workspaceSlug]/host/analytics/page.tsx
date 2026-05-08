"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MessageSquare,
  TicketCheck,
  TrendingUp,
  UserCheck,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

export default function AnalyticsPage() {
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
  const smsStatsQuery = useQuery({
    ...convexQuery(api.dashboard.getSmsStats, queryArgs),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const smsStats = smsStatsQuery.data;
  const smsTrendsQuery = useQuery({
    ...convexQuery(api.dashboard.getSmsTrends, queryArgs),
    enabled: !!isSignedIn && !!workspaceScope,
  });
  const smsTrends = smsTrendsQuery.data;
  if (!dashboardStats) {
    return <AnalyticsSkeleton />;
  }

  // Prepare pie chart data for approval status
  const approvalStatusData = [
    {
      name: "Approved",
      value: dashboardStats.approvedRsvps,
      color: "hsl(var(--chart-2))",
    },
    {
      name: "Pending",
      value: dashboardStats.pendingRsvps,
      color: "hsl(var(--primary))",
    },
    {
      name: "Denied",
      value: dashboardStats.deniedRsvps,
      color: "hsl(var(--chart-3))",
    },
  ];

  // Prepare pie chart data for ticket status
  const ticketStatusData = [
    {
      name: "Redeemed",
      value: dashboardStats.redeemedTickets,
      color: "hsl(var(--chart-2))",
    },
    {
      name: "Issued",
      value: dashboardStats.issuedTickets,
      color: "hsl(var(--primary))",
    },
    {
      name: "Not Issued",
      value:
        dashboardStats.totalRsvps - dashboardStats.redeemedTickets - dashboardStats.issuedTickets,
      color: "hsl(var(--chart-3))",
    },
  ].filter((item) => item.value > 0);

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

  const smsChartConfig = {
    sent: {
      label: "Sent",
      color: "hsl(var(--chart-2))",
    },
    failed: {
      label: "Failed",
      color: "hsl(var(--chart-3))",
    },
    total: {
      label: "Total",
      color: "hsl(var(--primary))",
    },
  };

  // Prepare SMS status distribution data
  const smsStatusData = smsStats
    ? [
        {
          name: "Sent",
          value: smsStats.sentSms,
          color: "hsl(var(--chart-2))",
        },
        {
          name: "Failed",
          value: smsStats.failedSms,
          color: "hsl(var(--chart-3))",
        },
        {
          name: "Pending",
          value: smsStats.pendingSms,
          color: "hsl(var(--primary))",
        },
      ].filter((item) => item.value > 0)
    : [];

  return (
    <div className="flex-1 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
          <p className="text-muted-foreground">
            Detailed insights into your events and guest engagement
          </p>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.totalRsvps > 0
                ? Math.round((dashboardStats.approvedRsvps / dashboardStats.totalRsvps) * 100)
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">RSVPs to approvals</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg RSVPs/Event</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.totalEvents > 0
                ? Math.round(dashboardStats.totalRsvps / dashboardStats.totalEvents)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">Average guest interest</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Show-up Rate</CardTitle>
            <TicketCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardStats.issuedTickets + dashboardStats.redeemedTickets > 0
                ? Math.round(
                    (dashboardStats.redeemedTickets /
                      (dashboardStats.issuedTickets + dashboardStats.redeemedTickets)) *
                      100,
                  )
                : 0}
              %
            </div>
            <p className="text-xs text-muted-foreground">Tickets redeemed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardStats.recentRsvps}</div>
            <p className="text-xs text-muted-foreground">RSVPs this month</p>
          </CardContent>
        </Card>
      </div>

      {/* SMS Metrics Grid */}
      {smsStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SMS Success Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{smsStats.successRate}%</div>
              <p className="text-xs text-muted-foreground">Messages successfully sent</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total SMS Sent</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{smsStats.totalSms}</div>
              <p className="text-xs text-muted-foreground">All time messages sent</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed SMS</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{smsStats.failedSms}</div>
              <p className="text-xs text-muted-foreground">Messages that failed to send</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent SMS</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{smsStats.recentSms}</div>
              <p className="text-xs text-muted-foreground">Messages this month</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* RSVP Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>RSVP Status Distribution</CardTitle>
            <CardDescription>Breakdown of approval status across all events</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={approvalStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {approvalStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ticket Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Ticket Status Distribution</CardTitle>
            <CardDescription>Current status of all issued tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ticketStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  dataKey="value"
                >
                  {ticketStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* RSVP Trends */}
      <Card>
        <CardHeader>
          <CardTitle>RSVP Trends Over Time</CardTitle>
          <CardDescription>Daily RSVP submissions over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Event Performance Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Event Performance Comparison</CardTitle>
          <CardDescription>Compare RSVP metrics across your recent events</CardDescription>
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
              <YAxis domain={[0, "dataMax"]} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="totalRsvps"
                fill="var(--color-totalRsvps)"
                radius={[0, 0, 4, 4]}
                name="Total RSVPs"
              />
              <Bar
                dataKey="approvedRsvps"
                fill="var(--color-approvedRsvps)"
                radius={[0, 0, 4, 4]}
                name="Approved"
              />
              <Bar
                dataKey="redeemedTickets"
                fill="var(--color-redeemedTickets)"
                radius={[4, 4, 0, 0]}
                name="Redeemed"
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* SMS Charts Section */}
      {smsStats && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {/* SMS Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>SMS Status Distribution</CardTitle>
                <CardDescription>
                  Breakdown of SMS delivery status across all messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={smsStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {smsStatusData.map((entry, index) => (
                        <Cell key={`sms-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* SMS Trends */}
            <Card>
              <CardHeader>
                <CardTitle>SMS Trends Over Time</CardTitle>
                <CardDescription>Daily SMS sent/failed over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={smsChartConfig}>
                  <AreaChart
                    accessibilityLayer
                    data={smsTrends || []}
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
                    <YAxis domain={[0, "dataMax"]} tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Area
                      dataKey="sent"
                      type="natural"
                      fill="var(--color-sent)"
                      fillOpacity={0.4}
                      stroke="var(--color-sent)"
                      stackId="a"
                    />
                    <Area
                      dataKey="failed"
                      type="natural"
                      fill="var(--color-failed)"
                      fillOpacity={0.4}
                      stroke="var(--color-failed)"
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function AnalyticsSkeleton() {
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

      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

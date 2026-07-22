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
  type PieLabelRenderProps,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PageCard } from "@/components/ui/page-card";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

interface StatusChartDatum extends Record<string, string | number> {
  name: string;
  value: number;
  color: string;
}

function renderPieLabel({ name, percent, x, y, textAnchor }: PieLabelRenderProps) {
  return (
    <text
      x={x}
      y={y}
      fill="var(--text-primary)"
      textAnchor={textAnchor}
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  );
}

function StatusPieChart({ data, description }: { data: StatusChartDatum[]; description: string }) {
  return (
    <div role="img" aria-label={description} className="min-h-[16rem]">
      <ResponsiveContainer width="100%" height={300}>
        <PieChart accessibilityLayer>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            label={renderPieLabel}
            outerRadius={80}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <ChartTooltip
            contentStyle={{
              backgroundColor: "var(--surface-2)",
              borderColor: "var(--border-strong)",
              borderRadius: "var(--radius)",
              color: "var(--text-primary)",
            }}
            itemStyle={{ color: "var(--text-primary)" }}
            labelStyle={{ color: "var(--text-primary)" }}
          />
          <Legend
            formatter={(value) => <span style={{ color: "var(--text-primary)" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

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

  const approvalStatusData = [
    { name: "Approved", value: dashboardStats.approvedRsvps, color: "var(--chart-2)" },
    { name: "Pending", value: dashboardStats.pendingRsvps, color: "var(--chart-4)" },
    { name: "Denied", value: dashboardStats.deniedRsvps, color: "var(--chart-5)" },
  ];

  const ticketStatusData = [
    { name: "Redeemed", value: dashboardStats.redeemedTickets, color: "var(--chart-2)" },
    { name: "Issued", value: dashboardStats.issuedTickets, color: "var(--chart-1)" },
    {
      name: "Not Issued",
      value:
        dashboardStats.totalRsvps - dashboardStats.redeemedTickets - dashboardStats.issuedTickets,
      color: "var(--chart-4)",
    },
  ].filter((item) => item.value > 0);

  const chartConfig = { rsvps: { label: "RSVPs", color: "var(--chart-1)" } };
  const eventChartConfig = {
    totalRsvps: { label: "Total RSVPs", color: "var(--chart-1)" },
    approvedRsvps: { label: "Approved", color: "var(--chart-2)" },
    redeemedTickets: { label: "Redeemed", color: "var(--chart-4)" },
  };
  const smsChartConfig = {
    sent: { label: "Sent", color: "var(--chart-2)" },
    failed: { label: "Failed", color: "var(--chart-5)" },
    total: { label: "Total", color: "var(--chart-1)" },
  };

  const smsStatusData = smsStats
    ? [
        { name: "Sent", value: smsStats.sentSms, color: "var(--chart-2)" },
        { name: "Failed", value: smsStats.failedSms, color: "var(--chart-5)" },
        { name: "Pending", value: smsStats.pendingSms, color: "var(--chart-4)" },
      ].filter((item) => item.value > 0)
    : [];

  return (
    <div className="flex-1 space-y-6">
      <DashboardTitleBar
        title="Analytics"
        subtitle="Detailed insights into your events and guest engagement"
        breadcrumb={[{ label: "Workspace" }]}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PageCard
          title="Conversion Rate"
          description="RSVPs to approvals"
          action={<UserCheck className="h-4 w-4 text-[var(--text-secondary)]" />}
        >
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.totalRsvps > 0
              ? Math.round((dashboardStats.approvedRsvps / dashboardStats.totalRsvps) * 100)
              : 0}
            %
          </div>
        </PageCard>
        <PageCard
          title="Avg RSVPs/Event"
          description="Average guest interest"
          action={<CalendarDays className="h-4 w-4 text-[var(--text-secondary)]" />}
        >
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.totalEvents > 0
              ? Math.round(dashboardStats.totalRsvps / dashboardStats.totalEvents)
              : 0}
          </div>
        </PageCard>
        <PageCard
          title="Show-up Rate"
          description="Tickets redeemed"
          action={<TicketCheck className="h-4 w-4 text-[var(--text-secondary)]" />}
        >
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.issuedTickets + dashboardStats.redeemedTickets > 0
              ? Math.round(
                  (dashboardStats.redeemedTickets /
                    (dashboardStats.issuedTickets + dashboardStats.redeemedTickets)) *
                    100,
                )
              : 0}
            %
          </div>
        </PageCard>
        <PageCard
          title="Recent Activity"
          description="RSVPs this month"
          action={<Clock className="h-4 w-4 text-[var(--text-secondary)]" />}
        >
          <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {dashboardStats.recentRsvps}
          </div>
        </PageCard>
      </div>

      {smsStats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <PageCard
            title="SMS Success Rate"
            description="Messages successfully sent"
            action={<CheckCircle2 className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {smsStats.successRate}%
            </div>
          </PageCard>
          <PageCard
            title="Total SMS Sent"
            description="All time messages sent"
            action={<MessageSquare className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {smsStats.totalSms}
            </div>
          </PageCard>
          <PageCard
            title="Failed SMS"
            description="Messages that failed to send"
            action={<XCircle className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {smsStats.failedSms}
            </div>
          </PageCard>
          <PageCard
            title="Recent SMS"
            description="Messages this month"
            action={<TrendingUp className="h-4 w-4 text-[var(--text-secondary)]" />}
          >
            <div className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {smsStats.recentSms}
            </div>
          </PageCard>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <PageCard
          title="RSVP Status Distribution"
          description="Breakdown of approval status across all events"
        >
          <StatusPieChart
            data={approvalStatusData}
            description="RSVP status distribution showing approved, pending, and denied responses"
          />
        </PageCard>

        <PageCard
          title="Ticket Status Distribution"
          description="Current status of all issued tickets"
        >
          <StatusPieChart
            data={ticketStatusData}
            description="Ticket status distribution showing redeemed, issued, and not issued tickets"
          />
        </PageCard>
      </div>

      <PageCard
        title="RSVP Trends Over Time"
        description="Daily RSVP submissions over the last 30 days"
      >
        <div className="min-h-[16rem]">
          <ChartContainer config={chartConfig}>
            <AreaChart accessibilityLayer data={rsvpTrends || []} margin={{ left: 12, right: 12 }}>
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
        title="Event Performance Comparison"
        description="Compare RSVP metrics across your recent events"
      >
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
        </div>
      </PageCard>

      {smsStats ? (
        <div className="grid gap-4 md:grid-cols-2">
          <PageCard
            title="SMS Status Distribution"
            description="Breakdown of SMS delivery status across all messages"
          >
            <StatusPieChart
              data={smsStatusData}
              description="SMS delivery status distribution showing sent, failed, and pending messages"
            />
          </PageCard>

          <PageCard
            title="SMS Trends Over Time"
            description="Daily SMS sent/failed over the last 30 days"
          >
            <div className="min-h-[16rem]">
              <ChartContainer config={smsChartConfig}>
                <AreaChart
                  accessibilityLayer
                  data={smsTrends || []}
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
            </div>
          </PageCard>
        </div>
      ) : null}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex-1 space-y-6">
      <div className="h-8 w-32 animate-pulse rounded bg-[var(--surface-3)]" />
      <div className="h-4 w-48 animate-pulse rounded bg-[var(--surface-3)]" />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(2)].map((_, index) => (
          <div key={index} className="h-80 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ))}
      </div>

      <div className="grid gap-4">
        {[...Array(2)].map((_, index) => (
          <div key={index} className="h-80 animate-pulse rounded-lg bg-[var(--surface-3)]" />
        ))}
      </div>
    </div>
  );
}

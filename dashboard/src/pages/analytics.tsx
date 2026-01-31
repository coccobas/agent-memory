import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useToolStats,
  useSubagentStats,
  useNotificationStats,
  useDashboardAnalytics,
} from "@/api/hooks";
import type { ToolStatEntry, SubagentStatEntry } from "@/api/types";
import { Loader2, Activity, AlertTriangle, CheckCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const COLORS = {
  success: "#22c55e",
  failure: "#ef4444",
  partial: "#f59e0b",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

function LoadingCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[250px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center h-[250px]">
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolStatsChart() {
  const { data, isLoading, error } = useToolStats("week");

  if (isLoading) return <LoadingCard title="Tool Executions" />;
  if (error)
    return <ErrorCard title="Tool Executions" message="Failed to load" />;
  if (!data?.byTool?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tool Executions</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-muted-foreground">
          No tool execution data available
        </CardContent>
      </Card>
    );
  }

  const chartData = data.byTool.slice(0, 10).map((t: ToolStatEntry) => ({
    name: t.toolName.replace(/^memory_/, "").slice(0, 15),
    success: t.successCount,
    failure: t.failureCount,
    partial: t.partialCount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tool Executions (Top 10)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} layout="vertical">
            <XAxis type="number" stroke="#888888" fontSize={12} />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#888888"
              fontSize={11}
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
              }}
            />
            <Legend />
            <Bar
              dataKey="success"
              stackId="a"
              fill={COLORS.success}
              name="Success"
            />
            <Bar
              dataKey="partial"
              stackId="a"
              fill={COLORS.partial}
              name="Partial"
            />
            <Bar
              dataKey="failure"
              stackId="a"
              fill={COLORS.failure}
              name="Failure"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function NotificationsPieChart() {
  const { data, isLoading, error } = useNotificationStats("week");

  if (isLoading) return <LoadingCard title="Notifications by Severity" />;
  if (error)
    return (
      <ErrorCard title="Notifications by Severity" message="Failed to load" />
    );
  if (!data?.totals?.total) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notifications by Severity</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-muted-foreground">
          No notification data available
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    { name: "Error", value: data.totals.error, color: COLORS.error },
    { name: "Warning", value: data.totals.warning, color: COLORS.warning },
    { name: "Info", value: data.totals.info, color: COLORS.info },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notifications by Severity</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function SubagentStatsChart() {
  const { data, isLoading, error } = useSubagentStats("week");

  if (isLoading) return <LoadingCard title="Subagent Invocations" />;
  if (error)
    return <ErrorCard title="Subagent Invocations" message="Failed to load" />;
  if (!data?.bySubagent?.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subagent Invocations</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px] text-muted-foreground">
          No subagent data available
        </CardContent>
      </Card>
    );
  }

  const chartData = data.bySubagent.map((s: SubagentStatEntry) => ({
    name: s.subagentType,
    invocations: s.totalInvocations,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Subagent Invocations</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} />
            <YAxis stroke="#888888" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
              }}
            />
            <Line
              type="monotone"
              dataKey="invocations"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function HealthScoreCard() {
  const { data, isLoading, error } = useDashboardAnalytics();

  if (isLoading) return <LoadingCard title="System Health" />;
  if (error)
    return <ErrorCard title="System Health" message="Failed to load" />;

  const health = data?.health;
  const score = health?.score ?? 0;
  const grade = health?.grade ?? "N/A";

  const getGradeColor = (g: string) => {
    if (g === "A" || g === "A+") return "text-green-500";
    if (g === "B" || g === "B+") return "text-blue-500";
    if (g === "C" || g === "C+") return "text-yellow-500";
    if (g === "D" || g === "D+") return "text-orange-500";
    return "text-red-500";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">System Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center h-[250px]">
        <div className={`text-6xl font-bold ${getGradeColor(grade)}`}>
          {grade}
        </div>
        <div className="mt-2 text-2xl text-muted-foreground">{score}%</div>
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          {score >= 80 ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-500" />
              System is healthy
            </>
          ) : (
            <>
              <Activity className="h-4 w-4 text-yellow-500" />
              Needs attention
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Insights into tool usage, notifications, and system health
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ToolStatsChart />
        <NotificationsPieChart />
        <SubagentStatsChart />
        <HealthScoreCard />
      </div>
    </div>
  );
}

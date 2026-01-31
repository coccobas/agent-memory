import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useGuidelines,
  useKnowledge,
  useTools,
  useExperiences,
  useSessions,
} from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import {
  Loader2,
  BookOpen,
  Brain,
  Wrench,
  Sparkles,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface StatCardProps {
  title: string;
  value: number | undefined;
  icon: React.ReactNode;
  isLoading: boolean;
  color: string;
}

function StatCard({ title, value, icon, isLoading, color }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={color}>{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-3xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === "project" ? "project" : "global";
  const scopeId = scope.type === "project" ? scope.projectId : undefined;

  const guidelines = useGuidelines(scopeType, scopeId);
  const knowledge = useKnowledge(scopeType, scopeId);
  const tools = useTools(scopeType, scopeId);
  const experiences = useExperiences(scopeType, scopeId);
  const sessions = useSessions();

  const isLoading =
    guidelines.isLoading ||
    knowledge.isLoading ||
    tools.isLoading ||
    experiences.isLoading ||
    sessions.isLoading;

  const stats = [
    {
      title: "Guidelines",
      value: guidelines.data?.length,
      icon: <BookOpen className="h-5 w-5" />,
      color: "text-blue-500",
      isLoading: guidelines.isLoading,
    },
    {
      title: "Knowledge",
      value: knowledge.data?.length,
      icon: <Brain className="h-5 w-5" />,
      color: "text-purple-500",
      isLoading: knowledge.isLoading,
    },
    {
      title: "Tools",
      value: tools.data?.length,
      icon: <Wrench className="h-5 w-5" />,
      color: "text-green-500",
      isLoading: tools.isLoading,
    },
    {
      title: "Experiences",
      value: experiences.data?.length,
      icon: <Sparkles className="h-5 w-5" />,
      color: "text-orange-500",
      isLoading: experiences.isLoading,
    },
    {
      title: "Sessions",
      value: sessions.data?.length,
      icon: <Clock className="h-5 w-5" />,
      color: "text-cyan-500",
      isLoading: sessions.isLoading,
    },
  ];

  const chartData = [
    {
      name: "Guidelines",
      count: guidelines.data?.length ?? 0,
      color: "#3b82f6",
    },
    { name: "Knowledge", count: knowledge.data?.length ?? 0, color: "#a855f7" },
    { name: "Tools", count: tools.data?.length ?? 0, color: "#22c55e" },
    {
      name: "Experiences",
      count: experiences.data?.length ?? 0,
      color: "#f97316",
    },
    { name: "Sessions", count: sessions.data?.length ?? 0, color: "#06b6d4" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Agent Memory data
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Entry Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis
                  dataKey="name"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

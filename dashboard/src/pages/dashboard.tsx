import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useGuidelines,
  useKnowledge,
  useTools,
  useExperiences,
  useSessions,
} from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import { cn } from "@/lib/utils";
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
    <Card className="glass glass-hover animate-slide-up border-none overflow-hidden relative">
      <div className={cn("absolute top-0 left-0 w-1 h-full", color.replace("text-", "bg-"))} />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn("p-2 rounded-lg bg-muted/50", color)}>{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-3xl font-bold tracking-tight">{value ?? 0}</div>
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
      icon: <BookOpen className="h-4 w-4" />,
      color: "text-blue-400",
      isLoading: guidelines.isLoading,
    },
    {
      title: "Knowledge",
      value: knowledge.data?.length,
      icon: <Brain className="h-4 w-4" />,
      color: "text-purple-400",
      isLoading: knowledge.isLoading,
    },
    {
      title: "Tools",
      value: tools.data?.length,
      icon: <Wrench className="h-4 w-4" />,
      color: "text-green-400",
      isLoading: tools.isLoading,
    },
    {
      title: "Experiences",
      value: experiences.data?.length,
      icon: <Sparkles className="h-4 w-4" />,
      color: "text-orange-400",
      isLoading: experiences.isLoading,
    },
    {
      title: "Sessions",
      value: sessions.data?.length,
      icon: <Clock className="h-4 w-4" />,
      color: "text-cyan-400",
      isLoading: sessions.isLoading,
    },
  ];

  const chartData = [
    {
      name: "Guidelines",
      count: guidelines.data?.length ?? 0,
      color: "#60a5fa", // blue-400
    },
    { name: "Knowledge", count: knowledge.data?.length ?? 0, color: "#c084fc" }, // purple-400
    { name: "Tools", count: tools.data?.length ?? 0, color: "#4ade80" }, // green-400
    {
      name: "Experiences",
      count: experiences.data?.length ?? 0,
      color: "#fb923c", // orange-400
    },
    { name: "Sessions", count: sessions.data?.length ?? 0, color: "#22d3ee" }, // cyan-400
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Intelligent overview of your memory ecosystem
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Chart */}
      <Card className="glass border-none overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Entry Distribution</CardTitle>
          <p className="text-sm text-muted-foreground">Resource allocation across memory categories</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[350px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="h-[350px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#94a3b8" }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#94a3b8" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                    contentStyle={{
                      backgroundColor: "rgba(15, 15, 20, 0.9)",
                      backdropFilter: "blur(8px)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                    }}
                    labelStyle={{ color: "#ffffff", fontWeight: "600", marginBottom: "4px" }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

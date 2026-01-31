import { useState, useMemo, useEffect } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useLibrarianStatus,
  useLibrarianJobs,
  useLibrarianRecommendations,
  useLibrarianRecommendation,
  useApproveRecommendation,
  useRejectRecommendation,
  useSkipRecommendation,
  useRunMaintenance,
  useJobStatus,
} from "@/api/hooks";
import type { LibrarianJob, LibrarianRecommendation } from "@/api/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const jobStatusColors: Record<
  LibrarianJob["status"],
  "default" | "secondary" | "destructive" | "warning"
> = {
  pending: "secondary",
  running: "warning",
  completed: "default",
  failed: "destructive",
};

const recommendationStatusColors: Record<
  LibrarianRecommendation["status"],
  "default" | "secondary" | "destructive" | "warning"
> = {
  pending: "warning",
  approved: "default",
  rejected: "destructive",
  skipped: "secondary",
};

type TabType = "status" | "jobs" | "recommendations";

function StatusTab() {
  const { data: status, isLoading, error } = useLibrarianStatus();
  const runMaintenance = useRunMaintenance();

  if (isLoading) {
    return <div className="text-muted-foreground">Loading status...</div>;
  }

  if (error) {
    return (
      <div className="text-destructive">
        Error loading status: {error.message}
      </div>
    );
  }

  if (!status) {
    return <div className="text-muted-foreground">No status available</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Service Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={status.service.enabled ? "default" : "secondary"}>
              {status.service.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {status.service.pendingRecommendations}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scheduler
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={status.scheduler.running ? "default" : "secondary"}>
              {status.scheduler.running ? "Running" : "Stopped"}
            </Badge>
            {status.service.config.schedule && (
              <p className="text-xs text-muted-foreground mt-1">
                {status.service.config.schedule}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Maintenance</span>
            <button
              onClick={() => runMaintenance.mutate({})}
              disabled={runMaintenance.isPending}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {runMaintenance.isPending ? "Running..." : "Run Maintenance"}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                Session End Trigger:
              </span>
              <Badge
                variant={
                  status.service.config.triggerOnSessionEnd
                    ? "default"
                    : "secondary"
                }
              >
                {status.service.config.triggerOnSessionEnd
                  ? "Enabled"
                  : "Disabled"}
              </Badge>
            </div>

            {status.maintenanceJobs.running.length > 0 && (
              <div>
                <span className="text-muted-foreground">Running Jobs: </span>
                <span>{status.maintenanceJobs.running.length}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

const taskStatusColors: Record<
  string,
  "default" | "secondary" | "destructive" | "warning"
> = {
  pending: "secondary",
  running: "warning",
  completed: "default",
  failed: "destructive",
  skipped: "secondary",
};

interface JobDetailProps {
  job: LibrarianJob;
}

function JobDetail({ job }: JobDetailProps) {
  const { data: liveJob } = useJobStatus(
    job.status === "running" || job.status === "pending" ? job.id : null,
  );

  const currentJob = liveJob ?? job;
  const isRunning = currentJob.status === "running";
  const tasks = currentJob.tasks;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={jobStatusColors[currentJob.status]}>
            {currentJob.status}
          </Badge>
          {currentJob.scopeType && (
            <Badge variant="secondary">{currentJob.scopeType}</Badge>
          )}
          {isRunning && (
            <span className="flex items-center gap-1 text-sm text-warning">
              <span className="animate-pulse">●</span>
              Live
            </span>
          )}
        </div>

        {currentJob.progress && (
          <div className="text-sm">
            <span className="text-muted-foreground">Progress: </span>
            <span className="font-medium">{currentJob.progress}</span>
          </div>
        )}

        {currentJob.currentTask && isRunning && (
          <div className="text-sm">
            <span className="text-muted-foreground">Current Task: </span>
            <span className="font-mono">{currentJob.currentTask}</span>
          </div>
        )}

        {currentJob.error && (
          <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
            {currentJob.error}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium mb-3">Tasks</h3>
        <div className="space-y-2">
          {tasks.map((task, index) => {
            const isTaskObject = typeof task === "object";
            const taskName = isTaskObject ? task.name : task;
            const taskStatus = isTaskObject ? task.status : "pending";
            const taskResult = isTaskObject ? task.result : undefined;
            const taskError = isTaskObject ? task.error : undefined;
            const taskDuration = isTaskObject ? task.durationMs : undefined;

            return (
              <div key={index} className="bg-muted/50 rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{taskName}</span>
                    <Badge
                      variant={taskStatusColors[taskStatus] ?? "secondary"}
                    >
                      {taskStatus}
                    </Badge>
                  </div>
                  {taskDuration !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(taskDuration)}
                    </span>
                  )}
                </div>

                {taskError && (
                  <div className="text-sm text-destructive">{taskError}</div>
                )}

                {taskResult && Object.keys(taskResult).length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {Object.entries(taskResult).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium">{key}: </span>
                        <span>{JSON.stringify(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {currentJob.results && Object.keys(currentJob.results).length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-2">Results Summary</h3>
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(currentJob.results, null, 2)}
            </pre>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-1 text-sm text-muted-foreground">
        <div>
          <span>ID: </span>
          <span className="font-mono">{currentJob.id}</span>
        </div>
        {currentJob.createdAt && (
          <div>
            <span>Created: </span>
            {formatDate(currentJob.createdAt)}
          </div>
        )}
        {currentJob.startedAt && (
          <div>
            <span>Started: </span>
            {formatDate(currentJob.startedAt)}
          </div>
        )}
        {currentJob.completedAt && (
          <div>
            <span>Completed: </span>
            {formatDate(currentJob.completedAt)}
          </div>
        )}
        {currentJob.durationMs !== undefined && (
          <div>
            <span>Duration: </span>
            {formatDuration(currentJob.durationMs)}
          </div>
        )}
      </div>
    </div>
  );
}

function JobsTab() {
  const { data, isLoading, error, refetch } = useLibrarianJobs();
  const [selectedJob, setSelectedJob] = useState<LibrarianJob | null>(null);

  const hasRunningJobs = data?.some(
    (job) => job.status === "running" || job.status === "pending",
  );

  useEffect(() => {
    if (!hasRunningJobs) return;

    const interval = setInterval(() => {
      refetch();
    }, 3000);

    return () => clearInterval(interval);
  }, [hasRunningJobs, refetch]);

  const columns: ColumnDef<LibrarianJob, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => {
          const id = row.getValue("id") as string;
          return (
            <span className="font-mono text-xs" title={id}>
              {id.slice(0, 12)}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status") as LibrarianJob["status"];
          const isRunning = status === "running";
          return (
            <div className="flex items-center gap-1">
              {isRunning && (
                <span className="animate-pulse text-warning">●</span>
              )}
              <Badge variant={jobStatusColors[status]}>{status}</Badge>
            </div>
          );
        },
      },
      {
        accessorKey: "progress",
        header: "Progress",
        cell: ({ row }) => {
          const progress = row.original.progress;
          const currentTask = row.original.currentTask;
          if (progress) {
            return (
              <div className="text-sm">
                <div>{progress}</div>
                {currentTask && (
                  <div className="text-xs text-muted-foreground font-mono">
                    {currentTask}
                  </div>
                )}
              </div>
            );
          }
          return <span className="text-muted-foreground">-</span>;
        },
      },
      {
        accessorKey: "tasks",
        header: "Tasks",
        cell: ({ row }) => {
          const tasks = row.original.tasks;
          if (!tasks?.length) {
            return <span className="text-muted-foreground">-</span>;
          }
          const completed =
            typeof tasks[0] === "object"
              ? tasks.filter(
                  (t) => typeof t === "object" && t.status === "completed",
                ).length
              : 0;
          return (
            <span className="text-sm">
              {completed}/{tasks.length}
            </span>
          );
        },
      },
      {
        accessorKey: "startedAt",
        header: "Started",
        cell: ({ row }) => {
          const startedAt = row.getValue("startedAt") as string | undefined;
          return startedAt ? (
            formatDate(startedAt)
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "durationMs",
        header: "Duration",
        cell: ({ row }) => {
          const durationMs = row.original.durationMs;
          const startedAt = row.original.startedAt;
          const status = row.original.status;

          if (durationMs) {
            return formatDuration(durationMs);
          }
          if (startedAt && status === "running") {
            const elapsed = Date.now() - new Date(startedAt).getTime();
            return (
              <span className="text-muted-foreground">
                {formatDuration(elapsed)}
              </span>
            );
          }
          return <span className="text-muted-foreground">-</span>;
        },
      },
    ],
    [],
  );

  return (
    <>
      {hasRunningJobs && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="animate-pulse text-warning">●</span>
          <span>Live updates enabled</span>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No maintenance jobs found"
        onRowClick={setSelectedJob}
      />

      <Modal
        isOpen={selectedJob !== null}
        onClose={() => setSelectedJob(null)}
        title="Job Details"
        size="2xl"
      >
        {selectedJob && <JobDetail job={selectedJob} />}
      </Modal>
    </>
  );
}

interface RecommendationDetailProps {
  recommendation: LibrarianRecommendation;
  onClose: () => void;
}

function RecommendationDetail({
  recommendation,
  onClose,
}: RecommendationDetailProps) {
  const { data: detail } = useLibrarianRecommendation(recommendation.id);
  const approve = useApproveRecommendation();
  const reject = useRejectRecommendation();
  const skip = useSkipRecommendation();

  const isPending = recommendation.status === "pending";
  const isActioning = approve.isPending || reject.isPending || skip.isPending;

  const handleApprove = () => {
    approve.mutate({ id: recommendation.id }, { onSuccess: onClose });
  };

  const handleReject = () => {
    reject.mutate({ id: recommendation.id }, { onSuccess: onClose });
  };

  const handleSkip = () => {
    skip.mutate({ id: recommendation.id }, { onSuccess: onClose });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={recommendationStatusColors[recommendation.status]}>
            {recommendation.status}
          </Badge>
          <Badge variant="secondary">{recommendation.type}</Badge>
          <span className="text-sm text-muted-foreground">
            {Math.round(recommendation.confidence * 100)}% confidence
          </span>
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Pattern Count: </span>
          {recommendation.patternCount}
        </div>

        {recommendation.expiresAt && (
          <div className="text-sm">
            <span className="text-muted-foreground">Expires: </span>
            {formatDate(recommendation.expiresAt)}
          </div>
        )}
      </div>

      {detail?.pattern && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-2">Pattern</h3>
          <div className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap">
            {detail.pattern}
          </div>
        </div>
      )}

      {detail?.sourceExperiences && detail.sourceExperiences.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium mb-2">Source Experiences</h3>
          <div className="space-y-2">
            {detail.sourceExperiences.map((exp) => (
              <div key={exp.id} className="bg-muted/50 rounded-md p-3 text-sm">
                <div className="font-medium">{exp.title}</div>
                {exp.outcome && (
                  <div className="text-muted-foreground mt-1">
                    {exp.outcome}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isPending && (
        <div className="border-t border-border pt-4 flex gap-2">
          <button
            onClick={handleApprove}
            disabled={isActioning}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={isActioning}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={handleSkip}
            disabled={isActioning}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
          >
            Skip
          </button>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <div className="text-sm text-muted-foreground">
          <span>ID: </span>
          <span className="font-mono">{recommendation.id}</span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          <span>Created: </span>
          {formatDate(recommendation.createdAt)}
        </div>
      </div>
    </div>
  );
}

function RecommendationsTab() {
  const { data, isLoading, error } = useLibrarianRecommendations();
  const [selected, setSelected] = useState<LibrarianRecommendation | null>(
    null,
  );

  const columns: ColumnDef<LibrarianRecommendation, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("title")}</span>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => {
          const type = row.getValue("type") as LibrarianRecommendation["type"];
          return <Badge variant="secondary">{type}</Badge>;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue(
            "status",
          ) as LibrarianRecommendation["status"];
          return (
            <Badge variant={recommendationStatusColors[status]}>{status}</Badge>
          );
        },
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) => {
          const confidence = row.getValue("confidence") as number;
          const pct = Math.round(confidence * 100);
          const variant =
            pct >= 80 ? "default" : pct >= 60 ? "secondary" : "warning";
          return <Badge variant={variant}>{pct}%</Badge>;
        },
      },
      {
        accessorKey: "patternCount",
        header: "Patterns",
        cell: ({ row }) => row.getValue("patternCount"),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDate(row.getValue("createdAt")),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No recommendations found"
        onRowClick={setSelected}
      />

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Recommendation Details"}
        size="2xl"
      >
        {selected && (
          <RecommendationDetail
            recommendation={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
    </>
  );
}

export function LibrarianPage() {
  const [activeTab, setActiveTab] = useState<TabType>("status");

  const tabs: { id: TabType; label: string }[] = [
    { id: "status", label: "Status" },
    { id: "jobs", label: "Jobs" },
    { id: "recommendations", label: "Recommendations" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Librarian</h1>
        <p className="text-muted-foreground">
          Pattern detection, maintenance jobs, and promotion recommendations
        </p>
      </div>

      <div className="border-b border-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "status" && <StatusTab />}
      {activeTab === "jobs" && <JobsTab />}
      {activeTab === "recommendations" && <RecommendationsTab />}
    </div>
  );
}

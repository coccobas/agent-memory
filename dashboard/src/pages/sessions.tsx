import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Timeline } from "@/components/ui/timeline";
import { Collapsible } from "@/components/ui/collapsible";
import { useSessions, useEpisodes, useEpisodeEvents } from "@/api/hooks";
import type { Session, Episode } from "@/api/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return "Ongoing";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const durationMs = end - start;

  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const statusColors: Record<
  Session["status"],
  "default" | "secondary" | "destructive" | "warning"
> = {
  active: "default",
  completed: "secondary",
  discarded: "destructive",
  paused: "warning",
};

const episodeStatusColors: Record<
  Episode["status"],
  "default" | "secondary" | "destructive" | "warning"
> = {
  planned: "secondary",
  active: "default",
  completed: "secondary",
  failed: "destructive",
  cancelled: "warning",
};

interface EpisodeCardProps {
  episode: Episode;
}

function EpisodeCard({ episode }: EpisodeCardProps) {
  const { data: events, isLoading } = useEpisodeEvents(episode.id);

  const timelineItems = useMemo(() => {
    if (!events) return [];
    return events.map((event) => ({
      id: event.id,
      timestamp: event.occurredAt,
      type: event.eventType,
      name: event.name,
      description: event.description,
    }));
  }, [events]);

  return (
    <Collapsible
      title={
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{episode.name}</span>
          <Badge
            variant={episodeStatusColors[episode.status]}
            className="shrink-0"
          >
            {episode.status}
          </Badge>
          {episode.startedAt && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDateTime(episode.startedAt)}
            </span>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {episode.outcome && (
          <div className="text-sm">
            <span className="text-muted-foreground">Outcome: </span>
            {episode.outcome}
          </div>
        )}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading events...</div>
        ) : (
          <Timeline items={timelineItems} />
        )}
      </div>
    </Collapsible>
  );
}

interface SessionDetailProps {
  session: Session;
}

function SessionDetail({ session }: SessionDetailProps) {
  const { data: episodes, isLoading: episodesLoading } = useEpisodes(
    session.id,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={statusColors[session.status]}>{session.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatDuration(session.startedAt, session.endedAt)}
          </span>
        </div>

        {session.purpose && (
          <p className="text-sm text-muted-foreground">{session.purpose}</p>
        )}

        <div className="text-sm">
          <span className="text-muted-foreground">Started: </span>
          {formatDateTime(session.startedAt)}
          {session.endedAt && (
            <>
              <span className="text-muted-foreground"> → Ended: </span>
              {formatDateTime(session.endedAt)}
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium mb-3">Episodes</h3>
        {episodesLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading episodes...
          </div>
        ) : episodes && episodes.length > 0 ? (
          <div className="space-y-2">
            {episodes.map((episode) => (
              <EpisodeCard key={episode.id} episode={episode} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No episodes in this session
          </div>
        )}
      </div>

      <Collapsible
        title={<span className="text-sm text-muted-foreground">Metadata</span>}
      >
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">ID: </span>
            <span className="font-mono">{session.id}</span>
          </div>
          {session.projectId && (
            <div>
              <span className="text-muted-foreground">Project: </span>
              <span className="font-mono">{session.projectId}</span>
            </div>
          )}
          {session.agentId && (
            <div>
              <span className="text-muted-foreground">Agent: </span>
              <span className="font-mono">{session.agentId}</span>
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

export function SessionsPage() {
  const { data, isLoading, error } = useSessions();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const columns: ColumnDef<Session, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">
            {row.getValue("name") || "Unnamed Session"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status") as Session["status"];
          return <Badge variant={statusColors[status]}>{status}</Badge>;
        },
      },
      {
        accessorKey: "agentId",
        header: "Agent",
        cell: ({ row }) => {
          const agentId = row.getValue("agentId") as string | undefined;
          return agentId ? (
            <span className="font-mono text-sm">{agentId}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "startedAt",
        header: "Started",
        cell: ({ row }) => formatDate(row.getValue("startedAt")),
      },
      {
        accessorKey: "endedAt",
        header: "Duration",
        cell: ({ row }) => {
          const startedAt = row.original.startedAt;
          const endedAt = row.getValue("endedAt") as string | undefined;
          return formatDuration(startedAt, endedAt);
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-muted-foreground">
          Working sessions and their episodes
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No sessions found"
        onRowClick={setSelectedSession}
      />

      <Modal
        isOpen={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
        title={selectedSession?.name ?? "Session Details"}
        size="2xl"
      >
        {selectedSession && <SessionDetail session={selectedSession} />}
      </Modal>
    </div>
  );
}

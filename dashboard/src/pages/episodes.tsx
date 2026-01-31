import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Timeline } from "@/components/ui/timeline";
import { Collapsible } from "@/components/ui/collapsible";
import { ConversationView } from "@/components/ui/conversation-view";
import { useEpisodes, useEpisodeEvents, useEpisodeMessages } from "@/api/hooks";
import type { Episode } from "@/api/types";

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

function formatDuration(durationMs?: number): string {
  if (!durationMs) return "-";

  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

const statusColors: Record<
  Episode["status"],
  "default" | "secondary" | "destructive" | "warning"
> = {
  planned: "secondary",
  active: "default",
  completed: "secondary",
  failed: "destructive",
  cancelled: "warning",
};

const outcomeColors: Record<
  NonNullable<Episode["outcomeType"]>,
  "default" | "secondary" | "destructive" | "warning"
> = {
  success: "default",
  partial: "warning",
  failure: "destructive",
  abandoned: "secondary",
};

interface EpisodeDetailProps {
  episode: Episode;
}

function EpisodeDetail({ episode }: EpisodeDetailProps) {
  const { data: events, isLoading: eventsLoading } = useEpisodeEvents(
    episode.id,
  );
  const { data: messages, isLoading: messagesLoading } = useEpisodeMessages(
    episode.id,
  );

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
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusColors[episode.status]}>{episode.status}</Badge>
          {episode.outcomeType && (
            <Badge variant={outcomeColors[episode.outcomeType]}>
              {episode.outcomeType}
            </Badge>
          )}
          {episode.durationMs && (
            <span className="text-sm text-muted-foreground">
              {formatDuration(episode.durationMs)}
            </span>
          )}
        </div>

        {episode.description && (
          <p className="text-sm text-muted-foreground">{episode.description}</p>
        )}

        {episode.outcome && (
          <div className="text-sm bg-muted/50 rounded-md p-3">
            <span className="text-muted-foreground">Outcome: </span>
            {episode.outcome}
          </div>
        )}

        {episode.startedAt && (
          <div className="text-sm">
            <span className="text-muted-foreground">Started: </span>
            {formatDateTime(episode.startedAt)}
            {episode.endedAt && (
              <>
                <span className="text-muted-foreground"> → Ended: </span>
                {formatDateTime(episode.endedAt)}
              </>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium mb-3">Event Timeline</h3>
        {eventsLoading ? (
          <div className="text-sm text-muted-foreground">Loading events...</div>
        ) : (
          <Timeline items={timelineItems} />
        )}
      </div>

      <Collapsible
        title={
          <span className="text-sm font-medium">
            Conversation{" "}
            {messages && messages.length > 0 && `(${messages.length})`}
          </span>
        }
        defaultOpen={messages && messages.length > 0 && messages.length <= 5}
      >
        {messagesLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading messages...
          </div>
        ) : (
          <ConversationView messages={messages ?? []} />
        )}
      </Collapsible>

      <Collapsible
        title={<span className="text-sm text-muted-foreground">Metadata</span>}
      >
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">ID: </span>
            <span className="font-mono">{episode.id}</span>
          </div>
          {episode.sessionId && (
            <div>
              <span className="text-muted-foreground">Session: </span>
              <span className="font-mono">{episode.sessionId}</span>
            </div>
          )}
          {episode.triggerType && (
            <div>
              <span className="text-muted-foreground">Trigger: </span>
              <span className="font-mono">{episode.triggerType}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Created: </span>
            {formatDateTime(episode.createdAt)}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}

export function EpisodesPage() {
  const { data, isLoading, error } = useEpisodes();
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  const columns: ColumnDef<Episode, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("name")}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = row.getValue("status") as Episode["status"];
          return <Badge variant={statusColors[status]}>{status}</Badge>;
        },
      },
      {
        accessorKey: "outcomeType",
        header: "Outcome",
        cell: ({ row }) => {
          const outcomeType = row.getValue("outcomeType") as
            | Episode["outcomeType"]
            | undefined;
          return outcomeType ? (
            <Badge variant={outcomeColors[outcomeType]}>{outcomeType}</Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "triggerType",
        header: "Trigger",
        cell: ({ row }) => {
          const triggerType = row.getValue("triggerType") as string | undefined;
          return triggerType ? (
            <span className="font-mono text-sm">{triggerType}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDate(row.getValue("createdAt")),
      },
      {
        accessorKey: "durationMs",
        header: "Duration",
        cell: ({ row }) => {
          const durationMs = row.getValue("durationMs") as number | undefined;
          return formatDuration(durationMs);
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Episodes</h1>
        <p className="text-muted-foreground">
          Work episodes with event timelines and conversations
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No episodes found"
        onRowClick={setSelectedEpisode}
      />

      <Modal
        isOpen={selectedEpisode !== null}
        onClose={() => setSelectedEpisode(null)}
        title={selectedEpisode?.name ?? "Episode Details"}
        size="2xl"
      >
        {selectedEpisode && <EpisodeDetail episode={selectedEpisode} />}
      </Modal>
    </div>
  );
}

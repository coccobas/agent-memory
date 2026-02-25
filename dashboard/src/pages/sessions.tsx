import { useState } from 'react';
import { Bot, Info, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { Collapsible } from '@/components/ui/collapsible';
import { useSessions } from '@/api/hooks';
import type { Session } from '@/api/types';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) return 'Ongoing';
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

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffHours < 24) {
    if (diffHours > 0) {
      return `${diffHours}h ago`;
    }
    if (diffMinutes > 0) {
      return `${diffMinutes}m ago`;
    }
    return 'Just now';
  }

  return formatDate(dateString);
}

const statusColors: Record<
  Session['status'],
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'warning'
  | 'success-subtle'
  | 'destructive-subtle'
  | 'info-pulse'
> = {
  active: 'info-pulse',
  completed: 'success-subtle',
  discarded: 'destructive-subtle',
  paused: 'warning',
};

interface SessionDetailProps {
  session: Session;
}

function SessionDetail({ session }: SessionDetailProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={statusColors[session.status]}>{session.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatDuration(session.startedAt, session.endedAt)}
          </span>
        </div>

        {session.purpose && <p className="text-sm text-muted-foreground">{session.purpose}</p>}

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

      <Collapsible title={<span className="text-sm text-muted-foreground">Metadata</span>}>
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

interface SessionRowProps {
  session: Session;
  onShowDetails: () => void;
}

function SessionRow({ session, onShowDetails }: SessionRowProps) {
  const capitalizedStatus = session.status.charAt(0).toUpperCase() + session.status.slice(1);

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="p-4">
        <span className="font-medium text-foreground">{session.name || 'Unnamed Session'}</span>
      </td>
      <td className="p-4">
        <Badge variant={statusColors[session.status]}>{capitalizedStatus}</Badge>
      </td>
      <td className="p-4">
        {session.agentId ? (
          <Tooltip content={session.agentId} side="top">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
              <Bot className="h-4 w-4 text-muted-foreground" />
            </div>
          </Tooltip>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}
      </td>
      <td className="p-4 text-sm text-muted-foreground">
        {formatRelativeDate(session.startedAt)}
      </td>
      <td className="p-4 text-sm text-muted-foreground">
        {formatDuration(session.startedAt, session.endedAt)}
      </td>
      <td className="p-4 w-12">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onShowDetails}
        >
          <Info className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

export function SessionsPage() {
  const { data, isLoading, error } = useSessions();
  const [detailSession, setDetailSession] = useState<Session | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-destructive font-medium">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sessions</h1>
        <p className="text-muted-foreground">Working sessions and activity tracking</p>
      </div>

      {data && data.length > 0 ? (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr className="border-b border-border">
                <th className="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground">
                  Name
                </th>
                <th className="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground w-28">
                  Status
                </th>
                <th className="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground w-20">
                  Agent
                </th>
                <th className="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground w-28">
                  Started
                </th>
                <th className="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground w-24">
                  Duration
                </th>
                <th className="h-12 px-4 text-left align-middle text-sm font-medium text-muted-foreground w-12"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onShowDetails={() => setDetailSession(session)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No sessions found</p>
        </div>
      )}

      <Modal
        isOpen={detailSession !== null}
        onClose={() => setDetailSession(null)}
        title={detailSession?.name ?? 'Session Details'}
        size="2xl"
      >
        {detailSession && <SessionDetail session={detailSession} />}
      </Modal>
    </div>
  );
}

import { Activity, Play, Cpu, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useProjectorStatus, useDrainProjector, useEmbedPending } from '@/api/hooks';
import { cn } from '@/lib/utils';

function formatAge(ms: number): string {
  if (ms === 0) return '-';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function StatusIndicator({ lag }: { lag: number }) {
  if (lag === 0) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-green-400" />
        <span className="text-sm font-medium text-green-400">In sync</span>
      </div>
    );
  }

  if (lag <= 10) {
    return (
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-yellow-400" />
        <span className="text-sm font-medium text-yellow-400">Minor lag ({lag})</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-5 w-5 text-red-400" />
      <span className="text-sm font-medium text-red-400">Behind ({lag} events)</span>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

function MetricCard({ label, value, sublabel, variant = 'default' }: MetricCardProps) {
  const colorMap = {
    default: 'text-foreground',
    success: 'text-green-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
  };

  return (
    <div className="glass rounded-lg p-4 border border-white/5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn('text-2xl font-bold mt-1', colorMap[variant])}>{value}</p>
      {sublabel && <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
}

export function ProjectorPage() {
  const queryClient = useQueryClient();
  const { data: status, isLoading, error } = useProjectorStatus();
  const drainMutation = useDrainProjector();
  const embedMutation = useEmbedPending();

  const handleDrain = async () => {
    try {
      const result = await drainMutation.mutateAsync(100);
      toast.success(`Processed ${result.processed} events`);
    } catch (err) {
      toast.error('Drain failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleEmbed = async () => {
    try {
      const result = await embedMutation.mutateAsync(50);
      toast.success(`Embedded ${result.processed} entries`);
    } catch (err) {
      toast.error('Embedding failed', err instanceof Error ? err.message : undefined);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Loading projector status...</p>
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

  const lagVariant = (status?.lag ?? 0) === 0 ? 'success' : (status?.lag ?? 0) > 10 ? 'danger' : 'warning';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Indexing Pipeline</h1>
          <p className="text-muted-foreground">
            Event-driven projector status and admin controls
          </p>
        </div>
        {status && <StatusIndicator lag={status.lag} />}
      </div>

      {/* Metrics grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Latest Event"
          value={status?.latestSeq ?? 0}
          sublabel="Sequence number"
        />
        <MetricCard
          label="Checkpoint"
          value={status?.checkpointSeq ?? 0}
          sublabel="Last processed"
        />
        <MetricCard
          label="Lag"
          value={status?.lag ?? 0}
          sublabel="Events behind"
          variant={lagVariant}
        />
        <MetricCard
          label="Oldest Pending"
          value={formatAge(status?.oldestPendingAgeMs ?? 0)}
          sublabel="Time waiting"
          variant={(status?.oldestPendingAgeMs ?? 0) > 60000 ? 'warning' : 'default'}
        />
      </div>

      {/* Projector info card */}
      <Card className="glass border-none overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Projector Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Projector Name</p>
              <p className="font-mono text-sm">{status?.projector ?? '-'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending Events</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm">{status?.pendingCount ?? 0}</p>
                {(status?.pendingCount ?? 0) > 0 && (
                  <Badge variant="warning" className="text-xs">Needs drain</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {status && status.latestSeq > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Projection Progress</span>
                <span>
                  {status.checkpointSeq} / {status.latestSeq}
                  {' '}({status.latestSeq > 0
                    ? Math.round((status.checkpointSeq / status.latestSeq) * 100)
                    : 100}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    status.lag === 0 ? 'bg-green-400' : status.lag > 10 ? 'bg-red-400' : 'bg-yellow-400'
                  )}
                  style={{
                    width: `${status.latestSeq > 0 ? (status.checkpointSeq / status.latestSeq) * 100 : 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <Card className="glass border-none overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleDrain}
              disabled={drainMutation.isPending || (status?.pendingCount ?? 0) === 0}
            >
              {drainMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Drain Events
              {(status?.pendingCount ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-2">{status?.pendingCount}</Badge>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleEmbed}
              disabled={embedMutation.isPending}
            >
              {embedMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Cpu className="h-4 w-4 mr-2" />
              )}
              Embed Pending
            </Button>

            <Button
              variant="ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['projector'] })}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

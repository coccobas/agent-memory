import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { useTopics } from '@/api/hooks/use-topics';
import type { Topic } from '@/api/types';

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

const statusColors: Record<Topic['status'], 'default' | 'secondary' | 'destructive' | 'warning'> = {
  active: 'default',
  inactive: 'secondary',
};

interface TopicDetailProps {
  topic: Topic;
}

function TopicDetail({ topic }: TopicDetailProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusColors[topic.status]}>{topic.status}</Badge>
        </div>

        {topic.description && <p className="text-sm text-muted-foreground">{topic.description}</p>}

        <div className="text-sm">
          <span className="text-muted-foreground">Created: </span>
          {formatDateTime(topic.createdAt)}
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Last Updated: </span>
          {formatDateTime(topic.updatedAt)}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">ID: </span>
            <span className="font-mono">{topic.id}</span>
          </div>
          {topic.projectId && (
            <div>
              <span className="text-muted-foreground">Project: </span>
              <span className="font-mono">{topic.projectId}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Scope: </span>
            <span className="font-mono">{topic.scopeType}</span>
            {topic.scopeId && ` (${topic.scopeId})`}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopicsPage() {
  const { data, isLoading, error } = useTopics();
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  const columns: ColumnDef<Topic, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.getValue('status') as Topic['status'];
          return <Badge variant={statusColors[status]}>{status}</Badge>;
        },
      },
      {
        accessorKey: 'scopeType',
        header: 'Scope',
        cell: ({ row }) => {
          const scopeType = row.getValue('scopeType') as string;
          return <span className="font-mono text-sm">{scopeType}</span>;
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => formatDate(row.getValue('createdAt')),
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => formatDate(row.getValue('updatedAt')),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Topics</h1>
        <p className="text-muted-foreground">
          Work contexts that organize episodes across sessions
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No topics found"
        onRowClick={setSelectedTopic}
      />

      <Modal
        isOpen={selectedTopic !== null}
        onClose={() => setSelectedTopic(null)}
        title={selectedTopic?.name ?? 'Topic Details'}
        size="2xl"
      >
        {selectedTopic && <TopicDetail topic={selectedTopic} />}
      </Modal>
    </div>
  );
}

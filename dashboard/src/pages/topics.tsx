import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { TopicForm } from '@/components/forms';
import { toast } from '@/components/ui/toast';
import {
  useTopics,
  useDeleteTopic,
  useAssignTranscriptToTopic,
  useMoveTranscriptToTopic,
  useMergeTopics,
} from '@/api/hooks';
import { useUIStore } from '@/stores/ui.store';
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

function getNumericMetadata(topic: Topic, keys: string[]): number | undefined {
  if (!topic.metadata) return undefined;
  for (const key of keys) {
    const value = topic.metadata[key];
    if (typeof value === 'number') return value;
  }
  return undefined;
}

function getTranscriptCount(topic: Topic): number {
  return (
    topic.transcriptCount ??
    getNumericMetadata(topic, ['transcriptCount', 'transcript_count', 'count']) ??
    0
  );
}

const statusColors: Record<Topic['status'], 'default' | 'secondary' | 'destructive' | 'warning'> = {
  active: 'default',
  inactive: 'secondary',
};

interface TopicDetailProps {
  topic: Topic;
}

function TopicDetail({ topic }: TopicDetailProps) {
  const transcriptCount = getTranscriptCount(topic);
  const manualCount =
    topic.manualTranscriptCount ??
    getNumericMetadata(topic, ['manualTranscriptCount', 'manual_transcript_count']);
  const autoCount =
    topic.autoTranscriptCount ?? getNumericMetadata(topic, ['autoTranscriptCount', 'auto_transcript_count']);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={statusColors[topic.status]}>{topic.status}</Badge>
          <Badge variant="secondary">{transcriptCount} transcripts</Badge>
          {manualCount !== undefined && <Badge variant="secondary">{manualCount} manual</Badge>}
          {autoCount !== undefined && <Badge variant="secondary">{autoCount} auto</Badge>}
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
  const { scope } = useUIStore();
  const scopeType = scope.type === 'project' ? 'project' : 'global';
  const scopeId = scope.type === 'project' ? scope.projectId : undefined;

  const { data, isLoading, error } = useTopics(scopeType, scopeId, true);
  const deleteMutation = useDeleteTopic();
  const assignMutation = useAssignTranscriptToTopic();
  const moveMutation = useMoveTranscriptToTopic();
  const mergeMutation = useMergeTopics();

  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [assignForm, setAssignForm] = useState({ transcriptId: '', topicId: '' });
  const [moveForm, setMoveForm] = useState({ transcriptId: '', sourceTopicId: '', targetTopicId: '' });
  const [mergeForm, setMergeForm] = useState({ sourceTopicId: '', targetTopicId: '' });

  const topicOptions = useMemo(
    () => (data ?? []).map((topic) => ({ value: topic.id, label: topic.name })),
    [data]
  );

  const handleCreate = () => {
    setEditingTopic(null);
    setIsFormOpen(true);
  };

  const handleEdit = (topic: Topic, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTopic(topic);
    setIsFormOpen(true);
  };

  const handleDelete = async (topic: Topic, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Archive topic "${topic.name}"?`)) return;

    try {
      await deleteMutation.mutateAsync(topic.id);
      toast.success('Topic archived');
    } catch (err) {
      toast.error('Failed to archive topic', err instanceof Error ? err.message : undefined);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.transcriptId.trim() || !assignForm.topicId) {
      toast.warning('Transcript ID and topic are required');
      return;
    }

    try {
      await assignMutation.mutateAsync({
        transcriptId: assignForm.transcriptId.trim(),
        topicId: assignForm.topicId,
      });
      toast.success('Transcript assigned to topic');
      setAssignForm({ transcriptId: '', topicId: '' });
    } catch (err) {
      toast.error(
        'Failed to assign transcript',
        err instanceof Error ? err.message : 'Backend may not support assign yet'
      );
    }
  };

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveForm.transcriptId.trim() || !moveForm.targetTopicId) {
      toast.warning('Transcript ID and target topic are required');
      return;
    }
    if (moveForm.sourceTopicId && moveForm.sourceTopicId === moveForm.targetTopicId) {
      toast.warning('Source and target topics must be different');
      return;
    }

    try {
      await moveMutation.mutateAsync({
        transcriptId: moveForm.transcriptId.trim(),
        sourceTopicId: moveForm.sourceTopicId || undefined,
        targetTopicId: moveForm.targetTopicId,
      });
      toast.success('Transcript moved');
      setMoveForm({ transcriptId: '', sourceTopicId: '', targetTopicId: '' });
    } catch (err) {
      toast.error(
        'Failed to move transcript',
        err instanceof Error ? err.message : 'Backend may not support move yet'
      );
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeForm.sourceTopicId || !mergeForm.targetTopicId) {
      toast.warning('Choose both source and target topics');
      return;
    }
    if (mergeForm.sourceTopicId === mergeForm.targetTopicId) {
      toast.warning('Source and target topics must be different');
      return;
    }

    try {
      await mergeMutation.mutateAsync({
        sourceTopicId: mergeForm.sourceTopicId,
        targetTopicId: mergeForm.targetTopicId,
      });
      toast.success('Topics merged');
      setMergeForm({ sourceTopicId: '', targetTopicId: '' });
    } catch (err) {
      toast.error('Failed to merge topics', err instanceof Error ? err.message : undefined);
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingTopic(null);
  };

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
        id: 'transcriptCount',
        header: 'Transcripts',
        accessorFn: (row) => getTranscriptCount(row),
        cell: ({ row }) => {
          const topic = row.original;
          return <Badge variant="secondary">{getTranscriptCount(topic)}</Badge>;
        },
      },
      {
        accessorKey: 'scopeType',
        header: 'Scope',
        cell: ({ row }) => {
          const scope = row.original.scopeId
            ? `${row.original.scopeType}:${row.original.scopeId}`
            : row.original.scopeType;
          return <span className="font-mono text-sm">{scope}</span>;
        },
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => formatDate(row.getValue('updatedAt')),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => handleEdit(row.original, e)}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="Edit"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={(e) => handleDelete(row.original, e)}
              className="p-1.5 hover:bg-muted rounded transition-colors"
              title="Archive"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ),
      },
    ],
    [handleEdit, handleDelete]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Topics</h1>
          <p className="text-muted-foreground">Smart folders that group transcripts by work stream</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Topic
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Smart Folder Actions</CardTitle>
          <CardDescription>Manual tools for assignment, movement, and merging.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <form className="space-y-3 rounded-md border border-border p-3" onSubmit={handleAssign}>
            <h3 className="text-sm font-semibold">Assign Transcript</h3>
            <Input
              value={assignForm.transcriptId}
              onChange={(e) => setAssignForm((prev) => ({ ...prev, transcriptId: e.target.value }))}
              placeholder="Transcript ID"
            />
            <Select
              value={assignForm.topicId}
              placeholder="Select topic"
              onChange={(value) => setAssignForm((prev) => ({ ...prev, topicId: value }))}
              options={topicOptions}
            />
            <Button type="submit" className="w-full" disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Assigning...' : 'Assign'}
            </Button>
          </form>

          <form className="space-y-3 rounded-md border border-border p-3" onSubmit={handleMove}>
            <h3 className="text-sm font-semibold">Move Transcript</h3>
            <Input
              value={moveForm.transcriptId}
              onChange={(e) => setMoveForm((prev) => ({ ...prev, transcriptId: e.target.value }))}
              placeholder="Transcript ID"
            />
            <Select
              value={moveForm.sourceTopicId}
              onChange={(value) => setMoveForm((prev) => ({ ...prev, sourceTopicId: value }))}
              options={[{ value: '', label: 'Auto-detect source (optional)' }, ...topicOptions]}
            />
            <Select
              value={moveForm.targetTopicId}
              placeholder="Target topic"
              onChange={(value) => setMoveForm((prev) => ({ ...prev, targetTopicId: value }))}
              options={topicOptions}
            />
            <Button type="submit" className="w-full" disabled={moveMutation.isPending}>
              {moveMutation.isPending ? 'Moving...' : 'Move'}
            </Button>
          </form>

          <form className="space-y-3 rounded-md border border-border p-3" onSubmit={handleMerge}>
            <h3 className="text-sm font-semibold">Merge Topics</h3>
            <Select
              value={mergeForm.sourceTopicId}
              placeholder="Source topic"
              onChange={(value) => setMergeForm((prev) => ({ ...prev, sourceTopicId: value }))}
              options={topicOptions}
            />
            <Select
              value={mergeForm.targetTopicId}
              placeholder="Target topic"
              onChange={(value) => setMergeForm((prev) => ({ ...prev, targetTopicId: value }))}
              options={topicOptions}
            />
            <Button type="submit" className="w-full" disabled={mergeMutation.isPending}>
              {mergeMutation.isPending ? 'Merging...' : 'Merge'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No topics found"
        onRowClick={setSelectedTopic}
        defaultSorting={[{ id: 'updatedAt', desc: true }]}
      />

      <Modal
        isOpen={selectedTopic !== null}
        onClose={() => setSelectedTopic(null)}
        title={selectedTopic?.name ?? 'Topic Details'}
        size="2xl"
      >
        {selectedTopic && <TopicDetail topic={selectedTopic} />}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTopic(null);
        }}
        title={editingTopic ? 'Edit Topic' : 'Create Topic'}
        size="lg"
      >
        <TopicForm
          topic={editingTopic ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingTopic(null);
          }}
        />
      </Modal>
    </div>
  );
}

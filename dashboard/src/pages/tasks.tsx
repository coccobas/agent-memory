import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { KanbanBoard } from '@/components/ui/kanban-board';
import { TaskForm } from '@/components/forms';
import { toast } from '@/components/ui/toast';
import { useTasks, useUpdateTaskStatus, useDeleteTask } from '@/api/hooks';
import { useUIStore } from '@/stores/ui.store';
import type { Task, TaskStatus, TaskType, TaskSeverity } from '@/api/types';

const TYPE_LABEL: Record<TaskType, string> = {
  bug: '🐛 Bug',
  feature: '✨ Feature',
  improvement: '🔧 Improvement',
  debt: '🏗️ Technical Debt',
  research: '🔬 Research',
  question: '❓ Question',
  other: '📋 Other',
};

const SEVERITY_VARIANT: Record<TaskSeverity, 'destructive' | 'warning' | 'secondary' | 'default'> =
  {
    critical: 'destructive',
    high: 'warning',
    medium: 'secondary',
    low: 'default',
  };

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface TaskDetailProps {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
}

function TaskDetail({ task, onEdit, onDelete }: TaskDetailProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary">{TYPE_LABEL[task.taskType]}</Badge>
        <Badge variant={SEVERITY_VARIANT[task.severity]}>{task.severity}</Badge>
        <Badge variant="secondary">{task.status.replace('_', ' ')}</Badge>
      </div>

      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
        <p className="text-sm whitespace-pre-wrap">{task.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        {task.assignee && (
          <div>
            <span className="text-muted-foreground">Assignee:</span>{' '}
            <span className="font-medium">@{task.assignee}</span>
          </div>
        )}
        {task.dueDate && (
          <div>
            <span className="text-muted-foreground">Due:</span>{' '}
            <span className="font-medium">{formatDate(task.dueDate)}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Created:</span>{' '}
          <span>{formatDate(task.createdAt)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Updated:</span>{' '}
          <span>{formatDate(task.updatedAt)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onDelete} className="text-destructive">
          Delete
        </Button>
        <Button onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}

export function TasksPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === 'project' ? 'project' : 'global';
  const scopeId = scope.type === 'project' ? scope.projectId : undefined;

  const { data: tasks, isLoading, error } = useTasks(scopeType, scopeId);
  const updateStatusMutation = useUpdateTaskStatus();
  const deleteMutation = useDeleteTask();

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await updateStatusMutation.mutateAsync({ id: taskId, status: newStatus });
    } catch (err) {
      toast.error('Failed to update status', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCreate = () => {
    setEditingTask(null);
    setIsFormOpen(true);
  };

  const handleEdit = () => {
    if (selectedTask) {
      setEditingTask(selectedTask);
      setSelectedTask(null);
      setIsFormOpen(true);
    }
  };

  const handleDelete = async () => {
    if (!selectedTask) return;
    if (!confirm(`Delete task "${selectedTask.title}"?`)) return;

    try {
      await deleteMutation.mutateAsync(selectedTask.id);
      toast.success('Task deleted');
      setSelectedTask(null);
    } catch (err) {
      toast.error('Failed to delete task', err instanceof Error ? err.message : undefined);
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingTask(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">
          Error loading tasks: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">Work items, bugs, features, and improvements</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>

      <KanbanBoard
        tasks={tasks ?? []}
        onStatusChange={handleStatusChange}
        onTaskClick={setSelectedTask}
      />

      <Modal
        isOpen={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        title={selectedTask?.title ?? 'Task Details'}
        size="lg"
      >
        {selectedTask && (
          <TaskDetail task={selectedTask} onEdit={handleEdit} onDelete={handleDelete} />
        )}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTask(null);
        }}
        title={editingTask ? 'Edit Task' : 'Create Task'}
        size="lg"
      >
        <TaskForm
          task={editingTask ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingTask(null);
          }}
        />
      </Modal>
    </div>
  );
}

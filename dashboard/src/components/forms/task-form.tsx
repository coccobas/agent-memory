import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useCreateTask, useUpdateTask } from '@/api/hooks';
import { useUIStore } from '@/stores/ui.store';
import type { Task, TaskType, TaskSeverity, TaskUrgency } from '@/api/types';
import type { CreateTaskInput } from '@/api/hooks/use-tasks';

interface TaskFormProps {
  task?: Task;
  onSuccess: () => void;
  onCancel: () => void;
}

const taskTypeOptions = [
  { value: 'bug', label: '🐛 Bug' },
  { value: 'feature', label: '✨ Feature' },
  { value: 'improvement', label: '🔧 Improvement' },
  { value: 'debt', label: '🏗️ Technical Debt' },
  { value: 'research', label: '🔬 Research' },
  { value: 'question', label: '❓ Question' },
  { value: 'other', label: '📋 Other' },
];

const severityOptions = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const urgencyOptions = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'soon', label: 'Soon' },
  { value: 'normal', label: 'Normal' },
  { value: 'later', label: 'Later' },
];

export function TaskForm({ task, onSuccess, onCancel }: TaskFormProps) {
  const { scope } = useUIStore();
  const isEdit = !!task;

  const [formData, setFormData] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    taskType: task?.taskType ?? 'other',
    severity: task?.severity ?? 'medium',
    urgency: task?.urgency ?? 'normal',
    assignee: task?.assignee ?? '',
    dueDate: task?.dueDate ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: task.id,
          title: formData.title,
          description: formData.description,
          taskType: formData.taskType as TaskType,
          severity: formData.severity as TaskSeverity,
          urgency: formData.urgency as TaskUrgency,
          assignee: formData.assignee || undefined,
          dueDate: formData.dueDate || undefined,
          changeReason: 'Updated via dashboard',
        });
        toast.success('Task updated');
      } else {
        const input: CreateTaskInput = {
          title: formData.title,
          description: formData.description,
          taskType: formData.taskType as TaskType,
          scopeType: scope.type === 'project' ? 'project' : 'global',
          ...(scope.type === 'project' && { scopeId: scope.projectId }),
          severity: formData.severity as TaskSeverity,
          urgency: formData.urgency as TaskUrgency,
          ...(formData.assignee && { assignee: formData.assignee }),
          ...(formData.dueDate && { dueDate: formData.dueDate }),
        };
        await createMutation.mutateAsync(input);
        toast.success('Task created');
      }
      onSuccess();
    } catch (error) {
      toast.error(
        isEdit ? 'Failed to update task' : 'Failed to create task',
        error instanceof Error ? error.message : undefined
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Title"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        error={errors.title}
        placeholder="e.g., Fix login timeout error"
      />

      <Textarea
        label="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        error={errors.description}
        placeholder="Describe the task, its context, and acceptance criteria..."
        rows={4}
      />

      <div className="grid grid-cols-3 gap-4">
        <Select
          label="Type"
          value={formData.taskType}
          onChange={(value) => setFormData({ ...formData, taskType: value as TaskType })}
          options={taskTypeOptions}
        />

        <Select
          label="Severity"
          value={formData.severity}
          onChange={(value) => setFormData({ ...formData, severity: value as TaskSeverity })}
          options={severityOptions}
        />

        <Select
          label="Urgency"
          value={formData.urgency}
          onChange={(value) => setFormData({ ...formData, urgency: value as TaskUrgency })}
          options={urgencyOptions}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Assignee (optional)"
          value={formData.assignee}
          onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
          placeholder="e.g., alice"
        />

        <Input
          label="Due Date (optional)"
          type="date"
          value={formData.dueDate}
          onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

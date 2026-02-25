import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useCreateTopic, useUpdateTopic } from '@/api/hooks';
import { useUIStore } from '@/stores/ui.store';
import type { Topic } from '@/api/types';

interface TopicFormProps {
  topic?: Topic;
  onSuccess: () => void;
  onCancel: () => void;
}

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export function TopicForm({ topic, onSuccess, onCancel }: TopicFormProps) {
  const { scope } = useUIStore();
  const isEdit = !!topic;

  const [formData, setFormData] = useState({
    name: topic?.name ?? '',
    description: topic?.description ?? '',
    status: topic?.status ?? 'active',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateTopic();
  const updateMutation = useUpdateTopic();

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      nextErrors.name = 'Name is required';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: topic.id,
          name: formData.name,
          description: formData.description || undefined,
          status: formData.status as Topic['status'],
        });
        toast.success('Topic updated');
      } else {
        const scopeType = scope.type === 'project' ? 'project' : 'global';
        await createMutation.mutateAsync({
          name: formData.name,
          description: formData.description || undefined,
          status: formData.status as Topic['status'],
          scopeType,
          ...(scope.type === 'project' && { scopeId: scope.projectId, projectId: scope.projectId }),
        });
        toast.success('Topic created');
      }

      onSuccess();
    } catch (error) {
      toast.error(
        isEdit ? 'Failed to update topic' : 'Failed to create topic',
        error instanceof Error ? error.message : undefined
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
        error={errors.name}
        placeholder="e.g., Build orchestration dashboard"
      />

      <Textarea
        label="Description"
        value={formData.description}
        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
        placeholder="Short description of this work topic..."
        rows={4}
      />

      <Select
        label="Status"
        value={formData.status}
        onChange={(value) =>
          setFormData((prev) => ({ ...prev, status: value as Topic['status'] }))
        }
        options={statusOptions}
      />

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : isEdit ? 'Update Topic' : 'Create Topic'}
        </Button>
      </div>
    </form>
  );
}

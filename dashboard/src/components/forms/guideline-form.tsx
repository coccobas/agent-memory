import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useCreateGuideline, useUpdateGuideline } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Guideline } from "@/api/types";
import type { CreateGuidelineInput } from "@/api/hooks/use-mutations";

interface GuidelineFormProps {
  guideline?: Guideline;
  onSuccess: () => void;
  onCancel: () => void;
}

const categoryOptions = [
  { value: "", label: "None" },
  { value: "security", label: "Security" },
  { value: "code_style", label: "Code Style" },
  { value: "architecture", label: "Architecture" },
  { value: "testing", label: "Testing" },
  { value: "documentation", label: "Documentation" },
  { value: "workflow", label: "Workflow" },
  { value: "performance", label: "Performance" },
];

const priorityOptions = [
  { value: "", label: "Default" },
  { value: "10", label: "10 - Low" },
  { value: "30", label: "30 - Normal" },
  { value: "50", label: "50 - Medium" },
  { value: "70", label: "70 - High" },
  { value: "90", label: "90 - Critical" },
];

export function GuidelineForm({
  guideline,
  onSuccess,
  onCancel,
}: GuidelineFormProps) {
  const { scope } = useUIStore();
  const isEdit = !!guideline;

  const [formData, setFormData] = useState({
    name: guideline?.name ?? "",
    content: guideline?.content ?? "",
    category: guideline?.category ?? "",
    priority: guideline?.priority?.toString() ?? "",
    rationale: guideline?.rationale ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateGuideline();
  const updateMutation = useUpdateGuideline();

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.content.trim()) newErrors.content = "Content is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: guideline.id,
          content: formData.content,
          category: formData.category || undefined,
          priority: formData.priority ? parseInt(formData.priority) : undefined,
          rationale: formData.rationale || undefined,
          changeReason: "Updated via dashboard",
        });
        toast.success("Guideline updated");
      } else {
        const input: CreateGuidelineInput = {
          name: formData.name,
          content: formData.content,
          scopeType: scope.type === "project" ? "project" : "global",
          ...(scope.type === "project" && { scopeId: scope.projectId }),
          ...(formData.category && { category: formData.category }),
          ...(formData.priority && { priority: parseInt(formData.priority) }),
          ...(formData.rationale && { rationale: formData.rationale }),
        };
        await createMutation.mutateAsync(input);
        toast.success("Guideline created");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        isEdit ? "Failed to update guideline" : "Failed to create guideline",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        disabled={isEdit}
        placeholder="e.g., always-use-strict-types"
      />

      <Textarea
        label="Content"
        value={formData.content}
        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        error={errors.content}
        placeholder="Describe the guideline rule or standard..."
        rows={4}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Category"
          value={formData.category}
          onChange={(value) => setFormData({ ...formData, category: value })}
          options={categoryOptions}
        />

        <Select
          label="Priority"
          value={formData.priority}
          onChange={(value) => setFormData({ ...formData, priority: value })}
          options={priorityOptions}
        />
      </div>

      <Textarea
        label="Rationale (optional)"
        value={formData.rationale}
        onChange={(e) =>
          setFormData({ ...formData, rationale: e.target.value })
        }
        placeholder="Explain why this guideline exists..."
        rows={2}
      />

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

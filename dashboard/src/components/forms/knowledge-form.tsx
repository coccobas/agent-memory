import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useCreateKnowledge, useUpdateKnowledge } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Knowledge } from "@/api/types";
import type { CreateKnowledgeInput } from "@/api/hooks/use-mutations";

interface KnowledgeFormProps {
  knowledge?: Knowledge;
  onSuccess: () => void;
  onCancel: () => void;
}

const categoryOptions = [
  { value: "fact", label: "Fact" },
  { value: "decision", label: "Decision" },
  { value: "context", label: "Context" },
  { value: "reference", label: "Reference" },
];

const confidenceOptions = [
  { value: "", label: "Default" },
  { value: "0.5", label: "0.5 - Low" },
  { value: "0.7", label: "0.7 - Medium" },
  { value: "0.85", label: "0.85 - High" },
  { value: "1.0", label: "1.0 - Certain" },
];

export function KnowledgeForm({
  knowledge,
  onSuccess,
  onCancel,
}: KnowledgeFormProps) {
  const { scope } = useUIStore();
  const isEdit = !!knowledge;

  type KnowledgeCategory = "decision" | "fact" | "context" | "reference";

  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    category: KnowledgeCategory;
    confidence: string;
    source: string;
  }>({
    title: knowledge?.title ?? "",
    content: knowledge?.content ?? "",
    category: knowledge?.category ?? "fact",
    confidence: knowledge?.confidence?.toString() ?? "",
    source: knowledge?.source ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateKnowledge();
  const updateMutation = useUpdateKnowledge();

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = "Title is required";
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
          id: knowledge.id,
          title: formData.title,
          content: formData.content,
          category: formData.category as
            | "decision"
            | "fact"
            | "context"
            | "reference",
          confidence: formData.confidence
            ? parseFloat(formData.confidence)
            : undefined,
          source: formData.source || undefined,
          changeReason: "Updated via dashboard",
        });
        toast.success("Knowledge updated");
      } else {
        const input: CreateKnowledgeInput = {
          title: formData.title,
          content: formData.content,
          category: formData.category as
            | "decision"
            | "fact"
            | "context"
            | "reference",
          scopeType: scope.type === "project" ? "project" : "global",
          ...(scope.type === "project" && { scopeId: scope.projectId }),
          ...(formData.confidence && {
            confidence: parseFloat(formData.confidence),
          }),
          ...(formData.source && { source: formData.source }),
        };
        await createMutation.mutateAsync(input);
        toast.success("Knowledge created");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        isEdit ? "Failed to update knowledge" : "Failed to create knowledge",
        error instanceof Error ? error.message : undefined,
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
        placeholder="e.g., Database uses PostgreSQL 15"
      />

      <Textarea
        label="Content"
        value={formData.content}
        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        error={errors.content}
        placeholder="Describe the knowledge, fact, or decision..."
        rows={4}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Category"
          value={formData.category}
          onChange={(value) =>
            setFormData({ ...formData, category: value as KnowledgeCategory })
          }
          options={categoryOptions}
        />

        <Select
          label="Confidence"
          value={formData.confidence}
          onChange={(value) => setFormData({ ...formData, confidence: value })}
          options={confidenceOptions}
        />
      </div>

      <Input
        label="Source (optional)"
        value={formData.source}
        onChange={(e) => setFormData({ ...formData, source: e.target.value })}
        placeholder="e.g., architecture-decision-record, user-feedback"
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

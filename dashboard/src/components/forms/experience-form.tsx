import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useCreateExperience, useUpdateExperience } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Experience } from "@/api/types";
import type { CreateExperienceInput } from "@/api/hooks/use-mutations";

interface ExperienceFormProps {
  experience?: Experience;
  onSuccess: () => void;
  onCancel: () => void;
}

const levelOptions = [
  { value: "case", label: "Case - Concrete example" },
  { value: "strategy", label: "Strategy - Abstracted pattern" },
];

const confidenceOptions = [
  { value: "", label: "Default" },
  { value: "0.5", label: "0.5 - Low" },
  { value: "0.7", label: "0.7 - Medium" },
  { value: "0.85", label: "0.85 - High" },
  { value: "1.0", label: "1.0 - Certain" },
];

export function ExperienceForm({
  experience,
  onSuccess,
  onCancel,
}: ExperienceFormProps) {
  const { scope } = useUIStore();
  const isEdit = !!experience;

  type ExperienceLevel = "case" | "strategy";

  const [formData, setFormData] = useState<{
    title: string;
    content: string;
    scenario: string;
    outcome: string;
    level: ExperienceLevel;
    confidence: string;
  }>({
    title: experience?.title ?? "",
    content: experience?.content ?? "",
    scenario: experience?.scenario ?? "",
    outcome: experience?.outcome ?? "",
    level: experience?.level ?? "case",
    confidence: experience?.confidence?.toString() ?? "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateExperience();
  const updateMutation = useUpdateExperience();

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
          id: experience.id,
          title: formData.title,
          content: formData.content,
          scenario: formData.scenario || undefined,
          outcome: formData.outcome || undefined,
          level: formData.level as "case" | "strategy",
          confidence: formData.confidence
            ? parseFloat(formData.confidence)
            : undefined,
          changeReason: "Updated via dashboard",
        });
        toast.success("Experience updated");
      } else {
        const input: CreateExperienceInput = {
          title: formData.title,
          content: formData.content,
          scopeType: scope.type === "project" ? "project" : "global",
          ...(scope.type === "project" && { scopeId: scope.projectId }),
          ...(formData.scenario && { scenario: formData.scenario }),
          ...(formData.outcome && { outcome: formData.outcome }),
          level: formData.level as "case" | "strategy",
          ...(formData.confidence && {
            confidence: parseFloat(formData.confidence),
          }),
        };
        await createMutation.mutateAsync(input);
        toast.success("Experience created");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        isEdit ? "Failed to update experience" : "Failed to create experience",
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
        placeholder="e.g., Fixed auth token expiry bug"
      />

      <Textarea
        label="Content"
        value={formData.content}
        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        error={errors.content}
        placeholder="Describe the learning or insight..."
        rows={4}
      />

      <Textarea
        label="Scenario (optional)"
        value={formData.scenario}
        onChange={(e) => setFormData({ ...formData, scenario: e.target.value })}
        placeholder="What triggered this experience?"
        rows={2}
      />

      <Textarea
        label="Outcome (optional)"
        value={formData.outcome}
        onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
        placeholder="What was the result?"
        rows={2}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Level"
          value={formData.level}
          onChange={(value) =>
            setFormData({ ...formData, level: value as ExperienceLevel })
          }
          options={levelOptions}
        />

        <Select
          label="Confidence"
          value={formData.confidence}
          onChange={(value) => setFormData({ ...formData, confidence: value })}
          options={confidenceOptions}
        />
      </div>

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

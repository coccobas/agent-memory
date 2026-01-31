import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useCreateTool, useUpdateTool } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Tool } from "@/api/types";
import type { CreateToolInput } from "@/api/hooks/use-mutations";

interface ToolFormProps {
  tool?: Tool;
  onSuccess: () => void;
  onCancel: () => void;
}

const categoryOptions = [
  { value: "mcp", label: "MCP" },
  { value: "cli", label: "CLI" },
  { value: "function", label: "Function" },
  { value: "api", label: "API" },
];

export function ToolForm({ tool, onSuccess, onCancel }: ToolFormProps) {
  const { scope } = useUIStore();
  const isEdit = !!tool;

  type ToolCategory = "mcp" | "cli" | "function" | "api";

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    category: ToolCategory;
    constraints: string;
    parametersJson: string;
  }>({
    name: tool?.name ?? "",
    description: tool?.description ?? "",
    category: tool?.category ?? "function",
    constraints: tool?.constraints ?? "",
    parametersJson: tool?.parameters
      ? JSON.stringify(tool.parameters, null, 2)
      : "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateTool();
  const updateMutation = useUpdateTool();

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (formData.parametersJson) {
      try {
        JSON.parse(formData.parametersJson);
      } catch {
        newErrors.parametersJson = "Invalid JSON";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const parameters = formData.parametersJson
      ? JSON.parse(formData.parametersJson)
      : undefined;

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: tool.id,
          description: formData.description || undefined,
          category: formData.category as "mcp" | "cli" | "function" | "api",
          constraints: formData.constraints || undefined,
          parameters,
          changeReason: "Updated via dashboard",
        });
        toast.success("Tool updated");
      } else {
        const input: CreateToolInput = {
          name: formData.name,
          category: formData.category as "mcp" | "cli" | "function" | "api",
          scopeType: scope.type === "project" ? "project" : "global",
          ...(scope.type === "project" && { scopeId: scope.projectId }),
          ...(formData.description && { description: formData.description }),
          ...(formData.constraints && { constraints: formData.constraints }),
          ...(parameters && { parameters }),
        };
        await createMutation.mutateAsync(input);
        toast.success("Tool created");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        isEdit ? "Failed to update tool" : "Failed to create tool",
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
        placeholder="e.g., run-tests"
      />

      <Textarea
        label="Description"
        value={formData.description}
        onChange={(e) =>
          setFormData({ ...formData, description: e.target.value })
        }
        placeholder="What does this tool do?"
        rows={2}
      />

      <Select
        label="Category"
        value={formData.category}
        onChange={(value) =>
          setFormData({ ...formData, category: value as ToolCategory })
        }
        options={categoryOptions}
      />

      <Textarea
        label="Parameters (JSON, optional)"
        value={formData.parametersJson}
        onChange={(e) =>
          setFormData({ ...formData, parametersJson: e.target.value })
        }
        error={errors.parametersJson}
        placeholder='{"arg1": {"type": "string", "description": "..."}}'
        rows={4}
        className="font-mono text-sm"
      />

      <Textarea
        label="Constraints (optional)"
        value={formData.constraints}
        onChange={(e) =>
          setFormData({ ...formData, constraints: e.target.value })
        }
        placeholder="Any limitations or constraints for using this tool..."
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

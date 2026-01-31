import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ToolDetail } from "@/components/ui/entry-detail";
import { ToolForm } from "@/components/forms";
import { toast } from "@/components/ui/toast";
import { useTools, useDeleteTool } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Tool } from "@/api/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const categoryColors: Record<
  string,
  "default" | "secondary" | "destructive" | "warning"
> = {
  mcp: "default",
  cli: "secondary",
  function: "warning",
  api: "destructive",
};

export function ToolsPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === "project" ? "project" : "global";
  const scopeId = scope.type === "project" ? scope.projectId : undefined;
  const { data, isLoading, error } = useTools(scopeType, scopeId);
  const deleteMutation = useDeleteTool();

  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);

  const handleCreate = () => {
    setEditingTool(null);
    setIsFormOpen(true);
  };

  const handleEdit = (tool: Tool, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTool(tool);
    setIsFormOpen(true);
  };

  const handleDelete = async (tool: Tool, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete tool "${tool.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(tool.id);
      toast.success("Tool deleted");
    } catch (error) {
      toast.error(
        "Failed to delete tool",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingTool(null);
  };

  const columns: ColumnDef<Tool, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium font-mono">{row.getValue("name")}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => {
          const category = row.getValue("category") as Tool["category"];
          return (
            <Badge variant={categoryColors[category] ?? "secondary"}>
              {category.toUpperCase()}
            </Badge>
          );
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => {
          const description = row.getValue("description") as string | undefined;
          if (!description) {
            return <span className="text-muted-foreground">-</span>;
          }
          const truncated =
            description.length > 100
              ? description.slice(0, 100) + "..."
              : description;
          return (
            <span className="text-muted-foreground" title={description}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => {
          const isActive = row.getValue("isActive") as boolean;
          return (
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "Active" : "Inactive"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDate(row.getValue("createdAt")),
      },
      {
        id: "actions",
        header: "",
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
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ),
      },
    ],
    [handleEdit, handleDelete],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-muted-foreground">
            Tool definitions and reusable patterns
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Tool
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No tools found"
        onRowClick={setSelectedTool}
      />

      <Modal
        isOpen={selectedTool !== null}
        onClose={() => setSelectedTool(null)}
        title={selectedTool?.name ?? "Tool Details"}
        size="2xl"
      >
        {selectedTool && <ToolDetail tool={selectedTool} />}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTool(null);
        }}
        title={editingTool ? "Edit Tool" : "Create Tool"}
        size="lg"
      >
        <ToolForm
          tool={editingTool ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingTool(null);
          }}
        />
      </Modal>
    </div>
  );
}

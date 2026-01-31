import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { GuidelineDetail } from "@/components/ui/entry-detail";
import { GuidelineForm } from "@/components/forms";
import { toast } from "@/components/ui/toast";
import { useGuidelines, useDeleteGuideline } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Guideline } from "@/api/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function GuidelinesPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === "project" ? "project" : "global";
  const scopeId = scope.type === "project" ? scope.projectId : undefined;
  const { data, isLoading, error } = useGuidelines(scopeType, scopeId);
  const deleteMutation = useDeleteGuideline();

  const [selectedGuideline, setSelectedGuideline] = useState<Guideline | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGuideline, setEditingGuideline] = useState<Guideline | null>(
    null,
  );

  const handleCreate = () => {
    setEditingGuideline(null);
    setIsFormOpen(true);
  };

  const handleEdit = (guideline: Guideline, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGuideline(guideline);
    setIsFormOpen(true);
  };

  const handleDelete = async (guideline: Guideline, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete guideline "${guideline.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(guideline.id);
      toast.success("Guideline deleted");
    } catch (error) {
      toast.error(
        "Failed to delete guideline",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingGuideline(null);
  };

  const columns: ColumnDef<Guideline, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("name")}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => {
          const category = row.getValue("category") as string | undefined;
          return category ? (
            <Badge variant="secondary">{category}</Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => {
          const priority = row.getValue("priority") as number | undefined;
          if (priority === undefined) {
            return <span className="text-muted-foreground">-</span>;
          }
          const variant =
            priority >= 80
              ? "destructive"
              : priority >= 50
                ? "default"
                : "secondary";
          return <Badge variant={variant}>{priority}</Badge>;
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
        accessorKey: "content",
        header: "Content",
        cell: ({ row }) => {
          const content = row.getValue("content") as string;
          const truncated =
            content.length > 100 ? content.slice(0, 100) + "..." : content;
          return (
            <span className="text-muted-foreground" title={content}>
              {truncated}
            </span>
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
          <h1 className="text-2xl font-bold">Guidelines</h1>
          <p className="text-muted-foreground">
            Coding and behavioral guidelines stored in memory
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Guideline
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No guidelines found"
        onRowClick={setSelectedGuideline}
      />

      <Modal
        isOpen={selectedGuideline !== null}
        onClose={() => setSelectedGuideline(null)}
        title={selectedGuideline?.name ?? "Guideline Details"}
        size="2xl"
      >
        {selectedGuideline && <GuidelineDetail guideline={selectedGuideline} />}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingGuideline(null);
        }}
        title={editingGuideline ? "Edit Guideline" : "Create Guideline"}
        size="lg"
      >
        <GuidelineForm
          guideline={editingGuideline ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingGuideline(null);
          }}
        />
      </Modal>
    </div>
  );
}

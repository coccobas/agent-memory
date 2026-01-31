import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { KnowledgeDetail } from "@/components/ui/entry-detail";
import { KnowledgeForm } from "@/components/forms";
import { toast } from "@/components/ui/toast";
import { useKnowledge, useDeleteKnowledge } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Knowledge } from "@/api/types";

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
  decision: "default",
  fact: "secondary",
  context: "warning",
  reference: "warning",
};

export function KnowledgePage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === "project" ? "project" : "global";
  const scopeId = scope.type === "project" ? scope.projectId : undefined;
  const { data, isLoading, error } = useKnowledge(scopeType, scopeId);
  const deleteMutation = useDeleteKnowledge();

  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<Knowledge | null>(
    null,
  );

  const handleCreate = () => {
    setEditingKnowledge(null);
    setIsFormOpen(true);
  };

  const handleEdit = (knowledge: Knowledge, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingKnowledge(knowledge);
    setIsFormOpen(true);
  };

  const handleDelete = async (knowledge: Knowledge, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete knowledge "${knowledge.title}"?`)) return;
    try {
      await deleteMutation.mutateAsync(knowledge.id);
      toast.success("Knowledge deleted");
    } catch (error) {
      toast.error(
        "Failed to delete knowledge",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingKnowledge(null);
  };

  const columns: ColumnDef<Knowledge, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("title")}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        cell: ({ row }) => {
          const category = row.getValue("category") as Knowledge["category"];
          return (
            <Badge variant={categoryColors[category] ?? "secondary"}>
              {category}
            </Badge>
          );
        },
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) => {
          const confidence = row.getValue("confidence") as number | undefined;
          if (confidence === undefined) {
            return <span className="text-muted-foreground">-</span>;
          }
          const pct = Math.round(confidence * 100);
          const variant =
            pct >= 80 ? "default" : pct >= 50 ? "secondary" : "warning";
          return <Badge variant={variant}>{pct}%</Badge>;
        },
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => {
          const source = row.getValue("source") as string | undefined;
          return source ? (
            <span className="text-sm">{source}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "content",
        header: "Content",
        cell: ({ row }) => {
          const content = row.getValue("content") as string;
          const truncated =
            content.length > 80 ? content.slice(0, 80) + "..." : content;
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
          <h1 className="text-2xl font-bold">Knowledge</h1>
          <p className="text-muted-foreground">
            Facts, decisions, and context stored in memory
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Knowledge
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No knowledge entries found"
        onRowClick={setSelectedKnowledge}
      />

      <Modal
        isOpen={selectedKnowledge !== null}
        onClose={() => setSelectedKnowledge(null)}
        title={selectedKnowledge?.title ?? "Knowledge Details"}
        size="2xl"
      >
        {selectedKnowledge && <KnowledgeDetail knowledge={selectedKnowledge} />}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingKnowledge(null);
        }}
        title={editingKnowledge ? "Edit Knowledge" : "Create Knowledge"}
        size="lg"
      >
        <KnowledgeForm
          knowledge={editingKnowledge ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingKnowledge(null);
          }}
        />
      </Modal>
    </div>
  );
}

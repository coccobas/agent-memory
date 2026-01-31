import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ExperienceDetail } from "@/components/ui/entry-detail";
import { ExperienceForm } from "@/components/forms";
import { toast } from "@/components/ui/toast";
import { useExperiences, useDeleteExperience } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { Experience } from "@/api/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ExperiencesPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === "project" ? "project" : "global";
  const scopeId = scope.type === "project" ? scope.projectId : undefined;
  const { data, isLoading, error } = useExperiences(scopeType, scopeId);
  const deleteMutation = useDeleteExperience();

  const [selectedExperience, setSelectedExperience] =
    useState<Experience | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<Experience | null>(
    null,
  );

  const handleCreate = () => {
    setEditingExperience(null);
    setIsFormOpen(true);
  };

  const handleEdit = (experience: Experience, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingExperience(experience);
    setIsFormOpen(true);
  };

  const handleDelete = async (experience: Experience, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete experience "${experience.title}"?`)) return;
    try {
      await deleteMutation.mutateAsync(experience.id);
      toast.success("Experience deleted");
    } catch (error) {
      toast.error(
        "Failed to delete experience",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingExperience(null);
  };

  const columns: ColumnDef<Experience, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("title")}</span>
        ),
      },
      {
        accessorKey: "level",
        header: "Level",
        cell: ({ row }) => {
          const level = row.getValue("level") as Experience["level"];
          const variant = level === "strategy" ? "default" : "secondary";
          return <Badge variant={variant}>{level}</Badge>;
        },
      },
      {
        accessorKey: "scenario",
        header: "Scenario",
        cell: ({ row }) => {
          const scenario = row.getValue("scenario") as string | undefined;
          if (!scenario) {
            return <span className="text-muted-foreground">-</span>;
          }
          const truncated =
            scenario.length > 60 ? scenario.slice(0, 60) + "..." : scenario;
          return (
            <span className="text-muted-foreground" title={scenario}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "outcome",
        header: "Outcome",
        cell: ({ row }) => {
          const outcome = row.getValue("outcome") as string | undefined;
          if (!outcome) {
            return <span className="text-muted-foreground">-</span>;
          }
          const isSuccess =
            outcome.toLowerCase().includes("success") ||
            outcome.toLowerCase().includes("fixed") ||
            outcome.toLowerCase().includes("resolved");
          const isFailure =
            outcome.toLowerCase().includes("fail") ||
            outcome.toLowerCase().includes("error");

          const truncated =
            outcome.length > 50 ? outcome.slice(0, 50) + "..." : outcome;

          return (
            <Badge
              variant={
                isSuccess ? "default" : isFailure ? "destructive" : "secondary"
              }
              title={outcome}
            >
              {truncated}
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
          <h1 className="text-2xl font-bold">Experiences</h1>
          <p className="text-muted-foreground">
            Learned patterns from past interactions
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Experience
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        error={error}
        emptyMessage="No experiences found"
        onRowClick={setSelectedExperience}
      />

      <Modal
        isOpen={selectedExperience !== null}
        onClose={() => setSelectedExperience(null)}
        title={selectedExperience?.title ?? "Experience Details"}
        size="2xl"
      >
        {selectedExperience && (
          <ExperienceDetail experience={selectedExperience} />
        )}
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingExperience(null);
        }}
        title={editingExperience ? "Edit Experience" : "Create Experience"}
        size="lg"
      >
        <ExperienceForm
          experience={editingExperience ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingExperience(null);
          }}
        />
      </Modal>
    </div>
  );
}

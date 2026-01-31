import { Badge } from "@/components/ui/badge";
import type { Guideline, Knowledge, Tool, Experience } from "@/api/types";

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function DetailField({ label, value, mono }: DetailFieldProps) {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : "text-sm"}>{value}</dd>
    </div>
  );
}

function formatDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ============================================================
// GUIDELINE DETAIL
// ============================================================

interface GuidelineDetailProps {
  guideline: Guideline;
}

export function GuidelineDetail({ guideline }: GuidelineDetailProps) {
  return (
    <dl className="space-y-6">
      <DetailField label="Name" value={guideline.name} mono />

      <DetailField
        label="Status"
        value={
          <Badge variant={guideline.isActive ? "default" : "secondary"}>
            {guideline.isActive ? "Active" : "Inactive"}
          </Badge>
        }
      />

      {guideline.category && (
        <DetailField
          label="Category"
          value={<Badge variant="secondary">{guideline.category}</Badge>}
        />
      )}

      {guideline.priority !== undefined && (
        <DetailField
          label="Priority"
          value={
            <Badge
              variant={
                guideline.priority >= 80
                  ? "destructive"
                  : guideline.priority >= 50
                    ? "default"
                    : "secondary"
              }
            >
              {guideline.priority}
            </Badge>
          }
        />
      )}

      <DetailField
        label="Content"
        value={
          <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
            {guideline.content}
          </div>
        }
      />

      {guideline.rationale && (
        <DetailField
          label="Rationale"
          value={
            <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
              {guideline.rationale}
            </div>
          }
        />
      )}

      <div className="border-t border-border pt-4 space-y-4">
        <DetailField label="ID" value={guideline.id} mono />
        <DetailField
          label="Scope"
          value={`${guideline.scopeType}${guideline.scopeId ? ` / ${guideline.scopeId}` : ""}`}
        />
        <DetailField label="Created" value={formatDate(guideline.createdAt)} />
        <DetailField label="Updated" value={formatDate(guideline.updatedAt)} />
      </div>
    </dl>
  );
}

// ============================================================
// KNOWLEDGE DETAIL
// ============================================================

interface KnowledgeDetailProps {
  knowledge: Knowledge;
}

export function KnowledgeDetail({ knowledge }: KnowledgeDetailProps) {
  return (
    <dl className="space-y-6">
      <DetailField label="Title" value={knowledge.title} />

      <DetailField
        label="Category"
        value={<Badge variant="secondary">{knowledge.category}</Badge>}
      />

      {knowledge.confidence !== undefined && (
        <DetailField
          label="Confidence"
          value={
            <Badge
              variant={
                knowledge.confidence >= 0.8
                  ? "default"
                  : knowledge.confidence >= 0.5
                    ? "secondary"
                    : "warning"
              }
            >
              {Math.round(knowledge.confidence * 100)}%
            </Badge>
          }
        />
      )}

      {knowledge.source && (
        <DetailField label="Source" value={knowledge.source} />
      )}

      <DetailField
        label="Content"
        value={
          <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
            {knowledge.content}
          </div>
        }
      />

      <div className="border-t border-border pt-4 space-y-4">
        <DetailField label="ID" value={knowledge.id} mono />
        <DetailField
          label="Scope"
          value={`${knowledge.scopeType}${knowledge.scopeId ? ` / ${knowledge.scopeId}` : ""}`}
        />
        <DetailField label="Created" value={formatDate(knowledge.createdAt)} />
        <DetailField label="Updated" value={formatDate(knowledge.updatedAt)} />
      </div>
    </dl>
  );
}

// ============================================================
// TOOL DETAIL
// ============================================================

interface ToolDetailProps {
  tool: Tool;
}

export function ToolDetail({ tool }: ToolDetailProps) {
  return (
    <dl className="space-y-6">
      <DetailField label="Name" value={tool.name} mono />

      <DetailField
        label="Status"
        value={
          <Badge variant={tool.isActive ? "default" : "secondary"}>
            {tool.isActive ? "Active" : "Inactive"}
          </Badge>
        }
      />

      <DetailField
        label="Category"
        value={<Badge variant="secondary">{tool.category.toUpperCase()}</Badge>}
      />

      {tool.description && (
        <DetailField
          label="Description"
          value={
            <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
              {tool.description}
            </div>
          }
        />
      )}

      {tool.constraints && (
        <DetailField
          label="Constraints"
          value={
            <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
              {tool.constraints}
            </div>
          }
        />
      )}

      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
        <DetailField
          label="Parameters"
          value={
            <pre className="bg-muted/50 rounded-md p-4 text-xs overflow-x-auto">
              {JSON.stringify(tool.parameters, null, 2)}
            </pre>
          }
        />
      )}

      <div className="border-t border-border pt-4 space-y-4">
        <DetailField label="ID" value={tool.id} mono />
        <DetailField
          label="Scope"
          value={`${tool.scopeType}${tool.scopeId ? ` / ${tool.scopeId}` : ""}`}
        />
        <DetailField label="Created" value={formatDate(tool.createdAt)} />
        <DetailField label="Updated" value={formatDate(tool.updatedAt)} />
      </div>
    </dl>
  );
}

// ============================================================
// EXPERIENCE DETAIL
// ============================================================

interface ExperienceDetailProps {
  experience: Experience;
}

export function ExperienceDetail({ experience }: ExperienceDetailProps) {
  return (
    <dl className="space-y-6">
      <DetailField label="Title" value={experience.title} />

      <DetailField
        label="Level"
        value={
          <Badge
            variant={experience.level === "strategy" ? "default" : "secondary"}
          >
            {experience.level}
          </Badge>
        }
      />

      {experience.confidence !== undefined && (
        <DetailField
          label="Confidence"
          value={
            <Badge
              variant={
                experience.confidence >= 0.8
                  ? "default"
                  : experience.confidence >= 0.5
                    ? "secondary"
                    : "warning"
              }
            >
              {Math.round(experience.confidence * 100)}%
            </Badge>
          }
        />
      )}

      {experience.scenario && (
        <DetailField
          label="Scenario"
          value={
            <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
              {experience.scenario}
            </div>
          }
        />
      )}

      <DetailField
        label="Content"
        value={
          <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
            {experience.content}
          </div>
        }
      />

      {experience.outcome && (
        <DetailField
          label="Outcome"
          value={
            <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-4 text-sm">
              {experience.outcome}
            </div>
          }
        />
      )}

      <div className="border-t border-border pt-4 space-y-4">
        <DetailField label="ID" value={experience.id} mono />
        <DetailField
          label="Scope"
          value={`${experience.scopeType}${experience.scopeId ? ` / ${experience.scopeId}` : ""}`}
        />
        <DetailField label="Created" value={formatDate(experience.createdAt)} />
        <DetailField label="Updated" value={formatDate(experience.updatedAt)} />
      </div>
    </dl>
  );
}

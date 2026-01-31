import { ChevronDown, Globe, Folder } from "lucide-react";
import { useProjects } from "@/api/hooks";
import { useUIStore, type ScopeSelection } from "@/stores/ui.store";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

export function ScopeSelector() {
  const { data: projects, isLoading } = useProjects();
  const { scope, setScope } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (selection: ScopeSelection) => {
    setScope(selection);
    setIsOpen(false);
  };

  const currentLabel =
    scope.type === "global" ? "Global" : scope.projectName || "Project";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm",
          "bg-muted/50 hover:bg-muted transition-colors",
          "border border-border",
        )}
      >
        {scope.type === "global" ? (
          <Globe className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Folder className="h-4 w-4 text-primary" />
        )}
        <span className="font-medium">{currentLabel}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 rounded-md border border-border bg-card shadow-lg z-50">
          <div className="p-1">
            <button
              onClick={() => handleSelect({ type: "global" })}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left",
                "hover:bg-muted transition-colors",
                scope.type === "global" && "bg-muted",
              )}
            >
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">Global</div>
                <div className="text-xs text-muted-foreground">
                  All entries across projects
                </div>
              </div>
            </button>

            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                Loading projects...
              </div>
            ) : projects && projects.length > 0 ? (
              <>
                <div className="border-t border-border my-1" />
                <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Projects
                </div>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() =>
                      handleSelect({
                        type: "project",
                        projectId: project.id,
                        projectName: project.name,
                      })
                    }
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left",
                      "hover:bg-muted transition-colors",
                      scope.type === "project" &&
                        scope.projectId === project.id &&
                        "bg-muted",
                    )}
                  >
                    <Folder className="h-4 w-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{project.name}</div>
                      {project.rootPath && (
                        <div className="text-xs text-muted-foreground truncate">
                          {project.rootPath}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </>
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No projects found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState, useRef, useEffect } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForceGraph, GraphLegend } from "@/components/ui/force-graph";
import { useGraphNodes, useGraphEdges } from "@/api/hooks";
import { useUIStore } from "@/stores/ui.store";
import type { GraphNode, GraphEdge } from "@/api/types";
import { LayoutGrid, Network, X } from "lucide-react";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncateId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) + "..." : id;
}

type ViewMode = "graph" | "table";

const PANEL_WIDTH = 320;

export function GraphPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === "project" ? "project" : "global";
  const scopeId = scope.type === "project" ? scope.projectId : undefined;
  const nodes = useGraphNodes(scopeType, scopeId);
  const edges = useGraphEdges();

  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphDimensions, setGraphDimensions] = useState({
    width: 800,
    height: 600,
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const panelOffset = selectedNode ? PANEL_WIDTH + 16 : 0;
        setGraphDimensions({
          width: Math.max(rect.width - panelOffset, 400),
          height: Math.max(window.innerHeight - 200, 400),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [selectedNode]);

  const nodeColumns: ColumnDef<GraphNode, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.getValue("name")}</span>
        ),
      },
      {
        accessorKey: "nodeTypeName",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.getValue("nodeTypeName")}</Badge>
        ),
      },
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => {
          const id = row.getValue("id") as string;
          return (
            <span
              className="font-mono text-xs text-muted-foreground"
              title={id}
            >
              {truncateId(id)}
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
    ],
    [],
  );

  const edgeColumns: ColumnDef<GraphEdge, unknown>[] = useMemo(
    () => [
      {
        accessorKey: "edgeTypeName",
        header: "Relation",
        cell: ({ row }) => (
          <Badge variant="default">{row.getValue("edgeTypeName")}</Badge>
        ),
      },
      {
        accessorKey: "sourceId",
        header: "Source",
        cell: ({ row }) => {
          const id = row.getValue("sourceId") as string;
          return (
            <span
              className="font-mono text-xs text-muted-foreground"
              title={id}
            >
              {truncateId(id)}
            </span>
          );
        },
      },
      {
        accessorKey: "targetId",
        header: "Target",
        cell: ({ row }) => {
          const id = row.getValue("targetId") as string;
          return (
            <span
              className="font-mono text-xs text-muted-foreground"
              title={id}
            >
              {truncateId(id)}
            </span>
          );
        },
      },
      {
        accessorKey: "weight",
        header: "Weight",
        cell: ({ row }) => {
          const weight = row.getValue("weight") as number | undefined;
          return weight !== undefined ? (
            <span>{weight.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => formatDate(row.getValue("createdAt")),
      },
    ],
    [],
  );

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Graph</h1>
            <p className="text-sm text-muted-foreground">
              {nodes.data?.length ?? 0} nodes · {edges.data?.length ?? 0} edges
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setViewMode("graph")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "graph"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Network className="h-4 w-4" />
            Graph
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === "table"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Tables
          </button>
        </div>
      </div>

      {viewMode === "graph" ? (
        <div ref={containerRef} className="flex gap-4">
          <div className="flex-1 space-y-2">
            <GraphLegend />
            {nodes.isLoading || edges.isLoading ? (
              <div
                className="flex items-center justify-center bg-card border border-border rounded-lg"
                style={{ height: graphDimensions.height }}
              >
                <p className="text-muted-foreground">Loading graph data...</p>
              </div>
            ) : nodes.error || edges.error ? (
              <div
                className="flex items-center justify-center bg-card border border-border rounded-lg"
                style={{ height: graphDimensions.height }}
              >
                <p className="text-destructive">Error loading graph data</p>
              </div>
            ) : (
              <ForceGraph
                data={{ nodes: nodes.data ?? [], edges: edges.data ?? [] }}
                width={graphDimensions.width}
                height={graphDimensions.height}
                selectedNodeId={selectedNode?.id}
                onNodeClick={handleNodeClick}
              />
            )}
          </div>

          {selectedNode && (
            <div
              className="shrink-0 bg-card border border-border rounded-lg overflow-hidden"
              style={{ width: PANEL_WIDTH }}
            >
              <div className="flex items-center justify-between p-3 border-b border-border">
                <h3 className="font-semibold truncate">{selectedNode.name}</h3>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{selectedNode.nodeTypeName}</Badge>
                  <Badge
                    variant={selectedNode.isActive ? "default" : "secondary"}
                  >
                    {selectedNode.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">ID</div>
                  <div className="font-mono text-xs break-all">
                    {selectedNode.id}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Created
                  </div>
                  <div>{formatDate(selectedNode.createdAt)}</div>
                </div>

                {selectedNode.properties &&
                  Object.keys(selectedNode.properties).length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">
                        Properties
                      </div>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                        {JSON.stringify(selectedNode.properties, null, 2)}
                      </pre>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Nodes</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={nodeColumns}
                data={nodes.data ?? []}
                isLoading={nodes.isLoading}
                error={nodes.error}
                emptyMessage="No graph nodes found"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Edges</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={edgeColumns}
                data={edges.data ?? []}
                isLoading={edges.isLoading}
                error={edges.error}
                emptyMessage="No graph edges found"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

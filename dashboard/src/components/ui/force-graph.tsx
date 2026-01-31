import { useRef, useEffect, useCallback, useMemo } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphNode, GraphEdge } from "@/api/types";

const NODE_TYPE_COLORS: Record<string, string> = {
  entity: "#3b82f6",
  tool: "#22c55e",
  guideline: "#f59e0b",
  knowledge: "#8b5cf6",
  experience: "#ec4899",
  file: "#6b7280",
  function: "#14b8a6",
  class: "#f97316",
  module: "#06b6d4",
  interface: "#84cc16",
  api_endpoint: "#ef4444",
  task: "#a855f7",
  component: "#0ea5e9",
  dependency: "#64748b",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  related_to: "#94a3b8",
  depends_on: "#f87171",
  imports: "#60a5fa",
  contains: "#4ade80",
  calls: "#facc15",
  implements: "#c084fc",
  extends: "#fb923c",
  applies_to: "#2dd4bf",
  supersedes: "#f472b6",
  conflicts_with: "#ef4444",
  parent_of: "#a3e635",
  blocks: "#dc2626",
};

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface ForceGraphProps {
  data: GraphData;
  width: number;
  height: number;
  selectedNodeId?: string | null;
  onNodeClick?: (node: GraphNode) => void;
}

interface ForceNode {
  id: string;
  name: string;
  nodeTypeName: string;
  color: string;
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
}

interface ForceLink {
  source: string | ForceNode;
  target: string | ForceNode;
  edgeTypeName: string;
  color: string;
  weight?: number;
}

export function ForceGraph({
  data,
  width,
  height,
  selectedNodeId,
  onNodeClick,
}: ForceGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<ForceGraphMethods<any, any>>(undefined);

  const graphData = useMemo(() => {
    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));

    const nodes: ForceNode[] = data.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      nodeTypeName: node.nodeTypeName,
      color: NODE_TYPE_COLORS[node.nodeTypeName] || "#6b7280",
      properties: node.properties,
    }));

    const links: ForceLink[] = data.edges
      .filter(
        (edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId),
      )
      .map((edge) => ({
        source: edge.sourceId,
        target: edge.targetId,
        edgeTypeName: edge.edgeTypeName,
        color: EDGE_TYPE_COLORS[edge.edgeTypeName] || "#94a3b8",
        weight: edge.weight,
      }));

    return { nodes, links };
  }, [data]);

  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 50);
      }, 500);
    }
  }, [graphData]);

  const paintNode = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = selectedNodeId === node.id;
      const nodeRadius = isSelected ? 10 : 6;

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = (isSelected ? 3 : 1) / globalScale;
      ctx.stroke();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, nodeRadius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }
    },
    [selectedNodeId],
  );

  const paintLink = useCallback(
    (link: ForceLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = link.source as ForceNode;
      const target = link.target as ForceNode;

      if (!source.x || !source.y || !target.x || !target.y) return;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = link.color;
      ctx.lineWidth = ((link.weight ?? 1) * 1.5) / globalScale;
      ctx.stroke();

      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowSize = 4 / globalScale;

      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(
        midX - arrowSize * Math.cos(angle - Math.PI / 6),
        midY - arrowSize * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        midX - arrowSize * Math.cos(angle + Math.PI / 6),
        midY - arrowSize * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fillStyle = link.color;
      ctx.fill();
    },
    [],
  );

  const handleNodeClick = useCallback(
    (node: ForceNode) => {
      if (onNodeClick) {
        const originalNode = data.nodes.find((n) => n.id === node.id);
        if (originalNode) {
          onNodeClick(originalNode);
        }
      }
    },
    [onNodeClick, data.nodes],
  );

  if (graphData.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-card border border-border rounded-lg"
        style={{ width, height }}
      >
        <p className="text-muted-foreground">No graph data to display</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={width}
        height={height}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, 10, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={paintLink}
        linkDirectionalArrowLength={0}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        backgroundColor="transparent"
      />
    </div>
  );
}

export function GraphLegend() {
  const nodeTypes = Object.entries(NODE_TYPE_COLORS).slice(0, 8);
  const edgeTypes = Object.entries(EDGE_TYPE_COLORS).slice(0, 6);

  return (
    <div className="flex flex-wrap gap-4 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {nodeTypes.map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-muted-foreground">{type}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {edgeTypes.map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div className="w-3 h-0.5" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">
              {type.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

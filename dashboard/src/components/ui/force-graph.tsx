import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Minus, Plus, Maximize2, ChevronDown, ChevronRight } from 'lucide-react';
import type { GraphNode, GraphEdge } from '@/api/types';
import { cn } from '@/lib/utils';

const NODE_TYPE_COLORS: Record<string, string> = {
  entity: '#3b82f6',
  tool: '#22c55e',
  guideline: '#f59e0b',
  knowledge: '#8b5cf6',
  experience: '#ec4899',
  file: '#6b7280',
  function: '#14b8a6',
  class: '#f97316',
  module: '#06b6d4',
  interface: '#84cc16',
  api_endpoint: '#ef4444',
  task: '#a855f7',
  component: '#0ea5e9',
  dependency: '#64748b',
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  related_to: '#94a3b8',
  depends_on: '#f87171',
  imports: '#60a5fa',
  contains: '#4ade80',
  calls: '#facc15',
  implements: '#c084fc',
  extends: '#fb923c',
  applies_to: '#2dd4bf',
  supersedes: '#f472b6',
  conflicts_with: '#ef4444',
  parent_of: '#a3e635',
  blocks: '#dc2626',
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
  highlightedNodeIds?: Set<string>;
  onNodeClick?: (node: GraphNode) => void;
  onNodeHover?: (node: GraphNode | null) => void;
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
  highlightedNodeIds,
  onNodeClick,
  onNodeHover,
}: ForceGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<ForceGraphMethods<any, any>>(undefined);
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);

  const nodeIds = useMemo(() => data.nodes.map((n) => n.id).join(','), [data.nodes]);
  const edgeIds = useMemo(() => data.edges.map((e) => e.id).join(','), [data.edges]);

  const graphData = useMemo(() => {
    const nodeMap = new Map(data.nodes.map((n) => [n.id, n]));

    const nodes: ForceNode[] = data.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      nodeTypeName: node.nodeTypeName,
      color: NODE_TYPE_COLORS[node.nodeTypeName] || '#6b7280',
      properties: node.properties,
    }));

    const links: ForceLink[] = data.edges
      .filter((edge) => nodeMap.has(edge.sourceId) && nodeMap.has(edge.targetId))
      .map((edge) => ({
        source: edge.sourceId,
        target: edge.targetId,
        edgeTypeName: edge.edgeTypeName,
        color: EDGE_TYPE_COLORS[edge.edgeTypeName] || '#94a3b8',
        weight: edge.weight,
      }));

    return { nodes, links };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeIds, edgeIds]);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      setTimeout(() => {
        fgRef.current?.zoomToFit(400, 50);
      }, 500);
    }
  }, [graphData]);

  const handleZoomIn = useCallback(() => {
    if (fgRef.current) {
      const currentZoom = fgRef.current.zoom();
      fgRef.current.zoom(currentZoom * 1.5, 300);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (fgRef.current) {
      const currentZoom = fgRef.current.zoom();
      fgRef.current.zoom(currentZoom / 1.5, 300);
    }
  }, []);

  const handleZoomReset = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 50);
    }
  }, []);

  const paintNode = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSelected = selectedNodeId === node.id;
      const isHighlighted = highlightedNodeIds?.has(node.id);
      const isHovered = hoveredNode?.id === node.id;
      const nodeRadius = isSelected || isHighlighted ? 10 : isHovered ? 8 : 6;

      const isDimmed = highlightedNodeIds && highlightedNodeIds.size > 0 && !isHighlighted;

      ctx.beginPath();
      ctx.arc(node.x!, node.y!, nodeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = isDimmed ? `${node.color}40` : node.color;
      ctx.fill();

      if (isSelected || isHighlighted) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 / globalScale;
      } else if (isHovered) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / globalScale;
      } else {
        ctx.strokeStyle = isDimmed ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1 / globalScale;
      }
      ctx.stroke();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, nodeRadius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      if ((isHovered || isSelected || isHighlighted) && globalScale > 0.5) {
        const label = node.name;
        const fontSize = Math.max(12 / globalScale, 10);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const textWidth = ctx.measureText(label).width;
        const padding = 4 / globalScale;
        const labelY = node.y! + nodeRadius + 4 / globalScale;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(
          node.x! - textWidth / 2 - padding,
          labelY - padding / 2,
          textWidth + padding * 2,
          fontSize + padding
        );

        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, node.x!, labelY);
      }
    },
    [selectedNodeId, highlightedNodeIds, hoveredNode]
  );

  const paintLink = useCallback(
    (link: ForceLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = link.source as ForceNode;
      const target = link.target as ForceNode;

      if (!source.x || !source.y || !target.x || !target.y) return;

      const isDimmed =
        highlightedNodeIds &&
        highlightedNodeIds.size > 0 &&
        !highlightedNodeIds.has(source.id) &&
        !highlightedNodeIds.has(target.id);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = isDimmed ? `${link.color}20` : link.color;
      ctx.lineWidth = ((link.weight ?? 1) * 1.5) / globalScale;
      ctx.stroke();

      if (!isDimmed) {
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowSize = 4 / globalScale;

        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(
          midX - arrowSize * Math.cos(angle - Math.PI / 6),
          midY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          midX - arrowSize * Math.cos(angle + Math.PI / 6),
          midY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = link.color;
        ctx.fill();
      }
    },
    [highlightedNodeIds]
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
    [onNodeClick, data.nodes]
  );

  const handleNodeHover = useCallback(
    (node: ForceNode | null) => {
      setHoveredNode(node);
      if (onNodeHover) {
        if (node) {
          const originalNode = data.nodes.find((n) => n.id === node.id);
          onNodeHover(originalNode || null);
        } else {
          onNodeHover(null);
        }
      }
    },
    [onNodeHover, data.nodes]
  );

  if (graphData.nodes.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center bg-card border border-border rounded-lg gap-2"
        style={{ width, height }}
      >
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <svg
            className="w-8 h-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>
        <p className="text-muted-foreground font-medium">No graph data</p>
        <p className="text-sm text-muted-foreground">
          Nodes and edges will appear here once created
        </p>
      </div>
    );
  }

  return (
    <div className="relative bg-card border border-border rounded-lg overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="p-2 bg-muted/80 hover:bg-muted rounded-md transition-colors"
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 bg-muted/80 hover:bg-muted rounded-md transition-colors"
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomReset}
          className="p-2 bg-muted/80 hover:bg-muted rounded-md transition-colors"
          title="Fit to view"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

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
        onNodeHover={handleNodeHover}
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

interface GraphLegendProps {
  className?: string;
  selectedNodeType?: string | null;
  onNodeTypeClick?: (type: string | null) => void;
}

export function GraphLegend({ className, selectedNodeType, onNodeTypeClick }: GraphLegendProps) {
  const [isNodeTypesExpanded, setIsNodeTypesExpanded] = useState(true);
  const [isEdgeTypesExpanded, setIsEdgeTypesExpanded] = useState(false);

  const nodeTypes = Object.entries(NODE_TYPE_COLORS);
  const edgeTypes = Object.entries(EDGE_TYPE_COLORS);

  const handleNodeTypeClick = (type: string) => {
    if (!onNodeTypeClick) return;
    onNodeTypeClick(selectedNodeType === type ? null : type);
  };

  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', className)}>
      <button
        onClick={() => setIsNodeTypesExpanded(!isNodeTypesExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium">Node Types ({nodeTypes.length})</span>
        {isNodeTypesExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isNodeTypesExpanded && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {nodeTypes.map(([type, color]) => {
            const isSelected = selectedNodeType === type;
            const isDimmed = selectedNodeType && selectedNodeType !== type;
            return (
              <button
                key={type}
                onClick={() => handleNodeTypeClick(type)}
                className={cn(
                  'flex items-center gap-2 py-0.5 px-1 -mx-1 rounded transition-all text-left',
                  onNodeTypeClick && 'hover:bg-muted/50 cursor-pointer',
                  isSelected && 'bg-muted',
                  isDimmed && 'opacity-40'
                )}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-muted-foreground truncate">
                  {type.replace(/_/g, ' ')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-border" />

      <button
        onClick={() => setIsEdgeTypesExpanded(!isEdgeTypesExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-medium">Edge Types ({edgeTypes.length})</span>
        {isEdgeTypesExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isEdgeTypesExpanded && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {edgeTypes.map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-4 h-0.5 shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-muted-foreground truncate">
                {type.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { NODE_TYPE_COLORS, EDGE_TYPE_COLORS };

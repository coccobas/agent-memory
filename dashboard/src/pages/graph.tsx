import { useMemo, useState, useRef, useEffect } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ForceGraph, GraphLegend, NODE_TYPE_COLORS } from '@/components/ui/force-graph';
import { useGraphNodes, useGraphEdges } from '@/api/hooks';
import { useUIStore } from '@/stores/ui.store';
import type { GraphNode, GraphEdge } from '@/api/types';
import {
  LayoutGrid,
  Network,
  X,
  Search,
  ArrowRight,
  Loader2,
  Copy,
  Check,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function truncateId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) + '...' : id;
}

function capitalizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

const CATEGORY_COLORS: Record<string, string> = {
  decision: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  fact: 'bg-green-500/15 text-green-400 border-green-500/20',
  context: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  reference: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  case: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  strategy: 'bg-pink-500/15 text-pink-400 border-pink-500/20',
};

interface PropertyValueProps {
  propKey: string;
  value: unknown;
}

function PropertyValue({ propKey, value }: PropertyValueProps) {
  const lowerKey = propKey.toLowerCase();

  if (lowerKey === 'confidence' && typeof value === 'number') {
    const percentage = Math.round(value * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-8">{percentage}%</span>
      </div>
    );
  }

  if (
    (lowerKey === 'category' || lowerKey === 'source' || lowerKey === 'level') &&
    typeof value === 'string'
  ) {
    const colorClass = CATEGORY_COLORS[value.toLowerCase()] || 'bg-muted text-muted-foreground';
    return (
      <span className={cn('inline-flex px-2 py-0.5 text-xs rounded-full border', colorClass)}>
        {value}
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return <span className="text-foreground">{value ? 'Yes' : 'No'}</span>;
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <pre className="text-xs bg-muted/50 px-2 py-1 rounded overflow-auto max-h-20">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  return <span className="text-foreground">{String(value)}</span>;
}

type ViewMode = 'graph' | 'table';

const PANEL_WIDTH = 360;

interface NodeConnection {
  node: GraphNode;
  edge: GraphEdge;
  direction: 'incoming' | 'outgoing';
}

export function GraphPage() {
  const { scope } = useUIStore();
  const scopeType = scope.type === 'project' ? 'project' : 'global';
  const scopeId = scope.type === 'project' ? scope.projectId : undefined;
  const nodes = useGraphNodes(scopeType, scopeId);
  const edges = useGraphEdges();

  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hideOrphans, setHideOrphans] = useState(true);
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphDimensions, setGraphDimensions] = useState({
    width: 800,
    height: 600,
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setGraphDimensions({
          width: Math.max(rect.width, 400),
          height: Math.max(window.innerHeight - 160, 400),
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const filteredData = useMemo(() => {
    let filteredNodes = nodes.data ?? [];
    let filteredEdges = edges.data ?? [];

    if (hideOrphans) {
      const connectedNodeIds = new Set<string>();
      filteredEdges.forEach((edge) => {
        connectedNodeIds.add(edge.sourceId);
        connectedNodeIds.add(edge.targetId);
      });
      filteredNodes = filteredNodes.filter((node) => connectedNodeIds.has(node.id));
    }

    if (selectedNodeType) {
      filteredNodes = filteredNodes.filter((node) => node.nodeTypeName === selectedNodeType);
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter(
        (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
      );
    }

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [nodes.data, edges.data, hideOrphans, selectedNodeType]);

  const orphanCount = useMemo(() => {
    if (!nodes.data || !edges.data) return 0;
    const connectedNodeIds = new Set<string>();
    edges.data.forEach((edge) => {
      connectedNodeIds.add(edge.sourceId);
      connectedNodeIds.add(edge.targetId);
    });
    return nodes.data.filter((node) => !connectedNodeIds.has(node.id)).length;
  }, [nodes.data, edges.data]);

  const highlightedNodeIds = useMemo(() => {
    if (!searchQuery.trim() || !filteredData.nodes) return new Set<string>();

    const query = searchQuery.toLowerCase();
    return new Set(
      filteredData.nodes
        .filter(
          (node) =>
            node.name.toLowerCase().includes(query) ||
            node.nodeTypeName.toLowerCase().includes(query)
        )
        .map((node) => node.id)
    );
  }, [searchQuery, filteredData.nodes]);

  const nodeConnections = useMemo((): NodeConnection[] => {
    if (!selectedNode || !nodes.data || !edges.data) return [];

    const nodeMap = new Map(nodes.data.map((n) => [n.id, n]));
    const connections: NodeConnection[] = [];

    edges.data.forEach((edge) => {
      if (edge.sourceId === selectedNode.id) {
        const targetNode = nodeMap.get(edge.targetId);
        if (targetNode) {
          connections.push({ node: targetNode, edge, direction: 'outgoing' });
        }
      }
      if (edge.targetId === selectedNode.id) {
        const sourceNode = nodeMap.get(edge.sourceId);
        if (sourceNode) {
          connections.push({ node: sourceNode, edge, direction: 'incoming' });
        }
      }
    });

    return connections;
  }, [selectedNode, nodes.data, edges.data]);

  const nodeColumns: ColumnDef<GraphNode, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="font-medium text-foreground">{row.getValue('name')}</span>
        ),
      },
      {
        accessorKey: 'nodeTypeName',
        header: 'Type',
        cell: ({ row }) => {
          const type = row.getValue('nodeTypeName') as string;
          const color = NODE_TYPE_COLORS[type] || '#6b7280';
          return (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm text-muted-foreground">{type}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => {
          const id = row.getValue('id') as string;
          return (
            <span className="font-mono text-xs text-muted-foreground" title={id}>
              {truncateId(id)}
            </span>
          );
        },
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => {
          const isActive = row.getValue('isActive') as boolean;
          return (
            <Badge variant={isActive ? 'success-subtle' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.getValue('createdAt'))}
          </span>
        ),
      },
    ],
    []
  );

  const edgeColumns: ColumnDef<GraphEdge, unknown>[] = useMemo(
    () => [
      {
        accessorKey: 'edgeTypeName',
        header: 'Relation',
        cell: ({ row }) => <Badge variant="info">{row.getValue('edgeTypeName')}</Badge>,
      },
      {
        accessorKey: 'sourceId',
        header: 'Source',
        cell: ({ row }) => {
          const id = row.getValue('sourceId') as string;
          return (
            <span className="font-mono text-xs text-muted-foreground" title={id}>
              {truncateId(id)}
            </span>
          );
        },
      },
      {
        accessorKey: 'targetId',
        header: 'Target',
        cell: ({ row }) => {
          const id = row.getValue('targetId') as string;
          return (
            <span className="font-mono text-xs text-muted-foreground" title={id}>
              {truncateId(id)}
            </span>
          );
        },
      },
      {
        accessorKey: 'weight',
        header: 'Weight',
        cell: ({ row }) => {
          const weight = row.getValue('weight') as number | undefined;
          return weight !== undefined ? (
            <span className="text-sm text-muted-foreground">{weight.toFixed(2)}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.getValue('createdAt'))}
          </span>
        ),
      },
    ],
    []
  );

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  };

  const handleCopyId = async () => {
    if (!selectedNode) return;
    await navigator.clipboard.writeText(selectedNode.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const graphInputData = useMemo(
    () => ({ nodes: filteredData.nodes, edges: filteredData.edges }),
    [filteredData]
  );

  const isLoading = nodes.isLoading || edges.isLoading;
  const hasError = nodes.error || edges.error;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Knowledge Graph</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="font-normal">
              {filteredData.nodes.length} nodes
            </Badge>
            <Badge variant="secondary" className="font-normal">
              {filteredData.edges.length} edges
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {viewMode === 'graph' && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Hide Orphans</span>
                <Switch checked={hideOrphans} onChange={setHideOrphans} />
                {orphanCount > 0 && (
                  <span className="text-xs text-muted-foreground">({orphanCount})</span>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-56 rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </>
          )}

          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode('graph')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'graph'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Network className="h-4 w-4" />
              Graph
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              Tables
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'graph' ? (
        <div ref={containerRef} className="relative">
          {isLoading ? (
            <div
              className="flex flex-col items-center justify-center bg-card border border-border rounded-lg gap-3"
              style={{ height: graphDimensions.height }}
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading graph data...</p>
            </div>
          ) : hasError ? (
            <div
              className="flex flex-col items-center justify-center bg-card border border-border rounded-lg gap-2"
              style={{ height: graphDimensions.height }}
            >
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <X className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-destructive font-medium">Error loading graph data</p>
              <p className="text-sm text-muted-foreground">Please try refreshing the page</p>
            </div>
          ) : (
            <>
              <ForceGraph
                data={graphInputData}
                width={graphDimensions.width}
                height={graphDimensions.height}
                selectedNodeId={selectedNode?.id}
                highlightedNodeIds={highlightedNodeIds.size > 0 ? highlightedNodeIds : undefined}
                onNodeClick={handleNodeClick}
              />

              <GraphLegend
                className="absolute top-3 left-3 w-56 max-h-[calc(100%-24px)] overflow-auto"
                selectedNodeType={selectedNodeType}
                onNodeTypeClick={setSelectedNodeType}
              />
            </>
          )}

          {selectedNode && (
            <div
              className="absolute top-3 right-16 bg-card border border-border rounded-lg overflow-hidden shadow-xl max-h-[calc(100%-24px)] flex flex-col"
              style={{ width: PANEL_WIDTH }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      backgroundColor: NODE_TYPE_COLORS[selectedNode.nodeTypeName] || '#6b7280',
                    }}
                  />
                  <h3 className="font-semibold truncate">{selectedNode.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1.5 rounded hover:bg-muted transition-colors shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full"
                    style={{
                      backgroundColor: `${NODE_TYPE_COLORS[selectedNode.nodeTypeName] || '#6b7280'}20`,
                      color: NODE_TYPE_COLORS[selectedNode.nodeTypeName] || '#6b7280',
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: NODE_TYPE_COLORS[selectedNode.nodeTypeName] || '#6b7280',
                      }}
                    />
                    {selectedNode.nodeTypeName}
                  </span>
                  <Badge
                    variant={selectedNode.isActive ? 'success-subtle' : 'destructive-subtle'}
                    className="px-3 py-1 text-sm"
                  >
                    {selectedNode.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Created</p>
                    <p className="text-sm">{formatDate(selectedNode.createdAt)}</p>
                  </div>

                  {nodeConnections.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Connections</p>
                      <p className="text-sm font-medium">
                        {nodeConnections.length} connected nodes
                      </p>
                    </div>
                  )}

                  {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Properties</p>
                      <div className="space-y-2">
                        {Object.entries(selectedNode.properties).map(([key, value]) => (
                          <div key={key} className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              {capitalizeKey(key)}
                            </span>
                            <PropertyValue propKey={key} value={value} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {nodeConnections.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Connections ({nodeConnections.length})
                    </p>
                    <div className="space-y-1">
                      {nodeConnections.map((conn, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedNode(conn.node)}
                          className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors text-left"
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                NODE_TYPE_COLORS[conn.node.nodeTypeName] || '#6b7280',
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{conn.node.name}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {conn.direction === 'outgoing' ? (
                                <>
                                  <span>{conn.edge.edgeTypeName}</span>
                                  <ArrowRight className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  <ArrowRight className="h-3 w-3 rotate-180" />
                                  <span>{conn.edge.edgeTypeName}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border px-4 py-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono truncate flex-1">
                    {selectedNode.id}
                  </span>
                  <button
                    onClick={handleCopyId}
                    className="p-1.5 hover:bg-muted rounded transition-colors shrink-0 ml-2"
                    title="Copy ID"
                  >
                    {copiedId ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
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
                onRowClick={handleNodeClick}
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

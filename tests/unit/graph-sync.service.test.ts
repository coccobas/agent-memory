import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GraphSyncService,
  type EntrySyncMetadata,
  type RelationSyncMetadata,
} from '../../src/services/graph/sync.service.js';
import type {
  INodeRepository,
  IEdgeRepository,
  ITypeRegistry,
  GraphNodeWithVersion,
  GraphEdgeWithType,
} from '../../src/core/interfaces/repositories.js';

// Mock repositories
const createMockNodeRepo = (): INodeRepository => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
  deactivate: vi.fn(),
  reactivate: vi.fn(),
  delete: vi.fn(),
  getByEntry: vi.fn(),
});

const createMockEdgeRepo = (): IEdgeRepository => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getOutgoingEdges: vi.fn(),
  getIncomingEdges: vi.fn(),
  getNeighbors: vi.fn(),
  traverse: vi.fn(),
  findPaths: vi.fn(),
});

const createMockTypeRegistry = (): ITypeRegistry => ({
  getNodeType: vi.fn(),
  getEdgeType: vi.fn(),
  listNodeTypes: vi.fn(),
  listEdgeTypes: vi.fn(),
});

describe('GraphSyncService', () => {
  let service: GraphSyncService;
  let nodeRepo: INodeRepository;
  let edgeRepo: IEdgeRepository;
  let typeRegistry: ITypeRegistry;

  beforeEach(() => {
    nodeRepo = createMockNodeRepo();
    edgeRepo = createMockEdgeRepo();
    typeRegistry = createMockTypeRegistry();
    service = new GraphSyncService(nodeRepo, edgeRepo, typeRegistry);
  });

  describe('syncEntryToNode', () => {
    const mockMetadata: EntrySyncMetadata = {
      entryType: 'guideline',
      entryId: 'guideline-123',
      name: 'Test Guideline',
      scopeType: 'project',
      scopeId: 'project-1',
      properties: { priority: 5 },
      createdBy: 'user-1',
    };

    it('should create a new node when entry does not exist', async () => {
      // Mock: Node doesn't exist
      vi.mocked(nodeRepo.getByEntry).mockResolvedValue(undefined);

      // Mock: Node type exists
      vi.mocked(typeRegistry.getNodeType).mockResolvedValue({
        id: 1,
        name: 'guideline',
        description: 'Guideline node',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock: Node creation succeeds
      const createdNode: GraphNodeWithVersion = {
        id: 'node-1',
        nodeTypeName: 'guideline',
        scopeType: 'project',
        scopeId: 'project-1',
        name: 'Test Guideline',
        properties: { priority: 5 },
        entryId: 'guideline-123',
        entryType: 'guideline',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'user-1',
        version: 1,
      };
      vi.mocked(nodeRepo.create).mockResolvedValue(createdNode);

      const result = await service.syncEntryToNode(mockMetadata);

      expect(result).toEqual(createdNode);
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('guideline', 'guideline-123');
      expect(typeRegistry.getNodeType).toHaveBeenCalledWith('guideline');
      expect(nodeRepo.create).toHaveBeenCalledWith({
        nodeTypeName: 'guideline',
        scopeType: 'project',
        scopeId: 'project-1',
        name: 'Test Guideline',
        properties: { priority: 5 },
        entryId: 'guideline-123',
        entryType: 'guideline',
        createdBy: 'user-1',
      });
    });

    it('should return existing node when entry already has a node', async () => {
      const existingNode: GraphNodeWithVersion = {
        id: 'existing-node',
        nodeTypeName: 'guideline',
        scopeType: 'project',
        scopeId: 'project-1',
        name: 'Test Guideline',
        properties: {},
        entryId: 'guideline-123',
        entryType: 'guideline',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(nodeRepo.getByEntry).mockResolvedValue(existingNode);

      const result = await service.syncEntryToNode(mockMetadata);

      expect(result).toEqual(existingNode);
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('guideline', 'guideline-123');
      expect(nodeRepo.create).not.toHaveBeenCalled();
    });

    it('should return null when node type does not exist', async () => {
      vi.mocked(nodeRepo.getByEntry).mockResolvedValue(undefined);
      vi.mocked(typeRegistry.getNodeType).mockResolvedValue(undefined);

      const result = await service.syncEntryToNode(mockMetadata);

      expect(result).toBeNull();
      expect(typeRegistry.getNodeType).toHaveBeenCalledWith('guideline');
      expect(nodeRepo.create).not.toHaveBeenCalled();
    });

    it('should return null and log error when node creation fails', async () => {
      vi.mocked(nodeRepo.getByEntry).mockResolvedValue(undefined);
      vi.mocked(typeRegistry.getNodeType).mockResolvedValue({
        id: 1,
        name: 'guideline',
        description: 'Guideline node',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(nodeRepo.create).mockRejectedValue(new Error('Database connection failed'));

      const result = await service.syncEntryToNode(mockMetadata);

      expect(result).toBeNull();
      expect(nodeRepo.create).toHaveBeenCalled();
    });

    it('should handle different entry types', async () => {
      const knowledgeMetadata: EntrySyncMetadata = {
        entryType: 'knowledge',
        entryId: 'knowledge-456',
        name: 'Test Knowledge',
        scopeType: 'global',
      };

      vi.mocked(nodeRepo.getByEntry).mockResolvedValue(undefined);
      vi.mocked(typeRegistry.getNodeType).mockResolvedValue({
        id: 2,
        name: 'knowledge',
        description: 'Knowledge node',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(nodeRepo.create).mockResolvedValue({
        id: 'node-2',
        nodeTypeName: 'knowledge',
        scopeType: 'global',
        name: 'Test Knowledge',
        properties: {},
        entryId: 'knowledge-456',
        entryType: 'knowledge',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await service.syncEntryToNode(knowledgeMetadata);

      expect(result).toBeTruthy();
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('knowledge', 'knowledge-456');
    });
  });

  describe('syncRelationToEdge', () => {
    const mockRelationMetadata: RelationSyncMetadata = {
      relationType: 'depends_on',
      sourceEntryId: 'guideline-1',
      sourceEntryType: 'guideline',
      targetEntryId: 'tool-1',
      targetEntryType: 'tool',
      properties: { weight: 0.8 },
      createdBy: 'user-1',
    };

    const sourceNode: GraphNodeWithVersion = {
      id: 'node-source',
      nodeTypeName: 'guideline',
      scopeType: 'project',
      scopeId: 'project-1',
      name: 'Source Guideline',
      properties: {},
      entryId: 'guideline-1',
      entryType: 'guideline',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    const targetNode: GraphNodeWithVersion = {
      id: 'node-target',
      nodeTypeName: 'tool',
      scopeType: 'project',
      scopeId: 'project-1',
      name: 'Target Tool',
      properties: {},
      entryId: 'tool-1',
      entryType: 'tool',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    it('should create edge when both nodes exist and edge does not', async () => {
      // Mock: Both nodes exist
      vi.mocked(nodeRepo.getByEntry)
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(targetNode);

      // Mock: No existing edges
      vi.mocked(edgeRepo.getOutgoingEdges).mockResolvedValue([]);

      // Mock: Edge type exists
      vi.mocked(typeRegistry.getEdgeType).mockResolvedValue({
        id: 1,
        name: 'depends_on',
        description: 'Dependency edge',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Mock: Edge creation succeeds
      const createdEdge: GraphEdgeWithType = {
        id: 'edge-1',
        edgeTypeName: 'depends_on',
        sourceId: 'node-source',
        targetId: 'node-target',
        properties: { weight: 0.8 },
        weight: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'user-1',
      };
      vi.mocked(edgeRepo.create).mockResolvedValue(createdEdge);

      const result = await service.syncRelationToEdge(mockRelationMetadata);

      expect(result).toEqual(createdEdge);
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('guideline', 'guideline-1');
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('tool', 'tool-1');
      expect(edgeRepo.getOutgoingEdges).toHaveBeenCalledWith('node-source', 'depends_on');
      expect(edgeRepo.create).toHaveBeenCalledWith({
        edgeTypeName: 'depends_on',
        sourceId: 'node-source',
        targetId: 'node-target',
        properties: { weight: 0.8 },
        createdBy: 'user-1',
      });
    });

    it('should return null when source node does not exist', async () => {
      vi.mocked(nodeRepo.getByEntry).mockResolvedValue(undefined);

      const result = await service.syncRelationToEdge(mockRelationMetadata);

      expect(result).toBeNull();
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('guideline', 'guideline-1');
      expect(edgeRepo.create).not.toHaveBeenCalled();
    });

    it('should return null when target node does not exist', async () => {
      vi.mocked(nodeRepo.getByEntry)
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(undefined);

      const result = await service.syncRelationToEdge(mockRelationMetadata);

      expect(result).toBeNull();
      expect(nodeRepo.getByEntry).toHaveBeenCalledWith('tool', 'tool-1');
      expect(edgeRepo.create).not.toHaveBeenCalled();
    });

    it('should return null when edge already exists', async () => {
      vi.mocked(nodeRepo.getByEntry)
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(targetNode);

      // Mock: Edge already exists
      const existingEdge: GraphEdgeWithType = {
        id: 'existing-edge',
        edgeTypeName: 'depends_on',
        sourceId: 'node-source',
        targetId: 'node-target',
        properties: {},
        weight: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      vi.mocked(edgeRepo.getOutgoingEdges).mockResolvedValue([existingEdge]);

      const result = await service.syncRelationToEdge(mockRelationMetadata);

      expect(result).toBeNull();
      expect(edgeRepo.getOutgoingEdges).toHaveBeenCalled();
      expect(edgeRepo.create).not.toHaveBeenCalled();
    });

    it('should return null when edge type does not exist', async () => {
      vi.mocked(nodeRepo.getByEntry)
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(targetNode);
      vi.mocked(edgeRepo.getOutgoingEdges).mockResolvedValue([]);
      vi.mocked(typeRegistry.getEdgeType).mockResolvedValue(undefined);

      const result = await service.syncRelationToEdge(mockRelationMetadata);

      expect(result).toBeNull();
      expect(typeRegistry.getEdgeType).toHaveBeenCalledWith('depends_on');
      expect(edgeRepo.create).not.toHaveBeenCalled();
    });

    it('should return null and log error when edge creation fails', async () => {
      vi.mocked(nodeRepo.getByEntry)
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(targetNode);
      vi.mocked(edgeRepo.getOutgoingEdges).mockResolvedValue([]);
      vi.mocked(typeRegistry.getEdgeType).mockResolvedValue({
        id: 1,
        name: 'depends_on',
        description: 'Dependency edge',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(edgeRepo.create).mockRejectedValue(new Error('Database error'));

      const result = await service.syncRelationToEdge(mockRelationMetadata);

      expect(result).toBeNull();
      expect(edgeRepo.create).toHaveBeenCalled();
    });

    it('should handle different relation types', async () => {
      const relatedToMetadata: RelationSyncMetadata = {
        relationType: 'related_to',
        sourceEntryId: 'knowledge-1',
        sourceEntryType: 'knowledge',
        targetEntryId: 'knowledge-2',
        targetEntryType: 'knowledge',
      };

      vi.mocked(nodeRepo.getByEntry)
        .mockResolvedValueOnce(sourceNode)
        .mockResolvedValueOnce(targetNode);
      vi.mocked(edgeRepo.getOutgoingEdges).mockResolvedValue([]);
      vi.mocked(typeRegistry.getEdgeType).mockResolvedValue({
        id: 2,
        name: 'related_to',
        description: 'Related to edge',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(edgeRepo.create).mockResolvedValue({
        id: 'edge-2',
        edgeTypeName: 'related_to',
        sourceId: 'node-source',
        targetId: 'node-target',
        properties: {},
        weight: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.syncRelationToEdge(relatedToMetadata);

      expect(result).toBeTruthy();
      expect(edgeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          edgeTypeName: 'related_to',
        })
      );
    });
  });

  describe('findNodeByEntry (private method behavior)', () => {
    it('should handle errors gracefully when looking up nodes', async () => {
      // Test by triggering syncEntryToNode which uses findNodeByEntry internally
      vi.mocked(nodeRepo.getByEntry).mockRejectedValue(new Error('Database timeout'));
      vi.mocked(typeRegistry.getNodeType).mockResolvedValue({
        id: 1,
        name: 'guideline',
        description: 'Guideline',
        builtIn: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      vi.mocked(nodeRepo.create).mockResolvedValue({
        id: 'node-1',
        nodeTypeName: 'guideline',
        scopeType: 'project',
        name: 'Test',
        properties: {},
        entryId: 'test-1',
        entryType: 'guideline',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      });

      const metadata: EntrySyncMetadata = {
        entryType: 'guideline',
        entryId: 'test-1',
        name: 'Test',
        scopeType: 'project',
      };

      // Should handle the error gracefully and still attempt to create
      const result = await service.syncEntryToNode(metadata);

      expect(result).toBeTruthy();
      expect(nodeRepo.create).toHaveBeenCalled();
    });
  });
});

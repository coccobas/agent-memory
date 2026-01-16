import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerGraphSyncService,
  syncEntryToNodeAsync,
  syncRelationToEdgeAsync,
  resetGraphSyncForTests,
} from '../../src/db/repositories/graph-sync-hooks.js';
import type {
  GraphSyncService,
  EntrySyncMetadata,
  RelationSyncMetadata,
} from '../../src/services/graph/sync.service.js';
import type {
  GraphNodeWithVersion,
  GraphEdgeWithType,
} from '../../src/core/interfaces/repositories.js';

// Helper to wait for async operations to complete
const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('Graph Sync Hooks', () => {
  let mockGraphSyncService: GraphSyncService;

  beforeEach(() => {
    // Reset state before each test
    resetGraphSyncForTests();

    // Create mock service
    mockGraphSyncService = {
      syncEntryToNode: vi.fn(),
      syncRelationToEdge: vi.fn(),
    } as unknown as GraphSyncService;
  });

  afterEach(() => {
    // Clean up after tests
    resetGraphSyncForTests();
  });

  describe('registerGraphSyncService', () => {
    it('should register a graph sync service', () => {
      expect(() => {
        registerGraphSyncService(mockGraphSyncService);
      }).not.toThrow();
    });

    it('should register service with custom config', () => {
      expect(() => {
        registerGraphSyncService(mockGraphSyncService, {
          autoSync: false,
          captureEnabled: false,
        });
      }).not.toThrow();
    });

    it('should allow clearing the service by passing null', () => {
      registerGraphSyncService(mockGraphSyncService);
      expect(() => {
        registerGraphSyncService(null);
      }).not.toThrow();
    });

    it('should allow re-registering a service', () => {
      registerGraphSyncService(mockGraphSyncService);

      const anotherService = {
        syncEntryToNode: vi.fn(),
        syncRelationToEdge: vi.fn(),
      } as unknown as GraphSyncService;

      expect(() => {
        registerGraphSyncService(anotherService);
      }).not.toThrow();
    });
  });

  describe('syncEntryToNodeAsync', () => {
    const mockMetadata: EntrySyncMetadata = {
      entryType: 'guideline',
      entryId: 'guideline-123',
      name: 'Test Guideline',
      scopeType: 'project',
      scopeId: 'project-1',
    };

    it('should call syncEntryToNode when service is registered', async () => {
      const mockNode: GraphNodeWithVersion = {
        id: 'node-1',
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

      vi.mocked(mockGraphSyncService.syncEntryToNode).mockResolvedValue(mockNode);

      registerGraphSyncService(mockGraphSyncService);
      syncEntryToNodeAsync(mockMetadata);

      // Wait for async operation
      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalledWith(mockMetadata);
    });

    it('should not throw when service is not registered', () => {
      expect(() => {
        syncEntryToNodeAsync(mockMetadata);
      }).not.toThrow();
    });

    it('should not call service when autoSync is disabled', async () => {
      registerGraphSyncService(mockGraphSyncService, { autoSync: false });
      syncEntryToNodeAsync(mockMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully (non-fatal)', async () => {
      vi.mocked(mockGraphSyncService.syncEntryToNode).mockRejectedValue(
        new Error('Database connection failed')
      );

      registerGraphSyncService(mockGraphSyncService);

      // Should not throw even if sync fails
      expect(() => {
        syncEntryToNodeAsync(mockMetadata);
      }).not.toThrow();

      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalled();
    });

    it('should log success when node is created', async () => {
      const mockNode: GraphNodeWithVersion = {
        id: 'node-1',
        nodeTypeName: 'guideline',
        scopeType: 'project',
        name: 'Test',
        properties: {},
        entryId: 'guideline-123',
        entryType: 'guideline',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };

      vi.mocked(mockGraphSyncService.syncEntryToNode).mockResolvedValue(mockNode);

      registerGraphSyncService(mockGraphSyncService);
      syncEntryToNodeAsync(mockMetadata);

      await waitForAsync();

      // Test passes if no error is thrown
      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalled();
    });

    it('should handle null return from syncEntryToNode', async () => {
      vi.mocked(mockGraphSyncService.syncEntryToNode).mockResolvedValue(null);

      registerGraphSyncService(mockGraphSyncService);
      syncEntryToNodeAsync(mockMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalled();
    });

    it('should work with different entry types', async () => {
      const knowledgeMetadata: EntrySyncMetadata = {
        entryType: 'knowledge',
        entryId: 'knowledge-456',
        name: 'Test Knowledge',
        scopeType: 'global',
      };

      vi.mocked(mockGraphSyncService.syncEntryToNode).mockResolvedValue({
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

      registerGraphSyncService(mockGraphSyncService);
      syncEntryToNodeAsync(knowledgeMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalledWith(knowledgeMetadata);
    });
  });

  describe('syncRelationToEdgeAsync', () => {
    const mockRelationMetadata: RelationSyncMetadata = {
      relationType: 'depends_on',
      sourceEntryId: 'guideline-1',
      sourceEntryType: 'guideline',
      targetEntryId: 'tool-1',
      targetEntryType: 'tool',
    };

    it('should call syncRelationToEdge when service is registered', async () => {
      const mockEdge: GraphEdgeWithType = {
        id: 'edge-1',
        edgeTypeName: 'depends_on',
        sourceId: 'node-1',
        targetId: 'node-2',
        properties: {},
        weight: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(mockGraphSyncService.syncRelationToEdge).mockResolvedValue(mockEdge);

      registerGraphSyncService(mockGraphSyncService);
      syncRelationToEdgeAsync(mockRelationMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncRelationToEdge).toHaveBeenCalledWith(mockRelationMetadata);
    });

    it('should not throw when service is not registered', () => {
      expect(() => {
        syncRelationToEdgeAsync(mockRelationMetadata);
      }).not.toThrow();
    });

    it('should not call service when captureEnabled is disabled', async () => {
      registerGraphSyncService(mockGraphSyncService, { captureEnabled: false });
      syncRelationToEdgeAsync(mockRelationMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncRelationToEdge).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully (non-fatal)', async () => {
      vi.mocked(mockGraphSyncService.syncRelationToEdge).mockRejectedValue(
        new Error('Node not found')
      );

      registerGraphSyncService(mockGraphSyncService);

      // Should not throw even if sync fails
      expect(() => {
        syncRelationToEdgeAsync(mockRelationMetadata);
      }).not.toThrow();

      await waitForAsync();

      expect(mockGraphSyncService.syncRelationToEdge).toHaveBeenCalled();
    });

    it('should handle null return from syncRelationToEdge', async () => {
      vi.mocked(mockGraphSyncService.syncRelationToEdge).mockResolvedValue(null);

      registerGraphSyncService(mockGraphSyncService);
      syncRelationToEdgeAsync(mockRelationMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncRelationToEdge).toHaveBeenCalled();
    });

    it('should work with different relation types', async () => {
      const relatedToMetadata: RelationSyncMetadata = {
        relationType: 'related_to',
        sourceEntryId: 'knowledge-1',
        sourceEntryType: 'knowledge',
        targetEntryId: 'knowledge-2',
        targetEntryType: 'knowledge',
      };

      vi.mocked(mockGraphSyncService.syncRelationToEdge).mockResolvedValue({
        id: 'edge-2',
        edgeTypeName: 'related_to',
        sourceId: 'node-3',
        targetId: 'node-4',
        properties: {},
        weight: 1.0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      registerGraphSyncService(mockGraphSyncService);
      syncRelationToEdgeAsync(relatedToMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncRelationToEdge).toHaveBeenCalledWith(relatedToMetadata);
    });
  });

  describe('resetGraphSyncForTests', () => {
    it('should clear registered service', () => {
      registerGraphSyncService(mockGraphSyncService);
      resetGraphSyncForTests();

      // After reset, sync should not call service
      const metadata: EntrySyncMetadata = {
        entryType: 'guideline',
        entryId: 'test-1',
        name: 'Test',
        scopeType: 'project',
      };

      syncEntryToNodeAsync(metadata);

      expect(mockGraphSyncService.syncEntryToNode).not.toHaveBeenCalled();
    });

    it('should reset config to defaults', () => {
      registerGraphSyncService(mockGraphSyncService, {
        autoSync: false,
        captureEnabled: false,
      });

      resetGraphSyncForTests();

      // Re-register with defaults
      registerGraphSyncService(mockGraphSyncService);

      const entryMetadata: EntrySyncMetadata = {
        entryType: 'guideline',
        entryId: 'test-1',
        name: 'Test',
        scopeType: 'project',
      };

      vi.mocked(mockGraphSyncService.syncEntryToNode).mockResolvedValue({
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

      syncEntryToNodeAsync(entryMetadata);

      // With defaults, autoSync should be enabled
      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalled();
    });
  });

  describe('Configuration interaction', () => {
    it('should respect both autoSync and captureEnabled settings', async () => {
      registerGraphSyncService(mockGraphSyncService, {
        autoSync: true,
        captureEnabled: true,
      });

      const entryMetadata: EntrySyncMetadata = {
        entryType: 'guideline',
        entryId: 'test-1',
        name: 'Test',
        scopeType: 'project',
      };

      const relationMetadata: RelationSyncMetadata = {
        relationType: 'depends_on',
        sourceEntryId: 'test-1',
        sourceEntryType: 'guideline',
        targetEntryId: 'test-2',
        targetEntryType: 'tool',
      };

      vi.mocked(mockGraphSyncService.syncEntryToNode).mockResolvedValue(null);
      vi.mocked(mockGraphSyncService.syncRelationToEdge).mockResolvedValue(null);

      syncEntryToNodeAsync(entryMetadata);
      syncRelationToEdgeAsync(relationMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).toHaveBeenCalled();
      expect(mockGraphSyncService.syncRelationToEdge).toHaveBeenCalled();
    });

    it('should allow disabling autoSync while keeping captureEnabled', async () => {
      registerGraphSyncService(mockGraphSyncService, {
        autoSync: false,
        captureEnabled: true,
      });

      const entryMetadata: EntrySyncMetadata = {
        entryType: 'guideline',
        entryId: 'test-1',
        name: 'Test',
        scopeType: 'project',
      };

      const relationMetadata: RelationSyncMetadata = {
        relationType: 'depends_on',
        sourceEntryId: 'test-1',
        sourceEntryType: 'guideline',
        targetEntryId: 'test-2',
        targetEntryType: 'tool',
      };

      vi.mocked(mockGraphSyncService.syncRelationToEdge).mockResolvedValue(null);

      syncEntryToNodeAsync(entryMetadata);
      syncRelationToEdgeAsync(relationMetadata);

      await waitForAsync();

      expect(mockGraphSyncService.syncEntryToNode).not.toHaveBeenCalled();
      expect(mockGraphSyncService.syncRelationToEdge).toHaveBeenCalled();
    });
  });
});

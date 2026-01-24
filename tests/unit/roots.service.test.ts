import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeRootsService,
  checkRootsCapability,
  fetchRoots,
  handleRootsChanged,
  getCurrentRoots,
  getRootWorkingDirectory,
  hasRootsCapability,
  clearRootsState,
  fileUriToPath,
  type Root,
} from '../../src/mcp/roots.service.js';

vi.mock('../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockServer(
  options: {
    supportsRoots?: boolean;
    roots?: Array<{ uri: string; name?: string }>;
  } = {}
) {
  return {
    getClientCapabilities: vi.fn().mockReturnValue({
      roots: options.supportsRoots ? {} : undefined,
    }),
    listRoots: vi.fn().mockResolvedValue({
      roots: options.roots ?? [],
    }),
  } as any;
}

describe('Roots Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRootsState();
  });

  afterEach(() => {
    clearRootsState();
    vi.restoreAllMocks();
  });

  describe('initializeRootsService', () => {
    it('should initialize without errors', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await expect(initializeRootsService(mockServer)).resolves.toBeUndefined();
    });

    it('should call getClientCapabilities during initialization', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await initializeRootsService(mockServer);

      expect(mockServer.getClientCapabilities).toHaveBeenCalled();
    });

    it('should fetch roots if client supports capability', async () => {
      const mockServer = createMockServer({
        supportsRoots: true,
        roots: [{ uri: 'file:///home/user' }],
      });

      await initializeRootsService(mockServer);

      expect(mockServer.listRoots).toHaveBeenCalled();
    });

    it('should not fetch roots if client does not support capability', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await initializeRootsService(mockServer);

      expect(mockServer.listRoots).not.toHaveBeenCalled();
    });

    it('should store onRootsChanged callback', async () => {
      const mockServer = createMockServer({ supportsRoots: false });
      const callback = vi.fn();

      await initializeRootsService(mockServer, { onRootsChanged: callback });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle errors during initial fetch gracefully', async () => {
      const mockServer = createMockServer({ supportsRoots: true });
      mockServer.listRoots.mockRejectedValueOnce(new Error('Network error'));

      await expect(initializeRootsService(mockServer)).resolves.toBeUndefined();
    });
  });

  describe('checkRootsCapability', () => {
    it('should return true when client supports roots', async () => {
      const mockServer = createMockServer({ supportsRoots: true });

      await initializeRootsService(mockServer);
      const result = checkRootsCapability();

      expect(result).toBe(true);
    });

    it('should return false when client does not support roots', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await initializeRootsService(mockServer);
      const result = checkRootsCapability();

      expect(result).toBe(false);
    });

    it('should return false when server not initialized', () => {
      const result = checkRootsCapability();

      expect(result).toBe(false);
    });

    it('should handle getClientCapabilities errors gracefully', async () => {
      const mockServer = createMockServer({ supportsRoots: false });
      mockServer.getClientCapabilities.mockImplementationOnce(() => {
        throw new Error('Capability check failed');
      });

      await initializeRootsService(mockServer);
      const result = checkRootsCapability();

      expect(result).toBe(false);
    });
  });

  describe('fetchRoots', () => {
    it('should fetch and store roots from client', async () => {
      const roots: Root[] = [
        { uri: 'file:///home/user', name: 'Home' },
        { uri: 'file:///workspace', name: 'Workspace' },
      ];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      await fetchRoots();

      const currentRoots = getCurrentRoots();
      expect(currentRoots).toEqual(roots);
    });

    it('should return empty when client does not support roots', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await initializeRootsService(mockServer);
      await fetchRoots();

      const currentRoots = getCurrentRoots();
      expect(currentRoots).toEqual([]);
    });

    it('should call onRootsChanged callback when roots are fetched', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });
      const callback = vi.fn();

      await initializeRootsService(mockServer, { onRootsChanged: callback });
      await fetchRoots();

      expect(callback).toHaveBeenCalledWith(roots);
    });

    it('should handle fetch errors gracefully', async () => {
      const mockServer = createMockServer({ supportsRoots: true });
      mockServer.listRoots.mockRejectedValueOnce(new Error('Fetch failed'));

      await initializeRootsService(mockServer);
      await expect(fetchRoots()).resolves.toBeUndefined();
    });

    it('should handle null roots response', async () => {
      const mockServer = createMockServer({ supportsRoots: true });
      mockServer.listRoots.mockResolvedValueOnce({ roots: null });

      await initializeRootsService(mockServer);
      await fetchRoots();

      const currentRoots = getCurrentRoots();
      expect(currentRoots).toEqual([]);
    });

    it('should handle undefined roots response', async () => {
      const mockServer = createMockServer({ supportsRoots: true });
      mockServer.listRoots.mockResolvedValueOnce({ roots: undefined });

      await initializeRootsService(mockServer);
      await fetchRoots();

      const currentRoots = getCurrentRoots();
      expect(currentRoots).toEqual([]);
    });
  });

  describe('getRootWorkingDirectory', () => {
    it('should return null when no roots', async () => {
      const mockServer = createMockServer({ supportsRoots: true, roots: [] });

      await initializeRootsService(mockServer);
      const result = getRootWorkingDirectory();

      expect(result).toBeNull();
    });

    it('should parse Unix file:// URI correctly', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user/project' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      const result = getRootWorkingDirectory();

      expect(result).toBe('/home/user/project');
    });

    it('should parse Windows file:// URI correctly', async () => {
      const roots: Root[] = [{ uri: 'file:///C:/Users/user/project' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      const result = getRootWorkingDirectory();

      expect(result).toBe('C:/Users/user/project');
    });

    it('should decode URI-encoded characters', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user/my%20project' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      const result = getRootWorkingDirectory();

      expect(result).toBe('/home/user/my project');
    });

    it('should use first root when multiple roots exist', async () => {
      const roots: Root[] = [{ uri: 'file:///first/path' }, { uri: 'file:///second/path' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      const result = getRootWorkingDirectory();

      expect(result).toBe('/first/path');
    });
  });

  describe('handleRootsChanged', () => {
    it('should refetch roots when notification received', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      await handleRootsChanged();

      expect(mockServer.listRoots).toHaveBeenCalledTimes(2);
    });

    it('should call callback when roots change', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });
      const callback = vi.fn();

      await initializeRootsService(mockServer, { onRootsChanged: callback });
      await handleRootsChanged();

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during roots change gracefully', async () => {
      const mockServer = createMockServer({ supportsRoots: true });
      mockServer.listRoots.mockRejectedValueOnce(new Error('Fetch failed'));

      await initializeRootsService(mockServer);
      await expect(handleRootsChanged()).resolves.toBeUndefined();
    });
  });

  describe('getCurrentRoots', () => {
    it('should return copy of current roots', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      const result = getCurrentRoots();

      expect(result).toEqual(roots);
      expect(result).not.toBe(roots);
    });

    it('should return empty array when no roots', async () => {
      const mockServer = createMockServer({ supportsRoots: true, roots: [] });

      await initializeRootsService(mockServer);
      const result = getCurrentRoots();

      expect(result).toEqual([]);
    });
  });

  describe('hasRootsCapability', () => {
    it('should return true when capability supported and roots exist', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      const result = hasRootsCapability();

      expect(result).toBe(true);
    });

    it('should return false when capability not supported', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await initializeRootsService(mockServer);
      const result = hasRootsCapability();

      expect(result).toBe(false);
    });

    it('should return false when capability supported but no roots', async () => {
      const mockServer = createMockServer({ supportsRoots: true, roots: [] });

      await initializeRootsService(mockServer);
      const result = hasRootsCapability();

      expect(result).toBe(false);
    });
  });

  describe('clearRootsState', () => {
    it('should reset all state', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      expect(getCurrentRoots()).toEqual(roots);

      clearRootsState();

      expect(getCurrentRoots()).toEqual([]);
      expect(checkRootsCapability()).toBe(false);
      expect(hasRootsCapability()).toBe(false);
    });

    it('should allow re-initialization after clear', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      clearRootsState();

      const newRoots: Root[] = [{ uri: 'file:///new/path' }];
      const newMockServer = createMockServer({ supportsRoots: true, roots: newRoots });

      await initializeRootsService(newMockServer);

      expect(getCurrentRoots()).toEqual(newRoots);
    });
  });

  describe('fileUriToPath', () => {
    it('should convert Unix file:// URI to path', () => {
      const result = fileUriToPath('file:///home/user/project');

      expect(result).toBe('/home/user/project');
    });

    it('should convert Windows file:// URI to path', () => {
      const result = fileUriToPath('file:///C:/Users/user/project');

      expect(result).toBe('C:/Users/user/project');
    });

    it('should decode URI-encoded characters', () => {
      const result = fileUriToPath('file:///home/user/my%20project');

      expect(result).toBe('/home/user/my project');
    });

    it('should handle multiple URI-encoded characters', () => {
      const result = fileUriToPath('file:///home/user/my%20project%2Fwith%20spaces');

      expect(result).toBe('/home/user/my project/with spaces');
    });

    it('should handle special characters', () => {
      const result = fileUriToPath('file:///home/user/project%40v1.0');

      expect(result).toBe('/home/user/project@v1.0');
    });

    it('should handle Windows drive letter with lowercase', () => {
      const result = fileUriToPath('file:///d:/projects/test');

      expect(result).toBe('d:/projects/test');
    });

    it('should handle Windows drive letter with uppercase', () => {
      const result = fileUriToPath('file:///D:/Projects/Test');

      expect(result).toBe('D:/Projects/Test');
    });

    it('should handle paths with dots', () => {
      const result = fileUriToPath('file:///home/user/.config/project');

      expect(result).toBe('/home/user/.config/project');
    });

    it('should handle paths with hyphens', () => {
      const result = fileUriToPath('file:///home/user/my-project');

      expect(result).toBe('/home/user/my-project');
    });

    it('should handle paths with underscores', () => {
      const result = fileUriToPath('file:///home/user/my_project');

      expect(result).toBe('/home/user/my_project');
    });

    it('should handle empty path after file://', () => {
      const result = fileUriToPath('file://');

      expect(result).toBe('');
    });

    it('should handle root path', () => {
      const result = fileUriToPath('file:///');

      expect(result).toBe('/');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete workflow: init -> fetch -> get -> clear', async () => {
      const roots: Root[] = [{ uri: 'file:///home/user/project', name: 'Project' }];
      const mockServer = createMockServer({ supportsRoots: true, roots });

      await initializeRootsService(mockServer);
      expect(checkRootsCapability()).toBe(true);

      const workDir = getRootWorkingDirectory();
      expect(workDir).toBe('/home/user/project');

      clearRootsState();
      expect(getCurrentRoots()).toEqual([]);
      expect(getRootWorkingDirectory()).toBeNull();
    });

    it('should handle roots change notification workflow', async () => {
      const initialRoots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots: initialRoots });
      const callback = vi.fn();

      await initializeRootsService(mockServer, { onRootsChanged: callback });
      expect(callback).toHaveBeenCalledWith(initialRoots);

      const newRoots: Root[] = [{ uri: 'file:///home/user' }, { uri: 'file:///workspace' }];
      mockServer.listRoots.mockResolvedValueOnce({ roots: newRoots });

      await handleRootsChanged();
      expect(callback).toHaveBeenLastCalledWith(newRoots);
    });

    it('should handle roots change notification workflow', async () => {
      const initialRoots: Root[] = [{ uri: 'file:///home/user' }];
      const mockServer = createMockServer({ supportsRoots: true, roots: initialRoots });
      const callback = vi.fn();

      await initializeRootsService(mockServer, { onRootsChanged: callback });
      expect(callback).toHaveBeenCalledWith(initialRoots);

      // Simulate roots change
      const newRoots: Root[] = [{ uri: 'file:///home/user' }, { uri: 'file:///workspace' }];
      mockServer.listRoots.mockResolvedValueOnce({ roots: newRoots });

      await handleRootsChanged();
      expect(callback).toHaveBeenLastCalledWith(newRoots);
    });

    it('should handle client without roots support gracefully', async () => {
      const mockServer = createMockServer({ supportsRoots: false });

      await initializeRootsService(mockServer);

      expect(checkRootsCapability()).toBe(false);
      expect(hasRootsCapability()).toBe(false);
      expect(getCurrentRoots()).toEqual([]);
      expect(getRootWorkingDirectory()).toBeNull();
    });
  });
});

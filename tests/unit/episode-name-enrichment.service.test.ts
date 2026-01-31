import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EpisodeNameEnrichmentService,
  resetEpisodeNameEnrichmentService,
  getEpisodeNameEnrichmentService,
  type EnrichmentInput,
} from '../../src/services/episode-name-enrichment.service.js';

describe('EpisodeNameEnrichmentService', () => {
  beforeEach(() => {
    resetEpisodeNameEnrichmentService();
  });

  afterEach(() => {
    resetEpisodeNameEnrichmentService();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create service with default config', () => {
      const service = new EpisodeNameEnrichmentService();
      expect(service.getProvider()).toBe('lmstudio');
    });

    it('should respect provider override', () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'disabled' });
      expect(service.getProvider()).toBe('disabled');
      expect(service.isEnabled()).toBe(false);
    });

    it('should return false for isEnabled when provider is disabled', () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'disabled' });
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true for isEnabled when lmstudio provider', () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getEpisodeNameEnrichmentService', () => {
      const service1 = getEpisodeNameEnrichmentService();
      const service2 = getEpisodeNameEnrichmentService();
      expect(service1).toBe(service2);
    });

    it('should reset singleton with resetEpisodeNameEnrichmentService', () => {
      const service1 = getEpisodeNameEnrichmentService();
      resetEpisodeNameEnrichmentService();
      const service2 = getEpisodeNameEnrichmentService();
      expect(service1).not.toBe(service2);
    });
  });

  describe('enrichName', () => {
    it('should use template fallback when disabled (if outcome differs from name)', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'disabled' });
      const input: EnrichmentInput = {
        originalName: 'Test episode',
        outcome: 'Did something',
        outcomeType: 'success',
      };

      const result = await service.enrichName(input);

      expect(result.wasEnriched).toBe(true);
      expect(result.enrichedName).toBe('Completed: Did something');
      expect(result.originalName).toBe('Test episode');
      expect(result.model).toBe('template');
    });

    it('should return original name when disabled and no useful outcome', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'disabled' });
      const input: EnrichmentInput = {
        originalName: 'Test episode',
        outcome: 'Test episode',
        outcomeType: 'success',
      };

      const result = await service.enrichName(input);

      expect(result.wasEnriched).toBe(false);
      expect(result.enrichedName).toBe('Test episode');
    });

    it('should skip enrichment for already descriptive names (>50 chars)', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      const longName = 'This is a very long episode name that is already descriptive enough';
      const input: EnrichmentInput = {
        originalName: longName,
        outcome: 'Did something',
        outcomeType: 'success',
      };

      const result = await service.enrichName(input);

      expect(result.wasEnriched).toBe(false);
      expect(result.enrichedName).toBe(longName);
    });

    it('should skip enrichment when no outcome or description', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      const input: EnrichmentInput = {
        originalName: 'Test episode',
      };

      const result = await service.enrichName(input);

      expect(result.wasEnriched).toBe(false);
      expect(result.enrichedName).toBe('Test episode');
    });
  });

  describe('cleanResponse (via enrichName)', () => {
    it('should filter out think tags from response', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });

      const cleanResponse = (
        service as unknown as { cleanResponse: (s: string) => string | null }
      ).cleanResponse.bind(service);

      expect(cleanResponse('<think>reasoning here</think>Improved Name')).toBe('Improved Name');
      expect(cleanResponse('Some text<think>reasoning</think>')).toBe('Some text');
      expect(cleanResponse('<think>only thinking</think>')).toBe(null);
    });

    it('should remove quotes from response', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      const cleanResponse = (
        service as unknown as { cleanResponse: (s: string) => string | null }
      ).cleanResponse.bind(service);

      expect(cleanResponse('"Quoted Name"')).toBe('Quoted Name');
      expect(cleanResponse("'Single Quoted'")).toBe('Single Quoted');
    });

    it('should take only first line if multiple lines', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      const cleanResponse = (
        service as unknown as { cleanResponse: (s: string) => string | null }
      ).cleanResponse.bind(service);

      expect(cleanResponse('First Line\nSecond Line')).toBe('First Line');
    });

    it('should reject too short responses', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      const cleanResponse = (
        service as unknown as { cleanResponse: (s: string) => string | null }
      ).cleanResponse.bind(service);

      expect(cleanResponse('ab')).toBe(null);
      expect(cleanResponse('')).toBe(null);
    });

    it('should reject too long responses', async () => {
      const service = new EpisodeNameEnrichmentService({ provider: 'lmstudio' });
      const cleanResponse = (
        service as unknown as { cleanResponse: (s: string) => string | null }
      ).cleanResponse.bind(service);

      const longString = 'a'.repeat(101);
      expect(cleanResponse(longString)).toBe(null);
    });
  });

  describe('config options', () => {
    it('should use custom model', () => {
      const service = new EpisodeNameEnrichmentService({
        provider: 'lmstudio',
        model: 'custom-model',
      });
      expect(service.getProvider()).toBe('lmstudio');
    });

    it('should use custom timeout', () => {
      const service = new EpisodeNameEnrichmentService({
        provider: 'lmstudio',
        timeoutMs: 5000,
      });
      expect(service.isEnabled()).toBe(true);
    });

    it('should handle ollama provider', () => {
      const service = new EpisodeNameEnrichmentService({
        provider: 'ollama',
        ollamaBaseUrl: 'http://localhost:11434',
      });
      expect(service.getProvider()).toBe('ollama');
      expect(service.isEnabled()).toBe(true);
    });

    it('should handle openai provider without key', () => {
      const service = new EpisodeNameEnrichmentService({
        provider: 'openai',
      });
      expect(service.getProvider()).toBe('openai');
      expect(service.isEnabled()).toBe(false);
    });

    it('should handle openai provider with key', () => {
      const service = new EpisodeNameEnrichmentService({
        provider: 'openai',
        openaiApiKey: 'test-key',
      });
      expect(service.getProvider()).toBe('openai');
      expect(service.isEnabled()).toBe(true);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { RLService, type RLServiceConfig } from '../../src/services/rl/index.js';

describe('RLService', () => {
  describe('initialization', () => {
    it('should create service with default config', () => {
      const service = new RLService();

      expect(service.isEnabled()).toBe(true);
      expect(service.getConfig()).toEqual({
        enabled: true,
        extraction: { enabled: true, modelPath: undefined },
        retrieval: { enabled: true, modelPath: undefined },
        consolidation: { enabled: true, modelPath: undefined },
      });
    });

    it('should create service with partial config', () => {
      const config: Partial<RLServiceConfig> = {
        enabled: false,
        extraction: { enabled: false },
      };

      const service = new RLService(config);

      expect(service.isEnabled()).toBe(false);
      expect(service.getConfig().extraction.enabled).toBe(false);
      expect(service.getConfig().retrieval.enabled).toBe(true);
    });

    it('should create service with model paths', () => {
      const config: Partial<RLServiceConfig> = {
        extraction: {
          enabled: true,
          modelPath: '/models/extraction.onnx',
        },
        retrieval: {
          enabled: true,
          modelPath: '/models/retrieval.onnx',
        },
      };

      const service = new RLService(config);

      const status = service.getStatus();
      expect(status.extraction.hasModel).toBe(true);
      expect(status.retrieval.hasModel).toBe(true);
      expect(status.consolidation.hasModel).toBe(false);
    });
  });

  describe('policy accessors', () => {
    it('should return extraction policy', () => {
      const service = new RLService();
      const policy = service.getExtractionPolicy();

      expect(policy).toBeDefined();
      expect(policy.isEnabled()).toBe(false); // No model path
      expect(typeof policy.decide).toBe('function');
    });

    it('should return retrieval policy', () => {
      const service = new RLService();
      const policy = service.getRetrievalPolicy();

      expect(policy).toBeDefined();
      expect(policy.isEnabled()).toBe(false); // No model path
      expect(typeof policy.decide).toBe('function');
    });

    it('should return consolidation policy', () => {
      const service = new RLService();
      const policy = service.getConsolidationPolicy();

      expect(policy).toBeDefined();
      expect(policy.isEnabled()).toBe(false); // No model path
      expect(typeof policy.decide).toBe('function');
    });
  });

  describe('configuration management', () => {
    it('should get current config', () => {
      const service = new RLService({ enabled: false });
      const config = service.getConfig();

      expect(config.enabled).toBe(false);
      // Should return a copy, not the original
      config.enabled = true;
      expect(service.isEnabled()).toBe(false);
    });

    it('should update service config', () => {
      const service = new RLService();

      expect(service.isEnabled()).toBe(true);

      service.updateConfig({ enabled: false });

      expect(service.isEnabled()).toBe(false);
    });

    it('should update extraction policy config', () => {
      const service = new RLService();
      const policy = service.getExtractionPolicy();

      expect(policy.isEnabled()).toBe(false);

      service.updateConfig({
        extraction: {
          enabled: true,
          modelPath: '/models/extraction.onnx',
        },
      });

      expect(policy.isEnabled()).toBe(true);
    });

    it('should update retrieval policy config', () => {
      const service = new RLService();
      const policy = service.getRetrievalPolicy();

      expect(policy.isEnabled()).toBe(false);

      service.updateConfig({
        retrieval: {
          enabled: true,
          modelPath: '/models/retrieval.onnx',
        },
      });

      expect(policy.isEnabled()).toBe(true);
    });

    it('should update consolidation policy config', () => {
      const service = new RLService();
      const policy = service.getConsolidationPolicy();

      expect(policy.isEnabled()).toBe(false);

      service.updateConfig({
        consolidation: {
          enabled: true,
          modelPath: '/models/consolidation.onnx',
        },
      });

      expect(policy.isEnabled()).toBe(true);
    });

    it('should only update changed configs', () => {
      const service = new RLService({
        extraction: { enabled: true, modelPath: '/old.onnx' },
      });

      // Update only retrieval, extraction should remain unchanged
      service.updateConfig({
        retrieval: { enabled: false },
      });

      const config = service.getConfig();
      expect(config.extraction.modelPath).toBe('/old.onnx');
      expect(config.retrieval.enabled).toBe(false);
    });
  });

  describe('service status', () => {
    it('should report status correctly', () => {
      const service = new RLService({
        enabled: true,
        extraction: { enabled: true, modelPath: '/extraction.onnx' },
        retrieval: { enabled: false },
        consolidation: { enabled: true },
      });

      const status = service.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.extraction).toEqual({
        enabled: true,
        hasModel: true,
      });
      expect(status.retrieval).toEqual({
        enabled: false,
        hasModel: false,
      });
      expect(status.consolidation).toEqual({
        enabled: false, // Policy disabled because no model
        hasModel: false,
      });
    });

    it('should show all policies disabled when service disabled', () => {
      const service = new RLService({
        enabled: false,
        extraction: { enabled: true, modelPath: '/extraction.onnx' },
      });

      const status = service.getStatus();

      expect(status.enabled).toBe(false);
      // Policies still report their individual status
      expect(status.extraction.enabled).toBe(true);
      expect(status.extraction.hasModel).toBe(true);
    });
  });

  describe('config merging', () => {
    it('should merge partial extraction config', () => {
      const service = new RLService({
        extraction: { enabled: false },
      });

      const config = service.getConfig();
      expect(config.extraction.enabled).toBe(false);
      expect(config.extraction.modelPath).toBeUndefined();
    });

    it('should preserve existing config when updating', () => {
      const service = new RLService({
        extraction: { enabled: true, modelPath: '/model.onnx' },
      });

      // Update only retrieval, extraction should remain unchanged
      service.updateConfig({
        retrieval: { enabled: false },
      });

      const config = service.getConfig();
      expect(config.extraction.enabled).toBe(true);
      expect(config.extraction.modelPath).toBe('/model.onnx');
      expect(config.retrieval.enabled).toBe(false);
    });

    it('should handle undefined values correctly', () => {
      const service = new RLService({
        extraction: { enabled: true, modelPath: '/model.onnx' },
      });

      service.updateConfig({
        extraction: { modelPath: undefined },
      });

      const config = service.getConfig();
      expect(config.extraction.modelPath).toBeUndefined();
    });
  });
});

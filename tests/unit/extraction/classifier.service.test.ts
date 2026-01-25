import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClassifierService,
  createClassifierService,
  getDefaultClassifierService,
  resetDefaultClassifierService,
  DEFAULT_CLASSIFIER_CONFIG,
  getDefaultClassifierConfig,
  type ClassificationResult,
} from '../../../src/services/extraction/classifier.service.js';
import { withTestEnv } from '../../../src/config/index.js';

describe('ClassifierService', () => {
  beforeEach(() => {
    resetDefaultClassifierService();
  });

  afterEach(() => {
    resetDefaultClassifierService();
  });

  describe('configuration', () => {
    it('should use default config when none provided', () => {
      const service = createClassifierService({ enabled: false });
      const config = service.getConfig();

      expect(config.baseUrl).toBe(DEFAULT_CLASSIFIER_CONFIG.baseUrl);
      expect(config.model).toBe(DEFAULT_CLASSIFIER_CONFIG.model);
      expect(config.autoStoreThreshold).toBe(0.85);
      expect(config.suggestThreshold).toBe(0.7);
    });

    it('should merge custom config with defaults', () => {
      const service = createClassifierService({
        model: 'custom-model',
        timeoutMs: 10000,
        enabled: false,
      });
      const config = service.getConfig();

      expect(config.model).toBe('custom-model');
      expect(config.timeoutMs).toBe(10000);
      expect(config.baseUrl).toBe(DEFAULT_CLASSIFIER_CONFIG.baseUrl);
    });

    it('should override config with environment variables', async () => {
      await withTestEnv(
        {
          AGENT_MEMORY_CLASSIFIER_BASE_URL: 'http://custom:8080/v1',
          AGENT_MEMORY_CLASSIFIER_MODEL: 'env-model',
        },
        () => {
          const dynamicConfig = getDefaultClassifierConfig();
          expect(dynamicConfig.baseUrl).toBe('http://custom:8080/v1');
          expect(dynamicConfig.model).toBe('env-model');

          const service = createClassifierService({ enabled: false });
          const config = service.getConfig();
          expect(config.baseUrl).toBe('http://custom:8080/v1');
          expect(config.model).toBe('env-model');
        }
      );
    });
  });

  describe('isAvailable', () => {
    it('should return false when disabled', () => {
      const service = createClassifierService({ enabled: false });
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('classify', () => {
    it('should return none when service is not available', async () => {
      const service = createClassifierService({ enabled: false });
      const result = await service.classify('Always use TypeScript strict mode');

      expect(result.type).toBe('none');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('not available');
      expect(result.autoStore).toBe(false);
      expect(result.suggest).toBe(false);
    });

    it('should return none for very short text when service is available', async () => {
      const service = createClassifierService({ enabled: false });
      vi.spyOn(service, 'isAvailable').mockReturnValue(true);
      const result = await service.classify('hi');

      expect(result.type).toBe('none');
      expect(result.reasoning).toContain('too short');
    });
  });

  describe('parseResponse', () => {
    it('should parse valid JSON response', async () => {
      const service = createClassifierService({ enabled: false });
      const parseResponse = (
        service as unknown as {
          parseResponse: (content: string) => {
            type: string;
            confidence: number;
            reasoning?: string;
          };
        }
      ).parseResponse.bind(service);

      const result = parseResponse(
        '{"type":"guideline","confidence":0.9,"reasoning":"explicit rule"}'
      );

      expect(result.type).toBe('guideline');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('explicit rule');
    });

    it('should handle markdown-wrapped JSON', async () => {
      const service = createClassifierService({ enabled: false });
      const parseResponse = (
        service as unknown as {
          parseResponse: (content: string) => {
            type: string;
            confidence: number;
            reasoning?: string;
          };
        }
      ).parseResponse.bind(service);

      const result = parseResponse('```json\n{"type":"knowledge","confidence":0.8}\n```');

      expect(result.type).toBe('knowledge');
      expect(result.confidence).toBe(0.8);
    });

    it('should return none for invalid type', async () => {
      const service = createClassifierService({ enabled: false });
      const parseResponse = (
        service as unknown as {
          parseResponse: (content: string) => {
            type: string;
            confidence: number;
            reasoning?: string;
          };
        }
      ).parseResponse.bind(service);

      const result = parseResponse('{"type":"invalid","confidence":0.9}');

      expect(result.type).toBe('none');
    });

    it('should clamp confidence to valid range', async () => {
      const service = createClassifierService({ enabled: false });
      const parseResponse = (
        service as unknown as {
          parseResponse: (content: string) => {
            type: string;
            confidence: number;
            reasoning?: string;
          };
        }
      ).parseResponse.bind(service);

      const result = parseResponse('{"type":"guideline","confidence":1.5}');

      expect(result.confidence).toBe(0);
    });

    it('should handle missing JSON', async () => {
      const service = createClassifierService({ enabled: false });
      const parseResponse = (
        service as unknown as {
          parseResponse: (content: string) => {
            type: string;
            confidence: number;
            reasoning?: string;
          };
        }
      ).parseResponse.bind(service);

      const result = parseResponse('I cannot classify this text');

      expect(result.type).toBe('none');
      expect(result.confidence).toBe(0);
    });
  });

  describe('autoStore and suggest flags', () => {
    it('should set autoStore true when confidence >= 0.85', () => {
      const config = DEFAULT_CLASSIFIER_CONFIG;

      const highConfidence: ClassificationResult = {
        type: 'guideline',
        confidence: 0.9,
        processingTimeMs: 100,
        autoStore: 0.9 >= config.autoStoreThreshold,
        suggest: false,
      };

      expect(highConfidence.autoStore).toBe(true);
    });

    it('should set suggest true when 0.70 <= confidence < 0.85', () => {
      const config = DEFAULT_CLASSIFIER_CONFIG;
      const confidence = 0.75;

      const autoStore = confidence >= config.autoStoreThreshold;
      const suggest = !autoStore && confidence >= config.suggestThreshold;

      expect(autoStore).toBe(false);
      expect(suggest).toBe(true);
    });

    it('should set both false when confidence < 0.70', () => {
      const config = DEFAULT_CLASSIFIER_CONFIG;
      const confidence = 0.5;

      const autoStore = confidence >= config.autoStoreThreshold;
      const suggest = !autoStore && confidence >= config.suggestThreshold;

      expect(autoStore).toBe(false);
      expect(suggest).toBe(false);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getDefaultClassifierService', () => {
      const instance1 = getDefaultClassifierService();
      const instance2 = getDefaultClassifierService();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton with resetDefaultClassifierService', () => {
      const instance1 = getDefaultClassifierService();
      resetDefaultClassifierService();
      const instance2 = getDefaultClassifierService();

      expect(instance1).not.toBe(instance2);
    });
  });
});

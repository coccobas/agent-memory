import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionLifecycleHandler } from '../../../src/services/librarian/session-lifecycle.js';
import type {
  LibrarianConfig,
  SessionEndRequest,
  SessionEndResult,
} from '../../../src/services/librarian/types.js';
import { DEFAULT_LIBRARIAN_CONFIG } from '../../../src/services/librarian/types.js';

function createMockConfig(overrides?: Partial<LibrarianConfig>): LibrarianConfig {
  return { ...DEFAULT_LIBRARIAN_CONFIG, ...overrides };
}

function createSessionEndRequest(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): SessionEndRequest {
  return {
    sessionId: 'test-session',
    projectId: 'test-project',
    agentId: 'test-agent',
    messages,
    skipCapture: true,
    skipAnalysis: true,
    skipMaintenance: true,
    skipMissedExtraction: true,
  };
}

describe('SessionLifecycleHandler proactive recommendations', () => {
  let handler: SessionLifecycleHandler;

  beforeEach(() => {
    handler = new SessionLifecycleHandler({
      config: createMockConfig(),
      analyze: vi.fn().mockResolvedValue({ stats: { patternsDetected: 0 } }),
      runMaintenance: vi.fn().mockResolvedValue({}),
    });
  });

  describe('detectProactiveRecommendations', () => {
    it('should suggest guideline when "always" pattern is detected', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'How should we handle errors?' },
        { role: 'assistant', content: 'We should always wrap async calls in try-catch blocks.' },
        { role: 'user', content: 'Got it, thanks!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();
      expect(result.proactiveRecommendations!.length).toBeGreaterThan(0);

      const guidelineRec = result.proactiveRecommendations!.find((r) => r.type === 'guideline');
      expect(guidelineRec).toBeDefined();
      expect(guidelineRec!.reason).toContain('always');
    });

    it('should suggest experience when error recovery is detected', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'The build is failing with an error' },
        { role: 'assistant', content: 'I see the problem. Let me debug this.' },
        { role: 'user', content: 'Still getting the issue' },
        { role: 'assistant', content: 'I tried a different approach and fixed the issue!' },
        { role: 'user', content: 'Great, it works now!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();

      const experienceRec = result.proactiveRecommendations!.find((r) => r.type === 'experience');
      expect(experienceRec).toBeDefined();
      expect(experienceRec!.reason).toMatch(/error.*recovery|debug|fix/i);
    });

    it('should suggest knowledge when decisions are detected', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'Should we use React or Vue?' },
        {
          role: 'assistant',
          content: 'I decided to use React instead of Vue for better TypeScript support.',
        },
        { role: 'user', content: 'Sounds good.' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();

      const knowledgeRec = result.proactiveRecommendations!.find((r) => r.type === 'knowledge');
      expect(knowledgeRec).toBeDefined();
      expect(knowledgeRec!.reason).toContain('decision');
    });

    it('should suggest knowledge when learning patterns are detected', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'Why is this not working?' },
        {
          role: 'assistant',
          content:
            'I realized the API requires authentication. I learned that the token expires after 1 hour.',
        },
        { role: 'user', content: 'Ah, that explains it!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();

      const learningRec = result.proactiveRecommendations!.find(
        (r) => r.type === 'knowledge' && r.reason.includes('learn')
      );
      expect(learningRec).toBeDefined();
    });

    it('should not generate recommendations for simple conversations', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: 'The answer is 4.' },
        { role: 'user', content: 'Thanks' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeUndefined();
    });

    it('should include action suggestion in recommendations', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'How do we deploy?' },
        {
          role: 'assistant',
          content: 'We should always run tests before deploying to production.',
        },
        { role: 'user', content: 'Thanks!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();
      const rec = result.proactiveRecommendations![0];
      expect(rec.action).toBeDefined();
      expect(rec.action).toContain('memory_');
    });

    it('should detect "never" pattern and suggest guideline', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'What should I avoid?' },
        { role: 'assistant', content: 'You should never commit secrets to the repository.' },
        { role: 'user', content: 'Good to know!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();

      const guidelineRec = result.proactiveRecommendations!.find((r) => r.type === 'guideline');
      expect(guidelineRec).toBeDefined();
      expect(guidelineRec!.reason).toContain('never');
    });

    it('should limit number of recommendations', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'Tell me all the rules' },
        {
          role: 'assistant',
          content:
            'We should always use TypeScript. We should never use any. I decided to use strict mode. I realized ESLint helps. I learned about Prettier. I fixed the config bug by trying a different approach.',
        },
        { role: 'user', content: 'Thanks!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();
      expect(result.proactiveRecommendations!.length).toBeLessThanOrEqual(5);
    });

    it('should include confidence score in recommendations', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'How do we handle auth?' },
        {
          role: 'assistant',
          content: 'We should always validate tokens before processing requests.',
        },
        { role: 'user', content: 'Got it!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();
      const rec = result.proactiveRecommendations![0];
      expect(rec.confidence).toBeDefined();
      expect(rec.confidence).toBeGreaterThan(0);
      expect(rec.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('proactive recommendations with complexity signals', () => {
    it('should include complexity score in result when recommendations generated', async () => {
      const request = createSessionEndRequest([
        { role: 'user', content: 'Fix the auth bug' },
        {
          role: 'assistant',
          content: 'I found the error and fixed it. I decided to use a different approach.',
        },
        { role: 'user', content: 'Thanks!' },
      ]);

      const result = await handler.onSessionEnd(request);

      expect(result.proactiveRecommendations).toBeDefined();
      expect(result.complexityScore).toBeDefined();
      expect(result.complexityScore).toBeGreaterThan(0);
    });
  });
});

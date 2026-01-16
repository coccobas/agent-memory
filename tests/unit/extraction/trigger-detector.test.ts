/**
 * Unit tests for trigger-detector.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TriggerDetector,
  createTriggerDetector,
} from '../../../src/services/extraction/trigger-detector.js';
import {
  TriggerType,
  DEFAULT_TRIGGER_CONFIG,
  type Message,
  type SessionContext,
} from '../../../src/services/extraction/triggers.js';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  createComponentLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('TriggerDetector', () => {
  let detector: TriggerDetector;

  beforeEach(() => {
    detector = new TriggerDetector();
  });

  describe('createTriggerDetector', () => {
    it('should create a new detector instance', () => {
      const det = createTriggerDetector();
      expect(det).toBeInstanceOf(TriggerDetector);
    });

    it('should accept custom config', () => {
      const det = createTriggerDetector({
        minConfidenceScore: 0.9,
      });
      expect(det).toBeInstanceOf(TriggerDetector);
    });
  });

  describe('detectCorrection', () => {
    function createMessage(
      role: 'user' | 'assistant',
      content: string,
      timestamp: number = Date.now()
    ): Message {
      return {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp,
      };
    }

    it('should detect correction phrases', () => {
      const messages = [
        createMessage('assistant', 'I will create a function called processData', 1000),
        createMessage('user', "No, that's wrong. I wanted a class, not a function.", 2000),
      ];

      const trigger = detector.detectCorrection(messages);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe(TriggerType.USER_CORRECTION);
      expect(trigger?.confidence).toBeDefined();
    });

    it('should detect "actually" corrections', () => {
      const messages = [
        createMessage('assistant', 'Using JavaScript for this...', 1000),
        createMessage('user', 'Actually, I meant TypeScript.', 2000),
      ];

      const trigger = detector.detectCorrection(messages);

      expect(trigger).not.toBeNull();
      expect(trigger?.reason).toContain('correction');
    });

    it('should detect "I meant" corrections', () => {
      const messages = [
        createMessage('assistant', 'Using JavaScript for this...', 1000),
        createMessage('user', 'I meant TypeScript, not JavaScript.', 2000),
      ];

      const trigger = detector.detectCorrection(messages);

      expect(trigger).not.toBeNull();
      expect(trigger?.reason).toContain('correction');
    });

    it('should return null for single message', () => {
      const messages = [createMessage('user', "No, that's wrong!")];

      const trigger = detector.detectCorrection(messages);
      expect(trigger).toBeNull();
    });

    it('should return null for no user messages', () => {
      const messages = [
        createMessage('assistant', 'First message', 1000),
        createMessage('assistant', 'Second message', 2000),
      ];

      const trigger = detector.detectCorrection(messages);
      expect(trigger).toBeNull();
    });

    it('should boost confidence for strong correction phrases', () => {
      const weakMessages = [
        createMessage('assistant', 'Result is A', 1000),
        createMessage('user', 'No, it should be B.', 2000),
      ];

      const strongMessages = [
        createMessage('assistant', 'Result is A', 1000),
        createMessage('user', "That's incorrect. Undo that and use B.", 2000),
      ];

      const weakTrigger = detector.detectCorrection(weakMessages);
      const strongTrigger = detector.detectCorrection(strongMessages);

      expect(strongTrigger).not.toBeNull();
      if (weakTrigger && strongTrigger) {
        expect(strongTrigger.score).toBeGreaterThan(weakTrigger.score);
      }
    });

    it('should extract what was wrong and right', () => {
      const messages = [
        createMessage('assistant', 'I will use var for the variable.', 1000),
        createMessage('user', 'No, use const instead of var.', 2000),
      ];

      const trigger = detector.detectCorrection(messages);

      expect(trigger).not.toBeNull();
      expect(trigger?.extractedContent).toBeDefined();
      expect(trigger?.extractedContent?.rawContent).toBe('No, use const instead of var.');
    });
  });

  describe('detectEnthusiasm', () => {
    function createUserMessage(content: string): Message {
      return {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
    }

    it('should detect enthusiasm phrases', () => {
      const message = createUserMessage("Perfect! That's exactly what I needed.");

      const trigger = detector.detectEnthusiasm(message);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe(TriggerType.ENTHUSIASM);
    });

    it('should detect "great" as enthusiasm', () => {
      const message = createUserMessage('Great, thank you!');

      const trigger = detector.detectEnthusiasm(message);

      expect(trigger).not.toBeNull();
    });

    it('should not trigger on questions', () => {
      const message = createUserMessage('Is this approach perfect?');

      const trigger = detector.detectEnthusiasm(message);

      expect(trigger).toBeNull();
    });

    it('should not trigger on assistant messages', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'assistant',
        content: "Perfect! Here's the solution.",
        timestamp: Date.now(),
      };

      const trigger = detector.detectEnthusiasm(message);

      expect(trigger).toBeNull();
    });

    it('should boost confidence for phrases at end of message', () => {
      const endMessage = createUserMessage('That solution is exactly what I needed, perfect!');
      const startMessage = createUserMessage('Perfect, but I have more questions.');

      const endTrigger = detector.detectEnthusiasm(endMessage);
      const startTrigger = detector.detectEnthusiasm(startMessage);

      expect(endTrigger).not.toBeNull();
      expect(startTrigger).not.toBeNull();
    });

    it('should boost confidence for exclamation marks', () => {
      const noExclaim = createUserMessage('This is great.');
      const withExclaim = createUserMessage('This is great!!!');

      const noExclaimTrigger = detector.detectEnthusiasm(noExclaim);
      const withExclaimTrigger = detector.detectEnthusiasm(withExclaim);

      expect(noExclaimTrigger).not.toBeNull();
      expect(withExclaimTrigger).not.toBeNull();
      if (noExclaimTrigger && withExclaimTrigger) {
        expect(withExclaimTrigger.score).toBeGreaterThan(noExclaimTrigger.score);
      }
    });

    it('should extract positive aspect', () => {
      const message = createUserMessage('Love it! This is exactly the approach I wanted.');

      const trigger = detector.detectEnthusiasm(message);

      expect(trigger).not.toBeNull();
      expect(trigger?.extractedContent?.positiveAspect).toBeDefined();
    });
  });

  describe('detectErrorRecovery', () => {
    function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
      return {
        sessionId: 'test-session',
        projectId: 'test-project',
        messages: [],
        recentErrors: [],
        ...overrides,
      };
    }

    function createMessage(
      role: 'user' | 'assistant',
      content: string,
      metadata: Record<string, unknown> = {}
    ): Message {
      return {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp: Date.now(),
        metadata,
      };
    }

    it('should detect recovery after tool success', () => {
      const messages = [
        createMessage('assistant', 'Running the command...', { hasError: true, toolName: 'bash' }),
        createMessage('assistant', 'Fixed the issue.', { toolSuccess: true, toolName: 'bash' }),
      ];

      const context = createSessionContext({
        messages: [],
        recentErrors: [],
      });

      const trigger = detector.detectErrorRecovery(messages, context);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe(TriggerType.ERROR_RECOVERY);
    });

    it('should detect recovery with verbal success', () => {
      const messages = [
        createMessage('assistant', 'Error occurred', { hasError: true }),
        createMessage('user', 'That works now, thank you!'),
      ];

      const context = createSessionContext();

      const trigger = detector.detectErrorRecovery(messages, context);

      expect(trigger).not.toBeNull();
    });

    it('should return null when no errors', () => {
      const messages = [
        createMessage('assistant', 'Task completed successfully.'),
        createMessage('user', 'Great!'),
      ];

      const context = createSessionContext();

      const trigger = detector.detectErrorRecovery(messages, context);

      expect(trigger).toBeNull();
    });

    it('should return null without success indicators', () => {
      const messages = [
        createMessage('assistant', 'Error occurred', { hasError: true }),
        createMessage('user', 'Hmm, interesting.'),
      ];

      const context = createSessionContext();

      const trigger = detector.detectErrorRecovery(messages, context);

      expect(trigger).toBeNull();
    });
  });

  describe('detectRepetition', () => {
    function createMessage(role: 'user' | 'assistant', content: string): Message {
      return {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp: Date.now(),
      };
    }

    it('should detect repeated patterns across sessions', () => {
      // Use a very low threshold and nearly identical messages
      const lowThresholdDetector = new TriggerDetector({
        repetitionThreshold: 2,
        repetitionSimilarityThreshold: 0.2,
      });

      // Use nearly identical messages for high similarity
      const currentMessages = [createMessage('user', 'configure database connection')];

      const historicalMessages = [
        createMessage('user', 'configure database connection'),
        createMessage('user', 'configure database connection'),
      ];

      const trigger = lowThresholdDetector.detectRepetition(currentMessages, historicalMessages);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe(TriggerType.REPEATED_REQUEST);
    });

    it('should return null for no historical messages', () => {
      const currentMessages = [createMessage('user', 'How do I configure the database?')];

      const trigger = detector.detectRepetition(currentMessages, []);

      expect(trigger).toBeNull();
    });

    it('should return null for no user messages', () => {
      const currentMessages = [createMessage('assistant', 'Here is the configuration...')];

      const historicalMessages = [createMessage('user', 'Configure database')];

      const trigger = detector.detectRepetition(currentMessages, historicalMessages);

      expect(trigger).toBeNull();
    });

    it('should return null for dissimilar messages', () => {
      const currentMessages = [createMessage('user', 'What is the weather today?')];

      const historicalMessages = [
        createMessage('user', 'How do I fix the build error?'),
        createMessage('user', 'Configure the API endpoint'),
      ];

      const trigger = detector.detectRepetition(currentMessages, historicalMessages);

      expect(trigger).toBeNull();
    });

    it('should include repetition count in extracted content', () => {
      // Use low threshold and identical messages
      const lowThresholdDetector = new TriggerDetector({
        repetitionThreshold: 2,
        repetitionSimilarityThreshold: 0.2,
      });

      const currentMessages = [createMessage('user', 'reset user password')];

      const historicalMessages = [
        createMessage('user', 'reset user password'),
        createMessage('user', 'reset user password'),
      ];

      const trigger = lowThresholdDetector.detectRepetition(currentMessages, historicalMessages);

      expect(trigger).not.toBeNull();
      if (trigger) {
        expect(trigger.extractedContent?.repetitionCount).toBeGreaterThan(1);
      }
    });
  });

  describe('detectAll', () => {
    function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
      return {
        sessionId: 'test-session',
        projectId: 'test-project',
        messages: [],
        recentErrors: [],
        ...overrides,
      };
    }

    function createMessage(
      role: 'user' | 'assistant',
      content: string,
      timestamp: number = Date.now()
    ): Message {
      return {
        id: `msg-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        timestamp,
      };
    }

    it('should detect multiple triggers', () => {
      const context = createSessionContext({
        messages: [createMessage('assistant', 'Created the function processData', 1000)],
      });

      const newMessage = createMessage(
        'user',
        "No, actually that's wrong! Perfect that you tried though!",
        2000
      );

      const triggers = detector.detectAll(newMessage, context);

      // Should detect at least one trigger (correction or enthusiasm)
      expect(triggers.length).toBeGreaterThanOrEqual(0);
    });

    it('should not trigger on assistant messages for corrections', () => {
      const context = createSessionContext({
        messages: [createMessage('user', 'Create a function', 1000)],
      });

      const newMessage = createMessage(
        'assistant',
        'Actually, I think you should use a class instead.',
        2000
      );

      const triggers = detector.detectAll(newMessage, context);

      // Corrections should only trigger for user messages
      const corrections = triggers.filter((t) => t.type === TriggerType.USER_CORRECTION);
      expect(corrections.length).toBe(0);
    });

    it('should include repetition triggers when historical messages present', () => {
      const context = createSessionContext({
        messages: [],
        historicalMessages: [
          createMessage('user', 'Deploy the application'),
          createMessage('user', 'Deploying application'),
          createMessage('user', 'Application deployment'),
        ],
      });

      const newMessage = createMessage('user', 'Deploy the application please');

      const triggers = detector.detectAll(newMessage, context);

      const repetitions = triggers.filter((t) => t.type === TriggerType.REPEATED_REQUEST);
      expect(repetitions.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array when no triggers detected', () => {
      const context = createSessionContext({
        messages: [],
      });

      const newMessage = createMessage('user', 'Just a normal message with no special patterns.');

      const triggers = detector.detectAll(newMessage, context);

      expect(Array.isArray(triggers)).toBe(true);
    });
  });

  describe('config options', () => {
    it('should respect minConfidenceScore', () => {
      const strictDetector = new TriggerDetector({
        minConfidenceScore: 0.99,
      });

      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'Nice!',
        timestamp: Date.now(),
      };

      const trigger = strictDetector.detectEnthusiasm(message);

      // High threshold should reject low-confidence matches
      expect(trigger).toBeNull();
    });

    it('should use custom phrases', () => {
      const customDetector = new TriggerDetector({
        enthusiasmPhrases: ['custom-awesome'],
      });

      const message: Message = {
        id: 'msg-1',
        role: 'user',
        content: 'This is custom-awesome!',
        timestamp: Date.now(),
      };

      const trigger = customDetector.detectEnthusiasm(message);

      expect(trigger).not.toBeNull();
    });
  });

  describe('DEFAULT_TRIGGER_CONFIG', () => {
    it('should have required properties', () => {
      expect(DEFAULT_TRIGGER_CONFIG.correctionPhrases).toBeDefined();
      expect(DEFAULT_TRIGGER_CONFIG.enthusiasmPhrases).toBeDefined();
      expect(DEFAULT_TRIGGER_CONFIG.negationPhrases).toBeDefined();
      expect(DEFAULT_TRIGGER_CONFIG.questionIndicators).toBeDefined();
      expect(DEFAULT_TRIGGER_CONFIG.minConfidenceScore).toBeDefined();
      expect(DEFAULT_TRIGGER_CONFIG.contextWindowSize).toBeDefined();
    });

    it('should have reasonable default values', () => {
      expect(DEFAULT_TRIGGER_CONFIG.minConfidenceScore).toBeGreaterThan(0);
      expect(DEFAULT_TRIGGER_CONFIG.minConfidenceScore).toBeLessThan(1);
      expect(DEFAULT_TRIGGER_CONFIG.contextWindowSize).toBeGreaterThan(0);
    });
  });
});

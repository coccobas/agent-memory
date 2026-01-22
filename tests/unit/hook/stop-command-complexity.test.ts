import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TurnData } from '../../../src/services/capture/types.js';
import {
  assessConversationComplexityWithSignals,
  type ComplexityAssessmentWithSignals,
} from '../../../src/commands/hook/stop-command.js';
import { detectComplexitySignals } from '../../../src/utils/transcript-analysis.js';

vi.mock('../../../src/utils/transcript-analysis.js', () => ({
  detectComplexitySignals: vi.fn(),
}));

const mockDetectComplexitySignals = vi.mocked(detectComplexitySignals);

describe('assessConversationComplexityWithSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signal-based complexity detection', () => {
    it('should use transcript signals when transcript is provided', () => {
      const transcript: TurnData[] = [
        { role: 'user', content: 'There is an error in the code' },
        { role: 'assistant', content: 'I decided to refactor it' },
      ];

      mockDetectComplexitySignals.mockReturnValue({
        score: 0.6,
        signals: ['error', 'decided'],
        hasErrorRecovery: true,
        hasDecisions: true,
        hasLearning: false,
      });

      const result = assessConversationComplexityWithSignals(
        { appended: 5, linesRead: 30, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 },
        transcript
      );

      expect(mockDetectComplexitySignals).toHaveBeenCalledWith(transcript);
      expect(result.signalScore).toBe(0.6);
      expect(result.hasErrorRecovery).toBe(true);
      expect(result.hasDecisions).toBe(true);
    });

    it('should weight signal-based score higher than volume-based', () => {
      const transcript: TurnData[] = [{ role: 'user', content: 'Bug found and fixed' }];

      mockDetectComplexitySignals.mockReturnValue({
        score: 0.8,
        signals: ['bug', 'fix'],
        hasErrorRecovery: true,
        hasDecisions: false,
        hasLearning: false,
      });

      const resultWithSignals = assessConversationComplexityWithSignals(
        { appended: 3, linesRead: 20, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 },
        transcript
      );

      const resultWithoutSignals = assessConversationComplexityWithSignals(
        { appended: 3, linesRead: 20, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 }
      );

      expect(resultWithSignals.score).toBeGreaterThan(resultWithoutSignals.score);
    });

    it('should mark as complex when signal score is high even with low volume', () => {
      mockDetectComplexitySignals.mockReturnValue({
        score: 0.9,
        signals: ['error', 'decided', 'realized'],
        hasErrorRecovery: true,
        hasDecisions: true,
        hasLearning: true,
      });

      const result = assessConversationComplexityWithSignals(
        { appended: 2, linesRead: 10, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 },
        [{ role: 'user', content: 'test' }]
      );

      expect(result.isComplex).toBe(true);
    });

    it('should include signal reasons in the result', () => {
      mockDetectComplexitySignals.mockReturnValue({
        score: 0.6,
        signals: ['error', 'bug', 'tried'],
        hasErrorRecovery: true,
        hasDecisions: false,
        hasLearning: false,
      });

      const result = assessConversationComplexityWithSignals(
        { appended: 5, linesRead: 30, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 },
        [{ role: 'user', content: 'test' }]
      );

      expect(result.reasons).toContain('Error recovery patterns detected');
    });
  });

  describe('volume-based complexity (fallback)', () => {
    it('should use volume-based assessment when no transcript provided', () => {
      const result = assessConversationComplexityWithSignals(
        { appended: 15, linesRead: 60, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 }
      );

      expect(mockDetectComplexitySignals).not.toHaveBeenCalled();
      expect(result.isComplex).toBe(true);
      expect(result.signalScore).toBeUndefined();
    });

    it('should combine volume and signal scores when both available', () => {
      mockDetectComplexitySignals.mockReturnValue({
        score: 0.3,
        signals: ['tried'],
        hasErrorRecovery: true,
        hasDecisions: false,
        hasLearning: false,
      });

      const result = assessConversationComplexityWithSignals(
        { appended: 12, linesRead: 55, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 },
        [{ role: 'user', content: 'test' }]
      );

      expect(result.volumeScore).toBeGreaterThan(0);
      expect(result.signalScore).toBe(0.3);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('return structure', () => {
    it('should return all required fields', () => {
      mockDetectComplexitySignals.mockReturnValue({
        score: 0.5,
        signals: ['error'],
        hasErrorRecovery: true,
        hasDecisions: false,
        hasLearning: false,
      });

      const result = assessConversationComplexityWithSignals(
        { appended: 5, linesRead: 30, wasTruncated: false },
        { complexityMessageThreshold: 10, complexityLineThreshold: 50 },
        [{ role: 'user', content: 'test' }]
      );

      expect(result).toHaveProperty('isComplex');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('reasons');
      expect(result).toHaveProperty('volumeScore');
      expect(result).toHaveProperty('signalScore');
      expect(result).toHaveProperty('hasErrorRecovery');
      expect(result).toHaveProperty('hasDecisions');
      expect(result).toHaveProperty('hasLearning');
    });
  });
});

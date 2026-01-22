import { describe, it, expect } from 'vitest';
import type { TurnData } from '../../src/services/capture/types.js';
import {
  detectComplexitySignals,
  detectPatternMentions,
  detectProjectMentions,
  detectQuestionTopics,
  detectConflicts,
  type ComplexitySignals,
  type PatternMention,
  type Conflict,
} from '../../src/utils/transcript-analysis.js';

function createTurn(
  role: 'user' | 'assistant' | 'system',
  content: string,
  options?: Partial<TurnData>
): TurnData {
  return {
    role,
    content,
    ...options,
  };
}

function createTranscript(
  turns: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): TurnData[] {
  return turns.map((t) => createTurn(t.role, t.content));
}

describe('detectComplexitySignals', () => {
  describe('basic functionality', () => {
    it('should return default signals for empty transcript', () => {
      const result = detectComplexitySignals([]);

      expect(result).toBeDefined();
      expect(result.score).toBe(0);
      expect(result.signals).toEqual([]);
      expect(result.hasErrorRecovery).toBe(false);
      expect(result.hasDecisions).toBe(false);
      expect(result.hasLearning).toBe(false);
    });

    it('should return default signals for trivial conversation', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.score).toBeLessThan(0.3);
      expect(result.signals).toHaveLength(0);
    });
  });

  describe('error recovery detection', () => {
    it('should detect error keyword in transcript', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'The build is failing with an error' },
        { role: 'assistant', content: 'Let me check the error message' },
        { role: 'assistant', content: 'I found the bug and fixed it' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasErrorRecovery).toBe(true);
      expect(result.signals).toContain('error');
    });

    it('should detect bug keyword', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'There is a bug in the authentication' },
        { role: 'assistant', content: 'I see the bug, let me fix it' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasErrorRecovery).toBe(true);
      expect(result.signals).toContain('bug');
    });

    it('should detect debug keyword', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Can you debug this issue?' },
        { role: 'assistant', content: 'I will debug the failing test' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasErrorRecovery).toBe(true);
      expect(result.signals).toContain('debug');
    });

    it('should detect "tried" pattern indicating iteration', () => {
      const transcript = createTranscript([
        { role: 'assistant', content: 'I tried using async/await but it did not work' },
        { role: 'assistant', content: 'Then I tried a different approach' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasErrorRecovery).toBe(true);
      expect(result.signals).toContain('tried');
    });
  });

  describe('decision detection', () => {
    it('should detect "decided" keyword', () => {
      const transcript = createTranscript([
        { role: 'assistant', content: 'I decided to use TypeScript strict mode' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasDecisions).toBe(true);
      expect(result.signals).toContain('decided');
    });

    it('should detect "instead of" pattern', () => {
      const transcript = createTranscript([
        { role: 'assistant', content: 'I used React Query instead of Redux for state management' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasDecisions).toBe(true);
      expect(result.signals).toContain('instead of');
    });

    it('should detect "chose" keyword', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'We chose to implement it this way' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasDecisions).toBe(true);
      expect(result.signals).toContain('chose');
    });
  });

  describe('learning detection', () => {
    it('should detect "realized" keyword', () => {
      const transcript = createTranscript([
        { role: 'assistant', content: 'I realized the issue was with the database connection' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasLearning).toBe(true);
      expect(result.signals).toContain('realized');
    });

    it('should detect "learned" keyword', () => {
      const transcript = createTranscript([
        { role: 'assistant', content: 'I learned that this pattern works better' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasLearning).toBe(true);
      expect(result.signals).toContain('learned');
    });

    it('should detect "discovered" keyword', () => {
      const transcript = createTranscript([
        { role: 'assistant', content: 'I discovered that the config was missing' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasLearning).toBe(true);
      expect(result.signals).toContain('discovered');
    });
  });

  describe('complexity score calculation', () => {
    it('should increase score for each signal type detected', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'There is an error in the code' },
        { role: 'assistant', content: 'I decided to refactor it' },
        { role: 'assistant', content: 'I realized the issue was deeper' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasErrorRecovery).toBe(true);
      expect(result.hasDecisions).toBe(true);
      expect(result.hasLearning).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    });

    it('should cap score at 1.0', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'error bug debug fix' },
        { role: 'assistant', content: 'I tried, decided, realized, learned, discovered' },
        { role: 'assistant', content: 'instead of the old approach, I chose a new one' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('should weight multiple occurrences of same signal', () => {
      const singleError = createTranscript([{ role: 'user', content: 'There is an error' }]);

      const multipleErrors = createTranscript([
        { role: 'user', content: 'There is an error' },
        { role: 'assistant', content: 'I see another error here' },
        { role: 'assistant', content: 'And one more error found' },
      ]);

      const singleResult = detectComplexitySignals(singleError);
      const multipleResult = detectComplexitySignals(multipleErrors);

      expect(multipleResult.score).toBeGreaterThan(singleResult.score);
    });
  });

  describe('case insensitivity', () => {
    it('should detect signals regardless of case', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'ERROR in the system' },
        { role: 'assistant', content: 'I DECIDED to fix it' },
        { role: 'assistant', content: 'I REALIZED the cause' },
      ]);

      const result = detectComplexitySignals(transcript);

      expect(result.hasErrorRecovery).toBe(true);
      expect(result.hasDecisions).toBe(true);
      expect(result.hasLearning).toBe(true);
    });
  });
});

describe('detectPatternMentions', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty transcript', () => {
      const result = detectPatternMentions([], 'authentication');

      expect(result).toEqual([]);
    });

    it('should return empty array when pattern not found', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there' },
      ]);

      const result = detectPatternMentions(transcript, 'authentication');

      expect(result).toEqual([]);
    });
  });

  describe('pattern matching', () => {
    it('should find exact pattern match', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'How does authentication work?' },
        { role: 'assistant', content: 'Authentication uses JWT tokens' },
      ]);

      const result = detectPatternMentions(transcript, 'authentication');

      expect(result).toHaveLength(2);
      expect(result[0].turnIndex).toBe(0);
      expect(result[1].turnIndex).toBe(1);
    });

    it('should be case insensitive', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'AUTHENTICATION is broken' },
        { role: 'assistant', content: 'The Authentication module needs fixing' },
      ]);

      const result = detectPatternMentions(transcript, 'authentication');

      expect(result).toHaveLength(2);
    });

    it('should return confidence scores', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'authentication' },
        { role: 'assistant', content: 'The authentication system handles user auth' },
      ]);

      const result = detectPatternMentions(transcript, 'authentication');

      expect(result).toHaveLength(2);
      expect(result[0].confidence).toBeGreaterThanOrEqual(0.5);
      expect(result[1].confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('should handle partial word matches', () => {
      const transcript = createTranscript([{ role: 'user', content: 'The auth module is broken' }]);

      const result = detectPatternMentions(transcript, 'authentication');

      expect(result).toHaveLength(0);
    });

    it('should find multiple occurrences in same turn', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'authentication and more authentication' },
      ]);

      const result = detectPatternMentions(transcript, 'authentication');

      expect(result).toHaveLength(1);
      expect(result[0].confidence).toBeGreaterThan(0.5);
    });
  });

  describe('return structure', () => {
    it('should return turnIndex, role, and confidence', () => {
      const transcript = createTranscript([{ role: 'user', content: 'Check the database' }]);

      const result = detectPatternMentions(transcript, 'database');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('turnIndex');
      expect(result[0]).toHaveProperty('confidence');
      expect(result[0].turnIndex).toBe(0);
      expect(typeof result[0].confidence).toBe('number');
    });
  });
});

describe('detectProjectMentions', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty transcript', () => {
      const result = detectProjectMentions([]);

      expect(result).toEqual([]);
    });

    it('should return empty array when no project patterns found', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Hello, please help me' },
        { role: 'assistant', content: 'Sure, what do you need?' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toEqual([]);
    });
  });

  describe('pattern detection', () => {
    it('should detect "working on X" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'I am working on agent-memory project' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toContain('agent-memory');
    });

    it('should detect "in the X module" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'The bug is in the authentication module' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toContain('authentication');
    });

    it('should detect "X project" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'This is for the dashboard project' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toContain('dashboard');
    });

    it('should detect "the X codebase" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Looking at the frontend codebase' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toContain('frontend');
    });

    it('should detect "X repository" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Clone the api-server repository' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toContain('api-server');
    });
  });

  describe('deduplication', () => {
    it('should return unique project names', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Working on agent-memory project' },
        { role: 'assistant', content: 'Looking at the agent-memory codebase' },
        { role: 'user', content: 'The agent-memory repository has the fix' },
      ]);

      const result = detectProjectMentions(transcript);

      const agentMemoryCount = result.filter((p) => p === 'agent-memory').length;
      expect(agentMemoryCount).toBe(1);
    });
  });

  describe('case handling', () => {
    it('should preserve original case of project names', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Working on AgentMemory project' },
      ]);

      const result = detectProjectMentions(transcript);

      expect(result).toContain('AgentMemory');
    });
  });
});

describe('detectQuestionTopics', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty transcript', () => {
      const result = detectQuestionTopics([]);

      expect(result).toEqual([]);
    });

    it('should return empty array when no questions found', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Please fix the bug' },
        { role: 'assistant', content: 'Done, I fixed it' },
      ]);

      const result = detectQuestionTopics(transcript);

      expect(result).toEqual([]);
    });
  });

  describe('question pattern detection', () => {
    it('should detect "how to X" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'How to implement authentication?' },
      ]);

      const result = detectQuestionTopics(transcript);

      expect(result).toContain('implement authentication');
    });

    it('should detect "how do I X" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'How do I connect to the database?' },
      ]);

      const result = detectQuestionTopics(transcript);

      expect(result).toContain('connect to the database');
    });

    it('should detect "why does X" pattern', () => {
      const transcript = createTranscript([{ role: 'user', content: 'Why does the build fail?' }]);

      const result = detectQuestionTopics(transcript);

      expect(result).toContain('the build fail');
    });

    it('should detect "what is X" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'What is the purpose of this module?' },
      ]);

      const result = detectQuestionTopics(transcript);

      expect(result).toContain('the purpose of this module');
    });

    it('should detect "where is X" pattern', () => {
      const transcript = createTranscript([{ role: 'user', content: 'Where is the config file?' }]);

      const result = detectQuestionTopics(transcript);

      expect(result).toContain('the config file');
    });

    it('should detect "can you X" pattern', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Can you explain the architecture?' },
      ]);

      const result = detectQuestionTopics(transcript);

      expect(result).toContain('explain the architecture');
    });
  });

  describe('multiple questions', () => {
    it('should detect multiple question topics', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'How to setup the project?' },
        { role: 'assistant', content: 'Run npm install' },
        { role: 'user', content: 'What is the database schema?' },
      ]);

      const result = detectQuestionTopics(transcript);

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result).toContain('setup the project');
      expect(result).toContain('the database schema');
    });
  });

  describe('topic extraction', () => {
    it('should extract clean topic without question mark', () => {
      const transcript = createTranscript([{ role: 'user', content: 'How to test this?' }]);

      const result = detectQuestionTopics(transcript);

      expect(result[0]).not.toContain('?');
    });
  });
});

describe('detectConflicts', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty transcript', () => {
      const result = detectConflicts([]);

      expect(result).toEqual([]);
    });

    it('should return empty array when no conflicts found', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Use TypeScript' },
        { role: 'assistant', content: 'I will use TypeScript' },
      ]);

      const result = detectConflicts(transcript);

      expect(result).toEqual([]);
    });
  });

  describe('always/never contradiction detection', () => {
    it('should detect "always X" followed by "never X"', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Always use TypeScript strict mode' },
        { role: 'user', content: 'Never use TypeScript strict mode' },
      ]);

      const result = detectConflicts(transcript);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('contradiction');
    });

    it('should detect "never X" followed by "always X"', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Never commit to main' },
        { role: 'user', content: 'Always commit to main directly' },
      ]);

      const result = detectConflicts(transcript);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('conflicting statements', () => {
    it('should detect "use X" vs "do not use X"', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Use Redux for state management' },
        { role: 'user', content: 'Do not use Redux' },
      ]);

      const result = detectConflicts(transcript);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect conflicting preferences', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'I prefer tabs for indentation' },
        { role: 'user', content: 'I prefer spaces for indentation' },
      ]);

      const result = detectConflicts(transcript);

      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('conflict structure', () => {
    it('should return conflict with type and turn indices', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Always use semicolons' },
        { role: 'user', content: 'Never use semicolons' },
      ]);

      const result = detectConflicts(transcript);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('type');
      expect(result[0]).toHaveProperty('turnIndices');
      expect(result[0].turnIndices).toHaveLength(2);
    });

    it('should include conflicting statements in result', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Always format code' },
        { role: 'user', content: 'Never format code automatically' },
      ]);

      const result = detectConflicts(transcript);

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('statements');
      expect(result[0].statements).toHaveLength(2);
    });
  });

  describe('false positive avoidance', () => {
    it('should not flag unrelated always/never statements as conflicts', () => {
      const transcript = createTranscript([
        { role: 'user', content: 'Always write tests' },
        { role: 'user', content: 'Never skip code review' },
      ]);

      const result = detectConflicts(transcript);

      expect(result).toHaveLength(0);
    });
  });
});

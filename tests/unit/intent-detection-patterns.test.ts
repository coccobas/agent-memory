import { describe, it, expect } from 'vitest';
import {
  detectIntent,
  detectEntryType,
  detectCategory,
  extractTitleFromContent,
  detectEpisodeTrigger,
} from '../../src/services/intent-detection/patterns.js';

describe('Intent Detection Patterns', () => {
  describe('detectIntent', () => {
    describe('session_start intent', () => {
      it('should detect "start a session" pattern', () => {
        const result = detectIntent('start a session on authentication');
        expect(result.intent).toBe('session_start');
        expect(result.confidence).toBeGreaterThan(0.5);
      });

      it('should detect "begin working on" pattern', () => {
        const result = detectIntent('begin working on the new feature');
        expect(result.intent).toBe('session_start');
      });

      it('should detect "working on" pattern', () => {
        const result = detectIntent('working on user management');
        expect(result.intent).toBe('session_start');
      });

      it('should detect "new session for" pattern', () => {
        const result = detectIntent('new session for bug fixing');
        expect(result.intent).toBe('session_start');
      });

      it('should extract session name', () => {
        const result = detectIntent('start working on database migration');
        expect(result.extractedParams.sessionName).toBe('database migration');
      });
    });

    describe('session_end intent', () => {
      it('should detect "end session" pattern', () => {
        const result = detectIntent('end the session');
        expect(result.intent).toBe('session_end');
      });

      it('should detect "done with session" pattern', () => {
        const result = detectIntent("I'm done with this session");
        expect(result.intent).toBe('session_end');
      });

      it('should detect "finish working" pattern', () => {
        const result = detectIntent('finish working');
        expect(result.intent).toBe('session_end');
      });

      it('should detect "session complete" pattern', () => {
        const result = detectIntent('session complete');
        expect(result.intent).toBe('session_end');
      });
    });

    describe('store intent', () => {
      it('should detect "remember that" pattern', () => {
        const result = detectIntent('remember that we use TypeScript');
        expect(result.intent).toBe('store');
        expect(result.extractedParams.content).toBe('we use TypeScript');
      });

      it('should detect "store" pattern', () => {
        const result = detectIntent('store this guideline');
        expect(result.intent).toBe('store');
      });

      it('should detect "add a guideline" pattern', () => {
        const result = detectIntent('add a new guideline for testing');
        expect(result.intent).toBe('store');
      });

      it('should detect "rule:" prefix pattern', () => {
        const result = detectIntent('rule: always use strict mode');
        expect(result.intent).toBe('store');
      });

      it('should detect "we always" pattern', () => {
        const result = detectIntent('we always use async/await');
        expect(result.intent).toBe('store');
      });

      it('should detect "our standard is" pattern', () => {
        const result = detectIntent('our standard is to use ESLint');
        expect(result.intent).toBe('store');
      });

      it('should detect "we decided to" pattern', () => {
        const result = detectIntent('we decided to use PostgreSQL');
        expect(result.intent).toBe('store');
      });

      it('should flag vague content like "that" as error', () => {
        const result = detectIntent('remember that');
        expect(result.intent).toBe('store');
        expect(result.extractedParams.error).toBe('content_too_short_or_vague');
        expect(result.extractedParams.content).toBe('that');
      });

      it('should flag single-character content as error', () => {
        const result = detectIntent('remember x');
        expect(result.intent).toBe('store');
        expect(result.extractedParams.error).toBe('content_too_short_or_vague');
      });

      it('should flag "this" as vague content', () => {
        const result = detectIntent('store this');
        expect(result.intent).toBe('store');
        expect(result.extractedParams.error).toBe('content_too_short_or_vague');
      });

      it('should extract entry type and category', () => {
        const result = detectIntent('remember that we always lint code');
        expect(result.extractedParams.entryType).toBeDefined();
        expect(result.extractedParams.category).toBeDefined();
      });
    });

    describe('retrieve intent', () => {
      it('should detect "what is" questions', () => {
        const result = detectIntent('what is our coding standard');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "how do we" questions', () => {
        const result = detectIntent('how do we handle errors');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "what about" pattern', () => {
        const result = detectIntent('what about authentication');
        expect(result.intent).toBe('retrieve');
        expect(result.extractedParams.query).toBe('authentication');
      });

      it('should detect "find" pattern', () => {
        const result = detectIntent('find information about caching');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "show me" pattern', () => {
        const result = detectIntent('show me the database guidelines');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "do we have any knowledge" pattern', () => {
        const result = detectIntent('do we have any knowledge about testing');
        expect(result.intent).toBe('retrieve');
      });

      it('should extract clean query from question', () => {
        const result = detectIntent('what do we know about performance?');
        // The extraction strips "what do we" and "know about" prefixes, leaving just the topic
        expect(result.extractedParams.query).toBe('performance');
      });

      // Bug fix tests: Questions with entry type words should NOT be classified as store
      it('should detect questions ending with ? as retrieve', () => {
        const result = detectIntent('What knowledge entries exist?');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect question words at start as retrieve (no verb required)', () => {
        const result = detectIntent('What knowledge entries are stored');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "What are the guidelines?" as retrieve, not store', () => {
        const result = detectIntent('What are the guidelines?');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "Which tools do we have?" as retrieve', () => {
        const result = detectIntent('Which tools do we have?');
        expect(result.intent).toBe('retrieve');
      });

      it('should detect "What about authentication?" as retrieve', () => {
        const result = detectIntent('What about authentication?');
        expect(result.intent).toBe('retrieve');
      });

      it('should NOT misclassify entry type mentions as store when asking a question', () => {
        // These were previously misclassified as 'store' due to entry type detection fallback
        expect(detectIntent('What knowledge do we have?').intent).toBe('retrieve');
        expect(detectIntent('What guidelines exist?').intent).toBe('retrieve');
        expect(detectIntent('What tools are available?').intent).toBe('retrieve');
      });

      it('should handle question fallback when no other patterns match', () => {
        // Even without explicit patterns, questions should be retrieve
        const result = detectIntent('Is there any documentation?');
        expect(result.intent).toBe('retrieve');
      });
    });

    describe('forget intent', () => {
      it('should detect "forget" pattern', () => {
        const result = detectIntent('forget the old rule');
        expect(result.intent).toBe('forget');
        expect(result.extractedParams.target).toBe('rule');
      });

      it('should detect "delete" pattern', () => {
        const result = detectIntent('delete the outdated knowledge');
        expect(result.intent).toBe('forget');
      });

      it('should detect "clear" pattern', () => {
        const result = detectIntent('clear all guidelines');
        expect(result.intent).toBe('forget');
      });
    });

    describe('list intent', () => {
      it('should detect "list all" pattern', () => {
        const result = detectIntent('list all guidelines');
        expect(result.intent).toBe('list');
        expect(result.extractedParams.entryType).toBe('guideline');
      });

      it('should detect "list my" pattern', () => {
        const result = detectIntent('list my tools');
        expect(result.intent).toBe('list');
        expect(result.extractedParams.entryType).toBe('tool');
      });

      it('should detect "list the" pattern', () => {
        const result = detectIntent('list the knowledge');
        expect(result.intent).toBe('list');
        expect(result.extractedParams.entryType).toBe('knowledge');
      });

      // Note: "show all" and "get" match retrieve intent first due to pattern order
      // This tests the actual documented behavior
      it('should match retrieve for generic show/get patterns', () => {
        expect(detectIntent('show me the tools').intent).toBe('retrieve');
        expect(detectIntent('get knowledge entries').intent).toBe('retrieve');
      });
    });

    describe('update intent', () => {
      it('should detect "update" pattern', () => {
        const result = detectIntent('update the authentication rule');
        expect(result.intent).toBe('update');
        expect(result.extractedParams.target).toBe('authentication rule');
      });

      it('should detect "change" pattern', () => {
        const result = detectIntent('change the coding standard');
        expect(result.intent).toBe('update');
      });

      it('should detect "modify" pattern', () => {
        const result = detectIntent('modify the testing guidelines');
        expect(result.intent).toBe('update');
      });
    });

    describe('unknown intent', () => {
      it('should return unknown for unrecognized text', () => {
        const result = detectIntent('hello world');
        expect(result.intent).toBe('unknown');
        expect(result.confidence).toBe(0);
      });

      it('should return unknown for empty text', () => {
        const result = detectIntent('');
        expect(result.intent).toBe('unknown');
      });
    });

    describe('confidence scoring', () => {
      it('should increase confidence with multiple pattern matches', () => {
        // "remember" is a store pattern
        const singleMatch = detectIntent('remember this');
        // "we always" + mentions of guidelines/rules should match more patterns
        const multiMatch = detectIntent('remember that we always follow guidelines');

        expect(multiMatch.confidence).toBeGreaterThanOrEqual(singleMatch.confidence);
      });

      it('should cap confidence at 1.0', () => {
        const result = detectIntent(
          'remember that we always must never should follow all guidelines rules standards'
        );
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('detectEntryType', () => {
    it('should detect guideline type from keywords', () => {
      expect(detectEntryType('we should always lint code')).toBe('guideline');
      expect(detectEntryType('coding standards for the team')).toBe('guideline');
      expect(detectEntryType('best practices for testing')).toBe('guideline');
      expect(detectEntryType('follow the rules')).toBe('guideline');
    });

    it('should detect knowledge type from keywords', () => {
      expect(detectEntryType('we use PostgreSQL for persistence')).toBe('knowledge');
      expect(detectEntryType('the system architecture uses microservices')).toBe('knowledge');
      expect(detectEntryType('we decided to use Redis')).toBe('knowledge');
      expect(detectEntryType('project uses TypeScript')).toBe('knowledge');
    });

    it('should detect tool type from keywords', () => {
      expect(detectEntryType('npm run build command')).toBe('tool');
      expect(detectEntryType('git workflow for releases')).toBe('tool');
      expect(detectEntryType('docker compose configuration')).toBe('tool');
      expect(detectEntryType('cli command for deployment')).toBe('tool');
    });

    it('should return undefined for ambiguous text', () => {
      expect(detectEntryType('hello world')).toBeUndefined();
      expect(detectEntryType('')).toBeUndefined();
    });

    it('should return highest scoring type when multiple match', () => {
      // "always" is guideline keyword, "npm" is tool keyword
      // Should return whichever has more matches
      const result = detectEntryType('always use npm for packages');
      expect(['guideline', 'tool']).toContain(result);
    });
  });

  describe('detectCategory', () => {
    it('should detect security category', () => {
      expect(detectCategory('security best practices')).toBe('security');
      expect(detectCategory('password hashing with bcrypt')).toBe('security');
      expect(detectCategory('token validation rules')).toBe('security');
    });

    it('should detect code_style category', () => {
      expect(detectCategory('formatting with prettier')).toBe('code_style');
      expect(detectCategory('eslint configuration')).toBe('code_style');
      expect(detectCategory('naming conventions')).toBe('code_style');
    });

    it('should detect testing category', () => {
      expect(detectCategory('vitest configuration')).toBe('testing');
      expect(detectCategory('test coverage requirements')).toBe('testing');
      expect(detectCategory('mock the API')).toBe('testing');
    });

    it('should detect performance category', () => {
      expect(detectCategory('cache invalidation')).toBe('performance');
      expect(detectCategory('optimize the query')).toBe('performance');
      expect(detectCategory('memory leak issue')).toBe('performance');
    });

    it('should detect workflow category', () => {
      expect(detectCategory('deployment pipeline')).toBe('workflow');
      expect(detectCategory('ci/cd configuration')).toBe('workflow');
      expect(detectCategory('development process')).toBe('workflow');
    });

    it('should detect decision category', () => {
      expect(detectCategory('we decided to use TypeScript')).toBe('decision');
      expect(detectCategory('we chose PostgreSQL')).toBe('decision');
    });

    it('should detect fact category', () => {
      expect(detectCategory('the system uses microservices')).toBe('fact');
      expect(detectCategory('architecture is event-driven')).toBe('fact');
    });

    it('should return undefined for uncategorized text', () => {
      expect(detectCategory('hello world')).toBeUndefined();
    });
  });

  describe('extractTitleFromContent', () => {
    it('should extract title from first line', () => {
      const content = 'Use strict mode\nThis helps catch errors early';
      expect(extractTitleFromContent(content)).toBe('Use strict mode');
    });

    it('should remove "we always" prefix', () => {
      const content = 'we always use TypeScript';
      expect(extractTitleFromContent(content)).toBe('use TypeScript');
    });

    it('should remove "our standard is" prefix', () => {
      const content = 'our standard is ESLint';
      expect(extractTitleFromContent(content)).toBe('ESLint');
    });

    it('should truncate long titles', () => {
      const longContent =
        'This is a very long title that exceeds the maximum allowed length for titles in the system';
      const result = extractTitleFromContent(longContent, 30);
      expect(result.length).toBeLessThanOrEqual(30);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should return "Untitled" for empty content', () => {
      expect(extractTitleFromContent('')).toBe('Untitled');
      expect(extractTitleFromContent('   ')).toBe('Untitled');
    });

    it('should handle content with only whitespace on first line', () => {
      const content = '   \nActual content here';
      expect(extractTitleFromContent(content)).toBe('Untitled');
    });

    it('should respect custom maxLength', () => {
      const content = 'A moderately long title here';
      expect(extractTitleFromContent(content, 10).length).toBeLessThanOrEqual(10);
    });
  });

  describe('detectEpisodeTrigger', () => {
    describe('bug_fix trigger', () => {
      it('should detect "fix bug" pattern', () => {
        const result = detectEpisodeTrigger('Fix the authentication bug');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('bug_fix');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      });

      it('should detect "debug issue" pattern', () => {
        const result = detectEpisodeTrigger('Debug the token refresh issue');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('bug_fix');
      });

      it('should detect "fixing" pattern', () => {
        const result = detectEpisodeTrigger('Fixing memory leak');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('bug_fix');
      });

      it('should detect "resolve error" pattern', () => {
        const result = detectEpisodeTrigger('Resolve the 500 error on login');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('bug_fix');
      });
    });

    describe('feature trigger', () => {
      it('should detect "add feature" pattern', () => {
        const result = detectEpisodeTrigger('Add user profile feature');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('feature');
      });

      it('should detect "implement functionality" pattern', () => {
        const result = detectEpisodeTrigger('Implement search functionality');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('feature');
      });

      it('should detect "new endpoint" pattern', () => {
        const result = detectEpisodeTrigger('Create new API endpoint for payments');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('feature');
      });
    });

    describe('refactor trigger', () => {
      it('should detect "refactor" pattern', () => {
        const result = detectEpisodeTrigger('Refactor the auth module');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('refactor');
      });

      it('should detect "clean up" pattern', () => {
        const result = detectEpisodeTrigger('Clean up the legacy code');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('refactor');
      });

      it('should detect "restructure" pattern', () => {
        const result = detectEpisodeTrigger('Restructure the service layer');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('refactor');
      });
    });

    describe('investigation trigger', () => {
      it('should detect "investigate" pattern', () => {
        const result = detectEpisodeTrigger('Investigate slow query performance');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('investigation');
      });

      it('should detect "figure out" pattern', () => {
        const result = detectEpisodeTrigger('Figure out why tests fail');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('investigation');
      });

      it('should detect "research" pattern', () => {
        const result = detectEpisodeTrigger('Research caching strategies');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('investigation');
      });
    });

    describe('implementation trigger', () => {
      it('should detect "implement" pattern', () => {
        const result = detectEpisodeTrigger('Implement the webhook handler');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('implementation');
      });

      it('should detect "wire up" pattern', () => {
        const result = detectEpisodeTrigger('Wire up the database connection');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('implementation');
      });

      it('should detect "set up" pattern', () => {
        const result = detectEpisodeTrigger('Setting up CI/CD pipeline');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe('implementation');
      });
    });

    describe('exclusion patterns', () => {
      it('should exclude "test" prefix', () => {
        const result = detectEpisodeTrigger('Test the login flow');
        expect(result.shouldCreate).toBe(false);
      });

      it('should exclude "check" prefix', () => {
        const result = detectEpisodeTrigger('Check the logs');
        expect(result.shouldCreate).toBe(false);
      });

      it('should exclude "quick" prefix', () => {
        const result = detectEpisodeTrigger('Quick fix for typo');
        expect(result.shouldCreate).toBe(false);
      });

      it('should exclude "question" keyword', () => {
        const result = detectEpisodeTrigger('Question about the API');
        expect(result.shouldCreate).toBe(false);
      });
    });

    describe('heuristic fallback', () => {
      it('should create episode for descriptive names (3+ words)', () => {
        const result = detectEpisodeTrigger('Update user authentication flow');
        expect(result.shouldCreate).toBe(true);
        expect(result.triggerType).toBe(null); // No specific trigger matched
        expect(result.confidence).toBe(0.5);
        expect(result.matchedPatterns).toContain('descriptive_name_heuristic');
      });

      it('should not create episode for short names (< 3 words)', () => {
        const result = detectEpisodeTrigger('Update code');
        expect(result.shouldCreate).toBe(false);
      });

      it('should not create episode for single word', () => {
        const result = detectEpisodeTrigger('Testing');
        expect(result.shouldCreate).toBe(false);
      });
    });

    describe('confidence scoring', () => {
      it('should have higher confidence with multiple pattern matches', () => {
        // "fixing" matches one pattern
        const single = detectEpisodeTrigger('Fixing something');
        // "fix the bug" should match multiple patterns
        const multiple = detectEpisodeTrigger('Fix the authentication bug issue');
        expect(multiple.confidence).toBeGreaterThanOrEqual(single.confidence);
      });

      it('should cap confidence at 0.95', () => {
        // Try to get many matches
        const result = detectEpisodeTrigger('Fixing debugging the bug issue error problem crash');
        expect(result.confidence).toBeLessThanOrEqual(0.95);
      });
    });
  });
});

describe('UX friction fixes', () => {
  it('should detect "show me everything" correctly (list or retrieve acceptable)', () => {
    const result = detectIntent('show me everything');
    // Bug was extracting "me everything" - as long as it works, intent doesn't matter
    expect(['list', 'retrieve']).toContain(result.intent);
  });

  it('should detect "list everything" as list intent', () => {
    const result = detectIntent('list everything');
    expect(result.intent).toBe('list');
  });

  it('should detect "display everything" as list intent', () => {
    const result = detectIntent('display everything');
    expect(result.intent).toBe('list');
  });

  it('should detect "find entries tagged with X" as retrieve with tag filter', () => {
    const result = detectIntent('find entries tagged with security');
    expect(result.intent).toBe('retrieve');
    expect(result.extractedParams.tagFilter).toBe('security');
    expect(result.extractedParams.useTagFilter).toBe('true');
  });

  it('should detect "show items tagged with X" as retrieve with tag filter', () => {
    const result = detectIntent('show items tagged with testing');
    expect(result.intent).toBe('retrieve');
    expect(result.extractedParams.tagFilter).toBe('testing');
  });

  it('should detect "list tagged with X" as retrieve with tag filter', () => {
    const result = detectIntent('list tagged with performance');
    expect(result.intent).toBe('retrieve');
    expect(result.extractedParams.tagFilter).toBe('performance');
  });
});

describe('Episode natural language intents', () => {
  describe('episode_begin', () => {
    it('should detect "start episode: X" pattern', () => {
      const result = detectIntent('start episode: Fix login bug');
      expect(result.intent).toBe('episode_begin');
      expect(result.extractedParams.name).toBe('Fix login bug');
    });

    it('should detect "begin episode: X" pattern', () => {
      const result = detectIntent('begin episode: Refactor auth');
      expect(result.intent).toBe('episode_begin');
      expect(result.extractedParams.name).toBe('Refactor auth');
    });

    it('should detect "start an episode: X" pattern', () => {
      const result = detectIntent('start an episode: Add feature');
      expect(result.intent).toBe('episode_begin');
      expect(result.extractedParams.name).toBe('Add feature');
    });

    it('should detect "working on: X" pattern', () => {
      const result = detectIntent('working on: database migration');
      expect(result.intent).toBe('episode_begin');
      expect(result.extractedParams.name).toBe('database migration');
    });

    it('should detect "task: X" pattern', () => {
      const result = detectIntent('task: implement caching');
      expect(result.intent).toBe('episode_begin');
      expect(result.extractedParams.name).toBe('implement caching');
    });
  });

  describe('episode_log', () => {
    it('should detect "log: X" pattern', () => {
      const result = detectIntent('log: completed the migration');
      expect(result.intent).toBe('episode_log');
      expect(result.extractedParams.message).toBe('completed the migration');
    });

    it('should detect "checkpoint: X" pattern', () => {
      const result = detectIntent('checkpoint: tests passing');
      expect(result.intent).toBe('episode_log');
      expect(result.extractedParams.message).toBe('tests passing');
    });

    it('should detect "found that X" pattern', () => {
      const result = detectIntent('found that the timeout was too short');
      expect(result.intent).toBe('episode_log');
      expect(result.extractedParams.eventType).toBe('checkpoint');
    });

    it('should detect "decided to X" pattern', () => {
      const result = detectIntent('decided to use Redis for caching');
      expect(result.intent).toBe('episode_log');
      expect(result.extractedParams.eventType).toBe('decision');
    });

    it('should detect "episode log: X" pattern', () => {
      const result = detectIntent('episode log: implemented the fix');
      expect(result.intent).toBe('episode_log');
      expect(result.extractedParams.message).toBe('implemented the fix');
    });

    it('should detect "add log to episode: X" pattern', () => {
      const result = detectIntent('add log to episode: completed testing');
      expect(result.intent).toBe('episode_log');
      expect(result.extractedParams.message).toBe('completed testing');
    });
  });

  describe('episode_complete', () => {
    it('should detect "end episode" pattern', () => {
      const result = detectIntent('end episode');
      expect(result.intent).toBe('episode_complete');
    });

    it('should detect "complete episode" pattern', () => {
      const result = detectIntent('complete episode');
      expect(result.intent).toBe('episode_complete');
    });

    it('should detect "finish episode" pattern', () => {
      const result = detectIntent('finish episode');
      expect(result.intent).toBe('episode_complete');
    });

    it('should detect "success: X" pattern', () => {
      const result = detectIntent('success: bug fixed');
      expect(result.intent).toBe('episode_complete');
      expect(result.extractedParams.outcomeType).toBe('success');
    });

    it('should detect "failure: X" pattern', () => {
      const result = detectIntent('failure: could not reproduce');
      expect(result.intent).toBe('episode_complete');
      expect(result.extractedParams.outcomeType).toBe('failure');
    });

    it('should detect "finished the task" pattern', () => {
      const result = detectIntent('finished the task: all tests passing');
      expect(result.intent).toBe('episode_complete');
    });
  });

  describe('episode_query', () => {
    it('should detect "what happened during X" pattern', () => {
      const result = detectIntent('what happened during the refactor');
      expect(result.intent).toBe('episode_query');
      expect(result.extractedParams.ref).toBe('the refactor');
    });

    it('should detect "show what happened" pattern', () => {
      const result = detectIntent('show what happened');
      expect(result.intent).toBe('episode_query');
    });

    it('should detect "timeline of X" pattern', () => {
      const result = detectIntent('timeline of the migration');
      expect(result.intent).toBe('episode_query');
      expect(result.extractedParams.ref).toBe('the migration');
    });

    it('should detect "episode timeline" pattern', () => {
      const result = detectIntent('episode timeline');
      expect(result.intent).toBe('episode_query');
    });

    it('should detect "show episode timeline" pattern', () => {
      const result = detectIntent('show episode timeline');
      expect(result.intent).toBe('episode_query');
    });

    it('should detect "episode history" pattern', () => {
      const result = detectIntent('episode history');
      expect(result.intent).toBe('episode_query');
    });

    it('should detect "session timeline" pattern', () => {
      const result = detectIntent('session timeline');
      expect(result.intent).toBe('episode_query');
    });

    it('should detect "show session history" pattern', () => {
      const result = detectIntent('show session history');
      expect(result.intent).toBe('episode_query');
    });

    it('should detect "get the session timeline" pattern', () => {
      const result = detectIntent('get the session timeline');
      expect(result.intent).toBe('episode_query');
    });
  });
});

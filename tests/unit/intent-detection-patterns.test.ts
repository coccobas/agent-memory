import { describe, it, expect } from 'vitest';
import {
  detectIntent,
  detectEntryType,
  detectCategory,
  extractTitleFromContent,
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
});

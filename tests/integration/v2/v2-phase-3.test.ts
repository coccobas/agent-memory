import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { createSqliteMemoryV2Runtime } from '../../../src/v2/adapters/index.js';
import { handleV2MemoryQuery } from '../../../src/v2/mcp/handlers.js';
import {
  handleRemember,
  extractContent,
  detectEntryType,
  inferCategory,
} from '../../../src/v2/mcp/remember-handler.js';
import { handleUnifiedMemory, detectIntent } from '../../../src/v2/mcp/unified-handler.js';
import { handleQuickstart } from '../../../src/v2/mcp/quickstart-handler.js';
import { ensureProjectScope } from '../../../src/v2/mcp/context-detection.js';
import type { AppContext } from '../../../src/core/context.js';

function applyV2Migrations(sqlite: Database.Database): void {
  sqlite.pragma('foreign_keys = ON');
  const base = readFileSync(
    join(process.cwd(), 'src/db/migrations/0044_add_v2_core_schema.sql'),
    'utf8'
  );
  sqlite.exec(base);

  const additions = readFileSync(
    join(process.cwd(), 'src/db/migrations/0045_add_embedding_vector.sql'),
    'utf8'
  );
  sqlite.exec(additions);
}

function contextWithSqlite(sqlite: Database.Database): AppContext {
  return { sqlite } as unknown as AppContext;
}

// ==========================================================================
// Phase 3a: Remember Handler
// ==========================================================================

describe('Phase 3a: Remember handler', () => {
  // --- Pure function tests ---

  describe('extractContent', () => {
    it('strips common prefixes', () => {
      expect(extractContent('remember that we use TypeScript').content).toBe('we use TypeScript');
      expect(extractContent('store the API key pattern').content).toBe('the API key pattern');
      expect(extractContent('this is a rule: always lint').content).toBe('always lint');
    });

    it('generates title from first sentence', () => {
      const result = extractContent('We use ESLint for linting. It catches bugs early.');
      expect(result.title).toBe('We use ESLint for linting');
      expect(result.content).toBe('We use ESLint for linting. It catches bugs early.');
    });

    it('truncates long titles at word boundary', () => {
      const longText =
        'This is a very long sentence that goes on and on and on about various things that should be truncated properly at a word boundary';
      const result = extractContent(longText);
      expect(result.title.length).toBeLessThanOrEqual(83); // 80 + '...'
      expect(result.title.endsWith('...')).toBe(true);
    });
  });

  describe('detectEntryType', () => {
    it('detects guidelines', () => {
      expect(detectEntryType('always use strict mode')).toBe('guideline');
      expect(detectEntryType('we must follow the coding standard')).toBe('guideline');
    });

    it('detects knowledge', () => {
      expect(detectEntryType('we decided to use PostgreSQL')).toBe('knowledge');
      expect(detectEntryType('the system uses microservices architecture')).toBe('knowledge');
    });

    it('detects tools', () => {
      expect(detectEntryType('run npm install to setup')).toBe('tool');
      expect(detectEntryType('use the docker CLI for deployment')).toBe('tool');
    });

    it('returns undefined for ambiguous text', () => {
      expect(detectEntryType('hello world')).toBeUndefined();
    });
  });

  describe('inferCategory', () => {
    it('infers guideline categories', () => {
      expect(inferCategory('guideline', 'always validate auth tokens')).toBe('security');
      expect(inferCategory('guideline', 'use consistent naming conventions')).toBe('code_style');
      expect(inferCategory('guideline', 'maintain 80% test coverage')).toBe('testing');
    });

    it('infers knowledge categories', () => {
      expect(inferCategory('knowledge', 'we decided to use REST')).toBe('decision');
      expect(inferCategory('knowledge', 'microservices architecture pattern')).toBe('architecture');
      expect(inferCategory('knowledge', 'the database is PostgreSQL')).toBe('fact');
    });
  });

  // --- Integration tests ---

  describe('handleRemember (integration)', () => {
    it('stores a guideline via v2 write plane', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);

      // Create project scope
      ensureProjectScope(sqlite, 'test-proj', 'Test Project');

      const result = await handleRemember(ctx, {
        text: 'We must always use TypeScript strict mode',
        projectId: 'test-proj',
      });

      expect(result.success).toBe(true);
      expect(result.stored).toBeDefined();
      expect(result.stored!.type).toBe('guideline');
      expect(result.stored!.category).toBe('workflow');
      expect(result.stored!.projectId).toBe('test-proj');
      expect(result.stored!.id).toBeTruthy();
      expect(result._display).toContain('guideline');
    });

    it('stores knowledge with auto-detection', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      const result = await handleRemember(ctx, {
        text: 'We decided to use PostgreSQL because of its JSON support',
        projectId: 'test-proj',
      });

      expect(result.success).toBe(true);
      expect(result.stored!.type).toBe('knowledge');
      expect(result.stored!.category).toBe('decision');
    });

    it('respects forceType override', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      const result = await handleRemember(ctx, {
        text: 'Some generic text about the project setup',
        projectId: 'test-proj',
        forceType: 'tool',
      });

      expect(result.success).toBe(true);
      expect(result.stored!.type).toBe('tool');
      expect(result.classification!.wasForced).toBe(true);
      expect(result.classification!.confidence).toBe(1.0);
    });

    it('stores with tags', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      const result = await handleRemember(ctx, {
        text: 'Always validate input before processing',
        projectId: 'test-proj',
        tags: ['security', 'validation'],
      });

      expect(result.success).toBe(true);

      // Verify the entry was stored and can be queried
      const queryResult = (await handleV2MemoryQuery(ctx, {
        action: 'search',
        query: 'validate input',
        scope: { type: 'project', id: 'test-proj' },
        limit: 10,
      })) as { results: Array<{ entry: { tags: string[] } }> };

      // The entry should be findable
      expect(queryResult.results.length).toBeGreaterThan(0);
    });

    it('rejects empty or too-short text', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);

      const emptyResult = await handleRemember(ctx, { text: '' });
      expect(emptyResult.success).toBe(false);
      expect(emptyResult.error).toBe('text_required');

      const shortResult = await handleRemember(ctx, { text: 'remember ab', projectId: 'x' });
      expect(shortResult.success).toBe(false);
      expect(shortResult.error).toBe('content_too_short');
    });

    it('rejects invalid priority', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      const result = await handleRemember(ctx, {
        text: 'Always use strict mode',
        projectId: 'test-proj',
        priority: 150,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_priority');
    });
  });
});

// ==========================================================================
// Phase 3b: Unified Handler (intent detection + routing)
// ==========================================================================

describe('Phase 3b: Unified handler', () => {
  describe('detectIntent', () => {
    it('detects store intents', () => {
      expect(detectIntent('remember that we use ESLint').intent).toBe('store');
      expect(detectIntent('we always use TypeScript').intent).toBe('store');
      expect(detectIntent('guideline: use strict mode').intent).toBe('store');
    });

    it('detects retrieve intents', () => {
      expect(detectIntent('what do we know about auth?').intent).toBe('retrieve');
      expect(detectIntent('find guidelines about testing').intent).toBe('retrieve');
      expect(detectIntent('how should we handle errors?').intent).toBe('retrieve');
    });

    it('detects session intents', () => {
      expect(detectIntent('start working on auth fix').intent).toBe('session_start');
      expect(detectIntent('end session').intent).toBe('session_end');
      expect(detectIntent('done working').intent).toBe('session_end');
    });

    it('detects list intents', () => {
      expect(detectIntent('list all guidelines').intent).toBe('list');
      expect(detectIntent('show my sessions').intent).toBe('list_sessions');
    });

    it('falls back to retrieve for questions', () => {
      const result = detectIntent('is there a caching strategy?');
      expect(result.intent).toBe('retrieve');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('returns unknown for unrecognizable input', () => {
      expect(detectIntent('xyzzy').intent).toBe('unknown');
    });
  });

  describe('handleUnifiedMemory (integration)', () => {
    it('routes store intent to remember handler', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      const result = (await handleUnifiedMemory(ctx, {
        text: 'remember that we use ESLint with the Airbnb config',
        projectId: 'test-proj',
      })) as { success: boolean; stored: { type: string } };

      expect(result.success).toBe(true);
      expect(result.stored.type).toBeDefined();
    });

    it('routes retrieve intent to v2 query', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      // First store something
      await handleRemember(ctx, {
        text: 'We use PostgreSQL for the database',
        projectId: 'test-proj',
      });

      // Now query via unified handler
      const result = (await handleUnifiedMemory(ctx, {
        text: 'what database do we use?',
        projectId: 'test-proj',
      })) as { results: unknown[]; totalCount: number };

      // Should return search results
      expect(result).toHaveProperty('results');
    });

    it('analyzeOnly returns intent without executing', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);

      const result = (await handleUnifiedMemory(ctx, {
        text: 'remember that we use TypeScript',
        analyzeOnly: true,
      })) as { analyzed: boolean; intent: string; confidence: number };

      expect(result.analyzed).toBe(true);
      expect(result.intent).toBe('store');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('rejects empty input', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);

      const result = (await handleUnifiedMemory(ctx, { text: '' })) as { error: string };
      expect(result.error).toBe('empty_input');
    });

    it('routes session_start to session handler', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);
      ensureProjectScope(sqlite, 'test-proj');

      const result = (await handleUnifiedMemory(ctx, {
        text: 'start working on the auth fix',
        projectId: 'test-proj',
      })) as { session: { scopeId: string }; created: boolean };

      expect(result.session).toBeDefined();
      expect(result.created).toBe(true);
    });

    it('returns helpful message for forget intent', async () => {
      const sqlite = new Database(':memory:');
      applyV2Migrations(sqlite);
      const ctx = contextWithSqlite(sqlite);

      const result = (await handleUnifiedMemory(ctx, {
        text: 'forget the old database config',
        projectId: 'test-proj',
      })) as { intent: string; message: string };

      expect(result.intent).toBe('forget');
      expect(result.message).toContain('delete_entry');
    });
  });
});

// ==========================================================================
// Phase 3c: Quickstart Handler
// ==========================================================================

describe('Phase 3c: Quickstart handler', () => {
  it('loads context and starts session for known project', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const ctx = contextWithSqlite(sqlite);

    // Create a project with some entries
    ensureProjectScope(sqlite, 'my-proj', 'My Project');
    const runtime = createSqliteMemoryV2Runtime({ sqlite, projectorName: 'test' });
    await runtime.memory.write.upsertEntry({
      actorId: 'test',
      data: {
        type: 'guideline',
        title: 'Use strict mode',
        content: 'Always enable TypeScript strict mode',
        source: 'remember',
        scope: { type: 'project', id: 'my-proj' },
        priority: 95,
      },
    });

    const result = await handleQuickstart(ctx, {
      projectId: 'my-proj',
      sessionName: 'Test session',
    });

    expect(result.quickstart.contextLoaded).toBe(true);
    expect(result.quickstart.projectId).toBe('my-proj');
    expect(result.quickstart.sessionStarted).toBe(true);
    expect(result.quickstart.sessionAction).toBe('created');
    expect(result.session).not.toBeNull();
    expect(result._display).toContain('My Project');
    expect(result._display).toContain('Test session');
  });

  it('generates default session name when not provided', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const ctx = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'proj-1', 'Project 1');

    const result = await handleQuickstart(ctx, { projectId: 'proj-1' });

    expect(result.quickstart.requestedSessionName).toMatch(/^Session \d{4}-\d{2}-\d{2}$/);
    expect(result.quickstart.sessionStarted).toBe(true);
  });

  it('resumes existing active session instead of creating new one', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const ctx = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'proj-1', 'Project 1');

    // First quickstart creates a session
    const first = await handleQuickstart(ctx, {
      projectId: 'proj-1',
      sessionName: 'Working on auth',
    });
    expect(first.quickstart.sessionAction).toBe('created');

    // Second quickstart should resume (session is fresh, not stale)
    const second = await handleQuickstart(ctx, {
      projectId: 'proj-1',
      sessionName: 'Working on auth again',
    });
    expect(second.quickstart.sessionAction).toBe('resumed');
  });

  it('returns context in verbose mode', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const ctx = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'proj-1');

    const runtime = createSqliteMemoryV2Runtime({ sqlite, projectorName: 'test' });
    await runtime.memory.write.upsertEntry({
      actorId: 'test',
      data: {
        type: 'knowledge',
        title: 'API uses REST',
        content: 'Our API follows RESTful conventions',
        source: 'remember',
        scope: { type: 'project', id: 'proj-1' },
      },
    });

    const result = await handleQuickstart(ctx, {
      projectId: 'proj-1',
      verbose: true,
    });

    const context = result.context as { entries: unknown[]; totalCount: number };
    expect(context.entries).toBeDefined();
    expect(context.totalCount).toBeGreaterThan(0);
  });

  it('handles missing project gracefully', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const ctx = contextWithSqlite(sqlite);

    // No project exists and none can be detected from cwd
    const result = await handleQuickstart(ctx, {});

    // Should still return a result, just with null project
    expect(result.quickstart.contextLoaded).toBe(true);
    expect(result.quickstart.projectId).toBeNull();
    expect(result.quickstart.sessionAction).toBe('none');
  });

  it('hierarchical context is default (non-verbose)', async () => {
    const sqlite = new Database(':memory:');
    applyV2Migrations(sqlite);
    const ctx = contextWithSqlite(sqlite);
    ensureProjectScope(sqlite, 'proj-1');

    const runtime = createSqliteMemoryV2Runtime({ sqlite, projectorName: 'test' });
    await runtime.memory.write.upsertEntry({
      actorId: 'test',
      data: {
        type: 'guideline',
        title: 'Critical rule',
        content: 'This is critical',
        source: 'remember',
        scope: { type: 'project', id: 'proj-1' },
        priority: 95,
      },
    });

    const result = await handleQuickstart(ctx, { projectId: 'proj-1' });

    // Hierarchical context has summary, critical, etc.
    const context = result.context as { summary: unknown; critical: unknown[] };
    expect(context.summary).toBeDefined();
  });
});

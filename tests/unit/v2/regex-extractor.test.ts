import { describe, expect, it } from 'vitest';
import { RegexExtractorStrategy } from '../../../src/v2/hooks/strategies/regex-extractor.js';
import type { TranscriptMessage } from '../../../src/v2/contracts/transcript.js';

function makeMsg(content: string, role: 'user' | 'assistant' = 'user'): TranscriptMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    transcriptId: 'tx-1',
    sequenceNum: 1,
    role,
    content,
    toolName: null,
    timestamp: null,
    metadata: {},
  };
}

describe('RegexExtractorStrategy', () => {
  const strategy = new RegexExtractorStrategy();

  it('has name "regex"', () => {
    expect(strategy.name).toBe('regex');
  });

  it('extracts guideline from "we always use TypeScript strict mode"', () => {
    const messages = [
      makeMsg('We always use TypeScript strict mode coding style convention in our projects'),
    ];
    const results = strategy.extract(messages);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const guideline = results.find((r) => r.entryType === 'guideline');
    expect(guideline).toBeDefined();
    expect(guideline!.category).toBe('code_style');
  });

  it('extracts knowledge from "we decided to use PostgreSQL for the main DB"', () => {
    const messages = [
      makeMsg('We decided to use PostgreSQL for the main database because of JSONB support'),
    ];
    const results = strategy.extract(messages);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const knowledge = results.find((r) => r.entryType === 'knowledge');
    expect(knowledge).toBeDefined();
    expect(knowledge!.category).toBe('decision');
  });

  it('extracts tool from "run npm run build to compile"', () => {
    const messages = [makeMsg('Run npm run build to compile the TypeScript source')];
    const results = strategy.extract(messages);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const tool = results.find((r) => r.entryType === 'tool');
    expect(tool).toBeDefined();
    expect(tool!.category).toBe('cli');
  });

  it('ignores assistant messages (only user messages)', () => {
    const messages = [
      makeMsg('We always use strict mode', 'assistant'),
      makeMsg('The system architecture is microservices', 'assistant'),
    ];
    const results = strategy.extract(messages);
    expect(results).toHaveLength(0);
  });

  it('ignores short messages (< 20 chars)', () => {
    const messages = [makeMsg('use npm')];
    const results = strategy.extract(messages);
    expect(results).toHaveLength(0);
  });

  it('returns empty for messages with no capturable patterns', () => {
    const messages = [
      makeMsg('Can you help me fix this error in my code? The function is returning undefined.'),
    ];
    const results = strategy.extract(messages);
    expect(results).toHaveLength(0);
  });

  it('assigns correct confidence (0.7 for detected type, 0.5 for fallback)', () => {
    const messages = [makeMsg('We always follow the Airbnb eslint configuration for code style')];
    const results = strategy.extract(messages);

    expect(results.length).toBeGreaterThanOrEqual(1);
    // "always" + "code style" → guideline with high confidence
    expect(results[0]!.confidence).toBe(0.7);
  });

  it('infers category correctly for various types', () => {
    const securityMsg = makeMsg(
      'We must always validate authentication tokens before processing any request'
    );
    const securityResults = strategy.extract([securityMsg]);
    const secResult = securityResults.find((r) => r.category === 'security');
    expect(secResult).toBeDefined();

    const archMsg = makeMsg(
      'The system architecture uses a microservices design pattern for scalability'
    );
    const archResults = strategy.extract([archMsg]);
    const archResult = archResults.find((r) => r.category === 'architecture');
    expect(archResult).toBeDefined();
  });
});

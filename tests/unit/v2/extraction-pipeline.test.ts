import { describe, expect, it } from 'vitest';
import { ExtractionPipeline } from '../../../src/v2/hooks/extraction-pipeline.js';
import type {
  ExtractorStrategy,
  ExtractionCandidate,
} from '../../../src/v2/contracts/extractor.js';
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

function makeStrategy(name: string, candidates: ExtractionCandidate[]): ExtractorStrategy {
  return {
    name,
    extract: () => candidates,
  };
}

describe('ExtractionPipeline', () => {
  it('with no strategies returns empty array', () => {
    const pipeline = new ExtractionPipeline();
    const result = pipeline.run([makeMsg('hello')]);
    expect(result).toEqual([]);
  });

  it('runs single strategy and returns its candidates', () => {
    const pipeline = new ExtractionPipeline();
    const candidate: ExtractionCandidate = {
      title: 'Use TypeScript strict mode',
      content: 'We always use TypeScript strict mode',
      entryType: 'guideline',
      category: 'code_style',
      confidence: 0.7,
      source: 'regex',
    };

    pipeline.register(makeStrategy('regex', [candidate]));

    const result = pipeline.run([makeMsg('We always use TypeScript strict mode')]);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Use TypeScript strict mode');
  });

  it('merges candidates from multiple strategies', () => {
    const pipeline = new ExtractionPipeline();

    pipeline.register(
      makeStrategy('strategy-a', [
        {
          title: 'Candidate A',
          content: 'content a',
          entryType: 'guideline',
          category: 'workflow',
          confidence: 0.7,
          source: 'strategy-a',
        },
      ])
    );

    pipeline.register(
      makeStrategy('strategy-b', [
        {
          title: 'Candidate B',
          content: 'content b',
          entryType: 'knowledge',
          category: 'fact',
          confidence: 0.8,
          source: 'strategy-b',
        },
      ])
    );

    const result = pipeline.run([makeMsg('test')]);
    expect(result).toHaveLength(2);
  });

  it('deduplicates candidates with same normalized title', () => {
    const pipeline = new ExtractionPipeline();

    pipeline.register(
      makeStrategy('a', [
        {
          title: 'Use TypeScript Strict',
          content: 'content 1',
          entryType: 'guideline',
          category: 'code_style',
          confidence: 0.6,
          source: 'a',
        },
      ])
    );

    pipeline.register(
      makeStrategy('b', [
        {
          title: 'use typescript strict',
          content: 'content 2',
          entryType: 'guideline',
          category: 'code_style',
          confidence: 0.8,
          source: 'b',
        },
      ])
    );

    const result = pipeline.run([makeMsg('test')]);
    expect(result).toHaveLength(1);
    // Should keep the higher confidence one
    expect(result[0]!.confidence).toBe(0.8);
  });

  it('sorts by confidence descending', () => {
    const pipeline = new ExtractionPipeline();

    pipeline.register(
      makeStrategy('mixed', [
        {
          title: 'Low',
          content: 'low',
          entryType: 'knowledge',
          category: 'fact',
          confidence: 0.3,
          source: 'test',
        },
        {
          title: 'High',
          content: 'high',
          entryType: 'guideline',
          category: 'workflow',
          confidence: 0.9,
          source: 'test',
        },
        {
          title: 'Medium',
          content: 'med',
          entryType: 'tool',
          category: 'cli',
          confidence: 0.6,
          source: 'test',
        },
      ])
    );

    const result = pipeline.run([makeMsg('test')]);
    expect(result[0]!.title).toBe('High');
    expect(result[1]!.title).toBe('Medium');
    expect(result[2]!.title).toBe('Low');
  });
});

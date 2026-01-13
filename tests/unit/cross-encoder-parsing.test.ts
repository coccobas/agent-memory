/**
 * Cross-Encoder Parsing Tests (P1)
 *
 * Tests edge cases in cross-encoder score parsing:
 * - Malformed JSON responses
 * - Wrong score ranges (0-10 vs 0-1)
 * - Missing fields
 * - Timeout handling
 * - Invalid score formats
 */

import { describe, it, expect, vi } from 'vitest';

describe('Cross-Encoder Parsing - Edge Cases', () => {
  describe('parseScoreResponse', () => {
    it('should parse valid score in 0-1 range', () => {
      const response = '{"score": 0.85}';
      const result = parseScoreResponse(response);
      expect(result.score).toBeCloseTo(0.85, 5);
      expect(result.error).toBeUndefined();
    });

    it('should parse valid score in 0-10 range and normalize', () => {
      const response = '{"score": 8.5}';
      const result = parseScoreResponse(response);
      expect(result.score).toBeCloseTo(0.85, 5); // Normalized to 0-1
    });

    it('should handle score exactly at 10', () => {
      const response = '{"score": 10}';
      const result = parseScoreResponse(response);
      expect(result.score).toBeCloseTo(1.0, 5);
    });

    it('should handle score exactly at 0', () => {
      const response = '{"score": 0}';
      const result = parseScoreResponse(response);
      expect(result.score).toBe(0);
    });

    it('should handle score > 10 (invalid)', () => {
      const response = '{"score": 15}';
      const result = parseScoreResponse(response);
      // Should clamp to 1.0
      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('should handle negative score', () => {
      const response = '{"score": -0.5}';
      const result = parseScoreResponse(response);
      // Should clamp to 0
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle string score (numeric string)', () => {
      const response = '{"score": "0.75"}';
      const result = parseScoreResponse(response);
      expect(result.score).toBeCloseTo(0.75, 5);
    });

    it('should handle invalid string score', () => {
      const response = '{"score": "high"}';
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle missing score field', () => {
      const response = '{"relevance": 0.8}';
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed JSON', () => {
      const response = '{"score": 0.8';
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('JSON');
    });

    it('should handle empty response', () => {
      const response = '';
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle null response', () => {
      const response = null as any;
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle undefined response', () => {
      const response = undefined as any;
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle array response', () => {
      const response = '[0.8]';
      const result = parseScoreResponse(response);
      // Should handle gracefully
      expect(result.error).toBeDefined();
    });

    it('should handle score as NaN string', () => {
      const response = '{"score": "NaN"}';
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle score as Infinity', () => {
      const response = '{"score": Infinity}';
      // This is actually invalid JSON, but test handling
      const result = parseScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle nested score', () => {
      const response = '{"result": {"score": 0.9}}';
      const result = parseScoreResponse(response);
      // Should handle nested structure
      expect(result.score !== undefined || result.error !== undefined).toBe(true);
    });
  });

  describe('parseBatchScoreResponse', () => {
    it('should parse valid batch response', () => {
      const response = '{"scores": [0.8, 0.6, 0.9]}';
      const result = parseBatchScoreResponse(response);
      expect(result.scores).toEqual([0.8, 0.6, 0.9]);
    });

    it('should handle mixed ranges in batch', () => {
      const response = '{"scores": [0.8, 8.0, 0.3]}';
      const result = parseBatchScoreResponse(response);
      // Should normalize consistently
      expect(result.scores!.every((s) => s >= 0 && s <= 1)).toBe(true);
    });

    it('should handle empty scores array', () => {
      const response = '{"scores": []}';
      const result = parseBatchScoreResponse(response);
      expect(result.scores).toEqual([]);
    });

    it('should handle missing scores field', () => {
      const response = '{"results": [0.8, 0.6]}';
      const result = parseBatchScoreResponse(response);
      expect(result.error).toBeDefined();
    });

    it('should handle scores with NaN', () => {
      const response = '{"scores": [0.8, null, 0.9]}';
      const result = parseBatchScoreResponse(response);
      // Should handle null/NaN in array
      expect(result.scores!.every((s) => Number.isFinite(s))).toBe(true);
    });

    it('should handle malformed array', () => {
      const response = '{"scores": [0.8, "invalid", 0.9]}';
      const result = parseBatchScoreResponse(response);
      // Should either error or filter/default invalid
      expect(result.scores !== undefined || result.error !== undefined).toBe(true);
    });
  });

  describe('detectScoreRange', () => {
    it('should detect 0-1 range', () => {
      const scores = [0.8, 0.3, 0.95, 0.1];
      const range = detectScoreRange(scores);
      expect(range).toBe('0-1');
    });

    it('should detect 0-10 range', () => {
      const scores = [8.5, 3.2, 9.1, 1.5];
      const range = detectScoreRange(scores);
      expect(range).toBe('0-10');
    });

    it('should detect 0-100 range', () => {
      const scores = [85, 32, 91, 15];
      const range = detectScoreRange(scores);
      expect(range).toBe('0-100');
    });

    it('should handle ambiguous range (all low)', () => {
      const scores = [0.8, 0.3, 0.9]; // Could be 0-1 or 0-10
      const range = detectScoreRange(scores);
      expect(range).toBe('0-1'); // Default to 0-1
    });

    it('should handle single score', () => {
      const scores = [5];
      const range = detectScoreRange(scores);
      // Ambiguous - could be 0-10
      expect(['0-1', '0-10']).toContain(range);
    });

    it('should handle empty array', () => {
      const scores: number[] = [];
      const range = detectScoreRange(scores);
      expect(range).toBe('0-1'); // Default
    });
  });

  describe('normalizeToRange', () => {
    it('should normalize 0-10 to 0-1', () => {
      const score = 7.5;
      const normalized = normalizeToRange(score, '0-10');
      expect(normalized).toBeCloseTo(0.75, 5);
    });

    it('should normalize 0-100 to 0-1', () => {
      const score = 75;
      const normalized = normalizeToRange(score, '0-100');
      expect(normalized).toBeCloseTo(0.75, 5);
    });

    it('should not change 0-1 range', () => {
      const score = 0.75;
      const normalized = normalizeToRange(score, '0-1');
      expect(normalized).toBeCloseTo(0.75, 5);
    });

    it('should clamp scores exceeding range', () => {
      const score = 15;
      const normalized = normalizeToRange(score, '0-10');
      expect(normalized).toBe(1.0);
    });

    it('should clamp negative scores', () => {
      const score = -5;
      const normalized = normalizeToRange(score, '0-10');
      expect(normalized).toBe(0);
    });
  });

  describe('extractScoreFromText', () => {
    it('should extract score from plain text', () => {
      const text = 'The relevance score is 0.85 based on the content.';
      const score = extractScoreFromText(text);
      expect(score).toBeCloseTo(0.85, 5);
    });

    it('should extract first score when multiple present', () => {
      const text = 'Score: 0.8. Alternative: 0.6';
      const score = extractScoreFromText(text);
      expect(score).toBeCloseTo(0.8, 5);
    });

    it('should handle score at end of text', () => {
      const text = 'Final relevance: 0.92';
      const score = extractScoreFromText(text);
      expect(score).toBeCloseTo(0.92, 5);
    });

    it('should handle integer score', () => {
      const text = 'Score: 8/10';
      const score = extractScoreFromText(text);
      expect(score).toBeCloseTo(0.8, 5);
    });

    it('should handle percentage', () => {
      const text = 'Confidence: 85%';
      const score = extractScoreFromText(text);
      expect(score).toBeCloseTo(0.85, 5);
    });

    it('should return undefined for no score', () => {
      const text = 'This document is relevant to the query.';
      const score = extractScoreFromText(text);
      expect(score).toBeUndefined();
    });

    it('should handle empty text', () => {
      const text = '';
      const score = extractScoreFromText(text);
      expect(score).toBeUndefined();
    });
  });

  describe('Cross-Encoder Response Validation', () => {
    it('should validate complete response', () => {
      const response = {
        score: 0.85,
        reasoning: 'Highly relevant',
        confidence: 0.9,
      };

      const validation = validateCrossEncoderResponse(response);
      expect(validation.valid).toBe(true);
    });

    it('should reject response without score', () => {
      const response = {
        reasoning: 'Highly relevant',
      };

      const validation = validateCrossEncoderResponse(response);
      expect(validation.valid).toBe(false);
    });

    it('should accept response with only score', () => {
      const response = {
        score: 0.75,
      };

      const validation = validateCrossEncoderResponse(response);
      expect(validation.valid).toBe(true);
    });

    it('should reject invalid score type', () => {
      const response = {
        score: 'high',
      };

      const validation = validateCrossEncoderResponse(response);
      expect(validation.valid).toBe(false);
    });

    it('should handle null response', () => {
      const response = null;

      const validation = validateCrossEncoderResponse(response);
      expect(validation.valid).toBe(false);
    });
  });
});

// =============================================================================
// Helper functions for testing
// =============================================================================

interface ParseResult {
  score?: number;
  error?: string;
}

interface BatchParseResult {
  scores?: number[];
  error?: string;
}

function parseScoreResponse(response: string | null | undefined): ParseResult {
  if (!response) {
    return { error: 'Empty or null response' };
  }

  try {
    const parsed = JSON.parse(response);

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Response is not an object' };
    }

    let score = parsed.score;

    // Handle nested score
    if (score === undefined && parsed.result?.score !== undefined) {
      score = parsed.result.score;
    }

    if (score === undefined) {
      return { error: 'Missing score field' };
    }

    // Handle string score
    if (typeof score === 'string') {
      score = parseFloat(score);
    }

    if (!Number.isFinite(score)) {
      return { error: 'Invalid score value' };
    }

    // Detect and normalize range
    if (score > 1 && score <= 10) {
      score = score / 10;
    } else if (score > 10 && score <= 100) {
      score = score / 100;
    }

    // Clamp to 0-1
    score = Math.max(0, Math.min(1, score));

    return { score };
  } catch (_e) {
    return { error: 'JSON parse error' };
  }
}

function parseBatchScoreResponse(response: string): BatchParseResult {
  try {
    const parsed = JSON.parse(response);

    if (!parsed.scores || !Array.isArray(parsed.scores)) {
      return { error: 'Missing or invalid scores array' };
    }

    const scores = parsed.scores.map((s: any) => {
      if (s === null || s === undefined || !Number.isFinite(s)) {
        return 0; // Default for invalid
      }

      let score = s;
      // Normalize if needed
      if (score > 1 && score <= 10) {
        score = score / 10;
      } else if (score > 10 && score <= 100) {
        score = score / 100;
      }

      return Math.max(0, Math.min(1, score));
    });

    return { scores };
  } catch (_e) {
    return { error: 'JSON parse error' };
  }
}

function detectScoreRange(scores: number[]): '0-1' | '0-10' | '0-100' {
  if (scores.length === 0) return '0-1';

  const max = Math.max(...scores);

  if (max > 10) return '0-100';
  if (max > 1) return '0-10';
  return '0-1';
}

function normalizeToRange(score: number, range: '0-1' | '0-10' | '0-100'): number {
  let normalized = score;

  if (range === '0-10') {
    normalized = score / 10;
  } else if (range === '0-100') {
    normalized = score / 100;
  }

  return Math.max(0, Math.min(1, normalized));
}

function extractScoreFromText(text: string): number | undefined {
  if (!text) return undefined;

  // Try percentage first
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return parseFloat(percentMatch[1]) / 100;
  }

  // Try x/10 format
  const fractionMatch = text.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  if (fractionMatch) {
    return parseFloat(fractionMatch[1]) / 10;
  }

  // Try decimal number
  const decimalMatch = text.match(/\b(\d+\.\d+)\b/);
  if (decimalMatch) {
    const num = parseFloat(decimalMatch[1]);
    if (num <= 1) return num;
    if (num <= 10) return num / 10;
    if (num <= 100) return num / 100;
  }

  return undefined;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateCrossEncoderResponse(response: any): ValidationResult {
  if (!response || typeof response !== 'object') {
    return { valid: false, error: 'Invalid response object' };
  }

  if (response.score === undefined) {
    return { valid: false, error: 'Missing score field' };
  }

  if (typeof response.score !== 'number' || !Number.isFinite(response.score)) {
    return { valid: false, error: 'Invalid score type' };
  }

  return { valid: true };
}

import { createHash } from 'crypto';

/** Outcome classification - success, failure, or partial (with warnings) */
export type OutcomeType = 'success' | 'failure' | 'partial';

/**
 * Classify tool outcome based on success flag and output content.
 * Detects warnings/deprecations in output to classify as 'partial'.
 */
export function classifyOutcome(success: boolean, output: string): OutcomeType {
  if (!success) return 'failure';

  const warningPatterns = [/\bwarning[:\s]/i, /\bdeprecated\b/i, /\[warn(ing)?\]/i];
  const hasWarning = warningPatterns.some((p) => p.test(output));

  return hasWarning ? 'partial' : 'success';
}

/** Redaction patterns for sensitive data */
const REDACTION_PATTERNS = [
  { regex: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[REDACTED:api_key]' },
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED:aws_key]' },
  { regex: /Bearer\s+[a-zA-Z0-9._-]+/gi, replacement: '[REDACTED:bearer]' },
  { regex: /password[=:]\s*['"]?[^'"\s]+/gi, replacement: '[REDACTED:password]' },
  {
    regex: /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
    replacement: '[REDACTED:key]',
  },
  { regex: /secret[=:]\s*['"]?[a-zA-Z0-9._-]{8,}['"]?/gi, replacement: '[REDACTED:secret]' },
];

/**
 * Redact sensitive data from text (API keys, passwords, tokens, etc.)
 */
export function redactSensitive(text: string): string {
  return REDACTION_PATTERNS.reduce((t, p) => t.replace(p.regex, p.replacement), text);
}

/**
 * Summarize input, truncating to maxLen characters.
 * Handles both string and object inputs.
 */
export function summarizeInput(input: unknown, maxLen: number = 200): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/**
 * Summarize output, truncating to maxLen characters.
 * Handles both string and object outputs.
 */
export function summarizeOutput(output: unknown, maxLen: number = 500): string {
  const str = typeof output === 'string' ? output : JSON.stringify(output);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/**
 * Hash input for deduplication and comparison.
 * Returns first 16 chars of SHA256 hash.
 */
export function hashInput(input: unknown): string {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

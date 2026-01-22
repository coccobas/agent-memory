import type { TurnData } from '../services/capture/types.js';

export interface ComplexitySignals {
  score: number;
  signals: string[];
  hasErrorRecovery: boolean;
  hasDecisions: boolean;
  hasLearning: boolean;
}

export interface PatternMention {
  turnIndex: number;
  confidence: number;
}

export interface Conflict {
  type: 'contradiction';
  turnIndices: number[];
  statements: string[];
}

const ERROR_RECOVERY_KEYWORDS = [
  'error',
  'bug',
  'debug',
  'fix',
  'tried',
  'failed',
  'issue',
  'problem',
];
const DECISION_KEYWORDS = ['decided', 'chose', 'instead of', 'rather than', 'opted for'];
const LEARNING_KEYWORDS = ['realized', 'learned', 'discovered', 'found out', 'understood'];

export function detectComplexitySignals(transcript: TurnData[]): ComplexitySignals {
  if (transcript.length === 0) {
    return {
      score: 0,
      signals: [],
      hasErrorRecovery: false,
      hasDecisions: false,
      hasLearning: false,
    };
  }

  const combinedText = transcript
    .map((t) => t.content)
    .join(' ')
    .toLowerCase();
  const signals: string[] = [];
  let hasErrorRecovery = false;
  let hasDecisions = false;
  let hasLearning = false;

  for (const keyword of ERROR_RECOVERY_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches && matches.length > 0) {
      hasErrorRecovery = true;
      if (!signals.includes(keyword)) {
        signals.push(keyword);
      }
    }
  }

  for (const keyword of DECISION_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches && matches.length > 0) {
      hasDecisions = true;
      if (!signals.includes(keyword)) {
        signals.push(keyword);
      }
    }
  }

  for (const keyword of LEARNING_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches && matches.length > 0) {
      hasLearning = true;
      if (!signals.includes(keyword)) {
        signals.push(keyword);
      }
    }
  }

  let errorOccurrences = 0;
  let decisionOccurrences = 0;
  let learningOccurrences = 0;

  for (const keyword of ERROR_RECOVERY_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches) errorOccurrences += matches.length;
  }

  for (const keyword of DECISION_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches) decisionOccurrences += matches.length;
  }

  for (const keyword of LEARNING_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    const matches = combinedText.match(regex);
    if (matches) learningOccurrences += matches.length;
  }

  let score = 0;
  if (hasErrorRecovery) score += 0.2 + Math.min(0.15, (errorOccurrences - 1) * 0.05);
  if (hasDecisions) score += 0.2 + Math.min(0.15, (decisionOccurrences - 1) * 0.05);
  if (hasLearning) score += 0.2 + Math.min(0.15, (learningOccurrences - 1) * 0.05);

  score = Math.min(1.0, score);

  return {
    score,
    signals,
    hasErrorRecovery,
    hasDecisions,
    hasLearning,
  };
}

export function detectPatternMentions(transcript: TurnData[], pattern: string): PatternMention[] {
  if (transcript.length === 0 || !pattern) {
    return [];
  }

  const results: PatternMention[] = [];
  const patternLower = pattern.toLowerCase();
  const patternRegex = new RegExp(`\\b${escapeRegex(patternLower)}\\b`, 'gi');

  for (let i = 0; i < transcript.length; i++) {
    const turn = transcript[i]!;
    const contentLower = turn.content.toLowerCase();
    const matches = contentLower.match(patternRegex);

    if (matches && matches.length > 0) {
      const patternRatio = (pattern.length * matches.length) / turn.content.length;
      const confidence = Math.min(1.0, 0.3 + patternRatio * 2);

      results.push({
        turnIndex: i,
        confidence,
      });
    }
  }

  return results;
}

const PROJECT_PATTERNS = [
  /working on\s+(?:the\s+)?([a-zA-Z0-9_-]+)(?:\s+project)?/gi,
  /in the\s+([a-zA-Z0-9_-]+)\s+module/gi,
  /the\s+([a-zA-Z0-9_-]+)\s+project/gi,
  /the\s+([a-zA-Z0-9_-]+)\s+codebase/gi,
  /the\s+([a-zA-Z0-9_-]+)\s+repository/gi,
  /([a-zA-Z0-9_-]+)\s+repo\b/gi,
];

const COMMON_WORDS = new Set([
  'the',
  'a',
  'an',
  'this',
  'that',
  'my',
  'our',
  'your',
  'some',
  'new',
  'same',
  'other',
]);

export function detectProjectMentions(transcript: TurnData[]): string[] {
  if (transcript.length === 0) {
    return [];
  }

  const projects = new Set<string>();
  const combinedText = transcript.map((t) => t.content).join(' ');

  for (const pattern of PROJECT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(combinedText)) !== null) {
      if (match[1] && !COMMON_WORDS.has(match[1].toLowerCase())) {
        projects.add(match[1]);
      }
    }
  }

  return Array.from(projects);
}

const QUESTION_PATTERNS = [
  /how to\s+([^?]+)/gi,
  /how do I\s+([^?]+)/gi,
  /why does\s+([^?]+)/gi,
  /what is\s+([^?]+)/gi,
  /where is\s+([^?]+)/gi,
  /can you\s+([^?]+)/gi,
  /could you\s+([^?]+)/gi,
];

export function detectQuestionTopics(transcript: TurnData[]): string[] {
  if (transcript.length === 0) {
    return [];
  }

  const topics: string[] = [];

  for (const turn of transcript) {
    for (const pattern of QUESTION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(turn.content)) !== null) {
        if (match[1]) {
          const topic = match[1].trim().replace(/\?$/, '').trim();
          if (topic && !topics.includes(topic)) {
            topics.push(topic);
          }
        }
      }
    }
  }

  return topics;
}

interface StatementInfo {
  type: 'always' | 'never' | 'use' | 'prefer';
  subject: string;
  turnIndex: number;
  statement: string;
}

export function detectConflicts(transcript: TurnData[]): Conflict[] {
  if (transcript.length === 0) {
    return [];
  }

  const conflicts: Conflict[] = [];
  const statements: StatementInfo[] = [];

  const alwaysPattern = /always\s+(.+)/gi;
  const neverPattern = /never\s+(.+)/gi;
  const usePattern = /\buse\s+([a-zA-Z0-9_-]+)/gi;
  const doNotUsePattern = /do not use\s+([a-zA-Z0-9_-]+)/gi;
  const preferPattern = /prefer\s+([a-zA-Z0-9_-]+)\s+for\s+([a-zA-Z0-9_-]+)/gi;

  for (let i = 0; i < transcript.length; i++) {
    const turn = transcript[i]!;
    const content = turn.content;

    alwaysPattern.lastIndex = 0;
    let match;
    while ((match = alwaysPattern.exec(content)) !== null) {
      if (match[1]) {
        statements.push({
          type: 'always',
          subject: match[1].toLowerCase().trim(),
          turnIndex: i,
          statement: content,
        });
      }
    }

    neverPattern.lastIndex = 0;
    while ((match = neverPattern.exec(content)) !== null) {
      if (match[1]) {
        statements.push({
          type: 'never',
          subject: match[1].toLowerCase().trim(),
          turnIndex: i,
          statement: content,
        });
      }
    }

    usePattern.lastIndex = 0;
    while ((match = usePattern.exec(content)) !== null) {
      if (match[1] && !content.toLowerCase().includes('do not use')) {
        statements.push({
          type: 'use',
          subject: match[1].toLowerCase(),
          turnIndex: i,
          statement: content,
        });
      }
    }

    doNotUsePattern.lastIndex = 0;
    while ((match = doNotUsePattern.exec(content)) !== null) {
      if (match[1]) {
        statements.push({
          type: 'never',
          subject: `use ${match[1].toLowerCase()}`,
          turnIndex: i,
          statement: content,
        });
      }
    }

    preferPattern.lastIndex = 0;
    while ((match = preferPattern.exec(content)) !== null) {
      if (match[1] && match[2]) {
        statements.push({
          type: 'prefer',
          subject: `${match[1].toLowerCase()} for ${match[2].toLowerCase()}`,
          turnIndex: i,
          statement: content,
        });
      }
    }
  }

  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      const s1 = statements[i]!;
      const s2 = statements[j]!;

      const isAlwaysNeverConflict =
        (s1.type === 'always' && s2.type === 'never') ||
        (s1.type === 'never' && s2.type === 'always');

      if (isAlwaysNeverConflict && subjectsOverlap(s1.subject, s2.subject)) {
        conflicts.push({
          type: 'contradiction',
          turnIndices: [s1.turnIndex, s2.turnIndex],
          statements: [s1.statement, s2.statement],
        });
      }

      const isUseConflict =
        (s1.type === 'use' && s2.type === 'never' && s2.subject.includes(s1.subject)) ||
        (s2.type === 'use' && s1.type === 'never' && s1.subject.includes(s2.subject));

      if (isUseConflict) {
        conflicts.push({
          type: 'contradiction',
          turnIndices: [s1.turnIndex, s2.turnIndex],
          statements: [s1.statement, s2.statement],
        });
      }

      if (s1.type === 'prefer' && s2.type === 'prefer') {
        const [item1, purpose1] = s1.subject.split(' for ');
        const [item2, purpose2] = s2.subject.split(' for ');
        if (purpose1 === purpose2 && item1 !== item2) {
          conflicts.push({
            type: 'contradiction',
            turnIndices: [s1.turnIndex, s2.turnIndex],
            statements: [s1.statement, s2.statement],
          });
        }
      }
    }
  }

  return conflicts;
}

function subjectsOverlap(subject1: string, subject2: string): boolean {
  const words1 = subject1.split(/\s+/).filter((w) => w.length > 2);
  const words2 = subject2.split(/\s+/).filter((w) => w.length > 2);

  const significantWords1 = words1.filter((w) => !['the', 'and', 'for', 'with', 'use'].includes(w));
  const significantWords2 = words2.filter((w) => !['the', 'and', 'for', 'with', 'use'].includes(w));

  for (const w1 of significantWords1) {
    for (const w2 of significantWords2) {
      if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
        return true;
      }
    }
  }

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

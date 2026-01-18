/**
 * Extraction Triggers Service
 *
 * Detects patterns in conversation context that indicate high-value
 * memory extraction opportunities. Used by the capture pipeline to
 * prioritize what to extract and store.
 *
 * Trigger Types:
 * - Correction: User corrects agent ("no, actually...", "that's wrong")
 * - Recovery: Error followed by successful resolution
 * - Enthusiasm: Strong positive reaction ("perfect!", "exactly!")
 * - Decision: Explicit decision statement ("we decided...", "let's use...")
 * - Rule: Establishment of a rule or guideline ("always...", "never...")
 *
 * Each trigger includes:
 * - Type: The category of trigger
 * - Confidence: How certain we are this is a real trigger (0-1)
 * - Span: Start/end positions in the text
 * - SuggestedType: Recommended memory entry type (guideline/knowledge/tool)
 */

import { createComponentLogger } from '../../utils/logger.js';

const logger = createComponentLogger('extraction-triggers');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Types of extraction triggers
 */
export type TriggerType =
  | 'correction'
  | 'recovery'
  | 'enthusiasm'
  | 'decision'
  | 'rule'
  | 'command'
  | 'preference'
  // Experience-specific triggers (added for automatic experience capture)
  | 'error_recovery'
  | 'problem_solved'
  | 'workaround_found'
  | 'lesson_learned';

/**
 * Suggested memory entry type based on trigger
 */
export type SuggestedEntryType = 'guideline' | 'knowledge' | 'tool' | 'experience';

/**
 * Detected trigger with metadata
 */
export interface DetectedTrigger {
  /** Type of trigger detected */
  type: TriggerType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Start position in text */
  spanStart: number;
  /** End position in text */
  spanEnd: number;
  /** The matched text */
  matchedText: string;
  /** Suggested memory entry type */
  suggestedType: SuggestedEntryType;
  /** Priority boost for extraction (0-100) */
  priorityBoost: number;
}

/**
 * Trigger detection result
 */
export interface TriggerDetectionResult {
  /** All detected triggers */
  triggers: DetectedTrigger[];
  /** Overall extraction priority (sum of boosts) */
  totalPriorityBoost: number;
  /** Whether any high-confidence triggers were found */
  hasHighConfidenceTriggers: boolean;
  /** Recommended extraction: should we extract from this context? */
  shouldExtract: boolean;
}

/**
 * Pattern definition for trigger matching
 */
interface TriggerPattern {
  type: TriggerType;
  patterns: RegExp[];
  confidence: number;
  suggestedType: SuggestedEntryType;
  priorityBoost: number;
}

// =============================================================================
// TRIGGER PATTERNS
// =============================================================================

const TRIGGER_PATTERNS: TriggerPattern[] = [
  // Correction triggers - user corrects the agent
  {
    type: 'correction',
    confidence: 0.9,
    suggestedType: 'knowledge',
    priorityBoost: 30,
    patterns: [
      /\b(no,?\s*(actually|wait|that's wrong|that's not right|incorrect))/gi,
      /\b(actually,?\s*(it's|it should|you should|we should|the correct))/gi,
      /\b(that's\s*(wrong|incorrect|not right|not correct|a mistake))/gi,
      /\b(you're\s*(wrong|mistaken|incorrect|confused))/gi,
      /\b(let me correct|i need to correct|correction:)/gi,
      /\b(that's not how|that's not what|that's not the way)/gi,
      /\b(the (right|correct|proper) (way|approach|method) is)/gi,
      /\b(you (misunderstood|got it wrong|missed))/gi,
    ],
  },

  // Recovery triggers - error followed by solution
  {
    type: 'recovery',
    confidence: 0.85,
    suggestedType: 'experience',
    priorityBoost: 35,
    patterns: [
      /\b(fixed\s*(it|the|by|with|using))/gi,
      /\b(solved\s*(it|the|by|with|using))/gi,
      /\b(the\s*(fix|solution|answer|resolution)\s*(is|was))/gi,
      /\b(that\s*(fixed|solved|resolved|worked))/gi,
      /\b(finally\s*(got it|working|fixed|solved))/gi,
      /\b(after\s*(debugging|investigating|trying),?\s*(found|discovered))/gi,
      /\b(the\s*issue\s*was)/gi,
      /\b(root\s*cause\s*(was|is|:))/gi,
      /\b(workaround\s*(is|was|:))/gi,
      /\b(this\s*resolved\s*the)/gi,
    ],
  },

  // Enthusiasm triggers - strong positive reaction
  {
    type: 'enthusiasm',
    confidence: 0.8,
    suggestedType: 'knowledge',
    priorityBoost: 20,
    patterns: [
      /\b(perfect!|exactly!|that's it!|yes!|great!|awesome!|brilliant!)/gi,
      /\b(this\s+is\s+(exactly|precisely)\s+what)/gi,
      /\b(love\s+(this|it|that))/gi,
      /\b(this\s+(works|worked)\s+(perfectly|great|well))/gi,
      /\b(thank\s+you,?\s+this\s+(is|was)\s+(exactly|perfect))/gi,
      /\b(nailed\s+it)/gi,
      /\b(spot\s+on)/gi,
    ],
  },

  // Decision triggers - explicit decisions
  {
    type: 'decision',
    confidence: 0.85,
    suggestedType: 'knowledge',
    priorityBoost: 25,
    patterns: [
      /\b(we\s*(decided|chose|picked|selected|went with))/gi,
      /\b(let's\s*(use|go with|pick|choose|stick with))/gi,
      /\b(i('m|'ve)?\s*(going to|gonna)\s*use)/gi,
      /\b(the\s*decision\s*(is|was)\s*to)/gi,
      /\b(we('ll|'re going to)\s*use)/gi,
      /\b(our\s*(choice|decision|pick)\s*(is|was))/gi,
      /\b(after\s*considering,?\s*(we|i)\s*(decided|chose))/gi,
      /\b(final\s*decision:)/gi,
    ],
  },

  // Rule triggers - establishment of guidelines
  {
    type: 'rule',
    confidence: 0.9,
    suggestedType: 'guideline',
    priorityBoost: 40,
    patterns: [
      /\b(always\s+(use|do|make sure|ensure|check|include|add))/gi,
      /\b(never\s+(use|do|allow|commit|push|merge|skip))/gi,
      /\b(we\s+(always|never)\s+(should|must|need to))/gi,
      /\b(rule\s*(is|:)\s*)/gi,
      /\b(standard\s*(is|:)\s*)/gi,
      /\b(convention\s*(is|:)\s*)/gi,
      /\b(best\s*practice\s*(is|:)\s*)/gi,
      /\b(don't\s+(ever|forget to|skip))/gi,
      /\b(make\s+sure\s+(to|you)\s+(always|never))/gi,
      /\b(must\s+(always|never))/gi,
      /\b(required\s+to)/gi,
    ],
  },

  // Command triggers - CLI commands worth remembering
  {
    type: 'command',
    confidence: 0.8,
    suggestedType: 'tool',
    priorityBoost: 15,
    patterns: [
      /\b(run\s+(this|the)\s+command:?)/gi,
      /\b(use\s+(this|the)\s+command:?)/gi,
      /\b(execute:?)\s*[`"']/gi,
      /\b(the\s+command\s+(is|to use):?)/gi,
      /\b(here's\s+(the|a)\s+command)/gi,
      /\$\s*(npm|yarn|pnpm|npx|git|docker|kubectl|make)\s+\w+/g,
      /```(bash|sh|shell|zsh)\n/gi,
    ],
  },

  // Preference triggers - user preferences
  {
    type: 'preference',
    confidence: 0.75,
    suggestedType: 'guideline',
    priorityBoost: 20,
    patterns: [
      /\b(i\s*(prefer|like|want)\s+(to\s+)?(use|have|see))/gi,
      /\b(i'd\s*(rather|prefer))/gi,
      /\b(please\s+(always|don't|never))/gi,
      /\b(my\s+(preference|style)\s+(is|:))/gi,
      /\b(i\s+(typically|usually|normally)\s+(use|do|prefer))/gi,
      /\b(for\s+me,?\s+(it's|the)\s+better)/gi,
    ],
  },

  // ===========================================================================
  // EXPERIENCE-SPECIFIC TRIGGERS
  // These indicate high-value learning opportunities
  // ===========================================================================

  // Error recovery - error followed by successful resolution
  {
    type: 'error_recovery',
    confidence: 0.9,
    suggestedType: 'experience',
    priorityBoost: 45,
    patterns: [
      /\b(error|exception|failure|failed)\b.{0,100}\b(fixed|solved|resolved|working now)/gis,
      /\b(was\s+failing).{0,50}\b(now\s+(works|working|fixed))/gis,
      /\b(the\s+error\s+was\s+caused\s+by)/gi,
      /\b(debugging|investigated).{0,30}\b(found|discovered|identified)\s+(the|that)/gi,
      /\b(stack\s*trace|traceback).{0,100}\b(fix|solution|cause)/gis,
      /\b(build\s+(failed|error)).{0,100}\b(fixed|resolved)/gis,
      /\b(test(s)?\s+(failing|failed)).{0,100}\b(pass(ing|ed)?|fixed)/gis,
    ],
  },

  // Problem solved - explicit success after struggle
  {
    type: 'problem_solved',
    confidence: 0.85,
    suggestedType: 'experience',
    priorityBoost: 40,
    patterns: [
      /\b(finally\s+(got|figured|worked|fixed|solved))/gi,
      /\b(that\s+(did\s+it|worked|fixed\s+it|solved\s+it))/gi,
      /\b(problem\s+(solved|fixed|resolved))/gi,
      /\b(issue\s+(resolved|fixed|gone|solved))/gi,
      /\b(it('s|\s+is)\s+(working|fixed)\s+now)/gi,
      /\b(success!|it\s+works!|working!)/gi,
      /\b(the\s+solution\s+was)/gi,
      /\b(solved\s+by\s+(using|changing|adding|removing))/gi,
    ],
  },

  // Workaround found - alternative solutions
  {
    type: 'workaround_found',
    confidence: 0.8,
    suggestedType: 'experience',
    priorityBoost: 35,
    patterns: [
      /\b(workaround\s*(is|was|:))/gi,
      /\b(alternative\s+(solution|approach|method|way))/gi,
      /\b(instead,?\s*(we|i|you)\s*(can|could|should))/gi,
      /\b(a\s+hack\s+(is|was|:))/gi,
      /\b(temporary\s+(fix|solution))/gi,
      /\b(as\s+a\s+fallback)/gi,
      /\b(found\s+a\s+way\s+around)/gi,
      /\b(bypass(ed|ing)?\s+the\s+(issue|problem|error))/gi,
    ],
  },

  // Lesson learned - explicit learning statement
  {
    type: 'lesson_learned',
    confidence: 0.85,
    suggestedType: 'experience',
    priorityBoost: 40,
    patterns: [
      /\b(lesson\s+learned)/gi,
      /\b(learned\s+that)/gi,
      /\b(next\s+time,?\s*(i|we)\s*(will|should|must))/gi,
      /\b(note\s+to\s+self)/gi,
      /\b(remember\s+to\s+always)/gi,
      /\b(in\s+the\s+future,?\s*(i|we)\s*(will|should))/gi,
      /\b(won't\s+make\s+that\s+mistake\s+again)/gi,
      /\b(now\s+i\s+(know|understand)\s+that)/gi,
      /\b(the\s+takeaway\s+(is|was))/gi,
      /\b(key\s+(insight|learning|takeaway))/gi,
    ],
  },
];

// =============================================================================
// EXTRACTION TRIGGERS SERVICE
// =============================================================================

/**
 * Extraction Triggers Service
 *
 * Detects patterns in text that indicate high-value extraction opportunities.
 */
export class ExtractionTriggersService {
  private patterns: TriggerPattern[];

  constructor() {
    this.patterns = TRIGGER_PATTERNS;
  }

  /**
   * Detect all triggers in the given text
   *
   * @param text - The text to analyze
   * @returns Detection result with all triggers and recommendations
   */
  detect(text: string): TriggerDetectionResult {
    if (!text || typeof text !== 'string') {
      return {
        triggers: [],
        totalPriorityBoost: 0,
        hasHighConfidenceTriggers: false,
        shouldExtract: false,
      };
    }

    const triggers: DetectedTrigger[] = [];
    const seenSpans = new Set<string>();

    for (const patternDef of this.patterns) {
      for (const pattern of patternDef.patterns) {
        // Reset regex state
        pattern.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const spanKey = `${match.index}-${match.index + match[0].length}`;

          // Deduplicate overlapping matches
          if (seenSpans.has(spanKey)) continue;
          seenSpans.add(spanKey);

          triggers.push({
            type: patternDef.type,
            confidence: patternDef.confidence,
            spanStart: match.index,
            spanEnd: match.index + match[0].length,
            matchedText: match[0],
            suggestedType: patternDef.suggestedType,
            priorityBoost: patternDef.priorityBoost,
          });
        }
      }
    }

    // Sort by position in text
    triggers.sort((a, b) => a.spanStart - b.spanStart);

    const totalPriorityBoost = triggers.reduce((sum, t) => sum + t.priorityBoost, 0);
    const hasHighConfidenceTriggers = triggers.some((t) => t.confidence >= 0.85);

    // Recommend extraction if we have high-confidence triggers or significant boost
    const shouldExtract = hasHighConfidenceTriggers || totalPriorityBoost >= 40;

    logger.debug(
      {
        triggerCount: triggers.length,
        totalPriorityBoost,
        hasHighConfidenceTriggers,
        shouldExtract,
        triggerTypes: [...new Set(triggers.map((t) => t.type))],
      },
      'Trigger detection complete'
    );

    return {
      triggers,
      totalPriorityBoost,
      hasHighConfidenceTriggers,
      shouldExtract,
    };
  }

  /**
   * Detect triggers of a specific type
   *
   * @param text - The text to analyze
   * @param type - The trigger type to detect
   * @returns Array of detected triggers of that type
   */
  detectType(text: string, type: TriggerType): DetectedTrigger[] {
    const result = this.detect(text);
    return result.triggers.filter((t) => t.type === type);
  }

  /**
   * Check if text contains any triggers
   *
   * @param text - The text to check
   * @returns True if any triggers are detected
   */
  hasTriggers(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }

    for (const patternDef of this.patterns) {
      for (const pattern of patternDef.patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the dominant suggested entry type from triggers
   *
   * @param triggers - Array of detected triggers
   * @returns The suggested entry type with highest priority boost
   */
  getDominantSuggestedType(triggers: DetectedTrigger[]): SuggestedEntryType | null {
    if (triggers.length === 0) {
      return null;
    }

    // Group by suggested type and sum priority boosts
    const byType = new Map<SuggestedEntryType, number>();
    for (const trigger of triggers) {
      const current = byType.get(trigger.suggestedType) ?? 0;
      byType.set(trigger.suggestedType, current + trigger.priorityBoost);
    }

    // Find type with highest total boost
    let maxType: SuggestedEntryType | null = null;
    let maxBoost = 0;
    for (const [type, boost] of byType) {
      if (boost > maxBoost) {
        maxBoost = boost;
        maxType = type;
      }
    }

    return maxType;
  }

  /**
   * Get all supported trigger types
   */
  getSupportedTriggerTypes(): TriggerType[] {
    return [
      'correction',
      'recovery',
      'enthusiasm',
      'decision',
      'rule',
      'command',
      'preference',
      'error_recovery',
      'problem_solved',
      'workaround_found',
      'lesson_learned',
    ];
  }

  /**
   * Get experience-specific trigger types
   */
  getExperienceTriggerTypes(): TriggerType[] {
    return ['error_recovery', 'problem_solved', 'workaround_found', 'lesson_learned', 'recovery'];
  }

  /**
   * Detect experience-specific triggers only
   *
   * @param text - The text to analyze
   * @returns Detection result with only experience triggers
   */
  detectExperienceTriggers(text: string): TriggerDetectionResult {
    const result = this.detect(text);
    const experienceTypes = this.getExperienceTriggerTypes();

    const experienceTriggers = result.triggers.filter((t) => experienceTypes.includes(t.type));

    const totalPriorityBoost = experienceTriggers.reduce((sum, t) => sum + t.priorityBoost, 0);
    const hasHighConfidenceTriggers = experienceTriggers.some((t) => t.confidence >= 0.85);

    return {
      triggers: experienceTriggers,
      totalPriorityBoost,
      hasHighConfidenceTriggers,
      shouldExtract: hasHighConfidenceTriggers || totalPriorityBoost >= 35,
    };
  }

  /**
   * Get extraction priority from triggers (0-100 scale)
   *
   * @param triggers - Array of detected triggers
   * @returns Priority score clamped to 0-100
   */
  getExtractionPriority(triggers: DetectedTrigger[]): number {
    const totalBoost = triggers.reduce((sum, t) => sum + t.priorityBoost, 0);
    // Cap at 100
    return Math.min(100, totalBoost);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: ExtractionTriggersService | null = null;

/**
 * Get the singleton extraction triggers service
 */
export function getExtractionTriggersService(): ExtractionTriggersService {
  if (!instance) {
    instance = new ExtractionTriggersService();
  }
  return instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetExtractionTriggersService(): void {
  instance = null;
}

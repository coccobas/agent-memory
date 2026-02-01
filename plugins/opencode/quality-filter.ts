/**
 * Quality filter for experience recording.
 * Detects garbage auto-generated experiences that pollute memory.
 */

/** Patterns that indicate garbage experiences */
const GARBAGE_PATTERNS = [
  /^Resolved by re-running \w+$/i, // Generic error recovery
  /^Task completed successfully$/i, // Generic completion
  /^Session work: \d+ events?$/i, // Just event counts
  /^Fixed \w+ error$/i, // Generic "Fixed X error"
  /^Done$/i, // Just "Done"
  /^Fixed$/i, // Just "Fixed"
];

/** Minimum meaningful content length after removing template text */
const MIN_MEANINGFUL_LENGTH = 30;

/**
 * Determines if an experience is garbage (should be silently dropped).
 *
 * @param title - Experience title
 * @param scenario - What triggered this
 * @param outcome - What happened
 * @returns true if garbage (should be dropped), false if legitimate
 */
export function isGarbageExperience(title: string, scenario: string, outcome: string): boolean {
  const fields = [title, scenario, outcome];
  let garbageMatchCount = 0;

  for (const field of fields) {
    for (const pattern of GARBAGE_PATTERNS) {
      if (pattern.test(field.trim())) {
        garbageMatchCount++;
        break;
      }
    }
  }

  if (garbageMatchCount >= 2) {
    return true;
  }

  if (garbageMatchCount === 1) {
    const otherFields = fields.filter((f) => {
      for (const pattern of GARBAGE_PATTERNS) {
        if (pattern.test(f.trim())) return false;
      }
      return true;
    });
    const otherContent = otherFields.join(' ').trim();
    if (otherContent.length < MIN_MEANINGFUL_LENGTH) {
      return true;
    }
  }

  const totalContent = `${title} ${scenario} ${outcome}`.trim();
  if (totalContent.length < MIN_MEANINGFUL_LENGTH) {
    return true;
  }

  return false;
}

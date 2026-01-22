import type { ExclusionParseResult, ParsedExclusion } from './types.js';

export function parseExclusions(query: string): ExclusionParseResult {
  if (!query || !query.trim()) {
    return { cleanedQuery: '', exclusions: [] };
  }

  const exclusions: ParsedExclusion[] = [];
  const exclusionMatches: Array<{ start: number; end: number; exclusion: ParsedExclusion | null }> =
    [];

  const phraseRegex = /-["']([^"']*)["']?/g;
  let match: RegExpExecArray | null;
  while ((match = phraseRegex.exec(query)) !== null) {
    const captured = match[1];
    const trimmedPhrase = captured ? captured.trim() : '';
    exclusionMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      exclusion: trimmedPhrase ? { term: trimmedPhrase.toLowerCase(), isPhrase: true } : null,
    });
  }

  const wordRegex = /(?:^|\s)(-[^\s"']+)/g;
  while ((match = wordRegex.exec(query)) !== null) {
    const fullMatch = match[1];
    if (!fullMatch) continue;
    const term = fullMatch.substring(1);
    const startIndex = query.indexOf(fullMatch, match.index);
    const endIndex = startIndex + fullMatch.length;

    const overlaps = exclusionMatches.some((em) => startIndex < em.end && endIndex > em.start);

    if (!overlaps && term && term.trim()) {
      exclusionMatches.push({
        start: startIndex,
        end: endIndex,
        exclusion: { term: term.toLowerCase(), isPhrase: false },
      });
    }
  }

  const standaloneHyphenRegex = /(?:^|\s)(- )(?=\S)/g;
  while ((match = standaloneHyphenRegex.exec(query)) !== null) {
    const startIndex = query.indexOf('- ', match.index);
    if (startIndex >= 0) {
      const overlaps = exclusionMatches.some(
        (em) => startIndex < em.end && startIndex + 2 > em.start
      );
      if (!overlaps) {
        exclusionMatches.push({
          start: startIndex,
          end: startIndex + 2,
          exclusion: null,
        });
      }
    }
  }

  exclusionMatches.sort((a, b) => a.start - b.start);

  for (const em of exclusionMatches) {
    if (em.exclusion) {
      exclusions.push(em.exclusion);
    }
  }

  let result = '';
  let lastEnd = 0;
  for (const em of exclusionMatches) {
    result += query.substring(lastEnd, em.start);
    lastEnd = em.end;
  }
  result += query.substring(lastEnd);

  const cleanedQuery = result.replace(/\s+/g, ' ').trim();

  return { cleanedQuery, exclusions };
}

export function containsExclusion(text: string, exclusions: ParsedExclusion[]): boolean {
  if (exclusions.length === 0) return false;

  const lowerText = text.toLowerCase();

  for (const exclusion of exclusions) {
    if (exclusion.isPhrase) {
      if (lowerText.includes(exclusion.term)) {
        return true;
      }
    } else {
      const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(exclusion.term)}\\b`, 'i');
      if (wordBoundaryRegex.test(text)) {
        return true;
      }
    }
  }

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

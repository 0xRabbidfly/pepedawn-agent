/**
 * Fuzzy Matching Utilities
 * 
 * Shared fuzzy matching logic for card name matching.
 * Extracted from fakeRaresCard.ts for reuse across commands.
 */

/**
 * Fuzzy match configuration thresholds
 */
export const FUZZY_MATCH_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.75, // ≥75% similarity: Auto-match
  MODERATE: 0.55, // 55-74% similarity: Show suggestions
  ARTIST_FUZZY: 0.65, // 65% similarity: Minimum for artist fuzzy matching
  TOP_SUGGESTIONS: 3, // Number of suggestions to show for moderate matches
} as const;

/**
 * Fuzzy match result
 */
export interface FuzzyMatch {
  name: string;
  similarity: number;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1, // substitution
        );
      }
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings (0-1 range)
 * Uses case-insensitive Levenshtein distance
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toUpperCase(), str2.toUpperCase());
  const maxLen = Math.max(str1.length, str2.length);
  return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

/**
 * Normalize value for fuzzy comparisons (uppercase alphanumeric)
 */
export function normalizeForMatching(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

interface RankedMatch extends FuzzyMatch {
  score: number;
}

function rankMatches(
  input: string,
  candidates: string[],
): RankedMatch[] {
  if (candidates.length === 0) return [];

  const normalizedInput = normalizeForMatching(input);

  return candidates.map((candidate) => {
    const similarity = calculateSimilarity(input, candidate);
    const normalizedCandidate = normalizeForMatching(candidate);

    const containsInput =
      normalizedInput.length > 0 &&
      normalizedCandidate.includes(normalizedInput);
    const startsWithInput =
      normalizedInput.length > 0 &&
      normalizedCandidate.startsWith(normalizedInput);
    const inputContainsCandidate =
      normalizedCandidate.length > 0 &&
      normalizedInput.length > normalizedCandidate.length &&
      normalizedInput.includes(normalizedCandidate);

    let score = similarity;
    if (startsWithInput) score += 0.25;
    if (containsInput) score += 0.2;
    if (inputContainsCandidate) score += 0.05;

    score = Math.min(score, 1);

    return {
      name: candidate,
      similarity,
      score,
    };
  }).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.similarity - a.similarity;
  });
}

/**
 * Find top N matching strings from a list
 * 
 * @param input - String to match against
 * @param candidates - List of candidate strings to match
 * @param topN - Number of top matches to return
 * @returns Array of matches sorted by similarity (descending)
 */
export function findTopMatches(
  input: string,
  candidates: string[],
  topN: number = FUZZY_MATCH_THRESHOLDS.TOP_SUGGESTIONS,
): FuzzyMatch[] {
  return rankMatches(input, candidates)
    .slice(0, topN)
    .map(({ name, similarity }) => ({ name, similarity }));
}

/**
 * Find best match from a list with confidence threshold
 * 
 * @param input - String to match against
 * @param candidates - List of candidate strings to match
 * @param minSimilarity - Minimum similarity threshold (default: HIGH_CONFIDENCE)
 * @returns Best match if above threshold, null otherwise
 */
export function findBestMatch(
  input: string,
  candidates: string[],
  minSimilarity: number = FUZZY_MATCH_THRESHOLDS.HIGH_CONFIDENCE
): FuzzyMatch | null {
  const ranked = rankMatches(input, candidates);
  const bestMatch = ranked.length > 0 ? ranked[0] : null;

  if (bestMatch && bestMatch.similarity >= minSimilarity) {
    return {
      name: bestMatch.name,
      similarity: bestMatch.similarity,
    };
  }

  return null;
}

/**
 * Internal helper to expose ranked matches while keeping the public API stable.
 * Useful for actions that need sorted matches with score metadata.
 */
export function getRankedMatches(
  input: string,
  candidates: string[],
  topN: number = FUZZY_MATCH_THRESHOLDS.TOP_SUGGESTIONS,
): RankedMatch[] {
  return rankMatches(input, candidates).slice(0, topN);
}


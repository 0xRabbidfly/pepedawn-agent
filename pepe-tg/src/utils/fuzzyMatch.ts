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
  if (candidates.length === 0) return [];

  const matches: FuzzyMatch[] = candidates.map((candidate) => ({
    name: candidate,
    similarity: calculateSimilarity(input, candidate),
  }));

  // Sort by similarity (descending) and take top N
  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, topN);
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
  const matches = findTopMatches(input, candidates, 1);
  const bestMatch = matches.length > 0 ? matches[0] : null;
  
  if (bestMatch && bestMatch.similarity >= minSimilarity) {
    return bestMatch;
  }
  
  return null;
}


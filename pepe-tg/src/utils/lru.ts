/**
 * LRU (Least Recently Used) tracking for lore responses
 * Prevents showing the same lore snippets repeatedly
 */

interface LRUEntry {
  ids: Set<string>;
  timestamp: number;
}

const recentlyUsedMap = new Map<string, LRUEntry>();

const WINDOW_SIZE = 50;
const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Filter out IDs that were recently used in this room
 */
export function filterOutRecentlyUsed(roomId: string, candidateIds: string[]): string[] {
  const entry = recentlyUsedMap.get(roomId);
  if (!entry) return candidateIds;
  
  // Expire old entries
  if (Date.now() - entry.timestamp > EXPIRY_MS) {
    recentlyUsedMap.delete(roomId);
    return candidateIds;
  }
  
  return candidateIds.filter(id => !entry.ids.has(id));
}

/**
 * Mark an ID as recently used
 */
export function markIdAsRecentlyUsed(roomId: string, id: string): void {
  let entry = recentlyUsedMap.get(roomId);
  
  if (!entry) {
    entry = { ids: new Set(), timestamp: Date.now() };
    recentlyUsedMap.set(roomId, entry);
  }
  
  entry.ids.add(id);
  entry.timestamp = Date.now();
  
  // Keep window size bounded
  if (entry.ids.size > WINDOW_SIZE) {
    const idsArray = Array.from(entry.ids);
    entry.ids = new Set(idsArray.slice(-WINDOW_SIZE));
  }
}


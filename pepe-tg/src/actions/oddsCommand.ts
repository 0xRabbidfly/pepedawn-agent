import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State } from '@elizaos/core';
import { createPublicClient, http, formatEther, type Address } from 'viem';
import { sepolia, mainnet } from 'viem/chains';
import raffleAbi from '../contracts/PepedawnRaffle.abi.json';

/**
 * PEPEDAWN Lottery /odds Command
 * 
 * Displays real-time lottery statistics from the Ethereum smart contract:
 * - Current round number
 * - Total tickets sold
 * - Prize pool (ETH)
 * - Top 3 participants by tickets
 * - Time until draw (if applicable)
 * 
 * Features:
 * - Read-only contract calls (no gas, no wallet needed)
 * - 5-minute per-chat cooldown to prevent spam
 * - Silent replies (no notifications)
 * - Inline button linking to PEPEDAWN site
 * - In-memory caching (30s) to reduce RPC load
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per chat
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache
const PEPEDAWN_SITE_URL = process.env.PEPEDAWN_SITE_URL || 'https://pepedawn.art';

// Environment validation
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || process.env.SEPOLIA_RPC_URL || 'https://sepolia.drpc.org';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as Address;
const IS_MAINNET = process.env.ETHEREUM_NETWORK === 'mainnet';

if (!CONTRACT_ADDRESS) {
  logger.warn('[oddsCommand] CONTRACT_ADDRESS not set - /dawn command will fail');
}

// ============================================================================
// ETHEREUM CLIENT SETUP
// ============================================================================

const publicClient = createPublicClient({
  chain: IS_MAINNET ? mainnet : sepolia,
  transport: http(ETHEREUM_RPC_URL),
});

// ============================================================================
// TYPES
// ============================================================================

interface RoundData {
  id: bigint;
  startTime: bigint;
  endTime: bigint;
  status: number;
  totalTickets: bigint;
  totalWeight: bigint;
  totalWagered: bigint;
  vrfRequestId: bigint;
  vrfRequestedAt: bigint;
  feesDistributed: boolean;
  participantCount: bigint;
}

interface ParticipantStats {
  address: Address;
  tickets: bigint;
  wagered: bigint;
  hasProof: boolean;
}

interface CachedOddsData {
  timestamp: number;
  roundId: bigint;
  totalTickets: bigint;
  totalWagered: bigint;
  endTime: bigint;
  participants: Address[];
  topParticipants: ParticipantStats[];
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Per-chat cooldown tracking (chatId -> timestamp)
const cooldowns = new Map<string, number>();

// Contract data cache
let cachedData: CachedOddsData | null = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a chat is on cooldown
 */
function isOnCooldown(chatId: string): boolean {
  const lastCall = cooldowns.get(chatId);
  if (!lastCall) return false;
  
  const elapsed = Date.now() - lastCall;
  return elapsed < COOLDOWN_MS;
}

/**
 * Get remaining cooldown time in minutes
 */
function getRemainingCooldown(chatId: string): number {
  const lastCall = cooldowns.get(chatId);
  if (!lastCall) return 0;
  
  const elapsed = Date.now() - lastCall;
  const remaining = COOLDOWN_MS - elapsed;
  return Math.ceil(remaining / 60000);
}

/**
 * Update cooldown for a chat
 */
function updateCooldown(chatId: string): void {
  cooldowns.set(chatId, Date.now());
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(): boolean {
  if (!cachedData) return false;
  const age = Date.now() - cachedData.timestamp;
  return age < CACHE_TTL_MS;
}

/**
 * Fetch lottery data from contract
 */
async function fetchLotteryData(): Promise<CachedOddsData> {
  // Return cached data if valid
  if (isCacheValid() && cachedData) {
    return cachedData;
  }

  try {
    // Fetch current round ID
    const currentRoundId = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: raffleAbi,
      functionName: 'currentRoundId',
    }) as bigint;

    // Fetch round details
    const roundData = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: raffleAbi,
      functionName: 'getRound',
      args: [currentRoundId],
    }) as RoundData;

    // Fetch all participants
    const participants = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: raffleAbi,
      functionName: 'getRoundParticipants',
      args: [currentRoundId],
    }) as Address[];

    // Fetch stats for each participant to build leaderboard
    const participantStats: ParticipantStats[] = [];
    
    for (const participant of participants) {
      try {
        const stats = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: raffleAbi,
          functionName: 'getUserStats',
          args: [currentRoundId, participant],
        }) as [bigint, bigint, bigint, boolean]; // [wagered, tickets, weight, hasProof]

        participantStats.push({
          address: participant,
          tickets: stats[1], // tickets
          wagered: stats[0], // wagered
          hasProof: stats[3], // hasProof
        });
      } catch (error) {
        logger.error(`[oddsCommand] Failed to fetch stats for ${participant}:`, error);
      }
    }

    // Sort by tickets descending
    const topParticipants = participantStats
      .sort((a, b) => Number(b.tickets - a.tickets))
      .slice(0, 3);

    // Cache the result
    cachedData = {
      timestamp: Date.now(),
      roundId: currentRoundId,
      totalTickets: roundData.totalTickets,
      totalWagered: roundData.totalWagered,
      endTime: roundData.endTime,
      participants,
      topParticipants,
    };

    return cachedData;
  } catch (error) {
    logger.error('[oddsCommand] Failed to fetch lottery data:', error);
    throw error;
  }
}

/**
 * Calculate odds of winning at least 1 prize if user buys N tickets
 * Uses hypergeometric distribution for drawing without replacement
 * @param currentTotal - Current total tickets in the raffle
 * @param buyAmount - Number of tickets user would buy
 * @param numPrizes - Number of prizes drawn (default 10)
 */
function calculateBuyOdds(currentTotal: bigint, buyAmount: number, numPrizes: number = 10): string {
  const total = Number(currentTotal) + buyAmount;
  
  // Edge cases
  if (total === 0 || buyAmount === 0) return '0.00';
  if (buyAmount >= total) return '100.00';
  if (numPrizes >= total) return '100.00';
  
  // Probability of NOT winning any prizes (drawing numPrizes from tickets that aren't yours)
  // P(win 0) = C(total-buyAmount, numPrizes) / C(total, numPrizes)
  // We calculate this using the ratio: (total-buyAmount)! * (total-numPrizes)! / ((total-buyAmount-numPrizes)! * total!)
  // Simplified: Product of (total-buyAmount-i)/(total-i) for i=0 to numPrizes-1
  
  let probWinNone = 1.0;
  for (let i = 0; i < numPrizes; i++) {
    probWinNone *= (total - buyAmount - i) / (total - i);
  }
  
  // Probability of winning at least 1 prize
  const probWinAtLeastOne = (1 - probWinNone) * 100;
  
  return probWinAtLeastOne.toFixed(2);
}

/**
 * Format address for display (0x1234...5678)
 */
function formatAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format the odds message
 */
function formatOddsMessage(data: CachedOddsData): string {
  const pool = formatEther(data.totalWagered);
  const buyTenOdds = calculateBuyOdds(data.totalTickets, 10);
  
  let message = `🐸 **Round ${data.roundId}** • Tickets: **${data.totalTickets}** • Pool: **${pool} ETH**\n`;
  message += `🌅 if you buy 10 tix --> odds = **${buyTenOdds}%**\n\n`;

  // Top 3 leaderboard
  if (data.topParticipants.length > 0) {
    message += `**🏆 Leaderboard:**\n`;
    data.topParticipants.forEach((p, idx) => {
      const emoji = ['🥇', '🥈', '🥉'][idx];
      const proofBadge = p.hasProof ? ' 🧩' : '';
      message += `${emoji} ${formatAddress(p.address)}${proofBadge} • ${p.tickets} tickets\n`;
    });
  } else {
    message += `No participants yet. Be the first! 🌅`;
  }

  return message;
}

// ============================================================================
// ACTION EXPORT
// ============================================================================

export const oddsCommand: Action = {
  name: 'DAWN_COMMAND',
  description: 'Displays PEPEDAWN lottery odds and leaderboard from smart contract',
  similes: ['LOTTERY', 'STATS', 'LEADERBOARD'],
  examples: [],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase().trim() || '';
    return text.startsWith('/dawn');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const chatId = message.roomId;

    try {
      // Check contract address
      if (!CONTRACT_ADDRESS) {
        if (callback) {
          await callback({
            text: '⚠️ Lottery contract not configured. Please contact the bot admin.',
          });
        }
        return { success: false, text: 'Contract address not set' };
      }

      // Check cooldown
      if (isOnCooldown(chatId)) {
        const remaining = getRemainingCooldown(chatId);
        if (callback) {
          await callback({
            text: `⏳ Please wait ${remaining} more minute${remaining > 1 ? 's' : ''} before checking odds again.`,
          });
        }
        return { success: false, text: 'On cooldown' };
      }

      // Fetch lottery data
      const data = await fetchLotteryData();

      // Format message
      const messageText = formatOddsMessage(data);

      // Update cooldown
      updateCooldown(chatId);

      // Send response with button
      if (callback) {
        await callback({
          text: messageText,
          buttons: [
            {
              text: '🌅 Enter the Dawn',
              url: PEPEDAWN_SITE_URL,
            },
          ],
        });
      }

      return {
        success: true,
        text: 'Odds displayed successfully',
      };
    } catch (error) {
      logger.error('[oddsCommand] Handler error:', error);

      if (callback) {
        await callback({
          text: '⏳ Unable to fetch lottery data right now. Please try again in a moment.',
        });
      }

      return {
        success: false,
        text: 'Failed to fetch lottery data',
      };
    }
  },
};


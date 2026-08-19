import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, logger } from '@elizaos/core';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { vouch, findProposal, dropProposal, openProposals, DEFAULT_VOUCH_CONFIG } from '../utils/vouching';
import { hasStanding } from '../utils/participants';
import { isAdminUser } from '../utils/admins';
import { artistsForCard, identityMatchesArtist, type ArtistAliases } from '../utils/loreSubmission';
import { countLoreForCard, recordLore } from '../utils/loreInventory';
import { MAX_ENTRIES_PER_CARD } from '../utils/loreSubmission';
import aliasFile from '../data/artist-aliases.json';

/**
 * /vouch <CODE> - confirm a piece of community-proposed lore.
 *
 * Third-party lore is proposed rather than stored (see utils/vouching.ts); this
 * is how it lands. Two vouches from people with standing, or one from the
 * credited artist or an admin.
 *
 *   /vouch          - list what is open
 *   /vouch AB12     - vouch for that proposal
 *   /vouch no AB12  - admin only: drop it
 */

const ARTIST_ALIASES: ArtistAliases = Object.fromEntries(
  Object.entries(aliasFile as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v))
    .map(([k, v]) => [k, v as string[]])
);

export const vouchCommand: Action = {
  name: 'VOUCH_COMMAND',
  description: 'Handles /vouch to confirm community-proposed card lore',
  similes: ['VOUCH', 'CONFIRM'],
  examples: [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.trim().toLowerCase() || '';
    return text.startsWith('/vouch');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const raw = (message.content.text || '').replace(/^\s*\/vouch(?:@[A-Za-z0-9_]+)?\s*/i, '').trim();
    const from = options?.ctx?.message?.from ?? (message as any).rawMessage?.from;
    const userId = from?.id?.toString();
    const username = from?.username;
    const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || username || 'someone';
    const admin = isAdminUser(userId, username);

    const say = async (text: string) => {
      if (callback) await callback({ text });
      return { success: true, text };
    };

    if (!userId) return say('I can’t tell who you are, so I can’t count your vouch.');

    // Bare /vouch lists what is waiting.
    if (!raw) {
      const open = openProposals();
      if (open.length === 0) return say('Nothing waiting on vouches right now.');
      const lines = open.map(
        (p) =>
          `\`${p.id}\` — *${p.card}* (${p.vouches.length}/${DEFAULT_VOUCH_CONFIG.required}) ` +
          `by ${p.proposerName ?? 'someone'}: _${p.lore.slice(0, 90)}_`
      );
      return say(`📜 *Open lore proposals*\n\n${lines.join('\n')}\n\nSend \`/vouch CODE\` to confirm one.`);
    }

    // Admin reject: /vouch no AB12
    const rejectMatch = raw.match(/^(?:no|reject|drop)\s+(\S+)$/i);
    if (rejectMatch) {
      if (!admin) return say('Only admins can drop a proposal.');
      const dropped = dropProposal(rejectMatch[1]);
      return say(dropped ? `Dropped ${dropped.id} (${dropped.card}).` : 'No open proposal with that code.');
    }

    const code = raw.split(/\s+/)[0];
    const proposal = findProposal(code);
    if (!proposal) return say('No open proposal with that code. Try `/vouch` to see what’s waiting.');

    // The credited artist and admins are decisive — they are the authority on
    // the card, and making them find a second voucher would be absurd.
    const decisive =
      admin || identityMatchesArtist({ id: userId, username, displayName: name }, artistsForCard(proposal.card), ARTIST_ALIASES);

    const result = vouch({
      proposalId: code,
      userId,
      name,
      hasStanding: hasStanding(userId, proposal.createdAt),
      decisive,
    });

    if (!result.ok) return say(result.message!);

    if (!result.approved) {
      return say(`👍 Noted, ${name}. ${proposal.card} needs ${result.remaining} more.`);
    }

    // Approved. Re-check the cap here: proposals can outlive the state they
    // were created against, and the quota is the thing that must not drift.
    const existing = await countLoreForCard(runtime, proposal.card);
    if (existing >= MAX_ENTRIES_PER_CARD) {
      return say(`${proposal.card} filled up while that was waiting — not stored.`);
    }

    try {
      const memoryService = runtime.getService(MemoryStorageService.serviceType) as MemoryStorageService;
      if (!memoryService) throw new Error('MemoryStorageService not available');

      const stored: Memory = {
        ...message,
        content: { ...message.content, text: `remember this: ${proposal.card} ${proposal.lore}` },
      };
      const res = await memoryService.storeMemory(stored, options?.ctx?.message);

      if (res.success && !res.ignoredReason) {
        await recordLore({
          card: proposal.card,
          lore: proposal.lore,
          submitterId: proposal.proposerId,
          submitterName: proposal.proposerName,
          at: Date.now(),
          memoryId: res.memoryId,
        });
        logger.info(`[/vouch] ${proposal.id} approved for ${proposal.card} (decisive=${decisive})`);
        return say(
          decisive
            ? `✅ ${proposal.card} lore confirmed by ${name} and stored.`
            : `✅ ${proposal.card} lore vouched for and stored. Thanks all.`
        );
      }
      return say(`❌ Couldn’t store that: ${res.error || res.ignoredReason || 'unknown error'}`);
    } catch (err) {
      logger.error({ error: err }, '[/vouch ERROR]');
      return say('Something went wrong storing that. Try again? 🐸');
    }
  },
};

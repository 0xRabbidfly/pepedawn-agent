import { type Action, type HandlerCallback, type IAgentRuntime, type Memory, type State, logger } from '@elizaos/core';
import { MemoryStorageService } from '../services/MemoryStorageService';
import { callTextModel } from '../utils/modelGateway';
import {
  gateSubmission,
  buildQualityPrompt,
  parseQualityResponse,
  type ArtistAliases,
  type Submitter,
  MAX_ENTRIES_PER_CARD,
} from '../utils/loreSubmission';
import aliasFile from '../data/artist-aliases.json';
import { countLoreForCard, existingLoreTexts, recordLore } from '../utils/loreInventory';
import { isAdminUser } from '../utils/admins';
import { propose, DEFAULT_VOUCH_CONFIG } from '../utils/vouching';

/**
 * /fr - Fake Remember: artist-contributed card lore.
 *
 * Usage: /fr CARDNAME <the story behind the card>
 *
 * This writes into the knowledge base at the highest retrieval weight
 * (`memories: 3.0`), so it is gated rather than open. On 2026-08-19 the
 * ungated version took 21 false submissions in 18 minutes - seven of them the
 * same string - which is why every rule in utils/loreSubmission.ts exists.
 *
 * Gates, in order: a real card, the card's artist (admins bypass), at most two
 * entries per card, no duplicates, and content that actually reads like lore.
 */

/** Alias map, minus the documentation keys. */
const ARTIST_ALIASES: ArtistAliases = Object.fromEntries(
  Object.entries(aliasFile as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v))
    .map(([k, v]) => [k, v as string[]])
);

/** Read the submitter's identity from the raw Telegram context. */
function identify(message: Memory, ctx: any): Submitter {
  const from = ctx?.message?.from ?? (message as any).rawMessage?.from;
  const id = from?.id?.toString();
  const username = from?.username;
  const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || username;
  return { id, username, displayName, isAdmin: isAdminUser(id, username) };
}

export const fakeRememberCommand: Action = {
  name: 'FAKE_REMEMBER_COMMAND',
  description: 'Handles /fr command to store artist-contributed card lore',
  similes: ['REMEMBER', 'MEMORY'],
  examples: [],

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.trim().toLowerCase() || '';
    return text.startsWith('/fr');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: any,
    callback?: HandlerCallback
  ) => {
    const raw = message.content.text || '';
    const submitter = identify(message, options?.ctx);
    const who = submitter.username || submitter.displayName || 'unknown';
    logger.info(`━━━━━ /fr ━━━━━ [${who}] ${raw.slice(0, 60)}`);

    const reject = async (code: string, text: string) => {
      logger.info(`[/fr] rejected (${code}) from ${who}`);
      if (callback) await callback({ text });
      return { success: true, text: `Rejected: ${code}` };
    };

    // Resolve the card first so the entry count and duplicate check can run.
    const preview = gateSubmission({ raw, submitter, existingForCard: 0, aliases: ARTIST_ALIASES });
    if (!preview.ok && preview.code !== 'card_full' && preview.code !== 'duplicate') {
      return reject(preview.code!, preview.message!);
    }

    const card = preview.card!;
    let existingForCard = 0;
    let existingTexts: string[] = [];
    try {
      existingForCard = await countLoreForCard(runtime, card);
      existingTexts = await existingLoreTexts(runtime, card);
    } catch (err) {
      // A failure to count must not open the gate; treat it as full.
      logger.error({ error: err }, '[/fr] could not count existing lore — refusing');
      return reject('count_failed', 'Can’t check that card right now — try again shortly.');
    }

    const verdict = gateSubmission({ raw, submitter, existingForCard, existingTexts, aliases: ARTIST_ALIASES });
    if (!verdict.ok) return reject(verdict.code!, verdict.message!);

    // Model screen, last because it costs tokens and everything cheap has passed.
    try {
      const screen = await callTextModel(runtime, {
        model: process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini',
        prompt: buildQualityPrompt(card, verdict.lore!),
        systemPrompt: 'You screen community lore submissions for a Fake Rares card archive. Be strict.',
        maxTokens: 120,
        source: 'Lore-Submission-Screen',
      });
      const quality = parseQualityResponse(screen?.text ?? '');
      if (!quality.ok) return reject('low_quality_model', `Not stored — ${quality.reason}.`);
    } catch (err) {
      // If the screen is unavailable, fall through on the heuristics alone
      // rather than blocking a legitimate artist.
      logger.warn({ error: err }, '[/fr] quality screen unavailable, using heuristics only');
    }

    // Third-party lore goes to the room rather than straight into the corpus.
    // The artist gate is right about authority and wrong about coverage, so
    // this is the path most genuine contributors will take.
    if (verdict.route === 'vouch') {
      if (!submitter.id) {
        return reject('no_identity', 'I can’t tell who you are, so I can’t put this up for vouching.');
      }
      const result = propose({
        card,
        lore: verdict.lore!,
        proposerId: submitter.id,
        proposerName: who,
        roomId: message.roomId?.toString() || 'unknown',
      });
      if (!result.ok) return reject(result.refusal!, result.message!);

      const p = result.proposal!;
      logger.info(`[/fr] proposal ${p.id} for ${card} by ${who}`);
      if (callback) {
        await callback({
          text:
            `📜 *Lore proposed for ${card}* by ${who}\n\n` +
            `_${verdict.lore}_\n\n` +
            `Not from the credited artist, so it needs ${DEFAULT_VOUCH_CONFIG.required} vouches to land. ` +
            `If you can confirm this, send \`/vouch ${p.id}\`.`,
        });
      }
      return { success: true, text: `Proposed ${p.id}` };
    }

    try {
      const memoryService = runtime.getService(MemoryStorageService.serviceType) as MemoryStorageService;
      if (!memoryService) throw new Error('MemoryStorageService not available');

      // Hand the service the canonical form: card name up front, so its own
      // card detector tags the entry [CARD:X] and the cap stays enforceable.
      const stored: Memory = {
        ...message,
        content: { ...message.content, text: `remember this: ${card} ${verdict.lore}` },
      };

      const result = await memoryService.storeMemory(stored, options?.ctx?.message ?? (message as any).rawMessage);

      if (result.success && !result.ignoredReason) {
        const remaining = MAX_ENTRIES_PER_CARD - (existingForCard + 1);
        if (callback) {
          await callback({
            text:
              `💾 Lore stored for ${card}.` +
              (remaining > 0 ? ` One more slot left on this card.` : ` That's this card full.`),
          });
        }
        // Ledger last: it is the quota authority, so it must only ever reflect
        // entries that actually reached the knowledge base.
        await recordLore({
          card,
          lore: verdict.lore!,
          submitterId: submitter.id,
          submitterName: who,
          at: Date.now(),
          memoryId: result.memoryId,
        });

        logger.info(`[/fr] stored for ${card} by ${who} (ID: ${result.memoryId})`);
        return { success: true, text: 'Lore stored', memoryId: result.memoryId };
      }

      if (result.ignoredReason) return reject(result.ignoredReason, `⚠️ Not stored: ${result.ignoredReason}`);
      return reject('storage_failed', `❌ Failed to store: ${result.error || 'unknown error'}`);
    } catch (err) {
      logger.error({ error: err }, '❌ [/fr ERROR]');
      if (callback) await callback({ text: 'Bruh, something went wrong storing that. Try again? 🐸' });
      return { success: false, text: 'Memory storage error', error: err as Error };
    }
  },
};

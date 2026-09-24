/**
 * Announces a new fake to the channel the day it lands in the index.
 *
 * The index is hot-reloaded from master once a day (cardIndexRefresher);
 * this looks at it every hour, compares with what it has seen, and posts
 * each card it has not - the card itself, with its directory page as a
 * button. State is a file, so restarts do not repeat, and a bot with no
 * state file records everything already there and says nothing: the first
 * boot on production announces zero cards, not nine hundred.
 *
 * At most a few per check, so a big merge trickles out over a day instead
 * of flooding. Off with NEW_CARD_ANNOUNCEMENTS=false.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { getFullCardIndex } from '../utils/cardIndexRefresher';
import { FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex';
import { buildCardButtons } from '../utils/directoryLinks';
import { announcementFor, newCardsSince, readNewCardState, seedState, writeNewCardState, type NewCardState } from '../utils/newCards';
import { sendCardToChat } from '../utils/sendCardToChat';

export const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Long enough for the refresher's first fetch (5 minutes after boot) to have landed. */
export const FIRST_CHECK_MS = 7 * 60 * 1000;
export const MAX_PER_CHECK = 3;

export class NewCardService extends Service {
  static serviceType = 'NEW_CARDS';
  capabilityDescription = 'Posts each new Fake Rares card to the channel once';

  private timer: NodeJS.Timeout | null = null;
  private channelIds: string[] = [];

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (process.env.NEW_CARD_ANNOUNCEMENTS === 'false') {
      logger.info('[NewCards] disabled (NEW_CARD_ANNOUNCEMENTS=false)');
      return;
    }
    const configured = (this.runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) || '';
    this.channelIds = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (this.channelIds.length === 0) {
      logger.warn('[NewCards] no channel configured; nothing will be posted');
      return;
    }

    if (!readNewCardState()) {
      const seeded = seedState(this.index());
      writeNewCardState(seeded);
      logger.info(`[NewCards] first run: ${seeded.known.length} cards recorded as already known`);
    }

    this.timer = setTimeout(() => {
      void this.check();
      this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
      (this.timer as any).unref?.();
    }, FIRST_CHECK_MS);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  private index(): CardInfo[] {
    const live = getFullCardIndex();
    return live.length > 0 ? live : FULL_CARD_INDEX;
  }

  /** Announce what is new, up to the cap; the rest wait for the next hour. */
  async check(): Promise<string[]> {
    const state: NewCardState = readNewCardState() ?? seedState(this.index());
    const fresh = newCardsSince(state, this.index());
    if (fresh.length === 0) return [];
    logger.info(`[NewCards] ${fresh.length} new card(s) in the index: ${fresh.map((c) => c.asset).join(', ')}`);

    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    const announced: string[] = [];
    for (const card of fresh.slice(0, MAX_PER_CHECK)) {
      // Recorded before the send, as the release note is: a crash between
      // the two costs one announcement, the other order repeats it per boot.
      state.known.push(card.asset.toUpperCase());
      writeNewCardState(state);

      let posted = false;
      for (const chatId of this.channelIds) {
        if (await sendCardToChat(token, chatId, card, announcementFor(card), buildCardButtons(card), (l) => logger.warn(`[NewCards] ${l}`))) {
          posted = true;
        }
      }
      if (posted) {
        state.announced[card.asset.toUpperCase()] = new Date().toISOString();
        writeNewCardState(state);
        announced.push(card.asset);
        logger.info(`[NewCards] announced ${card.asset}`);
      } else {
        logger.warn(`[NewCards] could not post ${card.asset}; not retrying`);
      }
    }
    return announced;
  }

  static async start(runtime: IAgentRuntime): Promise<NewCardService> {
    const service = new NewCardService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(NewCardService.serviceType) as NewCardService | null;
    if (service) await service.stop();
  }
}

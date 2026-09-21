/**
 * Runs the anniversary timeline against Telegram.
 *
 * A tick every 20 seconds asks the engine whether anything is due. The engine
 * keeps its record on disk, so the 02:00 restart in the middle of the day, or
 * a deploy, picks up exactly where it left off and re-sends nothing.
 *
 * Every send is also written to the day log as a broadcast, the way the X
 * harvest's volunteered posts are, so tomorrow's recap strip does not become
 * a strip of the bot talking to itself all day.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { AnniversaryEngine, type Effects } from '../conversation/anniversary';
import {
  anniversaryEnabled,
  anniversaryStore,
  eventChatIds,
  loadSchedule,
} from '../conversation/anniversaryRuntime';
import { appendDayTurn } from '../conversation/dayLog';
import { roomsForChat } from '../conversation/roomMap';
import { FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex';
import { determineCardUrl } from '../utils/cardUrlUtils';
import { extractFileId, fileIdKind, getTelegramFileId, saveTelegramFileId } from '../utils/telegramFileIdCache';
import { editMessageText, sendMedia, sendTextMessage } from '../utils/telegramSend';

export const TICK_MS = 20_000;

export class AnniversaryService extends Service {
  static serviceType = 'ANNIVERSARY';
  capabilityDescription = 'Runs the Fake Rares 5th birthday timeline';

  private timer: NodeJS.Timeout | null = null;
  private engine: AnniversaryEngine | null = null;
  private schedulePathSeen: string | null = null;
  private ticking = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (!anniversaryEnabled()) {
      logger.info('[Anniversary] off (ANNIVERSARY_ENABLED is not true)');
      return;
    }
    const schedule = loadSchedule();
    if (!schedule) return; // already logged
    const chats = eventChatIds(schedule);
    if (chats.length === 0) {
      logger.warn('[Anniversary] no chat configured; nothing will be posted');
      return;
    }
    logger.info(
      `[Anniversary] armed for ${schedule.event.date} ${schedule.event.timezone} in ${chats.join(', ')}; ` +
      `${this.buildEngine()!.plan.length} items planned`
    );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Rebuilt whenever the schedule file changes, so edits land without a restart. */
  private buildEngine(): AnniversaryEngine | null {
    const schedule = loadSchedule();
    if (!schedule) return null;
    const key = JSON.stringify(schedule);
    if (this.engine && this.schedulePathSeen === key) return this.engine;
    this.schedulePathSeen = key;
    this.engine = new AnniversaryEngine({
      schedule,
      store: anniversaryStore(),
      cards: FULL_CARD_INDEX,
      effects: this.effects(),
      chatIds: eventChatIds(schedule),
    });
    return this.engine;
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.buildEngine()?.tick(now);
    } catch (error) {
      logger.error({ error }, '[Anniversary] tick failed');
    } finally {
      this.ticking = false;
    }
  }

  private token(): string {
    return (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
  }

  private logBroadcast(chatId: string, text: string): void {
    appendDayTurn({
      roomId: roomsForChat(chatId)[0] ?? chatId,
      role: 'bot',
      text,
      at: Date.now(),
      kind: 'broadcast',
    });
  }

  private effects(): Effects {
    return {
      sendText: async (chatId, text) => {
        const id = await sendTextMessage(this.token(), chatId, text);
        if (id !== null) this.logBroadcast(chatId, text);
        return id;
      },
      sendQuestion: async (chatId, text, buttons) => {
        const id = await sendTextMessage(this.token(), chatId, text, {
          inline_keyboard: buttons.map((b) => [{ text: b.label, callback_data: b.data }]),
        });
        if (id !== null) this.logBroadcast(chatId, text);
        return id;
      },
      editMessage: (chatId, messageId, text) => editMessageText(this.token(), chatId, messageId, text),
      sendCard: async (chatId, card, caption) => {
        const sent = await this.sendCard(chatId, card, caption);
        if (sent) this.logBroadcast(chatId, `${caption}`);
        return sent;
      },
      log: (line) => logger.info(`[Anniversary] ${line}`),
    };
  }

  /**
   * A card, by cached file_id when there is one, otherwise by URL.
   *
   * Documents are skipped: the channel refuses them. A GIF goes out as an
   * animation by URL, which is the path that does not produce the zero-second
   * video the carousel once did. Anything Telegram rejects is reported false
   * and the engine picks another card.
   */
  private async sendCard(chatId: string, card: CardInfo, caption: string): Promise<boolean> {
    const token = this.token();
    const cached = getTelegramFileId(card.asset);
    const kind = fileIdKind(cached);
    if (cached && kind && kind !== 'document') {
      const message = await sendMedia(token, chatId, kind, cached, caption);
      if (message) return true;
      logger.warn(`[Anniversary] cached file_id for ${card.asset} rejected; trying the URL`);
    }

    const { url, extension } = determineCardUrl(card, card.asset);
    const byUrl = extension === 'mp4' ? 'video' : extension === 'gif' ? 'animation' : 'photo';
    const message = await sendMedia(token, chatId, byUrl, url, caption);
    if (!message) return false;
    const fileId = extractFileId(message);
    if (fileId) saveTelegramFileId(card.asset, fileId);
    return true;
  }

  static async start(runtime: IAgentRuntime): Promise<AnniversaryService> {
    const service = new AnniversaryService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(AnniversaryService.serviceType) as AnniversaryService | null;
    if (service) await service.stop();
  }
}

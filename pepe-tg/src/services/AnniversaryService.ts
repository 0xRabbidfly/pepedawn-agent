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

import { Service, logger, type IAgentRuntime, type Memory, type UUID } from '@elizaos/core';
import { AnniversaryEngine, type Effects, type LoreEntry } from '../conversation/anniversary';
import { MemoryStorageService } from './MemoryStorageService';
import { recordLore } from '../utils/loreInventory';
import { callTextModel } from '../utils/modelGateway';
import {
  anniversaryEnabled,
  anniversaryStore,
  eventChatIds,
  loadSchedule,
} from '../conversation/anniversaryRuntime';
import { appendDayTurn } from '../conversation/dayLog';
import { roomsForChat } from '../conversation/roomMap';
import { FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex';
import { sendCardToChat } from '../utils/sendCardToChat';
import { editMessageText, sendTextMessage } from '../utils/telegramSend';

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
      judgeLore: async (prompt) =>
        (await callTextModel(this.runtime, {
          model: process.env.ANNIVERSARY_JUDGE_MODEL || process.env.CHAT_MODEL || 'gpt-5.6-luna',
          prompt,
          systemPrompt:
            'You judge a lore contest for the Fake Rares community. You choose one entry by number and ' +
            'give one sentence for the room. You never rewrite an entry. You return JSON only.',
          maxTokens: 200,
          source: 'Anniversary-Judge',
        })).text,
      storeLore: (entry) => this.storeLore(entry),
      log: (line) => logger.info(`[Anniversary] ${line}`),
    };
  }

  /**
   * The winning lore goes into the corpus the way an accepted /fr does: through
   * MemoryStorageService, then the ledger. Attributed to the entrant.
   */
  private async storeLore(entry: LoreEntry): Promise<boolean> {
    const memoryService = this.runtime.getService(MemoryStorageService.serviceType) as MemoryStorageService | null;
    if (!memoryService) {
      logger.warn('[Anniversary] MemoryStorageService unavailable; winner not stored');
      return false;
    }
    const message = {
      id: `lore-${entry.id}` as UUID,
      entityId: this.runtime.agentId,
      agentId: this.runtime.agentId,
      roomId: (roomsForChat(entry.chatId)[0] ?? entry.chatId) as UUID,
      content: { text: `remember this: ${entry.card} ${entry.lore}`, source: 'telegram' },
      createdAt: entry.at,
    } as Memory;
    const raw = { from: { id: Number(entry.submitterId), first_name: entry.name, username: entry.username }, chat: { id: Number(entry.chatId) }, message_id: 0 };
    const result = await memoryService.storeMemory(message, raw);
    if (!result.success || result.ignoredReason) {
      logger.warn(`[Anniversary] winner not stored: ${result.ignoredReason ?? result.error ?? 'unknown'}`);
      return false;
    }
    await recordLore({
      card: entry.card,
      lore: entry.lore,
      submitterId: entry.submitterId,
      submitterName: entry.name,
      at: Date.now(),
      memoryId: result.memoryId,
    });
    logger.info(`[Anniversary] stored the winning lore for ${entry.card} by ${entry.name}`);
    return true;
  }

  /** A card by cached file_id or URL; false when Telegram rejects it and the engine picks another. */
  private async sendCard(chatId: string, card: CardInfo, caption: string): Promise<boolean> {
    return sendCardToChat(this.token(), chatId, card, caption, undefined, (line) => logger.warn(`[Anniversary] ${line}`));
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

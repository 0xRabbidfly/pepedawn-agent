/**
 * Posts each due reminder from src/data/reminders.json to the channel, once
 * a day. Checks every ten minutes; stamps the state before sending, as the
 * release note does, so a crash between the two costs one post rather than
 * repeating it every boot. Off with REMINDERS_ENABLED=false.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { REMINDERS, dueReminders, readReminderState, renderReminder, utcDay, writeReminderState } from '../utils/reminders';
import { sendTextMessage } from '../utils/telegramSend';

export const REMINDER_CHECK_MS = 10 * 60 * 1000;
export const REMINDER_SETTLE_MS = 2 * 60 * 1000;

export class ReminderService extends Service {
  static serviceType = 'REMINDERS';
  capabilityDescription = 'Posts scheduled reminders to the channel once a day';

  private timer: NodeJS.Timeout | null = null;
  private channelIds: string[] = [];

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (process.env.REMINDERS_ENABLED === 'false') {
      logger.info('[Reminders] disabled (REMINDERS_ENABLED=false)');
      return;
    }
    const configured = (this.runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) || '';
    this.channelIds = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (this.channelIds.length === 0) {
      logger.warn('[Reminders] no channel configured; nothing will be posted');
      return;
    }
    logger.info(`[Reminders] ${REMINDERS.length} reminder(s) on file: ${REMINDERS.map((r) => `${r.id} ${r.from}→${r.until} @${r.hourUtc}:00Z`).join(', ')}`);
    this.timer = setTimeout(() => {
      void this.check();
      this.timer = setInterval(() => void this.check(), REMINDER_CHECK_MS);
      (this.timer as any).unref?.();
    }, REMINDER_SETTLE_MS);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  async check(now = new Date()): Promise<string[]> {
    const state = readReminderState();
    const due = dueReminders(REMINDERS, state, now);
    const posted: string[] = [];
    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    for (const reminder of due) {
      state.lastPosted[reminder.id] = utcDay(now);
      writeReminderState(state);
      const text = renderReminder(reminder, now);
      const markup = reminder.button ? { inline_keyboard: [[{ text: reminder.button.text, url: reminder.button.url }]] } : undefined;
      let ok = false;
      for (const chatId of this.channelIds) {
        if ((await sendTextMessage(token, chatId, text, markup)) !== null) ok = true;
      }
      if (ok) {
        posted.push(reminder.id);
        logger.info(`[Reminders] posted ${reminder.id}`);
      } else {
        logger.warn(`[Reminders] could not post ${reminder.id}; next attempt tomorrow`);
      }
    }
    return posted;
  }

  static async start(runtime: IAgentRuntime): Promise<ReminderService> {
    const service = new ReminderService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(ReminderService.serviceType) as ReminderService | null;
    if (service) await service.stop();
  }
}

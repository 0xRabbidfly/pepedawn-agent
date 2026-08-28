/**
 * The daily strip, made at the nightly restart.
 *
 * PM2 cron-restarts at 02:00 every day, so the process already wakes up once a
 * day at a fixed hour — there is no reason to run a second scheduler beside
 * it. The recap is built shortly after boot and covers the day that just
 * ended.
 *
 * The trap in that is well documented here: XHarvestService armed its timer at
 * start-up and PM2 restarts on every deploy as well as nightly, so the
 * post-boot round *became* the cadence and each deploy bought another one
 * (5.6.0). "Once per boot" and "once per day" are only the same sentence on a
 * machine that boots once a day, and this one does not.
 *
 * So the guard is a persisted day stamp, not a timer: the recap runs when the
 * stamp is not today's date, and writes the stamp before it posts. Three
 * deploys in an afternoon produce one strip, or none.
 *
 * A window on top of that keeps a mid-afternoon deploy from posting last
 * night's recap to a room that has moved on: by default it will only fire
 * between 02:00 and 10:00 local.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { dayBounds, readDayTurns } from '../conversation/dayLog';
import { callTextModel } from '../utils/modelGateway';
import { buildStrip } from '../utils/recapStrip';
import { cardsMentioned } from '../utils/xHarvest';

interface RecapState {
  /** Local YYYY-MM-DD of the last day a strip was posted. */
  lastRecapDay?: string;
}

export function localDayStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function statePath(): string {
  return process.env.RECAP_STATE_PATH || join(process.cwd(), 'src', 'data', 'recap-state.json');
}

export function readState(): RecapState {
  try {
    const p = statePath();
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as RecapState) : {};
  } catch {
    return {};
  }
}

export function writeState(state: RecapState): void {
  try {
    const p = statePath();
    mkdirSync(dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 1), 'utf8');
    renameSync(tmp, p);
  } catch (error) {
    logger.warn({ error }, '[Recap] could not persist state — a restart may repeat the strip');
  }
}

export interface DueCheck {
  due: boolean;
  reason: string;
}

/** Pure, so the whole cadence rule is testable without a clock or a runtime. */
export function isDue(
  now: Date,
  state: RecapState,
  window: { earliest: number; latest: number }
): DueCheck {
  const today = localDayStamp(now);
  if (state.lastRecapDay === today) return { due: false, reason: 'already_ran_today' };
  const hour = now.getHours();
  if (hour < window.earliest) return { due: false, reason: 'before_window' };
  if (hour >= window.latest) return { due: false, reason: 'after_window' };
  return { due: true, reason: 'due' };
}

export class RecapService extends Service {
  static serviceType = 'RECAP';
  capabilityDescription = 'Builds the daily recap strip after the nightly restart';

  private timer: NodeJS.Timeout | null = null;
  private channelIds: string[] = [];
  private earliest = parseInt(process.env.RECAP_EARLIEST_HOUR || '2', 10);
  private latest = parseInt(process.env.RECAP_LATEST_HOUR || '10', 10);
  /** How long to let the bot settle before spending money on a strip. */
  private settleMs = parseInt(process.env.RECAP_SETTLE_MS || '90000', 10);

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (process.env.RECAP_ENABLED !== 'true') {
      logger.info('[Recap] disabled (RECAP_ENABLED is not true)');
      return;
    }

    const configured =
      process.env.RECAP_CHANNEL_IDS || (this.runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) || '';
    this.channelIds = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (this.channelIds.length === 0) {
      logger.warn('[Recap] no channel configured; nothing will be posted');
      return;
    }

    logger.info(
      `[Recap] armed — window ${this.earliest}:00-${this.latest}:00, ` +
      `channels ${this.channelIds.join(', ')}, last ran ${readState().lastRecapDay ?? 'never'}`
    );

    this.timer = setTimeout(() => void this.maybePost(), this.settleMs);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async maybePost(now = new Date()): Promise<boolean> {
    const state = readState();
    const check = isDue(now, state, { earliest: this.earliest, latest: this.latest });
    if (!check.due) {
      logger.info(`[Recap] not posting: ${check.reason}`);
      return false;
    }

    // Stamped before the work, not after. A crash mid-render costs one day's
    // strip; a crash loop that re-renders on every boot costs real money and
    // posts the same day repeatedly.
    writeState({ ...state, lastRecapDay: localDayStamp(now) });

    const { from, to, label } = dayBounds(1, now);
    let posted = false;

    for (const chatId of this.channelIds) {
      try {
        const roomId = this.roomFor(chatId);
        const turns = readDayTurns(roomId, from, to);
        const cardsNamed = new Set(turns.flatMap((t) => cardsMentioned(t.text || ''))).size;

        const strip = await buildStrip({
          turns,
          dateLabel: label,
          cardsNamed,
          choose: async (prompt) =>
            (await callTextModel(this.runtime, {
              model: process.env.RECAP_MODEL || 'gpt-5.6-luna',
              prompt,
              systemPrompt:
                'You select messages for a comic strip. You never write or reword dialogue. ' +
                'You return JSON only.',
              maxTokens: 500,
              source: 'Recap',
            })).text,
        });

        if (!strip) {
          logger.info(`[Recap] ${label} in ${chatId}: nothing worth a strip`);
          continue;
        }

        if (await this.sendVideo(chatId, strip.mp4, strip.caption)) {
          posted = true;
          logger.info(
            `[Recap] posted ${strip.moments.length} panels to ${chatId} ` +
            `(${(strip.durationMs / 1000).toFixed(0)}s, ${(strip.mp4.length / 1024 / 1024).toFixed(2)}MB)`
          );
        }
      } catch (error) {
        logger.error({ error, chatId }, '[Recap] failed to build or post');
      }
    }

    return posted;
  }

  /** Day-log rooms are keyed the way the message path keys them. */
  private roomFor(chatId: string): string {
    const { roomForChat } = require('../utils/xHarvest');
    return roomForChat(chatId) ?? chatId;
  }

  /**
   * Sends and reports whether it worked.
   *
   * `periodicContent.sendToChannels` logs a warning and swallows the failure,
   * so "Posted periodic…" appears whether or not anything arrived. A recap
   * that silently fails is worse: the day stamp is already written, so nobody
   * would find out until someone asked where the strip went.
   */
  private async sendVideo(chatId: string, mp4: Buffer, caption: string): Promise<boolean> {
    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    if (!token) {
      logger.warn('[Recap] no bot token; not sending');
      return false;
    }

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('supports_streaming', 'true');
    form.append('video', new Blob([new Uint8Array(mp4)], { type: 'video/mp4' }), 'recap.mp4');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      logger.error(`[Recap] send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  }

  static async start(runtime: IAgentRuntime): Promise<RecapService> {
    const service = new RecapService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(RecapService.serviceType) as RecapService | null;
    if (service) await service.stop();
  }
}

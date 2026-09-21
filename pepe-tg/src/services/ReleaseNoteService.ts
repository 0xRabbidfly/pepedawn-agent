/**
 * Telling the room what changed, once, after an upgrade.
 *
 * PM2 restarts this process constantly — nightly at 02:00, and twice on every
 * deploy — so "post on boot" would be a bulletin several times a day. The guard
 * is the version, persisted: a section in docs/WHATS_NEW.md is posted the first
 * time a build carrying that version comes up, and never again. A restart with
 * no version change posts nothing, which is almost every restart.
 *
 * Two lessons from the recap are reused verbatim. The stamp is written BEFORE
 * the post, because a crash between the two costs one announcement while the
 * other order costs the channel an announcement per boot. And the send is
 * checked, because periodicContent logs success whether or not Telegram took
 * the message.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { sendChannelText } from '../utils/telegramSend';
import { currentVersion, isNewerVersion, whatsNewFor } from '../utils/whatsNew';

interface ReleaseState {
  /** Version whose note has been posted. */
  announcedVersion?: string;
  announcedAt?: string;
}

export function releaseStatePath(): string {
  return process.env.RELEASE_STATE_PATH || join(process.cwd(), 'src', 'data', 'release-state.json');
}

export function readReleaseState(): ReleaseState {
  try {
    const path = releaseStatePath();
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as ReleaseState) : {};
  } catch {
    return {};
  }
}

export function writeReleaseState(state: ReleaseState): void {
  try {
    const path = releaseStatePath();
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 1), 'utf8');
    renameSync(tmp, path);
  } catch (error) {
    logger.warn({ error }, '[ReleaseNote] could not persist state — the note may be posted again');
  }
}

export type DueReason = 'due' | 'no_version' | 'nothing_to_say' | 'already_announced' | 'not_newer';

/** Pure, so the whole rule is testable without a clock, a channel or a runtime. */
export function noteDue(
  version: string | undefined,
  note: string | null,
  state: ReleaseState
): { due: boolean; reason: DueReason } {
  if (!version) return { due: false, reason: 'no_version' };
  if (!note) return { due: false, reason: 'nothing_to_say' };
  if (state.announcedVersion === version) return { due: false, reason: 'already_announced' };
  if (!isNewerVersion(version, state.announcedVersion)) return { due: false, reason: 'not_newer' };
  return { due: true, reason: 'due' };
}

/** Long enough for the bot to be answering by the time it claims to be new. */
export const ANNOUNCE_SETTLE_MS = 60_000;

export class ReleaseNoteService extends Service {
  static serviceType = 'RELEASE_NOTE';
  capabilityDescription = 'Posts a short note to the channel the first time a new version comes up';

  private timer: NodeJS.Timeout | null = null;
  private channelIds: string[] = [];

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (process.env.RELEASE_NOTES_ENABLED !== 'true') {
      logger.info('[ReleaseNote] disabled (RELEASE_NOTES_ENABLED is not true)');
      return;
    }

    const configured =
      process.env.RELEASE_NOTES_CHANNEL_IDS ||
      (this.runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) ||
      '';
    this.channelIds = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (this.channelIds.length === 0) {
      logger.warn('[ReleaseNote] no channel configured; nothing will be posted');
      return;
    }

    const version = currentVersion();
    const check = noteDue(version, version ? whatsNewFor(version) : null, readReleaseState());
    if (!check.due) {
      logger.info(`[ReleaseNote] not posting ${version ?? 'unknown version'}: ${check.reason}`);
      return;
    }

    logger.info(`[ReleaseNote] ${version} has a note; posting in ${ANNOUNCE_SETTLE_MS / 1000}s`);
    this.timer = setTimeout(() => void this.post(), ANNOUNCE_SETTLE_MS);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async post(): Promise<boolean> {
    const version = currentVersion();
    const note = version ? whatsNewFor(version) : null;
    const state = readReleaseState();
    const check = noteDue(version, note, state);
    if (!check.due) {
      logger.info(`[ReleaseNote] stood down before posting: ${check.reason}`);
      return false;
    }

    // Stamped first. See the header.
    writeReleaseState({ ...state, announcedVersion: version, announcedAt: new Date().toISOString() });

    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    let posted = false;
    for (const chatId of this.channelIds) {
      if (await sendChannelText(token, chatId, note!)) {
        posted = true;
        logger.info(`[ReleaseNote] announced ${version} to ${chatId}`);
      } else {
        logger.warn(`[ReleaseNote] could not announce ${version} to ${chatId}`);
      }
    }
    return posted;
  }

  static async start(runtime: IAgentRuntime): Promise<ReleaseNoteService> {
    const service = new ReleaseNoteService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(ReleaseNoteService.serviceType) as ReleaseNoteService | null;
    if (service) await service.stop();
  }
}

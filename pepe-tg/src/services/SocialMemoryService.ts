/**
 * Runs social memory capture: once shortly after boot, then every few hours.
 *
 * PM2 restarts the bot at 02:00 and on every deploy, and capture is safe to
 * run on each of those: it reads the day log from a persisted watermark, so a
 * run with no finished conversation since the last one makes no model call.
 * The interval only keeps memories from lagging a whole day behind the room.
 *
 * The settle delay puts it after the nightly recap (90s), which is the more
 * visible of the two if the box is slow to wake.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { runWithAction } from '../utils/actionContext';
import { callTextModel } from '../utils/modelGateway';
import { CAPTURE_SYSTEM_PROMPT } from '../conversation/memoryCapture';
import { runCapture, socialMemoryMode } from '../conversation/socialMemoryRuntime';

export const CAPTURE_SETTLE_MS = 150_000;
export const CAPTURE_EVERY_MS = 3 * 60 * 60 * 1000;

export class SocialMemoryService extends Service {
  static serviceType = 'SOCIAL_MEMORY';
  capabilityDescription = 'Remembers a few notable things about each person in the group';

  private first: NodeJS.Timeout | null = null;
  private every: NodeJS.Timeout | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    const mode = socialMemoryMode();
    if (mode === 'off') {
      logger.info('[SocialMemory] off (SOCIAL_MEMORY is not "record" or "on")');
      return;
    }
    logger.info(
      `[SocialMemory] ${mode} — capture ${CAPTURE_SETTLE_MS / 1000}s after boot, then every ${CAPTURE_EVERY_MS / 3_600_000}h`
    );
    this.first = setTimeout(() => void this.capture(), CAPTURE_SETTLE_MS);
    (this.first as any).unref?.();
    this.every = setInterval(() => void this.capture(), CAPTURE_EVERY_MS);
    (this.every as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.first) clearTimeout(this.first);
    if (this.every) clearInterval(this.every);
    this.first = null;
    this.every = null;
  }

  async capture(): Promise<void> {
    try {
      const report = await runWithAction('social_memory_capture', () =>
        runCapture({
          model: async (prompt) =>
            (await callTextModel(this.runtime, {
              model: process.env.SOCIAL_MEMORY_MODEL || process.env.CHAT_MODEL || 'gpt-5.6-luna',
              prompt,
              systemPrompt: CAPTURE_SYSTEM_PROMPT,
              maxTokens: 900,
              source: 'SocialMemory',
            })).text,
        })
      );
      if (!report) {
        logger.info('[SocialMemory] capture already running; skipped');
        return;
      }
      logger.info(
        `[SocialMemory] capture: ${report.sessions} conversation(s) in ${report.chats} chat(s), ${report.calls} call(s) — ` +
        `${report.admitted} new, ${report.replaced} replaced, ${report.reinforced} reinforced, ` +
        `${report.rejected} turned away, ${report.failed} failed`
      );
    } catch (error) {
      logger.error({ error }, '[SocialMemory] capture failed');
    }
  }

  static async start(runtime: IAgentRuntime): Promise<SocialMemoryService> {
    const service = new SocialMemoryService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(SocialMemoryService.serviceType) as SocialMemoryService | null;
    if (service) await service.stop();
  }
}

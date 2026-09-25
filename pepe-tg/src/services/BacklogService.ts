/**
 * Closes the loop on the fake backlog: when a deploy brings a commit whose
 * message carries "Ticket: KEK-nnn", that ticket is shipped, and the room
 * that asked for it hears so. Nobody moves a ticket by hand; this is the
 * last of the two moves that follow the work (the proposer's "review" is
 * the first).
 *
 * Reads the git log of the checkout it runs from, a couple of minutes
 * after boot, and announces each newly shipped ticket once - the status
 * change is persisted, so a restart does not repeat it. Off with
 * BACKLOG_ANNOUNCEMENTS=false.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { execFileSync } from 'child_process';
import { STATUS_MARK, readTickets, setTicketStatus, ticketsInCommitMessages } from '../utils/buildRequests';
import { sendTextMessage } from '../utils/telegramSend';

export const BACKLOG_SETTLE_MS = 2 * 60 * 1000;

/** Ticket ids in the last `depth` commits of this checkout; empty when git is not there. */
export function shippedTicketIds(depth = 300): string[] {
  try {
    const log = execFileSync('git', ['log', `-n`, String(depth), '--format=%B'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return ticketsInCommitMessages(log);
  } catch {
    return [];
  }
}

export class BacklogService extends Service {
  static serviceType = 'BACKLOG';
  capabilityDescription = 'Marks fake-backlog tickets shipped when their commit is deployed, and says so';

  private timer: NodeJS.Timeout | null = null;
  private channelIds: string[] = [];

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (process.env.BACKLOG_ANNOUNCEMENTS === 'false') {
      logger.info('[Backlog] disabled (BACKLOG_ANNOUNCEMENTS=false)');
      return;
    }
    const configured = (this.runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) || '';
    this.channelIds = configured.split(',').map((s) => s.trim()).filter(Boolean);
    this.timer = setTimeout(() => void this.run(), BACKLOG_SETTLE_MS);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async run(): Promise<string[]> {
    const shipped = shippedTicketIds();
    if (shipped.length === 0) return [];
    const open = new Map(readTickets().filter((t) => t.status !== 'shipped' && t.status !== 'declined').map((t) => [t.id, t]));
    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    const announced: string[] = [];
    for (const id of shipped) {
      const t = open.get(id);
      if (!t) continue;
      // Moved first: a crash between the move and the post costs one
      // announcement, the other order repeats it every boot.
      setTicketStatus(id, 'shipped', 'deploy');
      const text = `🎫 ${t.id} · ${t.title} · ${STATUS_MARK.shipped}\nBuilt, reviewed, and live as of this restart. ${t.sender.name ? `${t.sender.name} asked for it.` : ''}`.trim();
      for (const chatId of this.channelIds) await sendTextMessage(token, chatId, text);
      announced.push(id);
      logger.info(`[Backlog] ${id} shipped${this.channelIds.length ? ' and announced' : ''}`);
    }
    return announced;
  }

  static async start(runtime: IAgentRuntime): Promise<BacklogService> {
    const service = new BacklogService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(BacklogService.serviceType) as BacklogService | null;
    if (service) await service.stop();
  }
}

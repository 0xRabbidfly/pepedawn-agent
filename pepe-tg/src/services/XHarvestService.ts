/**
 * XHarvestService — pulls recent community activity from X and volunteers it
 * into a quiet room.
 *
 * Two cadences, deliberately different: harvesting is expensive and the source
 * moves slowly (daily), while the room can fall quiet at any time, so the
 * volunteer check runs often and almost always decides to do nothing.
 *
 * Nothing here writes to the knowledge corpus. See src/utils/xHarvest.ts for
 * why that separation is load-bearing.
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger, createUniqueUuid } from '@elizaos/core';
import { FileRoomHistoryStore } from '../conversation/fileRoomHistoryStore';
import { TelemetryService } from './TelemetryService';
import {
  HARVEST_QUERIES, RAW_POSTS_RULE, DEFAULT_HARVEST_CONFIG,
  parseHarvestResponse, mergePosts, selectForVolunteer, markVolunteered, roomForChat,
  formatForTelegram, readXaiSpend, lastHarvestAt, recordHarvestRun, volunteerLead,
  type HarvestedPost,
} from '../utils/xHarvest';

const XAI_ENDPOINT = 'https://api.x.ai/v1/responses';

/**
 * grok-4.3, not grok-4.6, and deliberately still a reasoning model.
 *
 * Measured 2026-08-21 on the same harvest prompt:
 *
 *   grok-4.3                       $0.026   49s   10 posts
 *   grok-4.20-0309-reasoning       $0.028   55s   10 posts
 *   grok-4.6                       $0.075  107s    5 posts
 *   grok-4.20-0309-non-reasoning   $0.121   17s   14 posts
 *
 * Switching off reasoning costs MORE, which is the counter-intuitive part: with
 * nothing narrowing the search the x_search tool poured 65k tokens of raw
 * results into the request instead of 8k, so the saving on thinking was wiped
 * out several times over by reading. It is much faster, if latency ever matters
 * more than cost. grok-4.3 keeps the narrowing on a cheaper rate card.
 */
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4.3';

/** Boot is already busy; never fire an API call the instant the process is up. */
const BOOT_STAGGER_MS = 5 * 60 * 1000;
/** How far back each harvest looks. Overlaps the daily cadence so a missed run self-heals. */
const HARVEST_WINDOW_DAYS = 7;

export class XHarvestService extends Service {
  static serviceType = 'xHarvest';
  capabilityDescription = 'Harvests Fake Rares activity from X and volunteers it when the room is quiet';

  private harvestTimer: NodeJS.Timeout | null = null;
  private volunteerTimer: NodeJS.Timeout | null = null;
  private enabled = false;
  private apiKey = '';
  private channelIds: string[] = [];
  private harvestMs = 24 * 60 * 60 * 1000;
  private volunteerCheckMs = 15 * 60 * 1000;
  private lastVolunteerAt: number | undefined;
  /** Template id of the last lead used, so the next one differs. */
  private lastLeadId: string | undefined;
  private history = new FileRoomHistoryStore();

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    const flag = runtime.getSetting('X_HARVEST_ENABLED');
    this.enabled = flag === true || flag === 'true';
    if (!this.enabled) return;

    this.apiKey = (runtime.getSetting('XAI_API_KEY') as string) || process.env.XAI_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('XHarvestService: XAI_API_KEY not set - disabled');
      this.enabled = false;
      return;
    }

    const hours = parseFloat((runtime.getSetting('X_HARVEST_INTERVAL_HOURS') as string) || '24');
    if (Number.isFinite(hours) && hours > 0) this.harvestMs = hours * 60 * 60 * 1000;

    const channels = (runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) || '';
    this.channelIds = channels.split(',').map((c) => c.trim()).filter(Boolean);
    if (this.channelIds.length === 0) {
      logger.warn('XHarvestService: TELEGRAM_CHANNEL_ID not set - will harvest but never volunteer');
    }
    logger.info(`XHarvestService initialised (harvest every ${hours}h)`);
  }

  async start(): Promise<void> {
    if (!this.enabled) return;

    // The interval alone never governed anything. Production hard-restarts
    // nightly at 02:00 and again on every deploy, so the process never lived
    // long enough to reach it - the post-boot harvest WAS the cadence, and each
    // restart bought another full round. On 2026-08-21 it ran four times in
    // three hours, twice because of deploys. So the schedule is anchored to a
    // timestamp on disk rather than to how long this process has been up.
    const elapsed = Date.now() - lastHarvestAt();
    const wait = elapsed >= this.harvestMs
      ? BOOT_STAGGER_MS
      : Math.max(BOOT_STAGGER_MS, this.harvestMs - elapsed);

    if (wait > BOOT_STAGGER_MS) {
      logger.info(
        `XHarvestService: last harvest ${Math.round(elapsed / 60000)}m ago, ` +
        `next in ${Math.round(wait / 60000)}m (skipping the post-boot round)`
      );
    }

    this.harvestTimer = setTimeout(() => {
      void this.harvestAll();
      this.harvestTimer = setInterval(() => void this.harvestAll(), this.harvestMs);
    }, wait);

    this.volunteerTimer = setInterval(() => void this.maybeVolunteer(), this.volunteerCheckMs);
    logger.info('XHarvestService started');
  }

  async stop(): Promise<void> {
    if (this.harvestTimer) { clearTimeout(this.harvestTimer); clearInterval(this.harvestTimer); }
    if (this.volunteerTimer) clearInterval(this.volunteerTimer);
    this.harvestTimer = null;
    this.volunteerTimer = null;
  }

  /** Run every query and merge what comes back. Public so a script can trigger it. */
  async harvestAll(): Promise<{ added: number; total: number }> {
    // Stamped before the queries fire, not after: the money is spent the moment
    // they go out, so a process killed mid-round must not let the next boot pay
    // for the same round again.
    recordHarvestRun();

    let added = 0;
    let total = 0;
    for (const q of HARVEST_QUERIES) {
      try {
        const posts = await this.runQuery(q.key, q.instruction);
        const result = mergePosts(posts);
        added += result.added;
        total = result.total;
        logger.info(`XHarvest[${q.key}]: ${posts.length} passed the filter, ${result.added} new`);
      } catch (error) {
        // One failing query must not abort the others.
        logger.warn({ error, query: q.key }, 'XHarvest query failed');
      }
    }
    return { added, total };
  }

  private async runQuery(key: string, instruction: string): Promise<HarvestedPost[]> {
    const prompt = `${instruction} ${RAW_POSTS_RULE.replace('{DAYS}', String(HARVEST_WINDOW_DAYS))}`;
    const startedAt = Date.now();
    const res = await fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: XAI_MODEL,
        max_output_tokens: 3000,
        input: [{ role: 'user', content: prompt }],
        tools: [{ type: 'x_search' }],
      }),
    });
    if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();

    let text = '';
    for (const item of data.output ?? []) {
      if (item.type !== 'message') continue;
      for (const c of item.content ?? []) {
        if (c.type === 'output_text' || c.type === 'text') text += c.text;
      }
    }
    await this.recordSpend(key, data.usage, Date.now() - startedAt);
    return parseHarvestResponse(text, key);
  }

  /**
   * Record what a harvest query cost, where `/fc` can see it.
   *
   * These calls go straight to api.x.ai rather than through `modelGateway`,
   * which is what feeds `TelemetryService` — so every xAI call this bot has
   * ever made was invisible to `/fc`, and the cost report has been an OpenAI
   * report wearing the name of a total. The exact figure was already in hand:
   * xAI returns `usage.cost_in_usd_ticks`, and it went to a debug log that
   * production does not emit.
   *
   * The reported cost is authoritative and is used as-is. If it is ever absent,
   * the fallback runs token counts through `calculateCost`, which knows no xAI
   * pricing and will quietly use gpt-4o-mini's — so that path says so out loud
   * rather than presenting a guess as a measurement.
   */
  private async recordSpend(key: string, usage: any, duration: number): Promise<void> {
    try {
      const telemetry = this.runtime.getService(
        TelemetryService.serviceType
      ) as TelemetryService | undefined;
      if (!telemetry) return;

      const spend = readXaiSpend(usage);
      const { tokensIn, tokensOut } = spend;

      let cost = spend.cost ?? 0;
      if (spend.cost === null) {
        cost = telemetry.calculateCost(XAI_MODEL, tokensIn, tokensOut);
        logger.warn(
          { model: XAI_MODEL, tokensIn, tokensOut },
          '[XHarvest] xAI reported no cost; /fc will show an estimate at OpenAI rates'
        );
      }

      await telemetry.logModelUsage({
        timestamp: new Date().toISOString(),
        model: XAI_MODEL,
        tokensIn,
        tokensOut,
        cost,
        source: `X-Harvest-${key}`,
        actionName: 'x_harvest',
        duration,
      });
      logger.info(`XHarvest[${key}] $${cost.toFixed(4)} (${tokensIn}→${tokensOut} tokens)`);
    } catch (err) {
      // Telemetry must never cost us a harvest.
      logger.debug({ error: err }, '[XHarvest] could not record spend');
    }
  }

  /**
   * Offer a post if the room has gone quiet. Almost always a no-op — the
   * selection rules are in xHarvest so they can be tested without a runtime.
   */
  private async maybeVolunteer(): Promise<void> {
    if (this.channelIds.length === 0) return;
    for (const roomId of this.channelIds) {
      try {
        // Room history is keyed by the ElizaOS UUID, not the Telegram chat id -
        // loading by chat id silently returns [], which would mean the room
        // always looks empty and nothing is ever volunteered.
        // Prefer the pairing observed from a real message: inside a forum topic
        // the room key is `chatId-threadId`, which cannot be derived from the
        // chat id alone.
        const historyKey = roomForChat(roomId) ?? (createUniqueUuid(this.runtime, roomId) as string);
        const turns = await this.history.load(historyKey);
        const lastUser = [...turns].reverse().find((t) => t.role === 'user');
        const post = selectForVolunteer({
          lastUserAt: lastUser?.at,
          lastVolunteerAt: this.lastVolunteerAt,
        });
        if (!post) continue;

        const card = formatForTelegram(post, this.leadFor(post));
        const sent = await this.send(roomId, card.text);
        if (sent) {
          markVolunteered(post.id);
          this.lastVolunteerAt = Date.now();
          logger.info(`XHarvest volunteered ${post.id} to ${roomId}`);
        }
      } catch (error) {
        logger.warn({ error, roomId }, 'XHarvest volunteer failed');
      }
    }
  }

  /**
   * PEPEDAWN's own framing, kept outside the quote.
   *
   * The wording is drawn at random from `volunteerLead`, and the template used
   * last time is passed back so the room never gets the same opener twice
   * running. The memory is per-process and the droplet restarts nightly, which
   * is the right lifetime for it — a repeat separated by a day is not a repeat
   * anyone notices.
   */
  private leadFor(post: HarvestedPost): string {
    const lead = volunteerLead(post, { avoid: this.lastLeadId });
    this.lastLeadId = lead.id;
    return lead.text;
  }

  private async send(chatId: string, text: string): Promise<boolean> {
    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    if (!token) return false;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      // sendToChannels elsewhere swallows this; here the caller needs to know,
      // otherwise a post is marked volunteered without ever being seen.
      logger.warn(`XHarvest send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return false;
    }
    return true;
  }

  static async start(runtime: IAgentRuntime): Promise<XHarvestService> {
    const service = new XHarvestService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(XHarvestService.serviceType) as XHarvestService | null;
    if (service) await service.stop();
  }
}

export { DEFAULT_HARVEST_CONFIG };

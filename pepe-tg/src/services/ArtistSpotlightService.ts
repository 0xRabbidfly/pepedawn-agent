/**
 * The daily artist spotlight (KEK-001). See utils/artistSpotlight.ts for
 * what it does and why. This owns the clock, the model and the channel:
 * every ten minutes it plans the day if it is new, and posts the next card
 * when its hour has come. The post is stamped before it is sent, as the
 * release note is - a crash between the two costs one post, never a
 * repeat. Off with SPOTLIGHT_ENABLED=false.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import directoryArtistsJson from '../data/directory-artists.json';
import artistHandlesJson from '../data/artist-handles.json';
import artistAliasesJson from '../data/artist-aliases.json';
import { FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex';
import type { DirectoryArtist } from '../utils/directoryLinks';
import { getFullCardIndex } from '../utils/cardIndexRefresher';
import { callTextModel } from '../utils/modelGateway';
import { sendCardToChat } from '../utils/sendCardToChat';
import { learnedHandleFor } from '../utils/artistTelegram';
import {
  buildHaikuPrompt, composeCaption, emptyState, nextDue, parseHaiku, planDay, readCardLook, spotlightButtons,
  spotlightConfig, telegramHandleFor, utcDay, xHandleFor, type SpotlightState,
} from '../utils/artistSpotlight';

export const SPOTLIGHT_CHECK_MS = 10 * 60 * 1000;
export const SPOTLIGHT_SETTLE_MS = 3 * 60 * 1000;

export function spotlightStatePath(): string {
  return process.env.SPOTLIGHT_STATE_PATH || join(process.cwd(), 'src', 'data', 'spotlight-state.json');
}

export function readSpotlightState(path = spotlightStatePath()): SpotlightState {
  try {
    if (!existsSync(path)) return emptyState();
    const s = JSON.parse(readFileSync(path, 'utf8')) as SpotlightState;
    return { ...emptyState(), ...s, cards: s.cards ?? [], posted: s.posted ?? [], history: s.history ?? [] };
  } catch {
    return emptyState();
  }
}

function writeState(state: SpotlightState, path = spotlightStatePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1), 'utf8');
  renameSync(tmp, path);
}

export class ArtistSpotlightService extends Service {
  static serviceType = 'ARTIST_SPOTLIGHT';
  capabilityDescription = 'One artist a day: a few of their cards, a haiku each, and a nudge to claim their directory page';

  private timer: NodeJS.Timeout | null = null;
  private channelIds: string[] = [];

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    const cfg = spotlightConfig();
    if (!cfg.enabled) {
      logger.info('[Spotlight] disabled (SPOTLIGHT_ENABLED=false)');
      return;
    }
    const configured = (this.runtime.getSetting('TELEGRAM_CHANNEL_ID') as string) || '';
    this.channelIds = configured.split(',').map((s) => s.trim()).filter(Boolean);
    if (this.channelIds.length === 0) {
      logger.warn('[Spotlight] no channel configured; nothing will be posted');
      return;
    }
    logger.info(`[Spotlight] on: posts at ${cfg.hoursUtc.map((h) => `${h}:00`).join(', ')} UTC; claim prod until ${cfg.prodUntil}`);
    this.timer = setTimeout(() => {
      void this.check();
      this.timer = setInterval(() => void this.check(), SPOTLIGHT_CHECK_MS);
      (this.timer as any).unref?.();
    }, SPOTLIGHT_SETTLE_MS);
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

  async check(now = new Date()): Promise<string | null> {
    const cfg = spotlightConfig();
    const artists = (directoryArtistsJson as { artists: DirectoryArtist[] }).artists;
    const index = this.index();

    let state = readSpotlightState();
    if (state.day !== utcDay(now)) {
      state = planDay(state, artists, index, now, cfg);
      writeState(state);
      if (state.artist) logger.info(`[Spotlight] today: ${state.artist} (${state.cards.join(', ')})${state.hasProfile ? '' : ', page bare - prodding'}`);
      else logger.warn('[Spotlight] no artist to spotlight today');
    }

    const asset = nextDue(state, cfg, now);
    if (!asset || !state.artist) return null;
    const card = index.find((c) => c.asset.toUpperCase() === asset.toUpperCase());
    // Stamped before the send. See the header.
    const position = state.posted.length;
    state.posted.push(asset);
    state.lastPostAt = now.getTime();
    writeState(state);
    if (!card) {
      logger.warn(`[Spotlight] ${asset} is no longer in the index; skipped`);
      return null;
    }

    let haiku: string[] | null = null;
    try {
      const reply = await callTextModel(this.runtime, {
        model: cfg.model,
        prompt: buildHaikuPrompt(card, state.artist, readCardLook(card.asset)),
        maxTokens: 1200,
        temperature: 0.9,
        source: 'Artist spotlight haiku',
      });
      haiku = parseHaiku(reply.text);
      if (!haiku) logger.warn(`[Spotlight] haiku for ${asset} did not parse; posting without one`);
    } catch (error) {
      logger.warn({ error }, '[Spotlight] haiku call failed; posting without one');
    }

    const prod = !state.hasProfile && utcDay(now) <= cfg.prodUntil;
    const handles = (artistHandlesJson as { artists: Array<{ artist: string; handle: string; source?: string }> }).artists;
    const caption = composeCaption({
      artist: state.artist,
      card,
      index: position,
      total: state.cards.length,
      haiku,
      // Learned from an admin first (server-only), then the committed alias file.
      telegramHandle: learnedHandleFor(state.artist) ?? telegramHandleFor(state.artist, artistAliasesJson as Record<string, unknown>),
      xHandle: xHandleFor(state.artist, handles),
      prod,
      prodUntil: cfg.prodUntil,
    });
    const token = (this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string) || '';
    let posted = false;
    for (const chatId of this.channelIds) {
      if (await sendCardToChat(token, chatId, card, caption, spotlightButtons(card, state.slug, prod), (l) => logger.warn(`[Spotlight] ${l}`))) posted = true;
    }
    if (posted) logger.info(`[Spotlight] posted ${asset} for ${state.artist} (${position + 1}/${state.cards.length})`);
    else logger.warn(`[Spotlight] could not post ${asset}`);
    return posted ? asset : null;
  }

  static async start(runtime: IAgentRuntime): Promise<ArtistSpotlightService> {
    const service = new ArtistSpotlightService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(ArtistSpotlightService.serviceType) as ArtistSpotlightService | null;
    if (service) await service.stop();
  }
}

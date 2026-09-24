/**
 * At boot, put every committed card visual fact this database lacks into
 * knowledge.
 *
 * The fact files in src/data/card-visual-facts are the source of truth and
 * travel with the code; the database is a per-environment copy. PGlite allows
 * one process, so the running bot is the only thing that can write to prod's
 * database - which is why this is a service and not a script. Presence is
 * checked by deterministic id (one point read per card), so a boot with
 * nothing new embeds nothing, and the nightly restart is what turns a fact
 * committed by the daily workflow into something the bot can recall.
 *
 * Off with CARD_FACTS_IMPORT=off. Waits for the knowledge plugin to settle
 * before the first read.
 */

import { Service, logger, type IAgentRuntime } from '@elizaos/core';
import { importMissingFacts, readFactFiles } from '../utils/cardVisualFacts';

export const IMPORT_SETTLE_MS = 90_000;

export class CardFactsImportService extends Service {
  static serviceType = 'CARD_FACTS_IMPORT';
  capabilityDescription = 'Imports committed card visual facts the database does not have yet';

  private timer: NodeJS.Timeout | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  async start(): Promise<void> {
    if (process.env.CARD_FACTS_IMPORT === 'off') {
      logger.info('[CardFacts] import disabled (CARD_FACTS_IMPORT=off)');
      return;
    }
    this.timer = setTimeout(() => void this.run(), IMPORT_SETTLE_MS);
    (this.timer as any).unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async run(): Promise<{ cards: number; blocks: number; failed: string[] } | null> {
    let memories;
    try {
      memories = readFactFiles();
    } catch (error) {
      logger.warn({ error }, '[CardFacts] could not read the fact files');
      return null;
    }
    if (memories.length === 0) {
      logger.info('[CardFacts] no fact files; nothing to import');
      return null;
    }
    const started = Date.now();
    const result = await importMissingFacts(this.runtime as any, memories, {
      pauseMs: 100,
      log: (line) => logger.info(`[CardFacts] ${line}`),
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (result.cards === 0 && result.failed.length === 0) {
      logger.info(`[CardFacts] ${memories.length} facts on file, all present (${secs}s)`);
    } else {
      logger.info(`[CardFacts] imported ${result.cards} cards / ${result.blocks} blocks in ${secs}s${result.failed.length ? `; failed: ${result.failed.join(', ')}` : ''}`);
    }
    return result;
  }

  static async start(runtime: IAgentRuntime): Promise<CardFactsImportService> {
    const service = new CardFactsImportService(runtime);
    await service.start();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(CardFactsImportService.serviceType) as CardFactsImportService | null;
    if (service) await service.stop();
  }
}

/**
 * PeriodicContentService
 * 
 * Periodically posts helpful tips and card showcases to Telegram channel(s).
 * 
 * Features:
 * - Posts helpful usage tips (rotates through 10 tips)
 * - Posts random card showcases (/f or /fv)
 * - Anti-spam: Only posts if there's been user activity since last post
 * - Configurable intervals
 * 
 * Anti-Spam Logic:
 * - Checks every X minutes (configurable)
 * - Only posts if there's been at least ONE user message in channel since last periodic post
 * - This prevents back-to-back tips during periods of silence
 * - Market notifications are completely separate and post immediately
 */

import type { IAgentRuntime } from '@elizaos/core';
import { Service, logger } from '@elizaos/core';
import { getCardInfo, FULL_CARD_INDEX, type CardInfo } from '../data/fullCardIndex.js';

// ============================================================================
// HELPFUL TIPS CONTENT
// ============================================================================

const HELPFUL_TIPS = [
  {
    title: "🎯 Fuzzy Card Matching",
    text: "Did you know? I'm typo-friendly! Try `/f FREEDOMK` or `/f WAGMI` and I'll auto-correct to the closest card. Works with 75%+ similarity!",
  },
  {
    title: "🎨 Search by Artist",
    text: "Want to explore an artist's work? Use `/f ARTIST_NAME` to get a random card by that artist. Try `/f Rare Scrilla` or `/f indelible`!",
  },
  {
    title: "🔍 AI Visual Analysis",
    text: "Use `/fv CARDNAME` to get deep memetic analysis! I'll read ALL text (OCR), identify meme references, and break down the visual composition. Try `/fv FREEDOMKEK`!",
  },
  {
    title: "📊 Market Activity Tracking",
    text: "Use `/fm` to see recent sales and listings! Options:\n• `/fm` - Last 10 combined\n• `/fm S 5` - Last 5 sales\n• `/fm L 10` - Last 10 listings\n\nI auto-notify when new activity happens!",
  },
  {
    title: "💾 Community Memory",
    text: "Help build our lore! Use `/fr CARDNAME <fact>` or say `FREEDOMKEK remember this: it's the genesis card` to save community knowledge. Everyone can search it via `/fl`!",
  },
  {
    title: "📚 Lore & History",
    text: "Use `/fl TOPIC` to get AI-powered stories from our community archives! Try `/fl Rare Scrilla` or `/fl purple subasset era`. I search 264k+ embedded messages!",
  },
  {
    title: "🎲 Random Discovery",
    text: "Just type `/f` with no arguments to see a random card from our 890+ collection. Great way to discover hidden gems!",
  },
  {
    title: "🧬 Fake Appeal Test",
    text: "Got art? Test its Fake Rares appeal! Send `/ft` with an image attached and I'll score it 1-10 based on PEPE culture, memetic DNA, and visual style!",
  },
  {
    title: "⚡ Real-time Notifications",
    text: "I monitor the Counterparty blockchain 24/7 for Fake Rares activity! Whenever there's a sale or listing, I post it here instantly. Never miss a move!",
  },
  {
    title: "💡 Natural Conversation",
    text: "You don't need to use commands for everything! Ask me naturally: \"Who is Rare Scrilla?\" or \"What are Fake Rares?\" and I'll answer with context awareness.",
  },
];

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class PeriodicContentService extends Service {
  static serviceType = 'periodicContent';
  capabilityDescription = 'Posts periodic helpful tips and card showcases to Telegram';

  private pollingInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalMs: number = 0; // Initialize to avoid TypeScript error
  private channelIds: string[] = [];
  private lastContentPostTime: number = 0;
  private lastChannelMessageId: Map<string, number> = new Map(); // Track last seen message per channel
  private currentTipIndex: number = 0;
  private enabled: boolean = false;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    
    // Check if feature is enabled (handle both boolean and string)
    const enabledSetting = runtime.getSetting('PERIODIC_CONTENT_ENABLED');
    this.enabled = enabledSetting === true || enabledSetting === 'true';
    
    if (!this.enabled) {
      logger.info(`PeriodicContentService is disabled (got: ${enabledSetting}, type: ${typeof enabledSetting})`);
      return;
    }
    
    // Get interval from settings (default: 60 minutes)
    const intervalSetting = runtime.getSetting('PERIODIC_CONTENT_INTERVAL_MINUTES') as string | undefined;
    const intervalMinutes = intervalSetting ? parseFloat(intervalSetting) : 60;
    this.intervalMs = intervalMinutes * 60 * 1000;
    
    // Get channel ID(s) from settings - reuse TELEGRAM_CHANNEL_ID
    const channelIdSetting = runtime.getSetting('TELEGRAM_CHANNEL_ID') as string | undefined;
    if (channelIdSetting) {
      this.channelIds = channelIdSetting
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
    }
    
    if (this.channelIds.length === 0) {
      logger.warn('PeriodicContentService: TELEGRAM_CHANNEL_ID not configured - will not post');
      this.enabled = false;
    } else {
      logger.info(`PeriodicContentService initialized: posting every ${intervalMinutes}min to ${this.channelIds.length} channel(s)`);
    }
  }

  /**
   * Start periodic posting
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      logger.debug('PeriodicContentService: skipping start (disabled)');
      return;
    }

    try {
      this.isRunning = true;
      this.startPolling();
      logger.info(`PeriodicContentService started (interval: ${(this.intervalMs / 60000).toFixed(0)}min)`);
    } catch (error) {
      logger.error({ error }, 'Failed to start PeriodicContentService');
      throw error;
    }
  }

  /**
   * Start polling loop
   */
  private startPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Post immediately on first run, then use interval
    this.tryPostContent().catch((error) => {
      logger.error({ error }, 'Error in initial periodic content post');
    });

    this.pollingInterval = setInterval(() => {
      if (this.isRunning) {
        this.tryPostContent().catch((error) => {
          logger.error({ error }, 'Error in periodic content posting');
        });
      }
    }, this.intervalMs);
  }

  /**
   * Try to post content (checks anti-spam conditions first)
   */
  private async tryPostContent(): Promise<void> {
    try {
      const now = Date.now();

      // Check if enough time has passed since last content post
      if (this.lastContentPostTime > 0) {
        const timeSinceLastPost = now - this.lastContentPostTime;
        if (timeSinceLastPost < this.intervalMs) {
          logger.debug(`Skipping periodic content - too soon since last post`);
          return;
        }
      }

      // ANTI-SPAM: Check if there's been user activity since last post
      // Only post if there's been at least ONE user message in the channel
      const hasNewActivity = await this.checkForNewChannelActivity();
      if (!hasNewActivity) {
        logger.debug('Skipping periodic content - no user activity since last post');
        return;
      }

      // Decide what content to post (alternate between tips and card showcases)
      const shouldPostTip = Math.random() < 0.6; // 60% tips, 40% cards
      
      if (shouldPostTip) {
        await this.postTip();
      } else {
        await this.postCardShowcase();
      }

      this.lastContentPostTime = now;
    } catch (error) {
      logger.error({ error }, 'Error in tryPostContent');
      // Don't rethrow - continue periodic posting
    }
  }

  /**
   * Check if there's been new activity in any channel since last post
   * Returns true if there's been at least one new message
   */
  private async checkForNewChannelActivity(): Promise<boolean> {
    const botToken = this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string | undefined;
    if (!botToken) {
      logger.warn('TELEGRAM_BOT_TOKEN not configured - cannot check channel activity');
      return true; // Allow posting if we can't check
    }

    // If this is the first post, allow it
    if (this.lastChannelMessageId.size === 0) {
      return true;
    }

    // Check each channel for new messages
    for (const channelId of this.channelIds) {
      try {
        // Get channel updates
        const updatesResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?limit=100&allowed_updates=["message","channel_post"]`
        );

        if (!updatesResponse.ok) {
          logger.warn(`Failed to get updates for channel ${channelId}`);
          continue;
        }

        const updatesData = await updatesResponse.json();
        const updates = updatesData.result || [];

        // Find messages from this channel (check both message and channel_post)
        const channelMessages = updates.filter(
          (update: any) => {
            const chatId = update.message?.chat?.id || update.channel_post?.chat?.id;
            return chatId?.toString() === channelId.toString();
          }
        );

        if (channelMessages.length === 0) {
          continue;
        }

        // Get the latest message ID
        const latestMessageId = Math.max(
          ...channelMessages.map((m: any) => (m.message?.message_id || m.channel_post?.message_id))
        );

        const lastSeenMessageId = this.lastChannelMessageId.get(channelId) || 0;

        if (latestMessageId > lastSeenMessageId) {
          logger.debug(`New activity detected in channel ${channelId}`);
          return true; // Found new activity
        }
      } catch (error) {
        logger.warn({ channelId, error }, 'Error checking channel activity');
      }
    }

    return false; // No new activity found in any channel
  }

  /**
   * Post a helpful tip (rotates through list)
   */
  private async postTip(): Promise<void> {
    try {
      const tip = HELPFUL_TIPS[this.currentTipIndex];
      const message = `💡 ${tip.title}\n\n${tip.text}`;

      const messageIds = await this.sendToChannels(message);
      
      // Update last seen message IDs for anti-spam tracking
      this.updateLastMessageIds(messageIds);
      
      // Rotate to next tip
      this.currentTipIndex = (this.currentTipIndex + 1) % HELPFUL_TIPS.length;
      
      logger.info(`💡 Posted periodic tip: ${tip.title}`);
    } catch (error) {
      logger.error({ error }, 'Failed to post tip');
    }
  }

  /**
   * Get a random card from the in-memory index
   */
  private getRandomCard(): CardInfo | undefined {
    if (FULL_CARD_INDEX.length === 0) {
      return undefined;
    }
    const randomIndex = Math.floor(Math.random() * FULL_CARD_INDEX.length);
    return FULL_CARD_INDEX[randomIndex];
  }

  /**
   * Post a random card showcase (uses /f or /fv)
   * Always picks a random card from the in-memory index
   */
  private async postCardShowcase(): Promise<void> {
    try {
      // 70% chance for /f, 30% chance for /fv
      const useVisualAnalysis = Math.random() < 0.3;
      
      // Always get a random card from the in-memory index
      const randomCard = this.getRandomCard();
      if (!randomCard) {
        logger.warn('No random card available for showcase');
        return;
      }

      const cardName = randomCard.asset;
      const cardInfo = getCardInfo(cardName);
      if (!cardInfo) {
        logger.warn(`Card ${cardName} not found in index for showcase`);
        return;
      }

      // Build card URL
      const imageUrl = this.getCardImageUrl(cardInfo);

      if (useVisualAnalysis) {
        // Post with visual analysis hint
        const message = `🔍 **Card Spotlight: ${cardName}**\n\n` +
          `Artist: ${cardInfo.artist}\n` +
          `Series: ${cardInfo.series} | Supply: ${cardInfo.supply}\n\n` +
          `💡 Try \`/fv ${cardName}\` for AI visual analysis!`;
        
        const messageIds = await this.sendPhotoToChannels(imageUrl, message);
        this.updateLastMessageIds(messageIds);
        logger.info(`🎴 Posted periodic card spotlight: ${cardName} (with /fv hint)`);
      } else {
        // Simple card display
        const message = `🎴 **Random Card: ${cardName}**\n\n` +
          `Artist: ${cardInfo.artist}\n` +
          `Series: ${cardInfo.series} | Supply: ${cardInfo.supply}\n` +
          `Issued: ${cardInfo.issuance}`;
        
        const messageIds = await this.sendPhotoToChannels(imageUrl, message);
        this.updateLastMessageIds(messageIds);
        logger.info(`🎴 Posted periodic card showcase: ${cardName}`);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to post card showcase');
    }
  }

  /**
   * Update last seen message IDs for anti-spam tracking
   */
  private updateLastMessageIds(messageIds: Map<string, number>): void {
    for (const [channelId, messageId] of messageIds.entries()) {
      this.lastChannelMessageId.set(channelId, messageId);
    }
  }

  /**
   * Get card image URL (same logic as fakeRaresCard action)
   */
  private getCardImageUrl(cardInfo: any): string {
    if (cardInfo.imageUri) {
      return cardInfo.imageUri;
    }
    
    const fileName = `${cardInfo.asset}.${cardInfo.ext}`;
    return `https://fakerare.s3.us-east-2.amazonaws.com/series-${cardInfo.series}/${fileName}`;
  }

  /**
   * Send text message to all configured channels
   * Returns map of channelId -> messageId for anti-spam tracking
   */
  private async sendToChannels(text: string): Promise<Map<string, number>> {
    const botToken = this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string | undefined;
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }

    const messageIds = new Map<string, number>();

    await Promise.all(
      this.channelIds.map(async (channelId) => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: channelId,
              text,
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Telegram API error: ${response.status} - ${error}`);
          }

          const data = await response.json();
          if (data.result?.message_id) {
            messageIds.set(channelId, data.result.message_id);
          }
        } catch (error) {
          logger.warn({ channelId, error }, 'Failed to send to channel');
        }
      })
    );

    return messageIds;
  }

  /**
   * Send photo with caption to all configured channels
   * Returns map of channelId -> messageId for anti-spam tracking
   */
  private async sendPhotoToChannels(photoUrl: string, caption: string): Promise<Map<string, number>> {
    const botToken = this.runtime.getSetting('TELEGRAM_BOT_TOKEN') as string | undefined;
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }

    const messageIds = new Map<string, number>();

    await Promise.all(
      this.channelIds.map(async (channelId) => {
        try {
          const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: channelId,
              photo: photoUrl,
              caption,
              parse_mode: 'Markdown',
            }),
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Telegram API error: ${response.status} - ${error}`);
          }

          const data = await response.json();
          if (data.result?.message_id) {
            messageIds.set(channelId, data.result.message_id);
          }
        } catch (error) {
          logger.warn({ channelId, error }, 'Failed to send photo to channel');
        }
      })
    );

    return messageIds;
  }

  /**
   * Stop periodic posting
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    logger.info('PeriodicContentService stopped');
  }

  /**
   * Static start method for ElizaOS service lifecycle
   */
  static async start(runtime: IAgentRuntime): Promise<PeriodicContentService> {
    const service = new PeriodicContentService(runtime);
    await service.start();
    return service;
  }

  /**
   * Static stop method for ElizaOS service lifecycle
   */
  static async stop(runtime: IAgentRuntime): Promise<void> {
    const service = runtime.getService(PeriodicContentService.serviceType) as PeriodicContentService | null;
    if (service) {
      await service.stop();
    }
  }
}


import {
  ChannelType,
  type Content,
  EventType,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type UUID,
  createUniqueUuid,
  logger,
} from '@elizaos/core';
import type { Chat, Message, ReactionType, Update } from '@telegraf/types';
import type { Context, NarrowedContext, Telegraf } from 'telegraf';
import { Input, Markup } from 'telegraf';
import {
  TelegramContent,
  TelegramEventTypes,
  type TelegramMessageReceivedPayload,
  type TelegramMessageSentPayload,
  type TelegramReactionReceivedPayload,
} from './types';
import { convertToTelegramButtons } from './utils';
import fs from 'fs';
import * as path from 'path';

// Card dimensions (5:7 aspect ratio enforced at collection level)
const CARD_DIMENSIONS = { width: 500, height: 700 } as const;

// Dynamic import for file_id cache (cross-package, loaded at runtime)
let telegramFileIdCache: any = null;
async function getFileIdCache() {
  if (!telegramFileIdCache) {
    try {
      // Try multiple path resolution strategies
      const possiblePaths = [
        path.join(process.cwd(), 'src', 'utils', 'telegramFileIdCache.js'),
        path.join(process.cwd(), 'dist', 'utils', 'telegramFileIdCache.js'),
        path.join(__dirname, '../../../../src/utils/telegramFileIdCache.js'),
        path.join(__dirname, '../../../../dist/utils/telegramFileIdCache.js'),
      ];
      
      for (const cachePath of possiblePaths) {
        try {
          // @ts-ignore - Dynamic import with computed path
          telegramFileIdCache = await import(/* @ts-ignore */ 'file://' + cachePath);
          if (telegramFileIdCache) break;
        } catch {}
      }
      
      if (!telegramFileIdCache) throw new Error('Cache not found');
    } catch {
      // Cache utility not available - fallback gracefully (no caching)
      telegramFileIdCache = {
        getTelegramFileId: () => null,
        saveTelegramFileId: () => {},
        extractFileId: () => null,
      };
    }
  }
  return telegramFileIdCache;
}

/**
 * Removes null bytes from text to prevent Telegram API errors
 */
function cleanText(text: string | undefined | null): string {
  if (!text) return '';
  return text.split('\0').join('');
}
/**
 * Enum representing different types of media.
 * @enum { string }
 * @readonly
 */
export enum MediaType {
  PHOTO = 'photo',
  VIDEO = 'video',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  ANIMATION = 'animation',
}

const MAX_MESSAGE_LENGTH = 4096; // Telegram's max message length

/**
 * Helper to send media and cache file_id for future instant recall
 */
async function sendMediaAndCache(
  assetName: string,
  sendFn: () => Promise<any>,
): Promise<any> {
  const result = await sendFn();
  if (result && assetName) {
    const cache = await getFileIdCache();
    const fileId = cache.extractFileId(result);
    if (fileId) {
      logger.info(`📦 Captured Telegram file_id for ${assetName}: ${fileId.substring(0, 20)}...`);
      cache.saveTelegramFileId(assetName, fileId);
    }
  }
  return result;
}

const getChannelType = (chat: Chat): ChannelType => {
  // Use a switch statement for clarity and exhaustive checks
  switch (chat.type) {
    case 'private':
      return ChannelType.DM;
    case 'group':
    case 'supergroup':
    case 'channel':
      return ChannelType.GROUP;
    default:
      throw new Error(`Unrecognized Telegram chat type: ${(chat as any).type}`);
  }
};

/**
 * Class representing a message manager.
 * @class
 */
export class MessageManager {
  public bot: Telegraf<Context>;
  protected runtime: IAgentRuntime;

  /**
   * Constructor for creating a new instance of a BotAgent.
   *
   * @param {Telegraf<Context>} bot - The Telegraf instance used for interacting with the bot platform.
   * @param {IAgentRuntime} runtime - The runtime environment for the agent.
   */
  constructor(bot: Telegraf<Context>, runtime: IAgentRuntime) {
    this.bot = bot;
    this.runtime = runtime;
  }

  // Process image messages and generate descriptions
  /**
   * Processes an incoming message to extract all media attachments and content.
   * Handles photos, videos, animations (GIFs), and documents.
   * @param {Message} message - The Telegram message object to process.
   * @returns {Promise<{ processedContent: string; attachments: any[] }>} Processed content and attachment array
   */
  async processMessage(message: Message): Promise<{ processedContent: string; attachments: any[] }> {
    let processedContent = '';
    const attachments: any[] = [];

    // Extract text or caption
    if ('text' in message && message.text) {
      processedContent = message.text;
    } else if ('caption' in message && message.caption) {
      processedContent = message.caption;
    }

    // Process photo attachments
    if ('photo' in message && message.photo?.length > 0) {
      const photo = message.photo[message.photo.length - 1]; // Get highest resolution
      try {
        const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
        attachments.push({
          id: photo.file_id,
          url: fileLink.toString(),
          title: 'Image Attachment',
          source: 'Image',
          description: 'User uploaded image',
          text: 'User uploaded image',
          contentType: 'image/jpeg',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get photo file link');
      }
    }

    // Process animation (GIF) attachments
    if ('animation' in message && message.animation) {
      const animation = message.animation;
      try {
        const fileLink = await this.bot.telegram.getFileLink(animation.file_id);
        let thumbnailUrl: string | null = null;

        // Get thumbnail if available
        if (animation.thumbnail && animation.thumbnail.file_id) {
          try {
            const thumbLink = await this.bot.telegram.getFileLink(animation.thumbnail.file_id);
            thumbnailUrl = thumbLink.toString();
          } catch (thumbError) {
            logger.warn('Failed to get animation thumbnail');
          }
        }

        attachments.push({
          id: animation.file_id,
          url: fileLink.toString(),
          title: animation.file_name || 'Animation',
          source: 'Animation',
          description: `Animation: ${animation.file_name || 'file'}`,
          text: `Animation: ${animation.file_name || 'file'}`,
          contentType: 'image/gif',
          thumbnailUrl: thumbnailUrl,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get animation file link');
      }
    }

    // Process video attachments
    if ('video' in message && message.video) {
      const video = message.video;
      try {
        const fileLink = await this.bot.telegram.getFileLink(video.file_id);
        attachments.push({
          id: video.file_id,
          url: fileLink.toString(),
          title: video.file_name || 'Video',
          source: 'Video',
          description: `Video: ${video.file_name || 'file'}`,
          text: `Video: ${video.file_name || 'file'}`,
          contentType: 'video/mp4',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get video file link');
      }
    }

    return { processedContent, attachments };
  }

  /**
   * Process an image from a Telegram message to extract the image URL and description.
   *
   * @param {Message} message - The Telegram message object containing the image.
   * @returns {Promise<{ description: string } | null>} The description of the processed image or null if no image found.
   */
  async processImage(message: Message): Promise<{ description: string } | null> {
    try {
      let imageUrl: string | null = null;

      // Debug logging if needed (commented out to reduce noise)
      // logger.debug(`Telegram Message: ${JSON.stringify(message, null, 2)}`);

      if ('photo' in message && message.photo?.length > 0) {
        const photo = message.photo[message.photo.length - 1];
        const fileLink = await this.bot.telegram.getFileLink(photo.file_id);
        imageUrl = fileLink.toString();
      } else if ('document' in message && message.document?.mime_type?.startsWith('image/')) {
        const fileLink = await this.bot.telegram.getFileLink(message.document.file_id);
        imageUrl = fileLink.toString();
      }

      if (imageUrl) {
        const { title, description } = await this.runtime.useModel(
          ModelType.IMAGE_DESCRIPTION,
          imageUrl
        );
        return { description: `[Image: ${title}\n${description}]` };
      }
    } catch (error) {
      console.error('❌ Error processing image:', error);
    }

    return null;
  }

  // Send long messages in chunks
  /**
   * Sends a message in chunks, handling attachments and splitting the message if necessary
   *
   * @param {Context} ctx - The context object representing the current state of the bot
   * @param {TelegramContent} content - The content of the message to be sent
   * @param {number} [replyToMessageId] - The ID of the message to reply to, if any
   * @returns {Promise<Message.TextMessage[]>} - An array of TextMessage objects representing the messages sent
   */
  async sendMessageInChunks(
    ctx: Context,
    content: TelegramContent,
    replyToMessageId?: number
  ): Promise<Message.TextMessage[]> {
    // FIX: properly await attachments and use native Telegram media methods for inline preview
    if (content.attachments && content.attachments.length > 0) {
      // Convert buttons for later use
      const telegramButtons = convertToTelegramButtons(content.buttons ?? []);
      
      // Use awaited for-loop instead of map(async...) to ensure media sends complete
      let sentPrimaryMedia = false;
      for (const attachment of content.attachments) {
        if (sentPrimaryMedia) break;
        const url = attachment.url || '';
        const ct = (attachment.contentType || '').toLowerCase();
        const assetName = attachment.title || '';
        const isVideo = /^video\//.test(ct) || /\.mp4(\?|$)/i.test(url);
        const isGif = ct === 'image/gif' || /\.gif(\?|$)/i.test(url);
        const isImage = !isGif && (/^image\//.test(ct) || /\.(png|jpe?g|webp)(\?|$)/i.test(url));
        
        // Debug logging for media type detection
        if (assetName) {
          logger.debug(`🔍 Media detection for ${assetName}: contentType="${ct}", url="${url.substring(0, 60)}...", isVideo=${isVideo}, isGif=${isGif}, isImage=${isImage}`);
        }
        
        // ====================================================================
        // TELEGRAM FILE_ID CACHE - Check cache first (instant recall)
        // ====================================================================
        if (assetName) {
          const cache = await getFileIdCache();
          const cachedFileId = cache.getTelegramFileId(assetName);
          if (cachedFileId) {
            // Detect file_id type from prefix
            const isDocumentId = cachedFileId.startsWith('BQAC') || cachedFileId.startsWith('BAAC');
            
            try {
              let sentMessage: any;
              if (isVideo) {
                sentMessage = await ctx.replyWithVideo(cachedFileId, {
                caption: content.text || undefined,
                supports_streaming: true,
                ...CARD_DIMENSIONS,
                reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                ...Markup.inlineKeyboard(telegramButtons),
              });
            } else if (isGif) {
              // CRITICAL FIX: If Telegram returned this GIF as a document, use replyWithDocument
              // This happens when Telegram decides a GIF doesn't meet animation criteria (size, format, etc)
              if (isDocumentId) {
                logger.debug(`📄 Using document method for ${assetName} (Telegram classified this GIF as document)`);
                sentMessage = await ctx.replyWithDocument(cachedFileId, {
                  caption: content.text || undefined,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                });
              } else {
                sentMessage = await ctx.replyWithAnimation(cachedFileId, {
                  caption: content.text || undefined,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                });
              }
            } else if (isImage) {
              sentMessage = await ctx.replyWithPhoto(cachedFileId, {
                caption: content.text || undefined,
                ...CARD_DIMENSIONS,
                reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                ...Markup.inlineKeyboard(telegramButtons),
              });
            }
            
              if (sentMessage) {
                sentPrimaryMedia = true;
                logger.info(`✅ Used cached file_id for ${assetName} (instant)`);
                break;
              }
            } catch (fileIdErr) {
              logger.warn({ assetName, fileIdErr }, 'Cached file_id failed, falling back to upload');
              // Fall through to normal upload flow
            }
          }
        }
        
        // Route to Telegram media methods for inline preview/player (first-time upload)
        if (isVideo) {
          // Handle local file:// URLs (from converted GIFs)
          if (url.startsWith('file://')) {
            try {
              const localPath = url.replace('file://', '');
              if (!fs.existsSync(localPath)) {
                throw new Error(`Local file not found: ${localPath}`);
              }
              
              const fileBuffer = fs.readFileSync(localPath);
              
              await sendMediaAndCache(assetName, () =>
                ctx.replyWithVideo(Input.fromBuffer(fileBuffer), {
                  caption: content.text || undefined,
                  supports_streaming: true,
                  ...CARD_DIMENSIONS,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                })
              );
              sentPrimaryMedia = true;
              break;
            } catch (localFileErr) {
              logger.warn({ url, localFileErr }, 'Local file video failed, falling back to text');
              // Don't try other methods - local file should work or fail cleanly
            }
          }
          
          // Stream all videos (download buffer first, then send) - works with all hosts + enables file_id caching
          if (!url.startsWith('file://')) {
            try {
              const head = await fetch(url, { method: 'HEAD' });
              const lenStr = head.ok ? head.headers.get('content-length') : null;
              const maxBytes = 49 * 1024 * 1024; // ~49MB for bot upload
              const length = lenStr ? parseInt(lenStr, 10) : NaN;
              if (!Number.isNaN(length) && length > maxBytes) {
                // File too large - try next attachment (e.g. memeUri fallback)
                logger.warn({ url, sizeMB: (length / 1024 / 1024).toFixed(2) }, 'Video too large for Telegram upload (>49MB), trying next attachment');
                continue; // Try next attachment in the loop
              }
              const response = await fetch(url);
              if (response && response.ok) {
                const contentType = response.headers.get('content-type') || '';
                
                // Validate it's actually a video, not an error page
                if (!contentType.includes('video/') && !contentType.includes('application/octet-stream')) {
                  logger.warn({ url, contentType }, `❌ Invalid content-type for video (got ${contentType}), skipping stream`);
                  throw new Error(`Invalid content-type: ${contentType}`);
                }
                
                const ab = await response.arrayBuffer();
                await sendMediaAndCache(assetName, () =>
                  ctx.replyWithVideo(Input.fromBuffer(Buffer.from(ab)), {
                    caption: content.text || undefined,
                    supports_streaming: true,
                    ...CARD_DIMENSIONS,
                    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                    ...Markup.inlineKeyboard(telegramButtons),
                  })
                );
                sentPrimaryMedia = true;
                break;
              }
            } catch (videoStreamFirstErr) {
              logger.warn({ url, videoStreamFirstErr }, 'Video streaming-first failed, trying URL send');
            }
          }
          
          // Try direct URL send (only for HTTP/HTTPS URLs)
          if (!url.startsWith('file://')) {
            try {
              await sendMediaAndCache(assetName, () =>
                ctx.replyWithVideo(url, {
                  caption: content.text || undefined,
                  supports_streaming: true,
                  ...CARD_DIMENSIONS,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                })
              );
              sentPrimaryMedia = true;
              break;
            } catch (videoErr) {
              logger.warn({ videoErr, url }, 'Direct video URL failed, trying next attachment or text fallback');
              // Don't try document - just continue to next attachment or text fallback
            }
          }
        }
        
        if (isGif) {
          logger.info(`🎞️ Entering GIF handler for ${assetName}, url starts with: ${url.substring(0, 30)}`);
          // Handle local file:// URLs (from converted GIFs)
          if (url.startsWith('file://')) {
            try {
              const localPath = url.replace('file://', '');
              if (!fs.existsSync(localPath)) {
                throw new Error(`Local file not found: ${localPath}`);
              }
              
              const fileBuffer = fs.readFileSync(localPath);
              
              await sendMediaAndCache(assetName, () =>
                ctx.replyWithAnimation(Input.fromBuffer(fileBuffer), {
                  caption: content.text || undefined,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                })
              );
              sentPrimaryMedia = true;
              break;
            } catch (localFileErr) {
              logger.warn({ url, localFileErr }, 'Local file GIF failed, falling back to text');
              // Don't try other methods - local file should work or fail cleanly
            }
          }
          
          // Stream all GIFs (download buffer first, then send) - works with all hosts + enables file_id caching
          if (!url.startsWith('file://')) {
            logger.info(`📥 Attempting to stream GIF for ${assetName}`);
            try {
              const response = await fetch(url);
              if (response && response.ok) {
                const contentType = response.headers.get('content-type') || '';
                const ab = await response.arrayBuffer();
                const sizeMB = (ab.byteLength / 1024 / 1024).toFixed(2);
                
                logger.info(`📊 Downloaded from ${url.slice(0, 50)}... contentType="${contentType}", size=${sizeMB}MB`);
                
                // Validate it's actually an image, not an error page (check size too - error pages are tiny)
                if ((!contentType.includes('image/') && !contentType.includes('application/octet-stream')) || ab.byteLength < 1000) {
                  logger.warn({ url, contentType, sizeBytes: ab.byteLength }, `❌ Invalid GIF (wrong content-type or too small <1KB), skipping to next attachment`);
                  throw new Error(`Invalid content-type or size: ${contentType}, ${ab.byteLength} bytes`);
                }
                
                const result = await sendMediaAndCache(assetName, () =>
                  ctx.replyWithAnimation(Input.fromBuffer(Buffer.from(ab)), {
                    caption: content.text || undefined,
                    reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                    ...Markup.inlineKeyboard(telegramButtons),
                  })
                );
                // Debug: Log what Telegram actually returned
                if (result) {
                  logger.info(`📤 Telegram response for ${assetName}: animation=${!!result.animation}, document=${!!result.document}, video=${!!result.video}`);
                }
                sentPrimaryMedia = true;
                break;
              }
            } catch (streamErr) {
              logger.warn({ url, streamErr }, 'GIF streaming failed, trying direct URL send');
            }
          }
          
          // Fallback: try direct URL send if streaming failed
          if (!url.startsWith('file://')) {
            try {
              await sendMediaAndCache(assetName, () =>
                ctx.replyWithAnimation(url, {
                  caption: content.text || undefined,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                })
              );
              sentPrimaryMedia = true;
              break;
            } catch (gifErr) {
              logger.warn({ gifErr, url }, 'GIF direct URL also failed, falling back to text');
            }
          }
        }
        
        if (isImage) {
          // Stream all images (download buffer first, then send) - works with all hosts + enables file_id caching
          if (!url.startsWith('file://')) {
            try {
              const response = await fetch(url);
              if (response && response.ok) {
                const contentType = response.headers.get('content-type') || '';
                
                // Validate it's actually an image, not an error page
                if (!contentType.includes('image/') && !contentType.includes('application/octet-stream')) {
                  logger.warn({ url, contentType }, `❌ Invalid content-type for image (got ${contentType}), skipping stream`);
                  throw new Error(`Invalid content-type: ${contentType}`);
                }
                
                const ab = await response.arrayBuffer();
                const maxPhotoBytes = 10 * 1024 * 1024; // 10MB limit for photos
                
                // If too large, send as document instead of photo
                if (ab.byteLength > maxPhotoBytes) {
                  logger.info({ url, sizeMB: (ab.byteLength / 1024 / 1024).toFixed(2) }, 'Image too large for photo (>10MB), sending as document');
                  await sendMediaAndCache(assetName, () =>
                    ctx.replyWithDocument(Input.fromBuffer(Buffer.from(ab)), {
                      caption: content.text || undefined,
                      reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                      ...Markup.inlineKeyboard(telegramButtons),
                    })
                  );
                } else {
                  // Normal size - send as photo
                  await sendMediaAndCache(assetName, () =>
                    ctx.replyWithPhoto(Input.fromBuffer(Buffer.from(ab)), {
                      caption: content.text || undefined,
                      ...CARD_DIMENSIONS,
                      reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                      ...Markup.inlineKeyboard(telegramButtons),
                    })
                  );
                }
                sentPrimaryMedia = true;
                break;
              }
            } catch (streamErr) {
              logger.warn({ url, streamErr }, 'Image streaming failed, trying direct URL send');
            }
          }
          
          // Fallback: try direct URL send if streaming failed
          if (!url.startsWith('file://')) {
            try {
              await sendMediaAndCache(assetName, () =>
                ctx.replyWithPhoto(url, {
                  caption: content.text || undefined,
                  ...CARD_DIMENSIONS,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                })
              );
              sentPrimaryMedia = true;
              break;
            } catch (photoErr) {
              logger.warn({ photoErr, url }, 'Photo direct URL also failed, falling back to text');
            }
          }
        }
      }
      
      // If no media was sent, send text-only message with attachment links
      if (!sentPrimaryMedia) {
        let textMessage = content.text || '';
        
        // Add media links to message
        for (const attachment of content.attachments) {
          const url = attachment.url || '';
          const ct = (attachment.contentType || '').toLowerCase();
          const isVideo = /^video\//.test(ct) || /\.mp4(\?|$)/i.test(url);
          const isGif = ct === 'image/gif' || /\.gif(\?|$)/i.test(url);
          
          if (isVideo) {
            textMessage += `\n\n🎬 Video: ${url}`;
          } else if (isGif) {
            textMessage += `\n\n🎞️ Animation: ${url}`;
          }
        }
        
        if (textMessage) {
          await ctx.reply(
            textMessage,
            telegramButtons && telegramButtons.length > 0
              ? Markup.inlineKeyboard(telegramButtons)
              : undefined
          );
        }
      }
      
      // If we have buttons but no text, send them separately
      if (telegramButtons && telegramButtons.length > 0 && !content.text && sentPrimaryMedia) {
        // Telegram rejects completely empty messages (400: text must be non-empty),
        // so use a single space when sending button-only follow-ups.
        await ctx.reply(' ', Markup.inlineKeyboard(telegramButtons));
      }
      
      return [];
    } else {
      // Use space fallback for empty/minimal content (supports small LLM responses)
      const textToSend = content.text || ' ';
      const chunks = this.splitMessage(textToSend);
      const sentMessages: Message.TextMessage[] = [];

      const telegramButtons = convertToTelegramButtons(content.buttons ?? []);

      if (!ctx.chat) {
        logger.error('sendMessageInChunks: ctx.chat is undefined');
        return [];
      }
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

      for (let i = 0; i < chunks.length; i++) {
        // Use Markdown instead of MarkdownV2 for better link compatibility
        const chunk = chunks[i];
        if (!ctx.chat) {
          logger.error('sendMessageInChunks loop: ctx.chat is undefined');
          continue;
        }
        const sentMessage = (await ctx.telegram.sendMessage(ctx.chat.id, chunk, {
          reply_parameters:
            i === 0 && replyToMessageId ? { message_id: replyToMessageId } : undefined,
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...Markup.inlineKeyboard(telegramButtons),
        })) as Message.TextMessage;

        sentMessages.push(sentMessage);
      }

      return sentMessages;
    }
  }

  /**
   * Sends media to a chat using the Telegram API.
   *
   * @param {Context} ctx - The context object containing information about the current chat.
   * @param {string} mediaPath - The path to the media to be sent, either a URL or a local file path.
   * @param {MediaType} type - The type of media being sent (PHOTO, VIDEO, DOCUMENT, AUDIO, or ANIMATION).
   * @param {string} [caption] - Optional caption for the media being sent.
   *
   * @returns {Promise<void>} A Promise that resolves when the media is successfully sent.
   */
  async sendMedia(
    ctx: Context,
    mediaPath: string,
    type: MediaType,
    caption?: string
  ): Promise<void> {
    try {
      const isUrl = /^(http|https):\/\//.test(mediaPath);
      const sendFunctionMap: Record<MediaType, Function> = {
        [MediaType.PHOTO]: ctx.telegram.sendPhoto.bind(ctx.telegram),
        [MediaType.VIDEO]: ctx.telegram.sendVideo.bind(ctx.telegram),
        [MediaType.DOCUMENT]: ctx.telegram.sendDocument.bind(ctx.telegram),
        [MediaType.AUDIO]: ctx.telegram.sendAudio.bind(ctx.telegram),
        [MediaType.ANIMATION]: ctx.telegram.sendAnimation.bind(ctx.telegram),
      };

      const sendFunction = sendFunctionMap[type];

      if (!sendFunction) {
        throw new Error(`Unsupported media type: ${type}`);
      }

      if (!ctx.chat) {
        throw new Error('sendMedia: ctx.chat is undefined');
      }

      if (isUrl) {
        // Handle HTTP URLs
        await sendFunction(ctx.chat.id, mediaPath, { caption });
      } else {
        // Handle local file paths
        if (!fs.existsSync(mediaPath)) {
          throw new Error(`File not found at path: ${mediaPath}`);
        }

        const fileStream = fs.createReadStream(mediaPath);

        try {
          if (!ctx.chat) {
            throw new Error('sendMedia (file): ctx.chat is undefined');
          }
          await sendFunction(ctx.chat.id, { source: fileStream }, { caption });
        } finally {
          fileStream.destroy();
        }
      }

      logger.info(
        `${type.charAt(0).toUpperCase() + type.slice(1)} sent successfully: ${mediaPath}`
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { originalError: error },
        `Failed to send ${type}. Path: ${mediaPath}. Error: ${errorMessage}`
      );
      throw error;
    }
  }

  // Split message into smaller parts
  /**
   * Splits a given text into an array of strings based on the maximum message length.
   *
   * @param {string} text - The text to split into chunks.
   * @returns {string[]} An array of strings with each element representing a chunk of the original text.
   */
  private splitMessage(text: string): string[] {
    const chunks: string[] = [];
    if (!text) return chunks;
    let currentChunk = '';

    const lines = text.split('\n');
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
        currentChunk += (currentChunk ? '\n' : '') + line;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = line;
      }
    }

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }

  // Main handler for incoming messages
  /**
   * Handle incoming messages from Telegram and process them accordingly.
   * @param {Context} ctx - The context object containing information about the message.
   * @returns {Promise<void>}
   */
  public async handleMessage(ctx: Context): Promise<void> {
    try {
      // Type guard to ensure message exists
      if (!ctx.message || !ctx.from) return;

      const message = ctx.message as Message.TextMessage;
      // Convert IDs to UUIDs
      const entityId = createUniqueUuid(this.runtime, ctx.from.id.toString()) as UUID;

      const threadId =
        'is_topic_message' in message && message.is_topic_message
          ? message.message_thread_id?.toString()
          : undefined;

      // Add null check for ctx.chat
      if (!ctx.chat) {
        logger.error('handleMessage: ctx.chat is undefined');
        return;
      }
      // Generate room ID based on whether this is in a forum topic
      const telegramRoomid = threadId ? `${ctx.chat.id}-${threadId}` : ctx.chat.id.toString();
      const roomId = createUniqueUuid(this.runtime, telegramRoomid) as UUID;

      // Get message ID (unique to channel)
      const messageId = createUniqueUuid(this.runtime, message?.message_id?.toString());

      // Process message to extract content and attachments
      const { processedContent, attachments } = await this.processMessage(message);

      // Clean content and attachments to remove null bytes
      const cleanedContent = cleanText(processedContent);
      const cleanedAttachments = attachments.map((att) => ({
        ...att,
        text: cleanText(att.text),
        description: cleanText(att.description),
        title: cleanText(att.title),
      }));

      // Use cleaned content as message text
      const fullText = cleanedContent;
      if (!fullText && cleanedAttachments.length === 0) return;

      // Get chat type and determine channel type
      const chat = message.chat as Chat;
      const channelType = getChannelType(chat);

      const sourceId = createUniqueUuid(this.runtime, '' + chat.id);

      await this.runtime.ensureConnection({
        entityId,
        roomId,
        userName: ctx.from.username,
        name: ctx.from.first_name,
        source: 'telegram',
        channelId: telegramRoomid,
        serverId: undefined,
        type: channelType,
        worldId: createUniqueUuid(this.runtime, roomId) as UUID,
        worldName: telegramRoomid,
      });

      // Create the memory object
      const memory: Memory = {
        id: messageId,
        entityId,
        agentId: this.runtime.agentId,
        roomId,
        content: {
          text: fullText || ' ', // Use space if content is empty but has attachments
          attachments: cleanedAttachments,
          source: 'telegram',
          // url?
          channelType: channelType,
          inReplyTo:
            'reply_to_message' in message && message.reply_to_message
              ? createUniqueUuid(this.runtime, message.reply_to_message.message_id.toString())
              : undefined,
          mentionContext: {
            isMention:
              'text' in message && message.text
                ? message.text.includes(`@${this.bot.botInfo?.username || ''}`)
                : false,
            isReply:
              'reply_to_message' in message &&
              message.reply_to_message?.from?.id === this.bot.botInfo?.id,
            isThread: false,
          } as any,
        },
        metadata: {
          entityName: ctx.from.first_name,
          entityUserName: ctx.from.username,
          fromBot: ctx.from.is_bot,
          // include very technical/exact reference to this user for security reasons
          // don't remove or change this, spartan needs this
          fromId: chat.id,
          sourceId,
          // why message? all Memories contain content (which is basically a message)
          // what are the other types? see MemoryType
          type: 'message', // MemoryType.MESSAGE
          // scope: `shared`, `private`, or `room`
        },
        createdAt: message.date * 1000,
      };

      // Create callback for handling responses
      const callback: HandlerCallback = async (content: Content, _files?: string[]) => {
        try {
          // Skip ONLY if explicitly marked as reasoning (don't block low-token responses)
          // sendMessageInChunks will handle empty text with ' ' fallback
          if (content.text === undefined && !content.attachments?.length && !(content as TelegramContent).buttons?.length) {
            return [];
          }

          let sentMessages: boolean | Message.TextMessage[] = false;
          // channelType target === 'telegram'
          // Only use DM shortcut for text-only messages (no attachments)
          if (content?.channelType === 'DM' && !content.attachments?.length) {
            sentMessages = [];
            if (ctx.from) {
              // FIXME split on 4096 chars
              // Convert buttons for DM messages
              const telegramButtons = convertToTelegramButtons((content as TelegramContent).buttons ?? []);
              
              const textToSend = content.text || '';
              const res = await this.bot.telegram.sendMessage(
                ctx.from.id, 
                textToSend,
                {
                  parse_mode: 'Markdown',
                  link_preview_options: { is_disabled: true },
                  ...(telegramButtons.length > 0 ? Markup.inlineKeyboard(telegramButtons) : {}),
                }
              );
              sentMessages.push(res);
            }
          } else {
            sentMessages = await this.sendMessageInChunks(ctx, content, message.message_id);
          }

          if (!Array.isArray(sentMessages)) return [];

          const memories: Memory[] = [];
          for (let i = 0; i < sentMessages.length; i++) {
            const sentMessage = sentMessages[i];

            const responseMemory: Memory = {
              id: createUniqueUuid(this.runtime, sentMessage.message_id.toString()),
              entityId: this.runtime.agentId,
              agentId: this.runtime.agentId,
              roomId,
              content: {
                ...content,
                source: 'telegram',
                text: sentMessage.text,
                inReplyTo: messageId,
                channelType: channelType,
              },
              createdAt: sentMessage.date * 1000,
            };

            await this.runtime.createMemory(responseMemory, 'messages');
            memories.push(responseMemory);
          }

          return memories;
        } catch (error) {
          logger.error({ error }, 'Error in message callback');
          return [];
        }
      };

      // Emit MESSAGE_RECEIVED so custom plugins can intercept
      try {
        await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
          runtime: this.runtime,
          message: memory,
          callback,
          source: 'telegram',
          ctx,
        });
      } catch (e) {
        // Plugin error handling
      }

      // Skip bootstrap/messageService if a plugin already handled it
      if ((memory?.metadata as any)?.__handledByCustom) {
        return;
      }

      // Skip bootstrap if this is a reply to someone OTHER than the bot
      if ('reply_to_message' in message && message.reply_to_message) {
        const replyToUserId = message.reply_to_message.from?.id;
        const botUserId = this.bot.botInfo?.id;
        if (replyToUserId && botUserId && replyToUserId !== botUserId) {
          // This is a reply to another user, not the bot - skip bootstrap
          logger.debug(
            `Skipping bootstrap for reply to user ${replyToUserId} (not bot ${botUserId})`
          );
          return;
        }
      }

      if (!this.runtime.messageService) {
        logger.error('Message service is not available');
        throw new Error(
          'Message service is not initialized. Ensure the message service is properly configured.'
        );
      }

      // Build mentionContext so bootstrap knows this is a reply/mention
      const isMention = message.text?.includes(`@${this.bot.botInfo?.username}`);
      const isReplyToBot = message.reply_to_message?.from?.id === this.bot.botInfo?.id;
      const mentionContext = (isMention || isReplyToBot) ? {
        isMention: !!isMention,
        isReply: !!isReplyToBot,
        isThread: false,
      } : undefined;

      await this.runtime.messageService.handleMessage(this.runtime, memory, callback, mentionContext as any);

      // Also emit the platform-specific event
      this.runtime.emitEvent(TelegramEventTypes.MESSAGE_RECEIVED, {
        runtime: this.runtime,
        message: memory,
        callback,
        source: 'telegram',
        ctx,
        originalMessage: message,
      } as TelegramMessageReceivedPayload);
    } catch (error) {
      logger.error(
        {
          error,
          chatId: ctx.chat?.id,
          messageId: ctx.message?.message_id,
          from: ctx.from?.username || ctx.from?.id,
        },
        'Error handling Telegram message - bot continuing'
      );
      // Don't re-throw - log and continue to keep bot alive
    }
  }

  /**
   * Handles the reaction event triggered by a user reacting to a message.
   * @param {NarrowedContext<Context<Update>, Update.MessageReactionUpdate>} ctx The context of the message reaction update
   * @returns {Promise<void>} A Promise that resolves when the reaction handling is complete
   */
  public async handleReaction(
    ctx: NarrowedContext<Context<Update>, Update.MessageReactionUpdate>
  ): Promise<void> {
    // Ensure we have the necessary data
    if (!ctx.update.message_reaction || !ctx.from) return;

    const reaction = ctx.update.message_reaction;
    const reactedToMessageId = reaction.message_id;

    const originalMessagePlaceholder: Partial<Message> = {
      message_id: reactedToMessageId,
      chat: reaction.chat,
      from: ctx.from,
      date: Math.floor(Date.now() / 1000),
    };

    const reactionType = reaction.new_reaction[0].type;
    const reactionEmoji = (reaction.new_reaction[0] as ReactionType).type; // Assuming ReactionType has 'type' for emoji

    try {
      const entityId = createUniqueUuid(this.runtime, ctx.from.id.toString()) as UUID;
      const roomId = createUniqueUuid(this.runtime, ctx.chat.id.toString());

      const reactionId = createUniqueUuid(
        this.runtime,
        `${reaction.message_id}-${ctx.from.id}-${Date.now()}`
      );

      // Create reaction memory
      const memory: Memory = {
        id: reactionId,
        entityId,
        agentId: this.runtime.agentId,
        roomId,
        content: {
          channelType: getChannelType(reaction.chat as Chat),
          text: `Reacted with: ${reactionType === 'emoji' ? reactionEmoji : reactionType}`,
          source: 'telegram',
          inReplyTo: createUniqueUuid(this.runtime, reaction.message_id.toString()),
        },
        createdAt: Date.now(),
      };

      // Create callback for handling reaction responses
      const callback: HandlerCallback = async (content: Content) => {
        try {
          // Add null check for content.text
          const replyText = content.text ?? '';
          const sentMessage = await ctx.reply(replyText);
          const responseMemory: Memory = {
            id: createUniqueUuid(this.runtime, sentMessage.message_id.toString()),
            entityId: this.runtime.agentId,
            agentId: this.runtime.agentId,
            roomId,
            content: {
              ...content,
              inReplyTo: reactionId,
            },
            createdAt: sentMessage.date * 1000,
          };
          return [responseMemory];
        } catch (error) {
          logger.error({ error }, 'Error in reaction callback');
          return [];
        }
      };

      // Let the bootstrap plugin handle the reaction
      this.runtime.emitEvent(EventType.REACTION_RECEIVED, {
        runtime: this.runtime,
        message: memory,
        callback,
        source: 'telegram',
        ctx,
        originalMessage: originalMessagePlaceholder as Message, // Cast needed due to placeholder
        reactionString: reactionType === 'emoji' ? reactionEmoji : reactionType,
        originalReaction: reaction.new_reaction[0] as ReactionType,
      } as TelegramReactionReceivedPayload);

      // Also emit the platform-specific event
      this.runtime.emitEvent(TelegramEventTypes.REACTION_RECEIVED, {
        runtime: this.runtime,
        message: memory,
        callback,
        source: 'telegram',
        ctx,
        originalMessage: originalMessagePlaceholder as Message, // Cast needed due to placeholder
        reactionString: reactionType === 'emoji' ? reactionEmoji : reactionType,
        originalReaction: reaction.new_reaction[0] as ReactionType,
      } as TelegramReactionReceivedPayload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: errorMessage,
          originalError: error,
        },
        'Error handling reaction'
      );
    }
  }

  /**
   * Handles callback query from inline keyboard buttons
   * @param {Context} ctx - The Telegram context
   * @returns {Promise<void>}
   */
  public async handleCallbackQuery(ctx: Context): Promise<void> {
    try {
      // Type guard to check if this is a callback query
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
        return;
      }

      const callbackData = ctx.callbackQuery.data;
      
      // Check if this is a carousel navigation callback (starts with "fc:")
      if (callbackData.startsWith('fc:')) {
        
        // Import the carousel handler dynamically to avoid circular dependencies
        // @ts-ignore - Dynamic import from parent project
        const { handleCarouselNavigation } = await import('../../../src/actions/fakeRaresCarousel.js');
        
        const result = await handleCarouselNavigation(callbackData);
        
        if (!result) {
          // Invalid callback or noop - just answer the callback query
          await ctx.answerCbQuery();
          return;
        }
        
        // Edit the message with the new card
        const { cardMessage, card, buttons } = result;
        let { mediaUrl, mediaExtension } = result;
        
        // Check cache first - skip expensive conversion if we have a cached file_id
        const cache = await getFileIdCache();
        let cachedFileId = cache.getTelegramFileId(card.asset);
        
        // Skip document-type file_ids in carousel - bot may not have document permissions
        // Document file_ids start with BAAC or BQAC
        if (cachedFileId && (cachedFileId.startsWith('BAAC') || cachedFileId.startsWith('BQAC'))) {
          logger.info(`⚠️ Skipping document-type file_id for ${card.asset} in carousel (permission issue), will convert instead`);
          cachedFileId = null; // Force re-upload with conversion
        }
        
        // Apply GIF conversion if needed (same logic as CardDisplayService) - only if no cache
        if (!cachedFileId && mediaExtension === 'gif') {
          // @ts-ignore - Dynamic import
          const { checkAndConvertGif } = await import('../../../src/utils/gifConversionHelper.js');
          const conversionCheck = await checkAndConvertGif(mediaUrl, mediaExtension);
          if (conversionCheck.shouldConvert && conversionCheck.convertedUrl) {
            mediaUrl = conversionCheck.convertedUrl;
            mediaExtension = 'mp4';
          }
        }
        
        // Build attachment for the card media
        const attachment = {
          url: mediaUrl,
          title: card.asset,
          source: 'fake-rares',
          contentType: mediaExtension === 'mp4' ? 'video/mp4' 
            : mediaExtension === 'gif' ? 'image/gif' 
            : 'image/jpeg',
        };
        
        // Answer callback query FIRST to prevent timeout (Telegram has ~5 sec limit)
        await ctx.answerCbQuery();
        
        // Delete the old message
        try {
          if (ctx.callbackQuery.message) {
            await ctx.telegram.deleteMessage(
              ctx.callbackQuery.message.chat.id,
              ctx.callbackQuery.message.message_id
            );
          }
        } catch {
          // Ignore delete errors
        }
        
        // Send new message with media using sendMessageInChunks
        try {
          const content: TelegramContent = {
            text: cardMessage,
            attachments: [{
              ...attachment,
              id: createUniqueUuid(this.runtime, `${card.asset}-${Date.now()}`),
            } as any],
            buttons: buttons as any,
          };
          
          await this.sendMessageInChunks(ctx, content);
          logger.info(`[MessageManager] Carousel navigation successful: ${result.artistName} [${result.newIndex + 1}/${result.totalCards}]`);
        } catch (error) {
          logger.error({ error }, '[MessageManager] Error sending carousel message');
        }
      } else {
        // Unknown callback query - just acknowledge it
        await ctx.answerCbQuery();
      }
    } catch (error) {
      logger.error({ error }, '[MessageManager] Error handling callback query');
      
      // Try to answer the callback query to avoid UI issues
      try {
        await ctx.answerCbQuery('❌ An error occurred');
      } catch {
        // Ignore if we can't answer
      }
    }
  }

  /**
   * Sends a message to a Telegram chat and emits appropriate events
   * @param {number | string} chatId - The Telegram chat ID to send the message to
   * @param {Content} content - The content to send
   * @param {number} [replyToMessageId] - Optional message ID to reply to
   * @returns {Promise<Message.TextMessage[]>} The sent messages
   */
  public async sendMessage(
    chatId: number | string,
    content: Content,
    replyToMessageId?: number
  ): Promise<Message.TextMessage[]> {
    try {
      // Create a context-like object for sending
      const ctx = {
        chat: { id: chatId },
        telegram: this.bot.telegram,
      };

      const sentMessages = await this.sendMessageInChunks(
        ctx as Context,
        content,
        replyToMessageId
      );

      if (!sentMessages?.length) return [];

      // Create group ID
      const roomId = createUniqueUuid(this.runtime, chatId.toString());

      // Create memories for the sent messages
      const memories: Memory[] = [];
      for (const sentMessage of sentMessages) {
        const memory: Memory = {
          id: createUniqueUuid(this.runtime, sentMessage.message_id.toString()),
          entityId: this.runtime.agentId,
          agentId: this.runtime.agentId,
          roomId,
          content: {
            ...content,
            text: sentMessage.text,
            source: 'telegram',
            channelType: getChannelType({
              id: typeof chatId === 'string' ? Number.parseInt(chatId, 10) : chatId,
              type: 'private', // Default to private, will be overridden if in context
            } as Chat),
          },
          createdAt: sentMessage.date * 1000,
        };

        await this.runtime.createMemory(memory, 'messages');
        memories.push(memory);
      }

      // Emit both generic and platform-specific message sent events
      this.runtime.emitEvent(EventType.MESSAGE_SENT, {
        runtime: this.runtime,
        message: {
          content: content,
        },
        roomId,
        source: 'telegram',
      });

      // Also emit platform-specific event
      this.runtime.emitEvent(TelegramEventTypes.MESSAGE_SENT, {
        originalMessages: sentMessages,
        chatId,
      } as TelegramMessageSentPayload);

      return sentMessages;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          error: errorMessage,
          originalError: error,
        },
        'Error sending message to Telegram'
      );
      return [];
    }
  }
}

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
import { Markup } from 'telegraf';
import {
  TelegramContent,
  TelegramEventTypes,
  type TelegramMessageReceivedPayload,
  type TelegramMessageSentPayload,
  type TelegramReactionReceivedPayload,
} from './types';
import { convertToTelegramButtons, convertMarkdownToTelegram } from './utils';
import fs from 'fs';

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

    logger.info(
      `━━━━━━━━━━ Message processed ━━━━━━━━━━ Content: ${processedContent ? 'yes' : 'no'}, Attachments: ${attachments.length}`
    );
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
        const isVideo = /^video\//.test(ct) || /\.mp4(\?|$)/i.test(url);
        const isGif = ct === 'image/gif' || /\.gif(\?|$)/i.test(url);
        const isImage = /^image\//.test(ct) || /\.(png|jpe?g|webp)(\?|$)/i.test(url);
        
        // Route to Telegram media methods for inline preview/player
        if (isVideo) {
          // Attempt streaming first for Arweave/S3 hosts
          let streamingFirst = false;
          try {
            const host = new URL(url).hostname;
            streamingFirst = /arweave\.net$/i.test(host) || /amazonaws\.com$/i.test(host) || /tokenscan\.io$/i.test(host);
          } catch {}
          
          if (streamingFirst) {
            try {
              const head = await fetch(url, { method: 'HEAD' });
              const lenStr = head.ok ? head.headers.get('content-length') : null;
              const maxBytes = 49 * 1024 * 1024; // ~49MB for bot upload
              const length = lenStr ? parseInt(lenStr, 10) : NaN;
              if (!Number.isNaN(length) && length > maxBytes) {
                throw new Error('FileTooLargeForBotUpload');
              }
              const response = await fetch(url);
              if (response && response.ok) {
                const ab = await response.arrayBuffer();
                const filename = (() => {
                  try {
                    const u = new URL(url);
                    const last = u.pathname.split('/').pop() || '';
                    return last && last.length <= 100 ? last : 'video.mp4';
                  } catch (_) {
                    return 'video.mp4';
                  }
                })();
                await ctx.replyWithVideo({ source: Buffer.from(ab), filename }, {
                  caption: content.text || undefined,
                  supports_streaming: true,
                  reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                  ...Markup.inlineKeyboard(telegramButtons),
                });
                sentPrimaryMedia = true;
                break;
              }
            } catch (videoStreamFirstErr) {
              logger.warn({ url, videoStreamFirstErr }, 'Video streaming-first failed, trying URL send');
            }
          }
          
          try {
            await ctx.replyWithVideo(url, {
              caption: content.text || undefined,
              supports_streaming: true,
              reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
              ...Markup.inlineKeyboard(telegramButtons),
            });
            sentPrimaryMedia = true;
            break;
          } catch (videoErr) {
            // Fallback: send as document if video fails (common with Arweave URLs)
            try {
              await ctx.replyWithDocument(url, {
                caption: content.text || undefined,
                reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
                ...Markup.inlineKeyboard(telegramButtons),
              });
              sentPrimaryMedia = true;
              break;
            } catch (docErr) {
              logger.warn({ videoErr, docErr, url }, 'Video attachment failed, falling back to text');
            }
          }
        }
        
        if (isGif) {
          try {
            await ctx.replyWithAnimation(url, {
              caption: content.text || undefined,
              reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
              ...Markup.inlineKeyboard(telegramButtons),
            });
            sentPrimaryMedia = true;
            break;
          } catch (gifErr) {
            logger.warn({ gifErr, url }, 'GIF attachment failed, falling back to text');
          }
        }
        
        if (isImage) {
          try {
            await ctx.replyWithPhoto(url, {
              caption: content.text || undefined,
              reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
              ...Markup.inlineKeyboard(telegramButtons),
            });
            sentPrimaryMedia = true;
            break;
          } catch (photoErr) {
            logger.warn({ photoErr, url }, 'Photo attachment failed, falling back to text');
          }
        }
        
        // Fallback: send as document for unsupported types
        try {
          await ctx.replyWithDocument(url, {
            caption: content.text || undefined,
            reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
            ...Markup.inlineKeyboard(telegramButtons),
          });
          sentPrimaryMedia = true;
          break;
        } catch (docErr) {
          logger.warn({ docErr, url }, 'Document attachment failed, falling back to text');
        }
      }
      
      // If we have buttons but no text, send them separately
      if (telegramButtons && telegramButtons.length > 0 && !content.text) {
        await ctx.reply('', Markup.inlineKeyboard(telegramButtons));
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
        const chunk = convertMarkdownToTelegram(chunks[i]);
        if (!ctx.chat) {
          logger.error('sendMessageInChunks loop: ctx.chat is undefined');
          continue;
        }
        const sentMessage = (await ctx.telegram.sendMessage(ctx.chat.id, chunk, {
          reply_parameters:
            i === 0 && replyToMessageId ? { message_id: replyToMessageId } : undefined,
          parse_mode: 'MarkdownV2',
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
          // If response is from reasoning do not send it.
          if (!content.text) return [];

          let sentMessages: boolean | Message.TextMessage[] = false;
          // channelType target === 'telegram'
          if (content?.channelType === 'DM') {
            sentMessages = [];
            if (ctx.from) {
              // FIXME split on 4096 chars
              const res = await this.bot.telegram.sendMessage(ctx.from.id, content.text);
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

/**
 * PEPEDAWN, out loud.
 *
 * Sometimes it talks instead of typing: the reply is written by the chat
 * model exactly as before - that is where the personality lives - and then
 * spoken, through OpenAI's text-to-speech, as a Telegram voice bubble. The
 * voice is meant to be odd: a raven that has read too much Counterparty
 * history, raspy, slow, deadpan, with a croak in it. VOICE_STYLE and
 * VOICE_NAME change it without a deploy.
 *
 * When it speaks: a conversational reply, short enough to listen to, at a
 * rate (VOICE_RATE, default one in four), not twice in a room inside the
 * cooldown, and never for commands, cards, lists or links. "say it",
 * "out loud", "voice" in the ask forces speech; "write it", "in text"
 * forces text. The spoken text is still recorded as the bot's turn, so the
 * conversation memory and the day log read the same either way.
 *
 * Anything that fails - no key, a refused synthesis, Telegram rejecting
 * the file - falls back to typing. Nothing is lost by trying.
 */

import { logger } from '@elizaos/core';

export const DEFAULT_VOICE = 'ballad';
// Sample E of five, chosen by the owner on 25 September 2026.
export const DEFAULT_STYLE =
  'You are PEPEDAWN, a swamp frog who learned to talk from crypto Telegram, but drunk at 3am: slurred edges, wandering pitch, ' +
  'a burp-like croak now and then, sudden loud confidence, then trailing off. Croaky, wet and nasal. Deadpan glee about nonsense. ' +
  'Not noble, not smooth, not warm, not an assistant. A frog with opinions, slightly too close to the microphone.';
export const DEFAULT_RATE = 0.25;
export const DEFAULT_MAX_CHARS = 420;
export const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

const ASKS_VOICE = /\b(say it|out loud|say that|in (your )?voice|voice (note|message|it)|speak|talk to me|read it)\b/i;
const ASKS_TEXT = /\b(write it|in text|type it|no voice|text only|don'?t (speak|talk))\b/i;
const NOT_SPEAKABLE = /https?:\/\/|\n\s*[-•*]\s|\n.*\n.*\n|`|\[CARD:|\bKEK-\d/;

export interface VoiceConfig {
  enabled: boolean;
  rate: number;
  maxChars: number;
  cooldownMs: number;
  voice: string;
  style: string;
}

export function voiceConfig(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    enabled: env.VOICE_ENABLED !== 'false' && !!env.OPENAI_API_KEY,
    rate: Math.max(0, Math.min(1, num(env.VOICE_RATE, DEFAULT_RATE))),
    maxChars: num(env.VOICE_MAX_CHARS, DEFAULT_MAX_CHARS),
    cooldownMs: num(env.VOICE_COOLDOWN_MIN, DEFAULT_COOLDOWN_MS / 60_000) * 60_000,
    voice: env.VOICE_NAME || DEFAULT_VOICE,
    style: env.VOICE_STYLE || DEFAULT_STYLE,
  };
}

const lastSpokenAt = new Map<string, number>();
export function resetVoiceCooldowns(): void {
  lastSpokenAt.clear();
}

/**
 * Talk or type? The ask wins when it says; otherwise the reply must be
 * speakable and short, the room must not have heard it recently, and the
 * rate decides. Records the grant.
 */
export function shouldSpeak(
  ask: string,
  reply: string,
  roomId: string,
  config: VoiceConfig,
  now = Date.now(),
  rng: () => number = Math.random,
): boolean {
  if (!config.enabled) return false;
  if (ASKS_TEXT.test(ask)) return false;
  const forced = ASKS_VOICE.test(ask);
  if (!reply.trim()) return false;
  if (!forced) {
    if (reply.length > config.maxChars) return false;
    if (NOT_SPEAKABLE.test(reply)) return false;
    const last = lastSpokenAt.get(roomId);
    if (last !== undefined && now - last < config.cooldownMs) return false;
    if (rng() >= config.rate) return false;
  } else if (reply.length > config.maxChars * 3) {
    return false;
  }
  lastSpokenAt.set(roomId, now);
  return true;
}

/** Strip what does not read aloud: markdown marks, emoji-only runs, a trailing card tag. */
export function speakable(text: string): string {
  return text
    .replace(/[*_`~]+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Opus audio of the text, from OpenAI. Null when it cannot be had. */
export async function synthesizeVoice(text: string, config: VoiceConfig): Promise<{ audio: Uint8Array; chars: number } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const input = speakable(text);
  if (!input) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.VOICE_MODEL || 'gpt-4o-mini-tts',
        voice: config.voice,
        input,
        instructions: config.style,
        response_format: 'opus',
      }),
    });
    if (!res.ok) {
      logger.warn(`[Voice] synthesis refused: ${res.status} ${(await res.text()).slice(0, 160)}`);
      return null;
    }
    return { audio: new Uint8Array(await res.arrayBuffer()), chars: input.length };
  } catch (error) {
    logger.warn({ error }, '[Voice] synthesis failed');
    return null;
  }
}

/** A voice bubble in the chat, optionally as a reply. The Telegram message, or null. */
export async function sendVoiceMessage(
  token: string,
  chatId: string,
  audio: Uint8Array,
  replyToMessageId?: number,
): Promise<any | null> {
  if (!token || !chatId) return null;
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    const bytes = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
    form.append('voice', new Blob([bytes], { type: 'audio/ogg' }), 'pepedawn.ogg');
    if (replyToMessageId) form.append('reply_parameters', JSON.stringify({ message_id: replyToMessageId, allow_sending_without_reply: true }));
    const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, { method: 'POST', body: form });
    const body: any = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      logger.warn(`[Voice] sendVoice ${chatId}: ${res.status} ${JSON.stringify(body?.description ?? '').slice(0, 160)}`);
      return null;
    }
    return body.result;
  } catch (error) {
    logger.warn({ error }, '[Voice] sendVoice failed');
    return null;
  }
}

/** gpt-4o-mini-tts is billed per input character: $0.60 per million. */
export function voiceCostUsd(chars: number): number {
  return (chars / 1_000_000) * 0.6;
}

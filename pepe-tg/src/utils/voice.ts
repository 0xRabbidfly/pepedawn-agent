/**
 * PEPEDAWN, out loud.
 *
 * Sometimes it talks instead of typing: the reply is written by the chat
 * model exactly as before - that is where the personality lives - and then
 * spoken, through OpenAI's text-to-speech, as a Telegram voice bubble. The
 * voice is meant to be odd: a swamp frog that learned to talk from crypto
 * Telegram, drunk at 3am - sample E of the takes the owner heard. VOICE_STYLE
 * and VOICE_NAME change it without a deploy; it ships unannounced.
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

/**
 * The words, slurred, for the synthesizer to read as written. The style
 * line alone barely moves the model - "drunk" comes out as a clean read -
 * so the drunkenness goes into the text: stretched vowels here and there,
 * an s that has become sh, a hic. Light, and deterministic per sentence
 * so the same line slurs the same way. Off unless VOICE_SLUR=true.
 */
export function slur(text: string, seed = 7): string {
  let n = seed;
  const rnd = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const words = text.split(' ');
  const out = words.map((w, i) => {
    let r = w;
    if (r.length > 3 && rnd() < 0.22) r = r.replace(/([aeiou])/i, (m) => m + m.toLowerCase());
    if (rnd() < 0.18) r = r.replace(/s(?=[aeiou])/i, 'sh');
    if (i > 0 && i % 9 === 0 && rnd() < 0.5) r = r + '...';
    return r;
  });
  const joined = out.join(' ');
  return joined.replace(/\. /g, (m) => (rnd() < 0.3 ? '... hic. ' : m));
}

/**
 * Warp the audio with ffmpeg: a little lower and slower, with a wobble in
 * pitch and volume, and a touch of echo - the voice of something that is
 * not entirely upright. VOICE_WARP holds the filter chain ("default" for
 * this one); unset means the clean audio, which is what ships.
 * When ffmpeg is missing or fails, the clean audio goes out instead.
 */
export const DEFAULT_WARP =
  'asetrate=48000*0.9,aresample=48000,atempo=0.94,vibrato=f=3.5:d=0.35,tremolo=f=5:d=0.25,aecho=0.8:0.6:40:0.25';

export async function warpVoice(audio: Uint8Array, chain: string): Promise<Uint8Array> {
  if (!chain) return audio;
  try {
    const { spawn } = await import('child_process');
    return await new Promise<Uint8Array>((resolve) => {
      const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-af', chain, '-c:a', 'libopus', '-b:a', '48k', '-f', 'ogg', 'pipe:1'], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      p.stdout.on('data', (c: Buffer) => chunks.push(c));
      p.on('error', () => resolve(audio));
      p.on('close', (code) => resolve(code === 0 && chunks.length ? new Uint8Array(Buffer.concat(chunks)) : audio));
      p.stdin.end(Buffer.from(audio));
    });
  } catch {
    return audio;
  }
}

/** Opus audio of the text, from OpenAI, warped. Null when it cannot be had. */
export async function synthesizeVoice(text: string, config: VoiceConfig): Promise<{ audio: Uint8Array; chars: number } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const clean = speakable(text);
  // Both off by default: the owner chose the plain read (sample E) over the
  // slurred and warped takes. VOICE_SLUR=true and VOICE_WARP=<chain> turn them on.
  const input = process.env.VOICE_SLUR === 'true' ? slur(clean) : clean;
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
    const raw = new Uint8Array(await res.arrayBuffer());
    const warp = process.env.VOICE_WARP === 'default' ? DEFAULT_WARP : (process.env.VOICE_WARP || '');
    return { audio: await warpVoice(raw, warp), chars: input.length };
  } catch (error) {
    logger.warn({ error }, '[Voice] synthesis failed');
    return null;
  }
}

/** Opus to MP3 through ffmpeg, for chats that allow audio files but not voice notes. Null when it cannot. */
export async function toMp3(audio: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { spawn } = await import('child_process');
    return await new Promise<Uint8Array | null>((resolve) => {
      const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      p.stdout.on('data', (c: Buffer) => chunks.push(c));
      p.on('error', () => resolve(null));
      p.on('close', (code) => resolve(code === 0 && chunks.length ? new Uint8Array(Buffer.concat(chunks)) : null));
      p.stdin.end(Buffer.from(audio));
    });
  } catch {
    return null;
  }
}

/** Rooms known to refuse voice notes, so the audio-file form goes first there next time. */
const voiceNotesRefused = new Set<string>();

/**
 * A voice bubble in the chat, optionally as a reply. Where the group does
 * not let members send voice notes - the FAKERARE room does not, as of
 * 25 September 2026, though it allows audio files - the same audio goes out
 * as an audio file instead, titled. The Telegram message, or null.
 */
export async function sendVoiceMessage(
  token: string,
  chatId: string,
  audio: Uint8Array,
  replyToMessageId?: number,
  title = 'PEPEDAWN',
): Promise<any | null> {
  if (!token || !chatId) return null;
  const reply = replyToMessageId ? JSON.stringify({ message_id: replyToMessageId, allow_sending_without_reply: true }) : null;
  const post = async (method: 'sendVoice' | 'sendAudio', bytes: Uint8Array, mime: string, name: string): Promise<{ ok: boolean; result?: any; description?: string }> => {
    try {
      const form = new FormData();
      form.append('chat_id', chatId);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      form.append(method === 'sendVoice' ? 'voice' : 'audio', new Blob([buf], { type: mime }), name);
      if (method === 'sendAudio') { form.append('title', title); form.append('performer', 'PEPEDAWN'); }
      if (reply) form.append('reply_parameters', reply);
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', body: form });
      const body: any = await res.json().catch(() => null);
      return { ok: !!(res.ok && body?.ok), result: body?.result, description: body?.description };
    } catch (error) {
      return { ok: false, description: error instanceof Error ? error.message : String(error) };
    }
  };

  if (!voiceNotesRefused.has(chatId)) {
    const asVoice = await post('sendVoice', audio, 'audio/ogg', 'pepedawn.ogg');
    if (asVoice.ok) return asVoice.result;
    if (!/voice notes/i.test(asVoice.description ?? '')) {
      logger.warn(`[Voice] sendVoice ${chatId}: ${asVoice.description?.slice(0, 160)}`);
      return null;
    }
    voiceNotesRefused.add(chatId);
    logger.info(`[Voice] ${chatId} does not allow voice notes; sending as an audio file from now on`);
  }
  const mp3 = await toMp3(audio);
  if (!mp3) return null;
  const asAudio = await post('sendAudio', mp3, 'audio/mpeg', 'pepedawn.mp3');
  if (!asAudio.ok) logger.warn(`[Voice] sendAudio ${chatId}: ${asAudio.description?.slice(0, 160)}`);
  return asAudio.ok ? asAudio.result : null;
}

/** gpt-4o-mini-tts is billed per input character: $0.60 per million. */
export function voiceCostUsd(chars: number): number {
  return (chars / 1_000_000) * 0.6;
}

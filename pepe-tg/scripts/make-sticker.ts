#!/usr/bin/env bun
/**
 * Turn an image or a short animation into a Telegram sticker, and optionally
 * put it in a pack the bot owns.
 *
 *   bun scripts/make-sticker.ts art.webp                       # convert only, report the file
 *   bun scripts/make-sticker.ts art.webp --static --frame 20   # one frame, WEBP
 *   bun scripts/make-sticker.ts art.webp --start 15 --seconds 3
 *   bun scripts/make-sticker.ts out.webm --pack cakerare --title "CAKERARE" --owner 1013723568 --yes
 *
 * Conversion is the fiddly part. Telegram rejects an off-spec file with
 * STICKER_PNG_DIMENSIONS or a bare BAD_REQUEST and never says which rule
 * broke, so both paths here aim at the strict reading of core.telegram.org/
 * stickers: a static sticker is WEBP with its long side exactly 512 and under
 * 512KB; a video sticker is VP9-in-WEBM, at most 3s and 30fps, no audio, under
 * 256KB, long side 512. --square pads to exactly 512x512 on transparency for
 * the readings that demand it. Alpha survives both paths.
 *
 * ffmpeg cannot decode animated WEBP (it aborts on "Invalid data found"), so
 * frames are cut with sharp, which composites disposal and blending correctly,
 * and handed to ffmpeg as a PNG sequence.
 *
 * Nothing reaches Telegram without --pack AND --yes. The script prints which
 * bot it authenticated as before any write, because a pack short name is
 * permanent and ends in that bot's username: a pack made by the test token is
 * called ..._by_pepedawntest_bot forever.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import { getSharp } from '../src/utils/recapRender';

const MAX_STATIC_BYTES = 512 * 1024;
const MAX_VIDEO_BYTES = 256 * 1024;
const MAX_VIDEO_SECONDS = 3;
const MAX_VIDEO_FPS = 30;
const SIDE = 512;

const VALUED = ['--frame', '--start', '--seconds', '--out', '--pack', '--title', '--emoji', '--owner'];

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};

// The first bare word that is not some flag's value.
const taken = new Set(args.flatMap((a, i) => (VALUED.includes(a) ? [i + 1] : [])));
const input = args.find((a, i) => !a.startsWith('--') && !taken.has(i));
if (!input) {
  console.error('Usage: bun scripts/make-sticker.ts <file|url> [--static|--video] [--frame n] [--start n] [--seconds s] [--square] [--out path] [--pack name --title "..." --owner id --yes]');
  process.exit(1);
}

/** The source bytes, from disk or over the wire. */
async function load(src: string): Promise<Buffer> {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!existsSync(src)) throw new Error(`no such file: ${src}`);
  return readFileSync(src);
}

/**
 * Resize to the sticker box. fit:'inside' puts the long side on exactly 512;
 * 'contain' pads the rest out to a transparent square.
 */
function fitToBox(img: any, square: boolean) {
  return img.resize({
    width: SIDE,
    height: SIDE,
    fit: square ? 'contain' : 'inside',
    withoutEnlargement: false,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
}

/** One frame, composited, as a PNG buffer at sticker size. */
async function frameAt(bytes: Buffer, page: number, animated: boolean, square: boolean): Promise<Buffer> {
  const sharp = await getSharp();
  const opts = animated ? { animated: true, page, pages: 1 } : {};
  return fitToBox(sharp(bytes, opts as any), square).png().toBuffer();
}

/** WEBP under the static ceiling, quality stepped down only as far as it must be. */
async function staticSticker(png: Buffer): Promise<Buffer> {
  const sharp = await getSharp();
  for (const quality of [95, 90, 85, 80, 70, 60, 50, 40, 30]) {
    const out = await sharp(png).webp({ quality, effort: 6 }).toBuffer();
    if (out.length <= MAX_STATIC_BYTES) return out;
  }
  throw new Error('cannot get this frame under 512KB as WEBP');
}

/**
 * VP9 WEBM from a PNG sequence. -auto-alt-ref 0 is not optional: libvpx-vp9
 * drops the alpha plane when it builds alt-ref frames, and the sticker comes
 * back with a black box behind it.
 */
function encodeWebm(dir: string, fps: number, out: string): Buffer {
  for (const crf of [28, 34, 40, 46, 52, 58]) {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-framerate', String(fps),
      '-i', join(dir, 'f_%05d.png'),
      '-c:v', 'libvpx-vp9',
      '-pix_fmt', 'yuva420p',
      '-auto-alt-ref', '0',
      '-b:v', '0', '-crf', String(crf),
      '-row-mt', '1', '-deadline', 'good',
      '-an',
      out,
    ]);
    if (statSync(out).size <= MAX_VIDEO_BYTES) return readFileSync(out);
  }
  throw new Error('cannot get this clip under 256KB; shorten it with --seconds or --start');
}

async function main() {
  const bytes = await load(input);
  const outDir = process.env.STICKER_OUT_DIR || join(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  const srcPath = input.split('?')[0];
  const stem = basename(srcPath, extname(srcPath)) || 'sticker';

  // WEBM and TGS are already sticker formats and sharp cannot open either, so
  // they go to Telegram untouched. This is the path for adding a clip that an
  // earlier run produced.
  const ext = extname(srcPath).toLowerCase();
  if (ext === '.webm' || ext === '.tgs') {
    const file = value('--out') && value('--out') !== input ? value('--out')! : input;
    if (file !== input) writeFileSync(file, bytes);
    const format = ext === '.tgs' ? 'animated' : 'video';
    console.log(`${format} sticker (as is): ${file} · ${(bytes.length / 1024).toFixed(0)}KB`);
    await publish(file, format as 'video' | 'animated');
    return;
  }

  const sharp = await getSharp();
  const meta = await sharp(bytes).metadata();
  const pages = meta.pages ?? 1;
  const animated = pages > 1;
  const square = flag('--square');

  const wantVideo = flag('--video') || (animated && !flag('--static'));

  console.log(`source: ${meta.format} ${meta.width}x${meta.height}${animated ? ` · ${pages} frames` : ''}`);

  let file: string;
  let format: 'static' | 'video';

  if (!wantVideo) {
    const frame = Number(value('--frame') ?? 0);
    const png = await frameAt(bytes, frame, animated, square);
    const webp = await staticSticker(png);
    file = value('--out') || join(outDir, `${stem}-sticker.webp`);
    writeFileSync(file, webp);
    format = 'static';
    const m = await sharp(webp).metadata();
    console.log(`static sticker: ${file} · ${m.width}x${m.height} · ${(webp.length / 1024).toFixed(0)}KB`);
  } else {
    if (!animated) throw new Error('--video needs an animated source');
    // The source's own cadence, so the clip runs at the speed it was drawn at.
    const delayMs = meta.delay?.[0] || 67;
    const fps = Math.min(MAX_VIDEO_FPS, Math.round(1000 / delayMs));
    const seconds = Math.min(MAX_VIDEO_SECONDS, Number(value('--seconds') ?? MAX_VIDEO_SECONDS));
    const start = Number(value('--start') ?? 0);
    const count = Math.min(Math.round(fps * seconds), pages - start);
    if (count < 1) throw new Error(`--start ${start} is past the end (${pages} frames)`);

    const work = mkdtempSync(join(tmpdir(), 'sticker-'));
    try {
      for (let i = 0; i < count; i++) {
        const png = await frameAt(bytes, start + i, true, square);
        writeFileSync(join(work, `f_${String(i + 1).padStart(5, '0')}.png`), png);
      }
      file = value('--out') || join(outDir, `${stem}-sticker.webm`);
      const webm = encodeWebm(work, fps, file);
      format = 'video';
      console.log(`video sticker: ${file} · ${count} frames @ ${fps}fps · ${(count / fps).toFixed(2)}s · ${(webm.length / 1024).toFixed(0)}KB`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  await publish(file, format);
}

/**
 * Put a finished sticker file in a set: create it if the bot has none by that
 * name, append if it has. Nothing is sent without --pack and --yes.
 */
async function publish(file: string, format: 'static' | 'video' | 'animated'): Promise<void> {
  const pack = value('--pack');
  if (!pack) {
    console.log('\nConverted only. Add --pack <name> --title "..." --owner <user_id> --yes to put it in a set.');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required (run from pepe-tg so .env is read)');
  const owner = value('--owner') || process.env.STICKER_OWNER_ID || '';
  if (!owner) throw new Error('--owner <telegram user id> is required; the pack is owned by a person, not the bot');

  const api = async (method: string, body?: unknown) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
    });
    return (await res.json()) as { ok: boolean; result?: any; description?: string };
  };

  const me = await api('getMe');
  if (!me.ok) throw new Error(`getMe failed: ${me.description}`);
  const username = me.result.username as string;
  const name = pack.endsWith(`_by_${username}`) ? pack : `${pack}_by_${username}`;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name)) throw new Error(`bad pack name: ${name}`);

  const existing = await api('getStickerSet', { name });
  console.log(`\nbot: @${username} · owner: ${owner} · pack: ${name} (${existing.ok ? `exists, ${existing.result.stickers.length} stickers` : 'new'})`);
  if (!flag('--yes')) {
    console.log('Dry run. Add --yes to write to Telegram.');
    return;
  }

  const form = new FormData();
  form.append('user_id', owner);
  form.append('sticker_format', format);
  form.append('sticker', new Blob([readFileSync(file)]), basename(file));
  const up = await api('uploadStickerFile', form);
  if (!up.ok) throw new Error(`uploadStickerFile failed: ${up.description}`);

  const emojis = (value('--emoji') || '🐸').split(',').map((e) => e.trim()).filter(Boolean);
  const sticker = { sticker: up.result.file_id, format, emoji_list: emojis };

  const done = existing.ok
    ? await api('addStickerToSet', { user_id: owner, name, sticker })
    : await api('createNewStickerSet', { user_id: owner, name, title: value('--title') || pack, stickers: [sticker] });
  if (!done.ok) throw new Error(`${existing.ok ? 'addStickerToSet' : 'createNewStickerSet'} failed: ${done.description}`);

  console.log(`\n✅ https://t.me/addstickers/${name}`);
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});

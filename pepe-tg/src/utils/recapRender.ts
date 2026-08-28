/**
 * Drawing the strip.
 *
 * Panels are SVG composited by sharp, not a headless browser: the droplet has
 * no Chrome and installing one to draw a speech bubble would be the largest
 * dependency in the project. sharp is already here for card media.
 *
 * That constrains typography — librsvg uses whatever fontconfig has, and the
 * droplet has DejaVu and nothing else. So the personality comes from layout:
 * heavy ink borders, halftone, the beat stamped at an angle, and the card art
 * itself, which is doing most of the work anyway.
 *
 * Text has to be wrapped by hand, because SVG does not wrap. `wrap()` measures
 * in average glyph widths for the family and size actually used, which is
 * approximate — so the box is sized from the wrapped result rather than the
 * other way round, and a bad estimate costs whitespace, never a clipped line.
 */

import { execFile } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import sharp from 'sharp';
import { logger } from '@elizaos/core';
import type { RecapMoment } from './recapMoments';
import type { CastCard } from './recapCast';

const run = promisify(execFile);

export const SIZE = 1080;

const INK = '#0b1a0b';
const PAPER = '#eef3e2';
const FROG = '#7ac943';
const DEEP = '#0f2410';
const STAMP = '#d4402f';

/** DejaVu Sans at these weights, measured: ~0.56em average advance. */
const AVG_ADVANCE = 0.56;

export function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const perChar = fontSize * AVG_ADVANCE;
  const maxChars = Math.max(8, Math.floor(maxWidth / perChar));
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word longer than the line gets broken rather than overflowing.
    if (word.length > maxChars) {
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars - 1) + '-');
        rest = rest.slice(maxChars - 1);
      }
      line = rest;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** The ground: dark surround and the paper the panel is printed on. */
function ground(): string {
  return `
  <rect width="${SIZE}" height="${SIZE}" fill="${DEEP}"/>
  <rect x="34" y="34" width="${SIZE - 68}" height="${SIZE - 68}" fill="${PAPER}" stroke="${INK}" stroke-width="7"/>`;
}

/**
 * The furniture that sits on top of everything: the corner bug and the beat.
 *
 * The beat is stamped over the art, so its box is sized from the text rather
 * than guessed at — an undersized box let "THE MARKET OPENS" hang outside its
 * own red rectangle and off the edge of the frame.
 */
function furniture(beat?: string): string {
  const bug = `
  <rect x="34" y="34" width="392" height="46" fill="${INK}"/>
  <text x="52" y="65" font-family="DejaVu Sans Mono, monospace" font-size="19" letter-spacing="4" fill="${FROG}">PEPEDAWN · RECAP</text>`;
  if (!beat) return bug;

  const fontSize = beat.length > 18 ? 26 : 31;
  const width = Math.min(560, Math.round(beat.length * fontSize * 0.66) + 52);
  const right = SIZE - 62;
  return `${bug}
  <g transform="translate(${right} 100) rotate(2.5)">
    <rect x="${-width}" y="-42" width="${width}" height="64" fill="${STAMP}" stroke="${INK}" stroke-width="5"/>
    <text x="${-width / 2}" y="2" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${fontSize}" fill="#ffffff">${esc(beat)}</text>
  </g>`;
}

export function titleSvg(dateLabel: string, subtitle: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  ${ground()}
  ${furniture()}
  <text x="${SIZE / 2}" y="440" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="118" fill="${INK}">THE DAY</text>
  <text x="${SIZE / 2}" y="530" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="62" fill="#3a6b2a">IN FAKE RARES</text>
  <line x1="240" y1="600" x2="${SIZE - 240}" y2="600" stroke="${INK}" stroke-width="5"/>
  <text x="${SIZE / 2}" y="662" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="30" letter-spacing="6" fill="${INK}">${esc(dateLabel)}</text>
  <text x="${SIZE / 2}" y="726" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="32" fill="#3a6b2a">${esc(subtitle)}</text>
</svg>`;
}

export function outroSvg(subtitle: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  ${ground()}
  ${furniture()}
  <text x="${SIZE / 2}" y="500" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="104" fill="${INK}">THAT WAS THE DAY</text>
  <text x="${SIZE / 2}" y="576" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="34" fill="#3a6b2a">${esc(subtitle)}</text>
  <text x="${SIZE / 2}" y="660" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="26" letter-spacing="6" fill="${INK}">SCROLL UP IF YOU THINK WE ARE LYING</text>
</svg>`;
}

/** The ground of a quote panel. Drawn first, so the card plate lands on it. */
export function panelBackSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">${ground()}</svg>`;
}

/**
 * Everything above the card: bubble, quote, credit, beat, corner bug.
 *
 * Split from the ground because a single full-bleed SVG composited over the
 * card plate painted the paper straight over the art — the first render came
 * out with an empty left half and no way to tell why from the code.
 */
export function panelSvg(moment: RecapMoment, card: CastCard): string {
  const bubbleX = 560;
  const bubbleW = SIZE - bubbleX - 70;
  const inner = bubbleW - 76;

  const size = moment.quote.length > 120 ? 36 : moment.quote.length > 70 ? 42 : 48;
  const lines = wrap(`“${moment.quote}”`, size, inner);
  const lineH = Math.round(size * 1.24);

  const who = moment.isBot ? 'PEPEDAWN' : moment.author || 'someone';
  const creditLines = wrap(`— ${who}, cast as ${card.asset} by ${card.artist}`, 22, inner);

  const bodyH = lines.length * lineH;
  const creditH = creditLines.length * 28;
  const bubbleH = bodyH + creditH + 96;
  const bubbleY = Math.max(150, Math.round((SIZE - bubbleH) / 2));

  const body = lines
    .map((l, i) => `<text x="${bubbleX + 38}" y="${bubbleY + 62 + i * lineH}" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${size}" fill="#14260f">${esc(l)}</text>`)
    .join('\n  ');

  const credit = creditLines
    .map((l, i) => `<text x="${bubbleX + 38}" y="${bubbleY + bodyH + 94 + i * 28}" font-family="DejaVu Sans Mono, monospace" font-size="22" fill="#4a7a35">${esc(l)}</text>`)
    .join('\n  ');

  const fill = moment.isBot ? '#dff5c6' : '#ffffff';
  const tailY = bubbleY + 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  ${furniture(moment.beat)}
  <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleW}" height="${bubbleH}" rx="34" fill="${fill}" stroke="${INK}" stroke-width="7"/>
  <polygon points="${bubbleX - 44},${tailY + 22} ${bubbleX + 6},${tailY - 12} ${bubbleX + 6},${tailY + 62}" fill="${fill}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
  <rect x="${bubbleX + 3}" y="${tailY - 4}" width="10" height="60" fill="${fill}"/>
  ${body}
  ${credit}
  <rect x="76" y="${SIZE - 176}" width="${Math.max(240, card.asset.length * 17 + 90)}" height="40" fill="${INK}"/>
  <text x="94" y="${SIZE - 148}" font-family="DejaVu Sans Mono, monospace" font-size="21" letter-spacing="2" fill="${FROG}">${esc(card.asset)} · S${card.series}</text>
</svg>`;
}

/** Card art, squared off and inked, ready to sit under the bubble. */
export async function cardPlate(image: Buffer, box = 420): Promise<Buffer> {
  const art = await sharp(image)
    .resize(box, box, { fit: 'cover', position: 'attention' })
    .toBuffer();
  return sharp({
    create: { width: box + 16, height: box + 16, channels: 4, background: INK },
  })
    .composite([{ input: art, top: 8, left: 8 }])
    .png()
    .toBuffer();
}

export async function renderQuotePanel(
  moment: RecapMoment,
  card: CastCard,
  art: Buffer | null
): Promise<Buffer> {
  const layers: sharp.OverlayOptions[] = [
    { input: Buffer.from(panelBackSvg()), top: 0, left: 0 },
  ];
  if (art) {
    const plate = await cardPlate(art);
    layers.push({ input: plate, top: 292, left: 88 });
  }
  layers.push({ input: Buffer.from(panelSvg(moment, card)), top: 0, left: 0 });
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: DEEP } })
    .composite(layers)
    .png()
    .toBuffer();
}

export async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface Frame {
  png: Buffer;
  holdMs: number;
}

/**
 * Frames to an MP4 Telegram will play inline.
 *
 * Each frame becomes its own clip so it can hold for its own length — the
 * whole point of the timing work in recapMoments. A slow push in keeps a stack
 * of stills from reading as a slideshow.
 */
export async function framesToMp4(frames: Frame[]): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'recap-'));
  try {
    const list: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const png = join(dir, `f${i}.png`);
      const clip = join(dir, `c${i}.mp4`);
      writeFileSync(png, frames[i].png);
      const seconds = (frames[i].holdMs / 1000).toFixed(2);
      const dFrames = Math.max(1, Math.round((frames[i].holdMs / 1000) * 25));
      await run('ffmpeg', [
        '-loglevel', 'error', '-y', '-loop', '1', '-i', png, '-t', seconds,
        '-vf', `scale=${SIZE * 2}:${SIZE * 2},zoompan=z='min(zoom+0.0005,1.045)':d=${dFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${SIZE}x${SIZE}:fps=25,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', clip,
      ], { maxBuffer: 1 << 26 });
      list.push(`file '${clip}'`);
    }

    const listFile = join(dir, 'list.txt');
    writeFileSync(listFile, list.join('\n') + '\n');
    const out = join(dir, 'recap.mp4');
    await run('ffmpeg', [
      '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-movflags', '+faststart', out,
    ], { maxBuffer: 1 << 26 });

    return (await import('fs')).readFileSync(out);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
  }
}

/** Card art off S3. A miss is not fatal — the panel renders without the plate. */
export async function fetchArt(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    logger.debug({ error, url }, '[Recap] card art unavailable');
    return null;
  }
}

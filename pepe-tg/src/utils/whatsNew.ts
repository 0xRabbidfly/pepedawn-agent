/**
 * What PEPEDAWN says about itself when it comes back up on a new version.
 *
 * The text is hand-written, in `docs/WHATS_NEW.md`, one section per version,
 * and it is posted verbatim. It is not generated from CHANGELOG.md and no model
 * touches it, for two reasons:
 *
 *  - The changelog is written for us. It names internal flags, file paths and
 *    unlisted commands. Announcing a compressed version of it to a 1,250-member
 *    channel is how something that was meant to stay quiet gets announced.
 *  - A post to the whole community is the one piece of output nobody gets to
 *    review before it lands. It should be a diff someone approved, not a
 *    sentence a model wrote at 02:00.
 *
 * A version with no section posts nothing at all, which is the right default:
 * most releases are bug fixes nobody needs a bulletin about.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function whatsNewPath(): string {
  return process.env.WHATS_NEW_PATH || join(process.cwd(), 'docs', 'WHATS_NEW.md');
}

/** The running version, from package.json. */
export function currentVersion(): string | undefined {
  try {
    const path = process.env.PACKAGE_JSON_PATH || join(process.cwd(), 'package.json');
    const version = JSON.parse(readFileSync(path, 'utf8'))?.version;
    return typeof version === 'string' && version.trim() ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The post for one version, or null when that version has no section.
 *
 * Sections are `## [x.y.z]` — the same shape as CHANGELOG.md, so the two are
 * written together and read the same way.
 */
export function whatsNewFor(version: string, path = whatsNewPath()): string | null {
  if (!existsSync(path)) return null;
  let body: string[] | null = null;
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const heading = /^##\s*\[([^\]]+)\]/.exec(line);
      if (heading) {
        if (body) break;
        if (heading[1].trim() === version) body = [];
        continue;
      }
      // Comments let the file carry instructions for whoever writes the next one.
      if (body && !line.trimStart().startsWith('<!--')) body.push(line);
    }
  } catch {
    return null;
  }
  const text = (body ?? []).join('\n').trim();
  return text ? text : null;
}

/**
 * Is `version` newer than `against`? Absent `against` counts as newer.
 *
 * Guards the one case where "the version changed" is the wrong test: a
 * rollback. Reverting to 5.10.0 must not re-announce 5.10.0 to the room.
 */
export function isNewerVersion(version: string, against?: string): boolean {
  if (!against) return true;
  const parts = (v: string) => v.split(/[.-]/).map((p) => parseInt(p, 10));
  const a = parts(version);
  const b = parts(against);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x !== y) return x > y;
  }
  return false;
}

#!/usr/bin/env bun
/**
 * Move a ticket on the fake backlog. Runs on the droplet, where the backlog
 * lives; the proposer calls it over ssh when it pushes a branch that
 * carries "Ticket: KEK-nnn", and a person can call it to decline one.
 *
 *   bun scripts/backlog-status.ts KEK-001 review maintainer
 *   bun scripts/backlog-status.ts KEK-001 declined rabbidfly
 *
 * "shipped" is set by the bot itself at boot from the git log; there is no
 * need to set it here.
 */
import { STATUSES, STATUS_MARK, setTicketStatus, type Status } from '../src/utils/buildRequests';

const [id, status, by = 'script'] = process.argv.slice(2);
if (!id || !status || !(STATUSES as readonly string[]).includes(status)) {
  console.error(`usage: bun scripts/backlog-status.ts KEK-001 <${STATUSES.join('|')}> [by]`);
  process.exit(2);
}
const t = setTicketStatus(id.toUpperCase(), status as Status, by);
if (!t) { console.error(`${id} is not on the backlog`); process.exit(1); }
console.log(`${t.id} · ${t.title} · ${STATUS_MARK[t.status]}`);

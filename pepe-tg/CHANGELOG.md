# Changelog

All notable changes to PEPEDAWN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.7.9] - 2026-08-31

### Changed

- **The strip is a third shorter.** ~160ms a word over a 1.1s base, floored at
  3.2s and capped at 7s, with quicker bookends. A five-panel strip now runs
  about 26 seconds rather than 37. The first cut was paced for reading prose
  cold; this is a recap of a room the reader was already in.

### Fixed

- **A long beat is no longer cut mid-phrase.** "THE MARKET FINDS ITS FLOOR AT
  LAST" used to arrive as "THE MARKET FINDS ITS FLO…". The stamp now sizes
  itself to the words: two lines split at a space when it needs them, type
  stepping down as they grow, and past a hard 44-character limit whole words
  are dropped rather than half of one.

- **A two-line stamp was cropped off the top of the frame.** It hung from its
  bottom edge, so a second line grew upward past the border and the zoom took
  the rest. It is anchored from the top now, inside the safe area.

## [5.7.8] - 2026-08-31

### Changed

- **The recap no longer quotes the bot talking to itself.** A volunteered X
  post — the "quiet in here, this turned up on X" one — is by definition the
  room *not* talking, with PEPEDAWN filling the gap. Quoting those back as
  highlights of the day made a silent day look busy and handed the bot a panel
  for its own broadcast.

  Unprompted posts are now marked `kind: 'broadcast'` in the day log and are
  ineligible **unless a person speaks within 20 minutes of one**. Then it is no
  longer furniture, it is an exchange someone joined, and both halves can be
  quoted. A reply an hour later is a new conversation, not an answer to that
  post, and does not rescue it; nor does the bot following itself.

  Broadcasts are also excluded from the message count, so a quiet day carrying
  four volunteered posts no longer opens with "4 messages".

  The bot answering a person is untouched — "duh pepedawn are you bot?" and
  what it said back are a conversation, and exactly what the strip is for.

## [5.7.7] - 2026-08-31

### Fixed

- **PM2 could not find `elizaos`, and the bot crash-looped 27 times.** PM2 hands
  the app whatever PATH its daemon was started with. A daemon started from a
  non-interactive shell has no `~/.bun/bin`, so `start-bot.sh` reached
  `elizaos start`, the shell could not resolve it, and the process died four
  seconds after printing "Starting bot…" — with nothing on stderr, which is why
  the logs showed only the banner repeating. The same command run by hand in a
  login shell worked perfectly throughout, which is what made it confusing.

  PATH is now pinned in `ecosystem.config.cjs`, so the app no longer depends on
  how the daemon was launched or on whoever last restarted it remembering to
  export it. PROMOTION.md has warned since 5.3 that non-interactive SSH does
  not load the profile; this is the same fact biting from inside PM2 rather
  than from a deploy command.

## [5.7.6] - 2026-08-31

### Fixed

- **The nightly recap reported "nothing to recap" on two days that had plenty
  in them.** The chat-to-room pairing lives in an in-memory Map learned from
  the first message after boot — fine for the harvest, which only volunteers
  into a room quiet for 90 minutes, useless to a recap that runs 90 seconds
  after the 02:00 restart. With nothing learned yet, the lookup fell back to
  the raw chat id, which is not a key the day log has ever used, so it read
  zero turns and stood down. `/recap` in the same room worked throughout,
  because a command arrives with its room id attached.

  The pairing is now persisted to `src/data/room-map.json` as it is observed,
  and the recap reads every room recorded for the chat — a list, not a single
  value, so a forum's topics all count toward one day.

### Changed

- **The moment picker is told what the room actually finds funny.** Someone
  talking to PEPEDAWN as though it were a person — realising it is a bot,
  arguing with it, testing it — is now named in the prompt as material to
  favour, alongside opinions, jokes and trades.

## [5.7.5] - 2026-08-29

### Fixed

- **`/recap` built the strip and then sent the word "Video:".** The command
  handed the MP4 to the ElizaOS message callback as an attachment, and the
  callback has no idea what to do with a raw buffer — so the channel got a
  clapperboard, the text `🎬 Video:`, and a caption with its `<b>` and `<i>`
  tags showing, because the callback sets no parse mode either. The render
  itself had worked: 29 messages, 4 frogs, 6 cards named.

  Delivery now goes straight to the Bot API through `sendRecapVideo`, the same
  multipart `sendVideo` the nightly post already used, with the chat id taken
  from the Telegram context. One path, used by both callers, and the caption is
  capped at the 1,024 characters `sendVideo` accepts. A failure to send says so
  in the room rather than leaving the strip in a log line.

## [5.7.4] - 2026-08-29

### Fixed

- **Recap spend showed in `/fc` as "(unattributed)".** The cost was always
  counted — every recap model call goes through `modelGateway`, so it appears
  under `Recap` in the By Type breakdown at about $0.00025 a strip. But
  `/recap` is answered inline rather than through the action pipeline, so
  nothing set the action context and the By Action breakdown could not say
  whose the spend was.

  Both paths now run inside one: `recap` for the command, `recap_nightly` for
  the strip built at the restart, so a day's recap cost can be told apart from
  a day's worth of people asking for one.

## [5.7.3] - 2026-08-29

### Fixed

- **`/recap` answered "The projector jammed" in the channel.** sharp 0.34.4's
  loader calls `binding._isUsingX64V2()`, which only exists in the matching
  0.34.x platform package. The droplet had `@img/sharp-linux-x64@0.33.5`
  hoisted — it is what `@xenova/transformers` drags in — and none of the nested
  0.34.4 copy that makes it work locally, so the render threw
  `_isUsingX64V2 is not a function` after the model call had already been paid
  for.

  Both halves of the pair sharp 0.34.4 declares are now pinned:
  `@img/sharp-linux-x64@0.34.4` and `@img/sharp-libvips-linux-x64@1.2.3`. The
  earlier 1.0.4 pin was right for the 0.33.5 binding and wrong for the JS
  wrapper actually doing the loading — matching one half of a native pair is
  not matching it.

  The lazy import added in 5.7.1 did its job throughout: every one of these
  failures cost the recap and nothing else.

## [5.7.2] - 2026-08-29

### Fixed

- **The first nightly recap burned the day without posting anything.** The day
  stamp was written before any work, which protects against a crash loop
  re-rendering on every boot — but it also meant a room with nothing in the log
  spent its one attempt at 02:00. Overnight on 29 August the log held a single
  turn, the stamp went down, and the 08:00 restart declined to try again.

  Eligibility is now checked before the stamp. Reading the JSONL log is free,
  so a day with too little in it leaves the stamp alone and a later boot inside
  the window can try again. The stamp still goes down before the model call and
  the render, which is where the money and the crash risk are.

- **Volunteered X posts never reached the day log**, so the recap could not
  quote the bot bringing something up. `XHarvestService.send` goes straight to
  the Telegram API and never touches the history path that writes the log; it
  now records the turn itself.

## [5.7.1] - 2026-08-28

### Fixed

- **A top-level `sharp` import took production down for ten minutes.** The
  5.7.0 deploy left the droplet in `No agents found in project`:
  `@img/sharp-linux-x64` was installed without its
  `@img/sharp-libvips-linux-x64` payload, `libvips-cpp.so.42` was missing, and
  the import threw while ElizaOS was loading the project. No agents meant no
  Telegram. Reverted at 23:42 UTC and restored on the next deploy.

  sharp had been a declared dependency for months without a single runtime
  import, so nothing had ever exercised the broken install. A dependency being
  declared is not evidence that it loads.

  sharp is now loaded on first use inside `getSharp()`, so a broken image
  library costs the recap and nothing else — the message path, the market
  watcher and the harvest all keep working, and `/recap` says rendering is
  unavailable on this host. A test asserts the import stays lazy, since this is
  the kind of thing a later tidy-up would put back at the top of the file.
  `@img/sharp-libvips-linux-x64` is pinned in `optionalDependencies` rather
  than left to platform inference that has already been wrong once.

- **The test suite was writing to the real day log.** `appendDayTurn` is a
  no-op under test unless `RECAP_DAYLOG_PATH` is set; a single run had been
  leaving 724 lines of fixture chatter in `src/data/day-log.jsonl`.

## [5.7.0] - 2026-08-28

### Added

- **`/recap` — the day as a comic strip.** Six to seven panels: a title card,
  four or five quoted moments, an outro. Everyone in the room is cast as a real
  Fake Rare from the index, and the casting is a pure function of the handle,
  so @dispenser_goblin is the same card tomorrow and regulars become
  recognisable characters. Rendered with `sharp` and assembled with ffmpeg,
  both of which were already here for card media — no new dependency.

  **Quotes are never written by the model.** It returns line numbers and a
  four-word beat for each panel; the text is copied out of the turn it points
  at. A choice that resolves to no turn is dropped rather than repaired,
  because a hallucinated index is a hallucinated quote — the DJ Pepe failure
  with a person on the receiving end instead of an artist.

  **A panel holds long enough to read it.** Time on screen scales with the
  quote: ~230ms a word over a 1.8s base, floored at 4.2s and capped at 9.5s.
  Fixed timing suited neither end — short quotes dragged and long ones were
  gone before the second line.

  `/recap` asks for yesterday and falls forward to the day in progress when
  yesterday has nothing — on the day this ships there is no yesterday, since
  the day log starts filling at the deploy, and the first person to try it
  would otherwise be told the room was empty when it plainly was not. The
  caption says which day it ended up using. The nightly post does not fall
  forward: a quiet day gets no strip.

  Handles in `src/data/recap-optout.json` never appear. Commands, one-word
  replies and anything under 12 characters are not eligible, and a day with
  fewer than 8 usable turns produces no strip at all: a recap of four messages
  says the day was empty in a format implying it was not.

- **A day log**, `src/data/day-log.jsonl`, written from `RoomHistory.commit` —
  the one chokepoint every append reaches, shadow on or off, user turn or bot
  turn. `roomHistory` keeps 120 turns over 7 days and prunes, so on a busy day
  the recap would have covered the last two hours and nothing else. Append-only,
  8-day horizon, pruned every 500 writes, and it never throws into the message
  path.

- **The nightly strip**, `RecapService`, off by default behind `RECAP_ENABLED`.
  PM2 already cron-restarts at 02:00, so that boot is the schedule and no
  second scheduler is needed — but PM2 also restarts on every deploy, which is
  exactly how X harvesting became four paid rounds in three hours (5.6.0). The
  guard is therefore a persisted local day stamp in `src/data/recap-state.json`,
  written *before* the render rather than after, plus a 02:00–10:00 window so an
  afternoon deploy cannot post last night's recap to a room that has moved on.
  Unlike `periodicContent.sendToChannels`, the send reports its own failure.

## [5.6.5] - 2026-08-28

### Changed

- **The unprompted X post always opened with the same six words.** `leadFor`
  held three fixed strings — "Quiet in here." followed by one of three tails —
  and the volunteer fires at most once every six hours into a room that has
  gone silent. That sentence was therefore the whole of PEPEDAWN's unprompted
  voice, repeated for as long as the feature has been on, and it had started to
  read as a stuck record rather than a bot noticing the quiet.

  The lead is now drawn from `volunteerLead` in `xHarvest.ts`: seventeen
  templates in three groups — a named card, a lore lesson, everything else —
  with the original wording kept as the first entry of each, because it was
  fine, it was only tired.

  The template used last is passed back and skipped, so the room never sees the
  same opener twice running. Templates are compared by id rather than by text:
  the same joke naming PEPEDAWN and naming DJPEPE are different strings, and
  treating them as different was the failure mode worth designing against.
  The memory is per-process and the droplet restarts nightly, which is the
  right lifetime — a repeat separated by a day is not a repeat anyone notices.

  Selection lives in `xHarvest.ts` rather than the service, per the note there,
  so it is testable without a runtime; the picker is injectable, and the tests
  assert every template renders, names its card, and contains nothing that
  would need HTML-escaping in the card that carries it.

## [5.6.4] - 2026-08-23

### Fixed

- **A question of taste threw away the part that made it a question.** "What is
  your favourite Memeticx card?" was answered "GREENBEANZ by VVD". The taste
  path drew uniformly from the whole collection and never read the artist out
  of the question — Memeticx has seven cards, and the answer was one in 914.

  `randomCard` now takes a `CardConstraint` — artist, series, or both — and the
  taste path reads one out of the question. Short forms resolve to the credits
  that person actually holds: "scrilla" is six credited names, and a card under
  any of them is a fair answer.

  When nothing matches, the constraint is not dropped. There is no fallback to
  the unconstrained pool anywhere in this path: asked for a card by a name the
  index has never heard of, the bot says so and asks how it is spelled.
  Offering somebody else's card is the failure this exists to prevent, not the
  graceful degradation from it.

  Descriptive qualifiers are left alone — "your favourite green card" is a
  question the vision pass can answer, not a person to draw from — as are
  collection words and time spans. `artistsIn` moved to `cardFacts` and takes
  its pool as a parameter, because the two callers mean different things by
  "artist": offering someone a card searches all three collections, while
  artist statistics are quoted from the Fake Rares index and say so out loud.

## [5.6.3] - 2026-08-23

### Fixed

- **`/p djpepe` showed a random card.** The classifier is asked to report the
  slash command it saw and reports only the command, so "go ahead and do /p
  djpepe" reached the handler as a bare `/p` — and an argument-less `/p` means
  show a random card. All three card commands behaved this way for any text
  their parser could not read: the pattern was anchored at the start of the
  message, so it failed open in the worst possible direction.

  `runRouterCommand` now recovers the argument from the user's own text, which
  is the authority on what they asked for, and `parseCardCommand` finds the
  command wherever it appears and treats random as something a person asked
  for rather than the fallback for a failed parse. `/f`, `/c` and `/p` share
  it; `/fr` and `/fc` remain their own commands.

- **DJ Pepe was credited to the wrong artist.** DJPEPE is a Rare Pepe by Rare
  Scrilla and the index says so, but Counterparty asset names have no spaces
  and people do — so "DJ Pepe" matched nothing, the question fell through to
  retrieval, and retrieval found the Fake Rare RAREDJPEPE (by EMBLEMATIX)
  sitting nearby and asserted it.

  `assetsIn` now makes one last-resort pass for names written with a space,
  joining up to three adjacent words across all three collections. It runs only
  when nothing was named outright and never joins across a function word —
  "rare pepes and fake rares" contains PEPESAND and "the pepe" contains
  THEPEPE, both real assets and neither one named. Measured over 67,600
  ordinary word pairs, what survives is almost entirely genuine card names
  someone spaced out: PEPECASH, DANKPEPE, BITCOINPEPE.

## [5.6.2] - 2026-08-23

### Added

- **A card with no lore now says what it looks like.** The specs alone are a
  thin reply — artist, series, supply, and nothing of the art itself. The `/fv`
  vision pass has already looked at 858 cards, so a card nobody has written
  lore about gets one line of what it saw: three traits, appended only in the
  fallback branch. When retrieval has a real answer, that is the answer and
  this stays out of the way.

  The traits file cannot be read from directly. The vision pass read the
  artwork *and* the text printed on it, so alongside "gold background" it holds
  "atk", "spd", "rareness", asset-hash artefacts and ordinary words lifted off
  the card face — the material that once produced "the vision pass recorded:
  get." `describeLook` drops those, drops anything that is just the card's own
  name read back, and ranks multi-word phrases ahead of loose words, since a
  phrase is almost always genuine vision output. All 858 cards with recorded
  traits produce a usable line.

### Fixed

- **The bot named a card and then asked what they were looking for.** Someone
  posted "on the hunt for a PEPEPUNKROCK if anyone knows anyone selling" and
  got back the card's artist, series, number, supply and issuance — followed by
  "Not sure what you're after. Name a card, or ask me about an artist, a
  series, or a bit of history."

  Both halves came from `buildFactsPlan`: the card index supplied the specs,
  retrieval found no lore and returned the clarification stand-in, and it was
  appended as if it were an answer. The guard already there only dropped thin
  answers of 14 words or fewer, and the clarification is 21.

  `KnowledgeRetrievalResult` now carries `isNonAnswer`, set only on the
  clarification branch, and the FACTS plan will not append a non-answer to
  material of its own. The clarification still stands by itself when no card
  was recognised, and the "lore vault is empty" invite is untouched — that one
  is a real reply to a card someone named.

## [5.6.1] - 2026-08-21

### Added

- **Visual traits for the six new Series 18 cards.** The Series 18 backfill put
  the cards in the index, but the vision pass behind `card-visual-traits.json`
  last ran in November 2025, so descriptive questions ("most red", "which one
  has birds") could not reach them. Crawled, merged, summarised and embedded
  the six cards pepe.wtf has published: 875 → 881 cards.

  The matching 29 fact blocks went into the production corpus separately
  (3,986 → 4,015 blocks). The two consumers are independent: the corpus feeds
  `expandCardOnlyPassages`, the traits file feeds `describeTraitMatch`. The ten
  Series 18 cards pepe.wtf has not published are excluded — there is no
  full-resolution artwork to analyse, only a 400px directory thumbnail.

## [5.6.0] - 2026-08-21

### Fixed

- **X harvesting ran once per restart, not once per day.** `XHarvestService`
  armed a 5-minute timer at boot and only then set the 24h interval — but
  production hard-restarts nightly at 02:00 and on every deploy, so the process
  never lived to reach it. The post-boot harvest *was* the cadence, and each
  restart bought another full round of paid queries. On 2026-08-21 it ran four
  times in three hours, twice because of deploys.

  The schedule is now anchored to a `lastHarvestAt` timestamp in the harvest
  store, so a restart inside the interval skips its round. It is stamped when
  the queries fire rather than when they finish: the money is gone by then.

### Changed

- **Harvest model moved to grok-4.3**, still a reasoning model. Measured on one
  prompt: grok-4.3 $0.026/49s, grok-4.20-0309-reasoning $0.028/55s, grok-4.6
  $0.075/107s, grok-4.20-0309-non-reasoning $0.121/17s. Turning reasoning off
  cost 2.3× *more* — with nothing narrowing the search, `x_search` poured 65k
  tokens of raw results into the request instead of 8k. Recorded in
  `.env.example` so it is not retried.

- **Dropped the `phrase` harvest query.** Six posts over its lifetime, none
  naming a card, none volunteered, none ever used. `market` and `curated`
  between them produced everything the bot has actually said out loud.

  Together: ~$1.41/day → ~$0.08/day.

## [5.5.4] - 2026-08-20

### Fixed

- **New cards had metadata but no image.** pepe.wtf reports `jpeg` for objects
  S3 stores as `.jpg`. When the page shows a standard S3 path the scraper saves
  no `imageUri`, because the display URL is rebuilt from series + asset + ext —
  and it also normalised jpg to jpeg, so the rebuilt URL 403'd. Series 18 cards
  26–31 showed artist and supply with no image.

  The normalisation is gone, replaced by `resolveS3Extension()`, which HEADs
  each candidate and keeps the one the bucket answers, falling back to a stored
  image URL when it serves none. A miss returns 403 rather than 404 — the
  bucket denies `ListBucket` — so probing is the only reliable test.

- Series 18 cards 32–41 gained artist and supply, read from the directory and
  confirmed against Counterparty, where every supply matches and is locked.
  They are on chain but not formally issued as Fake Rares, so they carry no
  issuance date and are flagged `awaiting_formal_issuance`.

## [5.5.3] - 2026-08-20

### Fixed

- **The card scraper rewrote cards it had already collected.** Any card
  carrying an `issues` array was queued for re-scraping, and Pass 2 rebuilt the
  record from scratch — it never copied `memeUri` forward, and a pepe.wtf 404
  returned nulls for artist, supply and issuance. FAKEIJUANA and STPEPERISES
  would have lost their `memeUri` on the next run, the same field repaired by
  hand across four earlier commits.

  `add-new-cards.js` is now append-only: it adds cards it has never seen and
  never touches an existing record. Cards that land incomplete — usually not
  yet published on pepe.wtf — are named at the end of the run for a manual
  fill-in.

- The workflow's change counter grepped the diff for `name`, a key the card
  schema does not have, so every automated commit reported that it had found
  zero cards.

### Added

- **Series 18 cards 26–41.** The scheduled scrape was suspended by GitHub on
  2026-01-25 for repository inactivity, so the card index stopped at card 25
  while the series grew to 41. 16 cards added, 0 modified, 0 removed; all 127
  `memeUri` values intact. Six are complete (SELFISHMEME, MEMEGREEN,
  CARDINALDOOM, RARECIPHER, MADMIRROR, FAKEGIANTS); the ten pepe.wtf has not
  published carry `no_artist`/`no_supply`/`no_issuance` and display from a
  fakeraredirectory image until upstream catches up.

## [5.5.2] - 2026-08-20

### Fixed

- **`/fc` did not count xAI spend at all.** Every Grok call the bot has ever
  made was invisible to the cost report, which means `/fc` has been an OpenAI
  report presented as a total. `XHarvestService` calls `api.x.ai` with a plain
  `fetch` rather than through `modelGateway`, and the gateway is what feeds
  `TelemetryService`.

  The exact figure was already in hand and being thrown away: xAI returns
  `usage.cost_in_usd_ticks`, and it went to a `logger.debug` line that
  production does not emit. Harvest now records each query — three per cycle,
  every 24h — as `X-Harvest-<query>` under action `x_harvest`, using xAI's own
  accounting.

  If xAI ever omits the cost, the fallback runs token counts through
  `calculateCost`, which knows no xAI pricing and would silently apply
  gpt-4o-mini's. That path logs a warning rather than presenting an estimate as
  a measurement — and `readXaiSpend` returns a null cost rather than a zero,
  which would be indistinguishable from a free call.

## [5.5.1] - 2026-08-20

### Fixed

- **`/fr` told every artist they were nearly out of room.** The success line
  said "One more slot left on this card" for every entry but the last — true
  when the cap was 2, and wrong since it became 10. Storing your first piece of
  lore announced one remaining slot when nine were free. It now reports the
  actual count.
- Two doc comments still described the cap as 2 and the artist gate as fatal.
  Both have been wrong since `MAX_ENTRIES_PER_CARD` was raised and vouching was
  added.

## [5.5.0] - 2026-08-20

Storing lore was too hard, and the reason was not any of the gates that were
designed: it was a small model with "Be strict" in its system prompt overruling
people who own the archive.

### Changed

- **The quality screen no longer outvotes authority.** `gateSubmission` already
  decides whether a submitter has standing on a card — the credited artist or an
  admin routes to `store`, everyone else to community vouching. The model screen
  then ignored that and judged everyone alike. PEPEDAWN's own artist was told
  that "the first fake rare that is both a card and an agent" was "a bare
  classification claim, not story, context, history, or an anecdote".

  The screen still runs for those submitters and its verdict is still logged, so
  "would it have blocked this?" stays answerable — it simply no longer has the
  last word over someone who has one. For third-party submissions it stays
  binding, backed by vouching.

- **Significance is lore.** The screen asked for origin anecdotes and listed "a
  bare fact already in a database" as disqualifying, which rejected exactly the
  contributions a database cannot hold: what a card is, what it did first, what
  it means here. What stays disqualifying is narrow — authorship claims (the
  manifest is the authority), insults, invention, and bare specifications. The
  screen is now told to err towards accepting.

- **The screen being down no longer decides policy.** It used to be strict when
  the API answered and absent when it threw. Artists were never blocked by it;
  third-party lore still faces the room, which is the real check.

- **Rejections hand the submission back.** Retyping a paragraph into a phone to
  try different wording was the actual cost of a refusal. The text now comes
  back with the reason, ready to edit.

### Added

- **`/fr!` — admin force.** Stores past the taste gates and only those: the card
  must still resolve, the per-card cap still holds, duplicates are still
  refused, and authorship claims are still refused. Logged at warn level with
  the submitter and the text. A judgement call the screen gets wrong should cost
  a character, not an argument with a bot in front of the room.

### Fixed

- `/frisbee` was a lore submission beginning "isbee". `/fr` now needs a word
  boundary.

### Security

- `loreDetectorEvaluator` is documented as not-to-be-registered, and its unused
  import removed from the plugin. It writes to the knowledge base straight from
  conversation with none of the `/fr` gates in front of it. `/fr` and `/vouch`
  remain the only two paths into the corpus, which is what makes every write
  accountable.

## [5.4.2] - 2026-08-20

### Changed

- **Harvested tweets are woven into the reply, not dropped under it.** Tweets
  feed three things, and only one of them is prose: a quiet room gets the
  volunteer push, someone asking what is happening on X gets the digest, and a
  live conversation gets — at most — a passing, credited mention. The third was
  implemented as a tweet card posted after the answer, which read as a non
  sequitur stapled to a finished thought.

  The post now reaches the model as attributed context: a stranger's words, to
  be credited out loud if they connect — a real connection or a funny one — and
  left out entirely otherwise. Never offered when the card index already
  answered the question exactly; a settled fact does not want a tweet attached,
  and card facts still come from the index alone.

  A post is spent only when the reply actually credits its author, so one the
  model declined stays available and starts no cooldown. `revealMatchingTweet`
  is gone; the tweet card survives only where someone asked for it.

### Fixed

- **One shared word is no longer a connection.** "who created DJPEPE ?" pulled
  in a post about unreadable JSONs because "created" and "create" stem alike.
  That term counted as distinctive only because distinctiveness is measured
  against the store: the bar is "appears in at most a fifth of posts", and with
  35 posts that is most of the language. Cards and authors remain signals on
  their own; plain vocabulary now needs two distinctive terms.
- A reveal that succeeded logged nothing, so a tweet appearing in the room could
  not be traced to the path that sent it. The weave logs when it lands.

## [5.4.1] - 2026-08-20

### Fixed

- **The bot contradicted its own answer.** "who created DJPEPE ?" was answered
  correctly — "DJPEPE (Rare Pepes) is by Rare Scrilla" — and then, in a second
  message, "❌ Could not find DJPEPE in the Fake Rares collection." 5.3.4 taught
  the *lookup* about all three collections; the *display* still went through
  `/f`, which only knows Fake Rares, so any card outside it produced an answer
  followed by a denial of that answer.

  A card is now shown by the action that owns its collection — `/p` for Rare
  Pepes, `/c` for Fake Commons, `/f` for Fake Rares — resolved through
  `getAnyCardInfo`. And a display nobody asked for no longer announces a miss:
  the "could not find" text belongs to an explicit `/f`, not to an image
  volunteered alongside an answer. Both automatic display paths go through one
  function now instead of hardcoding `/f`.

- **An unrelated tweet followed the answer.** The X reveal matched a Rare Pepe
  lore post about PEPONG to a question about DJPEPE, on the strength of
  "created" stemming to the same term as "creator" — one shared word, counted
  as distinctive only because the harvest store is small. A post about other
  cards is not a post about this one: when the user names cards and the post
  names cards, they must now be the same cards.

## [5.4.0] - 2026-08-20

Type errors and test failures both to zero. `npx tsc --noEmit` reported 37
errors and `bun test src/__tests__/` failed 10-12 tests plus one file that
could not load; both had been treated as a known-good baseline for long enough
to be written into the runbook. Three of the type errors were live bugs.

### Fixed

- **The user-history provider never reached a prompt.** `Provider.get` must
  return a `ProviderResult`; this one returned bare strings, so `result.text`
  was `undefined` on every call and the context it assembles - what a user
  talks about, which artists they mention - was discarded. Its own tests
  asserted the broken shape, which is why they never caught it.
- **Two card handlers logged `[object Object]` instead of the error.**
  `logger.error({ error }, "Error in /c handler")` against the action logger,
  whose signature is `(message, error)`: the message became "[object Object]"
  and the real error was formatted as the message. Same in `/p`.
- **`TelemetryService` never implemented `stop()`.** `Service` declares it
  abstract; the class had only a static `stop`, so the archive timer survived
  shutdown. The static now delegates to a real instance method that clears it.
- **The build silently shipped no type declarations.** `tsconfig.build.json`
  listed three entry files, one of them `src/character.ts`, which was renamed
  to `pepedawn.ts` long ago - so `tsc` bailed with TS6307 on the first import
  outside that list and the build printed a warning and carried on. And because
  `--incremental` state outlives the directory it describes, a stale
  `tsconfig.build.tsbuildinfo` let `tsc` conclude declarations were up to date
  after `dist` had just been deleted. Both fixed; `dist/index.d.ts` now exists.
- Five imports pointed at `../models/transaction.js` and
  `../events/transactionEvents.js`, which moved into `src/types/` at some point.
  Type-only imports, so nothing broke at runtime and nothing flagged it.
- `MediaExtension` existed in three copies that had drifted. The Commons and
  Rare Pepes scrapes contain uppercase `"GIF"`; the shared copy used by
  `CardDisplayService` did not allow it. Now one definition in `src/types/media.ts`.
- `ZodError.errors` (removed in zod 4) → `.issues` in the plugin config
  validator, which would have thrown while reporting a config error.

### Changed

- Card attachments now go through `asMedia()` in `src/utils/cardAttachments.ts`.
  Core's `Media` type wants its `ContentType` enum, but `messageManager`
  dispatches on MIME - `/^video\//`, the exact string `'image/gif'` - so the
  MIME string is the real contract. Reconciled once, under a name, instead of
  three unexplained casts.
- PGlite query results are typed at the call site in `transactionHistory`, and
  `result.rowCount` - which PGlite does not have - is gone. `COUNT(*)` is
  coerced through one helper rather than `parseInt()` on a value that is
  sometimes already a number.
- **Scaffolding tests now assert this project's contract, not the ElizaOS
  starter template's.** They required `tsup.config.ts` (this project builds with
  `build.ts` and vite), a README beginning "# Project Starter", a vite frontend
  step the build no longer has, and a plugin ordering the character has never
  used. `build-order.test.ts` now runs the real build and checks what production
  depends on: the bundle, the card indexes copied into `dist/data`, the PGlite
  WASM, and the declarations.
- `character-plugin-ordering.test.ts` imported `../character` and could not
  load at all. It now imports `../pepedawn` and asserts the real ordering:
  bootstrap, openai and sql lead; knowledge follows the AI providers; platform
  plugins close.

## [5.3.5] - 2026-08-20

### Fixed

- The bot's own wrong answer became its source. At 10:32 it said "DJPepe was
  created by rabbidfly" (the lookup bug fixed in 5.3.4). A user repeated that
  back to it, the bot restated it, and both turns stayed in the room transcript.
  An hour later - after 5.3.4 was live - "who is the true creator of that card?"
  was answered "The true creator is rabbidfly", composed from that transcript.

  Two gaps let it happen. The attribution vocabulary was five phrases
  (`artist`, `who made`, `who drew`, `who created`, `created by`) and matched
  none of "who is the true creator", so the question never reached the card
  index at all. And when the index does not answer, the question falls to
  retrieval, which composes from prose - including the last eight turns of the
  room, where anything the bot previously said reads as established.

  Attribution is now answered from the card index or not at all. The vocabulary
  covers how people actually ask - creator, made by, drawn by, whose card, who
  is behind, who did - and a question about who made "that card", where no card
  can be resolved, asks which card rather than reaching retrieval. Asking is the
  only answer that cannot be poisoned by what was said earlier in the room.

## [5.3.4] - 2026-08-20

### Fixed

- The bot credited the wrong artist for a card, confidently. "pepedawn who
  created djpepe ?" in the official channel was answered "DJPepe was created by
  rabbidfly." DJPEPE is a Rare Pepe, series 4, by Rare Scrilla.

  Two faults met. The structured lookup read the Fake Rares index alone, so
  DJPEPE - along with every other Rare Pepe and Fake Common, two thirds of the
  4,484 known assets - was invisible to it. And "pepedawn", typed only to
  address the bot, was matched as a card; its artist was then handed to the
  model as "THIS IS THE ANSWER, and it is exact", which the model duly attached
  to the card the user had actually asked about. The router carries five
  separate guards against its own name being read as a card, but all five sit
  downstream of this lookup, which short-circuits ahead of them.

  Card lookups now span all three collections, and name the collection when it
  is not Fake Rares - series numbering restarts in each, so "series 4" alone is
  not an answer. PEPEDAWN never outranks another card named in the same message,
  and counts on its own only when the phrasing is genuinely about the card. The
  bot-name test is now shared with the router rather than duplicated.

- Assets match as whole words. Matching was a substring scan, so a card name
  buried inside another word was read as a reference to that card - the same
  fault already fixed for artist names, where "RC" hid inside "scarcest".

### Changed

- An artist's largest/smallest supply now says "(Fake Rares)". That lookup only
  ever considered Fake Rares, and for an artist with cards in more than one
  collection - Rare Scrilla has both - an unqualified superlative was
  misleading.

## [5.0.0] - 2026-08-19

Conversational redesign. PEPEDAWN answers from data it actually has, says less,
and remembers the room. See
`telegram_docs/design_docs/PEPEDAWN_CHAT_V5.md` for the measurements behind each
decision.

### Removed — BREAKING

- **Commands `/fl`, `/fv`, `/ft`, `/dawn`, `/educate`** and everything that
  existed to warn about them. All had zero recorded use in the trailing quarter;
  lore, visual description and card questions are answered in conversation now.
- **Card discovery.** 546 router decisions, 60% of them not questions at all
  ("GM fakes...", "Woow BREAKUP is a wicked card!"). Genuine descriptor searches
  amounted to roughly two examples in 9.5 months.
- **ElizaOS bootstrap handoff.** Served 2.9% of conversations and was the sole
  reason the `__handledByCustom` sentinel was threaded through three files. The
  router now owns the decision end to end; anything it declines is silence.
- **The engagement-score filter.** It computed suppression, ran the entire router
  anyway, then applied the decision afterwards. Rate control is now the cadence
  governor, enforced in code.
- **LORE as a separate mode.** 0.8% of decisions, 69% of total LLM spend.
- **The PEPEDAWN disambiguator** — a model round-trip to decide whether
  "pepedawn" meant the bot or the card; the mention and reply flags already say.
- **The Telegram archive from all RAG.** Frozen at 2025-10-11, 22% of it
  misclassified as authoritative wiki, and its strongest hits were form-matches
  rather than answers. Set `RAG_INCLUDE_TELEGRAM=true` to compare.
- `visionAnalyzer`, `visualEmbeddings`, `embeddingsDb` and the 18MB
  `card-embeddings.json`, all reachable only from the removed commands.

Together ~2,355 of 11,483 LLM calls no longer happen.

### Added

- **Cadence governor** (`src/conversation/`) — share of voice, a ban on
  consecutive turns, a minimum gap and unaddressed backoff, with a full
  exemption when the bot is addressed. Replayed against 20,742 production
  events: worst 10-minute burst **67 → 10**, replies less than 60s apart
  **43.6% → 2.4%**.
- **Room temperature and a register ladder** so a wall of lore is structurally
  impossible while the room is bantering.
- **Exact card lookups** (`cardQueries.ts`) — artist, issuance, supply, series,
  an artist's largest or smallest card. The fact is produced by code; the model
  only wraps it.
- **Visual trait search** (`cardTraits.ts`) — "most red", "sexiest",
  "most psychedelic" answered from what the /fv pass recorded, via a 133KB index
  built by `scripts/build-card-traits.ts`.
- **Person-linked social memory** — episodes, highlights, quotes and reactions,
  scored by `similarity × decay × participantBoost` so a line from someone in
  the room outranks a better one from someone absent.
- **Persistent room history**, surviving the nightly 02:00 restart, feeding the
  classifier, CHAT and FACTS alike.
- **Follow-up resolution**: "who made it?" resolves to the card in play.
- **Card images alongside answers** — any reply about a card now shows it.
- `V5_SHADOW`, `V5_ENFORCE`, `CHAT_MODEL`, `RAG_INCLUDE_TELEGRAM`,
  `SHOW_SOURCES`; `scripts/run-testbot.sh`, `scripts/replay-cadence.ts`.

### Changed

- **Models → `gpt-5.6-luna`.** Outperforms the previous frontier tier at roughly
  a twelfth the input cost of the `gpt-4o` used for lore.
- Retrieval relevance floor raised to **0.45** across every source; measured mean
  similarity for chat retrieval was 0.34, i.e. mostly noise.
- CHAT grounds on card data, wiki and memories rather than old chat logs.
- Taste questions get an owned opinion or a randomly drawn card, never a
  justification built from supply numbers.
- `/fr` repositioned as the artist lore channel and restored to `/help`.

### Fixed

- `TelemetryService` used `logger` 17 times without importing it.
- `modelGateway` sent a `reasoning_effort` value the gpt-5.6 family rejects,
  which would have 400'd every call.
- Card answers echoed stub memories instead of the card manifest.
- Artist matching hit substrings — an artist named "RC" inside "sca**rc**est".
- Every card pool was the Fake Rares index, so a Fake Commons question was
  answered with a Fake Rare.
- `RoomHistory` lost turns when appends overlapped.
- Cadence could silence safety replies; it now sits below the content filters.

## [5.0.6] - 2026-08-19

### Fixed

- A direct question to the bot was answered with silence. "pepedawn how do YOU
  FEEL?" was classified NORESPONSE and ignored - twice, while the room watched
  and someone remarked "pepedawn is ignoring us". The classifier silences
  anything outside Fake Rares, and a question about the bot itself is off-topic
  by that rule. Being addressed now overrides an off-topic or closing
  classification, provided the message is actually a question. Hostility and
  one-word dismissals still pass through as silence.

## [5.0.5] - 2026-08-19

### Fixed

- The bot volunteered a card for ordinary conversation. "oh no, i get really
  awkward in small places when scrilla is there" was answered "DONALDTPEPE by
  Rodro - the vision pass recorded: get." followed by the card video. Three
  faults compounded and all three are fixed: trait search was never gated on the
  message concerning cards; the descriptive check was satisfied by the bare
  intensifier "really"; and arbitrary words were scored against recorded traits,
  so the word "get" picked a card.

  Trait search now runs only when the message concerns cards AND names a real
  visual quality, and only recognised descriptive vocabulary - colours, moods,
  styles - can score at all. Ordinary chatter now yields no search terms
  whatsoever, so a card cannot be named however the sentence is phrased.

## [5.0.4] - 2026-08-19

### Fixed

- Addressing the bot by plain name still pulled PEPEDAWN card lore into the
  answer. "pepedawn i wouldnt soul my soull, but what about loaning it out with
  %?" retrieved three memory and three card_data passages and replied about the
  card's symbolism. Stripping the name from the retrieval query required an
  @mention, a reply or a DM - but a plain vocative is none of those, and it is
  how people actually address the bot. Card-shaped phrasing is now the signal,
  not the delivery mechanism.

## [5.0.3] - 2026-08-19

### Fixed

- "Hey pepedawn, should I interpret what Scrilla said as a compliment?" was
  answered by prepending the PEPEDAWN card's specifications and posting its
  image. buildFactsPlan treated any mention of the name as a named card; 5.0.1
  had guarded the other two inference paths but not this one.
- A card the model invented in ordinary chat was displayed. "lol - more work to
  do" retrieved nothing at all, yet the reply recommended HELLAPAPELLA and the
  image was posted, because the display fallback showed any card named in a
  reply. It now requires that the user's message was about cards.
- Recent conversation never reached factual answers. The transcript was passed
  only to the LORE composition call, which is unreachable since LORE collapsed
  into FACTS, so "what Scrilla said" had no context to resolve against.

## [5.0.2] - 2026-08-19

### Fixed

- Personal questions were answered through whatever card happened to embed
  nearby. Retrieval runs for every CHAT turn and the preset weights card_data at
  2.4, so "if you had feelings, which would you have right now?" pulled six card
  fragments and the reply became "...the feeling behind FEELSMAGICAL". Card
  facts are now only offered as grounding when the message actually concerns
  cards. Addressing the bot by name is not a card signal, since PEPEDAWN is also
  a card.

## [5.0.1] - 2026-08-19

### Fixed

- The PEPEDAWN card was shown when "pepedawn" meant the bot. It is both a card
  and the bot's own name, and the bot says its name constantly ("PEPEDAWN
  endures"), so the card was surfacing in replies that had nothing to do with
  it. The card is never inferred from prose now; it is shown only when it is the
  explicit subject, which reaches the display path on the plan rather than by
  guessing. Inheriting it as "the card in play" for a follow-up also requires
  that a user asked about it as a card - possessive or attribute-seeking
  phrasing - rather than merely addressing the bot.

## [Unreleased]

### Added
- **v5 conversation core** (`src/conversation/`) — plain TypeScript, no ElizaOS imports
  - Register ladder (`SILENT`→`REACT`→`BANTER`→`ANSWER`→`DEEP`) separating *how much to say*
    from *what to look up*; retrieval is structurally impossible below `ANSWER`
  - Room temperature: caps register from message rate, terseness, participant count and
    question density. No LLM call
  - **Cadence governor**: code-enforced restraint — share of voice, consecutive-turn ban,
    minimum gap, unaddressed backoff, with a full exemption when the bot is addressed
  - Persistent room history, fixing the amnesia caused by the nightly 02:00 PM2 restart
- **Shadow mode** (`V5_SHADOW=true`) — observes live traffic and records what v5 *would*
  decide, without sending. Output in `src/data/shadow-logs.jsonl`
- `scripts/replay-cadence.ts` — replays the governor against production telemetry
- `TelemetryService.logCommandUsage()` → `command-logs.jsonl`, giving durable per-command
  data (PM2 logs rotate and left multi-month gaps)
- `CLAUDE.md` and `docs/TESTING_WITH_TEST_BOT.md`

### Changed
- **Deprecated `/dawn`, `/fl`, `/ft`, `/fv`, `/educate`** — zero recorded use in the
  trailing quarter. They still work and emit a notice naming their replacement; removable
  after 2026-11-18. Registry with the supporting usage data in
  `src/config/deprecatedCommands.ts`
- `/help` no longer lists deprecated commands and points at plain conversation
- Direct messages now count as addressing the bot, so group cadence rules do not apply
  in a 1:1 chat

### Fixed
- **`/fc` under-reported spend and had a breakdown that could never render.**
  Embedding calls were skipped by the runtime telemetry patch with a comment
  claiming they were "tracked separately" — nothing tracked them, and the
  embedding models were absent from `MODEL_PRICING`, so every total omitted
  them. They are now logged under a distinct `Embeddings` type, billed on input
  only, and priced for `text-embedding-3-{small,large}` and `ada-002`.
  Separately, `TokenLog.actionName` was aggregated into a **By Action** section
  that no caller ever populated. Model calls now inherit an ambient action label
  (`src/utils/actionContext.ts`, `AsyncLocalStorage`) set by `executeCommand()`
  and around the smart-router block, so the report distinguishes an explicit
  `/fl` from the same lore retrieval reached by auto-routing — the question
  `src/config/deprecatedCommands.ts` exists to answer. Rows predating this
  bucket as `(unattributed)` so the section still sums to the reported total
- `TelemetryService` bound its five JSONL paths at import time from
  `process.cwd()`, so a test could only redirect them by winning the import
  race — and lost it, appending fixtures to the production cost log. Paths now
  resolve per call and honour `TELEMETRY_DATA_DIR`
- `/fc` matched any command starting with those letters (`/fcarousel` was swallowed and
  answered nothing); the pattern is now anchored like every other command, and its
  dispatch branch no longer hides the always-handled behaviour behind an
  `if (executed || !executed)` tautology
- `TelemetryService` used `logger` 17 times without importing it — every call would have
  thrown at runtime. Repo typecheck errors dropped 61 → 46
- `RoomHistory` lost turns when appends overlapped; appends are now serialized per room
  and the read/append pair is atomic
- Removed the dead `educateNewcomerAction` import — never registered, unreachable

### Notes
- Measured against 20,742 production events: worst 10-minute burst **67 → 10**, replies
  less than 60s apart **43.6% → 2.4%**, share of traffic 34.4% → 21.7%
- **Card Lore Embedding Pipeline**
  - New scripts (`scripts/fv-crawl-sample.ts`, `fv-crawl-all.ts`, `fv-embed-card-facts.ts`, `fv-merge-card-facts.ts`) to crawl, embed, and consolidate Fake Rare lore.
  - `scripts/import-card-visual-facts.ts` and `types/cardVisualFacts.ts` to normalize visual lore facts.
  - Regenerated `plugin-knowledge-index.js` with embedding-backed card memory metadata.

### Changed
- `KnowledgeOrchestratorService`, `loreRetrieval`, and `queryClassifier` tuned to prioritize embedded card facts and improve `/fv` flows.
- Telegram message chunking now recombines short `/fl` replies into a single post.
- Lore/FACT auto-routing refined: exact card-name gating, sticky card memories, and LORE question auto-routing ensure `/fl` and card queries return precise stories.
- Submission rules and other global policy questions now bypass engagement suppression and link directly to the canonical wiki guide.
- `/fl` responses escape Telegram Markdown V2 characters and synthesize fallbacks to avoid empty or 1-word replies.

### Fixed
- `/fl` responses preserve newline formatting when lore memories contain escaped characters.
- Telegram plugin retries without Markdown when Telegram rejects entity parsing, preventing 400 errors.

### Tests
- Added regression coverage for newline normalization, Telegram Markdown fallback, and `/fv` lore retrieval behavior.

## [3.10.0] - 2025-11-06

### Added
- **`/fm CARDNAME`** - Real-time dispenser query for any card (e.g., `/fm FAKEASF`)
  - Fetches live dispenser data directly from Counterparty API
  - Shows top 5 cheapest dispensers with price, availability, address, and TokenScan link
  - Supports fuzzy matching for card names (exact match, then fuzzy fallback)
  - Compact bullet-point format for easy scanning
- New `DispenserQueryService` for real-time dispenser data fetching
- New `fuzzyMatch.ts` utility module (extracted from fakeRaresCard.ts for reusability)
- Test coverage for `/fm CARDNAME` validation and card name pattern matching

### Fixed
- **Telegram link previews** - Markdown links now render properly in both DMs and group chats
  - Added `link_preview_options: { is_disabled: true }` to messageManager DM path
  - Added `link_preview_options: { is_disabled: true }` to messageManager group path
  - Fixed missing `channelType` in action callback responses
  - All `/fm` responses now properly pass `channelType` for correct message routing

### Changed
- Updated `/help` command to include new `/fm CARDNAME` usage
- Updated periodic content tips to mention live dispenser queries
- Enhanced `/fm` command parser to differentiate between numeric limits and card names

### Technical Details
- messageManager now uses modern Telegram Bot API `link_preview_options` (replaces deprecated `disable_web_page_preview`)
- Action callbacks now properly propagate `channelType` from incoming messages to outgoing responses
- Fuzzy matching utilities now shared between `/f` and `/fm` commands

## [3.5.1] - 2025-11-04

### Changed
- Upgraded ElizaOS core packages to 1.6.3 (from 1.6.2)
- Updated `@elizaos/plugin-knowledge` to 1.5.13 (from 1.5.11)
- Updated `@elizaos/plugin-openai` to 1.5.18 (from 1.5.16)

### Technical Details
- Dependency upgrades tested and verified in worktree before merging to main
- No breaking changes in ElizaOS 1.6.3 affecting local Telegram fork
- Build and runtime compatibility confirmed

## [3.5.0] - 2025-11-04

### Added
- Local fork of `@elizaos/plugin-telegram` with all production fixes integrated
- Comprehensive attachment processing for `/ft` command (photos, videos, GIFs)
- Arweave video streaming download support (49MB limit, 5-minute timeout)
- Extended Telegraf handler timeout (300s) for large media processing
- Text cleaning utility to remove null bytes from content
- `FORK_MIGRATION.md` documentation for fork approach

### Changed
- **BREAKING:** Migrated from `patch-package` to local fork approach for Telegram plugin
- Removed `patch-package` from postinstall script
- Simplified postinstall to only run `postinstall-fix.sh` (claude-code stub)
- Updated message processing to extract all attachment types from incoming messages
- Improved error handling to prevent bot crashes on timeouts

### Fixed
- ✅ Buttons now appear under media attachments (GIFs, images, videos)
- ✅ GIF rendering uses native `replyWithAnimation()` for inline playback
- ✅ Arweave videos stream correctly without URL encoding issues
- ✅ Bootstrap suppression prevents double-processing of messages
- ✅ Short LLM responses (36-41 tokens) now send successfully via `mentionContext`
- ✅ Bot no longer crashes on large video processing timeouts
- ✅ Duplicate media sends eliminated (sequential processing with `sentPrimaryMedia` flag)
- ✅ `/ft` command properly extracts user-uploaded image attachments

### Removed
- Deleted old patch file (`@elizaos+plugin-telegram+1.0.10.patch`)
- Removed debug logging from build script
- Cleaned up temporary patch backup files

---

## [3.4.0] - 2024-XX-XX

### Added
- `/p` command for Rare Pepes collection browsing

---

## [3.3.2] - 2024-XX-XX

### Fixed
- Bootstrap reply detection improvements
- FACTS fallback handling

---

_For older releases, see git history._


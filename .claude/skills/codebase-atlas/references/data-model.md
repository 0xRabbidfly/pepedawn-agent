# The ATLAS object

One object, five keys, dropped into `assets/atlas-template.html` between the
`ATLAS DATA START` / `ATLAS DATA END` markers. Nothing else in the template needs
to change for a new repository — except the palette and typefaces, which should be
re-derived for the subject.

---

## meta

```js
meta: {
  repo: "owner · repo-name",       // title block, left cell
  short: "repo-name",              // eyebrow in the explainer panel
  version: "5.6.0",                // from package.json / Cargo.toml / pyproject
  title: "The Answer Machine",     // 2-4 words, the page's name, not a category
  subtitle: "how a message becomes an answer, and what it costs",
  stats: [ { label: "TypeScript", value: "39,032 lines" }, … ],   // 5-7 measured facts
  intro: {
    does:  [ { h: "Section head", p: ["paragraph", "paragraph"] }, … ],
    built: [ { h: "Section head", p: ["…"] }, … ]
  }
}
```

`intro.p` strings are inserted as HTML, so `<mark>`, `<code>` and
`<span class="warn">` all work. Use `<mark>` two or three times per page, on the
phrases that carry the argument — more than that and the emphasis stops meaning
anything.

`stats` becomes the drawing's title block. Good stats are the ones a reader would
otherwise have to run a command to learn: total lines, number of long-lived
services, rows in the main store, records in the log, commits, age.

---

## groups

```js
groups: [ { title: "The decision", ids: ["R", "F", "C", "K"] }, … ]
```

The index rail, in reading order. Title them by role, not by directory. Every node
should appear in exactly one group; a node missing from every group is invisible in
the rail (it still draws).

---

## nodes

```js
K: {
  key: "K",                    // one or two characters, drawn on the block
  label: "Knowledge orchestrator",
  kind: "core",                // "core" building | "store" plates | "ext" dashed
  cell: [14.6, 4.4],           // plan coordinate; +gx right-down, +gy left-down
  w: 3.2, d: 3.2, h: 4.3,      // footprint in tiles, height in units
  plates: 5,                   // stores only — number of stacked slabs, h ignored
  loc: 2172,                   // lines of code, or rows for a store; shown in the rail
  tag: "tallest thing here",   // short epithet under the title
  does: "…",                   // plain language, reader's side
  built: "…",                  // the mechanism
  condition: "…",              // what is wrong, surprising, or load-bearing
  files: [ { p: "src/services/KnowledgeOrchestratorService.ts", n: 2172 } ],
  inside: [ { t: "expandQuery", d: "…" }, … ]   // optional drill-in scene
}
```

Sizing conventions that make the drawing legible at a glance:

| what | how |
|---|---|
| height `h` | lines of code ÷ ~500, floored at 0.9. The biggest file must be the tallest thing. |
| footprint `w`/`d` | 2.0 for a single-purpose file, 2.4–2.6 for a subsystem, 3.0+ for the one or two structures everything passes through. |
| `plates` | 3 for a small store, 5–6 for the main one. |
| `kind: "ext"` | anything outside the process: third-party APIs, the database daemon, the platform you deploy on. Drawn dashed and unfilled. |

`inside` turns the block into something you can enter. Reserve it for the three or
four structures where the internal order is the interesting part — a router's
ladder of checks, a pipeline's stages. Each step's `t` is the real function name
(shown in monospace, casing preserved) and `d` is why it exists.

---

## edges

```js
edges: [
  { from: "G", to: "R", label: "planRouting", payload: "plan-in", kind: "spine" },
  { from: "R", to: "J", label: "decision",    payload: "router",  kind: "log" }
]
```

Real control and data flow — what calls what at runtime, not what imports what.

- `kind: "spine"` — the main path; drawn heavier. Usually 5–8 edges.
- `kind: "log"` — write-only telemetry; drawn dashed and faint.
- `payload` — key into `payloads`. Every edge with one gets a clickable moving dot.
  Edges without a payload draw as static lines, which is the right choice for
  relationships that do not carry data.

Edges route in an L along the grid and pass **under** blocks, as in a drafting
plan. If a run looks confusing, move a node rather than adding a waypoint.

---

## payloads

```js
payloads: {
  token: {
    title: "Token receipt",
    note: "Why it looks like this — the constraint or the bug it encodes.",
    src: "src/data/token-logs.jsonl",
    body: '{\n  "model": "gpt-5.6-luna",\n  "tokensIn": 775,\n  "cost": 0.0002138\n}'
  }
}
```

`body` is a JS string: escape newlines as `\n`, and mind the quotes. It renders
verbatim in a monospace block, so keep the real key order and the real formatting.

Where to find real ones:

```bash
tail -1 path/to/log.jsonl | python3 -m json.tool     # last real record
ls src/data/*.jsonl && wc -l src/data/*.jsonl        # what streams exist at all
grep -rn "createMemory\|emitEvent\|res.json(" src | head    # shapes in flight
```

Redact before pasting: usernames, emails, tokens, wallet addresses, anything that
identifies a person. Truncate ids with `…` rather than inventing replacements — a
reader can tell the difference and it is the difference between a document they
trust and one they do not.

---

## Engine knobs

At the top of the script in the template:

| constant | default | what it does |
|---|---|---|
| `TW`, `TH` | 34, 17 | tile half-width and half-height; the isometric ratio |
| `HZ` | 27 | pixels per height unit — raise it if the blocks read as tiles rather than buildings |
| `SPREAD` | 1.55 | multiplies every `cell` coordinate; raise it if labels collide |

`fit()` measures the block layer, not the grid, so the drawing fills the canvas
regardless of how far the grid extends. Zoom is capped at 1.9 in the main scene
and 1.0 inside a structure.

## Debug hooks

`window.__atlas` exposes `select(id)`, `goInside(id)`, `showPayload(key)` and
`tab("does"|"built"|"payload")` — enough to drive a screenshot harness over every
state of the page without clicking anything.

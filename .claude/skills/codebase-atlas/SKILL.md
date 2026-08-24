---
name: codebase-atlas
description: Draw a codebase as an explorable isometric map — structures sized by real line counts, edges that follow real control and data flow, and moving dots carrying real payloads you can click and inspect. Produces one self-contained HTML page, publishable as an Artifact, meant to be read alongside a model when discussing the system. Use when asked to visualize, map, diagram, or explain the architecture of a repository, or for an onboarding or system-overview page.
---

# Codebase atlas

An atlas is not a dependency graph. A dependency graph is generated; an atlas is
**drawn** — it takes a position on what the system is for, what the hard part is,
and which of twenty modules actually matter. The reader should be able to point at
a block and say "open that one", and be right.

The output is a single HTML file: an isometric drawing in the middle, an index of
structures on the left, an explainer panel on the right, and payload-carrying dots
moving along the edges. `assets/atlas-template.html` is the working engine — you
supply one `ATLAS` object and it draws itself.

## What makes it worth reading

Three rules, in priority order:

1. **Every number is measured.** Line counts, record counts, table sizes, poll
   intervals, weights, thresholds. If you cannot produce the command that yields
   the number, cut the number.
2. **Every payload is real.** The dots are the feature. Lift actual records out of
   log files, fixtures, seed data, or a live store, then redact anything personal.
   A plausible-looking invented JSON blob destroys the credibility of the whole page.
3. **Say what is wrong.** Each structure gets a `condition` — the surprise, the
   scar, the load-bearing hack. That is the part a reader cannot get from the file
   tree, and it is usually already written in the comments of the biggest files.

## Process

### 1. Survey before you draw

Do not read every file. Measure first, then read the top of the distribution.

```bash
# size distribution — this is your height axis and your shortlist
find src -name '*.ts' -not -path '*__tests__*' | xargs wc -l | sort -rn | head -40

# real import edges, module to module
grep -rhoE "from ['\"][./][^'\"]+['\"]" src --include=*.ts | sort | uniq -c | sort -rn

# entry points, long-lived things, timers, external calls
grep -rn "extends Service\|setInterval\|new OpenAI\|fetch(\|https://" src --include=*.ts | head -40

# durable state
ls -la src/data/ && du -sh .cache .db data 2>/dev/null

# history: how much of this is one person's week, and how much is five years
git log --oneline | wc -l && git log -1 --format=%cd
```

Then read, in this order: the entry point, the two or three largest files, and any
design doc in the repo. The largest files are large for a reason and the reason is
usually in their header comment — that is where `condition` comes from.

### 2. Find the spine

Name the single path one unit of work takes end to end: request → … → response,
message → … → reply, file → … → artifact. The spine is the drawing's argument.
Mark those edges `kind: "spine"` so they render heavier, and describe them in the
intro prose so the reader knows what they are looking at.

Everything else is: what feeds the spine, what the spine reads from, what runs with
nobody asking, and what is outside the process.

### 3. Choose 15–25 structures

Fewer than 12 and it is a box diagram; more than 25 and nothing can be labelled.
Group by role rather than by folder — "the decision", "what it knows", "work with
no one asking" — because folders are an implementation detail and roles are what a
reader is looking for.

Merge freely: four files that only ever act together are one structure with four
files listed under it. Split when one file is genuinely two jobs.

### 4. Lay it out by hand

`cell: [gx, gy]` is a plan coordinate; `+gx` runs right-and-down and `+gy`
left-and-down on screen. Put the spine across the middle, inputs at one end,
stores along one flank, background work along the other. Leave two clear tiles
between neighbours — labels sit under each block and collide otherwise.

Height comes from size: pick `h` so the largest file in the repo is the tallest
structure on the page and a 200-line helper is visibly a shed. Stores use `plates`
instead of height, so data at rest reads differently from code that decides things.

### 5. Write the prose like a person

Each structure carries `does` (plain language, what it is for), `built` (the
mechanism), and `condition` (what is wrong or surprising). Write `does` from the
reader's side — "decides whether to answer at all", not "orchestrates the routing
subsystem". No filler: if a structure has nothing interesting in `condition`, omit
the field rather than padding it.

### 6. Verify by looking at it

You cannot lay out an isometric drawing blind. Screenshot after every layout
change:

```bash
google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size=1600,1000 --virtual-time-budget=4000 \
  --screenshot=/tmp/atlas.png "file://$PWD/atlas.html"
```

Then read the PNG and fix what you see. Expect three rounds. The recurring faults
are: blocks too crowded (raise `SPREAD`), buildings too flat (raise `HZ`), the
drawing floating small in the middle (the fit is measuring the grid, not the
blocks), labels buried under neighbouring blocks.

The template exposes `window.__atlas.select(id)`, `.goInside(id)`, `.showPayload(key)`
and `.tab(name)`, so you can screenshot the selected, drilled-in, dark-theme and
payload states too — append a small script to a throwaway copy of the file and
shoot that. Check dark theme explicitly by stamping
`document.documentElement.setAttribute('data-theme','dark')`.

### 7. Publish

Write the file into the repo (`docs/atlas/<repo>-atlas.html` works well), then
publish it with the Artifact tool so it has a URL to share. Load the
`artifact-design` skill first and re-derive the palette and typefaces for the
subject — the template ships a drafting-blueprint identity that suits systems
work, but a different subject deserves different choices. The engine is the
reusable part; the visual identity should not be.

## Interactions the engine already provides

- click a structure → reads it in the right panel, lights its edges
- click a moving dot → opens that payload under the Payload tab
- **Go inside** a structure with an `inside` list → a second scene of its steps in
  execution order; Esc or **Come back out** returns
- pause / resume the flow, trace one step, reset view, zoom, drag-pan
- keyboard: Space pauses, `.` steps, arrows pan, Esc comes back out
- light and dark themes, both tokenised

## Field reference

`references/data-model.md` — every field of `ATLAS`, what belongs in it, and the
extraction recipes that produce it.

## Porting this to another repository

The skill is a directory with no dependencies on this project:

```bash
cp -r .claude/skills/codebase-atlas ~/.claude/skills/          # available everywhere
cp -r .claude/skills/codebase-atlas /path/to/other/repo/.claude/skills/   # one project
```

The survey commands in step 1 are written for a TypeScript repo. For another
language, swap the file glob and the "long-lived thing" grep — `class .*Service`
becomes `@app.route` or `func main` or `impl .* for` — and keep everything else.
The engine does not care what the code is written in.

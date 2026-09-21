# What's new — the posts PEPEDAWN makes about itself

One section per version. The first time a build carrying that version comes up,
the section is posted **verbatim** to the release-notes channel, once, and never
again. A version with no section here posts nothing, which is the right answer
for most releases.

Rules for writing one, learned the hard way:

- **Write it for the room, not for us.** Things a member would notice. Not
  flags, not file paths, not refactors.
- **Never name anything that is meant to stay quiet.** Unlisted commands are
  unlisted: `/aboutme` and `/forget` are shared by word of mouth, so they do not
  appear here. See `src/actions/memoryCommands.ts`.
- **Short and flashy.** A handful of lines, an emoji each. It is an
  announcement, not a changelog.
- **Plain text.** It is sent with no parse_mode, so `*bold*` and `<b>` arrive as
  literal asterisks and tags. Emoji and line breaks are the formatting.
- HTML comment lines are stripped, so notes to the next writer can live inside a
  section.

<!-- Sections are ## [x.y.z], matching CHANGELOG.md. Newest first. -->

## [5.11.0]

⚡ PEPEDAWN — v5.11.0

🤐 I don't barge into your conversations any more.
   Two of you talking? I sit on my hands.

🧠 I remember a few things about the regulars now.
   Talk to me enough and it shows.

🗣 Want me? Say my name, reply to me, or fire a command.

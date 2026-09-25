# Persona: Kasia (primary)

The reference persona for UX decisions in this plugin. Requirements that
contradict her needs get cut, not deferred politely.

## Who she is

Kasia, 27, medical student. 2,500 notes in Anki across four decks (Anatomy,
Pharmacology, English, Lecture notes). She **writes her notes in Obsidian** and
uses Anki only for review, on desktop and phone. She imported one shared deck
once, at the start; everything she wrote herself came later, from Obsidian.

## How a week looks

- Writes lecture notes in Obsidian during the day, as Markdown with
  `note-form` blocks.
- Exports a note to Anki right after writing it, sometimes a batch of ten at
  the end of a session.
- Fixes mistakes in both places: a typo in Anki, a better wording in Obsidian
  after re-reading the lecture.
- Runs Sync two or three times a week, and before every exam session.
- Deletes a note in the vault when she realises the whole card is wrong. The
  Anki note usually stays, and that is fine.
- Moves notes between decks while reorganising for the exam.

## What she wants

- "The newest version wins" without her having to decide per note.
- Never lose an edit, on either side, silently.
- See what will happen **before** she clicks: what changed, which side is
  newer, which file gets overwritten.
- Never touch YAML, never configure per-model packs, never learn what a
  "snapshot" is.
- One button for the frequent action. The palette may hold the rare ones.

## What she refuses to do

- Read a report like `purged records: 3` without a sentence of context.
- Choose between six commands to figure out which one refreshes her notes.
- Open Settings to make routine work happen.
- Manage tags globally, cards individually, or deck scheduling settings.

## Her pain today (what the audits found)

- The import preview collapses `ankiNewer`, `vaultNewer` and `diverged` into a
  single "updated" badge, so she cannot tell that confirming will overwrite a
  newer Obsidian edit.
- Editing a note-form writes on blur with no validation, no "saved"
  confirmation, and a silent no-op when the file changed underneath her.
- A record whose note is gone from Anki is purged with a bare counter, and
  `Export to Anki` aborts on modern AnkiConnect because of one removed action.
- A note added by hand in Anki is skipped without any mention in the report.
- A note exported to a deck outside the imported snapshots is outside Sync's
  reach, and ignored directories still get IDs written into them.

## Success criteria

1. Sync is one command, it never destroys data, and its report explains every
   number.
2. Before any write, the user sees the direction of every change and can
   override it per note.
3. Creating a note, exporting it, re-importing it and syncing it later is a
   loop with no surprises and no duplicate notes or files.
4. A note edited in both places resolves to the newer one; the loser is
   never silently discarded without being named in a report.
5. Nothing outside the folders she excluded is ever read or written.

# Persona: Tomek (secondary)

Tomek, 40, has a finished 8,000-note deck he does not want to reorganise. He
imports it once and then ignores the plugin. The import wizard must stay a
three-step path that works without any new onboarding screen, mapping screen
or first-run modal standing between him and his files.

# Anti-goals

- Per-card operations (suspend one side, reschedule, flags).
- Changing a note's notetype on an existing note (AnkiConnect cannot).
- A card-level layer alongside the note layer.
- Global tags, per-deck plugin settings, deck presets.
- Any command whose purpose cannot be stated in one line on the palette.

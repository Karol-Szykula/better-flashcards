 TODO

- [ ] ImportWizard: extract syncState useMemo into named buildNoteSyncState
- [ ] Integration tests: end-to-end happy path + data.json
- [ ] Integration tests: model simple paths (getSimplePaths) as regression pack
- [ ] Integration tests: reimport after card edit (no media duplicates)
- [ ] Integration tests: Cancel/error on Save, Anki down on every page
- [ ] GUI tests: Save without folder, label↔checkbox, selection reset, report/error
- [ ] Wizard integration tests: XState model (xstate/graph) + Mermaid diagram in docs
- [ ] Wizard Cards: label click toggles checkbox
- [ ] Wizard Cards: clear card selection on deck change (wrong counter)
- [ ] Wizard Cards: vertically align checkbox with label (CSS)
- [ ] Sync: file hash per note + diverged state (detect Obsidian-side edits)

- [ ] Model packs: pack carries model + field mapping, nothing more until needed
  - [ ] Built-in packs shipped with plugin
  - [ ] User packs from own decks, added as needed
  - [ ] Pack = JSON, one file per pack
  - [ ] UI: preset select above mapping table in step 2


- [ ] Bundle size: fix 5MB main.js
  - [ ] Remove inline sourcemap (sourcemap: true or false for production)
  - [ ] Move base64 constants (highlightjs, highlightCss, flashcardsIcon) to npm deps / runtime assets
  - [ ] Ensure production React build (NODE_ENV=production)
  - [ ] Target bundle size < 500KB


  Goal:
  One button/command syncs everything: newest version wins everywhere,
  even when edited in both places. Sync only by Anki noteId.

  Card states (state = existence x id x sync record x dirtiness):
  - A1: Anki-only, never imported, no sync record -> import (create file).
    In Sync: import everything that has field mappings.
  - A2: Anki-only, has sync record, file deleted in vault -> tombstone
    rule (U1/U2): resurrect iff Anki mod is newer than deletion.
  - B0: both sides, clean (mod and hash match records) -> do nothing.
  - B1: only Anki newer -> push Anki -> vault.
  - B2: only vault newer -> push vault -> Anki.
  - B3: both dirty -> compare Anki mod vs file mtime, newer wins.
  - B4: linked by ID but no sync record -> enroll (store mod + hash),
    then handle as B0-B3.
  - C1: vault-only, no ID, never uploaded -> export (create in Anki,
    write back ID + sync records).
  - C2: vault-only, has ID, no sync record (lost data.json, manual ID)
    -> match by hash, enroll, then handle as B0-B3.
  - C3: vault-only with ID + sync record, note gone in Anki -> delete
    file, purge records + tombstone (Anki deletion always wins).
  - D: nowhere, stale sync records -> purge records.
  - Missing nuance: missing file and missing block inside an existing
    file both count as missing; never recreate either.
  - Origin matters exactly once: an Obsidian-born card without ID must
    go through export (C1) first; afterwards origin is irrelevant.

  Agreed sync mechanics:
  - U1: tombstones on vault delete event (reverse path -> noteId index,
    persisted noteId -> deletedAt); cleaned on sync when the note is
    also gone in Anki.
  - U2: no tombstone (deleted outside Obsidian): Anki newer than recorded
    mod -> resurrect, otherwise respect deletion (purge, no recreate).
  - U3: Anki deletion wins unconditionally (AnkiConnect has no deletion
    timestamps); delete file even with vault edits.
  - U4: tie-break Obsidian wins by default; settings syncTieWinner
    ("obsidian" | "anki") + syncTieThresholdSec = 60; ties are reported.
  - U5: missing files/blocks are skipped, counted, never recreated.
  - U6: diverged cards are overwritten on import, counted separately
    (overwrittenDiverged).
  - U7: mtime (TFile.stat.mtime, ms) is the vault-side clock vs Anki mod
    (unix seconds); own writes are safe because verdicts go through
    hashes first.

  Agreed model regime:
  - M1: export targets the source model (extra.model); new Obsidian
    cards always go to built-in Basic (no reverse, no cloze detection).
  - M2: plugin models (Obsidian-*) are dead: remove createModels,
    getModels; Yamlcard fallback is "Basic".
  - M3: ensure-defaults on every export (and in first-run modal):
    modelNamesAndFieldNames check, create missing built-ins, skip +
    report on schema mismatch, never touch user templates.
  - M4: cloze branch matches both families (Obsidian-cloze and "Cloze");
    Extra -> Back Extra on export to built-in Cloze (schema TBD, verify
    against live Anki during implementation: Text + Back Extra).
  - M5: mapping targets mirror Anki built-ins only: Front, Back, Text,
    Back Extra (+ Skip as UI chrome, not a field).
  - M6: exact-name (case-sensitive) auto-mapping; user maps surplus
    fields only; unmappable stays Skip; auto rows read-only, no override.
  - M7: Add Reverse always Skip (card-generation control flag, never
    content); shown greyed out like other surplus rows.
  - M8: drop spaced (no Anki equivalent), drop code-highlight (plugin-only,
    removes base64 constants ~437KB), drop Source entirely (setting,
    constant, -source variants, link injection).
  - M9: old stored mappings (Extra/Prompt/Source) degrade to presets via
    existing resolveFieldMapping validation, no data migration.

  Work items:
  - [ ] UC-01: first import via wizard (decisions, mappings, media)
  - [ ] UC-02: fast reimport (Fast import command)
  - [ ] UC-03: import of exported notes (match by ID, no duplicates)
  - [ ] UC-04: resurrect vault-deleted files by tombstone vs mod (A2)
  - [ ] UC-05: first export (target model, write back ID + sync records)
  - [ ] UC-06: reexport (match -> update)
  - [ ] UC-07: export of imported notes (round-trip without ping-pong)
  - [ ] UC-08: B3 newest-wins (mod vs mtime)
  - [ ] UC-09: time tie (syncTieWinner + threshold + report)
  - [ ] UC-10: C3/A2 deletions + tombstone cleanup
  - [ ] UC-11: single Sync command + aggregate report
  - [ ] UC-12: tombstones (vault delete event, reverse index, cleanup)
  - [ ] UC-13: matcher end-to-end (ID-less block + known hash -> fill ID)
  - [ ] UC-14: export writes sync records (one ledger for both directions)
  - [ ] UC-15: first-run modal (map all models -> verify defaults ->
    full sync for mapped models only)
  - [ ] UC-16: invariance tests (idempotent and convergent sync)
  - [ ] UC-17: cuts (spaced, code-highlight, Source) incl. their tests
  - [ ] UC-18: model layer (modelNamesAndFieldNames service + mock,
    built-in definitions, ensure-defaults, Yamlcard fallback)
  - [ ] UC-19: mapping UI (surplus-only rows, read-only auto rows,
    ankiDefaultFields constant, extra->backExtra renames)
  - [ ] Round-trip fixtures from real cards (parked, back after sync)

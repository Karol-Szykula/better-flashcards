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

- [ ] Per-action AnkiConnect params types (with import work)
- [ ] notesInfo chunking by 100: add test (code exists)
- [ ] Incremental vault index (when full scan hurts)

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


  Cases:
  - import
    - first time / wizard import
    - fast reimport
    - import of exported notes
  - export
    - first export ?
    - reexport
    - export of imported notes
  - sync
    - sync from newest to oldest direction, only with Anki noteId

How matters the place of note creation? Was it created in Obsidian or was it created in Anki?

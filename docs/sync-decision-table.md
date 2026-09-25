# Sync decision table

What each command may do with a note in each lifecycle state. Generated from
`src/services/sync-decision.ts` by `pnpm run doc:sync-table` and pinned by the
anti-drift test in `tests/services/sync-decision.test.ts`, so the document cannot
drift from the code.

`OUT_OF_SCOPE` means this command deliberately leaves the note to the command
named in `owner`: a wizard never resolves a conflict by clocks, and a note the
command has no business touching is a named cell rather than a silent skip. The
`forced` column is the per-row force ("Anki wins" in the import wizard,
"Obsidian wins" in the export wizard); `-` means the force changes nothing.
Sync has no force dimension: it is the one command that decides on its own.

## import (force: Anki wins)

| state | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `IMPORT` | `-` | `import` | Only Anki has it and the vault never had it: write the file and enrol the note. |
| `ankiOnly.fileDeleted` | `OUT_OF_SCOPE` | `RESURRECT` | `sync` | The file is gone and Sync owns the rule (resurrect iff Anki is newer); the wizard never resurrects on its own, and only Anki wins re-creates the file. |
| `synced.clean` | `CHECK` | `-` | `sync` | Both sides match the record: the wizard writes nothing and says which file already carries the note. |
| `synced.ankiNewer` | `PULL` | `-` | `sync` | Anki is newer: refresh the vault file with Anki's version. |
| `synced.vaultNewer` | `OUT_OF_SCOPE` | `FORCE_PULL` | `sync` | Obsidian is newer: import never overwrites a newer edit - the user forces this one note or Sync decides. |
| `synced.diverged` | `OUT_OF_SCOPE` | `FORCE_PULL` | `sync` | Edited in both places: import never resolves a conflict by clocks - the user forces it or Sync takes the newest. |
| `linked.unenrolled` | `ENROLL` | `-` | `wizard` | The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*. |
| `vaultOnly.unexported` | `OUT_OF_SCOPE` | `-` | `export` | Only the vault has it and Anki has never seen it: the export wizard creates it. |
| `vaultOnly.unenrolled` | `ENROLL` | `-` | `wizard` | The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*. |
| `vaultOnly.ankiDeleted` | `OUT_OF_SCOPE` | `-` | `sync` | The note is gone from Anki: Sync applies the deletion; Obsidian wins re-creates it in the export wizard. |
| `orphaned` | `OUT_OF_SCOPE` | `-` | `purge` | Nothing in Anki, nothing in the vault, only a stale record: Purge ledger forgets it, no command acts on the note. |

## export (force: Obsidian wins)

| state | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `OUT_OF_SCOPE` | `-` | `import` | Only Anki has it: the import wizard brings it into the vault. |
| `ankiOnly.fileDeleted` | `OUT_OF_SCOPE` | `-` | `sync` | The vault file is gone: Sync owns the deletion rule and the export has nothing to push. |
| `synced.clean` | `CHECK` | `-` | `sync` | Both sides match the record: nothing is written to Anki. |
| `synced.ankiNewer` | `OUT_OF_SCOPE` | `FORCE_PUSH` | `sync` | Anki is newer: export never overwrites it - the user forces it or Sync pulls. |
| `synced.vaultNewer` | `PUSH` | `-` | `export` | Obsidian is newer: push the change to Anki and store the new baseline. |
| `synced.diverged` | `OUT_OF_SCOPE` | `FORCE_PUSH` | `sync` | Edited in both places: export does not guess - Obsidian wins forces it, Sync takes the newest. |
| `linked.unenrolled` | `ENROLL` | `-` | `wizard` | The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*. |
| `vaultOnly.unexported` | `EXPORT` | `-` | `export` | Only the vault has it: create the Anki note and write the new id back into the block. |
| `vaultOnly.unenrolled` | `ENROLL` | `-` | `wizard` | The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*. |
| `vaultOnly.ankiDeleted` | `OUT_OF_SCOPE` | `EXPORT` | `sync` | The note was deleted in Anki: Sync applies the deletion, Obsidian wins re-creates it on demand. |
| `orphaned` | `OUT_OF_SCOPE` | `-` | `purge` | Nothing in Anki, nothing in the vault, only a stale record: Purge ledger forgets it, no command acts on the note. |

## import (force: Anki wins)

| state | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `IMPORT` | `-` | `import` | Only Anki has it and the vault never had it: write the file and enrol the note. |
| `ankiOnly.fileDeleted` | `OUT_OF_SCOPE` | `RESURRECT` | `sync` | The file is gone and Sync owns the rule (resurrect iff Anki is newer); the wizard never resurrects on its own, and only Anki wins re-creates the file. |
| `synced.clean` | `CHECK` | `-` | `sync` | Both sides match the record: the wizard writes nothing and says which file already carries the note. |
| `synced.ankiNewer` | `PULL` | `-` | `sync` | Anki is newer: refresh the vault file with Anki's version. |
| `synced.vaultNewer` | `OUT_OF_SCOPE` | `FORCE_PULL` | `sync` | Obsidian is newer: import never overwrites a newer edit - the user forces this one note or Sync decides. |
| `synced.diverged` | `OUT_OF_SCOPE` | `FORCE_PULL` | `sync` | Edited in both places: import never resolves a conflict by clocks - the user forces it or Sync takes the newest. |
| `linked.unenrolled` | `ENROLL` | `-` | `wizard` | The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*. |
| `vaultOnly.unexported` | `OUT_OF_SCOPE` | `-` | `export` | Only the vault has it and Anki has never seen it: the export wizard creates it. |
| `vaultOnly.unenrolled` | `ENROLL` | `-` | `wizard` | The block carries an id that no record knows (fresh data.json or a hand-written id): enrol it against the Anki note, write nothing, then handle it as synced.*. |
| `vaultOnly.ankiDeleted` | `OUT_OF_SCOPE` | `-` | `sync` | The note is gone from Anki: Sync applies the deletion; Obsidian wins re-creates it in the export wizard. |
| `orphaned` | `OUT_OF_SCOPE` | `-` | `purge` | Nothing in Anki, nothing in the vault, only a stale record: Purge ledger forgets it, no command acts on the note. |

## sync (force: no force)

| state | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `OUT_OF_SCOPE` | `-` | `import` | An untracked Anki note is counted as needing import; Sync only touches tracked notes. |
| `ankiOnly.fileDeleted` | `OUT_OF_SCOPE` | `-` | `sync` | A tracked note with no file: the purge path handles it outside the resolver today, the tombstone rule arrives with UC-30. |
| `synced.clean` | `CHECK` | `-` | `sync` | Both sides match the record: nothing to do. |
| `synced.ankiNewer` | `PULL` | `-` | `sync` | Anki is newer: refresh the vault file. |
| `synced.vaultNewer` | `PUSH` | `-` | `sync` | Obsidian is newer: push to Anki. |
| `synced.diverged` | `RESOLVE_NEWEST` | `-` | `sync` | Edited in both: the newer side wins (Anki mod against file mtime), ties are reported. |
| `linked.unenrolled` | `OUT_OF_SCOPE` | `-` | `wizard` | Enrolling is the wizards' job; Sync counts these as needing import. |
| `vaultOnly.unexported` | `OUT_OF_SCOPE` | `-` | `export` | Only the vault has it: the export wizard creates it. |
| `vaultOnly.unenrolled` | `OUT_OF_SCOPE` | `-` | `wizard` | A block with an id and no record: the wizards enrol it. |
| `vaultOnly.ankiDeleted` | `OUT_OF_SCOPE` | `-` | `sync` | The note is gone from Anki: the deletion is applied by the purge path today, DELETE_FILE arrives with UC-31. |
| `orphaned` | `OUT_OF_SCOPE` | `-` | `purge` | Nothing in Anki, nothing in the vault, only a stale record: Purge ledger forgets it, no command acts on the note. |
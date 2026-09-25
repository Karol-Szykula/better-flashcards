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

## export (force: Obsidian wins)

| state | kind | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `create` | `OUT_OF_SCOPE` | `-` | `import` | Anki only: the import wizard brings it in. |
| `ankiOnly.fileDeleted` | `missing` | `OUT_OF_SCOPE` | `-` | `sync` | File gone: Sync decides, nothing to push. |
| `synced.clean` | `quiet` | `CHECK` | `-` | `sync` | Both sides match: nothing to write. |
| `synced.ankiNewer` | `skip` | `OUT_OF_SCOPE` | `FORCE_PUSH` | `sync` | Newer in Anki: skipped, use Sync. Forced: Obsidian wins: overwrites Anki. |
| `synced.vaultNewer` | `overwrite` | `PUSH` | `-` | `export` | Newer in Obsidian: pushes to Anki. |
| `synced.diverged` | `conflict` | `OUT_OF_SCOPE` | `FORCE_PUSH` | `sync` | Edited in both: skipped, use Sync. Forced: Obsidian wins: overwrites Anki. |
| `linked.unenrolled` | `quiet` | `ENROLL` | `-` | `wizard` | Has an id but no record: enrols it, writes nothing. |
| `vaultOnly.unexported` | `create` | `EXPORT` | `-` | `export` | Vault only: creates the Anki note, writes the id back. |
| `vaultOnly.unenrolled` | `quiet` | `ENROLL` | `-` | `wizard` | Has an id but no record: enrols it, writes nothing. |
| `vaultOnly.ankiDeleted` | `missing` | `OUT_OF_SCOPE` | `EXPORT` | `sync` | Gone from Anki: Sync applies the deletion. Forced: Obsidian wins: re-creates it in Anki. |
| `orphaned` | `missing` | `OUT_OF_SCOPE` | `-` | `purge` | Only a stale record left: Purge ledger forgets it. |

## import (force: Anki wins)

| state | kind | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `create` | `IMPORT` | `-` | `import` | Anki only: creates the file. |
| `ankiOnly.fileDeleted` | `missing` | `OUT_OF_SCOPE` | `RESURRECT` | `sync` | File gone: Sync decides, Anki wins re-creates it. Forced: Anki wins: re-creates the file you deleted. |
| `synced.clean` | `quiet` | `CHECK` | `-` | `sync` | Both sides match: rewrites nothing. Forced: Anki wins: rewrites the same content. |
| `synced.ankiNewer` | `overwrite` | `PULL` | `-` | `sync` | Newer in Anki: overwrites your file. |
| `synced.vaultNewer` | `skip` | `OUT_OF_SCOPE` | `FORCE_PULL` | `sync` | Newer in Obsidian: skipped, use Sync. Forced: Anki wins: overwrites your newer edits. |
| `synced.diverged` | `conflict` | `OUT_OF_SCOPE` | `FORCE_PULL` | `sync` | Edited in both: newest wins on Sync. Forced: Anki wins: overwrites your newer edits. |
| `linked.unenrolled` | `quiet` | `ENROLL` | `-` | `wizard` | Has an id but no record: enrols it, rewrites the same file. |
| `vaultOnly.unexported` | `create` | `OUT_OF_SCOPE` | `-` | `export` | Vault only: the export wizard creates it. |
| `vaultOnly.unenrolled` | `quiet` | `ENROLL` | `-` | `wizard` | Has an id but no record: enrols it, rewrites the same file. |
| `vaultOnly.ankiDeleted` | `missing` | `OUT_OF_SCOPE` | `-` | `sync` | Gone from Anki: Sync deletes the file. |
| `orphaned` | `missing` | `OUT_OF_SCOPE` | `-` | `purge` | Only a stale record left: Purge ledger forgets it. |

## sync (force: no force)

| state | kind | default | forced | owner | why |
| --- | --- | --- | --- | --- |
| `ankiOnly.neverImported` | `create` | `OUT_OF_SCOPE` | `-` | `import` | Untracked Anki note: counted as needing import. |
| `ankiOnly.fileDeleted` | `missing` | `OUT_OF_SCOPE` | `-` | `sync` | No file: the purge path handles it outside this table, the tombstone rule arrives with UC-30. |
| `synced.clean` | `quiet` | `CHECK` | `-` | `sync` | Both sides match: nothing to do. |
| `synced.ankiNewer` | `overwrite` | `PULL` | `-` | `sync` | Newer in Anki: refreshes the vault file. |
| `synced.vaultNewer` | `overwrite` | `PUSH` | `-` | `sync` | Newer in Obsidian: pushes to Anki. |
| `synced.diverged` | `conflict` | `RESOLVE_NEWEST` | `-` | `sync` | Edited in both: the newer side wins. |
| `linked.unenrolled` | `quiet` | `OUT_OF_SCOPE` | `-` | `wizard` | Enrolling is the wizards' job. |
| `vaultOnly.unexported` | `create` | `OUT_OF_SCOPE` | `-` | `export` | Vault only: the export wizard creates it. |
| `vaultOnly.unenrolled` | `quiet` | `OUT_OF_SCOPE` | `-` | `wizard` | Enrolling is the wizards' job. |
| `vaultOnly.ankiDeleted` | `missing` | `OUT_OF_SCOPE` | `-` | `sync` | Gone from Anki: the purge path handles it, DELETE_FILE arrives with UC-31. |
| `orphaned` | `missing` | `OUT_OF_SCOPE` | `-` | `purge` | Only a stale record left: Purge ledger forgets it. |
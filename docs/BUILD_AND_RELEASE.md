# Build and release guide

This plugin can be installed manually in Obsidian by building the plugin bundle and copying the release files into a vault plugin folder.

## Requirements

- Node.js
- npm
- Anki with AnkiConnect installed if you want to sync cards

## Build from source

Install dependencies, including development dependencies:

```bash
npm install --include=dev
```

Build the Obsidian plugin bundle:

```bash
npm run build
```

This creates `main.js` in the repository root. The plugin manifest is `manifest.json`.

## Two entries, two bundles

| Entry | Built by | Output | Contains the dev commands |
| --- | --- | --- | --- |
| `main.ts` | `npm run build` (esbuild) | `main.js` in the repository root, released | no |
| `main.dev.ts` | `npm run dev` (rollup watcher) | `docs/test-vault/.obsidian/plugins/better-flashcards/main.js` | yes |

`main.dev.ts` is a subclass of the plugin class that registers the developer
commands (`Dev: reset plugin data`) after the normal ones. The release build
starts from `main.ts`, which never imports that module, so the dev commands are
not in the release bundle at all - not disabled, absent. Check it after a build:

```bash
npm run build && grep -c "reset plugin data" main.js
```

Zero means the dev code stayed out of the release bundle. The dev bundle always
keeps the file name `main.js`, because that is the name Obsidian loads, even
though the entry is `main.dev.ts`.

## Prepare release files

Run:

```bash
npm run release
```

The release folder will be created at:

```text
dist/better-flashcards/
```

It contains the files Obsidian needs:

```text
main.js
manifest.json
```

If a future version adds `styles.css`, include that file in the release folder too.

For a GitHub release, upload `main.js` and `manifest.json` as release assets. You can also zip the contents of `dist/better-flashcards/`, but the files should be at the top level of the zip.

## Manual install in Obsidian

Create this folder inside your vault:

```text
<your-vault>/.obsidian/plugins/better-flashcards/
```

Copy the release files into it:

```text
<your-vault>/.obsidian/plugins/better-flashcards/main.js
<your-vault>/.obsidian/plugins/better-flashcards/manifest.json
```

Then restart Obsidian and enable **Better Flashcards** under:

```text
Settings -> Community plugins
```

Use placeholder paths like `<your-vault>` in documentation and release notes. Do not publish local absolute paths from your machine.

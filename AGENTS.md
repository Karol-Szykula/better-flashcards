# Agent conventions

## Tests

- Structure every test as `// given`, `// when`, `// then` sections.
- Name all input data in `given` (`const fields = [...]`, `const file = ...`).
  Never pass literals directly into the exercised call in `when`.
- Assign the exercised call result to a named variable in `when`.
  No `await` inside `expect(...)`.
- One behavior per test, named as user-visible outcome.
- Name every test `given <context> when <action> then <outcome>`,
  mirroring the given/when/then sections in its body.
- Mock AnkiConnect with `AnkiConnectMock` (`tests/mocks/anki-connect.ts`).
  Suite-local responder helpers stay local (rule of three: extract to
  `tests/helpers/` only on third reuse of the same contract).
- Mock Obsidian API with `obsidian-test-mocks`.
  Only plugin-owned globals (e.g. `activeDocument`) get hand mocks
  in `tests/mocks/`.
- Suites touching DOM (jsdom via `@jest-environment jsdom` docblock)
  are required when code touches `document`/`window` (showdown,
  `App.createConfigured__`, React rendering).
- GUI tests assert user-visible behavior (`getByRole`, `getByText`,
  user-event clicks), never implementation details.
- Shared matchers live in `tests/setup.ts` (`@testing-library/jest-dom`).
- Keep a test file under 300 lines. Past that, review it: a family of
  near-identical tests may become one `test.each` table whose rows are the
  named input data, but distinct behaviors never merge behind a shared
  builder. `jscpd` gates `src` only, so this rule is what keeps test
  duplication in check.
- `null` values in test fixtures need explicit type annotations
  (`unknown[]`, `Record<string, unknown>`) - the project has no
  `strict` mode, so bare `null` widens to `any` (TS7005/TS7018).

## Code

- No comments. Names must explain themselves (variables, functions,
  CSS tokens, test data).
- Formatting: Prettier owns it (.prettierrc, 2 spaces, 80 columns, double
  quotes, trailing commas). Run `pnpm run format` and never hand-format; lint
  autofixes run after it, so `pnpm run format && pnpm run lint:fix` leaves a
  clean tree. `.editorconfig` mirrors it for editors that do not run Prettier.
- No `any`. Use `unknown` with narrowing, literal unions and shared
  domain types (`AnkiCardPayload`, `AnkiNoteInfo`, `VaultNoteIndex`).
- Booleans read as questions: `isDisabled`, `isEmptyDeck`, `isPaginationVisible`.
  Functions answering them name the subject: `isDeckEmpty`.
  Boolean variables/props use `is` / `has` / `should` / `can` prefix (never `show` / `enable` / `display`).
- Small single-purpose functions; orchestration reads as a list of calls.
- Effects (`useEffect`) reference named loader functions, never inline lambdas.
- English only, everywhere (code, tests, commit messages).
- Props in JSX and interface members are alphabetical
  (enforced by `perfectionist/sort-jsx-props`, `sort-interfaces`).
- Styles: BEM classes (`block__element--modifier`), dimensions only
  through `:root` tokens in `rem`, colors from Obsidian theme vars.
  Components accept optional `className` merged over their own base class.
- TDD for new behavior: red test first, then implementation.

## Workflow

- `pnpm run check` is the definition of done: prettier, eslint, tsc, knip,
  jest, jscpd and dependency-cruiser, in that order so the cheapest failure
  comes first. `pnpm run build` stays outside the gate (the dev flow is the
  rollup watcher). `pnpm run precommit` is the fast subset for a hook.
- Developer-only commands live in `src/dev` and are registered by
  `main.dev.ts`, a subclass that the release build (`main.ts`) never imports.
  Add a new dev command there, never in `main.ts`.
- CSS changes do not trigger the rollup watcher: copy `styles.css`
  to `docs/test-vault/.obsidian/plugins/better-flashcards/` manually
  and diff to confirm.
- Test vault (`docs/test-vault`) is fixture data: revert unintended
  modifications instead of committing them.
- `main.js` at repo root is a build artifact, never edit by hand.

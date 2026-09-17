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
- `null` values in test fixtures need explicit type annotations
  (`unknown[]`, `Record<string, unknown>`) - the project has no
  `strict` mode, so bare `null` widens to `any` (TS7005/TS7018).

## Code

- No comments. Names must explain themselves (variables, functions,
  CSS tokens, test data).
- No `any`. Use `unknown` with narrowing, literal unions and shared
  domain types (`AnkiCardPayload`, `AnkiNoteInfo`, `VaultNoteIndex`).
- Booleans read as questions: `isDisabled`, `isEmptyDeck`.
  Functions answering them name the subject: `isDeckEmpty`.
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

- `pnpm test` (jest), `npx tsc --noEmit`, `pnpm run lint`, `pnpm run build`
  must all pass before review.
- CSS changes do not trigger the rollup watcher: copy `styles.css`
  to `docs/test-vault/.obsidian/plugins/better-flashcards/` manually
  and diff to confirm.
- Test vault (`docs/test-vault`) is fixture data: revert unintended
  modifications instead of committing them.
- `main.js` at repo root is a build artifact, never edit by hand.

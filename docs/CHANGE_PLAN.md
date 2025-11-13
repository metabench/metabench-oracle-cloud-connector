# Change Plan

## Goal
- Refactor the CLI tooling to introduce a shared "tsnjs" foundation, migrate `js-edit`/`js-scan` onto it, and ship new `ts-edit`/`ts-scan` commands backed by TypeScript-aware providers.

## Current Behaviour
- `js-edit` and `js-scan` contain monolithic logic tightly coupled to JavaScript-specific parsing helpers.
- TypeScript support is absent; no shared abstractions align behaviours across languages.
- There is no design document describing how to modularise the tools or add TS variants.

## Proposed Changes
1. **Phase 1 - Shared Core Extraction**
    - Identify language-neutral helpers in `js-edit.js` / `js-scan.js` (IO, planning, formatting, guardrails).
    - Create `src/tools/tsnjs/core` modules (`BaseCliCommand`, `WorkspaceScanner`, etc.) and move shared logic there.
    - Keep existing JS behaviour by delegating from the old files to the new abstractions.
2. **Phase 2 - JS Subclasses**
    - Implement `JsLanguageProvider`, `JsEditCommand`, `JsScanCommand` that consume the shared core without changing CLI signatures.
    - Update entry points and recipes to instantiate these classes.
3. **Phase 3 - TypeScript Support**
    - Add `TsLanguageProvider`, `TsEditCommand`, `TsScanCommand`, along with new CLI entry points (`ts-edit.js`, `ts-scan.js`).
    - Provide TypeScript fixtures and tests; extend dispatcher/recipes to route TS workloads.
4. **Phase 4 - Semantic Validation & Polish**
    - Integrate optional TypeScript type-checks, update docs/CLI help, and add regression suites covering mixed JS/TS scenarios.

### Current Focus (Phase 1 Tasks)
- Completed: bootstrap `LanguageProvider`, `createWorkspaceScanner`, and `JsLanguageProvider` scaffolding.
- Completed: bridged `dev/js-scan` scanner to `createWorkspaceScanner` while preserving the public API surface.
- Completed: catalogued CLI printing, IO, and hash helpers in `js-scan.js` / `js-edit.js` using targeted `js-scan` searches.
- Completed: introduced shared `tsnjs/core/cliEnvironment` helpers and adopted them in `js-edit.js` + `js-scan.js`.
- Completed: centralized CLI option normalization in `tsnjs/core/cliOptions` and aligned `js-scan.js` with the shared helpers.
- Completed: extracted shared `tsnjs/core/cliReporting` helpers for dependency summaries, parse errors, and ripple output; reran `npx jest --config jest.config.cjs --runTestsByPath src/tools/__tests__/js-scan.test.js --bail=1 --maxWorkers=50%` to confirm behaviour.
- Completed: delivered TypeScript scaffolding (`TsLanguageProvider`, TypeScript scanner/file contexts, env-selectable CLI bridges, `ts-edit.js`, `ts-scan.js`) plus fixtures and Jest coverage (`ts-scan.test.js`).
- Baseline: js-edit and js-scan Jest suites pass; monitor the lingering worker teardown warning reported by the js-edit tests.
- Completed: Filtered out type-only imports from runtime dependency reporting in the TypeScript file record and extended fixtures/tests to lock the behaviour down.
- Paused: Continue migrating search/reporting helpers (`printSearchTerse`, `printSearchResult`, `printHashLookup`, `printPatternResult`, `printChineseHelp`, `printHelpOutput`) into `tsnjs/core/cliReporting`, keeping `src/tools/dev/js-scan.js` in lockstep.
- Next: Document TypeScript CLI usage and extend recipe dispatchers to surface TS commands alongside the JS variants.
- Upcoming: Resume shared reporter extraction once the TS bridge stabilises and broaden regression coverage for mixed JS/TS scenarios.

## Risks & Unknowns
- Refactor may introduce regressions if shared abstractions diverge from legacy behaviour.
- TypeScript semantic checks might require additional dependencies (TypeScript compiler, ts-morph) impacting performance.
- New command wiring could break existing recipes if dispatch logic is incomplete.
- Tooling gap: `js-edit --replace-variable` cannot append new sibling declarations (hit while wiring the shared cliReporting require); consider adding insertion support or a wrapper recipe.

## Integration Points
- CLI entry points (`js-edit.js`, `js-scan.js`, new TS scripts), recipe engine (`OperationDispatcher`, `RecipeEngine`), shared AST helpers, and i18n/formatter utilities.

## Docs Impact
- Maintain the design document in `docs/reference/tsnjs-refactor-plan.md` and update CLI README/help once implementations land.

## Focused Test Plan
- Jest: `npx jest --config jest.config.cjs --runTestsByPath src/tools/__tests__/js-scan.test.js --bail=1 --maxWorkers=50%` after each shared helper extraction. Run the matching `js-edit` suite when touching edit-specific flows.
- Jest: `npx jest --config jest.config.cjs --runTestsByPath src/tools/__tests__/ts-scan.test.js --bail=1 --maxWorkers=50%` whenever TypeScript metadata or dependency reporting changes.
- Smoke: `node src/tools/js-edit.js --help` and `node src/tools/js-scan.js --help` to ensure CLI translation and formatter wiring remain stable.

## Rollback Plan
- Remove the added design document if direction changes.

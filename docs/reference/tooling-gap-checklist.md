Tooling Integration Checklist
============================= 

Use this checklist to migrate the shared CLI helpers from the donor repository into this project. Each item calls out the expected path, why the code needs it, and the quickest way to satisfy the requirement without copying unrelated files.

- [x] Provide `src/tools/shared/powershellEncoding.js` and `src/tools/shared/hashConfig.js`
  - Referenced by: `src/tools/js-edit.js`, `src/tools/md-edit.js`, `src/tools/js-scan.js`, `src/tools/md-scan.js`
  - Observed location today: helper lives under `src/tools/dev/shared/`
  - Action: copy the file(s) from the donor repo into `src/tools/shared/`, or adjust every require to point at the `dev/shared` path

- [x] Provide `src/tools/lib/markdownAst.js`, `src/tools/lib/swcAst.js`, and `src/tools/lib/codeEscaper.js`
  - Referenced by: `src/tools/js-edit.js`, `src/tools/js-scan.js`, `src/tools/md-edit.js`, `src/tools/md-scan.js`
  - Observed location today: development variants in `src/tools/dev/lib/`
  - Action: reuse the dev versions or rebuild thin production wrappers that forward to the dev implementations

- [x] Restore `src/tools/i18n/{dialect.js,helpers.js,language.js,lexicon.js}`
  - Referenced by: every CLI entry point (`js-edit.js`, `js-scan.js`, `md-edit.js`, `md-scan.js`)
  - Observed location today: only under `src/tools/dev/i18n/`
  - Action: mirror the i18n folder at the top level or update requires to reach the dev copies

- [x] Restore `src/tools/js-edit/**` helper tree
  - Referenced by: `src/tools/js-edit.js`, all recipe-related tests
  - Observed location today: `src/tools/dev/js-edit/`
  - Action: copy only the needed subfolders (`operations`, `recipes`, `shared`) or update imports to consume the dev tree directly

- [x] Restore `src/tools/js-scan/**` helper tree
  - Referenced by: `src/tools/js-scan.js`, ripple-analysis tests
  - Observed location today: `src/tools/dev/js-scan/`
  - Action: copy the `lib`, `operations`, and `shared` directories or repoint require paths

- [x] Restore `src/tools/md-edit/**` helper tree
  - Referenced by: `src/tools/md-edit.js` and markdown edit tests
  - Observed location today: `src/tools/dev/md-edit/`
  - Action: mirror the folder or adjust requires to read from the dev copy

- [x] Fix `CliArgumentParser`/`CliFormatter` require paths
  - Current code expects `../../src/utils/CliFormatter`
  - Actual implementation in this repo lives at `src/util/CliFormatter.js` and `src/util/CliArgumentParser.js`
  - Action: either move the files into a new `src/utils/` directory or update every require to `../../src/util/...`

- [x] Supply `src/util/project-root.js`
  - Referenced by: `src/tools/cli/BatchLoader.js`
  - Not present under `src/util`
  - Action: bring over the helper from the donor repo or stub a minimal implementation that returns the monorepo root

- [ ] Satisfy test-time paths like `tools/dev/js-edit.js`
  - Test suites (for example `src/tools/__tests__/js-scan.test.js`) execute `node tools/dev/...`
  - Present repo only offers `src/tools/dev/...`
  - Action: create `tools/dev` shims (symlinks or wrapper scripts) at the repository root, or rewrite the tests to target the `src/tools/dev` paths

- [x] Reconcile package dependencies
  - Runtime imports require packages such as `@swc/core` and `markdown-it`
  - `package.json` currently lacks these entries, so the CLIs crash even when files exist
  - Action: copy the dependency list from the donor repo or add the minimal subset needed by the shared helpers

Status Notes
------------
- `CliArgumentParser` and `CliFormatter` now import directly from `src/util/` across all CLIs.
- Production entry points reuse the dev helper implementations via lightweight re-export modules.
- `findProjectRoot` is available under `src/util/project-root.js` for BatchLoader and other tooling.
- No `tools` directory exists at the repo root, so every test or script that shells out to `node tools/dev/...` currently fails.

Next Steps Guide
----------------
1. Decide whether the production CLIs should reuse the dev implementations (preferred shortcut) or maintain separate stripped variants.
2. For each unchecked item above, either copy the donor file(s) into the expected path or update the relevant `require()` calls, then tick the box.
3. After mirroring files and adjusting imports, add the missing dependencies to `package.json` and run `npm install`.
4. Verify by running `node src/tools/js-scan.js --help` and `npm test` (once the root `tools/` path issue is resolved).
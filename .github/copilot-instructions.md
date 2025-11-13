# AI Coding Guide
## Overview
- Primary goal is a reusable TypeScript helper (`src/connect.ts`) that opens SSH sessions into a fixed Oracle Cloud host (`ORACLE_HOST`).
- The module targets Node.js 18+ on Windows; defaults now assume private keys live under `C:\Users\james\.ssh` and use the `ssh-key-2025-11-11.key` pair unless the caller overrides the directory.
- All exports should stay side-effect free: do not initiate network work on import, and always return the `ssh2.Client` promise for callers to manage.
- Preserve the deliberate event wiring: listeners are attached once and cleaned up on `error`/`end` to avoid duplicated callbacks when the promise is consumed multiple times.
## Key Files
- `src/connect.ts` holds constants, the `OracleSshOptions` interface, the `Connection` base class, and the `connectToOracle` helper.
- `package.json` declares `ssh2` plus legacy `jsgui3-*` dependencies (unused today); keep versions pinned unless you confirm they are no longer needed.
- `docs/reference/getting-started-with-jsgui3.md` is historical context; update only if you intentionally document the UI stack referenced there.
## Implementation Patterns
- Route every filesystem lookup through `resolveKeyPaths` / `loadPrivateKey` so directory scans, key heuristics, and error messaging stay consistent.
- Keep new defaults expressed as top-level constants (UPPER_SNAKE_CASE) so user overrides remain obvious and testable.
- If you extend `OracleSshOptions`, ensure optional values fall back inside `connectToOracle` before constructing `ConnectConfig`.
- Additional connection safeguards (timeouts, keepalive) should extend the existing `sshConfig` object; always guard against undefined `process.env.SSH_AUTH_SOCK`.
## Developer Workflow
- Run type checking ad hoc with `npm run type-check` (loads `tsconfig.json`, which targets `src/**/*.ts`).
- Quick manual verification: `node -e "const {connectToOracle}=require('./dist/metabench-oracle-connector.es.js');connectToOracle().then(c=>{console.log('ready');c.end();}).catch(console.error);"` or use the richer `npm run test-connect` health check.
- Keep secrets (host IP, key paths, passphrases) out of version control; prefer environment variables or `.env` files ignored by Git when adding new configuration.
## Common Pitfalls
- Windows-style default paths require escaping backslashes in string literals; prefer using `path.join` when introducing new paths.
- Do not read private keys synchronously outside the helper unless you handle missing files the same way (`throw new Error(...)`).
- Remember that `ssh2.Client` is event-driven; if you add streams or exec helpers, attach listeners once and remove them after completion to match the current pattern.
- External callers expect the promise to reject on connection failure—never swallow `error` events or resolve with a partially connected client.
## When In Doubt
- Ask whether a behavior belongs in this connector or in upstream orchestration; keep this package minimal and composable.
- Confirm any Oracle network change (host IP, username defaults, port) with the team before committing, since other automation hardcodes these values.
- Document new workflows in this guide so future AI agents inherit the knowledge base without spelunking the history.
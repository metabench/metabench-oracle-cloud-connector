# Oracle SSH Connector Deployment Guide

This document expands on the existing SSH connector and describes how to package and deploy Node.js applications from a Windows workstation to the Oracle Cloud VM. It covers tooling layout, operational flow, and the symlink-based release strategy used on the remote host.

## 1. Tooling Overview

- **Core connectors (`src/core-connection.ts`, `src/node-connection.ts`)**: Provide reusable SSH and Node environment primitives. Deployment utilities should extend these classes (e.g., a `DeploymentConnection` subclass) to inherit key discovery, SSH command execution, `npm`/`nvm` helpers, and event hygiene.
- **CLI surface**: Implement a Windows-friendly Node CLI (TypeScript entry point under `src/cli/`) that orchestrates deployment tasks. Use `tsx` during development and bundle with Vite for distribution if required. Expose commands such as `deploy`, `rollback`, `logs`, and `status`.
- **Configuration**: Support a project-level JSON or YAML descriptor (for example `.oracle-deployrc`) that records remote paths, service names, desired Node version, and process manager preferences. Allow per-run overrides via CLI flags.

## 2. Repository Analysis & Planning

Complex deployments begin with understanding what the target repository contains. The CLI should dedicate a stage to analysis before packaging anything.

### 2.1 Source Discovery

1. **Path normalization**: Resolve the user-supplied repository path and record its absolute Windows location. Surface warnings for UNC paths or drives that may restrict long filenames.
2. **Git metadata**: Detect if the directory is a Git repository; capture current branch, latest commit hash, and presence of uncommitted changes. Include this metadata in the manifest so releases can be traced back to source.
3. **Project classification**: Inspect `package.json`, `tsconfig.json`, lockfiles, and build scripts to determine whether the repo:
    - is TypeScript-first (requires compilation),
    - is JavaScript-only,
    - uses frameworks with opinionated builds (Next.js, NestJS, etc.),
    - or is a plain script collection.
4. **Static analysis hook**: Integrate with pluggable analyzers (e.g., `js-scan`, ESLint, custom AST passes). The CLI should orchestrate these tools rather than embed the logic. Their output informs what needs to be copied, built, or excluded.

### 2.2 File Classification

- **Inclusion list**: Starting from the repo root, build a manifest of files required in the release. Combine heuristics (e.g., include `dist/` when a build folder is detected) with analyzer results. Honor `.oracle-deployrc` configuration to explicitly include/exclude paths.
- **Runtime-only assets**: Detect assets (templates, public static files, migrations) that must accompany the build. Ensure paths are preserved relative to repo root so the remote directory structure mirrors what the app expects.
- **Development-only files**: Exclude tests, docs, and tooling directories unless the manifest explicitly keeps them. Static analysis should identify TypeScript sources when JavaScript output exists, allowing the deployment packager to skip `.ts` files if `.js` equivalents will be emitted during the build stage.

### 2.3 Build Plan Synthesis

Produce a structured plan object summarizing:

- Build commands to execute (e.g., run `npm run build`, `tsc`, or no build if JavaScript-only).
- Expected output directories (`dist`, `build`, `out`).
- Node/NPM version requirements extracted from `.nvmrc`, `package.json` `engines`, or analyzer hints.
- Post-build verification steps (e.g., ensure certain entrypoints exist, run smoke tests).
- File sync instructions describing which directories to copy and how to map them to the remote release tree.

This plan should be persisted (JSON) alongside the manifest so future deployments or rollbacks can reference the exact operations performed.

## 3. Local Workspace Preparation

With a deployment plan in hand, the CLI can perform deterministic steps.

### 3.1 Packaging a Local Repository

1. **Dependency install**: Execute the plan’s `install` phase (`npm ci` if `package-lock.json` or `pnpm install` if `pnpm-lock.yaml`). Provide override flags for offline or cached installs.
2. **Build step**: Run the ordered build commands from the plan. Stop immediately on failure and record output logs. For TypeScript targets, ensure `tsc` emits to the configured directory; warn if no `.js` files are produced.
3. **Artifact assembly**: Using the inclusion manifest, collect build outputs and runtime assets into a staging directory that mirrors the desired remote structure (e.g., `app/dist`, `app/package.json`). Windows paths must convert to POSIX with forward slashes when constructing the archive.
4. **Archive creation**: Compress the staging directory (prefer `.tar.gz` for Linux compatibility). Use a library that handles UTF-8 filenames and long paths. Include the plan and analysis report inside the archive for traceability.
5. **Manifest & checksum**: Generate a release manifest (`manifest.json`) capturing git metadata, analyzer results (summary + hash of raw output), environment requirements, and checksums of both archive and key directories.

### 3.2 Handling Repository Apps

- For apps inside this monorepo (future addition), store per-app deployment configs under `apps/<name>/deploy.json`. The analysis phase should merge shared defaults from the root `.oracle-deployrc` with app-specific overrides.
- Allow `npm run deploy -- --app <name>` to load the app configuration, run analysis, and produce a plan without requiring the user to provide full paths.
- Support workspaces (npm, pnpm) by analyzing the dependency graph to determine which packages must ship with the app.

## 3. Remote Release Layout

Adopt the following directory structure on the Oracle VM (adjust via configuration as needed):

```
/opt/apps/<service-name>/
    releases/
        2025-11-12T12-00-00Z/
            package.tgz
            manifest.json
            app/ (expanded archive)
    shared/
        env/
            production.env
        logs/
        uploads/
    current -> releases/2025-11-12T12-00-00Z/app
```

- `releases/<timestamp>/` holds immutable builds. The timestamp (UTC, colon replaced with dash) ensures lexicographic ordering and Windows-safe paths.
- `shared/` stores persistent files (environment variables, upload directories, PM2 logs). Mount or symlink these into each release as required.
- `current` is a symlink that always points at the active release. Application processes reference this path, allowing atomically switching between deployments.

## 4. Symlink Strategy Deep Dive

1. **Upload and expand**: After transferring `package.tgz`, create a new release directory under `releases/` and extract the archive into an `app/` subfolder (keeps the release root tidy for manifest and metadata).
2. **Dependency install on remote**: Within the extracted `app/`, run `npm ci` (recommended) or `npm install`. Use `NodeConnection.ensureNodeEnvironment()` to guarantee the server has the correct Node/NVM toolchain.
3. **Shared resources linking**:
   - Symlink environment files: `ln -sf ../../../shared/env/production.env app/.env`.
   - Symlink persistent storage directories (logs, uploads) into the new release so user-generated data survives rollbacks.
4. **Atomic activation**:
   - Use `ln -sfn releases/<timestamp>/app current` to update the `current` symlink. The `-n` flag (supported on GNU `ln`) ensures the existing symlink is replaced without traversing it. This command is atomic because `ln` updates the pointer in a single operation, so processes reading `current` before the switch continue referencing the previous release, and new processes started afterwards see the new version.
   - If the filesystem lacks `-sfn` support, fall back to `rm -f current && ln -s releases/<timestamp>/app current`. Wrap both commands in a short script to minimize the gap; ensure service reload occurs only after the new symlink exists.
5. **Process manager reload**: With `current` updated, instruct PM2/systemd to reload the service. Since the application references `current`, restarts automatically point at the new release.

### Rollback Procedure

- List available releases (sorted by timestamp) and select the previous directory.
- Repoint `current` to the chosen release using the same symlink command.
- Reload the service. Because every release remains intact, rollback is instantaneous and does not require rebuild.
- Optionally remove failed release directories once confirmed stable.

## 5. Deployment Workflow Steps

1. **Pre-flight checks**: Verify SSH connectivity, disk space, free memory, and Node environment via existing health checker (`npm run test-connect`). Abort on any failure.
2. **Repository scan**: Run the analysis phase (Section 2) to produce or validate the deployment plan. Cache results to avoid repeated scans when re-deploying the same commit.
3. **Package local app**: Execute the plan’s preparation stage, yielding an archive, manifest, and analysis report in a staging folder (e.g., `deploy-dist/`).
4. **Upload**: Use `ssh2` SFTP to transfer artifacts to a temporary remote path (e.g., `/tmp/app-upload-<timestamp>.tgz`). Also upload the manifest and analysis report for auditing.
5. **Remote install script**: Execute a generated bash script through `DeploymentConnection.runCommand()` that performs:
    - Release directory creation
    - Archive extraction preserving directory structure
    - Shared symlink creation
    - `npm ci` or equivalent using the Node version resolved in the plan
    - Service restart (PM2 `reload`, `systemctl restart`, etc.)
6. **Post-deploy health checks**: Reuse Node health output plus optional HTTP endpoint probing (`curl http://localhost:port/health`). Apply plan-defined validation (smoke tests, integration checks). If any step fails, trigger rollback automatically.
7. **Cleanup**: Delete temporary uploads and optionally prune older releases beyond a retention threshold (configurable, e.g., keep last 5).

## 6. Windows Considerations

- **Path handling**: Normalize all paths to POSIX before sending commands to the remote host. The local CLI should accept Windows paths but convert them internally (`path.posix.join`) for remote scripts.
- **Packaging tools**: Rely on cross-platform Node libraries (`tar`, `archiver`, or `yazl`) rather than shell utilities. Avoid `bash` on Windows; everything should run under PowerShell or plain Node.
- **Environment variables**: When injecting environment data into remote shell scripts, ensure proper quoting and escape sequences to prevent PowerShell-specific characters from leaking into the bash commands.
- **Permissions**: Remote commands must run as a user with rights to manage `/opt/apps`. Use `opc` plus `sudo` if necessary; incorporate `sudo` toggles in the CLI to handle directories requiring elevated permissions.

## 7. Future Enhancements

- **Git-based deploy**: Optionally allow pushing a Git bundle or instructing the remote host to `git clone` the repository directly, reducing artifact uploads for large projects.
- **Analysis plug-in system**: Define an interface for static analyzers (`js-scan`, custom scripts) so new tools can plug into the planning stage. Each plug-in should report confidence levels, detected frameworks, and recommended build steps.
- **Remote plan execution logging**: Persist both local plan JSON and remote execution logs in a central location (e.g., `/opt/apps/<service>/releases/<timestamp>/plan.log`) for auditing and debugging.
- **Blue/green switch**: Extend the symlink pattern to maintain two live trees (`blue` and `green`) with a load balancer flip for zero downtime in multi-instance scenarios.
- **Automated migrations**: Add hooks to run database migrations before activation; tie them to the manifest to ensure idempotency.
- **Monitoring integration**: Trigger log streaming (`tail -f shared/logs/app.log`) or integrate with external monitoring APIs after each deploy.

By implementing the above structure, a Node app—whether located elsewhere on disk or nested inside this repository—can be packaged on Windows, uploaded via the existing SSH connector, activated atomically on the Oracle VM, and rolled back safely using the symlink-controlled release tree.

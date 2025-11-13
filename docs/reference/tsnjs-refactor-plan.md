# tsnjs Refactor Plan

## Purpose
This document describes how to evolve the current JavaScript CLI tooling (`js-scan`, `js-edit`) into a modular architecture that supports both JavaScript and TypeScript flows. We introduce a shared "tsnjs" foundation with language-specific subclasses while keeping the existing user-facing commands stable.

## Current Constraints
- `js-edit` and `js-scan` own the full control flow (argument parsing, AST analysis, CLI output). Most helpers assume JavaScript AST nodes.
- TypeScript files cannot be processed. Decorators, interfaces, namespaces, and type-only imports are ignored.
- Recipes and integration tests call JavaScript-specific modules; duplicating logic for TypeScript would be error-prone.

## Design Goals
1. **Shared Behaviour:** extract reusable components that apply to both JavaScript and TypeScript (file traversal, CLI formatting, guardrails, planning).
2. **Language Plug-ins:** provide thin subclasses for JavaScript and TypeScript that override only syntax-specific details.
3. **Backward Compatibility:** keep existing CLI entry points working during migration; JS users should see identical output.
4. **Extensibility:** allow future languages (e.g., Flow) to hook into the same base without cascading rewrites.

## Terminology
- **tsnjs**: namespace for shared code that works for both TypeScript and JavaScript.
- **Language Provider**: subclass responsible for AST parsing, metadata extraction, and mutation rules tailored to a language.

## Proposed Module Layout
```
src/tools/tsnjs/
  core/
    BaseCliCommand.js          # shared CLI plumbing
    LanguageProvider.js        # abstract contract for parse/collect/mutate hooks
    WorkspaceScanner.js        # file discovery, dependency graph logic
    MutationPlanner.js         # plan emitters, hash guards
  edit/
    BaseEditCommand.js         # orchestrates locate/replace flows
    MatchCollectors.js         # shared matching helpers
  scan/
    BaseScanCommand.js         # orchestrates search/hash/deps flows
    OutputRenderers.js         # shared formatter adapters
languages/
  javascript/
    JsLanguageProvider.js
    JsEditCommand.js           # extends BaseEditCommand
    JsScanCommand.js           # extends BaseScanCommand
  typescript/
    TsLanguageProvider.js
    TsEditCommand.js
    TsScanCommand.js
```

CLI entry points (`src/tools/js-edit.js`, `src/tools/js-scan.js`, new `ts-edit.js`, `ts-scan.js`) will import the appropriate subclass and delegate to it.

## Base Class Responsibilities
### LanguageProvider
- `parseSource(filePath, source, options)`
- `collectFunctions(ast, source, mapper)`
- `collectVariables(ast, source, mapper)`
- `resolveDependencies(fileRecord)`
- `supportsFeature(featureKey)` (e.g., decorators, typeOnlyImports)
- `createMutationHelpers()` returning language-specific mutators

JavaScript and TypeScript versions re-use a common SWC-powered implementation where possible. The TypeScript subclass enables `@swc/core` with `syntax: 'typescript', tsx: true` and injects TypeScript-specific metadata (access modifiers, type annotations). When semantic validation is required (rename safety), `TsLanguageProvider` can optionally call the TypeScript compiler API via a secondary adapter.

### BaseScanCommand
- Accepts CLI arguments normalized by `CliArgumentParser`.
- Uses a `LanguageProvider` to parse files, collect functions/variables, and compute dependency summaries.
- Exposes hooks for result rendering so JS/TS subclasses can add custom fields (e.g., `typeOnly`, `decorators`).

### BaseEditCommand
- Coordinates locate/extract/replace flows using shared guardrails (hashes, spans, plan emission).
- Delegates AST traversal and mutation to the provider.
- Maintains compatibility with recipe engine by exposing same method signatures as current `js-edit` exports.

## Refactoring Roadmap
### Phase 0 – Preparation
- Add integration tests that cover representative TypeScript fixtures (decorators, interfaces, ambient declarations).
- Identify hotspots in `js-edit`/`js-scan` that mix CLI logic with language details (collectors, mutators, search helpers).

### Phase 1 – Extract Shared Utilities
- Move language-neutral helpers (planning, CLI output, hash guards, file IO) into `src/tools/tsnjs/core`.
- Replace direct imports inside `js-edit`/`js-scan` with references to the new shared modules.
- Maintain existing behaviour by instantiating a `JsLanguageProvider` that wraps current `swcAst` helpers.

### Phase 2 – Introduce Base Commands
- Create `BaseScanCommand` and `BaseEditCommand` under `tsnjs`.
- Refactor `js-scan` and `js-edit` entry points to instantiate `JsScanCommand` / `JsEditCommand` that extend the base classes.
- Ensure recipes and CLI tests still pass (no TypeScript yet).

### Phase 3 – Implement TypeScript Providers
- Implement `TsLanguageProvider` using `@swc/core` with TypeScript mode. Capture metadata for:
  - Interfaces, type aliases, enums, namespaces
  - Access modifiers (`public`, `protected`, `private`), `readonly`, `abstract`, `override`
  - Type-only imports/exports
  - Decorators and metadata factory nodes
- Build `TsScanCommand` and `TsEditCommand` that inherit from base commands and override:
  - File extension filters (`.ts`, `.tsx`, `.d.ts` if allowed)
  - Output column additions (type modifiers)
  - Mutation helpers (maintain type annotations, preserve generics)
- Wire new CLI entry points `src/tools/ts-scan.js`, `src/tools/ts-edit.js` to the TS subclasses.

### Phase 4 – Semantic Validation (Optional but Recommended)
- Integrate the TypeScript compiler API or `ts-morph` to perform post-mutation diagnostics.
- Provide configuration flags (`--ts-semantic-check`) to enable/disable type checking for performance-sensitive scenarios.

### Phase 5 – Recipe and Tooling Alignment
- Update recipe manifests to reference either JS or TS commands depending on workspace configuration.
- Extend operation dispatcher to choose the correct subclass based on file extension or explicit `language` parameter.

## Testing Strategy
- Reuse existing Jest suites; extend fixtures with TypeScript samples.
- Add contract tests for `LanguageProvider` (shared base ensures both providers satisfy same interface).
- Provide CLI smoke tests for new commands (`ts-edit`, `ts-scan`).
- Consider snapshot tests comparing JS vs TS outputs for shared operations.

## Deployment Considerations
- Package size increases slightly due to additional provider modules and possible TypeScript compiler dependency.
- Document new CLIs in README and reference docs.
- Maintain fallback to JS-only mode when TypeScript dependencies are unavailable (graceful error messaging).

## Open Questions
- How aggressively should we rely on the TypeScript compiler? (performance vs accuracy)
- Should `ts-edit` allow editing `.d.ts` files or treat them as read-only?
- What default behaviour should recipes adopt when encountering mixed JS/TS codebases?

## Next Steps
1. Socialize this plan with maintainers, confirm module layout and phased approach.
2. Schedule the Phase 1 extraction work; ensure no behavioural regressions for existing JS workflows.
3. Prototype `TsLanguageProvider` on a small set of fixtures to validate AST assumptions before full rollout.

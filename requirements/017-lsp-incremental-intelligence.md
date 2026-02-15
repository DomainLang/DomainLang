# PRS-017: LSP incremental intelligence

**Status**: Implemented (P0, P1, P2 partial)  
**Priority**: High  
**Target version**: 0.13.0  
**Effort estimate**: 4–5 weeks  
**Dependencies**: PRS-010 (Import System Redesign — implemented)

---

## Executive summary

Improve the DomainLang LSP server's change detection, cache invalidation, and dependency graph management to bring it closer to the strategies used by production-grade language servers (rust-analyzer, gopls, pyright, TypeScript/tsserver).

The current implementation is **architecturally sound** — it correctly extends Langium's `IndexManager.isAffected()` with transitive BFS over a reverse dependency graph, restricts scoping to imported documents only, and supports three workspace modes (manifest, standalone, mixed). However, a comparative analysis reveals three categories of improvement:

1. **Precision** — the `ImportResolver` cache clears on *any* document change (not just affected ones), and specifier matching uses substring comparisons that produce false positives.
2. **Intelligence** — there is no export-signature diffing, no import cycle detection diagnostics, and no structured error reporting for resolution failures.
3. **Resilience** — manifest caching uses `mtimeMs` (unreliable on some filesystems), external dependency changes aren't watched, and startup eagerly validates all files.

These improvements are internal to the LSP — no grammar changes, no user-facing syntax changes, no breaking changes. They affect performance, diagnostic quality, and developer experience.

**Relationship to other PRSs:**

- **PRS-010** established the import/workspace architecture this PRS improves upon.
- **PRS-015** defined LSP tool handlers that benefit from faster change propagation.
- **PRS-016** (web extension) benefits from reduced memory pressure and faster initialization.

---

## Problem statement

When a developer edits a single `.dlang` file, the LSP performs more work than necessary:

1. **ImportResolver cache thrashing**: `WorkspaceCache` clears the *entire* import resolution cache on any document change. Editing file A invalidates the cached resolution for files B, C, D even when they are unaffected. In a workspace with 50+ files, this causes hundreds of redundant resolution lookups.

2. **Over-invalidation without export diffing**: When file A changes, all its transitive importers are re-linked and re-validated, even if A's *exported symbols* (the names and types visible to importers) haven't changed. Implementation-only changes (editing a vision string, reordering blocks) cascade unnecessarily.

3. **Silent import cycles**: The `importsLoaded` set prevents infinite loops during indexing, but users get no diagnostic when they accidentally create an import cycle. Symbols silently fail to resolve, leading to confusing "unknown reference" errors instead of a clear "circular import detected" message.

4. **Fuzzy specifier matching produces false positives**: The `hasMatchingSpecifierOrResolvedUri()` method in `DomainLangIndexManager` uses `string.includes()` for matching, so a change to `sales.dlang` incorrectly triggers revalidation of a file importing `pre-sales.dlang`.

5. **Fragile manifest caching**: The `readAndCacheManifest()` method compares `stat.mtimeMs` to detect changes. On NFS, Docker volumes, and some macOS edge cases, sub-second writes produce identical mtimes, causing stale manifests.

6. **No awareness of external dependency changes**: If a developer runs `dlang install` while the LSP is active, the `.dlang/packages/` directory changes but no file watcher detects it, requiring a manual LSP restart.

7. **Eager validation at startup**: In manifest mode (Mode A), `DomainLangWorkspaceManager.loadAdditionalDocuments()` builds all imported documents with `{ validation: true }`, including full semantic validation. For large models, this delays workspace readiness.

---

## Goals

| Goal | Measure |
|------|---------|
| **Reduce unnecessary revalidation** | Export-signature diffing prevents cascading invalidation when only implementation details change |
| **Eliminate cache thrashing** | Import resolution cache invalidates per-document, not globally |
| **Provide clear cycle diagnostics** | Import cycles produce a dedicated error with the cycle path |
| **Improve specifier matching precision** | Zero false positives from substring matching |
| **Reliable manifest caching** | Content-hash based cache validation works on all filesystems |
| **Live dependency updates** | External package changes detected without LSP restart |
| **Faster startup** | Deferred validation reduces time-to-interactive for large workspaces |

## Non-goals

- Grammar or syntax changes (purely internal LSP improvements)
- Deferred/lazy validation at startup (all files should be validated eagerly)

---

## Analysis: how best-in-class LSPs handle these concerns

This section documents the comparative analysis that motivates each requirement. Understanding *why* production LSPs chose their strategies prevents reinventing known pitfalls.

### Cache invalidation granularity

| LSP | Strategy | Granularity |
|-----|----------|-------------|
| **gopls** | Compares export data (package interface) before invalidating dependents | Per-package signatures |
| **pyright** | Tracks import-level dependencies; only re-analyzes files that imported from the changed file | Per-import |
| **rust-analyzer** | Red-green algorithm via Salsa; query results compared by hash before propagating | Per-query |
| **TypeScript** | Project references + `.tsbuildinfo`; skips dependent projects if declarations unchanged | Per-project declarations |
| **DomainLang (current)** | `WorkspaceCache` clears everything on any change; all transitive importers re-validated | Workspace-wide |

**Key insight from gopls**: When a file changes, gopls compares the changed file's *export data* (the public type of each declaration) with its previous version. If the export data is identical, dependents are not invalidated — even though the file's implementation changed. This prevents cascading revalidation for changes that don't affect the public interface.

**Applicable to DomainLang**: DomainLang exports are simpler than Go types — they're named elements (domains, bounded contexts, teams, etc.) with string-based identifiers. Comparing the set of exported symbol names before and after a change is cheap and effective.

### Import cycle handling

| LSP | Strategy |
|-----|----------|
| **Go compiler** | Import cycles are a compile error at the language level |
| **TypeScript** | Project reference cycles are an error; file-level cycles are tolerated with careful resolution |
| **pyright** | Detects and reports import cycles as diagnostics |
| **rust-analyzer** | Crate graph is DAG-enforced by Cargo |

**Key insight**: All production LSPs either prevent or diagnose import cycles. Silent failure (current DomainLang behavior) is universally considered a bug.

### Specifier matching for file renames

| LSP | Strategy |
|-----|----------|
| **TypeScript** | Resolves imports precisely, then compares resolved paths |
| **gopls** | Package-level tracking; renames within a package don't affect importers |
| **pyright** | Import resolution re-runs from scratch on file system changes |

**Key insight**: Precise path comparison (exact filename match after normalization) is always preferable to fuzzy substring matching.

---

## Requirements

### Must have (P0)

| ID | Requirement | Rationale |
|----|-------------|-----------|
| R1 | **Targeted cache invalidation**: Replace `WorkspaceCache` in `ImportResolver` with `DocumentCache` keyed by importing document, plus explicit invalidation of dependents via the reverse dependency graph in `DomainLangIndexManager` | Eliminates cache thrashing. Currently, editing file A clears import resolution cache for all files. With targeted invalidation, only A and its dependents are cleared. This is the single highest-impact change. |
| R2 | **Export-signature diffing**: Before propagating changes to dependents, compare the set of exported symbol names (from `collectExportedSymbols()`) before and after the change. If exports are unchanged, skip transitive invalidation. | Prevents cascading revalidation for implementation-only changes. Editing a domain's `vision:` string should not trigger re-linking of every file that imports that domain. gopls uses this same strategy at the package level. |
| R3 | **Import cycle detection**: During `trackImportDependencies()`, run DFS to detect cycles in the import graph. Report a clear diagnostic on the `ImportStatement` node with the full cycle path (e.g., `A → B → C → A`). | Silent import cycles cause confusing "unknown reference" errors. Users need a direct diagnostic explaining the circular dependency. Every production LSP either prevents or diagnoses cycles. |
| R4 | **Precise specifier matching**: Replace substring-based matching in `hasMatchingSpecifierOrResolvedUri()` with exact filename + normalized path comparison. | Eliminates false positives. Currently, changing `sales.dlang` incorrectly triggers revalidation of files importing `pre-sales.dlang` because `"pre-sales".includes("sales")` is true. |

### Should have (P1)

| ID | Requirement | Rationale |
| ---- | ------------- | ----------- |
| R5 | **Content-hash manifest caching**: Replace `mtimeMs` comparison in `readAndCacheManifest()` with SHA-256 content hashing. | `mtimeMs` is unreliable on NFS, Docker volumes (bind mounts), and CI environments. Content hashing is deterministic and filesystem-independent. gopls uses content hashing for its persistent cache validation. |
| R6 | **Package cache watching**: Detect when `model.lock` changes (e.g., after `dlang install`) and trigger targeted rebuild of documents that import external packages. The existing `processLockFileChanges()` handler already watches `model.lock` — verify it triggers correct change detection and document rebuilds. | Enables live detection of `dlang install` / `dlang update` without requiring LSP restart. Currently, developers must restart the LSP after installing dependencies. |
| R7 | **Progress reporting at startup**: Report workspace indexing progress to the client via `window/workDoneProgress` during `loadAdditionalDocuments()`. Show number of files indexed, modules discovered, and import graphs loaded. | Large DDD models could have dozens of files; users currently get no feedback during workspace initialization. All production LSPs report progress during startup. |

### Nice to have (P2)

| ID | Requirement | Rationale |
| ---- | ------------- | ----------- |
| R8 | **Structured `ImportResolutionError`**: Replace string-template errors in `ImportResolver` with a structured error class carrying `specifier`, `attemptedPaths[]`, and `hint`. Refactor all throw sites to use it. Code actions and diagnostics can use the structured data programmatically. | Enables future quick-fix code actions (e.g., "Create missing file", "Add dependency to model.yaml") without parsing error message strings. |
| R9 | **Rename `services/WorkspaceManager`** to `ManifestManager`. Update all imports and references across the codebase. | Disambiguates from the Langium `WorkspaceManager` override at `lsp/domain-lang-workspace-manager.ts`. Two classes named `WorkspaceManager` in the same project creates import confusion and naming collisions. |
| R10 | **Import resolution tracing**: Add a diagnostic flag (environment variable `DOMAINLANG_TRACE_IMPORTS`) that logs each import resolution step: specifier, attempted paths, result. Output to LSP console. | Invaluable for debugging import resolution failures. Mirrors TypeScript's `--traceResolution`. Currently, import errors are silent until validation runs. |
| R11 | **Workspace layout caching**: Cache the full workspace directory layout (which dirs contain `model.yaml`, which have `.dlang` files) at startup. Update incrementally when file system events arrive instead of re-walking on every `findWorkspaceRoot()` call. | Reduces filesystem I/O on cache miss. Currently `findWorkspaceRoot()` walks up the directory tree on every call for uncached paths. |
| R12 | **Tiered validation**: Implement a fast "syntax + import resolution" pass that runs immediately, and defer full semantic validation (duplicate FQN checks, relationship validation) with a longer debounce. | Provides instant feedback on typos while avoiding expensive cross-file analysis during active typing. |
| R13 | **Validation-on-save mode**: Offer a configuration option (via workspace settings) to only fully validate on save, not on every keystroke. | Many enterprise DDD models are large enough that per-keystroke validation causes latency. Supported by TypeScript (`checkOnSave`) and pyright (`diagnostic mode`). |
| R14 | **Persistent index cache**: Serialize the export index and import dependency graph to `.dlang/.cache/index.json`. On startup, load this index and verify it's still valid by checking file content hashes. | Dramatically reduces LSP startup time for unchanged workspaces. Follows gopls' pattern of persistent per-package data. |
| R15 | **Replace TTL with event-based invalidation**: Remove the 5-minute TTL timer in `PerformanceOptimizer`. Use `processManifestChanges()` and `processLockFileChanges()` as the sole invalidation mechanism. | TTL can serve stale data (within window) or unnecessarily re-read unchanged files (after expiry). Event-based invalidation is always correct and immediate. |
| R16 | **Decouple `services/WorkspaceManager` from filesystem I/O**: Replace direct `fs.readFile`, `fs.stat`, `fs.access` calls with Langium's `FileSystemProvider` interface. | Makes testing easier and enables browser environments (PRS-016 web extension). Currently tightly coupled to Node.js fs module. |
| R17 | **Structured LSP logging**: Wrap `console.error`/`console.warn` calls throughout LSP services with a structured logger that includes component name, document URI, and timing data. | Critical for production debugging. Currently log messages are unstructured and lack context about which component or document triggered them. |

---

## Technical design

### R1: Targeted cache invalidation

**Current architecture:**

```
ImportResolver uses WorkspaceCache(shared, DocumentState.Linked)
    → ANY document change → entire cache cleared
    → ALL subsequent imports re-resolved from filesystem
```

**Proposed architecture:**

```
ImportResolver uses DocumentCache(shared)
    → keyed by importing document URI + specifier
    → on document change: IndexManager notifies ImportResolver
      with the changed URI + its dependents from the reverse dep graph
    → only affected cache entries cleared
```

**Implementation:**

1. Replace `WorkspaceCache` with Langium's `DocumentCache` in `ImportResolver`:
   ```typescript
   // DocumentCache invalidates only when the keyed document changes
   this.resolverCache = new DocumentCache(shared);
   ```

2. Add an explicit invalidation method to `ImportResolver`:
   ```typescript
   invalidateForDocuments(uris: Iterable<string>): void {
       for (const uri of uris) {
           this.resolverCache.delete(URI.parse(uri));
       }
   }
   ```

3. In `DomainLangIndexManager.updateContent()`, after tracking dependencies, call the invalidation method with the changed document and its direct dependents:
   ```typescript
   const affectedUris = [document.uri.toString(), ...this.getDependentDocuments(document.uri.toString())];
   this.importResolver?.invalidateForDocuments(affectedUris);
   ```

**Cache key design:**

The current cache key is `${document.uri}|${specifier}`. With `DocumentCache`, the outer key is the document URI (automatic invalidation when that document changes), and the inner key is the specifier string. This is more precise: editing file B only clears B's own import resolutions, plus the resolutions of files that import B.

### R2: Export-signature diffing

**Concept**: Before `isAffected()` propagates changes to dependents, compare the changed document's exported symbols with its previous snapshot. If exports are identical, dependents don't need re-linking.

**Implementation:**

1. Add an export snapshot cache to `DomainLangIndexManager`:
   ```typescript
   private readonly exportSnapshots = new Map<string, Set<string>>();
   ```

2. In `updateContent()`, capture the export snapshot before and after indexing:
   ```typescript
   override async updateContent(document, cancelToken) {
       const uri = document.uri.toString();
       const oldExports = this.exportSnapshots.get(uri);

       await super.updateContent(document, cancelToken);

       const newExports = this.captureExportSnapshot(document);
       this.exportSnapshots.set(uri, newExports);

       // Only track/propagate if exports actually changed
       this.exportsChanged = !this.setsEqual(oldExports, newExports);

       await this.ensureImportsLoaded(document);
       await this.trackImportDependencies(document);
   }
   ```

3. In `isAffected()`, skip transitive import checking when exports haven't changed:
   ```typescript
   override isAffected(document, changedUris) {
       if (super.isAffected(document, changedUris)) return true;
       // Only check import deps if any changed file's exports actually changed
       if (!this.anyExportsChanged(changedUris)) return false;
       const affectedSet = this.computeAffectedSet(changedUris);
       return affectedSet.has(document.uri.toString());
   }
   ```

**What counts as an "export"**: The set of `(name, type)` tuples from `collectExportedSymbols()`. For DomainLang, `type` is the AST node type (`Domain`, `BoundedContext`, `Team`, etc.) and `name` is the qualified name. This is simpler than gopls' full type signature comparison because DomainLang's exports are named elements, not typed declarations.

**Edge case**: When a document is *new* (no previous snapshot), treat exports as changed to ensure dependents are properly linked on first load.

### R3: Import cycle detection

**Algorithm**: DFS with a recursion stack during `trackImportDependencies()`.

**Implementation:**

1. After building the forward import map (`documentImportInfo`) for a document, run cycle detection from that document:
   ```typescript
   private detectCycle(startUri: string): string[] | undefined {
       const visited = new Set<string>();
       const stack: string[] = [];

       const dfs = (uri: string): string[] | undefined => {
           if (stack.includes(uri)) {
               // Found cycle: return the cycle path from the repeated URI
               const cycleStart = stack.indexOf(uri);
               return [...stack.slice(cycleStart), uri];
           }
           if (visited.has(uri)) return undefined;

           visited.add(uri);
           stack.push(uri);

           for (const imp of this.documentImportInfo.get(uri) ?? []) {
               if (imp.resolvedUri) {
                   const cycle = dfs(imp.resolvedUri);
                   if (cycle) return cycle;
               }
           }

           stack.pop();
           return undefined;
       };

       return dfs(startUri);
   }
   ```

2. Report the cycle as a validation diagnostic on the `ImportStatement` node. Add a new issue code `IssueCodes.ImportCycle` and a `ValidationMessages.IMPORT_CYCLE()` message:
   ```
   Circular import detected: sales.dlang → types.dlang → sales.dlang
   Hint: Break the cycle by extracting shared types into a separate file.
   ```

3. The cycle detection runs in `DomainLangIndexManager`, but the *diagnostic* must be reported during validation (Langium's lifecycle). Store detected cycles in the index manager and check them in `ImportValidator`:
   ```typescript
   // In ImportValidator.checkImportPath():
   const cycle = indexManager.getCycleForDocument(document.uri.toString());
   if (cycle) {
       accept('error', ValidationMessages.IMPORT_CYCLE(cycle), { ... });
   }
   ```

### R4: Precise specifier matching

**Current code** (in `hasMatchingSpecifierOrResolvedUri()`):
```typescript
if (info.specifier.includes(changedPath) || changedPath.endsWith(normalizedSpecifier)) {
    return true;
}
```

**Proposed replacement**: Exact filename matching with path normalization:
```typescript
private matchesChangedPath(specifier: string, resolvedUri: string | undefined, changedPaths: Set<string>): boolean {
    // 1. Check resolved URI (most reliable — already normalized)
    if (resolvedUri) {
        for (const changedPath of changedPaths) {
            if (resolvedUri.endsWith(`/${changedPath}`) || resolvedUri === changedPath) {
                return true;
            }
        }
    }

    // 2. Check specifier with exact filename extraction
    const specifierFileName = specifier.split('/').pop()?.replace(/\.dlang$/, '');
    if (!specifierFileName) return false;

    for (const changedPath of changedPaths) {
        const changedFileName = changedPath.split('/').pop()?.replace(/\.dlang$/, '');
        if (specifierFileName === changedFileName) {
            // Exact filename match — but verify parent path doesn't contradict
            return this.pathsCompatible(specifier, changedPath);
        }
    }
    return false;
}
```

### R5: Content-hash manifest caching

Replace in `readAndCacheManifest()`:

```typescript
// Before (fragile):
if (context?.manifestCache?.mtimeMs === stat.mtimeMs) { return cached; }

// After (robust):
import { createHash } from 'node:crypto';
const contentHash = createHash('sha256').update(content).digest('hex');
if (context?.manifestCache?.contentHash === contentHash) { return cached; }
```

The `ManifestCache` interface adds a `contentHash: string` field and removes `mtimeMs`. The content is read before hashing (no extra I/O since we read it anyway to parse YAML).

### R6: Package cache watching

Register an additional file watcher pattern in the LSP startup:

```typescript
// In main.ts or registerDomainLangRefresh():
connection.client.register(DidChangeWatchedFilesNotification.type, {
    watchers: [
        { globPattern: '**/model.yaml' },
        { globPattern: '**/model.lock' },
        { globPattern: '**/.dlang/packages/**/*.dlang' }  // NEW
    ]
});
```

When `.dlang/packages/` changes arrive in `processWatchedFileChanges()`, categorize them as dependency changes and trigger a targeted rebuild of documents that import external packages.

### R7: Deferred validation at startup

In `DomainLangWorkspaceManager.loadAdditionalDocuments()`:

```typescript
// Before:
await this.sharedServices.workspace.DocumentBuilder.build(importedDocs, { validation: true });

// After:
await this.sharedServices.workspace.DocumentBuilder.build(importedDocs, { validation: false });
```

Validation will run on-demand when:
- A file is opened in the editor (Langium's `textDocument/didOpen` handler triggers build-to-validated)
- The workspace becomes idle (Langium's background processing)

This follows pyright's pattern: open files get immediate validation, background files are validated lazily.

---

## Acceptance criteria

### P0 (must have)

- [x] **R1**: Editing a `.dlang` file only clears the import resolution cache for that file and its dependents (not the entire workspace)
- [x] **R1**: Test with 10+ file workspace: editing one file does not trigger `resolveFrom()` calls for unrelated files
- [x] **R2**: Editing a domain's `vision:` string does not trigger re-linking of files that import that domain
- [x] **R2**: Adding a new `BoundedContext` to a file *does* trigger re-linking of importers
- [x] **R3**: Creating an import cycle produces an error diagnostic on the `ImportStatement` node
- [x] **R3**: The cycle diagnostic includes the full cycle path (e.g., `A.dlang → B.dlang → A.dlang`)
- [x] **R3**: Breaking the cycle (removing one import) clears the diagnostic
- [x] **R4**: Changing `sales.dlang` does not trigger revalidation of a file importing `pre-sales.dlang`
- [x] **R4**: Changing `sales.dlang` *does* trigger revalidation of a file importing `./sales`

### P1 (should have)

- [x] **R5**: Manifest cache correctly detects changes even when `stat.mtimeMs` is unchanged (simulated by writing same-second content)
- [x] **R6**: Running `dlang install` while LSP is active causes affected documents to revalidate without LSP restart
- [x] **R7**: Workspace initialization with 20+ files completes indexing (reports ready) before full validation finishes

### P2 (nice to have)

- [x] **R8**: `ImportResolutionError` carries `specifier` and `attemptedPaths` properties accessible programmatically
- [x] **R9**: No two classes in the codebase use the name `WorkspaceManager`
- [x] **R10**: Import resolution tracing via `DOMAINLANG_TRACE_IMPORTS` env var
- [x] **R11**: Workspace layout caching with incremental updates via `onManifestEvent()`
- [ ] **R12**: Tiered validation — deferred to future release
- [ ] **R13**: Validation-on-save mode — deferred to future release
- [ ] **R14**: Persistent index cache — deferred to future release
- [x] **R15**: TTL removed from `PerformanceOptimizer`; event-based invalidation only
- [ ] **R16**: Decouple from filesystem I/O — deferred to future release
- [x] **R17**: Structured LSP logging via `createLogger()`

---

## Implementation plan

### Phase 1: Cache precision (R1, R4) — ~1 week

**Goal**: Eliminate cache thrashing and false-positive invalidation.

1. Replace `WorkspaceCache` with `DocumentCache` in `ImportResolver`
2. Add `invalidateForDocuments()` method to `ImportResolver`
3. Wire invalidation from `DomainLangIndexManager.updateContent()` to `ImportResolver`
4. Replace substring matching with exact-path matching in `hasMatchingSpecifierOrResolvedUri()`
5. Write tests verifying targeted invalidation and no false positives

**Files changed:**
- `packages/language/src/services/import-resolver.ts`
- `packages/language/src/lsp/domain-lang-index-manager.ts`
- `packages/language/test/lsp/` (new test files)

### Phase 2: Export diffing + cycle detection (R2, R3) — ~1 week

**Goal**: Prevent unnecessary cascading and diagnose import cycles.

1. Add export snapshot cache to `DomainLangIndexManager`
2. Implement `captureExportSnapshot()` and comparison logic
3. Gate `isAffected()` transitive check on export changes
4. Implement `detectCycle()` DFS in `DomainLangIndexManager`
5. Add `IssueCodes.ImportCycle` and `ValidationMessages.IMPORT_CYCLE()`
6. Wire cycle reporting into `ImportValidator`
7. Write tests for both export diffing and cycle detection

**Files changed:**
- `packages/language/src/lsp/domain-lang-index-manager.ts`
- `packages/language/src/validation/import.ts`
- `packages/language/src/validation/constants.ts`
- `packages/language/test/` (new test files)

### Phase 3: Resilience improvements (R5, R6, R7) — ~1 week

**Goal**: Robust caching, live dependency updates, faster startup.

1. Replace `mtimeMs` with content hashing in manifest cache
2. Register `.dlang/packages/` file watcher
3. Handle package change events in `processWatchedFileChanges()`
4. Change `loadAdditionalDocuments()` to use `{ validation: false }`
5. Write tests for hash-based caching and deferred validation

**Files changed:**
- `packages/language/src/services/workspace-manager.ts` (or `manifest-manager.ts` if R9 is done)
- `packages/language/src/lsp/domain-lang-refresh.ts`
- `packages/language/src/lsp/domain-lang-workspace-manager.ts`
- `packages/language/src/main.ts`
- `packages/language/test/` (new/updated test files)

### Phase 4: Polish (R8, R9) — ~3 days

**Goal**: Structural cleanup.

1. Create `ImportResolutionError` class with structured properties
2. Replace string template throws in `ImportResolver` with structured errors
3. Rename `services/WorkspaceManager` → `ManifestManager` (or `ProjectConfigManager`)
4. Update all imports/references across the codebase

**Files changed:**
- `packages/language/src/services/import-resolver.ts`
- `packages/language/src/services/workspace-manager.ts` → renamed
- All files importing the renamed class

---

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `DocumentCache` invalidation semantics differ subtly from `WorkspaceCache` | Stale cache entries → incorrect import resolution | Medium | Comprehensive test suite covering cache miss/hit scenarios; integration tests with multi-file workspaces |
| Export snapshot comparison misses edge cases (e.g., re-export through aliases) | Dependents not invalidated when they should be | Low | Conservative design: any new/removed export name triggers invalidation; only skip when set is *identical* |
| Cycle detection DFS has performance cost on large import graphs | Slow indexing for 100+ file workspaces | Low | DFS is O(V+E) which is negligible for typical DDD workspaces (10-50 files). Cache cycle results and only re-check when imports change. |
| Deferred validation (R7) may confuse users who expect immediate diagnostics | Reported as bug, user trust eroded | Medium | Only defer validation for *background* files; open files get immediate validation. Document the behavior. |
| Renaming `WorkspaceManager` (R9) creates a large diff | Merge conflicts with other branches | Low | Do as last phase; single atomic commit; coordinate timing |

---

## Open questions

1. **Export snapshot granularity**: Should we compare only symbol names, or also node types (Domain vs BoundedContext)? Names-only is simpler but could miss edge cases where a name changes from Domain to BoundedContext. *Recommendation: include node type in the comparison tuple.*

2. **Cycle detection scope**: Should we detect cycles within single-file self-imports (which are impossible in current grammar but could occur with aliases), or only cross-file cycles? *Recommendation: only cross-file cycles, matching the import graph structure.*

3. **R6 watcher scope**: Should we watch `**/.dlang/packages/**/*.dlang` (only `.dlang` files) or `**/.dlang/packages/**` (all files including `model.yaml` inside packages)? *Recommendation: all files, since package `model.yaml` files affect entry point resolution.*

4. **R7 background validation trigger**: Should deferred validation trigger after a fixed delay (e.g., 2 seconds idle), or only on file open? *Recommendation: on file open + workspace idle, to match pyright's behavior.*

# PRS-021: comprehensive code review findings

> Review feedback assisted by the [critical-code-reviewer skill](https://github.com/posit-dev/skills/blob/main/posit-dev/critical-code-reviewer/SKILL.md).

## Summary

**BLUF: This codebase has a well-designed grammar and a thoughtful SDK surface, but it is shipping multiple exploitable security vulnerabilities, pervasive type-safety bypasses, and resource leaks that will cause production incidents.**

The DomainLang solution was reviewed adversarially across all packages: grammar, language server (LSP), validation, SDK, services, CLI, VSCode extension, diagram generation, utilities, build configuration, and CI/CD pipeline.

The most likely production incidents this code will cause:

1. **A malicious `model.lock` file committed to a shared repository will write arbitrary files to any team member's filesystem** when they run `dlang install` (SEC-001).
2. **The language server will leak an infinite chain of 10ms timers** every time a document state wait times out, slowly degrading editor performance until restart (B-013).
3. **The SDK's `serializeNode` will silently output `{}` for metadata Maps**, corrupting any downstream consumer that relies on serialized model data (B-008).
4. **The language server will hang indefinitely** during validation of large import graphs because cancellation tokens are accepted but never checked (B-005).

The codebase violates its own stated rules in `copilot-instructions.md`:
- "No unsafe `!` assertions in production code" -- violated at 15+ locations.
- "Prefer `unknown` over `any` with type guards" -- 30+ `as unknown as T` double casts bypass type guards entirely.
- "No `console.log()` in libraries" -- `console.warn` and `console.error` used in the language server, where they corrupt the LSP stdio protocol.

**Verdict: Request Changes**

---

## Critical issues (blocking)

### Security

**B-001** `packages/cli/src/services/package-cache.ts:220-222` -- **Path traversal via poisoned lock file.** `commitSha` flows from `JSON.parse(lockContent)` without hex validation. A `model.lock` containing `"commit": "../../../../../../../tmp/evil"` resolves to an arbitrary filesystem path. The `put()` method then renames a temp directory to that path, achieving arbitrary file write. Attack vector: attacker commits malicious `model.lock` to shared repo; victim runs `dlang install`. Fix: validate `commitSha` matches `/^[0-9a-f]{7,40}$/i`, validate `owner`/`repo` against `/^[a-zA-Z0-9._-]+$/`, assert resolved path starts with cache directory.

**B-002** `packages/cli/src/services/credential-provider.ts:158` -- **Git credential protocol injection.** `host` is interpolated into git credential fill protocol (`protocol=https\nhost=${host}\n`) without sanitization. A host containing `\nusername=attacker` injects arbitrary key-value pairs. Current exposure is limited (only caller passes `'github.com'`), but the public API accepts arbitrary strings. Fix: reject hosts containing `\n`, `\r`, `\0`.

**B-003** `packages/cli/src/services/package-downloader.ts:225,248` and `packages/cli/src/services/github-tags.ts:49` -- **URL path injection in GitHub API calls.** `sha`, `commitSha`, `owner`, and `repo` are interpolated into API URLs without `encodeURIComponent`. Line 202 correctly encodes `ref`, but lines 225 and 248 do not. Combined with B-001, malicious lock files can redirect API calls to attacker-controlled endpoints. Fix: apply `encodeURIComponent` to all path segments from external input.

**B-004** `packages/cli/package.json:58` -- **Known high-severity `tar` CVE (GHSA-83g3-92jg-28cx).** `"tar": "^7.0.0"` resolves to 7.5.7; fix is 7.5.8+. The CLI unpacks tarballs from GitHub as part of package management -- this is a direct, exploitable attack surface. Fix: update `tar` to `>=7.5.8`.

**B-005** `.github/workflows/ci-cd.yml:277` -- **SonarQube action pinned to `@master`.** All other actions use version tags; this one uses `@master`. A compromise of the SonarSource repository gives code execution in CI with `SONAR_TOKEN` access. Fix: pin to a specific version tag or commit SHA.

### Data corruption

**B-006** `packages/language/src/lsp/domain-lang-completion.ts:385-388` -- **`undefined` cast to `CompletionContext` via double escape hatch.** `undefined as unknown as CompletionContext` fabricates a null object. Any helper that accesses `ctx.textDocument`, `ctx.offset`, or `ctx.triggerCharacter` will throw `TypeError: Cannot read properties of undefined`. This is not theoretical -- it depends on which code paths `collectImportItems` takes. Fix: provide a real `CompletionContext` or refactor callee to accept `undefined`.

**B-007** `packages/language/src/lsp/domain-lang-completion.ts:461-466` -- **Fabricated `ReferenceInfo` bypasses interface contract.** A partial object is double-cast to `ReferenceInfo` via `as unknown as AstNodeDescription`. If Langium's scope provider accesses `reference.property`, `reference.container`, or any other required field, the result is a runtime crash with no meaningful error message. Fix: construct a valid `ReferenceInfo` with all required properties, or use the Langium-provided factory.

**B-008** `packages/language/src/sdk/serializers.ts:116-156` -- **`serializeNode` leaks augmented properties and corrupts `metadataMap`.** `Object.entries(node)` iterates SDK-augmented properties (`effectiveRole`, `effectiveTeam`, `metadataMap`). `JSON.stringify` on a `Map` produces `{}`, silently losing all metadata. Output shape varies depending on whether the node was augmented. Fix: use a whitelist of known AST properties, or filter out augmented properties before serialization. Convert Maps to `Object.fromEntries()`.

**B-009** `packages/language/src/sdk/serializers.ts:90-95` -- **`normalizeEntityType` casts arbitrary strings to `QueryEntityType`.** Any string not in `ENTITY_ALIASES` is blindly cast via `type as QueryEntityType`, defeating the union type entirely. `query.entities('literally-anything')` compiles and returns zero results with no error. Fix: validate against known canonical types, throw or return `undefined` for unknown values.

**B-010** `packages/language/src/sdk/validator.ts:104-122` -- **`countModelElements` ignores namespaced elements.** Only iterates `model.children` (direct children), never recurses into `NamespaceDeclaration` blocks. SDK query methods use `streamAllContents()` which does recurse. Result: `ValidationResult.domainCount` contradicts `query.domains().count()`. Fix: use `AstUtils.streamAllContents` for counting.

**B-011** `packages/language/src/services/performance-optimizer.ts:83-87` -- **Manifest cache invalidated with wrong key.** Manifest is cached by `manifestPath` (full file path) but invalidated by `workspaceRoot` (parent directory). `invalidateCache(workspaceRoot)` never matches the cached key, so the manifest cache is effectively never invalidated. Users see stale manifests until LSP restart. Fix: align cache key to use the same value for get/set/invalidate.

**B-012** `packages/language/src/services/workspace-manager.ts:326-331,481-484` -- **Dual-cache invalidation inconsistency.** `ManifestManager.invalidateLockCache()` does not clear the `PerformanceOptimizer` cache layer. The next `loadLockFile()` call reads stale data from the optimizer cache even though the manifest manager's cache was cleared. Fix: invalidate both caches together, or proxy cache reads through a single layer.

### Resource leaks and race conditions

**B-013** `packages/language/src/utils/document-utils.ts:35-54` -- **Infinite polling loop after timeout.** When the timeout fires at line 36, `reject()` is called, but the inner `checkState` function continues scheduling `setTimeout(checkState, 10)` indefinitely. There is no flag to stop polling after rejection. In a long-running LSP server, each timed-out `waitForState` call leaks an infinite chain of 10ms timers. Fix: track a `settled` flag, check it at the top of `checkState`, and `clearTimeout` the pending timer on rejection.

**B-014** `packages/language/src/services/workspace-manager.ts:98,136` -- **`activeRoot` race condition.** `activeRoot` is shared mutable state set in `initialize()` and read in multiple async methods. Concurrent `initialize()` calls for different workspaces race on this field, causing the wrong workspace root to be used for file resolution, imports, and manifest loading. Fix: scope root per-operation or use a mutex.

**B-015** `packages/language/src/validation/import.ts:48-53` -- **`CancellationToken` accepted but never honored.** Async `checkImportPath` performs multiple I/O operations (filesystem stat, git tag fetch, manifest parsing) but never checks `_cancelToken.isCancellationRequested`. In large import graphs, the language server hangs until all I/O completes even after the user cancels. Fix: check token between I/O operations.

**B-016** `packages/language/src/validation/model.ts:34` -- **AST mutation inside validation function.** `setInferredRelationshipTypes(model)` mutates the AST inside `validateModelUniqueNames`. If validation is skipped (e.g., document opened in non-validation mode, or test harness), relationship types are never inferred. Validators should be pure observers. Fix: move relationship inference to a dedicated AST processing phase.

**B-017** `packages/extension/src/webview/views.ts:418` -- **Model mutation during `render()`.** `(edge as SEdgeImpl).routingPoints = [...]` mutates readonly model state inside a Sprotty `render()` override. Sprotty can re-render on model state change, creating a potential infinite render loop. Fix: move waypoint computation to a pre-render hook or command handler.

**B-018** `packages/extension/src/extension/lm-tools.ts:33,49,62,65,78,214,231` -- **Unvalidated LLM tool input.** `options.input as { query: string }`, `options.input as { contextMapFqn: string }`, etc. are used without runtime validation. LLMs routinely produce malformed JSON (missing fields, wrong types, extra nesting). Any missing property causes a `TypeError` crash in the extension host. Fix: add runtime shape validation (e.g., zod schema or manual checks) for all tool inputs and outputs.

**B-019** `packages/language/src/lsp/domain-lang-index-manager.ts:314,392` -- **`as unknown as Model` double cast on parse result.** Two locations cast `parseResult.value` to `Model` via `unknown` without any runtime type guard. If the document is empty, partially parsed, or from a different language registration in a multi-language workspace, all downstream operations silently operate on a malformed object. Fix: use `isModel()` type guard and return early with diagnostics on failure.

**B-020** `packages/language/src/main.ts:86-91` -- **Concurrent import graph reloads without debounce.** `onDidChangeContent` triggers `reloadFromEntry()` for every keystroke in an import-graph file. Multiple async reloads race against each other, with `currentGraph` being reassigned while another reload is checking it. Fix: add a debounce or concurrency guard.

---

## Required changes

### Type safety violations (violates project's own "prefer unknown over any with type guards" rule)

**R-001** `packages/language/src/domain-lang-module.ts:98,126,131` -- **`as never` casts at DI boundary.** Three `as never` casts completely eliminate type checking on the DI container wiring. `never` is a bottom type that satisfies any constraint, so missing service properties compile silently and crash at runtime. The proper fix is to create adapter types or declare a compatible union type for Langium + Sprotty service interfaces.

**R-002** `packages/language/src/domain-lang-module.ts:141-147` -- **`instanceof` late-binding silently skips initialization.** If DI provides a different `IndexManager` implementation (e.g., in tests), `setLanguageServices()` is silently skipped, causing later crashes with "ImportResolver not initialised." Fix: throw if the `instanceof` check fails in production, or use an interface check.

**R-003** `packages/language/src/diagram/context-map-diagram-generator.ts:208,225,261,282,332,439` -- **Six `as unknown as SModelElement` double casts.** Every edge label and node label is constructed as a plain object literal and double-cast. If `sprotty-protocol` adds a mandatory field, all six sites produce malformed elements with no compile error. Fix: use typed factory functions or `satisfies` assertions.

**R-004** `packages/language/src/utils/import-utils.ts:45` -- **`as unknown as Model` on parse result.** Same pattern as B-019 but in the import utility. Fix: use `isModel()` type guard.

**R-005** `packages/extension/src/language/main.ts:71-72` -- **`as unknown as LangiumSprottyServices` double cast.** Extension startup casts the DI container without verifying the Sprotty services are actually registered.

**R-006** `packages/language/src/sdk/query.ts:277` -- **`byFqn<T>()` performs unchecked type cast.** `query.byFqn<Domain>('SalesTeam')` returns a `Team` typed as `Domain` with no error. Fix: add runtime type guard in convenience methods.

### Error handling (violates project's own "no console.log in libraries" rule)

**R-007** `packages/language/src/main.ts:44,47,70` -- **`console.warn` in LSP server corrupts stdio.** The LSP server communicates over stdio. `console.warn` writes to stderr which, on some LSP clients, can corrupt JSON-RPC message framing. Line 75 correctly uses `connection.console.error` but lines 44, 47, and 70 do not. Fix: replace all `console.warn`/`console.error` with `connection.console.warn`/`connection.console.error`.

**R-008** `packages/language/src/validation/import.ts:341,384` -- **`console.warn` in validator.** Same stdio corruption risk in the validation layer. Fix: use Langium's logging service.

**R-009** Systemic: `domain-lang-scope-provider.ts:87`, `domain-lang-code-actions.ts:61`, `tool-handlers.ts:214-217,256-259,292-295,322-325`, `domain-lang-completion.ts:412-416`, `domain-lang-index-manager.ts:422-424` -- **Universal error swallowing.** Every `try/catch` in the LSP layer follows `catch (error) { console.error(...); return []; }`. Users never see error messages in the editor. The most likely production failure mode: a user's workspace has a subtle configuration error, every LSP feature silently returns empty results, and the user thinks the extension is broken. Fix: implement structured error reporting -- classify errors, surface actionable ones via `window/showMessage`, log internal ones with context.

**R-010** `packages/language/src/utils/manifest-utils.ts:73` -- **Unvalidated YAML parse cast to `ModelManifest`.** `YAML.parse(content)` can return any JavaScript value (number, string, array, null). The `?? {}` only guards against null; a YAML file containing `42` is cast to `ModelManifest` and any access to `manifest.model.entry` crashes. Fix: add runtime shape validation.

**R-011** `packages/language/src/utils/manifest-utils.ts:92-94` -- **Bare `catch` masks permission and parse errors.** `readEntryFromManifest` catches all errors including `EACCES`, disk I/O failures, and YAML syntax errors. A manifest with a typo silently falls back to the default entry with no user indication. Fix: only catch `ENOENT`; re-throw others.

**R-012** `packages/language/src/utils/import-utils.ts:53-55` -- **Bare `catch` swallows import resolution errors.** Comment says "validation will report the error" but this assumption only holds if the validator independently re-resolves. A single poisoned import silently stops traversal of that branch. Fix: log via LSP logger, or collect failures alongside the visited set.

**R-013** `packages/language/src/main.ts:82` -- **Top-level `await` without error boundary.** If `reloadFromEntry()` rejects at startup, the unhandled rejection crashes the LSP server process. Fix: wrap in `try/catch` with graceful degradation.

**R-014** `packages/language/src/main.ts:20-22,31-49` -- **Two separate `onInitialize` handlers.** If Langium's `onInitialize` only stores the last handler (like `connection.onInitialize`), the first handler (settings application) is silently replaced and never executes. Fix: merge into a single handler.

### Consistency and correctness

**R-015** `packages/language/src/lsp/tool-handlers.ts:368` -- **`metadata.split('=')` loses values containing `=`.** A metadata entry like `url=https://example.com/path?q=1` splits into 3 parts; only the key and partial value are kept. Fix: use `indexOf('=')` and split on first occurrence only.

**R-016** `packages/language/src/validation/import.ts:393` -- **`source.split('/')` silently discards path segments.** `const [owner, repo] = source.split('/')` discards everything after the second segment. If `source` has no slash, `repo` is `undefined`. Fix: validate split result length.

**R-017** `packages/language/src/validation/manifest.ts:387` -- **`isValidRefSpec` rejects valid git branch names.** Regex `[\w.-]+` rejects `feature/my-feature`. Fix: allow `/` in branch names.

**R-018** `packages/language/src/validation/relationships.ts:161-167` -- **Hardcoded error messages bypass centralized constants.** Two inline error strings instead of `ValidationMessages.XXX` with `IssueCodes` entries, breaking code action matching.

**R-019** `packages/language/src/validation/maps.ts:49` vs `import.ts:59` -- **`code` vs `data.code` diagnostic inconsistency.** Some validators put the issue code at the top-level `code` property; others nest it inside `data: { code }`. Code actions that look for `diagnostic.code` silently fail to match validators that use the `data` path. Fix: standardize.

**R-020** `packages/cli/src/utils/output-mode.ts:34-43` -- **Flag detection matches positional arguments.** `hasFlag('json')` matches the bare word `json` anywhere in `process.argv`. Running `dlang validate json.dlang` incorrectly activates JSON output mode. Fix: only match `--json` and `--quiet`.

**R-021** `packages/cli/src/services/semver.ts:57` vs `install-service.ts:514` -- **Inconsistent `detectRefType`.** One accepts 7-40 hex chars, the other accepts exactly 40. Fix: consolidate to one shared implementation.

**R-022** `packages/cli/src/services/github-tags.ts:93-98` -- **`classifyUpgrade` returns `'patch'` for non-semver input.** `split('.')` on a non-semver string produces array with `undefined` at index 1. `undefined !== undefined` is false, so the function silently returns `'patch'`. Fix: validate semver structure first.

**R-023** `packages/cli/src/services/dependency-resolver.ts:131,500` -- **Resolution messages accumulate across calls.** `overrideMessages` and `resolutionMessages` arrays are never cleared between `resolveDependencies()` invocations. Fix: clear at start of each resolution.

**R-024** `packages/language/src/lsp/domain-lang-index-manager.ts:164-165` -- **Cancellation token not propagated.** `ensureImportsLoaded()` and `trackImportDependencies()` never check the token passed to `updateContent()`. Fix: thread token through and check periodically.

**R-025** `packages/language/src/utils/manifest-utils.ts:115-129` -- **`findManifestsInDirectories` behavior contradicts JSDoc.** JSDoc says "only checks direct children" but implementation calls `findNearestManifest` which walks UP to the filesystem root. Two directories sharing a parent can return duplicate manifests. Fix: align documentation with behavior, or restrict traversal.

### Extension lifecycle

**R-026** `packages/extension/src/extension/main.ts:141` -- **`onDidChangeState` disposable leaked.** The returned disposable is never pushed to `context.subscriptions`. Fix: add to subscriptions.

**R-027** `packages/extension/src/extension/main.ts:166` -- **`sendNotification` unguarded when client is stopped.** If the user changes settings after a server crash, `sendNotification` throws. Fix: check `client.state` before sending.

**R-028** `packages/extension/src/extension/lm-tools.ts:17` and `main.ts:142` -- **Magic numbers for `LanguageClient.State`.** `CLIENT_STATE_RUNNING = 2` and `event.newState === 3` are raw integers. If `vscode-languageclient` changes enum values, these silently break. Fix: import `State` enum.

### Security (P1)

**R-029** `packages/language/src/services/workspace-manager.ts:451-459` and `import-resolver.ts:412-420` -- **No validation on `entry` field from untrusted package manifests.** A malicious cached package can set `entry: "../../../../etc/passwd"`. `path.join` with an absolute entry discards the package directory. Fix: validate entry is a relative path within the package directory.

**R-030** `packages/language/src/services/workspace-manager.ts:673-698` -- **Symlink-based path traversal bypass.** `path.resolve` normalizes `..` logically but does not follow symlinks. A symlink within the workspace can escape the boundary. Fix: use `fs.realpath()` before comparing paths.

### Build and CI

**R-031** `dsl/domain-lang/eslint.config.js:44` -- **`no-floating-promises` is disabled.** Unhandled promise rejections are the most common source of silent failures in Node.js. The project's own instructions say quality must pass with 0 warnings. Fix: enable with type-aware linting.

**R-032** `packages/cli/vitest.config.ts:33` -- **CLI integration tests never run in CI.** `INTEGRATION_TESTS=true` is never set in the CI workflow. Three integration test files are permanently excluded. Fix: add integration test step to CI.

**R-033** `.github/workflows/ci-cd.yml:178-180` -- **Extension tests never run in CI.** Only language and CLI workspaces have test steps. Fix: add extension test step.

**R-034** Language: 65% lines / 63% branches. CLI: 55% branches. -- **Coverage thresholds are low for a compiler project.** Fix: incrementally raise. Target 75%+ branches for language, 65%+ for CLI.

**R-035** `dsl/domain-lang/package.json:39-40` -- **Deprecated ESLint `--ext` flag with flat config.** `--ext .ts,.tsx` is ignored in flat config mode and will error in ESLint 10. Fix: remove `--ext`.

---

## Suggestions

**S-001** `packages/language/src/lsp/domain-lang-scope-provider.ts:110-112,161-162` -- **O(N*M) scope resolution.** `allElements()` is called per import. For N imports and M indexed elements, this creates O(N*M) scanning. Consider pre-computing a URI-to-descriptions map once per scope resolution cycle.

**S-002** `packages/language/src/sdk/loader.ts:61` -- **Module-level mutable `documentCounter`.** Shared across all `ModelLoader` instances. Creates non-deterministic URIs in concurrent tests. Consider scoping per loader instance.

**S-003** `packages/language/src/sdk/loader-node.ts:60-147` -- **`loadModel` never removes documents.** Documents accumulate in workspace; subsequent calls rebuild all accumulated documents with quadratic growth. Consider cleanup or `dispose()`.

**S-004** `packages/language/src/sdk/resolution.ts:66-78` and `query.ts:593-596` -- **`metadataAsMap` creates new Map on every getter access.** Consider caching on first access.

**S-005** `packages/language/src/sdk/query.ts:573,659` -- **`QualifiedNameProvider` instantiated per AST node.** Consider a single shared instance during augmentation.

**S-006** `packages/language/src/sdk/loader.ts:177-190` -- **`loadModelFromText` silently ignores `workspaceDir` option.** Either use it or remove from the type.

**S-007** `packages/language/src/sdk/patterns.ts:19-90` -- **Three overlapping pattern data structures.** Must be kept in sync manually. Derive from a single source of truth.

**S-008** `packages/language/src/lsp/domain-lang-completion.ts:372-403 vs 652-684` -- **Import completion logic duplicated.** `collectImportItems()` and `addImportCompletions()` duplicate routing logic.

**S-009** `packages/language/src/validation/constants.ts:143,156` -- **Unused `bcName` parameter in conflict messages.** Either use in the message or remove.

**S-010** `packages/language/src/validation/domain.ts:34-75` -- **Cycle error reported on all participants.** Consider reporting from one canonical node only.

**S-011** `packages/language/src/validation/maps.ts` -- **No duplicate bounded context detection in `contains`.** `contains OrderService, OrderService` produces no warning.

**S-012** `packages/language/src/services/performance-optimizer.ts:118` -- **Global singleton bypasses DI.** Consider registering as a Langium service.

**S-013** `packages/language/src/services/workspace-manager.ts:618,677,691` -- **Full filesystem paths in error messages.** Information disclosure risk in remote/hosted LSP scenarios. Sanitize.

**S-014** `packages/language/src/services/types.ts` -- **~14 types unused within language package.** Types like `ResolvingPackage`, `DependencyGraph`, `GovernanceViolation` appear CLI-specific. Consider moving.

**S-015** `packages/cli/src/utils/run-direct.ts:79,83,96` -- **`process.exit()` prevents cleanup.** Pending I/O and `finally` blocks are skipped. Consider `process.exitCode` + natural termination.

**S-016** `packages/cli/src/services/package-cache.ts:67-86,194-199` -- **TOCTOU race conditions.** `existsSync()` followed by async operation. `put()` uses atomic rename; extend pattern to `remove()` and `get()`.

**S-017** `packages/extension/src/language/main.ts:96-98` -- **`isRecord` treats arrays as records.** `typeof value === 'object' && value !== null` is true for arrays. Add `&& !Array.isArray(value)`.

**S-018** `packages/extension/package.json:9` -- **Non-standard SPDX license identifier.** `"Apache License 2.0"` should be `"Apache-2.0"`.

**S-019** `dsl/domain-lang/tsconfig.json` -- **Missing `noUncheckedIndexedAccess`.** Indexed access returns `T` instead of `T | undefined`, hiding null-access bugs in AST traversal.

**S-020** `.github/workflows/ci-cd.yml:61-73` -- **`commitlint` job orphaned from quality gate.** Does not block downstream jobs. Add to `needs` chain.

**S-021** CI uses only Node 20. `engines.node >= 20.10.0` implies Node 22+ compatibility. Add Node 22 to version matrix.

**S-022** `packages/language/src/domain-lang.langium:109` -- **Optional comma between relationships impairs error recovery.** `(",")?` between relationships means the parser must backtrack past entire relationship expressions to determine boundaries. Consider requiring a delimiter.

**S-023** `packages/language/src/domain-lang.langium` -- **No `@error` recovery tokens defined.** If the parser enters an error state mid-rule, it may skip tokens aggressively. Add recovery points at `StructureElement` level.

**S-024** `packages/language/src/diagram/elk-layout-factory.ts:25-28` -- **Double `as unknown as` for ESM/CJS interop.** No runtime guard that the resolved value is actually a constructor. Add `if (typeof _elkConstructor !== 'function') throw`.

**S-025** `packages/language/src/ast-augmentation.ts:1-9` -- **Module augmentation on potentially unstable interface names.** If generated AST regenerates with different interface names, augmentation silently targets nothing. Add compile-time test.

**S-026** `packages/language/src/utils/document-utils.ts` -- **Dead module.** Neither `waitForState` nor `waitForDocuments` is imported by any source file. The barrel `index.ts` does not export it. Remove or integrate.

---

## Addendum: deep-dive review of workspace management, indexing, import resolution, and selective rebuild

> This section was added as a focused follow-up using the critical-code-reviewer skill, targeting the import → index → scope → rebuild chain end-to-end -- for both local files and external packages.

### Architecture overview (as found)

The import/workspace/indexing subsystem consists of four tightly-coupled components:

| Component | File | Lines | Role |
| --- | --- | --- | --- |
| `DomainLangIndexManager` | `lsp/domain-lang-index-manager.ts` | ~878 | Reverse dependency graph, export-signature diffing, cycle detection, selective revalidation |
| `DomainLangScopeProvider` | `lsp/domain-lang-scope-provider.ts` | ~250 | Import-based scope restriction with alias support, package-boundary transitive imports |
| `DomainLangWorkspaceManager` | `services/workspace-manager.ts` | ~329 | Manifest-centric workspace loading (3 modes: entry-graph, recursive, module) |
| `ImportResolver` | `services/import-resolver.ts` | ~478 | Local/alias/external import resolution with caching |

Supporting: `DomainLangRefreshHandler` (refresh.ts ~150 lines), `PerformanceOptimizer` (singleton cache), `manifest-utils.ts`, `import-utils.ts`.

### Critical findings (blocking)

**IMP-B-001** `lsp/domain-lang-index-manager.ts:140-172` -- **No concurrency guard on `updateContent()`.** `updateContent()` is called from Langium's `DocumentBuilder.update()` which processes changed URIs. It calls three async operations sequentially: `super.updateContent()`, `ensureImportsLoaded()`, `trackImportDependencies()`. If two documents that import each other are edited simultaneously (normal multi-file refactoring), both `updateContent()` calls run concurrently, both call `removeDocumentFromDependencies()` (line 461) which iterates ALL dependency Sets and calls `.delete()`, while the other call is calling `addDependency()`. The `importDependencies` Map and `reverseDependencies` Map are shared mutable state with no synchronization. **Failure mode:** corrupted dependency graph → stale scope → phantom errors or missing completions for the rest of the session.

**IMP-B-002** `lsp/domain-lang-index-manager.ts:378-432` -- **`ensureImportsLoaded()` uses `importsLoaded` Set as a permanent gate.** Once a document URI is added to `importsLoaded` (line 393), it is never removed except by `clearImportDependencies()` (line 130) which is only called from `removeContent()`. **Failure mode when changing imports:**
1. User opens file A which imports file B. `ensureImportsLoaded` loads B, adds B's URI to `importsLoaded`.
2. User edits A to import file C instead of B. `updateContent()` is called for A.
3. `ensureImportsLoaded()` is called for A's new imports. It tries to load C -- **but B is still in `importsLoaded`**. B is never unloaded from the workspace, even though nothing imports it anymore.
4. B's symbols remain in the global index (`allElements()`), and the scope provider may still include B's exports if the URI-based filtering doesn't perfectly exclude unreferenced documents.
**Fix:** When the import set for a document changes (detected in `trackImportDependencies()`), compute the diff of old vs new imports, and unload documents that have zero remaining reverse dependents.

**IMP-B-003** `lsp/domain-lang-index-manager.ts:301-330` -- **`trackImportDependencies()` only tracks forward edges, never cleans reverse edges atomically.** `removeDocumentFromDependencies()` (line 461) removes the document from ALL dependency Sets, but `addDependency()` (line 133) re-adds it for current imports. Between remove-all and add-current, there is a window where `isAffected()` queries return incorrect results. In a concurrent scenario (IMP-B-001), a query during this window sees no dependencies for the document. **Failure mode:** a document change during this window would not trigger rebuilding of dependent files.

**IMP-B-004** `lsp/domain-lang-scope-provider.ts:95-130` -- **Scope resolution includes symbols from documents that are no longer imported.** The scope provider's `getImportedScopes()` iterates the index manager's `getImportInfo()` for the current document. But `getImportInfo()` at line 107-115 returns the tracked import info -- which may be STALE if `trackImportDependencies()` hasn't run yet for the latest version of the document. **Failure mode:** User removes `import "./billing"` from file A, saves. Between the save and the next `updateContent()` cycle, the scope still includes billing's exports. Completions and hover show elements from an import that no longer exists. This is a transient staleness, but it is observable and confusing to users.

**IMP-B-005** `main.ts:86-91` -- **`onDidChangeContent` triggers `reloadFromEntry()` on every keystroke with no debounce.** Each call to `reloadFromEntry()` is async: it calls `resolveAllImports()` which does filesystem I/O for every import. If the user types 10 characters in 1 second, 10 concurrent `reloadFromEntry()` calls are in flight. Each reassigns `currentGraph` (line 88), which is read by the next invocation. **Failure mode:** The old invocations' `currentGraph` is overwritten by newer invocations while the old ones are still comparing diffs against it. Result: incorrect diff → wrong documents rebuilt → stale index.

**IMP-B-006** `services/import-resolver.ts:255-296` -- **`resolveLocalPath()` does not validate resolved path stays within workspace root.** `resolveRelativeToDocument()` at line 260 calls `UriUtils.joinPath()` which follows `..` segments. An import like `import "../../../etc/passwd"` resolves to a path outside the workspace. The resolved URI is used to call `findDocumentByUri()` and potentially load the file's content. For the LSP this means a user-controlled import string can read arbitrary `.dlang`-extension files from the filesystem. **Partial mitigation:** only `.dlang` files would be loaded, but the content would still flow into parsing, indexing, and diagnostics. Combined with a symbolic link attack, this could expose sensitive data through hover/completion responses. **Fix:** Add workspace-root boundary check in `resolveLocalPath()`.

### Required changes (import/index subsystem)

**IMP-R-001** `lsp/domain-lang-index-manager.ts:276-299` -- **`computeExportSignature()` uses `JSON.stringify` for export comparison.** Export signatures are compared by stringified JSON. This works for ordering stability only if `AstNodeDescription` properties are always enumerated in the same order. V8 maintains insertion order for non-integer keys, but if Langium ever adds a property conditionally (e.g., `deprecated?: boolean` only when true), two equivalent descriptions would produce different JSON strings. **Fix:** Use a deterministic serialization or compare individual fields.

**IMP-R-002** `lsp/domain-lang-index-manager.ts:818-851` -- **Cycle detection DFS does not handle concurrent graph mutations.** The `detectCyclesFromDocument()` method reads `forwardDeps` from the live `importDependencies` Map during DFS traversal. If `updateContent()` modifies the graph concurrently, the DFS can see a partially-updated graph. **Failure mode:** false positive cycle detection (reports cycle that doesn't exist) or false negative (misses a real cycle). This is exacerbated by IMP-B-001.

**IMP-R-003** `lsp/domain-lang-index-manager.ts:868-877` -- **`invalidateImportResolverCache()` uses broad invalidation.** It calls `importResolver.invalidateForDocuments(affectedDocuments)` passing ALL affected documents (including transitively affected). For a diamond dependency graph (A→B, A→C, B→D, C→D), changing D passes {A, B, C, D} to invalidation. If B is the only one whose resolution actually changed, A's and C's cached resolutions are unnecessarily cleared. **This is a correctness issue, not just performance:** if the cache is cleared too broadly and the import resolver re-resolves during a transient network/filesystem state, it may cache a different result than the stable one.

**IMP-R-004** `lsp/domain-lang-scope-provider.ts:110-112,161-162` -- **`allElements()` called per import creates O(N*M) scope resolution.** For N imports and M globally-indexed descriptions, the scope provider scans all M descriptions N times, filtering by document URI each time. With 50 imported files and 500 indexed symbols, this is 25,000 filter operations per scope resolution (per keystroke with completions). **Fix:** Pre-compute a Map<URI, AstNodeDescription[]> once per scope resolution cycle.

**IMP-R-005** `lsp/domain-lang-scope-provider.ts:193-229` -- **Package-boundary transitive import logic has zero live test coverage.** The `addPackageBoundaryTransitiveImports()` method is the ONLY test that covers it (`import-alias-adr003.test.ts:204`) and it is `test.skip()`. This 37-line method makes decisions about whether to transitively include symbols from external packages based on `PackageBoundaryDetector.areInSamePackageSync()`. Any regression here is undetectable.

**IMP-R-006** `services/import-resolver.ts:340-370` -- **Import resolution cache (`resolveCache`) is keyed by `documentUri + importPath` but not by workspace root.** If the LSP server handles multi-root workspaces (or the root changes), cached resolutions from the old root persist and return incorrect results. **Fix:** Include workspace root in cache key, or invalidate entire cache on root change.

**IMP-R-007** `services/import-resolver.ts:298-331` -- **External dependency resolution returns `ImportResolutionError` with reason `'dependency-not-found'` for 3 different failure modes.** Missing manifest, missing lock entry, and missing cached package directory all produce the same error reason. The validator and code action provider cannot distinguish between "you need to add this to your manifest" vs "you need to run `dlang install`" vs "the cached package is corrupted." **Fix:** Use distinct error reasons for each failure mode.

**IMP-R-008** `services/workspace-manager.ts:89-96` -- **`shouldIncludeEntry()` returns `false` for all `.dlang` files.** This means the workspace manager loads ZERO `.dlang` files through the standard Langium file-discovery path. ALL `.dlang` file loading is delegated to the import-graph traversal in `initializeWorkspace()` (Mode A) or `loadFolderContents()` (Mode B). If the entry-point logic in Mode A has a bug (e.g., missing entry file), the workspace contains zero documents. **Implication:** The fallback to Mode B only occurs when there is no manifest. There is no graceful degradation within Mode A.

**IMP-R-009** `lsp/domain-lang-refresh.ts:40-95` -- **Refresh handler does not distinguish between local and external file changes.** A change to a `.dlang` file in `.dlang/packages/` (external package directory) triggers the same delegation path as a workspace source file change. But external package files should trigger a full package reload (re-read from cache), not an incremental document update. **Failure mode:** If a user runs `dlang install` in one terminal while the LSP is running, the refresh handler sees file changes in `.dlang/packages/` and tries an incremental update, which may produce inconsistent state if the package was partially written.

**IMP-R-010** `lsp/domain-lang-index-manager.ts:750-783` -- **Export signature computation silently returns empty array on errors.** `getExportedDescriptions()` wraps the entire description extraction in a try/catch that returns `[]` on any error. If a document has a parser error that causes the description extraction to throw, the exports are recorded as "empty" instead of "unknown." The next time the document is reparsed successfully, the export diff detects ALL exports as "new," triggering unnecessary transitive revalidation of all dependents. **Fix:** Distinguish between "empty exports" (document parsed cleanly, has no exports) and "unknown exports" (error during extraction, should not trigger diff).

### Test coverage gaps (blocking and required)

**IMP-T-001** (BLOCKING) -- **Zero tests for the "edit import statement → old scope removed, new scope added" flow.** No test in the entire suite creates a file with `import "./a"`, then re-parses the SAME file URI with `import "./b"`, and verifies that A's symbols leave the scope and B's symbols enter it. This is the core editing scenario that executes hundreds of times per day.

**IMP-T-002** (BLOCKING) -- **Zero tests for external package document lifecycle.** No test loads an external package through the full path: manifest → lock file → `.dlang/packages/` directory → import resolver → index manager → scope provider. The only external package scope test (`import-alias-adr003.test.ts:204`) is `test.skip()`.

**IMP-T-003** (BLOCKING) -- **Zero tests for "imported file content changes → importer scope updates."** No test verifies that when file B (imported by A) adds a new Domain, file A's scope reflects the addition after rebuild. This is the `isAffected()` → `DocumentBuilder.update()` → scope refresh chain.

**IMP-T-004** (REQUIRED) -- **Zero concurrency tests.** No test simulates simultaneous edits to files that import each other. Given IMP-B-001 (shared mutable state without synchronization), this gap means the most common real-world usage pattern (multi-file refactoring) is completely untested.

**IMP-T-005** (REQUIRED) -- **`removeDocumentFromDependencies()` not directly tested for index content cleanup.** Tests at `domain-lang-index-manager.test.ts:338-370` verify import METADATA is cleaned, but never verify that `allElements()` no longer returns symbols from the removed document. A bug in `super.remove()` delegation would leave phantom symbols in the global index.

**IMP-T-006** (REQUIRED) -- **Import cycle clearing never tested.** `prs017-hardening.test.ts` tests cycle DETECTION but never verifies that removing the import that caused the cycle clears the cycle from `getCycleForDocument()`. Stale cycle diagnostics after the user fixes a circular import would be highly confusing.

**IMP-T-007** (REQUIRED) -- **`invalidateImportResolverCache()` targeted invalidation not tested.** PRS-017 R1 (targeted cache invalidation) has no direct test. No test verifies that after editing file B, file A's cached import resolution is invalidated while unrelated file C's is preserved.

**IMP-T-008** (REQUIRED) -- **External package with missing entry file not tested.** No test covers a corrupted package cache where the package directory exists but `index.dlang` does not. The error message would incorrectly tell the user to "create index.dlang in the module directory" instead of suggesting `dlang install`.

**IMP-T-009** (REQUIRED) -- **Config change → scope update integration not tested.** `domain-lang-refresh.test.ts` uses full mocking. No test verifies that after `model.yaml` changes, a document's scope actually reflects the new configuration (e.g., new path alias becomes usable).

### Suggested improvements (import/index subsystem)

**IMP-S-001** `lsp/domain-lang-index-manager.ts` -- **Consider a lock/queue for `updateContent()`.** Even a simple async mutex (promise-based queue) would prevent the concurrent mutation issues in IMP-B-001, IMP-B-003, and IMP-R-002.

**IMP-S-002** `lsp/domain-lang-index-manager.ts:393` -- **`importsLoaded` should be a reference-counted map, not a Set.** Track how many documents import each URI. When the count drops to zero, unload the document. This solves IMP-B-002 (orphan documents) and provides the eviction mechanism that is currently missing.

**IMP-S-003** `main.ts:86-91` -- **Debounce `reloadFromEntry()`.** A 300ms debounce with cancellation of in-flight reloads would prevent IMP-B-005 entirely and reduce filesystem I/O per keystroke to near zero.

**IMP-S-004** `services/import-resolver.ts` -- **Consider a three-tier error type for external resolution.** `missing-manifest`, `not-in-manifest`, `not-installed` (lock file present but cache missing), and `corrupted-cache` (cache present but entry file missing) would give validators and code actions much better error messages (fixes IMP-R-007).

**IMP-S-005** `lsp/domain-lang-scope-provider.ts` -- **Pre-compute URI→descriptions map.** A single `Map<string, AstNodeDescription[]>` built once from `allElements()` and reused per scope resolution cycle would reduce O(N*M) to O(N+M) (fixes IMP-R-004).

---

## Addendum: test suite audit -- smallest defensible test suite

> This section was added as a focused follow-up using the critical-code-reviewer and tester skills, systematically auditing every test file for tautological tests, redundancy, and consolidation opportunities.

### Methodology

**A test is tautological if:** removing the feature being tested would not make the test fail.

Each test was classified as:
- **KEEP**: Tests real behavior that could genuinely break
- **TAUTOLOGICAL**: Would pass even if the implementation was deleted
- **REDUNDANT**: Duplicates another test's code path with trivially different inputs
- **MERGE**: Multiple tests that should be consolidated (same code path, different trivial inputs)
- **WEAK**: Assertions don't verify user-visible behavior (e.g., asserts mock was called, not that the call had the right effect)

### Summary totals

| Package | Total tests audited | KEEP | DELETE (tautological/redundant/weak) | MERGE (consolidate) | Net reduction |
| --- | --- | --- | --- | --- | --- |
| Language: parsing | ~92 | ~52 | ~18 | ~22 | ~40 |
| Language: validation | ~85 | ~62 | ~8 | ~15 | ~23 |
| Language: scoping | ~48 | ~38 | ~4 | ~6 | ~10 |
| Language: SDK | ~73 | ~43 | ~12 | ~18 | ~30 |
| Language: LSP | ~65 | ~40 | ~10 | ~15 | ~25 |
| Language: indexing/PRS | ~45 | ~35 | ~5 | ~5 | ~10 |
| CLI | ~230 | ~175 | ~35 | ~20 | ~55 |
| **Totals** | **~638** | **~445** | **~92** | **~101** | **~193** |

**Estimated reduction: ~193 test cases removed or consolidated (~30%), with zero reduction in behavioral coverage.**

---

### Language package: parsing tests

#### Tautological tests (delete)

**TST-P-001** `test/parsing/parsing-domains.test.ts` -- **Multiple tests that only read back token names.** Tests like `'should parse a simple domain'` that parse `Domain Sales {}` and assert `domain.name === 'Sales'` are near-tautological -- the parser consumed the token and stored it in the name field. Unless the grammar has ambiguity about what constitutes a name, these verify the parser's mechanical property assignment, not domain-specific behavior. **Delete** these and keep only (a) structural parsing (correct child counts, nesting), (b) error recovery, and (c) ambiguous syntax tests.

**TST-P-002** `test/parsing/parsing-entities.test.ts` -- **Exhaustive entity type parsing tests.** Separate test cases for ValueObject, Entity, AggregateRoot, DomainEvent, DomainService, Command, Query, and ReadModel when each follows the identical grammar rule `EntityType name '{' ... '}'`. One representative + one edge case (e.g., entity with nested fields) covers the actual code path. Remaining cases exercise identical parser logic with a different keyword. **Reduce from ~8 tests to 2-3. MERGE the rest into a `test.each` with 1 representative per category (value types, aggregates, messages).**

**TST-P-003** `test/parsing/parsing-relationships.test.ts` -- **Same pattern: exhaustive relationship type tests.** Individual tests for `partners`, `customer-supplier`, `conformist`, `anticorruption-layer`, `open-host-service`, `published-language`, `shared-kernel`, `separate-ways`, `big-ball-of-mud`. The grammar rule is `RelationshipType contextA '<->' contextB`. One test per category (symmetric, asymmetric, degenerate) covers the parsing logic. **Reduce from ~9 to 3.**

**TST-P-004** `test/parsing/parsing-patterns.test.ts` -- **Pattern name readback.** Tests that verify `pattern.name === 'OpenHostService'` after parsing `with pattern OpenHostService` are asserting a constant. The pattern name is a grammar keyword, not user input. **Delete all name-readback assertions. Keep only structural tests (pattern with options, pattern nesting).**

#### Redundant tests (delete)

**TST-P-005** `test/parsing/parsing-context-maps.test.ts` -- **Multiple map topology tests with identical assertion structure.** If 5 tests each parse a different context map arrangement and all assert the same properties (`map.contexts.length`, `map.relationships.length`), they're testing the same grammar rule with different inputs. **Keep 1 test per map feature (basic map, map with contains, map with relationships, map with metadata). Delete the rest.**

**TST-P-006** Across all parsing tests -- **`toHaveNoErrors()` then property assertions.** Many tests assert `expectNoErrors(result)` AND then assert on properties. The error check is implicit in the property assertions (if parsing failed, properties wouldn't exist). **The explicit error check is defensive but adds no signal when paired with property assertions. Leave as-is only if the error check includes specific diagnostic inspection.**

#### Merge candidates

**TST-P-007** All parsing files -- **Trivially different inputs testing the same grammar rule.** Any case where two tests parse `Domain Sales {}` and `Domain Orders {}` and make the same structural assertions should be merged into one test with one input. The domain name is irrelevant to the grammar rule being tested.

---

### Language package: validation tests

#### Tautological tests (delete)

**TST-V-001** `test/validating/` multiple files -- **"valid input produces no errors" tests without companion negative tests.** Tests like `'should accept valid domain with entities'` that parse valid input and assert `expectNoErrors()` are tautological in isolation -- they only prove the validator doesn't reject valid input, which is the default behavior of a validator that does nothing. **Each "valid input passes" test is only defensible if it is paired with a negative test proving the validator REJECTS the corresponding invalid input.** Audit revealed ~15 positive-only tests without companions. **Delete positive-only tests. Add negative companions where the validation rule is non-trivial.**

**TST-V-002** `test/validating/validating-relationships.test.ts` -- **Exhaustive relationship validation for every type.** If the validation logic treats all relationship types identically (same rule, `checkRelationshipParticipants`), testing every type is redundant. **Keep 1 representative + 1 edge case (e.g., self-referential relationship). Delete the per-type duplicates.**

**TST-V-003** `test/validating/validating-entities.test.ts` -- **Duplicate name collision tests for every entity type.** If the uniqueness rule is `children.filter(c => c.name === name).length > 1`, it works identically for Domain, ValueObject, Entity, etc. **Keep 1 test for duplicate names + 1 test showing cross-type name collision is (or isn't) flagged. Delete per-type duplicates.**

#### Weak tests

**TST-V-004** `test/validating/` -- **Error message text assertions.** Tests that assert `error.message.includes('duplicate name')` break on wording changes without protecting behavior. **Assert on error CODE (from `IssueCodes`), not message text.** Where tests use message text, replace with code assertions.

**TST-V-005** `test/validating/validating-imports.test.ts` -- **Tests for import validation that mock the filesystem.** When the filesystem mock always returns "file exists: true", the validator always produces "no error." These tests verify the mock's behavior, not the validator's. **Keep only tests where the mock returns specific conditions (file not found, permission denied, circular import) and the validator produces specific errors.**

---

### Language package: scoping tests

#### Tautological tests (delete)

**TST-S-001** `test/scoping/` -- **Scope tests that check `ref !== undefined` instead of checking the target.** A reference resolution test that asserts the ref exists but doesn't verify it points to the RIGHT target is weak. If the scope provider returned ANY element with the right name (e.g., from a different file), the test would still pass. **Replace `ref !== undefined` with `ref.$container.name === 'ExpectedParent'` or similar structural assertions.**

**TST-S-002** `test/scoping/` -- **Cross-file reference tests that duplicate single-file tests.** If the scope provider treats all documents equally (which it should, via the index), a cross-file test that makes the same assertion as a single-file test adds no coverage. **Keep cross-file tests only where the behavior differs (e.g., import-qualified names, namespace prefixes).**

#### Merge candidates

**TST-S-003** `test/scoping/` -- **Per-entity-type reference resolution tests.** If referencing a Domain uses the same resolution logic as referencing a BoundedContext (both go through `getScope()`→ `allElements()` filter), testing every entity type is redundant. **Keep 1 intra-file reference, 1 cross-file reference, 1 imported-package reference. Delete per-type duplicates.**

---

### Language package: SDK tests

#### Tautological tests (delete)

**TST-SDK-001** `test/sdk/patterns.test.ts` -- **Pattern constant readback tests.** Tests like `expect(Pattern.OHS).toBe('OpenHostService')` are asserting constant values. If someone changes the constant, the test fails -- but so does all code using the constant, making the test redundant with the compiler. **Delete all constant-value assertions.**

**TST-SDK-002** `test/sdk/query.test.ts` -- **`test.each` with 10+ entity types testing `query.{type}().count()`.** If the query builder uses the same filter predicate for all types (parameterized by `$type`), testing every type exercises the same code path. **Keep 2 representative types + 1 edge case (mixed content). Delete the rest or reduce to `test.each` with 3 rows.**

**TST-SDK-003** `test/sdk/serializers.test.ts` -- **JSON output shape tests that mirror the input.** Tests that serialize a parsed model and assert the JSON output contains `"name": "Sales"` are testing the JSON-serialization-of-parsing-of-the-token. Unless the serializer has custom logic for that field, this is a roundtrip tautology. **Keep only tests for custom serialization logic: metadata Map handling, augmented property filtering, array flattening. Delete simple field-readback tests.**

**TST-SDK-004** `test/sdk/query.test.ts` -- **`byFqn()` tests for every entity type.** Same code path, different type parameter. **Keep 1 test for FQN resolution + 1 test for non-existent FQN. Delete per-type FQN tests.**

#### Merge candidates

**TST-SDK-005** `test/sdk/loader.test.ts` -- **Multiple `loadModel` tests with trivially different inputs.** Tests that load `Domain Sales {}` and `Domain Orders {}` and assert `model.children.length` should be merged. **Use a single model with multiple elements to test loader behavior in one shot.**

---

### Language package: LSP tests

#### Tautological tests (delete)

**TST-LSP-001** `test/lsp/hover/` -- **Exhaustive hover tests for every entity type.** If the hover provider uses the same `generateMarkdown()` function for Domain, BoundedContext, Entity, ValueObject, etc., testing every type is redundant. **Keep 1 representative hover (e.g., Domain with metadata), 1 edge case (entity with no doc), 1 cross-file imported hover. Delete per-type duplicates.** This likely removes 10+ individual tests.

**TST-LSP-002** `test/lsp/` completion tests -- **Completion tests that check for specific labels.** Tests like `expect(completions).toContainEqual(expect.objectContaining({ label: 'Domain' }))` verify that the completion list contains a keyword. If the keyword is hardcoded in the grammar, this is near-tautological -- the completion provider returns grammar keywords by default. **Keep only tests for context-sensitive completions (import path completion, reference completion within specific scope). Delete keyword-list assertions.**

**TST-LSP-003** `test/lsp/` code action tests -- **Tests that verify the action EXISTS but don't verify applying it.** A test that checks `codeActions.length === 1` without verifying the edit text is merely testing the code action provider returned something. **Strengthen: apply the edit and assert the document is valid after. Or delete if the behavior is already tested by validation negative tests.**

#### Merge candidates

**TST-LSP-004** `test/lsp/` formatting tests -- **Multiple formatting tests with identical transformations.** If the formatter normalizes whitespace the same way for domains, entities, and relationships, testing each is redundant. **Keep 1 test per formatting RULE (indentation, blank line normalization, trailing whitespace). Delete per-element duplicates.**

---

### Language package: indexing and PRS tests

#### Redundant tests

**TST-IDX-001** `test/prs017-hardening.test.ts` -- **PRS-017 hardening tests that duplicate existing tests.** Some PRS-017 tests re-test parsing and validation scenarios already covered in `parsing/` and `validating/` directories. If a PRS-017 test for "cycle detection" makes the same assertion as `validating/validating-domains.test.ts`, delete the duplicate. **Audit each PRS-017 test: keep only those testing NEW behavior (export signature diffing, change propagation, targeted cache invalidation). Delete those that merely re-validate existing parsing/validation rules.**

#### Skipped tests

**TST-IDX-002** `test/scoping/import-alias-adr003.test.ts:204` -- **`test.skip()` on package-boundary transitive imports.** This is the ONLY test covering `addPackageBoundaryTransitiveImports()`. Either implement it or delete it with the understanding that the feature is untested. A skipped test provides no signal and masks a coverage gap.

#### Gap: zero dynamic-flow tests

**TST-IDX-003** (BLOCKING gap, cross-reference: IMP-T-001 through IMP-T-003) -- **No test edits a document and verifies scope updates.** All tests follow the pattern: create documents → build once → assert. No test mutates a document and rebuilds. This means the entire `updateContent()` → `trackImportDependencies()` → `isAffected()` → `rebuildAffectedDocuments()` chain has zero coverage from the test suite. **This is the single largest gap in the test suite.**

---

### CLI package: test audit

#### Delete entire file

**TST-CLI-001** `packages/cli/test/commands/cache-clear-minimal.test.tsx` -- **100% duplicate of `cache-clear.test.tsx`.** Both tests ("shows loading state initially", "shows success message after clearing cache") are identical to tests in the full file. **Delete entire file.**

#### Tautological tests (delete)

**TST-CLI-002** `packages/cli/test/commands/validate.test.tsx` "renders with correct props" -- **Asserts only `expect(lastFrame()).toBeDefined()`.** This passes if the component renders anything at all. It does not verify any Validate-specific behavior. **Delete.**

**TST-CLI-003** `packages/cli/test/commands/install.test.tsx` "renders with correct props" -- **Same pattern.** Identical assertion to the loading state test. **Delete.**

**TST-CLI-004** `packages/cli/test/ui/emoji.test.ts` "ignores textFallback when emoji exists" -- **Asserts a function ignores an argument.** Calls `getEmoji('success', '[OK]')` and asserts it returns `EMOJI.success`. This tests the absence of a feature (text fallback mode). **Delete.**

**TST-CLI-005** `packages/cli/test/commands/query.test.tsx` canonical type identity `test.each` (7 rows) -- **Asserts `normalizeEntityType('domains') === 'domains'` for 7 identity values.** This is tautological -- it would fail only if someone actively broke the function by adding wrong normalization. **Delete or reduce to 1 representative.**

#### Weak tests (delete -- test mocks not behavior)

**TST-CLI-006** `packages/cli/test/services/package-downloader.test.ts` -- **7 event emission tests.** Each asserts `mockEventCallback` was called with `{ type: 'resolving' }`, `{ type: 'cached' }`, etc. These verify an internal callback was fired, not that any user-visible effect occurred. If events drive UI output, test the UI output instead. **Delete all 7.**

**TST-CLI-007** `packages/cli/test/commands/install.test.tsx` "accepts frozen flag" and "accepts force flag" -- **Assert mock was called with `{ frozen: true }`.** Tests that a flag was passed through to the mock, not that frozen mode works. **Delete both.**

**TST-CLI-008** `packages/cli/test/commands/query.test.tsx` "applies domain query name and fqn filters" and "applies bounded context filters" -- **Assert `domainBuilder.withName` was called.** Tests the mock, not the filtering behavior. Integration tests in `query-command.test.ts` cover this properly. **Delete both.**

**TST-CLI-009** `packages/cli/test/commands/install.test.tsx` "calls InstallService with correct options" (runInstall) -- **Asserts mock shape.** No behavioral verification. **Delete.**

#### Redundant tests (delete)

**TST-CLI-010** `packages/cli/test/services/semver.test.ts` -- **`pickLatestSemVer` (5 tests) duplicates `github-tags.test.ts/findLatestVersion`.** Same sort-and-pick logic tested in both. **Delete `pickLatestSemVer` tests.**

**TST-CLI-011** `packages/cli/test/services/semver.test.ts` -- **`sortVersionsDescending` (3 tests).** Composition of `compareSemVer` + sort, both tested individually. **Delete.**

**TST-CLI-012** `packages/cli/test/services/semver.test.ts` -- **`filterStableVersions` (1 test) and `filterSemVerTags` (1 test).** Composition of already-tested primitives. **Delete both.**

**TST-CLI-013** `packages/cli/test/commands/install.test.tsx` "handles success in JSON mode" and "handles errors in JSON mode" (runInstall) -- **Duplicate the component-level JSON tests.** **Delete both.**

**TST-CLI-014** Multiple command files: `update.test.tsx`, `upgrade.test.tsx`, `outdated.test.tsx` -- **`runX` function tests duplicate component tests** for error code assertions. Example: "exits with error code 1 when lock file missing" in runUpdate duplicates the component test. **Delete the `runX` duplicates (3 total).**

**TST-CLI-015** `packages/cli/test/commands/init.test.tsx` "renders loading message for provided target directory" -- **Identical to loading state test**, same assertion with different `targetDir`. And "generates correct YAML structure" -- **subset of "creates model.yaml" test**. **Delete both.**

#### Merge candidates

**TST-CLI-016** `packages/cli/test/utils/exit-codes.test.ts` -- **7-row `test.each` for a simple lookup.** Reduce to 3 rows: one success (0), one known error (1), one unknown code. Same branch coverage.

**TST-CLI-017** `packages/cli/test/services/semver.test.ts` -- **`parseSemVer` (4 separate tests) and `compareSemVer` (5 separate tests).** Convert each to `test.each` table. **`isPreRelease` (8 cases)** can be reduced to 4 (release, alpha, beta, rc).

**TST-CLI-018** `packages/cli/test/services/fetch-utils.test.ts` -- **`test.each([500, 502, 503])` retryable and `test.each([400, 401, 403, 404])` non-retryable.** Same branch, different status code. Reduce each to 1 representative.

**TST-CLI-019** `packages/cli/test/services/credential-provider.test.ts` -- **3 error handling tests** (git not installed, fails, timeout) all return undefined. Merge into `test.each` with 1 assertion.

---

### Cross-cutting findings

#### SYS-T-001: no test verifies any error CODE, only error messages

Across the entire suite, validation tests assert on error message TEXT (`error.message.includes('duplicate')`) rather than on `IssueCodes` values. Message text is presentation; codes are contracts. If a message is reworded, all tests break. If a code is removed, no test breaks. **Recommendation:** establish convention to assert on `diagnostic.code` first, message text only as supplementary documentation.

#### SYS-T-002: test.each overuse

Multiple files use `test.each` with 5-10+ rows that all exercise the identical code branch. The `test.each` construct is meant for parameterized boundary testing, not exhaustive enumeration. **Rule of thumb:** if two rows hit the same `if/else` branch, keep one and delete the other.

#### SYS-T-003: integration tests are the highest-value tests and are never run in CI

`packages/cli/test/integration/query-command.test.ts`, `package-lifecycle.test.ts`, and `validate-help-command.test.ts` are the gold-standard tests in the CLI suite. They run the real CLI binary against real filesystems and real HTTP endpoints. These are **permanently excluded from CI** because `INTEGRATION_TESTS=true` is never set. These 21 tests provide more behavioral coverage than ~50 of the unit tests marked for deletion above.

---

### Recommendations summary

| Priority | Action | Estimated reduction |
| --- | --- | --- |
| P0 | Delete tautological tests (TST-P-001, TST-P-004, TST-SDK-001, TST-CLI-002/003/004/005) | ~25 tests |
| P0 | Delete redundant file (`cache-clear-minimal.test.tsx`) | 2 tests |
| P0 | Delete weak mock-call tests (TST-CLI-006/007/008/009) | ~15 tests |
| P1 | Delete redundant duplicates (TST-CLI-010/011/012/013/014/015) | ~20 tests |
| P1 | Merge exhaustive `test.each` tables to representative cases (TST-P-002/003, TST-V-002/003, TST-SDK-002, TST-LSP-001, TST-CLI-016/017/018/019) | ~60 tests consolidated |
| P1 | Implement or delete skipped tests (TST-IDX-002) | 1 test |
| P1 | Switch message assertions to code assertions (SYS-T-001) | 0 test count change, higher signal |
| P2 | Add missing dynamic-flow tests (TST-IDX-003, cross-ref IMP-T-001 through IMP-T-003) | +5-9 new tests |
| P2 | Enable integration tests in CI (SYS-T-003) | 0 test count change, real coverage boost |

**Net effect: ~193 tests removed or consolidated, ~5-9 high-value tests added, zero behavioral coverage loss.**

---

## Systemic patterns

### SYS-001: pervasive `as unknown as T` (~30+ locations)

The double cast is used throughout to bypass TypeScript at every boundary: DI wiring, Sprotty integration, parse results, tool inputs, and API responses. Key hotspots: index manager (2), completion provider (2), tool handlers (4), diagram generator (6), extension DI (2), ELK factory (2), DI module `as never` (3). **This is the single most impactful pattern to remediate.** Establish a lint rule requiring `// SAFETY:` comments and gradually replace with runtime type guards.

### SYS-002: universal error swallowing

Nearly every `try/catch` in the LSP, services, and CLI layers follows `catch { console.error(...); return default }`. This produces: no user-visible errors, no structured telemetry, indiscriminate handling of transient vs permanent failures, and testing blind spots. **Recommendation:** structured error-handling utility that classifies, surfaces, and logs errors appropriately.

### SYS-003: `console.warn`/`console.error` in LSP context

In the language server, console output can corrupt the LSP stdio stream. Multiple locations use `console.warn` and `console.error` instead of Langium's connection logger. **Recommendation:** replace all `console.*` in the language and validation packages with connection-routed logging.

---

## Verdict

**Request Changes.**

20 blocking issues, 35 required changes, and 26 suggestions. The security vulnerabilities (B-001 through B-005) are the highest priority -- they are exploitable via shared repository workflows. The type safety bypasses (SYS-001) and error swallowing (SYS-002) are systemic and require a cross-cutting remediation effort.

---

## Prioritized implementation phases

### Phase 1: security hardening

Scope: B-001, B-002, B-003, B-004, B-005.

1. Update `tar` to `>=7.5.8`.
2. Validate `commitSha`, `owner`, `repo` from lock files before path construction.
3. Reject control characters in credential provider `host`.
4. Apply `encodeURIComponent` to all API URL path segments.
5. Pin SonarQube action to version tag.
6. Add `entry` path validation for untrusted manifests (R-029, R-030).

Exit criteria: `npm audit` clean, no path-injectable inputs, no supply chain risks.

### Phase 2: blocking bug fixes

Scope: B-006 through B-020, IMP-B-001 through IMP-B-006.

1. Replace all `as unknown as Model` with `isModel()` guards.
2. Fix fabricated `CompletionContext` and `ReferenceInfo`.
3. Fix `serializeNode` (whitelist AST properties, convert Maps).
4. Fix `normalizeEntityType` validation.
5. Fix `countModelElements` to recurse into namespaces.
6. Fix cache key alignment in `PerformanceOptimizer`.
7. Fix dual-cache invalidation.
8. Fix `waitForDocumentState` polling leak.
9. Fix `activeRoot` race condition.
10. Honor cancellation tokens in async validation.
11. Move `setInferredRelationshipTypes` to processing phase.
12. Fix Sprotty `render()` mutation.
13. Add LLM tool input validation.
14. Add debounce to `onDidChangeContent` reload (IMP-B-005).
15. Merge dual `onInitialize` handlers, wrap startup in try/catch.
16. Add async mutex/queue to `updateContent()` to prevent concurrent dependency graph corruption (IMP-B-001, IMP-B-003).
17. Implement orphan document eviction when imports change -- replace `importsLoaded` Set with reference-counted map (IMP-B-002).
18. Ensure scope provider reads freshly-tracked import info, not stale pre-update info (IMP-B-004).
19. Add workspace-root boundary check in `resolveLocalPath()` to prevent import path traversal (IMP-B-006).

### Phase 2b: import/index test coverage (critical)

Scope: IMP-T-001 through IMP-T-009.

These test gaps are as urgent as the blocking bugs because the bugs themselves were found by code analysis, not test failures -- confirming the test suite cannot catch regressions in the most exercised code paths.

1. Write integration test: edit import statement → verify old scope removed, new scope added (IMP-T-001).
2. Write integration test: external package full lifecycle through manifest → lock → cache → index → scope (IMP-T-002).
3. Write integration test: imported file content changes → importer scope reflects update (IMP-T-003).
4. Write concurrency test: simultaneous edits to mutually-importing files (IMP-T-004).
5. Verify `allElements()` excludes symbols after document removal (IMP-T-005).
6. Test cycle clearing after circular import is removed (IMP-T-006).
7. Test targeted cache invalidation preserves unrelated entries (IMP-T-007).
8. Test corrupted package cache (missing entry file) produces correct error (IMP-T-008).
9. Un-skip `import-alias-adr003.test.ts:204` (package-boundary transitive test) (IMP-R-005).

Exit criteria: All dynamic import/scope/index flows have at least one integration test exercising the full chain.

### Phase 3: required improvements

Scope: R-001 through R-035, IMP-R-001 through IMP-R-010.

Focus areas: type safety (DI casts, Sprotty casts), error handling (console -> LSP logger, structured reporting), consistency (diagnostic codes, flag detection, ref type), build hygiene (enable lint rules, CI test coverage), import subsystem correctness (export signature stability, cache key scoping, error reason granularity, refresh handler local/external distinction).

### Phase 4: suggestions and cleanup

Scope: S-001 through S-026.

Focus areas: performance (scope resolution, loader cleanup, getter caching), dead code removal, grammar error recovery, build configuration polish.

---

## Measurable success criteria

| Category | Metric |
| --- | --- |
| Security | `npm audit` reports 0 high/critical vulnerabilities |
| Security | No user-supplied string reaches a path or URL without validation |
| Security | No CI action pinned to a mutable branch |
| Type safety | Zero `as unknown as T` without `// SAFETY:` comment |
| Type safety | All `parseResult.value` accesses use runtime type guards |
| Reliability | No resource leaks from timed-out operations |
| Reliability | Cancellation tokens honored in all async operations |
| Quality | `npm run lint` passes with 0 errors, 0 warnings |
| Quality | `npm run test:coverage` meets thresholds (75%+ language, 65%+ CLI) |
| Quality | Integration and extension tests run in CI |

---

## Next steps

1. **Discuss and prioritize** -- walk through the blocking issues, clarify any findings that need deeper investigation, and agree on phasing.
2. **Create tracking issues** -- convert each phase into actionable GitHub issues with clear acceptance criteria.
3. **Implement Phase 1 (security)** -- these should be addressed before any other feature work ships.

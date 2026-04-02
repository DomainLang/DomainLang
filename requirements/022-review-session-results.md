# Code Review Session — Branch `copilot/vscode-mmb642h3-ql7q` vs `main`

**Date:** 2026-03-31
**Reviewer:** Claude (gstack `/review` skill)
**Final state:** 89 test files, 1052 tests, 0 failures

---

## Fixes Applied in This Session

### CRITICAL: Security Fixes (AUTO-FIX)

#### B-001 · Path Traversal via Untrusted Lock File Commit SHA
**Files:** `workspace-manager.ts`, `package-cache.ts`, `dependency-analyzer.ts`

All three call sites that build filesystem paths from `locked.commit` (read from a JSON lock file) lacked SHA validation. An attacker who can write a `.dlang-lock.json` could set `commit: "../../.."` and read arbitrary files via `getMetadata`.

- `package-cache.ts:getPackagePath()` — added hex-SHA regex guard, throws on invalid input
- `dependency-analyzer.ts:getCacheDir()` — added owner/repo/commit validation, throws on invalid input
- `workspace-manager.ts:parseJsonLockFile()` — added hex-SHA validation, silently skips invalid entries

Test fixtures updated (`'abc123'` → `'abc1234'`, `'aaa'` → `'aaaaaaa'`, etc.) to use valid 7+ char hex SHAs.

#### B-008 · Map Serialization Bug → `{}` in JSON output
**File:** `sdk/serializers.ts:serializeNode()`

`Object.entries(node)` picks up SDK-augmented properties (e.g., `metadataMap`) defined with `enumerable: true`. A `Map<K,V>` falls through to the primitive branch and serializes as `{}` via `JSON.stringify`. Added explicit `instanceof Map` branch before the primitive fallthrough to emit `Object.fromEntries(value)`.

#### B-013 · Infinite Timer Leak in `waitForState`
**File:** `utils/document-utils.ts`

`checkState` rescheduled itself via `setTimeout(checkState, 10)` even after the outer `setTimeout` timeout fired and called `reject()`. The `checkState` chain continued forever after rejection. Added `let settled = false` flag checked at the start of every `checkState` invocation.

#### MISS-1 · PerformanceOptimizer Lock File Cache Never Invalidated
**File:** `services/workspace-manager.ts`

`invalidateCache()` and `invalidateLockCache()` cleared in-memory context fields (`manifestCache`, `lockFile`) but never called `getGlobalOptimizer().invalidateCache()`. The optimizer's lock file cache (in `PerformanceOptimizer`) filled up but never emptied — making `dlang install` effectively no-op on second run. Both methods now wire through to `getGlobalOptimizer().invalidateCache(this.activeRoot)`.

#### R-029 · Package Entry Path Traversal
**File:** `services/workspace-manager.ts:readPackageEntry()`

The `entry` field from a remote package's `model.yaml` was used in `path.join(packageDir, entry)` without validation. A malicious package could set `entry: "../../host-project/secrets.dlang"` to read files outside the package directory. Added guard: `entry.includes('..')` or `path.isAbsolute(entry)` → fall back to `'index.dlang'`.

#### R-030 · Zip-Slip via Symlink in Tar Extraction
**File:** `cli/services/package-cache.ts:put()`

`tar.extract()` called without filtering symlinks. A malicious tarball can include a symlink pointing outside the extraction directory, then extract a file through it, writing to arbitrary paths on the host. Added `filter: (path, entry) => entry.type !== 'SymbolicLink'` to reject all symlink entries.

---

### CRITICAL: SDK Bug Fixes (AUTO-FIX)

#### NEW-3 · `metadataAsMap` Allowed Empty-String Keys
**File:** `sdk/resolution.ts:metadataAsMap()`

Diff changed `if (key && value)` to `if (key != null && value != null)`. This allows empty-string keys (`""`) into the Map, which is semantically invalid. Reverted key guard to `if (key && value != null)` — keys must be truthy, values may be empty string.

---

### Regression Fixes (Test Failures Introduced by Copilot Agent)

#### Pre-existing: `manifest-utils.ts:getEntryPath()` overly broad guard
An overly strict boundary guard (`entry must stay within manifest directory`) was added to `getEntryPath`. This broke the legitimate test "resolves entry relative to manifest directory, not cwd" which tests that `../../index.dlang` from a subdirectory manifest works. The R-029 guard belongs only in `readPackageEntry` (remote package context), not in `getEntryPath` (user workspace context). Guard removed from `getEntryPath`.

#### Pre-existing: `import-resolver.ts:resolveFrom()` boundary guard with no-manifest fallback
The Copilot agent added a guard that blocked `../path` imports when the resolved path was outside `workspaceRoot`. When no `model.yaml` exists, `workspaceRoot` defaults to the calling directory itself — making any `../` import fail. Guard was already refined (linter) to only apply when `manifestPath` exists. This fixes the test "resolves from subdirectory with parent reference".

---

## Remaining Open Items (Not Auto-Fixed — ASK Required)

| ID | Location | Issue | Risk |
|----|----------|--------|------|
| B-003 | `github-tags.ts:49`, `package-downloader.ts:202` | `owner`/`repo` not `encodeURIComponent`'d in URL construction | URL injection |
| LM-1 | `lm-tools.ts:33` | `options.input as { query: string }` — unvalidated cast from LLM output | Trust boundary |
| IS-1 | `install-service.ts:206` | Lock file JSON parse without structural validation | Malformed input |
| R-007 | `main.ts:44,47,70` | `console.warn` in LSP stdio server (writes to stderr, not stdout — low risk) | LSP framing |
| COV-1 | `validateLocalPathDependency()` | Zero active test coverage for security-critical path | Coverage gap |
| COV-2 | Various | Empty collection cases for `contextMaps()`, `domainMaps()`, `relationships()` untested | Coverage gap |

---

## Test Suite Status

```
Test Files: 89 passed (89)
Tests:      1052 passed | 10 skipped (1062)
Duration:   ~18s
```

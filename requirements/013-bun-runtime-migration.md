# PRS-013: CLI runtime migration to Bun and OpenTUI

Status: Draft
Priority: Medium
Target Version: 3.0.0

## Problem statement

The DomainLang CLI (`dlang`) currently runs on Node.js 20+ with Ink (React-based terminal UI). While functional, this architecture limits distribution options — the CLI ships as individual `.js` files requiring a Node.js runtime on the user's machine. Modern developer tools (Deno, Bun, Go CLIs) increasingly ship as self-contained executables, improving onboarding and reducing install friction.

This PRS evaluates transitioning the CLI to **Bun** (runtime + packaging) and **OpenTUI** (terminal UI), assessing feasibility, risks, and migration strategy. It also briefly evaluates opportunities to adopt Bun in the language package and VS Code extension.

## Goals

- Assess feasibility of `bun build --compile` for self-contained CLI executables
- Map migration path from Ink to OpenTUI for terminal UI
- Identify compatibility risks with the `@domainlang/language` package (which must remain untouched)
- Provide gap analysis, pros/cons, and phased migration plan
- Briefly assess Bun opportunity for the language package and VS Code extension

## Non-goals

- Modifying `@domainlang/language` package internals
- Breaking the VS Code extension's Node.js runtime model
- Replacing the monorepo build system wholesale
- Adopting Bun's test runner for the language package

---

## Current architecture

### CLI technology stack

| Component | Current | Role |
|-----------|---------|------|
| Runtime | Node.js 20+ | JavaScript execution |
| Package manager | npm 10+ | Dependency management |
| Terminal UI | Ink 5.x + React 18 | Component-based CLI rendering |
| Argument parser | yargs 17 | Command-line parsing |
| Build | `tsc -b` + `shx cp` | TypeScript compilation, template copying |
| Distribution | npm package with `#!/usr/bin/env node` shebang | Requires Node.js installed |
| Tests | Vitest + ink-testing-library | Test runner and TUI test utilities |

### Source structure (64 files)

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/commands/` | 12 | Command implementations (10 `.tsx` + types + runner) |
| `src/services/` | 14 | Business logic (FS, HTTP, cache, dependencies) |
| `src/ui/` | 16 | UI components, hooks, themes |
| `src/utils/` | 3 | Output mode, exit codes, direct runner |
| `src/templates/` | 3 | `.tpl` files for `dlang init` |

### Ink usage patterns

The CLI uses a **dual-mode architecture**: every command has both an Ink (React) component and a `runDirect()` plain-text fallback, dispatched by `command-runner.ts` based on `--json`/`--quiet` flags.

**Ink APIs in use:**
- `render()` — app bootstrap (2 call sites)
- `<Box>`, `<Text>` — layout and text styling (all 10 command files + 11 UI components)
- `useApp()` → `exit()` — exit control (9 commands)
- `useStdout()` — terminal width detection (1 component)
- `ink-gradient` — gradient text rendering (2 components, 3 gradient variants)
- `ink-spinner` — loading animations (1 component)
- `useState`, `useEffect` — standard React hooks (commands + custom hooks)
- `ink-testing-library` — test utilities (dev dependency)

### Node.js API usage

| Module | Files | APIs |
|--------|-------|------|
| `node:fs` / `node:fs/promises` | `filesystem.ts`, `validate.tsx` | Full FS abstraction via `FileSystemService` interface |
| `node:path` | 12 files | `resolve`, `dirname`, `basename`, `join` |
| `node:crypto` | 2 files | `createHash`, `randomUUID` |
| `node:os` | 3 files | `tmpdir`, `homedir` |
| `node:child_process` | 1 file | `execFile` (credential provider) |
| `node:url` | 2 files | `fileURLToPath` |
| `process.*` | ~15 files | `argv`, `cwd()`, `exit()`, `env`, `stdout`, `platform` |

**Key architectural strength:** The CLI has a `FileSystemService` interface wrapping all `node:fs` operations, with comments explicitly anticipating future Bun migration.

### Language package coupling

The CLI uses only **two entry points** from `@domainlang/language`:

1. **`@domainlang/language`** — type-only imports (`ModelManifest`, `LockFile`, `DependencySpec`, etc.)
2. **`@domainlang/language/sdk`** — runtime functions (`validateFile`, `validateWorkspace`) in the validate command only

This minimal coupling is favorable for migration.

---

## Assessment: Bun as CLI runtime

### Self-contained executables via `bun build --compile`

Bun's `--compile` flag bundles a TypeScript/JavaScript entry point with the Bun runtime into a single self-contained binary.

**Capabilities:**

| Feature | Status |
|---------|--------|
| TypeScript compilation | Native (no build step) |
| Single-file executable | Yes (~50-70 MB macOS, ~100 MB Windows) |
| Cross-compilation | 6 targets from any host |
| Asset embedding | Via `import ... with { type: "file" }` |
| ESM support | Full (since v1.3.x) |
| Bytecode compilation | `--bytecode` for 2x startup improvement |

**Cross-compilation targets:**

| Target | Flag |
|--------|------|
| Linux x64 | `bun-linux-x64-modern` |
| Linux ARM64 | `bun-linux-arm64` |
| macOS x64 (Intel) | `bun-darwin-x64` |
| macOS ARM64 (Apple Silicon) | `bun-darwin-arm64` |
| Windows x64 | `bun-windows-x64` |

### Pros of Bun for CLI

| Benefit | Impact |
|---------|--------|
| **Zero Node.js dependency** | Users don't need Node.js installed; `dlang` is a single binary |
| **Cross-compilation from CI** | Build macOS + Linux + Windows binaries from a single GitHub Actions runner |
| **Faster startup** | ~40-100 ms vs ~100-200 ms for Node.js |
| **Native TypeScript** | No `tsc` build step needed for development |
| **Faster package installs** | 10-20x faster `bun install` for development |
| **Simpler distribution** | GitHub Releases, Homebrew tap, direct download — no npm required |
| **Asset embedding** | Template files baked into the binary (no `shx cp` needed) |

### Cons of Bun for CLI

| Drawback | Impact | Mitigation |
|----------|--------|------------|
| **Binary size** | ~50-70 MB (macOS), ~100 MB (Windows) vs. ~0 for npm install | Acceptable for modern CLI tools; comparable to Deno, Tauri |
| **`node:` prefix risk** | Known issue (#5055) with `node:` prefixed imports in compiled binaries | Strip prefixes in CLI code, or use bundler plugin |
| **Dual runtime in monorepo** | Language package + extension stay on Node.js | CLI becomes independent build target |
| **CI complexity** | Bun must be installed alongside Node.js in CI | `setup-bun` GitHub Action (trivial) |
| **No `tar` package validation** | The `tar` npm package (used by `dlang add`) is untested on Bun | Requires explicit testing; may need Bun-native alternative |
| **Dynamic import limitations** | `import()` with non-static strings fails in compiled binaries | Current codebase uses only static imports (no risk) |
| **Top-level await + bytecode** | Known bug with `--bytecode --compile` and top-level `await` | Avoid top-level await in entry point (current code is clean) |

### Risk matrix: Bun compile

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `node:` prefix resolution in compiled binary | High | Medium | Strip prefixes or wait for fix; test on each Bun release |
| `tar` package incompatibility | Medium | Unknown | Test `dlang add` / `dlang install` flows early |
| Binary size unacceptable to users | Low | Low | Modern precedent (Deno ~100 MB, Tauri ~5 MB) |
| Template embedding issues | Low | Low | Use `import ... with { type: "file" }` syntax |
| Ink 5.x React rendering under Bun | Low | Low | Confirmed working on Bun ≥1.2 (if keeping Ink) |
| `yaml` transitive dependency | Low | Low | YAML parsing is pure JS, no native deps |

---

## Assessment: OpenTUI as terminal UI

### Current state

| Attribute | Value |
|-----------|-------|
| Version | `@opentui/core` v0.1.77, `@opentui/react` v0.1.75 |
| Production-ready | **No** — explicitly stated in documentation |
| Runtime | **Bun-only** (Zig FFI rendering layer) |
| Build dependency | **Zig required** to compile native components |
| React reconciler | Yes (`@opentui/react`) — custom reconciler |
| Community | ~3.1k GitHub stars, 25 contributors (vs. Ink's ~27k stars) |

### Feature comparison: Ink vs. OpenTUI

| Feature | Ink 5.x | OpenTUI React | Gap |
|---------|---------|---------------|-----|
| `<Box>` layout | `<Box>` | `<box>` (lowercase intrinsic) | Minimal (casing) |
| `<Text>` styling | `<Text bold color="red">` | `<text><strong><span fg="red">` (nested modifiers) | Medium rework |
| Gradient text | `ink-gradient` | **None** | **Missing — requires custom code** |
| Spinner | `ink-spinner` (mature) | Community package (`opentui-spinner`) | Partial |
| ASCII art | Manual / figlet | `<ascii-font>` built-in | OpenTUI wins |
| Input components | Limited | `<input>`, `<select>`, `<textarea>` | OpenTUI wins |
| Syntax highlighting | None | Built-in (tree-sitter) | OpenTUI wins |
| App exit | `useApp().exit()` | `useRenderer().destroy()` | API change |
| Terminal dimensions | `useStdout()` | `useTerminalDimensions()` | Cleaner API |
| Test renderer | `ink-testing-library` (Vitest) | `@opentui/react/test-utils` (`bun:test`) | **Framework mismatch** |
| FPS cap | 32 FPS | Uncapped (configurable) | OpenTUI wins |
| Node.js support | Native | **Bun-only** | **Blocker** |
| Stability | Production (8+ years) | Pre-release (v0.1.x) | **Significant gap** |

### Pattern-by-pattern migration complexity

| Current Ink pattern | OpenTUI equivalent | Complexity |
|---|---|---|
| `render()` | `createCliRenderer()` + `createRoot().render()` | Medium |
| `<Box>` / `<Text>` | `<box>` / `<text>` | Low (find-replace + casing) |
| `useApp()` → `exit()` | `useRenderer()` → `destroy()` | Low |
| `useStdout()` | `useTerminalDimensions()` | Low |
| `ink-gradient` (3 variants) | **Custom implementation needed** | **High** |
| `ink-spinner` | `opentui-spinner` or custom animation | Medium |
| `useState` / `useEffect` | Same (standard React hooks) | None |
| `ink-testing-library` | `@opentui/react/test-utils` + `bun:test` | **High** (infrastructure overhaul) |
| Dual-mode rendering | Directly translatable pattern | Low |

### OpenTUI blockers

1. **Not production-ready** — API may change without deprecation cycle
2. **Bun-only** — requires full Bun commitment, no Node.js fallback
3. **Zig build dependency** — CI and contributors must install Zig
4. **No gradient text** — the CLI's brand identity relies on `ink-gradient`
5. **Test framework mismatch** — requires migration from Vitest to `bun:test`

### Recommendation: OpenTUI

**Do not adopt OpenTUI at this time.** The blockers are fundamental — pre-release status, Bun-only runtime, Zig dependency, and missing gradient text. The migration cost is high with uncertain stability.

**Revisit criteria:**
- OpenTUI reaches 1.0 with stability guarantees
- Zig dependency eliminated for consumers (prebuilt binaries via npm)
- Gradient text component available (built-in or mature community package)
- Project has already committed to Bun runtime for CLI

---

## Assessment: language package and VS Code extension

### Language package (`@domainlang/language`) on Bun

**Feasibility: Low — not recommended**

| Factor | Assessment |
|--------|-----------|
| Langium 4.x on Bun | No documented cases; uncharted territory |
| `vscode-languageserver` | Not officially Bun-supported (open issue #1321, no progress) |
| `vscode-jsonrpc` | Works on Bun ≥1.0.6 (stream issues fixed) |
| Chevrotain parser | Pure JS, should work, but untested |
| `langium generate` CLI | Node.js tool, no Bun support documented |
| Generated parser code | Pure JS/TS, no runtime-specific deps |
| SDK browser-safe functions | Already designed for browser; trivially Bun-compatible |

**Key concern:** The language package is consumed by both the CLI and the VS Code extension. It must produce Node.js-compatible output regardless of any runtime changes. The SDK's `loadModelFromText()` (browser-safe) would work fine under Bun, but the workspace/import resolution services that use `vscode-languageserver` APIs are a significant unknown.

**Recommendation:** Leave `@domainlang/language` on Node.js. The risk-reward ratio is unfavorable — the package works correctly today, and Langium's toolchain assumes Node.js.

### VS Code extension on Bun

**Feasibility: None for runtime, low-medium for build tooling**

| Scenario | Feasibility | Reason |
|----------|-------------|--------|
| Bun as extension runtime | **Impossible** | VS Code extension host runs on Electron/Node.js (V8). Bun uses JavaScriptCore. Architecturally incompatible. |
| Bun as language server runtime | **Impossible** | `vscode-languageclient` spawns Node.js child processes. No Bun support. |
| Bun as bundler (replace esbuild) | **Low** | Known CJS output bugs with `--format cjs --target node`. Risk of silent extension load failures. |
| Bun to _run_ esbuild scripts | **High** | `bun esbuild.mjs` instead of `node esbuild.mjs`. Trivial change, faster startup. |
| `bun install` for development | **Medium-High** | 10-20x faster installs. Conflicts with Volta pinning, lockfile migration needed. |

**Recommendation:** The VS Code extension must remain on Node.js. The only low-risk Bun adoption is using `bun install` for package management and `bun esbuild.mjs` to execute existing build scripts.

---

## Gap analysis

### What works today

- [x] CLI has `FileSystemService` abstraction anticipating Bun migration
- [x] All `@domainlang/language` imports are type-only (except SDK validate functions)
- [x] Codebase is pure ESM — no `require()` calls
- [x] No native Node.js modules (no C++ addons)
- [x] Ink 5.x confirmed working on Bun ≥1.2
- [x] Static imports only (no dynamic `import()` patterns)
- [x] Dual-mode rendering (Ink + `runDirect()`) isolates UI from business logic

### What needs work

| Gap | Effort | Priority |
|-----|--------|----------|
| Strip `node:` prefixed imports in CLI (20+ occurrences) or validate fix in current Bun | Small | **P0** — must validate before committing |
| Test `tar` package compatibility on Bun | Small | **P0** — blocks `dlang add` / `dlang install` |
| Replace `shx cp` template copying with Bun asset embedding | Small | P1 |
| Create `BunFileSystemService` (or validate `NodeFileSystemService` works on Bun) | Small | P1 |
| Update build scripts for `bun build --compile` | Medium | P1 |
| Set up cross-compilation in CI (6 targets) | Medium | P1 |
| Create distribution pipeline (GitHub Releases, Homebrew, etc.) | Medium | P2 |
| Migrate CLI tests from Vitest to `bun:test` (if adopting Bun test runner) | Large | P3 (optional) |
| Replace Ink with OpenTUI | **Very large** | **Deferred** — OpenTUI not production-ready |

### What's blocked

| Blocker | Dependency | Status |
|---------|-----------|--------|
| OpenTUI adoption | OpenTUI 1.0 release + gradient text component | Pre-release, no timeline |
| Language package on Bun | Langium official Bun support | No support, no timeline |
| VS Code extension on Bun | Electron/VS Code Bun support | Architecturally impossible |

---

## Recommended strategy

### Phase 1: Bun as CLI build target (keep Ink)

**Goal:** Ship `dlang` as a self-contained executable while keeping the proven Ink UI.

| Step | Description | Risk |
|------|-------------|------|
| 1. Validate `node:` prefix handling | Test `bun build --compile` with current CLI code | P0 gate |
| 2. Test `tar` package on Bun | Run `dlang add` / `dlang install` integration tests under Bun | P0 gate |
| 3. Create Bun build configuration | `bun build ./src/main.ts --compile --outfile dlang` | Low |
| 4. Embed template files | Replace `shx cp` with `import ... with { type: "file" }` | Low |
| 5. Set up cross-compilation CI | GitHub Actions matrix for 6 platform targets | Medium |
| 6. Create distribution pipeline | GitHub Releases + Homebrew tap + direct download | Medium |
| 7. Keep npm distribution | `dlang` still installable via `npm install -g @domainlang/cli` | None |

**Outcome:** Users can install `dlang` as either:
- A self-contained binary (no Node.js required) — downloaded from GitHub Releases
- An npm package (existing workflow) — `npm install -g @domainlang/cli`

### Phase 2: Bun development tooling (optional)

**Goal:** Use Bun to accelerate development workflow without changing runtime.

| Step | Description | Risk |
|------|-------------|------|
| 1. Adopt `bun install` for monorepo | Replace `npm install` with `bun install` | Medium (lockfile migration) |
| 2. Use Bun to execute build scripts | `bun esbuild.mjs` for extension builds | Low |
| 3. Consider `bun test` for CLI tests | Faster test execution, but API migration needed | Medium |

### Phase 3: OpenTUI migration (deferred)

**Goal:** Replace Ink with OpenTUI when it reaches production readiness.

**Prerequisites:**
- [ ] OpenTUI 1.0 released with stability guarantees
- [ ] Gradient text component available
- [ ] Zig build dependency removed for consumers
- [ ] Bun runtime already adopted (Phase 1 complete)

**Estimated effort when ready:**
- 16 UI component files need JSX casing changes
- 2 gradient components need custom replacement
- 1 spinner component needs replacement
- All test utilities need migration to OpenTUI test renderer
- ~10 command files need minor API adjustments

---

## Open questions

1. **Binary size acceptance:** Is ~60 MB (macOS) / ~100 MB (Windows) acceptable for the `dlang` CLI?
2. **Distribution channels:** Should we target Homebrew, winget, apt, or just GitHub Releases?
3. **`node:` prefix status:** Has Bun fixed issue #5055 in recent versions? Needs empirical validation.
4. **`tar` on Bun:** Does the `tar` npm package work correctly under Bun for `dlang add`?
5. **Dual distribution maintenance:** Is maintaining both npm and binary distribution worth the CI/CD complexity?
6. **`yaml` dependency:** Should the CLI declare `yaml` as a direct dependency rather than relying on the transitive dependency from `@domainlang/language`?
7. **`string-width` cleanup:** The dependency appears unused — should it be removed regardless of this migration?

## Decision record

This PRS is an assessment document. Implementation requires a separate ADR approving the migration strategy and a follow-up PRS with detailed acceptance criteria for the chosen phase(s).


# PRS-016: VS Code web extension support

**Status**: Draft  
**Priority**: Medium  
**Target version**: 0.12.0  
**Effort estimate**: 2–3 weeks  
**Dependencies**: PRS-015 (VS Code LM Tools)

---

## Executive summary

Enable the DomainLang VS Code extension to run in browser-based VS Code environments — vscode.dev, github.dev, and GitHub Codespaces (browser editor) — by adding a browser extension client entry point and bundling the existing browser language server as a Web Worker.

The language server already has a browser entry point (`main-browser.ts`) using `EmptyFileSystem` and `BrowserMessageReader`/`BrowserMessageWriter`. The remaining work is extension plumbing: a browser client that spawns a Web Worker, a browser esbuild config, `package.json` fields, environment detection, virtual workspace declarations, and web extension testing infrastructure.

**Key insight from real-world extensions**: Popular language extensions (TypeScript, Rust Analyzer, Python/Pylance, ESLint, Svelte) follow a common pattern — the same `.vsix` package ships both a Node.js entry point (`main`) and a browser entry point (`browser`). VS Code selects the appropriate one based on the execution environment. In GitHub Codespaces, the full Node.js language server runs on the remote machine with zero feature degradation. In vscode.dev/github.dev, the browser language server runs in a Web Worker with single-file analysis only. The extension detects the environment at activation and adapts its feature set accordingly.

**Environment modes:**

```text
┌─────────────────────────────────────────────────────────────────────┐
│  1. Desktop VS Code / Codespaces (desktop client)                   │
│     Extension Host: Node.js (local or remote)                       │
│     Entry: main.ts → LanguageClient (node.js) → IPC                │
│     Server: language/main.ts → NodeFileSystem, full features        │
│     Result: FULL FEATURE SET                                        │
├─────────────────────────────────────────────────────────────────────┤
│  2. Codespaces (browser editor)                                     │
│     Extension Host: Remote Node.js + Web (browser)                  │
│     Entry: main.ts → LanguageClient (node.js) on remote machine     │
│     Server: language/main.ts → NodeFileSystem on remote machine     │
│     Result: FULL FEATURE SET (same as desktop — runs remotely)      │
├─────────────────────────────────────────────────────────────────────┤
│  3. vscode.dev / github.dev (pure browser, no backend)              │
│     Extension Host: Web (browser WebWorker)                         │
│     Entry: main-browser.ts → LanguageClient (browser.js) → Worker  │
│     Server: main-browser.ts → EmptyFileSystem, single-file mode    │
│     Result: SINGLE-FILE FEATURES ONLY                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Architecture (mode 3 — browser-only):**

```text
┌──────────────────────────────────────────────────────────────┐
│  vscode.dev / github.dev                                      │
│                                                                │
│  Web Extension Host (browser)                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  src/extension/main-browser.ts                           │  │
│  │  LanguageClient (vscode-languageclient/browser.js)       │  │
│  │  registerLanguageModelTools(client, context)             │  │
│  │       │                                                  │  │
│  │       │ Web Worker transport                             │  │
│  └───────┼──────────────────────────────────────────────────┘  │
│           │                                                    │
│  ┌────────▼─────────────────────────────────────────────────┐  │
│  │  Web Worker                                              │  │
│  │  main-browser.ts (already exists in @domainlang/language)│  │
│  │  EmptyFileSystem + BrowserMessageReader/Writer           │  │
│  │  createDomainLangServices() + startLanguageServer()      │  │
│  │  + registerToolHandlers() (new — Phase 2)                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

**Current vs. target:**

| Component | Current (Node-only) | Target (dual) |
|-----------|-------------------|---------------|
| Extension client | `main.ts` → `vscode-languageclient/node.js`, `TransportKind.ipc` | + `main-browser.ts` → `vscode-languageclient/browser.js`, `Worker` |
| Language server | `language/main.ts` → `NodeFileSystem`, `vscode-languageserver/node.js` | + `main-browser.ts` → `EmptyFileSystem`, `vscode-languageserver/browser.js` (exists) |
| Build | esbuild `platform: 'node'`, `format: 'cjs'` | + esbuild `platform: 'browser'`, `format: 'iife'` |
| package.json | `"main"` only | + `"browser"`, `"extensionKind": ["workspace", "web"]` |
| LM tools | Imports `LanguageClient` from `node.js` | Use `BaseLanguageClient` from common package |
| Capabilities | Not declared | `virtualWorkspaces: "limited"` |
| Environment detection | None | Detect `vscode.env.uiKind` for adaptive features |

---

## Problem

The DomainLang extension currently only runs in desktop VS Code. It cannot be used in:

1. **vscode.dev** — browser-based VS Code for GitHub repositories (pure browser, no backend)
2. **github.dev** — press `.` on any GitHub repo (same as vscode.dev)
3. **GitHub Codespaces (browser editor)** — cloud-hosted development environment accessed via browser

This limits DomainLang's accessibility. Users browsing DDD models on GitHub cannot get syntax highlighting, validation, hover information, or AI tool integration without cloning locally and installing VS Code desktop.

### Codespaces vs. vscode.dev — a critical distinction

These environments have fundamentally different architectures that affect extension behavior:

| Environment | Backend compute | Extension host | File system | Extension uses |
|-------------|:-:|---|---|---|
| **Desktop VS Code** | Local machine | Node.js (local) | Local disk | `main` entry |
| **Codespaces (desktop client)** | Remote VM | Node.js (remote) | Remote disk | `main` entry |
| **Codespaces (browser editor)** | Remote VM | Node.js (remote) + Web (browser) | Remote disk | `main` entry (remote) |
| **vscode.dev** | None | Web (browser only) | Virtual (GitHub API) | `browser` entry |
| **github.dev** | None | Web (browser only) | Virtual (GitHub API) | `browser` entry |

**Key insight**: In GitHub Codespaces — whether accessed via desktop or browser — the extension's `main` (Node.js) entry point runs on the remote machine with full filesystem access. The extension works identically to desktop. **No browser entry point is needed for Codespaces.** The `browser` entry point is only exercised in vscode.dev and github.dev, where there is no backend at all.

This is how all major language extensions behave: TypeScript, Python/Pylance, and Rust Analyzer all run their full Node.js language servers on the Codespaces remote machine. They only fall back to limited browser-based analysis when there is no backend available (vscode.dev).

### What already exists

The infrastructure for browser support largely exists:

- Langium's core (parser, AST, validation, LSP) is browser-safe — TypeFox explicitly supports running Langium language servers in Web Workers ([blog post](https://www.typefox.io/blog/langium-web-browser/))
- A browser language server entry point exists at `packages/language/src/main-browser.ts` (currently dead code — not referenced by any build config)
- `vscode-languageclient` and `vscode-languageserver` both ship browser exports (`/browser.js`)
- TextMate grammars and language configuration are declarative JSON (browser-compatible)
- The `@domainlang/language` package already exports `"./main-browser"` in its `package.json`

What's missing is the extension plumbing to wire it all together.

## Goals

| Goal | Measure |
|------|---------|
| **Run in vscode.dev / github.dev** | Extension activates, provides syntax highlighting + LSP features on single `.dlang` files |
| **Seamless in Codespaces** | Extension works identically to desktop (all features including imports, multi-file, model.yaml) |
| **Dual environment** | Single `.vsix` package works in desktop, Codespaces, and browser with no regressions |
| **LM tools everywhere** | `domainlang_validate`, `_list`, `_get`, `_explain` work in both Node.js and browser |
| **Graceful degradation** | Browser mode clearly communicates limitations (e.g., imports unavailable) |
| **Minimal language package changes** | Browser support achieved primarily through extension changes + existing `main-browser.ts` |

## Non-goals

- Multi-file workspace support in pure browser mode (imports, `model.yaml` — requires virtual filesystem adapter, separate PRS)
- CLI in browser (CLI requires Node.js runtime — separate tool)
- WASM compilation of the language server (TypeScript/Langium runs natively in Web Workers — WASM is unnecessary)
- Changes to the `packages/demo` playground (separate concern, uses services directly without LSP)

---

## Current state analysis

### What exists today

| Asset | Location | Browser-safe? |
|-------|----------|:-------------:|
| Browser language server | `packages/language/src/main-browser.ts` | ✅ |
| `EmptyFileSystem` usage | `main-browser.ts` line 1 | ✅ |
| `BrowserMessageReader/Writer` | `main-browser.ts` line 3 | ✅ |
| `createDomainLangServices()` | `main-browser.ts` line 4 | ⚠️ (see below) |
| `startLanguageServer()` | `main-browser.ts` line 15 | ✅ |
| Language package export | `"./main-browser"` in `package.json` | ✅ |
| TextMate grammar | `domain-lang.tmLanguage.json` | ✅ |
| Markdown injection grammar | `domain-lang-markdown-inject.json` | ✅ |
| Language configuration | `language-configuration.json` | ✅ |
| Monarch syntax (for demo) | `domain-lang.monarch.ts` | ✅ |
| Tool handlers (LSP side) | `src/lsp/tool-handlers.ts` | ✅ (no `node:` imports) |
| Explain (LSP side) | `src/lsp/explain.ts` | ✅ (no `node:` imports) |

### What's missing

| Gap | Details | Severity |
|-----|---------|----------|
| Browser extension client | No `src/extension/main-browser.ts` — needs `LanguageClient` from `vscode-languageclient/browser.js` spawning a Web Worker | Blocking |
| Browser esbuild config | `esbuild.mjs` hardcodes `platform: 'node'`, `format: 'cjs'` | Blocking |
| `package.json` fields | No `"browser"` entry, no `"extensionKind"`, no `"capabilities"` | Blocking |
| `node:` module shims | 4 service files with top-level `node:` imports would crash the browser bundle | Blocking |
| `registerToolHandlers` | `main-browser.ts` doesn't call it — LM tools won't work in browser | Important |
| LM tools type import | `lm-tools.ts` imports `LanguageClient` type from `vscode-languageclient/node.js` | Important |
| Environment detection | No runtime detection of `vscode.env.uiKind` or `vscode.env.appHost` | Important |
| `virtualWorkspaces` capability | Not declared — VS Code cannot inform users about limitations | Important |
| Web test infrastructure | No `@vscode/test-web` setup for browser integration testing | Important |
| DevContainer config | No `.devcontainer/devcontainer.json` for Codespaces auto-setup | Nice-to-have |

### `createDomainLangServices()` browser safety

The function itself (`domain-lang-module.ts`) has no `node:` imports. However, it registers 4 services whose source files have top-level `node:` imports:

| Service | Class | `node:` imports |
|---------|-------|:---------------:|
| `imports.ImportResolver` | `ImportResolver` | `node:fs/promises`, `node:path` |
| `imports.WorkspaceManager` | `WorkspaceManager` | `node:path`, `node:fs/promises` |
| `imports.PackageBoundaryDetector` | `PackageBoundaryDetector` | `node:path`, `node:fs/promises` |
| `workspace.WorkspaceManager` (shared) | `DomainLangWorkspaceManager` | `node:fs/promises`, `node:path` |

**Why these don't crash in the Node.js context**: Langium's DI uses lazy factory functions — services are instantiated on first access, not at registration. With `EmptyFileSystem`, Langium's workspace initialization skips filesystem traversal, and import-related services are only accessed when documents contain `import` statements.

**Why they WILL crash in the browser**: The `node:` modules are loaded at JavaScript module parse time (top-level `import` statements). In a browser environment, `import * as path from 'node:path'` throws immediately. Even if the service function is never called, the module containing the import is evaluated when the bundle loads.

**Solution**: The esbuild browser build must alias `node:path`, `node:fs`, and `node:fs/promises` to stub modules that export safe no-op implementations. esbuild's `platform: 'browser'` does **not** automatically provide these stubs — explicit `alias` configuration is required. The `packages/demo/` playground already demonstrates this pattern with Vite `resolve.alias` directives, though those shims are incomplete (missing `path.resolve`, `path.isAbsolute`, `path.relative`, `path.extname`, `path.parse`).

### How real extensions handle this

Research into popular VS Code language extensions reveals consistent patterns:

| Extension | Web support | Strategy |
|-----------|:-----------:|----------|
| TypeScript (built-in) | ✅ Limited | Single-file analysis via `@typescript/vfs`; full analysis in Codespaces backend |
| Python/Pylance | ❌ | Requires backend compute; works in Codespaces, not vscode.dev |
| Rust Analyzer | ❌ | Requires Cargo project + filesystem; works in Codespaces only |
| ESLint | ❌ | No web support; `Linter` class exists for single-file but the extension doesn't use it |
| Svelte | ✅ Limited | Unofficial web port with single-file IntelliSense; no cross-file features |
| Biome | ✅ | WASM-compiled formatter/linter runs fully in browser |

**DomainLang's position is favorable**: Unlike Rust or Python, DomainLang's parser and validator are pure JavaScript (Langium/Chevrotain) and run natively in Web Workers without WASM compilation. A single `.dlang` file is fully self-contained and can be validated without a project structure. This enables near-complete single-file IDE features in the browser — better than what most language extensions achieve.

---

## Requirements

| ID | Requirement | Priority | Rationale |
|----|-------------|----------|-----------|
| R1 | Add `"browser"` field to extension `package.json` pointing to the browser client bundle | Must | VS Code requires this to activate the extension in browser environments |
| R2 | Set `"extensionKind": ["workspace", "web"]` in extension `package.json` | Must | Prefer running on remote machine (Codespaces) with fallback to browser. See design rationale below |
| R3 | Create browser extension client (`src/extension/main-browser.ts`) that spawns a Web Worker and connects via `vscode-languageclient/browser.js` | Must | The browser client must use Worker transport, not IPC/stdio |
| R4 | Create browser esbuild config with `platform: 'browser'` and `node:` module aliases | Must | Browser bundles require different platform target, format, and explicit shims |
| R5 | Bundle the language server's `main-browser.ts` as a self-contained worker script in the extension output | Must | The Web Worker must load from a single bundled file |
| R6 | Provide complete `node:path` and `node:fs/promises` shims for the browser bundle covering all 21 call sites | Must | Top-level `node:` imports crash without resolution; `path.resolve` (11 sites), `path.isAbsolute` (5), `path.relative` (2), `path.extname` (1), `path.parse` (2) |
| R7 | Declare `virtualWorkspaces` capability as `"limited"` with descriptive message | Must | Informs users about reduced functionality in virtual workspaces (vscode.dev) |
| R8 | Add `registerToolHandlers(connection, shared)` to `main-browser.ts` in the language package | Should | LM tools (`domainlang_validate`, `_list`, `_get`, `_explain`) should work in browser |
| R9 | Change `lm-tools.ts` to import `BaseLanguageClient` from `vscode-languageclient` instead of `LanguageClient` from `vscode-languageclient/node.js` | Should | Makes LM tools registration shareable between Node.js and browser entry points |
| R10 | Detect environment at activation and adapt feature messaging | Should | Users in vscode.dev should see a notification explaining single-file limitations |
| R11 | Desktop Node.js extension continues to work identically with no regressions | Must | Dual-environment support, not a replacement |
| R12 | Update extension build scripts to produce both Node and browser bundles | Must | CI must build and package both variants; `vscode:prepublish` runs both |
| R13 | Add `@vscode/test-web` integration test infrastructure | Should | Verify the browser extension activates and basic LSP features work |
| R14 | Add `.devcontainer/devcontainer.json` with DomainLang extension pre-installed | Nice | Codespaces users get full IDE support automatically on repository open |

### Design rationale: `extensionKind` ordering

`["workspace", "web"]` is intentional — not `["web", "workspace"]`:

- **`"workspace"` first** means VS Code prefers running the extension on the remote machine when one exists (Codespaces, SSH, WSL). This gives users the full Node.js language server with all features.
- **`"web"` fallback** means in environments with no remote backend (vscode.dev, github.dev), VS Code falls back to the browser entry point with single-file features.
- If the order were reversed (`["web", "workspace"]`), Codespaces users would get the degraded browser experience even though full backend compute is available.

This matches the pattern used by TypeScript and other "workspace-first" language extensions.

## Design

### Phase 1: Browser extension plumbing (must-have)

**New file: `src/extension/main-browser.ts`**

Browser extension client that:
- Uses `vscode-languageclient/browser.js` imports (`LanguageClient`, `LanguageClientOptions`)
- Resolves the worker script URI via `vscode.Uri.joinPath(context.extensionUri, 'out/language/main-browser.js')`
- Creates a `Worker` instance pointing to the bundled language server
- Creates a `LanguageClient` with `documentSelector: [{ language: 'domain-lang' }]`
- Registers file watchers for `*.dlang` and `model.yaml` files
- Calls `registerLanguageModelTools(client, context)` for LM tool support
- Detects the environment via `vscode.env.uiKind` to show a startup notification in pure browser mode

**Changed file: `packages/extension/package.json`**

```jsonc
{
  "main": "./out/extension/main.cjs",              // existing (Node.js)
  "browser": "./out/extension/main-browser.js",     // new (browser)
  "extensionKind": ["workspace", "web"],            // new
  "capabilities": {                                 // new
    "virtualWorkspaces": {
      "supported": "limited",
      "description": "In virtual workspaces, only single-file editing is supported. Multi-file imports, model.yaml validation, and cross-file navigation are not available."
    }
  }
}
```

**New file: `esbuild-browser.mjs`**

Separate browser esbuild config (not merged into `esbuild.mjs`) for clarity and independent testing:

- Entry points: `src/extension/main-browser.ts` (extension client), `../language/src/main-browser.ts` (worker)
- `platform: 'browser'`
- `format: 'iife'` — Web Workers in VS Code use IIFE format, not ESM (ESM requires `{ type: 'module' }` Worker option which has compatibility issues)
- `external: ['vscode']`
- `alias` map for `node:` modules:

```javascript
alias: {
  'node:path': './src/shims/node-path.ts',
  'node:fs': './src/shims/node-fs.ts',
  'node:fs/promises': './src/shims/node-fs-promises.ts',
  'node:os': './src/shims/node-os.ts',
  'node:child_process': './src/shims/empty.ts',
  'node:worker_threads': './src/shims/empty.ts',
}
```

**New directory: `src/shims/`**

Complete browser shims for `node:` modules. Unlike the demo's incomplete shims, these must cover all 21 call sites in the language package:

| Shim | Must export | Behavior |
|------|------------|----------|
| `node-path.ts` | `join`, `dirname`, `basename`, `sep`, `resolve`, `isAbsolute`, `relative`, `extname`, `parse` | `resolve()` returns the last argument; `isAbsolute()` returns false; `relative()` returns empty string; others delegate to string manipulation |
| `node-fs-promises.ts` | `readFile`, `writeFile`, `access`, `stat`, `readdir` | All throw or return empty results |
| `node-fs.ts` | `existsSync` | Returns false |
| `node-os.ts` | `homedir`, `tmpdir` | Return `'/'` |
| `empty.ts` | (nothing) | Empty module for unused Node APIs |

### Phase 2: LM tools in browser

**Changed file: `packages/language/src/main-browser.ts`**

Add `registerToolHandlers(connection, shared)` import and call. Verified: `tool-handlers.ts` and `explain.ts` have zero `node:` imports — they use only `vscode-languageserver`, `langium`, and local SDK modules. Browser-safe.

**Changed file: `packages/extension/src/extension/lm-tools.ts`**

Change the type-only import:
```typescript
// Before
import type { LanguageClient } from 'vscode-languageclient/node.js';

// After
import type { BaseLanguageClient } from 'vscode-languageclient';
```

This is safe because:
- The import is `type`-only (erased at compile time, no runtime dependency)
- `BaseLanguageClient` is the common base class for both Node.js and browser `LanguageClient` implementations
- `lm-tools.ts` only uses `client.sendRequest()` and `client.state`, both defined on `BaseLanguageClient`
- Both entry points (`main.ts` and `main-browser.ts`) can now share the same `registerLanguageModelTools()` function

### Phase 3: Environment detection and user communication

**Browser extension client behavior:**

At activation, the browser entry point detects the environment and communicates limitations:

```typescript
const isWeb = vscode.env.uiKind === vscode.UIKind.Web;
const appHost = (vscode.env as { appHost?: string }).appHost;

// In pure browser (vscode.dev/github.dev), show a one-time informational message
if (isWeb && appHost !== 'codespaces') {
  vscode.window.showInformationMessage(
    'DomainLang is running in single-file mode. Multi-file imports and model.yaml are not available in the browser. Use GitHub Codespaces for full project support.'
  );
}
```

**Command disabling via `when` clauses:**

Commands that require filesystem access should be conditionally hidden:

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "domainlang.validateWorkspace",
        "title": "DomainLang: Validate workspace",
        "enablement": "!virtualWorkspace"
      }
    ]
  }
}
```

### Phase 4: Build integration and testing

**Changed file: `packages/extension/package.json` scripts**

```jsonc
{
  "scripts": {
    "build": "npm run build:node && npm run build:browser",
    "build:node": "node esbuild.mjs",
    "build:browser": "node esbuild-browser.mjs",
    "vscode:prepublish": "npm run build"
  }
}
```

**CI pipeline**: Both builds run in the quality gate. The `.vsix` package includes:
- `out/extension/main.cjs` — Node.js extension client
- `out/language/main.cjs` — Node.js language server  
- `out/extension/main-browser.js` — Browser extension client
- `out/language/main-browser.js` — Browser language server (Web Worker)

**New dev dependency: `@vscode/test-web`**

Integration test that verifies:
- Extension activates in a simulated browser environment
- Language client starts and connects to the Web Worker server
- Basic parsing/validation works for a single `.dlang` document

### Phase 5: DevContainer (nice-to-have)

**New file: `.devcontainer/devcontainer.json`**

```jsonc
{
  "name": "DomainLang",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "customizations": {
    "vscode": {
      "extensions": [
        "domainlang.domainlang"
      ]
    }
  },
  "postCreateCommand": "cd dsl/domain-lang && npm install"
}
```

This ensures that when anyone opens the DomainLang repository in GitHub Codespaces, they automatically get:
- The DomainLang extension installed (full Node.js mode)
- Dependencies installed and ready to build

---

## Feature compatibility matrix

### Per-environment feature support

| Feature | Desktop | Codespaces (any) | vscode.dev / github.dev |
|---------|:-------:|:-----------------:|:-----------------------:|
| Syntax highlighting | ✅ | ✅ | ✅ |
| Code completion | ✅ | ✅ | ✅ |
| Hover information | ✅ | ✅ | ✅ |
| Validation diagnostics | ✅ | ✅ | ✅ (single file) |
| Document formatting | ✅ | ✅ | ✅ |
| Code actions | ✅ | ✅ | ✅ |
| Go to definition (same file) | ✅ | ✅ | ✅ |
| Document symbols | ✅ | ✅ | ✅ |
| LM tools (validate, list, get, explain) | ✅ | ✅ | ✅ |
| Markdown code block highlighting | ✅ | ✅ | ✅ |
| Multi-file imports | ✅ | ✅ | ❌ |
| Cross-file go to definition | ✅ | ✅ | ❌ |
| `model.yaml` validation | ✅ | ✅ | ❌ |
| Workspace-wide diagnostics | ✅ | ✅ | ❌ |
| File watcher refresh | ✅ | ✅ | ❌ |
| CLI commands | ✅ | ✅ | ❌ |

### Why the browser limitations exist

| Limitation | Root cause | Future mitigation |
|------------|-----------|-------------------|
| No multi-file imports | `EmptyFileSystem` has no real filesystem; `import` cannot resolve files | Future PRS: virtual filesystem adapter using `vscode.workspace.fs` to bridge |
| No `model.yaml` | Manifest reading uses `node:fs/promises` directly | Same virtual FS adapter |
| No cross-file navigation | Documents not open in the editor are invisible to the language server | Could use `vscode.workspace.fs.readFile()` to load on-demand |
| No workspace diagnostics | Requires enumerating and loading all `.dlang` files | Would need `vscode.workspace.findFiles()` integration |
| No CLI | CLI spawns as Node.js process | Not feasible in browser |

---

## Acceptance criteria

### Core (must-have)

- [ ] Extension activates in vscode.dev without errors when opening a `.dlang` file
- [ ] Extension activates in github.dev (press `.` on a repo with `.dlang` files)
- [ ] Syntax highlighting works on `.dlang` files in browser
- [ ] Validation diagnostics appear for single-file `.dlang` documents in browser
- [ ] Hover information displays for domains, bounded contexts, relationships, and other elements
- [ ] Code completion provides keyword and reference suggestions
- [ ] Document formatting works via format command in browser
- [ ] Desktop Node.js extension continues to function identically (no regressions)
- [ ] `npm run build` produces both node and browser bundles
- [ ] Extension `.vsix` package includes both entry points and passes `vsce package` validation

### Codespaces

- [ ] Extension works in GitHub Codespaces (desktop client) with full feature set
- [ ] Extension works in GitHub Codespaces (browser editor) with full feature set (uses remote Node.js server)
- [ ] Multi-file imports, `model.yaml` validation, and cross-file navigation all work in Codespaces

### Graceful degradation

- [ ] Typing `import "./foo"` in browser shows a diagnostic but does not crash the language server
- [ ] Browser mode shows an informational message about single-file limitations at activation
- [ ] `virtualWorkspaces` capability prevents confusing UI for unsupported features

### LM tools

- [ ] `domainlang_validate`, `_list`, `_get`, `_explain` register and respond to queries in browser
- [ ] LM tools work identically in desktop and browser modes

### Testing and CI

- [ ] Web extension integration test passes via `@vscode/test-web`
- [ ] Quality gate (`npm run lint && npm run build && npm run test:coverage`) passes with browser build included

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `node:` shims cause silent bugs in tree-shaked code paths | Imports resolve but return wrong values → confusing errors | Shims should throw descriptive errors ("not available in browser") rather than returning silent defaults for destructive operations like `writeFile` |
| Bundle size too large for browser | Slow activation in vscode.dev | Measure first; esbuild tree-shaking + minification should keep it manageable. Langium core is ~200KB minified |
| esbuild `iife` format issues with Web Workers | Worker fails to initialize | Test early; VS Code's own extensions use `iife` for workers. Fall back to `esm` if needed |
| `vscode-languageclient` version mismatch between node/browser exports | Type errors or runtime incompatibility | Pin to a single version; both exports are from the same package |
| Users expect full features in vscode.dev | Confusion and bug reports | Clear messaging at activation + `virtualWorkspaces` capability declaration |

## Resolved decisions

1. **Shim strategy**: Use hand-rolled shims (not esbuild empty modules) because esbuild's `platform: 'browser'` does NOT automatically provide `node:` stubs. The shims must implement enough of the `path` API (`resolve`, `isAbsolute`, `relative`, `extname`, `parse`) to avoid crashes. Destructive FS operations should throw with descriptive errors.
2. **Bundle format**: Use `iife` (not `esm`) for the browser build. VS Code's Web Worker instantiation doesn't pass `{ type: 'module' }`, so ESM format may not work. IIFE is the safe default used by VS Code's own extension examples.
3. **`extensionKind` ordering**: `["workspace", "web"]` — prefer full Node.js backend when available (Codespaces, SSH, WSL), fall back to browser only when no backend exists.
4. **LM tools type**: Use `BaseLanguageClient` from `vscode-languageclient` (the common base class) instead of `LanguageClient` from `vscode-languageclient/node.js`. This is a type-only change with zero runtime impact.

## Future work (separate PRSs)

1. **Virtual filesystem adapter**: Use `vscode.workspace.fs` API to provide file access in browser mode, enabling multi-file imports and `model.yaml` reading. `vscode.workspace.fs.readFile()` works across all environments including virtual workspaces. This would close the biggest feature gap between desktop and browser.
2. **Open document synchronization**: Use `vscode.workspace.textDocuments` to make all currently open `.dlang` files available to the browser language server, enabling limited cross-file references within open documents.
3. **DevContainer for DomainLang projects**: Provide a `devcontainer.json` template in the CLI's `dlang init` scaffolding so that DomainLang users' repositories are Codespaces-ready.

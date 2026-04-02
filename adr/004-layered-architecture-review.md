# ADR 004: Layered architecture review and remediation plan

## Status

Accepted (phases 1–4 implemented)

## Date

2026-04-02

## Context

The DomainLang codebase has grown organically since the initial architectural review (ADR-002, Oct 2025). A comprehensive code review (PRS-021) and a subsequent fix session (PRS-022) addressed critical security and data-corruption bugs but did not address structural layering violations that have accumulated over time.

This ADR validates the solution's layered architecture, catalogues dependency direction violations, and proposes a remediation plan to restore clean layering without a full rewrite.

## Intended architecture

The `@domainlang/language` package is organized into these layers. Each layer should only depend on layers below it (or peer layers at the same level):

```text
┌─────────────────────────────────────────────────┐
│               Entry points                      │  main.ts, main-browser.ts (side-effects)
├─────────────────────────────────────────────────┤
│         LSP layer  (lsp/)                       │  Hover, completion, formatting, scoping,
│                                                 │  indexing, workspace, code actions, code lens
├──────────────────────┬──────────────────────────┤
│  Validation (valid/) │  Diagram (diagram/)      │  Domain rules │ Sprotty generation
├──────────────────────┴──────────────────────────┤
│           Services layer (services/)            │  Import resolution, workspace mgr, types,
│                                                 │  relationship inference, perf optimizer
├─────────────────────────────────────────────────┤
│           Utils layer (utils/)                  │  Shared helpers with no domain logic
├─────────────────────────────────────────────────┤
│           Generated layer (generated/)          │  AST, grammar, DI module  (NEVER EDIT)
├─────────────────────────────────────────────────┤
│           SDK layer (sdk/)                      │  Read-only query API, indexes, loaders,
│                                                 │  serializers, patterns  (browser-safe)
└─────────────────────────────────────────────────┘

CLI package (packages/cli/) is a separate package that depends on language,
never the other way around.
```

**Rules:**

- Generated → no custom imports (foundation)
- Utils → generated only
- Services → generated, utils
- Validation → generated, utils, services
- Diagram → generated, services
- LSP → all lower layers
- SDK → generated only (self-contained, browser-safe)
- Entry points → LSP, wire everything up via DI module

## Findings

### Summary of violations

| ID | From layer | To layer | Direction | Files involved | Severity |
| --- | --- | --- | --- | --- | --- |
| V-1 | SDK | LSP | Upward ↑ | `sdk/query.ts`, `sdk/indexes.ts` → `lsp/domain-lang-naming.ts` | **Critical** |
| V-2 | Validation | LSP | Upward ↑ | `validation/shared.ts` → `lsp/domain-lang-naming.ts` | **High** |
| V-3 | Validation | LSP | Upward ↑ | `validation/import.ts` → `lsp/domain-lang-index-manager.ts` | **High** |
| V-4 | Utils | Services | Upward ↑ | `utils/import-utils.ts` → `services/import-resolver.ts` | **Medium** |
| V-5 | Utils | Services | Upward ↑ | `utils/manifest-utils.ts` → `services/types.ts` | **Medium** |
| V-6 | SDK | Root DI | Upward ↑ | `sdk/types.ts`, `sdk/loader.ts`, `sdk/loader-node.ts`, `sdk/validator.ts`, `sdk/query.ts` → `domain-lang-module.ts` | **High** |
| V-7 | LSP | SDK | Downward ↓ | `lsp/tool-handlers.ts`, `lsp/explain.ts` → `sdk/query.ts`, `sdk/serializers.ts`, `sdk/resolution.ts` | **Low** |

### Detailed analysis

#### V-1 & V-2: `QualifiedNameProvider` misplaced in LSP layer (Critical)

`QualifiedNameProvider` (`lsp/domain-lang-naming.ts`) is a **pure computation** class — it has zero dependencies on LSP protocols, connection objects, or editor state. It computes fully qualified names from AST containers. Yet it lives in `lsp/`, making it an LSP service.

Both the SDK (which must be browser-safe and self-contained) and the validation layer (which should never know about LSP) import it directly:

- `sdk/query.ts` line 35: `import { QualifiedNameProvider } from '../lsp/domain-lang-naming.js'`
- `sdk/indexes.ts` line 31: `import { QualifiedNameProvider } from '../lsp/domain-lang-naming.js'`
- `validation/shared.ts` line 4: `import { QualifiedNameProvider } from '../lsp/domain-lang-naming.js'`

**Impact:** The SDK's `@domainlang/language/sdk` export sub-path transitively pulls in LSP-layer code. While currently tree-shakeable, this is a structural violation that will worsen as the LSP layer grows.

**Root cause:** `QualifiedNameProvider` was originally created alongside other LSP services and was never relocated when the SDK layer was introduced.

#### V-3: Validation imports `DomainLangIndexManager` from LSP (high)

`validation/import.ts` line 10 imports `DomainLangIndexManager` as a `type` import (used to type a DI-resolved parameter). While this is a type-only import (erased at runtime), it creates a structural dependency from validation to LSP that is incorrect.

**Root cause:** The import validator needs access to cycle detection and reverse dependency data, which is hosted in the IndexManager (an LSP service). The type is needed for the DI parameter typing.

#### V-4 & V-5: Utils depend upward on services (Medium)

- `utils/import-utils.ts` depends on `ImportResolver` from services
- `utils/manifest-utils.ts` depends on `ModelManifest` type from services

These files are misnamed — they contain domain logic (import graph traversal, manifest resolution) that belongs in the services layer, not in a leaf utility layer.

**Root cause:** The files were likely created as "helper" extractions but they contain logic that properly belongs in services.

#### V-6: SDK imports the DI module root (High)

Six SDK files import `DomainLangServices` type or `createDomainLangServices` from `domain-lang-module.ts`. This root module imports from every layer (LSP, services, validation, diagram), making the SDK transitively depend on the entire codebase.

- `sdk/loader.ts` line 32: `import { createDomainLangServices } from '../domain-lang-module.js'` (value import)
- `sdk/loader-node.ts` line 25: same (value import)
- `sdk/validator.ts` line 14: same (value import)
- `sdk/types.ts` line 19: type import only
- `sdk/query.ts` line 36: type import only

**Impact:** The value imports (`createDomainLangServices`) are the most concerning — they mean the SDK loaders pull in the entire DI container including LSP, diagram, and Sprotty dependencies. This defeats the purpose of having a lightweight `@domainlang/language/sdk` export sub-path.

**Root cause:** SDK loaders need to bootstrap a Langium environment to parse `.dlang` files. They reuse the full DI module rather than a minimal parser-only module.

#### V-7: LSP uses SDK (Low severity — acceptable)

`lsp/tool-handlers.ts` and `lsp/explain.ts` import from `sdk/` to serialize models and resolve computed properties. This is a **downward** dependency (LSP is higher than SDK in the intended architecture) and is architecturally acceptable. The LSP layer is a consumer of the SDK's read API.

**Assessment:** This is the correct direction. No action needed.

### Additional structural observations

#### S-1: Canonical types split across two files

`services/types.ts` serves as the canonical type registry for service-layer types (manifest, dependency, import resolution). `sdk/types.ts` serves as the canonical type registry for SDK query types. These are correctly separated by concern.

However, PRS-021 finding S-014 noted ~14 types in `services/types.ts` that appear CLI-specific (`ResolvingPackage`, `DependencyGraph`, `GovernanceViolation`). These should be moved to the CLI package.

#### S-2: `ast-augmentation.ts` exists at two levels

Both `src/ast-augmentation.ts` (root) and `sdk/ast-augmentation.ts` exist. The root augmentation is imported by the main barrel; the SDK augmentation is imported within SDK. This dual-augmentation pattern works but is fragile — changes must be coordinated.

#### S-3: `PerformanceOptimizer` as global singleton

PRS-021 finding S-012 noted the `PerformanceOptimizer` uses a global singleton pattern (`getGlobalOptimizer()`) outside the DI container. This bypasses Langium's service lifecycle and complicates testing.

## Decision

### Phase 1: Extract `QualifiedNameProvider` to services layer (fixes V-1, V-2)

Move `lsp/domain-lang-naming.ts` → `services/naming.ts`. Update all imports. The DI module (`references.QualifiedNameProvider`) already treats it as a service.

**Effort:** Low. Pure file move + import rewrites.
**Risk:** None. No behavioral change.

### Phase 2: Reclassify utils as services (fixes V-4, V-5)

Move:

- `utils/import-utils.ts` → `services/import-graph.ts` (rename to reflect actual purpose)
- `utils/manifest-utils.ts` → `services/manifest-utils.ts`

The `utils/` directory can be retained for genuinely layer-agnostic helpers, or removed if empty.

**Effort:** Low. File moves + import rewrites.
**Risk:** None. No behavioral change.

### Phase 3: Create minimal SDK bootstrap module (fixes V-6)

Extract a `sdk/bootstrap.ts` that creates a minimal Langium environment (parser + linker only, no LSP/diagram services). SDK loaders use this instead of the full `createDomainLangServices`.

Alternatively, accept the coupling as a pragmatic trade-off: the SDK loaders (`loadModel`, `loadModelFromText`) need a full Langium environment to resolve imports and validate, and Langium does not support partial service initialization. In this case, document the coupling explicitly and ensure the `@domainlang/language/sdk` export sub-path only re-exports the query API (not the loaders).

**Effort:** Medium. Requires understanding Langium's minimal service requirements.
**Risk:** Medium. Langium's DI container does not officially support partial modules.

### Phase 4: Extract index manager interface for validation (fixes V-3)

Define an `IndexManagerQuery` interface in `services/types.ts` with the methods validation needs (cycle detection, dependency lookup). The validation layer depends on this interface; the LSP layer's `DomainLangIndexManager` implements it.

**Effort:** Low. Interface extraction + type-only change.
**Risk:** None.

### Phase 5: Relocate CLI-specific types (addresses S-014)

Move ~14 CLI-specific types from `services/types.ts` to the CLI package. Leave only types shared between language and CLI.

**Effort:** Low. Type moves + import rewrites across packages.
**Risk:** Low. May require CLI package to re-export for backward compatibility.

### Not addressed (accepted as-is)

- **V-7 (LSP → SDK):** Correct dependency direction. No action.
- **S-2 (dual augmentation):** Working correctly. Document the pattern.
- **S-3 (global singleton):** Out of scope for this ADR. Can be addressed separately if DI integration is desired.

## Consequences

**Positive:**

- SDK becomes truly self-contained for the query API surface
- Validation layer has no upward dependency on LSP
- Utils layer returns to its intended role as leaf utilities
- Cleaner mental model for contributors: layer boundaries are enforceable
- Prepares the codebase for future lint rules (e.g., `eslint-plugin-import` boundary checks)

**Negative:**

- Phase 3 (SDK bootstrap) may be impractical given Langium's all-or-nothing DI
- File moves generate diff noise in git history (mitigated by `git log --follow`)
- Import paths change across many files (mitigated by automated refactoring)

## Alternatives considered

### 1. Full rewrite into strict module boundaries

Create separate npm packages for each layer (`@domainlang/ast`, `@domainlang/services`, `@domainlang/sdk`, `@domainlang/lsp`). This would enforce boundaries at the package level.

**Rejected:** Massive churn, fights Langium's monolithic service architecture, no immediate user benefit.

### 2. Do nothing

Accept current violations as pragmatic trade-offs.

**Rejected:** The violations will compound as the codebase grows. The SDK → LSP dependency is particularly problematic for browser-only consumers.

### 3. Enforce via eslint boundaries only

Add `eslint-plugin-boundaries` or similar without moving files.

**Rejected:** Lint rules would flag 7+ violations on day one with no resolution path. Must fix first, then lint.

## Implementation order

1. **Phase 1** (V-1, V-2) — extract naming to services → unblocks SDK and validation
2. **Phase 4** (V-3) — extract index interface → completes validation isolation
3. **Phase 2** (V-4, V-5) — reclassify utils → cleans up leaf layer
4. **Phase 5** (S-014) — relocate CLI types → reduces services surface
5. **Phase 3** (V-6) — SDK bootstrap (investigate feasibility) → aspirational

Each phase is independently deployable and testable. No phase depends on another.

## Outcome

Phases 1–4 were implemented in commit `a5fb7a2` (`refactor: enforce layered architecture per ADR-004`). 45 files changed, 454 insertions, 607 deletions. All quality gates passed (lint clean, build clean, 1150 tests pass, coverage thresholds met).

### Phase 1 — done

Moved `lsp/domain-lang-naming.ts` → `services/naming.ts`. Updated 7 consumer imports across SDK, validation, LSP, DI module, and tests. Git detected 100% rename.

### Phase 2 — done

Moved `utils/import-utils.ts` → `services/import-graph.ts` and `utils/manifest-utils.ts` → `services/manifest-utils.ts`. Updated 7 consumer imports. Removed the empty `utils/` directory.

### Phase 3 — done (containment approach)

Created `sdk/bootstrap.ts` that re-exports `createDomainLangServices` and the `DomainLangServices` type from the root DI module. All 5 SDK files (`loader.ts`, `loader-node.ts`, `validator.ts`, `types.ts`, `query.ts`) now import through this single coupling point instead of directly referencing `domain-lang-module.ts`.

The "minimal parser-only module" alternative was not feasible — Langium's DI container does not support partial service initialization, and the SDK loaders need a full environment for import resolution and validation. The containment approach isolates the coupling to one file, making it explicit and auditable.

### Phase 4 — done

Extracted `ImportCycleDetector` interface in `services/types.ts` with a single method: `getCycleForDocument(uri: string): string[] | undefined`. `validation/import.ts` now depends on this interface instead of the concrete `DomainLangIndexManager` class. `DomainLangIndexManager` implements `ImportCycleDetector`.

### Phase 5 — deferred

Relocating CLI-specific types from `services/types.ts` to the CLI package was not addressed in this round. It remains a valid improvement for a future session.

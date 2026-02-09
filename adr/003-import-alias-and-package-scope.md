# ADR-003: Import Aliases and Package-Boundary Transitive Scoping

**Status:** Accepted  
**Date:** 2026-02-08  
**Deciders:** Architecture Team  
**Related:** PRS-010 (Import System Redesign), PRS-006 (Standard Library)

## Context

DomainLang's import system currently has two critical issues discovered during testing:

### Issue 1: Import Aliases Not Functioning

The grammar supports `import "package" as alias` syntax, but the scope provider doesn't use the alias for namespace-prefixed references. Users expect to write:

```dlang
import "larsbaunwall/ddd-types" as ddd
bc Orders as ddd.CoreDomain
```

But this fails because the scope provider doesn't recognize `ddd.*` as a valid prefix.

### Issue 2: Package Exports Don't Work

External packages cannot re-export types from their internal structure. For example, `larsbaunwall/ddd-types/index.dlang` contains:

```dlang
import "@std/strategic/classifications.dlang"  
```

When a consumer imports this package, they get nothing - because transitive imports are explicitly blocked at the scope provider level. The test suite confirms: **"Transitive imports do NOT provide scope (only direct imports)"**.

This design was correct for **local file imports** (avoiding implicit dependencies), but it breaks **package-level exports** - a standard pattern in JavaScript (export), Python (`__init__.py`), Rust (`pub use`), and Go (package-level declarations).

### The Problem

We need to distinguish between:

1. **Local project imports** - should NOT be transitive (explicit dependencies)
2. **Package imports** - SHOULD allow transitive re-exports within the package boundary

## Decision

We adopt **Option C: Namespace Structure Preserved** with alias-scoped visibility:

### 1. Import Aliases as Namespace Prefixes

**With alias:** Types are ONLY accessible via the alias prefix

```dlang
import "larsbaunwall/ddd-types" as ddd

bc Orders as ddd.CoreDomain  // ✅ Via alias
bc Orders as CoreDomain       // ❌ Must use alias
```

**Without alias:** Types are accessible directly by their qualified names

```dlang
import "larsbaunwall/ddd-types"

bc Orders as CoreDomain  // ✅ Direct access
bc Orders as std.strategic.CoreDomain  // ✅ Fully qualified
```

### 2. Package-Boundary Transitive Imports

**Package boundary = same `model.yaml` file** (determined by ownership/location):

- Files within the **same package** (sharing a `model.yaml`) CAN see each other's imports transitively
- This allows packages to organize internal structure and re-export via `index.dlang`
- Local project files (not in packages) remain non-transitive

**Example:**

```dlang
// Package: larsbaunwall/ddd-types/std/strategic.dlang
namespace std.strategic {
    Classification CoreDomain
    Classification SupportingDomain
}

// Package: larsbaunwall/ddd-types/index.dlang  
import "@std/strategic.dlang"  // Makes std.strategic.* available

// Consumer project:
import "larsbaunwall/ddd-types" as ddd
bc Orders as ddd.std.strategic.CoreDomain  // ✅ Works

// Local project files (NOT in a package):
// file-a.dlang: Team SalesTeam
// file-b.dlang: import "./file-a.dlang"
// file-c.dlang: import "./file-b.dlang"
// file-c CANNOT see SalesTeam (local transitive blocked)
```

### 3. Namespace Preservation

Imported namespaces preserve their structure:

- `namespace std.strategic { ... }` in a package remains `std.strategic.*` when imported
- With alias: `ddd.std.strategic.CoreDomain`
- Without alias: `std.strategic.CoreDomain`

## Rationale

### Why This Design?

1. **Explicitness:** Aliases prevent naming conflicts and make dependencies clear
2. **Standard Pattern:** Matches JavaScript (`export`), Python (`__init__.py`), Rust (`pub use`)
3. **Package Integrity:** Packages can organize internal structure without exposing implementation details
4. **Progressive Disclosure:** Simple case (no alias) is direct; complex case (alias) is explicit

### Compared to Alternatives

**Alternative A: Loose Transitive (All imports are transitive)**

- ❌ Makes local dependencies implicit and hard to track
- ❌ Breaks the explicit import philosophy

**Alternative B: Strict Non-Transitive (Current behavior)**

- ❌ Packages cannot re-export types
- ❌ Forces flattening of package structure
- ❌ Makes standard libraries unusable

**Alternative C: Package-Boundary Transitive (Chosen)**

- ✅ Packages can re-export naturally
- ✅ Local files remain explicit
- ✅ Standard library packages work as expected
- ✅ Matches industry patterns from JS/Python/Rust/Go

### Why Alias-Scoped Visibility?

**With alias required:** Prevents namespace pollution and makes the source of types obvious

```dlang
import "acme/types" as acme
import "vendor/similar" as vendor

bc Orders as acme.CoreDomain   // Clear where it comes from
bc Shipping as vendor.CoreDomain  // No ambiguity
```

**Without alias optional:** Convenience for trusted packages like stdlib

```dlang
import "std/ddd"
bc Orders as CoreDomain  // Convenient for well-known types
```

## Consequences

### Positive

- ✅ External packages (stdlib, ddd-types) work as expected
- ✅ Import aliases become functional and useful
- ✅ Namespace structure preserved for organization
- ✅ Explicit control over visibility (alias vs direct)
- ✅ Aligns with popular language patterns

### Negative

- ⚠️  **Breaking change:** Scope provider behavior changes
- ⚠️  Need to distinguish package boundaries (same `model.yaml`)
- ⚠️  More complex scope resolution logic
- ⚠️  Need comprehensive tests for transitive visibility rules

### Implementation Impact

**Must change:**

1. `DomainLangScopeProvider` - Add alias-prefixed name resolution
2. `DomainLangIndexManager` - Track import aliases alongside URIs
3. Add package boundary detection (same `model.yaml` check)
4. Update tests to reflect new transitive rules
5. Update documentation (`/site/guide/imports.md`)

**Backward compatibility:**

- Imports without aliases continue to work (direct access)
- Local file imports behavior unchanged (still non-transitive)
- Only affects package imports (enables new capability)

## Validation Plan

1. **Unit tests:** Alias-prefixed resolution, with/without alias
2. **Integration tests:** Package-boundary transitivity
3. **Regression tests:** Local file imports remain non-transitive
4. **Real-world test:** `larsbaunwall/ddd-types` package must work
5. **Documentation:** Examples in `/site/guide/imports.md`

## References

- PRS-010: Import System Redesign
- PRS-006: Standard Library Design
- [JavaScript ES6 Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Python `__init__.py` Pattern](https://docs.python.org/3/reference/import.html)
- [Rust `pub use` Re-exports](https://doc.rust-lang.org/book/ch07-04-bringing-paths-into-scope-with-the-use-keyword.html)

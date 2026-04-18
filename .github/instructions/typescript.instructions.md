---
description: 'TypeScript 5.x rules for DomainLang (Langium 4.x)'
applyTo: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts"
---

# TypeScript rules

> Stack and pre-commit gate are in `.github/copilot-instructions.md`.

## Standards

- TS 5.x **strict**, no exceptions. Pure ESM, `.js` extensions in imports.
- No `any` (use `unknown` + guards). Explicit return types on public APIs. Prefix unused params with `_`.
- Functional patterns except Langium services (which use classes for DI).
- Test files may use `any` for mocks. Generated code is never edited. Config files are exempt.

## LSP error handling

```typescript
async provideSomething(doc: LangiumDocument): Promise<Result | undefined> {
    try { return computeResult(); }
    catch (error) { console.error('Error in provideSomething:', error); return undefined; }
}
```

Safe defaults: arrays → `[]`, optionals → `undefined`, objects → minimal valid shape or `undefined`.

## VS Code extension

Use `OutputChannel` for diagnostics, never `console.log`. Catch language-server start failures and surface via `vscode.window.showErrorMessage`. Listen to `client.onDidChangeState` and warn the user when state becomes `Stopped` (3).

## Naming

| Element | Convention |
|---|---|
| Classes/Interfaces/Types | `PascalCase` |
| Variables/Functions | `camelCase` |
| Files/Directories | `kebab-case` |
| Constants | `UPPERCASE` |

## Type system

Prefer generated Langium type guards (`isDomain`, `isBoundedContext`) over `as` casts.

```typescript
interface ValidationResult { readonly isValid: boolean; readonly errors: string[]; }
type Status = 'pending' | 'success' | 'error';

// No enums — use const objects
const RelationshipType = { Partnership: 'Partnership', SharedKernel: 'SharedKernel' } as const;
type RelationshipType = typeof RelationshipType[keyof typeof RelationshipType];
```

## Type organization

All shared types live in `packages/language/src/services/types.ts`. Before adding an interface: search `types.ts`, consolidate when overlap is >80%, add JSDoc, re-export from services for backward compat.

## Imports

```typescript
import type { AstNode, LangiumDocument } from 'langium';
import { AstUtils } from 'langium';
import { parse } from './parser.js';
```

Separate type imports. Always `.js` extensions.

## Functions and APIs

JSDoc on every public export:

```typescript
/**
 * Parses a DomainLang document.
 * @param content - Raw source code
 * @returns Parsed AST
 * @throws {ParseError} On syntax errors
 */
export function parseDocument(content: string): Model { /* ... */ }
```

Arrow for simple ops (`domains.map(d => d.name)`), named for complex logic.

## Errors

```typescript
type Result<T, E = Error> = { success: true; value: T } | { success: false; error: E };

try { await processFile(path); }
catch (error) {
    console.error('Failed:', path, error);
    throw new ProcessingError(`Cannot process ${path}`, { cause: error });
}
```

ESLint 10 `preserve-caught-error` requires `{ cause: err }` on every `throw new Error(...)` inside `catch (err)`. Never silently swallow.

## Patterns

- **Immutability:** return new objects (`{ ...domain, description: 'new' }`).
- **Guard clauses:** early returns over deep nesting.
- **Optional chaining:** `document?.model?.contexts?.[0]?.name`. Use `??` not `||`.
- **Parallel async:** `await Promise.all(docs.map(process))` — never sequential `for` over independent ops.
- **Discriminated unions** for variant types; switch on `.kind`.
- **Composition over inheritance:** prefer interface intersections over deep class hierarchies.

## Anti-patterns

| Avoid | Prefer |
|---|---|
| `any` | `unknown` + guards |
| `as` assertions | type guards |
| enums | const objects |
| utility classes | functions |
| mutating params | new objects |
| magic numbers | named constants |
| silent catches | log or rethrow with `{ cause }` |
| deep nesting | guard clauses |
| implicit deps | DI |

## Decision matrix

| Scenario | Use |
|---|---|
| Data + behavior | Class (Langium service) |
| Data transformation | Function |
| Config/constants | Const object |
| Variant types | Discriminated union |
| Optional properties | `undefined` not `null` |
| Multiple async ops | `Promise.all` |

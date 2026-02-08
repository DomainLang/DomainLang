---
description: 'TypeScript coding standards for DomainLang DSL development with Langium 4.x'
applyTo: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts"
---

# TypeScript Development

> Target TypeScript 5.x with strict mode for Langium 4.x DSL development.

## Core Principles

- Respect existing architecture and Langium conventions
- **ALWAYS** use DI when possible for testability
- Readable, explicit solutions over clever shortcuts
- Extend abstractions before inventing new
- Maintainability and clarity first
- Avoid duplicating logic if it can be abstracted and reused 

## Scope

**Full rules apply:** Language services, CLI, core utilities  
**Relaxed for:** Test files (can use `any` for mocks), generated code (never edit), config files

## Standards

- TypeScript 5.x strict mode, no exceptions
- Pure ES modules with `.js` extensions in imports
- Functional patterns except Langium services
- Avoid `any`; prefer `unknown` with type guards
- Explicit return types on public functions

## Error Handling - LSP Features

**LSP provider methods SHOULD wrap operations in try-catch for graceful degradation:**

```typescript
// ✅ Recommended: Graceful degradation with logging
async provideSomething(doc: LangiumDocument): Promise<Result | undefined> {
    try {
        return computeResult();
    } catch (error) {
        console.error('Error in provideSomething:', error);
        return undefined; // Safe default - feature unavailable
    }
}
```

**Return safe defaults:**
- Arrays → `[]`
- Optional values → `undefined`
- Objects → minimal valid object or `undefined`

### VS Code Extension Requirements

**Use OutputChannel for debugging:**

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('DomainLang');
    
    try {
        client = await startLanguageClient(context);
        outputChannel.appendLine('Language server started');
    } catch (error) {
        outputChannel.appendLine(`Failed: ${error}`);
        vscode.window.showErrorMessage('DomainLang: Failed to start');
        throw error;
    }
}
```

**Detect server crashes:**

```typescript
client.onDidChangeState((event) => {
    if (event.newState === 3) { // State.Stopped
        vscode.window.showWarningMessage(
            'DomainLang server stopped. Reload window to restart.'
        );
    }
});
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes/Interfaces/Types | PascalCase | `DomainLangValidator` |
| Variables/Functions | camelCase | `parseDocument` |
| Files/Directories | kebab-case | `domain-lang-validator.ts` |
| Constants | UPPERCASE | `MAX_DEPTH` |

## Type System

### Use Type Guards

```typescript
// ✅ Generated Langium guards
import { isDomain, isBoundedContext } from '../generated/ast.js';
if (isDomain(element)) console.log(element.name);

// ❌ Type assertions
const domain = element as Domain; // Avoid
```

### Interfaces vs Types

```typescript
// ✅ Interface for object shapes
interface ValidationResult {
    readonly isValid: boolean;
    readonly errors: string[];
}

// ✅ Type for unions
type Status = 'pending' | 'success' | 'error';
```

### Avoid Enums - Use Const Objects

```typescript
// ✅ Const object with type
const RelationshipType = {
    Partnership: 'Partnership',
    SharedKernel: 'SharedKernel',
} as const;
type RelationshipType = typeof RelationshipType[keyof typeof RelationshipType];
```

## Type Organization

**All shared types go in `packages/language/src/services/types.ts`**

**Rules:**
- Search `types.ts` before creating new interfaces
- Consolidate similar types (avoid `PackageInfo`, `PackageMetadata`, `PackageSpec`)
- Re-export from services for backwards compatibility

**Before adding a type:**
1. Search `types.ts` for similar types
2. Consolidate if overlap >80%
3. Add JSDoc
4. Export from `types.ts`

## Imports

```typescript
// ✅ Separate type imports, use .js extensions
import type { AstNode, LangiumDocument } from 'langium';
import { AstUtils } from 'langium';
import { parse } from './parser.js';
```

## Functions

### Document Public APIs

```typescript
/**
 * Parses a DomainLang document.
 * @param content - Raw source code
 * @returns Parsed AST
 * @throws {ParseError} On syntax errors
 */
export function parseDocument(content: string): Model { }
```

### Arrow vs Named

```typescript
// ✅ Arrow for simple operations
const names = domains.map(d => d.name);

// ✅ Named for complex logic
function validateCircularReferences(domain: Domain): boolean { }
```

## Error Handling

### Typed Results

```typescript
type Result<T, E = Error> =
    | { success: true; value: T }
    | { success: false; error: E };

function parseModel(content: string): Result<Model, ParseError> {
    try {
        return { success: true, value: parse(content) };
    } catch (error) {
        return { success: false, error: new ParseError(error) };
    }
}
```

### Never Suppress

```typescript
// ✅ Log or rethrow
try {
    await processFile(path);
} catch (error) {
    console.error('Failed:', path, error);
    throw new ProcessingError(`Cannot process ${path}`, { cause: error });
}

// ❌ Silent catch
try { await processFile(path); } catch { } // Never do this
```

## Common Patterns

### Immutability

```typescript
// ✅ Return new object
const updated = { ...domain, description: 'New' };

// ❌ Mutation
domain.description = 'New'; // Avoid
```

### Guard Clauses

```typescript
// ✅ Early returns reduce nesting
function validate(domain: Domain | undefined): ValidationResult {
    if (!domain) return { isValid: false, errors: ['No domain'] };
    if (!domain.name) return { isValid: false, errors: ['Missing name'] };
    return { isValid: true, errors: [] };
}
```

### Optional Chaining

```typescript
const name = document?.model?.contexts?.[0]?.name;
const displayName = userName ?? 'Anonymous'; // ?? not ||
```

### Parallel Async

```typescript
// ✅ Parallel
const results = await Promise.all(docs.map(process));

// ❌ Sequential
for (const doc of docs) await process(doc); // Slow
```

### Discriminated Unions

```typescript
type Expression =
    | { kind: 'literal'; value: number }
    | { kind: 'binary'; left: Expression; op: string; right: Expression };

function evaluate(expr: Expression): number {
    switch (expr.kind) {
        case 'literal': return expr.value;
        case 'binary': return evaluateBinary(expr);
    }
}
```

### Composition Over Inheritance

```typescript
// ✅ Interfaces
interface Movable { move(): void; }
interface Nameable { name: string; }
const entity: Movable & Nameable = { name: 'Player', move: () => {} };

// ❌ Deep class hierarchies
class Animal {}
class Mammal extends Animal {}
class Dog extends Mammal {} // Avoid
```

## Anti-Patterns

| ❌ Avoid | ✅ Prefer |
|----------|----------|
| `any` | `unknown` with guards |
| `as` assertions | Type guards |
| Enums | Const objects |
| Utility classes | Functions |
| Mutating params | New objects |
| Magic numbers | Named constants |
| Silent catches | Log or rethrow |
| Deep nesting | Guard clauses |
| Implicit deps | DI |

## Validation

```bash
npm run build  # Type-check
npm test       # Run tests
npm run lint   # Check quality
```

## Decision Matrix

| Scenario | Use |
|----------|-----|
| Data + behavior | Class (Langium service) |
| Data transformation | Function |
| Config/constants | Const object |
| Variant types | Discriminated union |
| Optional properties | `undefined` not `null` |
| Multiple async ops | `Promise.all` |

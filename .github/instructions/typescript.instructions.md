---
description: 'TypeScript coding standards for DomainLang DSL development with Langium 4.x'
applyTo: "**/*.ts,**/*.tsx,**/*.mts,**/*.cts"
---

# TypeScript Development

> These instructions target TypeScript 5.x with strict mode enabled for Langium 4.x DSL development. Sources live in `dsl/domain-lang/packages/{language,cli,extension,demo}/src/`.

## Core Intent

- Respect existing architecture and Langium conventions
- Prefer readable, explicit solutions over clever shortcuts
- Extend current abstractions before inventing new ones
- Prioritize maintainability and clarity in all code

## General Guardrails

- Target TypeScript 5.x with strict mode; no exceptions
- Use pure ES modules; always use `.js` extensions in imports
- Rely on the project's build, lint, and test scripts
- Note design trade-offs when intent is not obvious

## Scope and Exemptions

**Full rules apply to:**
- Language services (validation, scoping, LSP features)
- CLI implementation
- Core utilities and helpers

**Relaxed rules for:**
- Test files — can use `any` for mocks, simpler patterns allowed
- Generated code — never edit, always regenerate
- Configuration files — pragmatic approach acceptable

## Coding Standards

- Use functional programming patterns except for Langium services
- Avoid `any`; prefer `unknown` with type narrowing
- Use type guards over type assertions
- Separate type imports using `import type`

## Error Handling & Resilience

### LSP Features - Defensive Coding

**Every LSP feature method MUST have error handling:**

```typescript
// ✅ Correct: Entry point wrapped in try-catch
export class MyLspProvider {
    async provideSomething(document: LangiumDocument): Promise<Result | undefined> {
        try {
            // Feature logic here
            return result;
        } catch (error) {
            console.error('Error in provideSomething:', error);
            return undefined; // Safe default
        }
    }
}

// ❌ Avoid: No error handling - will crash extension
export class MyLspProvider {
    async provideSomething(document: LangiumDocument): Promise<Result> {
        // Unprotected logic - any error crashes the server
        return riskyOperation();
    }
}
```

### Safe Defaults on Error

**Return type-appropriate safe defaults:**

```typescript
// Arrays → []
async collectSymbols(): Promise<Symbol[]> {
    try {
        return await expensiveComputation();
    } catch (error) {
        console.error('Error collecting symbols:', error);
        return []; // Empty array is safe
    }
}

// Optional values → undefined
getHoverContent(): Hover | undefined {
    try {
        return computeHover();
    } catch (error) {
        console.error('Error in hover:', error);
        return undefined; // No hover is fine
    }
}

// Objects → minimal valid object or undefined
getDiagnostics(): Diagnostic[] {
    try {
        return validate();
    } catch (error) {
        console.error('Error in diagnostics:', error);
        // Return minimal error diagnostic
        return [{
            severity: DiagnosticSeverity.Error,
            range: Range.create(0, 0, 0, 1),
            message: 'Internal validation error',
            source: 'domainlang'
        }];
    }
}
```

### Avoid Over-Engineering

**❌ Don't nest try-catch unnecessarily:**

```typescript
// ❌ Over-engineered: Nested try-catch
try {
    doSomething();
} catch (error) {
    console.error('Error:', error);
    try {
        fallback();
    } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError);
    }
}

// ✅ Trust framework error handling
try {
    doSomething();
} catch (error) {
    console.error('Error:', error);
    fallback(); // Let Langium handle fallback errors
}
```

### Error Messages - User vs Developer

**Silent degradation for transient errors:**

```typescript
// ✅ Don't show error messages to users unless actionable
getHoverContent(): Hover | undefined {
    try {
        return computeHover();
    } catch (error) {
        console.error('Hover error:', error);
        return undefined; // User sees no hover - that's fine
    }
}

// ❌ Don't show technical errors to users
getHoverContent(): Hover | undefined {
    try {
        return computeHover();
    } catch (error) {
        return {
            contents: 'Error: Unable to compute hover' // ❌ Not helpful to user
        };
    }
}
```

### VS Code Extension Error Handling

**Use OutputChannel for debugging:**

```typescript
// ✅ Proper OutputChannel usage
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    outputChannel = vscode.window.createOutputChannel('DomainLang');
    context.subscriptions.push(outputChannel);
    
    try {
        client = await startLanguageClient(context);
        outputChannel.appendLine('Language server started');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`Failed to start: ${message}`);
        vscode.window.showErrorMessage(
            'DomainLang: Failed to start. Check output for details.'
        );
        throw error; // Let VS Code know activation failed
    }
}

// ✅ Detect server crashes and offer recovery
client.onDidChangeState((event) => {
    if (event.newState === 3) { // State.Stopped
        outputChannel.appendLine('Server stopped unexpectedly');
        vscode.window.showWarningMessage(
            'DomainLang server stopped. Reload window to restart.',
            'Reload Window'
        ).then((selection) => {
            if (selection === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }
});
```

### Cognitive Complexity Limits

**Keep methods under 15 complexity - extract helpers:**

```typescript
// ❌ Too complex (17 complexity)
function complexMethod() {
    if (a) {
        if (b) {
            if (c) {
                // Many nested conditions
            }
        }
    }
    // More conditions...
}

// ✅ Refactored with helpers
function complexMethod() {
    if (shouldProcessA()) {
        handleA();
    }
    if (shouldProcessB()) {
        handleB();
    }
}

function shouldProcessA(): boolean {
    return a && b && c;
}

function handleA(): void {
    // Extracted logic
}
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes/Interfaces/Types | PascalCase | `DomainLangValidator` |
| Variables/Functions/Methods | camelCase | `parseDocument` |
| Files/Directories | kebab-case | `domain-lang-validator.ts` |
| Constants | UPPERCASE | `MAX_DEPTH` |

## Type System

### Use Type Guards Over Assertions

```typescript
// ✅ Correct: Use generated Langium guards
import { isDomain, isBoundedContext } from '../generated/ast.js';

if (isDomain(element)) {
    console.log(element.name);  // Properly typed
}

// ❌ Avoid: Type assertions
const domain = element as Domain;
```

### Prefer Interfaces for Objects

```typescript
// ✅ Interface for object shapes
interface ValidationResult {
    readonly isValid: boolean;
    readonly errors: string[];
}

// ✅ Type for unions/intersections
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

// ❌ Avoid enums
enum RelationshipType { Partnership, SharedKernel }
```

### Use `readonly` for Immutability

```typescript
interface Domain {
    readonly name: string;
    readonly contexts: readonly BoundedContext[];
}
```

## Import Patterns

```typescript
// ✅ Separate type imports
import type { AstNode, LangiumDocument } from 'langium';
import { AstUtils } from 'langium';

// ✅ Always use .js extensions (ESM compatibility)
import { parse } from './parser.js';
```

## Type Organization

### Centralize Shared Types

**Shared types MUST be defined in a single canonical location** to prevent type proliferation and maintain consistency.

```typescript
// ✅ Correct: Import from centralized types module
import type { PackageMetadata, ModelManifest, LockFile } from '../services/types.js';

// ❌ Avoid: Defining types inline in service files
interface PackageMetadata { /* duplicate definition */ }
```

**Location:** `packages/language/src/services/types.ts`

**Rules:**
- All types shared across multiple services → `types.ts`
- Service-specific internal types → can stay in service file (but consider centralizing)
- Re-export from service files for backwards API compatibility

### Before Adding a New Type

1. **Search first:** Check if a similar type already exists in `types.ts`
2. **Consolidate:** If similar, extend or merge with existing type
3. **Document:** Add JSDoc explaining the type's purpose
4. **Export:** Export from `types.ts` and re-export from relevant services

### Type vs Interface Decisions

```typescript
// ✅ Use interface for user-facing data shapes (extensible)
interface ModelManifest {
    readonly name: string;
    readonly version: string;
    readonly dependencies?: readonly DependencySpec[];
}

// ✅ Use interface for internal mutable state
interface PackageMetadata {
    name: string;           // Mutable during resolution
    resolvedVersion: string;
}

// ✅ Use type for unions, computed types, or discriminated unions
type RefType = 'branch' | 'tag' | 'commit' | 'semver' | 'range' | 'latest';
```

### Avoid Type Proliferation

Signs of problematic type proliferation:
- Same concept defined with different names (`PackageInfo`, `PackageMetadata`, `PackageSpec`)
- Types with 80%+ field overlap
- Import cycles caused by scattered type definitions

**When you find scattered types:**
1. Identify the canonical location (`types.ts`)
2. Consolidate into single definition
3. Update all imports
4. Add re-exports for backwards compatibility

## Functions

### Arrow Functions for Simple Operations

```typescript
const names = domains.map(d => d.name);
```

### Named Functions for Complex Logic

```typescript
function validateCircularReferences(domain: Domain, visited: Set<Domain>): boolean {
    if (visited.has(domain)) return false;
    visited.add(domain);
    // ... complex logic
    return true;
}
```

### Document Public APIs with JSDoc

```typescript
/**
 * Parses a DomainLang document.
 *
 * @param content - Raw source code
 * @returns Parsed AST
 * @throws {ParseError} On syntax errors
 */
export function parseDocument(content: string): Model { }
```

## Error Handling

### Use Typed Results

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

### Never Suppress Errors

```typescript
// ✅ Log or rethrow
try {
    await processFile(path);
} catch (error) {
    console.error('Failed:', path, error);
    throw new ProcessingError(`Cannot process ${path}`, { cause: error });
}

// ❌ Never silent catch
try { await processFile(path); } catch { }
```

## Common Patterns

### Immutability

```typescript
// ✅ Return new object
function updateDomain(domain: Domain, description: string): Domain {
    return { ...domain, description };
}

// ❌ Don't mutate parameters
function updateDomain(domain: Domain, description: string): void {
    domain.description = description;  // Mutation!
}
```

### Early Returns and Guard Clauses

```typescript
// ✅ Guard clauses reduce nesting
function validateDomain(domain: Domain | undefined): ValidationResult {
    if (!domain) return { isValid: false, errors: ['No domain'] };
    if (!domain.name) return { isValid: false, errors: ['Missing name'] };
    
    // Main logic at base indentation
    return { isValid: true, errors: [] };
}

// ❌ Avoid deep nesting
function validateDomain(domain: Domain | undefined): ValidationResult {
    if (domain) {
        if (domain.name) {
            return { isValid: true, errors: [] };
        }
    }
    return { isValid: false, errors: ['Invalid'] };
}
```

### Optional Chaining and Nullish Coalescing

```typescript
const name = document?.model?.contexts?.[0]?.name;
const displayName = userName ?? 'Anonymous';  // ?? not ||
```

### Parallel Async

```typescript
// ✅ Parallel with Promise.all
const results = await Promise.all(docs.map(d => process(d)));

// ❌ Sequential (slow)
for (const doc of docs) { await process(doc); }
```

### Discriminated Unions

```typescript
type Expression =
    | { kind: 'literal'; value: string | number }
    | { kind: 'binary'; left: Expression; op: string; right: Expression }
    | { kind: 'reference'; name: string };

function evaluate(expr: Expression): number {
    switch (expr.kind) {
        case 'literal': return typeof expr.value === 'number' ? expr.value : 0;
        case 'binary': return evaluateBinary(expr.left, expr.op, expr.right);
        case 'reference': return lookupVariable(expr.name);
    }
}
```

### Composition Over Inheritance

```typescript
// ✅ Composition with interfaces
interface Movable { move(): void; }
interface Nameable { name: string; }

const entity: Movable & Nameable = {
    name: 'Player',
    move: () => console.log('Moving')
};

// ❌ Avoid deep class hierarchies
class Animal {}
class Mammal extends Animal {}
class Dog extends Mammal {}  // Too deep
```

### Batch Processing

```typescript
async function processLargeDataset(items: Item[]): Promise<void> {
    const BATCH_SIZE = 100;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processBatch));
    }
}
```

## Anti-Patterns

| ❌ Avoid | ✅ Prefer | Why |
|----------|----------|-----|
| `any` type | `unknown` with type narrowing | Preserves type safety |
| Type assertions (`as`) | Type guards (`isDomain()`) | Runtime validation |
| Enums | Const objects | Better tree-shaking, type inference |
| Classes for utilities | Simple functions | Easier to test, compose |
| Mutating parameters | Return new objects | Predictable state |
| Magic numbers | Named constants | Self-documenting code |
| Silent error catches | Log or rethrow | Never hide failures |
| Deep nesting | Early returns, guard clauses | Readability |
| Implicit dependencies | Dependency injection | Testability |

## Validation

Before committing TypeScript changes, verify:

```bash
# Build and type-check
npm run build

# Run tests
npm test

# Check for lint errors (if available)
npm run lint
```

## Decision Framework

Use this to decide between patterns:

| Scenario | Use |
|----------|-----|
| Data structure with behavior | Class (Langium service pattern) |
| Pure data transformation | Function |
| Configuration/constants | Const object with `as const` |
| State machine / variant types | Discriminated union |
| Optional properties | `undefined`, not `null` |
| Complex async operations | `async/await` with try/catch |
| Multiple async operations | `Promise.all` for parallelism |

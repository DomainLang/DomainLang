---
description: 'Testing guidelines for DomainLang using Vitest and Langium test utilities'
applyTo: "**/*.test.ts"
---

# Testing Guidelines

> Write tests that verify behavior, not implementation. Every test must follow AAA pattern.

## Critical Rules

1. **MANDATORY AAA Pattern** - Every test needs `// Arrange`, `// Act`, `// Assert` comments
1. **Test BEHAVIOR, not IMPLEMENTATION** - Would your test fail if the feature broke for users?
1. **Never mock LSP provider methods** - Test through public LSP API with real documents
1. **Use `setupTestSuite()`** - Handles cleanup automatically
1. **One focus per test** - Test one behavior in isolation
1. **Never change code to make testing easier** - Tests adapt to code, not vice versa
1. **Tests should be mutually exclusive** - Tests should cover distinct scenarios without overlap
1. **Coverage Thresholds are BLOCKING** - Run `npm run test:coverage` before commit:
   - If coverage is below configured thresholds in `vitest.config.ts`, **STOP**
   - Either add tests to meet the threshold OR ask user for approval to lower it
   - Never automatically lower thresholds without explicit user approval

## Required Test Template

```typescript
import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();  // REQUIRED
});

test('describes expected BEHAVIOR not implementation', async () => {
    // Arrange
    const input = s`Domain Sales { vision: "Handle sales" }`;

    // Act
    const document = await testServices.parse(input);

    // Assert
    expectValidDocument(document);
    expect(getFirstDomain(document).name).toBe('Sales');
});
```

## Avoiding Tautological Tests

**TAUTOLOGICAL = Testing what code DOES, not what it SHOULD DO**

### ❌ Anti-Patterns (Never Write These)

```typescript
// ❌ Testing regex matches strings (obviously true)
test('pattern matches imports', () => {
    expect(/import/.test('import "')).toBe(true);  // Meaningless
});

// ❌ Calling internal methods with mocks
test('provides completions', async () => {
    const items = (provider as any).buildItems(mockData);
    expect(items).toContain('./');  // Testing implementation
});

// ❌ Testing method exists/returns non-null
test('returns value', () => {
    expect(manager.getValue()).toBeDefined();  // No behavior verified
});
```

**Why these fail:**
- Pass even if the feature is completely broken
- Test code structure, not user experience  
- Break when refactoring (tight coupling)
- Provide false confidence

### ✅ Correct Patterns (Write These)

```typescript
// ✅ Test through PUBLIC API with REAL documents
test('provides completions inside import string', async () => {
    // Arrange - Real document, real scenario
    const document = await testServices.parse('import ""');
    const provider = testServices.services.DomainLang.lsp.CompletionProvider;
    
    // Act - Call public API as LSP would
    const params = {
        textDocument: { uri: document.uri.toString() },
        position: { line: 0, character: 8 }
    };
    const result = await provider.getCompletion(document, params);
    
    // Assert - Verify user sees expected options
    expect(result?.items?.map(i => i.label)).toContain('./');
});

// ✅ Test behavior boundaries (what should NOT happen)
test('does NOT provide import completions in vision string', async () => {
    // Arrange
    const document = await testServices.parse('Domain Sales { vision: "test" }');
    const provider = testServices.services.DomainLang.lsp.CompletionProvider;
    
    // Act
    const params = { 
        textDocument: { uri: document.uri.toString() },
        position: { line: 0, character: 28 } // inside "test"
    };
    const result = await provider.getCompletion(document, params);
    
    // Assert - Must not crash, import completions shouldn't appear
    expect(result).toBeDefined();
});
```

**The Key Question:** "Would this test fail if the feature broke for users?"

## Test Utilities

| Helper | Purpose |
|--------|---------|
| `setupTestSuite()` | Auto-cleanup, use in `beforeAll()` |
| `expectValidDocument(doc)` | No parse/validation errors |
| `expectValidationErrors(doc, [...])` | Specific errors present |
| `expectValidationWarnings(doc, [...])` | Specific warnings present |
| `getFirstDomain(doc)` | Extract first Domain |
| `getFirstBoundedContext(doc)` | Extract first BC |
| `s\`...\`` | Readable multi-line strings |

## LSP Testing (Critical: Test Real Behavior)

**NEVER mock LSP provider internals** - Test through the actual LSP API with real documents.

### ✅ Correct: Test Through Public LSP API

```typescript
test('provides alias-prefixed completions for imported types', async () => {
    // Arrange - Create REAL multi-file scenario
    const sharedDoc = await testServices.parse(s`Domain CoreDomain { vision: "v" }`);
    const mainDoc = await testServices.parse(
        s`import "${sharedDoc.uri.toString()}" as lib\nbc Context for lib.<cursor>`,
        { documentUri: 'file:///main.dlang' }
    );
    
    // Act - Call provider's public API exactly as LSP would
    const provider = testServices.services.DomainLang.lsp.CompletionProvider!;
    const result = await provider.getCompletion(mainDoc, {
        textDocument: { uri: mainDoc.uri.toString() },
        position: { line: 1, character: 20 }
    });
    
    // Assert - Verify USER-VISIBLE behavior
    const labels = result?.items?.map(i => i.label) ?? [];
    expect(labels).toContain('lib.CoreDomain');
});
```

### ❌ WRONG: Mocking Provider Internals

```typescript
// ❌ NEVER DO THIS - Tests implementation, not behavior
test('builds completion items', () => {
    const provider = new CompletionProvider();
    const items = (provider as any).buildAliasedItems(mockScope);
    expect(items).toContain('lib.Domain');
});
```

**Why?** The mocked test passes even if:
- The provider doesn't call `buildAliasedItems` anymore
- The scope never includes aliased items
- Integration between scope provider and completion is broken

### Hover Provider Testing

```typescript
test('hover shows import alias prefix for imported types', async () => {
    // Arrange - Real document with real references
    const document = await testServices.parse(s`
        Domain Sales { vision: "v" }
        bc OrderContext for Sales {}
    `);
    const provider = testServices.services.DomainLang.lsp.HoverProvider!;
    
    // Act - Position cursor on the BC name
    const hover = await provider.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position: { line: 1, character: 3 } // 'O' in OrderContext
    });
    
    // Assert - Verify what USER sees in tooltip
    expect(hover).toBeDefined();
    expect(hover!.contents.value).toContain('bounded context');
    expect(hover!.contents.value).toContain('OrderContext');
    // Verify go-to-definition links work
    expect(hover!.contents.value).toMatch(/\[Sales\]\([^)]*#L\d+,\d+\)/);
});
```

### Multi-File Testing for Import/Scoping

```typescript
test('alias-prefixed references resolve across files', async () => {
    // Arrange - Create imported file first
    const sharedDoc = await testServices.parse(
        s`Team CoreTeam`,
        { documentUri: 'file:///shared.dlang' }
    );
    
    // Create main file that imports with alias
    const mainDoc = await testServices.parse(
        s`import "./shared.dlang" as lib\nbc Context by lib.CoreTeam {}`,
        { documentUri: 'file:///main.dlang' }
    );
    
    // Act - Get the bounded context
    const bc = getFirstBoundedContext(mainDoc);
    
    // Assert - Reference resolved through alias
    expect(bc.team?.ref?.name).toBe('CoreTeam');
});
```

## Common Test Patterns

### Parsing Tests

```typescript
test('parses domain with vision', async () => {
    // Arrange
    const input = s`Domain Sales { vision: "Handle sales" }`;

    // Act
    const document = await testServices.parse(input);
    expectValidDocument(document);
    
    // Assert - Direct AST access
    const domain = getFirstDomain(document);
    expect(domain.name).toBe('Sales');
    expect(domain.vision).toBe('Handle sales');
});
```

### Validation Tests

```typescript
test('warns when domain lacks vision', async () => {
    // Arrange
    const input = s`Domain Sales {}`;

    // Act
    const document = await testServices.parse(input);

    // Assert
    expectValidationWarnings(document, [
        "Domain 'Sales' has no domain vision"
    ]);
});
```

### Linking Tests

```typescript
test('resolves domain reference', async () => {
    // Arrange
    const document = await testServices.parse(s`
        Domain Sales {}
        bc Orders for Sales {}
    `);
    expectValidDocument(document);
    
    // Act
    const bc = getFirstBoundedContext(document);
    
    // Assert
    expect(bc.domain?.ref?.name).toBe('Sales');
});
```

### Forward Reference Tests

```typescript
test('resolves forward reference (BC before domain)', async () => {
    // Arrange - BC references Domain that is defined AFTER it
    const document = await testServices.parse(s`
        bc OrderContext for Sales {}
        Domain Sales { vision: "Forward ref test" }
    `);
    expectValidDocument(document);
    
    // Act
    const bc = getFirstBoundedContext(document);
    
    // Assert - Forward reference resolved
    expect(bc.domain?.ref?.name).toBe('Sales');
});
```

### MultiReference Tests

```typescript
test('resolves multi-reference to multiple same-named BCs', async () => {
    // Arrange
    const document = await testServices.parse(s`
        Domain Sales { vision: "v" }
        Domain Billing { vision: "v" }
        bc Orders for Sales {}
        bc Orders for Billing {}
        ContextMap AllOrders {
            contains Orders
        }
    `);
    expectValidDocument(document);
    
    // Act
    const contextMap = getFirstContextMap(document);
    
    // Assert - Both Orders resolved
    expect(contextMap.boundedContexts[0].items).toHaveLength(2);
});
```

### Service Tests (with temp directories)

```typescript
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'domainlang-test-'));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

test('reads manifest from workspace', async () => {
    // Arrange - Create real files in temp dir
    await writeFile(join(tempDir, 'model.yaml'), 'name: test');
    
    // Act
    const manifest = await manager.loadManifest(tempDir);
    
    // Assert
    expect(manifest.name).toBe('test');
});
```

### Data-Driven Tests

```typescript
test.each([
    { input: 'Domain {}', error: 'expecting ID' },
    { input: 'bc Orders for {}', error: 'expecting QualifiedName' },
])('rejects invalid: $input', async ({ input, error }) => {
    const document = await testServices.parse(input);
    expect(getDocumentErrors(document).some(e => e.includes(error))).toBe(true);
});
```

## CLI Testing (Critical: Prevents OOM)

**NEVER** use `vi.spyOn()` on `defaultFileSystem` singleton - causes OOM in test workers.

### ✅ Correct: Dependency Injection

```typescript
// Function accepts fs parameter
export async function calculateSize(
    dir: string,
    fs: FileSystemService = defaultFileSystem
): Promise<number> { }

// Test passes mock
test('calculates size', async () => {
    const mockFs = createMockFs({
        stat: vi.fn(async () => ({ size: 1024 }))
    });
    
    const size = await calculateSize('/dir', mockFs);
    expect(size).toBe(1024);
});
```

### ✅ Correct: Module Mocking

```typescript
vi.mock('../../src/services/filesystem.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        defaultFileSystem: {
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => []),
        },
    };
});

import { defaultFileSystem } from '../../src/services/filesystem.js';

beforeEach(() => {
    vi.mocked(defaultFileSystem.existsSync).mockReturnValue(true);
});
```

### Process.exit Mocking

**MUST mock to prevent killing test worker:**

```typescript
let exitSpy: MockInstance;

beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
    });
});

test('exits with code 0', async () => {
    try {
        await runCommand(context);
    } catch { /* expected */ }
    
    expect(exitSpy).toHaveBeenCalledWith(0);
});
```

## Test Fixtures

**Common fixtures from `test-helpers.ts`:**

| Fixture | Content |
|---------|--------|
| `basicDomain` | Single domain with vision |
| `domainHierarchy` | Parent/child domain relationship |
| `fullBoundedContext` | BC with all fields populated |
| `contextMapWithRelationships` | Context map with OHS/CF relationships |
| `complexExample` | Multi-domain, multi-BC, full model |

## Debugging Helpers

```typescript
import { getDocumentErrors, getDiagnosticsBySeverity } from '../test-helpers.js';

// See parse/link/validation errors
const errors = getDocumentErrors(document);
console.log('Errors:', errors);

// Filter diagnostics
const warnings = getDiagnosticsBySeverity(document, DiagnosticSeverity.Warning);
```

## Manual Setup (for advanced cases)

```typescript
import { parseHelper, clearDocuments } from 'langium/test';

// When you need lower-level control
const parse = parseHelper(services);
const doc = await parse('Domain Sales {}');

// Clean up manually
clearDocuments(services);
```

## Skipping Tests

```typescript
// Never skip silently - always document WHY and WHEN to re-enable
test.skip('validates cyclic domains', async () => {
    // TODO: Blocked by PRS-008 acceptance criterion 3
    // Re-enable when cyclic validation is implemented
});

test.todo('should detect self-referencing domains');
```

## Performance Testing

```typescript
test('handles large models within timeout', async () => {
    // Arrange - Generate large model
    const domains = Array.from({ length: 50 }, (_, i) =>
        `Domain D${i} { vision: "v" }`
    ).join('\n');
    const bcs = Array.from({ length: 100 }, (_, i) =>
        `bc BC${i} for D${i % 50} {}`
    ).join('\n');
    
    // Act
    const start = performance.now();
    const document = await testServices.parse(s`${domains}\n${bcs}`);
    const elapsed = performance.now() - start;
    
    // Assert
    expectValidDocument(document);
    expect(elapsed).toBeLessThan(5000); // 5s timeout
});
```

## Test Consolidation with test.each

When multiple tests verify variants of the same behavior, consolidate with `test.each`:

### ❌ Redundant Tests

```typescript
test('parses Domain keyword', async () => { /* ... */ });
test('parses bc keyword', async () => { /* ... */ });
test('parses Team keyword', async () => { /* ... */ });
test('parses Classification keyword', async () => { /* ... */ });
```

### ✅ Consolidated with test.each

```typescript
test.each([
    ['Domain', 'Domain Sales { vision: "v" }'],
    ['bc', 'bc Orders {}'],
    ['Team', 'Team DevTeam'],
    ['Classification', 'Classification Core'],
])('parses %s keyword', async (keyword, input) => {
    // Arrange & Act
    const document = await testServices.parse(input);
    
    // Assert
    expectValidDocument(document);
});
```

### When to Consolidate

- **DO consolidate:** Same assertion pattern, different input values
- **DON'T consolidate:** Different behaviors that happen to look similar
- **Rule:** If one variant failing requires different fix than another, keep separate

## Best Practices

### DO

- Test through public APIs (LSP providers, SDK methods)
- Use `setupTestSuite()` for cleanup
- Test edge cases (empty, Unicode, very long)
- Verify error messages contain useful info
- Name tests with `should X when Y`
- Write tests BEFORE fixing bugs (regression prevention)
- Use `s` template tag for readable multi-line DSL code
- Abstract repeated patterns into helper functions
- Test multi-file scenarios for import/scoping features
- Verify USER-VISIBLE output (hover content, completion labels)
- Use test.each to reduce redundant tests

### DON'T

- Don't test internal implementation details
- Don't share mutable state between tests
- Don't use `vi.spyOn()` on `defaultFileSystem` singleton (OOM)
- Don't call `process.exit()` without mocking it first
- Don't skip tests without documenting why
- Don't use `any` casts to access private members
- Don't write tests that pass when the feature is broken
- Don't mock LSP provider methods - test through real API
- Don't test with mock scopes when real scoping can be used

## Documentation Checklist

**New grammar features/keywords require site updates:**

- [ ] `/site/reference/language.md` - Explain feature, syntax, semantics
- [ ] `/site/reference/quick-reference.md` - Add concise example
- [ ] `examples/*.dlang` - Real-world usage demonstration
- [ ] JSDoc on grammar rules and AST interfaces

**Skip for:** Bug fixes, internal refactoring, performance optimizations (no syntax changes)

## Quality Checklist

- [ ] Happy path + edge cases + error scenarios
- [ ] Tests follow `should X when Y` naming
- [ ] No shared mutable state
- [ ] Independent tests (any order)
- [ ] Async properly awaited
- [ ] AAA comments present

## Coverage Goals

- **80%+** overall
- **100%** validation rules
- **100%** grammar parsing

## Commands

```bash
npm test                              # All tests
npm run test:coverage                 # With coverage
npx vitest run path/to/file.test.ts  # Specific file
npx vitest --watch                    # Watch mode
```

## Decision Matrix

| Scenario | Test Type | Key Helpers |
|----------|-----------|-------------|
| Grammar parsing | Parsing | `parse()`, `expectValidDocument()` |
| Cross-references | Linking | Check `ref` property defined |
| Validation rules | Validation | `expectValidationErrors()` |
| Multiple refs | MultiReference | Check `items.length` |
| File system | Service | `beforeEach`/`afterEach` temp dirs |
| CLI commands | CLI | DI or module mocking, mock `process.exit` |

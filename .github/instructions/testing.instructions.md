---
description: 'Testing guidelines for DomainLang using Vitest and Langium test utilities'
applyTo: "**/*.test.ts"
---

# Testing Guidelines

> Guidelines for writing tests in DomainLang using Vitest and Langium test utilities.

## 🔴 CRITICAL: Test Structure Requirements

**EVERY TEST MUST follow the Arrange-Act-Assert (AAA) pattern with explicit comments:**

```typescript
test('description of behavior', async () => {
    // Arrange - Set up test data and state
    const input = `...`;
    
    // Act - Execute the code under test
    const result = await testServices.parse(input);
    
    // Assert - Verify expected behavior
    expect(result).toBeDefined();
});
```

**NO EXCEPTIONS.** If you write a test without clear AAA structure, it WILL be rejected.

## Core Intent

- Every new feature or bug fix requires tests
- Tests document expected behavior; write readable tests
- Use provided test helpers; they handle cleanup and validation
- Test one thing per test; keep tests focused

## Essential Rules

- **🔴 MANDATORY: AAA Pattern** - Every test must have `// Arrange`, `// Act`, `// Assert` comments
- **🔴 CRITICAL: Test BEHAVIOR, not IMPLEMENTATION** - See Anti-Patterns section below
- **Always add tests** for new behavior (happy path + edge cases + errors)
- **Use `setupTestSuite()`** from `test-helpers.ts` for automatic cleanup
- **Use validation helpers** instead of manual error checks
- **One assertion focus** per test
- **Never change original code** just to make it easier to test
- **Document the feature** - If adding feature tests, also update docs (see Documentation Checklist below)

## 🚨 CRITICAL: Avoiding Tautological Tests

**TAUTOLOGICAL TESTS = Testing what the code DOES instead of what it SHOULD DO**

### ❌ Anti-Pattern Examples (DO NOT WRITE TESTS LIKE THIS):

```typescript
// ❌ BAD: Testing a regex pattern matches strings (tautological)
test('import string pattern matches import statements', () => {
    const pattern = /\b(import|Import)\s+"([^"]*)$/;
    expect(pattern.test('import "')).toBe(true);  // Obviously true
    expect(pattern.test('import "@d')).toBe(true);  // Just testing the regex
});

// ❌ BAD: Calling internal methods with mock data
test('provides completions', async () => {
    const provider = testServices.services.CompletionProvider as any;
    const items = provider.buildAllStarterItems(undefined);  // Internal method
    expect(items).toContain('./');  // Of course it does - that's what the code does
});

// ❌ BAD: Testing implementation details with fake contexts
test('import completions include local paths', async () => {
    const context = { /* fake context */ };
    await provider.addImportCompletions(context, acceptor, node);  // Internal API
    expect(completions).toContain('./');  // Testing internal behavior
});

// ❌ BAD: Testing method exists or returns non-null
test('getCachedManifest returns value', () => {
    const result = workspaceManager.getCachedManifest();
    expect(result).toBeDefined();  // Meaningless - doesn't verify behavior
});
```

**Why these are BAD:**
- They test "this code does X" not "the feature behaves as intended"
- They pass even if the feature is completely broken for users
- They're tightly coupled to implementation (break when refactoring)
- They provide false confidence

### ✅ Correct Pattern Examples (WRITE TESTS LIKE THIS):

```typescript
// ✅ GOOD: Test actual user-facing behavior through public API
test('provides completions inside empty import string', async () => {
    // Arrange - Real document, real scenario
    const document = await testServices.parse('import ""');
    const provider = testServices.services.DomainLang.lsp.CompletionProvider;
    
    // Act - Call public API as LSP would
    const params = {
        textDocument: { uri: document.uri.toString() },
        position: { line: 0, character: 8 } // cursor inside quotes
    };
    const result = await provider.getCompletion(document, params);
    
    // Assert - Verify user-visible behavior
    expect(result).toBeDefined();
    if (result?.items) {
        const labels = result.items.map(item => item.label);
        expect(labels).toContain('./');  // User should see this option
        expect(labels).toContain('../');
    }
});

// ✅ GOOD: Test behavior boundaries (what should NOT happen)
test('does NOT provide import completions in vision string', async () => {
    // Arrange - Real document with vision property
    const document = await testServices.parse('Domain Sales { vision: "test" }');
    const provider = testServices.services.DomainLang.lsp.CompletionProvider;
    
    // Act - Try to get completions inside vision string
    const params = {
        textDocument: { uri: document.uri.toString() },
        position: { line: 0, character: 28 } // inside "test"
    };
    const result = await provider.getCompletion(document, params);
    
    // Assert - Should not crash, and import completions shouldn't appear
    expect(result).toBeDefined();  // Must not crash
    // Import-specific behavior should not trigger here
});

// ✅ GOOD: Test filtering behavior with realistic data
test('filters dependencies by input prefix', async () => {
    // Arrange - Realistic manifest
    const provider = testServices.services.CompletionProvider as any;
    const mockManifest = {
        dependencies: {
            'larsbaunwall/ddd-types': { ref: 'main' },
            'larsbaunwall/events': { ref: 'v1.0.0' },
            'other/package': { ref: 'latest' }
        }
    };
    
    // Act - Filter with partial input (as user would type)
    const items = provider.buildFilteredItems('lars', mockManifest);
    const labels = items.map((item: any) => item.label);
    
    // Assert - Verify correct filtering behavior
    expect(labels).toContain('larsbaunwall/ddd-types');
    expect(labels).toContain('larsbaunwall/events');
    expect(labels).not.toContain('other/package');  // Should be filtered out
});
```

**Why these are GOOD:**
- They test through the PUBLIC API (how users/LSP interact)
- They use REAL documents, not mock contexts
- They verify USER EXPERIENCE, not code structure
- They test WHAT SHOULD HAPPEN, not what the code does
- They would fail if the feature broke for users

### 🎯 The Key Question: "Would this test fail if the feature broke?"

**Before writing ANY test, ask:**
1. If I completely broke this feature, would this test fail?
2. Am I testing what the USER sees or what the CODE does?
3. Am I testing through PUBLIC APIs or INTERNAL methods?
4. Would this test still pass if I refactored the implementation?

**If you answer wrong to ANY of these, rewrite the test.**

### Test Naming: Describe BEHAVIOR, not Implementation

```typescript
// ❌ BAD: Describes what code does
test('buildAllStarterItems returns array with ./ and ../')
test('getManifest calls loadManifest')
test('regex matches import statements')

// ✅ GOOD: Describes expected behavior
test('provides local path completions in empty import string')
test('loads manifest when workspace initializes')
test('import completions work inside quoted strings')
```

## Test Setup Template

**USE THIS EXACT TEMPLATE for every test file:**

```typescript
import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();  // REQUIRED: Handles cleanup automatically
});

test('description of BEHAVIOR not implementation', async () => {
    // Arrange - REQUIRED COMMENT: Set up test data
    const input = s`
        Domain Sales {
            vision: "Handle sales operations"
        }
    `;

    // Act - REQUIRED COMMENT: Execute code under test
    const document = await testServices.parse(input);

    // Assert - REQUIRED COMMENT: Verify expected behavior
    expectValidDocument(document);
    const domain = getFirstDomain(document);
    expect(domain.name).toBe('Sales');
});
```

**MANDATORY RULES:**
1. Use `setupTestSuite()` in `beforeAll()` - no exceptions
2. Every test MUST have `// Arrange`, `// Act`, `// Assert` comments
3. Separate Arrange from Act with a blank line
4. Separate Act from Assert with a blank line
5. Test names describe BEHAVIOR, not implementation

## Key Utilities from `test-helpers.ts`

| Utility | Purpose |
|---------|---------|
| `setupTestSuite()` | Test setup with automatic cleanup |
| `expectValidDocument(doc)` | Assert no parse/validation errors |
| `expectValidationErrors(doc, [...])` | Assert specific errors present |
| `expectValidationWarnings(doc, [...])` | Assert specific warnings present |
| `getFirstDomain(doc)` | Extract first Domain from AST |
| `getFirstBoundedContext(doc)` | Extract first BC from AST |
| `s\`...\`` | Template helper for readable multi-line input |

## Testing Patterns

### Parsing Tests

**Template: Test grammar produces expected AST**

```typescript
test('parse domain with vision', async () => {
    // Arrange - Input with domain and vision
    const input = s`
        Domain Sales { vision: "Handle sales" }
    `;

    // Act - Parse the input
    const document = await testServices.parse(input);
    expectValidDocument(document);
    const domain = getFirstDomain(document);
    
    // Assert - Verify AST structure (direct property access)
    expect(domain.name).toBe('Sales');
    expect(domain.vision).toBe('Handle sales');  // Direct property!
});
```

### Validation Tests

**Template: Test validation rules catch invalid states**

```typescript
test('warns when domain lacks vision', async () => {
    // Arrange - Domain without vision
    const input = s`
        Domain Sales { description: "Sales operations" }
    `;

    // Act - Parse and validate
    const document = await testServices.parse(input);

    // Assert - Expect specific warning
    expectValidationWarnings(document, [
        "Domain 'Sales' has no domain vision"
    ]);
});

test('detects duplicate names', async () => {
    // Arrange - Two classifications with same name
    const input = s`
        Classification Core
        Classification Core
    `;

    // Act - Parse and validate
    const document = await testServices.parse(input);

    // Assert - Expect duplicate error
    expectValidationErrors(document, [
        "This element is already defined elsewhere"
    ]);
});
```

### Linking Tests

```typescript
test('resolve domain reference', async () => {
    // Arrange
    const document = await testServices.parse(s`
        Domain Sales {}
        BoundedContext Orders for Sales {}
    `);

    expectValidDocument(document);
    
    // Act
    const bc = getFirstBoundedContext(document);
    
    // Assert
    expect(bc.domain?.ref).toBeDefined();
    expect(bc.domain?.ref?.name).toBe('Sales');
});
```

### Forward Reference Tests

```typescript
test('handles forward references', async () => {
    // Arrange
    const document = await testServices.parse(s`
        BoundedContext Orders for Sales {}  // Sales not defined yet
        Domain Sales {}                      // Defined after reference
    `);

    expectValidDocument(document);
    
    // Act
    const bc = getFirstBoundedContext(document);
    
    // Assert
    expect(bc.domain?.ref?.name).toBe('Sales');
});
```

### MultiReference Tests

```typescript
test('ContextMap references multiple same-named BCs', async () => {
    // Arrange
    const document = await testServices.parse(s`
        Domain Sales {}
        Domain Billing {}
        bc Orders for Sales {}
        bc Orders for Billing {}
        
        ContextMap AllOrders { contains Orders }
    `);

    expectValidDocument(document);
    
    // Act
    const contextMap = document.parseResult.value.children
        .find(c => isContextMap(c)) as ContextMap;
    
    // Assert
    expect(contextMap.boundedContexts[0].items.length).toBe(2);
});
```

## Test Organization

```
test/
├── test-helpers.ts        # Always use this!
├── parsing/               # Grammar parsing tests
├── linking/               # Cross-reference tests
├── validating/            # Validation rule tests
├── scoping/               # Scope computation tests
├── services/              # Service layer tests
└── multireference/        # Multi-reference tests
```

## Service Tests (with File System)

For testing services that interact with the file system:

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('DependencyAnalyzer', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('builds tree from lock file', async () => {
        const lockFile = { version: '1', dependencies: {} };
        const tree = await analyzer.buildDependencyTree(lockFile, tempDir);
        expect(tree).toEqual([]);
    });
});
```

## 🔴 CLI Tests: Filesystem and Process Mocking

**CRITICAL:** CLI tests have specific patterns to avoid OOM errors and test worker crashes.

### Filesystem Mocking

**🚫 NEVER** use auto-mocking (`vi.mock('node:fs')`) or `vi.spyOn()` on the `defaultFileSystem` singleton in CLI tests. This causes OOM errors in the Vitest forks pool.

**✅ CORRECT: Use dependency injection** for function tests:

```typescript
// Functions accept optional fs parameter
export async function calculateDirectorySize(
    dirPath: string,
    fs: FileSystemService = defaultFileSystem,
): Promise<number> { ... }

// Tests pass mock filesystem
test('calculates size correctly', async () => {
    const mockFs = createMockFs({
        existsSync: vi.fn(() => true),
        readdir: vi.fn(async () => [createDirEntry('file.txt', false)]),
        stat: vi.fn(async () => ({ size: 1024, ... })),
    });

    const size = await calculateDirectorySize('/dir', mockFs);
    expect(size).toBe(1024);
});
```

**✅ CORRECT: Use `vi.mock()` module replacement** for component tests:

```typescript
// Mock the entire filesystem module, replacing defaultFileSystem
vi.mock('../../src/services/filesystem.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/services/filesystem.js')>();
    return {
        ...actual,
        defaultFileSystem: {
            existsSync: vi.fn(() => true),
            readdir: vi.fn(async () => []),
            stat: vi.fn(async () => ({ size: 0, isDirectory: () => false, isFile: () => true, mtime: new Date() })),
        },
    };
});

// Then import and configure mocks in tests
import { defaultFileSystem } from '../../src/services/filesystem.js';

beforeEach(() => {
    vi.mocked(defaultFileSystem.existsSync).mockReturnValue(true);
});
```

### Process.exit Mocking

CLI commands using `runDirect()` call `process.exit()`. **You MUST mock it** to prevent killing the test worker:

```typescript
let exitSpy: MockInstance;

beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
    });
});

test('exits with code 0 on success', async () => {
    try {
        await runSomeCommand(context);
    } catch { /* expected: process.exit throws */ }

    expect(exitSpy).toHaveBeenCalledWith(0);
});
```

### Test File Organization for CLI

Split CLI tests by concern to prevent OOM:

| File Pattern | Purpose |
|--------------|---------|
| `*-functions.test.ts` | Pure function tests using dependency injection |
| `*.test.tsx` | React component tests with module mocks |

**Example:** `cache-clear-functions.test.ts` tests core logic, `cache-clear.test.tsx` tests UI components.

## Using Test Fixtures

```typescript
import { TestFixtures } from '../test-helpers.js';

test('domain hierarchy', async () => {
    const document = await testServices.parse(TestFixtures.domainHierarchy());
    expectValidDocument(document);
});
```

Available: `basicDomain()`, `domainHierarchy()`, `fullBoundedContext()`, `contextMapWithRelationships()`, `complexExample()`

## Debugging

```typescript
import { getDocumentErrors, getDiagnosticsBySeverity } from '../test-helpers.js';

test('debug parse errors', async () => {
    const document = await testServices.parse(s`Domain { }`);
    
    const errors = getDocumentErrors(document);
    console.log('Errors:', errors);
    
    // Severity: 1=Error, 2=Warning, 3=Info
    const warnings = getDiagnosticsBySeverity(document, 2);
    console.log('Warnings:', warnings.map(w => w.message));
});
```

## Manual Setup (Special Cases)

For cases requiring manual service configuration:

```typescript
import { parseHelper, clearDocuments } from 'langium/test';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { EmptyFileSystem } from 'langium';

let services: ReturnType<typeof createDomainLangServices>;
let parse: ReturnType<typeof parseHelper<Model>>;

beforeAll(async () => {
    services = createDomainLangServices(EmptyFileSystem);
    const doParse = parseHelper<Model>(services.DomainLang);
    parse = (input: string) => doParse(input, { validation: true });
});

afterEach(() => {
    clearDocuments(services.shared, []);  // Required for manual setup!
});
```

## Skipping Tests with TODO

Document acceptance criteria for when to unskip:

```typescript
test.skip('MultiReference with qualified names', async () => {
    // TODO: Acceptance criteria to unskip:
    //  - ScopeProvider supports qualified name resolution
    //  - Workspace fixture provides namespace-aware symbols
});
```

## Data-Driven Tests

Use `test.each` for parameterized tests with multiple inputs:

```typescript
test.each([
    ['Domain', 'Domain Sales {}'],
    ['BoundedContext', 'Domain Sales {} bc Orders for Sales {}'],
    ['Team', 'Team Backend {}'],
])('should parse %s construct', async (name, input) => {
    const document = await testServices.parse(input);
    expectValidDocument(document);
});

// With expected outcomes
test.each([
    { input: 'Domain {}', error: 'expecting ID' },
    { input: 'bc Orders for {}', error: 'expecting QualifiedName' },
])('should reject invalid: $input', async ({ input, error }) => {
    const document = await testServices.parse(input);
    expect(getDocumentErrors(document).some(e => e.includes(error))).toBe(true);
});
```

## Performance Testing

```typescript
test('handles large number of elements', async () => {
    const domains = Array.from({ length: 50 }, (_, i) => 
        `Domain Domain${i} {}`
    ).join('\n');
    
    const bcs = Array.from({ length: 100 }, (_, i) => 
        `BoundedContext BC${i} for Domain${i % 50}`
    ).join('\n');
    
    const document = await testServices.parse(s`
        ${domains}
        ${bcs}
    `);

    expectValidDocument(document);
    expect(getAllBoundedContexts(document)).toHaveLength(100);
});
```

## Best Practices

### ✅ DO

- Use `setupTestSuite()` for automatic cleanup
- Use `s\`...\`` for readable multi-line input
- Use `expectValidDocument()` for basic validation
- Use type guards before accessing AST properties
- Test one thing per test
- Follow Arrange-Act-Assert pattern
- Document skipped tests with acceptance criteria
- Name tests descriptively: `test('should X when Y', ...)`

### ❌ DON'T

- Call `clearDocuments()` when using `setupTestSuite()`
- Test implementation details
- Skip edge cases and error scenarios
- Share mutable state between tests
- Use `DocumentBuilder.build()` explicitly
- Use vague test names like `test('test1', ...)`
- Write tests that always pass

## Documentation Checklist

**For new grammar features, keywords, or DSL constructs, update documentation alongside tests:**

- [ ] **language.md** — Add section explaining feature, syntax, and semantics
- [ ] **quick-reference.md** — Add concise example suitable for quick lookup
- [ ] **Examples** — Create `.dlang` example files demonstrating real-world usage
- [ ] **JSDoc** — Document validation rules and AST interfaces with JSDoc

**Examples of features requiring documentation:**
- New keywords or grammar rules (e.g., `metadata`, `Metadata`)
- New documentation blocks (e.g., `terminology`, `decisions`)
- New DSL constructs or top-level elements
- New validation rules or semantic constraints
- New cross-reference types

**Not requiring documentation updates:**
- Bug fixes that don't add new syntax
- Internal refactoring
- Performance optimizations

## Quality Checklist

Before finalizing tests, ensure:
- [ ] All happy path scenarios covered
- [ ] Edge cases tested (empty input, large input, special characters)
- [ ] Error scenarios validated with `expectValidationErrors()`
- [ ] Tests follow naming convention: `should X when Y`
- [ ] No shared mutable state between tests
- [ ] Tests are independent and can run in any order
- [ ] Async operations properly awaited

## Coverage Goals

- **80%+** overall code coverage
- **100%** for validation rules
- **100%** for grammar parsing

## Test Execution Strategy

1. **Write test** — Start with failing test (red)
2. **Implement** — Write minimal code to pass (green)
3. **Refactor** — Clean up while tests pass
4. **Validate** — Run full test suite before committing
5. **Coverage** — Check coverage for new code paths

## Validation

Before committing test changes:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx vitest run packages/language/test/parsing/domain.test.ts

# Run tests in watch mode during development
npx vitest --watch
```

## Decision Framework

| Scenario | Test Type | Helper |
|----------|-----------|--------|
| Grammar parsing | Parsing test | `testServices.parse()`, `expectValidDocument()` |
| Cross-references | Linking test | Check `ref` property is defined |
| Validation rules | Validation test | `expectValidationErrors()`, `expectValidationWarnings()` |
| Multiple same-named refs | MultiReference test | Check `items.length` |
| File system interactions | Service test | Use `beforeEach`/`afterEach` for temp dirs |

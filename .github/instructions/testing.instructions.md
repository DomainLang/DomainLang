---
description: 'Vitest testing rules for DomainLang (Langium 4.x)'
applyTo: "**/*.test.ts,**/*.test.tsx"
---

# Testing rules

> Pre-commit gate (`lint && build && test:coverage`) is in `.github/copilot-instructions.md`. Don't restate it.

## Prime directive: fewer, better tests

Write the **minimum** number of tests that exercise real behavior. Before adding a test, ask: *"If I deleted the implementation, would this test fail?"* If no — don't write it.

**Never write tests that:**
- Assert constants/enum values (`Pattern.OHS === 'OpenHostService'`)
- Re-read a property you just assigned (`domain.name === 'Sales'` after parsing `Domain Sales {}`)
- Enumerate every enum member separately — one positive + one negative is enough
- Parse the same input in two tests — merge assertions
- Test the same code path with trivially different inputs

## Hard rules

1. **AAA comments mandatory** — every test has `// Arrange`, `// Act`, `// Assert`.
2. **TDD for features and bugs** — failing test first, then minimal code to pass.
3. **Test behavior, not implementation** — through public APIs only.
4. **Never mock LSP provider internals** — use the real provider against real documents.
5. **`setupTestSuite()` in `beforeAll`** — handles cleanup.
6. **One focus per test**, mutually exclusive.
7. **Coverage thresholds in `vitest.config.ts` are blocking** — meet them or get explicit approval to lower.
8. **CLI tests:** never `vi.spyOn(defaultFileSystem, ...)` or `vi.mock('node:fs')` (OOM). Use DI or full module mock.
9. **Always mock `process.exit`** in CLI tests:
   ```typescript
   vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
   ```
10. **CLI commands need integration tests** that spawn the real binary (`execSync('node bin/cli.js ...')`) — unit tests with mocked `loadModel()` miss path-resolution and arg-parsing bugs.
11. **TypeScript errors in test files block the build.** Tests passing at runtime but failing `tsc` are unacceptable.

## Required template

```typescript
import { describe, test, beforeAll, expect } from 'vitest';
import { setupTestSuite, expectValidDocument, s, type TestServices } from '../test-helpers.js';

let testServices: TestServices;
beforeAll(() => { testServices = setupTestSuite(); });

test('parses domain with vision', async () => {
    // Arrange
    const input = s`Domain Sales { vision: "Handle sales" }`;

    // Act
    const document = await testServices.parse(input);

    // Assert
    expectValidDocument(document);
    expect(getFirstDomain(document).vision).toBe('Handle sales');
});
```

## Test helpers (`test-helpers.ts`)

| Helper | Use |
|---|---|
| `setupTestSuite()` | Auto-cleanup in `beforeAll` |
| `expectValidDocument(doc)` | No parse/link/validate errors |
| `expectValidationErrors(doc, [...])` / `Warnings` | Specific diagnostics present |
| `getFirstDomain(doc)`, `getFirstBoundedContext(doc)`, `getDomainByName(doc, name)` | AST extraction |
| `s\`...\`` | Readable multi-line DSL strings |
| `getDocumentErrors(doc)`, `getDiagnosticsBySeverity(doc, sev)` | Debug helpers |

## LSP testing — through real API

```typescript
test('hover shows domain reference info', async () => {
    // Arrange
    const document = await testServices.parse(s`
        Domain Sales { vision: "v" }
        bc Orders for Sales {}
    `);
    const provider = testServices.services.DomainLang.lsp.HoverProvider!;

    // Act
    const hover = await provider.getHoverContent(document, {
        textDocument: { uri: document.uri.toString() },
        position: { line: 1, character: 23 },
    });

    // Assert (user-visible content)
    expect(hover?.contents.value).toContain('domain');
    expect(hover?.contents.value).toMatch(/\[Sales\]\([^)]*#L\d+/);
});
```

Multi-file scoping: parse each file with its own `documentUri`, then query against the `mainDoc` returned reference (`bc.team?.ref?.name`).

## CLI integration test pattern

```typescript
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_BIN = resolve(__dirname, '../../bin/cli.js');
let workspace: string;
beforeEach(() => { workspace = mkdtempSync(join(tmpdir(), 'dlang-test-')); });
afterEach(() => { rmSync(workspace, { recursive: true, force: true }); });

test('resolves directory to entry file', () => {
    // Arrange
    writeFileSync(join(workspace, 'index.dlang'), 'Domain Test { vision: "v" }');
    // Act
    const out = execSync(`node ${CLI_BIN} query domains --json`, {
        cwd: workspace, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' },
    });
    // Assert
    expect(JSON.parse(out).success).toBe(true);
});
```

## CLI mocking patterns

DI (preferred):
```typescript
export async function calculateSize(dir: string, fs = defaultFileSystem) { /* ... */ }
// test: pass `createMockFs({ stat: vi.fn(...) })`
```

Module mock:
```typescript
vi.mock('../../src/services/filesystem.js', async (importOriginal) => ({
    ...await importOriginal(),
    defaultFileSystem: { existsSync: vi.fn(() => true), readdir: vi.fn(async () => []) },
}));
```

## Consolidate with `test.each`

```typescript
test.each([
    ['Domain', 'Domain Sales { vision: "v" }'],
    ['bc', 'bc Orders {}'],
    ['Team', 'Team DevTeam'],
])('parses %s keyword', async (_, input) => {
    const document = await testServices.parse(input);
    expectValidDocument(document);
});
```

Consolidate when assertion pattern is identical and only inputs vary. Keep separate when one failing variant requires a different fix.

## Skipping

Always document why and when to re-enable:
```typescript
test.skip('validates cyclic domains', /* TODO: blocked by PRS-008 AC#3 */ async () => {});
```

## Coverage targets

- 100% grammar parsing, 100% validation rules
- 90%+ scoping/linking, 80%+ LSP features, 60%+ utilities
- Overall ≥80%

## Decision matrix

| Scenario | Test type | Key helpers |
|---|---|---|
| Grammar | Parsing | `parse()`, `expectValidDocument()` |
| Cross-refs | Linking | Check `ref` is defined |
| Validation | Validation | `expectValidationErrors()` |
| Multi-refs | MultiReference | Check `items.length` |
| File system | Service | temp dirs in `beforeEach`/`afterEach` |
| CLI | Integration | `execSync(node bin/cli.js ...)` + temp workspace |

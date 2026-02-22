# Model query SDK

Use the Model Query SDK to load a DomainLang model and query it with a fluent, type-safe API.

::: tip
This SDK is read-only and query-focused. It does not manage file watching or workspace lifecycle.
:::

## Installation

```bash
npm install @domainlang/language
```

## Entry points

### `loadModelFromText()` (browser-safe)

Use this entry point in browsers, tests, and Node.js scripts when you already have the model content as a string:

```typescript
import { loadModelFromText } from '@domainlang/language/sdk';

const { query } = await loadModelFromText(`
  Classification CoreDomain
  Team SalesTeam

  Domain Sales { vision: "Handle sales operations" }

  BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"
  }
`);

const coreContexts = query
  .boundedContexts()
  .withClassification('CoreDomain')
  .toArray();
```

### `loadModel()` (Node.js only)

Load a model from a `.dlang` file on the filesystem:

```typescript
import { loadModel } from '@domainlang/language/sdk/loader-node';

const { query } = await loadModel('./domains.dlang', {
  workspaceDir: process.cwd()
});
```

This entry point requires Node.js and is not available in browser environments.

### `fromModel()` / `fromDocument()` / `fromServices()` (zero-copy)

If you already have a parsed/linked model (for example inside LSP tooling), wrap it directly:

```typescript
import { fromDocument } from '@domainlang/language/sdk';

const query = fromDocument(document);
const orders = query.boundedContext('Orders');
```

### `validateFile()` (Node.js only)

Validate a single `.dlang` file and all its imports using the Language Server Protocol infrastructure. Returns detailed diagnostics with line/column numbers.

```typescript
import { validateFile } from '@domainlang/language/sdk';

// Validate a file
const result = await validateFile('./index.dlang');

if (!result.valid) {
  // Print errors
  for (const err of result.errors) {
    console.error(
      `${err.file}:${err.line}:${err.column}: ${err.message}`
    );
  }
}

// Print warnings
for (const warn of result.warnings) {
  console.warn(
    `${warn.file}:${warn.line}:${warn.column}: ${warn.message}`
  );
}

// Access statistics
console.log(`Validated ${result.fileCount} files`);
console.log(`Found ${result.domainCount} domains, ${result.bcCount} BCs`);
```

The validation result includes:

- `valid: boolean` — `false` if any errors exist (warnings don't affect validity)
- `errors: ValidationDiagnostic[]` — Severity 1 diagnostics
- `warnings: ValidationDiagnostic[]` — Severity 2 diagnostics
- `fileCount: number` — Number of files validated (including imports)
- `domainCount: number` — Total domains across all files
- `bcCount: number` — Total bounded contexts across all files

Each diagnostic includes:

```typescript
interface ValidationDiagnostic {
  severity: 1 | 2;      // 1 = error, 2 = warning
  message: string;      // Human-readable message
  file: string;         // Absolute path
  line: number;         // 1-based line number
  column: number;       // 1-based column number
}
```

::: tip CLI integration
The [`dlang validate`](/guide/cli#validate-models) command uses this same validation infrastructure.
:::

### `validateWorkspace()` (Node.js only)

Validate an entire workspace directory (where `model.yaml` lives) using the Language Server Protocol infrastructure. This validates the entry file and all its imports, collecting diagnostics from all files in the workspace.

```typescript
import { validateWorkspace } from '@domainlang/language/sdk';

// Validate workspace directory
const result = await validateWorkspace('./my-project');

if (!result.valid) {
  // Print errors from all files
  for (const err of result.errors) {
    console.error(
      `${err.file}:${err.line}:${err.column}: ${err.message}`
    );
  }
}

// Access statistics
console.log(`Validated ${result.fileCount} files`);
console.log(`Found ${result.domainCount} domains, ${result.bcCount} BCs`);
console.log(`Total diagnostics: ${result.totalDiagnostics}`);
```

The workspace validation result includes:

- `valid: boolean` — `false` if any errors exist (warnings don't affect validity)
- `errors: ValidationDiagnostic[]` — Severity 1 diagnostics from all files
- `warnings: ValidationDiagnostic[]` — Severity 2 diagnostics from all files
- `fileCount: number` — Number of files validated
- `domainCount: number` — Total domains across all files
- `bcCount: number` — Total bounded contexts across all files
- `totalDiagnostics: number` — Sum of errors and warnings

The entry file is determined by `model.yaml`:

```yaml
name: my-project
version: 1.0.0
model:
  entry: index.dlang  # Optional, defaults to index.dlang
```

If `model.yaml` is missing, the workspace initializes with default settings.

::: tip When to use workspace validation

- Use `validateWorkspace()` for multi-file projects with a `model.yaml`
- Use `validateFile()` for standalone `.dlang` files
- Both functions use the same LSP validation infrastructure

:::

## Query API (basics)

### Collections

```typescript
query.domains();
query.boundedContexts();
query.teams();
query.classifications();
query.relationships();
query.contextMaps();
query.domainMaps();
query.namespaces();
```

### Common filters

```typescript
query.boundedContexts().inDomain('Sales');
query.boundedContexts().withTeam('SalesTeam');
query.boundedContexts().withClassification('CoreDomain');
query.boundedContexts().withMetadata('Language', 'TypeScript');
```

### Lookups

```typescript
const bc = query.boundedContext('Orders');
const domain = query.domain('Sales');
const node = query.byFqn('Sales.Orders');
```

## Relationships

`query.relationships()` returns a `RelationshipView` discriminated union. Narrow on the `type` property:

### Symmetric relationships

Symmetric relationships have no upstream or downstream — neither context is the provider.

```typescript
for (const rel of query.relationships()) {
  if (rel.type === 'symmetric') {
    console.log(rel.left.context.name);  // e.g. 'Orders'
    console.log(rel.right.context.name); // e.g. 'Inventory'
    console.log(rel.kind);               // 'SharedKernel' | 'Partnership' | 'SeparateWays'
    // Note: '><' (Separate Ways arrow form) resolves to 'SeparateWays'
  }
}
```

### Directional relationships

Directional relationships have three cases, distinguished by `kind`:

| `kind` | Meaning |
| ------ | ------- |
| `'UpstreamDownstream'` | Standard upstream/downstream dependency |
| `'CustomerSupplier'` | Formal supply-chain — Supplier provides, Customer consumes |
| `'Bidirectional'` | Mutual dependency (`<->`) — no upstream or downstream role |

The `upstream` and `downstream` properties resolve the correct side regardless of arrow direction:

```typescript
for (const rel of query.relationships()) {
  if (rel.type !== 'directional') continue;

  console.log(rel.arrow); // '->' | '<-' | '<->'
  console.log(rel.kind);  // 'UpstreamDownstream' | 'CustomerSupplier' | 'Bidirectional'

  // Positional access (as written in source — use for display/serialization)
  console.log(rel.left.context.name);
  console.log(rel.left.patterns.map(p => p.$type));

  // Semantic access (arrow-direction-resolved — use for analysis)
  // upstream = the provider (Supplier in CustomerSupplier)
  // downstream = the consumer (Customer in CustomerSupplier)
  // Both are undefined when kind === 'Bidirectional'
  if (rel.kind !== 'Bidirectional') {
    console.log(rel.upstream!.context.name);                 // provider context
    console.log(rel.upstream!.patterns.map(p => p.$type));  // e.g. ['OpenHostService']
    console.log(rel.downstream!.context.name);              // consumer context
    console.log(rel.downstream!.patterns.map(p => p.$type)); // e.g. ['Conformist']
  }
}
```

Arrow direction does not change the meaning of `upstream`/`downstream`:

```typescript
// These two are semantically equivalent — Orders is always upstream (OHS), Billing always downstream (CF)
// Orders [OHS] ->  [CF] Billing
// Billing [CF] <-  [OHS] Orders
```

### Filtering relationships by kind

```typescript
const supplierRelationships = query
  .relationships()
  .where(r => r.type === 'directional' && r.kind === 'CustomerSupplier');

const sharedKernels = query
  .relationships()
  .where(r => r.type === 'symmetric' && r.kind === 'SharedKernel');
```

## Next steps

- [CLI](/guide/cli) — manage multi-file projects
- [Examples](/examples/) — see complete domain models

## See also

- [Language reference](/reference/language) — authoritative syntax and keywords
- [Quick reference](/reference/quick-reference) — copy-paste snippets
- [npm: @domainlang/language](https://www.npmjs.com/package/@domainlang/language) — SDK package on npm

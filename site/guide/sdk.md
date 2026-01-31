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

  bc Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"
  }
`);

const coreContexts = query
  .boundedContexts()
  .withClassification('CoreDomain')
  .toArray();
```

### `fromModel()` / `fromDocument()` / `fromServices()` (zero-copy)

If you already have a parsed/linked model (for example inside LSP tooling), wrap it directly:

```typescript
import { fromDocument } from '@domainlang/language/sdk';

const query = fromDocument(document);
const orders = query.boundedContext('Orders');
```

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

## Next steps

- [CLI](/guide/cli) — manage multi-file projects
- [Browse Examples](/examples/) — see complete domain models

## See also

- [Language Reference](/reference/language) — authoritative syntax and keywords
- [Quick Reference](/reference/quick-reference) — copy-paste snippets
- [npm: @domainlang/language](https://www.npmjs.com/package/@domainlang/language) — SDK package on npm

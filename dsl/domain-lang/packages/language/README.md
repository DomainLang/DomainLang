# @domainlang/language

[![npm version](https://img.shields.io/npm/v/@domainlang/language.svg)](https://www.npmjs.com/package/@domainlang/language)
[![License](https://img.shields.io/npm/l/@domainlang/language.svg)](https://github.com/DomainLang/DomainLang/blob/main/LICENSE)

Parse, validate, and query Domain-Driven Design models written in the `.dlang` language. This package is the foundation that the [CLI](https://www.npmjs.com/package/@domainlang/cli) and [VS Code extension](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang) are built on — and you can build on it too.

## Install

```bash
npm install @domainlang/language
```

## Quick start

```typescript
import { loadModelFromText } from '@domainlang/language/sdk';

const { query } = await loadModelFromText(`
  Domain Sales {
    vision: "Enable seamless commerce"
  }

  Team SalesTeam
  Classification Core

  bc OrderContext for Sales as Core by SalesTeam {
    description: "Handles the order lifecycle"
  }
`);

const coreContexts = query.boundedContexts()
  .withClassification('Core')
  .toArray();

console.log(coreContexts.map(ctx => ctx.name)); // ['OrderContext']
```

That's it — five lines to parse a model and start querying. The SDK works in the browser, in Node.js, and inside Langium LSP integrations.

## What you can do with it

**Validate models programmatically.** Run the same validation the VS Code extension uses, from Node.js scripts or CI pipelines.

**Query anything in the model.** The fluent query builder lets you filter bounded contexts by team, classification, or domain — with lazy evaluation and full type safety.

**Build custom automation.** Generate architecture reports, enforce naming conventions, sync models to wikis, or feed model data into dashboards.

## API at a glance

| Function | Runtime | Purpose |
| --- | --- | --- |
| `loadModelFromText(text)` | Browser + Node.js | Parse DomainLang text in memory |
| `loadModel(path, options?)` | Node.js | Load and parse `.dlang` files |
| `validateFile(path, options?)` | Node.js | Validate a single file |
| `validateWorkspace(dir)` | Node.js | Validate an entire workspace |
| `fromModel(model)` | Browser + Node.js | Wrap an existing AST with query methods |
| `fromDocument(document)` | Browser + Node.js | Zero-copy wrapping for Langium documents |

## Query examples

```typescript
// Find all Core bounded contexts owned by a specific team
const contexts = query.boundedContexts()
  .withTeam('PaymentsTeam')
  .withClassification('Core')
  .toArray();

// Find context maps that include a specific bounded context
const maps = query.contextMaps()
  .containing('OrderContext')
  .toArray();
```

## Node.js file loading and validation

```typescript
import { loadModel, validateFile } from '@domainlang/language/sdk';

const { query } = await loadModel('./model.dlang', { workspaceDir: process.cwd() });
const result = await validateFile('./model.dlang', { workspaceDir: process.cwd() });

if (!result.valid) {
  for (const err of result.errors) {
    console.error(`${err.file}:${err.line}: ${err.message}`);
  }
  process.exit(1);
}
```

## Documentation

- [Getting started](https://domainlang.net/guide/getting-started)
- [SDK guide](https://domainlang.net/guide/sdk)
- [Language reference](https://domainlang.net/reference/language)
- [Quick reference card](https://domainlang.net/reference/quick-reference)

## Related packages

- [@domainlang/cli](https://www.npmjs.com/package/@domainlang/cli) — terminal validation, queries, and dependency management.
- [DomainLang for VS Code](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang) — syntax highlighting, IntelliSense, and real-time validation.

## License

Apache-2.0

# @domainlang/language

[![npm version](https://img.shields.io/npm/v/@domainlang/language.svg)](https://www.npmjs.com/package/@domainlang/language)[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)
[![License](https://img.shields.io/npm/l/@domainlang/language.svg)](https://github.com/DomainLang/DomainLang/blob/main/LICENSE)

Core language library for [DomainLang](https://github.com/DomainLang/DomainLang) - a Domain-Driven Design modeling language built with [Langium](https://langium.org/).

## Features

- 🔤 **Parser** - Full DomainLang grammar with error recovery
- ✅ **Validation** - Semantic validation for DDD best practices
- 🔗 **Linking** - Cross-reference resolution across files and packages
- 🔍 **Model Query SDK** - Programmatic access to DDD models with fluent queries
- 🌐 **Browser Support** - Works in Node.js and browser environments

## Installation

```bash
npm install @domainlang/language
```

## Quick start

### Parse and query models

```typescript
import { loadModelFromText } from '@domainlang/language/sdk';

const { query } = await loadModelFromText(`
  Domain Sales {
    vision: "Enable seamless commerce"
  }
  
  bc OrderContext for Sales as Core by SalesTeam {
    description: "Handles order lifecycle"
  }
`);

// Query bounded contexts
const coreContexts = query.boundedContexts()
  .withClassification('Core')
  .toArray();

console.log(coreContexts[0].name); // 'OrderContext'
```

### Load from file (Node.js)

```typescript
import { loadModel } from '@domainlang/language/sdk/loader-node';

const { model, query } = await loadModel('./my-model.dlang');

// Access domains
for (const domain of query.domains()) {
  console.log(`${domain.name}: ${domain.vision}`);
}
```

## API overview

### Entry points

| Function | Environment | Use Case |
| -------- | ----------- | -------- |
| `loadModelFromText(text)` | Browser & Node | Parse inline DSL text |
| `loadModel(file)` | Node.js only | Load from file system |
| `fromDocument(doc)` | LSP integration | Zero-copy from Langium document |
| `fromModel(model)` | Advanced | Direct AST wrapping |

### Query builder

The SDK provides fluent query builders with lazy evaluation:

```typescript
// Find all bounded contexts owned by a team
const teamContexts = query.boundedContexts()
  .withTeam('PaymentsTeam')
  .toArray();

// Get context maps containing specific contexts
const maps = query.contextMaps()
  .containing('OrderContext')
  .toArray();
```

### Direct property access

```typescript
// Direct AST properties
const desc = boundedContext.description;
const vision = domain.vision;

// SDK-augmented properties (with precedence resolution)
const classification = boundedContext.effectiveClassification;  // Header 'as' wins over body 'classification:'
const team = boundedContext.effectiveTeam;  // Header 'by' wins over body 'team:'
```

## DomainLang syntax

DomainLang models Domain-Driven Design concepts:

```dlang
// Define domains with vision
Domain Sales {
  vision: "Drive revenue through great customer experience"
}

// Bounded contexts with ownership
bc OrderContext for Sales as Core by SalesTeam {
  description: "Order lifecycle management"
}

bc PaymentContext for Sales as Supporting by PaymentsTeam

// Context maps showing integrations
ContextMap SalesIntegration {
  contains OrderContext, PaymentContext
  
  [OHS,PL] OrderContext -> [CF] PaymentContext
}
```

## Package structure

| Path | Purpose |
| ---- | ------- |
| `src/domain-lang.langium` | Grammar definition |
| `src/generated/` | Auto-generated AST (do not edit) |
| `src/validation/` | Semantic validation rules |
| `src/lsp/` | LSP features (hover, completion, formatting) |
| `src/sdk/` | Model Query SDK |

## Related packages

- [@domainlang/cli](https://www.npmjs.com/package/@domainlang/cli) - Command-line interface
- [DomainLang VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang) - IDE support

## Documentation

- [Getting Started](https://domainlang.net/guide/getting-started)
- [Language Reference](https://domainlang.net/reference/language)
- [Quick Reference](https://domainlang.net/reference/quick-reference)
- [SDK Documentation](https://github.com/DomainLang/DomainLang/blob/main/dsl/domain-lang/packages/language/src/sdk/README.md)

## Development

From the workspace root (`dsl/domain-lang/`):

```bash
# After editing the grammar
npm run langium:generate

# Build this package
npm run build --workspace packages/language

# Run tests
npm test --workspace packages/language
```

## License

Apache-2.0

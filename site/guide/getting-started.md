# Getting started

Build a small DomainLang model that includes a domain, bounded contexts, ownership, terminology, and a context map.

::: warning 🚧 Prerelease
DomainLang is in active development and has not reached v1.0 yet. The language syntax may evolve. See the [roadmap](/roadmap) for planned features.
:::

## Prerequisites

- VS Code with the [DomainLang extension](https://marketplace.visualstudio.com/items?itemName=thinkability.domain-lang)
- (Optional) Node.js 20+ for CLI and programmatic access

::: tip
Use the VS Code extension for syntax highlighting, validation, and navigation while you learn the language.
:::

## Installation

DomainLang is available as npm packages for different use cases:

### CLI (command line)

Install globally to use `domain-lang-cli` commands from your terminal:

```bash
npm install -g @domainlang/cli
```

Then manage dependencies and governance for multi-file models:

```bash
domain-lang-cli install
domain-lang-cli model tree
```

See [CLI](/guide/cli) for the full command reference.

### Language library

For programmatic access—parse, validate, and query DomainLang models in your code:

```bash
npm install @domainlang/language
```

Use the Model Query SDK:

```typescript
import { loadModelFromText } from '@domainlang/language/sdk';

const { query } = await loadModelFromText(`
    Classification CoreDomain
    Team SalesTeam

    Domain Sales { vision: "Sell things" }
    bc Orders for Sales as CoreDomain by SalesTeam
`);

const coreContexts = query.boundedContexts()
    .withClassification('CoreDomain')
  .toArray();
```

See [Model Query SDK](/guide/sdk) for more examples.

::: info npm Packages

| Package                                                                      | Description                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [@domainlang/cli](https://www.npmjs.com/package/@domainlang/cli)             | Command-line interface for validating, analyzing, and managing models     |
| [@domainlang/language](https://www.npmjs.com/package/@domainlang/language)   | Core library with parser, validator, and Model Query SDK                  |

:::

## Step 1: Define a domain

Create a new file called `bookstore.dlang` and add your first domain:

```dlang
Domain Bookstore {
    description: "Online bookstore"
    vision: "Make books easy to buy"
}
```

A **domain** represents a sphere of knowledge or activity in your business.

## Step 2: Declare teams and classifications

Add teams and strategic classifications:

```dlang
Classification CoreDomain
Classification SupportingDomain

Team CatalogTeam
Team OrderTeam
```

**Classifications** indicate strategic importance (Core, Supporting, Generic).  
**Teams** represent the people responsible for bounded contexts.

## Step 3: Add bounded contexts

A [bounded context](/guide/bounded-contexts) is a boundary within which a domain model applies. Use `as` for strategic classification and `by` for ownership:

```dlang
Domain Bookstore { description: "Online bookstore" }

Classification CoreDomain
Team CatalogTeam
Team OrderTeam

bc Catalog for Bookstore as CoreDomain by CatalogTeam {
    description: "Product catalog and inventory"
}

bc Orders for Bookstore as CoreDomain by OrderTeam {
    description: "Order lifecycle and orchestration"
}
```

::: info
`as` sets the bounded context **classification** (Core/Supporting/Generic).  
`by` assigns the responsible **team**.
:::

## Step 4: Capture terminology

Document the ubiquitous language within each bounded context:

```dlang
bc Orders for Bookstore {
    terminology {
        term Order: "A customer's request to purchase"
        term OrderLine: "A single line item in an order"
    }
}
```

::: tip
The DDD concept is "ubiquitous language"—the keyword in DomainLang is `terminology { ... }`.
:::

## Step 5: Map relationships

Create a [context map](/guide/context-maps) to show how bounded contexts integrate:

```dlang
ContextMap BookstoreSystem {
    contains Catalog, Orders
    Catalog -> Orders
}
```

## Step 6: Add relationship patterns (optional)

Annotate relationships with DDD integration patterns:

```dlang
ContextMap BookstoreSystem {
    contains Catalog, Orders, Shipping
    
    [OHS] Catalog -> [CF] Orders
    [ACL] Shipping <- Orders
}
```

Common patterns:

| Pattern | Meaning               |
| ------- | --------------------- |
| `[OHS]` | Open Host Service     |
| `[CF]`  | Conformist            |
| `[ACL]` | Anti-Corruption Layer |
| `[PL]`  | Published Language    |
| `[SK]`  | Shared Kernel         |
| `[P]`   | Partnership           |

## Step 7: Organize with namespaces (optional)

As your model grows, use [namespaces](/guide/namespaces) to avoid name collisions:

```dlang
Namespace Bookstore.Core {
    bc Catalog for Bookstore { }
    bc Orders for Bookstore { }
}

ContextMap System {
    contains Bookstore.Core.Catalog, Bookstore.Core.Orders
}
```

## Complete example

Here's the complete model:

```dlang
Classification CoreDomain
Classification SupportingDomain

Team CatalogTeam
Team OrderTeam

Domain Bookstore {
    description: "Online bookstore"
    vision: "Make books easy to buy"
}

bc Catalog for Bookstore as CoreDomain by CatalogTeam {
    description: "Product catalog and inventory"
    
    terminology {
        term Book: "A product available for purchase"
        term ISBN: "International Standard Book Number"
    }
}

bc Orders for Bookstore as CoreDomain by OrderTeam {
    description: "Order lifecycle and orchestration"
    
    terminology {
        term Order: "A customer's request to purchase"
        term OrderLine: "A single line item in an order"
    }
}

ContextMap BookstoreSystem {
    contains Catalog, Orders
    [OHS] Catalog -> [CF] Orders
}
```

## Next steps

- [Learn about Domains](/guide/domains)
- [Learn about Bounded Contexts](/guide/bounded-contexts)
- [Explore the Language Reference](/reference/language)
- [Browse Examples](/examples/)

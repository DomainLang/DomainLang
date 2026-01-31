# What is DomainLang?

DomainLang is a **domain-specific language (DSL)** for expressing Domain-Driven Design architecture models. It provides a clean, readable syntax for defining [domains](/guide/domains), [bounded contexts](/guide/bounded-contexts), [context maps](/guide/context-maps), [teams](/guide/teams-classifications), and ubiquitous language—all in plain text files that live in your repository.

::: warning 🚧 Prerelease
DomainLang is in active development and has not reached v1.0 yet. The language syntax may evolve. See the [roadmap](/roadmap) for planned features.
:::

## Why DomainLang?

### The problem

DDD models are often:
- **Locked in proprietary tools** — hard to version control or review
- **Scattered across documents** — wikis, Confluence pages, diagrams
- **Quickly outdated** — disconnected from the codebase they describe
- **Hard to validate** — no tooling to catch inconsistencies

### The solution

DomainLang keeps your DDD models:
- **In the repo** — version controlled alongside code
- **Reviewable** — changes visible in pull requests
- **Validated** — IDE catches issues as you type
- **Programmable** — query and analyze with the [Model Query SDK](/guide/sdk)

## Key features

### DDD-aligned syntax

Express DDD concepts naturally:

```dlang
Domain Sales {
    description: "Revenue generation"
    vision: "Make it easy to buy"
}

bc Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"
    
    terminology {
        term Order: "A customer's request to purchase"
    }
}
```

### IDE support

The VS Code extension provides:
- Syntax highlighting for `.dlang` files
- Real-time validation and error messages
- Code completion for keywords and references
- Hover information and documentation
- Go-to-definition navigation

### Context maps

Model relationships between bounded contexts:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping
    
    [OHS] Orders -> [CF] Billing
    [ACL] Shipping <- Orders
}
```

### Multi-file models

Scale to large systems with [imports and namespaces](/guide/imports):

```dlang
import "./shared/teams.dlang"
import "./shared/classifications.dlang"

Namespace Acme.Sales {
    bc Orders for Sales { }
}
```

## Getting started

Ready to try DomainLang?

1. [Install the VS Code extension](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang)
2. Follow the [Getting Started guide](/guide/getting-started)
3. Explore the [Examples](/examples/)

## Community

- **Questions & Ideas**: [GitHub Discussions](https://github.com/DomainLang/DomainLang/discussions)
- **Bug Reports**: [GitHub Issues](https://github.com/DomainLang/DomainLang/issues)
- **Source Code**: [GitHub Repository](https://github.com/DomainLang/DomainLang)

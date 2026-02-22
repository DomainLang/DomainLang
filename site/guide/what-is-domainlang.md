# What is DomainLang?

DomainLang is a **domain-specific language** for expressing Domain-Driven Design models as code. Define [domains](/guide/domains), [bounded contexts](/guide/bounded-contexts), [context maps](/guide/context-maps), [teams](/guide/teams-classifications), and ubiquitous language in plain text files that live in your repository — validated by your IDE, queryable by AI agents, and reviewable in pull requests.

::: warning 🚧 Prerelease
DomainLang is in active development and has not reached v1.0 yet. The language syntax may evolve. See the [roadmap](/roadmap) for planned features.
:::

## The problem

DDD architecture models are typically:

- **Locked in proprietary tools** — hard to version control or review
- **Scattered across wikis and documents** — Confluence pages, Miro boards, outdated diagrams
- **Quickly outdated** — disconnected from the codebase they describe
- **Impossible to validate** — no tooling catches modeling inconsistencies
- **Invisible to AI** — your architecture knowledge isn't available to coding assistants

## How DomainLang helps

DomainLang brings your architecture models into the development workflow:

| Challenge | How DomainLang solves it |
| --------- | ------------------------ |
| Models in proprietary tools | Plain text `.dlang` files in your repo |
| Scattered knowledge | Single source of truth, version controlled |
| Outdated documentation | Changes reviewed in pull requests |
| No validation | IDE catches issues as you type |
| Invisible to AI | AI agents query your model directly |
| Manual analysis | Programmable [SDK](/guide/sdk) for automation |

## What you can express

### Strategic design

Capture the big picture — domains, subdomains, classifications, and team ownership:

```dlang
Classification CoreDomain
Team SalesTeam

Domain Sales {
    description: "Revenue generation and customer acquisition"
    vision: "Make it easy to buy"
}

BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"
}
```

### Ubiquitous language

Document the shared vocabulary within each bounded context:

```dlang
BoundedContext Orders for Sales {
    terminology {
        term Order: "A customer's request to purchase"
        term OrderLine: "A single line item in an order"
    }
}
```

### Integration patterns

Map how bounded contexts relate to each other with DDD relationship patterns:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping

    Orders [OHS] -> [CF] Billing
    Orders -> [ACL] Shipping
}
```

### Governance and decisions

Record architecture decisions, policies, and rules alongside the model they apply to:

```dlang
BoundedContext Orders for Sales {
    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
    }
}
```

## Tooling ecosystem

DomainLang is more than a language — it's a set of tools designed for how teams actually work:

- **[VS Code extension](/guide/vscode-extension)** — Syntax highlighting, validation, completion, hover docs, and go-to-definition
- **[AI-powered analysis](/guide/vscode-tools)** — Ask GitHub Copilot or Claude about your domain model directly in your editor
- **[Agent skill](/guide/agent-skill)** — Teach any AI coding agent to write correct DomainLang models
- **[CLI](/guide/cli)** — Validate, query, and manage dependencies from the command line
- **[Model query SDK](/guide/sdk)** — Programmatic access to your models for automation and analysis

## Next steps

- [Getting started](/guide/getting-started) — Build your first model in five minutes
- [Examples](/examples/) — See real-world models for banking, healthcare, and more
- [Language reference](/reference/language) — Complete syntax and semantics

## Community

- **Questions & ideas:** [GitHub Discussions](https://github.com/DomainLang/DomainLang/discussions)
- **Bug reports:** [GitHub Issues](https://github.com/DomainLang/DomainLang/issues)
- **Source code:** [GitHub Repository](https://github.com/DomainLang/DomainLang)

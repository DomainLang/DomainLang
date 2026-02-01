<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/logo-with-text-light-thin@2x.png">
  <source media="(prefers-color-scheme: light)" srcset="images/logo-with-text-thin@2x.png">
  <img alt="DomainLang Logo" width="50%" src="images/logo-with-text-thin@2x.png">
</picture>

# A DSL for Domain Driven Design

[![CI](https://github.com/DomainLang/DomainLang/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/DomainLang/DomainLang/actions/workflows/ci-cd.yml)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=coverage)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)
[![VS Marketplace](https://vsmarketplacebadges.dev/version/DomainLang.vscode-domainlang.svg)](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang)![NPM Version](https://img.shields.io/npm/v/%40domainlang%2Flanguage?label=%40domainlang%2Flanguage)![NPM Version](https://img.shields.io/npm/v/%40domainlang%2Fcli?label=%40domainlang%2Fcli)




> [!WARNING]
> **🚧 Prerelease Software** — DomainLang is in active development and has not reached v1.0 yet. The language syntax and tooling may change. We welcome feedback and contributions—see the [roadmap](https://domainlang.net/roadmap) for planned features.

A small DSL for Domain-Driven Design (DDD) architecture models, with first-class IDE support.

Use DomainLang to keep domains, bounded contexts, ownership, terminology, and context maps close to the codebase (and easy to review in pull requests).

<img alt="DomainLang CLI" src="images/terminal-window.png">

## Quick Start

1. Install the VS Code extension: <https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang>
2. Create a `.dlang` file and start modeling
3. Read the documentation: <https://domainlang.net/guide/getting-started>

```dlang
Classification CoreDomain
Team SalesTeam

Domain Sales {
    description: "Revenue generation and customer acquisition"
    vision: "Make it easy to buy"
}

bc Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"

    terminology {
        term Order: "A customer's request to purchase"
    }
}

ContextMap SalesLandscape {
    contains Orders
}
```

## Who this is for

- Architects and tech leads who want lightweight, reviewable DDD models
- Teams doing DDD who need a shared ubiquitous language in the repo
- Developers who want IDE feedback while evolving architecture

## What you get

- A DDD-aligned language for architecture models
- VS Code support (syntax highlighting, completion, hover, go-to-definition)
- Validation to catch common modeling issues early
- Model Query SDK for analysis and automation

## Documentation

Full documentation is available at **<https://domainlang.net>**:

- [Getting Started](https://domainlang.net/guide/getting-started) — Build your first model
- [Language Reference](https://domainlang.net/reference/language) — Complete syntax and semantics
- [Quick Reference](https://domainlang.net/reference/quick-reference) — Syntax cheat sheet
- [Examples](https://domainlang.net/examples/) — Real-world model examples

## Build from Source

Development uses Node.js 20+ (Volta is configured).

```bash
cd dsl/domain-lang
npm install
npm run langium:generate
npm run build
npm test
```

See [dsl/domain-lang/README.md](dsl/domain-lang/README.md) for workspace commands and package layout.

## GitHub Copilot Integration

This repository includes MCP (Model Context Protocol) server configuration for enhanced GitHub Copilot capabilities.

### Perplexity Web Search

Enable web search in GitHub Copilot:

1. Copy `.env.example` to `.env` and add your [Perplexity API key](https://www.perplexity.ai/settings/api)
2. Restart VS Code to load the MCP server configuration
3. GitHub Copilot can now search the web using Perplexity

See [`.copilot/README.md`](.copilot/README.md) for detailed setup instructions.

## Contributing

Ideas, bug reports, and pull requests are welcome!

- 💬 [Discussions](https://github.com/DomainLang/DomainLang/discussions) — Ask questions and share ideas
- 🐛 [Issues](https://github.com/DomainLang/DomainLang/issues) — Report bugs or propose features
- 📖 [Contributing Guide](https://domainlang.net/guide/getting-started) — Get started contributing

Before submitting code, run `npm test` and `npm run lint` from `dsl/domain-lang/`.

## License

Apache 2.0 (see LICENSE)

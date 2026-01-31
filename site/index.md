---
layout: home

hero:
  name: DomainLang
  text: A DSL for Domain-Driven Design
  tagline: Model domains, bounded contexts, context maps, and ubiquitous language in version-controlled text files
  image:
    src: /logo.svg
    alt: DomainLang
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/DomainLang/DomainLang

features:
  - icon: 🎯
    title: DDD-aligned syntax
    details: Express domains, bounded contexts, context maps, and ubiquitous language in a clean, readable syntax.
  - icon: 🛠️
    title: First-class IDE support
    details: VS Code extension with syntax highlighting, validation, completion, hover, and go-to-definition.
  - icon: 📦
    title: Version control friendly
    details: Plain text files that live in your repo—easy to review in pull requests and track changes over time.
  - icon: 🔍
    title: Built-in validation
    details: Catch common modeling issues early with real-time validation and helpful error messages.
  - icon: 🧩
    title: Model query SDK
    details: Programmatic access to your DDD models for analysis, documentation generation, and automation.
  - icon: 📚
    title: Multi-file support
    details: Split models across files with imports, namespaces, and external dependencies for large codebases.
---

::: warning 🚧 Prerelease Software
DomainLang is in active development and has not reached v1.0 yet. The language syntax and tooling may change. We welcome feedback and contributions—see the [roadmap](/roadmap) for planned features.
:::

## Quick example

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

## Who is DomainLang for?

<div class="vp-features">

**Architects and Tech Leads**  
Who want lightweight, reviewable DDD models that live in the codebase.

**Teams Doing DDD**  
Who need a shared ubiquitous language documented alongside the code.

**Developers**  
Who want IDE feedback while evolving architecture and domain models.

</div>

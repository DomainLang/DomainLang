---
layout: home

hero:
  name: DomainLang
  text: Domain-Driven Design, as code
  tagline: Define, validate, and evolve your DDD models in version-controlled text files — with IDE intelligence and AI-powered analysis.
  image:
    src: /logo.svg
    alt: DomainLang
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is DomainLang?
      link: /guide/what-is-domainlang

features:
  - icon: 🏗️
    title: Model your architecture
    details: Express domains, bounded contexts, context maps, teams, and ubiquitous language in a clean, readable syntax designed for DDD practitioners.
  - icon: 🔍
    title: Catch modeling issues early
    details: Real-time validation in your editor catches inconsistencies, missing definitions, and common DDD anti-patterns as you type.
  - icon: 🤖
    title: AI-powered analysis
    details: Ask GitHub Copilot or Claude about your domain model directly in VS Code. AI agents read live model data and give accurate, context-aware answers.
  - icon: 📦
    title: Version control your models
    details: Plain text .dlang files live in your repo — easy to review in pull requests, track changes over time, and keep in sync with the code.
  - icon: 🛠️
    title: Full IDE experience
    details: VS Code extension with syntax highlighting, code completion, hover docs, go-to-definition, and formatting — the same experience you expect for code.
  - icon: 🧩
    title: Programmable and extensible
    details: Query and analyze models with the Model Query SDK. Automate documentation, enforce governance, or build custom integrations.
---

::: warning 🚧 Prerelease software
DomainLang is in active development and has not reached v1.0 yet. The language syntax and tooling may change. We welcome feedback and contributions — see the [roadmap](/roadmap) for planned features.
:::

## See it in action

```dlang
Classification CoreDomain
Team SalesTeam

Domain Sales {
    description: "Revenue generation and customer acquisition"
    vision: "Make it easy to buy"
}

BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"

    terminology {
        term Order: "A customer's request to purchase"
    }
}

ContextMap SalesLandscape {
    contains Orders
}
```

## Built for your workflow

<div class="vp-features">

**Architects & tech leads**
Lightweight, reviewable DDD models that live in the codebase — not in wikis that go stale. Track architecture decisions alongside the code they govern.

**Domain modelers & business experts**
A readable language for capturing strategic design, ubiquitous language, and team ownership. No programming experience required to read or contribute.

**Developers & platform teams**
IDE feedback while evolving models. A programmable SDK for automation. AI agents that understand your domain model.

</div>

## Explore further

- [What is DomainLang?](/guide/what-is-domainlang) — Learn how it works and why it exists
- [Getting started](/guide/getting-started) — Build your first model in five minutes
- [Examples](/examples/) — Real-world models for banking, healthcare, and more
- [AI-powered tools](/guide/vscode-tools) — Ask AI agents about your domain model

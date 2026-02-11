---
name: domainlang
description: Write Domain-Driven Design architecture models using DomainLang (.dlang files). Covers domains, bounded contexts, context maps, teams, classifications, terminology, relationships, namespaces, and imports. Use when creating DDD models, mapping bounded context relationships, documenting ubiquitous language, or generating .dlang files for strategic design.
---

# DomainLang modeling

Write DDD architecture models in `.dlang` files. DomainLang is a domain-specific language for expressing Domain-Driven Design concepts as code — domains, bounded contexts, context maps, teams, ownership, ubiquitous language, and integration patterns.

**Reference:** https://domainlang.net

## Workflow

Follow these steps when creating a DomainLang model:

1. **Identify domains** — the high-level business capabilities
2. **Declare teams and classifications** — who owns what, how strategically important
3. **Define bounded contexts** — concrete boundaries with terminology
4. **Map relationships** — how contexts integrate, with DDD patterns
5. **Organize** — use namespaces and imports for large models

## Core syntax

### Domains

```dlang
Domain Sales {
    description: "Revenue generation"
    vision: "Make buying easy"
}

// Subdomains use 'in'
Domain OnlineSales in Sales {
    description: "Digital sales channel"
}
```

Use nouns reflecting business capabilities, not technical terms.

### Teams and classifications

```dlang
Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain

Team SalesTeam
Team PlatformTeam
```

Declare these before referencing them in bounded contexts.

### Bounded contexts

```dlang
bc Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"

    terminology {
        term Order: "A customer's request to purchase"
            aka PurchaseOrder
            examples "Order #12345"
        term OrderLine: "A single item in an order"
    }

    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order is $10"
    }

    metadata {
        Language: "TypeScript"
    }
}
```

Header keywords: `for` (parent domain), `as` (classification), `by` (team).

Body-only form is also valid — use `classification:` and `team:` inside body.

Optional body — `bc Orders for Sales` is valid for quick declarations.

Block aliases: `terminology`/`glossary`, `metadata`/`meta`, `decisions`/`rules`, `relationships`/`integrations`.

### Metadata

Declare keys before use:

```dlang
Metadata Language
Metadata Repository

bc Orders for Sales {
    metadata {
        Language: "TypeScript"
        Repository: "github.com/acme/orders"
    }
}
```

### Context maps

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping

    [OHS] Orders -> [CF] Billing
    [ACL] Shipping <- Orders
    [P] Orders <-> [P] Inventory
    Orders >< LegacySystem
}
```

**Arrows:** `->` upstream-to-downstream, `<-` downstream-to-upstream, `<->` bidirectional, `><` separate ways.

**Integration patterns:**

| Pattern | Abbreviation | Meaning |
|---------|-------------|---------|
| Open Host Service | `[OHS]` | Well-defined protocol for consumers |
| Conformist | `[CF]` | Adopts upstream model without translation |
| Anti-Corruption Layer | `[ACL]` | Translates between models to protect downstream |
| Published Language | `[PL]` | Shared documented language for integration |
| Shared Kernel | `[SK]` | Shared subset of the domain model |
| Partnership | `[P]` | Two contexts coordinate development together |

### Inline relationships

Inside bounded contexts, use `this` as self-reference:

```dlang
bc Orders for Sales {
    relationships {
        [OHS] this -> [CF] Billing
        [ACL] this <- Payments
    }
}
```

### Domain maps

```dlang
DomainMap Portfolio {
    contains Sales, Support, Platform
}
```

### Namespaces

```dlang
Namespace Acme.Sales {
    bc Orders for Sales {}
}

// Reference with FQN
ContextMap System {
    contains Acme.Sales.Orders
}
```

### Imports

```dlang
import "./shared/teams.dlang"
import "../common/classifications.dlang"
import "acme/ddd-core" as Core

bc Orders for Core.SalesDomain {}
```

External imports require a `model.yaml` manifest.

### Comments and assignment

```dlang
// Line comment
/* Block comment */

// All equivalent:
description: "Using colon"
vision = "Using equals"
team is SalesTeam
```

## DDD modeling guidelines

### Strategic design checklist

- Every bounded context needs a parent domain (`for`)
- Core domains deserve the best teams and custom solutions
- Supporting domains are necessary but not differentiating
- Generic domains are commodity — buy or use standard solutions
- Name contexts after capabilities, not teams

### Bounded context sizing

- A context should have a clear, autonomous boundary
- If two contexts share too much, consider merging
- If one context does too much, consider splitting
- One team should own one or a few closely related contexts

### Context map best practices

- Keep maps focused on one concern (technical, team, data flow)
- Limit each map to 7-10 contexts maximum
- Use multiple maps for different views of the same system
- Always annotate integration patterns — they capture DDD intent

### Terminology captures ubiquitous language

- Define every important term within its bounded context
- Use `aka` for synonyms the team encounters
- Use `examples` for concrete illustrations
- Different contexts may define the same word differently — that's expected

## File organization

### Single file (small models)

Put everything in one `.dlang` file.

### Multi-file projects

```text
my-project/
├── model.yaml
├── index.dlang
├── shared/
│   ├── teams.dlang
│   └── classifications.dlang
└── domains/
    ├── sales/
    │   └── index.dlang
    └── shipping/
        └── index.dlang
```

Use `index.dlang` as entry points. Configure path aliases in `model.yaml`:

```yaml
model:
  name: my-company/domain-model
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"

dependencies:
  acme/ddd-core: "v1.0.0"
```

## Complete example

```dlang
Classification CoreDomain
Classification SupportingDomain

Team OrderTeam
Team ShippingTeam

Domain ECommerce {
    description: "Online retail platform"
    vision: "Seamless shopping experience"
}

Metadata Language

bc Orders for ECommerce as CoreDomain by OrderTeam {
    description: "Order lifecycle from cart to delivery"

    terminology {
        term Order: "A customer's request to purchase items"
        term Cart: "Temporary collection of items before purchase"
    }

    metadata {
        Language: "TypeScript"
    }
}

bc Shipping for ECommerce as SupportingDomain by ShippingTeam {
    description: "Package routing and delivery tracking"

    terminology {
        term Shipment: "A collection of packages traveling together"
        term Carrier: "The company performing delivery"
    }
}

ContextMap ECommerceIntegration {
    contains Orders, Shipping

    [OHS] Orders -> [CF] Shipping
}
```

## Keyword quick reference

See [references/SYNTAX.md](references/SYNTAX.md) for the complete keyword and alias table.

**Top-level:** `Domain` (`dom`), `BoundedContext` (`bc`), `ContextMap` (`cmap`), `DomainMap` (`dmap`), `Namespace` (`ns`), `Team`, `Classification`, `Metadata`, `Import` (`import`)

**BC header:** `for`, `as`, `by`

**BC blocks:** `terminology`/`glossary`, `decisions`/`rules`, `metadata`/`meta`, `relationships`/`integrations`

**Items:** `term`, `decision`, `policy`, `rule`

**Term modifiers:** `aka`/`synonyms`, `examples`

## Tooling

- **VS Code extension:** `DomainLang.vscode-domainlang` — syntax highlighting, validation, completion, hover, go-to-definition
- **VS Code AI tools:** When working in VS Code with GitHub Copilot or Claude, use these Language Model Tools:
  - `domainlang_validate` — Validate the model and get diagnostics
  - `domainlang_list` — List entities (domains, bcs, teams, classifications, relationships, context-maps, domain-maps) with filters
  - `domainlang_get` — Get a specific element by FQN or model summary
  - `domainlang_explain` — Get rich markdown explanations of any element
  - Example: "Show me all Core bounded contexts" or "Explain the OrderContext"
- **CLI:** `npm install -g @domainlang/cli` — `dlang install`, `dlang model tree`, `dlang model status`
- **SDK:** `npm install @domainlang/language` — parse and query models programmatically

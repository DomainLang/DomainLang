# DomainLang syntax reference

Complete keyword and alias table for DomainLang `.dlang` files.

## Top-level declarations

| Concept | Keyword | Alias |
|---------|---------|-------|
| Domain | `Domain` | `dom` |
| Bounded context | `BoundedContext` | `bc` |
| Context map | `ContextMap` | `cmap` |
| Domain map | `DomainMap` | `dmap` |
| Namespace | `Namespace` | `ns` |
| Import | `Import` | `import` |
| Classification | `Classification` | — |
| Team | `Team` | — |
| Metadata key | `Metadata` | — |

## Bounded context header keywords

| Keyword | Purpose | Example |
|---------|---------|---------|
| `for` | Parent domain | `bc Orders for Sales` |
| `as` | Strategic classification | `bc Orders for Sales as CoreDomain` |
| `by` | Owning team | `bc Orders for Sales by SalesTeam` |

## Bounded context body properties

| Property | Type | Description |
|----------|------|-------------|
| `description` | string | Purpose and business value |
| `classification` | Classification | Alternative to `as` in header |
| `team` | Team | Alternative to `by` in header |
| `businessModel` | Classification | Revenue, Engagement, Compliance |
| `evolution` | Classification | Genesis, Custom, Product, Commodity |
| `archetype` | Classification | Gateway, Execution, Analysis, etc. |

## Block keywords (inside bounded contexts)

| Block | Alias |
|-------|-------|
| `terminology` | `glossary` |
| `metadata` | `meta` |
| `decisions` | `rules` |
| `relationships` | `integrations` |

## Item keywords (inside blocks)

| Item | Alias | Used in |
|------|-------|---------|
| `term` | `Term` | terminology/glossary |
| `decision` | `Decision` | decisions/rules |
| `policy` | `Policy` | decisions/rules |
| `rule` | `Rule` | decisions/rules |

## Term modifiers

| Modifier | Alias | Purpose | Example |
|----------|-------|---------|---------|
| `aka` | `synonyms` | Alternative names (identifiers) | `aka PurchaseOrder, BuyOrder` |
| `examples` | — | Example values (strings) | `examples "Order #12345"` |

## Decision classifiers

Decisions, policies, and rules can be annotated with a classification:

```dlang
Classification Architectural
Classification Business

decisions {
    decision [Architectural] EventSourcing: "Use event sourcing"
    policy [Business] Refunds: "30-day return window"
    rule [Business] MinOrder: "Minimum $10"
}
```

## Relationship arrows

| Arrow | Direction | Meaning |
|-------|-----------|---------|
| `->` | Left to right | Upstream to downstream |
| `<-` | Right to left | Downstream to upstream |
| `<->` | Bidirectional | Partnership / mutual dependency |
| `><` | None | Separate ways (no integration) |

## Integration patterns

| Full name | Abbreviation | Description |
|-----------|-------------|-------------|
| Open Host Service | `[OHS]` | Provides a well-defined protocol for consumers |
| Conformist | `[CF]` | Adopts upstream model without translation |
| Anti-Corruption Layer | `[ACL]` | Translates between models to protect downstream |
| Published Language | `[PL]` | Uses a shared, documented language |
| Shared Kernel | `[SK]` | Shares a subset of the domain model |
| Partnership | `[P]` | Two contexts coordinate development together |
| Big Ball of Mud | `[BBoM]` | No clear structure (anti-pattern) |

Full names are also valid: `[OpenHostService]`, `[AntiCorruptionLayer]`, etc.

## Relationship types

Used after the arrow and optional pattern annotations:

| Type | Usage |
|------|-------|
| `Partnership` | Two contexts evolve together |
| `SharedKernel` | Shared model subset |
| `CustomerSupplier` | Consumer-provider relationship |
| `UpstreamDownstream` | General directional dependency |
| `SeparateWays` | No integration |

```dlang
[OHS] this -> [ACL] Payments : UpstreamDownstream
[P] this <-> [P] Shipping : Partnership
this >< LegacySystem : SeparateWays
```

## Assignment operators

All equivalent:

| Operator | Example |
|----------|---------|
| `:` | `description: "text"` |
| `=` | `description = "text"` |
| `is` | `description is "text"` |

Prefer `:` (colon) for consistency.

## Strings

Both single and double quotes work:

```dlang
description: "Double quotes"
vision: 'Single quotes'
```

## Comments

```dlang
// Single-line comment

/* Multi-line
   comment */
```

## Domain properties

| Property | Type | Description |
|----------|------|-------------|
| `description` | string | What the domain covers |
| `vision` | string | Strategic goal or aspiration |
| `type` | Classification | Strategic importance |

## Subdomain hierarchy

```dlang
Domain Retail {}
Domain Sales in Retail {}
Domain Marketing in Retail {}
```

## Namespace declaration

```dlang
// Dot notation
Namespace Acme.Sales {
    bc Orders for Sales {}
}

// Nesting
Namespace Acme {
    Namespace Sales {
        bc Orders for Sales {}
    }
}
```

## Import types

| Type | Syntax | Requires model.yaml |
|------|--------|---------------------|
| Relative | `import "./path.dlang"` | No |
| Path alias | `import "@shared/teams"` | Yes (paths config) |
| External | `import "owner/package"` | Yes (dependencies) |

Aliased imports:

```dlang
import "./shared.dlang" as shared
import "acme/core" as Core

bc Orders as Core.CoreDomain by shared.SalesTeam {}
```

## model.yaml structure

```yaml
model:
  name: owner/package-name
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"

dependencies:
  acme/ddd-core: "v1.0.0"
  acme/compliance:
    ref: v2.0.0
    description: "Compliance classifications"
```

## Resolution order (imports without extension)

1. `./path/index.dlang` (directory entry point)
2. `./path.dlang` (direct file)

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
// Full form with header keywords
BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"

    terminology {
        term Order: "A customer's request to purchase one or more items"
        term OrderLine: "A single line item representing a product and quantity"
        term OrderStatus: "Current state of an order (Pending, Confirmed, Shipped)"
            aka Status
            examples "Pending", "Confirmed", "Shipped"
    }

    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order value is $10"
    }

    metadata {
        Language: "TypeScript"
        Status: "Production"
    }

    relationships {
        [OHS] this -> [CF] Billing
    }
}

// Minimal (body is optional)
BoundedContext Orders for Sales

// Body properties (alternative to header keywords)
BoundedContext Orders for Sales {
    classification: CoreDomain   // Alternative to 'as'
    team: SalesTeam              // Alternative to 'by'
    businessModel: "B2B"
    evolution: "Custom Built"
    archetype: "Execution"
}
```

The `for` keyword links a bounded context to its parent domain.

### Terminology (ubiquitous language)

```dlang
BoundedContext Orders for Sales {
    terminology {
        term Order: "A customer's request to purchase one or more items"
        term OrderLine: "A single line item representing a product and quantity"
        term OrderStatus: "Current state of an order (Pending, Confirmed, Shipped)"
            aka Status
            examples "Pending", "Confirmed", "Shipped"
    }
}
```

Terms support:
- `aka` (or `synonyms`) — alternative names for the term
- `examples` — example values

### Decisions and governance

```dlang
Classification Architectural

BoundedContext Orders for Sales {
    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order value is $10"
    }
}
```

Decisions, policies, and rules can be tagged with a classification:

```dlang
BoundedContext Orders for Sales {
    decisions {
        decision [Architectural] EventSourcing: "Capture every state change"
        rule [Architectural] Idempotency: "All write operations must be idempotent"
    }
}
```

### Metadata

Metadata keys must be declared before use:

```dlang
Metadata Status
Metadata Language
Metadata Repository

BoundedContext Orders for Sales {
    metadata {
        Status: "Production"
        Language: "TypeScript"
        Repository: "github.com/acme/orders"
    }
}
```

### Inline relationships

Use the `this` keyword inside a bounded context to define relationships inline:

```dlang
BoundedContext Orders for Sales {
    relationships {
        [OHS] this -> [CF] Billing
        [ACL] this <- Payments
    }
}
```

### Teams and classifications

```dlang
Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain

Team SalesTeam
Team PlatformTeam
Team DataTeam
```

### Context maps

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping

    [OHS] Orders -> [CF] Billing
    [ACL] Shipping <- Orders
    [P] Orders <-> [P] Inventory
    Orders >< Legacy
}
```

#### Relationship arrows

| Arrow | Meaning |
| ----- | ------- |
| `->` | Upstream to downstream (left provides, right consumes) |
| `<-` | Downstream to upstream (right provides, left consumes) |
| `<->` | Bidirectional / Partnership |
| `><` | Separate Ways (no integration) |

#### Integration patterns

| Pattern | Short | Long form | Placement |
| ------- | ----- | --------- | --------- |
| Open Host Service | `[OHS]` | `[OpenHostService]` | Upstream side |
| Conformist | `[CF]` | `[Conformist]` | Downstream side |
| Anti-Corruption Layer | `[ACL]` | `[AntiCorruptionLayer]` | Downstream side |
| Published Language | `[PL]` | `[PublishedLanguage]` | Upstream side |
| Shared Kernel | `[SK]` | `[SharedKernel]` | Both sides (requires `<->`) |
| Partnership | `[P]` | `[Partnership]` | Both sides (requires `<->`) |
| Big Ball of Mud | `[BBoM]` | `[BigBallOfMud]` | Either side |

**Pattern placement rules:**
- With `->`: left is **upstream**, right is **downstream**
- `[OHS]` and `[PL]` go on the upstream (provider) side
- `[CF]` and `[ACL]` go on the downstream (consumer) side
- `[SK]` and `[P]` require bidirectional arrow `<->`

```dlang
// ✅ Correct: OHS on upstream, CF on downstream
[OHS] Orders -> [CF] Billing

// ✅ Correct: ACL on downstream (left side of <-)
[ACL] Shipping <- Orders

// ❌ Wrong: CF on upstream side — validator warns
[CF] Orders -> [OHS] Billing
```

#### Relationship types

Annotate relationships with a semantic type:

```dlang
[OHS] Orders -> [CF] Payments : UpstreamDownstream
[P] Orders <-> [P] Inventory : Partnership
```

Available types: `Partnership`, `SharedKernel`, `CustomerSupplier`, `UpstreamDownstream`, `SeparateWays`.

### Domain maps

```dlang
DomainMap Portfolio {
    contains Sales, Support, Platform
}
```

Domain maps reference domains (not bounded contexts) for high-level portfolio visualization.

### Namespaces

```dlang
Namespace Acme.Sales {
    Domain Sales { vision: "Revenue generation" }
    BoundedContext Orders for Sales { }
}

// Reference with fully qualified name
ContextMap System {
    contains Acme.Sales.Orders
}
```

### Imports

```dlang
// Relative imports
import "./shared/teams.dlang"
import "../common/classifications.dlang"

// Path alias imports (configured in model.yaml)
import "@shared/teams"
import "@domains/sales"

// External package imports
import "acme/ddd-core" as Core

// Use imported types with alias prefix
BoundedContext Orders for Core.SalesDomain as Core.CoreDomain { }
```

## Project structure

### model.yaml manifest

```yaml
model:
  name: my-company/domain-model
  version: 1.0.0
  entry: index.dlang

paths:
  "@": "./"
  "@shared": "./shared"
  "@domains": "./domains"

dependencies:
  acme/ddd-core: "v1.0.0"
  acme/compliance:
    ref: v2.0.0
    description: "Compliance classifications"

overrides:
  acme/utils: "v3.0.0"

governance:
  allowedSources:
    - github.com/acme
  requireStableVersions: true
```

### Typical file organization

```text
my-project/
├── model.yaml
├── model.lock           # Generated by dlang install
├── index.dlang          # Entry point
├── domains/
│   ├── sales/
│   │   └── index.dlang
│   └── shipping/
│       └── index.dlang
└── shared/
    ├── teams.dlang
    └── classifications.dlang
```

## CLI commands

| Command | Description |
| ------- | ----------- |
| `dlang init` | Interactive project scaffolding |
| `dlang validate` | Validate models with diagnostics |
| `dlang query domains` | Query domains in the model |
| `dlang query bcs` | Query bounded contexts |
| `dlang install` | Install dependencies, generate lock file |
| `dlang add <specifier>` | Add a dependency |
| `dlang remove <name>` | Remove a dependency |
| `dlang outdated` | Check for available updates |
| `dlang update` | Update branch dependencies |
| `dlang upgrade <name> <version>` | Upgrade to a newer version |
| `dlang cache-clear` | Clear the dependency cache |

## Validation rules

The language server validates models and reports issues:

| Rule | Severity |
| ---- | -------- |
| Missing domain `vision` | Warning |
| Missing bounded context `description` | Warning |
| Bounded context without parent domain (`for`) | Warning |
| Duplicate fully-qualified names | Error |
| Circular domain hierarchy | Error |
| `[ACL]` or `[CF]` on upstream side | Warning |
| `[SK]` without bidirectional arrow (`<->`) | Warning |
| Empty context map (no contexts) | Warning |
| Duplicate relationship in context map | Warning |
| Header/body conflict for classification or team | Warning |

## Complete example

```dlang
// shared/classifications.dlang
Classification CoreDomain
Classification SupportingDomain

// shared/teams.dlang
Team SalesTeam
Team ShippingTeam

// domains/sales.dlang
import "@shared/classifications"
import "@shared/teams"

Metadata Language
Metadata Status

Domain Sales {
    description: "Revenue generation and customer acquisition"
    vision: "Make it easy to buy"
}

BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"

    terminology {
        term Order: "A customer's request to purchase"
            aka PurchaseOrder
            examples "Order #12345"
        term OrderLine: "A single line item in an order"
    }

    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order value is $10"
    }

    metadata {
        Language: "TypeScript"
        Status: "Production"
    }

    relationships {
        [OHS] this -> [CF] Billing
    }
}

BoundedContext Billing for Sales as SupportingDomain by SalesTeam {
    description: "Invoice generation and payment tracking"
}

// index.dlang
import "@domains/sales"
import "@domains/shipping"

ContextMap SalesLandscape {
    contains Orders, Billing, Shipping

    [OHS] Orders -> [CF] Billing
    [OHS] Orders -> [ACL] Shipping
}

DomainMap Portfolio {
    contains Sales, Shipping
}
```

## Reference

- Full syntax: [SYNTAX.md](references/SYNTAX.md)
- Documentation: [domainlang.net](https://domainlang.net)
- Language reference: [domainlang.net/reference/language](https://domainlang.net/reference/language)
- Getting started: [domainlang.net/guide/getting-started](https://domainlang.net/guide/getting-started)

# Quick reference

A syntax cheat sheet for DomainLang. Keep this page open while modeling.

::: tip
For detailed explanations, see the [Language Reference](/reference/language).
:::

## Minimal model

```dlang
Domain Sales { description: "Sales" }

BoundedContext Orders for Sales {
    description: "Order lifecycle"
}
```

## Declarations

| Concept | Keywords | Notes |
| ------- | -------- | ----- |
| Domain | `Domain`, `dom` | Use `in` for subdomains |
| Bounded context | `BoundedContext`, `bc` | Use `for` to link domain |
| Team | `Team` | Ownership via `by` |
| Classification | `Classification` | Reusable labels |
| Metadata key | `Metadata` | Declares allowed keys |
| Namespace | `Namespace`, `ns` | Qualified names |
| Context map | `ContextMap`, `cmap` | Context relationships |
| Domain map | `DomainMap`, `dmap` | Domain portfolio |
| Import | `import`, `Import` | Module system |

## Block aliases

Inside bounded contexts:

| Block | Alias |
| ----- | ----- |
| `terminology` | `glossary` |
| `metadata` | `meta` |
| `decisions` | `rules` |
| `relationships` | `integrations` |

## Assignment operators

All equivalent: `:`, `=`, `is`

```dlang
description: "Using colon"
vision = "Using equals"
team is SalesTeam
```

## Bounded context shortcuts

```dlang
// Header form (recommended)
BoundedContext Orders for Sales as CoreDomain by SalesTeam { }

// Body form (equivalent)
BoundedContext Orders for Sales {
    classification: CoreDomain
    team: SalesTeam
}
```

## Full bounded context

```dlang
Metadata Language
Metadata Database

BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"

    metadata {
        Language: "TypeScript"
        Database: "PostgreSQL"
    }

    terminology {
        term Order: "A customer's request to purchase"
            aka PurchaseOrder
            examples "Order #12345"
    }

    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order is $10"
    }

    relationships {
        this [OHS] -> [ACL] Payments
    }
}
```

## Context map relationships

```dlang
ContextMap System {
    contains Orders, Payments, Shipping, Inventory, Legacy
    
    // Directional — left provides, right consumes
    Orders -> Payments
    Orders [OHS] -> [CF] Payments
    Orders [OHS, PL] -> [CF, ACL] Payments
    
    // Customer/Supplier
    Orders [S] -> [C] Shipping
    
    // Reverse directional — right is upstream; patterns still follow upstream/downstream sides
    Payments [ACL] <- Orders                // Payments side only (downstream)
    Payments [CF] <- [OHS] Orders           // both sides annotated (upstream on right, downstream on left)
    
    // Bidirectional — both sides specify their role
    Orders [OHS] <-> [CF] Payments
    Orders [PL] <-> [ACL] Shipping
    
    // Symmetric patterns (no arrow)
    Orders [SK] Inventory            // shared kernel
    Orders [P] Inventory             // partnership
    Orders [SW] Legacy               // separate ways
    Orders >< Legacy                 // separate ways (arrow form)
}
```

## Integration patterns

### Directional patterns (with `->`, `<-`, and `<->`)

| Pattern | Short | Side | Description |
| ------- | ----- | ---- | ----------- |
| Open Host Service | `[OHS]` | Upstream | Published protocol |
| Published Language | `[PL]` | Upstream | Shared language |
| Supplier | `[S]` | Upstream | Supplies service |
| Conformist | `[CF]` | Downstream | Adopts upstream |
| Anti-Corruption Layer | `[ACL]` | Downstream | Translates models |
| Customer | `[C]` | Downstream | Consumes service |
| Big Ball of Mud | `[BBoM]` | Either | No structure |

### Symmetric patterns (no arrow)

Symmetric patterns sit between entities with no arrow:

| Pattern | Short | Arrow form | Description |
| ------- | ----- | ---------- | ----------- |
| Shared Kernel | `[SK]` | — | Shared model |
| Partnership | `[P]` | — | Co-development |
| Separate Ways | `[SW]` | `><` | No integration |

## Namespaces

```dlang
Namespace Acme.Sales {
    BoundedContext Orders for Sales { }
}

// Reference with FQN
ContextMap SalesMap {
    contains Acme.Sales.Orders
}
```

## Imports

```dlang
import "./shared.dlang"
import "../common/teams.dlang"
import "acme/core" as Core

BoundedContext Orders for Core.SalesDomain { }
```

## Subdomains

```dlang
Domain Retail { }
Domain Sales in Retail { }
Domain Marketing in Retail { }
```

## Terminology

```dlang
terminology {
    term Order: "A purchase request"
        aka PurchaseOrder, BuyOrder
        examples "Order #12345", "Purchase #67890"
}
```

## Decisions

```dlang
Classification Architectural
Classification Business

decisions {
    decision [Architectural] EventSourcing: "Use events"
    policy [Business] Refunds: "30 day returns"
    rule [Business] MinOrder: "$10 minimum"
}
```

## Metadata

```dlang
// Declare keys first
Metadata Language
Metadata Database
Metadata Repository

// Use in bounded context
metadata {
    Language: "TypeScript"
    Database: "PostgreSQL"
    Repository: "github.com/acme/orders"
}
```

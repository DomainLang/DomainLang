# Context maps

A **context map** visualize the relationships between bounded contexts. It shows how contexts integrate and which patterns govern their interactions.

## Keywords

| Keyword | Alias |
| ------- | ----- |
| `ContextMap` | `cmap` |

## Basic syntax

Use `ContextMap` (or the alias `cmap`) to declare a map and list the contexts it contains:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping
}
```

## Relationships

Add relationships inside the map body. An arrow expresses an upstream/downstream dependency between two contexts:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping

    Orders -> Billing
    Orders -> Shipping
}
```

All three directional arrow forms are equivalent in semantics — use whichever reads most naturally in your model:

| Arrow | Meaning |
| ----- | ------- |
| `->` | Left is upstream, right is downstream |
| `<-` | Right is upstream, left is downstream |
| `<->` | Mutual dependency — both contexts integrate with each other |

## Integration patterns

Annotate each side of a relationship with a DDD integration pattern. Patterns are placed between the context name and the arrow, in square brackets:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping

    Orders [OHS] -> [CF] Billing       // Orders publishes an open protocol; Billing conforms
    Orders -> [ACL] Shipping           // Shipping protects itself with an anti-corruption layer
}
```

### Directional patterns

These patterns apply to relationships with `->`, `<-`, or `<->`. Upstream and downstream refer to the direction of dependency, not the arrow direction:

| Pattern | Keyword | Long form | Side | Description |
| ------- | ------- | --------- | ---- | ----------- |
| Open Host Service | `[OHS]` | `[OpenHostService]` | Upstream | Publishes a well-defined protocol for consumers |
| Published Language | `[PL]` | `[PublishedLanguage]` | Upstream | Uses a shared, documented language for integration |
| Supplier | `[S]` | `[Supplier]` | Upstream | Supplies a capability to a customer context |
| Conformist | `[CF]` | `[Conformist]` | Downstream | Adopts the upstream model without translation |
| Anti-Corruption Layer | `[ACL]` | `[AntiCorruptionLayer]` | Downstream | Translates between models to protect the downstream context |
| Customer | `[C]` | `[Customer]` | Downstream | Consumes a capability from a supplier context |
| Big Ball of Mud | `[BBoM]` | `[BigBallOfMud]` | Either | No clear model structure (legacy or brownfield) |

Multiple patterns per side are comma-separated: `[OHS, PL]`.

### Symmetric patterns

Some relationships have no direction — neither context is upstream or downstream. Symmetric patterns sit between the two context names with no arrow:

| Pattern | Keyword | Long form | Description |
| ------- | ------- | --------- | ----------- |
| Shared Kernel | `[SK]` | `[SharedKernel]` | Both contexts share a subset of the domain model |
| Partnership | `[P]` | `[Partnership]` | Both teams co-evolve their models together |
| Separate Ways | `[SW]` | `[SeparateWays]` | No integration — each context evolves independently |

```dlang
Orders [SK] Inventory      // shared model subset
Orders [P] Catalog         // coordinated development
Orders [SW] LegacyBilling  // no integration
```

Separate Ways also has an arrow form: `Orders >< LegacyBilling` (equivalent to `[SW]`).

## Combining patterns

You can put patterns on either or both sides of a directional relationship. Side placement follows the upstream/downstream role, not the arrow direction:

```dlang
ContextMap Integration {
    contains Orders, Billing, Catalog, Shipping, Inventory

    // Single pattern on each side
    Catalog [OHS] -> [CF] Orders

    // Multiple patterns on the upstream side
    Catalog [OHS, PL] -> [CF, ACL] Billing

    // Customer/Supplier: explicit supply-chain relationship
    Orders [S] -> [C] Inventory

    // Reverse arrow — equivalent to Catalog [OHS] -> [CF] Shipping
    Shipping [CF] <- [OHS] Catalog

    // Bidirectional — both sides name their role
    Orders [OHS] <-> [CF] Billing

    // Symmetric — no arrow
    Orders [P] Catalog
}
```

## Multiple context maps

A single map doesn't have to represent everything. Split concerns across separate maps:

```dlang
// Technical integration: who calls whom
ContextMap TechnicalIntegration {
    contains Orders, Inventory, Payments

    Orders -> Inventory
    Orders -> Payments
}

// Team dependencies: coordination patterns
ContextMap TeamDependencies {
    contains OrderContext, InventoryContext

    OrderContext [P] InventoryContext
}
```

::: tip Keep maps focused
Separate maps for different concerns — technical integration, team ownership, data flow — are easier to reason about than one map that tries to show everything.
:::

::: warning Watch the size
More than 7–10 contexts in a single map is usually a sign to split the map or revisit your context boundaries.
:::

## Examples

### E-commerce system

```dlang
ContextMap ECommerceSystem {
    contains Catalog, Orders, Payments, Shipping, Notifications

    Catalog [OHS, PL] -> [CF] Orders
    Orders [OHS] -> [CF] Payments
    Orders [OHS] -> [CF] Shipping
    Orders [OHS] -> [CF] Notifications
    Shipping [SW] Notifications
}
```

### Microservices integration

```dlang
ContextMap MicroservicesMap {
    contains UserService, OrderService, ProductService, NotificationService

    UserService [OHS] -> [CF] OrderService
    ProductService [OHS] -> [CF] OrderService
    OrderService [OHS] -> [ACL] NotificationService
}
```

## Domain maps

For a high-level view of your domain portfolio rather than individual contexts, use `DomainMap` (alias `dmap`):

```dlang
DomainMap Portfolio {
    contains Sales, Support, Platform
}
```

Domain maps reference domains, not bounded contexts, and give a strategic overview of your entire portfolio.

## Next steps

- [Teams & classifications](/guide/teams-classifications) — assign ownership and strategic importance
- [Namespaces](/guide/namespaces) — organize large models
- [Import system](/guide/imports) — split models across files

## See also

- [Language reference: relationships](/reference/language#relationships) — complete syntax and pattern reference


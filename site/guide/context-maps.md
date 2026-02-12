# Context Maps

A **context map** visualizes the relationships between bounded contexts. It shows how contexts integrate and which patterns govern their interactions.

## Keywords

| Keyword | Alias |
| ------- | ----- |
| `ContextMap` | `cmap` |

## Basic syntax

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping
}
```

## Relationship arrows

| Arrow | Meaning |
| ----- | ------- |
| `->` | Upstream to downstream (left provides, right consumes) |
| `<-` | Downstream to upstream (right provides, left consumes) |
| `<->` | Bidirectional / Partnership |
| `><` | Separate Ways (no integration) |

## Relationships

Define how contexts relate to each other:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping
    
    Orders -> Billing
    Orders -> Shipping
}
```

The arrow shows the direction of dependency or data flow.

## Integration patterns

Annotate relationships with DDD integration patterns:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping
    
    [OHS] Orders -> [CF] Billing
    [ACL] Shipping <- Orders
}
```

### Available patterns

| Pattern | Keyword | Long form | Description |
| ------- | ------- | --------- | ----------- |
| Open Host Service | `[OHS]` | `[OpenHostService]` | Provides a well-defined protocol for others to consume |
| Conformist | `[CF]` | `[Conformist]` | Adopts the upstream model without translation |
| Anti-Corruption Layer | `[ACL]` | `[AntiCorruptionLayer]` | Translates between models to protect the downstream context |
| Published Language | `[PL]` | `[PublishedLanguage]` | Uses a shared, documented language for integration |
| Shared Kernel | `[SK]` | `[SharedKernel]` | Shares a subset of the domain model |
| Partnership | `[P]` | `[Partnership]` | Two contexts coordinate development together |
| Big Ball of Mud | `[BBoM]` | `[BigBallOfMud]` | No clear model structure (legacy, brownfield) |

## Pattern combinations

Patterns can be on either or both sides:

```dlang
ContextMap Integration {
    contains A, B, C, D
    
    // Upstream provides OHS, downstream conforms
    [OHS] A -> [CF] B
    
    // Downstream protects itself with ACL
    [ACL] C <- D
    
    // Partnership between equals
    [P] A <-> [P] B
}
```

## Bidirectional relationships

Use `<->` for mutual dependencies:

```dlang
ContextMap Partnership {
    contains Frontend, Backend
    
    [P] Frontend <-> [P] Backend
}
```

## Relationship types

You can annotate a relationship with a semantic type using the `: Type` suffix:

```dlang
ContextMap TeamDeps {
    contains Orders, Payments, Inventory
    
    [OHS] Orders -> [CF] Payments : UpstreamDownstream
    [P] Orders <-> [P] Inventory : Partnership
}
```

Available relationship types: `Partnership`, `SharedKernel`, `CustomerSupplier`, `UpstreamDownstream`, `SeparateWays`.

## Multiple context maps

Large systems often have multiple maps for different views:

```dlang
// Technical integration view
ContextMap TechnicalIntegration {
    contains Orders, Inventory, Payments
    
    Orders -> Inventory
    Orders -> Payments
}

// Team communication view
ContextMap TeamDependencies {
    contains OrderContext, InventoryContext
    
    [P] OrderContext <-> [P] InventoryContext
}
```

## Best practices

::: tip Keep maps focused
Create separate context maps for different concerns: technical integration, team dependencies, data flow. Don't try to show everything in one map.
:::

::: warning Avoid god maps
If your context map has too many contexts (more than 7-10), consider breaking it into focused sub-maps or reviewing your context boundaries.
:::

## Examples

### E-commerce system

```dlang
ContextMap ECommerceSystem {
    contains Catalog, Orders, Payments, Shipping, Notifications
    
    // Orders orchestrates the flow
    [OHS] Orders -> [CF] Payments
    [OHS] Orders -> [CF] Shipping
    [OHS] Orders -> [CF] Notifications
    
    // Catalog provides product data
    [OHS,PL] Catalog -> [CF] Orders
    
    // External carriers integration
    [BBoM] Shipping >< Notifications
}
```

### Microservices integration

```dlang
ContextMap MicroservicesMap {
    contains UserService, OrderService, ProductService, NotificationService
    
    [OHS] UserService -> [CF] OrderService
    [OHS] ProductService -> [CF] OrderService
    [OHS] OrderService -> [ACL] NotificationService
}
```

## Domain maps

For a high-level view of your domain portfolio, use `DomainMap` (alias `dmap`):

```dlang
DomainMap Portfolio {
    contains Sales, Support, Platform
}
```

Domain maps work like context maps but reference domains instead of bounded contexts. Use them to visualize your domain hierarchy at the strategic level.

## Next steps

- [Teams & classifications](/guide/teams-classifications) — assign ownership and strategic importance
- [Namespaces](/guide/namespaces) — organize large models
- [Import system](/guide/imports) — split models across files

## See also

- [Language reference: context maps](/reference/language#context-maps) — complete syntax details
- [Language reference: relationships](/reference/language#relationships) — integration patterns and arrows

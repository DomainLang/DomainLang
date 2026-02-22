# Bounded Contexts

A **bounded context** is a concrete boundary within which a particular domain model applies. It's the primary organizational unit in DDD—where your ubiquitous language lives.

## Keywords

| Keyword | Alias |
| ------- | ----- |
| `BoundedContext` | `bc` |

::: tip Shorthand aliases
DomainLang provides short aliases for common keywords. You can write `bc` instead of `BoundedContext`, `cmap` instead of `ContextMap`, and so on. This guide uses the full keywords for clarity — see the [language reference](/reference/language#keywords-and-aliases) for the complete list.
:::

## Basic syntax

```dlang
BoundedContext Orders for Sales {
    description: "Order lifecycle and orchestration"
}
```

The `for` keyword links the bounded context to its parent domain.

::: tip Optional body
The body `{ ... }` is optional. For quick declarations, you can write:

```dlang
BoundedContext Orders for Sales
BoundedContext Shipping for Sales as Supporting by ShippingTeam
```

This is useful for sketching out your context landscape before adding details.
:::

## Full syntax

```dlang
BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"
    
    terminology {
        term Order: "A customer's request to purchase"
        term OrderLine: "A single line item in an order"
    }
}
```

## Properties

| Property | Type | Description |
| -------- | ---- | ----------- |
| `description` | string | Purpose and business value of the context |
| `classification` | Classification | Strategic importance (alternative to `as` in header) |
| `team` | Team | Owning team (alternative to `by` in header) |
| `businessModel` | Classification | Business model type (Revenue, Engagement, Compliance) |
| `evolution` | Classification | Maturity stage (Genesis, Custom, Product, Commodity) |
| `archetype` | Classification | Domain role (Gateway, Execution, Analysis, etc.) |

## Header options

Use the short form in the header for common attributes:

```dlang
BoundedContext Orders for Sales as CoreDomain by SalesTeam { }
```

| Keyword | Purpose | Example |
|---------|---------|---------|
| `for` | Parent domain | `for Sales` |
| `as` | Strategic classification | `as CoreDomain` |
| `by` | Owning team | `by SalesTeam` |

## Body properties

```dlang
// Declare metadata keys first
Metadata Status
Metadata Language

BoundedContext Orders for Sales {
    description: "Order lifecycle"
    
    classification: CoreDomain      // Alternative to 'as'
    team: SalesTeam                 // Alternative to 'by'
    
    terminology {
        term Order: "A purchase request"
    }
    
    metadata {
        Status: "Production"
        Language: "TypeScript"
    }
}
```

## Block aliases

Blocks inside bounded contexts have aliases for readability:

| Block | Alias |
| ----- | ----- |
| `terminology` | `glossary` |
| `metadata` | `meta` |
| `decisions` | `rules` |
| `relationships` | `integrations` |

## Terminology

Document the ubiquitous language within each bounded context:

```dlang
BoundedContext Orders for Sales {
    terminology {
        term Order: "A customer's request to purchase one or more items"
        term OrderLine: "A single line item representing a product and quantity"
        term OrderStatus: "The current state of an order (Pending, Confirmed, Shipped)"
    }
}
```

### Synonyms and examples

Terms can include alternative names (`aka`) and usage examples:

```dlang
BoundedContext Orders for Sales {
    terminology {
        term Order: "A customer's request to purchase"
            aka PurchaseOrder
            examples "Order #12345", "Purchase #67890"
        term OrderLine: "A single line item in an order"
    }
}
```

::: tip
The terminology block captures your ubiquitous language—the precise definitions that the team agrees upon. Synonyms help link different department vocabularies to the canonical term.
:::

## Metadata

Add custom key-value annotations by first declaring metadata keys:

```dlang
// Declare metadata keys first
Metadata Status
Metadata Language
Metadata Repository
Metadata Oncall

BoundedContext Orders for Sales {
    metadata {
        Status: "Production"
        Language: "TypeScript"
        Repository: "github.com/acme/orders"
        Oncall: "#orders-team"
    }
}
```

::: tip
Metadata keys must be declared before use. Put shared metadata definitions in a common file and import them. See [Imports](/guide/imports) for file organization.
:::

## Decisions and governance

Capture architecture decisions, policies, and business rules inside a bounded context:

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
        policy Refunds: "Allow refunds within 30 days"
        rule [Architectural] Idempotency: "All write operations must be idempotent"
    }
}
```

The `decisions` block also has the alias `rules`.

## Inline relationships

Define integration relationships directly inside a bounded context using the `relationships` block (alias `integrations`). Use the `this` keyword to refer to the current context:

```dlang
BoundedContext Orders for Sales {
    relationships {
        this [OHS] -> [CF] Billing
        Payments -> [ACL] this
    }
}
```

These relationships are equivalent to declaring them inside a context map, but keep the integration knowledge close to the bounded context that owns it.

## Best practices

::: warning Context boundaries
A bounded context should have a clear, autonomous boundary. If two contexts share too much, consider merging them. If one context does too much, consider splitting it.
:::

::: tip Naming
Name bounded contexts after the capability they provide, not the team that owns them. Teams change; capabilities persist.
:::

## Examples

### Multiple contexts in a domain

```dlang
Domain Sales {
    description: "Revenue generation"
}

BoundedContext OrderManagement for Sales as CoreDomain by OrderTeam {
    description: "Order lifecycle from creation to completion"
}

BoundedContext Pricing for Sales as CoreDomain by PricingTeam {
    description: "Dynamic pricing and discounts"
}

BoundedContext CustomerService for Sales as SupportingDomain by SupportTeam {
    description: "Post-sale customer support"
}
```

### Context with rich terminology

```dlang
BoundedContext Shipping for Logistics as CoreDomain by ShippingTeam {
    description: "Package routing and delivery"
    
    terminology {
        term Shipment: "A collection of packages traveling together"
        term Package: "A single physical item to be delivered"
        term Carrier: "The company performing the delivery"
        term TrackingNumber: "Unique identifier for shipment tracking"
        term DeliveryWindow: "Expected time range for delivery"
    }
}
```

## Next steps

- [Context maps](/guide/context-maps) — define relationships between bounded contexts
- [Teams & classifications](/guide/teams-classifications) — organize ownership and strategy

## See also

- [Language reference: bounded contexts](/reference/language#bounded-contexts) — complete syntax details
- [Language reference: terminology](/reference/language#terminology) — ubiquitous language syntax
- [Language reference: metadata](/reference/language#metadata) — metadata key-value annotations

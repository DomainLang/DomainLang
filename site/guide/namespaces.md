# Namespaces

Namespaces organize your model into logical groups and create qualified names for elements. They're essential for large models and multi-team environments.

## Keywords

| Keyword | Alias |
| ------- | ----- |
| `Namespace` | `ns` |

## Basic syntax

```dlang
Namespace Acme.Sales {
    Domain Sales { }
    
    BoundedContext Orders for Sales { }
    BoundedContext Billing for Sales { }
}
```

Elements inside the namespace get qualified names like `Acme.Sales.Orders`.

## Why use namespaces?

1. **Avoid name collisions** — Different teams can use the same names
2. **Organize large models** — Group related concepts together
3. **Mirror code structure** — Align with package/module organization
4. **Enable imports** — Reference elements from other namespaces

## Referencing elements

### Within the same namespace

Use simple names:

```dlang
Namespace Acme.Sales {
    BoundedContext Orders for Sales { }
    BoundedContext Billing for Sales { }
    
    ContextMap SalesMap {
        contains Orders, Billing
    }
}
```

### Across namespaces

Use fully qualified names:

```dlang
Namespace Acme.Sales {
    BoundedContext Orders for Sales { }
}

Namespace Acme.Shipping {
    BoundedContext Delivery for Logistics { }
}

ContextMap Integration {
    contains Acme.Sales.Orders, Acme.Shipping.Delivery
    Acme.Sales.Orders -> Acme.Shipping.Delivery
}
```

## Nested namespaces

Namespaces can be nested:

```dlang
Namespace Acme {
    Namespace Sales {
        BoundedContext Orders for Sales { }
    }
    
    Namespace Shipping {
        BoundedContext Delivery for Logistics { }
    }
}
```

Or use dot notation:

```dlang
Namespace Acme.Sales {
    BoundedContext Orders for Sales { }
}

Namespace Acme.Shipping {
    BoundedContext Delivery for Logistics { }
}
```

## Shared elements

Define reusable elements at a higher namespace level:

```dlang
Namespace Acme {
    // Shared across all Acme namespaces
    Classification CoreDomain
    Classification SupportingDomain
    
    Team PlatformTeam
}

Namespace Acme.Sales {
    Team SalesTeam
    
    BoundedContext Orders for Sales as Acme.CoreDomain by SalesTeam { }
}

Namespace Acme.Platform {
    BoundedContext Auth for Platform as Acme.SupportingDomain by Acme.PlatformTeam { }
}
```

## Best practices

::: tip Mirror your organization
Align namespace structure with your organizational structure or codebase layout. This makes it easier to find and maintain models.
:::

::: tip Keep it shallow
Avoid deeply nested namespaces. Two or three levels is usually enough: `Company.Division.Team` or `Product.Module`.
:::

::: warning Don't over-namespace
For small models, namespaces add complexity without benefit. Start without them and add as needed.
:::

## Example: multi-team organization

```dlang
// Shared definitions
Namespace Acme.Shared {
    Classification CoreDomain
    Classification SupportingDomain
    Classification GenericSubdomain
}

// Sales division
Namespace Acme.Sales {
    Team OrderTeam
    Team PricingTeam
    
    Domain Sales { description: "Revenue generation" }
    
    BoundedContext Orders for Sales as Acme.Shared.CoreDomain by OrderTeam {
        description: "Order management"
    }
    
    BoundedContext Pricing for Sales as Acme.Shared.CoreDomain by PricingTeam {
        description: "Dynamic pricing"
    }
}

// Platform division
Namespace Acme.Platform {
    Team PlatformTeam
    
    Domain Platform { description: "Shared infrastructure" }
    
    BoundedContext Identity for Platform as Acme.Shared.GenericSubdomain by PlatformTeam {
        description: "Authentication and authorization"
    }
}

// Integration map at company level
Namespace Acme {
    ContextMap CompanyWide {
        contains Sales.Orders, Sales.Pricing, Platform.Identity
        
        Platform.Identity -> Sales.Orders
        Platform.Identity -> Sales.Pricing
    }
}
```

## Next steps

- [Import system](/guide/imports) — split models across multiple files
- [CLI](/guide/cli) — manage multi-file projects
- [Model query SDK](/guide/sdk) — query namespaced elements programmatically

## See also

- [Language reference: namespaces](/reference/language#namespaces) — complete syntax details

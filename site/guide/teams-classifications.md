# Teams & Classifications

Teams and classifications provide organizational context for your domain model—who owns what, and how strategically important each piece is.

## Keywords

| Keyword | Description |
| ------- | ----------- |
| `Classification` | Declares a reusable classification label |
| `Team` | Declares a team for ownership |

## Classifications

Classifications indicate the strategic importance of a bounded context:

```dlang
Classification CoreDomain
Classification SupportingDomain  
Classification GenericSubdomain
```

### Strategic classification types

| Type | Description | Typical Investment |
|------|-------------|-------------------|
| **Core** | Differentiates your business from competitors | High: best engineers, custom solutions |
| **Supporting** | Necessary but not differentiating | Medium: good solutions, possibly outsourced |
| **Generic** | Common to many businesses | Low: buy or use commodity solutions |

### Using classifications

Reference classifications with `as` in the bounded context header:

```dlang
Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain

BoundedContext Orders for Sales as CoreDomain { }
BoundedContext Reporting for Sales as SupportingDomain { }
BoundedContext Authentication for Platform as GenericSubdomain { }
```

## Teams

Teams represent the people responsible for bounded contexts:

```dlang
Team OrderTeam
Team PlatformTeam
Team DataTeam
```

### Using teams

Reference teams with `by` in the bounded context header:

```dlang
Team OrderTeam
Team PlatformTeam

BoundedContext Orders for Sales by OrderTeam { }
BoundedContext UserManagement for Platform by PlatformTeam { }
```

## Combined example

```dlang
// Define organizational elements
Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain

Team SalesTeam
Team PlatformTeam
Team DataTeam

// Define domains
Domain Sales { description: "Revenue generation" }
Domain Platform { description: "Shared infrastructure" }

// Bounded contexts with full context
BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle—our competitive advantage"
}

BoundedContext Analytics for Sales as SupportingDomain by DataTeam {
    description: "Sales analytics and reporting"
}

BoundedContext Authentication for Platform as GenericSubdomain by PlatformTeam {
    description: "User authentication—use standard solutions"
}
```

## Best practices

::: tip Start simple
Begin with just `CoreDomain`, `SupportingDomain`, and `GenericSubdomain`. Add custom classifications only when needed.
:::

::: warning Align with reality
Classifications should reflect actual strategic importance, not aspirations. If you treat everything as "Core," you're not making real strategic decisions.
:::

::: tip Team boundaries
Ideally, team boundaries align with bounded context boundaries. If one team owns multiple contexts, ensure they're closely related.
:::

## Complete example

```dlang
// Classifications
Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain

// Teams
Team ProductTeam
Team OrderTeam
Team PlatformTeam
Team AnalyticsTeam

// Domains
Domain Catalog { description: "Product catalog" }
Domain Sales { description: "Sales and orders" }
Domain Platform { description: "Shared infrastructure" }

// Core bounded contexts—competitive advantage
BoundedContext ProductCatalog for Catalog as CoreDomain by ProductTeam {
    description: "Our curated product experience"
}

BoundedContext OrderManagement for Sales as CoreDomain by OrderTeam {
    description: "Seamless order experience"
}

// Supporting bounded contexts—necessary but not differentiating
BoundedContext SalesReporting for Sales as SupportingDomain by AnalyticsTeam {
    description: "Sales metrics and dashboards"
}

// Generic bounded contexts—commodity
BoundedContext UserAuth for Platform as GenericSubdomain by PlatformTeam {
    description: "Authentication and authorization"
}

BoundedContext EmailService for Platform as GenericSubdomain by PlatformTeam {
    description: "Transactional email delivery"
}
```

## Next steps

- [Standard library](/guide/standard-library) — use ready-made classifications from `domainlang/patterns` instead of declaring them yourself
- [Namespaces](/guide/namespaces) — organize large models
- [Import system](/guide/imports) — split models across files

## See also

- [Language reference: classifications](/reference/language#classifications) — complete syntax details
- [Language reference: teams](/reference/language#teams) — team declaration syntax

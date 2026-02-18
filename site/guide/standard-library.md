# Standard library

The **DomainLang Patterns** library (`domainlang/patterns`) is the official standard library of common DDD classifications and metadata keys. Instead of declaring `CoreDomain`, `SupportingDomain`, and other common types from scratch in every project, import them from the standard library and start modeling immediately.

::: tip One import, five namespaces
A single `import "domainlang/patterns"` gives you strategic classifications, evolution stages, bounded context archetypes, governance tags, and common metadata keys. Use an import alias like `as Patterns` to keep references short and unambiguous.
:::

## Install

Add the standard library to your project with the CLI:

```bash
dlang add domainlang/patterns@v1.0.0
```

This updates your `model.yaml` with the dependency and runs `dlang install` to fetch it.

If you prefer to set it up manually, add the dependency to your [model.yaml](/guide/imports#project-manifest-modelyaml):

```yaml
dependencies:
  domainlang/patterns: "v1.0.0"
```

Then run:

```bash
dlang install
```

## Usage

Import the library in any `.dlang` file. The namespaces (`Strategic`, `Evolution`, etc.) are available directly:

```dlang
import "domainlang/patterns"

BoundedContext Orders for Sales as Strategic.CoreDomain by SalesTeam {
    description: "Order lifecycle"

    metadata {
        Meta.Status: "Production"
        Meta.Language: "TypeScript"
    }
}
```

### Import aliases (recommended)

Use an import alias to make it clear where types come from and to avoid potential name collisions with your own namespaces:

```dlang
import "domainlang/patterns" as Patterns

BoundedContext Orders for Sales as Patterns.Strategic.CoreDomain by SalesTeam {
    description: "Order lifecycle"

    metadata {
        Patterns.Meta.Status: "Production"
        Patterns.Meta.Language: "TypeScript"
    }
}
```

::: tip
The examples on this page use the `as Patterns` alias for clarity. You can choose any alias you like, or omit the alias entirely if there's no ambiguity.
:::

## Namespaces

### `Strategic`

Domain classifications from Eric Evans' strategic design. Use these to communicate where investment and attention should go.

| Classification | Description |
| --- | --- |
| `CoreDomain` | The core differentiating capability of the business |
| `SupportingDomain` | Supports the core domain but is not a differentiator |
| `GenericSubdomain` | Well-understood, can be outsourced or bought off the shelf |

```dlang
import "domainlang/patterns" as Patterns

BoundedContext Orders for Sales as Patterns.Strategic.CoreDomain {
    description: "Our competitive advantage"
}

BoundedContext Auth for Platform as Patterns.Strategic.GenericSubdomain {
    description: "Use an off-the-shelf identity provider"
}
```

### `Evolution`

Wardley Map evolution stages for classifying bounded context maturity. Useful for investment and build-vs-buy decisions.

| Classification | Description |
| --- | --- |
| `Genesis` | Novel and poorly understood, requires exploration |
| `CustomBuilt` | Better understood but still requires custom implementation |
| `Product` | Well-understood, increasingly standardized |
| `Commodity` | Highly standardized, utility-like |

```dlang
import "domainlang/patterns" as Patterns

BoundedContext Pricing for Sales {
    description: "Dynamic pricing engine"
    evolution: Patterns.Evolution.Genesis
}

BoundedContext Email for Platform {
    description: "Transactional email delivery"
    evolution: Patterns.Evolution.Commodity
}
```

### `Archetypes`

Bounded context archetypes describe the primary architectural role of a context. Based on Vlad Khononov's work in *Learning Domain-Driven Design*.

| Classification | Description |
| --- | --- |
| `Execution` | Executes core business processes and workflows |
| `Engagement` | User-facing, focused on interaction and experience |
| `Analysis` | Analytics, reporting, and decision support |
| `Gateway` | Integration with external systems and services |
| `Infrastructure` | Shared technical infrastructure capabilities |
| `Compliance` | Enforces regulatory, legal, or policy requirements |

```dlang
import "domainlang/patterns" as Patterns

BoundedContext Orders for Sales {
    description: "Order processing workflows"
    archetype: Patterns.Archetypes.Execution
}

BoundedContext Dashboard for Analytics {
    description: "Real-time business metrics"
    archetype: Patterns.Archetypes.Analysis
}
```

### `Governance`

Decision classifications for tagging decisions, policies, and rules inside bounded contexts.

| Classification | Description |
| --- | --- |
| `Architectural` | System structure, boundaries, integration patterns |
| `Organizational` | Team structure, ownership, communication |
| `Technical` | Frameworks, libraries, coding standards |
| `Process` | Business processes, workflows, procedures |

```dlang
import "domainlang/patterns" as Patterns

BoundedContext Orders for Sales {
    decisions {
        decision [Patterns.Governance.Architectural] CQRS:
            "Use CQRS for read/write separation"
        decision [Patterns.Governance.Technical] Framework:
            "Use NestJS for the Orders service"
    }
}
```

### `Meta`

Common metadata keys for annotating bounded contexts with operational information.

| Key | Suggested values |
| --- | --- |
| `Status` | Discovery, Development, Production, Sunset, Deprecated |
| `Language` | TypeScript, C#, Java, Go, Python, etc. |
| `Repository` | URL to source code repository |
| `Documentation` | URL to documentation |
| `SLA` | 99.9%, 99.99%, best-effort |
| `DeploymentTarget` | Kubernetes, Serverless, OnPremise, PaaS |
| `APIStyle` | REST, gRPC, GraphQL, Messaging, None |
| `DataStore` | PostgreSQL, MongoDB, EventStore, DynamoDB, etc. |
| `Criticality` | Critical, High, Medium, Low |

::: info Why `Meta` instead of `Metadata`?
`Metadata` is a reserved keyword in DomainLang. The namespace uses `Meta` to avoid conflicts.
:::

```dlang
import "domainlang/patterns" as Patterns

BoundedContext Orders for Sales {
    description: "Order lifecycle"

    metadata {
        Patterns.Meta.Status: "Production"
        Patterns.Meta.Language: "TypeScript"
        Patterns.Meta.Repository: "https://github.com/acme/orders"
        Patterns.Meta.SLA: "99.9%"
        Patterns.Meta.DeploymentTarget: "Kubernetes"
        Patterns.Meta.APIStyle: "gRPC"
        Patterns.Meta.DataStore: "PostgreSQL"
        Patterns.Meta.Criticality: "Critical"
    }
}
```

## Complete example

A full model using multiple namespaces from the standard library:

```dlang
import "domainlang/patterns" as Patterns

Team SalesTeam
Team PlatformTeam
Team DataTeam

Domain Sales {
    description: "Revenue generation"
    vision: "Make buying effortless"
}

Domain Platform {
    description: "Shared infrastructure"
}

// Core business capability — high investment
BoundedContext Orders for Sales
    as Patterns.Strategic.CoreDomain by SalesTeam {
    description: "Order lifecycle and orchestration"
    evolution: Patterns.Evolution.CustomBuilt
    archetype: Patterns.Archetypes.Execution

    metadata {
        Patterns.Meta.Status: "Production"
        Patterns.Meta.Language: "TypeScript"
        Patterns.Meta.APIStyle: "gRPC"
    }

    decisions {
        decision [Patterns.Governance.Architectural] EventSourcing:
            "Capture every state change for audit and replay"
    }
}

// Supporting context — needed but not differentiating
BoundedContext Analytics for Sales
    as Patterns.Strategic.SupportingDomain by DataTeam {
    description: "Sales dashboards and reporting"
    archetype: Patterns.Archetypes.Analysis

    metadata {
        Patterns.Meta.Status: "Development"
        Patterns.Meta.Language: "Python"
    }
}

// Generic — use commodity solution
BoundedContext Auth for Platform
    as Patterns.Strategic.GenericSubdomain by PlatformTeam {
    description: "Authentication and authorization"
    evolution: Patterns.Evolution.Commodity
    archetype: Patterns.Archetypes.Infrastructure

    metadata {
        Patterns.Meta.Status: "Production"
        Patterns.Meta.DeploymentTarget: "Serverless"
    }
}

ContextMap SalesLandscape {
    contains Orders, Analytics, Auth
    [OHS] Orders -> [CF] Analytics
    [ACL] Orders -> Auth
}
```

## Best practices

::: tip Start with `Strategic`
The three strategic classifications — `CoreDomain`, `SupportingDomain`, and `GenericSubdomain` — are the most impactful. Start there and layer in evolution stages and archetypes as your model matures.
:::

::: tip Combine classifications for richer models
Use strategic classification (`as`), evolution stage (`evolution:`), and archetype (`archetype:`) together to paint a complete picture of each bounded context's role and maturity.
:::

::: warning Don't over-classify
Not every bounded context needs every classification. Add metadata and tags when they provide actionable insight, not as busywork.
:::

## See also

- [Import system](/guide/imports) — how to import external packages
- [Teams & classifications](/guide/teams-classifications) — declaring custom classifications
- [Bounded contexts](/guide/bounded-contexts) — full bounded context syntax
- [CLI](/guide/cli) — managing dependencies with the CLI
- [GitHub repository](https://github.com/DomainLang/Patterns) — source code and releases

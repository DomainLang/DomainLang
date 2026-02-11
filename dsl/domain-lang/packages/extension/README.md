# DomainLang for VS Code

A Domain-Driven Design modeling language with first-class VS Code support. Define domains, bounded contexts, context maps, and team ownership in a concise, readable syntax.

## Features

- **Syntax highlighting** for `.dlang` files
- **IntelliSense** with auto-completion for keywords, references, and patterns
- **Go to definition** and **Find references** for domains, contexts, and teams
- **Hover documentation** showing element details
- **Real-time validation** with helpful error messages
- **Code formatting** to keep models consistent
- **AI agent integration** with GitHub Copilot and Claude via Language Model Tools

### AI agent tools

DomainLang provides four Language Model Tools that AI agents can use to understand and query your domain models:

- **`domainlang_validate`** - Validate the model and get all diagnostics
- **`domainlang_list`** - List entities (domains, bounded contexts, teams, etc.) with filters
- **`domainlang_get`** - Get a specific element by FQN or model summary
- **`domainlang_explain`** - Get rich markdown explanations of any element

**Example prompts:**
- "Check if my DomainLang model has any errors"
- "Show me all Core bounded contexts"
- "Explain the OrderContext bounded context"
- "Give me a summary of the model"

See the [VS Code Tools guide](https://domainlang.net/guide/vscode-tools) for detailed documentation.

## Quick start

1. Install the extension from the VS Code Marketplace
2. Create a file with the `.dlang` extension
3. Start modeling your domain:

```dlang
Domain Bookstore {
    description: "Online bookstore platform"
    vision: "Make books easy to discover and buy"
}

Team CatalogTeam
Team OrderTeam
Classification CoreDomain

BoundedContext Catalog for Bookstore as CoreDomain by CatalogTeam {
    description: "Product catalog and inventory"
    
    terminology {
        term Book: "A product available for purchase"
        term ISBN: "International Standard Book Number"
    }
}

BoundedContext Orders for Bookstore as CoreDomain by OrderTeam {
    description: "Order lifecycle and fulfillment"
}

ContextMap BookstoreIntegration {
    contains Catalog, Orders
    Catalog -> Orders
}
```

## Language highlights

### Domains and subdomains

```dlang
Domain Enterprise { description: "Company-wide" }

Domain Sales in Enterprise {
    description: "Revenue generation"
    vision: "Make buying easy"
}
```

### Bounded contexts with ownership

```dlang
BoundedContext Checkout for Sales as CoreDomain by PaymentsTeam {
    description: "Checkout and payment orchestration"
}
```

### Context maps and relationships

```dlang
ContextMap Integration {
    contains Orders, Payments, Shipping
    
    [OHS] Orders -> [ACL] Payments
    Orders -> Shipping
    [SK] Payments <-> Billing : SharedKernel
}
```

Supported DDD patterns: `OHS` (Open Host Service), `ACL` (Anti-Corruption Layer), `CF` (Conformist), `PL` (Published Language), `SK` (Shared Kernel), `P` (Partnership).

### Terminology (ubiquitous language)

```dlang
BoundedContext Orders for Sales {
    terminology {
        term Order: "A customer's request to purchase items"
            aka: PurchaseOrder
            examples: "Order #12345"
        term OrderLine: "A single line item within an order"
    }
}
```

### Decisions and policies

```dlang
BoundedContext Orders for Sales {
    decisions {
        decision EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order value is $10"
    }
}
```

### Namespaces and imports

```dlang
import "./shared-definitions.dlang"

namespace Acme.Sales {
    bc Checkout for Sales { }
}
```

## Documentation

- [Getting Started](https://domainlang.net/guide/getting-started)
- [Quick Reference](https://domainlang.net/reference/quick-reference)
- [Language Reference](https://domainlang.net/reference/language)
- [Example Models](https://github.com/DomainLang/DomainLang/tree/main/dsl/domain-lang/examples)

## Requirements

- VS Code 1.67.0 or later

## Extension settings

This extension contributes the following settings:

- Language support for `.dlang` files

## Known issues

Report issues at [GitHub Issues](https://github.com/DomainLang/DomainLang/issues).

## Contributing

Contributions are welcome! See the [repository](https://github.com/DomainLang/DomainLang) for development setup.

## License

Apache License 2.0 - See [LICENSE](https://github.com/DomainLang/DomainLang/blob/main/LICENSE) for details.

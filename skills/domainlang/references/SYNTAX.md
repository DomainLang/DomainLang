# DomainLang syntax reference

Complete syntax reference for the DomainLang DSL.

## Conventions

- `|` separates alternatives
- `?` means optional
- `*` means zero or more
- `+` means one or more
- Quoted strings are literal keywords

## Top-level declarations

### Domain

```text
("Domain" | "dom") NAME ("in" PARENT_REF)? ("{" DOMAIN_BODY "}")?

DOMAIN_BODY:
  ("description" ASSIGN STRING)?
  ("vision" ASSIGN STRING)?
  ("type" ASSIGN STRING)?
```

Examples:

```dlang
Domain Sales {
    description: "Revenue generation"
    vision: "Make it easy to buy"
}

Domain OnlineSales in Sales {
    description: "Digital sales channel"
}
```

### Bounded context

```text
("BoundedContext" | "bc") NAME
  ("for" DOMAIN_REF)?
  ("as" CLASSIFICATION_REF)?
  ("by" TEAM_REF)?
  ("{" BC_BODY "}")?

BC_BODY:
  ("description" ASSIGN STRING)?
  ("classification" ASSIGN CLASSIFICATION_REF)?
  ("team" ASSIGN TEAM_REF)?
  ("businessModel" ASSIGN STRING)?
  ("evolution" ASSIGN STRING)?
  ("archetype" ASSIGN STRING)?
  TERMINOLOGY_BLOCK?
  METADATA_BLOCK?
  DECISIONS_BLOCK?
  RELATIONSHIPS_BLOCK?
```

Examples:

```dlang
BoundedContext Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"
}

// Minimal form
BoundedContext Orders for Sales
```

### Context map

```text
("ContextMap" | "cmap") NAME "{"
  ("contains" BC_REF ("," BC_REF)*)?
  RELATIONSHIP*
"}"
```

Example:

```dlang
ContextMap SalesSystem {
    contains Orders, Billing, Shipping

    Orders [OHS] -> [CF] Billing
    Orders -> [ACL] Shipping
}
```

### Domain map

```text
("DomainMap" | "dmap") NAME "{"
  ("contains" DOMAIN_REF ("," DOMAIN_REF)*)?
"}"
```

Example:

```dlang
DomainMap Portfolio {
    contains Sales, Support, Platform
}
```

### Classification

```text
"Classification" NAME
```

### Team

```text
"Team" NAME
```

### Metadata key

```text
"Metadata" NAME
```

### Namespace

```text
("Namespace" | "ns") QUALIFIED_NAME "{"
  DECLARATION*
"}"
```

Example:

```dlang
Namespace Acme.Sales {
    Domain Sales { }
    BoundedContext Orders for Sales { }
}
```

### Import

```text
("Import" | "import") STRING ("as" ALIAS)?
```

Examples:

```dlang
import "./shared/teams.dlang"
import "@shared/classifications"
import "acme/ddd-core" as Core
```

## Blocks (inside bounded contexts)

### Terminology block

```text
("terminology" | "glossary") "{"
  TERM+
"}"

TERM:
  ("Term" | "term") NAME (ASSIGN STRING)?
    (("aka" | "synonyms") ASSIGN? NAME ("," NAME)*)?
    ("examples" ASSIGN? STRING ("," STRING)*)?
```

Example:

```dlang
terminology {
    term Order: "A customer's request to purchase"
        aka PurchaseOrder
        examples "Order #12345", "Purchase #67890"
    term OrderLine: "A single line item in an order"
}
```

### Metadata block

```text
("metadata" | "meta") "{"
  (NAME ASSIGN STRING)*
"}"
```

Metadata keys must be declared as top-level `Metadata` declarations before use.

Example:

```dlang
Metadata Language
Metadata Status

BoundedContext Orders for Sales {
    metadata {
        Language: "TypeScript"
        Status: "Production"
    }
}
```

### Decisions block

```text
("decisions" | "rules") "{"
  (DECISION | POLICY | RULE)*
"}"

DECISION: ("Decision" | "decision") ("[" CLASSIFICATION_REF "]")? NAME ASSIGN STRING
POLICY:   ("Policy" | "policy")     ("[" CLASSIFICATION_REF "]")? NAME ASSIGN STRING
RULE:     ("Rule" | "rule")         ("[" CLASSIFICATION_REF "]")? NAME ASSIGN STRING
```

Example:

```dlang
Classification Architectural

BoundedContext Orders for Sales {
    decisions {
        decision [Architectural] EventSourcing: "Capture every state change"
        policy Refunds: "Allow refunds within 30 days"
        rule MinOrder: "Minimum order value is $10"
    }
}
```

### Relationships block

```text
("relationships" | "integrations") "{"
  RELATIONSHIP*
"}"
```

Example:

```dlang
BoundedContext Orders for Sales {
    relationships {
        this [OHS] -> [CF] Billing
        Payments -> [ACL] this
    }
}
```

## Relationships

**Directional:**

```text
BC_REF ("[" SIDE_PATTERN ("," SIDE_PATTERN)* "]")? ARROW ("[" SIDE_PATTERN ("," SIDE_PATTERN)* "]")? BC_REF
```

**Symmetric:**

```text
BC_REF "[" SYMMETRIC_PATTERN "]" BC_REF
BC_REF "><" BC_REF
```

Side patterns are placed between the entity and the arrow. Symmetric patterns sit between entities with no arrow.

### Arrows

| Arrow | Semantics |
| ----- | --------- |
| `->` | Directional — left is upstream (provider), right is downstream (consumer) |
| `<-` | Reverse directional — right is upstream, left is downstream |
| `<->` | Bidirectional — mutual data flow with explicit patterns |
| `><` | Separate Ways — contexts have no integration |

### Integration patterns

#### Directional patterns (with `->`, `<-`, and `<->`)

| Pattern | Alias | Side |
| ------- | ----- | ---- |
| `OHS` | `OpenHostService` | Upstream |
| `PL` | `PublishedLanguage` | Upstream |
| `S` | `Supplier` | Upstream |
| `CF` | `Conformist` | Downstream |
| `ACL` | `AntiCorruptionLayer` | Downstream |
| `C` | `Customer` | Downstream |
| `BBoM` | `BigBallOfMud` | Either side |

#### Symmetric patterns (no arrow)

Symmetric patterns sit between entities with no arrow. Separate Ways also has the `><` arrow form.

| Pattern | Alias | Arrow form | Description |
| ------- | ----- | ---------- | ----------- |
| `SK` | `SharedKernel` | — | Shared model subset |
| `P` | `Partnership` | — | Coordinated development |
| `SW` | `SeparateWays` | `><` | No integration |

Multiple patterns per side are comma-separated: `[OHS, PL]`.

Example:

```dlang
Orders [OHS] -> [CF] Payments
Payments [CF] <- [OHS] Orders
Orders [OHS] <-> [CF] Shipping
Orders [S] -> [C] Billing
Orders [SK] Inventory
Orders [P] Shipping
```

### Bounded context reference

Inside a bounded context body, use `this` to refer to the current context:

```dlang
BoundedContext Orders for Sales {
    relationships {
        this [OHS] -> [CF] Billing
    }
}
```

In context maps, use the bounded context name or fully qualified name:

```dlang
ContextMap System {
    contains Acme.Sales.Orders, Acme.Billing.Invoices
    Acme.Sales.Orders -> Acme.Billing.Invoices
}
```

## Primitives

### Assignment operator

```text
ASSIGN: ":" | "=" | "is"
```

All three are interchangeable. Use `:` by convention.

### Names and references

```text
NAME: /[A-Za-z_][A-Za-z0-9_]*/
QUALIFIED_NAME: NAME ("." NAME)*
```

### Strings

```text
STRING: '"' ... '"' | "'" ... "'"
```

Both single and double quotes accepted. Supports `\"` and `\'` escape sequences.

### Comments

```text
LINE_COMMENT: "//" ... EOL
BLOCK_COMMENT: "/*" ... "*/"
```

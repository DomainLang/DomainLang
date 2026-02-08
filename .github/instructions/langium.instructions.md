---
description: 'Guidelines for Langium 4.x grammar development and DomainLang DSL files'
applyTo: "**/*.langium,**/*.dlang"
---

# Langium & DomainLang Guidelines

> Langium 4.x DSL framework with LSP support. DomainLang implements Domain-Driven Design modeling language.

## Critical Rules

- **NEVER** edit `src/generated/**` - always regenerate with `npm run langium:generate`
- **ALWAYS** run `langium:generate` after `.langium` changes
- **ALWAYS** run `npm run build` after grammar changes
- **Test** grammar changes with parsing and linking tests

## Architecture

| Component | Path | Purpose |
|-----------|------|---------|
| Grammar | `packages/language/src/domain-lang.langium` | DSL syntax source |
| Generated | `packages/language/src/generated/` | **Never edit** |
| Validation | `packages/language/src/validation/` | Rules |
| LSP | `packages/language/src/lsp/` | Services |
| Services | `packages/language/src/services/` | Import, workspace |

## DomainLang Core Constructs

| Construct | Example |
|-----------|---------|
| Domain | `Domain Sales { vision: "..." }` |
| Subdomain | `Domain Orders in Sales {}` |
| BoundedContext | `BoundedContext OrderContext for Sales as Core by SalesTeam {}` |
| ContextMap | `ContextMap Sales { contains OrderContext, BillingContext }` |
| Namespace | `Namespace acme.sales { Domain Sales {} }` |
| Import | `Import "owner/repo"` |

### BoundedContext features

```dlang
BoundedContext OrderContext for Sales as Core by SalesTeam {
    description: "Order management"
    role: Core                  // Or use header: 'as Core'
    team: SalesTeam             // Or use header: 'by SalesTeam'
    businessModel: Revenue
    lifecycle: Custom
    
    terminology {
        term Order: "A customer purchase request"
    }
    
    decisions {
        decision [Architectural] EventSourcing: "Use event sourcing"
    }
    
    relationships {
        [OHS] this -> [CF] PaymentContext
    }
}
```

> **Note:** `role` and `team` can be in header (`as`, `by`) or body. Header takes precedence.

### Relationship arrows

| Arrow | Meaning |
|-------|---------|  
| `->` | Downstream |
| `<-` | Upstream |
| `<->` | Bidirectional |
| `><` | Mutual dependency |
| `U/D` or `u/d` | Upstream/Downstream |
| `C/S` or `c/s` | Customer/Supplier |

### DDD Patterns

`[OHS]` Open Host Service · `[CF]` Conformist · `[ACL]` Anti-Corruption Layer · `[PL]` Published Language · `[P]` Partnership · `[SK]` Shared Kernel · `[BBoM]` Big Ball of Mud

## Grammar Basics

```langium
grammar DomainLang

entry Model:
    imports+=ImportStatement*
    (children+=StructureElement)*;

// Direct properties on nodes
Domain:
    'Domain' name=ID ('in' parentDomain=[Domain:QualifiedName])?
    '{' 
        ('description' Assignment description=STRING)?
        ('vision' Assignment vision=STRING)?
    '}';
```

**Assignments:**
- `=` scalar: `name=ID` → `string`
- `+=` array: `domains+=Domain` → `Domain[]`
- `?=` boolean: `isPublic?='public'` → `boolean`

**Cross-references:**
```langium
BoundedContext:
    'bc' name=ID 'for' domain=[Domain:QualifiedName];
```

**MultiReference (Langium 4.0+):**
```langium
ContextMap:
    'ContextMap' name=ID '{'
        'contains' boundedContexts+=[+BoundedContext:QualifiedName]
    '}';
```

Allows single reference to resolve multiple same-named elements:
```dlang
bc Orders for Sales {}
bc Orders for Billing {}

ContextMap AllOrders {
    contains Orders  // Resolves to BOTH!
}
```

## Document Lifecycle (Critical)

1. **Parsed** - AST from text
2. **IndexedContent** - Symbols indexed
3. **ComputedScopes** - Local scopes precomputed
4. **Linked** - Cross-references resolved ← **refs available here**
5. **IndexedReferences** - Reference dependencies
6. **Validated** - Validation checks

**Key:** Cross-references are `undefined` until phase 4 (Linked).

## Scoping

### ScopeComputation (Phase 3)

- Creates precomputed scopes
- **Cannot access cross-references** (not linked yet)

```typescript
export class DomainLangScopeComputation extends DefaultScopeComputation {
    protected override exportNode(node: AstNode, exports: AstNodeDescriptionProvider): void {
        if (isDomain(node) || isBoundedContext(node)) {
            exports.export(node, node.name);
        }
    }
}
```

### ScopeProvider (Phase 4)

- Resolves cross-references to AST nodes
- Can filter, shadow, customize visibility
- Consults global scope for exported symbols

**Qualified Names:**
```typescript
export class QualifiedNameProvider extends DefaultNameProvider {
    getQualifiedName(node: AstNode, name?: string): string | undefined {
        const nodeName = name ?? this.getName(node);
        if (!nodeName) return undefined;

        const container = node.$container;
        if (isNamespaceDeclaration(container)) {
            const containerName = this.getQualifiedName(container);
            return containerName ? `${containerName}.${nodeName}` : nodeName;
        }
        return nodeName;
    }
}
```

## Validation

```typescript
export class DomainLangValidator {
    @Check(Domain)
    checkDomainHasVision(domain: Domain, accept: ValidationAcceptor): void {
        if (!domain.vision) {
            accept('warning', `Domain '${domain.name}' has no domain vision`, {
                node: domain,
                property: 'name'
            });
        }
    }
}
```

**Current rules:**
- Missing domain vision → warning
- Missing BC description → warning
- Duplicate FQN → error

**Planned (TODO):**
- Cyclic `Domain in` hierarchies
- Invalid classifier/team/domain reference validation
- Import file existence validation

## LSP Error Handling

**STRONGLY RECOMMENDED:** Wrap LSP providers in try-catch for graceful degradation.

```typescript
async myFeature(params: Params): Promise<Result | undefined> {
    try {
        return computeResult();
    } catch (error) {
        console.error('Error in myFeature:', error);
        return undefined; // Safe default
    }
}
```

**Safe defaults:** Hover → `undefined` · CompletionItem[] → `[]` · CodeAction[] → `undefined` · Symbol[] → `[]`

See `.github/instructions/typescript.instructions.md` for complete error handling patterns.

## Scoping Behavior (Test-Verified)

**Forward references work:**
```dlang
bc OrderContext for Sales {}   // Sales not yet defined
Domain Sales {}                 // Defined after reference - WORKS
```

**`this` keyword in relationships:**
```dlang
bc OrderContext for Sales {
    relationships {
        [OHS] this -> [CF] PaymentContext  // "this" = OrderContext
    }
}
```

**Missing references don't crash:**
```dlang
bc OrderContext for NonExistent {}  // domain?.ref is undefined, no crash
```

**Duplicate detection uses FQN:**
```dlang
namespace A { Domain Sales {} }
namespace B { Domain Sales {} }  // OK - different FQN (A.Sales vs B.Sales)
```

## Test File Organization

```
test/
├── test-helpers.ts        # Always use this!
├── parsing/               # Grammar parsing tests
├── linking/               # Cross-reference tests
├── validating/            # Validation rule tests
├── scoping/               # Scope computation tests
├── services/              # Service layer tests
└── multireference/        # Multi-reference tests
```

## Common Pitfalls

| ❌ Don't | ✅ Do |
|----------|-------|
| Access refs in ScopeComputation | Wait until ScopeProvider (phase 4) |
| Edit generated files | Regenerate with `langium:generate` |
| Skip `langium:generate` after grammar changes | Always regenerate |
| Forget document cleanup in tests | Use `setupTestSuite()` |
| Expensive ScopeProvider without caching | Use `WorkspaceCache` |

**Caching example:**
```typescript
import { WorkspaceCache } from 'langium';

private cache = new WorkspaceCache<string, Result>(this.services.shared);

getScope(context: ReferenceInfo): Scope {
    const uri = getDocument(context.container).uriString;
    return this.cache.get(uri, () => computeExpensiveThing());
}
```

## Service Registration

```typescript
export const DomainLangModule: Module<DomainLangServices, PartialLangiumServices> = {
    references: {
        ScopeComputation: (services) => new DomainLangScopeComputation(services),
        QualifiedNameProvider: () => new QualifiedNameProvider()
    },
    lsp: {
        HoverProvider: (services) => new DomainLangHoverProvider(services),
        CompletionProvider: (services) => new DomainLangCompletionProvider(services)
    }
};
```

## Documentation Requirements

**Grammar/keyword changes require `/site/` updates:**

- [ ] `site/reference/language.md` - Syntax and semantics
- [ ] `site/reference/quick-reference.md` - Concise examples
- [ ] `examples/*.dlang` - Real-world usage
- [ ] JSDoc on grammar rules and types

**Skip for:** Bug fixes, internal refactoring, performance optimizations (no syntax changes)

## Workflow

1. Edit `.langium` grammar
2. `npm run langium:generate`
3. Implement/update services
4. Update `/site/` documentation
5. Write tests
6. `npm run build && npm test`

## Known Generator Warnings

**"Multiple assignments to 'X' with '=' operator"**

- Occurs with properties in loops: `(prop=Value)*`
- **IGNORE THIS WARNING** - Last value wins is acceptable
- Add validators to warn users about duplicates if needed
- Don't change `=` to `+=` unless you want array property

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ref` is undefined | Access in phase 4+ (Linked) |
| AST types don't match | Run `langium:generate` |
| Slow reference resolution | Use `WorkspaceCache` |
| Tests fail with stale AST | Use `setupTestSuite()` |

## Decision Matrix

| Scenario | Use |
|----------|-----|
| New language construct | Add grammar rule → regenerate → add validation |
| Reference single element | `[Type:QualifiedName]` |
| Reference multiple same-named | MultiReference `[+Type:QualifiedName]` |
| Custom scoping | ScopeProvider (phase 4) |
| Export symbols globally | ScopeComputation (phase 3) |
| Validate semantic rules | `@Check` methods in Validator |
| Validate semantics | `@Check` methods in Validator |

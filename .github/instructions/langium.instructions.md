---
description: 'Langium 4.x grammar + DomainLang DSL rules'
applyTo: "**/*.langium,**/*.dlang"
---

# Langium & DomainLang rules

> DDD constructs and patterns table are in `.github/copilot-instructions.md`. Architecture paths too.

## Critical

- **Never** edit `src/generated/**`. Run `npm run langium:generate` after every `.langium` change, then `npm run build`.
- Add parsing + linking tests for every grammar change.
- Update `/site/guide/`, `/site/reference/`, `examples/*.dlang`, and `skills/domainlang/` for any user-visible syntax change.
- Add JSDoc on grammar rules and AST interfaces.

## DomainLang BC features

```dlang
BoundedContext OrderContext for Sales as Core by SalesTeam {
    description: "Order management"
    role: Core              // body alternative to header `as`
    team: SalesTeam         // body alternative to header `by`
    businessModel: Revenue
    lifecycle: Custom
    terminology { term Order: "A customer purchase request" }
    decisions   { decision [Architectural] EventSourcing: "Use event sourcing" }
    relationships { [OHS] this -> [CF] PaymentContext }
}
```

Header keywords (`as`, `by`) take precedence over body fields. Use `effectiveRole`/`effectiveTeam` from the SDK to read the resolved value.

## Grammar essentials

```langium
entry Model: imports+=ImportStatement* (children+=StructureElement)*;

Domain:
    'Domain' name=ID ('in' parentDomain=[Domain:QualifiedName])?
    '{' ('description' Assignment description=STRING)?
        ('vision' Assignment vision=STRING)? '}';

BoundedContext: 'bc' name=ID 'for' domain=[Domain:QualifiedName];

// MultiReference (Langium 4.0+) — single ref resolves to multiple same-named elements
ContextMap:
    'ContextMap' name=ID '{' 'contains' boundedContexts+=[+BoundedContext:QualifiedName] '}';
```

Assignment operators: `=` scalar (`name=ID` → string), `+=` array, `?=` boolean.

## Document lifecycle

`Parsed → IndexedContent → ComputedScopes → Linked → IndexedReferences → Validated`

- Cross-references are `undefined` until **Linked** (phase 4).
- ScopeComputation (phase 3) **cannot** access cross-refs — only export symbols.
- ScopeProvider (phase 4) resolves refs and can shadow/filter visibility.

## Scoping

```typescript
export class DomainLangScopeComputation extends DefaultScopeComputation {
    protected override exportNode(node: AstNode, exports: AstNodeDescriptionProvider): void {
        if (isDomain(node) || isBoundedContext(node)) exports.export(node, node.name);
    }
}

// QualifiedNameProvider lives in services/naming.ts
export class QualifiedNameProvider extends DefaultNameProvider {
    getQualifiedName(node: AstNode, name?: string): string | undefined {
        const nodeName = name ?? this.getName(node);
        if (!nodeName) return undefined;
        const container = node.$container;
        if (isNamespaceDeclaration(container)) {
            const cn = this.getQualifiedName(container);
            return cn ? `${cn}.${nodeName}` : nodeName;
        }
        return nodeName;
    }
}
```

## Validation

```typescript
@Check(Domain)
checkDomainHasVision(domain: Domain, accept: ValidationAcceptor): void {
    if (!domain.vision) {
        accept('warning', `Domain '${domain.name}' has no domain vision`,
            { node: domain, property: 'name' });
    }
}
```

## LSP error handling

Wrap every provider entry point:

```typescript
async myFeature(params: Params): Promise<Result | undefined> {
    try { return computeResult(); }
    catch (error) { console.error('Error in myFeature:', error); return undefined; }
}
```

Safe defaults: Hover/CodeAction → `undefined`, CompletionItem[]/Symbol[] → `[]`.

## Verified scoping behaviors

- **Forward refs work:** `bc OrderContext for Sales {}` before `Domain Sales {}`.
- **`this`** in relationships refers to the enclosing BC.
- **Missing refs don't crash:** `bc.domain?.ref` is `undefined`.
- **Duplicate detection uses FQN:** `A.Sales` and `B.Sales` coexist across namespaces.

## Performance

Cache expensive computations with `WorkspaceCache` keyed by document URI. Invalidate on `model.yaml`/`model.lock` changes (file watcher in `main.ts` calls `workspaceManager.invalidateManifestCache()` and `importResolver.clearCache()`).

LSP features may run before linking — `await waitForState(document, DocumentState.Linked)` before reading `ref` properties, or call `documentBuilder.build([doc], { validation: true })` first.

## Common pitfalls

| Don't | Do |
|---|---|
| Access refs in ScopeComputation | Wait until ScopeProvider (phase 4) |
| Edit generated files | Regenerate with `langium:generate` |
| Skip `langium:generate` | Always after `.langium` change |
| Expensive ScopeProvider w/o caching | `WorkspaceCache` |

**Generator warning** "Multiple assignments to 'X' with '=' operator" on `(prop=Value)*`: ignore. Last value wins. Add a validator to warn users about duplicates if it matters.

## Workflow

`.langium` → `langium:generate` → implement services → update `/site/` and skill → tests → `npm run build && npm test`.

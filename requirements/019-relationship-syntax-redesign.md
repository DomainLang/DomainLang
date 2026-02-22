# PRS-019: Relationship syntax redesign

**Status**: Proposed  
**Priority**: High  
**Target version**: Next minor  
**Created**: February 22, 2026  
**Effort estimate**: 2–3 weeks  
**Dependencies**: None  
**Breaking change**: Yes (pre-release, no backward compatibility required)

---

## Executive summary

Redesign DomainLang's relationship syntax around a consistent **entity–relationship–entity** grammar structure. Every relationship follows the form:

```text
(entity)  (relationship)  (entity)
```

The relationship slot is either:

1. **Symmetric** — a single type: `[SK]`, `[P]`, `[SW]`, `><`
2. **Directional** — an arrow with optional side annotations: `[side] -> [side]`

Side annotations belong to the **relationship**, not the entities — `[OHS]` describes the upstream side of the relationship, not a property of the context itself.

This fixes a semantic modeling error in the current grammar: symmetric DDD patterns (Shared Kernel, Partnership) are encoded as side annotations on one entity (`[SK] A <-> B`) when they describe the relationship between both. The redesign also adds Customer/Supplier as a first-class pattern, introduces strongly-typed AST nodes (replacing `returns string` rules), and aligns brackets with the "classified as" convention used elsewhere in the language.

**Current syntax** (broken — patterns attached to entities):

```dlang
[SK] CardManagement <-> AccountManagement : SharedKernel
[OHS] Orders -> [CF] Payments
```

**Proposed syntax** (entity–relationship–entity):

```dlang
// Symmetric — relationship type between two entities
CardManagement [SK] AccountManagement

// Directional — arrow with side annotations describing the relationship
Orders [OHS] -> [CF] Payments

// Separate Ways — three equivalent forms
Orders [SW] Payments
Orders [SeparateWays] Payments
Orders >< Payments

// Customer/Supplier — directional with C/S side roles
Orders [S] -> [C] Payments
```

**Goals:**

1. Establish consistent entity–relationship–entity grammar structure
2. Fix semantic mismodeling of symmetric patterns (SK, P)
3. Add Customer/Supplier (`[S]`/`[C]`) as first-class side patterns
4. Use Langium `{infer}` actions for strongly-typed AST nodes
5. Support short and long-form aliases for all patterns
6. Add validation rules ensuring patterns appear on correct sides
7. Update all LSP features, documentation, and examples

**Non-goals:**

- Tactical DDD patterns (Aggregates, Entities, Value Objects)
- Inbound/outbound message modeling on relationships
- Relationship metadata or annotations beyond patterns

---

## Background

### The semantic problem

Eric Evans' *Domain-Driven Design Reference* defines seven context mapping patterns. These fall into three categories:

| Category | Patterns | Semantics |
| ---------- | ---------- | ----------- |
| **Symmetric (mutual)** | Shared Kernel, Partnership, Separate Ways | Describe the relationship *between* two contexts |
| **Directional (per-side)** | OHS, PL, CF, ACL | Describe one side's *role* in the relationship |
| **Quality (assessment)** | Big Ball of Mud | Describes one side's *condition* |

The current grammar attaches patterns to entities rather than to the relationship:

```langium
// Current — patterns prefix the entities, not the relationship
Relationship:
    ('[' leftPatterns+=IntegrationPattern ']')?
    left=BoundedContextRef
    arrow=RelationshipArrow
    ('[' rightPatterns+=IntegrationPattern ']')?
    right=BoundedContextRef
;
```

This breaks the natural entity–relationship–entity structure. `[SK] A <-> B` reads as "SK-classified A connects to B" when the intent is "A and B share a Shared Kernel relationship." The pattern describes the *relationship*, not the entity. For directional patterns the same applies: `[OHS]` describes the upstream side *of the relationship*, not a permanent property of the context.

### Bracket consistency

DomainLang uses brackets consistently as **"classified as"** markers:

```dlang
decision [architectural] "Use CQRS"       // classified as architectural
bc OrderContext as Core                     // classified as Core
```

The proposed syntax places relationship expressions between the entities, following the same bracket convention:

```dlang
Orders [OHS] -> [CF] Payments             // relationship: upstream side as OHS, downstream as CF
CardManagement [SK] AccountManagement      // relationship classified as SK
```

### Context Mapper comparison

Context Mapper DSL (CML) supports both symmetric and asymmetric forms:

```cml
// CML symmetric forms
ContextA [SK]<->[SK] ContextB
ContextA Shared-Kernel ContextB

// CML directional
ContextA [U,OHS]->[D,CF] ContextB
```

DomainLang's proposed syntax is cleaner than CML's `[SK]<->[SK]` (no redundant double-annotation) while preserving the `Shared-Kernel` infix keyword concept via bracket syntax.

---

## User stories

### US-1: DDD practitioner

As a DDD practitioner,  
I want symmetric patterns to look symmetric in the syntax,  
so that the code accurately represents the shared nature of Shared Kernel and Partnership.

### US-2: Context map author

As a context map author,  
I want to specify Customer/Supplier relationships explicitly,  
so that I can model negotiated upstream/downstream contracts distinctly from simple U/D dependencies.

### US-3: Tool developer

As a tool developer using the SDK,  
I want the AST to distinguish symmetric from directional relationships structurally,  
so that I don't need heuristic inference logic to determine relationship types.

### US-4: New user

As a new DomainLang user,  
I want relationship syntax to read as entity–relationship–entity,  
so that `Orders [OHS] -> [CF] Payments` reads naturally as "Orders connects to Payments via an OHS→CF relationship."

---

## Design decisions

### D1: Entity–relationship–entity structure

**Decision:** Relationships follow `(entity) (relationship) (entity)` structure, where the entire relationship expression (type, arrow, side annotations) sits between the two entity references.

**Current:** `[OHS] Orders -> [CF] Payments` (patterns prefix entities)  
**Proposed:** `Orders [OHS] -> [CF] Payments` (patterns are part of the relationship)

**Rationale:**

- Side annotations describe the *relationship*, not properties of the entities
- `[OHS]` means "the upstream side of this relationship uses Open Host Service" — it's not a permanent attribute of Orders
- Enables symmetric form `A [SK] B` where the single relationship type sits naturally between entities
- Consistent with bracket-as-classification convention: `decision [architectural] "Use CQRS"`

### D2: Symmetric relationship form

**Decision:** Symmetric patterns (SK, P, SW) use `A [Pattern] B` with no arrow.

**Rationale:**

- The relationship slot contains just a type — no arrow means no directionality
- Follows entity–relationship–entity: `A [SK] B` = "A and B have a Shared Kernel relationship"
- Eliminates redundant `<->` for patterns that are inherently bidirectional
- Structurally different from directional relationships in the AST

### D3: Separate Ways arrow form

**Decision:** Separate Ways supports three equivalent syntaxes. SharedKernel and Partnership use bracket syntax only (no arrow form).

```dlang
Orders [SW] Payments              // bracket short form
Orders [SeparateWays] Payments    // bracket long form
Orders >< Payments                // arrow form (visual: "going apart")
```

**Rationale:**

- `><` has strong visual semantics ("going apart") — universally readable, no competing mental model
- Bracket form provides consistency with SK and P
- All three parse to the same `SymmetricRelationship` AST node with `$type: 'SeparateWays'`
- SK and P don't need arrow forms — the bracket syntax is clear and discoverable

### D4: Customer/Supplier as directional side patterns

**Decision:** Add `[S]` (Supplier) and `[C]` (Customer) as directional side patterns with **enforced placement**: Supplier is always on the upstream side, Customer is always on the downstream side.

```dlang
// Correct: Supplier upstream, Customer downstream
Orders [S] -> [C] Payments
Orders [Supplier] -> [Customer] Payments

// ERROR — Supplier on downstream side:
// Orders -> [S] Payments

// ERROR — Customer on upstream side:
// Orders [C] -> Payments
```

**Rationale:**

- Customer/Supplier is a *directional* pattern in Evans' DDD — not symmetric
- Supplier = upstream (provider with negotiated contract), Customer = downstream (consumer with influence over priorities)
- The arrow already encodes directionality (`->` = left upstream, right downstream), so S and C have fixed sides — validation enforces this as an error, not a warning
- Fits cleanly into the side-pattern syntax alongside OHS/CF/ACL/PL
- Context Mapper uses `[U,S]` and `[D,C]` — we simplify by making S/C inherently directional

### D5: Strongly-typed AST via `{infer}` actions

**Decision:** Replace `returns string` rules with `{infer}` AST node types.

**Current generated types:**

```typescript
type IntegrationPattern = 'ACL' | 'AntiCorruptionLayer' | 'BBoM' | ... | 'SK' | 'SharedKernel';
type RelationshipArrow = '->' | '<-' | '<->' | '><';
```

**Proposed generated types:**

```typescript
// Structural discrimination at relationship level
type Relationship = DirectionalRelationship | SymmetricRelationship;
interface DirectionalRelationship { readonly $type: 'DirectionalRelationship'; ... }
interface SymmetricRelationship  { readonly $type: 'SymmetricRelationship'; ... }

// Pattern-level type guards with alias resolution
interface SidePattern { readonly $type: 'OpenHostService' | 'Conformist' | ... }
interface OpenHostService extends SidePattern { readonly $type: 'OpenHostService'; }
// 'OHS' and 'OpenHostService' both parse to $type: 'OpenHostService'
```

**Rationale:**

- Both `'SK'` and `'SharedKernel'` currently produce *different* string values, forcing downstream code to handle aliases. With `{infer}`, aliases resolve at parse time.
- `isSymmetricRelationship(rel)` replaces 60+ lines of inference heuristics
- Full CST node with position/range info for each pattern (enables precise hover, go-to-definition)
- `DirectionalArrow` stays as `returns string` (only 2 values, no aliases)

### D6: BBoM remains a side pattern

**Decision:** Keep Big Ball of Mud as a side pattern in relationships.

```dlang
LegacySystem [BBoM] -> [ACL] Orders
```

**Rationale:**

- "This side is a mess" is useful context in a context map
- Communicates integration risk to the reader
- Diagram generator already renders BBoM as a cloud shape on the relevant side

### D7: Remove explicit `: RelationshipType` trailing annotation

**Decision:** Remove the `: Partnership`, `: SharedKernel`, etc. trailing type annotation.

**Current:** `[SK] CardManagement <-> AccountManagement : SharedKernel`  
**Proposed:** `CardManagement [SK] AccountManagement`

**Rationale:**

- With symmetric patterns as first-class grammar constructs, the type is encoded in the pattern itself (`[SK]` = SharedKernel, `[P]` = Partnership)
- The `: Type` was always redundant with the pattern annotation
- Eliminates a source of inconsistency (e.g., `[SK] A <-> B : Partnership` — which is it?)
- Relationship type inference in the SDK becomes trivial: `isSharedKernel(rel.pattern)` for symmetric, `inferFromPatterns(rel)` for directional

### D8: `<->` bidirectional arrow retained for directional relationships

**Decision:** Keep `<->` as a valid arrow for *directional* relationships where both sides have patterns but the relationship is mutually dependent.

```dlang
// Both sides have patterns, bidirectional data flow
Orders [OHS] <-> [CF] Payments
```

**Rationale:**

- `<->` without side patterns was previously the only way to express Partnership — that role is now taken by `A [P] B`
- `<->` still has value for expressing bidirectional data flow with explicit integration patterns
- Directional arrows are: `->`, `<-`, `<->`

### D9: Single `Relationship` rule shared across all containers

**Decision:** The `Relationship` grammar rule (union of `DirectionalRelationship | SymmetricRelationship`) is the **single construct** used in both `ContextMap` and `BoundedContext` integrations blocks. No separate rule or subset per container.

**Current grammar** (already shared):

```langium
// ContextMap:
(relationships += Relationship ...)*

// BoundedContext integrations block:
('relationships' | 'integrations') '{' (relationships += Relationship ...)* '}'
```

**Rationale:**

- A relationship is the same concept regardless of where it's declared
- `this` references resolve differently per container (via `containingBc`) — that's a resolution concern, not a grammar concern
- Avoids divergent syntax between context maps and BC blocks
- Keeps the grammar DRY — one rule to maintain, test, and document

---

## Functional requirements

### FR-1: Grammar — relationship rule split

**Priority:** Must have

Split the `Relationship` rule into `DirectionalRelationship` and `SymmetricRelationship`:

```langium
Relationship:
    DirectionalRelationship | SymmetricRelationship
;

DirectionalRelationship:
    left=BoundedContextRef
    ('[' leftPatterns+=SidePattern (',' leftPatterns+=SidePattern)* ']')?
    arrow=DirectionalArrow
    ('[' rightPatterns+=SidePattern (',' rightPatterns+=SidePattern)* ']')?
    right=BoundedContextRef
;

SymmetricRelationship:
    left=BoundedContextRef
    (
        '[' pattern=SymmetricPattern ']'
      | arrow='><'
    )
    right=BoundedContextRef
;
```

**Acceptance criteria:**

- [ ] `Relationship` type is a union of `DirectionalRelationship | SymmetricRelationship`
- [ ] `isDirectionalRelationship()` and `isSymmetricRelationship()` type guards generated
- [ ] `SymmetricRelationship` with `arrow='><'` parses as SeparateWays
- [ ] Both forms parse correctly inside `ContextMap` and `BoundedContext` relationship blocks
- [ ] `BoundedContextRef` (`this` and qualified names) works in both forms

---

### FR-2: Grammar — side patterns with `{infer}`

**Priority:** Must have

Replace `IntegrationPattern returns string` with typed AST nodes:

```langium
SidePattern:
    {infer OpenHostService}     ('OHS' | 'OpenHostService')
  | {infer PublishedLanguage}   ('PL'  | 'PublishedLanguage')
  | {infer Conformist}          ('CF'  | 'Conformist')
  | {infer AntiCorruptionLayer} ('ACL' | 'AntiCorruptionLayer')
  | {infer Supplier}            ('S'   | 'Supplier')
  | {infer Customer}            ('C'   | 'Customer')
  | {infer BigBallOfMud}        ('BBoM'| 'BigBallOfMud')
;
```

**Acceptance criteria:**

- [ ] Each pattern produces a distinct `$type` value (`'OpenHostService'`, `'Conformist'`, etc.)
- [ ] Short and long forms parse to the same AST node type
- [ ] `isOpenHostService()`, `isConformist()`, etc. type guards generated
- [ ] Patterns can be combined: `[OHS, PL]`

---

### FR-3: Grammar — symmetric patterns with `{infer}`

**Priority:** Must have

```langium
SymmetricPattern:
    {infer SharedKernel}  ('SK' | 'SharedKernel')
  | {infer Partnership}   ('P'  | 'Partnership')
  | {infer SeparateWays}  ('SW' | 'SeparateWays')
;
```

**Acceptance criteria:**

- [ ] `isSharedKernel()`, `isPartnership()`, `isSeparateWays()` type guards generated
- [ ] Short and long forms parse to same node type
- [ ] `><` arrow parses as SeparateWays symmetric relationship (see FR-1)

---

### FR-4: Grammar — directional arrow

**Priority:** Must have

```langium
DirectionalArrow returns string:
    '->' | '<-' | '<->'
;
```

**Acceptance criteria:**

- [ ] Three arrow forms: `->`, `<-`, `<->`
- [ ] Produced as string literal union type (no aliases needed)
- [ ] `><` is NOT a directional arrow (it's a symmetric relationship form via FR-1)

---

### FR-5: Customer/Supplier side patterns

**Priority:** Must have

Add `[S]`/`[Supplier]` and `[C]`/`[Customer]` as new side patterns (FR-2).

```dlang
Orders [S] -> [C] Payments
Orders [Supplier] -> [Customer] Payments
```

**Acceptance criteria:**

- [ ] `[S]` and `[Supplier]` both parse to `$type: 'Supplier'`
- [ ] `[C]` and `[Customer]` both parse to `$type: 'Customer'`
- [ ] Can be combined with other patterns: `[S, OHS]`
- [ ] Validation warns if `[S]` is on the downstream side or `[C]` on the upstream side (FR-8 — errors)

---

### FR-6: Remove `: RelationshipType` annotation

**Priority:** Must have

Remove the explicit trailing relationship type syntax:

```langium
// REMOVE from grammar:
// (Assignment type=RelationshipType)?
// RelationshipType returns string: ...
```

**Acceptance criteria:**

- [ ] `: Partnership`, `: SharedKernel`, etc. no longer parse
- [ ] `RelationshipType` rule removed from grammar
- [ ] SDK's `inferRelationshipType()` simplified using AST node types

---

### FR-7: SDK — relationship view and augmentation

**Priority:** Must have

Update `RelationshipView`, `ast-augmentation.ts`, and `augmentRelationship()`:

**New `RelationshipView` interface:**

```typescript
interface RelationshipView {
    readonly left: BoundedContext;
    readonly right: BoundedContext;
    /** Symmetric relationships have no arrow */
    readonly arrow?: '->' | '<-' | '<->';
    /** Side patterns (directional only) */
    readonly leftPatterns: readonly SidePattern[];
    readonly rightPatterns: readonly SidePattern[];
    /** Symmetric pattern (symmetric only) */
    readonly symmetricPattern?: SymmetricPattern;
    /** Whether this is a symmetric relationship */
    readonly isSymmetric: boolean;
    /** Whether this is a directional relationship */
    readonly isDirectional: boolean;
    /** Resolved relationship kind */
    readonly kind: 'SharedKernel' | 'Partnership' | 'SeparateWays' | 'UpstreamDownstream' | 'CustomerSupplier' | undefined;
    readonly source: 'BoundedContext' | 'ContextMap';
    readonly astNode: Relationship;
}
```

**New augmented properties on `Relationship`:**

```typescript
interface Relationship {
    /** Whether this is a symmetric relationship (SK, P, SW, or >< arrow) */
    readonly isSymmetric: boolean;
    /** Whether this is a directional relationship (->, <-, <->) */
    readonly isDirectional: boolean;
    /** Resolved relationship kind (replaces inferredType) */
    readonly kind: string | undefined;
}
```

**Acceptance criteria:**

- [ ] `RelationshipView.isSymmetric` / `isDirectional` are computed from AST node type
- [ ] `RelationshipView.kind` replaces `inferredType` with no heuristics for symmetric
- [ ] `augmentRelationship()` updated for new AST shape
- [ ] `ast-augmentation.ts` module augmentation updated
- [ ] Pattern SDK (`patterns.ts`) updated: add `SupplierPatterns`, `CustomerPatterns`, `SymmetricPatterns`

---

### FR-8: Validation — pattern placement rules

**Priority:** Must have

Add and revise validation rules for correct pattern placement:

| Rule | Severity | Description |
| ------ | ---------- | ------------- |
| Side patterns in symmetric | Error | `A [OHS] [SK] B` — side patterns not allowed in symmetric relationships |
| SK/P/SW in side position | Error | `A [SK] -> B` — symmetric patterns cannot be side patterns |
| ACL on upstream side | Warning | `A [ACL] -> B` — ACL should be on downstream side |
| CF on upstream side | Warning | `A [CF] -> B` — CF should be on downstream side |
| OHS on downstream side | Warning | `A -> [OHS] B` — OHS should be on upstream side |
| S on downstream side | Error | `A -> [S] B` — Supplier must be on upstream side |
| C on upstream side | Error | `A [C] -> B` — Customer must be on upstream side |
| Pattern count > 3 | Info | Too many patterns on one side |
| Self-relationship symmetric | Warning | `A [SK] A` — symmetric relationship with self |

**Acceptance criteria:**

- [ ] Existing `validateSharedKernelBidirectional` replaced — SK no longer uses arrows
- [ ] ACL/CF placement validation updated for postfix syntax
- [ ] New validation for symmetric patterns appearing as side patterns
- [ ] New validation for side patterns appearing in symmetric relationships
- [ ] New validation for C/S pattern placement (errors, not warnings — Supplier must be upstream, Customer must be downstream)

---

### FR-9: LSP — hover provider updates

**Priority:** Must have

Update keyword hover documentation for new and changed patterns:

- Add hover for `S`, `Supplier`, `C`, `Customer`, `SW`
- Update hover for `SK`, `P` to describe symmetric semantics
- Update arrow hovers — `<->` no longer implies Partnership
- Remove hover for `: Partnership`, `: SharedKernel`, etc.

**Acceptance criteria:**

- [ ] All new keywords have hover documentation
- [ ] Hover for `[SK]` explains symmetric shared kernel semantics
- [ ] Hover for `><` explains Separate Ways (same as `[SW]`)

---

### FR-10: LSP — completion provider updates

**Priority:** Must have

Update relationship completions for new syntax:

- Side patterns: `[OHS]`, `[PL]`, `[CF]`, `[ACL]`, `[S]`, `[C]`, `[BBoM]`
- Symmetric patterns: `[SK]`, `[P]`, `[SW]`
- Arrows: `->`, `<-`, `<->` (directional); `><` (symmetric Separate Ways)
- Snippets for common relationship forms

**Acceptance criteria:**

- [ ] Completion suggests symmetric patterns separately from side patterns
- [ ] Completion context-aware: after `A [` suggests patterns, after `A [OHS]` suggests arrows
- [ ] `><` offered as Separate Ways arrow form alongside `[SW]` bracket form

---

### FR-11: LSP — formatting

**Priority:** Should have

Update formatter to handle new syntax forms.

**Acceptance criteria:**

- [ ] Symmetric relationships formatted correctly: `A [SK] B`
- [ ] Directional relationships formatted: `A [OHS] -> [CF] B`
- [ ] Consistent spacing around brackets and arrows

---

### FR-12: Diagram generator updates

**Priority:** Must have

Update `context-map-diagram-generator.ts` for new AST shape.

**Acceptance criteria:**

- [ ] Symmetric relationships rendered as undirected edges with pattern label
- [ ] Directional relationships rendered with U/D badges (unchanged visually)
- [ ] SeparateWays rendered with `separate-ways` CSS class regardless of form (`><` or `[SW]`)
- [ ] Customer/Supplier rendered with S/C labels instead of U/D

---

### FR-13: Relationship inference service

**Priority:** Must have

Simplify `relationship-inference.ts` — symmetric types are now structural:

```typescript
// Before: 60+ lines of heuristic pattern matching
// After:
function inferRelationshipType(rel: Relationship): string | undefined {
    if (isSymmetricRelationship(rel)) {
        if (rel.pattern) return rel.pattern.$type; // [SK], [P], [SW]
        if (rel.arrow === '><') return 'SeparateWays';
    }
    if (isDirectionalRelationship(rel)) {
        if (rel.leftPatterns.some(isSupplier) || rel.rightPatterns.some(isCustomer)) {
            return 'CustomerSupplier';
        }
        return 'UpstreamDownstream';
    }
    return undefined;
}
```

**Acceptance criteria:**

- [ ] Symmetric relationship type derived from AST node type (no heuristics)
- [ ] `><` arrow infers SeparateWays
- [ ] Customer/Supplier inferred from `[S]`/`[C]` patterns
- [ ] Directional without C/S infers UpstreamDownstream

---

### FR-14: Serializer updates

**Priority:** Must have

Update `serializers.ts` for new `RelationshipView` shape.

**Acceptance criteria:**

- [ ] Serialized output includes `isSymmetric`, `kind` fields
- [ ] `symmetricPattern` serialized for symmetric relationships
- [ ] `leftPatterns` / `rightPatterns` serialized for directional
- [ ] `arrow` is `undefined` for symmetric (except SeparateWays `><`)

---

### FR-15: Update all example files

**Priority:** Must have

Migrate all `.dlang` example files to new syntax.

**Files affected:**

- `examples/banking-system.dlang` — SharedKernel relationships
- `examples/healthcare-system.dlang` — OHS/ACL and SharedKernel
- `examples/customer-facing.dlang` — SharedKernel and OHS
- `examples/metadata-local-definition.dlang` — OHS/CF/PL/ACL
- `examples/metadata-polyglot.dlang` — OHS/CF/PL
- `examples/multi-file-project/index.dlang` — OHS/ACL
- `examples/multi-file-project/domains/sales.dlang` — UpstreamDownstream
- `examples/other.dlang` — OHS/CF

**Example migration:**

| Before | After |
| -------- | ------- |
| `[SK] CardManagement <-> AccountManagement : SharedKernel` | `CardManagement [SK] AccountManagement` |
| `[OHS] Orders -> [CF] Payments` | `Orders [OHS] -> [CF] Payments` |
| `[OHS] A -> [ACL] B : UpstreamDownstream` | `A [OHS] -> [ACL] B` |
| `OrderContext >< LegacySystem` | `OrderContext >< LegacySystem` (unchanged) |

**Acceptance criteria:**

- [ ] All examples parse without errors
- [ ] No usage of old prefix syntax remains
- [ ] No `: RelationshipType` annotations remain

---

### FR-16: Update site documentation

**Priority:** Must have

Update domainlang.net documentation pages:

- `site/guide/context-maps.md` — relationship syntax, pattern tables, examples
- `site/reference/language.md` — grammar reference
- `site/reference/quick-reference.md` — syntax summary
- `site/guide/sdk.md` — SDK API for relationships
- `site/examples/banking-system.md` — worked example
- `site/examples/healthcare-system.md` — worked example

**Acceptance criteria:**

- [ ] All code examples use new syntax
- [ ] Pattern tables updated with C/S and SW
- [ ] Arrow table updated (no `<->` = Partnership)
- [ ] SDK examples show `isSymmetricRelationship()` / `isDirectionalRelationship()`

---

### FR-17: Update agent skill

**Priority:** Should have

Update `skills/domainlang/SKILL.md` with new relationship syntax.

**Acceptance criteria:**

- [ ] Skill examples use new syntax
- [ ] Pattern reference table updated
- [ ] Agent can correctly generate new-syntax relationships

---

### FR-18: Update tests

**Priority:** Must have

Rewrite relationship tests for new grammar shape:

**Test file:** `test/parsing/relationships.test.ts`

| Test category | Scope |
| --------------- | ------- |
| Arrow types | `->`, `<-`, `<->` (directional only) |
| Symmetric forms | `A [SK] B`, `A [P] B`, `A [SW] B`, `A >< B` |
| Side patterns | `A [OHS] -> [CF] B`, `A [S] -> [C] B`, `A [BBoM] -> B` |
| Pattern aliases | `[OHS]` = `[OpenHostService]`, `[SK]` = `[SharedKernel]`, etc. |
| Multiple patterns | `A [OHS, PL] -> [CF, ACL] B` |
| `this` references | `this [OHS] -> [CF] Payments` |
| Negative tests | `A [SK] -> B` (error), `A [OHS] [SK] B` (error) |
| Validation | Side placement warnings, pattern count |
| SDK augmentation | `isSymmetric`, `isDirectional`, `kind` |
| Relationship view | `RelationshipView` creation from both forms |
| Inference | Type inference for symmetric and directional |

**Acceptance criteria:**

- [ ] All existing relationship test scenarios covered with new syntax
- [ ] New tests for Customer/Supplier patterns
- [ ] New tests for symmetric relationship form
- [ ] New tests for SeparateWays triple form (`><`, `[SW]`, `[SeparateWays]`)
- [ ] Negative tests for invalid pattern placement
- [ ] SDK/augmentation tests updated
- [ ] Test coverage meets configured thresholds

---

## Pattern quick reference

### Side patterns (directional relationships)

| Pattern | Short | Long | Side | DDD concept |
| --------- | ------- | ------ | ------ | ------------- |
| Open Host Service | `[OHS]` | `[OpenHostService]` | Upstream | Published protocol for consumers |
| Published Language | `[PL]` | `[PublishedLanguage]` | Upstream | Shared data format |
| Supplier | `[S]` | `[Supplier]` | Upstream | Negotiated contract provider |
| Conformist | `[CF]` | `[Conformist]` | Downstream | Accepts upstream model |
| Anti-Corruption Layer | `[ACL]` | `[AntiCorruptionLayer]` | Downstream | Translates upstream model |
| Customer | `[C]` | `[Customer]` | Downstream | Negotiated contract consumer |
| Big Ball of Mud | `[BBoM]` | `[BigBallOfMud]` | Either | Unstructured legacy area |

### Symmetric patterns

| Pattern | Short | Long | Arrow form | DDD concept |
| --------- | ------- | ------ | ------------ | ------------- |
| Shared Kernel | `[SK]` | `[SharedKernel]` |  | Shared code/model ownership |
| Partnership | `[P]` | `[Partnership]` |  | Coordinated development |
| Separate Ways | `[SW]` | `[SeparateWays]` | `><` | No integration |

### Arrows (directional relationships only)

| Arrow | Direction | Semantics |
| ------- | ----------- | ----------- |
| `->` | Left → Right | Left is upstream, right is downstream |
| `<-` | Right → Left | Right is upstream, left is downstream |
| `<->` | Bidirectional | Mutual data flow with explicit patterns |

---

## Syntax cheat sheet

```dlang
ContextMap Sales {
    contains Orders, Payments, Shipping, Legacy

    // Directional — upstream/downstream with patterns
    Orders [OHS] -> [CF] Payments
    Orders [OHS, PL] -> [ACL] Shipping

    // Directional — Customer/Supplier
    Orders [S] -> [C] Payments

    // Directional — bare arrow (no patterns)
    Orders -> Payments

    // Directional — reverse
    Payments [ACL] <- Orders

    // Directional — bidirectional with patterns
    Orders [OHS] <-> [CF] Payments

    // Symmetric — Shared Kernel
    Orders [SK] Payments
    Orders [SharedKernel] Payments

    // Symmetric — Partnership
    Orders [P] Payments
    Orders [Partnership] Payments

    // Symmetric — Separate Ways (three equivalent forms)
    Orders >< Legacy
    Orders [SW] Legacy
    Orders [SeparateWays] Legacy

    // Quality annotation on a side
    Legacy [BBoM] -> [ACL] Orders

    // Self-reference
    this [OHS] -> [CF] Payments
}
```

---

## Impact analysis

### Files requiring changes

| File | Change type | Effort |
| ------ | ------------- | -------- |
| `src/domain-lang.langium` | Major rewrite of §5 | High |
| `src/generated/ast.ts` | Auto-generated | — |
| `src/validation/relationships.ts` | Rewrite | High |
| `src/validation/constants.ts` | Add new codes/messages | Medium |
| `src/services/relationship-inference.ts` | Simplify | Medium |
| `src/sdk/ast-augmentation.ts` | Rewrite | Medium |
| `src/sdk/query.ts` | Update `RelationshipView`, augmentation | High |
| `src/sdk/types.ts` | Update `RelationshipView` interface | Medium |
| `src/sdk/patterns.ts` | Add C/S/SW patterns, restructure | Medium |
| `src/sdk/serializers.ts` | Update serialization | Medium |
| `src/lsp/hover/domain-lang-keywords.ts` | Add C/S/SW hovers | Low |
| `src/lsp/hover/hover-builders.ts` | Update relationship formatting | Medium |
| `src/lsp/domain-lang-completion.ts` | Update completions | Medium |
| `src/diagram/context-map-diagram-generator.ts` | Update edge generation | Medium |
| `test/parsing/relationships.test.ts` | Full rewrite | High |
| `examples/*.dlang` (8 files) | Migrate syntax | Low |
| `site/**/*.md` (6+ files) | Update docs | Medium |
| `skills/domainlang/SKILL.md` | Update examples | Low |

### Migration

This project is **pre-release** — no backward compatibility is maintained. All existing `.dlang` files and tests are updated in-place as part of this PRS. No migration tooling is needed.

---

## Open questions

None — all design decisions have been resolved in the design conversation.

---

## Implementation order

```text
1. FR-1 + FR-2 + FR-3 + FR-4: Grammar changes
2. FR-6:  Remove RelationshipType
3. langium:generate (regenerate AST)
4. FR-13: Relationship inference (simplify)
5. FR-7:  SDK layer (types, augmentation, query)
6. FR-14: Serializers
7. FR-8:  Validation rules
8. FR-9:  Hover provider
9. FR-10: Completion provider
10. FR-11: Formatting
11. FR-12: Diagram generator
12. FR-18: Tests (iterative — write alongside each step)
13. FR-15: Example files
14. FR-16: Site documentation
15. FR-17: Agent skill
16. FR-5:  Customer/Supplier (can be done inline with FR-2)
```

Steps 1–3 are foundational — everything else depends on the generated AST. Tests should be written alongside each step, not deferred to the end.


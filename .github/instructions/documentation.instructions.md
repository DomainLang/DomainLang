---
description: 'Markdown / JSDoc / docs standards for DomainLang'
applyTo: "**/*.md"
---

# Documentation rules

> Site rules in `.github/skills/site-maintainer/SKILL.md`. Writing voice in `technical-writer/SKILL.md`. Google tech writing style: https://developers.google.com/style.

## Hard rules

- **Sentence casing** for all headings (`## Getting started`, never `## Getting Started`).
- Grammar/SDK/CLI changes **must** update `/site/` and the public agent skill (`skills/domainlang/`).
- JSDoc on every exported function, class, and method.
- All code examples must work — test them.

## Doc taxonomy

| Type | Location | Audience |
|---|---|---|
| User guide | `/site/guide/` | End users |
| Reference | `/site/reference/` | Developers |
| README | Package roots | Developers |
| JSDoc | Code | Library users |
| ADR | `/adr/` | Team |
| PRS | `/requirements/` | Team |

## Voice

Second person, active voice, present tense, imperative for instructions.

```markdown
❌ In order to create a domain, one must utilize the Domain keyword.
✅ Create a domain with the `Domain` keyword:
   ```dlang
   Domain Sales {}
   ```
```

## JSDoc template

```typescript
/**
 * Brief one-line description.
 *
 * Optional longer explanation.
 *
 * @param name - Parameter description
 * @returns Return value description
 * @throws {ErrorType} When error occurs
 * @example
 * ```typescript
 * const result = myFunction('input');
 * ```
 */
export function myFunction(name: string): Result {}
```

Bad: `/** This function parses. */`, `/** TODO: Document later. */`. Good: `/** Parses a DomainLang document and returns the AST. */`.

## Grammar JSDoc

```langium
/**
 * Domain in strategic design. Hierarchies use `in`.
 * @example
 * ```dlang
 * Domain Sales in Commerce {}
 * ```
 */
Domain: 'Domain' name=ID ('in' parent=[Domain:QualifiedName])? '{' ... '}';
```

## README skeleton

Title → one-line description → Features → Installation → Quick start → Documentation link → License.

## Concept page pattern

```markdown
# Feature

One-sentence definition.

## Why use this
Bulleted benefits.

## Basic example
```dlang
// minimal working code
```

## See also
Related links.
```

Use tables for option lists (`Property | Type | Required | Description`).

## Quality checklist

- [ ] Sentence casing
- [ ] Code examples tested
- [ ] Terminology consistent
- [ ] Links work
- [ ] Right detail level for audience

## Common mistakes

| Avoid | Do |
|---|---|
| Title Casing | Sentence casing |
| Future tense | Present tense |
| Passive voice | Active voice |
| Undefined jargon | Define on first use |
| Long paragraphs | Short, scannable |
| Missing examples | Working code |

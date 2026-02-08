---
description: 'Documentation standards for DomainLang including JSDoc, Markdown, and technical writing guidelines'
applyTo: "**/*.md"
---

# Documentation Standards

> Clear, accurate documentation for DomainLang users and contributors.
> Use Google tech writing style: https://developers.google.com/style

## Critical Rules

- **Sentence casing:** All headings use sentence casing (`## Getting started`, not `## Getting Started`)
- **Code accompanies docs:** Grammar/SDK/CLI changes MUST update `/site/` docs
- **JSDoc on public APIs:** All exported functions, classes, methods documented
- **Examples tested:** All code examples must work

## Document Types

| Type | Location | Purpose | Audience |
|------|----------|---------|----------|
| User guides | `/site/guide/` | How to use features | End users |
| Reference | `/site/reference/` | Complete syntax/API | Developers |
| READMEs | Package roots | Quick start, setup | Developers |
| JSDoc | Code | API documentation | Library users |
| ADRs | `/adr/` | Architecture decisions | Team |
| PRSs | `/requirements/` | Feature requirements | Team |

## Writing Style

### Voice and Tone

- **Second person:** "You can define" (not "One can")
- **Active voice:** "Parser validates" (not "is validated")
- **Present tense:** "Returns" (not "will return")
- **Imperative instructions:** "Create a domain" (not "You should create")

### Clarity

```markdown
❌ In order to create a domain, one must utilize the Domain keyword.

✅ Create a domain with the `Domain` keyword:
\`\`\`dlang
Domain Sales {}
\`\`\`
```

## JSDoc Standards

### Template

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
export function myFunction(name: string): Result { }
```

### Best Practices

```typescript
✅ /** Parses a DomainLang document and returns the AST. */
✅ /** Validates domain names are unique within namespace. */

❌ /** This function parses. */  // Too vague
❌ /** TODO: Document later. */  // Not helpful
```

## README Structure

```markdown
# Project Title

One-sentence description.

## Features
- Feature 1
- Feature 2

## Installation
\`\`\`bash
npm install package
\`\`\`

## Quick Start
Minimal example.

## Documentation
Link to full docs.

## License
License info.
```

## Grammar Documentation

```langium
/**
 * Represents a domain in strategic design.
 * 
 * Domains organize contexts hierarchically.
 * 
 * @example
 * ```dlang
 * Domain Sales in Commerce {}
 * ```
 */
Domain:
    'Domain' name=ID ('in' parent=[Domain:QualifiedName])?
    '{' ... '}';
```

## Common Patterns

### Introducing Concepts

```markdown
# Feature Name

One-sentence definition.

## Why Use This

Benefits in bullet points.

## Basic Example

\`\`\`dlang
// Minimal working code
\`\`\`

## See Also

Links to related concepts.
```

### Documenting Options

**Use tables:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Unique identifier |
| `vision` | string | No | Strategic purpose |

## Quality Checklist

- [ ] Sentence casing on headings
- [ ] Code examples tested
- [ ] Technical terms consistent
- [ ] Links working
- [ ] Grammar/spelling correct
- [ ] Appropriate detail for audience
- [ ] Examples show best practices

## Common Mistakes

| ❌ Avoid | ✅ Do |
|----------|-------|
| Title Casing | Sentence casing |
| Future tense | Present tense |
| Passive voice | Active voice |
| Undefined jargon | Define terms first use |
| Long paragraphs | Short, scannable text |
| Missing examples | Include working code |
| Outdated info | Keep synced with code |

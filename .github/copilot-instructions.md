# DomainLang Instructions

> Repository-wide guidance for DomainLang: Langium-based DSL for Domain-Driven Design modeling.

## Project Essentials

**What:** Compilable DSL for DDD specification with LSP tooling  
**Stack:** TypeScript 5.x, Langium 4.x, Node.js 20+, Vite, Vitest  
**Working Directory:** `dsl/domain-lang/`  
**Website:** https://domainlang.net (source: `/site/`)

## Core Principles

- Extend existing patterns before inventing new
- Align DSL with DDD terminology
- Write readable, self-documenting code
- Every change requires tests
- Documentation accompanies code (grammar/SDK/CLI → site updates)

## Writing Style

- **Sentence casing:** Use sentence casing for all headings (`## Getting started`, not `## Getting Started`)
- **Never use title casing** in documentation headings
- Use perplexity tools to research unfamiliar topics and search the web

## Quick Reference

```bash
npm run langium:generate  # After .langium changes
npm run build             # Full build
npm run lint              # Check quality (must pass)
npm run test              # Run tests
```

**Critical:** All changes MUST pass `npm run lint` (0 errors/warnings) before commit.

## Skill Selection (Mandatory)

Load the appropriate skill file FIRST using read_file before proceeding:

| Task Type | Load Skill File |
|-----------|-----------------|
| Website/domainlang.net pages | `.github/skills/site-maintainer/SKILL.md` |
| Documentation (READMEs, ADRs, JSDoc) | `.github/skills/technical-writer/SKILL.md` |
| Syntax/semantics design | `.github/skills/language-expert/SKILL.md` |
| TypeScript/Langium implementation | `.github/skills/lead-engineer/SKILL.md` |
| Test strategy/Vitest tests | `.github/skills/tester/SKILL.md` |
| Architecture/ADRs/requirements | `.github/skills/software-architect/SKILL.md` |

**Rule:** User says "documentation" but target is domainlang.net → Use site-maintainer (then technical-writer for style).

See `.github/instructions/` for language-specific rules (TypeScript, Langium, testing, documentation).


## Project Architecture

| Component | Path | Purpose |
|-----------|------|---------|
| Agent Skill | `skills/domainlang/` | Public skill for AI agents |
| Grammar | `packages/language/src/domain-lang.langium` | DSL syntax |
| Generated AST | `packages/language/src/generated/**` | **🔴 NEVER EDIT** |
| LSP Features | `packages/language/src/lsp/` | Hover, completion, formatting |
| Validation | `packages/language/src/validation/` | Domain rules, BC checks |
| Services | `packages/language/src/services/` | Import resolution, workspace |
| Shared Types | `packages/language/src/services/types.ts` | **Single source** for types |
| Model Query SDK | `packages/language/src/sdk/` | Programmatic queries |
| Tests | `packages/language/test/` | All tests |

## Critical Rules

### Git & Commits

- **NEVER** commit without explicit approval
- Use [conventional commits](https://www.conventionalcommits.org): `type(scope): subject`
- **ALWAYS** run: `npm run lint && npm run build && npm test` before commit
- **ALWAYS** commit package.json + package-lock.json together atomically
- **NEVER** commit code that doesn't compile or has lint errors/warnings
- **NEVER** commit code with test coverage below thresholds

**Commit types:**
- `feat:` → minor version bump (new features)
- `fix:` → patch version bump (bug fixes)
- `feat!:` or `BREAKING CHANGE:` → major version bump
- `docs:`, `test:`, `refactor:`, `chore:` → no version bump

**Scopes (recommended):** `grammar`, `validation`, `lsp`, `sdk`, `cli`, `extension`, `site`, `ci`

**Example:** `feat(grammar): add deprecated modifier`

### Grammar Changes

- **NEVER** edit `packages/language/src/generated/**`
- Run `npm run langium:generate` after editing `.langium` files
- Add test cases for parsing changes
- Update LSP features (hover, completion, validation) when grammar changes
- Update `/site/` documentation for new keywords

### Type Organization

- **All** shared types go in `packages/language/src/services/types.ts`
- Search types.ts before creating new interfaces
- Consolidate similar types (avoid `PackageInfo`, `PackageMetadata`, `PackageSpec` separately)

### Documentation

**Grammar/syntax changes:**
- Update `/site/guide/` and `/site/reference/`
- Add `.dlang` examples in `dsl/domain-lang/examples/`
- Add JSDoc on grammar rules
- Update agent skill (`skills/domainlang/`) if syntax or keywords changed

**model.yaml changes:**
- Update `/site/public/schema/model.schema.json`
- Update `/site/guide/imports.md` if user-facing
- Update agent skill references if import/manifest syntax changed

### Code Quality

- Lint MUST pass with 0 errors, 0 warnings
- Use `npm run lint:fix` for auto-fixes
- TypeScript strict mode, no exceptions
- Prefer `unknown` over `any` with type guards
- Explicit return types on public functions
- Prefix unused params with `_`
- No unsafe `!` assertions in production code
- No `console.log()` in libraries (only `warn`/`error`)

### PRS Implementation

When implementing a PRS from `requirements/`:
- Ask questions if requirements are unclear or ambiguous
- Use the plan feature to structure multi-step implementation
- Ensure all acceptance criteria are covered by tests
- Track progress in the PRS document

## Release Process

**CI/CD Pipeline:**
- Quality Gate: Lint → Build → Test+Coverage (fail-fast)
- Analysis Gate: SonarQube (blocking) + CodeQL (parallel)
- Production Gate: Manual approval required for all deployments
- Publishing: NPM packages, VS Code extension, site deploy in parallel

**Workflow:**
1. Conventional commits on `main` → release-please creates/updates Release PR
2. Merge Release PR → GitHub release + git tag + publish all artifacts
3. All packages versioned together using semver

## Language Quick Reference

| Construct | Example |
|-----------|---------|
| Domain | `Domain Sales { vision: "..." }` |
| Subdomain | `Domain Orders in Sales {}` |
| BoundedContext | `bc OrderContext for Sales as Core by SalesTeam` |
| ContextMap | `ContextMap Sales { contains OrderContext, BillingContext }` |
| Relationship | `[OHS] this -> [CF] PaymentContext` |
| Namespace | `namespace acme.sales { ... }` |
| Import | `import "owner/repo@v1.0.0"` |

**DDD Patterns:** `[OHS]` Open Host Service · `[CF]` Conformist · `[ACL]` Anti-Corruption Layer · `[PL]` Published Language · `[P]` Partnership · `[SK]` Shared Kernel

## Model Query SDK

**Entry points:**
- `loadModelFromText(text)` - Browser-safe parsing
- `loadModel(file)` - Node.js file loader
- `fromDocument(document)` - Zero-copy LSP integration
- `fromModel(model)` - Direct AST wrapping

**Access patterns:**
```typescript
// Direct AST access
const desc = bc.description;

// SDK augmented (precedence resolution)
const role = bc.effectiveRole;    // Header 'as' wins over body 'role:'
const team = bc.effectiveTeam;    // Header 'by' wins over body 'team:'
const meta = bc.metadataMap;      // Metadata as Map

// Fluent queries
query.boundedContexts().withRole('Core').withTeam('SalesTeam').toArray();
```

## Testing Requirements

- Use AAA pattern (Arrange/Act/Assert) with explicit comments
- Test behavior, not implementation (assertion should not be tautological with implementation)
- Happy path + edge cases + error scenarios
- See `.github/instructions/testing.instructions.md` for patterns

```typescript
test('should validate domain vision', async () => {
    // Arrange
    const doc = await testServices.parse(s`Domain Sales {}`);
    
    // Act
    const diagnostics = await testServices.validate(doc);
    
    // Assert
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('missing vision');
});
```

## Validation Rules

- Missing domain vision → warning
- Missing BC description → warning
- Duplicate FQN names → error
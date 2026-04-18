# DomainLang

Langium 4.x DSL for DDD. Workdir `dsl/domain-lang/`. Site `domainlang.net` (source `/site/`). Pure ESM; imports use `.js`.

## Pre-commit gate

From `dsl/domain-lang/`, all three must exit 0 before any commit/push:

```bash
npm run lint && npm run build && npm run test:coverage
```

Lint: 0 errors, 0 warnings. Tests: pass in every workspace package. Never `--no-verify`. Never lower coverage thresholds without explicit user approval. Never commit without user approval. Commit `package.json` + `package-lock.json` together.

## SonarQube gate

- When changing any code file (`*.ts`, `*.tsx`, `*.js`, `*.jsx`), run a SonarQube scan and require a passing result.
- Treat SonarQube as a blocking quality gate: do not consider the task done if the scan fails.
- In this repository, the authoritative scan is the CI job `📊 SonarQube Analysis` in `.github/workflows/ci-cd.yml`; ensure it passes for code-file changes.

## Architecture

Layered: Generated → Services → Validation/Diagram → LSP → Entry. SDK couples to services only via `sdk/bootstrap.ts`. Validation uses `ImportCycleDetector` (in `services/types.ts`) — never depend on LSP.

| Component | Path |
| --- | --- |
| Grammar | `packages/language/src/domain-lang.langium` |
| Generated AST (never edit) | `packages/language/src/generated/**` |
| LSP | `packages/language/src/lsp/` |
| Validation | `packages/language/src/validation/` |
| Services | `packages/language/src/services/` |
| Shared types (single source) | `packages/language/src/services/types.ts` |
| Model Query SDK | `packages/language/src/sdk/` |
| Tests | `packages/language/test/` |
| Public agent skill | `skills/domainlang/` |

## Skill selection

Read the matching skill via `read_file` before working:

| Task | Skill |
| --- | --- |
| Site / domainlang.net | `.github/skills/site-maintainer/SKILL.md` |
| READMEs, ADRs, JSDoc | `.github/skills/technical-writer/SKILL.md` |
| Syntax / semantics design | `.github/skills/language-expert/SKILL.md` |
| TS / Langium impl | `.github/skills/lead-engineer/SKILL.md` |
| Vitest tests | `.github/skills/tester/SKILL.md` |
| ADRs / PRSs / architecture | `.github/skills/software-architect/SKILL.md` |
| Critical code review | `.github/skills/critical-code-reviewer/SKILL.md` |

"Documentation" targeting domainlang.net → site-maintainer first, then technical-writer.

Per-language rules in `.github/instructions/{typescript,langium,testing,documentation}.instructions.md` apply via `applyTo` globs.

## Hard rules

- Never edit `src/generated/**`. After `.langium` edits run `npm run langium:generate` then `npm run build`.
- New behavior requires tests. User-visible grammar/SDK/CLI changes require `/site/` updates.
- All shared types in `services/types.ts`. Search before adding interfaces; consolidate >80% overlaps.
- TS strict, no `any` (use `unknown` + guards), explicit return types on public APIs, prefix unused params `_`, no `console.log` in libraries (`warn`/`error` only), no unsafe `!`.
- Wrap LSP entry points in `try/catch`; return safe defaults (`undefined`, `[]`).
- Sentence casing for all headings (`## Getting started`, never `Getting Started`).
- Use perplexity tools to research unfamiliar topics.

## New SDK feature checklist

1. Tests first in `packages/language/test/sdk/` (use `setupTestSuite()`, AAA).
2. JSDoc all new exports; update `sdk/index.ts` module doc and `/site/guide/sdk.md`.
3. Export from `sdk/index.ts` (browser-safe) or `sdk/loader-node.ts` (Node-only). Update `package.json` exports for new subpaths.

## Conventional commits

`feat:` minor · `fix:` patch · `feat!:` / `BREAKING CHANGE:` major · `docs|test|refactor|chore:` no bump.

Scopes: `grammar`, `validation`, `lsp`, `sdk`, `cli`, `extension`, `site`, `ci`. Example: `feat(grammar): add deprecated modifier`.

## DDD quick reference

| Construct | Example |
| --- | --- |
| Domain | `Domain Sales { vision: "..." }` |
| Subdomain | `Domain Orders in Sales {}` |
| BoundedContext | `bc OrderContext for Sales as Core by SalesTeam` |
| ContextMap | `ContextMap Sales { contains OrderContext, BillingContext }` |
| Relationship | `this [OHS] -> [CF] PaymentContext` |
| Namespace | `namespace acme.sales { ... }` |
| Import | `import "owner/repo@v1.0.0"` |

Patterns: `[OHS]` Open Host Service · `[CF]` Conformist · `[ACL]` Anti-Corruption Layer · `[PL]` Published Language · `[P]` Partnership · `[SK]` Shared Kernel · `[S]` Supplier · `[C]` Customer · `[SW]` Separate Ways.
Arrows: `->` upstream/downstream · `<-` reverse · `<->` bidirectional · `><` Separate Ways.

## SDK entry points

- `loadModelFromText(text)` — browser-safe parse
- `loadModel(file)` — Node loader
- `fromDocument(document)` — zero-copy LSP integration
- `fromModel(model)` — direct AST wrapping

`bc.effectiveRole` / `effectiveTeam`: header (`as`/`by`) wins over body. `bc.metadataMap`: metadata as `Map`. Fluent: `query.boundedContexts().withRole('Core').toArray()`.

## Validation rules

| Rule | Severity |
| --- | --- |
| Missing domain `vision` | warning |
| Missing BC `description` | warning |
| Duplicate FQN | error |

## Release

Conventional commits on `main` → release-please opens Release PR → merging tags + publishes (NPM, VS Code extension, site). Pipeline: Quality Gate (lint/build/test, fail-fast) → Analysis (SonarQube blocking + CodeQL) → manual approval → parallel publish.

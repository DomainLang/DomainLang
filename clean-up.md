# DomainLang Repository Cleanup Plan

> **Status:** In Progress  
> **Created:** 2025-01-31  
> **Purpose:** Consolidate documentation, remove orphan files, simplify CI for better maintainability

---

## Executive Summary

This cleanup aims to:

1. **Consolidate user-facing docs** → Single source of truth at `/site/` (domainlang.net)
2. **Remove orphan/duplicate files** → Clean repo structure
3. **Simplify CI** → One multi-stage workflow with proper gates

---

## Phase 1: Documentation Consolidation

### Current State

| Location | Purpose | Action |
| -------- | ------- | ------ |
| `/site/` | Public website (domainlang.net) | **KEEP** - Primary user docs |
| `dsl/domain-lang/docs/` | Internal language docs | **REMOVE** - Consolidate into `/site/` |
| `dsl/domain-lang/packages/language/docs/` | Contains only `syntax-diagram.html` | **REMOVE** - Orphan file |
| Root `README.md` | Project overview | **UPDATE** - Point to domainlang.net |
| `dsl/domain-lang/README.md` | Workspace docs | **KEEP** - Developer reference |
| Package READMEs | npm package docs | **KEEP** - Required for npm |

### Duplicate Content Found

- [x] `dsl/domain-lang/docs/getting-started.md` ↔ `/site/guide/getting-started.md` (DUPLICATE)
- [x] `dsl/domain-lang/docs/language.md` ↔ `/site/reference/language.md` (DUPLICATE)
- [x] `dsl/domain-lang/docs/quick-reference.md` ↔ `/site/reference/quick-reference.md` (DUPLICATE)
- [x] `dsl/domain-lang/docs/imports.md` ↔ `/site/guide/imports.md` (DUPLICATE)

### Actions

- [x] Delete `dsl/domain-lang/docs/` folder entirely
- [x] Delete `dsl/domain-lang/packages/language/docs/` folder
- [x] Update root `README.md` to link to domainlang.net
- [x] Update `.github/copilot-instructions.md` to remove internal docs references
- [x] Update `.github/instructions/documentation.instructions.md` to reflect single source

---

## Phase 2: Orphan Files Cleanup

### Coverage Reports (Should NOT be committed)

- [x] Delete `dsl/domain-lang/coverage/` (entire folder - should be gitignored)

### Old VSIX Files (Should NOT be committed)

- [x] Delete `dsl/domain-lang/packages/extension/domain-lang-0.1.0.vsix`
- [x] Delete `dsl/domain-lang/packages/extension/domain-lang-0.2.0.vsix`

### Langium Quickstart (Boilerplate, not needed)

- [x] Delete `dsl/domain-lang/packages/extension/langium-quickstart.md`

### Empty Folders

- [x] Delete `dsl/domain-lang/scripts/` (empty folder)

### Outdated/Orphan Files

- [x] Deleted with docs folder (contents were in `dsl/domain-lang/docs/`)

### Update .gitignore

- [x] `coverage/` already in gitignore
- [x] `*.vsix` already in gitignore

---

## Phase 3: Test Deduplication

### Analysis

After reviewing all test files, **no duplicate tests** were found. Tests are well-organized:

- `parsing/` - Syntax parsing tests
- `validating/` - Validation rule tests
- `linking/` - Cross-reference resolution
- `sdk/` - Query SDK tests
- `lsp/` - LSP feature tests

No action required on tests.

---

## Phase 4: Instructions & Skills Update

### Instructions to Update

| File | Issue | Action |
| ---- | ----- | ------ |
| `documentation.instructions.md` | ~~References both /site/ and docs/~~ | ✅ Updated to `/site/` only |
| `typescript.instructions.md` | References outdated file paths | ✅ Verified paths are current |
| `testing.instructions.md` | Good | No changes needed |
| `langium.instructions.md` | ~~References deleted docs + broken grammar link~~ | ✅ Updated to `/site/` + fixed link |

### Skills to Update

| File | Issue | Action |
| ---- | ----- | ------ |
| `site-maintainer/SKILL.md` | ~~References deleted deploy-docs.yml + old docs path~~ | ✅ Updated |
| `technical-writer/SKILL.md` | ~~References dual doc systems~~ | ✅ Updated to single source |
| `lead-engineer/SKILL.md` | ~~References "site + internal docs"~~ | ✅ Simplified to single source |

### Copilot Instructions

- [x] Update `.github/copilot-instructions.md` to remove references to `dsl/domain-lang/docs/`

---

## Phase 5: CI Workflow Consolidation

### Current State (3 separate workflows - REMOVED)

1. ~~`build.yml`~~ - Removed
2. ~~`deploy-docs.yml`~~ - Removed
3. ~~`release.yml`~~ - Removed

### New State (1 unified workflow)

Created `.github/workflows/ci.yml` with stages:

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Build    │ ──▶ │   Analyze   │ ──▶ │   Deploy    │
│  & Test     │     │ (Security)  │     │  (Manual)   │
└─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
  - npm install      - CodeQL scan        - Docs (auto on main)
  - langium:gen                           - Release (manual)
  - build                                 - NPM publish
  - lint                                  - VSIX publish
  - test
  - coverage
  - artifacts
```

### Workflow Features Implemented

- [x] Single `ci.yml` file with job dependencies
- [x] Reusable artifacts between jobs
- [x] CodeQL analysis on push and pull_request
- [x] SonarQube scan (optional when configured via secrets)
- [x] Manual approval gate for release (workflow_dispatch with inputs)
- [x] Docs deployment only on main branch
- [x] Proper concurrency controls
- [x] Production environment with manual approval
- [x] Local composite action for Node + npm ci

### Files Deleted

- [x] `.github/workflows/build.yml`
- [x] `.github/workflows/deploy-docs.yml`
- [x] `.github/workflows/release.yml`

---

## Phase 6: Final Cleanup

- [x] Run `npm run lint` to ensure no regressions
- [x] Run `npm test` to verify everything works
- [x] Verify site builds: `cd site && npm run build`
- [ ] Create PR with all changes

---

## Progress Tracking

| Phase | Status | Completed |
| ----- | ------ | --------- |
| Phase 1: Documentation | ✅ Complete | 2025-01-31 |
| Phase 2: Orphan Files | ✅ Complete | 2025-01-31 |
| Phase 3: Test Review | ✅ Complete | No duplicates found |
| Phase 4: Instructions | ✅ Complete | 2025-01-31 |
| Phase 5: CI Workflows | ✅ Complete | 2025-01-31 |
| Phase 6: Final Checks | ✅ Complete | 2025-01-31 |

## Verification Results

All checks passed:

- ✅ `npm run lint` — 0 errors, 0 warnings
- ✅ `npm run build` — Successful
- ✅ `npm test` — 518 tests passed (1 skipped)
- ✅ `site build` — Successful

---

## Notes

- The `/requirements/` folder contains PRSs and should be kept
- The `/adr/` folder contains architecture decisions and should be kept
- Package READMEs (`cli/README.md`, `language/README.md`, `extension/README.md`) are required for npm publishing
- Examples in `dsl/domain-lang/examples/` are referenced by the site and should stay

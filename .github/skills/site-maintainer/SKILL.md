---
name: site-maintainer
description: Use for documentation website tasks including VitePress pages, site configuration, deployment, and user-facing documentation at domainlang.net. Activate when creating or updating pages in /site/, configuring the VitePress site, or publishing documentation.
---

# Site Maintainer

You maintain the public documentation website at **domainlang.net** (`/site/` source).

## Non-Negotiables

- **Public-facing:** Everything in `/site/` published at https://domainlang.net
- **Documentation accompanies code:** Grammar/SDK/CLI changes MUST include `/site/` updates
- **Sentence casing:** All headings use sentence casing (`## Getting started`, not `## Getting Started`)
- **Single source of truth:** All user docs in `/site/` only

## Your Role

- Create/maintain user documentation pages
- Configure VitePress site and navigation
- Ensure consistent style and formatting
- Add code examples with syntax highlighting
- Maintain site deployment

**Related skill:** `.github/skills/technical-writer/SKILL.md` (writing style)

## Skill Pairing

- **This skill first:** Information architecture, navigation, public quality
- **Technical-writer second:** Writing style, clarity, technical correctness

## Site Architecture

| Path | Purpose | Content |
|------|---------|---------|
| `/site/guide/` | Teach and onboard | Narrative explanations, best practices, progressive examples |
| `/site/reference/` | Authoritative syntax | Complete details, keywords, canonical examples |
| `/site/examples/` | Realistic models | Working examples with explanations |
| `/site/roadmap.md` | Future plans | Speculative content |

**Rule:** Guide teaches, Reference defines, Examples prove.

## Page Structure Template

```markdown
# Page Title

One-sentence description of what this page covers.

## Basic Syntax

Show simplest example first.

\`\`\`dlang
// Minimal working example
\`\`\`

## Properties / Options

Table or list of available options.

## Examples

Real-world examples with context.

## Best Practices

::: tip
Actionable advice
:::

## See Also

Links to related pages.
```

## VitePress Configuration

### Key Settings (`/site/.vitepress/config.mts`)

```typescript
export default defineConfig({
  title: 'DomainLang',
  base: '/',           // CRITICAL: Use '/' for domainlang.net
  cleanUrls: true,     // No .html extensions
  lastUpdated: true,
})
```

### Syntax Highlighting

**Always use `dlang` for code blocks:**

````markdown
```dlang
Domain Sales { vision: "Sell products" }
```
````

Custom TextMate grammar registered in `config.mts`.

### Navigation

```typescript
themeConfig: {
  nav: [
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'Reference', link: '/reference/language' },
  ],
  sidebar: {
    '/guide/': [
      { text: 'Introduction', items: [...] },
      { text: 'Core Concepts', items: [...] },
    ]
  }
}
```

## VitePress Containers

```markdown
::: info
Neutral information
:::

::: tip
Helpful advice
:::

::: warning
Be careful about this
:::

::: danger
Critical warning
:::

::: details Click to expand
Hidden content
:::
```

## Writing Style

### Voice
- **User-focused:** DDD practitioners learning DSL
- **Action-oriented:** Use imperatives ("Create a domain", "Add a context")
- **Concise:** Short sentences, scannable
- **Welcoming:** Assume readers new to DomainLang

### Links
```markdown
<!-- Internal (relative, no .md) -->
See [Bounded Contexts](/guide/bounded-contexts) for details.

<!-- External (full URL) -->
[VS Code Extension](https://marketplace.visualstudio.com/items?itemName=...)
```

## Feature Documentation Sync

**When implementing grammar/SDK/CLI changes:**

- [ ] Guide page updated or created
- [ ] Reference page updated (syntax changes)
- [ ] Quick reference updated (common patterns)
- [ ] Getting started updated (onboarding affected)
- [ ] Examples updated (new patterns)
- [ ] Sidebar navigation wired
- [ ] Agent skill updated (`skills/domainlang/SKILL.md` and `references/SYNTAX.md`) if syntax, keywords, patterns, or tooling changed

## Deployment

**GitHub Actions workflow:**
- **Trigger:** Push to `main` with `site/` changes
- **Fast Path:** Site-only changes skip quality gates, require manual approval
- **Deploy:** GitHub Pages → domainlang.net

**Local development:**
```bash
cd site
npm run dev      # localhost:5173
npm run build    # Production build
npm run preview  # Preview build
```

## Adding New Pages

1. Create markdown file: `site/guide/new-feature.md`
2. Add frontmatter (optional):
   ```markdown
   ---
   title: Custom Title
   description: SEO description
   ---
   ```
3. Update navigation in `config.mts`
4. Cross-link from related pages

## Quality Checklist

- [ ] Content accurate vs current grammar/CLI
- [ ] Sentence casing on all headings
- [ ] Page in correct area (guide/reference/examples)
- [ ] Navigation updated in `config.mts`
- [ ] Code blocks use `dlang`
- [ ] Links correct (relative internal)
- [ ] Cross-references to prerequisite/related pages
- [ ] No internal notes or TODOs
- [ ] Agent skill in sync with site content (`skills/domainlang/`)
- [ ] Tested locally

## Commit Messages

```bash
# Site changes (no version bump)
docs(site): add migration guide for v2.0.0
docs(site): improve getting started tutorial
docs(site): fix broken links in context map guide

# Configuration
chore(site): update VitePress to v1.5.0
```

## Microsoft TechDocs Standards

- **Lead with value:** Answer "what will reader learn?"
- **Progressive disclosure:** Simple → complex, link for depth
- **Cross-reference liberally:** Link prerequisites and related
- **Consistent terminology:** Same term for same concept
- **Introduce new concepts clearly:** Define terms on first use. Link to reference for details.
- **Scannable:** Tables, lists, callouts
- **Code before prose:** Show example, then explain
- **One idea per paragraph:** Split if multiple ideas

## Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Blue | `#027fff` | Primary, links, buttons |
| Cyan | `#00e5fc` | Accent, highlights |

Custom variables in `/site/.vitepress/theme/style.css`

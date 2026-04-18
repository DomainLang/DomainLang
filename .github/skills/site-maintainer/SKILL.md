---
name: site-maintainer
description: Use for documentation website tasks — VitePress pages, navigation, deployment, and user-facing docs at domainlang.net (source in /site/).
---

# Site maintainer

You maintain the public documentation website at **https://domainlang.net** (source: `/site/`).

> Markdown rules, sentence casing, and writing voice live in `.github/instructions/documentation.instructions.md` and `.github/skills/technical-writer/SKILL.md`. This skill owns information architecture, VitePress, and deploy.

## Non-negotiables

- Everything in `/site/` is published — no internal notes, TODOs, or repo paths.
- Grammar / SDK / CLI changes **must** include `/site/` updates in the same PR.
- Sentence casing for all headings.
- Single source of truth: user-facing docs live only in `/site/`.

## Skill pairing

1. **This skill first** — IA, navigation, page placement, public quality.
2. **technical-writer second** — voice, clarity, factual accuracy.

## Site architecture

| Path | Purpose | Content style |
|---|---|---|
| `/site/guide/` | Teach and onboard | Narrative, progressive examples, best practices |
| `/site/reference/` | Authoritative syntax | Complete, canonical, stable |
| `/site/examples/` | Realistic models | Working `.dlang` with explanation |
| `/site/roadmap.md` | Future plans | Speculative — mark clearly |

**Rule:** Guide *teaches*, Reference *defines*, Examples *prove*.

## Page template

```markdown
# Page title

One-sentence description of what this page covers.

## Basic syntax

\`\`\`dlang
// Minimal working example
\`\`\`

## Properties / options

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique identifier |

## Examples

Real-world examples with context.

## Best practices

::: tip
Actionable advice.
:::

## See also

- [Related page](/guide/related)
```

## VitePress essentials

```typescript
// /site/.vitepress/config.mts
export default defineConfig({
    title: 'DomainLang',
    base: '/',           // CRITICAL for domainlang.net
    cleanUrls: true,     // no .html extensions
    lastUpdated: true,
    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'Reference', link: '/reference/language' },
        ],
        sidebar: { '/guide/': [ /* ... */ ] },
    },
});
```

Always use ` ```dlang ` for DSL code blocks (custom TextMate grammar registered in `config.mts`).

## VitePress containers

```markdown
::: info / tip / warning / danger
Single-line callout body.
:::

::: details Click to expand
Hidden content.
:::
```

## Links

```markdown
<!-- internal: relative, no .md, no anchors unless needed -->
See [Bounded contexts](/guide/bounded-contexts).

<!-- external: full URL -->
[VS Code Extension](https://marketplace.visualstudio.com/items?itemName=...)
```

## Deployment

- GitHub Actions, triggered on push to `main` with `/site/` changes.
- Site-only changes skip the language quality gate but require manual approval.
- Deploys to GitHub Pages → domainlang.net.

```bash
cd site
npm run dev      # http://localhost:5173
npm run build    # Production build
npm run preview  # Preview build locally
```

## Adding a new page

1. Create `site/guide/new-feature.md` (or `reference/`, `examples/`).
2. Optional frontmatter for SEO / custom title.
3. Wire into the sidebar in `config.mts`.
4. Cross-link from related pages (prerequisites + follow-ons).
5. Verify with `npm run dev`.

## Feature documentation sync checklist

When grammar / SDK / CLI changes ship:

- [ ] Guide page updated or added.
- [ ] Reference page updated for syntax changes.
- [ ] `/site/reference/quick-reference.md` updated for common patterns.
- [ ] `/site/guide/getting-started.md` updated if onboarding changed.
- [ ] Examples updated for new patterns.
- [ ] Sidebar wired in `config.mts`.
- [ ] Public agent skill (`skills/domainlang/SKILL.md` + `references/SYNTAX.md`) in sync.

## Public quality checklist

- [ ] Content matches current grammar / CLI behavior.
- [ ] Sentence casing on all headings.
- [ ] Page in correct area (guide vs reference vs examples).
- [ ] All code blocks use `dlang`.
- [ ] All links work; internal links use relative paths.
- [ ] Cross-references to prerequisites + related pages.
- [ ] No internal notes, TODOs, or repo paths.
- [ ] Tested locally with `npm run dev`.

## Microsoft TechDocs principles applied

- **Lead with value** — answer "what will the reader learn?" in the first sentence.
- **Progressive disclosure** — simple → complex; link to depth.
- **Cross-reference liberally** — link prerequisites and related concepts.
- **Consistent terminology** — same term for the same concept everywhere.
- **Define on first use** — link to reference for full detail.
- **Scannable** — tables, lists, callouts; one idea per paragraph.
- **Code before prose** — show the example, then explain.

## Brand colors

| Color | Hex | Usage |
|---|---|---|
| Blue | `#027fff` | Primary, links, buttons |
| Cyan | `#00e5fc` | Accent, highlights |

Custom variables in `/site/.vitepress/theme/style.css`.

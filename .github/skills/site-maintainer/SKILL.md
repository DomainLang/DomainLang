---
name: site-maintainer
description: Use for documentation website tasks including VitePress pages, site configuration, deployment, and user-facing documentation at domainlang.net. Activate when creating or updating pages in /site/, configuring the VitePress site, or publishing documentation.
---

# Site Maintainer

You are the Site Maintainer for DomainLang - responsible for the public documentation website at **domainlang.net**.

## Non-negotiables

- **Public-facing:** Everything in `/site/` is published for public consumption at <https://domainlang.net>. Write accordingly.
- **High-quality bar:** Treat changes like a product surface: accurate, consistent, well-structured, and easy to scan.
- **Single source of truth:** All user-facing documentation lives in `/site/`. Do not introduce new user-docs elsewhere.
- **Documentation accompanies code:** Changes to grammar, SDK, or CLI **must** include corresponding site documentation updates. Do not ship features without docs.
- **Sentence casing:** Use sentence casing for all headings (`## Getting started`, not `## Getting Started`). Never use title casing.

## Skill activation (mandatory)

Use this skill whenever you:

- Edit any file under `/site/`.
- Write or restructure any user-facing documentation (even if the initial request is "documentation" broadly).

If you're writing documentation:

- Use **this** skill first (information architecture, navigation, public quality).
- Use `.github/skills/technical-writer/SKILL.md` second (writing style, clarity, technical correctness).

## Your role

- Create and maintain user documentation pages
- Configure VitePress site settings and navigation
- Ensure consistent style and formatting across all pages
- Add code examples with proper syntax highlighting
- Maintain site deployment via GitHub Actions

**Live site:** <https://domainlang.net>

**Site source:** `/site/`

**Related skill:** `.github/skills/technical-writer/SKILL.md` (for writing style guidelines)

## Existing site style (what to match)

The current `/site` content consistently uses:

- A short, direct opening sentence describing the page.
- Simple sectioning with predictable headings (e.g., **Keywords**, **Basic syntax**, **Best practices**, **Examples**, **Next steps**, **See also**).
- Small, copy-pastable `dlang` examples.
- VitePress callouts for emphasis (`tip`, `warning`, `info`) rather than long prose.
- Clear cross-links between guide pages and the reference.

When adding a new page, follow the same narrative sequence and keep the tone:

- Second-person, action-oriented, minimal jargon.
- Prefer short paragraphs and bullets over dense blocks of text.

## Professional documentation standards (Microsoft TechDocs-style)

- **Lead with value:** Start each page by answering "what will the reader learn or accomplish?"
- **Progressive disclosure:** Introduce concepts in order of increasing complexity. Link to deeper content; don't overload early sections.
- **Cross-reference liberally:** Every concept should link to prerequisite and related content. Use "See also" sections.
- **Consistent terminology:** Use the same term for the same concept throughout (e.g., always "bounded context", not sometimes "context").
- **Scannable structure:** Use tables, lists, and callouts. Readers skim—make the important parts visible.
- **Code before prose:** Show a working example first, then explain.
- **One idea per paragraph:** If a paragraph covers multiple ideas, split it.

## Information architecture (put things in the right place)

- `/site/guide/`
  - Purpose: teach and onboard.
  - Content: narrative explanations, best practices, recommended patterns, progressive examples.
  - Rule: it's OK to simplify and link to reference for full syntax.

- `/site/reference/`
  - Purpose: authoritative syntax + semantics.
  - Content: complete details, keyword lists, edge cases, canonical examples.
  - Rule: avoid long tutorials; link back to guide for learning flow.

- `/site/examples/`
  - Purpose: realistic end-to-end models.
  - Content: explanation + highlights + links to source models.
  - Rule: examples should reinforce the guide and prove the reference.

- `/site/roadmap.md`
  - Purpose: future plans.
  - Rule: keep speculative content here, not in guide/reference.

## Avoiding repetition (without losing discoverability)

- Some duplication between **guide** and **reference** is healthy (discoverability).
- Avoid copy/paste drift:
  - Prefer the **reference** as the canonical syntax description.
  - Prefer the **guide** for "why" and "how to apply".
  - If you must repeat, keep phrasing consistent and link to the canonical section.

## Public documentation quality checklist

Before merging changes to `/site/`:

- [ ] Content is accurate vs current grammar/CLI/extension.
- [ ] All headings use sentence casing.
- [ ] Page belongs in the correct area (guide vs reference vs examples).
- [ ] Navigation is updated in `/site/.vitepress/config.mts` when needed.
- [ ] All code blocks use `dlang` for DomainLang.
- [ ] Links are correct and use clean, relative internal links.
- [ ] Cross-references to prerequisite and related pages are included.
- [ ] No internal notes, TODOs, or repo-only assumptions.

## Feature documentation sync checklist

When implementing grammar, SDK, or CLI changes:

- [ ] Guide page updated or created (if user-facing concept).
- [ ] Reference page updated (if syntax/keyword change).
- [ ] Quick reference updated (if common pattern affected).
- [ ] Getting started updated (if affects onboarding flow).
- [ ] Examples updated (if new patterns demonstrated).
- [ ] Sidebar wired if new page added.

## Site architecture

```text
site/
├── .vitepress/
│   ├── config.mts          # VitePress configuration
│   ├── theme/
│   │   ├── index.ts        # Theme setup
│   │   └── style.css       # Custom brand styling
│   └── cache/              # Build cache (gitignored)
├── public/
│   ├── logo.svg            # Site logo
│   └── favicon.ico         # Browser favicon
├── guide/                  # Tutorial content
│   ├── getting-started.md
│   ├── what-is-domainlang.md
│   ├── domains.md
│   ├── bounded-contexts.md
│   ├── context-maps.md
│   ├── teams-classifications.md
│   ├── namespaces.md
│   └── imports.md
├── reference/              # Technical reference
│   ├── language.md
│   └── quick-reference.md
├── examples/               # Real-world examples
│   ├── index.md
│   ├── banking-system.md
│   └── healthcare-system.md
└── index.md                # Home page
```

## Configuration reference

### VitePress config (`config.mts`)

Key configuration in `/site/.vitepress/config.mts`:

```typescript
export default defineConfig({
  title: 'DomainLang',
  description: 'A DSL for Domain-Driven Design modeling',
  
  // CRITICAL: Use '/' for custom domain (domainlang.net)
  // Only use '/DomainLang/' for GitHub Pages project site
  base: '/',
  
  cleanUrls: true,        // No .html extensions
  lastUpdated: true,      // Show last updated timestamp
  
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { property: 'og:url', content: 'https://domainlang.net/' }],
  ],
})
```

### Custom syntax highlighting

DomainLang syntax highlighting is registered via custom TextMate grammar:

```typescript
const domainLangGrammar: LanguageRegistration = {
  name: 'dlang',
  scopeName: 'source.domain-lang',
  aliases: ['domain-lang', 'domainlang'],
  // ... patterns for keywords, strings, comments
}

export default defineConfig({
  markdown: {
    languages: [domainLangGrammar]
  }
})
```

Use `dlang` as the language identifier in code blocks:

````markdown
```dlang
Domain Sales { vision: "Sell stuff" }
```
````

### Navigation structure

Update navigation in `config.mts`:

```typescript
themeConfig: {
  nav: [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'Reference', link: '/reference/language' },
  ],
  sidebar: {
    '/guide/': [
      { text: 'Introduction', items: [...] },
      { text: 'Core Concepts', items: [...] },
      { text: 'Advanced', items: [...] },
    ]
  }
}
```

### Brand colors

The site uses colors from the DomainLang logo:

| Color | Hex       | Usage                              |
|-------|-----------|------------------------------------|
| Blue  | `#027fff` | Primary brand color, links, buttons|
| Cyan  | `#00e5fc` | Accent color, highlights           |

Custom theme variables in `/site/.vitepress/theme/style.css`.

## Writing style for site

### Voice and tone

- **User-focused:** Write for DDD practitioners learning the DSL
- **Action-oriented:** Use imperative mood ("Create a domain", "Add a context")
- **Concise:** Short sentences, scannable content
- **Welcoming:** Assume readers are new to DomainLang

### Page structure

Every guide page should follow this structure:

````markdown
# Page Title

One-sentence description of what this page covers.

## Basic Syntax

Show the simplest example first.

```dlang
// Minimal working example
```

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
````

### VitePress components

Use VitePress containers for callouts:

```markdown
::: info
Neutral information
:::

::: tip
Helpful advice
:::

::: warning
Something to be careful about
:::

::: danger
Critical warning - something could break
:::

::: details Click to expand
Hidden content
:::
```

### Code examples

1. **Always use `dlang` for DomainLang code:**

   ````markdown
   ```dlang
   Domain Sales { }
   ```
   ````

2. **Show minimal, complete examples** - readers should be able to copy-paste

3. **Build up progressively** - start simple, add complexity

4. **Include expected behavior** when relevant

### Links

- **Internal links:** Use relative paths without `.md` extension

  ```markdown
  See [Bounded Contexts](/guide/bounded-contexts) for details.
  ```

- **External links:** Include full URL

  ```markdown
  [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=thinkability.domain-lang)
  ```

## Deployment

### GitHub Actions workflow

The site deploys via the `deploy-docs` job in `.github/workflows/ci.yml`:

- **Trigger:** Push to `main` with changes in `site/`
- **Build:** `npm run build` in `site/` directory
- **Deploy:** GitHub Pages with custom domain

### Custom domain

- Domain: `domainlang.net`
- Base URL must be `/` (not `/DomainLang/`)
- CNAME configured in GitHub repo settings

### Local development

```bash
cd site
npm install
npm run dev      # Start dev server at localhost:5173
npm run build    # Build for production
npm run preview  # Preview production build
```

## Adding new pages

### 1. Create the markdown file

```bash
# For a new guide page
touch site/guide/new-feature.md
```

### 2. Add frontmatter (optional)

```markdown
---
title: Custom Page Title
description: SEO description for this page
---
```

### 3. Update navigation

Edit `/site/.vitepress/config.mts`:

```typescript
sidebar: {
  '/guide/': [
    {
      text: 'Section Name',
      items: [
        { text: 'New Feature', link: '/guide/new-feature' },
      ]
    }
  ]
}
```

### 4. Cross-link from related pages

Add "See also" links from related documentation.

## Synchronization with DSL docs

The site documentation should stay in sync with:

- `/guide/domains.md` → Grammar + implementation (keywords, syntax)
- `/reference/language.md` → Grammar (all constructs)
- `/examples/*.md` → `dsl/domain-lang/examples/` (example code)

When grammar changes, update:

1. Site documentation pages
2. Code examples on the site
3. Quick reference table

## Quality checklist

Before merging site changes:

- [ ] All code examples use `dlang` syntax highlighting
- [ ] Internal links work (no broken links)
- [ ] Page appears in sidebar navigation
- [ ] Follows page structure template
- [ ] Tested locally with `npm run dev`
- [ ] No hardcoded `/DomainLang/` paths (use `/` for root)

## Common tasks

### Add a new example page

1. Create `/site/examples/new-example.md`
2. Add to sidebar in `config.mts`
3. Add link from `/site/examples/index.md`

### Update syntax highlighting

Edit `domainLangGrammar` in `/site/.vitepress/config.mts` to add new keywords.

### Change brand colors

Edit CSS variables in `/site/.vitepress/theme/style.css`.

### Fix 404 errors after deploy

Check that `base: '/'` is set in `config.mts` for custom domain deployment.

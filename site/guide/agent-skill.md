# Agent skill

DomainLang provides an [Agent Skill](https://agentskills.io) — a portable instruction package that teaches AI coding agents how to write correct DomainLang models. When installed, your agent gains DDD modeling expertise and can generate `.dlang` files on demand.

::: info What are agent skills?
Agent Skills are an open standard for giving AI agents specialized capabilities. They work with Claude Code, Cursor, Windsurf, Copilot, and other compatible tools. Learn more at [agentskills.io](https://agentskills.io).
:::

## What the skill teaches

The DomainLang skill gives agents procedural knowledge for:

- **Strategic design** — domains, subdomains, and domain hierarchies
- **Bounded contexts** — declarations with ownership, classification, and terminology
- **Context maps** — relationship arrows and DDD integration patterns (`[OHS]`, `[CF]`, `[ACL]`, `[PL]`, `[SK]`, `[P]`)
- **Ubiquitous language** — terminology blocks with `term`, `aka`, and `examples`
- **Governance** — decisions, policies, and rules
- **File organization** — imports, namespaces, `model.yaml` projects
- **Best practices** — context sizing, naming conventions, map composition

The skill includes a detailed syntax reference that the agent loads on demand when it needs keyword and alias details.

## Installation

Install the skill using the [skills CLI](https://skills.sh/docs):

```bash
npx skills add domainlang/domainlang
```

This downloads the skill into your project and makes it available to any compatible AI agent.

### Manual installation

Alternatively, copy the skill folder directly into your repository:

1. Clone or download the [`skills/domainlang`](https://github.com/DomainLang/DomainLang/tree/main/skills/domainlang) directory from the DomainLang repository
2. Place it in your project at `.skills/domainlang/` (or wherever your agent discovers skills)
3. The agent will detect and load the skill automatically

The skill folder structure:

```text
domainlang/
├── SKILL.md              # Main instructions (loaded when activated)
└── references/
    └── SYNTAX.md         # Complete keyword and alias table (loaded on demand)
```

## Usage

Once installed, simply ask your AI agent to create DomainLang models. The agent activates the skill automatically when the task involves DDD modeling or `.dlang` files.

**Example prompts:**

- "Create a DomainLang model for our e-commerce platform with Orders, Payments, and Shipping contexts"
- "Add a context map showing how our microservices integrate"
- "Model our healthcare system domains with proper team ownership and classifications"
- "Generate a `.dlang` file with terminology for our order management bounded context"

The agent will follow DDD best practices — naming contexts after capabilities, annotating integration patterns, capturing ubiquitous language, and organizing large models with namespaces and imports.

## Skill structure

The skill follows the [Agent Skills specification](https://agentskills.io/specification):

| File | Purpose | When loaded |
| ---- | ------- | ----------- |
| `SKILL.md` | Core DomainLang syntax, workflow, DDD guidelines, examples | When the agent decides the skill is relevant |
| `references/SYNTAX.md` | Complete keyword table, aliases, operators, pattern reference | On demand, when the agent needs detailed syntax lookup |

This progressive disclosure keeps the agent's context focused — it loads only what it needs for the current task.

## Compatibility

The DomainLang skill works with any agent that supports the [Agent Skills](https://agentskills.io) standard, including:

- [Claude Code](https://claude.ai/code)
- [Cursor](https://cursor.com)
- [GitHub Copilot](https://github.com/features/copilot)
- [Windsurf](https://codeium.com/windsurf)
- [Amp](https://ampcode.com)
- [Roo Code](https://roocode.com)

## See also

- [Getting started](/guide/getting-started) — learn DomainLang yourself
- [Language reference](/reference/language) — authoritative syntax details
- [Quick reference](/reference/quick-reference) — copy-paste cheat sheet
- [Agent Skills specification](https://agentskills.io/specification) — the open standard
- [skills.sh](https://skills.sh) — browse and install skills

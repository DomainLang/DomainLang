# Roadmap

DomainLang is evolving to become the definitive tool for Domain-Driven Design modeling. Here's what's shipping and what's coming.

## Current status

DomainLang today provides:

- ✅ **DSL language** — Express domains, bounded contexts, context maps, and ubiquitous language
- ✅ **VS Code extension** — Syntax highlighting, validation, completion, hover, and go-to-definition
- ✅ **AI-powered model tools** — Ask GitHub Copilot or Claude about your domain model directly in VS Code
- ✅ **Agent skill** — Teach any AI coding agent to write correct DomainLang models
- ✅ **Model query SDK** — Programmatic access to DomainLang models for analysis and automation
- ✅ **CLI** — Validate, query, and manage dependencies from the command line
- ✅ **Multi-file support** — Imports, namespaces, and project manifests
- ✅ **npm packages** — [`@domainlang/cli`](https://www.npmjs.com/package/@domainlang/cli) and [`@domainlang/language`](https://www.npmjs.com/package/@domainlang/language) published on npm

## What's next

### Phase 1: Modern CLI experience

**Status:** In Development

A beautiful, powerful command-line interface for working with DomainLang models.

| Feature | Description |
| ------- | ----------- |
| `dlang init` | Interactive project scaffolding |
| `dlang validate` | Validate models with rich error output |
| `dlang query` | Query models from the terminal |
| `dlang export` | Export to JSON, YAML, and other formats |

**Highlights:**

- Beautiful ASCII art, of course
- Interactive prompts for complex operations
- `--json` and `--quiet` modes for CI/CD integration

### Phase 2: VS Code UI enhancements

**Status:** Planned

Rich visual experiences directly in VS Code.

| Feature | Description |
| ------- | ----------- |
| Model Explorer | Tree view of domains, contexts, and relationships |
| Outline View | Navigate large models with structured outline |
| Inline Decorations | Visual indicators for classifications, teams, patterns |
| Quick Actions | One-click refactorings and generators |
| Webview Panels | Embedded visualizations within VS Code |

### Phase 3: Visualizations

**Status:** Planned

Generate beautiful diagrams, canvases, and maps from your models.

| Visualization | Description |
| ------------- | ----------- |
| Context Maps | Interactive SVG diagrams showing bounded context relationships |
| Bounded Context Canvas | Generate BC Canvas documents from your model |
| Domain Maps | High-level domain portfolio visualizations |
| Team Topologies | Visualize team ownership and communication patterns |
| Wardley Maps | Plot evolution stages of your bounded contexts |

**Export formats:**

- SVG, PNG, PDF for documents
- Mermaid, PlantUML for embedding in docs
- Interactive HTML for sharing

### Phase 4: Web explorer

**Status:** Future

A web-based interface for exploring and sharing DomainLang models.

| Feature | Description |
| ------- | ----------- |
| Model Viewer | Read-only exploration of models in the browser |
| Live Diagrams | Interactive, zoomable context maps and domain maps |
| Share Links | Public URLs for sharing models with stakeholders |
| Embed Widgets | Embed visualizations in wikis, Notion, Confluence |
| Search | Full-text search across domains, contexts, and terminology |

## Beyond the roadmap

Ideas we're exploring for the future:

- **Model diff** — Compare and merge model versions
- **Metrics dashboard** — Track model health and coverage
- **Natural language generation** — Generate models from plain-English descriptions

## Get involved

DomainLang is open source. We'd love your input!

- **Feature requests:** [GitHub Discussions](https://github.com/DomainLang/DomainLang/discussions)
- **Bug reports:** [GitHub Issues](https://github.com/DomainLang/DomainLang/issues)
- **Contribute:** [GitHub Repository](https://github.com/DomainLang/DomainLang)

::: tip Share your use case
Working on something interesting with DomainLang? We'd love to hear about it! Share your experience in [Discussions](https://github.com/DomainLang/DomainLang/discussions).
:::

# VS Code extension

The DomainLang extension for Visual Studio Code gives you a full development environment for DDD modeling — syntax highlighting, real-time validation, intelligent code completion, and AI-powered analysis of your domain models.

## Install the extension

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang), or search for **DomainLang** in the VS Code Extensions panel.

![DomainLang in VS Code — light theme](/vscode-domainlang-screenshot-light.png){.light-only}
![DomainLang in VS Code — dark theme](/vscode-domainlang-screenshot-dark.png){.dark-only}

::: tip
The extension is all you need to start modeling. No CLI or SDK installation required.
:::

## Features

### Syntax highlighting

`.dlang` files get full syntax highlighting for keywords, strings, comments, and references. The grammar is optimized for readability of DDD constructs.

### Real-time validation

The extension validates your model as you type and reports issues in the Problems panel:

- Missing domain visions and bounded context descriptions
- Bounded contexts without a parent domain
- Circular domain hierarchies
- Duplicate element names (fully qualified)
- Broken references to domains, teams, or classifications
- Header/body conflicts for classification and team assignment
- SharedKernel without bidirectional arrow (`<->`)
- ACL or Conformist on the wrong side of a relationship
- Empty context maps and domain maps
- Duplicate relationships within a context map
- Too many integration patterns on a single relationship

### Code completion

Press `Ctrl+Space` to get context-aware suggestions:

- Keywords and aliases (`Domain`, `bc`, `cmap`, etc.)
- References to declared domains, teams, and classifications
- Block keywords inside bounded contexts (`terminology`, `decisions`, `metadata`)
- Integration pattern annotations (`[OHS]`, `[CF]`, `[ACL]`, etc.)

### Hover documentation

Hover over any element to see a rich tooltip with its full definition — description, classification, team, terminology, relationships, and decisions.

### Go-to-definition

`Ctrl+Click` or `F12` on any reference to jump to its definition. Works across files in multi-file models.

### Multi-file workspace

The extension understands `model.yaml` manifests and resolves imports across files. Open a folder containing `.dlang` files and the language server indexes the entire workspace.

### Diagram viewer (beta)

When your model contains `ContextMap` definitions, an **Open diagram** CodeLens link appears above each one. Click it to open that context map as an interactive diagram in a VS Code tab.

The diagram updates live as you edit your model. It renders the bounded contexts and integration relationships defined inside the `ContextMap` block.

The DSL text remains the source of truth — the diagram reflects it.

## LSP logging settings

You can control DomainLang language server logging in VS Code settings:

- `domainlang.lsp.traceImports` enables detailed import resolution tracing
- `domainlang.lsp.infoLogs` enables info and timing logs

Both settings are disabled by default.

## AI-powered analysis

The extension includes [language model tools](/guide/vscode-tools) that let AI agents in VS Code query your domain model directly. Ask GitHub Copilot or Claude questions like:

- *"What domains do I have?"*
- *"Explain the OrderContext bounded context"*
- *"Show me all Core bounded contexts"*
- *"Validate the current workspace"*

The agent reads live model data from the language server and gives accurate, up-to-date answers.

See [AI-powered model tools](/guide/vscode-tools) for the full list of capabilities.

## See also

- [Getting started](/guide/getting-started) — Build your first model
- [AI-powered model tools](/guide/vscode-tools) — AI agent integration details
- [CLI](/guide/cli) — Command-line interface for CI/CD and automation
- [Agent skill](/guide/agent-skill) — Teach any AI agent to write DomainLang

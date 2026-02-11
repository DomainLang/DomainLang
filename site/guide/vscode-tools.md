# VS Code language model tools

The DomainLang extension registers **language model tools** that let AI agents in VS Code query your domain model directly. Ask GitHub Copilot or Claude about your bounded contexts, domains, relationships, and strategic design decisions — the agent reads live model data and gives accurate answers.

::: info How it works
The extension exposes tools through VS Code's Language Model API. When you ask an AI agent a question about your model, it calls these tools behind the scenes to fetch up-to-date information from the language server.
:::

## Prerequisites

- VS Code 1.109.0 or later
- The [DomainLang extension](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang) installed
- An AI agent extension (GitHub Copilot, Claude, or similar)

Open a `.dlang` file and start asking questions. The tools activate automatically.

## Tools

### `domainlang_validate`

Check your model for errors and warnings. Returns a summary of all diagnostics with file locations and line numbers.

**Example prompts:**

- *"Check if my DomainLang model has any errors"*
- *"Validate the current workspace"*
- *"Are there any warnings in my model?"*

### `domainlang_list`

Find entities in your model with optional filters by type, domain, team, or classification.

**Example prompts:**

- *"Show me all domains in the model"*
- *"List all Core bounded contexts"*
- *"Which contexts are owned by the PaymentTeam?"*

### `domainlang_get`

Retrieve detailed information about a specific element, or get a high-level summary of the entire model with entity counts.

**Example prompts:**

- *"Get the OrderContext bounded context"*
- *"Show me details about the Sales domain"*
- *"Give me a summary of the model"*

### `domainlang_explain`

Get rich, formatted documentation for any element — its signature, description, properties, relationships, terminology, and decisions. Returns the same content you see in hover tooltips.

**Example prompts:**

- *"Explain the OrderContext bounded context"*
- *"What is the Sales domain?"*
- *"What are the relationships of PaymentContext?"*

## Example conversations

**Understand your architecture:**

> *"What domains do I have?"* → lists all domains with their visions and subdomains
>
> *"Explain the OrderContext"* → returns the full description, team, classification, terminology, and relationships

**Find patterns:**

> *"Show me all Core bounded contexts"* → filters by classification
>
> *"Which contexts are owned by the PaymentTeam?"* → filters by team

**Check quality:**

> *"Validate the workspace"* → runs full validation and reports errors and warnings

::: tip
Be specific with entity names. Say *"Explain the OrderContext bounded context"* rather than *"Tell me about the order context"* — it helps the agent resolve the right element.
:::

## See also

- [Agent skill](/guide/agent-skill) — portable skill for AI agents working with DomainLang
- [CLI](/guide/cli) — command-line tools for querying models
- [SDK](/guide/sdk) — programmatic model querying

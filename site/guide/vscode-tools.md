# VS Code language model tools

DomainLang provides native integration with VS Code's Language Model API, enabling AI agents like GitHub Copilot and Claude to query and understand your domain models directly within the editor.

## Overview

The DomainLang extension registers four Language Model Tools that AI agents can use to:

- **Validate** the model and get diagnostics
- **List** entities with flexible filtering
- **Get** specific elements or model summaries  
- **Explain** any element with rich documentation

These tools communicate directly with the already-running Language Server Protocol (LSP) process, providing zero-latency access to your live workspace without spawning additional processes.

## Available tools

### domainlang_validate

Validates the DomainLang model in the current workspace and returns all diagnostics.

**Parameters:**
- `file` (optional): URI of a specific file to validate. If omitted, validates the entire workspace.

**Example usage:**
```
Validate my DomainLang model
```

**Response format:**
```markdown
# Validation Results

**Total diagnostics:** 2

## Errors (1)

- `file:///workspace/domains.dlang:10:5` - Domain 'Sales' has no domain vision

## Warnings (1)

- `file:///workspace/contexts.dlang:15:10` - BoundedContext 'Orders' has no description
```

### domainlang_list

Lists DomainLang entities with optional filters.

**Parameters:**
- `type` (required): Entity type to list - `domains`, `bcs`, `teams`, `classifications`, `relationships`, `context-maps`, or `domain-maps`
- `filters` (optional): Filter criteria
  - `name`: Filter by name (string or regex)
  - `fqn`: Filter by fully qualified name
  - `domain`: Filter bounded contexts by domain
  - `team`: Filter bounded contexts by team
  - `classification`: Filter bounded contexts by classification
  - `metadata`: Filter bounded contexts by metadata (key=value)

**Example usage:**
```
List all bounded contexts in the Sales domain
List all Core bounded contexts
List all domains
```

**Response format:**
```json
{
  "entityType": "bcs",
  "count": 3,
  "results": [
    {
      "$type": "BoundedContext",
      "name": "OrderContext",
      "fqn": "OrderContext",
      "domain": "Sales",
      "description": "Order management"
    }
  ]
}
```

### domainlang_get

Retrieves a specific element by fully qualified name or returns a model summary.

**Parameters:**
- `fqn` (optional): Fully qualified name of the element to retrieve
- `summary` (optional): If true, returns model summary instead

**Example usage:**
```
Get the OrderContext bounded context
Show me a summary of the model
```

**Response format (element):**
```json
{
  "result": {
    "$type": "BoundedContext",
    "name": "OrderContext",
    "fqn": "OrderContext",
    "domain": "Sales",
    "description": "Order management",
    "relationships": [...]
  }
}
```

**Response format (summary):**
```json
{
  "result": {
    "$type": "ModelSummary",
    "documentCount": 5,
    "domains": 3,
    "boundedContexts": 12,
    "teams": 4,
    "classifications": 4,
    "relationships": 8,
    "contextMaps": 2,
    "domainMaps": 1
  }
}
```

### domainlang_explain

Provides a rich markdown explanation of any model element, including its signature, properties, relationships, and documentation.

**Parameters:**
- `fqn` (required): Fully qualified name of the element to explain

**Example usage:**
```
Explain the OrderContext bounded context
What is the Sales domain?
Tell me about the PaymentTeam
```

**Response format:**
```markdown
📦 **(bounded context) OrderContext**

\`\`\`domain-lang
BoundedContext OrderContext for Sales as Core by SalesTeam
\`\`\`

Order management and fulfillment

---

📁 **Domain:** Sales  
🔖 **Classification:** Core  
👥 **Team:** SalesTeam

**Relationships:**
- [OHS] this -> [CF] PaymentContext
- [ACL] this -> [U/D] InventoryContext

**Terminology:**
- `Order`: A customer purchase request
- `OrderLine`: Individual item in an order
```

## How it works

The tools use a lightweight architecture:

1. **Extension registration:** The extension registers tools via `vscode.lm.registerTool()` during activation
2. **Request forwarding:** When an agent calls a tool, the extension forwards the request to the LSP server using `client.sendRequest()`
3. **LSP handlers:** The LSP server processes the request using the Model Query SDK and returns serialized results
4. **Response formatting:** The extension formats the response and returns it to the agent

This approach provides:

- **Zero extra processes:** No subprocess spawning
- **Live workspace data:** Reflects current editor state including unsaved changes
- **Automatic updates:** LSP rebuilds on file changes, next tool call gets fresh data
- **Minimal overhead:** Reuses existing IPC channel between extension and LSP

## Agent prompts

Here are some effective prompts to try with GitHub Copilot or Claude in VS Code:

**Validation:**
- "Check if my DomainLang model has any errors"
- "Validate the current workspace and show me any warnings"

**Discovery:**
- "Show me all domains in the model"
- "List all Core bounded contexts"
- "What teams are defined in the model?"

**Understanding:**
- "Explain the OrderContext bounded context"
- "What is the purpose of the Sales domain?"
- "Tell me about the relationships of PaymentContext"

**Analysis:**
- "Give me a summary of the model"
- "How many bounded contexts are in the Sales domain?"
- "Which bounded contexts are owned by the PaymentTeam?"

## See also

- [Model Query SDK](./sdk.md) - Programmatic model querying
- [CLI](./cli.md) - Command-line interface for DomainLang
- [Agent Skill](./agent-skill.md) - Using DomainLang with AI agents

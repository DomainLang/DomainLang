# VS Code language model tools

DomainLang works seamlessly with AI agents in VS Code. Ask GitHub Copilot or Claude questions about your domain model, and they'll understand your bounded contexts, domains, relationships, and strategic design decisions.

## What you can do

With DomainLang's Language Model Tools, AI agents can help you:

- **Validate** your model and identify issues
- **Discover** what's in your model with flexible queries
- **Understand** any element with rich, contextual explanations
- **Analyze** your architecture at a glance

Your AI assistant always has up-to-date information about your model, even as you edit files.

## Available tools

### domainlang_validate

Check your model for errors and warnings.

**Try asking:**
- "Check if my DomainLang model has any errors"
- "Validate the current workspace"
- "Are there any warnings in my model?"

**What you get:**
A summary of all diagnostics (errors, warnings, and info messages) with file locations and line numbers.

### domainlang_list

Find entities in your model with optional filters.

**Try asking:**
- "Show me all domains in the model"
- "List all Core bounded contexts"
- "What bounded contexts are in the Sales domain?"
- "Which contexts are owned by the PaymentTeam?"

**What you get:**
A list of matching entities with their key properties like name, domain, team, and classification.

### domainlang_get

Get detailed information about a specific element or see your entire model at a glance.

**Try asking:**
- "Get the OrderContext bounded context"
- "Show me details about the Sales domain"
- "Give me a summary of the model"

**What you get:**
Either complete details about a specific element (all properties, relationships, terminology) or a high-level summary showing counts of all entity types in your model.

### domainlang_explain

Understand what any element in your model does and how it relates to others.

**Try asking:**
- "Explain the OrderContext bounded context"
- "What is the Sales domain?"
- "Tell me about the PaymentTeam"
- "What are the relationships of PaymentContext?"

**What you get:**
Rich, formatted documentation showing the element's signature, description, properties, relationships, terminology, and decisions—the same information you see in hover tooltips.

## Getting started

Make sure you have:
- VS Code 1.109.0 or later
- The DomainLang extension installed
- GitHub Copilot or Claude extension

Then just start chatting! Ask your AI assistant questions about your DomainLang model using natural language. The tools work automatically in the background.

## Example conversations

Here are some ways to work with AI agents on your DomainLang models:

**Understanding your architecture:**
- "What domains do I have in this model?"
- "Explain the OrderContext bounded context"
- "What is the purpose of the Sales domain?"

**Finding patterns:**
- "Show me all Core bounded contexts"
- "Which contexts are owned by the PaymentTeam?"
- "List all relationships in the model"

**Quality checks:**
- "Check if my model has any errors"
- "Are there any bounded contexts without descriptions?"
- "Validate the workspace"

**Getting insights:**
- "Give me a summary of the model"
- "How many bounded contexts are in the Sales domain?"
- "What are the relationships of PaymentContext?"

## Tips

- **Be natural:** Ask questions as you would to a colleague
- **Be specific:** Include entity names when asking about specific elements
- **Use domain terms:** Say "bounded context" rather than "context" for clarity
- **Iterate:** Start broad, then drill down into specific areas

## See also

- [Agent Skill](./agent-skill.md) - Guide for AI agents working with DomainLang
- [CLI](./cli.md) - Command-line tools for querying models
- [SDK](./sdk.md) - Programmatic model querying

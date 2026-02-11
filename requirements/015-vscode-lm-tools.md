# PRS-015: VS Code language model tools

**Status**: Draft  
**Priority**: High  
**Target version**: 2.3.0  
**Effort estimate**: 1–2 weeks  
**Dependencies**: PRS-007 (Model Query SDK)

---

## Executive summary

Expose DomainLang model querying and validation capabilities directly inside VS Code using the native **Language Model Tools API** (`vscode.lm.registerTool`). Instead of spawning a separate MCP subprocess, the extension registers tools that forward requests to the **already-running LSP server** over the existing IPC channel using custom LSP requests.

**Four tools** (the first three match PRS-014's logical operations, plus an explain tool):

1. `domainlang_validate` — aggregate validation diagnostics from the live workspace
2. `domainlang_list` — query collections (domains, bounded contexts, relationships, teams, context maps)
3. `domainlang_get` — lookup by FQN or get model summary
4. `domainlang_explain` — rich natural-language explanation of any model element

**Architecture:**

```text
┌─────────────────────────────────────────────────────────────────┐
│  Extension host process                                         │
│                                                                 │
│  vscode.lm.registerTool('domainlang_validate', ...)            │
│  vscode.lm.registerTool('domainlang_list', ...)               │
│  vscode.lm.registerTool('domainlang_get', ...)                │
│  vscode.lm.registerTool('domainlang_explain', ...)            │
│       │         │         │         │                           │
│       └─────────┼─────────┼─────────┘                           │
│                 │         │                                     │
│                 │ client.sendRequest('domainlang/...')          │
│                 │ (same IPC channel as LSP)                    │
└─────────────────┼───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│  LSP child process (already running)                            │
│                                                                 │
│  connection.onRequest('domainlang/validate', handler)          │
│  connection.onRequest('domainlang/list', handler)              │
│  connection.onRequest('domainlang/get', handler)               │
│  connection.onRequest('domainlang/explain', handler)           │
│       │         │         │         │                           │
│       └─────────┼─────────┼─────────┘                           │
│                 ▼                                                │
│  SDK: fromDocument() / fromServices() (zero-copy, cached AST)  │
│  Serializers: AST → plain JSON (shared with CLI via SDK)        │
│                                                                 │
│  Already loaded & live:                                         │
│  DomainLangWorkspaceManager · DomainLangIndexManager ·         │
│  ImportResolver · DocumentBuilder · LangiumDocuments            │
└─────────────────────────────────────────────────────────────────┘
```

**Why this approach:**

- **Zero extra processes** — no subprocess spawn, no port management, no dual memory
- **Live workspace** — queries reflect the current editor state including unsaved changes (Langium's `TextDocument` sync)
- **Live change detection** — the LSP already rebuilds on file changes, next tool call gets fresh data
- **No new transport** — reuses the existing IPC channel between extension host and LSP child process
- **No MCP SDK dependency** — pure VS Code API in the extension, pure `vscode-languageserver` in the LSP
- **Effortless** — the LSP process already has all documents cached, indexed, and validated. Tool handlers are thin wrappers around `fromDocument()` + SDK query builders + serialization mappers

**Relationship to PRS-014:**

PRS-015 is implemented first — it defines the SDK serializers and LSP infrastructure that PRS-014 later reuses. PRS-014 defines the CLI MCP server (`dlang mcp`) for non-VS Code clients (Claude Desktop, Cursor, CI). Both share:

- Three core tool operations (validate, list, get)
- The same serialization mappers (AST → plain JSON) — extracted to `@domainlang/language/sdk` by PRS-015 Phase 1
- The same output schemas (identical JSON shapes)

PRS-015 additionally provides `domainlang_explain` (VS Code-only, leverages live LSP hover infrastructure).

They differ in transport:

| | PRS-014 (CLI) | PRS-015 (VS Code) |
| --- | --- | --- |
| Transport | MCP stdio (stdin/stdout) | LSP custom requests (IPC) |
| Process | Standalone `dlang mcp` | Existing LSP child process |
| Workspace | Headless Langium (loaded once) | Live LSP workspace (always fresh) |
| Change detection | None (stateless, restart for fresh) | Free (LSP already handles) |
| Clients | Claude Desktop, Cursor, CI pipelines | GitHub Copilot, Claude in VS Code |
| Dependencies | MCP SDK, Zod | None (VS Code API + vscode-languageserver) |

---

## Problem

When AI agents work inside VS Code (GitHub Copilot, Claude, etc.), the DomainLang LSP is already running with a fully indexed, validated, and cached workspace. But agents cannot access this information because:

1. **No tool registration** — the extension provides no Language Model Tools
2. **LSP is opaque to agents** — agents can see diagnostics in the Problems panel, but cannot programmatically query the model structure, look up elements by FQN, or list relationships
3. **No semantic explanation** — agents must parse raw `.dlang` syntax to understand what elements mean; the rich hover content (domain vision, BC relationships, terminology, integration patterns) is hidden behind mouseover UI
4. **A CLI MCP approach spawns a second process** — a separate `dlang mcp` process (PRS-014) duplicates the workspace in memory and lacks live change detection

The LSP process already has everything agents need — including rich hover content generators that produce human-readable descriptions of every element type. The only missing piece is a set of custom request handlers and corresponding tool registrations.

## Goals

| Goal | Measure |
| --- | --- |
| **Zero extra processes** | No subprocess spawned for agent tool calls in VS Code |
| **Live workspace queries** | Tool results reflect current editor state (including unsaved changes) |
| **Shared serialization** | Generic `serializeNode()` in the SDK, shared between CLI MCP and VS Code tools |
| **Same JSON schemas** | `domainlang_list` returns identical JSON in VS Code and from `dlang mcp` |
| **Rich explanations** | `domainlang_explain` provides natural-language element descriptions using existing hover builders |
| **Thin extension** | Extension registers tools (~60 lines) that forward to LSP custom requests |
| **Thin LSP handlers** | LSP request handlers are (~130 lines) that use SDK + serializers + hover builders |

## Non-goals

- MCP protocol in the extension (PRS-014 handles non-VS Code MCP clients)
- Write operations / model mutation
- Custom views or webviews
- Support for agents outside VS Code (handled by PRS-014)
- Mermaid diagram generation (future iteration — see future considerations)
- Fuzzy search across element descriptions, visions, and metadata (future iteration — see future considerations)

---

## User stories

As a **GitHub Copilot agent** working in VS Code,  
I want to query the DomainLang model using Language Model Tools,  
So that I can provide context-aware suggestions without spawning external processes.

As a **developer using Claude in VS Code**,  
I want Claude to see my domain model structure in real-time,  
So that its suggestions align with my bounded contexts, teams, and relationships.

As an **AI agent editing `.dlang` files**,  
I want to validate the current workspace state,  
So that I can verify my edits are correct using the already-running LSP.

---

## Architecture

### LSP custom request protocol

The LSP specification (JSON-RPC 2.0) explicitly supports custom request methods. Any method name that does not start with `$/` is a valid custom request. The `vscode-languageserver` package implements this via `connection.onRequest(methodName, handler)` on the server side and `client.sendRequest(methodName, params)` on the client side.

**Verified:** Custom methods like `domainlang/validate`, `domainlang/list`, and `domainlang/get` are valid. They:

- Do not require registration in `initialize` capabilities or dynamic registration
- Accept any JSON-serializable object as parameters
- Return any JSON-serializable value as result
- Use the same IPC channel as standard LSP messages (no separate transport)
- Are commonly used in production language servers for features outside core LSP scope

The only constraint is that parameters and return values must be JSON-RPC compatible — plain JSON, no class instances, no circular references. This is the serialization constraint that drives the design below.

### What the LSP already provides (free)

The Langium LSP server in the child process already maintains:

| Infrastructure | State | Access pattern |
| --- | --- | --- |
| `LangiumDocuments` | All `.dlang` documents parsed, linked, validated | `shared.workspace.LangiumDocuments.all` |
| `DomainLangWorkspaceManager` | Import graph loaded, manifests cached | `DomainLang.imports.WorkspaceManager` |
| `DomainLangIndexManager` | Reverse dependency graph, change propagation | `shared.workspace.IndexManager` |
| `ImportResolver` | Alias resolution, package resolution cached | `DomainLang.imports.ImportResolver` |
| `DocumentBuilder` | Incremental rebuilds on file changes | `shared.workspace.DocumentBuilder` |
| Diagnostics | Validation errors/warnings for every document | `document.diagnostics` |

All of this is in the LSP child process, already running, already up to date with every keystroke.

### What we need to add

### AST serialization strategy (shared with PRS-014)

Langium AST nodes extend `AstNode` which has internal `$`-prefixed properties that create circular references:

| Property | Type | Problem |
| --- | --- | --- |
| `$container` | `AstNode` | Circular parent reference |
| `$cstNode` | `CstNode` | CST link with back-references |
| `$document` | `LangiumDocument` | Document link, back to AST root |
| `Reference<T>.ref` / `.value` | `T \| undefined` | Resolved cross-ref → another AstNode → cycles |

Rather than defining separate DTO types per entity (DomainDto, BoundedContextDto, etc.), we use a **generic AST serializer** that strips Langium internals and resolves references to their names. This keeps the output aligned with the actual AST types — no parallel type hierarchy to maintain.

```typescript
// sdk/serializers.ts — generic AST → plain JSON serializer

/**
 * Serialize any Langium AST node to a plain JSON object.
 * - Strips $-prefixed internal properties ($container, $cstNode, $document)
 * - Preserves $type for discriminated output
 * - Resolves Reference<T> to the referenced name (string)
 * - Resolves MultiReference<T> to an array of names
 * - Recursively serializes child AstNode properties
 * - Serializes arrays of AstNodes/values
 */
export function serializeNode(node: AstNode, query: Query): Record<string, unknown> {
  const result: Record<string, unknown> = { $type: node.$type };
  
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue; // Skip Langium internals
    
    if (isReference(value)) {
      result[key] = value.ref?.name ?? value.$refText;
    } else if (isAstNode(value)) {
      result[key] = serializeNode(value, query);
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => 
        isReference(item) ? (item.ref?.name ?? item.$refText) :
        isAstNode(item) ? serializeNode(item, query) :
        item
      );
    } else {
      result[key] = value; // primitives pass through
    }
  }
  
  // Always include FQN for named elements
  if ('name' in node) {
    result.fqn = query.fqn(node);
  }
  
  return result;
}
```

For entity types with SDK-augmented properties (computed values not on the raw AST), we add **augmenter functions** that enrich the generic output:

```typescript
// sdk/serializers.ts — per-type augmentation

/** Augment a BoundedContext serialization with SDK-computed properties */
export function augmentBoundedContext(
  serialized: Record<string, unknown>,
  bc: BoundedContext,
  query: Query
): Record<string, unknown> {
  const bcQuery = query.boundedContexts().withFqn(serialized.fqn as string).first();
  // effectiveRole, effectiveTeam, metadataMap are SDK augmented properties
  // that resolve precedence between header inline and body properties
  return { ...serialized };
}

/** Augment a Relationship serialization with SDK-inferred type */
export function augmentRelationship(
  view: RelationshipView
): Record<string, unknown> {
  return {
    left: view.left.name,
    right: view.right.name,
    arrow: view.arrow,
    leftPatterns: view.leftPatterns,
    rightPatterns: view.rightPatterns,
    type: view.type,
    inferredType: view.inferredType,
    source: view.source
  };
}
```

**Why this approach over per-type DTOs:**

- **No parallel type hierarchy** — the serialized output mirrors the AST shape naturally
- **Grammar changes propagate automatically** — new properties on AST nodes appear in serialized output without updating any DTO
- **Single serializer to test** — one generic function + a few augmenters, not one serializer per entity type
- **Same output** — both CLI (PRS-014) and LSP produce identical JSON from the same serializer

The `RelationshipView` from the SDK is already a clean interface (no Langium internals), so relationships use the SDK type directly as the serialization source.

### Custom LSP request handlers in the language server

Three custom request handlers registered on the LSP connection in the language server child process:

```typescript
// language/main.ts (additions) — or a separate lsp/tool-handlers.ts

import { fromDocument, serializeNode } from './sdk/index.js';
import type { Query } from './sdk/types.js';

connection.onRequest('domainlang/validate', async (_params) => {
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  return serializeValidationResult(documents);
});

connection.onRequest('domainlang/list', async (params: { type: string; filters?: Record<string, string> }) => {
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  const allResults = [];
  for (const doc of documents) {
    const query = fromDocument(doc);
    // Generic: serializeNode() handles any AST type
    const items = getCollectionByType(query, params.type);
    allResults.push(...items.map(item => serializeNode(item, query)));
  }
  return { entityType: params.type, count: allResults.length, results: applyFilters(allResults, params.filters) };
});

connection.onRequest('domainlang/get', async (params: { fqn?: string }) => {
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  for (const doc of documents) {
    const query = fromDocument(doc);
    if (params.fqn) {
      const node = query.byFqn(params.fqn);
      if (node) return { found: true, element: serializeNode(node, query) };
    }
  }
  if (!params.fqn) return serializeModelSummary(documents);
  return { found: false };
});
```

These handlers run **in the LSP process** — they have direct, zero-copy access to all cached AST nodes. `fromDocument()` wraps the existing linked AST, no re-parsing. `serializeNode()` walks the node's own properties, strips Langium internals, and resolves references to produce plain JSON that travels over IPC.

### Language Model Tool registration in the extension

The extension host registers tools using `vscode.lm.registerTool()` and declares them in `package.json`. Each tool handler simply forwards the request to the LSP child process via `client.sendRequest()`:

```typescript
// extension/main.ts (additions)

context.subscriptions.push(
  vscode.lm.registerTool('domainlang_validate', {
    async invoke(options, _token) {
      const result = await client.sendRequest('domainlang/validate', options.input ?? {});
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    }
  }),
  
  vscode.lm.registerTool('domainlang_list', {
    async invoke(options, _token) {
      const result = await client.sendRequest('domainlang/list', options.input);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    }
  }),
  
  vscode.lm.registerTool('domainlang_get', {
    async invoke(options, _token) {
      const result = await client.sendRequest('domainlang/get', options.input ?? {});
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
      ]);
    }
  })
);
```

```jsonc
// extension/package.json (additions)
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "domainlang_validate",
        "displayName": "Validate DomainLang model",
        "modelDescription": "Validate the DomainLang workspace. Returns errors, warnings, and model statistics. Call this after editing .dlang files to verify correctness.",
        "inputSchema": {
          "type": "object",
          "properties": {}
        },
        "tags": ["domainlang", "validation", "ddd"]
      },
      {
        "name": "domainlang_list",
        "displayName": "List DomainLang model elements",
        "modelDescription": "List and filter model elements: domains, bcs (bounded contexts), teams, classifications, relationships, context-maps, or domain-maps. Use to explore the domain model structure.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "type": {
              "type": "string",
              "description": "Type of elements to list: domains, bcs, teams, classifications, relationships, context-maps, domain-maps",
              "enum": ["domains", "bcs", "teams", "classifications", "relationships", "context-maps", "domain-maps"]
            },
            "name": { "type": "string", "description": "Filter by name (exact match)" },
            "fqn": { "type": "string", "description": "Filter by fully qualified name" },
            "domain": { "type": "string", "description": "Filter bounded contexts by domain name" },
            "team": { "type": "string", "description": "Filter bounded contexts by team name" },
            "classification": { "type": "string", "description": "Filter bounded contexts by classification (Core, Supporting, Generic)" },
            "metadata": { "type": "string", "description": "Filter bounded contexts by metadata (key=value)" }
          },
          "required": ["type"]
        },
        "tags": ["domainlang", "query", "ddd"]
      },
      {
        "name": "domainlang_get",
        "displayName": "Get DomainLang element",
        "modelDescription": "Get a specific model element by fully qualified name (e.g., 'Sales.OrderContext'), or get a complete model summary when FQN is omitted. Returns detailed information about any domain, bounded context, team, relationship, or context map.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "fqn": {
              "type": "string",
              "description": "Fully qualified name of a model element (e.g., 'Sales.OrderContext'). If omitted, returns a model summary."
            }
          }
        },
        "tags": ["domainlang", "query", "ddd"]
      }
    ]
  }
}
```

### What travels over the wire

The IPC channel between extension host and LSP child process uses JSON-RPC (same as the standard LSP protocol). All custom request/response payloads must be plain JSON — no class instances, no circular references, no Langium types.

The generic AST serializer guarantees this. It strips `$`-prefixed Langium internals, resolves `Reference<T>` to name strings, and outputs only primitive values, strings, and flat arrays/objects.

**Data flow for `domainlang_list` with `type: 'bcs'`:**

```text
1. Agent calls domainlang_list with { type: 'bcs', domain: 'Sales' }
2. Extension host: client.sendRequest('domainlang/list', { type: 'bcs', domain: 'Sales' })
3. IPC JSON-RPC → LSP child process
4. LSP handler:
   a. documents = LangiumDocuments.all  (already cached)
   b. query = fromDocument(entryDoc)     (zero-copy, wraps existing AST)
   c. result = serializeQueryResult(query, 'bcs', { domain: 'Sales' })
      → applies filters → serializeNode() strips Langium internals, resolves refs to names
   d. return result  (plain JSON)
5. IPC JSON-RPC → extension host
6. Extension wraps in LanguageModelToolResult
7. Agent receives JSON
```

**Total zero-copy hops:** 0 parsing, 0 re-indexing, 0 workspace reloading. The only serialization cost is the final `serializeNode()` call, which walks the AST node's own properties (not the tree) and resolves references — a simple property projection.

### Validate: leveraging the already-computed diagnostics

The `domainlang/validate` handler has a particularly elegant implementation because the LSP has **already validated every document**. Diagnostics are computed on every file change and stored in `document.diagnostics`. The handler simply aggregates them:

```typescript
connection.onRequest('domainlang/validate', async () => {
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  return serializeValidationResult(documents);
  // serializeValidationResult walks document.diagnostics — no re-validation
});
```

This is fundamentally different from PRS-014's CLI approach, where `dlang mcp` must load and validate the workspace from scratch. The VS Code tools get validation for free — it's already done.

### Text input mode

Unlike PRS-014's CLI MCP tools, the VS Code LM Tools do **not** need a `text` parameter. The agent is working inside VS Code with access to the workspace. If it wants to validate inline text, it can:

1. Write the text to a file (agents already do this)
2. The LSP picks up the change, re-validates
3. Call `domainlang_validate` to get the updated diagnostics

Or, for truly in-memory validation, the agent can use VS Code's built-in `vscode.languages.getDiagnostics()` — no DomainLang tool needed.

This keeps the VS Code tool input schemas simpler than the CLI equivalents.

---

## Shared serialization layer (SDK)

The generic AST serializer and augmenters must live in `@domainlang/language/sdk` so they are importable by both:

- The LSP child process (custom request handlers)
- The CLI (MCP tool handlers from PRS-014 and `dlang query` formatters)

### What moves from CLI to SDK

The CLI's `query.tsx` contains per-entity-type functions that manually map AST node properties to plain objects. These are replaced by the generic `serializeNode()` function plus thin augmenters for SDK-computed properties:

| Current CLI function | Replaced by | What changes |
| --- | --- | --- |
| `queryDomains(query, filters)` | `serializeNode(domain, query)` | Generic; fqn auto-added |
| `queryBoundedContexts(query, filters)` | `serializeNode(bc, query)` + augmenter | Adds effectiveRole, effectiveTeam |
| `queryTeams(query, filters)` | `serializeNode(team, query)` | Generic; name + fqn |
| `queryClassifications(query, filters)` | `serializeNode(classification, query)` | Generic |
| `queryRelationships(query, filters)` | `augmentRelationship(view)` | Uses RelationshipView (already clean) |
| `queryContextMaps(query, filters)` | `serializeNode(cmap, query)` | Generic |
| `queryDomainMaps(query, filters)` | `serializeNode(dmap, query)` | Generic |

The CLI `query.tsx` will import from the SDK instead of defining its own mappers. The `resolveEntryPath()` and path resolution logic stays in the CLI (not relevant to the SDK or LSP).

### New SDK module: `sdk/serializers.ts`

```text
packages/language/src/sdk/
├── serializers.ts     # NEW — generic serializeNode() + per-type augmenters
├── query.ts           # Existing — Query, QueryBuilder, fromDocument, etc.
├── types.ts           # Existing — Query interface, BcQueryBuilder, RelationshipView
├── loader.ts          # Existing — loadModelFromText
├── loader-node.ts     # Existing — loadModel, validateFile
├── validator.ts       # Existing — validateFile, validateWorkspace
└── index.ts           # Updated — re-exports serializers
```

No separate `serializer-types.ts` file needed — the output types are `Record<string, unknown>` (generic serializer) and the handful of envelope types (`QueryResult`, `ValidationResult`) are defined inline in `serializers.ts`.

The serializers are **browser-safe** (no Node.js APIs) because they operate on in-memory AST nodes and Query interfaces. This means they work in:

- The LSP child process (Node.js)
- The CLI (Node.js)
- Future browser-based tools (if ever needed)

### Filter types shared between CLI and SDK

The `QueryFilters` interface and `QueryEntityType` type currently live in the CLI. They should move to `sdk/serializers.ts` since both the CLI and LSP need them:

```typescript
// sdk/serializers.ts (alongside the generic serializer)
export type QueryEntityType = 
  | 'domains' | 'bcs' | 'teams' | 'classifications'
  | 'relationships' | 'context-maps' | 'domain-maps';

export interface QueryFilters {
  name?: string;
  fqn?: string;
  domain?: string;
  team?: string;
  classification?: string;
  metadata?: string;
}
```

---

## Tool definitions

### Tool 1: `domainlang_validate`

| Property | Value |
| --- | --- |
| **Name** | `domainlang_validate` |
| **Description** | Validate the DomainLang workspace. Returns errors, warnings, and model statistics. |
| **When to use** | After editing `.dlang` files, before committing, or to check model health. |

**Input schema:**

```json
{
  "type": "object",
  "properties": {}
}
```

No input needed — validates the entire live workspace.

**Output:**

```json
{
  "valid": true,
  "fileCount": 5,
  "domainCount": 3,
  "bcCount": 8,
  "errors": [],
  "warnings": [
    {
      "severity": 2,
      "message": "Domain 'Sales' is missing a vision statement",
      "file": "domains.dlang",
      "line": 3,
      "column": 1
    }
  ]
}
```

**LSP handler:** Aggregates `document.diagnostics` from all loaded documents — no re-validation needed.

### Tool 2: `domainlang_list`

| Property | Value |
| --- | --- |
| **Name** | `domainlang_list` |
| **Description** | List and filter model elements: domains, bcs, teams, classifications, relationships, context-maps, domain-maps. |
| **When to use** | To explore the model structure, find elements by properties, or gather collections for analysis. |

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["domains", "bcs", "teams", "classifications", "relationships", "context-maps", "domain-maps"]
    },
    "name": { "type": "string" },
    "fqn": { "type": "string" },
    "domain": { "type": "string" },
    "team": { "type": "string" },
    "classification": { "type": "string" },
    "metadata": { "type": "string" }
  },
  "required": ["type"]
}
```

**Output:** Identical JSON shape to PRS-014's `domainlang_list` (see PRS-014 for full examples per entity type).

**LSP handler:** `fromDocument(entryDoc)` → apply filters via SDK query builders → `serializeNode()` per result.

### Tool 3: `domainlang_get`

| Property | Value |
| --- | --- |
| **Name** | `domainlang_get` |
| **Description** | Get a specific element by FQN, or get a complete model summary. |
| **When to use** | To look up a specific element by FQN (e.g., 'Sales.OrderContext'), or to get a model overview. |

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "fqn": { "type": "string" }
  }
}
```

**Output:** Identical JSON shape to PRS-014's `domainlang_get` (see PRS-014 for full examples).

**LSP handler:** `fromDocument(entryDoc)` → `query.byFqn(fqn)` → `serializeNode()` or `serializeModelSummary()`.

### Tool 4: `domainlang_explain`

| Property | Value |
| --- | --- |
| **Name** | `domainlang_explain` |
| **Description** | Get a rich natural-language explanation of a model element. Returns domain vision, BC relationships, integration patterns, terminology, decisions, and more. |
| **When to use** | To understand what a domain, bounded context, context map, or any other element means in context — including its relationships, team ownership, and semantic details that aren't obvious from raw syntax. |

**Input schema:**

```json
{
  "type": "object",
  "properties": {
    "fqn": {
      "type": "string",
      "description": "Fully qualified name of the element to explain (e.g., 'Sales.OrderContext')"
    }
  },
  "required": ["fqn"]
}
```

**Output:**

```json
{
  "fqn": "Sales.OrderContext",
  "type": "BoundedContext",
  "explanation": "🎯 **(bounded context) OrderContext**\n\n```domain-lang\nBoundedContext OrderContext for Sales as Core by SalesTeam\n```\n\nManages the order lifecycle from creation to fulfillment.\n\n---\n\n📁 **Domain:** Sales\n🔖 **Classification:** Core\n👥 **Team:** SalesTeam\n\n**Relationships:**\n- OrderContext → PaymentContext [OHS] → [CF]\n- OrderContext ← InventoryContext [ACL] ← [PL]\n\n**Terminology:**\n- `Order`: A customer's request to purchase items\n- `LineItem`: A single product entry in an order\n\n**Decisions:**\n- `OrderIdStrategy`: UUIDs for global uniqueness"
}
```

The explanation is Markdown-formatted, matching the hover content the LSP already generates for the element. This gives agents the same rich, human-readable descriptions that developers see on hover — including signature, description, domain, classification, team, relationships with integration patterns, terminology, and decisions.

**LSP handler:**

```typescript
connection.onRequest('domainlang/explain', async (params: { fqn: string }) => {
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  for (const doc of documents) {
    if (isModel(doc.parseResult.value)) {
      const query = fromDocument(doc);
      const element = query.byFqn(params.fqn);
      if (element) {
        // Reuse hover builder infrastructure — same content as editor hover
        const explanation = generateExplanation(element, services);
        return {
          fqn: params.fqn,
          type: element.$type,
          explanation,
        };
      }
    }
  }
  return { fqn: params.fqn, type: null, explanation: null, error: `Element '${params.fqn}' not found` };
});
```

The `generateExplanation()` function reuses the existing hover builder functions (`buildDomainFields`, `buildBcFields`, `formatHoverContent`, etc.) from `lsp/hover/hover-builders.ts`. These are already pure functions that take typed AST nodes and return formatted Markdown — no refactoring needed.

**Why this is nearly free to implement:**

The `DomainLangHoverProvider` already has type-specific generators for every element type — domains (vision, parent, type), bounded contexts (team, classification, relationships, terminology, decisions), context maps (contained BCs, relationships with patterns), relationships (patterns, type), and more. The hover builders are extracted into pure functions (`hover-builders.ts`, 209 lines) that accept AST nodes and return Markdown strings. The explain handler simply calls the same builders outside the hover context.

---

## Multi-document query strategy

The LSP maintains multiple `LangiumDocument` instances (one per `.dlang` file). The SDK's `fromDocument()` creates a `Query` from a single document's `Model` AST. For multi-file workspaces where domains, bounded contexts, and relationships span multiple files, the query needs to cover all documents.

**Two approaches:**

### Option A: iterate all documents, merge results

Each custom request handler iterates `LangiumDocuments.all`, creates a `Query` per document, runs the serializer, and merges results:

```typescript
connection.onRequest('domainlang/list', async (params) => {
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  const allResults = [];
  for (const doc of documents) {
    if (isModel(doc.parseResult.value)) {
      const query = fromDocument(doc);
      const results = serializeByType(query, params.type, params.filters);
      allResults.push(...results);
    }
  }
  return { entityType: params.type, count: allResults.length, results: allResults };
});
```

**Pros:** Works today, no SDK changes. **Cons:** Multiple `Query` instances, potential duplicates if elements are cross-referenced.

### Option B: add `fromDocuments()` to the SDK (preferred)

Add a new entry point that builds a combined `Query` from multiple documents:

```typescript
// sdk/query.ts (addition)
export function fromDocuments(documents: LangiumDocument<Model>[]): Query {
  // Combine models, build unified indexes
}
```

Or more practically, since Langium's AST linking already resolves cross-file references, we can use `fromServices()` which already has access to all documents through the Langium shared services:

```typescript
connection.onRequest('domainlang/list', async (params) => {
  // fromServices already has access to all documents through DomainLangServices
  // We need a way to query across all documents
  const documents = shared.workspace.LangiumDocuments.all.toArray();
  return serializeQueryResultMultiDoc(documents, params.type, params.filters);
});
```

**Decision:** Start with Option A (iterate + merge). It works with the existing SDK and covers the common case. Add `fromDocuments()` in a future iteration if merging becomes a bottleneck.

---

## Requirements

| ID | Requirement | Priority | Rationale |
| --- | --- | --- | --- |
| R1 | Extension registers four Language Model Tools via `vscode.lm.registerTool()` | Must | Native VS Code agent integration |
| R2 | Extension declares tools in `package.json` `languageModelTools` contribution point | Must | VS Code activation and discovery |
| R3 | Tool handlers forward requests to LSP via `client.sendRequest()` | Must | Zero extra processes; use existing IPC |
| R4 | LSP registers custom request handlers (`domainlang/validate`, `domainlang/list`, `domainlang/get`, `domainlang/explain`) | Must | Handle tool requests in the process that has the workspace |
| R5 | LSP handlers use `fromDocument()` / SDK query builders for zero-copy AST access | Must | No re-parsing; use cached workspace |
| R6 | Serialization uses generic `serializeNode()` — directly serializes AST types, no parallel DTO hierarchy | Must | Shared between CLI (PRS-014) and LSP; grammar changes propagate automatically |
| R7 | Serializer output is plain JSON — strips `$`-prefixed Langium internals, resolves `Reference<T>` to name strings | Must | IPC serialization constraint |
| R8 | `domainlang_validate` aggregates existing `document.diagnostics` — no re-validation | Must | Leverage LSP's already-computed diagnostics |
| R9 | `domainlang_list` and `domainlang_get` output JSON matches PRS-014 output exactly | Must | Cross-channel consistency |
| R10 | CLI `query.tsx` refactored to import `serializeNode()` from SDK (no duplication) | Must | Single source of truth for AST → JSON mapping |
| R11 | Serializers are browser-safe (no Node.js APIs) | Should | Consistent with SDK design principles |
| R12 | `package.json` `languageModelTools` entries include `modelDescription` optimized for AI agent discovery | Must | Agent-friendly tool descriptions |
| R13 | Tool input schemas use JSON Schema (not Zod — Zod is for the CLI MCP layer) | Must | VS Code contribution point uses JSON Schema |
| R14 | LSP `main.ts` changes are additive — existing LSP functionality untouched | Must | Zero regression risk |
| R15 | Tools gracefully handle LSP not ready (workspace still loading) | Must | Extension and LSP start asynchronously |
| R16 | `domainlang_explain` reuses existing hover builder functions from `lsp/hover/hover-builders.ts` | Must | No duplication of element description logic; hover and explain stay in sync |
| R17 | `domainlang_explain` returns Markdown-formatted explanation with signature, description, properties, relationships, terminology, and decisions | Must | Rich context for agents; same quality as developer hover experience |

---

## Acceptance criteria

- [ ] Three core tools appear in VS Code's tool list when extension is active
- [ ] `domainlang_explain` appears as a fourth tool in VS Code's tool list
- [ ] GitHub Copilot / Claude in VS Code can discover and call all four tools
- [ ] `domainlang_validate` returns correct diagnostics matching the Problems panel
- [ ] `domainlang_list` with `type: 'domains'` returns all domains in the workspace
- [ ] `domainlang_list` with `type: 'bcs'` supports filtering by domain, team, classification, metadata
- [ ] `domainlang_list` with `type: 'relationships'` returns relationships with patterns and inferred types
- [ ] `domainlang_get` with `fqn: 'Sales.OrderContext'` returns detailed element info
- [ ] `domainlang_get` without `fqn` returns a model summary
- [ ] Output JSON from VS Code tools matches `dlang mcp` output (PRS-014) exactly for validate/list/get
- [ ] `domainlang_explain` returns Markdown matching hover content for the same element
- [ ] `domainlang_explain` with unknown FQN returns a clear error (not a crash)
- [ ] No subprocess is spawned when tools are called
- [ ] Queries reflect unsaved editor changes (Langium TextDocument sync)
- [ ] Tool calls complete in < 100ms for typical DDD models (zero-copy + serialization only)
- [ ] LSP custom request handlers tested independently
- [ ] SDK serializers tested independently with unit tests
- [ ] Existing LSP tests pass without modification
- [ ] Extension deactivation properly disposes tool registrations

---

## Implementation phases

### Phase 1: SDK serializers (shared foundation)

**Scope:** Create generic AST serializer in the SDK. This phase is shared with PRS-014.

- [ ] Create `sdk/serializers.ts` — `serializeNode()` generic function + `augmentRelationship()` + envelope types
- [ ] Move `QueryEntityType` and `QueryFilters` from CLI to `sdk/serializers.ts`
- [ ] Export from `sdk/index.ts`
- [ ] Refactor CLI `query.tsx` to import from SDK serializers (remove per-entity-type mappers)
- [ ] Unit tests for `serializeNode()` with each AST type (Domain, BoundedContext, Team, etc.)
- [ ] Unit test for `augmentRelationship()` with RelationshipView
- [ ] Unit test: verify `$container`, `$cstNode`, `$document` are stripped from output
- [ ] Unit test: verify `Reference<T>` is resolved to name string
- [ ] Verify CLI `dlang query` output unchanged after refactoring (snapshot tests)

### Phase 2: LSP custom request handlers

**Scope:** Add custom request handlers to the LSP child process.

- [ ] Create `lsp/tool-handlers.ts` — custom request handler functions
- [ ] Register handlers on `connection` in `language/main.ts` (additive, ~12 lines)
- [ ] `domainlang/validate` handler: aggregate `document.diagnostics` → `serializeValidationResult()`
- [ ] `domainlang/list` handler: `fromDocument()` → iterate → `serializeNode()` → apply filters
- [ ] `domainlang/get` handler: `fromDocument()` → `byFqn()` → `serializeNode()` or `serializeModelSummary()`
- [ ] `domainlang/explain` handler: `byFqn()` → `generateExplanation()` using hover builders → return Markdown
- [ ] Create `lsp/explain.ts` — `generateExplanation(node, services)` function that delegates to hover builders
- [ ] Handle multi-document workspaces (iterate all documents, merge results)
- [ ] Handle workspace not ready (return clear error message)
- [ ] Unit tests for handlers (mock Langium services, verify output DTOs)
- [ ] Unit tests for `generateExplanation()` with each element type
- [ ] Existing LSP tests pass without modification

### Phase 3: Extension LM Tool registration

**Scope:** Register the four tools in the extension host.

- [ ] Add `languageModelTools` contribution point to extension `package.json`
- [ ] Register tools in `activate()` using `vscode.lm.registerTool()`
- [ ] Each tool handler: `client.sendRequest()` → wrap in `LanguageModelToolResult`
- [ ] Handle LSP client not connected (return error text, not crash)
- [ ] Verify tools appear in VS Code tool list
- [ ] Verify tools callable by Copilot / Claude
- [ ] Add `prepareInvocation` for user-visible progress messages

### Phase 4: Documentation

- [ ] Update `/site/guide/mcp.md` (or create new page) with VS Code LM Tools section
- [ ] Update extension README with tool descriptions
- [ ] Update agent skill (`skills/domainlang/SKILL.md`) with VS Code tool references

---

## Implementation tracking checklist

### SDK serializers (Phase 1)

- [ ] `sdk/serializers.ts` created with `serializeNode()` + augmenters + envelope types
- [ ] `QueryEntityType` + `QueryFilters` moved to SDK
- [ ] CLI `query.tsx` refactored to use SDK serializers
- [ ] CLI output unchanged (snapshot tests)
- [ ] SDK serializer unit tests passing (including $-stripping and Reference resolution)

### LSP handlers (Phase 2)

- [ ] `lsp/tool-handlers.ts` created
- [ ] `lsp/explain.ts` created
- [ ] `domainlang/validate` handler implemented
- [ ] `domainlang/list` handler implemented
- [ ] `domainlang/get` handler implemented
- [ ] `domainlang/explain` handler implemented
- [ ] `generateExplanation()` reuses hover builders for all element types
- [ ] Multi-document iteration working
- [ ] Workspace-not-ready handling
- [ ] LSP handler unit tests passing
- [ ] `generateExplanation()` unit tests passing
- [ ] Existing LSP tests unchanged

### Extension tools (Phase 3)

- [ ] `languageModelTools` in `package.json` (four tools)
- [ ] `vscode.lm.registerTool()` in `activate()`
- [ ] Tools visible in VS Code
- [ ] Tools callable by agents
- [ ] Error handling for disconnected LSP

### Documentation (Phase 4)

- [ ] Site documentation updated
- [ ] Extension README updated
- [ ] Agent skill updated

### Quality gate

- [ ] `npm run lint` — 0 errors, 0 warnings
- [ ] `npm run build` — succeeds
- [ ] `npm run test:coverage` — all tests pass, coverage meets thresholds

---

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| `vscode.lm.registerTool` API changes (relatively new) | Medium | Medium | Pin `engines.vscode` version; tool registration is simple to update |
| LSP not ready when tool is called | Medium | Medium | Extension waits for `client.start()` promise before registering tools; handlers return clear error if workspace still loading |
| Multi-document query returns duplicates | Low | Low | Deduplicate by FQN in serializers |
| IPC overhead for large models | Low | Low | DDD models are small; serialization is simple property projection |
| `languageModelTools` contribution point changes | Medium | Low | Small surface area; easy to update |

---

## Open questions

1. **Should `domainlang_validate` support filtering by file?** Currently validates the whole workspace. An optional `file` parameter could let agents validate just the file they edited, but this may be unnecessary since the whole-workspace output is typically small enough for an agent to parse.

2. **`domainlang_search` deferred to next iteration.** See future considerations for scope.

3. **CancellationToken support:** The `invoke` method receives a `CancellationToken`. Should the LSP handlers support cancellation for long-running queries? Likely unnecessary for DDD-scale models but good practice.

---

## Future considerations

- **`domainlang_diagram` tool (next iteration)**: Generate Mermaid diagrams from context maps and domain maps. Context maps are the central DDD visualization — showing how bounded contexts integrate via patterns like `[OHS]`, `[ACL]`, `[CF]`. Use an established Mermaid generation library (e.g., `mermaid-isomorphic`, `@mermaid-js/mermaid-cli`, or a dedicated Mermaid AST builder) rather than hand-crafting diagram markup strings. The tool would accept a context map or domain map FQN and return renderable Mermaid syntax. Could also support a `format` parameter for PlantUML output.
- **`domainlang_search` tool (next iteration)**: Fuzzy search across names, descriptions, visions, terminology, metadata values, and decision descriptions. Useful for agents exploring an unfamiliar model: "find anything related to payment" would match BC descriptions, domain terms, relationships, etc. Requires building a text index over semantic fields (the `IndexManager` currently indexes only FQNs).
- **`prepareInvocation` confirmations**: Use `prepareInvocation` to show the user what query will be executed before running it, for transparency.
- **Streaming results**: For very large models, stream results incrementally using `LanguageModelTextPart` chunks.
- **Tool composition**: Agents can compose multiple tool calls — e.g., `domainlang_list` to find a BC, then `domainlang_explain` to understand it, then `domainlang_diagram` to visualize its context map. Document recommended patterns in the agent skill.
- **Write tools**: Future `domainlang_create` or `domainlang_update` tools that modify the model via LSP workspace edits.
- **PRS-014 fallback**: The extension could optionally also register `dlang mcp` via `McpStdioServerDefinition` as a fallback for MCP-specific clients running inside VS Code. The native LM Tools would be the preferred path.

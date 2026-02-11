# PRS-014: CLI MCP server

**Status**: Draft  
**Priority**: High  
**Target version**: 2.3.0  
**Effort estimate**: 2–3 weeks  
**Dependencies**: PRS-007 (Model Query SDK), PRS-011 (CLI), PRS-015 (VS Code LM Tools — SDK serializers from Phase 1)
**Related**: PRS-015 (VS Code Language Model Tools — in-IDE agent integration)

---

## Executive summary

Expose DomainLang model validation and querying capabilities through the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), enabling AI agents to understand, query, and validate DDD models as first-class context.

**Three focused tools** exposed via `dlang mcp` (stdio transport):

1. `domainlang_validate` — validate workspace or files, return structured diagnostics
2. `domainlang_list` — query collections (domains, bounded contexts, relationships, teams, context maps)
3. `domainlang_get` — lookup by FQN or get model summary

**Scope:** This PRS covers the **CLI MCP server** (`dlang mcp`) for non-VS Code clients: Claude Desktop, Cursor, Windsurf, CI pipelines, and any MCP-compatible agent. For VS Code-native agent integration using the already-running LSP server, see **PRS-015** (implemented first).

All domain logic lives in `@domainlang/language/sdk`. The SDK serializers (`serializeNode()`, `augmentRelationship()`, etc.) are created by PRS-015 Phase 1 and reused here. All MCP plumbing (tool definitions, schema validation, response formatting) lives in the CLI.

---

## Problem

AI agents working on DDD projects today have no structured way to understand the domain model. They must:

1. **Read raw `.dlang` files** — parsing unstructured text without understanding semantics
2. **Guess at model structure** — no way to ask "what bounded contexts are in the Sales domain?"
3. **Miss validation errors** — cannot validate whether a model is correct before suggesting changes
4. **Lack relationship context** — no way to traverse context maps, integration patterns, or team assignments

DomainLang already has a rich SDK that answers all these questions programmatically. MCP is the standard protocol for exposing such capabilities to AI agents.

## Goals

| Goal | Measure |
| --- | --- |
| **Agent-queryable models** | AI agents can list domains, bounded contexts, relationships, teams via MCP tools |
| **Agent-validated models** | AI agents can validate a workspace and receive structured diagnostics |
| **Zero domain logic in MCP layer** | CLI contains only MCP transport + SDK delegation |
| **SDK completeness** | Any missing SDK features are built in the SDK, not worked around in MCP |

## Non-goals

- MCP resources for file contents (VS Code already provides file access)
- MCP prompts (agent skills and `.agent.md` files handle prompt templating)
- Write operations / model mutation via MCP (SDK is read-only)
- HTTP/SSE transport (stdio covers all current use cases)
- Authentication (local-only MCP servers need no auth)

---

## User stories

### Primary

As a **developer using Claude Desktop**,  
I want to connect the DomainLang MCP server via stdio,  
So that Claude can validate and query my models outside VS Code.

As an **AI agent editing `.dlang` files**,  
I want to validate the model after making changes,  
So that I can verify my edits are correct before presenting them.

As a **CI/CD pipeline operator**,  
I want to expose DomainLang MCP tools to automated agents,  
So that AI-powered code review can check domain model consistency.

---

## Architecture

### Design principle: CLI-only MCP server

The MCP server is a standalone CLI command (`dlang mcp`) that any MCP client can spawn. For VS Code-native agent integration, PRS-015 (implemented first) provides a more integrated approach using the Language Model Tools API with the already-running LSP server.

```text
┌──────────────────────────┐
│  Claude Desktop / Cursor │
│  / any MCP client        │
│  → spawns `dlang mcp`   │
└────────────┬─────────────┘
             │ stdio (stdin/stdout)
             │
┌────────────▼──────────────────────────────┐
│  CLI: `dlang mcp`                         │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │  MCP Server (McpServer + Stdio)     │  │
│  │  Tool definitions + Zod schemas     │  │
│  │  Response formatting                │  │
│  └──────────────┬──────────────────────┘  │
│                 │                          │
│  ┌──────────────▼──────────────────────┐  │
│  │  Headless Langium workspace         │  │
│  │  (same services as LSP — no conn)   │  │
│  │                                     │  │
│  │  DomainLangWorkspaceManager         │  │
│  │  DomainLangIndexManager             │  │
│  │  ImportResolver · DocumentBuilder   │  │
│  │  fromDocument() · fromServices()    │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  Fallback per-call (file/text modes):     │
│  loadModel · loadModelFromText ·          │
│  validateFile · validateWorkspace         │
└───────────────────────────────────────────┘
```

The CLI MCP layer is a thin adapter that:

- Registers tools with Zod input schemas on `McpServer`
- Translates tool inputs to SDK function calls
- Formats SDK results as MCP tool responses (text + structured content)
- Handles errors gracefully with `isError: true` responses

### Headless Langium workspace: reusing LSP infrastructure

Caching, change detection, workspace graph building, and incremental rebuilds are the most complex parts of the DomainLang language server. The `DomainLangWorkspaceManager`, `DomainLangIndexManager`, `ImportResolver`, and `DocumentBuilder` together form a sophisticated workspace infrastructure that handles:

- **Import graph traversal** — recursive loading of all imported files from a manifest entry point
- **Reverse dependency tracking** — knowing which documents are affected when a file changes
- **Incremental rebuilds** — rebuilding only affected documents, not the entire workspace
- **Manifest/lock file caching** — mtime-based invalidation with TTL-based in-memory fast paths
- **Path alias resolution** — resolving `@alias/` imports via `model.yaml` paths section

**This infrastructure must NOT be duplicated or reimplemented in the MCP server.** It must be reused as-is.

Langium services are designed to work without an LSP connection. When `createDomainLangServices()` is called without a `connection` parameter, `ConfigurationProvider.initialized({})` is called immediately, enabling headless operation. This pattern is already proven in:

- **Tests** — `createDomainLangServices(EmptyFileSystem)` in test helpers
- **SDK** — `createDomainLangServices(NodeFileSystem)` in `loadModel()`, `validateFile()`, `validateWorkspace()`
- **Headless detection** — `domain-lang-module.ts` line 134 auto-initializes when no connection

The MCP server uses the **same approach**: it creates headless Langium services at startup, initializes the workspace, and uses the existing `DomainLangWorkspaceManager` to load the import graph and build all documents. No custom workspace management, no custom change detection, no file watchers.

**MCP workspace lifecycle:**

1. `dlang mcp` starts → `createDomainLangServices(NodeFileSystem)` (headless — no connection)
2. Initialize `WorkspaceManager` with CWD (same as LSP `onInitialize` hook)
3. `DomainLangWorkspaceManager.initializeWorkspace()` loads entry file, follows import graph, builds all documents to Validated state
4. Tool calls query the cached, already-built documents via `fromDocument()` / `fromServices()` — zero parsing overhead
5. Process exits when MCP client disconnects (or stdin closes)

**No change detection in the MCP process.** The MCP server loads the workspace once and serves from the cached state. If files change on disk during the session, the MCP client restarts `dlang mcp`. This is the standard pattern for MCP servers — they are stateless processes spawned by the client. The client (VS Code, Claude Desktop, etc.) is responsible for restarting the server when the workspace changes.

**Separate processes, shared infrastructure.** In VS Code, the LSP and MCP run as separate processes — each with its own headless Langium services. This means two in-memory copies of the workspace. This is an acceptable trade-off because:

- The Langium services ARE the proper encapsulation — extracting partial functionality would break the abstraction
- The LSP server's `main.ts` is modified only by PRS-015 (custom request handlers) — this PRS does not touch the LSP
- The workspace is typically small (DDD models are not large codebases)
- This design works for ALL MCP clients, not just VS Code

**Three input modes for maximum flexibility:**

Not all MCP clients have a workspace directory. The MCP tools support three modes to cover all use cases:

| Mode | When | Input | Behavior |
| --- | --- | --- | --- |
| **Workspace** | `path` is a directory (or omitted, defaults to CWD) | Directory path | Full Langium workspace: entry file, import graph, cross-file validation |
| **File** | `path` is a `.dlang` file | File path | `loadModel(file)` with import resolution from file's directory |
| **Text** | `text` parameter provided | Inline `.dlang` content | `loadModelFromText(text)` — browser-safe, single-file only, no imports |

Workspace mode uses the persistent headless services (loaded once at startup). File and text modes use the existing SDK functions that create fresh services per call — appropriate since these are typically one-off queries.

### Layered CLI architecture: orchestration core

The `@domainlang/language/sdk` owns **all** domain logic — parsing, validation, querying, and model traversal. The CLI should never duplicate or reimplement that logic. What the CLI adds on top is **orchestration**: resolving user-supplied paths, calling the right SDK functions, and mapping SDK types into canonical CLI output shapes.

Today this orchestration logic lives inside individual command files (`validate.tsx`, `query.tsx`) tangled with UI rendering. This makes it impossible for MCP tools to reuse the same orchestration without duplicating it.

We introduce a **core orchestration layer** — a set of pure async functions that:

1. **Resolve paths** — translate user input (file, directory, CWD) into SDK-ready entry points
2. **Invoke the SDK** — call `loadModel()`, `validateFile()`, `validateWorkspace()`, and SDK query builders
3. **Map results** — transform SDK types (AST nodes, `ValidationDiagnostic`, `RelationshipView`) into canonical CLI output types (`QueryResult`, `ValidationResult`, `GetResult`)

The core layer does **not** contain domain logic — it delegates entirely to `@domainlang/language/sdk`. It is an orchestration boundary between the SDK and the various CLI presentation layers (Ink UI, JSON output, and MCP tool responses).

```text
┌─────────────────────────────────────────────────────────┐
│                  Presentation layers                    │
│                                                         │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │  commands/    │  │  mcp/     │  │  Future: CI,     │  │
│  │  (yargs+Ink) │  │  (stdio)  │  │  VS Code webview │  │
│  └──────┬───────┘  └─────┬─────┘  └────────┬─────────┘  │
│         │                │                 │             │
│  ┌──────▼────────────────▼─────────────────▼──────────┐  │
│  │  core/  (orchestration layer)                      │  │
│  │  resolve paths → invoke SDK → map to output types  │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │ imports                        │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │  @domainlang/language/sdk                          │  │
│  │  loadModel · validateFile · validateWorkspace ·    │  │
│  │  Query · QueryBuilder · RelationshipView           │  │
│  │  (ALL domain logic lives here)                     │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

```text
packages/cli/src/
├── core/                        # Orchestration layer (path resolution + SDK delegation + result mapping)
│   ├── types.ts                 # Canonical result types (used by commands + MCP)
│   ├── validate.ts              # validate(path?) → ValidationResult (delegates to SDK)
│   ├── query.ts                 # executeQuery(type, path, filters) → QueryResult (delegates to SDK)
│   ├── get.ts                   # getElement(path, fqn?) → GetResult (delegates to SDK)
│   ├── resolve-path.ts          # resolveEntryPath(path?) → { entryFile, workspaceDir }
│   └── index.ts                 # Public barrel export
├── commands/                    # CLI presentation layer (yargs + Ink + formatters)
│   ├── validate.tsx             # Refactored: imports core/validate, Ink/JSON formatting only
│   ├── query.tsx                # Refactored: imports core/query, table/Ink formatting only
│   ├── init.tsx                 # Refactored: command UI only, any shared helpers to services/
│   ├── install.tsx              # Refactored: command UI only
│   ├── add.tsx                  # Refactored: command UI only
│   ├── remove.tsx               # Refactored: command UI only
│   ├── update.tsx               # Refactored: command UI only
│   ├── upgrade.tsx              # Refactored: command UI only
│   ├── outdated.tsx             # Refactored: command UI only
│   ├── get.tsx                  # NEW: `dlang get` command (FQN lookup + summary)
│   ├── mcp.ts                   # NEW: `dlang mcp` yargs entry point
│   └── ...                      # Other commands
├── mcp/                         # MCP transport layer
│   ├── server.ts                # McpServer setup + StdioServerTransport
│   ├── tools.ts                 # Tool registration (delegates to core/)
│   ├── types.ts                 # Zod input schemas, MCP-specific mapping
│   └── index.ts                 # Public exports
├── services/                    # Existing service layer (dependency resolution, caching, etc.)
└── ui/                          # Ink components, themes (unchanged)
```

**Refactoring scope — all existing commands must be updated:**

Every command file must follow the same layered pattern after refactoring:

| Command | Core/services function | Command file retains |
| --- | --- | --- |
| `validate` | `core/validate.ts` → calls SDK `validateFile`/`validateWorkspace` | Ink UI, `--json`/`--quiet` formatting, yargs definition |
| `query` | `core/query.ts` → calls SDK `loadModel` + query builders | Table rendering, `--format` handling, yargs definition |
| `get` (new) | `core/get.ts` → calls SDK `loadModel` + `query.byFqn`/`query.summary` | Output formatting, yargs definition |
| `init` | Already uses `services/` | Ink UI only — no changes needed |
| `install` | Already uses `services/install-service.ts` | Ink UI only — verify pattern consistency |
| `add` | Already uses `services/` | Verify pattern consistency |
| `remove` | Already uses `services/` | Verify pattern consistency |
| `update` | Already uses `services/` | Verify pattern consistency |
| `upgrade` | Already uses `services/` | Verify pattern consistency |
| `outdated` | Already uses `services/` | Verify pattern consistency |

The package management commands (`install`, `add`, `remove`, `update`, `upgrade`, `outdated`) already delegate to `services/`. The refactoring for those is lighter — verify they follow the same strict separation and that no business logic leaks into command files.

The `validate` and `query` commands require the most work since their orchestration logic is currently inline.

**What moves where:**

| Current location | Destination | What it contains |
| --- | --- | --- |
| `query.tsx` → `resolveEntryPath()` | `core/resolve-path.ts` | Path resolution (file vs dir vs CWD → SDK entry) |
| `query.tsx` → `executeQuery()`, `queryDomains()`, etc. | `core/query.ts` | SDK invocation + result mapping to `QueryResult` |
| `query.tsx` → `QueryResult`, `QueryFilters`, types | `core/types.ts` | Canonical CLI output types |
| `query.tsx` → `formatAsJson()`, `formatAsYaml()`, `getTableHeaders()` | stays in `query.tsx` | Presentation-only formatting |
| `validate.tsx` → `validate()` | `core/validate.ts` | SDK invocation + result mapping to `ValidationResult` |
| `validate.tsx` → `ValidationResult`, `CommandError` | `core/types.ts` (merge with existing `commands/types.ts`) | Canonical CLI output types |
| `validate.tsx` → Ink components, `runValidate()` | stays in `validate.tsx` | Presentation-only formatting |

**What the core layer is NOT:**

- It is **not** a duplication of the SDK query/validation API
- It does **not** contain AST traversal, validation rules, or query builder logic
- It does **not** reimplement `Query.domains()`, `QueryBuilder.withName()`, or any SDK method
- It **only** orchestrates SDK calls and maps their results to CLI-specific output shapes

**Result type guarantee:** A query for domains returns the **same `QueryResult` shape** regardless of whether the caller is:

- `dlang query domains --format json` (CLI)
- `domainlang_list` with `type: 'domains'` (MCP tool)
- Any future consumer (CI integration, VS Code webview, etc.)

The MCP `tools.ts` simply wraps the core result in an MCP tool response envelope (`{ content: [{ type: 'text', text: JSON.stringify(result) }] }`).

### Package structure

```text
packages/cli/src/core/
├── types.ts                 # Canonical ValidationResult, QueryResult, GetResult
├── validate.ts              # Orchestrates SDK validateFile/validateWorkspace calls
├── query.ts                 # Orchestrates SDK loadModel + query builder calls
├── get.ts                   # Orchestrates SDK loadModel + byFqn/summary
├── resolve-path.ts          # Resolves user paths to SDK-ready entry points
└── index.ts                 # Barrel export

packages/cli/src/mcp/
├── server.ts                # McpServer setup + stdio transport
├── tools.ts                 # Tool registration (schemas + core delegation)
├── types.ts                 # Zod input schemas
└── index.ts                 # Public exports

packages/cli/src/commands/
├── mcp.ts                   # `dlang mcp` yargs command entry point
├── get.tsx                  # `dlang get` yargs command (FQN lookup + summary)
└── ...                      # ALL existing commands refactored to use core/ or services/
```

### CLI MCP server

The CLI owns the complete MCP server implementation:

```typescript
// cli/src/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NodeFileSystem } from 'langium/node';
import { createDomainLangServices } from '@domainlang/language';
import { registerTools } from './tools.js';

export async function startMcpServer(version: string): Promise<void> {
  const server = new McpServer({
    name: 'domainlang',
    version
  });

  // Create headless Langium services — same infrastructure as the LSP,
  // without an LSP connection. Gets all workspace management, indexing,
  // import resolution, and caching for free.
  const workspaceDir = process.cwd();
  const { shared, DomainLang } = createDomainLangServices(NodeFileSystem);
  
  // Initialize workspace (same as LSP onInitialize hook)
  await DomainLang.imports.WorkspaceManager.initialize(workspaceDir);
  
  // Load import graph and build all documents to Validated state
  // (same as DomainLangWorkspaceManager.loadAdditionalDocuments)
  await shared.workspace.WorkspaceManager.initializeWorkspace([{
    name: 'workspace',
    uri: workspaceDir
  }]);

  registerTools(server, { shared, DomainLang });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('DomainLang MCP server started on stdio');
}
```

```typescript
// cli/src/mcp/tools.ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DomainLangServices } from '@domainlang/language';
import { fromDocument, fromServices, loadModelFromText } from '@domainlang/language/sdk';
import { validate } from '../core/validate.js';
import { executeQuery } from '../core/query.js';
import { getElement } from '../core/get.js';

export function registerTools(
  server: McpServer,
  services: { shared: DomainLangServices['shared']; DomainLang: DomainLangServices }
): void {
  server.registerTool('domainlang_validate', { /* schema */ }, async (input) => {
    // Text mode: inline validation via browser-safe SDK path
    if (input.text) {
      const result = await validateText(input.text);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
    // Workspace/file mode: delegates to core (which uses headless services or SDK)
    const result = await validate(input.path);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  server.registerTool('domainlang_list', { /* schema */ }, async (input) => {
    const result = await executeQuery(input.type, input.path, {
      text: input.text,
      name: input.name, fqn: input.fqn, domain: input.domain,
      team: input.team, classification: input.classification,
      metadata: input.metadata,
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  server.registerTool('domainlang_get', { /* schema */ }, async (input) => {
    const result = await getElement(input.path, input.fqn, { text: input.text });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });
}
```

```typescript
// cli/src/commands/mcp.ts — yargs command entry point
import { startMcpServer } from '../mcp/server.js';

export const mcpCommand = {
  command: 'mcp',
  describe: 'Start MCP server on stdio for AI agent integration',
  handler: async () => {
    await startMcpServer(version);
  }
};
```

---

## MCP tool definitions

All tools use `@modelcontextprotocol/typescript-sdk` for registration and Zod for input schema validation.

**Design principle:** Three focused tools over many granular tools. Each tool has a clear, single purpose that's easy for agents to understand and choose between.

### Tool 1: `domainlang_validate`

Validates the DomainLang model in a workspace or single file.

| Property | Value |
| --- | --- |
| **Name** | `domainlang_validate` |
| **Description** | Validate a DomainLang workspace or file. Returns errors, warnings, and model statistics. |
| **When to use** | After editing `.dlang` files, before committing, or to check model health. |

**Input schema:**

```typescript
{
  path: z.string().describe(
    'Path to a .dlang file or workspace directory containing model.yaml. '
    + 'Defaults to current working directory if omitted.'
  ).optional(),
  text: z.string().describe(
    'Inline .dlang source text to validate. When provided, path is ignored. '
    + 'Single-file only (no imports). Useful for validating snippets before writing to disk.'
  ).optional()
}
```

**Output** (identical to `dlang validate --format json`):

```json
{
  "valid": true,
  "fileCount": 5,
  "domainCount": 3,
  "bcCount": 8,
  "errors": [],
  "warnings": [
    {
      "code": "VALIDATION_WARNING",
      "message": "Domain 'Sales' is missing a vision statement",
      "file": "domains.dlang",
      "line": 3
    }
  ]
}
```

```json
{
  "valid": false,
  "fileCount": 5,
  "domainCount": 3,
  "bcCount": 7,
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "message": "Duplicate name 'OrderContext'",
      "file": "sales.dlang",
      "line": 12,
      "column": 4
    }
  ],
  "warnings": []
}
```

**SDK delegation** (via `core/validate.ts` — same function as `dlang validate`):

```typescript
import { validate } from '../core/validate.js';

// MCP tool handler delegates directly to core
const result = await validate(input.path);
return { content: [{ type: 'text', text: JSON.stringify(result) }] };
```

---

### Tool 2: `domainlang_list`

Query collections of model elements with flexible filtering.

| Property | Value |
| --- | --- |
| **Name** | `domainlang_list` |
| **Description** | List and filter model elements: domains, bounded contexts, relationships, teams, or context maps. |
| **When to use** | To explore the model structure, find elements by properties, or gather collections for analysis. |

**Input schema:**

```typescript
{
  path: z.string().describe('Path to .dlang file or workspace directory').optional(),
  text: z.string().describe(
    'Inline .dlang source text to query. When provided, path is ignored. '
    + 'Single-file only (no imports).'
  ).optional(),
  
  // What to list — matches `dlang query <type>` entity types
  type: z.enum([
    'domains', 'bcs', 'teams', 'classifications',
    'relationships', 'context-maps', 'domain-maps'
  ]).describe(
    'Type of elements to list. Same types as `dlang query <type>`: '
    + 'domains, bcs (bounded contexts), teams, classifications, '
    + 'relationships, context-maps, domain-maps.'
  ),
  
  // Filters (which apply depends on type)
  name: z.string().describe('Filter by name (exact match or regex)').optional(),
  fqn: z.string().describe('Filter by fully qualified name').optional(),
  domain: z.string().describe('Filter bounded contexts by domain name').optional(),
  team: z.string().describe('Filter bounded contexts by team name').optional(),
  classification: z.string().describe('Filter bounded contexts by classification (Core, Supporting, Generic)').optional(),
  metadata: z.string().describe('Filter bounded contexts by metadata (key=value)').optional(),
  context: z.string().describe('Filter relationships involving this bounded context').optional(),
  pattern: z.string().describe('Filter relationships by integration pattern (OHS, CF, ACL, PL, SK, P)').optional()
}
```

**Output** (identical to `dlang query <type> --format json`; uses `core/query.ts` `QueryResult`):

All list results share the same envelope — the same `QueryResult` that `dlang query <type> --format json` produces:

```typescript
interface QueryResult {
  entityType: QueryEntityType;   // Canonical entity type
  count: number;
  results: QueryResultItem[];    // Per-entity shape varies
}
```

**Domains** (`type: 'domains'`):

```json
{
  "entityType": "domains",
  "count": 1,
  "results": [
    {
      "name": "Sales",
      "fqn": "Sales",
      "vision": "Handle all revenue operations",
      "type": "Core",
      "parent": null
    }
  ]
}
```

**Bounded contexts** (`type: 'bcs'`):

```json
{
  "entityType": "bcs",
  "count": 1,
  "results": [
    {
      "name": "OrderContext",
      "fqn": "Sales.OrderContext",
      "domain": "Sales",
      "classification": "Core",
      "team": "SalesTeam",
      "description": "Handles order lifecycle"
    }
  ]
}
```

**Relationships** (`type: 'relationships'`):

```json
{
  "entityType": "relationships",
  "count": 1,
  "results": [
    {
      "name": "OrderContext -> BillingContext",
      "left": "OrderContext",
      "right": "BillingContext",
      "arrow": "->",
      "leftPatterns": "OHS, PL",
      "rightPatterns": "CF",
      "type": "upstream-downstream"
    }
  ]
}
```

**Context maps** (`type: 'context-maps'`):

```json
{
  "entityType": "context-maps",
  "count": 1,
  "results": [
    {
      "name": "SalesMap",
      "contexts": "OrderContext, BillingContext, InventoryContext"
    }
  ]
}
```

**Teams** (`type: 'teams'`):

```json
{
  "entityType": "teams",
  "count": 1,
  "results": [
    {
      "name": "SalesTeam",
      "fqn": "SalesTeam"
    }
  ]
}
```

**Classifications** (`type: 'classifications'`):

```json
{
  "entityType": "classifications",
  "count": 2,
  "results": [
    { "name": "Core", "fqn": "Core" },
    { "name": "Supporting", "fqn": "Supporting" }
  ]
}
```

**Domain maps** (`type: 'domain-maps'`):

```json
{
  "entityType": "domain-maps",
  "count": 1,
  "results": [
    {
      "name": "OrganizationMap",
      "domains": "Sales, Billing, Inventory"
    }
  ]
}
```

**SDK delegation** (via `core/query.ts` — same function as `dlang query`):

```typescript
import { executeQuery } from '../core/query.js';

// MCP tool handler delegates directly to core
const result = await executeQuery(input.type, input.path, {
  name: input.name,
  fqn: input.fqn,
  domain: input.domain,
  team: input.team,
  classification: input.classification,
  metadata: input.metadata,
});
return { content: [{ type: 'text', text: JSON.stringify(result) }] };
```

---

### Tool 3: `domainlang_get`

Lookup a specific element by FQN or get a model summary.

| Property | Value |
| --- | --- |
| **Name** | `domainlang_get` |
| **Description** | Get a specific element by fully qualified name, or get a complete model summary. Returns detailed information about any model element. |
| **When to use** | To look up a specific element by FQN, or to get a high-level model overview. |

**Input schema:**

```typescript
{
  path: z.string().describe('Path to .dlang file or workspace directory').optional(),
  text: z.string().describe(
    'Inline .dlang source text to query. When provided, path is ignored. '
    + 'Single-file only (no imports).'
  ).optional(),
  fqn: z.string().describe(
    'Fully qualified name of a model element (e.g., "Sales.OrderContext"). '
    + 'If omitted, returns a complete model summary.'
  ).optional()
}
```

**Output (FQN lookup):**

```json
{
  "found": true,
  "element": {
    "type": "BoundedContext",
    "name": "OrderContext",
    "fqn": "Sales.OrderContext",
    "domain": "Sales",
    "team": "SalesTeam",
    "classification": "Core",
    "description": "Manages order lifecycle from creation to fulfillment",
    "metadata": { "Language": "TypeScript" },
    "relationships": [
      { "target": "BillingContext", "direction": "->", "patterns": ["OHS"] }
    ]
  }
}
```

**Output (model summary):**

```json
{
  "summary": {
    "fileCount": 5,
    "domainCount": 3,
    "boundedContextCount": 8,
    "teamCount": 4,
    "contextMapCount": 1,
    "relationshipCount": 12,
    "classificationBreakdown": {
      "Core": 3,
      "Supporting": 4,
      "Generic": 1
    }
  }
}
```

**SDK delegation** (via `core/get.ts` — same function as `dlang get`):

```typescript
import { getElement } from '../core/get.js';

// FQN lookup or model summary — identical to `dlang get`
const result = await getElement(input.path, input.fqn);
return { content: [{ type: 'text', text: JSON.stringify(result) }] };
```

---

## SDK gap analysis

The following SDK features may need to be added or extended to fully support the MCP tools. Each gap must be resolved **in the SDK**, not worked around in the MCP layer.

| Gap | Current state | Required | Priority |
| --- | --- | --- | --- |
| **Domain → bounded contexts** | No direct query; must filter `query.boundedContexts().inDomain(d)` | Add `domain.boundedContexts` computed property or keep using `inDomain()` filter | Low (filter works) |
| **Domain → subdomains** | No direct query | Add `domain.subdomains` computed property (child domains where `parent === this`) | Medium |
| **Relationship type inference** | `RelationshipView.inferredType` may be undefined | Ensure all relationships have either explicit or inferred type | Medium |
| **Model summary helper** | No single function; must call multiple `count()` methods | Consider adding `query.summary()` returning aggregate stats | Medium |
| **Classification breakdown** | No grouped count | Either add `query.classificationBreakdown()` or compute from `boundedContexts()` | Low (computable) |
| **Relationship filtering by context** | Must use `.where()` with manual check | Consider adding `query.relationships().involving('OrderContext')` | Medium |
| **`loadModel` from CWD** | Always requires explicit file path | Support `loadModel()` with no args → auto-discover `model.yaml` → `index.dlang` in CWD | High |

### New SDK additions (required)

#### `query.summary()`

Returns aggregate model statistics in a single call:

```typescript
interface ModelSummary {
  fileCount: number;
  domainCount: number;
  boundedContextCount: number;
  teamCount: number;
  classificationCount: number;
  contextMapCount: number;
  domainMapCount: number;
  namespaceCount: number;
  relationshipCount: number;
}

// Usage
const stats = query.summary();
```

#### `query.relationships().involving(contextName)`

Filters relationships where either side matches the given bounded context:

```typescript
const orderRelations = query.relationships()
  .involving('OrderContext')
  .toArray();
```

#### Auto-discovery `loadModel()`

When called with no arguments (or a directory path), auto-discovers the workspace entry point:

```typescript
// From CWD — finds model.yaml → reads entry, or falls back to index.dlang
const { query } = await loadModel();

// From explicit directory
const { query } = await loadModel('./my-workspace/');
```

---

## MCP resource definitions

While the primary interface is through tools, a single MCP resource provides static reference information.

### Resource: `domainlang://syntax-reference`

Provides the DomainLang syntax quick reference for agents that need to understand or write `.dlang` files.

```typescript
server.registerResource(
  'syntax-reference',
  'domainlang://syntax-reference',
  {
    title: 'DomainLang syntax reference',
    description: 'Complete DomainLang DSL syntax reference with keywords, patterns, and examples',
    mimeType: 'text/markdown'
  },
  async () => ({
    contents: [{
      uri: 'domainlang://syntax-reference',
      text: SYNTAX_REFERENCE_MARKDOWN,  // From skills/domainlang/references/SYNTAX.md
      mimeType: 'text/markdown'
    }]
  })
);
```

---

## Requirements

| ID | Requirement | Priority | Rationale |
| --- | --- | --- | --- |
| R1 | All MCP tools delegate to `@domainlang/language/sdk` — no domain logic in CLI MCP layer | Must | Single source of truth; testability |
| R3 | CLI provides `dlang mcp` command with stdio transport | Must | Universal MCP client support |
| R4 | Use `@modelcontextprotocol/typescript-sdk` (`McpServer`, `StdioServerTransport`) | Must | Official SDK; spec compliance |
| R5 | Zod schemas for all tool inputs with `.describe()` annotations | Must | Self-documenting for AI agents |
| R6 | Tools return both text content and structured content | Should | Backward compat + typed responses |
| R7 | Error responses use `isError: true` with descriptive messages | Must | Agent-friendly error handling |
| R8 | MCP tool definitions in `packages/cli/src/mcp/` | Must | Single MCP implementation in the CLI |
| R8a | Shared core layer in `packages/cli/src/core/` | Must | Same logic for CLI commands and MCP tools; no duplication |
| R8b | `dlang query <type> --format json` and `domainlang_list` return identical JSON | Must | Output parity across CLI and MCP |
| R8c | `dlang validate --json` and `domainlang_validate` return identical JSON | Must | Output parity across CLI and MCP |
| R8d | New `dlang get` command matches `domainlang_get` output | Must | Every MCP tool has a CLI counterpart |
| R9 | MCP server version matches `@domainlang/language` package version | Must | Version tracking |
| R10 | `domainlang_validate` tool supports both file and workspace validation | Must | Core agent workflow |
| R11 | `domainlang_list` tool supports all collection types with flexible filtering | Must | Unified query interface |
| R12 | `domainlang_get` tool supports FQN lookup and model summary | Must | Context gathering |
| R13 | SDK gap: add `query.summary()` method | Must | Avoids domain logic in MCP layer |
| R14 | SDK gap: add `relationships().involving()` filter | Should | Ergonomic relationship queries |
| R15 | SDK gap: add auto-discovery `loadModel()` (no args) | Should | CLI and MCP convenience |
| R16 | Syntax reference MCP resource from existing skill reference | Should | AI agent context |
| R18 | `dlang mcp` logs to stderr only (stdout reserved for MCP protocol) | Must | Stdio transport requirement |
| R19 | MCP server creates headless Langium services via `createDomainLangServices(NodeFileSystem)` — reuses all existing workspace infrastructure (WorkspaceManager, IndexManager, ImportResolver, DocumentBuilder) without modification | Must | No reimplementation of caching, indexing, or change detection |
| R20 | LSP `main.ts` is not modified — zero regression risk | Must | Workspace management infrastructure is reused via headless services, not extracted from LSP |
| R21 | MCP tools support three input modes: workspace (persistent headless services), file path (SDK `loadModel`), inline text (SDK `loadModelFromText`) | Must | Maximum client flexibility — not all MCP clients have a CWD |
| R22 | No custom file watcher or change detection logic in the MCP server — workspace is loaded once at startup; client restarts `dlang mcp` for fresh state | Must | Simplicity; standard MCP pattern |

---

## Acceptance criteria

- [ ] `dlang mcp` starts an MCP server on stdio that responds to `initialize` and `tools/list`
- [ ] All 3 tools are discoverable via `tools/list` with Zod-generated JSON schemas
- [ ] `domainlang_validate` returns correct validation results for valid and invalid models
- [ ] `domainlang_list` supports all types (domains, bcs, teams, classifications, relationships, context-maps, domain-maps)
- [ ] `domainlang_list` with type=domains returns domains with vision, type, and parent
- [ ] `domainlang_list` with type=bcs supports filtering by domain, team, classification, and metadata
- [ ] `domainlang_list` with type=relationships supports filtering by context name and integration pattern
- [ ] `domainlang_list` output JSON matches `dlang query <type> --format json` exactly
- [ ] `domainlang_get` returns element details by FQN and model summary when FQN is omitted
- [ ] `dlang get` command works and matches `domainlang_get` output
- [ ] `dlang get Sales.OrderContext` returns the same JSON as `domainlang_get` with `fqn: 'Sales.OrderContext'`
- [ ] Core layer (`packages/cli/src/core/`) contains all business logic; commands and MCP are thin wrappers
- [ ] MCP server works with Claude Desktop via `mcp.json` stdio configuration
- [ ] MCP server works with MCP Inspector (`npx @modelcontextprotocol/inspector dlang mcp`)
- [ ] `query.summary()` is implemented and tested in the SDK
- [ ] `relationships().involving()` filter is implemented and tested in the SDK
- [ ] Zero domain logic exists in CLI MCP code (only core delegation + response formatting)
- [ ] All tool handlers have error handling with `isError: true` responses
- [ ] Logging in `dlang mcp` goes to stderr, never stdout
- [ ] Tests cover all tool handlers with valid and invalid inputs for all type discriminators
- [ ] MCP server creates headless Langium services — reuses `DomainLangWorkspaceManager`, `DomainLangIndexManager`, `ImportResolver`, `DocumentBuilder` without reimplementation
- [ ] MCP workspace mode: tool calls use cached, pre-built documents via `fromDocument()` / `fromServices()` — no per-call re-parsing
- [ ] MCP text mode: `domainlang_validate` with `text` parameter validates inline `.dlang` without filesystem
- [ ] MCP text mode: `domainlang_list` with `text` parameter queries inline `.dlang` without filesystem
- [ ] MCP text mode: `domainlang_get` with `text` parameter returns element details from inline `.dlang`
- [ ] No custom file watcher or mtime tracking exists in the MCP server code
- [ ] `/site/guide/mcp.md` published with setup instructions for all supported clients
- [ ] `/site/guide/cli.md` updated with `dlang get` and `dlang mcp` command reference

---

## Implementation phases

### Phase 1: SDK additions (week 1)

**Scope:** Add missing SDK features required by MCP tools. The SDK serializers (`serializeNode()`, envelope types, filter types) already exist from PRS-015 Phase 1.

- [ ] Implement `query.summary()` returning `ModelSummary`
- [ ] Implement `relationships().involving(contextName)` filter on `QueryBuilder<RelationshipView>`
- [ ] Implement auto-discovery `loadModel()` — no-arg overload that finds `model.yaml` / `index.dlang`
- [ ] Add `domain.subdomains` computed property (child domains)
- [ ] Unit tests for all new SDK features
- [ ] Export new types from `@domainlang/language/sdk`

### Phase 2: Core layer extraction + command refactoring (week 1–2)

**Scope:** Extract orchestration logic from CLI commands into `packages/cli/src/core/` and refactor all commands to follow the layered pattern.

**Core layer (orchestration — not domain logic):**

- [ ] Create `core/types.ts` — canonical `ValidationResult`, `QueryResult`, `QueryResultItem`, `GetResult`, `ModelSummary`, `QueryFilters`, `QueryEntityType` (consolidate with existing `commands/types.ts`)
- [ ] Create `core/resolve-path.ts` — extract `resolveEntryPath()` from `query.tsx` (shared by validate, query, get, and MCP)
- [ ] Create `core/validate.ts` — extract `validate()` from `validate.tsx` (orchestrates SDK `validateFile`/`validateWorkspace`)
- [ ] Create `core/query.ts` — extract `executeQuery()` and per-type mapper functions from `query.tsx` (orchestrates SDK `loadModel` + query builders)
- [ ] Create `core/get.ts` — new `getElement(path, fqn?)` function (orchestrates SDK `loadModel` + `byFqn`/`summary`)
- [ ] Create `core/index.ts` — barrel export

**Command refactoring (all commands must follow layered pattern):**

- [ ] Refactor `commands/validate.tsx` — remove inline orchestration, import `core/validate`, retain only Ink UI + formatters
- [ ] Refactor `commands/query.tsx` — remove inline orchestration, import `core/query`, retain only table/Ink/YAML formatters
- [ ] Create `commands/get.tsx` — new `dlang get [fqn] [path]` command using `core/get`
- [ ] Register `getCommand` in `commands/index.ts`
- [ ] Audit `commands/install.tsx`, `add.tsx`, `remove.tsx`, `update.tsx`, `upgrade.tsx`, `outdated.tsx` — verify they delegate all business logic to `services/` and contain only UI/formatting code; fix any that leak logic
- [ ] Verify: `dlang validate --json` output unchanged (snapshot test)
- [ ] Verify: `dlang query domains --format json` output unchanged (snapshot test)
- [ ] Unit tests for core orchestration functions in isolation (mock SDK calls)

### Phase 3: CLI MCP server (week 2–3)

**Scope:** Implement the MCP server in the CLI, delegating to the core layer. Uses headless Langium workspace services for the persistent workspace mode.

**Headless workspace initialization:**

- [ ] Create `mcp/server.ts` — `createDomainLangServices(NodeFileSystem)` without connection (headless mode), initialize `WorkspaceManager` with CWD, call `initializeWorkspace()` to load import graph and build all documents
- [ ] Pass headless services to tool registration so workspace mode queries use `fromDocument()` / `fromServices()` against cached, pre-built documents
- [ ] Handle workspace initialization errors gracefully (missing model.yaml, parse errors) — server starts but tools return clear error messages

**MCP transport and tool registration:**

- [ ] Add `@modelcontextprotocol/sdk` and `zod` to `@domainlang/cli` dependencies
- [ ] Create `mcp/types.ts` — Zod input schemas for all 3 tools (including `text` parameter on each)
- [ ] Create `mcp/tools.ts` — tool registration delegating to `core/validate`, `core/query`, `core/get`
- [ ] Create `mcp/server.ts` — `McpServer` + `StdioServerTransport` setup with headless workspace
- [ ] Create `mcp/index.ts` — public exports

**Text input mode:**

- [ ] Implement `text` parameter on `domainlang_validate` — delegates to `loadModelFromText()` (browser-safe SDK path)
- [ ] Implement `text` parameter on `domainlang_list` — delegates to `loadModelFromText()` + query builders
- [ ] Implement `text` parameter on `domainlang_get` — delegates to `loadModelFromText()` + FQN lookup / summary

**Integration:**

- [ ] Implement syntax reference resource (embed `skills/domainlang/references/SYNTAX.md`)
- [ ] Ensure all logging goes to stderr (stdout reserved for MCP protocol)
- [ ] Create `commands/mcp.ts` — `dlang mcp` yargs command entry point
- [ ] Register `mcpCommand` in `commands/index.ts`
- [ ] Unit tests for tool handlers using mock MCP server
- [ ] Integration test: start `dlang mcp`, send MCP requests, verify responses
- [ ] Test text mode: validate/list/get with inline `.dlang` text (no filesystem)
- [ ] Test with MCP Inspector (`npx @modelcontextprotocol/inspector dlang mcp`)

### Phase 4: Documentation (week 3)

**Scope:** User-facing docs for both CLI changes and MCP integration.

- [ ] Create `/site/guide/mcp.md` — MCP integration guide (setup, tools reference, configuration examples)
- [ ] Update `/site/guide/cli.md` — add `dlang get` and `dlang mcp` command reference sections
- [ ] Add `{ text: 'MCP server', link: '/guide/mcp' }` to Tooling sidebar in `.vitepress/config.mts`
- [ ] Add Claude Desktop `mcp.json` configuration example in MCP guide
- [ ] Add VS Code `mcp.json` configuration example (for users without the extension)
- [ ] Add Cursor / Windsurf configuration examples
- [ ] Update agent skill (`skills/domainlang/SKILL.md`) with MCP tool descriptions
- [ ] Update CLI `--help` with `mcp` and `get` command documentation
- [ ] End-to-end tests with real `.dlang` example models

---

## Implementation tracking checklist

Track progress across all implementation work. Each item maps to a phase above.

### SDK (Phase 1)

- [ ] `query.summary()` implemented + tested
- [ ] `relationships().involving()` implemented + tested
- [ ] `loadModel()` auto-discovery implemented + tested
- [ ] `domain.subdomains` computed property implemented + tested
- [ ] New types exported from `@domainlang/language/sdk`

### Core layer + command refactoring (Phase 2)

- [ ] `core/types.ts` created with canonical result types (consolidated from `commands/types.ts`)
- [ ] `core/resolve-path.ts` extracted and shared
- [ ] `core/validate.ts` extracted from `validate.tsx` (orchestrates SDK)
- [ ] `core/query.ts` extracted from `query.tsx` (orchestrates SDK)
- [ ] `core/get.ts` created (FQN lookup + model summary via SDK)
- [ ] `commands/validate.tsx` refactored — imports core, UI-only
- [ ] `commands/query.tsx` refactored — imports core, formatting-only
- [ ] `commands/get.tsx` created (`dlang get` command)
- [ ] Package management commands audited (install, add, remove, update, upgrade, outdated) — no business logic in command files
- [ ] JSON output parity verified (validate + query snapshots)
- [ ] Core orchestration unit tests passing

### MCP server (Phase 3)

- [ ] Headless Langium workspace: `createDomainLangServices(NodeFileSystem)` without connection
- [ ] Workspace initialization: `WorkspaceManager.initialize()` + `initializeWorkspace()` at startup
- [ ] Tool calls use `fromDocument()` / `fromServices()` against cached workspace
- [ ] No custom file watcher or mtime tracking — workspace loaded once
- [ ] Dependencies added (`@modelcontextprotocol/sdk`, `zod`)
- [ ] `mcp/types.ts` — Zod schemas created (including `text` parameter)
- [ ] `mcp/tools.ts` — tool registration + core delegation
- [ ] `mcp/server.ts` — McpServer + StdioServerTransport + headless workspace
- [ ] `commands/mcp.ts` — `dlang mcp` yargs entry
- [ ] Text mode: `domainlang_validate` with `text` parameter (uses `loadModelFromText`)
- [ ] Text mode: `domainlang_list` with `text` parameter (uses `loadModelFromText`)
- [ ] Text mode: `domainlang_get` with `text` parameter (uses `loadModelFromText`)
- [ ] Syntax reference resource registered
- [ ] stderr-only logging verified
- [ ] MCP unit tests passing
- [ ] MCP integration tests passing (including text mode)
- [ ] MCP Inspector manual test passed

### Documentation (Phase 4)

- [ ] `/site/guide/mcp.md` created (MCP integration guide)
- [ ] `/site/guide/cli.md` updated with `dlang get` + `dlang mcp`
- [ ] `.vitepress/config.mts` sidebar updated
- [ ] Configuration examples (Claude Desktop, VS Code, Cursor)
- [ ] Agent skill updated
- [ ] End-to-end tests with example models

### Quality gate

- [ ] `npm run lint` — 0 errors, 0 warnings
- [ ] `npm run build` — succeeds
- [ ] `npm run test:coverage` — all tests pass, coverage meets thresholds

---

## Configuration examples

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "domainlang": {
      "command": "npx",
      "args": ["dlang", "mcp"],
      "cwd": "/path/to/project"
    }
  }
}
```

### VS Code workspace (`.vscode/mcp.json`)

For users who don't have the extension installed:

```json
{
  "servers": {
    "domainlang": {
      "type": "stdio",
      "command": "npx",
      "args": ["dlang", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

For VS Code-native agent integration using the already-running LSP server, see PRS-015 (implemented first).

---

## Open questions

1. **Should we expose namespaces in `domainlang_list`?** Namespaces are a structural concern. Current tool set focuses on DDD concepts (domains, BCs, relationships, teams). Could add `type: 'namespaces'` later if needed.

2. **Should `dlang mcp` support a `--watch` mode?** An opt-in mode (e.g., `dlang mcp --watch`) could use `chokidar` or `fs.watch` to detect file changes and rebuild the workspace incrementally during a long-running session. The default stateless approach covers all use cases, but watch mode could improve UX for interactive agents making multiple edits.

---

## Risks and mitigations

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| VS Code MCP API changes (still evolving) | Medium | Medium | Pin `engines.vscode` to 1.109+; wrap in abstraction layer |
| `@modelcontextprotocol/sdk` breaking changes | Medium | Low | Pin to specific major version; Zod schemas are stable |
| Performance: loading model per tool call | High | Medium | Workspace mode uses persistent headless Langium services loaded once at startup — tool calls query cached documents via `fromDocument()` with zero re-parsing. File/text modes use per-call SDK functions (acceptable for one-off queries). |
| Agents misusing tools (wrong paths, etc.) | Low | Medium | Descriptive Zod schemas with `.describe()`; good error messages |

---

## Future considerations

- **MCP prompts**: Define reusable prompts like "Review this model for DDD best practices" that compose multiple tool calls. Depends on agent prompt support maturity.
- **Streaming validation**: For large workspaces, stream diagnostics as they're discovered rather than waiting for all files.
- **Watch mode**: MCP server that watches for file changes and sends notifications when validation status changes.
- **Model diff tool**: `domainlang_diff` that compares two model states (e.g., before/after a branch).
- **Shared serialization from PRS-015**: The SDK serializers (`sdk/serializers.ts`) created in PRS-015 Phase 1 are the foundation for the CLI's AST → JSON mappers. The CLI MCP handlers import from the SDK serializers rather than maintaining separate mapping logic. This is a hard dependency — PRS-015 Phase 1 must be complete before PRS-014 implementation begins.
- **VS Code fallback registration**: The extension could optionally also register `dlang mcp` via `McpStdioServerDefinition` as a fallback for MCP-specific clients running inside VS Code, alongside the native LM Tools from PRS-015.


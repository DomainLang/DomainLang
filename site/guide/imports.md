# Import System

The import system lets you split your DomainLang model across multiple files, making large models manageable and enabling code reuse through external packages.

## Keywords

| Keyword  | Alias    |
| -------- | -------- |
| `Import` | `import` |

## Import types

DomainLang supports three types of imports:

| Type       | Syntax                    | Description                                     |
| ---------- | ------------------------- | ----------------------------------------------- |
| Relative   | `./path` or `../path`     | Local files relative to the importing file      |
| Path Alias | `@/path` or `@alias/path` | Project-relative paths configured in model.yaml |
| External   | `"owner/package"`         | External packages declared in model.yaml        |

## Relative imports

Import local files using relative paths:

```dlang
import "./shared/teams.dlang"
import "../common/classifications.dlang"
```

### Directory-first resolution

When importing without an extension, DomainLang uses directory-first resolution:

```dlang
import "./types"
```

Resolution order:

1. `./types/index.dlang` — module entry point
2. `./types.dlang` — direct file

This means you can organize code into directories with `index.dlang` as the entry point.

::: tip
Use `index.dlang` files as module entry points for cleaner imports. Instead of `import "./domains/sales/sales.dlang"`, you can write `import "./domains/sales"`.
:::

## Path aliases

Path aliases provide project-root-relative imports. Configure them in `model.yaml`:

```yaml
paths:
  "@": "./"
  "@shared": "./shared"
  "@domains": "./domains"
```

Then use them in imports:

```dlang
import "@/index.dlang"
import "@shared/teams"
import "@domains/sales"
```

The `@` alias always maps to the project root (where `model.yaml` is located).

## External dependencies

Import shared models from GitHub repositories:

```dlang
import "acme/ddd-core" as Core
import "ddd-community/patterns" as Patterns
```

External dependencies must be declared in `model.yaml`:

```yaml
dependencies:
  acme/ddd-core: "v1.0.0"
  ddd-community/patterns: "v2.3.1"
```

### Dependency keys and aliases

By default, the import specifier matches the dependency key in `model.yaml`.

You can use either:

- An `owner/package` key (recommended) and import that directly.
- A short alias key (for readability) that maps to a `source`.

#### Recommended: key is `owner/package`

```yaml
dependencies:
  acme/ddd-core: "v1.0.0"
```

```dlang
import "acme/ddd-core" as Core
```

#### Optional: key is an alias

```yaml
dependencies:
  core:
    source: acme/ddd-core
    ref: v1.0.0
```

```dlang
import "core" as Core
```

::: warning
External imports require `model.yaml`. Without it, you'll get an error suggesting to create one.
:::

## Mixed workspaces

DomainLang supports mixing standalone files with modular packages:

```text
workspace/
├── standalone.dlang        # Standalone file (relative imports only)
├── utils.dlang             # Another standalone file
├── core-domain/
│   ├── model.yaml          # Module with dependencies
│   ├── index.dlang
│   └── domains/
│       └── sales.dlang
└── support-domain/
    ├── model.yaml          # Another independent module
    ├── index.dlang
    └── shared/
        └── teams.dlang
```

**Behavior:**

- **Standalone files** (`standalone.dlang`, `utils.dlang`): Loaded on-demand, use relative imports only
- **Module folders** (`core-domain/`, `support-domain/`): Each `model.yaml` defines an independent module with its own dependencies and path aliases
- **Multiple modules**: Each module's entry point + import graph pre-loaded when workspace opens
- **Performance**: Modules load eagerly (instant LSP), standalone files load lazily (on open)

This allows you to organize code as:

- Quick prototypes or examples as standalone files
- Production domains as properly versioned modules
- Shared utilities that don't need dependency management

## Project manifest (model.yaml)

The manifest file configures your project's identity, path aliases, and dependencies.

### Full schema

```yaml
# yaml-language-server: $schema=https://domainlang.net/schema/model.schema.json

# Package identity (required for publishing)
model:
  name: my-company/domain-model
  version: 1.0.0
  entry: index.dlang

# Path aliases for @ imports
paths:
  "@": "./"
  "@shared": "./shared"
  "@lib": "./packages/lib"

# External dependencies
dependencies:
  # Short form: package-key: "git-ref"
  acme/ddd-core: "v1.0.0"

  # Extended form with additional options
  acme/compliance:
    ref: v2.0.0
    description: "Compliance classifications"

  # Non-GitHub hosts
  corp/internal:
    ref: release-2025
    source: https://gitlab.corp.com/corp/internal

# Override transitive dependency refs
overrides:
  acme/utils: "v3.0.0"

# Governance policies (optional)
governance:
  allowedSources:
    - github.com/acme
  requireStableVersions: true
```

For the full schema (used by YAML editors), see [model.yaml schema](/reference/model-yaml-schema).

### Dependency refs

The `ref` field accepts any valid git ref:

| Pattern            | Interpretation                   |
| ------------------ | -------------------------------- |
| `v1.0.0`, `v2.3.1` | Git tag (SemVer recommended)     |
| `main`, `develop`  | Branch name (floating reference) |
| `abc123def...`     | Commit SHA (exact pin)           |

::: tip Use Tags for Stability
Tags like `v1.0.0` are immutable and recommended for production. Branch refs like `main` will resolve to different commits over time.
:::

## Lock file (model.lock)

When you run `dlang install`, a `model.lock` file is generated that pins exact commit SHAs for all dependencies:

```json
{
  "version": "1",
  "dependencies": {
    "acme/ddd-core": {
      "ref": "v1.0.0",
      "refType": "tag",
      "resolved": "https://github.com/acme/ddd-core",
      "commit": "abc123def456789..."
    }
  }
}
```

**Commit this file to version control** for reproducible builds.

## CLI commands

Manage dependencies from the command line:

| Command                                    | Description                              |
| ------------------------------------------ | ---------------------------------------- |
| `dlang install`                            | Install dependencies, generate lock file |
| `dlang model list`                         | List all dependencies                    |
| `dlang model add <name> <source>`          | Add a dependency                         |
| `dlang model remove <name>`                | Remove a dependency                      |
| `dlang model status`                       | Check dependency status                  |
| `dlang model update [name]`                | Update dependencies                      |
| `dlang cache-clear`                        | Clear the dependency cache               |

See [CLI](/guide/cli) for additional model commands.

## File organization

A typical multi-file project structure:

```text
my-project/
├── model.yaml           # Project manifest
├── model.lock           # Lock file (generated)
├── index.dlang          # Main entry point
├── domains/
│   ├── sales/
│   │   └── index.dlang
│   └── shipping/
│       └── index.dlang
└── shared/
    ├── teams.dlang
    └── classifications.dlang
```

### shared/teams.dlang

```dlang
Team SalesTeam
Team ShippingTeam
Team PlatformTeam
```

### shared/classifications.dlang

```dlang
Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain
```

### domains/sales/index.dlang

```dlang
import "@shared/teams"
import "@shared/classifications"

Domain Sales {
    description: "Revenue generation"
}

bc Orders for Sales as CoreDomain by SalesTeam {
    description: "Order lifecycle"
}
```

### index.dlang

```dlang
import "@shared/teams"
import "@shared/classifications"
import "@domains/sales"
import "@domains/shipping"

ContextMap System {
    contains Orders, Shipping
    Orders -> Shipping
}
```

## What gets imported

When you import a file, all its top-level elements become available:

- Domains and Subdomains
- Bounded Contexts
- Teams and Classifications
- Metadata declarations
- Context Maps and Domain Maps
- Namespaces and their contents

## Best practices

::: tip One Concept Per File
Keep files focused. Put related teams in one file, classifications in another, each domain in its own directory.
:::

::: tip Use Path Aliases
Configure `@shared` and `@domains` aliases in `model.yaml` for cleaner imports that don't break when files move.
:::

::: warning Circular Imports
File-level cycles are allowed (Order↔Customer references are natural in domain models), but keep them minimal. Package-level cycles are forbidden.
:::

::: tip Index Files
Use `index.dlang` as the module entry point for directories. This enables clean imports like `import "./domains/sales"` instead of `import "./domains/sales/sales.dlang"`.
:::

## Next steps

- [CLI](/guide/cli) — manage dependencies from the command line
- [Browse Examples](/examples/) — see multi-file projects in action

## See also

- [Imports Reference](/reference/language#imports) — complete syntax details


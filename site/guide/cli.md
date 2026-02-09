# CLI

Use the DomainLang CLI to manage model dependencies and governance policies for a multi-file DomainLang project.

::: warning 🚧 Prerelease
The CLI is still evolving. Command names and behavior may change before v1.0.
:::

## Installation

Install globally:

```bash
npm install -g @domainlang/cli
```

Verify the installation:

```bash
dlang --help
```

::: tip
If you only want language validation and navigation while editing, use the VS Code extension instead of the CLI.
:::

## What the CLI covers today

The current CLI focuses on:

- **Validating** `.dlang` files and multi-file workspaces with full LSP validation
- **Managing** external model dependencies via `model.yaml` and `model.lock`
- **Installing** packages from GitHub with version/branch/commit support
- **Tracking** available updates for dependencies

For background on the manifest and import syntax, see the [Import System](/guide/imports).

## Common workflows

### Initialize a new project

Create a new DomainLang project with starter files:

```bash
dlang init
# or specify a directory
dlang init ./my-project
```

### Validate your model

```bash
# Validate current workspace directory
dlang validate

# Validate specific workspace or file
dlang validate ./my-project
dlang validate ./domains.dlang
```

### Install dependencies

From your project root (the directory containing `model.yaml`):

```bash
dlang install
```

This resolves dependencies and writes/updates `model.lock`.

### Check for outdated dependencies

See which dependencies have updates available:

```bash
dlang outdated
```

### Update dependencies

```bash
# Update all branch dependencies to latest commit
dlang update

# Upgrade specific package to newer version
dlang upgrade acme/ddd-core v2.0.0
```

## Command reference

### `init`

Initialize a new DomainLang project:

```bash
# Initialize in current directory
dlang init

# Initialize in specific directory
dlang init ./my-project
```

Creates:

- `model.yaml` — project manifest
- `index.dlang` — entry file with example domain
- `.gitignore` — ignore `.dlang/` cache directory

### `validate`

Validate DomainLang model files with full LSP-based validation:

```bash
# Validate current workspace directory
dlang validate

# Validate specific workspace directory
dlang validate ./my-project

# Validate a single file
dlang validate ./domains.dlang
```

The validator:

- Uses the Language Server Protocol infrastructure for accurate validation
- Validates the entry file and all its imports
- Reports errors and warnings with line/column numbers
- Shows element counts (domains, bounded contexts)
- Works with both single files and multi-file workspaces

For workspaces, the entry file is determined by `model.yaml`:

```yaml
model:
  entry: index.dlang  # Optional, defaults to index.dlang
```

::: tip
The validate command uses the same validation engine as the [Model Query SDK](/guide/sdk#validateworkspace-nodejs-only).
:::

### `install`

Install all model dependencies and generate/update the lock file:

```bash
dlang install
```

Reads `model.yaml` dependencies and:

- Downloads packages from GitHub
- Resolves version constraints
- Generates/updates `model.lock`
- Caches packages in `.dlang/packages/`

### `add`

Add a dependency to `model.yaml`:

```bash
dlang add <specifier>
```

The specifier format is `owner/repo@version`. Examples:

```bash
# Add specific version (tag)
dlang add acme/ddd-core@v1.2.0

# Add latest from branch
dlang add acme/ddd-core@main

# Add specific commit
dlang add acme/ddd-core@abc1234
```

### `remove`

Remove a dependency from `model.yaml`:

```bash
dlang remove <name>
```

Example:

```bash
dlang remove acme/ddd-core
```

### `update`

Update branch dependencies to their latest commits:

```bash
dlang update
```

This only affects dependencies pinned to branches (e.g., `@main`). Tag dependencies (e.g., `@v1.0.0`) are not updated. Use `upgrade` for those.

### `upgrade`

Upgrade dependencies to newer versions:

```bash
# Upgrade specific package to specific version
dlang upgrade acme/ddd-core v2.0.0

# Interactive upgrade (if implemented)
dlang upgrade
```

### `outdated`

Check which dependencies have updates available:

```bash
dlang outdated
```

Shows:

- Current version/commit
- Latest available version
- Update type (major/minor/patch)

### `cache-clear`

Clear the dependency cache:

```bash
dlang cache-clear
```

This removes all cached packages from `.dlang/packages/`. Packages will be re-downloaded on next `install`.

### `help`

Display help information:

```bash
dlang help
```

Shows available commands, options, and examples. You can also use `dlang --help` or `dlang -h`.

## Next steps

- [Model Query SDK](/guide/sdk) — query models programmatically

## See also

- [Import System](/guide/imports) — `model.yaml`, lock files, and external imports
- [Roadmap](/roadmap) — planned CLI improvements

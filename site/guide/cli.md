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

- Managing external model dependencies via `model.yaml` and `model.lock`
- Auditing and compliance checks based on `model.yaml` governance policies
- Basic dependency visualization (tree/impact)

For background on the manifest and import syntax, see the [Import System](/guide/imports).

## Common workflows

### Install dependencies

From your project root (the directory containing `model.yaml`):

```bash
dlang install
```

This resolves dependencies and writes/updates `model.lock`.

### Check dependency status

```bash
dlang model status
```

### Update dependencies

```bash
# Update all dependencies
dlang model update

# Update one dependency
dlang model update acme/ddd-core
```

## Command reference

### `install`

Install all model dependencies and generate/update the lock file:

```bash
dlang install
```

### `model list`

List model dependencies:

```bash
dlang model list
```

### `model add`

Add a dependency to `model.yaml`:

```bash
dlang model add <name> <owner/repo> [version]
```

Example:

```bash
dlang model add acme/ddd-core acme/ddd-core v1.2.0
```

### `model remove`

Remove a dependency from `model.yaml`:

```bash
dlang model remove <name>
```

### `model tree`

Show the dependency tree:

```bash
dlang model tree
```

Include commit SHAs:

```bash
dlang model tree --commits
```

### `model deps`

Show packages that depend on a given package:

```bash
dlang model deps <owner/repo>
```

### `model validate`

Validate model structure and dependency setup:

```bash
dlang model validate
```

### `model audit`

Generate a governance audit report:

```bash
dlang model audit
```

### `model compliance`

Check compliance with governance policies:

```bash
dlang model compliance
```

### `cache-clear`

Clear the dependency cache:

```bash
dlang cache-clear
```

## Code generation (experimental)

The CLI currently exposes a `generate` command, but it is still experimental:

```bash
dlang generate <file>
```

Expect this area to change significantly.

## Next steps

- [Model Query SDK](/guide/sdk) — query models programmatically

## See also

- [Import System](/guide/imports) — `model.yaml`, lock files, and external imports
- [Roadmap](/roadmap) — planned CLI improvements

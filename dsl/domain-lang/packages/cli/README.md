# @domainlang/cli

[![npm version](https://img.shields.io/npm/v/@domainlang/cli.svg)](https://www.npmjs.com/package/@domainlang/cli)
[![License](https://img.shields.io/npm/l/@domainlang/cli.svg)](https://github.com/DomainLang/DomainLang/blob/main/LICENSE)

Validate, query, and manage DomainLang models from the terminal. Built for local development and CI pipelines that treat architecture decisions as code.

## Install

```bash
npm install -g @domainlang/cli
```

Or run directly with npx:

```bash
npx @domainlang/cli validate
```

## Get started

```bash
# Scaffold a new DomainLang workspace
dlang init

# Validate the current directory
dlang validate

# Query all bounded contexts
dlang query bcs
```

## Commands

| Command | What it does |
| --- | --- |
| `dlang init [directory]` | Scaffold starter files for a new workspace |
| `dlang validate [path]` | Validate a single file or an entire workspace |
| `dlang query <type> [path]` | Query domains, bounded contexts, teams, relationships, and more |
| `dlang install` | Install dependencies declared in your manifest |
| `dlang add <specifier>` | Add a model dependency |
| `dlang remove <name>` | Remove a model dependency |
| `dlang update` | Refresh dependency state from the lock file |
| `dlang upgrade [package] [version]` | Upgrade one or all dependencies to the latest version |
| `dlang outdated` | List dependencies with newer versions available |
| `dlang cache-clear` | Clear the local dependency cache |
| `dlang help` | Show available commands |

## Use it in CI

Every command supports `--json`, `--quiet`, and `--no-color` for scripted environments.

A minimal CI step:

```bash
dlang validate --json
```

This exits non-zero on validation errors and writes structured JSON to stdout, so you can parse results downstream or simply treat it as a gate.

## Typical workflow

```bash
dlang install           # Resolve and lock dependencies
dlang validate          # Check for errors
dlang query bcs --classification Core   # Inspect your Core contexts
```

## Documentation

- [CLI guide](https://domainlang.net/guide/cli)
- [Getting started](https://domainlang.net/guide/getting-started)
- [Language reference](https://domainlang.net/reference/language)

## Related packages

- [@domainlang/language](https://www.npmjs.com/package/@domainlang/language) — parser, validator, and query SDK for building custom tooling.
- [DomainLang for VS Code](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang) — full editor experience with IntelliSense and live validation.

## License

Apache-2.0

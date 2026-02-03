# @domainlang/cli

[![npm version](https://img.shields.io/npm/v/@domainlang/cli.svg)](https://www.npmjs.com/package/@domainlang/cli)[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=DomainLang_DomainLang&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=DomainLang_DomainLang)
[![License](https://img.shields.io/npm/l/@domainlang/cli.svg)](https://github.com/DomainLang/DomainLang/blob/main/LICENSE)

Command-line interface for [DomainLang](https://github.com/DomainLang/DomainLang) - a Domain-Driven Design modeling language. 
 
## Features

- 📦 **Dependency Management** - Git-native model dependencies with version locking
- 🔍 **Validation** - Validate your DomainLang models for correctness
- 🌳 **Impact Analysis** - Visualize dependency trees and analyze changes
- 🔒 **Compliance** - Audit and check model compliance

## Installation

```bash
npm install -g @domainlang/cli
```

Or use with npx:

```bash
npx @domainlang/cli --help
```

## Quick start

```bash
# Validate a DomainLang model
dlang model validate

# Install model dependencies
dlang install

# View dependency tree
dlang model tree
```

## Commands

### Dependency management

DomainLang supports a git-native model dependency workflow via `model.yaml` and a lock file.

```bash
# List dependencies (from lock file)
dlang model list

# Add/remove dependencies in model.yaml
dlang model add <name> <owner/repo> [version]
dlang model remove <name>

# Install and lock dependencies
dlang install
```

### Analysis and validation

```bash
# Validate model structure and references
dlang model validate

# See dependency tree and impact analysis
dlang model tree [--commits]
dlang model deps <owner/repo>

# Audit and compliance checks
dlang model audit
dlang model compliance
```

### Utilities

```bash
# Clear dependency cache
dlang cache-clear

# Get help
dlang --help
```

### Code generation (experimental)

```bash
# Generate code from a model (currently produces stub output)
dlang generate <file>
```

## Related packages

- [@domainlang/language](https://www.npmjs.com/package/@domainlang/language) - Core language library and SDK
- [DomainLang VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DomainLang.vscode-domainlang) - IDE support with syntax highlighting and validation

## Documentation

- [Getting Started](https://domainlang.net/guide/getting-started)
- [Language Reference](https://domainlang.net/reference/language)
- [Quick Reference](https://domainlang.net/reference/quick-reference)

## License

Apache-2.0

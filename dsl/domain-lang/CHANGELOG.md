# Changelog

## [0.9.0](https://github.com/DomainLang/DomainLang/compare/v0.8.0...v0.9.0) (2026-02-10)


### Features

* add file validation and workspace validation capabilities to SDK ([91beb95](https://github.com/DomainLang/DomainLang/commit/91beb95babf256e45142024189d5b744fb4e0f61))
* add import field to exports in package.json for better module resolution in vitest ([4746db5](https://github.com/DomainLang/DomainLang/commit/4746db59e012b958efc7bd390a4c465444b21aae))
* **cli:** add query command for model exploration ([b20a968](https://github.com/DomainLang/DomainLang/commit/b20a9686d3a075eb96baa7f7284ec9dca11d86c1))
* **language:** add sdk entry point to package.json ([76cedb4](https://github.com/DomainLang/DomainLang/commit/76cedb46c789e390a791f7b579a1b0550350b2ed))


### Bug Fixes

* **help:** update validate command description for clarity ([1559526](https://github.com/DomainLang/DomainLang/commit/1559526d06aab4f5e61b11b43c69dc84e45f7239))
* **render:** specify return type for wrappedUnmount function ([76cedb4](https://github.com/DomainLang/DomainLang/commit/76cedb46c789e390a791f7b579a1b0550350b2ed))


### Documentation

* add assessment document for CLI runtime migration to Bun and OpenTUI ([76cedb4](https://github.com/DomainLang/DomainLang/commit/76cedb46c789e390a791f7b579a1b0550350b2ed))

## [0.8.0](https://github.com/DomainLang/DomainLang/compare/v0.7.0...v0.8.0) (2026-02-09)


### ⚠ BREAKING CHANGES

* **scoping:** Import aliases are now required to reference imported types

### Features

* **cli:** add ink validate command and ui kit ([5ac71cf](https://github.com/DomainLang/DomainLang/commit/5ac71cf8a10bb0a8d9dac3cccef1967230b53c0b))
* **cli:** enhance UI components and hooks ([0eec018](https://github.com/DomainLang/DomainLang/commit/0eec01887898be5a172a8b55b8c0f7e3efd954cf))
* **cli:** implement package management commands ([88b63c3](https://github.com/DomainLang/DomainLang/commit/88b63c3084bb7d3b2d343b082c2c5d462ca29aef))
* **cli:** implement package management service layer ([a98b864](https://github.com/DomainLang/DomainLang/commit/a98b8642bb12c6460bb9f22a29c962e54f31724d))
* **lsp:** add alias-aware code completion ([696dd82](https://github.com/DomainLang/DomainLang/commit/696dd8252d76d93ecde698de2d199bab333469b7))
* **lsp:** add document symbol provider with icon mappings and detail text ([a9514d2](https://github.com/DomainLang/DomainLang/commit/a9514d2c869e90c4b1746aa5995ec9e6d404fca4))
* **lsp:** enhance hover with go-to-definition links and import aliases ([4b65475](https://github.com/DomainLang/DomainLang/commit/4b654750b8834d3eb262af7fad21f0708a6b363f))
* **lsp:** enhance hover with structured builders and rich context ([42b5b81](https://github.com/DomainLang/DomainLang/commit/42b5b81a9bdc9895c5429ec03c768ec2305ed097))
* **lsp:** register document symbol and node kind providers ([3634f21](https://github.com/DomainLang/DomainLang/commit/3634f21f769197d616ae3e07819db5efbd867ed0))
* **scoping:** implement import alias support per ADR-003 ([7a1bc66](https://github.com/DomainLang/DomainLang/commit/7a1bc6699d9779ea161addbef2a7390effe8cb65))
* **sdk:** add createModelLoader factory for multi-document models ([e34635b](https://github.com/DomainLang/DomainLang/commit/e34635b4a00027d39a03b628e11dec866491ef25))
* **validation:** add duplicate relationship detection ([4955095](https://github.com/DomainLang/DomainLang/commit/4955095c8177960001fccc065599f777e7c56948))


### Bug Fixes

* add eslint-disable comments and explicit types to language tests ([a1d494e](https://github.com/DomainLang/DomainLang/commit/a1d494ea3cfd15428b1a9ac4e4dd7f2c8ee96c7d))
* **cli:** complete vitest v4 migration (forks pool + class mocks) ([7183cc3](https://github.com/DomainLang/DomainLang/commit/7183cc326f5c0840a8bbff12883fa10808eaf993))
* **cli:** downgrade React/Ink for test compatibility and fix StatusMessage ([afb351b](https://github.com/DomainLang/DomainLang/commit/afb351b2a0c264e4ad8dd5f89fab00aac49f3af5))
* **cli:** merge duplicate crypto imports ([5de48dd](https://github.com/DomainLang/DomainLang/commit/5de48dd4333d74865199f6cbc598a4b799584993))
* **coverage:** update thresholds for lines and functions to improve test coverage metrics ([7746e02](https://github.com/DomainLang/DomainLang/commit/7746e022661a7801f28003738b555af8cb50f39e))
* **examples:** correct banking-system.dlang grammar ([500d9b2](https://github.com/DomainLang/DomainLang/commit/500d9b2a9a1260e11ee518c0e35a4ed21d1ec8de))
* **language:** add null check for DocumentSymbolProvider in tests ([05c0016](https://github.com/DomainLang/DomainLang/commit/05c001662d5c76660e2edd9f4caac16e60a2eae0))
* **lsp:** correct symbol kind mapping for relationships in NodeKindProvider ([6101eff](https://github.com/DomainLang/DomainLang/commit/6101eff46b7a6be02bb52c778872a29c48a02028))
* **test:** resolve TypeScript compilation errors in tests ([f32ec3d](https://github.com/DomainLang/DomainLang/commit/f32ec3d8d1783d83ff2835d043fdac8ccad34c7a))


### Documentation

* **cli:** add comprehensive test audit report ([d3fd9c6](https://github.com/DomainLang/DomainLang/commit/d3fd9c65251731f1b11e4fac27f091d94c662cfc))
* **cli:** fix formatting in the README description ([5ac342f](https://github.com/DomainLang/DomainLang/commit/5ac342f7d591be825ee33720b122aad4d9a0ce22))
* update coverage threshold for branches in vitest configuration ([acf4e72](https://github.com/DomainLang/DomainLang/commit/acf4e72fe87b170077158f12a2ac4c13f432e29a))


### Code Refactoring

* **cli:** add supporting infrastructure ([bdd4cc0](https://github.com/DomainLang/DomainLang/commit/bdd4cc0c2970c69a3e8d4daff3b695ef317059f1))
* **cli:** consolidate duplicate HTTP status tests ([551c835](https://github.com/DomainLang/DomainLang/commit/551c8352d02edb93aef111fcccb0f450de997d42))
* **cli:** introduce FileSystemService abstraction for all fs operations ([c75802d](https://github.com/DomainLang/DomainLang/commit/c75802d07398c04a67074906923dbce2d3e6bb0c))
* **cli:** remove legacy CLI implementation files ([a8a459f](https://github.com/DomainLang/DomainLang/commit/a8a459f2a137858b38faa1daa758728494c9ae6d))
* **cli:** resolve SonarQube code quality issues in fetch utilities ([ea23422](https://github.com/DomainLang/DomainLang/commit/ea2342273e7955f7bf98c929d4e8ffe86c84711b))
* **cli:** update command infrastructure ([27b5024](https://github.com/DomainLang/DomainLang/commit/27b5024b3dd9dd1985eef096d10a6c55f4bed4c0))
* **lsp:** consolidate imports in document-symbol-provider ([77014b6](https://github.com/DomainLang/DomainLang/commit/77014b690664e0aec8ef1a4c1722b6d9d84636ab))
* **lsp:** eliminate dual WorkspaceManager and fix async/error handling ([fac2a28](https://github.com/DomainLang/DomainLang/commit/fac2a282388751427000561661b5cfdfbe653310))
* **sdk:** resolve SonarQube code quality issues in query API ([886dc77](https://github.com/DomainLang/DomainLang/commit/886dc771307fb64f5d6e7bcb47eda574bda04e88))
* **services:** register PackageBoundaryDetector service ([5f0a1b7](https://github.com/DomainLang/DomainLang/commit/5f0a1b7c1cb240d05514ee38941fbee6db0afe5c))
* **tests:** streamline cache-clear tests and improve filesystem mocking ([e6616eb](https://github.com/DomainLang/DomainLang/commit/e6616ebbad5dbb8f835b2b2f0e42ae0d686c5a83))
* **validation:** resolve SonarQube nested template literal issues ([4670c64](https://github.com/DomainLang/DomainLang/commit/4670c64c593d25549147b3f6c1e6e6c0074faf40))

## [0.7.0](https://github.com/DomainLang/DomainLang/compare/v0.6.0...v0.7.0) (2026-02-03)


### Features

* **lsp:** improve workspace loading and import graph tracking ([7ac3719](https://github.com/DomainLang/DomainLang/commit/7ac37195de2c2a1edaea1c986cf61a850c0acf47))


### Bug Fixes

* **readme:** update badge for quality gate status in README ([00c5a79](https://github.com/DomainLang/DomainLang/commit/00c5a7991ef0c8131ffd92935c02fc5433085487))
* **validation:** enforce import-based scoping and validate imports ([73df369](https://github.com/DomainLang/DomainLang/commit/73df369935e419c5a8d247543f3c63bd8ac3ce2f))


### Code Refactoring

* **readme:** update badge links and improve terminology for bounded contexts ([94610a8](https://github.com/DomainLang/DomainLang/commit/94610a8681deb72f2001bcacf37345eef2b4d026))

## [0.6.0](https://github.com/DomainLang/DomainLang/compare/v0.5.2...v0.6.0) (2026-02-01)


### ⚠ BREAKING CHANGES

* **language:** Package management services removed from @domainlang/language exports. Applications using GitUrlResolver, DependencyResolver, GovernanceValidator, or semver utilities must migrate to @domainlang/cli package.

### Documentation

* **skill:** add keyword dictionary sync requirement to technical-writer ([2a6fcc5](https://github.com/DomainLang/DomainLang/commit/2a6fcc5d3e89159848f5189f391df68c38a09b85))


### Code Refactoring

* **cli:** improve code quality and ES module compliance ([4c5ff2b](https://github.com/DomainLang/DomainLang/commit/4c5ff2b1e9b9ea619ecf9a5b7a0959d25b4e27ab))
* **language:** move dependency management to CLI package ([cb47592](https://github.com/DomainLang/DomainLang/commit/cb475922eebc8df850354462bd7d5fb66a8dd75a))

## [0.5.2](https://github.com/DomainLang/DomainLang/compare/v0.5.1...v0.5.2) (2026-02-01)


### Bug Fixes

* **railroad:** load grammar from langium output ([2e79164](https://github.com/DomainLang/DomainLang/commit/2e79164c7c6490250c8bdbfbebc22603e0d1768a))
* **railroad:** load grammar via langium services ([0c1d51c](https://github.com/DomainLang/DomainLang/commit/0c1d51c3ce77f9f0a06476922a562e7b5dba3ea9))
* **railroad:** resolve generated grammar dynamically ([105b340](https://github.com/DomainLang/DomainLang/commit/105b34090e80114bffc0d5d2c154f70bf79cfcbf))

## [0.5.1](https://github.com/DomainLang/DomainLang/compare/v0.5.0...v0.5.1) (2026-01-31)


### Bug Fixes

* **ci-cd:** remove redundant build-site job and update publish-site job name ([12a2bfa](https://github.com/DomainLang/DomainLang/commit/12a2bfac11ecce7fb698e5a53ffae98db6d1ec71))

## [0.5.0](https://github.com/DomainLang/DomainLang/compare/v0.4.2...v0.5.0) (2026-01-31)


### Features

* add syntax diagrams and enhance documentation ([64e7891](https://github.com/DomainLang/DomainLang/commit/64e7891592a60446cbcca101dc6d95f8db0e5ef8))


### Bug Fixes

* **ci-cd:** update coverage report path in CI/CD workflow ([b94bce5](https://github.com/DomainLang/DomainLang/commit/b94bce51e885b04adb49e5ab03ff279afa4c7046))
* **ci-cd:** update coverage report paths in CI/CD workflow ([4957dd5](https://github.com/DomainLang/DomainLang/commit/4957dd5879b445afd09449fd50ba7b62f94ece3a))
* **ci:** fix SonarQube 0% coverage and add CLI coverage collection ([da0d00a](https://github.com/DomainLang/DomainLang/commit/da0d00ad891314f546646f9363e50df9fc0fde2c))
* **cli:** correct test import path ([e8a1b02](https://github.com/DomainLang/DomainLang/commit/e8a1b025b6b1dbf282f6d6335305778dbc61f00b))
* **docs:** add quality gate, security rating, and vulnerabilities badges to README files ([c43f180](https://github.com/DomainLang/DomainLang/commit/c43f180b5330b28c14e0c30b63adda44ae3d34ca))
* **docs:** correct formatting in README.md for Model Query SDK section ([6b632a6](https://github.com/DomainLang/DomainLang/commit/6b632a6fee6446c32840fdb85ede896018106796))
* **docs:** correct whitespace in Model Query SDK section of README.md ([6ad68a1](https://github.com/DomainLang/DomainLang/commit/6ad68a185e7fd4fd46aeefbf58b6d32a07c07a73))
* **docs:** remove trailing whitespace in Model Query SDK section of README.md ([b94bce5](https://github.com/DomainLang/DomainLang/commit/b94bce51e885b04adb49e5ab03ff279afa4c7046))
* remove extra newline in README.md for improved formatting ([4428baf](https://github.com/DomainLang/DomainLang/commit/4428baf28ecf74003b65c7043e8076dc8349aecc))

## [0.4.2](https://github.com/DomainLang/DomainLang/compare/v0.4.1...v0.4.2) (2026-01-31)


### Bug Fixes

* update VS Code extension links in documentation and CI configuration ([f360d8f](https://github.com/DomainLang/DomainLang/commit/f360d8f153a89223860d31e2cb19d626481c6fa0))

## [0.4.1](https://github.com/DomainLang/DomainLang/compare/v0.4.0...v0.4.1) (2026-01-31)


### Bug Fixes

* improve CI/CD artifact reuse for releases ([d2065de](https://github.com/DomainLang/DomainLang/commit/d2065dec78cec390b68128bccc0876ae9e369b9a))

## [0.4.0](https://github.com/DomainLang/DomainLang/compare/v0.3.0...v0.4.0) (2026-01-31)


### Features

* prepare v0.3.1 release ([b0e59f6](https://github.com/DomainLang/DomainLang/commit/b0e59f649cdd85ced875b2df1b3c52851edd5b21))

## [0.3.0](https://github.com/DomainLang/DomainLang/compare/v0.2.0...v0.3.0) (2026-01-31)


### Features

* prepare v0.3.0 release ([fbe8c45](https://github.com/DomainLang/DomainLang/commit/fbe8c458dcf4811d0fa30ec2e256b90c2523bcaf))
* prepare v0.3.0 release ([3643778](https://github.com/DomainLang/DomainLang/commit/3643778a39d06f1d257d58c8304256b37d9f6053))

## [0.2.0](https://github.com/DomainLang/DomainLang/compare/v0.1.0...v0.2.0) (2026-01-31)


### ⚠ BREAKING CHANGES

* **grammar:** Remove backwards-compatible keyword aliases
* **grammar:** Grammar terminology updates

### Features

* add CI/CD workflow with quality and analysis gates ([882f883](https://github.com/DomainLang/DomainLang/commit/882f88396aa7823ded304925e9b3ea7b740b6b57))
* align bc canvas terminology ([69155a0](https://github.com/DomainLang/DomainLang/commit/69155a0b423de57f9dbe92e4f8b22f2e912ec5be))
* consolidate docs and align metadata assignments ([623eb61](https://github.com/DomainLang/DomainLang/commit/623eb61820656aab520be98e5bcb439d73e347dc))
* **deps:** implement Latest Wins dependency resolution strategy ([a5c3a54](https://github.com/DomainLang/DomainLang/commit/a5c3a54b5f99b040ae75f1d0f3da6c28f87902a9))
* enforce strict code quality with ESLint linting ([13f80a2](https://github.com/DomainLang/DomainLang/commit/13f80a28646deb874f564e7df5810ebe6070e67b))
* **examples:** add multi-file project example ([88b8f52](https://github.com/DomainLang/DomainLang/commit/88b8f5270f7ce5d281d1f6bb6d21746e11e431ae))
* **grammar:** implement PRS-008 direct property access ([a4cc501](https://github.com/DomainLang/DomainLang/commit/a4cc501ebbdc97563a706ab1eb42f673b8846862))
* **grammar:** standardize keyword casing with PascalCase primaries and lowercase shorthands ([0fe4e1e](https://github.com/DomainLang/DomainLang/commit/0fe4e1ed799a7fa8b2adba34809f24e27de2f91b))
* implement FR-4.1 Metadata element with grammar and validation ([b1b7152](https://github.com/DomainLang/DomainLang/commit/b1b715202b37add5e9de8394a2173fc7e206b1d0))
* Implement support for remote packages and resolution ([6a167ac](https://github.com/DomainLang/DomainLang/commit/6a167acdfb0f6db36657fae855b360d811d25d43))
* **imports:** implement PRS-010 Phase 3 import resolution ([adddc4b](https://github.com/DomainLang/DomainLang/commit/adddc4b28cfaa31e36c8d1b1084032a9800a5b9d))
* **lsp:** add code actions and manifest diagnostics ([30f22d1](https://github.com/DomainLang/DomainLang/commit/30f22d18c1132cf91c01d94062c337aaab99dc0d))
* **lsp:** rewrite completion provider with context-aware suggestions ([40d7d82](https://github.com/DomainLang/DomainLang/commit/40d7d82bde95b89458a7be6a383007229ab9ea1b))
* Phase 1 - Simplify import grammar per PRS-010 ([00c5f00](https://github.com/DomainLang/DomainLang/commit/00c5f00f9321fc96772e8a4858d228046a9eb5c9))
* Phase 2 - Enhance manifest system with local paths and validation per PRS-010 ([3dd1e62](https://github.com/DomainLang/DomainLang/commit/3dd1e62b0272dda3acddb36ac1e78865ba900afa))
* **sdk:** enhance loader-node with import graph traversal ([00ce218](https://github.com/DomainLang/DomainLang/commit/00ce2182e2dabfe86a4ff94a0032bf27b56cde07))
* **sdk:** implement Model Query SDK with fluent API and AST augmentation ([cd899d7](https://github.com/DomainLang/DomainLang/commit/cd899d72dd68631f5883f6e7b49fba836f21834d))
* standardize all hovers with native VS Code formatting ([312c626](https://github.com/DomainLang/DomainLang/commit/312c62654bcbf3554db70e6392647e1e7326f6c5))
* **types:** add centralized type definitions and semver utilities ([404ae48](https://github.com/DomainLang/DomainLang/commit/404ae4820a2c037223aee82906fea1e9b3ca2360))
* **validation:** add BC domain requirement and map validations ([316196b](https://github.com/DomainLang/DomainLang/commit/316196b6e42cce987e631306d4191e8e8e08bc5b))
* **validation:** add manifest validation for model.yaml ([a2f8ba7](https://github.com/DomainLang/DomainLang/commit/a2f8ba7f29827a589ca05a87d1e9c2a98355170d))
* **validation:** warn on inline/block conflicts in BoundedContext\n\nAdd validation warnings for role/team conflicts between inline (as/by) and block forms with inline precedence. Include tests covering conflicts and no-conflict scenarios. ([8571d1d](https://github.com/DomainLang/DomainLang/commit/8571d1d2c892fa73eeddc701c2bde6e0a4b50a6d))
* **workspace:** implement manifest-centric workspace management ([178950a](https://github.com/DomainLang/DomainLang/commit/178950aff3c0905ba896124cb8860a573ec95f22))


### Bug Fixes

* add engines field to root package.json ([7f84777](https://github.com/DomainLang/DomainLang/commit/7f8477789478f0f1f645f7533ca5ca59b9a7093e))
* add publisher field to extension package.json ([71f175d](https://github.com/DomainLang/DomainLang/commit/71f175d7eaa9d31155375305b2b683cb02ffe91c))
* align workspace dependency versions to 0.0.9 ([c910b39](https://github.com/DomainLang/DomainLang/commit/c910b396376348d4c61feb0c31a4bd12dfbb1309))
* correct SDK API references in language package README ([adf4c9c](https://github.com/DomainLang/DomainLang/commit/adf4c9c3d933a0f78211f3b10e945e16ce90e0fb))
* Extension not loading due to browser deps ([8b82802](https://github.com/DomainLang/DomainLang/commit/8b82802658c04d752a2e936500c6ca2aaadc85cc))
* remove audit fix from CI to prevent build failures ([4d7b1a5](https://github.com/DomainLang/DomainLang/commit/4d7b1a5f7d87e3ef7bb2568270b143d51200cda1))
* remove manual chunks from Vite config ([5fb5c16](https://github.com/DomainLang/DomainLang/commit/5fb5c16f02470c27fa799699a2ca3586f0fd3edc))
* rename domainlang package to vscode-domainlang in package-lock.json ([d9312ba](https://github.com/DomainLang/DomainLang/commit/d9312bafd432e19861defa81f9d671d9a8524fe9))
* restore web bundle build ([84d1e6d](https://github.com/DomainLang/DomainLang/commit/84d1e6dcace833e5f4e100c7af11477f4210bfc9))
* **test:** configure coverage reporting for sonarqube integration ([18a90c0](https://github.com/DomainLang/DomainLang/commit/18a90c0ba87fa73235a9f02cec534cc167c0f0cf))
* update artifact naming to include 'vscode-' prefix in build and release workflows ([c33b9be](https://github.com/DomainLang/DomainLang/commit/c33b9be6ea92d892ec97dd3b1ca1235ef4f51aca))
* update icon images across various packages ([4eb04df](https://github.com/DomainLang/DomainLang/commit/4eb04df5d8cb81df9aabecf6c0715fccf56a18dd))
* update langium and langium-cli dependencies to version 4.2.0 ([40f60fd](https://github.com/DomainLang/DomainLang/commit/40f60fd972108b2dab984550ddb95e14f97f9263))
* update project name and publisher in package.json ([214e12c](https://github.com/DomainLang/DomainLang/commit/214e12caf75183bad92df82d5b17fa654a5595ce))
* update project name in package.json and add SonarLint configuration in settings.json ([08ee613](https://github.com/DomainLang/DomainLang/commit/08ee6130982e0070df2054c6ff50b30b17890bd0))
* update remaining imports to scoped package names and add yaml dependency ([8e34a75](https://github.com/DomainLang/DomainLang/commit/8e34a75ab18242034bafbbe602c39c03c7e95f84))
* update repository URLs and homepage across package.json files ([230e92a](https://github.com/DomainLang/DomainLang/commit/230e92a68bf01b27f5b998e8987eae7004928335))
* use @vscode/vsce instead of deprecated vsce ([3a8e53c](https://github.com/DomainLang/DomainLang/commit/3a8e53c30d00ba208bfc4a6ca84589ee80722066))


### Documentation

* add audience headers and fix grammar examples ([dbdec76](https://github.com/DomainLang/DomainLang/commit/dbdec76c0bd7ec5d3e821976998ab02dbd95ccfa))
* add comprehensive import system documentation ([226bf8c](https://github.com/DomainLang/DomainLang/commit/226bf8cd5d756a10c9cc0d3d992445e6cd421f97))
* add debugging guides for extension development ([c8f2836](https://github.com/DomainLang/DomainLang/commit/c8f28366d0b8ac0d4490e6d05e820cc5fe3d0c90))
* Add language documentation and examples ([e9090f8](https://github.com/DomainLang/DomainLang/commit/e9090f8a08a904833537163c5388fc68c0673f18))
* add Metadata feature examples ([de4bbb8](https://github.com/DomainLang/DomainLang/commit/de4bbb8af37d5306caca9189b64c0922e4ad6e7f))
* add workflow diagram to workspace README ([e1bb227](https://github.com/DomainLang/DomainLang/commit/e1bb227b49dd552676eb3d86e23d4dbb841366d4))
* apply sentence casing to CLI and extension READMEs ([1e97a53](https://github.com/DomainLang/DomainLang/commit/1e97a5350305bbae7923a9c3a2447d5e04784d9d))
* document Metadata feature in user guides ([1432471](https://github.com/DomainLang/DomainLang/commit/14324714a84e32c4eddbd433b29a81fc3f0b7e94))
* enhance getting-started with diagrams and celebratory language ([b9bd6a8](https://github.com/DomainLang/DomainLang/commit/b9bd6a84d51b467d324c430a56862562d10bbde7))
* enhance quick reference with visual patterns and golden rules ([5a62824](https://github.com/DomainLang/DomainLang/commit/5a62824056c03764f3c34af0668d69d27772d847))
* improve language reference with navigation guide ([b8f0359](https://github.com/DomainLang/DomainLang/commit/b8f03590f5882a94a72142f053d995f6f03ca836))
* improve npm package discoverability for cli and language packages ([44adee6](https://github.com/DomainLang/DomainLang/commit/44adee69a063b0545df294683f35fef605b4aa09))
* **prs-008:** mark implementation complete with code review ([f3e42b7](https://github.com/DomainLang/DomainLang/commit/f3e42b735be9e72fcc2e32ec58254480141a4893))
* redesign documentation hub with visual learning path ([56b1ee8](https://github.com/DomainLang/DomainLang/commit/56b1ee8adfa44cca6f990ff6e3f071c02a0d8919))
* **sdk:** remove obsolete LSP integration example file ([5f114ce](https://github.com/DomainLang/DomainLang/commit/5f114ce67f583200f43ec7870a5838af4a3a37b0))
* streamline syntax-examples with quick navigation and visuals ([988cc15](https://github.com/DomainLang/DomainLang/commit/988cc15e62f2f22cf51168507ca77bda8423013c))
* Update admonitions and remove outdated internal documentation ([f55b0ae](https://github.com/DomainLang/DomainLang/commit/f55b0aef1c7abfc00ce5af6cd4a695560111b70e))
* update documentation with Model Query SDK information ([b4f75e7](https://github.com/DomainLang/DomainLang/commit/b4f75e713ecd6ee23aabe95905bd5a21745e6c6b))
* update mermaid diagrams for cmap/dmap shorthands ([aa57d9f](https://github.com/DomainLang/DomainLang/commit/aa57d9fd55ad78d7ce54541d6422b9411e0d2be4))
* update repository instructions for PRS-008 patterns ([5730979](https://github.com/DomainLang/DomainLang/commit/5730979184b0b394d6198be84da64adcef7ec0d8))
* update root READMEs and requirements ([3a2597f](https://github.com/DomainLang/DomainLang/commit/3a2597f76ff327940844c2c348750039c0f86745))
* update syntax diagram for grammar changes ([045a055](https://github.com/DomainLang/DomainLang/commit/045a0559de638a00173bccf8d741e376a4c0bc22))
* use lowercase bc shorthand consistently in examples ([a75ff31](https://github.com/DomainLang/DomainLang/commit/a75ff31d4eecde0c409066ff730d73cbd128dd50))
* use lowercase bc shorthand in documentation ([9c98f5e](https://github.com/DomainLang/DomainLang/commit/9c98f5e41748adf2b57fc88701056dd72f33d675))


### Code Refactoring

* **grammar:** change shorthands from cm/dm to cmap/dmap ([de79f49](https://github.com/DomainLang/DomainLang/commit/de79f4949e6733c58decf97a6d5fecb6d52500d1))
* **grammar:** rename roles to patterns and standardize terminology ([442d038](https://github.com/DomainLang/DomainLang/commit/442d03855676094f904eb7e6e8b3b6fcacc8616d))
* **grammar:** simplify keyword syntax and remove redundant aliases ([5cf0247](https://github.com/DomainLang/DomainLang/commit/5cf024701df44b0d0a79bfa1771789c16c7fefac))
* **grammar:** use Assignment for relationship type syntax ([f336619](https://github.com/DomainLang/DomainLang/commit/f3366194ea4d65f668ba7d5705ff4eea61376b7f))
* **lsp:** update providers to use effectiveRole/effectiveTeam ([5eb7524](https://github.com/DomainLang/DomainLang/commit/5eb752453e8b1cdc658b6ef2815c296577d20e97))
* rename packages to [@domainlang](https://github.com/domainlang) scope and update references ([8081304](https://github.com/DomainLang/DomainLang/commit/8081304e3ce98c78f2afc58e07f5d58125b2c57c))
* **sdk:** simplify resolution with effectiveRole/effectiveTeam pattern ([f0e2ee2](https://github.com/DomainLang/DomainLang/commit/f0e2ee2f845f3cc2b266714a3657ff767595164e))
* **validation:** update validators for direct property access ([5f13821](https://github.com/DomainLang/DomainLang/commit/5f138213675cc6f18ba07fba6bd57606bc03fe5c))
* **validation:** update validators for PRS-010 ([eda78a7](https://github.com/DomainLang/DomainLang/commit/eda78a7e5ffd252ac93fff14e9f7accff6574295))
* wire up LSP services and update exports ([26c753e](https://github.com/DomainLang/DomainLang/commit/26c753ec1843ad35ee18bf43d7e7762d6ca32d2f))

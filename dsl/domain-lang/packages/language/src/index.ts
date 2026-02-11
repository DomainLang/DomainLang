export * from './domain-lang-module.js';
export * from './generated/ast.js';
export * from './generated/grammar.js';
export * from './generated/module.js';
// Note: main.js is intentionally NOT exported here - it's the LSP entry point
// and creates a connection when imported, which breaks CLI/SDK standalone usage
export * from './ast-augmentation.js';

// Export centralized types (canonical source for all service types)
export * from './services/types.js';

// Export services (read-only for LSP - no network operations)
export * from './services/workspace-manager.js';
export * from './services/import-resolver.js';
export * from './services/relationship-inference.js';
export * from './services/performance-optimizer.js';

// Export shared utilities
export * from './utils/manifest-utils.js';

// Note: The following services have been moved to CLI package:
// - git-url-resolver.ts → @domainlang/cli/services
// - dependency-resolver.ts → @domainlang/cli/services
// - dependency-analyzer.ts → @domainlang/cli/services
// - governance-validator.ts → @domainlang/cli/services
// - semver.ts → @domainlang/cli/services

// Export LSP services
export * from './lsp/manifest-diagnostics.js';
export { DomainLangIndexManager } from './lsp/domain-lang-index-manager.js';
export { registerToolHandlers } from './lsp/tool-handlers.js';

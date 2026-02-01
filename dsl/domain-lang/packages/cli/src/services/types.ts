/**
 * Types for CLI-only package management services.
 * 
 * These types support git-based dependency resolution and governance
 * that only runs in the CLI context (never in LSP).
 */

import type { RefType } from '@domainlang/language';

// Re-export types that are shared with language package
export type {
    LockFile,
    LockedDependency,
    ModelManifest,
    DependencySpec,
    ExtendedDependencySpec,
    PathAliases,
    GovernancePolicy,
    GovernanceMetadata,
    GovernanceViolation,
    DependencyTreeNode,
    ReverseDependency,
    VersionPolicy,
    SemVer,
    RefType,
    ParsedRef,
} from '@domainlang/language';

/**
 * Parsed git import URL information.
 */
export interface GitImportInfo {
    /** Original import string */
    original: string;
    /** Detected platform (github, gitlab, bitbucket, generic) */
    platform: 'github' | 'gitlab' | 'bitbucket' | 'generic';
    /** Repository owner/organization */
    owner: string;
    /** Repository name */
    repo: string;
    /** Version/tag/branch/commit */
    version: string;
    /** Full repository URL without version */
    repoUrl: string;
    /** Entry point file (default: index.dlang) */
    entryPoint: string;
}

/**
 * Package configuration during dependency resolution.
 */
export interface ResolvingPackage {
    name?: string;
    version?: string;
    entry?: string;
    dependencies?: Record<string, string>;
    overrides?: Record<string, string>;
}

/**
 * Dependency graph for resolution.
 */
export interface DependencyGraph {
    nodes: Record<string, DependencyGraphNode>;
    root: string;
}

/**
 * Node in the dependency graph.
 */
export interface DependencyGraphNode {
    packageKey: string;
    refConstraint: string;
    constraints?: Set<string>;
    repoUrl?: string;
    dependencies: Record<string, string>;
    dependents: string[];
    resolvedRef?: string;
    refType?: RefType;
    commitHash?: string;
}

/**
 * Governance and Compliance Validation Service (CLI-only)
 * 
 * Enforces organizational policies and best practices:
 * - Allowed/blocked dependency sources
 * - Version policy enforcement (no pre-release in production)
 * - Team ownership validation
 * - License compliance
 * - Audit trail generation
 * 
 * Governance policies are defined in the `governance` section of model.yaml:
 * 
 * ```yaml
 * governance:
 *   allowedSources:
 *     - github.com/acme
 *   requireStableVersions: true
 *   requireTeamOwnership: true
 * ```
 */

import type { LockFile, GovernancePolicy, GovernanceMetadata, GovernanceViolation } from './types.js';
import path from 'node:path';
import YAML from 'yaml';
import { isPreRelease } from './semver.js';
import { defaultFileSystem, type FileSystemService } from './filesystem.js';

/** Locked dependency entry from lock file */
interface LockedDependency {
    resolved: string;
    ref: string;
    commit: string;
}

/**
 * Validates dependencies against organizational governance policies.
 */
export class GovernanceValidator {
    private readonly fs: FileSystemService;

    constructor(
        private readonly policy: GovernancePolicy,
        fs: FileSystemService = defaultFileSystem
    ) {
        this.fs = fs;
    }

    /**
     * Validates a lock file against governance policies.
     */
    async validate(lockFile: LockFile, workspaceRoot: string): Promise<GovernanceViolation[]> {
        const violations: GovernanceViolation[] = [];

        // Validate each dependency
        for (const [packageKey, locked] of Object.entries(lockFile.dependencies)) {
            violations.push(
                ...this.validateAllowedSources(packageKey, locked),
                ...this.validateBlockedPackages(packageKey),
                ...this.validateVersionStability(packageKey, locked)
            );
        }

        // Validate workspace metadata
        if (this.policy.requireTeamOwnership) {
            const metadata = await this.loadGovernanceMetadata(workspaceRoot);
            if (!metadata.team || !metadata.contact) {
                violations.push({
                    type: 'missing-metadata',
                    packageKey: 'workspace',
                    message: 'Missing required team ownership metadata in model.yaml',
                    severity: 'warning',
                });
            }
        }

        return violations;
    }

    /**
     * Checks if package source is allowed by policy.
     */
    private validateAllowedSources(
        packageKey: string,
        locked: LockedDependency
    ): GovernanceViolation[] {
        if (!this.policy.allowedSources || this.policy.allowedSources.length === 0) {
            return [];
        }

        const isAllowed = this.policy.allowedSources.some(
            pattern => locked.resolved.includes(pattern) || packageKey.startsWith(pattern)
        );

        if (!isAllowed) {
            return [{
                type: 'blocked-source',
                packageKey,
                message: `Package from unauthorized source: ${locked.resolved}`,
                severity: 'error',
            }];
        }

        return [];
    }

    /**
     * Checks if package is explicitly blocked by policy.
     */
    private validateBlockedPackages(packageKey: string): GovernanceViolation[] {
        if (!this.policy.blockedPackages) {
            return [];
        }

        const isBlocked = this.policy.blockedPackages.some(
            pattern => packageKey.includes(pattern)
        );

        if (isBlocked) {
            return [{
                type: 'blocked-source',
                packageKey,
                message: `Package is blocked by governance policy`,
                severity: 'error',
            }];
        }

        return [];
    }

    /**
     * Checks if package version meets stability requirements.
     */
    private validateVersionStability(
        packageKey: string,
        locked: Pick<LockedDependency, 'ref'>
    ): GovernanceViolation[] {
        if (!this.policy.requireStableVersions) {
            return [];
        }

        if (isPreRelease(locked.ref)) {
            return [{
                type: 'unstable-version',
                packageKey,
                message: `Pre-release ref not allowed: ${locked.ref}`,
                severity: 'error',
            }];
        }

        return [];
    }

    /**
     * Loads governance metadata from model.yaml.
     */
    async loadGovernanceMetadata(workspaceRoot: string): Promise<GovernanceMetadata> {
        const manifestPath = path.join(workspaceRoot, 'model.yaml');

        try {
            const content = await this.fs.readFile(manifestPath, 'utf-8');
            const manifest = YAML.parse(content) as {
                metadata?: GovernanceMetadata;
            };

            return manifest.metadata ?? {};
        } catch {
            return {};
        }
    }

    /**
     * Generates an audit report for compliance tracking.
     */
    async generateAuditReport(lockFile: LockFile, workspaceRoot: string): Promise<string> {
        const metadata = await this.loadGovernanceMetadata(workspaceRoot);
        const violations = await this.validate(lockFile, workspaceRoot);

        // Build header section
        const headerLines = [
            '=== Dependency Audit Report ===',
            '',
            `Workspace: ${workspaceRoot}`,
            `Team: ${metadata.team ?? 'N/A'}`,
            `Contact: ${metadata.contact ?? 'N/A'}`,
            `Domain: ${metadata.domain ?? 'N/A'}`,
            '',
            'Dependencies:',
        ];

        // Build dependencies section
        const depLines: string[] = [];
        for (const [packageKey, locked] of Object.entries(lockFile.dependencies)) {
            depLines.push(
                `  - ${packageKey}@${locked.ref}`,
                `    Source: ${locked.resolved}`,
                `    Commit: ${locked.commit}`
            );
        }

        // Build violations section
        const violationLines = violations.length > 0
            ? [
                '',
                'Violations:',
                ...violations.map(v => 
                    `  [${v.severity.toUpperCase()}] ${v.packageKey}: ${v.message}`
                )
            ]
            : ['', '\u2713 No policy violations detected'];

        return [...headerLines, ...depLines, ...violationLines].join('\n');
    }
}

/**
 * Loads governance policy from model.yaml governance section.
 */
export async function loadGovernancePolicy(
    workspaceRoot: string,
    fs: FileSystemService = defaultFileSystem
): Promise<GovernancePolicy> {
    const manifestPath = path.join(workspaceRoot, 'model.yaml');

    try {
        const content = await fs.readFile(manifestPath, 'utf-8');
        const manifest = YAML.parse(content) as {
            governance?: GovernancePolicy;
        };
        
        // Return governance section or empty policy if not defined
        return manifest.governance ?? {};
    } catch {
        // No manifest or parse error = permissive defaults
        return {};
    }
}

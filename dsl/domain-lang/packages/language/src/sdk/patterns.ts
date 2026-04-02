import type { SidePattern } from '../generated/ast.js';
import {
    isOpenHostService,
    isPublishedLanguage,
    isConformist,
    isAntiCorruptionLayer,
    isSupplier,
    isCustomer,
    isBigBallOfMud,
} from '../generated/ast.js';

/**
 * Pattern constants for programmatic use.
 * Values match the AST $type names.
 */
export const Pattern = {
    // Side patterns (directional)
    OHS: 'OpenHostService',
    PL: 'PublishedLanguage',
    CF: 'Conformist',
    ACL: 'AntiCorruptionLayer',
    S: 'Supplier',
    C: 'Customer',
    BBoM: 'BigBallOfMud',
    // Symmetric patterns
    SK: 'SharedKernel',
    P: 'Partnership',
    SW: 'SeparateWays',
} as const;

/**
 * Mapping from short abbreviation to full $type name.
 * Derived from the Pattern constant.
 */
export const PatternFullName: Record<string, string> = { ...Pattern };

/**
 * Mapping from $type name to short abbreviation.
 * Derived as the inverse of Pattern.
 */
export const PatternAbbreviation: Record<string, string> = Object.fromEntries(
    Object.entries(Pattern).map(([abbr, full]) => [full, abbr]),
);

/**
 * All short+long forms that map to a given canonical $type name.
 * Derived from the Pattern constant — keyed by both abbreviation and full name.
 */
export const PatternAliases: Record<string, readonly string[]> = Object.fromEntries(
    Object.entries(Pattern).flatMap(([abbr, full]) => {
        const pair: readonly string[] = [abbr, full];
        return [[abbr, pair], [full, pair]];
    }),
);

/** Union of all pattern type names */
export type IntegrationPattern = typeof Pattern[keyof typeof Pattern];

/**
 * Checks if a pattern name matches an expected pattern.
 * Works with both $type names and short abbreviations.
 */
export function matchesPattern(actual: string, expected: string): boolean {
    const normalizedActual = actual.trim();
    const aliases = PatternAliases[expected];
    if (aliases) {
        return aliases.some(alias => 
            alias.toLowerCase() === normalizedActual.toLowerCase()
        );
    }
    return normalizedActual.toLowerCase() === expected.toLowerCase();
}

/** Side patterns that belong on the upstream side */
export const UpstreamPatterns: readonly string[] = ['OpenHostService', 'PublishedLanguage', 'Supplier'];
/** Side patterns that belong on the downstream side */
export const DownstreamPatterns: readonly string[] = ['Conformist', 'AntiCorruptionLayer', 'Customer'];
/** Symmetric patterns (mutual) */
export const SymmetricPatterns: readonly string[] = ['SharedKernel', 'Partnership', 'SeparateWays'];

/**
 * Checks if a side pattern AST node is an upstream pattern. 
 */
export function isUpstreamSidePattern(pattern: SidePattern): boolean {
    return isOpenHostService(pattern) || isPublishedLanguage(pattern) || isSupplier(pattern);
}

/**
 * Checks if a side pattern AST node is a downstream pattern.
 */
export function isDownstreamSidePattern(pattern: SidePattern): boolean {
    return isConformist(pattern) || isAntiCorruptionLayer(pattern) || isCustomer(pattern);
}

/**
 * Checks if a side pattern AST node is a Big Ball of Mud.
 */
export function isBBoMSidePattern(pattern: SidePattern): boolean {
    return isBigBallOfMud(pattern);
}

/**
 * Checks if a pattern string name is an upstream pattern.
 */
export function isUpstreamPattern(pattern: string): boolean {
    return UpstreamPatterns.some(p => matchesPattern(pattern, p));
}

/**
 * Checks if a pattern string name is a downstream pattern.
 */
export function isDownstreamPattern(pattern: string): boolean {
    return DownstreamPatterns.some(p => matchesPattern(pattern, p));
}

/**
 * Checks if a pattern string name is a mutual/symmetric pattern.
 */
export function isMutualPattern(pattern: string): boolean {
    return SymmetricPatterns.some(p => matchesPattern(pattern, p));
}

/**
 * Gets the short abbreviation for a pattern $type name.
 */
export function getPatternAbbreviation(typeName: string): string {
    return PatternAbbreviation[typeName] ?? typeName;
}

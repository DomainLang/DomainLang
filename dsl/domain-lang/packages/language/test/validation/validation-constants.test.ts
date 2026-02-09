/**
 * Tests for validation utilities and constants.
 *
 * Verifies validation message generation and helper functions:
 * - ValidationMessages message generation
 * - IssueCodes definitions
 * - Code descriptions and documentation links
 */

import { describe, test, expect } from 'vitest';
import {
    ValidationMessages,
    IssueCodes,
    buildCodeDescription
} from '../../src/validation/constants.js';

describe('ValidationMessages', () => {
    test.each([
        // Domain messages
        { fn: () => ValidationMessages.DOMAIN_NO_VISION('Sales'), expected: ['Sales', 'vision'], label: 'DOMAIN_NO_VISION' },
        { fn: () => ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(['Sales', 'Billing', 'Sales']), expected: ['Sales', 'Billing', '\u2192'], label: 'DOMAIN_CIRCULAR_HIERARCHY (chain)' },
        { fn: () => ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(['SelfRef', 'SelfRef']), expected: ['SelfRef', 'Circular domain hierarchy'], label: 'DOMAIN_CIRCULAR_HIERARCHY (self)' },
        // Bounded context messages
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_NO_DESCRIPTION('OrderContext'), expected: ['OrderContext', 'description'], label: 'BC_NO_DESCRIPTION' },
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_NO_DOMAIN('PaymentContext'), expected: ['PaymentContext', 'domain'], label: 'BC_NO_DOMAIN' },
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_CLASSIFICATION_CONFLICT('OrderContext', 'Core', 'Support'), expected: ['Core', 'Support', 'precedence'], label: 'BC_CLASSIFICATION_CONFLICT' },
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_TEAM_CONFLICT('PaymentContext', 'TeamA', 'TeamB'), expected: ['TeamA', 'TeamB', 'precedence'], label: 'BC_TEAM_CONFLICT' },
        // Import messages
        { fn: () => ValidationMessages.IMPORT_MISSING_URI(), expected: ['import', 'URI'], label: 'IMPORT_MISSING_URI' },
        { fn: () => ValidationMessages.IMPORT_REQUIRES_MANIFEST('owner/repo@v1.0.0'), expected: ['owner/repo@v1.0.0', 'model.yaml'], label: 'IMPORT_REQUIRES_MANIFEST' },
        { fn: () => ValidationMessages.IMPORT_NOT_IN_MANIFEST('unknown'), expected: ['unknown', 'model.yaml'], label: 'IMPORT_NOT_IN_MANIFEST' },
        { fn: () => ValidationMessages.IMPORT_NOT_INSTALLED('core'), expected: ['core', 'installed'], label: 'IMPORT_NOT_INSTALLED' },
        { fn: () => ValidationMessages.IMPORT_CONFLICTING_SOURCE_PATH('pkg'), expected: ['pkg', 'source', 'path'], label: 'IMPORT_CONFLICTING_SOURCE_PATH' },
        { fn: () => ValidationMessages.IMPORT_MISSING_SOURCE_OR_PATH('pkg'), expected: ['pkg', 'source'], label: 'IMPORT_MISSING_SOURCE_OR_PATH' },
        { fn: () => ValidationMessages.IMPORT_MISSING_REF('pkg'), expected: ['pkg', 'ref'], label: 'IMPORT_MISSING_REF' },
        { fn: () => ValidationMessages.IMPORT_ABSOLUTE_PATH('pkg', '/absolute/path'), expected: ['pkg', '/absolute/path'], label: 'IMPORT_ABSOLUTE_PATH' },
        { fn: () => ValidationMessages.IMPORT_ESCAPES_WORKSPACE('pkg'), expected: ['pkg', 'workspace'], label: 'IMPORT_ESCAPES_WORKSPACE' },
        { fn: () => ValidationMessages.IMPORT_UNRESOLVED('./missing.dlang'), expected: ['./missing.dlang', 'resolve'], label: 'IMPORT_UNRESOLVED' },
        // Pattern messages
        { fn: () => ValidationMessages.SHARED_KERNEL_MUST_BE_BIDIRECTIONAL('CtxA', 'CtxB', '->'), expected: ['CtxA', 'CtxB', 'bidirectional'], label: 'SK_BIDIRECTIONAL' },
        { fn: () => ValidationMessages.ACL_ON_WRONG_SIDE('CtxA', 'left'), expected: ['CtxA', 'ACL', 'downstream'], label: 'ACL_WRONG_SIDE' },
        { fn: () => ValidationMessages.CONFORMIST_ON_WRONG_SIDE('CtxA', 'right'), expected: ['CtxA', 'Conformist', 'downstream'], label: 'CF_WRONG_SIDE' },
        { fn: () => ValidationMessages.TOO_MANY_PATTERNS(3, 'left'), expected: ['3', 'left', '1-2 patterns'], label: 'TOO_MANY_PATTERNS' },
        // Map/general messages
        { fn: () => ValidationMessages.CONTEXT_MAP_NO_CONTEXTS('SalesMap'), expected: ['SalesMap', 'contexts'], label: 'CM_NO_CONTEXTS' },
        { fn: () => ValidationMessages.CONTEXT_MAP_NO_RELATIONSHIPS('SalesMap', 2), expected: ['SalesMap', 'relationships', '2'], label: 'CM_NO_RELATIONSHIPS' },
        { fn: () => ValidationMessages.DOMAIN_MAP_NO_DOMAINS('EnterpriseDomainMap'), expected: ['EnterpriseDomainMap', 'domains'], label: 'DM_NO_DOMAINS' },
        { fn: () => ValidationMessages.CONTEXT_MAP_DUPLICATE_RELATIONSHIP('CtxA', 'CtxB'), expected: ['CtxA', 'CtxB', 'Duplicate'], label: 'CM_DUPLICATE_REL' },
        { fn: () => ValidationMessages.METADATA_MISSING_NAME(), expected: ['metadata', 'name'], label: 'METADATA_MISSING_NAME' },
        { fn: () => ValidationMessages.DUPLICATE_ELEMENT('com.example.Sales'), expected: ['com.example.Sales', 'Duplicate'], label: 'DUPLICATE_ELEMENT' },
        { fn: () => ValidationMessages.UNRESOLVED_REFERENCE('BoundedContext', 'MissingBC'), expected: ['BoundedContext', 'MissingBC', 'resolve'], label: 'UNRESOLVED_REFERENCE' },
    ])('$label contains expected terms', ({ fn, expected }) => {
        // Act
        const msg = fn();

        // Assert
        expected.forEach(term => expect(msg).toContain(term));
    });
});

describe('IssueCodes', () => {
    test('all codes are unique lowercase-hyphenated strings', () => {
        // Arrange & Act
        const codes = Object.values(IssueCodes);

        // Assert
        // All match lowercase-hyphen format (implies non-empty string)
        codes.forEach(code => {
            expect(code).toMatch(/^[a-z-]+$/);
        });
        // All are unique
        const unique = new Set(codes);
        expect(unique.size).toBe(codes.length);
    });
});

describe('buildCodeDescription', () => {
    test('builds valid HTTPS URL for documentation path', () => {
        // Act
        const description = buildCodeDescription('language.md');

        // Assert
        expect(description.href).toMatch(/^https:\/\//);
        expect(description.href).toContain('language.md');
        expect(description.href).toContain('DomainLang');
    });

    test('builds URL with anchor fragment', () => {
        // Act
        const description = buildCodeDescription('language.md', 'imports');

        // Assert
        expect(description.href).toContain('language.md');
        expect(description.href).toContain('#imports');
    });

    test('different paths produce different URLs', () => {
        // Act
        const desc1 = buildCodeDescription('path1.md');
        const desc2 = buildCodeDescription('path2.md');

        // Assert
        expect(desc1.href).not.toBe(desc2.href);
        expect(desc1.href).toContain('path1.md');
        expect(desc2.href).toContain('path2.md');
    });
});

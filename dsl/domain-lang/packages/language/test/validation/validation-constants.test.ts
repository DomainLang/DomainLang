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
        { fn: () => ValidationMessages.DOMAIN_NO_VISION('Sales'), expected: ['Sales', 'vision'] },
        { fn: () => ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(['Sales', 'Billing', 'Sales']), expected: ['Sales', 'Billing', '\u2192'] },
        { fn: () => ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(['SelfRef', 'SelfRef']), expected: ['SelfRef', 'Circular domain hierarchy'] },
    ])('domain message #$# contains expected terms', ({ fn, expected }) => {
        const msg = fn();
        expected.forEach(term => expect(msg).toContain(term));
    });

    test.each([
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_NO_DESCRIPTION('OrderContext'), expected: ['OrderContext', 'description'] },
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_NO_DOMAIN('PaymentContext'), expected: ['PaymentContext', 'domain'] },
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_CLASSIFICATION_CONFLICT('OrderContext', 'Core', 'Support'), expected: ['Core', 'Support', 'precedence'] },
        { fn: () => ValidationMessages.BOUNDED_CONTEXT_TEAM_CONFLICT('PaymentContext', 'TeamA', 'TeamB'), expected: ['TeamA', 'TeamB', 'precedence'] },
    ])('bounded context message #$# contains expected terms', ({ fn, expected }) => {
        const msg = fn();
        expected.forEach(term => expect(msg).toContain(term));
    });

    test.each([
        { fn: () => ValidationMessages.IMPORT_MISSING_URI(), expected: ['import', 'URI'] },
        { fn: () => ValidationMessages.IMPORT_REQUIRES_MANIFEST('owner/repo@v1.0.0'), expected: ['owner/repo@v1.0.0', 'model.yaml'] },
        { fn: () => ValidationMessages.IMPORT_NOT_IN_MANIFEST('unknown'), expected: ['unknown', 'model.yaml'] },
        { fn: () => ValidationMessages.IMPORT_NOT_INSTALLED('core'), expected: ['core', 'installed'] },
        { fn: () => ValidationMessages.IMPORT_CONFLICTING_SOURCE_PATH('pkg'), expected: ['pkg', 'source', 'path'] },
        { fn: () => ValidationMessages.IMPORT_MISSING_SOURCE_OR_PATH('pkg'), expected: ['pkg', 'source'] },
        { fn: () => ValidationMessages.IMPORT_MISSING_REF('pkg'), expected: ['pkg', 'ref'] },
        { fn: () => ValidationMessages.IMPORT_ABSOLUTE_PATH('pkg', '/absolute/path'), expected: ['pkg', '/absolute/path'] },
        { fn: () => ValidationMessages.IMPORT_ESCAPES_WORKSPACE('pkg'), expected: ['pkg', 'workspace'] },
        { fn: () => ValidationMessages.IMPORT_UNRESOLVED('./missing.dlang'), expected: ['./missing.dlang', 'resolve'] },
    ])('import message #$# contains expected terms', ({ fn, expected }) => {
        const msg = fn();
        expected.forEach(term => expect(msg).toContain(term));
    });

    test.each([
        { fn: () => ValidationMessages.SHARED_KERNEL_MUST_BE_BIDIRECTIONAL('CtxA', 'CtxB', '->'), expected: ['CtxA', 'CtxB', 'bidirectional'] },
        { fn: () => ValidationMessages.ACL_ON_WRONG_SIDE('CtxA', 'left'), expected: ['CtxA', 'ACL', 'downstream'] },
        { fn: () => ValidationMessages.CONFORMIST_ON_WRONG_SIDE('CtxA', 'right'), expected: ['CtxA', 'Conformist', 'downstream'] },
        { fn: () => ValidationMessages.TOO_MANY_PATTERNS(3, 'left'), expected: ['3', 'left', '1-2 patterns'] },
    ])('pattern message #$# contains expected terms', ({ fn, expected }) => {
        const msg = fn();
        expected.forEach(term => expect(msg).toContain(term));
    });

    test.each([
        { fn: () => ValidationMessages.CONTEXT_MAP_NO_CONTEXTS('SalesMap'), expected: ['SalesMap', 'contexts'] },
        { fn: () => ValidationMessages.CONTEXT_MAP_NO_RELATIONSHIPS('SalesMap', 2), expected: ['SalesMap', 'relationships', '2'] },
        { fn: () => ValidationMessages.DOMAIN_MAP_NO_DOMAINS('EnterpriseDomainMap'), expected: ['EnterpriseDomainMap', 'domains'] },
        { fn: () => ValidationMessages.CONTEXT_MAP_DUPLICATE_RELATIONSHIP('CtxA', 'CtxB'), expected: ['CtxA', 'CtxB', 'Duplicate'] },
    ])('map message #$# contains expected terms', ({ fn, expected }) => {
        const msg = fn();
        expected.forEach(term => expect(msg).toContain(term));
    });

    test.each([
        { fn: () => ValidationMessages.METADATA_MISSING_NAME(), expected: ['metadata', 'name'] },
        { fn: () => ValidationMessages.DUPLICATE_ELEMENT('com.example.Sales'), expected: ['com.example.Sales', 'Duplicate'] },
        { fn: () => ValidationMessages.UNRESOLVED_REFERENCE('BoundedContext', 'MissingBC'), expected: ['BoundedContext', 'MissingBC', 'resolve'] },
    ])('general message #$# contains expected terms', ({ fn, expected }) => {
        const msg = fn();
        expected.forEach(term => expect(msg).toContain(term));
    });
});

describe('IssueCodes', () => {
    test('all codes are unique lowercase-hyphenated strings', () => {
        const codes = Object.values(IssueCodes);
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
        const description = buildCodeDescription('language.md');
        expect(description.href).toMatch(/^https:\/\//);
        expect(description.href).toContain('language.md');
        expect(description.href).toContain('DomainLang');
    });

    test('builds URL with anchor fragment', () => {
        const description = buildCodeDescription('language.md', 'imports');
        expect(description.href).toContain('language.md');
        expect(description.href).toContain('#imports');
    });

    test('different paths produce different URLs', () => {
        const desc1 = buildCodeDescription('path1.md');
        const desc2 = buildCodeDescription('path2.md');
        expect(desc1.href).not.toBe(desc2.href);
        expect(desc1.href).toContain('path1.md');
        expect(desc2.href).toContain('path2.md');
    });
});

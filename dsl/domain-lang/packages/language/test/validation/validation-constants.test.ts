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
    describe('domain messages', () => {
        test('generates domain no vision message', () => {
            const msg = ValidationMessages.DOMAIN_NO_VISION('Sales');
            expect(msg).toContain('Sales');
            expect(msg).toContain('missing');
            expect(msg).toContain('vision');
        });

        test('generates circular hierarchy message', () => {
            const cycle = ['Sales', 'Billing', 'Sales'];
            const msg = ValidationMessages.DOMAIN_CIRCULAR_HIERARCHY(cycle);
            expect(msg).toContain('Sales');
            expect(msg).toContain('Billing');
            expect(msg).toContain('→');
        });
    });

    describe('bounded context messages', () => {
        test('generates bc no description message', () => {
            const msg = ValidationMessages.BOUNDED_CONTEXT_NO_DESCRIPTION('OrderContext');
            expect(msg).toContain('OrderContext');
            expect(msg).toContain('missing');
            expect(msg).toContain('description');
        });

        test('generates bc no domain message', () => {
            const msg = ValidationMessages.BOUNDED_CONTEXT_NO_DOMAIN('PaymentContext');
            expect(msg).toContain('PaymentContext');
            expect(msg).toContain('domain');
        });

        test('generates bc classification conflict message', () => {
            const msg = ValidationMessages.BOUNDED_CONTEXT_CLASSIFICATION_CONFLICT('OrderContext', 'Core', 'Support');
            expect(msg).toContain('Core');
            expect(msg).toContain('Support');
            expect(msg).toContain('Inline');
            expect(msg).toContain('precedence');
        });

        test('generates bc team conflict message', () => {
            const msg = ValidationMessages.BOUNDED_CONTEXT_TEAM_CONFLICT('PaymentContext', 'TeamA', 'TeamB');
            expect(msg).toContain('TeamA');
            expect(msg).toContain('TeamB');
            expect(msg).toContain('Inline');
            expect(msg).toContain('precedence');
        });
    });

    describe('import messages', () => {
        test('generates import missing URI message', () => {
            const msg = ValidationMessages.IMPORT_MISSING_URI();
            expect(msg).toContain('import');
            expect(msg).toContain('URI');
        });

        test('generates import requires manifest message', () => {
            const msg = ValidationMessages.IMPORT_REQUIRES_MANIFEST('owner/repo@v1.0.0');
            expect(msg).toContain('owner/repo@v1.0.0');
            expect(msg).toContain('model.yaml');
        });

        test('generates import not in manifest message', () => {
            const msg = ValidationMessages.IMPORT_NOT_IN_MANIFEST('unknown');
            expect(msg).toContain('unknown');
            expect(msg).toContain('model.yaml');
        });

        test('generates import not installed message', () => {
            const msg = ValidationMessages.IMPORT_NOT_INSTALLED('core');
            expect(msg).toContain('core');
            expect(msg).toContain('installed');
        });

        test('generates import conflicting source path message', () => {
            const msg = ValidationMessages.IMPORT_CONFLICTING_SOURCE_PATH('pkg');
            expect(msg).toContain('pkg');
            expect(msg).toContain('source');
            expect(msg).toContain('path');
        });

        test('generates import missing source or path message', () => {
            const msg = ValidationMessages.IMPORT_MISSING_SOURCE_OR_PATH('pkg');
            expect(msg).toContain('pkg');
            expect(msg).toContain('source');
        });

        test('generates import missing ref message', () => {
            const msg = ValidationMessages.IMPORT_MISSING_REF('pkg');
            expect(msg).toContain('pkg');
            expect(msg).toContain('ref');
        });

        test('generates import absolute path message', () => {
            const msg = ValidationMessages.IMPORT_ABSOLUTE_PATH('pkg', '/absolute/path');
            expect(msg).toContain('pkg');
            expect(msg).toContain('/absolute/path');
            expect(msg).toContain('absolute');
        });

        test('generates import escapes workspace message', () => {
            const msg = ValidationMessages.IMPORT_ESCAPES_WORKSPACE('pkg');
            expect(msg).toContain('pkg');
            expect(msg).toContain('workspace');
        });
    });

    describe('pattern messages', () => {
        test('generates shared kernel bidirectional check message', () => {
            const msg = ValidationMessages.SHARED_KERNEL_MUST_BE_BIDIRECTIONAL('CtxA', 'CtxB', '->');
            expect(msg).toContain('CtxA');
            expect(msg).toContain('CtxB');
            expect(msg).toContain('bidirectional');
        });

        test('generates acl on wrong side message', () => {
            const msg = ValidationMessages.ACL_ON_WRONG_SIDE('CtxA', 'left');
            expect(msg).toContain('CtxA');
            expect(msg).toContain('ACL');
            expect(msg).toContain('left');
        });

        test('generates conformist on wrong side message', () => {
            const msg = ValidationMessages.CONFORMIST_ON_WRONG_SIDE('CtxA', 'right');
            expect(msg).toContain('CtxA');
            expect(msg).toContain('Conformist');
            expect(msg).toContain('right');
        });

        test('generates too many patterns message', () => {
            const msg = ValidationMessages.TOO_MANY_PATTERNS(3, 'left');
            expect(msg).toContain('3');
            expect(msg).toContain('left');
        });
    });

    describe('context/domain map messages', () => {
        test('generates context map no contexts message', () => {
            const msg = ValidationMessages.CONTEXT_MAP_NO_CONTEXTS('SalesMap');
            expect(msg).toContain('SalesMap');
            expect(msg).toContain('contexts');
        });

        test('generates context map no relationships message', () => {
            const msg = ValidationMessages.CONTEXT_MAP_NO_RELATIONSHIPS('SalesMap', 2);
            expect(msg).toContain('SalesMap');
            expect(msg).toContain('relationships');
            expect(msg).toContain('2');
        });

        test('generates domain map no domains message', () => {
            const msg = ValidationMessages.DOMAIN_MAP_NO_DOMAINS('EnterpriseDomainMap');
            expect(msg).toContain('EnterpriseDomainMap');
            expect(msg).toContain('domains');
        });
    });

    describe('metadata messages', () => {
        test('generates metadata missing name message', () => {
            const msg = ValidationMessages.METADATA_MISSING_NAME();
            expect(msg).toContain('metadata');
            expect(msg).toContain('name');
        });
    });

    describe('general messages', () => {
        test('generates duplicate element message', () => {
            const msg = ValidationMessages.DUPLICATE_ELEMENT('Sales');
            expect(msg).toContain('Sales');
            expect(msg).toContain('Duplicate');
        });
    });
});

describe('IssueCodes', () => {
    describe('import issue codes', () => {
        test('defines ImportMissingUri code', () => {
            expect(IssueCodes.ImportMissingUri).toBeDefined();
            expect(typeof IssueCodes.ImportMissingUri).toBe('string');
        });

        test('defines ImportRequiresManifest code', () => {
            expect(IssueCodes.ImportRequiresManifest).toBeDefined();
        });

        test('defines ImportNotInManifest code', () => {
            expect(IssueCodes.ImportNotInManifest).toBeDefined();
        });

        test('defines ImportNotInstalled code', () => {
            expect(IssueCodes.ImportNotInstalled).toBeDefined();
        });

        test('defines ImportConflictingSourcePath code', () => {
            expect(IssueCodes.ImportConflictingSourcePath).toBeDefined();
        });

        test('defines ImportMissingSourceOrPath code', () => {
            expect(IssueCodes.ImportMissingSourceOrPath).toBeDefined();
        });

        test('defines ImportMissingRef code', () => {
            expect(IssueCodes.ImportMissingRef).toBeDefined();
        });

        test('defines ImportAbsolutePath code', () => {
            expect(IssueCodes.ImportAbsolutePath).toBeDefined();
        });

        test('defines ImportEscapesWorkspace code', () => {
            expect(IssueCodes.ImportEscapesWorkspace).toBeDefined();
        });
    });

    describe('domain issue codes', () => {
        test('defines DomainNoVision code', () => {
            expect(IssueCodes.DomainNoVision).toBeDefined();
        });

        test('defines DomainCircularHierarchy code', () => {
            expect(IssueCodes.DomainCircularHierarchy).toBeDefined();
        });
    });

    describe('bounded context issue codes', () => {
        test('defines BoundedContextNoDescription code', () => {
            expect(IssueCodes.BoundedContextNoDescription).toBeDefined();
        });

        test('defines BoundedContextNoDomain code', () => {
            expect(IssueCodes.BoundedContextNoDomain).toBeDefined();
        });

        test('defines BoundedContextClassificationConflict code', () => {
            expect(IssueCodes.BoundedContextClassificationConflict).toBeDefined();
        });

        test('defines BoundedContextTeamConflict code', () => {
            expect(IssueCodes.BoundedContextTeamConflict).toBeDefined();
        });
    });

    describe('pattern issue codes', () => {
        test('defines SharedKernelNotBidirectional code', () => {
            expect(IssueCodes.SharedKernelNotBidirectional).toBeDefined();
        });

        test('defines AclOnWrongSide code', () => {
            expect(IssueCodes.AclOnWrongSide).toBeDefined();
        });

        test('defines ConformistOnWrongSide code', () => {
            expect(IssueCodes.ConformistOnWrongSide).toBeDefined();
        });

        test('defines TooManyPatterns code', () => {
            expect(IssueCodes.TooManyPatterns).toBeDefined();
        });
    });

    describe('map issue codes', () => {
        test('defines ContextMapNoContexts code', () => {
            expect(IssueCodes.ContextMapNoContexts).toBeDefined();
        });

        test('defines ContextMapNoRelationships code', () => {
            expect(IssueCodes.ContextMapNoRelationships).toBeDefined();
        });

        test('defines DomainMapNoDomains code', () => {
            expect(IssueCodes.DomainMapNoDomains).toBeDefined();
        });
    });

    describe('metadata issue codes', () => {
        test('defines MetadataMissingName code', () => {
            expect(IssueCodes.MetadataMissingName).toBeDefined();
        });
    });

    describe('general issue codes', () => {
        test('defines DuplicateElement code', () => {
            expect(IssueCodes.DuplicateElement).toBeDefined();
        });
    });

    describe('code consistency', () => {
        test('all codes are strings', () => {
            Object.values(IssueCodes).forEach(code => {
                expect(typeof code).toBe('string');
            });
        });

        test('all codes are lowercase with hyphens', () => {
            Object.values(IssueCodes).forEach(code => {
                expect(code).toMatch(/^[a-z-]+$/);
            });
        });

        test('all codes are unique', () => {
            const codes = Object.values(IssueCodes);
            const unique = new Set(codes);
            expect(unique.size).toBe(codes.length);
        });
    });
});

describe('buildCodeDescription', () => {
    test('builds valid URL for documentation path', () => {
        const description = buildCodeDescription('language.md');
        expect(description.href).toBeDefined();
        expect(description.href).toContain('language.md');
        expect(description.href).toContain('http');
    });

    test('builds URL with anchor', () => {
        const description = buildCodeDescription('language.md', 'imports');
        expect(description.href).toContain('language.md');
        expect(description.href).toContain('#imports');
    });

    test('returns CodeDescription object', () => {
        const description = buildCodeDescription('guide.md');
        expect(description).toBeDefined();
        expect(description.href).toBeDefined();
    });

    test('handles multiple documentation paths', () => {
        const desc1 = buildCodeDescription('path1.md');
        const desc2 = buildCodeDescription('path2.md');
        expect(desc1.href).not.toBe(desc2.href);
    });

    test('URL is properly formatted', () => {
        const description = buildCodeDescription('language.md');
        expect(description.href).toMatch(/^https?:\/\//);
    });

    test('includes repository reference in URL', () => {
        const description = buildCodeDescription('language.md');
        expect(description.href).toContain('DomainLang');
    });
});

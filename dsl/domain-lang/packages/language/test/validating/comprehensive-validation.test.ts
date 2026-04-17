/**
 * Comprehensive Validation Tests
 *
 * Tests validation rules defined in src/validation/ directory.
 * Warning-message tests (domain vision, BC description, BC domain) are in enhanced-messages.test.ts.
 * This file focuses on error paths and smoke tests for valid inputs.
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import {
    setupTestSuite,
    expectValidationErrors,
    getDiagnosticsBySeverity,
    s
} from '../test-helpers.js';

describe('Validation Tests', () => {
    let testServices: TestServices;

    beforeAll(() => {
        testServices = setupTestSuite();
    });

    // ========================================================================
    // DOMAIN VALIDATION
    // ========================================================================

    describe('Domain Validation', () => {
        test.each([
            {
                scenario: 'circular domain hierarchy',
                input: s`
                    Domain A in B {}
                    Domain B in Cx {}
                    Domain Cx in A {}
                `,
                expectedErrorCount: 3,
                expectedMessageFragment: 'Circular domain hierarchy detected'
            },
            {
                scenario: 'self-referencing domain',
                input: s`
                    Domain SelfRef in SelfRef {}
                `,
                expectedErrorCount: 1,
                expectedMessageFragment: 'Circular domain hierarchy detected'
            }
        ])('should detect circular domain hierarchy ($scenario)', async ({ input, expectedErrorCount, expectedMessageFragment }) => {
            // Arrange & Act
            const document = await testServices.parse(input);

            // Assert
            expectValidationErrors(document, Array(expectedErrorCount).fill(expectedMessageFragment));
        });
    });

    // ========================================================================
    // NAMESPACE / CLASSIFICATION / TEAM duplicate-name validation is parameterized
    // in cross-document.test.ts (covers Domain, BC, Team, Namespace, Classification).
    // ========================================================================

    // ========================================================================
    // CONTEXT MAP VALIDATION
    // ========================================================================

    describe('Context Map Validation', () => {
        test('warns when context map has no contexts', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                ContextMap EmptyMap {}
            `);

            // Assert
            const warnings = getDiagnosticsBySeverity(document, 2);
            const contextMapWarnings = warnings.filter(w =>
                w.message.includes('contains no bounded contexts')
            );
            expect(contextMapWarnings).toHaveLength(1);
        });

    });

    // ========================================================================
    // DOMAIN MAP VALIDATION
    // ========================================================================

    describe('Domain Map Validation', () => {
        test('warns when domain map has no domains', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                DomainMap EmptyMap {}
            `);

            // Assert
            const warnings = getDiagnosticsBySeverity(document, 2);
            const domainMapWarnings = warnings.filter(w =>
                w.message.includes('contains no domains')
            );
            expect(domainMapWarnings).toHaveLength(1);
        });
    });
});
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
    expectValidationWarnings,
    expectValidDocument,
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
        // "warns when domain lacks vision" covered by enhanced-messages.test.ts

        test('should detect circular domain hierarchy', async () => {
            const document = await testServices.parse(s`
                Domain A in B {}
                Domain B in C {}
                Domain C in A {}
            `);

            expectValidationErrors(document, [
                'Circular domain hierarchy detected',
                'Circular domain hierarchy detected',
                'Circular domain hierarchy detected'
            ]);
        });

        test('should detect self-referencing domain', async () => {
            const document = await testServices.parse(s`
                Domain SelfRef in SelfRef {}
            `);

            expectValidationErrors(document, [
                'Circular domain hierarchy detected'
            ]);
        });

        test('accepts valid domain hierarchy without warnings or errors', async () => {
            const document = await testServices.parse(s`
                Domain Root {
                    vision: "Root vision"
                }
                Domain Child in Root {
                    vision: "Child vision"
                }
                Domain GrandChild in Child {
                    vision: "GrandChild vision"
                }
            `);

            expectValidDocument(document);
        });

        test('warns on multiple domains each missing vision', async () => {
            const document = await testServices.parse(s`
                Domain A { description: "A" }
                Domain B { description: "B" }
            `);

            expectValidationWarnings(document, [
                "missing a vision statement",
                "missing a vision statement"
            ]);
        });
    });

    // ========================================================================
    // BOUNDED CONTEXT VALIDATION
    // ========================================================================

    describe('Bounded Context Validation', () => {
        // "warns when BC lacks description" covered by enhanced-messages.test.ts
        // "warns when BC has no domain" covered by enhanced-messages.test.ts

        test('accepts bounded context with description and domain (smoke test)', async () => {
            const document = await testServices.parse(s`
                Domain Sales {
                    vision: "Sales vision"
                }
                Team SalesTeam
                Classification Core
                BoundedContext OrderContext for Sales as Core by SalesTeam {
                    description: "Handles order processing"
                }
            `);

            expectValidDocument(document);
        });
    });

    // ========================================================================
    // NAMESPACE DECLARATION VALIDATION
    // ========================================================================

    describe('Namespace Declaration Validation', () => {
        test('should detect duplicate Namespace names', async () => {
            const document = await testServices.parse(s`
                Namespace TestNamespace {
                    Domain Domain1 {}
                }

                Namespace TestNamespace {
                    Domain Domain2 {}
                }
            `);

            expectValidationErrors(document, [
                "Duplicate element"
            ]);
        });

        test('accepts unique Namespace names (smoke test)', async () => {
            const document = await testServices.parse(s`
                Namespace Namespace1 {
                    Domain Domain1 { vision: "Vision1" }
                }

                Namespace Namespace2 {
                    Domain Domain2 { vision: "Vision2" }
                }
            `);

            expectValidDocument(document);
        });
    });

    // ========================================================================
    // CLASSIFICATION VALIDATION
    // ========================================================================

    describe('Classification Validation', () => {
        test('should detect duplicate classification names', async () => {
            const document = await testServices.parse(s`
                Classification Core
                Classification Core
            `);

            expectValidationErrors(document, [
                "Duplicate element"
            ]);
        });

        test('accepts unique classification names (smoke test)', async () => {
            const document = await testServices.parse(s`
                Classification Core
                Classification Supporting
                Classification Generic
            `);

            expectValidDocument(document);
        });
    });

    // ========================================================================
    // TEAM VALIDATION
    // ========================================================================

    describe('Team Validation', () => {
        test('should detect duplicate Team names', async () => {
            const document = await testServices.parse(s`
                Team SalesTeam
                Team SalesTeam
            `);

            expectValidationErrors(document, [
                "Duplicate element"
            ]);
        });

        test('accepts unique Team names (smoke test)', async () => {
            const document = await testServices.parse(s`
                Team SalesTeam
                Team EngineeringTeam
            `);

            expectValidDocument(document);
        });
    });

    // ========================================================================
    // CONTEXT MAP VALIDATION
    // ========================================================================

    describe('Context Map Validation', () => {
        test('warns when context map has no contexts', async () => {
            const document = await testServices.parse(s`
                ContextMap EmptyMap {}
            `);

            const warnings = getDiagnosticsBySeverity(document, 2);
            expect(warnings.some(w => w.message.includes('contains no bounded contexts'))).toBe(true);
        });

        test('accepts valid context map with relationships (smoke test)', async () => {
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales" }
                BoundedContext BC1 for Sales { description: "BC1" }
                BoundedContext BC2 for Sales { description: "BC2" }

                ContextMap TestMap {
                    contains BC1, BC2
                    [OHS] BC1 -> [CF] BC2 : CustomerSupplier
                }
            `);

            expectValidDocument(document);
        });
    });

    // ========================================================================
    // DOMAIN MAP VALIDATION
    // ========================================================================

    describe('Domain Map Validation', () => {
        test('warns when domain map has no domains', async () => {
            const document = await testServices.parse(s`
                DomainMap EmptyMap {}
            `);

            const warnings = getDiagnosticsBySeverity(document, 2);
            expect(warnings.some(w => w.message.includes('contains no domains'))).toBe(true);
        });
    });
});

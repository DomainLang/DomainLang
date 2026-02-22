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
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain A in B {}
                Domain B in Cx {}
                Domain Cx in A {}
            `);

            // Assert
            expectValidationErrors(document, [
                'Circular domain hierarchy detected',
                'Circular domain hierarchy detected',
                'Circular domain hierarchy detected'
            ]);
        });

        test('should detect self-referencing domain', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain SelfRef in SelfRef {}
            `);

            // Assert
            expectValidationErrors(document, [
                'Circular domain hierarchy detected'
            ]);
        });

        test('accepts valid domain hierarchy without warnings or errors', async () => {
            // Arrange & Act
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

            // Assert
            expectValidDocument(document);
        });

        test('warns on multiple domains each missing vision', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain A { description: "A" }
                Domain B { description: "B" }
            `);

            // Assert
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
            // Arrange & Act
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

            // Assert
            expectValidDocument(document);
        });
    });

    // ========================================================================
    // NAMESPACE DECLARATION VALIDATION
    // ========================================================================

    describe('Namespace Declaration Validation', () => {
        test('should detect duplicate Namespace names', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Namespace TestNamespace {
                    Domain Domain1 {}
                }

                Namespace TestNamespace {
                    Domain Domain2 {}
                }
            `);

            // Assert
            expectValidationErrors(document, [
                "Duplicate element"
            ]);
        });

        test('accepts unique Namespace names (smoke test)', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Namespace Namespace1 {
                    Domain Domain1 { vision: "Vision1" }
                }

                Namespace Namespace2 {
                    Domain Domain2 { vision: "Vision2" }
                }
            `);

            // Assert
            expectValidDocument(document);
        });
    });

    // ========================================================================
    // CLASSIFICATION VALIDATION
    // ========================================================================

    describe('Classification Validation', () => {
        test('should detect duplicate classification names', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Classification Core
                Classification Core
            `);

            // Assert
            expectValidationErrors(document, [
                "Duplicate element"
            ]);
        });

        test('accepts unique classification names (smoke test)', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Classification Core
                Classification Supporting
                Classification Generic
            `);

            // Assert
            expectValidDocument(document);
        });
    });

    // ========================================================================
    // TEAM VALIDATION
    // ========================================================================

    describe('Team Validation', () => {
        test('should detect duplicate Team names', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Team SalesTeam
                Team SalesTeam
            `);

            // Assert
            expectValidationErrors(document, [
                "Duplicate element"
            ]);
        });

        test('accepts unique Team names (smoke test)', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Team SalesTeam
                Team EngineeringTeam
            `);

            // Assert
            expectValidDocument(document);
        });
    });

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

        test('accepts valid context map with relationships (smoke test)', async () => {
            // Arrange & Act
            const document = await testServices.parse(s`
                Domain Sales { vision: "Sales" }
                BoundedContext BC1 for Sales { description: "BC1" }
                BoundedContext BC2 for Sales { description: "BC2" }

                ContextMap TestMap {
                    contains BC1, BC2
                    BC1 [OHS] -> [CF] BC2
                }
            `);

            // Assert
            expectValidDocument(document);
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

import { beforeAll, describe, expect, test } from 'vitest';
import { setupTestSuite, expectParsedDocument, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: ReturnType<typeof setupTestSuite>;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('FR-2.3: Inline/Block Conflict Validation', () => {
    // ========================================================================
    // Conflict Detection: inline form vs block form (parameter-driven)
    // ========================================================================

    test.each([
        {
            scenario: 'Team conflict (inline by vs block team)',
            input: s`
                Domain Sales {}
                Classification Core
                Team SalesTeam
                Team PlatformTeam

                BoundedContext Billing for Sales as Core by SalesTeam {
                    team: PlatformTeam
                }
            `,
            conflictType: 'Team specified both inline',
            inlineValue: 'SalesTeam',
            blockValue: 'PlatformTeam'
        },
        {
            scenario: 'Classification conflict (inline as vs block classification)',
            input: s`
                Domain Sales {}
                Classification Core
                Classification Supporting

                BoundedContext Shipping for Sales as Core {
                    classification: Supporting
                }
            `,
            conflictType: 'Classification specified both inline',
            inlineValue: 'Core',
            blockValue: 'Supporting'
        }
    ])('should detect conflict: $scenario', async ({ input, conflictType, inlineValue, blockValue }) => {
        // Arrange & Act
        const doc = await testServices.parse(input);

        // Assert
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        const conflictWarning = warnings.find(w => w.message.includes(conflictType));
        expect(conflictWarning).not.toBeUndefined();
        expect(conflictWarning!.message).toContain(inlineValue);
        expect(conflictWarning!.message).toContain(blockValue);
        expect(conflictWarning!.message).toContain('precedence');
    });

    test('should detect multiple conflicts simultaneously (classification and team)', async () => {
        // Arrange & Act
        const doc = await testServices.parse(s`
            Domain Sales {}
            Classification Core
            Classification Supporting
            Team SalesTeam
            Team PlatformTeam

            BoundedContext Payments for Sales as Core by SalesTeam {
                classification: Supporting
                team: PlatformTeam
            }
        `);

        // Assert
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Classification specified both inline'))).toBe(true);
        expect(warnings.some(w => w.message.includes('Team specified both inline'))).toBe(true);
    });

    // ========================================================================
    // No-Conflict Cases: single form only (parameter-driven)
    // ========================================================================

    test.each([
        {
            scenario: 'only inline form used (as + by)',
            input: s`
                Domain Sales {}
                Classification Core
                Team SalesTeam

                BoundedContext Shipping for Sales as Core by SalesTeam {
                    description: "Handles shipping operations"
                }
            `
        },
        {
            scenario: 'only block form used (classification + team in block)',
            input: s`
                Domain Sales {}
                Classification Core
                Team SalesTeam

                BoundedContext Inventory for Sales {
                    description: "Handles inventory operations"
                    classification: Core
                    team: SalesTeam
                }
            `
        }
    ])('should not produce conflict warning when $scenario', async ({ input }) => {
        // Arrange & Act
        const doc = await testServices.parse(input);

        // Assert
        expectParsedDocument(doc);
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        const conflictWarnings = warnings.filter(w =>
            w.message.includes('specified both inline')
        );
        expect(conflictWarnings).toHaveLength(0);
    });
});
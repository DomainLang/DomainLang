import { beforeAll, describe, expect, test } from 'vitest';
import { setupTestSuite, expectValidDocument, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: ReturnType<typeof setupTestSuite>;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('FR-2.3: Inline/Block Conflict Validation', () => {
    // 'Inline as conflicts' subsumed by 'Conflict message includes inline and block values' + 'Multiple conflicts simultaneously'

    test('Inline "by" conflicts with block "team"', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {}
            Classification Core
            Team SalesTeam
            Team PlatformTeam

            BoundedContext Billing for Sales as Core by SalesTeam {
                team: PlatformTeam
            }
        `);
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Team specified both inline'))).toBe(true);
    });

    test('Multiple conflicts simultaneously (classification and team)', async () => {
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
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        expect(warnings.some(w => w.message.includes('Classification specified both inline'))).toBe(true);
        expect(warnings.some(w => w.message.includes('Team specified both inline'))).toBe(true);
    });

    test('No conflict when only inline form used', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {}
            Classification Core
            Team SalesTeam

            BoundedContext Shipping for Sales as Core by SalesTeam {
                description: "Handles shipping operations"
            }
        `);
        expectValidDocument(doc);
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        const conflictWarnings = warnings.filter(w =>
            w.message.includes('specified both inline')
        );
        expect(conflictWarnings).toHaveLength(0);
    });

    test('No conflict when only block form used', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {}
            Classification Core
            Team SalesTeam

            BoundedContext Inventory for Sales {
                description: "Handles inventory operations"
                classification: Core
                team: SalesTeam
            }
        `);
        expectValidDocument(doc);
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        const conflictWarnings = warnings.filter(w =>
            w.message.includes('specified both inline')
        );
        expect(conflictWarnings).toHaveLength(0);
    });

    test('Conflict message includes inline and block values', async () => {
        const doc = await testServices.parse(s`
            Domain Sales {}
            Classification Core
            Classification Supporting

            BoundedContext Shipping for Sales as Core {
                classification: Supporting
            }
        `);
        const warnings = doc.diagnostics?.filter(d => d.severity === 2) ?? [];
        const classificationWarning = warnings.find(w =>
            w.message.includes('Classification specified both inline')
        );
        expect(classificationWarning).not.toBeUndefined();
        expect(classificationWarning!.message).toContain('Core');
        expect(classificationWarning!.message).toContain('Supporting');
        expect(classificationWarning!.message).toContain('precedence');
    });
});

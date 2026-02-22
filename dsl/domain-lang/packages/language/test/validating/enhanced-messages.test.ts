/**
 * Test to verify enhanced error messages are working.
 *
 * Each test verifies:
 * 1. The correct diagnostic is produced for invalid input
 * 2. The message contains expected content
 * 3. A clickable documentation link is provided via codeDescription
 */

import { describe, test, beforeAll, expect } from 'vitest';
import type { TestServices } from '../test-helpers.js';
import { setupTestSuite, s } from '../test-helpers.js';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Test file: Non-null assertions are safe as we verify structure exists before accessing

let testServices: TestServices;

beforeAll(() => {
    testServices = setupTestSuite();
});

describe('Enhanced Error Messages', () => {
    const contextMapPreamble = (body: string): string => s`
        Domain Sales {}
        bc Context1 for Sales
        bc Context2 for Sales

        ContextMap TestMap {
            contains Context1, Context2
            ${body}
        }
    `;

    test.each([
        {
            label: 'domain missing vision',
            input: s`Domain Sales {}`,
            diagnosticMatch: 'vision',
            messageContains: 'missing a vision statement',
            hrefContains: 'language.md',
        },
        {
            label: 'BC missing description',
            input: s`Domain Sales {}\nbc OrderContext for Sales {}`,
            diagnosticMatch: 'description',
            messageContains: 'missing a description',
            hrefContains: 'language.md',
        },
        {
            label: 'BC missing domain',
            input: s`bc OrderContext`,
            diagnosticMatch: 'belong to a domain',
            messageContains: 'must belong to a domain',
            hrefContains: 'language.md',
        },
    ])('$label shows concise message with clickable link', async ({ input, diagnosticMatch, messageContains, hrefContains }) => {
        // Arrange & Act
        const document = await testServices.parse(input);

        // Assert
        const diagnostics = document.diagnostics ?? [];
        const warning = diagnostics.find(d => d.message.includes(diagnosticMatch));
        expect(warning).not.toBeUndefined();
        expect(warning!.message).toContain(messageContains);
        expect(warning!.codeDescription?.href).toContain(hrefContains);
    });

    test.each([
        {
            label: 'ACL on wrong side',
            body: 'Context1 [ACL] -> Context2',
            diagnosticMatch: 'Anti-Corruption Layer',
            messageContains: 'downstream',
        },
        {
            label: 'Conformist on wrong side',
            body: 'Context1 [CF] -> Context2',
            diagnosticMatch: 'Conformist',
            messageContains: 'downstream',
        },
        {
            label: 'OHS on wrong side',
            body: 'Context1 -> [OHS] Context2',
            diagnosticMatch: 'Open Host Service',
            messageContains: 'upstream',
        },
        {
            label: 'Supplier on wrong side',
            body: 'Context1 -> [S] Context2',
            diagnosticMatch: 'Supplier',
            messageContains: 'upstream side',
        },
        {
            label: 'Customer on wrong side',
            body: 'Context1 [C] -> Context2',
            diagnosticMatch: 'Customer',
            messageContains: 'downstream side',
        },
        {
            label: 'self symmetric relationship',
            body: 'Context1 [SK] Context1',
            diagnosticMatch: 'Symmetric relationship with self',
            messageContains: 'likely unintended',
        },
        {
            label: 'too many patterns',
            body: 'Context1 [OHS, PL, ACL, CF] -> Context2',
            diagnosticMatch: 'Too many',
            messageContains: '1-2 patterns',
        },
    ])('$label shows concise message with clickable link', async ({ body, diagnosticMatch, messageContains }) => {
        // Arrange & Act
        const document = await testServices.parse(contextMapPreamble(body));

        // Assert
        const diagnostics = document.diagnostics ?? [];
        const warning = diagnostics.find(d => d.message.includes(diagnosticMatch));
        expect(warning).not.toBeUndefined();
        expect(warning!.message).toContain(messageContains);
        expect(warning!.codeDescription?.href).toContain('integration-patterns');
    });
});

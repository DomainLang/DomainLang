/**
 * Regression tests for dot-segmented completion LSP field correctness.
 *
 * The completion items produced by our provider must set the correct LSP
 * fields (filterText, textEdit) for VS Code's client-side filtering to work.
 *
 * **Root cause:** VS Code uses `filterText` (falling back to `label`) to
 * filter items client-side even when `isIncomplete: true`. Without the
 * correct `filterText`, typing `Core.B` can't match an item with
 * `label: 'BaunWalls'` — VS Code silently filters it out.
 *
 * @see https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { CompletionItem, CompletionList, TextEdit } from 'vscode-languageserver';
import { URI } from 'langium';
import { createDomainLangServices } from '../../src/domain-lang-module.js';
import { NodeFileSystem } from 'langium/node';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

/**
 * Helper: get completions at a specific string offset within a built document.
 */
async function getCompletionsAtOffset(
    services: ReturnType<typeof createDomainLangServices>,
    doc: Awaited<ReturnType<ReturnType<typeof createDomainLangServices>['shared']['workspace']['LangiumDocuments']['getOrCreateDocument']>>,
    offset: number
): Promise<CompletionList | undefined> {
    const position = doc.textDocument.positionAt(offset);
    return services.DomainLang.lsp.CompletionProvider?.getCompletion(
        doc,
        { position, textDocument: { uri: doc.uri.toString() } }
    );
}

/** Find a specific completion item by label. */
function findItem(completions: CompletionList | undefined, label: string): CompletionItem | undefined {
    return completions?.items?.find((item: CompletionItem) => item.label === label);
}

/** Extract labels from a CompletionList. */
function labelsOf(completions: CompletionList | undefined): string[] {
    return completions?.items?.map((item: CompletionItem) => item.label) ?? [];
}

/**
 * Simulate VS Code's client-side filtering.
 *
 * VS Code extracts the text in the textEdit's range from the document,
 * then fuzzy-matches it against filterText (or label if filterText is not set).
 * This simulates that behavior for testing.
 */
function simulateVscodeFilter(
    completions: CompletionList | undefined,
    documentText: string
): CompletionItem[] {
    if (!completions?.items) return [];

    return completions.items.filter((item: CompletionItem) => {
        const textEdit = item.textEdit as TextEdit | undefined;
        if (!textEdit?.range) return true; // No textEdit → no filtering

        // Extract the typed text from the document using the textEdit range
        // (VS Code does this to determine what the user has typed so far)
        const startOffset = lineColToOffset(documentText, textEdit.range.start.line, textEdit.range.start.character);
        const endOffset = lineColToOffset(documentText, textEdit.range.end.line, textEdit.range.end.character);
        const typedText = documentText.substring(startOffset, endOffset);

        // VS Code filters using filterText, falling back to label
        const matchTarget = item.filterText ?? item.label;

        // Simple prefix match (VS Code uses fuzzy matching, but prefix is the minimum)
        return matchTarget.toLowerCase().startsWith(typedText.toLowerCase());
    });
}

/** Convert line/character position to document offset. */
function lineColToOffset(text: string, line: number, character: number): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < line && i < lines.length; i++) {
        offset += lines[i].length + 1; // +1 for newline
    }
    return offset + character;
}

describe('Dot-segmented completion LSP field correctness', () => {
    let tempDir: string;
    let services: ReturnType<typeof createDomainLangServices>;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-lsp-fields-'));
        services = createDomainLangServices(NodeFileSystem);
    });

    afterAll(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    /**
     * Helper: write files, build documents, return the main document.
     */
    async function buildProject(
        files: Record<string, string>,
        mainFileName: string
    ): ReturnType<ReturnType<typeof createDomainLangServices>['shared']['workspace']['LangiumDocuments']['getOrCreateDocument']> {
        const docs = [];
        let mainDoc: Awaited<ReturnType<ReturnType<typeof createDomainLangServices>['shared']['workspace']['LangiumDocuments']['getOrCreateDocument']>> | undefined;

        for (const [name, content] of Object.entries(files)) {
            const filePath = path.join(tempDir, name);
            await fs.writeFile(filePath, content);
            const uri = URI.file(filePath);
            const doc = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(uri);
            docs.push(doc);
            if (name === mainFileName) mainDoc = doc;
        }

        await services.shared.workspace.DocumentBuilder.build(docs, { validation: true });
        if (!mainDoc) throw new Error(`Main file '${mainFileName}' not found in project files`);
        return mainDoc;
    }

    describe('filterText enables VS Code client-side matching', () => {
        test('segmented items have filterText matching the full dotted prefix', async () => {
            // Arrange
            const mainDoc = await buildProject({
                'ft-types.dlang':
`Namespace BaunWalls {
    Classification Jannie
    Classification Anna
}

Namespace Lars {
    Classification Something
}`,
                'ft-main.dlang':
`import "./ft-types.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core. {
    description: "Sales management"
}`
            }, 'ft-main.dlang');

            // Act: completions at "Core." (right after the dot)
            const text = mainDoc.textDocument.getText();
            const offset = text.indexOf('Core.') + 'Core.'.length;
            const completions = await getCompletionsAtOffset(services, mainDoc, offset);
            const baunwallsItem = findItem(completions, 'BaunWalls');
            const larsItem = findItem(completions, 'Lars');

            // Assert: filterText must include the dotted prefix for VS Code matching
            expect(baunwallsItem?.label, 'BaunWalls item should exist').toBe('BaunWalls');
            expect(larsItem?.label, 'Lars item should exist').toBe('Lars');
            expect(baunwallsItem?.filterText).toBe('Core.BaunWalls');
            expect(larsItem?.filterText).toBe('Core.Lars');
        });

        test('partial typing: filterText allows VS Code to match "Core.B" against "Core.BaunWalls"', async () => {
            // Arrange
            const mainDoc = await buildProject({
                'ft-types2.dlang':
`Namespace BaunWalls {
    Classification Jannie
}

Namespace Lars {
    Classification Something
}`,
                'ft-main2.dlang':
`import "./ft-types2.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core.B {
    description: "Sales management"
}`
            }, 'ft-main2.dlang');

            // Act: completions at "Core.B" (after the B)
            const text = mainDoc.textDocument.getText();
            const offset = text.indexOf('Core.B') + 'Core.B'.length;
            const completions = await getCompletionsAtOffset(services, mainDoc, offset);

            // Assert: VS Code simulation must show BaunWalls
            const visibleItems = simulateVscodeFilter(completions, text);
            const visibleLabels = visibleItems.map(i => i.label);
            expect(visibleLabels).toContain('BaunWalls');
            expect(visibleLabels).not.toContain('Lars'); // "Core.B" doesn't match "Core.Lars"
        });

        test('deeper segment: filterText includes full prefix path', async () => {
            // Arrange
            const mainDoc = await buildProject({
                'ft-types3.dlang':
`Namespace BaunWalls {
    Classification Jannie
    Classification Anna
}`,
                'ft-main3.dlang':
`import "./ft-types3.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core.BaunWalls.J {
    description: "Sales management"
}`
            }, 'ft-main3.dlang');

            // Act
            const text = mainDoc.textDocument.getText();
            const offset = text.indexOf('Core.BaunWalls.J') + 'Core.BaunWalls.J'.length;
            const completions = await getCompletionsAtOffset(services, mainDoc, offset);
            const jannieItem = findItem(completions, 'Jannie');

            // Assert: filterText must be the full dotted path
            expect(jannieItem?.label, 'Jannie item should exist').toBe('Jannie');
            expect(jannieItem?.filterText).toBe('Core.BaunWalls.Jannie');
        });
    });

    describe('textEdit replaces full dotted range', () => {
        test('textEdit replaces from start of dotted path to cursor', async () => {
            // Arrange
            const mainDoc = await buildProject({
                'te-types.dlang':
`Namespace BaunWalls {
    Classification Jannie
}`,
                'te-main.dlang':
`import "./te-types.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core.B {
    description: "Sales management"
}`
            }, 'te-main.dlang');

            // Act
            const text = mainDoc.textDocument.getText();
            const coreStart = text.indexOf('Core.B');
            const cursorOffset = coreStart + 'Core.B'.length;
            const completions = await getCompletionsAtOffset(services, mainDoc, cursorOffset);
            const baunwallsItem = findItem(completions, 'BaunWalls');

            // Assert: textEdit must replace the entire "Core.B" range with "Core.BaunWalls"
            expect(baunwallsItem?.label, 'BaunWalls item should exist').toBe('BaunWalls');
            const textEdit = baunwallsItem?.textEdit as TextEdit;
            expect(textEdit.newText).toBe('Core.BaunWalls');
            expect(textEdit.newText).toBe('Core.BaunWalls');

            // Range start should be at "Core" (start of dotted path)
            const rangeStartOffset = lineColToOffset(text, textEdit.range.start.line, textEdit.range.start.character);
            expect(rangeStartOffset).toBe(coreStart);

            // Range end should be at cursor position
            const rangeEndOffset = lineColToOffset(text, textEdit.range.end.line, textEdit.range.end.character);
            expect(rangeEndOffset).toBe(cursorOffset);
        });
    });

    describe('VS Code filtering simulation', () => {
        test('simulated VS Code filter shows correct items for "Core."', async () => {
            // Arrange
            const mainDoc = await buildProject({
                'sim-types.dlang':
`Namespace BaunWalls {
    Classification Jannie
}

Namespace Lars {
    Classification Something
}`,
                'sim-main.dlang':
`import "./sim-types.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core. {
    description: "Sales management"
}`
            }, 'sim-main.dlang');

            // Act
            const text = mainDoc.textDocument.getText();
            const offset = text.indexOf('Core.') + 'Core.'.length;
            const completions = await getCompletionsAtOffset(services, mainDoc, offset);
            const visibleItems = simulateVscodeFilter(completions, text);

            // Assert: both segments visible when only prefix is "Core."
            const visibleLabels = visibleItems.map(i => i.label);
            expect(visibleLabels).toContain('BaunWalls');
            expect(visibleLabels).toContain('Lars');
        });

        test('simulated VS Code filter shows NO full FQN items', async () => {
            // Arrange
            const mainDoc = await buildProject({
                'sim-types2.dlang':
`Namespace BaunWalls {
    Classification Jannie
}`,
                'sim-main2.dlang':
`import "./sim-types2.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core. {
    description: "Sales management"
}`
            }, 'sim-main2.dlang');

            // Act
            const text = mainDoc.textDocument.getText();
            const offset = text.indexOf('Core.') + 'Core.'.length;
            const completions = await getCompletionsAtOffset(services, mainDoc, offset);
            const labels = labelsOf(completions);

            // Assert: NO item should have a dotted label
            const dottedLabels = labels.filter(l => l.includes('.'));
            expect(dottedLabels, `Found dotted labels: ${dottedLabels.join(', ')}`).toHaveLength(0);
        });
    });
});

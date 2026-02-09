/**
 * Cross-File Completions with Import Aliases
 *
 * Tests real user scenarios for dot-segmented completion:
 * 1. Define classifications in one file
 * 2. Import that file with an alias
 * 3. Get completions for the aliased types via dot-navigation
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { CompletionItem, CompletionList } from 'vscode-languageserver';
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

/** Extract labels from a CompletionList. */
function labelsOf(completions: CompletionList | undefined): string[] {
    return completions?.items?.map((item: CompletionItem) => item.label) ?? [];
}

describe('Import Alias Completions', () => {
    let tempDir: string;
    let services: ReturnType<typeof createDomainLangServices>;

    beforeAll(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dlang-real-test-'));
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

    test('completions work for aliased imports with simple names', async () => {
        // Arrange
        const mainDoc = await buildProject({
            'classifications.dlang':
`Classification CoreDomain
Classification SupportingDomain
Classification GenericSubdomain`,
            'main.dlang':
`import "./classifications.dlang" as Core

Domain Enterprise {
    vision: "Enterprise business operations"
}

bc Sales for Enterprise as Core`
        }, 'main.dlang');

        // Act: completions right after "as Core" in the BC line
        const text = mainDoc.textDocument.getText();
        const bcLineStart = text.indexOf('bc Sales');
        const offset = text.indexOf('as Core', bcLineStart) + 'as Core'.length;
        const labels = labelsOf(await getCompletionsAtOffset(services, mainDoc, offset));

        // Assert
        expect(labels.length).toBeGreaterThan(0);
        expect(labels).toContain('Core.CoreDomain');
        expect(labels).toContain('Core.SupportingDomain');
    });

    // ----- REGRESSION: bugs from real editor usage -----

    test('dot-prefix shows only next segments, not full FQNs (mid-line)', async () => {
        // Arrange: Complete BC with body — matches real editor state
        const mainDoc = await buildProject({
            'r-types.dlang':
`Namespace BaunWalls {
    Classification Jannie
    Classification Anna
}

Namespace Lars {
    Classification Something
}`,
            'r-main1.dlang':
`import "./r-types.dlang" as Core

dom Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core. {
    description: "Sales management"
}`
        }, 'r-main1.dlang');

        // Act: cursor right after "Core." (before the space and `{`)
        const text = mainDoc.textDocument.getText();
        const offset = text.indexOf('Core.') + 'Core.'.length;
        const labels = labelsOf(await getCompletionsAtOffset(services, mainDoc, offset));

        // Assert: must show ONLY next segments, never full paths
        expect(labels).toContain('BaunWalls');
        expect(labels).toContain('Lars');
        expect(labels).not.toContain('Core.BaunWalls.Jannie');
        expect(labels).not.toContain('Core.BaunWalls.Anna');
        expect(labels).not.toContain('Core.Lars.Something');
    });

    test('partial dot-segment filters correctly (mid-line)', async () => {
        // Arrange: typing "Core.L" with a complete BC after it
        const mainDoc = await buildProject({
            'r-types2.dlang':
`Namespace BaunWalls {
    Classification Jannie
}

Namespace Lars {
    Classification Something
}`,
            'r-main2.dlang':
`import "./r-types2.dlang" as Core

dom Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core.L {
    description: "Sales management"
}`
        }, 'r-main2.dlang');

        // Act: cursor right after "Core.L"
        const text = mainDoc.textDocument.getText();
        const offset = text.indexOf('Core.L') + 'Core.L'.length;
        const labels = labelsOf(await getCompletionsAtOffset(services, mainDoc, offset));

        // Assert: only "Lars" matches the partial "L"
        expect(labels).toContain('Lars');
        expect(labels).not.toContain('BaunWalls');
        expect(labels).not.toContain('Core.Lars.Something');
    });

    test('cursor re-entry: completions work when cursor returns to dotted position', async () => {
        // Arrange: simulate user navigating away and back
        const mainDoc = await buildProject({
            'r-types3.dlang':
`Namespace BaunWalls {
    Classification Jannie
}`,
            'r-main3.dlang':
`import "./r-types3.dlang" as Core

dom Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core. {
    description: "Sales management"
}`
        }, 'r-main3.dlang');

        const text = mainDoc.textDocument.getText();
        const dotOffset = text.indexOf('Core.') + 'Core.'.length;

        // Act 1: first completion request at "Core."
        const labels1 = labelsOf(await getCompletionsAtOffset(services, mainDoc, dotOffset));

        // Act 2: request completions somewhere else (beginning of file)
        await getCompletionsAtOffset(services, mainDoc, 0);

        // Act 3: come back to "Core." — should still work
        const labels2 = labelsOf(await getCompletionsAtOffset(services, mainDoc, dotOffset));

        // Assert: both requests return the same segments
        expect(labels1).toContain('BaunWalls');
        expect(labels2).toContain('BaunWalls');
    });

    // ----- Original tests with incomplete syntax (cursor at end of file) -----

    test('completions work with namespace segmentation (end of file)', async () => {
        // Arrange
        const mainDoc = await buildProject({
            'types.dlang':
`Namespace BaunWalls {
    Classification Jannie
    Classification Anna
}

Namespace Lars {
    Classification Something
}`,
            'main2.dlang':
`import "./types.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core.Ba`
        }, 'main2.dlang');

        // Act
        const text = mainDoc.textDocument.getText();
        const offset = text.indexOf('Core.Ba') + 7;
        const labels = labelsOf(await getCompletionsAtOffset(services, mainDoc, offset));

        // Assert
        expect(labels).toContain('BaunWalls');
        expect(labels).not.toContain('Core.BaunWalls.Jannie');
    });

    test('completions work deeper in namespace hierarchy', async () => {
        // Arrange
        const mainDoc = await buildProject({
            'types2.dlang':
`Namespace BaunWalls {
    Classification Jannie
    Classification Anna
}`,
            'main3.dlang':
`import "./types2.dlang" as Core

Domain Enterprise {
    vision: "Enterprise"
}

bc Sales for Enterprise as Core.BaunWalls.Ja`
        }, 'main3.dlang');

        // Act
        const text = mainDoc.textDocument.getText();
        const offset = text.indexOf('.Ja') + 3;
        const labels = labelsOf(await getCompletionsAtOffset(services, mainDoc, offset));

        // Assert
        expect(labels).toContain('Jannie');
    });
});

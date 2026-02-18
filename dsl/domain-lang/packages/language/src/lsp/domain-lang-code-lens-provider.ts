import { AstUtils, type LangiumDocument } from 'langium';
import type { CodeLens, CodeLensParams } from 'vscode-languageserver';
import { isContextMap, type ContextMap, type Model } from '../generated/ast.js';

const OPEN_DIAGRAM_COMMAND = 'domainlang.diagram.open';

/**
 * Provides contextual code lenses for context map diagram actions.
 */
export class DomainLangCodeLensProvider {
    async provideCodeLens(document: LangiumDocument, _params: CodeLensParams): Promise<CodeLens[]> {
        try {
            const model = (document as LangiumDocument<Model>).parseResult?.value;
            if (!model) {
                return [];
            }

            const contextMaps: ContextMap[] = [];

            if (isContextMap(model)) {
                contextMaps.push(model);
            }

            for (const node of AstUtils.streamAllContents(model)) {
                if (isContextMap(node)) {
                    contextMaps.push(node);
                }
            }

            return contextMaps.flatMap((contextMap) => {
                const range = contextMap.$cstNode?.range;
                if (!range) {
                    return [];
                }

                return [{
                    range: {
                        start: { line: range.start.line, character: 0 },
                        end: { line: range.start.line, character: 0 },
                    },
                    command: {
                        title: 'Open diagram',
                        command: OPEN_DIAGRAM_COMMAND,
                        arguments: [{
                            uri: document.uri.toString(),
                        }],
                    },
                }];
            });
        } catch {
            return [];
        }
    }
}

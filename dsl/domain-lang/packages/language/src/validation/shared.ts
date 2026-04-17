import type { AstNode } from 'langium';
import type { Container } from '../generated/ast.js';
import { isContainer } from '../generated/ast.js';
import { QualifiedNameProvider } from '../services/naming.js';

const fqnProvider = new QualifiedNameProvider();

export function* extractNames(element: Container): Generator<{fqn: string, node: AstNode}> {
    for (const child of element.children) {
        yield {fqn: fqnProvider.getQualifiedName(child.$container, child.name), node: child};
        if (isContainer(child)) {
            yield* extractNames(child);
        }
    }
} 
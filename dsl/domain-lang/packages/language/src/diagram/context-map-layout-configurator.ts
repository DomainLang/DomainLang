import type { LayoutOptions } from 'elkjs/lib/elk-api.js';
import { DefaultLayoutConfigurator } from 'sprotty-elk/lib/elk-layout.js';
import type { SGraph, SNode, SModelIndex, SEdge } from 'sprotty-protocol';

/**
 * ELK layout configurator for DomainLang context map diagrams.
 *
 * Uses the `layered` algorithm with **DOWN** direction (top-to-bottom) so
 * upstream contexts appear above downstream contexts, matching the conventional
 * DDD Context Map layout direction.
 */
export class ContextMapLayoutConfigurator extends DefaultLayoutConfigurator {
    protected override graphOptions(_graph: SGraph, _index: SModelIndex): LayoutOptions {
        return {
            'elk.algorithm': 'layered',
            'elk.direction': 'DOWN',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.spacing.nodeNode': '100',
            'elk.layered.spacing.nodeNodeBetweenLayers': '140',
            'elk.spacing.edgeNode': '60',
            'elk.spacing.edgeEdge': '40',
            // Edge routing mode is irrelevant — the webview SmoothBezierEdgeView
            // ignores ELK routing points and computes dynamic bezier curves
            // anchored directly to node ellipses with obstacle avoidance.
            'elk.edgeRouting': 'POLYLINE',
            'elk.layered.mergeEdges': 'false',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.layered.thoroughness': '7',
        };
    }

    protected override nodeOptions(_node: SNode, _index: SModelIndex): LayoutOptions {
        return {
            'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        };
    }

    protected override edgeOptions(_edge: SEdge, _index: SModelIndex): LayoutOptions {
        return {
            'elk.layered.priority.direction': '1',
        };
    }
}
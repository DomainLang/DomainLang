import 'sprotty/css/sprotty.css';
import './css/diagram.css';

import { Container, ContainerModule } from 'inversify';
import {
    configureModelElement,
    loadDefaultModules,
    overrideViewerOptions,
    SCompartmentImpl,
    SCompartmentView,
    SEdgeImpl,
    SGraphImpl,
    SGraphView,
    SLabelImpl,
    SRoutingHandleImpl,
    SRoutingHandleView,
} from 'sprotty';
import { CenteredLabelView, EdgeLabelView, EllipseNodeImpl, EggNodeView, BBoMNodeImpl, BBoMNodeView, SmoothBezierEdgeView, UDBadgeLabelView } from './views.js';

export function createDiagramContainer(widgetId: string): Container {
    const container = new Container();
    loadDefaultModules(container);

    const domainLangDiagramModule = new ContainerModule((bind, unbind, isBound, rebind) => {
        const context = { bind, unbind, isBound, rebind };
        configureModelElement(context, 'graph', SGraphImpl, SGraphView);
        configureModelElement(context, 'node', EllipseNodeImpl, EggNodeView);
        configureModelElement(context, 'node:bbom', BBoMNodeImpl, BBoMNodeView);
        configureModelElement(context, 'edge', SEdgeImpl, SmoothBezierEdgeView);
        configureModelElement(context, 'label', SLabelImpl, CenteredLabelView);
        configureModelElement(context, 'label:edge', SLabelImpl, EdgeLabelView);
        configureModelElement(context, 'label:ud-badge', SLabelImpl, UDBadgeLabelView);
        configureModelElement(context, 'comp', SCompartmentImpl, SCompartmentView);
        configureModelElement(context, 'routing-point', SRoutingHandleImpl, SRoutingHandleView);
        configureModelElement(context, 'volatile-routing-point', SRoutingHandleImpl, SRoutingHandleView);
    });

    container.load(domainLangDiagramModule);

    overrideViewerOptions(container, {
        needsClientLayout: true,
        needsServerLayout: true,
        baseDiv: widgetId,
        hiddenDiv: widgetId + '_hidden',
    });

    return container;
}

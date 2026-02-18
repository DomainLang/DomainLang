/**
 * ELK layout engine factory for DomainLang diagrams.
 *
 * Encapsulates the ELK construction, factory wiring, and Sprotty-ELK layout
 * engine instantiation so that both the VS Code extension (via the LSP server
 * DI module) and the CLI (for standalone diagram export) can reuse the same
 * layout logic without embedding the setup inline.
 *
 * @module diagram/elk-layout-factory
 */
import * as ElkBundled from 'elkjs/lib/elk.bundled.js';
import type { ELK } from 'elkjs/lib/elk-api.js';
import {
    DefaultElementFilter,
    ElkLayoutEngine,
    type ElkFactory,
    type IElementFilter,
    type ILayoutConfigurator,
} from 'sprotty-elk/lib/elk-layout.js';
import type { IModelLayoutEngine } from 'sprotty-protocol';
import { ContextMapLayoutConfigurator } from './context-map-layout-configurator.js';

/** @internal Handles the dual ESM/CJS export shape of the bundled ELK module. */
type ElkConstructor = new (args?: { algorithms?: string[] }) => ELK;
const _elkConstructor: ElkConstructor = (
    (ElkBundled as unknown as { default?: ElkConstructor }).default
    ?? (ElkBundled as unknown as ElkConstructor)
);

/**
 * Creates an {@link ElkFactory} that produces a new bundled ELK instance
 * pre-configured for the `layered` algorithm.
 *
 * Use this in Langium's DI module (`layout.ElkFactory`) or directly in the
 * CLI when running the layout engine standalone.
 */
export function createElkFactory(): ElkFactory {
    return () => new _elkConstructor({ algorithms: ['layered'] });
}

/**
 * Creates the full set of objects required to run the ELK layout engine for
 * DomainLang context-map diagrams.
 *
 * Returns the three collaborators that together constitute a complete
 * `IModelLayoutEngine`:
 * - `elkFactory` — produces the ELK worker instance
 * - `elementFilter` — controls which model elements are laid out
 * - `layoutConfigurator` — supplies algorithm-specific ELK options
 *
 * Callers that use Langium DI should register these individually via the
 * `layout` service group.  Callers that operate outside of DI (e.g. the CLI)
 * can call {@link createElkLayoutEngine} for a fully assembled engine.
 */
export function createElkLayoutComponents(): {
    elkFactory: ElkFactory;
    elementFilter: IElementFilter;
    layoutConfigurator: ILayoutConfigurator;
} {
    return {
        elkFactory: createElkFactory(),
        elementFilter: new DefaultElementFilter(),
        layoutConfigurator: new ContextMapLayoutConfigurator(),
    };
}

/**
 * Creates a fully assembled {@link IModelLayoutEngine} for DomainLang
 * context-map diagrams using the bundled ELK engine.
 *
 * Intended for use outside of Langium's DI container — for example, in the
 * CLI when generating standalone SVG or image exports.
 *
 * @example
 * ```typescript
 * const layoutEngine = createElkLayoutEngine();
 * const laidOutModel = await layoutEngine.layout(rootModel);
 * ```
 */
export function createElkLayoutEngine(): IModelLayoutEngine {
    const { elkFactory, elementFilter, layoutConfigurator } = createElkLayoutComponents();
    return new ElkLayoutEngine(elkFactory, elementFilter, layoutConfigurator) as IModelLayoutEngine;
}

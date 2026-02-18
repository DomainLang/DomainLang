# PRS-018: Diagram generation and visualization

**Status**: Draft  
**Priority**: High  
**Target version**: 0.13.0 (phase 1), 0.14.0 (phase 2)  
**Effort estimate**: 6–10 weeks across phases  
**Dependencies**: PRS-016 (VS Code web extension), PRS-017 (LSP incremental intelligence)

---

## Executive summary

Add first-class diagram generation for DomainLang models with one shared semantic pipeline and two render targets:

- **VS Code extension:** interactive diagrams in a webview.
- **CLI:** deterministic static image export for CI and documentation.

Start with **domain maps** (domains and nested subdomains as circles). Then extend to **context maps** (bounded contexts and relationship patterns like OHS, PL, ACL, CF, SK).

After comparing Sprotty, Graphviz, D2, Mermaid, PlantUML, Cytoscape.js, JointJS, and AntV X6, the recommended path is:

1. **Primary stack:** Sprotty + ELK for interactive VS Code diagrams, with the same semantic model used by the CLI.
2. **Static export in CLI (phase 1):** Graphviz pipeline for deterministic SVG/PNG.
3. **Optional fallback track:** D2 adapter for fast, low-complexity static generation and experimentation.

This provides a high-confidence path for immediate static outputs while preserving a future-proof interactive architecture.

## Problem

DomainLang users can model strategic and contextual structures textually, but cannot generate visual diagrams directly from `.dlang` models in a supported, repeatable workflow.

Current gaps:

1. No official way to produce domain maps from models.
2. No integrated context map visualization in VS Code.
3. No deterministic CLI export command for documentation pipelines.
4. No architecture that supports future interactivity (selection, filtering, drill-down, links).

Without native diagram support, teams rely on manual tools that drift from source models and break model-as-code workflows.

## Goals

| Goal | Measure |
| ---- | ------- |
| Domain map generation from `.dlang` | Given a valid model, generate a correct domain map with nested domain circles |
| VS Code interactivity foundation | Open and interact with domain map diagram in webview with pan/zoom and selection |
| CLI static exports | Generate deterministic SVG and PNG outputs in CI |
| Shared semantic model | VS Code and CLI use one diagram IR (intermediate representation) from DomainLang AST |
| Context map readiness | Architecture supports adding bounded contexts and relationship edges in phase 2 |

## Non-goals

- Round-trip visual editing back to `.dlang` in phase 1
- Full WYSIWYG diagram editor in phase 1
- Animated exports in CLI (future)
- Auto-layout perfection for every graph topology in phase 1
- Additional diagram types beyond domain map and context map

---

## Current state analysis

- DomainLang has mature parsing, linking, validation, and SDK access, but no built-in diagram IR.
- VS Code extension has LSP foundations and web extension direction (PRS-016), suitable for webview-based diagrams.
- CLI has modern command architecture (PRS-011 direction), suitable for adding `diagram` commands.

## User stories

As a DomainLang modeler, I want to generate a domain map from my model, so that I can communicate strategic design with zero manual redraw.

As a DomainLang user in VS Code, I want to inspect a live interactive diagram linked to my model, so that I can understand structure quickly.

As a CI/documentation maintainer, I want deterministic diagram exports from CLI, so that docs are reproducible and reviewable.

---

## Technology evaluation

### Evaluation criteria

- Fit for VS Code interactivity
- Deterministic CLI static export quality
- Support for DDD-specific shapes/labels/relationships
- Performance at 50–500 nodes
- Ecosystem maturity and licensing
- Engineering complexity and maintainability

### Candidate summary

| Technology | VS Code interactivity | CLI static export | DDD customization | Complexity | Verdict |
| ---------- | ---------------------- | ----------------- | ----------------- | ---------- | ------- |
| **Sprotty + ELK** | Excellent | Medium (needs export pipeline) | Excellent | High | **Primary for VS Code** |
| **Graphviz** | Limited | Excellent | Medium | Low–Medium | **Primary for CLI static in phase 1** |
| **D2** | Medium | Excellent | Medium–High | Low–Medium | Fallback / optional adapter |
| Mermaid | Medium | Good | Low | Low | Not suitable for DDD-rich context maps |
| PlantUML | Medium | Good | Low | Low | Not suitable for required semantics |
| Cytoscape.js | High | Medium | Medium | Medium | Viable but weaker CLI story |
| JointJS / AntV X6 | High | Medium | High | Medium–High | Viable but heavier and less aligned |

### Recommendation

Adopt a **dual-renderer architecture** over one shared diagram IR:

1. **Interactive renderer (VS Code):** Sprotty + ELK
2. **Static renderer (CLI):** Graphviz DOT export to SVG/PNG

Add an optional **D2 adapter** behind the same IR for experimentation and alternate output style.

Rationale:

- Sprotty is purpose-built for interactive, customizable, language-tooling diagrams and integrates with VS Code webviews.
- ELK provides strong layout quality and scalable automatic layout.
- Graphviz provides deterministic and battle-tested static outputs for CI.
- Shared IR prevents divergence between VS Code and CLI behavior.

Node-based UI framework evaluation and requirements are extracted to PRS-019.

---

## Proposed architecture

### High-level flow

1. Parse and resolve DomainLang model.
2. Build **diagram IR** (`DiagramModel`) from AST/SDK.
3. Render IR via one of two adapters:
   - `SprottyRenderer` for VS Code webview
   - `DotRenderer` for CLI static exports

### Core modules

- `packages/language/src/diagram/ir/`
  - IR types (`DiagramNode`, `DiagramEdge`, `DiagramCluster`, metadata)
- `packages/language/src/diagram/builders/`
  - `buildDomainMapIR(model)` (phase 1)
  - `buildContextMapIR(model)` (phase 2)
- `packages/extension/src/diagram/`
  - Sprotty webview integration, actions, update channel
- `packages/cli/src/commands/diagram/`
  - `dlang diagram domain-map`
  - `dlang diagram context-map` (phase 2)

### Interactivity baseline (VS Code)

Phase 1 baseline interactivity:

- Pan and zoom
- Node hover and selection
- Click to reveal source location metadata
- Layout refresh command

Future interactivity (not phase 1):

- Filter overlays (team, classification, relationship pattern)
- Drill-down focus modes
- Click-through links to docs or symbols

### CLI baseline

- SVG output required
- PNG output required
- Deterministic output for same input + same options
- Non-zero exit on invalid model or render failure

---

## Requirements

| ID | Requirement | Priority | Rationale |
| -- | ----------- | -------- | --------- |
| R1 | Introduce a diagram IR in language package used by both extension and CLI | Must | Avoid duplicated semantics and drift |
| R2 | Implement domain map IR builder from domains and nested subdomains | Must | Delivers first requested capability |
| R3 | Add VS Code command to open interactive domain map webview | Must | Core UX requirement |
| R4 | Render domain map in VS Code via Sprotty with ELK auto-layout | Must | Best fit for interactive future |
| R5 | Add CLI command `dlang diagram domain-map --format svg` or `--format png` | Must | Static image generation requirement |
| R6 | CLI output is deterministic for same model and options | Must | CI reproducibility |
| R7 | Add context map IR builder (bounded contexts + relationships) | Should | Phase 2 roadmap requirement |
| R8 | Add context map rendering in VS Code and CLI with relationship labels/patterns | Should | Future diagram target |
| R9 | Include style configuration surface (theme tokens, spacing, labels) without hardcoded new design system primitives | Should | Maintainability and UX consistency |
| R10 | Document usage in site and CLI guide with examples | Must | Discoverability and adoption |
| R11 | Add tests for IR building and renderer contract behavior | Must | Reliability and regression safety |
| R12 | Ensure rendering performance remains usable at 50–500 nodes | Should | Practical scalability |

## Non-functional requirements

- **Performance:** Domain map render in VS Code under 2 seconds for 200 nodes on baseline developer machine.
- **Determinism:** CLI SVG output stable across repeated runs in same environment.
- **Compatibility:** VS Code desktop and web extension modes supported where diagram webview is available.
- **Reliability:** Graceful errors for invalid models and unsupported constructs.
- **Maintainability:** Renderer adapters separated from IR and builder logic.

---

## Phased delivery

### Phase 1 (MVP): Domain map

Scope:

- Diagram IR foundation
- Domain map builder
- VS Code interactive domain map (Sprotty + ELK)
- CLI static export (Graphviz-based)
- Tests and docs

Exit criteria:

- Domain/subdomain nesting visualized as circles
- VS Code interaction baseline works
- CLI can output SVG and PNG deterministically

### Phase 2: Context map

Scope:

- Context map builder
- Relationship rendering with direction and pattern labels (OHS/PL/ACL/CF/SK/etc.)
- Improved layout strategy for dense graphs
- Optional D2 adapter spike for alternate outputs

Exit criteria:

- Context map supports representative real-world models similar to attached examples
- Relationship labels readable and non-overlapping in standard cases

### Phase 3: Advanced interactivity (future)

Scope candidates:

- Filtering, focus mode, and drill-down
- Cross-linking between diagram and editor symbols
- Export presets and visual profile configuration

---

## Acceptance testing

Test scenarios:

1. **Domain hierarchy rendering**
   - Given nested `Domain ... in ...` structures, generated domain map shows proper containment.
2. **VS Code interaction**
   - User opens diagram command and can pan/zoom/select nodes.
3. **CLI deterministic export**
   - Two runs with same input produce semantically identical SVG output.
4. **Error handling**
   - Invalid model returns clear diagnostics and non-zero exit in CLI.
5. **Scale sanity**
   - 300-node generated model remains usable and renders without crashes.

## Risks and mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Sprotty integration complexity | Schedule slip | Start with minimal renderer contract and vertical slice |
| Layout quality variance for dense graphs | Poor readability | Use ELK tuning and rule-based label placement |
| CLI/VS Code divergence | User confusion | Enforce shared IR and golden tests |
| PNG generation environment issues | CI instability | Prefer SVG primary artifact and document PNG runtime dependencies |

## Dependencies

- **Requires:** PRS-016 web extension capabilities and existing language services
- **Related:** PRS-011 (CLI UX), PRS-017 (LSP incremental intelligence)
- **Related:** PRS-011 (CLI UX), PRS-017 (LSP incremental intelligence), PRS-019 (node-based UI for diagrams)
- **Blocks (likely):** Future visual modeling and richer architecture documentation workflows

## Open questions

1. Should CLI support both Graphviz and D2 backends from day one, or keep D2 as post-MVP adapter?
2. Do we require pixel-perfect deterministic PNG, or is deterministic SVG the strict contract with PNG best-effort?
3. Should context map edge-routing include manual overrides in v1, or remain auto-layout only?

## Implementation notes for delegation

- **Lead engineer:** implement IR and renderer adapters with strict separation.
- **Tester:** define golden tests for IR and SVG outputs; add scale tests.
- **Technical writer + site maintainer:** document CLI and VS Code flows, with domain map and context map examples.

## Research references

- Sprotty docs and integration: <https://sprotty.org>, <https://github.com/eclipse/sprotty-vscode>
- ELK.js: <https://github.com/kieler/elkjs>
- Graphviz command and outputs: <https://graphviz.org/doc/info/command.html>
- D2 documentation and exports: <https://d2lang.com>, <https://d2lang.com/tour/exports/>
- Ecosystem comparison research (Perplexity run, 2026-02-15)

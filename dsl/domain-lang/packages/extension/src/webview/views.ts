import { injectable } from 'inversify';
import { PolylineEdgeView, ShapeView, SEdgeImpl, SLabelImpl, SNodeImpl, svg, type IViewArgs, type RenderingContext, type SShapeElementImpl } from 'sprotty';
import type { Point } from 'sprotty-protocol';
import type { VNode } from 'snabbdom';

/** Average character width (px) used for label size estimation. */
const CHAR_WIDTH = 8.5;
/** Badge height (px). */
const BADGE_HEIGHT = 24;
/** Horizontal padding inside badge cells (px). */
const BADGE_PAD_X = 8;

// ── Node rotation helpers ──

/**
 * Returns a deterministic rotation angle (degrees) in the ±6° range for the
 * given node id.
 *
 * Each bounded context gets a consistent subtle tilt derived from a hash of
 * its id so the diagram has an organic look while remaining stable across
 * re-renders.
 */
function deterministicRotation(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        // Math.imul(1, …) truncates back to signed int32 after each step,
        // giving proper wraparound without `| 0` (which triggers the lint rule).
        h = Math.imul(1, Math.imul(31, h) + (id.codePointAt(i) ?? 0));
    }
    // h is a signed int32 — both positive and negative values occur naturally.
    // Map to ±6° so each node gets a distinct, subtle individual tilt.
    return h % 6;
}

// ── BBoM cloud shape helper ──

/**
 * Returns an SVG `<path d>` string for a bumpy cloud outline centred at
 * `(cx, cy)` with horizontal half-radius `rw` and vertical half-radius `rh`.
 *
 * Used to render the decorative cloud inside a BBoM bounded context node.
 * The bumps (quadratic-bézier humps) evenly ring the base ellipse, each
 * bulging outward by `bump` pixels.
 */
function buildInnerCloudPath(cx: number, cy: number, rw: number, rh: number): string {
    // More bumps + larger amplitude = clearly "cloudy" outline
    const n = 13;
    const bump = Math.min(rw, rh) * 0.42;

    // Anchor points on the base ellipse
    const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return { x: cx + rw * Math.cos(a), y: cy + rh * Math.sin(a) };
    });

    // Cubic bézier: each bump gets two control points that pull sharply outward
    // then tuck back in, giving pronounced individual puffs.
    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
        const cur = pts[i];
        const next = pts[(i + 1) % n];

        // Outward-biased control points: CP1 near cur, CP2 near next,
        // both pushed outward from the ellipse centre.
        const aMid = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
        const outX = cx + (rw + bump) * Math.cos(aMid);
        const outY = cy + (rh + bump) * Math.sin(aMid);

        // Blend CP1 between cur and the outward peak, CP2 between next and peak
        const cp1x = (cur.x + outX) / 2;
        const cp1y = (cur.y + outY) / 2;
        const cp2x = (next.x + outX) / 2;
        const cp2y = (next.y + outY) / 2;

        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
    }
    return d + 'Z';
}

/**
 * Renders a bounded context as an **ellipse** in the DDD community notation style.
 *
 * The official DDD Context Map notation uses ovals (ellipses) for bounded contexts.
 * Child elements (labels) are rendered inside the ellipse via Sprotty's layout engine.
 */
@injectable()
export class EllipseNodeView extends ShapeView {
    render(node: Readonly<SShapeElementImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(node, context)) {
            return undefined;
        }

        const rx = Math.max(node.size.width, 0) / 2;
        const ry = Math.max(node.size.height, 0) / 2;

        return svg('g', null,
            svg('ellipse', {
                'class-sprotty-node': node instanceof SNodeImpl,
                'class-mouseover': (node as SNodeImpl).hoverFeedback,
                'class-selected': (node as SNodeImpl).selected,
                cx: rx,
                cy: ry,
                rx,
                ry,
            }),
            ...context.renderChildren(node),
        );
    }
}

/**
 * Renders node labels centered both horizontally and vertically.
 */
@injectable()
export class CenteredLabelView extends ShapeView {
    render(label: Readonly<SShapeElementImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(label, context)) {
            return undefined;
        }

        const sLabel = label as SLabelImpl;
        const width = label.size.width > 0 ? label.size.width : sLabel.text.length * 7;
        const height = label.size.height > 0 ? label.size.height : 14;

        return svg('text', {
            'class-sprotty-label': true,
            'class-domainlang-node-label': true,
            x: width / 2,
            y: height / 2,
        }, sLabel.text);
    }
}

/**
 * Renders an edge label inside a filled rounded rectangle for readability.
 *
 * Used for relationship type annotations (e.g., "Shared Kernel", "Customer/Supplier")
 * placed at the center of edges. Remains legible when overlapping edges.
 */
@injectable()
export class EdgeLabelView extends ShapeView {
    render(label: Readonly<SShapeElementImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(label, context)) {
            return undefined;
        }

        const sLabel = label as SLabelImpl;
        const padX = 6;
        const padY = 3;
        // Use measured size from hidden rendering pass; estimate as fallback
        const w = label.size.width > 0 ? label.size.width : sLabel.text.length * 7;
        const h = label.size.height > 0 ? label.size.height : 14;

        return svg('g', null,
            svg('rect', {
                'class-edge-label-bg': true,
                x: 0,
                y: 0,
                width: w + 2 * padX,
                height: h + 2 * padY,
                rx: 4,
                ry: 4,
            }),
            svg('text', {
                'class-sprotty-label': true,
                'class-domainlang-edge-label': true,
                x: padX + w / 2,
                y: padY + h / 2,
            }, sLabel.text),
        );
    }
}

// ── Dynamic Smooth Edge Rendering ──

/** Padding (px) added around node bounding ellipses during obstacle detection. */
const OBSTACLE_PADDING = 20;

/**
 * Returns the centre point of a node in its parent coordinate system.
 */
function nodeCenter(node: SNodeImpl): Point {
    return {
        x: node.position.x + node.size.width / 2,
        y: node.position.y + node.size.height / 2,
    };
}

/**
 * Computes the intersection of a ray from `center` toward `target` with an
 * ellipse centred at `center` with semi-axes `rx` and `ry`.
 *
 * Returns the point on the ellipse boundary closest to `target`.
 */
function ellipseAnchor(center: Point, rx: number, ry: number, target: Point): Point {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: center.x, y: center.y + ry };

    // Parametric angle on the ellipse
    const angle = Math.atan2(dy / ry, dx / rx);
    return {
        x: center.x + rx * Math.cos(angle),
        y: center.y + ry * Math.sin(angle),
    };
}

/**
 * Tests whether the line segment from `p0` to `p1` passes through the
 * padded bounding ellipse of the given node.
 *
 * Uses a simplified axis-aligned bounding box test: checks whether the
 * closest point on the segment to the node centre is inside the padded
 * bounding rectangle.
 */
function segmentIntersectsNode(p0: Point, p1: Point, node: SNodeImpl, padding: number): boolean {
    const cx = node.position.x + node.size.width / 2;
    const cy = node.position.y + node.size.height / 2;
    const hrx = node.size.width / 2 + padding;
    const hry = node.size.height / 2 + padding;

    // Project node centre onto the segment
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return false;

    const t = Math.max(0, Math.min(1, ((cx - p0.x) * dx + (cy - p0.y) * dy) / lenSq));
    const projX = p0.x + t * dx;
    const projY = p0.y + t * dy;

    // Check if projection falls inside padded ellipse (approximated as rect)
    const ex = (projX - cx) / hrx;
    const ey = (projY - cy) / hry;
    return ex * ex + ey * ey < 1;
}

/**
 * Collects all sibling nodes that sit between `source` and `target`,
 * excluding the source and target themselves.
 */
function findObstacleNodes(
    edge: SEdgeImpl,
    source: SNodeImpl,
    target: SNodeImpl,
): SNodeImpl[] {
    const root = edge.root;
    const obstacles: SNodeImpl[] = [];
    for (const child of root.children) {
        if (child instanceof SNodeImpl && child !== source && child !== target) {
            obstacles.push(child);
        }
    }
    return obstacles;
}

/**
 * Computes a waypoint that routes the edge around an obstacle node.
 *
 * Pushes the midpoint of the source→target segment laterally (perpendicular
 * to the line) to the side that is further from the obstacle, creating a
 * natural avoidance curve.
 */
function computeAvoidanceWaypoint(
    p0: Point,
    p1: Point,
    obstacle: SNodeImpl,
    padding: number,
): Point {
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2;

    // Perpendicular to line direction
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: mx + padding, y: my };

    const nx = -dy / len;
    const ny = dx / len;

    // Choose the side away from the obstacle centre
    const oc = nodeCenter(obstacle);
    const dot = (oc.x - mx) * nx + (oc.y - my) * ny;
    const sign = dot > 0 ? -1 : 1;

    // Offset distance: half the obstacle extent + padding
    const obstacleExtent = Math.max(obstacle.size.width, obstacle.size.height) / 2;
    const offset = obstacleExtent + padding;

    return {
        x: mx + sign * nx * offset,
        y: my + sign * ny * offset,
    };
}

/**
 * Builds a cubic bézier curve between exactly two points.
 *
 * Control points are biased along the dominant axis (vertical or horizontal)
 * to create natural flowing S-curves for offset nodes and straight-ish lines
 * for aligned nodes.
 */
function twoPointBezier(p0: Point, p1: Point): string {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const tension = Math.hypot(dx, dy) * 0.4;

    let cp1: Point;
    let cp2: Point;
    if (Math.abs(dy) >= Math.abs(dx)) {
        const sigY = dy >= 0 ? 1 : -1;
        cp1 = { x: p0.x, y: p0.y + sigY * tension };
        cp2 = { x: p1.x, y: p1.y - sigY * tension };
    } else {
        const sigX = dx >= 0 ? 1 : -1;
        cp1 = { x: p0.x + sigX * tension, y: p0.y };
        cp2 = { x: p1.x - sigX * tension, y: p1.y };
    }
    return `M${p0.x},${p0.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${p1.x},${p1.y}`;
}

/**
 * Builds an SVG path string through the given points using smooth curves.
 *
 * - **0–1 points** — returns empty string.
 * - **2 points** — delegates to {@link twoPointBezier}.
 * - **3+ points** — Catmull–Rom spline converted to piecewise cubic béziers.
 *   Endpoints are clamped so the curve passes through every point.
 */
function buildSmoothPath(points: Point[]): string {
    if (points.length < 2) return '';
    if (points.length === 2) return twoPointBezier(points[0], points[1]);

    // 3+ points: Catmull–Rom spline → piecewise cubic bézier
    const alpha = 1 / 6;
    let path = `M${points[0].x},${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i + 2 < points.length ? points[i + 2] : (points.at(-1) ?? p2);

        const cp1x = p1.x + (p2.x - p0.x) * alpha;
        const cp1y = p1.y + (p2.y - p0.y) * alpha;
        const cp2x = p2.x - (p3.x - p1.x) * alpha;
        const cp2y = p2.y - (p3.y - p1.y) * alpha;

        path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    return path;
}

/**
 * Renders edges as **smooth, dynamically routed curves** in a layered
 * context map style.
 *
 * Unlike the default Sprotty edge rendering, this view computes obstacle
 * avoidance waypoints dynamically and injects them into the edge's routing
 * points **before** the standard router runs.  This ensures that both the
 * drawn SVG path and the label positioning (via `EdgeLayoutDecorator`) use
 * the same route.
 *
 * Obstacle avoidance: before rendering, the view checks whether the direct
 * source→target path passes through any sibling nodes.  If so, a lateral
 * waypoint is inserted to route the curve around the obstacle.
 *
 * Rendering pipeline:
 * 1. Compute approximate ellipse anchors for obstacle detection
 * 2. Detect obstacle nodes along the direct path
 * 3. Insert avoidance waypoints into `edge.routingPoints`
 * 4. Delegate to `super.render()` — router produces route from our waypoints
 * 5. `renderLine()` draws smooth cubic bézier through the routed points
 */
@injectable()
export class SmoothBezierEdgeView extends PolylineEdgeView {
    /**
     * Overrides the parent `render()` to inject dynamic obstacle-avoidance
     * waypoints into `edge.routingPoints` before the edge router runs.
     *
     * The router (and `EdgeLayoutDecorator`) will then use these waypoints
     * for both path rendering and label positioning.
     */
    override render(edge: Readonly<SEdgeImpl>, context: RenderingContext, args?: IViewArgs): VNode | undefined {
        const source = edge.source;
        const target = edge.target;

        if (source instanceof SNodeImpl && target instanceof SNodeImpl) {
            // Compute approximate anchors for obstacle detection
            const srcCenter = nodeCenter(source);
            const tgtCenter = nodeCenter(target);
            const srcAnchor = ellipseAnchor(srcCenter, source.size.width / 2, source.size.height / 2, tgtCenter);
            const tgtAnchor = ellipseAnchor(tgtCenter, target.size.width / 2, target.size.height / 2, srcCenter);

            // Find obstacle nodes and compute avoidance waypoints
            const obstacles = findObstacleNodes(edge as SEdgeImpl, source, target);
            const interiorWaypoints: Point[] = [];
            for (const obs of obstacles) {
                if (segmentIntersectsNode(srcAnchor, tgtAnchor, obs, OBSTACLE_PADDING)) {
                    interiorWaypoints.push(computeAvoidanceWaypoint(srcAnchor, tgtAnchor, obs, OBSTACLE_PADDING));
                }
            }

            // Sort interior waypoints by distance from source
            if (interiorWaypoints.length > 1) {
                interiorWaypoints.sort((a, b) => {
                    const da = Math.hypot(a.x - srcAnchor.x, a.y - srcAnchor.y);
                    const db = Math.hypot(b.x - srcAnchor.x, b.y - srcAnchor.y);
                    return da - db;
                });
            }

            // Inject our waypoints so the router and EdgeLayoutDecorator
            // position labels along the same path we draw.
            (edge as SEdgeImpl).routingPoints = interiorWaypoints;
        }

        return super.render(edge, context, args);
    }

    /**
     * Draws a smooth bézier path through the routed points.
     *
     * The `segments` are now produced by the standard router using our
     * injected waypoints, so labels and path are automatically aligned.
     */
    protected override renderLine(edge: SEdgeImpl, segments: Point[], _context: RenderingContext): VNode {
        return svg('path', { d: buildSmoothPath(segments) });
    }
}

/**
 * Custom node implementation that uses **elliptic** anchor computation.
 *
 * By default, `SNodeImpl` uses rectangular anchors. Since our bounded
 * context nodes are rendered as ellipses, edges should connect to the
 * ellipse boundary rather than the bounding box corners.
 */
export class EllipseNodeImpl extends SNodeImpl {
    override get anchorKind(): string {
        return 'elliptic';
    }
}

/**
 * Renders a bounded context as a **deterministically rotated ellipse** ("egg"
 * shape) in DDD Context Map notation.
 *
 * Each node receives a consistent subtle tilt derived from its id so the
 * diagram has an organic, hand-drawn feel.  Only the `<ellipse>` element is
 * rotated; child labels remain upright.
 */
@injectable()
export class EggNodeView extends ShapeView {
    render(node: Readonly<SShapeElementImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(node, context)) {
            return undefined;
        }

        const rx = Math.max(node.size.width, 0) / 2;
        const ry = Math.max(node.size.height, 0) / 2;
        const deg = deterministicRotation(node.id);

        return svg('g', null,
            // Rotated ellipse — visual shell only, labels stay horizontal
            svg('ellipse', {
                'class-sprotty-node': node instanceof SNodeImpl,
                'class-mouseover': (node as SNodeImpl).hoverFeedback,
                'class-selected': (node as SNodeImpl).selected,
                cx: rx,
                cy: ry,
                rx,
                ry,
                transform: `rotate(${deg}, ${rx}, ${ry})`,
            }),
            // Children rendered in original coordinate space so text is upright
            ...context.renderChildren(node),
        );
    }
}

/**
 * Sprotty node model for **Big Ball of Mud** bounded context nodes.
 *
 * Uses elliptic anchor computation (edges connect to the approximate ellipse
 * boundary) but is registered under the `node:bbom` type so the DI container
 * routes it to {@link BBoMNodeView}.
 */
export class BBoMNodeImpl extends SNodeImpl {
    override get anchorKind(): string {
        return 'elliptic';
    }
}

/**
 * Renders a **Big Ball of Mud** bounded context.
 *
 * Layout (top → bottom inside the node ellipse):
 * - Outer ellipse  — same shape as a normal node, required so that Sprotty's
 *   elliptic anchor resolver places edge endpoints on the boundary correctly.
 * - BC name label  — rendered by the layout engine as the first child (top area).
 * - Inner cloud    — decorative bumpy outline filling the lower portion of the
 *   ellipse, conveying the chaotic nature of a BBoM context.
 * - "BBoM" text    — centred inside the inner cloud.
 *
 * The dashed cloud stroke distinguishes BBoM nodes from regular ellipses while
 * hover/selected states follow the same CSS variables for theme consistency.
 */
@injectable()
export class BBoMNodeView extends ShapeView {
    render(node: Readonly<SShapeElementImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(node, context)) {
            return undefined;
        }

        const w = Math.max(node.size.width, 0);
        const h = Math.max(node.size.height, 0);
        const rx = w / 2;
        const ry = h / 2;

        // Inner cloud occupies the lower ~55 % of the ellipse height, centred
        // horizontally. The cloud half-radii are chosen to fit comfortably
        // inside the ellipse boundary at that vertical offset.
        const cloudCy = h * 0.7;
        const cloudRw = w * 0.22;
        const cloudRh = h * 0.18;

        return svg('g', null,
            // Outer ellipse — provides the sprotty-node class so Sprotty's
            // elliptic anchor resolver targets the actual ellipse boundary.
            svg('ellipse', {
                'class-sprotty-node': node instanceof SNodeImpl,
                'class-mouseover': (node as SNodeImpl).hoverFeedback,
                'class-selected': (node as SNodeImpl).selected,
                cx: rx,
                cy: ry,
                rx,
                ry,
            }),
            // BC name label rendered by the Sprotty layout engine
            ...context.renderChildren(node),
            // Decorative cloud in the lower portion
            svg('path', {
                'class-bbom-cloud': true,
                d: buildInnerCloudPath(rx, cloudCy, cloudRw, cloudRh),
            }),
            // "BBoM" text centred inside the cloud
            svg('text', {
                'class-sprotty-label': true,
                'class-bbom-label': true,
                x: rx,
                y: cloudCy,
            }, 'BBoM'),
        );
    }
}

/**
 * Renders a **U/D badge** for DDD Context Map notation using the standard
 * HTML-table-inspired layout.
 *
 * - **No patterns**: single bordered box containing the role letter (U or D).
 *
 * - **With patterns**: single outer bordered rectangle with the role letter and
 *   the comma-separated pattern list, separated by a vertical divider line —
 *   faithfully representing `<td sides="r">U</td><td sides="trbl">OHS, PL</td>`.
 *
 * ```
 * ┌───┐
 * │ U │            (no patterns — role-only box)
 * └───┘
 *
 * ┌───┬──────────┐
 * │ U │ OHS, PL  │  (with patterns — outer rect + separator)
 * └───┴──────────┘
 * ```
 *
 * Text format: `ROLE|PATTERNS` (e.g. `U|OHS, PL` or `D|ACL` or `U|`).
 */
@injectable()
export class UDBadgeLabelView extends ShapeView {
    render(label: Readonly<SShapeElementImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(label, context)) {
            return undefined;
        }

        const sLabel = label as SLabelImpl;
        const text = sLabel.text;
        const separatorIdx = text.indexOf('|');
        const role = separatorIdx >= 0 ? text.substring(0, separatorIdx) : text;
        const patterns = separatorIdx >= 0 ? text.substring(separatorIdx + 1).trim() : '';

        const h = BADGE_HEIGHT;
        const roleWidth = role.length * CHAR_WIDTH + BADGE_PAD_X * 2;

        if (!patterns) {
            // Role-only case: single bordered box containing U or D
            return svg('g', null,
                svg('rect', {
                    'class-ud-role-box': true,
                    x: 0,
                    y: 0,
                    width: roleWidth,
                    height: h,
                }),
                svg('text', {
                    'class-sprotty-label': true,
                    'class-ud-role-text': true,
                    x: roleWidth / 2,
                    y: h / 2,
                }, role),
            );
        }

        // With-patterns case: outer rect + vertical separator + two text zones.
        const patternWidth = patterns.length * CHAR_WIDTH + BADGE_PAD_X * 2;
        const totalWidth = roleWidth + patternWidth;

        return svg('g', null,
            // Single outer rectangle enclosing both role and pattern areas
            svg('rect', {
                'class-ud-outer-box': true,
                x: 0,
                y: 0,
                width: totalWidth,
                height: h,
            }),
            // Vertical divider — right border of the role cell
            svg('line', {
                'class-ud-separator': true,
                x1: roleWidth,
                y1: 0,
                x2: roleWidth,
                y2: h,
            }),
            // Role text (U or D)
            svg('text', {
                'class-sprotty-label': true,
                'class-ud-role-text': true,
                x: roleWidth / 2,
                y: h / 2,
            }, role),
            // Pattern text (OHS, PL / ACL / CF / SK etc.)
            svg('text', {
                'class-sprotty-label': true,
                'class-ud-pattern-text': true,
                x: roleWidth + patternWidth / 2,
                y: h / 2,
            }, patterns),
        );
    }
}

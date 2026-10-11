/**
 * Connector geometry for the tree canvas: spouse lines and parent → child
 * brackets, computed from node positions. Kept free of DOM/canvas code so
 * it can be checked offline (e.g. that no line crosses a node).
 */

export const NODE_W = 120;
/** Node metrics (close LOD) — floating avatar + labels, no card */
export const AVATAR_R = 34;
/** Avatar center sits slightly above node.y; labels hang below */
export const AVATAR_CY = -16;
/** Vertical extents used to attach connector lines */
export const NODE_TOP = 60;
export const NODE_BOTTOM = 52;
/** Lines keep at least this far (world units) from a node's centre: half
 *  the widest name label (NODE_W + 20) plus a margin. */
export const ROUTE_CLEAR = 85;
/** Narrowest gap between two nodes a vertical line may pass through;
 *  wider than a couple (200), so lines never squeeze between spouses. */
export const ROUTE_MIN_GAP = 2 * ROUTE_CLEAR + 60;

/* Softened bracket palette — one hue per family */
export const BRACKET_PALETTE = [
    '#818cf8', '#fbbf24', '#34d399', '#a78bfa', '#f472b6',
    '#22d3ee', '#fb923c', '#2dd4bf', '#c084fc', '#60a5fa',
    '#a3e635', '#fb7185',
];

export interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface SpouseLineGeom {
    points: Array<{ x: number; y: number }>;
    isEx: boolean;
    markX: number;
    markY: number;
    aId: string;
    bId: string;
    bbox: BBox;
}

export interface BracketGeom {
    color: string;
    /** Parent junction → bar, routed through gaps between nodes */
    trunk: Array<{ x: number; y: number }>;
    barY: number;
    drops: Array<{ x: number; topY: number }>;
    /** parent + child ids — used to highlight the selected person's family */
    memberIds: Set<string>;
    bbox: BBox;
}

export interface GeometryEdge {
    sourceId: string;
    targetId: string;
    type: string;
    status: string;
}

/** Builds spouse lines and family brackets for the given nodes and edges. */
export function buildEdgeGeometry<N extends { id: string; x: number; y: number }>(
    nodes: N[],
    edges: GeometryEdge[],
): { spouseLines: SpouseLineGeom[]; brackets: BracketGeom[] } {
    const spouseLines: SpouseLineGeom[] = [];
    const brackets: BracketGeom[] = [];
    const nodeMap = new Map<string, N>();
    for (const n of nodes) nodeMap.set(n.id, n);

    /* ---- Node x positions per row (sorted), for routing ---- */
    const rowXs = new Map<number, number[]>();
    for (const n of nodeMap.values()) {
        const xs = rowXs.get(n.y);
        if (xs) xs.push(n.x);
        else rowXs.set(n.y, [n.x]);
    }
    for (const xs of rowXs.values()) xs.sort((a, b) => a - b);
    const rowYs = [...rowXs.keys()].sort((a, b) => a - b);
    const rowXsForSpouses = rowXs;

    /* ---- Spouse lines (deduped pairs) ---- */
    const drawnSpouses = new Set<string>();
    /* ---- Child → parents in a single pass ---- */
    const childParents = new Map<string, string[]>();

    for (const edge of edges) {
        if (edge.type === 'SPOUSE') {
            const a = nodeMap.get(edge.sourceId);
            const b = nodeMap.get(edge.targetId);
            if (!a || !b) continue;
            const key = edge.sourceId < edge.targetId
                ? `${edge.sourceId}-${edge.targetId}`
                : `${edge.targetId}-${edge.sourceId}`;
            if (drawnSpouses.has(key)) continue;
            drawnSpouses.add(key);

            const isEx = edge.status === 'divorced' || edge.status === 'EX';
            const left = a.x < b.x ? a : b;
            const right = a.x < b.x ? b : a;
            const attach = AVATAR_R + 8;
            const leftEdge = left.x + attach;
            const rightEdge = right.x - attach;
            const lineY = (a.y + b.y) / 2 + AVATAR_CY; // avatar level
            const gap = right.x - left.x;

            let points: Array<{ x: number; y: number }>;
            let markX: number;
            let markY: number;

            // Straight only for neighbours; if anyone stands between
            // the two spouses, go over the row instead of through them.
            const between = (rowXsForSpouses.get(left.y) ?? []).some(
                (x) => x > left.x + 1 && x < right.x - 1,
            );
            if (gap <= 420 && !between && left.y === right.y) {
                points = [
                    { x: leftEdge, y: lineY },
                    { x: rightEdge, y: lineY },
                ];
                markX = (leftEdge + rightEdge) / 2;
                markY = lineY;
            } else {
                /* Far apart — route above both nodes */
                const routeY = Math.min(a.y, b.y) - NODE_TOP - 22;
                points = [
                    { x: leftEdge, y: lineY },
                    { x: leftEdge + 18, y: lineY },
                    { x: leftEdge + 18, y: routeY },
                    { x: rightEdge - 18, y: routeY },
                    { x: rightEdge - 18, y: lineY },
                    { x: rightEdge, y: lineY },
                ];
                markX = (left.x + right.x) / 2;
                markY = routeY;
            }

            let minX = Infinity, minY2 = Infinity, maxX = -Infinity, maxY2 = -Infinity;
            for (const p of points) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY2) minY2 = p.y;
                if (p.y > maxY2) maxY2 = p.y;
            }

            spouseLines.push({
                points,
                isEx,
                markX,
                markY,
                aId: edge.sourceId,
                bId: edge.targetId,
                bbox: { minX, minY: minY2, maxX, maxY: maxY2 },
            });
        } else if (edge.type === 'PARENT') {
            /* edge: sourceId=parent, targetId=child */
            if (!nodeMap.has(edge.sourceId) || !nodeMap.has(edge.targetId)) continue;
            const bucket = childParents.get(edge.targetId);
            if (bucket) {
                if (!bucket.includes(edge.sourceId)) bucket.push(edge.sourceId);
            } else {
                childParents.set(edge.targetId, [edge.sourceId]);
            }
        }
    }

    /* ---- Group children by parent-set → families ---- */
    const familyMap = new Map<string, { parentIds: string[]; childIds: string[] }>();
    for (const [childId, parentIds] of childParents) {
        const sorted = [...parentIds].sort();
        const key = sorted.join(',');
        let fam = familyMap.get(key);
        if (!fam) {
            fam = { parentIds: sorted, childIds: [] };
            familyMap.set(key, fam);
        }
        fam.childIds.push(childId);
    }

    /* ---- Routing helpers: lines never cross a node ---- */

    /** A node (or its label) occupies x in row y */
    const blocked = (y: number, x: number) => {
        const xs = rowXs.get(y);
        if (!xs) return false;
        let lo = 0;
        let hi = xs.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (xs[mid] < x - ROUTE_CLEAR) lo = mid + 1;
            else hi = mid;
        }
        return lo < xs.length && xs[lo] <= x + ROUTE_CLEAR;
    };
    /** Nearest x to `x` where a vertical line passes row y clear of nodes */
    const channelX = (y: number, x: number) => {
        if (!blocked(y, x)) return x;
        const xs = rowXs.get(y)!;
        let best = xs[0] - 2 * ROUTE_CLEAR;
        const right = xs[xs.length - 1] + 2 * ROUTE_CLEAR;
        if (Math.abs(right - x) < Math.abs(best - x)) best = right;
        for (let i = 1; i < xs.length; i++) {
            if (xs[i] - xs[i - 1] < ROUTE_MIN_GAP) continue;
            const mid = (xs[i] + xs[i - 1]) / 2;
            if (Math.abs(mid - x) < Math.abs(best - x)) best = mid;
        }
        return best;
    };
    const rowAbove = (y: number) => {
        const i = rowYs.indexOf(y);
        return i > 0 ? rowYs[i - 1] : y - 600;
    };

    /* ---- One bracket per (family, children's row) ---- */
    interface RawBracket {
        familyKey: string;
        color: string;
        /** trunk up to (but not including) the bar */
        trunk: Array<{ x: number; y: number }>;
        trunkX: number;
        /** the gap the bar sits in: just above the children's row */
        gapTop: number;
        gapBot: number;
        children: N[];
        minX: number;
        maxX: number;
        track: number;
    }
    const rawBrackets: RawBracket[] = [];

    for (const [familyKey, family] of familyMap) {
        const parentPositions = family.parentIds
            .map((id) => nodeMap.get(id))
            .filter((n): n is N => !!n);
        if (parentPositions.length === 0) continue;

        const allChildren = family.childIds
            .map((id) => nodeMap.get(id))
            .filter((n): n is N => !!n);
        if (allChildren.length === 0) continue;

        const junctionX =
            parentPositions.reduce((s, p) => s + p.x, 0) / parentPositions.length;
        const parentRowY = Math.max(...parentPositions.map((p) => p.y));

        /* Stable color: hash the family key */
        let h = 0;
        for (let i = 0; i < familyKey.length; i++) h = ((h << 5) - h + familyKey.charCodeAt(i)) | 0;
        const color = BRACKET_PALETTE[((h % BRACKET_PALETTE.length) + BRACKET_PALETTE.length) % BRACKET_PALETTE.length];

        const byRow = new Map<number, N[]>();
        for (const c of allChildren) {
            const list = byRow.get(c.y);
            if (list) list.push(c);
            else byRow.set(c.y, [c]);
        }

        for (const [childRowY, rowChildren] of byRow) {
            const children = rowChildren.sort((a, b) => a.x - b.x);
            const gapTop = rowAbove(childRowY) + NODE_BOTTOM;
            const gapBot = childRowY - NODE_TOP;

            // Walk down from the parents. In every row between parents
            // and children, step sideways (in the gap above that row)
            // into the nearest clear channel, so the trunk never runs
            // through someone. Children one row down need no steps.
            let x = junctionX;
            const trunk = [{ x, y: parentRowY + NODE_BOTTOM }];
            for (const ry of rowYs) {
                if (ry <= parentRowY || ry >= childRowY) continue;
                const nx = channelX(ry, x);
                if (nx !== x) {
                    const top = rowAbove(ry) + NODE_BOTTOM;
                    const jogY = top + (ry - NODE_TOP - top) * 0.12;
                    trunk.push({ x, y: jogY }, { x: nx, y: jogY });
                    x = nx;
                }
            }

            const xs = [x, ...children.map((c) => c.x)];
            rawBrackets.push({
                familyKey,
                color,
                trunk,
                trunkX: x,
                gapTop,
                gapBot,
                children,
                minX: Math.min(...xs),
                maxX: Math.max(...xs),
                track: 0,
            });
        }
    }

    /* ---- Lanes: bars sharing a gap get their own height when they
     * overlap sideways; bars that don't overlap reuse a lane ---- */
    const LANE_PAD = 40;
    const MAX_LANE_STEP = 24;
    const gapGroups = new Map<number, RawBracket[]>();
    for (const b of rawBrackets) {
        const k = Math.round(b.gapBot);
        const group = gapGroups.get(k);
        if (group) group.push(b);
        else gapGroups.set(k, [b]);
    }

    const barYOf = new Map<RawBracket, number>();
    for (const group of gapGroups.values()) {
        group.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
        const laneEnds: number[] = [];
        for (const b of group) {
            let lane = laneEnds.findIndex((end) => end + LANE_PAD < b.minX);
            if (lane === -1) {
                lane = laneEnds.length;
                laneEnds.push(b.maxX);
            } else {
                laneEnds[lane] = b.maxX;
            }
            b.track = lane;
        }
        const gapTop = Math.max(...group.map((b) => b.gapTop));
        const gapBot = Math.min(...group.map((b) => b.gapBot));
        const gapH = gapBot - gapTop;
        const margin = gapH * 0.22;
        const usable = gapH - 2 * margin;
        const lanes = laneEnds.length;
        const step = lanes > 1 ? Math.min(MAX_LANE_STEP, usable / (lanes - 1)) : 0;
        const startY = gapTop + margin + (usable - step * (lanes - 1)) / 2;
        for (const b of group) barYOf.set(b, startY + b.track * step);
    }

    for (const b of rawBrackets) {
        const barY = barYOf.get(b) ?? (b.gapTop + b.gapBot) / 2;
        const trunk = [...b.trunk, { x: b.trunkX, y: barY }];
        const drops = b.children.map((c) => ({ x: c.x, topY: c.y - NODE_TOP }));

        const memberIds = new Set<string>(b.familyKey.split(','));
        for (const c of b.children) memberIds.add(c.id);

        const allX = [...trunk.map((p) => p.x), ...drops.map((d) => d.x)];
        const allY = [...trunk.map((p) => p.y), ...drops.map((d) => d.topY), barY];
        brackets.push({
            color: b.color,
            trunk,
            barY,
            drops,
            memberIds,
            bbox: {
                minX: Math.min(...allX),
                maxX: Math.max(...allX),
                minY: Math.min(...allY),
                maxY: Math.max(...allY),
            },
        });
    }

    return { spouseLines, brackets };
}

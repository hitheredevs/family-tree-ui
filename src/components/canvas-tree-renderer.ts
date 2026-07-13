/**
 * Imperative Canvas 2D renderer for the family tree.
 *
 * Manages a single <canvas> element. Renders only when something
 * changed (dirty flag + on-demand requestAnimationFrame — no idle
 * render loop). Fetches visible nodes from the server viewport API
 * and draws them at 3 LOD levels:
 *
 *   Far   (zoom < 0.18) — coloured dots (screen-size clamped)
 *   Mid   (0.18 – 0.55) — initials discs + first name
 *   Close (> 0.55)      — cards with initials avatar, full name
 *
 * Edge geometry (spouse lines + parent/child brackets) is computed
 * once per data change and cached; each frame only replays the
 * cached shapes with viewport culling.
 *
 * Handles pan/zoom via pointer & touch events. Hit-tests clicks to
 * detect which node was tapped.
 */

import {
    getTreeViewport,
    getAllEdges,
    recomputeLayout,
    type ViewportNode,
    type ViewportEdge,
} from '../services/api-client';
import { toUrdu } from '../utils/transliterate';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_W = 120;
/** Node metrics (close LOD) — floating avatar + labels, no card */
const AVATAR_R = 34;
/** Avatar center sits slightly above node.y; labels hang below */
const AVATAR_CY = -16;
/** Vertical extents used to attach connector lines */
const NODE_TOP = 60;
const NODE_BOTTOM = 52;
/** Half-width used for hit-testing and spouse-line attach points */
const HIT_HALF_W = 55;

/** LOD thresholds */
const LOD_FAR = 0.18;
const LOD_MID = 0.55;

/** Zoom limits */
const MIN_ZOOM = 0.008;
const MAX_ZOOM = 2.5;

/** Debounce delay (ms) before fetching after pan/zoom settles */
const FETCH_DEBOUNCE = 500;

const LOCAL_STORAGE_KEY = 'family-tree-canvas-view';

/* Softened bracket palette — one hue per family */
const BRACKET_PALETTE = [
    '#818cf8', '#fbbf24', '#34d399', '#a78bfa', '#f472b6',
    '#22d3ee', '#fb923c', '#2dd4bf', '#c084fc', '#60a5fa',
    '#a3e635', '#fb7185',
];

/* Theme */
const COLOR_BG = '#faf9f7';
const COLOR_GRID_DOT = '#e2ded9';
/* Connectors are quiet by default; the selected person's family lights up */
const COLOR_EDGE_MUTED = '#d9d3cc';
const COLOR_SPOUSE_MUTED = '#cfc9c2';
const COLOR_SPOUSE_ACTIVE = '#f43f5e';
const COLOR_SPOUSE_EX = '#fb7185';
const COLOR_FAR_EDGE = '#dcd7d1';
const COLOR_NAME = '#292524';
const COLOR_NAME_SUB = '#a8a29e';
const COLOR_HALO = 'rgba(250,249,247,0.9)';
const COLOR_SELECTED = '#059669';
const COLOR_CENTER = '#10b981';

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

function roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

function bboxVisible(b: BBox, vp: BBox, margin: number): boolean {
    return (
        b.maxX >= vp.minX - margin &&
        b.minX <= vp.maxX + margin &&
        b.maxY >= vp.minY - margin &&
        b.minY <= vp.maxY + margin
    );
}

/* ------------------------------------------------------------------ */
/*  Cached edge geometry                                               */
/* ------------------------------------------------------------------ */

interface SpouseLineGeom {
    points: Array<{ x: number; y: number }>;
    isEx: boolean;
    markX: number;
    markY: number;
    aId: string;
    bId: string;
    bbox: BBox;
}

interface BracketGeom {
    color: string;
    stemX: number;
    stemTopY: number;
    barY: number;
    drops: Array<{ x: number; topY: number }>;
    /** parent + child ids — used to highlight the selected person's family */
    memberIds: Set<string>;
    bbox: BBox;
}

/* ------------------------------------------------------------------ */
/*  The Renderer                                                       */
/* ------------------------------------------------------------------ */

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface RendererCallbacks {
    onPersonSelect: (personId: string | null) => void;
    onPersonOpen: (personId: string) => void;
    onOpenAddPersonModal: (personId: string, relation: 'parent' | 'child' | 'spouse' | 'sibling') => void;
    onViewChange?: () => void;
    onStats?: (stats: { totalPeople: number; loadedNodes: number }) => void;
    onLoadStatus?: (status: LoadStatus) => void;
}

export class CanvasTreeRenderer {
    /* DOM */
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private dpr = 1;

    /* Transform: world → screen is  screen = world * zoom + offset */
    private zoom = 1;
    private offset = { x: 0, y: 0 };

    /* Dirty flag + on-demand rAF (no idle loop) */
    private dirty = false;
    private rafId = 0;

    /* Current data */
    private allNodes: ViewportNode[] = [];
    private allEdges: ViewportEdge[] = [];

    /* Cached geometry (rebuilt when data changes) */
    private geometryDirty = true;
    private spouseLines: SpouseLineGeom[] = [];
    private brackets: BracketGeom[] = [];

    /* Grid pattern cache */
    private gridPattern: CanvasPattern | null = null;
    private gridPatternSize = 0;

    /* Loaded-extent tracking — skip fetches when viewport is inside cached area */
    private loadedExtent: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

    /* Interaction */
    private selectedId: string | null = null;
    private centerId: string = '';
    private callbacks: RendererCallbacks;

    /* Direct-lineage focus filter — when set, only these ids render */
    private focusSet: Set<string> | null = null;

    /* Language */
    private isUrdu = false;
    private urduCache = new Map<string, string>();

    /* Pointer tracking */
    private dragging = false;
    private dragStart = { x: 0, y: 0 };
    private dragStartOffset = { x: 0, y: 0 };
    private wasDragged = false;

    /* Pinch */
    private pinch: {
        startDist: number;
        startZoom: number;
        startMidX: number;
        startMidY: number;
        startOffset: { x: number; y: number };
    } | null = null;

    /* Touch pan */
    private touchPan: {
        startX: number;
        startY: number;
        startOffset: { x: number; y: number };
    } | null = null;

    /* Double-tap */
    private lastTapTime = 0;
    private lastTapId: string | null = null;

    /* Fetch debounce */
    private fetchTimer = 0;
    private fetching = false;
    private refetchQueued = false;

    /* View persistence */
    private hadSavedView = false;
    private saveViewTimer = 0;

    /* Stats */
    private totalPeople = 0;

    /* Cleanup */
    private destroyed = false;
    private abortController: AbortController | null = null;
    private resizeObserver: ResizeObserver | null = null;

    /* ------------------------------------------------------------------ */
    /*  Constructor                                                        */
    /* ------------------------------------------------------------------ */

    constructor(
        container: HTMLElement,
        callbacks: RendererCallbacks,
        centerId: string,
    ) {
        this.callbacks = callbacks;
        this.centerId = centerId;

        /* Create canvas */
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;';
        container.appendChild(this.canvas);

        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D not supported');
        this.ctx = ctx;

        /* Restore view */
        this.restoreView();

        /* Size */
        this.resize();

        /* Events — use native listeners for non-passive touch handling */
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        window.addEventListener('resize', this.handleResize);

        /* Track container size directly — catches the tab being hidden
         * (display:none) during a window resize and shown again, which
         * the window resize handler alone would miss (blank canvas). */
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => {
                this.resize();
                this.scheduleIfNeeded();
            });
            this.resizeObserver.observe(container);
        }

        /* First paint + initial fetch */
        this.markDirty();
        this.initialLoad();
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                         */
    /* ------------------------------------------------------------------ */

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.rafId);
        clearTimeout(this.fetchTimer);
        clearTimeout(this.saveViewTimer);
        this.abortController?.abort();

        this.canvas.removeEventListener('wheel', this.handleWheel);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        window.removeEventListener('resize', this.handleResize);
        this.resizeObserver?.disconnect();

        this.canvas.parentElement?.removeChild(this.canvas);
    }

    setSelectedId(id: string | null) {
        if (this.selectedId !== id) {
            this.selectedId = id;
            this.markDirty();
        }
    }

    setCenterId(id: string) {
        if (this.centerId !== id) {
            this.centerId = id;
            this.markDirty();
        }
    }

    /**
     * Limit rendering to a set of person ids (direct-lineage mode),
     * or null to show everyone.
     */
    setFocusFilter(ids: Set<string> | null) {
        this.focusSet = ids;
        this.geometryDirty = true;
        this.markDirty();
    }

    /** Switch canvas labels between English and Urdu */
    setUrdu(isUrdu: boolean) {
        if (this.isUrdu === isUrdu) return;
        this.isUrdu = isUrdu;
        if (isUrdu && typeof document !== 'undefined' && document.fonts?.load) {
            // Make sure the Nastaliq font is ready, then repaint.
            document.fonts
                .load('13px "Noto Nastaliq Urdu"')
                .then(() => this.markDirty())
                .catch(() => {});
        }
        this.markDirty();
    }

    /** Reload data from server. Keeps drawing the old data until the
     *  fresh payload arrives, then swaps it in (no blank flash). */
    invalidate() {
        this.loadedExtent = null;
        this.initialLoad();
    }

    /** Jump view so a specific node is centered on screen */
    jumpToNode(nodeId: string, targetZoom?: number) {
        const node = this.allNodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (targetZoom !== undefined) {
            this.zoom = this.clampZoom(targetZoom);
        } else if (this.zoom < 0.5) {
            this.zoom = 0.9;
        }
        this.offset = {
            x: this.canvas.width / this.dpr / 2 - node.x * this.zoom,
            y: this.canvas.height / this.dpr / 2 - node.y * this.zoom,
        };
        this.markDirty();
        this.saveView();
        this.scheduleIfNeeded();
    }

    /** Center the view on the logged-in user's node */
    locateCenter() {
        this.jumpToNode(this.centerId, Math.max(this.zoom, 0.9));
    }

    resetView() {
        this.jumpToNode(this.centerId, 0.9);
        if (!this.allNodes.some((n) => n.id === this.centerId)) {
            const w = this.canvas.width / this.dpr;
            const h = this.canvas.height / this.dpr;
            this.offset = { x: w / 2, y: h / 2 };
            this.zoom = 1;
            this.markDirty();
            this.saveView();
            this.scheduleIfNeeded();
        }
    }

    /** Zoom in/out around the canvas center (for +/- buttons) */
    zoomBy(factor: number) {
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        this.zoomAt(w / 2, h / 2, this.clampZoom(this.zoom * factor));
    }

    /**
     * Fit the user's connected family into view. Disconnected islands
     * (packed far to the right by the layout) are excluded so the fit
     * doesn't zoom out into empty space; falls back to all nodes.
     */
    fitToTree() {
        if (this.allNodes.length === 0) return;

        let nodes = this.allNodes;
        const component = this.connectedComponentOf(this.centerId);
        if (component && component.size >= 2) {
            const filtered = this.allNodes.filter((n) => component.has(n.id));
            if (filtered.length > 0) nodes = filtered;
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of nodes) {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        }
        const pad = 260;
        minX -= pad; maxX += pad; minY -= pad; maxY += pad;

        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        const zoom = this.clampZoom(Math.min(w / (maxX - minX), h / (maxY - minY)));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        this.zoom = zoom;
        this.offset = { x: w / 2 - cx * zoom, y: h / 2 - cy * zoom };
        this.markDirty();
        this.saveView();
        this.scheduleIfNeeded();
    }

    /** BFS over loaded edges from a starting person */
    private connectedComponentOf(startId: string): Set<string> | null {
        if (!startId || this.allEdges.length === 0) return null;

        const adjacency = new Map<string, string[]>();
        const link = (a: string, b: string) => {
            const bucket = adjacency.get(a);
            if (bucket) bucket.push(b);
            else adjacency.set(a, [b]);
        };
        for (const e of this.allEdges) {
            link(e.sourceId, e.targetId);
            link(e.targetId, e.sourceId);
        }
        if (!adjacency.has(startId)) return null;

        const seen = new Set<string>([startId]);
        const queue = [startId];
        while (queue.length > 0) {
            const id = queue.shift()!;
            for (const next of adjacency.get(id) ?? []) {
                if (!seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
            }
        }
        return seen;
    }

    /** Get all loaded nodes (for search functionality) */
    getLoadedNodes(): ViewportNode[] {
        return this.allNodes;
    }

    /* ------------------------------------------------------------------ */
    /*  View persistence                                                   */
    /* ------------------------------------------------------------------ */

    private saveView() {
        clearTimeout(this.saveViewTimer);
        this.saveViewTimer = window.setTimeout(() => {
            try {
                localStorage.setItem(
                    LOCAL_STORAGE_KEY,
                    JSON.stringify({ offset: this.offset, zoom: this.zoom }),
                );
            } catch { /* quota */ }
        }, 250);
    }

    private restoreView() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!raw) return;
            const v = JSON.parse(raw);
            if (typeof v.zoom === 'number' && v.offset?.x != null && v.offset?.y != null) {
                this.zoom = this.clampZoom(v.zoom);
                this.offset = { x: v.offset.x, y: v.offset.y };
                this.hadSavedView = true;
            }
        } catch { /* ignore */ }
    }

    /* ------------------------------------------------------------------ */
    /*  Sizing                                                             */
    /* ------------------------------------------------------------------ */

    private resize() {
        this.dpr = window.devicePixelRatio || 1;
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const { width, height } = parent.getBoundingClientRect();
        /* Ignore zero sizes (tab hidden via display:none) — keep the
         * last real backing buffer so the canvas isn't blanked. */
        if (width < 2 || height < 2) return;
        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        this.markDirty();
    }

    private handleResize = () => {
        this.resize();
        this.scheduleIfNeeded();
    };

    /* ------------------------------------------------------------------ */
    /*  Viewport math                                                      */
    /* ------------------------------------------------------------------ */

    private clampZoom(z: number): number {
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    }

    /** Zoom to `newZoom`, keeping screen point (sx, sy) fixed */
    private zoomAt(sx: number, sy: number, newZoom: number) {
        newZoom = this.clampZoom(newZoom);
        if (newZoom === this.zoom) return;
        this.offset = {
            x: sx - ((sx - this.offset.x) / this.zoom) * newZoom,
            y: sy - ((sy - this.offset.y) / this.zoom) * newZoom,
        };
        this.zoom = newZoom;
        this.markDirty();
        this.scheduleIfNeeded();
        this.saveView();
    }

    /** Screen CSS coordinates → world coordinates */
    private screenToWorld(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - this.offset.x) / this.zoom,
            y: (sy - this.offset.y) / this.zoom,
        };
    }

    /** Get the world-space bounding box for the current viewport */
    private getWorldViewport(): BBox {
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(w, h);
        return { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
    }

    /* ------------------------------------------------------------------ */
    /*  Data fetching                                                      */
    /* ------------------------------------------------------------------ */

    private scheduleFetch() {
        clearTimeout(this.fetchTimer);
        this.fetchTimer = window.setTimeout(() => this.fetchViewport(), FETCH_DEBOUNCE);
    }

    /** Only schedule a fetch if the viewport is near the edge of loaded data */
    private needsFetch(): boolean {
        if (!this.loadedExtent) return true;
        const vp = this.getWorldViewport();
        const ex = this.loadedExtent;
        const marginX = (ex.maxX - ex.minX) * 0.2;
        const marginY = (ex.maxY - ex.minY) * 0.2;
        return (
            vp.minX < ex.minX + marginX ||
            vp.maxX > ex.maxX - marginX ||
            vp.minY < ex.minY + marginY ||
            vp.maxY > ex.maxY - marginY
        );
    }

    private scheduleIfNeeded() {
        if (this.needsFetch()) this.scheduleFetch();
    }

    /** Load edges and nodes in parallel on mount */
    private async initialLoad() {
        this.callbacks.onLoadStatus?.('loading');

        let edgesFailed = false;
        const edgesPromise = getAllEdges().catch((err) => {
            console.error('Failed to load edges', err);
            edgesFailed = true;
            return [] as ViewportEdge[];
        });
        const viewportPromise = this.fetchViewport();

        const edges = await edgesPromise;
        if (this.destroyed) return;
        if (edges.length > 0) {
            this.allEdges = edges;
            this.geometryDirty = true;
            this.markDirty();
        }
        const viewportOk = await viewportPromise;
        if (this.destroyed) return;

        /* First visit (no saved view): land on the user's own node */
        if (!this.hadSavedView && this.allNodes.length > 0) {
            this.hadSavedView = true;
            if (this.allNodes.some((n) => n.id === this.centerId)) {
                this.jumpToNode(this.centerId, 0.9);
            } else {
                this.fitToTree();
            }
        }

        if (edgesFailed || !viewportOk) {
            this.callbacks.onLoadStatus?.('error');
        } else {
            this.callbacks.onLoadStatus?.('ready');
        }
    }

    private seedAttempted = false;

    private async fetchViewport(): Promise<boolean> {
        if (this.destroyed) return true;
        if (this.fetching) {
            this.refetchQueued = true;
            return true;
        }
        this.fetching = true;
        let succeeded = false;

        /* Full fetch (initial or after invalidate): grab everything and
         * REPLACE local data; subsequent fetches merge viewport + margin. */
        const fullFetch = !this.loadedExtent;
        let minX: number, maxX: number, minY: number, maxY: number;
        if (fullFetch) {
            minX = -1e6; maxX = 1e6; minY = -1e6; maxY = 1e6;
        } else {
            const vp = this.getWorldViewport();
            const w = vp.maxX - vp.minX;
            const h = vp.maxY - vp.minY;
            minX = vp.minX - w; maxX = vp.maxX + w;
            minY = vp.minY - h; maxY = vp.maxY + h;
        }

        this.abortController?.abort();
        this.abortController = new AbortController();

        try {
            let result = await getTreeViewport({
                minX, maxX, minY, maxY,
                zoom: this.zoom,
            });

            if (this.destroyed) return;

            /* Auto-seed: people exist but no layout positions yet */
            if (!this.seedAttempted && result.totalPeople > 0 && result.totalNodes === 0 && this.centerId) {
                this.seedAttempted = true;
                console.log('No layout positions found — running initial recompute…');
                await recomputeLayout(this.centerId);
                if (this.destroyed) return;
                /* Re-fetch edges + nodes now that positions exist */
                this.allEdges = await getAllEdges();
                result = await getTreeViewport({
                    minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6,
                    zoom: this.zoom,
                });
                if (this.destroyed) return;
            }

            if (fullFetch) {
                /* Full reload — replace so deleted people disappear */
                this.allNodes = result.nodes;
            } else {
                /* Partial viewport fetch — merge into cache */
                const nodeMap = new Map<string, ViewportNode>();
                for (const n of this.allNodes) nodeMap.set(n.id, n);
                for (const n of result.nodes) nodeMap.set(n.id, n);
                this.allNodes = Array.from(nodeMap.values());
            }

            /* Expand loadedExtent to be the union of old + new */
            if (this.loadedExtent) {
                this.loadedExtent = {
                    minX: Math.min(this.loadedExtent.minX, minX),
                    maxX: Math.max(this.loadedExtent.maxX, maxX),
                    minY: Math.min(this.loadedExtent.minY, minY),
                    maxY: Math.max(this.loadedExtent.maxY, maxY),
                };
            } else {
                this.loadedExtent = { minX, maxX, minY, maxY };
            }

            this.totalPeople = result.totalPeople;
            this.callbacks.onStats?.({
                totalPeople: this.totalPeople,
                loadedNodes: this.allNodes.length,
            });

            this.geometryDirty = true;
            this.markDirty();
            succeeded = true;
        } catch (err) {
            if ((err as Error).name === 'AbortError') {
                succeeded = true; // superseded by a newer fetch, not a failure
            } else {
                console.error('Viewport fetch failed', err);
            }
        } finally {
            this.fetching = false;
            if (this.refetchQueued && !this.destroyed) {
                this.refetchQueued = false;
                void this.fetchViewport();
            }
        }
        return succeeded;
    }

    /* ------------------------------------------------------------------ */
    /*  Event handlers                                                     */
    /* ------------------------------------------------------------------ */

    private handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = this.canvas.getBoundingClientRect();
        this.zoomAt(
            e.clientX - rect.left,
            e.clientY - rect.top,
            this.zoom * factor,
        );
    };

    private handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        this.dragging = true;
        this.wasDragged = false;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragStartOffset = { ...this.offset };
        this.canvas.style.cursor = 'grabbing';
    };

    private handleMouseMove = (e: MouseEvent) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.wasDragged = true;
        this.offset = {
            x: this.dragStartOffset.x + dx,
            y: this.dragStartOffset.y + dy,
        };
        this.markDirty();
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (this.dragging) {
            this.dragging = false;
            this.canvas.style.cursor = 'grab';
            this.saveView();
            this.scheduleIfNeeded();

            if (!this.wasDragged) {
                this.handleClick(e.clientX, e.clientY);
            }
        }
    };

    /* ---- Touch ---- */

    private handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            this.touchPan = null;
            const d = this.touchDist(e.touches[0], e.touches[1]);
            const rect = this.canvas.getBoundingClientRect();
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
            this.pinch = {
                startDist: d,
                startZoom: this.zoom,
                startMidX: midX,
                startMidY: midY,
                startOffset: { ...this.offset },
            };
        } else if (e.touches.length === 1) {
            e.preventDefault();
            this.pinch = null;
            this.touchPan = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                startOffset: { ...this.offset },
            };
            this.wasDragged = false;
        }
    };

    private handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length === 2 && this.pinch) {
            e.preventDefault();
            const d = this.touchDist(e.touches[0], e.touches[1]);
            const scale = d / this.pinch.startDist;
            const newZoom = this.clampZoom(this.pinch.startZoom * scale);
            const effectiveScale = newZoom / this.pinch.startZoom;

            this.offset = {
                x: this.pinch.startMidX - ((this.pinch.startMidX - this.pinch.startOffset.x)) * effectiveScale,
                y: this.pinch.startMidY - ((this.pinch.startMidY - this.pinch.startOffset.y)) * effectiveScale,
            };
            this.zoom = newZoom;
            this.markDirty();
        } else if (e.touches.length === 1 && this.touchPan) {
            e.preventDefault();
            const dx = e.touches[0].clientX - this.touchPan.startX;
            const dy = e.touches[0].clientY - this.touchPan.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.wasDragged = true;
            this.offset = {
                x: this.touchPan.startOffset.x + dx,
                y: this.touchPan.startOffset.y + dy,
            };
            this.markDirty();
        }
    };

    private handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2) this.pinch = null;
        if (e.touches.length === 0) {
            if (this.touchPan && !this.wasDragged && e.changedTouches.length === 1) {
                const t = e.changedTouches[0];
                this.handleClick(t.clientX, t.clientY);
            }
            this.touchPan = null;
            this.saveView();
            this.scheduleIfNeeded();
        }
    };

    private touchDist(a: Touch, b: Touch): number {
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    /* ---- Hit-testing ---- */

    private handleClick(clientX: number, clientY: number) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        const world = this.screenToWorld(sx, sy);

        /* Find closest node within hit radius */
        const hitRadius = Math.max(30 / this.zoom, HIT_HALF_W);
        let closest: ViewportNode | null = null;
        let closestDist = hitRadius;

        for (const node of this.allNodes) {
            const d = Math.hypot(node.x - world.x, node.y - world.y);
            if (d < closestDist) {
                closestDist = d;
                closest = node;
            }
        }

        const now = Date.now();
        if (closest) {
            if (this.lastTapId === closest.id && now - this.lastTapTime < 300) {
                /* Double-tap → open profile */
                this.callbacks.onPersonOpen(closest.id);
                this.lastTapTime = 0;
                this.lastTapId = null;
            } else {
                /* Single tap → select */
                this.lastTapTime = now;
                this.lastTapId = closest.id;
                this.selectedId = closest.id;
                this.callbacks.onPersonSelect(closest.id);
                this.markDirty();
            }
        } else {
            /* Tap on background → deselect */
            this.lastTapTime = 0;
            this.lastTapId = null;
            this.selectedId = null;
            this.callbacks.onPersonSelect(null);
            this.markDirty();
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Render scheduling — draw only when dirty                           */
    /* ------------------------------------------------------------------ */

    private markDirty() {
        this.dirty = true;
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(this.frame);
        }
    }

    private frame = () => {
        this.rafId = 0;
        if (this.destroyed) return;
        if (this.dirty) {
            this.dirty = false;
            this.draw();
            this.callbacks.onViewChange?.();
        }
    };

    /* ------------------------------------------------------------------ */
    /*  Geometry cache                                                     */
    /* ------------------------------------------------------------------ */

    private rebuildGeometry() {
        this.geometryDirty = false;
        this.spouseLines = [];
        this.brackets = [];

        const nodeMap = new Map<string, ViewportNode>();
        for (const n of this.allNodes) {
            if (this.focusSet && !this.focusSet.has(n.id)) continue;
            nodeMap.set(n.id, n);
        }

        /* ---- Spouse lines (deduped pairs) ---- */
        const drawnSpouses = new Set<string>();
        /* ---- Child → parents in a single pass ---- */
        const childParents = new Map<string, string[]>();

        for (const edge of this.allEdges) {
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

                if (gap <= 420) {
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

                this.spouseLines.push({
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

        /* ---- Pre-compute bracket geometry ---- */
        interface RawBracket {
            familyKey: string;
            junctionX: number;
            parentBottomY: number;
            childTopY: number;
            children: ViewportNode[];
            color: string;
        }
        const rawBrackets: RawBracket[] = [];

        for (const [familyKey, family] of familyMap) {
            const parentPositions = family.parentIds
                .map((id) => nodeMap.get(id))
                .filter((n): n is ViewportNode => !!n);
            if (parentPositions.length === 0) continue;

            const children = family.childIds
                .map((id) => nodeMap.get(id))
                .filter((n): n is ViewportNode => !!n)
                .sort((a, b) => a.x - b.x);
            if (children.length === 0) continue;

            const junctionX =
                parentPositions.reduce((s, p) => s + p.x, 0) / parentPositions.length;
            const parentBottomY = Math.max(...parentPositions.map((p) => p.y)) + NODE_BOTTOM;
            const childTopY = Math.min(...children.map((c) => c.y)) - NODE_TOP;

            /* Stable color: hash the family key */
            let h = 0;
            for (let i = 0; i < familyKey.length; i++) h = ((h << 5) - h + familyKey.charCodeAt(i)) | 0;
            const color = BRACKET_PALETTE[((h % BRACKET_PALETTE.length) + BRACKET_PALETTE.length) % BRACKET_PALETTE.length];

            rawBrackets.push({ familyKey, junctionX, parentBottomY, childTopY, children, color });
        }

        /* ---- Stagger: distinct horizontal-bar Y per family within a band ---- */
        const STAGGER_STEP = 22;
        const bandKey = (b: RawBracket) =>
            `${Math.round(b.parentBottomY)}:${Math.round(b.childTopY)}`;
        const bandGroups = new Map<string, RawBracket[]>();
        for (const b of rawBrackets) {
            const k = bandKey(b);
            const group = bandGroups.get(k);
            if (group) group.push(b);
            else bandGroups.set(k, [b]);
        }

        const barYMap = new Map<string, number>();
        for (const group of bandGroups.values()) {
            if (group.length === 0) continue;
            group.sort((a, b) => a.junctionX - b.junctionX);
            const gapTop = group[0].parentBottomY;
            const gapBot = group[0].childTopY;
            const gapH = gapBot - gapTop;
            const margin = gapH * 0.22;
            const usable = gapH - 2 * margin;
            const step = group.length > 1
                ? Math.min(STAGGER_STEP, usable / (group.length - 1))
                : 0;
            const totalSpan = step * (group.length - 1);
            const startY = gapTop + margin + (usable - totalSpan) / 2;
            for (let i = 0; i < group.length; i++) {
                barYMap.set(group[i].familyKey, startY + i * step);
            }
        }

        for (const b of rawBrackets) {
            const barY = barYMap.get(b.familyKey) ?? (b.parentBottomY + b.childTopY) / 2;
            const drops = b.children.map((c) => ({ x: c.x, topY: c.y - NODE_TOP }));

            let minX = b.junctionX, maxX = b.junctionX;
            for (const d of drops) {
                if (d.x < minX) minX = d.x;
                if (d.x > maxX) maxX = d.x;
            }

            const memberIds = new Set<string>(b.familyKey.split(','));
            for (const c of b.children) memberIds.add(c.id);

            this.brackets.push({
                color: b.color,
                stemX: b.junctionX,
                stemTopY: b.parentBottomY,
                barY,
                drops,
                memberIds,
                bbox: {
                    minX,
                    maxX,
                    minY: b.parentBottomY,
                    maxY: Math.max(...drops.map((d) => d.topY), barY),
                },
            });
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Drawing                                                            */
    /* ------------------------------------------------------------------ */

    private draw() {
        if (this.geometryDirty) this.rebuildGeometry();

        const ctx = this.ctx;
        const dpr = this.dpr;
        const w = this.canvas.width / dpr;
        const h = this.canvas.height / dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        /* Background + dot grid */
        this.drawBackground(ctx, w, h);

        /* Apply world transform */
        ctx.save();
        ctx.translate(this.offset.x, this.offset.y);
        ctx.scale(this.zoom, this.zoom);

        /* Determine LOD level */
        const lod: 'far' | 'mid' | 'close' =
            this.zoom < LOD_FAR ? 'far' :
                this.zoom < LOD_MID ? 'mid' : 'close';

        /* Cull to visible viewport (with margin) */
        const vp = this.getWorldViewport();
        const margin = 200 / Math.max(this.zoom, 0.05);

        const visibleNodes = this.allNodes.filter(
            (n) =>
                (!this.focusSet || this.focusSet.has(n.id)) &&
                n.x >= vp.minX - margin &&
                n.x <= vp.maxX + margin &&
                n.y >= vp.minY - margin &&
                n.y <= vp.maxY + margin,
        );

        /* Draw edges (cached geometry, culled) */
        this.drawEdges(ctx, lod, vp, margin);

        /* Draw nodes */
        for (const node of visibleNodes) {
            this.drawNode(ctx, node, lod);
        }

        ctx.restore();
    }

    /* ---- Background dots (pattern tile — one fill instead of N arcs) ---- */

    private drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, w, h);

        const gridSize = 22 * this.zoom;
        if (gridSize < 5) return; // dots too tiny to matter

        if (!this.gridPattern || Math.abs(gridSize - this.gridPatternSize) > 0.25) {
            const tile = document.createElement('canvas');
            const ts = Math.max(2, Math.round(gridSize * this.dpr));
            tile.width = ts;
            tile.height = ts;
            const tctx = tile.getContext('2d')!;
            tctx.fillStyle = COLOR_GRID_DOT;
            tctx.beginPath();
            tctx.arc(ts / 2, ts / 2, Math.max(1, this.dpr), 0, Math.PI * 2);
            tctx.fill();
            this.gridPattern = ctx.createPattern(tile, 'repeat');
            this.gridPatternSize = gridSize;
        }

        if (!this.gridPattern) return;

        const actual = this.gridPatternSize;
        const phaseX = this.offset.x % actual;
        const phaseY = this.offset.y % actual;

        ctx.save();
        ctx.translate(phaseX, phaseY);
        /* Pattern tile is dpr-scaled: draw it back at CSS pixel size */
        ctx.scale(1 / this.dpr, 1 / this.dpr);
        ctx.fillStyle = this.gridPattern;
        ctx.fillRect(
            -actual * this.dpr * 2,
            -actual * this.dpr * 2,
            (w + actual * 4) * this.dpr,
            (h + actual * 4) * this.dpr,
        );
        ctx.restore();
    }

    /* ---- Edge drawing (replays cached geometry) ---- */

    private drawEdges(
        ctx: CanvasRenderingContext2D,
        lod: 'far' | 'mid' | 'close',
        vp: BBox,
        margin: number,
    ) {
        const selected = this.selectedId;

        /* ---- Parent-child brackets (muted; selected family colored) ---- */
        const highlighted: BracketGeom[] = [];

        for (const b of this.brackets) {
            if (!bboxVisible(b.bbox, vp, margin)) continue;
            if (selected && b.memberIds.has(selected)) {
                highlighted.push(b);
                continue; // draw on top later
            }

            ctx.strokeStyle = lod === 'far' ? COLOR_FAR_EDGE : COLOR_EDGE_MUTED;
            ctx.lineWidth = lod === 'far' ? 1.2 / this.zoom : 1.25;
            this.strokeBracket(ctx, b);
        }

        for (const b of highlighted) {
            ctx.strokeStyle = b.color;
            ctx.lineWidth = lod === 'far' ? 2 / this.zoom : 2.25;
            this.strokeBracket(ctx, b);
        }

        /* ---- Spouse lines ---- */
        for (const line of this.spouseLines) {
            if (!bboxVisible(line.bbox, vp, margin)) continue;

            const isActive =
                selected !== null &&
                (line.aId === selected || line.bId === selected);

            if (lod === 'far') {
                ctx.strokeStyle = COLOR_FAR_EDGE;
                ctx.lineWidth = 1.2 / this.zoom;
                ctx.setLineDash([]);
            } else if (line.isEx) {
                ctx.strokeStyle = isActive ? COLOR_SPOUSE_EX : '#f3c6cd';
                ctx.lineWidth = isActive ? 2 : 1.5;
                ctx.setLineDash([5, 5]);
            } else {
                ctx.strokeStyle = isActive ? COLOR_SPOUSE_ACTIVE : COLOR_SPOUSE_MUTED;
                ctx.lineWidth = isActive ? 2.25 : 1.5;
                ctx.setLineDash([]);
            }

            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(line.points[0].x, line.points[0].y);
            for (let i = 1; i < line.points.length; i++) {
                ctx.lineTo(line.points[i].x, line.points[i].y);
            }
            ctx.stroke();

            if (lod !== 'far') {
                if (line.isEx) {
                    /* Divorced — chip with ✕ */
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.arc(line.markX, line.markY, 8, 0, Math.PI * 2);
                    ctx.fillStyle = COLOR_BG;
                    ctx.fill();
                    ctx.strokeStyle = isActive ? COLOR_SPOUSE_EX : '#f3c6cd';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    ctx.fillStyle = isActive ? COLOR_SPOUSE_EX : '#e8a2ac';
                    ctx.font = 'bold 9px system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('✕', line.markX, line.markY + 0.5);
                } else {
                    /* Married — small heart dot, brighter when active */
                    ctx.setLineDash([]);
                    ctx.beginPath();
                    ctx.arc(line.markX, line.markY, isActive ? 4.5 : 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = isActive ? COLOR_SPOUSE_ACTIVE : '#e7b6b6';
                    ctx.fill();
                    ctx.strokeStyle = COLOR_BG;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        }
        ctx.setLineDash([]);
    }

    private strokeBracket(ctx: CanvasRenderingContext2D, b: BracketGeom) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();

        /* Vertical stem: parent junction → barY */
        ctx.moveTo(b.stemX, b.stemTopY);
        ctx.lineTo(b.stemX, b.barY);

        /* For each child: horizontal to child X, then vertical down */
        for (const drop of b.drops) {
            ctx.moveTo(b.stemX, b.barY);
            ctx.lineTo(drop.x, b.barY);
            ctx.lineTo(drop.x, drop.topY);
        }

        ctx.stroke();
    }

    /* ---- Node drawing ---- */

    private displayName(node: ViewportNode): { first: string; last: string } {
        if (!this.isUrdu) {
            /* English names always display in capitals */
            return {
                first: (node.firstName || '?').toUpperCase(),
                last: (node.lastName || '').toUpperCase(),
            };
        }
        const key = `${node.firstName}|${node.lastName}`;
        let cached = this.urduCache.get(key);
        if (!cached) {
            cached = `${toUrdu(node.firstName || '')}\u0000${toUrdu(node.lastName || '')}`;
            this.urduCache.set(key, cached);
        }
        const [first, last] = cached.split('\u0000');
        return { first: first || '?', last: last || '' };
    }

    private initials(node: ViewportNode): string {
        const a = (node.firstName || '?').trim()[0] ?? '?';
        const b = (node.lastName || '').trim()[0] ?? '';
        return (a + b).toUpperCase();
    }

    private nameFont(size: number, bold = false): string {
        if (this.isUrdu) {
            return `${bold ? '700 ' : ''}${size}px "Noto Nastaliq Urdu", serif`;
        }
        return `${bold ? '600 ' : ''}${size}px system-ui, -apple-system, sans-serif`;
    }

    private drawNode(ctx: CanvasRenderingContext2D, node: ViewportNode, lod: 'far' | 'mid' | 'close') {
        const isFemale = node.gender === 'female';
        const isSelected = node.id === this.selectedId;
        const isCenter = node.id === this.centerId;

        /* Avatar colors */
        const gradTop = node.isDeceased ? '#d6d3d1' : isFemale ? '#f9a8d4' : '#93c5fd';
        const gradBottom = node.isDeceased ? '#a8a29e' : isFemale ? '#ec4899' : '#3b82f6';
        const flatColor = node.isDeceased ? '#b8b2ac' : isFemale ? '#f472b6' : '#60a5fa';

        if (lod === 'far') {
            /* Colored dot — clamp to a minimum on-screen size */
            const r = Math.max(10, 3.5 / this.zoom);
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fillStyle = flatColor;
            ctx.globalAlpha = node.isDeceased ? 0.55 : 0.95;
            ctx.fill();
            ctx.globalAlpha = 1;

            if (isSelected || isCenter) {
                ctx.strokeStyle = isSelected ? COLOR_SELECTED : COLOR_CENTER;
                ctx.lineWidth = Math.max(2, 1 / this.zoom);
                ctx.stroke();
            }
            return;
        }

        if (lod === 'mid') {
            /* Initials disc + first name */
            const r = 26;
            const cy = node.y - 8;

            const grad = ctx.createLinearGradient(node.x, cy - r, node.x, cy + r);
            grad.addColorStop(0, gradTop);
            grad.addColorStop(1, gradBottom);

            ctx.beginPath();
            ctx.arc(node.x, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = COLOR_SELECTED;
                ctx.lineWidth = 3.5;
            } else if (isCenter) {
                ctx.strokeStyle = COLOR_CENTER;
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
            }
            ctx.stroke();

            /* Initials */
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 16px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.initials(node), node.x, cy + 1);

            /* Name with halo for readability */
            ctx.font = this.nameFont(12);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.lineJoin = 'round';
            const { first } = this.displayName(node);
            ctx.strokeStyle = COLOR_HALO;
            ctx.lineWidth = 3.5;
            ctx.strokeText(first, node.x, node.y + 24, NODE_W);
            ctx.fillStyle = node.isDeceased ? COLOR_NAME_SUB : COLOR_NAME;
            ctx.fillText(first, node.x, node.y + 24, NODE_W);
            return;
        }

        /* ---- Close LOD — floating avatar + labels (no card) ---- */
        const cx = node.x;
        const avatarCy = node.y + AVATAR_CY;

        /* Selection / center glow ring behind the avatar */
        if (isSelected || isCenter) {
            ctx.save();
            ctx.shadowColor = isSelected
                ? 'rgba(5,150,105,0.45)'
                : 'rgba(16,185,129,0.30)';
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(cx, avatarCy, AVATAR_R + 5, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? COLOR_SELECTED : COLOR_CENTER;
            ctx.lineWidth = isSelected ? 3 : 2.5;
            ctx.stroke();
            ctx.restore();
        }

        /* Avatar circle with gender gradient + soft drop shadow */
        const grad = ctx.createLinearGradient(cx, avatarCy - AVATAR_R, cx, avatarCy + AVATAR_R);
        grad.addColorStop(0, gradTop);
        grad.addColorStop(1, gradBottom);

        ctx.save();
        ctx.shadowColor = 'rgba(41,37,36,0.18)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        ctx.beginPath();
        ctx.arc(cx, avatarCy, AVATAR_R, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        /* Crisp white rim */
        ctx.beginPath();
        ctx.arc(cx, avatarCy, AVATAR_R, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        /* Initials inside avatar */
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 21px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.initials(node), cx, avatarCy + 1);

        /* Deceased marker — small muted ring badge */
        if (node.isDeceased) {
            const bx = cx + AVATAR_R - 8;
            const by = avatarCy - AVATAR_R + 8;
            ctx.beginPath();
            ctx.arc(bx, by, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#78716c';
            ctx.fill();
            ctx.strokeStyle = COLOR_BG;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✦', bx, by + 0.5);
        }

        /* Names — halo stroke keeps text readable over grid/lines */
        const { first, last } = this.displayName(node);
        const firstY = node.y + (this.isUrdu ? 30 : 32);
        ctx.font = this.nameFont(13.5, true);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = COLOR_HALO;
        ctx.lineWidth = 4;
        ctx.strokeText(first, cx, firstY, NODE_W + 20);
        ctx.fillStyle = node.isDeceased ? '#78716c' : COLOR_NAME;
        ctx.fillText(first, cx, firstY, NODE_W + 20);

        if (last) {
            const lastY = node.y + (this.isUrdu ? 54 : 50);
            ctx.font = this.nameFont(11);
            ctx.strokeStyle = COLOR_HALO;
            ctx.lineWidth = 3.5;
            ctx.strokeText(last, cx, lastY, NODE_W + 10);
            ctx.fillStyle = COLOR_NAME_SUB;
            ctx.fillText(last, cx, lastY, NODE_W + 10);
        }

        /* "You" chip above the avatar */
        if (isCenter) {
            const chipW = 36;
            const chipH = 16;
            const chipX = cx - chipW / 2;
            const chipY = avatarCy - AVATAR_R - chipH - 4;
            roundRectPath(ctx, chipX, chipY, chipW, chipH, 8);
            ctx.fillStyle = COLOR_CENTER;
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('YOU', cx, chipY + chipH / 2 + 0.5);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Screen-space position for overlay                                  */
    /* ------------------------------------------------------------------ */

    /** Get CSS pixel position of a node relative to the canvas container */
    getNodeScreenPosition(nodeId: string): { x: number; y: number } | null {
        const node = this.allNodes.find((n) => n.id === nodeId);
        if (!node) return null;
        return {
            x: node.x * this.zoom + this.offset.x,
            y: node.y * this.zoom + this.offset.y,
        };
    }

    /** Current zoom (for overlay scaling decisions) */
    getZoom(): number {
        return this.zoom;
    }
}

/**
 * Imperative Canvas 2D renderer for the family tree.
 *
 * Manages a single <canvas> element with a requestAnimationFrame-based
 * render loop.  Fetches visible nodes from the server viewport API and
 * draws them at 3 LOD levels:
 *
 *   Far  (zoom < 0.2)  — coloured dots
 *   Mid  (0.2 – 0.6)   — circles + 1-line name
 *   Close (> 0.6)       — full card with avatar circle, name, indicators
 *
 * Handles pan/zoom via pointer & touch events.  Hit-tests clicks to
 * detect which node was tapped.
 */

import {
    getTreeViewport,
    getAllEdges,
    recomputeLayout,
    type ViewportNode,
    type ViewportEdge,
} from '../services/api-client';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_W = 120;
const NODE_H = 140;
const AVATAR_R = 36; // avatar circle radius (close LOD)

/** LOD thresholds */
const LOD_FAR = 0.2;
const LOD_MID = 0.6;

/** Debounce delay (ms) before fetching after pan/zoom settles */
const FETCH_DEBOUNCE = 500;

const LOCAL_STORAGE_KEY = 'family-tree-canvas-view';

/* Bracket palette — same as the old SVG renderer */
const BRACKET_PALETTE = [
    '#6366f1', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899',
    '#06b6d4', '#f97316', '#14b8a6', '#a855f7', '#3b82f6',
    '#84cc16', '#e11d48',
];

/* ------------------------------------------------------------------ */
/*  Image cache (for avatars at close LOD)                            */
/* ------------------------------------------------------------------ */

const imageCache = new Map<string, HTMLImageElement>();
const imageLoading = new Set<string>();

function getImage(src: string): HTMLImageElement | null {
    const cached = imageCache.get(src);
    if (cached?.complete) return cached;
    if (imageLoading.has(src)) return null;
    imageLoading.add(src);
    const img = new Image();
    img.src = src;
    img.onload = () => {
        imageCache.set(src, img);
        imageLoading.delete(src);
    };
    img.onerror = () => {
        imageLoading.delete(src);
    };
    return null;
}

/* ------------------------------------------------------------------ */
/*  The Renderer                                                       */
/* ------------------------------------------------------------------ */

export interface RendererCallbacks {
    onPersonSelect: (personId: string | null) => void;
    onPersonOpen: (personId: string) => void;
    onOpenAddPersonModal: (personId: string, relation: 'parent' | 'child' | 'spouse' | 'sibling') => void;
    onViewChange?: () => void;
}

export class CanvasTreeRenderer {
    /* DOM */
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private dpr = 1;

    /* Transform: world → screen is  screen = world * zoom + offset */
    private zoom = 1;
    private offset = { x: 0, y: 0 };

    /* Dirty flag — only redraw when true */
    private dirty = true;
    private rafId = 0;

    /* Current data */
    private allNodes: ViewportNode[] = [];
    private allEdges: ViewportEdge[] = [];

    /* Loaded-extent tracking — skip fetches when viewport is inside cached area */
    private loadedExtent: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

    /* Interaction */
    private selectedId: string | null = null;
    private centerId: string = '';
    private callbacks: RendererCallbacks;

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

    /* Cleanup */
    private destroyed = false;
    private abortController: AbortController | null = null;

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

        /* Start render loop */
        this.rafId = requestAnimationFrame(this.frame);

        /* Initial fetch — load all edges once, then nodes */
        this.initialLoad();
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                         */
    /* ------------------------------------------------------------------ */

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.rafId);
        clearTimeout(this.fetchTimer);
        this.abortController?.abort();

        this.canvas.removeEventListener('wheel', this.handleWheel);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        window.removeEventListener('resize', this.handleResize);

        this.canvas.parentElement?.removeChild(this.canvas);
    }

    setSelectedId(id: string | null) {
        if (this.selectedId !== id) {
            this.selectedId = id;
            this.dirty = true;
        }
    }

    setCenterId(id: string) {
        if (this.centerId !== id) {
            this.centerId = id;
        }
    }

    /** Invalidate all cached data and reload from server */
    invalidate() {
        this.allNodes = [];
        this.allEdges = [];
        this.loadedExtent = null;
        this.dirty = true;
        this.initialLoad();
    }

    /** Jump view so a specific node is centered on screen */
    jumpToNode(nodeId: string) {
        const node = this.allNodes.find((n) => n.id === nodeId);
        if (!node) return;
        this.offset = {
            x: this.canvas.width / this.dpr / 2 - node.x * this.zoom,
            y: this.canvas.height / this.dpr / 2 - node.y * this.zoom,
        };
        this.dirty = true;
        this.saveView();
        this.scheduleIfNeeded();
    }

    resetView() {
        const w = this.canvas.width / this.dpr;
        const h = this.canvas.height / this.dpr;
        this.offset = { x: w / 2, y: h / 2 };
        this.zoom = 1;
        this.dirty = true;
        this.saveView();
        this.scheduleIfNeeded();
    }

    /** Get all loaded nodes (for search functionality) */
    getLoadedNodes(): ViewportNode[] {
        return this.allNodes;
    }

    /* ------------------------------------------------------------------ */
    /*  View persistence                                                   */
    /* ------------------------------------------------------------------ */

    private saveView() {
        try {
            localStorage.setItem(
                LOCAL_STORAGE_KEY,
                JSON.stringify({ offset: this.offset, zoom: this.zoom }),
            );
        } catch { /* quota */ }
    }

    private restoreView() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!raw) return;
            const v = JSON.parse(raw);
            if (typeof v.zoom === 'number' && v.offset?.x != null && v.offset?.y != null) {
                this.zoom = v.zoom;
                this.offset = { x: v.offset.x, y: v.offset.y };
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
        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        this.dirty = true;
    }

    private handleResize = () => {
        this.resize();
        this.scheduleIfNeeded();
    };

    /* ------------------------------------------------------------------ */
    /*  Viewport math                                                      */
    /* ------------------------------------------------------------------ */

    /** Screen CSS coordinates → world coordinates */
    private screenToWorld(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - this.offset.x) / this.zoom,
            y: (sy - this.offset.y) / this.zoom,
        };
    }

    /** Get the world-space bounding box for the current viewport */
    private getWorldViewport() {
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

    /** Load all edges once, then kick off initial node fetch */
    private async initialLoad() {
        try {
            const edges = await getAllEdges();
            if (this.destroyed) return;
            this.allEdges = edges;
            this.dirty = true;
        } catch (err) {
            console.error('Failed to load edges', err);
        }
        await this.fetchViewport();
    }

    private seedAttempted = false;

    private async fetchViewport() {
        if (this.destroyed || this.fetching) return;
        this.fetching = true;

        /* First fetch: grab everything; subsequent: viewport + margin */
        let minX: number, maxX: number, minY: number, maxY: number;
        if (!this.loadedExtent) {
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

            /* Merge nodes — never evict old ones */
            const nodeMap = new Map<string, ViewportNode>();
            for (const n of this.allNodes) nodeMap.set(n.id, n);
            for (const n of result.nodes) nodeMap.set(n.id, n);
            this.allNodes = Array.from(nodeMap.values());

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

            this.dirty = true;
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('Viewport fetch failed', err);
            }
        } finally {
            this.fetching = false;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Event handlers                                                     */
    /* ------------------------------------------------------------------ */

    private handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = this.zoom * factor;

        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        this.offset = {
            x: mx - ((mx - this.offset.x) / this.zoom) * newZoom,
            y: my - ((my - this.offset.y) / this.zoom) * newZoom,
        };
        this.zoom = newZoom;
        this.dirty = true;
        this.scheduleIfNeeded();
        this.saveView();
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
        this.dirty = true;
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
            const newZoom = this.pinch.startZoom * scale;

            this.offset = {
                x: this.pinch.startMidX - ((this.pinch.startMidX - this.pinch.startOffset.x) / this.pinch.startZoom) * newZoom,
                y: this.pinch.startMidY - ((this.pinch.startMidY - this.pinch.startOffset.y) / this.pinch.startZoom) * newZoom,
            };
            this.zoom = newZoom;
            this.dirty = true;
        } else if (e.touches.length === 1 && this.touchPan) {
            e.preventDefault();
            const dx = e.touches[0].clientX - this.touchPan.startX;
            const dy = e.touches[0].clientY - this.touchPan.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.wasDragged = true;
            this.offset = {
                x: this.touchPan.startOffset.x + dx,
                y: this.touchPan.startOffset.y + dy,
            };
            this.dirty = true;
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
        const hitRadius = Math.max(30 / this.zoom, NODE_W / 2);
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
                this.dirty = true;
            }
        } else {
            /* Tap on background → deselect */
            this.lastTapTime = 0;
            this.lastTapId = null;
            this.selectedId = null;
            this.callbacks.onPersonSelect(null);
            this.dirty = true;
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Render loop                                                        */
    /* ------------------------------------------------------------------ */

    private frame = () => {
        if (this.destroyed) return;
        if (this.dirty) {
            this.draw();
            this.dirty = false;
            this.callbacks.onViewChange?.();
        }
        this.rafId = requestAnimationFrame(this.frame);
    };

    private draw() {
        const ctx = this.ctx;
        const dpr = this.dpr;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw / dpr, ch / dpr);

        /* Background dots */
        this.drawBackground(ctx, cw / dpr, ch / dpr);

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
                n.x >= vp.minX - margin &&
                n.x <= vp.maxX + margin &&
                n.y >= vp.minY - margin &&
                n.y <= vp.maxY + margin,
        );
        const visibleIds = new Set(visibleNodes.map((n) => n.id));

        /* Draw edges */
        this.drawEdges(ctx, lod, visibleIds);

        /* Draw nodes */
        for (const node of visibleNodes) {
            this.drawNode(ctx, node, lod);
        }

        ctx.restore();
    }

    /* ---- Background dots ---- */

    private drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const gridSize = 20 * this.zoom;
        if (gridSize < 4) return; // dots too tiny

        const startX = this.offset.x % gridSize;
        const startY = this.offset.y % gridSize;

        ctx.fillStyle = '#e2e8f0';
        for (let x = startX; x < w; x += gridSize) {
            for (let y = startY; y < h; y += gridSize) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /* ---- Edge drawing ---- */

    private drawEdges(
        ctx: CanvasRenderingContext2D,
        lod: 'far' | 'mid' | 'close',
        _visibleIds: Set<string>,
    ) {
        /* Build node lookup for positions */
        const nodeMap = new Map<string, ViewportNode>();
        for (const n of this.allNodes) nodeMap.set(n.id, n);

        /* Group edges by type — draw every edge whose BOTH endpoints are loaded.
         * Canvas clipping handles off-screen edges; this prevents edges from
         * appearing / disappearing as the viewport moves. */
        const spouseEdges: ViewportEdge[] = [];
        const parentEdges: ViewportEdge[] = [];

        for (const edge of this.allEdges) {
            if (!nodeMap.has(edge.sourceId) || !nodeMap.has(edge.targetId)) continue;
            if (edge.type === 'SPOUSE') {
                spouseEdges.push(edge);
            } else if (edge.type === 'PARENT') {
                parentEdges.push(edge);
            }
        }

        /* ---- Spouse edges ---- */
        const drawnSpouses = new Set<string>();
        for (const edge of spouseEdges) {
            const key = [edge.sourceId, edge.targetId].sort().join('-');
            if (drawnSpouses.has(key)) continue;
            drawnSpouses.add(key);

            const a = nodeMap.get(edge.sourceId);
            const b = nodeMap.get(edge.targetId);
            if (!a || !b) continue;

            const isEx = edge.status === 'EX';

            if (lod === 'far') {
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1 / this.zoom;
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = isEx ? '#f87171' : '#a5b4fc';
                ctx.lineWidth = isEx ? 1.5 : 2;
                ctx.setLineDash(isEx ? [4, 4] : [6, 3]);
            }

            /* Simple horizontal dashed line between the pair.
             * For far-apart spouses, route ABOVE the nodes to stay clear. */
            const left = a.x < b.x ? a : b;
            const right = a.x < b.x ? b : a;
            const leftEdge = left.x + NODE_W / 2;
            const rightEdge = right.x - NODE_W / 2;
            const midY = (a.y + b.y) / 2;
            const gap = right.x - left.x;

            ctx.beginPath();
            if (gap <= 400) {
                /* Adjacent — simple horizontal line */
                ctx.moveTo(leftEdge, midY);
                ctx.lineTo(rightEdge, midY);
            } else {
                /* Far apart — route above both nodes */
                const routeY = Math.min(a.y, b.y) - NODE_H / 2 - 30;
                ctx.moveTo(leftEdge, midY);
                ctx.lineTo(leftEdge, routeY);
                ctx.lineTo(rightEdge, routeY);
                ctx.lineTo(rightEdge, midY);
            }
            ctx.stroke();

            /* Ex-spouse cross mark */
            if (isEx && lod !== 'far') {
                const mx = (a.x + b.x) / 2;
                const my = gap <= 400 ? midY : Math.min(a.y, b.y) - NODE_H / 2 - 30;
                ctx.fillStyle = '#ef4444';
                ctx.font = 'bold 14px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('✕', mx, my);
            }
        }

        /* ---- Parent-child brackets ---- */
        ctx.setLineDash([]);

        /* Group parents → children for bracket drawing */
        const familyMap = new Map<string, { parentIds: string[]; childIds: string[] }>();
        for (const edge of parentEdges) {
            /* edge: sourceId=parent, targetId=child, type='PARENT' */
            const child = nodeMap.get(edge.targetId);
            if (!child) continue;
            const parentNode = nodeMap.get(edge.sourceId);
            if (!parentNode) continue;

            /* Find all parents of this child (there may be 2) */
            const childParentEdges = parentEdges.filter(e => e.targetId === edge.targetId);
            const parentIds = childParentEdges
                .map(e => e.sourceId)
                .filter(id => nodeMap.has(id))
                .sort();
            const key = parentIds.join(',');

            if (!familyMap.has(key)) {
                familyMap.set(key, { parentIds, childIds: [] });
            }
            const fam = familyMap.get(key)!;
            if (!fam.childIds.includes(edge.targetId)) {
                fam.childIds.push(edge.targetId);
            }
        }

        /* Pre-compute bracket geometry */
        interface BracketInfo {
            familyKey: string;
            junctionX: number;
            parentBottomY: number;
            childTopY: number;
            childPositions: ViewportNode[];
            color: string;
        }

        const brackets: BracketInfo[] = [];

        for (const [familyKey, family] of familyMap) {
            const parentPositions = family.parentIds
                .map(id => nodeMap.get(id))
                .filter((n): n is ViewportNode => !!n);
            if (parentPositions.length === 0) continue;

            const childPositions = family.childIds
                .map(id => nodeMap.get(id))
                .filter((n): n is ViewportNode => !!n)
                .sort((a, b) => a.x - b.x);
            if (childPositions.length === 0) continue;

            const junctionX = parentPositions.reduce((s, p) => s + p.x, 0) / parentPositions.length;
            const parentBottomY = parentPositions[0].y + NODE_H / 2;
            const childTopY = Math.min(...childPositions.map(c => c.y)) - NODE_H / 2;

            /* Stable color: hash the family key */
            let h = 0;
            for (let i = 0; i < familyKey.length; i++) h = ((h << 5) - h + familyKey.charCodeAt(i)) | 0;
            const color = lod === 'far'
                ? '#94a3b8'
                : BRACKET_PALETTE[((h % BRACKET_PALETTE.length) + BRACKET_PALETTE.length) % BRACKET_PALETTE.length];

            brackets.push({ familyKey, junctionX, parentBottomY, childTopY, childPositions, color });
        }

        /* ---- Stagger: assign each family a unique horizontal-bar Y ----
         * The gap between parent-row bottom and child-row top is ~760px
         * (V_GAP 900 - NODE_H 140). All horizontal bars live in this gap
         * at distinct Y levels so they NEVER touch nodes. */
        const STAGGER_STEP = 20;

        const bandKey = (b: BracketInfo) =>
            `${Math.round(b.parentBottomY)}:${Math.round(b.childTopY)}`;
        const bandGroups = new Map<string, BracketInfo[]>();
        for (const b of brackets) {
            const k = bandKey(b);
            if (!bandGroups.has(k)) bandGroups.set(k, []);
            bandGroups.get(k)!.push(b);
        }

        /* Distribute bar Y levels evenly in the middle 60% of the gap */
        const barYMap = new Map<string, number>();
        for (const group of bandGroups.values()) {
            if (group.length === 0) continue;
            group.sort((a, b) => a.junctionX - b.junctionX);
            const gapTop = group[0].parentBottomY;
            const gapBot = group[0].childTopY;
            const gapH = gapBot - gapTop;
            const margin = gapH * 0.2;
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

        /* ---- Draw: only horizontal + vertical lines ----
         *  junction vertical↓ barY horizontal→ childX vertical↓ childTop
         *  All horizontals are in the gap zone where no nodes exist. */
        for (const b of brackets) {
            const barY = barYMap.get(b.familyKey) ??
                (b.parentBottomY + b.childTopY) / 2;

            ctx.strokeStyle = b.color;
            ctx.lineWidth = lod === 'far' ? 1 / this.zoom : 1.5;
            ctx.beginPath();

            /* Vertical stem: parent junction → barY */
            ctx.moveTo(b.junctionX, b.parentBottomY);
            ctx.lineTo(b.junctionX, barY);

            /* For each child: horizontal to child X, then vertical down */
            for (const child of b.childPositions) {
                ctx.moveTo(b.junctionX, barY);
                ctx.lineTo(child.x, barY);
                ctx.moveTo(child.x, barY);
                ctx.lineTo(child.x, child.y - NODE_H / 2);
            }

            ctx.stroke();
        }
    }

    /* ---- Node drawing ---- */

    private drawNode(ctx: CanvasRenderingContext2D, node: ViewportNode, lod: 'far' | 'mid' | 'close') {
        const isFemale = node.gender === 'female';
        const fillColor = isFemale ? '#f472b6' : '#60a5fa';
        const isSelected = node.id === this.selectedId;
        const isCenter = node.id === this.centerId;

        if (lod === 'far') {
            /* Colored dot */
            const r = 10;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
            ctx.fillStyle = fillColor;
            ctx.globalAlpha = node.isDeceased ? 0.4 : 0.9;
            ctx.fill();
            ctx.globalAlpha = 1;

            if (isSelected) {
                ctx.strokeStyle = '#facc15';
                ctx.lineWidth = 3;
            } else if (isCenter) {
                ctx.strokeStyle = '#84cc16';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
            }
            ctx.stroke();
            return;
        }

        if (lod === 'mid') {
            /* Circle + 1-line name */
            const r = 28;
            ctx.beginPath();
            ctx.arc(node.x, node.y - 10, r, 0, Math.PI * 2);
            ctx.fillStyle = node.isDeceased ? '#d1d5db' : fillColor;
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = '#84cc16';
                ctx.lineWidth = 4;
            } else if (isCenter) {
                ctx.strokeStyle = '#84cc16';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
            }
            ctx.stroke();

            /* Name */
            ctx.fillStyle = '#374151';
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const name = node.firstName || '?';
            ctx.fillText(name, node.x, node.y + 24, NODE_W);
            return;
        }

        /* ---- Close LOD — full card ---- */
        const cx = node.x;
        const cy = node.y;
        /* Selection ring */
        if (isSelected) {
            ctx.save();
            ctx.shadowColor = 'rgba(132,204,22,0.4)';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy - 10, AVATAR_R + 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#84cc16';
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();
        }

        /* Avatar circle */
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy - 10, AVATAR_R, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        /* Try drawing loaded avatar image */
        const avatarSrc = isFemale ? '/woman.png' : '/man.png';
        const img = getImage(avatarSrc);
        if (img) {
            if (node.isDeceased) ctx.globalAlpha = 0.5;
            ctx.drawImage(
                img,
                cx - AVATAR_R,
                cy - 10 - AVATAR_R,
                AVATAR_R * 2,
                AVATAR_R * 2,
            );
            ctx.globalAlpha = 1;
        } else {
            /* Fallback colored circle */
            ctx.fillStyle = node.isDeceased ? '#d1d5db' : fillColor;
            ctx.fill();
        }
        ctx.restore();

        /* Border ring */
        ctx.beginPath();
        ctx.arc(cx, cy - 10, AVATAR_R, 0, Math.PI * 2);
        if (isSelected) {
            ctx.strokeStyle = '#84cc16';
            ctx.lineWidth = 4;
        } else if (isCenter) {
            ctx.strokeStyle = '#84cc16';
            ctx.lineWidth = 3;
        } else {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
        }
        ctx.stroke();

        /* Deceased indicator */
        if (node.isDeceased) {
            ctx.globalAlpha = 0.6;
        }

        /* Name label */
        ctx.fillStyle = '#374151';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const displayName = isCenter ? 'me' : (node.firstName || '?');
        ctx.fillText(displayName, cx, cy + AVATAR_R - 2, NODE_W - 10);

        /* Last name (smaller) */
        if (node.lastName) {
            ctx.font = '11px system-ui, sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.fillText(node.lastName, cx, cy + AVATAR_R + 14, NODE_W - 10);
        }

        ctx.globalAlpha = 1;
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
}

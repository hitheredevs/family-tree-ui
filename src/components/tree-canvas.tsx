import { useRef, useState, useEffect, useMemo } from 'react';
import { RefreshCw, LocateFixed } from 'lucide-react';
import { useFamilyTree } from '../state/family-tree-context';
import { computeTreeLayout } from '../utils/tree-layout';
import { PersonNode, NODE_W, NODE_H } from './person-node';

/* ------------------------------------------------------------------ */
/*  Edge data types (pure data, no JSX in the memo)                    */
/* ------------------------------------------------------------------ */

interface SpouseEdge {
	key: string;
	type: 'spouse';
	path: string;
}

interface ParentChildEdge {
	key: string;
	type: 'parent-child';
	path: string;
	junctionX: number;
	childX: number;
	parentBottomY: number;
	midY: number;
	childTopY: number;
	color: string;
}

type EdgeData = SpouseEdge | ParentChildEdge;

/* ------------------------------------------------------------------ */
/*  Edge crossing detection & coloring                                 */
/* ------------------------------------------------------------------ */

const CROSSING_PALETTE = [
	'#6366f1', // indigo
	'#f59e0b', // amber
	'#10b981', // emerald
	'#ef4444', // red
	'#8b5cf6', // violet
	'#ec4899', // pink
	'#06b6d4', // cyan
	'#f97316', // orange
];

const DEFAULT_PC_COLOR = '#94a3b8';

/** Does vertical segment (vx, vy1→vy2) cross horizontal (hy, hx1→hx2)? */
function vhCross(
	vx: number,
	vy1: number,
	vy2: number,
	hy: number,
	hx1: number,
	hx2: number,
): boolean {
	const [vyMin, vyMax] = vy1 < vy2 ? [vy1, vy2] : [vy2, vy1];
	const [hxMin, hxMax] = hx1 < hx2 ? [hx1, hx2] : [hx2, hx1];
	// strict inequalities so shared endpoints don't count
	return vx > hxMin && vx < hxMax && hy > vyMin && hy < vyMax;
}

/** Do two L-shaped parent-child edges cross? */
function pcEdgesCross(a: ParentChildEdge, b: ParentChildEdge): boolean {
	// A's vertical segments vs B's horizontal segment
	if (
		vhCross(a.junctionX, a.parentBottomY, a.midY, b.midY, b.junctionX, b.childX)
	)
		return true;
	if (vhCross(a.childX, a.midY, a.childTopY, b.midY, b.junctionX, b.childX))
		return true;
	// B's vertical segments vs A's horizontal segment
	if (
		vhCross(b.junctionX, b.parentBottomY, b.midY, a.midY, a.junctionX, a.childX)
	)
		return true;
	if (vhCross(b.childX, b.midY, b.childTopY, a.midY, a.junctionX, a.childX))
		return true;
	return false;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const LS_KEY = 'family-tree-canvas-view';

function loadSavedView(): {
	offset: { x: number; y: number };
	zoom: number;
} | null {
	try {
		const raw = localStorage.getItem(LS_KEY);
		if (!raw) return null;
		const v = JSON.parse(raw);
		if (
			typeof v.zoom === 'number' &&
			v.offset?.x != null &&
			v.offset?.y != null
		)
			return v;
	} catch {
		/* ignore */
	}
	return null;
}

export function TreeCanvas({ onPersonOpen }: { onPersonOpen?: () => void }) {
	const { state, dispatch, centerPersonId, refreshTree } = useFamilyTree();
	const containerRef = useRef<HTMLDivElement>(null);

	/* ---- pan / zoom state (restore from localStorage if available) ---- */
	const saved = useRef(loadSavedView());
	const [offset, setOffset] = useState(saved.current?.offset ?? { x: 0, y: 0 });
	const [zoom, setZoom] = useState(saved.current?.zoom ?? 1);
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
	const [wasDragged, setWasDragged] = useState(false);

	/* refs so the native wheel / touch handlers always see latest values */
	const stateRef = useRef({ zoom, offset });
	stateRef.current = { zoom, offset };

	/* pinch zoom ref state */
	const pinchRef = useRef<{
		startDist: number;
		startZoom: number;
		startMidX: number;
		startMidY: number;
		startOffset: { x: number; y: number };
	} | null>(null);

	/* touch-pan ref state (native handlers can't read React state synchronously) */
	const touchPanRef = useRef<{
		startX: number;
		startY: number;
		startOffset: { x: number; y: number };
	} | null>(null);

	/* ---- layout ---- */

	const positions = useMemo(
		() => computeTreeLayout(state.people, centerPersonId),
		[state.people, centerPersonId],
	);

	const positionMap = useMemo(() => {
		const map = new Map<string, { x: number; y: number }>();
		for (const p of positions) {
			map.set(p.personId, { x: p.x, y: p.y });
		}
		return map;
	}, [positions]);

	/* ---- initialise offset to viewport centre (only if no saved view) & track resizes ---- */

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		// Only auto-centre if there was no saved position
		if (!saved.current) {
			const { width, height } = el.getBoundingClientRect();
			setOffset({ x: width / 2, y: height / 2 });
		}
		// Clear the ref so future "Reset View" calls don't fight
		saved.current = null;
	}, []);

	/* ---- persist offset & zoom to localStorage ---- */

	useEffect(() => {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify({ offset, zoom }));
		} catch {
			/* quota errors, ignore */
		}
	}, [offset, zoom]);

	/* ---- native wheel handler (non-passive so we can preventDefault) ---- */

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();
			const { zoom: curZoom, offset: curOffset } = stateRef.current;

			const factor = e.deltaY < 0 ? 1.1 : 0.9;
			const newZoom = curZoom * factor; // no limits – infinite zoom

			const rect = el.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;

			setOffset({
				x: mx - ((mx - curOffset.x) / curZoom) * newZoom,
				y: my - ((my - curOffset.y) / curZoom) * newZoom,
			});
			setZoom(newZoom);
		};

		el.addEventListener('wheel', handleWheel, { passive: false });
		return () => el.removeEventListener('wheel', handleWheel);
	}, []);

	/* ---- native touch handlers (non-passive for preventDefault) ---- */

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		function dist(a: Touch, b: Touch) {
			return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		}

		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 2) {
				e.preventDefault();
				touchPanRef.current = null;
				const d = dist(e.touches[0], e.touches[1]);
				const rect = el.getBoundingClientRect();
				const midX =
					(e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
				const midY =
					(e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
				pinchRef.current = {
					startDist: d,
					startZoom: stateRef.current.zoom,
					startMidX: midX,
					startMidY: midY,
					startOffset: { ...stateRef.current.offset },
				};
			} else if (e.touches.length === 1) {
				pinchRef.current = null;
				touchPanRef.current = {
					startX: e.touches[0].clientX,
					startY: e.touches[0].clientY,
					startOffset: { ...stateRef.current.offset },
				};
				setIsDragging(true);
				setWasDragged(false);
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (e.touches.length === 2 && pinchRef.current) {
				e.preventDefault();
				const d = dist(e.touches[0], e.touches[1]);
				const scale = d / pinchRef.current.startDist;
				const newZoom = pinchRef.current.startZoom * scale; // no limits

				const { startMidX, startMidY, startOffset, startZoom } =
					pinchRef.current;

				setOffset({
					x: startMidX - ((startMidX - startOffset.x) / startZoom) * newZoom,
					y: startMidY - ((startMidY - startOffset.y) / startZoom) * newZoom,
				});
				setZoom(newZoom);
			} else if (e.touches.length === 1 && touchPanRef.current) {
				e.preventDefault();
				const dx = e.touches[0].clientX - touchPanRef.current.startX;
				const dy = e.touches[0].clientY - touchPanRef.current.startY;
				if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setWasDragged(true);
				setOffset({
					x: touchPanRef.current.startOffset.x + dx,
					y: touchPanRef.current.startOffset.y + dy,
				});
			}
		};

		const handleTouchEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) {
				pinchRef.current = null;
			}
			if (e.touches.length === 0) {
				touchPanRef.current = null;
				setIsDragging(false);
			}
		};

		el.addEventListener('touchstart', handleTouchStart, { passive: false });
		el.addEventListener('touchmove', handleTouchMove, { passive: false });
		el.addEventListener('touchend', handleTouchEnd, { passive: false });
		return () => {
			el.removeEventListener('touchstart', handleTouchStart);
			el.removeEventListener('touchmove', handleTouchMove);
			el.removeEventListener('touchend', handleTouchEnd);
		};
	}, []);

	/* ---- mouse handlers for panning ---- */

	function handlePointerDown(clientX: number, clientY: number) {
		setIsDragging(true);
		setWasDragged(false);
		setDragStart({ x: clientX, y: clientY });
		setDragStartOffset({ x: offset.x, y: offset.y });
	}

	function handlePointerMove(clientX: number, clientY: number) {
		if (!isDragging) return;
		const dx = clientX - dragStart.x;
		const dy = clientY - dragStart.y;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) setWasDragged(true);
		setOffset({ x: dragStartOffset.x + dx, y: dragStartOffset.y + dy });
	}

	function handlePointerUp() {
		setIsDragging(false);
	}

	function handleMouseDown(e: React.MouseEvent) {
		if (e.button !== 0) return;
		handlePointerDown(e.clientX, e.clientY);
	}

	function handleMouseMove(e: React.MouseEvent) {
		handlePointerMove(e.clientX, e.clientY);
	}

	function handleMouseUp() {
		handlePointerUp();
	}

	function handleBackgroundClick() {
		if (!wasDragged && state.selectedPersonId) {
			dispatch({ type: 'SELECT_PERSON', personId: null });
		}
	}

	function resetView() {
		if (containerRef.current) {
			const { width, height } = containerRef.current.getBoundingClientRect();
			setOffset({ x: width / 2, y: height / 2 });
			setZoom(1);
		}
	}

	/* ---- compute edges ---- */

	const edgeData = useMemo(() => {
		const result: EdgeData[] = [];
		const drawnSpouses = new Set<string>();

		/* ---- spouse edges ---- */
		for (const person of Object.values(state.people)) {
			if (person.spouseIds && person.spouseIds.length > 0) {
				for (const sid of person.spouseIds) {
					if (positionMap.has(person.id) && positionMap.has(sid)) {
						const key = [person.id, sid].sort().join('-');
						if (!drawnSpouses.has(key)) {
							drawnSpouses.add(key);
							const p1 = positionMap.get(person.id)!;
							const p2 = positionMap.get(sid)!;
							const leftX = Math.min(p1.x, p2.x) + NODE_W / 2;
							const rightX = Math.max(p1.x, p2.x) - NODE_W / 2;
							const y = (p1.y + p2.y) / 2; // same row, so avg is fine

							// If they aren't adjacent, the straight line might cross other people's nodes
							// So we arc it slightly below the node's visual box (y + 80)
							const isAdjacent = Math.abs(p1.x - p2.x) < 300;
							let path = '';
							if (isAdjacent) {
								path = `M ${leftX} ${y} L ${rightX} ${y}`;
							} else {
								const arcY = y + NODE_H / 2 + 10;
								path = `M ${leftX} ${y} L ${leftX} ${arcY} L ${rightX} ${arcY} L ${rightX} ${y}`;
							}

							result.push({
								key,
								type: 'spouse',
								path,
							});
						}
					}
				}
			}
		}

		/* ---- parent-child edges — grouped by parent family (brackets) ---- */
		const familyMap = new Map<
			string,
			{ parentIds: string[]; childIds: string[] }
		>();

		for (const person of Object.values(state.people)) {
			if (person.parentIds.length > 0 && positionMap.has(person.id)) {
				const key = [...person.parentIds].sort().join(',');
				if (!familyMap.has(key)) {
					familyMap.set(key, {
						parentIds: [...person.parentIds].sort(),
						childIds: [],
					});
				}
				familyMap.get(key)!.childIds.push(person.id);
			}
		}

		// Pre-compute each family's geometry
		interface FamilyGeo {
			familyKey: string;
			family: { parentIds: string[]; childIds: string[] };
			parentPositions: { x: number; y: number }[];
			junctionX: number;
			parentBottomY: number;
			closestChildTopY: number;
			childPositions: { id: string; x: number; y: number }[];
		}

		const familyGeos: FamilyGeo[] = [];

		for (const [familyKey, family] of familyMap) {
			const parentPositions = family.parentIds
				.filter((pid) => positionMap.has(pid))
				.map((pid) => positionMap.get(pid)!);

			if (parentPositions.length === 0) continue;

			const junctionX =
				parentPositions.reduce((s, p) => s + p.x, 0) / parentPositions.length;
			const parentBottomY = parentPositions[0].y + NODE_H / 2;

			const childPositions = family.childIds
				.filter((cid) => positionMap.has(cid))
				.map((cid) => ({ id: cid, ...positionMap.get(cid)! }));

			if (childPositions.length === 0) continue;
			childPositions.sort((a, b) => a.x - b.x);

			const closestChildTopY =
				Math.min(...childPositions.map((c) => c.y)) - NODE_H / 2;

			familyGeos.push({
				familyKey,
				family,
				parentPositions,
				junctionX,
				parentBottomY,
				closestChildTopY,
				childPositions,
			});
		}

		// Group families by their row pair layout (so we don't overlap brackets within the same generation gap)
		const rowPairGroups = new Map<string, FamilyGeo[]>();
		for (const fg of familyGeos) {
			const rpKey = `${fg.parentBottomY},${fg.closestChildTopY}`;
			if (!rowPairGroups.has(rpKey)) rowPairGroups.set(rpKey, []);
			rowPairGroups.get(rpKey)!.push(fg);
		}

		// Calculate safe vertical spacing for the bottom bar of each family
		const horizontalBarYMap = new Map<string, number>();
		for (const group of rowPairGroups.values()) {
			group.sort((a, b) => a.junctionX - b.junctionX);

			const pbY = group[0].parentBottomY;
			const ccTY = group[0].closestChildTopY;

			// The top T-bar will be placed at pbY + 25.
			// The spouse arc lines might go down to pbY + 10.
			// We define the safe region for the bottom bars to avoid parent nodes entirely.
			// The safe region starts safely below the parent node's top arrangements.
			const safeTop = pbY + 50;
			// We want the lowest distribution of the children bars to be right above the children
			const safeBottom = ccTY - 40;

			const maxStep = 35;
			const totalNeeded = (group.length - 1) * maxStep;

			if (totalNeeded <= safeBottom - safeTop) {
				// We have plenty of room. Place them starting from safeBottom and staggering upwards
				for (let i = 0; i < group.length; i++) {
					horizontalBarYMap.set(group[i].familyKey, safeBottom - i * maxStep);
				}
			} else {
				// Squeeze them within the safe region so they NEVER overlap nodes
				const step = Math.max(
					10,
					(safeBottom - safeTop) / Math.max(1, group.length - 1),
				);
				for (let i = 0; i < group.length; i++) {
					horizontalBarYMap.set(group[i].familyKey, safeBottom - i * step);
				}
			}
		}

		// Build bracket paths with double T-bar structure
		for (const fg of familyGeos) {
			const bottomBarY =
				horizontalBarYMap.get(fg.familyKey) ?? fg.closestChildTopY - 40;
			const topBarY = fg.parentBottomY + 25;

			// === Top T-bar: stems from each parent's bottom ===
			let path = '';
			for (const pp of fg.parentPositions) {
				path += `M ${pp.x} ${fg.parentBottomY} L ${pp.x} ${topBarY} `;
			}
			// Horizontal bar connecting parent stems (couples)
			if (fg.parentPositions.length > 1) {
				const pxs = fg.parentPositions.map((p) => p.x);
				path += `M ${Math.min(...pxs)} ${topBarY} L ${Math.max(...pxs)} ${topBarY} `;
			}

			// === Vertical connector from junction to bottom bar ===
			path += `M ${fg.junctionX} ${topBarY} L ${fg.junctionX} ${bottomBarY} `;

			// === Bottom inverted T-bar: horizontal bar near children ===
			if (fg.childPositions.length === 1) {
				const child = fg.childPositions[0];
				const childTop = child.y - NODE_H / 2;
				if (child.x !== fg.junctionX) {
					path += `M ${fg.junctionX} ${bottomBarY} L ${child.x} ${bottomBarY} `;
				}
				path += `M ${child.x} ${bottomBarY} L ${child.x} ${childTop}`;
			} else {
				// Horizontal bar spanning all children
				const leftX = Math.min(fg.junctionX, fg.childPositions[0].x);
				const rightX = Math.max(
					fg.junctionX,
					fg.childPositions[fg.childPositions.length - 1].x,
				);
				path += `M ${leftX} ${bottomBarY} L ${rightX} ${bottomBarY} `;

				// Vertical drops to each child
				for (const child of fg.childPositions) {
					const childTop = child.y - NODE_H / 2;
					path += `M ${child.x} ${bottomBarY} L ${child.x} ${childTop} `;
				}
			}

			result.push({
				key: `pc-${fg.familyKey}`,
				type: 'parent-child',
				path,
				junctionX: fg.junctionX,
				childX: fg.childPositions[Math.floor(fg.childPositions.length / 2)].x,
				parentBottomY: fg.parentBottomY,
				midY: bottomBarY,
				childTopY: fg.closestChildTopY,
				color: DEFAULT_PC_COLOR,
			});
		}

		/* ---- detect crossings & assign colours ---- */
		const pcEdges = result.filter(
			(e): e is ParentChildEdge => e.type === 'parent-child',
		);

		// Build adjacency list: which edges cross each other
		const adj = new Map<number, Set<number>>();
		for (let i = 0; i < pcEdges.length; i++) {
			for (let j = i + 1; j < pcEdges.length; j++) {
				if (pcEdgesCross(pcEdges[i], pcEdges[j])) {
					if (!adj.has(i)) adj.set(i, new Set());
					if (!adj.has(j)) adj.set(j, new Set());
					adj.get(i)!.add(j);
					adj.get(j)!.add(i);
				}
			}
		}

		// Greedy graph colouring for crossing edges
		const colorIdx = new Map<number, number>();
		for (const idx of adj.keys()) {
			const used = new Set<number>();
			for (const nb of adj.get(idx)!) {
				if (colorIdx.has(nb)) used.add(colorIdx.get(nb)!);
			}
			let c = 0;
			while (used.has(c)) c++;
			colorIdx.set(idx, c);
		}

		// Apply colours
		for (let i = 0; i < pcEdges.length; i++) {
			if (colorIdx.has(i)) {
				pcEdges[i].color =
					CROSSING_PALETTE[colorIdx.get(i)! % CROSSING_PALETTE.length];
			}
		}

		return result;
	}, [state.people, positionMap]);

	/* ---- dot-grid background ---- */
	const gridSize = 20 * zoom;

	/* ---- render ---- */
	return (
		<div
			ref={containerRef}
			className={`w-full h-full overflow-hidden relative select-none bg-gray-50 touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
			style={{
				backgroundSize: `${gridSize}px ${gridSize}px`,
				backgroundPosition: `${offset.x}px ${offset.y}px`,
				backgroundImage:
					'radial-gradient(circle, #e2e8f0 1px, transparent 1px)',
			}}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseUp}
			onTouchCancel={handlePointerUp}
			onClick={handleBackgroundClick}
		>
			{/* Reset & Refresh buttons */}
			<div className='absolute top-4 right-4 z-10 flex gap-2'>
				<button
					onClick={(e) => {
						e.stopPropagation();
						refreshTree();
					}}
					className='bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors border border-gray-200 flex items-center gap-1.5'
				>
					<RefreshCw size={14} /> Refresh
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						resetView();
					}}
					className='bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors border border-gray-200 flex items-center gap-1.5'
				>
					<LocateFixed size={14} /> Reset
				</button>
			</div>

			{/* Transformed world container */}
			<div
				style={{
					transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
					transformOrigin: '0 0',
					position: 'absolute',
					top: 0,
					left: 0,
				}}
			>
				{/* SVG edge layer */}
				<svg
					style={{
						position: 'absolute',
						overflow: 'visible',
						top: 0,
						left: 0,
						width: 1,
						height: 1,
					}}
				>
					{edgeData.map((edge) =>
						edge.type === 'spouse' ? (
							<path
								key={edge.key}
								d={edge.path}
								fill='none'
								stroke='#a5b4fc'
								strokeWidth={2}
								strokeDasharray='6 3'
							/>
						) : (
							<path
								key={edge.key}
								d={edge.path}
								fill='none'
								stroke={edge.color}
								strokeWidth={edge.color !== DEFAULT_PC_COLOR ? 2.5 : 2}
							/>
						),
					)}
				</svg>

				{/* Person nodes */}
				{positions.map((pos) => (
					<PersonNode
						key={pos.personId}
						person={state.people[pos.personId]}
						x={pos.x}
						y={pos.y}
						isCenter={pos.personId === centerPersonId}
						isSelected={pos.personId === state.selectedPersonId}
						onClick={() => {
							dispatch({ type: 'SELECT_PERSON', personId: pos.personId });
						}}
						onOpen={() => {
							dispatch({ type: 'SELECT_PERSON', personId: pos.personId });
							onPersonOpen?.();
						}}
					/>
				))}
			</div>
		</div>
	);
}

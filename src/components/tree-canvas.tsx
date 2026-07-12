import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
	RefreshCw,
	LocateFixed,
	Search,
	Plus,
	Minus,
	Maximize,
	Users,
	X,
} from 'lucide-react';
import { useFamilyTree } from '../state/family-tree-context';
import { CanvasTreeRenderer } from './canvas-tree-renderer';
import { NodeOverlay } from './node-overlay';
import type { ViewportNode } from '../services/api-client';
import { useLanguage } from '../state/language-context';
import { toUrdu } from '../utils/transliterate';

/* ------------------------------------------------------------------ */
/*  TreeCanvas — thin React wrapper around CanvasTreeRenderer          */
/* ------------------------------------------------------------------ */

const ctrlBtn =
	'flex h-9 w-9 items-center justify-center rounded-xl bg-white/95 text-stone-600 shadow-md shadow-stone-900/5 ring-1 ring-stone-200/70 backdrop-blur-sm transition-all hover:bg-white hover:text-emerald-600 active:scale-95';

export function TreeCanvas({ onPersonOpen }: { onPersonOpen?: () => void }) {
	const { state, dispatch, centerPersonId, refreshTree, treeVersion } =
		useFamilyTree();
	const containerRef = useRef<HTMLDivElement>(null);
	const rendererRef = useRef<CanvasTreeRenderer | null>(null);
	const overlayWrapRef = useRef<HTMLDivElement>(null);
	const selectedIdRef = useRef<string | null>(null);

	/* ---- search state ---- */
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { isUrdu } = useLanguage();

	/* ---- stats badge ---- */
	const [stats, setStats] = useState<{ totalPeople: number } | null>(null);

	/* Overlay mount state — position is set imperatively (no re-render per frame) */
	const [overlayVisible, setOverlayVisible] = useState(false);

	/* ---- imperative overlay sync (called from renderer on every draw) ---- */

	const syncOverlay = useCallback(() => {
		const el = overlayWrapRef.current;
		const renderer = rendererRef.current;
		if (!el || !renderer) return;
		const selectedId = selectedIdRef.current;
		if (!selectedId) {
			el.style.opacity = '0';
			el.style.pointerEvents = 'none';
			return;
		}
		const pos = renderer.getNodeScreenPosition(selectedId);
		if (!pos) {
			el.style.opacity = '0';
			el.style.pointerEvents = 'none';
			return;
		}
		const scale = Math.min(1.35, Math.max(0.8, renderer.getZoom()));
		el.style.opacity = '1';
		el.style.pointerEvents = '';
		el.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(${scale})`;
	}, []);

	/* ---- stable callback refs (avoids re-creating renderer on every render) ---- */

	const callbacksRef = useRef({
		onPersonSelect: (personId: string | null) => {
			dispatch({ type: 'SELECT_PERSON', personId });
		},
		onPersonOpen: (personId: string) => {
			dispatch({ type: 'SELECT_PERSON', personId });
			onPersonOpen?.();
		},
		onOpenAddPersonModal: (
			personId: string,
			relation: 'parent' | 'child' | 'spouse' | 'sibling',
		) => {
			dispatch({
				type: 'OPEN_ADD_PERSON_MODAL',
				relativePersonId: personId,
				relationType: relation,
			});
		},
	});

	/* Keep refs in sync with latest props/dispatch */
	useEffect(() => {
		callbacksRef.current.onPersonSelect = (personId: string | null) => {
			dispatch({ type: 'SELECT_PERSON', personId });
		};
		callbacksRef.current.onPersonOpen = (personId: string) => {
			dispatch({ type: 'SELECT_PERSON', personId });
			onPersonOpen?.();
		};
		callbacksRef.current.onOpenAddPersonModal = (
			personId: string,
			relation: 'parent' | 'child' | 'spouse' | 'sibling',
		) => {
			dispatch({
				type: 'OPEN_ADD_PERSON_MODAL',
				relativePersonId: personId,
				relationType: relation,
			});
		};
	});

	/* ---- mount / unmount renderer ---- */

	useEffect(() => {
		const el = containerRef.current;
		if (!el || !centerPersonId) return;

		const renderer = new CanvasTreeRenderer(
			el,
			{
				onPersonSelect: (id) => callbacksRef.current.onPersonSelect(id),
				onPersonOpen: (id) => callbacksRef.current.onPersonOpen(id),
				onOpenAddPersonModal: (id, rel) =>
					callbacksRef.current.onOpenAddPersonModal(id, rel),
				onViewChange: () => syncOverlay(),
				onStats: (s) => setStats({ totalPeople: s.totalPeople }),
			},
			centerPersonId,
		);

		rendererRef.current = renderer;

		return () => {
			renderer.destroy();
			rendererRef.current = null;
		};
	}, [centerPersonId, syncOverlay]);

	/* ---- language sync ---- */

	useEffect(() => {
		rendererRef.current?.setUrdu(isUrdu);
	}, [isUrdu]);

	/* ---- reload canvas data after tree mutations (add/edit/delete) ---- */

	const lastVersionRef = useRef(treeVersion);
	useEffect(() => {
		if (treeVersion !== lastVersionRef.current) {
			lastVersionRef.current = treeVersion;
			rendererRef.current?.invalidate();
		}
	}, [treeVersion]);

	/* ---- sync selected person to renderer + overlay ---- */

	useEffect(() => {
		selectedIdRef.current = state.selectedPersonId;
		rendererRef.current?.setSelectedId(state.selectedPersonId);
		setOverlayVisible(Boolean(state.selectedPersonId));
		// Position the overlay immediately on selection
		requestAnimationFrame(() => syncOverlay());
	}, [state.selectedPersonId, syncOverlay]);

	/* ---- toolbar handlers ---- */

	const handleRefresh = useCallback(async () => {
		rendererRef.current?.invalidate();
		await refreshTree();
	}, [refreshTree]);

	/* ---- search within loaded nodes ---- */

	const searchResults = useMemo(() => {
		if (!searchQuery.trim() || !rendererRef.current) return [];
		const q = searchQuery.toLowerCase();
		return rendererRef.current
			.getLoadedNodes()
			.filter(
				(n) =>
					n.firstName.toLowerCase().includes(q) ||
					n.lastName.toLowerCase().includes(q),
			)
			.slice(0, 8);
	}, [searchQuery]);

	function jumpToPerson(personId: string) {
		rendererRef.current?.jumpToNode(personId, 0.9);
		dispatch({ type: 'SELECT_PERSON', personId });
		setIsSearchOpen(false);
		setSearchQuery('');
	}

	/* ---- family of the selected person (for overlay navigation) ---- */

	const selectedPerson = state.selectedPersonId
		? (state.people[state.selectedPersonId] ?? null)
		: null;

	const overlayParents = useMemo(() => {
		if (!selectedPerson) return [];
		return (selectedPerson.parentIds ?? [])
			.map((id) => state.people[id])
			.filter(Boolean);
	}, [selectedPerson, state.people]);

	const overlaySiblings = useMemo(() => {
		if (!selectedPerson) return [];
		const seen = new Map<string, (typeof state.people)[string]>();
		for (const parentId of selectedPerson.parentIds ?? []) {
			const parent = state.people[parentId];
			for (const childId of parent?.childrenIds ?? []) {
				if (childId === selectedPerson.id || seen.has(childId)) continue;
				const child = state.people[childId];
				if (child) seen.set(childId, child);
			}
		}
		return [...seen.values()];
	}, [selectedPerson, state.people]);

	const overlayKids = useMemo(() => {
		if (!selectedPerson) return [];
		return (selectedPerson.childrenIds ?? [])
			.map((id) => state.people[id])
			.filter(Boolean);
	}, [selectedPerson, state.people]);

	const goToPerson = useCallback(
		(personId: string) => {
			dispatch({ type: 'SELECT_PERSON', personId });
			rendererRef.current?.jumpToNode(personId);
		},
		[dispatch],
	);

	/* ---- render ---- */

	return (
		<div
			ref={containerRef}
			className='w-full h-full overflow-hidden relative select-none touch-none'
			style={{ background: '#faf9f7' }}
		>
			{/* ── Top-right: search + refresh ── */}
			<div className='absolute top-4 right-4 z-10 flex gap-2'>
				<div className='relative flex items-center h-9'>
					{isSearchOpen ? (
						<div className='flex items-center bg-white/95 backdrop-blur-sm rounded-xl ring-1 ring-stone-200/70 shadow-md shadow-stone-900/5 px-2 h-full'>
							<Search size={14} className='text-stone-400 ml-1 shrink-0' />
							<input
								ref={searchInputRef}
								type='text'
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder='Find someone…'
								autoFocus
								className='bg-transparent border-none focus:ring-0 text-sm py-1 px-2 w-[130px] sm:w-52 outline-none text-stone-800 placeholder:text-stone-400'
							/>
							<button
								onClick={() => {
									setIsSearchOpen(false);
									setSearchQuery('');
								}}
								className='p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100'
							>
								<X size={14} />
							</button>
						</div>
					) : (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setIsSearchOpen(true);
							}}
							className='flex items-center gap-1.5 h-full px-3 rounded-xl bg-white/95 text-sm font-medium text-stone-600 shadow-md shadow-stone-900/5 ring-1 ring-stone-200/70 backdrop-blur-sm transition-all hover:text-emerald-600 active:scale-95'
						>
							<Search size={14} />
							<span className='hidden sm:inline'>Search</span>
						</button>
					)}

					{/* Search Results */}
					{isSearchOpen && searchResults.length > 0 && (
						<div className='absolute top-full mt-2 right-0 w-[260px] sm:w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl shadow-stone-900/10 ring-1 ring-stone-200/70 overflow-hidden py-1.5 z-50'>
							{searchResults.map((p: ViewportNode) => (
								<button
									key={p.id}
									onMouseDown={(e) => {
										e.preventDefault();
										e.stopPropagation();
										jumpToPerson(p.id);
									}}
									className='w-full text-left px-3.5 py-2 hover:bg-emerald-50/70 focus:bg-emerald-50/70 transition-colors text-sm flex items-center gap-3'
								>
									<div
										className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-bold bg-gradient-to-b ${
											p.gender === 'female'
												? 'from-pink-300 to-pink-500'
												: 'from-blue-300 to-blue-500'
										}`}
									>
										{(p.firstName?.[0] ?? '?').toUpperCase()}
									</div>
									<div className='min-w-0'>
										<div className='font-semibold text-stone-800 truncate'>
											{isUrdu ? (
												<span
													style={{
														fontFamily: "'Noto Nastaliq Urdu', serif",
														direction: 'rtl' as const,
													}}
												>
													{toUrdu(`${p.firstName} ${p.lastName || ''}`.trim())}
												</span>
											) : (
												`${p.firstName} ${p.lastName || ''}`.trim()
											)}
										</div>
									</div>
								</button>
							))}
						</div>
					)}
				</div>

				<button
					onClick={(e) => {
						e.stopPropagation();
						handleRefresh();
					}}
					title='Refresh tree'
					className={ctrlBtn}
				>
					<RefreshCw size={15} />
				</button>
			</div>

			{/* ── Bottom-right: zoom / fit / locate ── */}
			<div className='absolute bottom-6 right-4 z-10 flex flex-col gap-1.5'>
				<button
					onClick={() => rendererRef.current?.zoomBy(1.3)}
					title='Zoom in'
					className={ctrlBtn}
				>
					<Plus size={16} />
				</button>
				<button
					onClick={() => rendererRef.current?.zoomBy(1 / 1.3)}
					title='Zoom out'
					className={ctrlBtn}
				>
					<Minus size={16} />
				</button>
				<button
					onClick={() => rendererRef.current?.fitToTree()}
					title='Fit whole family'
					className={ctrlBtn}
				>
					<Maximize size={15} />
				</button>
				<button
					onClick={() => rendererRef.current?.locateCenter()}
					title='Go to me'
					className={ctrlBtn}
				>
					<LocateFixed size={15} />
				</button>
			</div>

			{/* ── Bottom-left: member count ── */}
			{stats && stats.totalPeople > 0 && (
				<div className='absolute bottom-6 left-4 z-10 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-500 shadow-md shadow-stone-900/5 ring-1 ring-stone-200/70 backdrop-blur-sm'>
					<Users size={13} className='text-emerald-500' />
					{stats.totalPeople} family members
				</div>
			)}

			{/* Node overlay — floating action buttons around selected node.
			    Position is driven imperatively via transform for smooth panning. */}
			<div
				ref={overlayWrapRef}
				className='absolute left-0 top-0 z-20'
				style={{ willChange: 'transform', opacity: 0 }}
			>
				{overlayVisible && state.selectedPersonId && (
					<NodeOverlay
						key={state.selectedPersonId}
						personId={state.selectedPersonId}
						parents={overlayParents}
						siblings={overlaySiblings}
						kids={overlayKids}
						canEdit={
							state.isAdminMode && state.currentUser?.role === 'admin'
						}
						onAddRelation={(id, rel) =>
							callbacksRef.current.onOpenAddPersonModal(id, rel)
						}
						onOpenProfile={(id) => callbacksRef.current.onPersonOpen(id)}
						onGoToPerson={goToPerson}
					/>
				)}
			</div>
		</div>
	);
}

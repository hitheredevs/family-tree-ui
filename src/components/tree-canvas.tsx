import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, LocateFixed, Search } from 'lucide-react';
import { useFamilyTree } from '../state/family-tree-context';
import { CanvasTreeRenderer } from './canvas-tree-renderer';
import { NodeOverlay } from './node-overlay';
import type { ViewportNode } from '../services/api-client';
import { useLanguage } from '../state/language-context';
import { toUrdu } from '../utils/transliterate';

/* ------------------------------------------------------------------ */
/*  TreeCanvas — thin React wrapper around CanvasTreeRenderer          */
/* ------------------------------------------------------------------ */

export function TreeCanvas({ onPersonOpen }: { onPersonOpen?: () => void }) {
	const { state, dispatch, centerPersonId, refreshTree } = useFamilyTree();
	const containerRef = useRef<HTMLDivElement>(null);
	const rendererRef = useRef<CanvasTreeRenderer | null>(null);

	/* ---- search state ---- */
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const searchInputRef = useRef<HTMLInputElement>(null);
	const { isUrdu } = useLanguage();

	/* Overlay state — position of the selected node on screen */
	const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(
		null,
	);

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
		onViewChange: undefined as (() => void) | undefined,
	});

	/* ---- helper to sync overlay to current node screen position ---- */

	const updateOverlayPos = useCallback(() => {
		if (state.selectedPersonId && rendererRef.current) {
			const pos = rendererRef.current.getNodeScreenPosition(
				state.selectedPersonId,
			);
			setOverlayPos(pos);
		} else {
			setOverlayPos(null);
		}
	}, [state.selectedPersonId]);

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
		callbacksRef.current.onViewChange = () => {
			updateOverlayPos();
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
				onViewChange: () => callbacksRef.current.onViewChange?.(),
			},
			centerPersonId,
		);

		rendererRef.current = renderer;

		return () => {
			renderer.destroy();
			rendererRef.current = null;
		};
	}, [centerPersonId]);

	/* ---- sync selected person to renderer ---- */

	useEffect(() => {
		rendererRef.current?.setSelectedId(state.selectedPersonId);
		updateOverlayPos();
	}, [state.selectedPersonId, updateOverlayPos]);

	/* ---- refresh handler ---- */

	const handleRefresh = useCallback(async () => {
		await refreshTree();
		rendererRef.current?.invalidate();
	}, [refreshTree]);

	/* ---- reset view ---- */

	const handleReset = useCallback(() => {
		rendererRef.current?.resetView();
	}, []);

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
		rendererRef.current?.jumpToNode(personId);
		dispatch({ type: 'SELECT_PERSON', personId });
		setIsSearchOpen(false);
		setSearchQuery('');
	}

	/* ---- render ---- */

	return (
		<div
			ref={containerRef}
			className='w-full h-full overflow-hidden relative select-none bg-gray-50 touch-none'
		>
			{/* Controls: Search, Refresh, Reset */}
			<div className='absolute top-4 right-4 z-10 flex gap-1.5 sm:gap-2'>
				<div className='relative flex items-center h-8 sm:h-9'>
					{isSearchOpen ? (
						<div className='flex items-center bg-white/90 backdrop-blur-sm rounded-full border border-gray-200 shadow-sm px-2 h-full'>
							<Search size={14} className='text-gray-400 ml-1 shrink-0' />
							<input
								ref={searchInputRef}
								type='text'
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder='Find someone...'
								autoFocus
								onBlur={() => setTimeout(() => setIsSearchOpen(false), 200)}
								className='bg-transparent border-none focus:ring-0 text-sm py-1 px-2 w-[110px] sm:w-48 outline-none'
							/>
						</div>
					) : (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setIsSearchOpen(true);
							}}
							className='bg-white/90 backdrop-blur-sm px-2.5 sm:px-3 h-full rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors border border-gray-200 flex items-center gap-1.5'
						>
							<Search size={14} />{' '}
							<span className='hidden sm:inline'>Search</span>
						</button>
					)}

					{/* Search Results */}
					{isSearchOpen && searchResults.length > 0 && (
						<div className='absolute top-full mt-2 -right-16 sm:right-0 w-[240px] sm:w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden py-1 z-50'>
							{searchResults.map((p: ViewportNode) => (
								<button
									key={p.id}
									onClick={(e) => {
										e.stopPropagation();
										jumpToPerson(p.id);
									}}
									className='w-full text-left px-4 py-2 hover:bg-lime-50 focus:bg-lime-50 transition-colors text-sm flex items-center gap-3'
								>
									<div
										className={`h-8 w-8 rounded-full border border-gray-100 shrink-0 flex items-center justify-center text-white text-xs font-bold ${p.gender === 'female' ? 'bg-pink-400' : 'bg-blue-400'}`}
									>
										{p.firstName?.[0] ?? '?'}
									</div>
									<div className='min-w-0'>
										<div className='font-semibold text-gray-800 truncate'>
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
					className='bg-white/90 backdrop-blur-sm px-2.5 sm:px-3 py-1.5 h-8 sm:h-9 rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors border border-gray-200 flex items-center gap-1.5'
				>
					<RefreshCw size={14} />{' '}
					<span className='hidden sm:inline'>Refresh</span>
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						handleReset();
					}}
					className='bg-white/90 backdrop-blur-sm px-2.5 sm:px-3 py-1.5 h-8 sm:h-9 rounded-full shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors border border-gray-200 flex items-center gap-1.5'
				>
					<LocateFixed size={14} />{' '}
					<span className='hidden sm:inline'>Reset</span>
				</button>
			</div>

			{/* Node overlay — floating action buttons around selected node */}
			{overlayPos && state.selectedPersonId && (
				<NodeOverlay
					screenX={overlayPos.x}
					screenY={overlayPos.y}
					personId={state.selectedPersonId}
					onAddRelation={(id, rel) =>
						callbacksRef.current.onOpenAddPersonModal(id, rel)
					}
				/>
			)}
		</div>
	);
}

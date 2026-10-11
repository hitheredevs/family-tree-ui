/**
 * HTML overlay anchored to a selected canvas node.
 *
 * Two clusters:
 *  - Colorful "+" buttons around the node (Add Parent / Spouse / Child / Sibling)
 *  - Dark navigation pills below:
 *      row 1: Profile | Parents
 *      row 2: Siblings | Children   (each opens a jump-to popup)
 *
 * Only 0–1 instance ever exists in the DOM; its wrapper is positioned
 * imperatively by TreeCanvas.
 */

import { useRef, useState } from 'react';
import { Plus, User, ArrowUp, Users, Baby } from 'lucide-react';
import type { Person } from '../types';
import { useLanguage } from '../state/language-context';
import { toUrdu } from '../utils/transliterate';
import { useFamilyTree } from '../state/family-tree-context';
import { getParentLabel } from '../utils/person-labels';

/** A touch that moves further than this (px) is a scroll/drag, not a tap */
const TAP_SLOP = 10;

interface NodeOverlayProps {
	personId: string;
	parents: Person[];
	siblings: Person[];
	/** The person's children ("children" is reserved for JSX) */
	kids: Person[];
	/** Show the add-relative buttons (admin mode only) */
	canEdit: boolean;
	onAddRelation: (
		personId: string,
		relation: 'parent' | 'child' | 'spouse' | 'sibling',
	) => void;
	onOpenProfile: (personId: string) => void;
	onGoToPerson: (personId: string) => void;
}

const BUTTONS = [
	{
		relation: 'parent' as const,
		label: 'Parent',
		offset: { x: 0, y: -94 },
		chip: 'bg-violet-500',
		delay: '0ms',
	},
	{
		relation: 'spouse' as const,
		label: 'Spouse',
		offset: { x: 100, y: -16 },
		chip: 'bg-pink-500',
		delay: '30ms',
	},
	{
		relation: 'child' as const,
		label: 'Child',
		offset: { x: 0, y: 82 },
		chip: 'bg-sky-500',
		delay: '60ms',
	},
	{
		relation: 'sibling' as const,
		label: 'Sibling',
		offset: { x: -100, y: -16 },
		chip: 'bg-amber-500',
		delay: '90ms',
	},
];

const ROW1_Y = 122;
const ROW2_Y = 158;
const POPUP_Y = 180;
/** Half-distance between the two pills in each row */
const ROW1_X = 52;
const ROW2_X = 66;

const navPillClass =
	'node-overlay-btn pointer-events-auto absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-stone-800 py-1.5 px-3 text-[11px] font-semibold text-white shadow-lg shadow-stone-900/25 transition-all hover:scale-105 hover:bg-stone-700 active:scale-95';

function CountBadge({ n, active }: { n: number; active: boolean }) {
	return (
		<span
			className={`ml-0.5 rounded-full px-1 text-[9px] font-bold ${
				active ? 'bg-white/25 text-white' : 'bg-stone-600 text-stone-200'
			}`}
		>
			{n}
		</span>
	);
}

export function NodeOverlay({
	personId,
	parents,
	siblings,
	kids,
	canEdit,
	onAddRelation,
	onOpenProfile,
	onGoToPerson,
}: NodeOverlayProps) {
	const [popup, setPopup] = useState<'siblings' | 'children' | null>(null);
	const { isUrdu } = useLanguage();

	const hasParents = parents.length > 0;
	const hasSiblings = siblings.length > 0;
	const hasKids = kids.length > 0;

	const displayName = (p: Person) => {
		const name = `${p.firstName} ${p.lastName || ''}`.trim();
		if (!isUrdu) return name;
		return (
			<span
				style={{
					fontFamily: "'Noto Nastaliq Urdu', serif",
					direction: 'rtl' as const,
				}}
			>
				{toUrdu(name)}
			</span>
		);
	};

	const { state } = useFamilyTree();

	/* Tap handler for mouse and touch. On touch it only fires if the finger
	 * stayed put: lifting after scrolling the siblings/children list used
	 * to open whichever person the scroll started on. */
	const touchStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
	const press = (fn: () => void) => ({
		onClick: (e: React.MouseEvent) => {
			e.stopPropagation();
			fn();
		},
		onTouchStart: (e: React.TouchEvent) => {
			const t = e.touches[0];
			touchStart.current = { x: t.clientX, y: t.clientY, moved: false };
		},
		onTouchMove: (e: React.TouchEvent) => {
			const start = touchStart.current;
			const t = e.touches[0];
			if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > TAP_SLOP) {
				start.moved = true;
			}
		},
		onTouchEnd: (e: React.TouchEvent) => {
			e.stopPropagation();
			// Always cancel the follow-up synthetic click, so a short scroll
			// can't still trigger onClick.
			e.preventDefault();
			const start = touchStart.current;
			touchStart.current = null;
			if (start && !start.moved) fn();
		},
		onTouchCancel: () => {
			touchStart.current = null;
		},
	});

	const popupPeople = popup === 'siblings' ? siblings : kids;

	return (
		<div className='absolute pointer-events-none' style={{ left: 0, top: 0 }}>
			{/* ── Add-relative buttons around the node (admin mode only) ── */}
			{canEdit &&
				BUTTONS.map((btn) => (
				<button
					key={btn.relation}
					className='node-overlay-btn pointer-events-auto absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-1 pl-1 pr-2.5 text-[11px] font-semibold text-stone-700 shadow-lg shadow-stone-900/15 ring-1 ring-stone-200/80 transition-transform hover:scale-105 active:scale-95'
					style={{
						left: btn.offset.x,
						top: btn.offset.y,
						transform: 'translate(-50%, -50%)',
						animationDelay: btn.delay,
					}}
					{...press(() => onAddRelation(personId, btn.relation))}
				>
					<span
						className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${btn.chip}`}
					>
						<Plus size={12} strokeWidth={3} />
					</span>
					{btn.label}
				</button>
			))}

			{/* ── Row 1: Profile | Parents ── */}

			<button
				className={navPillClass}
				style={{
					left: hasParents ? -ROW1_X : 0,
					top: ROW1_Y,
					transform: 'translate(-50%, -50%)',
					animationDelay: '120ms',
				}}
				{...press(() => onOpenProfile(personId))}
			>
				<User size={12} />
				Profile
			</button>

			{hasParents && (
				<button
					className={navPillClass}
					style={{
						left: ROW1_X,
						top: ROW1_Y,
						transform: 'translate(-50%, -50%)',
						animationDelay: '135ms',
					}}
					{...press(() => onGoToPerson(parents[0].id))}
					title={parents.map((p) => p.firstName.toUpperCase()).join(' & ')}
				>
					<ArrowUp size={12} />
					Parents
				</button>
			)}

			{/* ── Row 2: Siblings | Children ── */}

			{hasSiblings && (
				<button
					className={`${navPillClass} ${popup === 'siblings' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
					style={{
						left: hasKids ? -ROW2_X : 0,
						top: ROW2_Y,
						transform: 'translate(-50%, -50%)',
						animationDelay: '150ms',
					}}
					{...press(() =>
						setPopup((v) => (v === 'siblings' ? null : 'siblings')),
					)}
				>
					<Users size={12} />
					Siblings
					<CountBadge n={siblings.length} active={popup === 'siblings'} />
				</button>
			)}

			{hasKids && (
				<button
					className={`${navPillClass} ${popup === 'children' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
					style={{
						left: hasSiblings ? ROW2_X : 0,
						top: ROW2_Y,
						transform: 'translate(-50%, -50%)',
						animationDelay: '165ms',
					}}
					{...press(() =>
						setPopup((v) => (v === 'children' ? null : 'children')),
					)}
				>
					<Baby size={12} />
					Children
					<CountBadge n={kids.length} active={popup === 'children'} />
				</button>
			)}

			{/* ── Jump-to popup (siblings or children) ── */}
			{popup && popupPeople.length > 0 && (
				<div
					className='node-overlay-btn pointer-events-auto absolute w-52 overflow-hidden rounded-2xl bg-white shadow-xl shadow-stone-900/20 ring-1 ring-stone-200/80'
					style={{
						left: 0,
						top: POPUP_Y,
						transform: 'translate(-50%, 0)',
					}}
				>
					<div className='px-3.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-stone-400'>
						{popup === 'siblings' ? 'Go to sibling' : 'Go to child'}
					</div>
					<div className='max-h-44 touch-pan-y overflow-y-auto overscroll-contain pb-1.5'>
						{popupPeople.map((s) => (
							<button
								key={s.id}
								className='flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-emerald-50/70'
								{...press(() => onGoToPerson(s.id))}
							>
								<span
									className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white bg-gradient-to-b ${
										s.gender === 'female'
											? 'from-pink-300 to-pink-500'
											: 'from-blue-300 to-blue-500'
									} ${s.isDeceased ? 'grayscale' : ''}`}
								>
									{(s.firstName?.[0] ?? '?').toUpperCase()}
								</span>
								<span className='min-w-0'>
									<span className='block truncate text-xs font-semibold text-stone-700 uppercase'>
										{displayName(s)}
									</span>
									<span className='block truncate text-[10px] text-stone-400'>
										{getParentLabel(s, state.people)}
									</span>
								</span>
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

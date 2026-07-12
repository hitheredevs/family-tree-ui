/**
 * HTML overlay anchored to a selected canvas node.
 * Shows spatial action buttons (Add Parent / Spouse / Child / Sibling)
 * plus a "View profile" shortcut. Only 0–1 instance ever exists in the
 * DOM; its wrapper is positioned imperatively by TreeCanvas.
 */

import { Plus, User } from 'lucide-react';

interface NodeOverlayProps {
	personId: string;
	onAddRelation: (
		personId: string,
		relation: 'parent' | 'child' | 'spouse' | 'sibling',
	) => void;
	onOpenProfile: (personId: string) => void;
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

export function NodeOverlay({
	personId,
	onAddRelation,
	onOpenProfile,
}: NodeOverlayProps) {
	return (
		<div className='absolute pointer-events-none' style={{ left: 0, top: 0 }}>
			{BUTTONS.map((btn) => (
				<button
					key={btn.relation}
					className='node-overlay-btn pointer-events-auto absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-1 pl-1 pr-2.5 text-[11px] font-semibold text-stone-700 shadow-lg shadow-stone-900/15 ring-1 ring-stone-200/80 transition-transform hover:scale-105 active:scale-95'
					style={{
						left: btn.offset.x,
						top: btn.offset.y,
						transform: 'translate(-50%, -50%)',
						animationDelay: btn.delay,
					}}
					onClick={(e) => {
						e.stopPropagation();
						onAddRelation(personId, btn.relation);
					}}
					onTouchEnd={(e) => {
						e.stopPropagation();
						e.preventDefault();
						onAddRelation(personId, btn.relation);
					}}
				>
					<span
						className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${btn.chip}`}
					>
						<Plus size={12} strokeWidth={3} />
					</span>
					{btn.label}
				</button>
			))}

			{/* View profile shortcut below the node */}
			<button
				className='node-overlay-btn pointer-events-auto absolute flex items-center gap-1.5 whitespace-nowrap rounded-full bg-stone-800 py-1.5 px-3 text-[11px] font-semibold text-white shadow-lg shadow-stone-900/25 transition-transform hover:scale-105 hover:bg-stone-700 active:scale-95'
				style={{
					left: 0,
					top: 120,
					transform: 'translate(-50%, -50%)',
					animationDelay: '120ms',
				}}
				onClick={(e) => {
					e.stopPropagation();
					onOpenProfile(personId);
				}}
				onTouchEnd={(e) => {
					e.stopPropagation();
					e.preventDefault();
					onOpenProfile(personId);
				}}
			>
				<User size={12} />
				View profile
			</button>
		</div>
	);
}

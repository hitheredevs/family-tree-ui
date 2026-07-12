import { Leaf, Menu, User } from 'lucide-react';
import React from 'react';

interface BottomNavProps {
	onViewChange: (view: 'tree' | 'gallery' | 'profile' | 'menu') => void;
	activeView: 'tree' | 'gallery' | 'profile' | 'menu';
}

export const BottomNav: React.FC<BottomNavProps> = ({
	onViewChange,
	activeView,
}) => {
	const items = [
		{ key: 'menu' as const, icon: Menu, label: 'Menu' },
		{ key: 'tree' as const, icon: Leaf, label: 'Tree', accent: true },
		{ key: 'profile' as const, icon: User, label: 'Profile' },
	];

	return (
		<>
			{/* ── Mobile bottom bar ── */}
			<div
				className='flex md:hidden w-full items-center justify-around border-t border-stone-200/70 bg-white/95 px-2 pt-1.5 backdrop-blur-md'
				style={{ paddingBottom: 'max(0.6rem, env(safe-area-inset-bottom))' }}
			>
				{items.map((item) => {
					const active = activeView === item.key;
					if (item.accent) {
						return (
							<button
								key={item.key}
								onClick={() => onViewChange(item.key)}
								className={`relative -top-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all active:scale-95 ${
									active
										? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-600/30'
										: 'bg-white text-stone-400 ring-1 ring-stone-200 shadow-stone-900/10'
								}`}
							>
								<item.icon size={26} />
							</button>
						);
					}
					return (
						<button
							key={item.key}
							onClick={() => onViewChange(item.key)}
							className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 transition-colors ${
								active ? 'text-emerald-600' : 'text-stone-400'
							}`}
						>
							<item.icon size={22} />
							<span className='text-[10px] font-semibold'>{item.label}</span>
						</button>
					);
				})}
			</div>

			{/* ── Desktop sidebar ── */}
			<div className='hidden md:flex flex-col items-center justify-between w-16 lg:w-56 shrink-0 border-r border-stone-200/70 bg-white py-6'>
				{/* Logo */}
				<div className='flex flex-col items-center lg:items-stretch lg:px-3 gap-1 w-full'>
					<div className='flex items-center gap-2.5 mb-6 lg:px-2'>
						<div className='flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25'>
							<Leaf size={22} />
						</div>
						<span className='hidden lg:block text-lg font-bold text-stone-800 tracking-tight'>
							Family Tree
						</span>
					</div>

					{/* Nav items */}
					{items.map((item) => {
						const active = activeView === item.key;
						return (
							<button
								key={item.key}
								onClick={() => onViewChange(item.key)}
								className={`flex w-full items-center justify-center lg:justify-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
									active
										? 'bg-emerald-50 text-emerald-700'
										: 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
								}`}
							>
								<item.icon size={20} />
								<span className='hidden lg:block text-sm font-semibold'>
									{item.label}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</>
	);
};

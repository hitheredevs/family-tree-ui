import { Leaf, Settings, User } from 'lucide-react';
import React from 'react';

interface BottomNavProps {
	onViewChange: (view: 'tree' | 'gallery' | 'profile' | 'menu') => void;
	activeView: 'tree' | 'gallery' | 'profile' | 'menu';
}

export const BottomNav: React.FC<BottomNavProps> = ({
	onViewChange,
	activeView,
}) => {
	return (
		<>
			{/* ── Mobile bottom bar: Profile | Tree (center) | Settings ── */}
			<div
				className='flex md:hidden w-full items-center justify-around border-t border-stone-200/70 bg-white/95 px-2 pt-1.5 backdrop-blur-md'
				style={{ paddingBottom: 'max(0.6rem, env(safe-area-inset-bottom))' }}
			>
				<button
					onClick={() => onViewChange('profile')}
					className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 transition-colors ${
						activeView === 'profile' ? 'text-emerald-600' : 'text-stone-400'
					}`}
				>
					<User size={22} />
					<span className='text-[10px] font-semibold'>Profile</span>
				</button>

				<button
					onClick={() => onViewChange('tree')}
					className={`relative -top-6 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all active:scale-95 ${
						activeView === 'tree'
							? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-600/30'
							: 'bg-white text-stone-400 ring-1 ring-stone-200 shadow-stone-900/10'
					}`}
				>
					<Leaf size={26} />
				</button>

				<button
					onClick={() => onViewChange('menu')}
					className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 transition-colors ${
						activeView === 'menu' ? 'text-emerald-600' : 'text-stone-400'
					}`}
				>
					<Settings size={22} />
					<span className='text-[10px] font-semibold'>Settings</span>
				</button>
			</div>

			{/* ── Desktop sidebar: Tree first, Settings pinned at the bottom ── */}
			<div className='hidden md:flex flex-col justify-between w-16 lg:w-56 shrink-0 border-r border-stone-200/70 bg-white py-6'>
				<div className='flex flex-col items-center lg:items-stretch lg:px-3 gap-1 w-full'>
					{/* Logo */}
					<div className='flex items-center gap-2.5 mb-6 lg:px-2'>
						<div className='flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/25'>
							<Leaf size={22} />
						</div>
						<span className='hidden lg:block text-lg font-bold text-stone-800 tracking-tight'>
							Family Tree
						</span>
					</div>

					{/* Main navigation */}
					<SidebarItem
						icon={<Leaf size={20} />}
						label='Tree'
						active={activeView === 'tree'}
						onClick={() => onViewChange('tree')}
					/>
					<SidebarItem
						icon={<User size={20} />}
						label='Profile'
						active={activeView === 'profile'}
						onClick={() => onViewChange('profile')}
					/>
				</div>

				{/* Settings pinned to the bottom */}
				<div className='flex flex-col items-center lg:items-stretch lg:px-3 w-full'>
					<SidebarItem
						icon={<Settings size={20} />}
						label='Settings'
						active={activeView === 'menu'}
						onClick={() => onViewChange('menu')}
					/>
				</div>
			</div>
		</>
	);
};

function SidebarItem({
	icon,
	label,
	active,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`flex w-full items-center justify-center lg:justify-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
				active
					? 'bg-emerald-50 text-emerald-700'
					: 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
			}`}
		>
			{icon}
			<span className='hidden lg:block text-sm font-semibold'>{label}</span>
		</button>
	);
}

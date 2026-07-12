import {
	Leaf,
	Settings,
	User,
	Users,
	Sparkles,
	CalendarDays,
	Wrench,
} from 'lucide-react';
import React from 'react';
import { useFamilyTree } from '../../state/family-tree-context';

export type AppView =
	| 'tree'
	| 'people'
	| 'ask'
	| 'events'
	| 'profile'
	| 'menu'
	| 'fixer';

interface BottomNavProps {
	onViewChange: (view: AppView) => void;
	activeView: AppView;
}

export const BottomNav: React.FC<BottomNavProps> = ({
	onViewChange,
	activeView,
}) => {
	const { currentUser } = useFamilyTree();
	const isAdmin = currentUser?.role === 'admin';

	const mobileSide = (
		view: AppView,
		icon: React.ReactNode,
		label: string,
	) => (
		<button
			onClick={() => onViewChange(view)}
			className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-colors ${
				activeView === view ? 'text-emerald-600' : 'text-stone-400'
			}`}
		>
			{icon}
			<span className='text-[10px] font-semibold'>{label}</span>
		</button>
	);

	return (
		<>
			{/* ── Mobile bottom bar: People | Ask | Tree | Events | Profile ── */}
			<div
				className='flex md:hidden w-full items-center justify-around border-t border-stone-200/70 bg-white/95 px-1 pt-1.5 backdrop-blur-md'
				style={{ paddingBottom: 'max(0.6rem, env(safe-area-inset-bottom))' }}
			>
				{mobileSide('people', <Users size={21} />, 'People')}
				{mobileSide('ask', <Sparkles size={21} />, 'Ask')}

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

				{mobileSide('events', <CalendarDays size={21} />, 'Events')}
				{mobileSide('profile', <User size={21} />, 'Profile')}
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

					<SidebarItem
						icon={<Leaf size={20} />}
						label='Tree'
						active={activeView === 'tree'}
						onClick={() => onViewChange('tree')}
					/>
					<SidebarItem
						icon={<Users size={20} />}
						label='People'
						active={activeView === 'people'}
						onClick={() => onViewChange('people')}
					/>
					<SidebarItem
						icon={<Sparkles size={20} />}
						label='Ask'
						active={activeView === 'ask'}
						onClick={() => onViewChange('ask')}
					/>
					<SidebarItem
						icon={<CalendarDays size={20} />}
						label='Events'
						active={activeView === 'events'}
						onClick={() => onViewChange('events')}
					/>
					<SidebarItem
						icon={<User size={20} />}
						label='Profile'
						active={activeView === 'profile'}
						onClick={() => onViewChange('profile')}
					/>
					{isAdmin && (
						<SidebarItem
							icon={<Wrench size={20} />}
							label='Fixer'
							active={activeView === 'fixer'}
							onClick={() => onViewChange('fixer')}
						/>
					)}
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

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
	return (
		<div
			className='flex w-full items-center justify-around rounded-t-3xl bg-white px-2 pt-2 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]'
			style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
		>
			<button
				onClick={() => onViewChange('menu')}
				className={`flex flex-col items-center justify-center space-y-1 ${
					activeView === 'menu' ? 'text-lime-500' : 'text-gray-400'
				}`}
			>
				<Menu size={24} />
			</button>

			<button
				onClick={() => onViewChange('tree')}
				className={`relative -top-8 flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 ${
					activeView === 'tree'
						? 'bg-lime-500 text-white'
						: 'bg-white text-gray-400'
				}`}
			>
				<Leaf size={32} />
			</button>

			<button
				onClick={() => onViewChange('profile')}
				className={`flex flex-col items-center justify-center space-y-1 ${
					activeView === 'profile' ? 'text-lime-500' : 'text-gray-400'
				}`}
			>
				<User size={24} />
			</button>
		</div>
	);
};

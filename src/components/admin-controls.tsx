import { useFamilyTree } from '../state/family-tree-context';

export function AdminControls() {
	const { state, dispatch, currentUser } = useFamilyTree();

	// Only render for admin users
	if (!currentUser || currentUser.role !== 'admin') return null;

	return (
		<div className='absolute bottom-4 left-4 z-10 flex items-center gap-2'>
			{/* Admin-mode toggle */}
			<button
				onClick={(e) => {
					e.stopPropagation();
					dispatch({ type: 'TOGGLE_ADMIN_MODE' });
				}}
				className={[
					'px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all border',
					state.isAdminMode
						? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
						: 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50',
				].join(' ')}
			>
				{state.isAdminMode ? '🔧 Admin Mode ON' : '🔧 Admin Mode'}
			</button>

			{/* Add person (admin mode only) */}
			{state.isAdminMode && (
				<button
					onClick={(e) => {
						e.stopPropagation();
						dispatch({ type: 'OPEN_ADD_PERSON_MODAL' });
					}}
					className='px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium shadow-md hover:bg-indigo-600 transition-colors border border-indigo-600'
				>
					+ Add Person
				</button>
			)}
		</div>
	);
}

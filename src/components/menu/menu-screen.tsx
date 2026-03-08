import React, { useState } from 'react';
import { useFamilyTree } from '../../state/family-tree-context';
import {
	LogOut,
	ShieldAlert,
	UserPlus,
	KeyRound,
	Languages,
} from 'lucide-react';
import { ChangePasswordScreen } from '../change-password-screen';
import { useLanguage } from '../../state/language-context';

interface MenuScreenProps {
	onLogout: () => void;
}

export const MenuScreen: React.FC<MenuScreenProps> = ({ onLogout }) => {
	const { state, dispatch, currentUser } = useFamilyTree();
	const isAdmin = currentUser?.role === 'admin';
	const [showChangePassword, setShowChangePassword] = useState(false);
	const { setLang, isUrdu } = useLanguage();

	if (showChangePassword) {
		return (
			<ChangePasswordScreen onComplete={() => setShowChangePassword(false)} />
		);
	}

	return (
		<div className='flex h-full w-full flex-col bg-gray-50'>
			<div className='mx-auto w-full max-w-2xl px-6 py-8 pb-4'>
				<h1 className='text-2xl font-bold text-gray-800'>Menu</h1>
				<p className='text-sm text-gray-500'>
					Logged in as {currentUser?.username}
				</p>
			</div>

			<div className='flex-1 overflow-y-auto pb-24 md:pb-8'>
				<div className='mx-auto w-full max-w-2xl px-4'>
					{/* Language Toggle */}
					<div className='mb-6 space-y-3'>
						<h2 className='px-2 text-xs font-bold uppercase tracking-wider text-gray-400'>
							Language
						</h2>
						<div className='overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100'>
							<div className='flex items-center justify-between p-4'>
								<div className='flex items-center space-x-3'>
									<div className='rounded-xl bg-sky-50 p-2.5 text-sky-600'>
										<Languages size={20} />
									</div>
									<span className='text-[15px] font-semibold text-gray-800'>
										Display Language
									</span>
								</div>
								{/* Pill toggle */}
								<div className='flex rounded-full bg-gray-100 p-0.5 text-sm font-semibold'>
									<button
										onClick={() => setLang('en')}
										className={`rounded-full px-3 py-1 transition-colors ${
											!isUrdu
												? 'bg-white text-gray-800 shadow-sm'
												: 'text-gray-400'
										}`}
									>
										EN
									</button>
									<button
										onClick={() => setLang('ur')}
										className={`rounded-full px-3 py-1 transition-colors ${
											isUrdu
												? 'bg-white text-gray-800 shadow-sm'
												: 'text-gray-400'
										}`}
										style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}
									>
										اردو
									</button>
								</div>
							</div>
						</div>
					</div>

					{/* Admin Controls */}
					{isAdmin && (
						<div className='mb-6 space-y-3'>
							<h2 className='px-2 text-xs font-bold uppercase tracking-wider text-gray-400'>
								Admin Mode
							</h2>
							<div className='overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100'>
								<button
									onClick={() => dispatch({ type: 'TOGGLE_ADMIN_MODE' })}
									className='flex w-full items-center justify-between p-4 transition-colors hover:bg-gray-50'
								>
									<div className='flex items-center space-x-3'>
										<div
											className={`rounded-xl p-2.5 ${state.isAdminMode ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}
										>
											<ShieldAlert size={20} />
										</div>
										<div className='text-left'>
											<span className='block text-[15px] font-semibold text-gray-800'>
												Admin Editing
											</span>
											<span className='block text-xs text-gray-500'>
												{state.isAdminMode
													? 'Currently enabled'
													: 'Currently disabled'}
											</span>
										</div>
									</div>
									<div
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${state.isAdminMode ? 'bg-amber-500' : 'bg-gray-200'}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.isAdminMode ? 'translate-x-6' : 'translate-x-1'}`}
										/>
									</div>
								</button>

								{state.isAdminMode && (
									<button
										onClick={() => dispatch({ type: 'OPEN_ADD_PERSON_MODAL' })}
										className='flex w-full items-center space-x-3 border-t border-gray-100 p-4 transition-colors hover:bg-gray-50'
									>
										<div className='rounded-xl bg-indigo-50 p-2.5 text-indigo-600'>
											<UserPlus size={20} />
										</div>
										<span className='text-[15px] font-semibold text-gray-800'>
											Add Person to Tree
										</span>
									</button>
								)}
							</div>
						</div>
					)}

					<div className='space-y-3 font-medium flex flex-col'>
						<h2 className='px-2 text-xs font-bold uppercase tracking-wider text-gray-400'>
							Account
						</h2>
						<div className='overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100'>
							<button
								onClick={() => setShowChangePassword(true)}
								className='flex w-full items-center space-x-3 p-4 transition-colors hover:bg-gray-50 text-gray-700'
							>
								<div className='rounded-xl bg-lime-50 p-2.5 text-lime-600'>
									<KeyRound size={20} />
								</div>
								<span className='text-[15px] font-semibold'>
									Change Password
								</span>
							</button>
							<button
								onClick={onLogout}
								className='flex w-full items-center space-x-3 border-t border-gray-100 p-4 transition-colors hover:bg-red-50 hover:text-red-600 text-gray-700'
							>
								<div className='rounded-xl bg-red-50 p-2.5 text-red-500'>
									<LogOut size={20} />
								</div>
								<span className='text-[15px] font-semibold'>Log out</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

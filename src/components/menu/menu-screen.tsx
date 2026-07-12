import React, { useState } from 'react';
import { useFamilyTree } from '../../state/family-tree-context';
import {
	LogOut,
	ShieldAlert,
	UserPlus,
	KeyRound,
	Languages,
	ChevronRight,
} from 'lucide-react';
import { ChangePasswordScreen } from '../change-password-screen';
import { useLanguage } from '../../state/language-context';

interface MenuScreenProps {
	onLogout: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<h2 className='px-2 text-[11px] font-bold uppercase tracking-widest text-stone-400'>
			{children}
		</h2>
	);
}

function Card({ children }: { children: React.ReactNode }) {
	return (
		<div className='overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/60'>
			{children}
		</div>
	);
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
		<div className='flex h-full w-full flex-col bg-stone-50'>
			{/* Header */}
			<div className='mx-auto w-full max-w-2xl px-6 pt-8 pb-5'>
				<h1 className='text-2xl font-bold text-stone-800 tracking-tight'>
					Settings
				</h1>
				<div className='mt-2 flex items-center gap-2.5'>
					<div className='flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm font-bold text-white'>
						{(currentUser?.username?.[0] ?? '?').toUpperCase()}
					</div>
					<div>
						<p className='text-sm font-semibold text-stone-700 leading-tight'>
							{currentUser?.username}
						</p>
						<p className='text-xs text-stone-400 leading-tight'>
							{isAdmin ? 'Administrator' : 'Family member'}
						</p>
					</div>
				</div>
			</div>

			<div className='flex-1 overflow-y-auto pb-24 md:pb-8'>
				<div className='mx-auto w-full max-w-2xl px-4 space-y-6'>
					{/* Language Toggle */}
					<div className='space-y-2.5'>
						<SectionLabel>Language</SectionLabel>
						<Card>
							<div className='flex items-center justify-between p-4'>
								<div className='flex items-center space-x-3'>
									<div className='rounded-xl bg-sky-50 p-2.5 text-sky-600'>
										<Languages size={20} />
									</div>
									<span className='text-[15px] font-semibold text-stone-800'>
										Display Language
									</span>
								</div>
								{/* Pill toggle */}
								<div className='flex rounded-full bg-stone-100 p-0.5 text-sm font-semibold'>
									<button
										onClick={() => setLang('en')}
										className={`rounded-full px-3.5 py-1 transition-all ${
											!isUrdu
												? 'bg-white text-stone-800 shadow-sm'
												: 'text-stone-400'
										}`}
									>
										EN
									</button>
									<button
										onClick={() => setLang('ur')}
										className={`rounded-full px-3.5 py-1 transition-all ${
											isUrdu
												? 'bg-white text-stone-800 shadow-sm'
												: 'text-stone-400'
										}`}
										style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}
									>
										اردو
									</button>
								</div>
							</div>
						</Card>
					</div>

					{/* Admin Controls */}
					{isAdmin && (
						<div className='space-y-2.5'>
							<SectionLabel>Admin</SectionLabel>
							<Card>
								<button
									onClick={() => dispatch({ type: 'TOGGLE_ADMIN_MODE' })}
									className='flex w-full items-center justify-between p-4 transition-colors hover:bg-stone-50'
								>
									<div className='flex items-center space-x-3'>
										<div
											className={`rounded-xl p-2.5 transition-colors ${
												state.isAdminMode
													? 'bg-amber-100 text-amber-600'
													: 'bg-stone-100 text-stone-500'
											}`}
										>
											<ShieldAlert size={20} />
										</div>
										<div className='text-left'>
											<span className='block text-[15px] font-semibold text-stone-800'>
												Admin Editing
											</span>
											<span className='block text-xs text-stone-500'>
												{state.isAdminMode
													? 'Currently enabled'
													: 'Currently disabled'}
											</span>
										</div>
									</div>
									<div
										className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
											state.isAdminMode ? 'bg-amber-500' : 'bg-stone-200'
										}`}
									>
										<span
											className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
												state.isAdminMode ? 'translate-x-6' : 'translate-x-1'
											}`}
										/>
									</div>
								</button>

								{state.isAdminMode && (
									<button
										onClick={() => dispatch({ type: 'OPEN_ADD_PERSON_MODAL' })}
										className='flex w-full items-center justify-between border-t border-stone-100 p-4 transition-colors hover:bg-stone-50'
									>
										<div className='flex items-center space-x-3'>
											<div className='rounded-xl bg-indigo-50 p-2.5 text-indigo-600'>
												<UserPlus size={20} />
											</div>
											<span className='text-[15px] font-semibold text-stone-800'>
												Add Person to Tree
											</span>
										</div>
										<ChevronRight size={18} className='text-stone-300' />
									</button>
								)}
							</Card>
						</div>
					)}

					{/* Account */}
					<div className='space-y-2.5'>
						<SectionLabel>Account</SectionLabel>
						<Card>
							<button
								onClick={() => setShowChangePassword(true)}
								className='flex w-full items-center justify-between p-4 transition-colors hover:bg-stone-50 text-stone-700'
							>
								<div className='flex items-center space-x-3'>
									<div className='rounded-xl bg-emerald-50 p-2.5 text-emerald-600'>
										<KeyRound size={20} />
									</div>
									<span className='text-[15px] font-semibold'>
										Change Password
									</span>
								</div>
								<ChevronRight size={18} className='text-stone-300' />
							</button>
							<button
								onClick={onLogout}
								className='flex w-full items-center space-x-3 border-t border-stone-100 p-4 transition-colors hover:bg-red-50 text-stone-700 hover:text-red-600'
							>
								<div className='rounded-xl bg-red-50 p-2.5 text-red-500'>
									<LogOut size={20} />
								</div>
								<span className='text-[15px] font-semibold'>Log out</span>
							</button>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
};

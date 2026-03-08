import { useState, useEffect, useCallback } from 'react';
import { FamilyTreeProvider, useFamilyTree } from './state/family-tree-context';
import { TreeCanvas } from './components/tree-canvas';
import { MenuScreen } from './components/menu/menu-screen';
import { EditPerson } from './components/edit-person';
import { AddPersonModal } from './components/add-person-modal';
import { ManageRelationshipsModal } from './components/manage-relationships-modal';
import { LoginScreen } from './components/login-screen';
import { ChangePasswordScreen } from './components/change-password-screen';
import { MobileContainer } from './components/layout/mobile-container';
import { BottomNav } from './components/layout/bottom-nav';
import { ProfileScreen } from './components/profile/profile-screen';
import type { User } from './types';
import {
	getToken,
	setToken,
	getMe,
	type LoginResponse,
} from './services/api-client';
import { LanguageProvider } from './state/language-context';

/* ------------------------------------------------------------------ */
/*  Inner content (inside provider — has access to context)            */
/* ------------------------------------------------------------------ */

function AppContent({ onLogout }: { onLogout: () => void }) {
	const { state, dispatch, refreshTree } = useFamilyTree();
	const [activeView, setActiveView] = useState<
		'tree' | 'gallery' | 'profile' | 'menu'
	>('tree');

	// Load tree on mount
	useEffect(() => {
		refreshTree();
	}, [refreshTree]);

	// Global Ctrl+Z undo handler
	const handleUndo = useCallback(async () => {
		const stack = state.undoStack;
		if (stack.length === 0) return;

		const last = stack[stack.length - 1];
		dispatch({ type: 'POP_UNDO' });

		try {
			await last.action();
			await refreshTree();
		} catch (err) {
			console.error('Undo failed:', err);
		}
	}, [state.undoStack, dispatch, refreshTree]);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
				e.preventDefault();
				handleUndo();
			}
		}
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [handleUndo]);

	if (state.loading && Object.keys(state.people).length === 0) {
		return (
			<div className='flex h-screen w-full items-center justify-center bg-gray-50'>
				<div className='text-center'>
					<div className='mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-t-transparent border-lime-500' />
					<p className='text-sm text-gray-500'>Loading family tree…</p>
				</div>
			</div>
		);
	}

	if (state.error && Object.keys(state.people).length === 0) {
		return (
			<div className='flex h-screen w-full items-center justify-center bg-gray-50'>
				<div className='text-center'>
					<p className='mb-4 text-sm text-red-500'>{state.error}</p>
					<button
						onClick={refreshTree}
						className='rounded-lg bg-lime-500 px-4 py-2 text-sm text-white hover:bg-lime-600'
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (state.editingPersonId) {
		return (
			<MobileContainer>
				<EditPerson />
			</MobileContainer>
		);
	}

	return (
		<MobileContainer>
			<div className='relative flex h-full flex-col md:flex-row'>
				{/* Desktop sidebar (left) */}
				<div className='hidden md:flex z-20 shrink-0'>
					<BottomNav
						activeView={activeView}
						onViewChange={(v) => {
							if (v === 'tree') {
								dispatch({ type: 'SELECT_PERSON', personId: null });
							}
							setActiveView(v);
						}}
					/>
				</div>

				{/* View Content */}
				<div className='flex-1 overflow-hidden relative'>
					{/* Always keep tree mounted to preserve position, just hide it if not active */}
					<div
						className={`h-full w-full ${activeView === 'tree' ? 'block' : 'hidden'}`}
					>
						<TreeCanvas onPersonOpen={() => setActiveView('profile')} />
					</div>

					{activeView === 'profile' && <ProfileScreen />}
					{activeView === 'menu' && <MenuScreen onLogout={onLogout} />}
				</div>

				{/* Modals that can appear on top of any view */}
				<AddPersonModal />
				<ManageRelationshipsModal />

				{/* Undo indicator */}
				{state.undoStack.length > 0 && (
					<div className='absolute bottom-24 right-4 md:bottom-4 z-10 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 shadow-md'>
						⌘Z to undo: {state.undoStack[state.undoStack.length - 1].label}
					</div>
				)}

				{/* Mobile bottom navigation */}
				<div className='z-20 shrink-0 md:hidden'>
					<BottomNav
						activeView={activeView}
						onViewChange={(v) => {
							if (v === 'tree') {
								dispatch({ type: 'SELECT_PERSON', personId: null });
							}
							setActiveView(v);
						}}
					/>
				</div>
			</div>
		</MobileContainer>
	);
}

/* ------------------------------------------------------------------ */
/*  Root App — handles auth before mounting provider                    */
/* ------------------------------------------------------------------ */

function App() {
	const [user, setUser] = useState<User | null>(null);
	const [checking, setChecking] = useState(true);

	// On mount: if we have a token, try to restore session
	useEffect(() => {
		const token = getToken();
		if (!token) {
			setChecking(false);
			return;
		}
		getMe()
			.then((u) => setUser(u))
			.catch(() => setToken(null))
			.finally(() => setChecking(false));
	}, []);

	function handleLogin(data: LoginResponse) {
		setUser(data.user);
	}

	function handleLogout() {
		setToken(null);
		setUser(null);
	}

	if (checking) {
		return (
			<div className='w-full h-screen flex items-center justify-center bg-gray-50'>
				<div className='inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin' />
			</div>
		);
	}

	if (!user) {
		return <LoginScreen onLogin={handleLogin} />;
	}

	if (user.mustChangePassword) {
		return (
			<ChangePasswordScreen
				user={user}
				forced
				onLogout={handleLogout}
				onComplete={async () => {
					try {
						const refreshed = await getMe();
						setUser(refreshed);
					} catch {
						setUser({
							...user,
							mustChangePassword: false,
							phoneVerified: true,
						});
					}
				}}
			/>
		);
	}

	return (
		<div className='relative h-full w-full'>
			<LanguageProvider>
				<FamilyTreeProvider initialUser={user}>
					<AppContent onLogout={handleLogout} />
				</FamilyTreeProvider>
			</LanguageProvider>
		</div>
	);
}

export default App;

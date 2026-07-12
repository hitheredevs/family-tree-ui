import { useState, useEffect, useCallback } from 'react';
import { FamilyTreeProvider, useFamilyTree } from './state/family-tree-context';
import { TreeCanvas } from './components/tree-canvas';
import { MenuScreen } from './components/menu/menu-screen';
import { EditPerson } from './components/edit-person';
import { AddPersonModal } from './components/add-person-modal';
import { ManageRelationshipsModal } from './components/manage-relationships-modal';
import { LoginScreen } from './components/login-screen';
import { ChangePasswordScreen } from './components/change-password-screen';
import { PasswordLinkScreen } from './components/password-link-screen';
import { MobileContainer } from './components/layout/mobile-container';
import { BottomNav } from './components/layout/bottom-nav';
import { ProfileScreen } from './components/profile/profile-screen';
import type { User } from './types';
import {
	getToken,
	setToken,
	getMe,
	type LoginResponse,
	type PasswordLinkPurpose,
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

	const handleOpenProfile = useCallback(() => setActiveView('profile'), []);

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
			<div className='flex h-screen w-full flex-col bg-stone-50'>
				{/* Skeleton canvas: ghost family cards + connectors */}
				<div className='relative flex-1 overflow-hidden'>
					<div className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
						<div className='flex flex-col items-center gap-10'>
							<div className='flex gap-8'>
								<div className='skeleton h-28 w-24 rounded-2xl' />
								<div className='skeleton h-28 w-24 rounded-2xl' />
							</div>
							<div className='skeleton h-1 w-40 rounded-full' />
							<div className='flex gap-8'>
								<div className='skeleton h-28 w-24 rounded-2xl' />
								<div className='skeleton h-28 w-24 rounded-2xl' />
								<div className='skeleton h-28 w-24 rounded-2xl' />
							</div>
						</div>
					</div>
					<div className='absolute bottom-10 left-1/2 -translate-x-1/2 text-center'>
						<div className='mb-3 inline-block h-6 w-6 animate-spin rounded-full border-[3px] border-t-transparent border-emerald-500' />
						<p className='text-sm text-stone-500'>Loading your family tree…</p>
					</div>
				</div>
			</div>
		);
	}

	if (state.error && Object.keys(state.people).length === 0) {
		return (
			<div className='flex h-screen w-full items-center justify-center bg-stone-50'>
				<div className='text-center max-w-xs'>
					<p className='mb-4 text-sm text-red-500'>{state.error}</p>
					<button
						onClick={refreshTree}
						className='rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-colors'
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
						<TreeCanvas onPersonOpen={handleOpenProfile} />
					</div>

					{activeView === 'profile' && <ProfileScreen />}
					{activeView === 'menu' && <MenuScreen onLogout={onLogout} />}
				</div>

				{/* Modals that can appear on top of any view */}
				<AddPersonModal />
				<ManageRelationshipsModal />

				{/* Undo indicator */}
				{state.undoStack.length > 0 && (
					<div className='absolute bottom-24 right-4 md:bottom-4 z-10 rounded-xl bg-stone-800/90 px-3 py-1.5 text-xs text-stone-100 shadow-lg backdrop-blur-sm'>
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
	const [credentialLink, setCredentialLink] = useState(() => {
		const params = new URLSearchParams(window.location.search);
		return {
			token: params.get('credentialToken'),
			username: params.get('username') ?? '',
			purpose: params.get('purpose') as PasswordLinkPurpose | null,
		};
	});

	// On mount: if we have a token, try to restore session
	useEffect(() => {
		if (credentialLink.token) {
			setChecking(false);
			return;
		}

		const token = getToken();
		if (!token) {
			setChecking(false);
			return;
		}
		getMe()
			.then((u) => setUser(u))
			.catch(() => setToken(null))
			.finally(() => setChecking(false));
	}, [credentialLink.token]);

	function clearCredentialLink() {
		const url = new URL(window.location.href);
		url.searchParams.delete('credentialToken');
		url.searchParams.delete('username');
		url.searchParams.delete('purpose');
		window.history.replaceState({}, '', `${url.pathname}${url.search}`);
		setCredentialLink({ token: null, username: '', purpose: null });
	}

	function handleLogin(data: LoginResponse) {
		setUser(data.user);
	}

	function handleLogout() {
		setToken(null);
		setUser(null);
	}

	if (checking) {
		return (
			<div className='w-full h-screen flex items-center justify-center bg-stone-50'>
				<div className='inline-block w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin' />
			</div>
		);
	}

	if (credentialLink.token) {
		return (
			<PasswordLinkScreen
				token={credentialLink.token}
				usernameHint={credentialLink.username}
				purposeHint={credentialLink.purpose}
				onComplete={clearCredentialLink}
			/>
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

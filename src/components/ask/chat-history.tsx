import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react';
import type { AiSession } from '../../services/api-client';

interface Props {
	sessions: AiSession[];
	loaded: boolean;
	activeId: string | null;
	busySessionKey: string | null;
	onOpen: (id: string | null) => void;
	onRename: (id: string, title: string) => void;
	onTogglePin: (id: string) => void;
	onDelete: (id: string) => void;
	onClose?: () => void;
}

function groupOf(session: AiSession, now: Date): string {
	if (session.isPinned) return 'Pinned';
	const d = new Date(session.updatedAt);
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const t = d.getTime();
	if (t >= startOfToday) return 'Today';
	if (t >= startOfToday - 86_400_000) return 'Yesterday';
	if (t >= startOfToday - 6 * 86_400_000) return 'Previous 7 days';
	if (t >= startOfToday - 29 * 86_400_000) return 'Previous 30 days';
	return 'Older';
}

/** Previews are saved from answers — drop markdown symbols */
function cleanPreview(text: string): string {
	return text.replace(/\*\*|__|`|^#+\s*/g, '').replace(/\s+-\s+/g, ' · ');
}

const GROUP_ORDER = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

function shortTime(iso: string, now: Date): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString([], { weekday: 'short' });
	return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Saved chats: search, grouped by date, rename / pin / delete. */
export function ChatHistory({ sessions, loaded, activeId, busySessionKey, onOpen, onRename, onTogglePin, onDelete, onClose }: Props) {
	const [query, setQuery] = useState('');
	const [menuId, setMenuId] = useState<string | null>(null);
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

	const groups = useMemo(() => {
		const now = new Date();
		const q = query.trim().toLowerCase();
		const filtered = q
			? sessions.filter((s) => s.title.toLowerCase().includes(q) || (s.preview ?? '').toLowerCase().includes(q))
			: sessions;
		const map = new Map<string, AiSession[]>();
		for (const s of filtered) {
			const g = groupOf(s, now);
			map.set(g, [...(map.get(g) ?? []), s]);
		}
		return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ name: g, items: map.get(g)!, now }));
	}, [sessions, query]);

	return (
		<div className='flex h-full flex-col'>
			<div className='flex items-center gap-2 px-3 pb-2 pt-4'>
				<button
					type='button'
					onClick={() => onOpen(null)}
					className='flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700'
				>
					<Plus size={16} strokeWidth={2.5} /> New chat
				</button>
				{onClose && (
					<button
						type='button'
						onClick={onClose}
						aria-label='Close'
						className='flex h-10 w-10 items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700'
					>
						<X size={18} />
					</button>
				)}
			</div>

			{sessions.length > 4 && (
				<div className='px-3 pb-2'>
					<div className='flex items-center gap-2 rounded-xl bg-stone-100/80 px-3 py-2 text-stone-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-emerald-300'>
						<Search size={14} />
						<input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder='Search chats'
							className='w-full bg-transparent text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none'
						/>
					</div>
				</div>
			)}

			<div className='flex-1 overflow-y-auto overscroll-contain px-2 pb-6'>
				{!loaded && sessions.length === 0 && (
					<div className='space-y-2 px-2 pt-2'>
						{[0, 1, 2].map((i) => (
							<div key={i} className='skeleton h-12 rounded-xl' />
						))}
					</div>
				)}
				{loaded && sessions.length === 0 && (
					<div className='px-4 pt-8 text-center text-sm text-stone-400'>
						<MessageSquare size={22} className='mx-auto mb-2 text-stone-300' />
						Your chats will appear here.
					</div>
				)}
				{query && groups.length === 0 && <p className='px-4 pt-6 text-center text-sm text-stone-400'>No chats match “{query}”.</p>}

				{groups.map((group) => (
					<div key={group.name} className='pt-3'>
						<p className='px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400'>{group.name}</p>
						{group.items.map((s) => (
							<HistoryItem
								key={s.id}
								session={s}
								now={group.now}
								active={s.id === activeId}
								busy={s.id === busySessionKey}
								menuOpen={menuId === s.id}
								renaming={renamingId === s.id}
								confirmingDelete={confirmDeleteId === s.id}
								onOpen={() => onOpen(s.id)}
								onMenu={(open) => {
									setMenuId(open ? s.id : null);
									setConfirmDeleteId(null);
								}}
								onStartRename={() => {
									setRenamingId(s.id);
									setMenuId(null);
								}}
								onRename={(title) => {
									setRenamingId(null);
									if (title.trim() && title.trim() !== s.title) onRename(s.id, title);
								}}
								onTogglePin={() => {
									setMenuId(null);
									onTogglePin(s.id);
								}}
								onAskDelete={() => setConfirmDeleteId(s.id)}
								onDelete={() => {
									setMenuId(null);
									setConfirmDeleteId(null);
									onDelete(s.id);
								}}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

function HistoryItem({
	session,
	now,
	active,
	busy,
	menuOpen,
	renaming,
	confirmingDelete,
	onOpen,
	onMenu,
	onStartRename,
	onRename,
	onTogglePin,
	onAskDelete,
	onDelete,
}: {
	session: AiSession;
	now: Date;
	active: boolean;
	busy: boolean;
	menuOpen: boolean;
	renaming: boolean;
	confirmingDelete: boolean;
	onOpen: () => void;
	onMenu: (open: boolean) => void;
	onStartRename: () => void;
	onRename: (title: string) => void;
	onTogglePin: () => void;
	onAskDelete: () => void;
	onDelete: () => void;
}) {
	const [draft, setDraft] = useState(session.title);
	const inputRef = useRef<HTMLInputElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (renaming) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [renaming]);

	useEffect(() => {
		if (!menuOpen) return;
		const close = (e: PointerEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) onMenu(false);
		};
		window.addEventListener('pointerdown', close);
		return () => window.removeEventListener('pointerdown', close);
	}, [menuOpen, onMenu]);

	if (renaming) {
		return (
			<form
				className='flex items-center gap-1 rounded-xl bg-white px-2 py-1.5 ring-1 ring-emerald-300'
				onSubmit={(e) => {
					e.preventDefault();
					onRename(draft);
				}}
			>
				<input
					ref={inputRef}
					value={draft}
					maxLength={80}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={() => onRename(draft)}
					onKeyDown={(e) => e.key === 'Escape' && onRename(session.title)}
					className='min-w-0 flex-1 bg-transparent px-1 text-sm text-stone-800 focus:outline-none'
				/>
				<button type='submit' className='flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50'>
					<Check size={15} />
				</button>
			</form>
		);
	}

	return (
		<div className='group relative' ref={menuRef}>
			<div
				className={`flex items-center rounded-xl transition-colors ${
					active ? 'bg-emerald-50 ring-1 ring-emerald-100' : 'hover:bg-stone-100/80'
				}`}
			>
				<button type='button' onClick={onOpen} className='min-w-0 flex-1 py-2 pl-3 pr-1 text-left'>
					<span className={`flex items-center gap-1.5 text-sm ${active ? 'font-semibold text-emerald-900' : 'font-medium text-stone-700'}`}>
						{session.isPinned && <Pin size={11} className='shrink-0 text-amber-500' />}
						<span className='truncate'>{session.title}</span>
					</span>
					{session.preview && <span className='mt-0.5 block truncate text-xs text-stone-400'>{cleanPreview(session.preview)}</span>}
				</button>
				<div className='flex w-11 shrink-0 items-center justify-center self-stretch pr-1'>
					{busy ? (
						<Loader2 size={13} className='animate-spin text-emerald-500' />
					) : (
						<>
							<span
								className={`text-[10px] text-stone-400 [@media(hover:none)]:hidden ${
									menuOpen ? 'hidden' : 'md:group-hover:hidden'
								}`}
							>
								{shortTime(session.updatedAt, now)}
							</span>
							<button
								type='button'
								aria-label='Chat options'
								onClick={() => onMenu(!menuOpen)}
								className={`h-7 w-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white hover:text-stone-800 hover:shadow-sm [@media(hover:none)]:flex ${
									menuOpen ? 'flex bg-white text-stone-800 shadow-sm' : 'hidden md:group-hover:flex'
								}`}
							>
								<MoreHorizontal size={15} />
							</button>
						</>
					)}
				</div>
			</div>
			{menuOpen && (
				<div className='absolute right-1.5 top-9 z-30 w-44 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl shadow-stone-900/10 ring-1 ring-stone-200'>
					{confirmingDelete ? (
						<div className='px-3 py-2'>
							<p className='text-xs text-stone-600'>Delete this chat?</p>
							<div className='mt-2 flex gap-1.5'>
								<button type='button' onClick={onDelete} className='flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-700'>
									Delete
								</button>
								<button type='button' onClick={() => onMenu(false)} className='flex-1 rounded-lg bg-stone-100 px-2 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-200'>
									Cancel
								</button>
							</div>
						</div>
					) : (
						<>
							<MenuItem icon={<Pencil size={14} />} label='Rename' onClick={onStartRename} />
							<MenuItem
								icon={session.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
								label={session.isPinned ? 'Unpin' : 'Pin to top'}
								onClick={onTogglePin}
							/>
							<MenuItem icon={<Trash2 size={14} />} label='Delete' danger onClick={onAskDelete} />
						</>
					)}
				</div>
			)}
		</div>
	);
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
	return (
		<button
			type='button'
			onClick={onClick}
			className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
				danger ? 'text-red-600 hover:bg-red-50' : 'text-stone-700 hover:bg-stone-50'
			}`}
		>
			{icon}
			{label}
		</button>
	);
}

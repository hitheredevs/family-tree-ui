import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
	ArrowDown,
	BarChart3,
	Cake,
	Crown,
	History,
	Network,
	Route,
	Sparkles,
	SquarePen,
	TreePine,
	Users,
	WifiOff,
	X,
} from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import * as cache from '../../services/ai-cache';
import { useAiChat } from './use-ai-chat';
import { usePersonRefResolver } from './use-person-refs';
import { ChatHistory } from './chat-history';
import { ChatComposer, type ComposerHandle } from './chat-composer';
import { AssistantMessage, LiveAssistantMessage, UserMessage } from './chat-message';
import { RelationFinder } from './relation-finder';
import { buildSuggestions, closeFamilyOf, type Suggestion, type SuggestionIcon } from './suggestions';

const SUGGESTION_ICONS: Record<SuggestionIcon, React.ReactNode> = {
	users: <Users size={16} />,
	route: <Route size={16} />,
	cake: <Cake size={16} />,
	crown: <Crown size={16} />,
	chart: <BarChart3 size={16} />,
	tree: <TreePine size={16} />,
	branches: <Network size={16} />,
};

const SUGGESTION_TINT: Record<SuggestionIcon, string> = {
	users: 'bg-sky-50 text-sky-600 ring-sky-100',
	route: 'bg-amber-50 text-amber-600 ring-amber-100',
	cake: 'bg-pink-50 text-pink-600 ring-pink-100',
	crown: 'bg-violet-50 text-violet-600 ring-violet-100',
	chart: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
	tree: 'bg-teal-50 text-teal-600 ring-teal-100',
	branches: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
};

export function AskScreen({ onPersonOpen }: { onPersonOpen: () => void }) {
	const { state, dispatch, currentUser, centerPersonId } = useFamilyTree();
	const userId = currentUser?.id ?? 'anonymous';
	const chat = useAiChat(userId);
	const resolveRef = usePersonRefResolver(state.people);

	const [historyOpen, setHistoryOpen] = useState(false);
	const [finderOpen, setFinderOpen] = useState(false);
	const [composerKey, setComposerKey] = useState(0);
	const [atBottom, setAtBottom] = useState(true);
	const [online, setOnline] = useState(() => navigator.onLine);
	const composerRef = useRef<ComposerHandle>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const atBottomRef = useRef(true);

	const me = state.people[centerPersonId];
	const isAdmin = currentUser?.role === 'admin';
	const suggestions = useMemo(
		() => buildSuggestions(state.people, centerPersonId, isAdmin),
		[state.people, centerPersonId, isAdmin],
	);
	const closeFamily = useMemo(() => closeFamilyOf(state.people, centerPersonId), [state.people, centerPersonId]);

	const aiDisabled = chat.aiStatus ? !chat.aiStatus.enabled : false;
	const empty = chat.messages.length === 0 && !chat.live && !chat.loadingChat;
	const lastMessage = chat.messages[chat.messages.length - 1];

	useEffect(() => {
		const up = () => setOnline(true);
		const down = () => setOnline(false);
		window.addEventListener('online', up);
		window.addEventListener('offline', down);
		return () => {
			window.removeEventListener('online', up);
			window.removeEventListener('offline', down);
		};
	}, []);

	const openPerson = useCallback(
		(personId: string) => {
			dispatch({ type: 'SELECT_PERSON', personId });
			onPersonOpen();
		},
		[dispatch, onPersonOpen],
	);

	const openChat = (id: string | null) => {
		chat.openChat(id);
		setComposerKey((k) => k + 1);
		setHistoryOpen(false);
		setFinderOpen(false);
		atBottomRef.current = true;
	};

	/* ---- Scrolling: follow the answer unless the reader scrolled up ---- */
	const scrollToBottom = (smooth = false) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
	};

	const onScroll = () => {
		const el = scrollRef.current;
		if (!el) return;
		const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
		atBottomRef.current = bottom;
		setAtBottom(bottom);
	};

	useLayoutEffect(() => {
		if (empty) {
			scrollRef.current?.scrollTo({ top: 0 });
			return;
		}
		if (atBottomRef.current) scrollToBottom();
		onScroll();
	}, [chat.messages, chat.live?.text, chat.live?.status, chat.activeId, empty]);

	const send = async (text: string, contextIds: string[]) => {
		atBottomRef.current = true;
		setAtBottom(true);
		requestAnimationFrame(() => scrollToBottom(true));
		return chat.send(text, contextIds);
	};

	const askSuggestion = (s: Suggestion) => {
		if (aiDisabled) {
			composerRef.current?.setText(s.prompt, s.contextIds);
			return;
		}
		send(s.prompt, s.contextIds ?? []);
	};

	const firstName = me?.firstName ? me.firstName.charAt(0).toUpperCase() + me.firstName.slice(1).toLowerCase() : '';

	const history = (
		<ChatHistory
			sessions={chat.sessions}
			loaded={chat.sessionsLoaded}
			activeId={chat.activeId}
			busySessionKey={chat.busySessionKey}
			onOpen={openChat}
			onRename={chat.rename}
			onTogglePin={chat.togglePin}
			onDelete={chat.remove}
			onClose={historyOpen ? () => setHistoryOpen(false) : undefined}
		/>
	);

	return (
		<div className='flex h-full w-full bg-stone-50'>
			{/* Desktop: saved chats */}
			<aside className='hidden w-72 shrink-0 border-r border-stone-200/70 bg-white/70 md:block'>{history}</aside>

			{/* Mobile: saved chats drawer */}
			{historyOpen && (
				<div className='fixed inset-0 z-40 md:hidden'>
					<div className='modal-backdrop absolute inset-0 bg-stone-900/30 backdrop-blur-[2px]' onClick={() => setHistoryOpen(false)} />
					<div className='absolute inset-y-0 left-0 w-[86%] max-w-xs bg-white shadow-2xl' style={{ animation: 'drawer-in 0.2s ease-out both' }}>
						{history}
					</div>
				</div>
			)}

			<section className='relative flex min-w-0 flex-1 flex-col'>
				<header className='flex items-center gap-1.5 border-b border-stone-200/60 bg-white/85 px-2 py-2 backdrop-blur-md md:px-5 md:py-3'>
					<HeaderButton label='Chats' className='md:hidden' onClick={() => setHistoryOpen(true)}>
						<History size={19} />
					</HeaderButton>
					<div className='min-w-0 flex-1 px-1'>
						<h1 className='truncate text-[15px] font-semibold text-stone-800'>
							{chat.activeSession?.title ?? (chat.activeId ? 'Chat' : 'Ask')}
						</h1>
						<p className='flex items-center gap-1 truncate text-[11px] text-stone-400'>
							<Sparkles size={10} className='text-emerald-500' />
							Answers from your family tree
							{chat.aiStatus?.modelLabel ? <span className='hidden sm:inline'> · {chat.aiStatus.modelLabel}</span> : null}
						</p>
					</div>
					{!empty && (
						<HeaderButton label='How are we related?' active={finderOpen} onClick={() => setFinderOpen((v) => !v)}>
							<Network size={18} />
						</HeaderButton>
					)}
					{(chat.activeId || !empty) && (
						<HeaderButton label='New chat' className='md:hidden' onClick={() => openChat(null)}>
							<SquarePen size={18} />
						</HeaderButton>
					)}
				</header>

				<div ref={scrollRef} onScroll={onScroll} className='flex-1 overflow-y-auto overscroll-contain'>
					<div className='mx-auto w-full max-w-3xl px-4 pb-8 pt-5 md:px-6 md:pt-8'>
						{finderOpen && !empty && (
							<div className='relative mb-6'>
								<button
									type='button'
									aria-label='Close'
									onClick={() => setFinderOpen(false)}
									className='absolute -right-1 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-stone-400 shadow ring-1 ring-stone-200 hover:text-stone-700'
								>
									<X size={14} />
								</button>
								<RelationFinder
									compact
									onPersonClick={openPerson}
									onAskAi={(q, ids) => {
										setFinderOpen(false);
										send(q, ids);
									}}
								/>
							</div>
						)}

						{empty && (
							<div>
								<div className='flex flex-col items-center pt-2 text-center md:pt-6'>
									<div className='flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25'>
										<Sparkles size={26} />
									</div>
									<h2 className='mt-4 text-[22px] font-bold tracking-tight text-stone-800 md:text-2xl'>
										{firstName ? `Hi ${firstName}, what would you like to know?` : 'What would you like to know?'}
									</h2>
									<p className='mt-1.5 max-w-md text-sm leading-relaxed text-stone-500'>
										Ask about anyone in the family — how you're related, children, cousins, birthdays, where people live.
										Type <span className='rounded bg-stone-100 px-1 font-semibold text-stone-600'>@</span> to pick a person.
									</p>
								</div>

								<div className='mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2'>
									{suggestions.map((s) => (
										<button
											key={s.title}
											type='button'
											onClick={() => askSuggestion(s)}
											className='group flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/70 transition-all hover:-translate-y-px hover:shadow-md hover:ring-emerald-300 active:translate-y-0'
										>
											<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${SUGGESTION_TINT[s.icon]}`}>
												{SUGGESTION_ICONS[s.icon]}
											</span>
											<span className='min-w-0'>
												<span className='block truncate text-sm font-semibold text-stone-800'>{s.title}</span>
												<span className='block truncate text-xs text-stone-400'>{s.hint}</span>
											</span>
										</button>
									))}
								</div>

								<div className='mt-6'>
									<RelationFinder onPersonClick={openPerson} onAskAi={aiDisabled ? undefined : (q, ids) => send(q, ids)} />
								</div>
							</div>
						)}

						{chat.loadingChat && (
							<div className='space-y-5'>
								<div className='flex justify-end'>
									<div className='skeleton h-10 w-2/5 rounded-2xl' />
								</div>
								<div className='flex gap-3'>
									<div className='skeleton h-8 w-8 rounded-xl' />
									<div className='flex-1 space-y-2'>
										<div className='skeleton h-4 w-4/5 rounded' />
										<div className='skeleton h-4 w-3/5 rounded' />
									</div>
								</div>
							</div>
						)}

						{!empty && (
							<div className='space-y-6'>
								{chat.messages.map((m) =>
									m.role === 'user' ? (
										<UserMessage key={m.id} message={m} people={state.people} resolveRef={resolveRef} onPersonClick={openPerson} />
									) : (
										<AssistantMessage
											key={m.id}
											message={m}
											isLast={m === lastMessage && !chat.live}
											canRegenerate={!chat.live && !aiDisabled && online}
											onRegenerate={() => {
												atBottomRef.current = true;
												chat.regenerate();
											}}
											people={state.people}
											resolveRef={resolveRef}
											onPersonClick={openPerson}
										/>
									),
								)}
								{chat.live && (
									<LiveAssistantMessage live={chat.live} people={state.people} resolveRef={resolveRef} onPersonClick={openPerson} />
								)}
								{!chat.live && lastMessage?.role === 'user' && !aiDisabled && (
									<div className='flex items-center gap-2 pl-11 text-xs text-stone-400'>
										Stopped before answering ·
										<button
											type='button'
											onClick={() => chat.regenerate()}
											className='font-semibold text-emerald-700 hover:underline'
										>
											Answer now
										</button>
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{!atBottom && !empty && (
					<button
						type='button'
						onClick={() => scrollToBottom(true)}
						aria-label='Scroll to latest'
						className='absolute bottom-28 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-white text-stone-500 shadow-lg ring-1 ring-stone-200 hover:text-stone-800 md:bottom-32'
					>
						<ArrowDown size={17} />
					</button>
				)}

				<div className='px-3 pb-6 pt-1 md:px-6 md:pb-5'>
					<div className='mx-auto w-full max-w-3xl'>
						{!online && (
							<Banner tone='stone' icon={<WifiOff size={14} />}>
								You're offline. Saved chats and “How are we related?” still work.
							</Banner>
						)}
						{aiDisabled && (
							<Banner tone='amber'>The AI assistant isn't switched on yet. “How are we related?” still works.</Banner>
						)}
						{chat.notice && (
							<Banner tone='amber' onClose={chat.clearNotice}>
								{chat.notice}
							</Banner>
						)}
						<ChatComposer
							key={composerKey}
							ref={composerRef}
							people={state.people}
							closeFamilyIds={closeFamily}
							initialText={cache.readDraft(userId, chat.activeId)}
							onDraftChange={(text) => cache.writeDraft(userId, chat.activeId, text)}
							onSend={send}
							onStop={chat.stop}
							streaming={Boolean(chat.live)}
							disabled={aiDisabled || !online}
							disabledReason={!online ? 'You are offline' : 'AI assistant is not switched on yet'}
						/>
						<p className='mt-2 hidden text-center text-[11px] text-stone-400 md:block'>
							Answers come from the tree, so they're only as complete as the tree is · Enter to send · Shift+Enter for a new line · @ to mention someone
						</p>
					</div>
				</div>
			</section>
		</div>
	);
}

function HeaderButton({
	label,
	onClick,
	children,
	className = '',
	active = false,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
	className?: string;
	active?: boolean;
}) {
	return (
		<button
			type='button'
			onClick={onClick}
			title={label}
			aria-label={label}
			className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
				active ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
			} ${className}`}
		>
			{children}
		</button>
	);
}

function Banner({
	tone,
	icon,
	children,
	onClose,
}: {
	tone: 'amber' | 'stone';
	icon?: React.ReactNode;
	children: React.ReactNode;
	onClose?: () => void;
}) {
	return (
		<div
			className={`mb-2 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs ${
				tone === 'amber' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-stone-100 text-stone-600 ring-1 ring-stone-200'
			}`}
		>
			{icon && <span className='pt-px'>{icon}</span>}
			<span className='flex-1'>{children}</span>
			{onClose && (
				<button type='button' onClick={onClose} aria-label='Dismiss' className='opacity-60 hover:opacity-100'>
					<X size={14} />
				</button>
			)}
		</div>
	);
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../../services/api-client';
import type { AiMessage, AiSession, AiStatus } from '../../services/api-client';
import * as cache from '../../services/ai-cache';

/** The answer being written right now */
export interface LiveAnswer {
	/** Chat it belongs to ("new" until the server creates the chat) */
	sessionKey: string;
	text: string;
	/** What the assistant is doing, e.g. "Searching for FAZAL" */
	status: string | null;
	steps: string[];
}

const NEW = 'new';

function localMessage(partial: Partial<AiMessage> & Pick<AiMessage, 'role' | 'sessionId'>): AiMessage {
	return {
		id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		content: '',
		status: 'complete',
		error: null,
		contextPersonIds: [],
		steps: [],
		createdAt: new Date().toISOString(),
		...partial,
	};
}

function sortSessions(list: AiSession[]): AiSession[] {
	return [...list].sort(
		(a, b) =>
			Number(b.isPinned) - Number(a.isPinned) ||
			new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

/**
 * State for the Ask tab: saved chats (cached locally, refreshed from the
 * server), the open chat's messages, and the streaming answer.
 */
export function useAiChat(userId: string) {
	const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
	const [sessions, setSessions] = useState<AiSession[]>(() => cache.readSessions(userId));
	const [sessionsLoaded, setSessionsLoaded] = useState(false);
	const [activeId, setActiveId] = useState<string | null>(() => cache.readActiveSession(userId));
	const [chats, setChats] = useState<Record<string, AiMessage[]>>(() => {
		const id = cache.readActiveSession(userId);
		const cached = id ? cache.readMessages(userId, id) : null;
		return id && cached ? { [id]: cached } : {};
	});
	const [loadingChat, setLoadingChat] = useState(false);
	const [live, setLive] = useState<LiveAnswer | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const abortRef = useRef<AbortController | null>(null);
	// Mirror of `live` readable from async callbacks
	const liveRef = useRef<LiveAnswer | null>(null);
	const updateLive = useCallback((next: LiveAnswer | null | ((l: LiveAnswer) => LiveAnswer)) => {
		const value = typeof next === 'function' ? (liveRef.current ? next(liveRef.current) : null) : next;
		liveRef.current = value;
		setLive(value);
	}, []);

	/* ---- Persist to local storage ---- */
	const written = useRef(new Map<string, AiMessage[]>());
	useEffect(() => {
		for (const [id, list] of Object.entries(chats)) {
			if (id === NEW || written.current.get(id) === list) continue;
			written.current.set(id, list);
			cache.writeMessages(userId, id, list.filter((m) => !m.id.startsWith('local-') || m.role === 'assistant'));
		}
	}, [chats, userId]);

	useEffect(() => {
		if (sessionsLoaded || sessions.length) cache.writeSessions(userId, sessions);
	}, [sessions, sessionsLoaded, userId]);

	useEffect(() => {
		cache.writeActiveSession(userId, activeId);
	}, [activeId, userId]);

	/* ---- Load status + chat list ---- */
	const refreshSessions = useCallback(async () => {
		try {
			const list = await api.listAiSessions();
			setSessions(sortSessions(list));
			setSessionsLoaded(true);
			setActiveId((current) => (current && !list.some((s) => s.id === current) && !liveRef.current ? null : current));
		} catch (err) {
			if (err instanceof api.ApiError && err.status === 401) return;
			setSessionsLoaded(true);
		}
	}, []);

	useEffect(() => {
		api.getAiStatus()
			.then(setAiStatus)
			.catch(() => setAiStatus(null));
		refreshSessions();
	}, [refreshSessions]);

	/* ---- Open a chat: show the cached copy, then refresh from the server ---- */
	useEffect(() => {
		if (!activeId) return;
		let cancelled = false;
		setChats((current) => {
			if (current[activeId]) return current;
			const cached = cache.readMessages(userId, activeId);
			return cached ? { ...current, [activeId]: cached } : current;
		});
		const hasLocal = Boolean(cache.readMessages(userId, activeId));
		if (!hasLocal) setLoadingChat(true);

		api.getAiSession(activeId)
			.then(({ session, messages }) => {
				if (cancelled) return;
				// Don't overwrite a chat that is answering right now
				if (liveRef.current?.sessionKey === activeId) return;
				setChats((current) => ({ ...current, [activeId]: messages }));
				setSessions((list) => sortSessions(list.map((s) => (s.id === session.id ? session : s))));
			})
			.catch((err) => {
				if (cancelled) return;
				if (err instanceof api.ApiError && err.status === 404) {
					setSessions((list) => list.filter((s) => s.id !== activeId));
					cache.removeChat(userId, activeId);
					setActiveId(null);
				}
			})
			.finally(() => {
				if (!cancelled) setLoadingChat(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeId, userId]);

	/* ---- Helpers ---- */
	const upsertSession = useCallback((session: AiSession) => {
		setSessions((list) => sortSessions([session, ...list.filter((s) => s.id !== session.id)]));
	}, []);

	const appendMessage = useCallback((sessionId: string, message: AiMessage) => {
		setChats((current) => ({ ...current, [sessionId]: [...(current[sessionId] ?? []), message] }));
	}, []);

	/* ---- Ask / regenerate (shared streaming path) ---- */
	const run = useCallback(
		async (body: { content?: string; contextPersonIds?: string[]; regenerate?: boolean }): Promise<boolean> => {
			if (liveRef.current) {
				setNotice('Another chat is still answering — try again in a moment.');
				return false;
			}
			setNotice(null);
			const key = activeId ?? NEW;
			let sessionId: string | null = activeId;
			let text = '';

			const optimistic = body.regenerate
				? null
				: localMessage({
						role: 'user',
						sessionId: key,
						content: body.content ?? '',
						contextPersonIds: body.contextPersonIds ?? [],
					});
			const previous = chats[key] ?? [];
			const lastMessage = previous[previous.length - 1];
			const removedForRegenerate = body.regenerate && lastMessage?.role === 'assistant' ? lastMessage : null;

			setChats((current) => {
				let list = current[key] ?? [];
				if (removedForRegenerate) list = list.filter((m) => m.id !== removedForRegenerate.id);
				return { ...current, [key]: optimistic ? [...list, optimistic] : list };
			});
			updateLive({ sessionKey: key, text: '', status: null, steps: [] });

			const controller = new AbortController();
			abortRef.current = controller;

			try {
				await api.streamAiMessage(
					key,
					body,
					{
						onReady: ({ session, userMessage }) => {
							sessionId = session.id;
							setChats((current) => {
								const list = (current[key] ?? []).map((m) => (optimistic && m.id === optimistic.id ? userMessage : m));
								const next = { ...current, [session.id]: list };
								if (key === NEW) delete next[NEW];
								return next;
							});
							if (key === NEW) setActiveId((current) => current ?? session.id);
							upsertSession(session);
							updateLive((l) => ({ ...l, sessionKey: session.id }));
						},
						onStatus: (status) =>
							updateLive((l) => ({
								...l,
								status,
								steps: status === 'Thinking' || l.steps.includes(status) ? l.steps : [...l.steps, status],
							})),
						onDelta: (delta) => {
							text += delta;
							updateLive((l) => ({ ...l, text, status: null }));
						},
						onDiscard: () => {
							text = '';
							updateLive((l) => ({ ...l, text: '' }));
						},
						onReplace: (content) => {
							text = content;
							updateLive((l) => ({ ...l, text }));
						},
						onDone: ({ message, session }) => {
							appendMessage(session.id, message);
							upsertSession(session);
						},
						onError: ({ error, message, session }) => {
							const target = sessionId ?? key;
							appendMessage(
								target,
								message ?? localMessage({ role: 'assistant', sessionId: target, status: 'error', error }),
							);
							if (session) upsertSession(session);
						},
					},
					controller.signal,
				);
				if (controller.signal.aborted && text.trim()) {
					const target = sessionId ?? key;
					appendMessage(target, localMessage({ role: 'assistant', sessionId: target, content: text, status: 'stopped' }));
				}
				return true;
			} catch (err) {
				// Nothing reached the chat (offline, rate limit, busy…) — undo the optimistic bubble
				setChats((current) => {
					let list = (current[key] ?? []).filter((m) => m.id !== optimistic?.id);
					if (removedForRegenerate) list = [...list, removedForRegenerate];
					return { ...current, [key]: list };
				});
				setNotice(err instanceof Error ? err.message : 'Could not send. Please try again.');
				return false;
			} finally {
				abortRef.current = null;
				updateLive(null);
			}
		},
		[activeId, appendMessage, chats, updateLive, upsertSession],
	);

	const send = useCallback(
		(content: string, contextPersonIds: string[]) => run({ content, contextPersonIds }),
		[run],
	);
	const regenerate = useCallback(() => run({ regenerate: true }), [run]);
	const stop = useCallback(() => abortRef.current?.abort(), []);

	/* ---- Chat list actions ---- */
	const openChat = useCallback((id: string | null) => {
		setNotice(null);
		setActiveId(id);
	}, []);

	const rename = useCallback(
		async (id: string, title: string) => {
			const trimmed = title.trim();
			if (!trimmed) return;
			setSessions((list) => list.map((s) => (s.id === id ? { ...s, title: trimmed } : s)));
			try {
				upsertSession(await api.updateAiSession(id, { title: trimmed }));
			} catch (err) {
				setNotice(err instanceof Error ? err.message : 'Could not rename the chat');
				refreshSessions();
			}
		},
		[refreshSessions, upsertSession],
	);

	const togglePin = useCallback(
		async (id: string) => {
			const session = sessions.find((s) => s.id === id);
			if (!session) return;
			setSessions((list) => sortSessions(list.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s))));
			try {
				upsertSession(await api.updateAiSession(id, { isPinned: !session.isPinned }));
			} catch {
				refreshSessions();
			}
		},
		[refreshSessions, sessions, upsertSession],
	);

	const remove = useCallback(
		async (id: string) => {
			setSessions((list) => list.filter((s) => s.id !== id));
			setChats((current) => {
				const next = { ...current };
				delete next[id];
				return next;
			});
			cache.removeChat(userId, id);
			if (activeId === id) setActiveId(null);
			try {
				await api.deleteAiSession(id);
			} catch (err) {
				if (!(err instanceof api.ApiError && err.status === 404)) {
					setNotice(err instanceof Error ? err.message : 'Could not delete the chat');
					refreshSessions();
				}
			}
		},
		[activeId, refreshSessions, userId],
	);

	const activeKey = activeId ?? NEW;
	const messages = useMemo(() => chats[activeKey] ?? [], [chats, activeKey]);
	const activeSession = sessions.find((s) => s.id === activeId) ?? null;

	return {
		aiStatus,
		sessions,
		sessionsLoaded,
		activeId,
		activeSession,
		messages,
		loadingChat: loadingChat && messages.length === 0,
		live: live && live.sessionKey === activeKey ? live : null,
		busyElsewhere: Boolean(live && live.sessionKey !== activeKey),
		busySessionKey: live?.sessionKey ?? null,
		notice,
		clearNotice: () => setNotice(null),
		openChat,
		send,
		regenerate,
		stop,
		rename,
		togglePin,
		remove,
	};
}

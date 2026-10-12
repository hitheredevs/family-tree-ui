/**
 * Local copy of the Ask tab's chats so the screen opens instantly and
 * survives reloads; the server stays the source of truth and refreshes
 * it in the background. Keyed per signed-in user.
 */

import type { AiMessage, AiSession } from './api-client';

const PREFIX = 'ft_ai_v1';
/** Chats whose messages are kept locally (most recently opened first) */
const MAX_CACHED_CHATS = 15;

const key = (userId: string, part: string) => `${PREFIX}:${userId}:${part}`;

function read<T>(k: string): T | null {
    try {
        const raw = localStorage.getItem(k);
        return raw ? (JSON.parse(raw) as T) : null;
    } catch {
        return null;
    }
}

function write(k: string, value: unknown): void {
    try {
        localStorage.setItem(k, JSON.stringify(value));
    } catch {
        // Storage full: drop cached messages and try once more
        clearMessages(k.split(':')[1]);
        try {
            localStorage.setItem(k, JSON.stringify(value));
        } catch {
            /* give up — the cache is only an optimisation */
        }
    }
}

export function readSessions(userId: string): AiSession[] {
    return read<AiSession[]>(key(userId, 'sessions')) ?? [];
}

export function writeSessions(userId: string, sessions: AiSession[]): void {
    write(key(userId, 'sessions'), sessions);
}

export function readMessages(userId: string, sessionId: string): AiMessage[] | null {
    return read<AiMessage[]>(key(userId, `chat:${sessionId}`));
}

export function writeMessages(userId: string, sessionId: string, messages: AiMessage[]): void {
    write(key(userId, `chat:${sessionId}`), messages);
    const order = (read<string[]>(key(userId, 'order')) ?? []).filter((id) => id !== sessionId);
    order.unshift(sessionId);
    for (const stale of order.splice(MAX_CACHED_CHATS)) {
        localStorage.removeItem(key(userId, `chat:${stale}`));
    }
    write(key(userId, 'order'), order);
}

export function removeChat(userId: string, sessionId: string): void {
    try {
        localStorage.removeItem(key(userId, `chat:${sessionId}`));
        localStorage.removeItem(key(userId, `draft:${sessionId}`));
    } catch {
        /* ignore */
    }
}

function clearMessages(userId: string | undefined): void {
    if (!userId) return;
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k?.startsWith(`${PREFIX}:${userId}:chat:`)) localStorage.removeItem(k);
        }
    } catch {
        /* ignore */
    }
}

export function readActiveSession(userId: string): string | null {
    return read<string>(key(userId, 'active'));
}

export function writeActiveSession(userId: string, sessionId: string | null): void {
    if (sessionId) write(key(userId, 'active'), sessionId);
    else {
        try {
            localStorage.removeItem(key(userId, 'active'));
        } catch {
            /* ignore */
        }
    }
}

export function readDraft(userId: string, sessionId: string | null): string {
    return read<string>(key(userId, `draft:${sessionId ?? 'new'}`)) ?? '';
}

export function writeDraft(userId: string, sessionId: string | null, text: string): void {
    const k = key(userId, `draft:${sessionId ?? 'new'}`);
    if (text.trim()) write(k, text);
    else {
        try {
            localStorage.removeItem(k);
        } catch {
            /* ignore */
        }
    }
}

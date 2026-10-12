const DEFAULT_API_BASE = 'https://api.family.hitheredevs.com/api';
// const DEFAULT_API_BASE = 'http://localhost:8080/api';

function resolveApiBase(): string {
    const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
    const base = configuredBase || DEFAULT_API_BASE;
    return base.endsWith('/') ? base.slice(0, -1) : base;
}

const API_BASE = resolveApiBase();

import type { Person, SocialLink } from '../types';

let authToken: string | null = localStorage.getItem('ft_token');

export function setToken(token: string | null) {
    authToken = token;
    if (token) localStorage.setItem('ft_token', token);
    else localStorage.removeItem('ft_token');
}

export function getToken(): string | null {
    return authToken;
}

/* ------------------------------------------------------------------ */
/*  Session expiry + renewal                                           */
/* ------------------------------------------------------------------ */

const SESSION_EXPIRED_EVENT = 'ft:session-expired';

/** Called when the server rejects our token — the app goes back to sign-in. */
export function onSessionExpired(listener: () => void): () => void {
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}

function handleUnauthorized(path: string) {
    // A wrong password on the sign-in form is not an expired session
    if (!authToken || path.startsWith('/auth/login') || path.startsWith('/auth/password-link')) return;
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/** Seconds since the current token was issued (null if unknown). */
export function getTokenAgeSeconds(): number | null {
    if (!authToken) return null;
    try {
        const payload = JSON.parse(atob(authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return typeof payload.iat === 'number' ? Date.now() / 1000 - payload.iat : null;
    } catch {
        return null;
    }
}

/** Swap the current token for a fresh one so active users never get signed out. */
export async function refreshSession(): Promise<AuthUser | null> {
    if (!authToken) return null;
    const data = await apiFetch<LoginResponse>('/auth/refresh', { method: 'POST' });
    setToken(data.token);
    return data.user;
}

function headers(): HeadersInit {
    const h: HeadersInit = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
    };
    if (authToken) h['Authorization'] = `Bearer ${authToken}`;
    return h;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = 15000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${API_BASE}${path}`, {
            ...options,
            cache: 'no-store',
            signal: controller.signal,
            headers: { ...headers(), ...(options.headers as Record<string, string>) },
        });

        const rawBody = await res.text();
        const body = rawBody ? JSON.parse(rawBody) : null;

        if (!res.ok) {
            if (res.status === 401) handleUnauthorized(path);
            throw new ApiError(
                body?.error ?? body?.message ?? res.statusText,
                res.status,
            );
        }

        return body as T;
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new ApiError(
                `Request timed out after ${timeoutMs / 1000} seconds for ${path}`,
                408,
            );
        }
        if (err instanceof SyntaxError) {
            throw new ApiError(`Invalid JSON response received for ${path}`, 502);
        }
        if (err instanceof TypeError) {
            throw new ApiError(
                `Network request failed for ${API_BASE}${path}`,
                0,
            );
        }
        throw err;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

export class ApiError extends Error {
    public status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export interface AuthUser {
    id: string;
    username: string;
    role: 'admin' | 'member';
    mustChangePassword: boolean;
    personId: string;
    phoneNumber?: string | null;
    phoneVerified?: boolean;
}

export interface LoginResponse {
    token: string;
    user: AuthUser;
}

export async function login(
    username: string,
    password: string,
): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
}

export async function getMe(): Promise<AuthUser> {
    return apiFetch<AuthUser>('/auth/me');
}

export async function changePassword(
    currentPassword: string,
    newPassword: string,
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
    });
}

export type PasswordLinkPurpose = 'setup-password' | 'reset-password';

export interface PasswordLinkDetailsResponse {
    username: string;
    purpose: PasswordLinkPurpose;
    expiresAt: string;
}

export interface GeneratedPasswordLinkResponse extends PasswordLinkDetailsResponse {
    link: string;
}

export async function getPasswordLinkDetails(
    token: string,
): Promise<PasswordLinkDetailsResponse> {
    return apiFetch<PasswordLinkDetailsResponse>(
        `/auth/password-link?token=${encodeURIComponent(token)}`,
    );
}

export async function consumePasswordLink(
    token: string,
    newPassword: string,
    phoneNumber: string,
): Promise<{ message: string }> {
    return apiFetch<{ message: string }>('/auth/password-link/consume', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword, phoneNumber }),
    });
}

export async function generatePasswordLink(
    personId: string,
    purpose: PasswordLinkPurpose,
): Promise<GeneratedPasswordLinkResponse> {
    return apiFetch<GeneratedPasswordLinkResponse>(
        `/admin/persons/${personId}/password-link`,
        {
            method: 'POST',
            body: JSON.stringify({ purpose }),
        },
    );
}

export interface TreeResponse {
    people: Record<string, Person>;
}

export async function getSubtree(personId: string): Promise<TreeResponse> {
    return apiFetch<TreeResponse>(`/tree/${personId}`);
}

/** Slim tree – only layout + display fields (no bio, phone, etc.) */
export async function getSubtreeLayout(personId: string): Promise<TreeResponse> {
    return apiFetch<TreeResponse>(`/tree/${personId}/layout`);
}

/** Fetch full person details (for profile / edit views) */
export async function getPerson(personId: string): Promise<PersonResponse> {
    return apiFetch<PersonResponse>(`/persons/${personId}`);
}

/* ------------------------------------------------------------------ */
/*  Viewport-based tree loading (server-side layout)                   */
/* ------------------------------------------------------------------ */

export interface ViewportNode {
    id: string;
    x: number;
    y: number;
    firstName: string;
    lastName: string;
    gender: string;
    isDeceased: boolean;
}

export interface ViewportEdge {
    sourceId: string;
    targetId: string;
    type: 'PARENT' | 'CHILD' | 'SPOUSE';
    status: string;
}

export interface ViewportResult {
    nodes: ViewportNode[];
    totalNodes: number;
    totalPeople: number;
}

export async function getTreeViewport(params: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    zoom: number;
}): Promise<ViewportResult> {
    const qs = new URLSearchParams({
        minX: String(params.minX),
        maxX: String(params.maxX),
        minY: String(params.minY),
        maxY: String(params.maxY),
        zoom: String(params.zoom),
    });
    return apiFetch<ViewportResult>(`/tree?${qs}`);
}

export async function getAllEdges(): Promise<ViewportEdge[]> {
    const data = await apiFetch<{ edges: ViewportEdge[] }>('/tree/edges');
    return data.edges;
}

export async function recomputeLayout(
    personId: string,
): Promise<{ nodeCount: number; durationMs: number }> {
    return apiFetch(`/tree/${personId}/recompute-layout`, { method: 'POST' });
}

export interface CreatePersonPayload {
    firstName: string;
    lastName?: string;
    gender?: string;
    isDeceased?: boolean;
    birthDate?: string | null;
    deathYear?: number | null;
    bio?: string | null;
    phoneNumber?: string | null;
    socialLinks?: SocialLink[] | null;
    location?: string | null;
}

export interface PersonResponse {
    id: string;
    firstName: string;
    lastName: string;
    gender: string;
    isDeceased: boolean;
    birthDate?: string | null;
    deathYear?: number | null;
    bio?: string | null;
    phoneNumber?: string | null;
    socialLinks?: SocialLink[] | null;
    phoneVerified?: boolean;
    location?: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export async function createPerson(
    data: CreatePersonPayload,
): Promise<PersonResponse> {
    return apiFetch<PersonResponse>('/persons', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updatePerson(
    id: string,
    data: Partial<CreatePersonPayload>,
): Promise<PersonResponse> {
    return apiFetch<PersonResponse>(`/persons/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export interface MergeResult {
    keptId: string;
    movedLinks: number;
    droppedLinks: number;
    loginMoved: boolean;
}

/** Move all of `duplicateId`'s links onto `keepId`, then remove the duplicate. */
export async function mergePerson(duplicateId: string, keepId: string): Promise<MergeResult> {
    return apiFetch(`/persons/${duplicateId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ keepId }),
    });
}

export async function deletePerson(id: string): Promise<void> {
    await apiFetch<{ message: string }>(`/persons/${id}`, {
        method: 'DELETE',
    });
}

export type RelationshipType = 'PARENT' | 'CHILD' | 'SPOUSE';

export interface RelationshipResponse {
    id: string;
    source_person_id: string;
    target_person_id: string;
    relationship_type: RelationshipType;
    status: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export async function addRelationship(data: {
    sourcePersonId: string;
    targetPersonId: string;
    relationshipType: RelationshipType;
}): Promise<{ forward: RelationshipResponse; inverse: RelationshipResponse }> {
    return apiFetch('/relationships', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export interface BatchRelationshipInput {
    sourcePersonId: string;
    targetPersonId: string;
    relationshipType: RelationshipType;
}

/** Add several relationships in one request (single layout recompute) */
export async function addRelationshipsBatch(
    relationships: BatchRelationshipInput[],
): Promise<{ relationships: RelationshipResponse[] }> {
    return apiFetch('/relationships/batch', {
        method: 'POST',
        body: JSON.stringify({ relationships }),
    });
}

export interface NewPersonRelationInput {
    targetPersonId: string;
    /** Relation FROM the new person TO the target */
    relationshipType: RelationshipType;
}

/** Create a person and link all their relatives in one request */
export async function createPersonWithRelations(payload: {
    person: CreatePersonPayload;
    relations: NewPersonRelationInput[];
}): Promise<{ person: PersonResponse; relationships: RelationshipResponse[] }> {
    return apiFetch('/persons/with-relations', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function removeRelationship(id: string): Promise<void> {
    await apiFetch<{ message: string }>(`/relationships/${id}`, {
        method: 'DELETE',
    });
}

export async function updateRelationshipStatus(data: {
    sourcePersonId: string;
    targetPersonId: string;
    status: 'confirmed' | 'pending' | 'divorced';
}): Promise<void> {
    await apiFetch<{ message: string }>('/relationships/status', {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

export async function getRelationshipsForPerson(
    personId: string,
): Promise<RelationshipResponse[]> {
    return apiFetch<RelationshipResponse[]>(`/relationships/person/${personId}`);
}

/* ------------------------------------------------------------------ */
/*  AI assistant (Ask tab)                                             */
/* ------------------------------------------------------------------ */

export interface AiStatus {
    enabled: boolean;
    model: string;
    modelLabel: string;
}

export interface AiSession {
    id: string;
    title: string;
    isPinned: boolean;
    messageCount: number;
    preview: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AiToolStep {
    tool: string;
    label: string;
    ms: number;
    ok: boolean;
}

export interface AiMessage {
    id: string;
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    status: 'complete' | 'stopped' | 'error';
    error: string | null;
    contextPersonIds: string[];
    steps: AiToolStep[];
    createdAt: string;
}

export async function getAiStatus(): Promise<AiStatus> {
    return apiFetch<AiStatus>('/ai/status');
}

export async function listAiSessions(): Promise<AiSession[]> {
    return apiFetch<AiSession[]>('/ai/sessions');
}

export async function getAiSession(
    sessionId: string,
): Promise<{ session: AiSession; messages: AiMessage[] }> {
    return apiFetch(`/ai/sessions/${sessionId}`);
}

export async function updateAiSession(
    sessionId: string,
    patch: { title?: string; isPinned?: boolean },
): Promise<AiSession> {
    return apiFetch<AiSession>(`/ai/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
    });
}

export async function deleteAiSession(sessionId: string): Promise<void> {
    await apiFetch(`/ai/sessions/${sessionId}`, { method: 'DELETE' });
}

export interface AiStreamHandlers {
    onReady?: (data: { session: AiSession; userMessage: AiMessage }) => void;
    onStatus?: (text: string) => void;
    onDelta?: (text: string) => void;
    /** Text streamed so far was only a preamble before a lookup — clear it */
    onDiscard?: () => void;
    onReplace?: (content: string) => void;
    onDone?: (data: { message: AiMessage; session: AiSession }) => void;
    onError?: (data: {
        error: string;
        retryable: boolean;
        message?: AiMessage;
        session?: AiSession;
    }) => void;
}

/**
 * Ask a question in a chat (sessionId "new" starts one) and stream the
 * answer. Resolves when the stream ends; abort `signal` to stop.
 */
export async function streamAiMessage(
    sessionId: string,
    body: { content?: string; contextPersonIds?: string[]; regenerate?: boolean },
    handlers: AiStreamHandlers,
    signal: AbortSignal,
): Promise<void> {
    const path = `/ai/sessions/${sessionId}/messages`;
    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            cache: 'no-store',
            signal,
            headers: { ...headers(), Accept: 'text/event-stream' },
            body: JSON.stringify(body),
        });
    } catch (err) {
        if (signal.aborted) return;
        throw new ApiError(
            err instanceof Error && err.name === 'TypeError'
                ? 'No connection — check your internet and try again.'
                : 'Could not reach the server.',
            0,
        );
    }

    if (!res.ok || !res.body) {
        const raw = await res.text().catch(() => '');
        let message = res.statusText || 'Request failed';
        try {
            const parsed = JSON.parse(raw);
            message = parsed?.error ?? message;
        } catch {
            /* not JSON */
        }
        if (res.status === 401) handleUnauthorized(path);
        throw new ApiError(message, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    const dispatch = (block: string) => {
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length === 0) return;
        let payload: unknown;
        try {
            payload = JSON.parse(data.join('\n'));
        } catch {
            return;
        }
        const p = payload as Record<string, unknown>;
        switch (event) {
            case 'ready':
                handlers.onReady?.(p as { session: AiSession; userMessage: AiMessage });
                break;
            case 'status':
                handlers.onStatus?.(String(p.text ?? ''));
                break;
            case 'delta':
                handlers.onDelta?.(String(p.text ?? ''));
                break;
            case 'discard':
                handlers.onDiscard?.();
                break;
            case 'replace':
                handlers.onReplace?.(String(p.content ?? ''));
                break;
            case 'done':
                finished = true;
                handlers.onDone?.(p as { message: AiMessage; session: AiSession });
                break;
            case 'error':
                finished = true;
                handlers.onError?.(p as { error: string; retryable: boolean; message?: AiMessage; session?: AiSession });
                break;
        }
    };

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            let split: number;
            while ((split = buffer.indexOf('\n\n')) >= 0) {
                dispatch(buffer.slice(0, split));
                buffer = buffer.slice(split + 2);
            }
        }
        if (buffer.trim()) dispatch(buffer);
    } catch (err) {
        if (signal.aborted) return;
        throw new ApiError(
            err instanceof Error ? 'The connection dropped while answering.' : 'Stream failed',
            0,
        );
    }

    if (!finished && !signal.aborted) {
        throw new ApiError('The connection dropped while answering.', 0);
    }
}

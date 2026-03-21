// const API_BASE = 'http://localhost:8080/api';
const API_BASE = 'https://api.family.hitheredevs.com/api';

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

/**
 * Lightweight fuzzy name matching for the duplicate guard.
 * Pure functions over the already-loaded people map — no API calls.
 */

import type { Person } from '../types';
import { getPersonFullName } from './person-labels';

/** Lowercase, strip punctuation/diacritics, collapse whitespace */
export function normalizeName(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Levenshtein distance with early exit once `max` is exceeded */
function editDistance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    if (a === b) return 0;

    let prev = new Array<number>(b.length + 1);
    let curr = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > max) return max + 1;
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

/** Fuzzy token equality: exact, prefix, or small edit distance */
function tokensSimilar(a: string, b: string): boolean {
    if (a === b) return true;
    if (a.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
    if (a.length >= 4 && b.length >= 4) {
        const allowed = Math.min(a.length, b.length) >= 6 ? 2 : 1;
        return editDistance(a, b, allowed) <= allowed;
    }
    return false;
}

/**
 * Find existing people whose name looks like what the admin is typing.
 * Returns the best matches, strongest first.
 */
export function findSimilarPeople(
    firstName: string,
    lastName: string,
    people: Person[],
    limit = 3,
): Person[] {
    const qFirst = normalizeName(firstName);
    if (qFirst.length < 3) return [];
    const qLast = normalizeName(lastName);
    const qFull = `${qFirst} ${qLast}`.trim();

    const scored: Array<{ person: Person; score: number }> = [];

    for (const person of people) {
        const pFull = normalizeName(getPersonFullName(person));
        if (!pFull) continue;
        const pFirst = normalizeName(person.firstName || '');
        const pLast = normalizeName(person.lastName || '');

        let score = 0;
        if (pFull === qFull) {
            score = 100;
        } else if (tokensSimilar(pFirst, qFirst)) {
            score = 60;
            if (qLast && pLast && tokensSimilar(pLast, qLast)) score += 25;
            else if (!qLast && !pLast) score += 10;
            else if (qLast && pLast) score -= 25; // both set but different
        }

        if (score >= 50) scored.push({ person, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((entry) => entry.person);
}

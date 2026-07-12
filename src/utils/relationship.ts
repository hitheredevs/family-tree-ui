import type { Person } from '../types/person';

export interface RelationStep {
    personId: string;
    /** How we reached this person from the previous one */
    step: 'parent' | 'child' | 'spouse' | 'ex-spouse';
}

/**
 * Shortest connection path from source to target (excluding source
 * itself). Returns null when the two people are not connected.
 */
export function findRelationPath(
    sourceId: string,
    targetId: string,
    people: Record<string, Person>,
): RelationStep[] | null {
    if (sourceId === targetId) return [];
    if (!people[sourceId] || !people[targetId]) return null;

    const visited = new Set<string>([sourceId]);
    const queue: { id: string; path: RelationStep[] }[] = [
        { id: sourceId, path: [] },
    ];

    while (queue.length > 0) {
        const { id, path } = queue.shift()!;
        const current = people[id];
        if (!current) continue;

        const neighbours: RelationStep[] = [
            ...current.parentIds.map((pid) => ({ personId: pid, step: 'parent' as const })),
            ...current.childrenIds.map((cid) => ({ personId: cid, step: 'child' as const })),
            ...(current.spouseIds ?? []).map((sid) => ({ personId: sid, step: 'spouse' as const })),
            ...(current.exSpouseIds ?? []).map((sid) => ({ personId: sid, step: 'ex-spouse' as const })),
        ];

        for (const next of neighbours) {
            if (visited.has(next.personId)) continue;
            visited.add(next.personId);
            const nextPath = [...path, next];
            if (next.personId === targetId) return nextPath;
            queue.push({ id: next.personId, path: nextPath });
        }
    }

    return null;
}

export function getRelationship(
    sourceId: string,
    targetId: string,
    people: Record<string, Person>
): string {
    if (sourceId === targetId) return 'Self';

    const source = people[sourceId];
    if (!source) return 'Relative';

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: sourceId, path: [] }];

    while (queue.length > 0) {
        const { id, path } = queue.shift()!;
        if (id === targetId) {
            return translatePathToRelation(path, people[targetId]);
        }

        if (visited.has(id)) continue;
        visited.add(id);

        const current = people[id];
        if (!current) continue;

        // Go up to parents
        current.parentIds.forEach(pId => {
            queue.push({ id: pId, path: [...path, 'parent'] });
        });

        // Go down to children
        current.childrenIds.forEach(cId => {
            queue.push({ id: cId, path: [...path, 'child'] });
        });

        // Go to spouses
        if (current.spouseIds) {
            for (const sid of current.spouseIds) {
                queue.push({ id: sid, path: [...path, 'spouse'] });
            }
        }
        // Go to ex-spouses
        if (current.exSpouseIds) {
            for (const sid of current.exSpouseIds) {
                queue.push({ id: sid, path: [...path, 'ex-spouse'] });
            }
        }
    }

    return 'Relative';
}

function translatePathToRelation(path: string[], target: Person): string {
    const isMale = target.gender === 'male';
    const pathStr = path.join('-');
    const m = (m: string, f: string) => isMale ? m : f;

    switch (pathStr) {
        case 'parent': return m('Father', 'Mother');
        case 'child': return m('Son', 'Daughter');
        case 'spouse': return m('Husband', 'Wife');
        // When going up to a parent, then down to a child (who isn't yourself since we would have matched on length 0) => sibling
        case 'parent-child': return m('Brother', 'Sister');
        case 'parent-parent': return m('Grandfather', 'Grandmother');
        case 'child-child': return m('Grandson', 'Granddaughter');
        case 'parent-parent-child': return m('Uncle', 'Aunt');
        case 'parent-parent-child-child': return 'Cousin';
        case 'parent-child-child': return m('Nephew', 'Niece');
        case 'parent-parent-parent': return m('Great-Grandfather', 'Great-Grandmother');
        case 'child-child-child': return m('Great-Grandson', 'Great-Granddaughter');
        case 'spouse-parent': return m('Father-in-law', 'Mother-in-law');
        case 'child-spouse': return m('Son-in-law', 'Daughter-in-law');
        case 'spouse-parent-child': return m('Brother-in-law', 'Sister-in-law');
        case 'parent-child-spouse': return m('Brother-in-law', 'Sister-in-law');
        default:
            // Heuristics for deeper connections
            if (pathStr.startsWith('parent-parent-parent')) return 'Ancestor';
            if (pathStr.startsWith('child-child-child')) return 'Descendant';
            return 'Relative';
    }
}

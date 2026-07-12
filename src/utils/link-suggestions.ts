/**
 * High-confidence "link this existing person" suggestions, computed
 * from the already-loaded people graph. Shown as one-tap chips in the
 * add-relative modal.
 */

import type { Person } from '../types';

export type RelationKind = 'parent' | 'child' | 'spouse' | 'sibling';

export interface LinkSuggestion {
    person: Person;
    /** Short human reason, e.g. "Spouse of ABDUL" */
    reason: string;
}

const MAX_SUGGESTIONS = 4;

export function suggestLinks(
    relationType: RelationKind,
    relativeId: string,
    people: Record<string, Person>,
): LinkSuggestion[] {
    const relative = people[relativeId];
    if (!relative) return [];

    const out: LinkSuggestion[] = [];
    const seen = new Set<string>([relativeId]);
    const firstNameOf = (p: Person | undefined) =>
        (p?.firstName ?? '').toUpperCase();
    const push = (candidate: Person | undefined, reason: string) => {
        if (!candidate || seen.has(candidate.id)) return;
        seen.add(candidate.id);
        out.push({ person: candidate, reason });
    };

    if (relationType === 'parent') {
        if ((relative.parentIds?.length ?? 0) >= 2) return [];

        for (const parentId of relative.parentIds ?? []) {
            const parent = people[parentId];
            seen.add(parentId);

            /* Spouse of the existing single parent */
            for (const spouseId of [
                ...(parent?.spouseIds ?? []),
                ...(parent?.exSpouseIds ?? []),
            ]) {
                if (!(relative.parentIds ?? []).includes(spouseId)) {
                    push(people[spouseId], `Spouse of ${firstNameOf(parent)}`);
                }
            }

            /* Second parent of the person's siblings */
            for (const childId of parent?.childrenIds ?? []) {
                if (childId === relativeId) continue;
                const sibling = people[childId];
                for (const siblingParentId of sibling?.parentIds ?? []) {
                    if (
                        siblingParentId !== parentId &&
                        !(relative.parentIds ?? []).includes(siblingParentId)
                    ) {
                        push(
                            people[siblingParentId],
                            `Parent of ${firstNameOf(sibling)}`,
                        );
                    }
                }
            }
        }
    } else if (relationType === 'spouse') {
        /* Co-parent of the person's children who isn't linked as a spouse */
        const spouses = new Set([
            ...(relative.spouseIds ?? []),
            ...(relative.exSpouseIds ?? []),
        ]);
        for (const childId of relative.childrenIds ?? []) {
            const child = people[childId];
            for (const coParentId of child?.parentIds ?? []) {
                if (coParentId !== relativeId && !spouses.has(coParentId)) {
                    push(people[coParentId], `Parent of ${firstNameOf(child)}`);
                }
            }
        }
    } else if (relationType === 'child') {
        /* Spouse's children who aren't linked to this person yet */
        const childSet = new Set(relative.childrenIds ?? []);
        for (const spouseId of [
            ...(relative.spouseIds ?? []),
            ...(relative.exSpouseIds ?? []),
        ]) {
            const spouse = people[spouseId];
            for (const childId of spouse?.childrenIds ?? []) {
                if (!childSet.has(childId)) {
                    push(people[childId], `Child of ${firstNameOf(spouse)}`);
                }
            }
        }
    }
    /* sibling: no high-confidence signal — skip */

    return out.slice(0, MAX_SUGGESTIONS);
}

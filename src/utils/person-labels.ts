import type { Person } from '../types/person';
import { toUrdu } from './transliterate';

export function getPersonFullName(
    person: Pick<Person, 'firstName' | 'lastName'>,
): string {
    return `${person.firstName} ${person.lastName || ''}`.trim();
}

export function buildDuplicateNameMap(people: Person[]): Map<string, number> {
    const counts = new Map<string, number>();

    for (const person of people) {
        const key = getPersonFullName(person).toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
}

export function buildPeopleMap(people: Person[]): Map<string, Person> {
    return new Map(people.map((person) => [person.id, person]));
}

type PeopleLookup = Map<string, Person> | Record<string, Person>;

const lookup = (people: PeopleLookup, id: string): Person | undefined =>
    people instanceof Map ? people.get(id) : people[id];

/**
 * Who someone is the child of, shown under their name in every list and
 * search so people with the same name can be told apart:
 * "Father: X", "Mother: Y · father not added", or "No parents added".
 */
export function getParentLabel(
    person: Pick<Person, 'parentIds'>,
    people: PeopleLookup,
): string {
    const parents = (person.parentIds ?? [])
        .map((parentId) => lookup(people, parentId))
        .filter((parent): parent is Person => Boolean(parent));

    const father = parents.find((parent) => parent.gender === 'male');
    if (father) return `Father: ${getPersonFullName(father)}`;

    const mother = parents.find((parent) => parent.gender === 'female');
    if (mother) return `Mother: ${getPersonFullName(mother)} · father not added`;

    if (parents[0]) return `Parent: ${getPersonFullName(parents[0])}`;

    return 'No parents added';
}

/**
 * Kept for existing callers: now always returns the parent label (it used
 * to return one only when another person had the same name).
 */
export function getPersonDisambiguation(
    person: Person,
    peopleById: Map<string, Person>,
    _duplicateNames?: Map<string, number>,
): string {
    return getParentLabel(person, peopleById);
}

export function getPersonSearchText(
    person: Person,
    peopleById: Map<string, Person>,
    duplicateNames: Map<string, number>,
): string {
    const name = getPersonFullName(person);
    const urduName = toUrdu(name);
    // Includes the father's name, so "musaiyab saleem" finds the right one
    const parentLabel = getParentLabel(person, peopleById);
    void duplicateNames;

    return [name, urduName, parentLabel].filter(Boolean).join(' ').toLowerCase();
}

/** True when every word of `query` appears somewhere in `text` (case-insensitive). */
export function matchesAllWords(text: string, query: string): boolean {
    const hay = text.toLowerCase();
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => hay.includes(word));
}

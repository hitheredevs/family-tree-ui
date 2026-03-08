import type { Person } from '../types/person';

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

export function getPersonDisambiguation(
    person: Person,
    peopleById: Map<string, Person>,
    duplicateNames: Map<string, number>,
): string | null {
    const fullNameKey = getPersonFullName(person).toLowerCase();
    if ((duplicateNames.get(fullNameKey) ?? 0) < 2) return null;

    const parents = person.parentIds
        .map((parentId) => peopleById.get(parentId))
        .filter((parent): parent is Person => Boolean(parent));

    const father = parents.find((parent) => parent.gender === 'male');
    if (father) {
        return `Father: ${getPersonFullName(father)}`;
    }

    const mother = parents.find((parent) => parent.gender === 'female');
    if (mother) {
        return `Mother: ${getPersonFullName(mother)}`;
    }

    if (parents[0]) {
        return `Parent: ${getPersonFullName(parents[0])}`;
    }

    return null;
}

export function getPersonSearchText(
    person: Person,
    peopleById: Map<string, Person>,
    duplicateNames: Map<string, number>,
): string {
    const name = getPersonFullName(person);
    const disambiguation = getPersonDisambiguation(
        person,
        peopleById,
        duplicateNames,
    );

    return [name, disambiguation].filter(Boolean).join(' ').toLowerCase();
}

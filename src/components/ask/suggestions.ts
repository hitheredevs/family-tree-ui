import type { Person } from '../../types';
import { getPersonFullName } from '../../utils/person-labels';

export type SuggestionIcon = 'users' | 'route' | 'cake' | 'crown' | 'chart' | 'tree';

export interface Suggestion {
	icon: SuggestionIcon;
	title: string;
	/** Second line on the card */
	hint: string;
	prompt: string;
	contextIds?: string[];
}

/** People 3–5 links away from `meId` — interesting "how are we related?" picks. */
function nearbyRelatives(people: Record<string, Person>, meId: string): Person[] {
	const depth = new Map<string, number>([[meId, 0]]);
	let frontier = [meId];
	for (let d = 1; d <= 5 && frontier.length; d++) {
		const next: string[] = [];
		for (const id of frontier) {
			const p = people[id];
			if (!p) continue;
			for (const n of [...p.parentIds, ...p.childrenIds, ...(p.spouseIds ?? [])]) {
				if (depth.has(n) || !people[n]) continue;
				depth.set(n, d);
				next.push(n);
			}
		}
		frontier = next;
	}
	return [...depth]
		.filter(([, d]) => d >= 3)
		.map(([id]) => people[id])
		.filter((p) => !p.isDeceased)
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Starter questions, personalised to the signed-in person where possible. */
export function buildSuggestions(people: Record<string, Person>, meId: string): Suggestion[] {
	const me = people[meId];
	const list: Suggestion[] = [];

	if (me) {
		const grandparents = me.parentIds.flatMap((id) => people[id]?.parentIds ?? []);
		if (me.parentIds.length) {
			list.push({
				icon: 'users',
				title: 'Who are my cousins?',
				hint: 'Chachazad, Phuphizad, Mamuzad, Khalazad',
				prompt: 'Who are my first cousins?',
			});
		}
		if (grandparents.length) {
			list.push({
				icon: 'tree',
				title: 'Tell me about my grandparents',
				hint: 'Dada, Dadi, Nana and Nani',
				prompt: 'Tell me about my grandparents — Dada, Dadi, Nana and Nani.',
			});
		}
		const relatives = nearbyRelatives(people, meId);
		if (relatives.length) {
			// A different relative each day
			const day = Math.floor(Date.now() / 86_400_000);
			const pick = relatives[day % relatives.length];
			const name = getPersonFullName(pick).toUpperCase();
			list.push({
				icon: 'route',
				title: `How is ${name} related to me?`,
				hint: 'Traces the family link step by step',
				prompt: `How is @${name} related to me?`,
				contextIds: [pick.id],
			});
		}
	}

	const hasBirthdays = Object.values(people).some((p) => p.birthDate);
	if (hasBirthdays) {
		list.push({
			icon: 'cake',
			title: 'Upcoming birthdays',
			hint: 'The next 30 days',
			prompt: 'Whose birthdays are coming up in the next 30 days?',
		});
	}
	list.push({
		icon: 'crown',
		title: 'Who has the most grandchildren?',
		hint: 'Across the whole family',
		prompt: 'Who has the most grandchildren in the family?',
	});
	list.push({
		icon: 'chart',
		title: 'The family in numbers',
		hint: 'People, generations, living and passed away',
		prompt: 'How many people are in the family tree, and how many generations does it cover?',
	});

	return list.slice(0, 6);
}

/** Parents, spouses, children and siblings — offered first when typing "@". */
export function closeFamilyOf(people: Record<string, Person>, meId: string): string[] {
	const me = people[meId];
	if (!me) return [];
	const siblings = me.parentIds.flatMap((id) => people[id]?.childrenIds ?? []).filter((id) => id !== meId);
	return [...new Set([meId, ...me.parentIds, ...(me.spouseIds ?? []), ...me.childrenIds, ...siblings])].filter(
		(id) => people[id],
	);
}

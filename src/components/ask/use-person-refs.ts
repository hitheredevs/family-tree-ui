import { useMemo } from 'react';
import type { Person } from '../../types';

/** Map short refs used by the assistant ("945088b2") to full person ids. */
export function usePersonRefResolver(people: Record<string, Person>) {
	return useMemo(() => {
		const map = new Map<string, string>();
		for (const id of Object.keys(people)) {
			map.set(id.slice(0, 8), id);
			map.set(id.replace(/-/g, '').slice(0, 12), id);
			map.set(id, id);
		}
		return (ref: string): string | null => map.get(ref.trim().toLowerCase()) ?? null;
	}, [people]);
}

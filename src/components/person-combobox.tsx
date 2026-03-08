import { useEffect, useMemo, useState } from 'react';
import type { Person } from '../types/person';
import {
	buildDuplicateNameMap,
	buildPeopleMap,
	getPersonDisambiguation,
	getPersonFullName,
	getPersonSearchText,
} from '../utils/person-labels';
import { getAvatarUrl } from '../utils/avatar';

export function PersonCombobox({
	people,
	value,
	onChange,
	placeholder = 'Search for a person...',
	className = '',
}: {
	people: Person[];
	value: string;
	onChange: (val: string) => void;
	placeholder?: string;
	className?: string;
}) {
	const [query, setQuery] = useState('');
	const [isOpen, setIsOpen] = useState(false);
	const peopleById = useMemo(() => buildPeopleMap(people), [people]);
	const duplicateNames = useMemo(() => buildDuplicateNameMap(people), [people]);
	const getDisambiguation = (person: Person) =>
		getPersonDisambiguation(person, peopleById, duplicateNames);
	const getInputLabel = (person: Person) => {
		const disambiguation = getDisambiguation(person);
		return disambiguation
			? `${getPersonFullName(person)} — ${disambiguation}`
			: getPersonFullName(person);
	};

	const selectedPerson = people.find((p) => p.id === value);

	useEffect(() => {
		if (!isOpen) {
			setQuery(selectedPerson ? getInputLabel(selectedPerson) : '');
		}
	}, [isOpen, selectedPerson]);

	const filtered =
		query === '' && !isOpen
			? people
			: people.filter((p) =>
					getPersonSearchText(p, peopleById, duplicateNames).includes(
						query.toLowerCase(),
					),
				);

	return (
		<div className='relative'>
			<input
				type='text'
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setIsOpen(true);
					// Clear selection if input is cleared
					if (e.target.value === '') {
						onChange('');
					}
				}}
				onFocus={() => setIsOpen(true)}
				onBlur={() => setTimeout(() => setIsOpen(false), 200)}
				placeholder={placeholder}
				className={
					className ||
					'w-full appearance-none rounded-xl border-transparent bg-gray-50 px-4 py-3 text-sm text-gray-800 focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-200'
				}
			/>
			{isOpen && (
				<ul className='absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-gray-100 bg-white py-1 shadow-xl'>
					{filtered.length === 0 ? (
						<li className='px-4 py-3 text-sm text-gray-500'>
							No people found.
						</li>
					) : (
						filtered.map((p) => (
							<li
								key={p.id}
								onMouseDown={(e) => {
									e.preventDefault(); // prevent blur
									onChange(p.id);
									setIsOpen(false);
								}}
								className='flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-lime-50'
							>
								<img
									src={getAvatarUrl(p)}
									className='h-8 w-8 shrink-0 rounded-full border border-gray-100 object-cover'
									alt=''
								/>
								<div className='min-w-0'>
									<div className='truncate text-sm font-medium text-gray-800'>
										{getPersonFullName(p)}
									</div>
									{getDisambiguation(p) && (
										<div className='truncate text-xs text-gray-500'>
											{getDisambiguation(p)}
										</div>
									)}
								</div>
							</li>
						))
					)}
				</ul>
			)}
		</div>
	);
}

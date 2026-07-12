import { useMemo, useState } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import { useLanguage } from '../../state/language-context';
import { toUrdu } from '../../utils/transliterate';
import {
	getPersonFullName,
	getPersonDisambiguation,
	buildDuplicateNameMap,
	buildPeopleMap,
	getPersonSearchText,
} from '../../utils/person-labels';
import type { Person } from '../../types';

type LifeFilter = 'all' | 'living' | 'late';

export function PeopleScreen({ onPersonOpen }: { onPersonOpen: () => void }) {
	const { state, dispatch } = useFamilyTree();
	const { isUrdu } = useLanguage();

	const [query, setQuery] = useState('');
	const [lifeFilter, setLifeFilter] = useState<LifeFilter>('all');

	const allPeople = useMemo(
		() => Object.values(state.people),
		[state.people],
	);
	const peopleById = useMemo(() => buildPeopleMap(allPeople), [allPeople]);
	const duplicateNames = useMemo(
		() => buildDuplicateNameMap(allPeople),
		[allPeople],
	);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return allPeople
			.filter((p) => {
				if (lifeFilter === 'living' && p.isDeceased) return false;
				if (lifeFilter === 'late' && !p.isDeceased) return false;
				if (!q) return true;
				return getPersonSearchText(p, peopleById, duplicateNames).includes(q);
			})
			.sort((a, b) =>
				getPersonFullName(a).localeCompare(getPersonFullName(b)),
			);
	}, [allPeople, query, lifeFilter, peopleById, duplicateNames]);

	function openPerson(p: Person) {
		dispatch({ type: 'SELECT_PERSON', personId: p.id });
		onPersonOpen();
	}

	const filterChip = (value: LifeFilter, label: string) => (
		<button
			key={value}
			onClick={() => setLifeFilter(value)}
			className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
				lifeFilter === value
					? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
					: 'bg-white text-stone-500 ring-1 ring-stone-200 hover:text-stone-700'
			}`}
		>
			{label}
		</button>
	);

	return (
		<div className='flex h-full w-full flex-col bg-stone-50'>
			{/* Header */}
			<div className='mx-auto w-full max-w-2xl px-6 pt-8 pb-4'>
				<h1 className='text-2xl font-bold text-stone-800 tracking-tight'>
					People
				</h1>
				<p className='text-sm text-stone-500'>
					{filtered.length} of {allPeople.length} family members
				</p>
			</div>

			{/* Search + filters */}
			<div className='mx-auto w-full max-w-2xl px-4 pb-3 space-y-2.5'>
				<div className='flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-stone-200/70 shadow-sm shadow-stone-900/5'>
					<Search size={16} className='shrink-0 text-stone-400' />
					<input
						type='text'
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder='Search by name…'
						className='w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400'
					/>
					{query && (
						<button
							onClick={() => setQuery('')}
							className='rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600'
						>
							<X size={14} />
						</button>
					)}
				</div>
				<div className='flex gap-2'>
					{filterChip('all', 'All')}
					{filterChip('living', 'Living')}
					{filterChip('late', 'Late')}
				</div>
			</div>

			{/* List */}
			<div className='flex-1 overflow-y-auto pb-24 md:pb-8'>
				<div className='mx-auto w-full max-w-2xl px-4'>
					<div className='overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/60'>
						{filtered.length === 0 && (
							<p className='px-4 py-8 text-center text-sm text-stone-400'>
								Nobody matches your search.
							</p>
						)}
						{filtered.map((p) => {
							const name = getPersonFullName(p);
							const context =
								getPersonDisambiguation(p, peopleById, duplicateNames) ??
								p.location ??
								'';
							return (
								<button
									key={p.id}
									onClick={() => openPerson(p)}
									className='flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-emerald-50/50'
									style={{ contentVisibility: 'auto' }}
								>
									<span
										className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white bg-gradient-to-b ${
											p.gender === 'female'
												? 'from-pink-300 to-pink-500'
												: 'from-blue-300 to-blue-500'
										} ${p.isDeceased ? 'grayscale' : ''}`}
									>
										{(p.firstName?.[0] ?? '?').toUpperCase()}
									</span>
									<span className='min-w-0 flex-1'>
										<span className='flex items-center gap-2'>
											<span className='truncate text-[15px] font-semibold text-stone-800 uppercase'>
												{isUrdu ? (
													<span
														style={{
															fontFamily: "'Noto Nastaliq Urdu', serif",
															direction: 'rtl' as const,
														}}
													>
														{toUrdu(name)}
													</span>
												) : (
													name
												)}
											</span>
											{p.isDeceased && (
												<span className='shrink-0 rounded-full bg-stone-700 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white'>
													{isUrdu ? 'مرحوم' : 'Late'}
												</span>
											)}
										</span>
										{context && (
											<span className='mt-0.5 flex items-center gap-1 truncate text-xs text-stone-400'>
												{!getPersonDisambiguation(
													p,
													peopleById,
													duplicateNames,
												) &&
													p.location && <MapPin size={11} />}
												{context}
											</span>
										)}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}

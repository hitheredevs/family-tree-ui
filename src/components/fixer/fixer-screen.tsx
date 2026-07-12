import { useMemo, useState } from 'react';
import {
	Wrench,
	Copy,
	UserX,
	Users,
	ChevronDown,
	ChevronRight,
	Check,
	Lock,
} from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import {
	getPersonFullName,
	getPersonDisambiguation,
	buildDuplicateNameMap,
	buildPeopleMap,
} from '../../utils/person-labels';
import * as api from '../../services/api-client';
import type { Person } from '../../types';

interface MissingParentIssue {
	child: Person;
	existingParent: Person;
	suggestedParent: Person;
}

export function FixerScreen({ onPersonOpen }: { onPersonOpen: () => void }) {
	const { state, dispatch, currentUser, refreshTree } = useFamilyTree();
	const isAdmin = currentUser?.role === 'admin';

	const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
	const [fixing, setFixing] = useState<string | null>(null);
	const [fixedIds, setFixedIds] = useState<Set<string>>(new Set());
	const [error, setError] = useState('');

	const allPeople = useMemo(
		() => Object.values(state.people),
		[state.people],
	);
	const peopleById = useMemo(() => buildPeopleMap(allPeople), [allPeople]);
	const duplicateNames = useMemo(
		() => buildDuplicateNameMap(allPeople),
		[allPeople],
	);

	/* ---- Possible duplicates: same normalized full name ---- */
	const duplicateGroups = useMemo(() => {
		const groups = new Map<string, Person[]>();
		for (const p of allPeople) {
			const key = getPersonFullName(p).toLowerCase().trim();
			if (!key || (duplicateNames.get(key) ?? 0) < 2) continue;
			const bucket = groups.get(key);
			if (bucket) bucket.push(p);
			else groups.set(key, [p]);
		}
		return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
	}, [allPeople, duplicateNames]);

	/* ---- Children with one parent whose parent has exactly one spouse ---- */
	const missingParents = useMemo(() => {
		const issues: MissingParentIssue[] = [];
		for (const child of allPeople) {
			if (fixedIds.has(child.id)) continue;
			if ((child.parentIds?.length ?? 0) !== 1) continue;
			const parent = state.people[child.parentIds[0]];
			if (!parent) continue;
			const spouseIds = parent.spouseIds ?? [];
			if (spouseIds.length !== 1) continue;
			const spouse = state.people[spouseIds[0]];
			if (!spouse || child.parentIds.includes(spouse.id)) continue;
			issues.push({ child, existingParent: parent, suggestedParent: spouse });
		}
		return issues;
	}, [allPeople, state.people, fixedIds]);

	/* ---- People with no connections at all ---- */
	const unconnected = useMemo(
		() =>
			allPeople.filter(
				(p) =>
					(p.parentIds?.length ?? 0) === 0 &&
					(p.childrenIds?.length ?? 0) === 0 &&
					(p.spouseIds?.length ?? 0) === 0 &&
					(p.exSpouseIds?.length ?? 0) === 0,
			),
		[allPeople],
	);

	function openPerson(id: string) {
		dispatch({ type: 'SELECT_PERSON', personId: id });
		onPersonOpen();
	}

	async function fixMissingParent(issue: MissingParentIssue) {
		setFixing(issue.child.id);
		setError('');
		try {
			await api.addRelationshipsBatch([
				{
					sourcePersonId: issue.suggestedParent.id,
					targetPersonId: issue.child.id,
					relationshipType: 'PARENT',
				},
			]);
			setFixedIds((prev) => new Set(prev).add(issue.child.id));
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to link parent');
		} finally {
			setFixing(null);
		}
	}

	if (!isAdmin) {
		return (
			<div className='flex h-full w-full flex-col items-center justify-center gap-3 bg-stone-50 px-8 text-center'>
				<Lock size={28} className='text-stone-300' />
				<p className='text-sm text-stone-400'>
					The Fixer is only available to family admins.
				</p>
			</div>
		);
	}

	const SectionLabel = ({ children }: { children: React.ReactNode }) => (
		<h2 className='px-2 text-[11px] font-bold uppercase tracking-widest text-stone-400'>
			{children}
		</h2>
	);
	const Card = ({ children }: { children: React.ReactNode }) => (
		<div className='overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/60'>
			{children}
		</div>
	);
	const Avatar = ({ p }: { p: Person }) => (
		<span
			className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white bg-gradient-to-b ${
				p.gender === 'female'
					? 'from-pink-300 to-pink-500'
					: 'from-blue-300 to-blue-500'
			} ${p.isDeceased ? 'grayscale' : ''}`}
		>
			{(p.firstName?.[0] ?? '?').toUpperCase()}
		</span>
	);

	return (
		<div className='flex h-full w-full flex-col bg-stone-50'>
			<div className='mx-auto w-full max-w-2xl px-6 pt-8 pb-4'>
				<h1 className='flex items-center gap-2 text-2xl font-bold text-stone-800 tracking-tight'>
					<Wrench size={22} className='text-emerald-600' />
					Fixer
				</h1>
				<p className='text-sm text-stone-500'>
					Data-quality checks computed from the live tree
				</p>
			</div>

			<div className='flex-1 overflow-y-auto pb-24 md:pb-8'>
				<div className='mx-auto w-full max-w-2xl space-y-6 px-4'>
					{error && (
						<div className='rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'>
							{error}
						</div>
					)}

					{/* Missing second parent — one-tap fix */}
					<div className='space-y-2.5'>
						<SectionLabel>
							<span className='inline-flex items-center gap-1.5'>
								<Users size={12} />
								Missing second parent · {missingParents.length}
							</span>
						</SectionLabel>
						<Card>
							{missingParents.length === 0 && (
								<p className='px-4 py-6 text-center text-sm text-stone-400'>
									Every child with one parent is covered. Nothing to fix.
								</p>
							)}
							{missingParents.slice(0, 30).map((issue) => (
								<div
									key={issue.child.id}
									className='flex items-center gap-3 border-b border-stone-100 px-4 py-3 last:border-0'
								>
									<Avatar p={issue.child} />
									<span className='min-w-0 flex-1'>
										<button
											onClick={() => openPerson(issue.child.id)}
											className='block truncate text-left text-sm font-semibold text-stone-800 uppercase hover:text-emerald-700'
										>
											{getPersonFullName(issue.child)}
										</button>
										<span className='block truncate text-xs text-stone-400'>
											Has {issue.existingParent.firstName.toUpperCase()} —
											missing {issue.suggestedParent.firstName.toUpperCase()}?
										</span>
									</span>
									<button
										disabled={fixing === issue.child.id}
										onClick={() => fixMissingParent(issue)}
										className='shrink-0 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:opacity-50'
									>
										{fixing === issue.child.id ? 'Linking…' : 'Link parent'}
									</button>
								</div>
							))}
							{missingParents.length > 30 && (
								<p className='px-4 py-2.5 text-center text-xs text-stone-400'>
									+{missingParents.length - 30} more — fix these first
								</p>
							)}
						</Card>
					</div>

					{/* Possible duplicates */}
					<div className='space-y-2.5'>
						<SectionLabel>
							<span className='inline-flex items-center gap-1.5'>
								<Copy size={12} />
								Possible duplicates · {duplicateGroups.length} name groups
							</span>
						</SectionLabel>
						<Card>
							{duplicateGroups.length === 0 && (
								<p className='px-4 py-6 text-center text-sm text-stone-400'>
									No duplicate names found.
								</p>
							)}
							{duplicateGroups.map(([key, group]) => {
								const expanded = expandedGroup === key;
								return (
									<div
										key={key}
										className='border-b border-stone-100 last:border-0'
									>
										<button
											onClick={() => setExpandedGroup(expanded ? null : key)}
											className='flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-stone-50'
										>
											{expanded ? (
												<ChevronDown size={15} className='text-stone-400' />
											) : (
												<ChevronRight size={15} className='text-stone-400' />
											)}
											<span className='flex-1 truncate text-sm font-semibold text-stone-800 uppercase'>
												{key}
											</span>
											<span className='rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700'>
												×{group.length}
											</span>
										</button>
										{expanded && (
											<div className='space-y-1.5 bg-stone-50/60 px-4 pb-3 pt-1'>
												{group.map((p) => (
													<button
														key={p.id}
														onClick={() => openPerson(p.id)}
														className='flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-stone-200/70 transition-all hover:ring-emerald-300'
													>
														<Avatar p={p} />
														<span className='min-w-0 flex-1'>
															<span className='block truncate text-sm font-semibold text-stone-800 uppercase'>
																{getPersonFullName(p)}
															</span>
															<span className='block truncate text-xs text-stone-500'>
																{getPersonDisambiguation(
																	p,
																	peopleById,
																	duplicateNames,
																) ?? 'No parents linked'}
																{' · '}
																{p.childrenIds?.length ?? 0} children
															</span>
														</span>
													</button>
												))}
												<p className='px-1 pt-1 text-[11px] text-stone-400'>
													If two entries are the same person: move any missing
													links to the one you keep (Manage Relationships on
													their profile), then delete the duplicate.
												</p>
											</div>
										)}
									</div>
								);
							})}
						</Card>
					</div>

					{/* Unconnected people */}
					<div className='space-y-2.5'>
						<SectionLabel>
							<span className='inline-flex items-center gap-1.5'>
								<UserX size={12} />
								Not connected to anyone · {unconnected.length}
							</span>
						</SectionLabel>
						<Card>
							{unconnected.length === 0 && (
								<p className='flex items-center justify-center gap-1.5 px-4 py-6 text-center text-sm text-emerald-600'>
									<Check size={15} /> Everyone is connected.
								</p>
							)}
							{unconnected.map((p) => (
								<button
									key={p.id}
									onClick={() => openPerson(p.id)}
									className='flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-emerald-50/50'
								>
									<Avatar p={p} />
									<span className='min-w-0 flex-1'>
										<span className='block truncate text-sm font-semibold text-stone-800 uppercase'>
											{getPersonFullName(p)}
										</span>
										<span className='block text-xs text-stone-400'>
											Open their profile to add family links
										</span>
									</span>
								</button>
							))}
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}

import { useState, useEffect, useMemo, useRef } from 'react';
import {
	UserPlus,
	Link2,
	Sparkles,
	Plus,
	Check,
	ArrowUp,
	ArrowDown,
	Heart,
	Users,
} from 'lucide-react';
import { useFamilyTree } from '../state/family-tree-context';
import { getAvatarUrl } from '../utils/avatar';
import type { Gender, Person } from '../types';
import * as api from '../services/api-client';
import { PersonCombobox } from './person-combobox';
import { findSimilarPeople } from '../utils/name-match';
import { suggestLinks } from '../utils/link-suggestions';
import {
	getPersonFullName,
	getPersonDisambiguation,
	buildDuplicateNameMap,
	buildPeopleMap,
} from '../utils/person-labels';

/* ------------------------------------------------------------------ */
/*  Smart default helpers (all silent — never shown to user)           */
/* ------------------------------------------------------------------ */

function inferGender(
	relationType: string | null,
	relativeGender: string | undefined,
	existingParentGenders: (string | undefined)[],
): Gender {
	if (relationType === 'spouse') {
		return relativeGender === 'male' ? 'female' : 'male';
	}
	if (relationType === 'parent') {
		// If there's already one parent, infer opposite gender for the new one
		if (existingParentGenders.length === 1) {
			return existingParentGenders[0] === 'male' ? 'female' : 'male';
		}
		return 'male';
	}
	return 'male'; // child / sibling default
}

function inferLastName(
	relationType: string | null,
	relativeLast: string | undefined,
	gender: Gender,
): string {
	if (!relativeLast) return '';
	if (relationType === 'spouse') return ''; // maiden name — always leave blank
	if (relationType === 'parent') return gender === 'male' ? relativeLast : ''; // father shares surname, mother usually maiden
	return relativeLast; // child / sibling inherit
}

function buildTitle(relationType: string | null, relativeName: string): string {
	if (!relationType || !relativeName) return 'Add Person';
	const map: Record<string, string> = {
		parent: `Add a parent for ${relativeName}`,
		child: `Add a child for ${relativeName}`,
		spouse: `Add ${relativeName}'s spouse`,
		sibling: `Add a sibling for ${relativeName}`,
	};
	return map[relationType] ?? 'Add Person';
}

type RelationKind = 'parent' | 'child' | 'spouse' | 'sibling';

/** Gender-aware relation word for the live preview sentence */
function relationWord(relation: RelationKind, gender: Gender): string {
	const words: Record<RelationKind, Record<string, string>> = {
		parent: { male: 'father', female: 'mother', other: 'parent' },
		child: { male: 'son', female: 'daughter', other: 'child' },
		spouse: { male: 'husband', female: 'wife', other: 'spouse' },
		sibling: { male: 'brother', female: 'sister', other: 'sibling' },
	};
	return words[relation][gender] ?? words[relation].other;
}

/* ------------------------------------------------------------------ */
/*  Relation chips — always-visible icon buttons (no dropdown)         */
/* ------------------------------------------------------------------ */

const RELATION_OPTIONS: Array<{
	value: RelationKind;
	label: string;
	icon: typeof ArrowUp;
}> = [
	{ value: 'parent', label: 'Parent', icon: ArrowUp },
	{ value: 'child', label: 'Child', icon: ArrowDown },
	{ value: 'spouse', label: 'Spouse', icon: Heart },
	{ value: 'sibling', label: 'Sibling', icon: Users },
];

function RelationChips({
	value,
	onChange,
	siblingDisabled,
}: {
	value: RelationKind;
	onChange: (r: RelationKind) => void;
	siblingDisabled: boolean;
}) {
	return (
		<div className='grid grid-cols-4 gap-2'>
			{RELATION_OPTIONS.map(({ value: v, label, icon: Icon }) => {
				const disabled = v === 'sibling' && siblingDisabled;
				const active = value === v;
				return (
					<button
						key={v}
						type='button'
						disabled={disabled}
						title={
							disabled ? 'This person has no parents linked yet' : undefined
						}
						onClick={() => onChange(v)}
						className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 text-[11px] font-semibold transition-all ${
							active
								? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
								: disabled
									? 'cursor-not-allowed border-stone-100 bg-stone-50 text-stone-300'
									: 'border-stone-100 bg-stone-50 text-stone-500 hover:border-stone-300'
						}`}
					>
						<Icon size={16} />
						{label}
					</button>
				);
			})}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Gender toggle (replaces the plain <select>)                        */
/* ------------------------------------------------------------------ */

function GenderPicker({
	value,
	onChange,
}: {
	value: Gender;
	onChange: (g: Gender) => void;
}) {
	const opts: { v: Gender; label: string; emoji: string }[] = [
		{ v: 'male', label: 'Male', emoji: '♂' },
		{ v: 'female', label: 'Female', emoji: '♀' },
		{ v: 'other', label: 'Other', emoji: '⚧' },
	];
	return (
		<div className='flex gap-2'>
			{opts.map(({ v, label, emoji }) => (
				<button
					key={v}
					type='button'
					onClick={() => onChange(v)}
					className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
						value === v
							? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
							: 'border-stone-100 bg-stone-50 text-stone-500 hover:border-stone-300'
					}`}
				>
					<span className='block text-xl leading-none'>{emoji}</span>
					<span className='text-[11px]'>{label}</span>
				</button>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  Small person chip (suggestions + duplicate guard)                  */
/* ------------------------------------------------------------------ */

function PersonInitial({ person }: { person: Person }) {
	return (
		<span
			className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white bg-gradient-to-b ${
				person.gender === 'female'
					? 'from-pink-300 to-pink-500'
					: 'from-blue-300 to-blue-500'
			} ${person.isDeceased ? 'grayscale' : ''}`}
		>
			{(person.firstName?.[0] ?? '?').toUpperCase()}
		</span>
	);
}

/* ------------------------------------------------------------------ */
/*  Main modal                                                          */
/* ------------------------------------------------------------------ */

export function AddPersonModal() {
	const { state, dispatch, refreshTree } = useFamilyTree();
	const { addPersonModal } = state;

	// Is this modal being opened with pre-set context (from floating node buttons)?
	const isContextual = Boolean(
		addPersonModal.relativePersonId && addPersonModal.relationType,
	);
	const relative = addPersonModal.relativePersonId
		? state.people[addPersonModal.relativePersonId]
		: null;

	// Mode: create a brand-new person, or link someone who already exists
	const [mode, setMode] = useState<'create' | 'link'>('create');
	const [existingPersonId, setExistingPersonId] = useState('');

	// Core form state
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [gender, setGender] = useState<Gender>('male');
	const [isDeceased, setIsDeceased] = useState(false);
	const [adoptChildren, setAdoptChildren] = useState(true);
	const [autoLinkSpouse, setAutoLinkSpouse] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	// Rapid entry: keep the modal open after save and add another
	const [addAnother, setAddAnother] = useState(false);
	const [savedNames, setSavedNames] = useState<string[]>([]);

	// Extra state for non-contextual (menu-triggered) full form
	const [relativePersonId, setRelativePersonId] = useState('');
	const [relationType, setRelationType] = useState<RelationKind>('child');

	const firstNameRef = useRef<HTMLInputElement>(null);

	// Each time the modal opens: reset fields + apply smart defaults silently
	useEffect(() => {
		if (!addPersonModal.isOpen) return;

		setError('');
		setIsDeceased(false);
		setAdoptChildren(true);
		setAutoLinkSpouse(true);
		setSaving(false);
		setFirstName('');
		setMode('create');
		setExistingPersonId('');
		setAddAnother(false);
		setSavedNames([]);
		setRelativePersonId(addPersonModal.relativePersonId ?? '');
		setRelationType(addPersonModal.relationType ?? 'child');

		const rel = addPersonModal.relativePersonId
			? state.people[addPersonModal.relativePersonId]
			: null;
		const parents = (rel?.parentIds ?? [])
			.map((id) => state.people[id])
			.filter(Boolean);

		const g = inferGender(
			addPersonModal.relationType ?? null,
			rel?.gender,
			parents.map((p) => p.gender),
		);
		const ln = inferLastName(
			addPersonModal.relationType ?? null,
			rel?.lastName,
			g,
		);
		setGender(g);
		setLastName(ln);

		setTimeout(() => firstNameRef.current?.focus(), 80);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		addPersonModal.isOpen,
		addPersonModal.relativePersonId,
		addPersonModal.relationType,
	]);

	/* ---- derived context ---- */

	const targRelativeId = isContextual
		? (addPersonModal.relativePersonId ?? '')
		: relativePersonId;
	const targRelationType: RelationKind = isContextual
		? (addPersonModal.relationType ?? 'child')
		: relationType;

	const selectedRelative = targRelativeId
		? (state.people[targRelativeId] ?? null)
		: null;

	const allPeople = useMemo(
		() => Object.values(state.people),
		[state.people],
	);
	const peopleById = useMemo(() => buildPeopleMap(allPeople), [allPeople]);
	const duplicateNames = useMemo(
		() => buildDuplicateNameMap(allPeople),
		[allPeople],
	);

	/* One-tap smart link suggestions for this relative + relation */
	const suggestions = useMemo(() => {
		if (!addPersonModal.isOpen || !targRelativeId) return [];
		return suggestLinks(targRelationType, targRelativeId, state.people);
	}, [addPersonModal.isOpen, targRelativeId, targRelationType, state.people]);

	/* Duplicate guard: similar existing people while typing a new name */
	const similarPeople = useMemo(() => {
		if (!addPersonModal.isOpen || mode !== 'create') return [];
		return findSimilarPeople(firstName, lastName, allPeople);
	}, [addPersonModal.isOpen, mode, firstName, lastName, allPeople]);

	/* Candidates for the link-existing picker */
	const linkCandidates = useMemo(() => {
		if (!selectedRelative) return allPeople;
		const exclude = new Set<string>([selectedRelative.id]);
		if (targRelationType === 'parent') {
			for (const id of selectedRelative.parentIds ?? []) exclude.add(id);
		} else if (targRelationType === 'child') {
			for (const id of selectedRelative.childrenIds ?? []) exclude.add(id);
		} else if (targRelationType === 'spouse') {
			for (const id of [
				...(selectedRelative.spouseIds ?? []),
				...(selectedRelative.exSpouseIds ?? []),
			])
				exclude.add(id);
		}
		return allPeople.filter((p) => !exclude.has(p.id));
	}, [allPeople, selectedRelative, targRelationType]);

	if (!addPersonModal.isOpen) return null;

	const canAddSibling =
		selectedRelative && selectedRelative.parentIds.length > 0;
	const parentSlotsFull =
		targRelationType === 'parent' &&
		(selectedRelative?.parentIds?.length ?? 0) >= 2;

	const siblingBlocked =
		targRelationType === 'sibling' &&
		(selectedRelative?.parentIds?.length ?? 0) === 0;

	const canSubmit =
		Boolean(targRelativeId) &&
		!parentSlotsFull &&
		!siblingBlocked &&
		(mode === 'create'
			? firstName.trim().length > 0
			: existingPersonId.length > 0);

	// If adding a child and relative has exactly one spouse, we will auto-link in background
	const autoSecondParent =
		targRelationType === 'child' && selectedRelative?.spouseIds?.length === 1
			? state.people[selectedRelative.spouseIds[0]]
			: null;

	const showAddAnother =
		targRelationType === 'child' || targRelationType === 'sibling';

	/* Live preview sentence (menu-opened form only) */
	const previewPerson =
		mode === 'link' && existingPersonId
			? (state.people[existingPersonId] ?? null)
			: null;
	const previewName =
		mode === 'create'
			? firstName.trim()
			: previewPerson
				? getPersonFullName(previewPerson)
				: '';
	const previewGender: Gender =
		mode === 'create' ? gender : ((previewPerson?.gender as Gender) ?? 'other');
	const showPreview = Boolean(
		!isContextual && selectedRelative && previewName && !parentSlotsFull,
	);

	/* ------------------------------------------------------------------ */
	/*  Save helpers                                                       */
	/* ------------------------------------------------------------------ */

	function afterSave(displayName: string, undo: () => Promise<void>, label: string) {
		dispatch({ type: 'PUSH_UNDO', entry: { label, action: undo } });
		dispatch({ type: 'TREE_MUTATED' });

		if (addAnother && showAddAnother) {
			setSavedNames((prev) => [...prev, displayName.toUpperCase()]);
			setFirstName('');
			setExistingPersonId('');
			setError('');
			setTimeout(() => firstNameRef.current?.focus(), 60);
			void refreshTree();
		} else {
			dispatch({ type: 'CLOSE_ADD_PERSON_MODAL' });
			void refreshTree();
		}
	}

	/** Create a brand-new person + all links in ONE request */
	async function handleCreateSave() {
		const fin = firstName.trim();
		if (!fin || !targRelativeId || !selectedRelative) return;
		setSaving(true);
		setError('');

		try {
			/* Relations FROM the new person TO existing people */
			const relations: api.NewPersonRelationInput[] = [];

			if (targRelationType === 'sibling') {
				if (selectedRelative.parentIds.length === 0) {
					throw new Error(
						'Cannot add sibling — this person has no parents yet.',
					);
				}
				for (const parentId of selectedRelative.parentIds) {
					relations.push({
						targetPersonId: parentId,
						relationshipType: 'CHILD',
					});
				}
			} else if (targRelationType === 'child') {
				relations.push({
					targetPersonId: targRelativeId,
					relationshipType: 'CHILD',
				});
				if (autoLinkSpouse && autoSecondParent) {
					relations.push({
						targetPersonId: autoSecondParent.id,
						relationshipType: 'CHILD',
					});
				}
			} else if (targRelationType === 'parent') {
				relations.push({
					targetPersonId: targRelativeId,
					relationshipType: 'PARENT',
				});
			} else if (targRelationType === 'spouse') {
				relations.push({
					targetPersonId: targRelativeId,
					relationshipType: 'SPOUSE',
				});
				if (adoptChildren) {
					for (const childId of selectedRelative.childrenIds ?? []) {
						relations.push({
							targetPersonId: childId,
							relationshipType: 'PARENT',
						});
					}
				}
			}

			const { person: created } = await api.createPersonWithRelations({
				person: {
					firstName: fin,
					lastName: lastName.trim() || undefined,
					gender,
					isDeceased,
				},
				relations,
			});

			afterSave(
				created.firstName,
				async () => {
					await api.deletePerson(created.id);
					await refreshTree();
				},
				`Add ${targRelationType} ${created.firstName}`,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add person');
		} finally {
			setSaving(false);
		}
	}

	/** Link an EXISTING person in ONE request */
	async function handleLinkSave(personId: string) {
		if (!personId || !targRelativeId || !selectedRelative) return;
		const existing = state.people[personId];
		setSaving(true);
		setError('');

		try {
			const rows: api.BatchRelationshipInput[] = [];

			if (targRelationType === 'sibling') {
				if (selectedRelative.parentIds.length === 0) {
					throw new Error(
						'Cannot add sibling — this person has no parents yet.',
					);
				}
				for (const parentId of selectedRelative.parentIds) {
					rows.push({
						sourcePersonId: parentId,
						targetPersonId: personId,
						relationshipType: 'PARENT',
					});
				}
			} else if (targRelationType === 'child') {
				rows.push({
					sourcePersonId: targRelativeId,
					targetPersonId: personId,
					relationshipType: 'PARENT',
				});
				if (autoLinkSpouse && autoSecondParent) {
					rows.push({
						sourcePersonId: autoSecondParent.id,
						targetPersonId: personId,
						relationshipType: 'PARENT',
					});
				}
			} else if (targRelationType === 'parent') {
				rows.push({
					sourcePersonId: personId,
					targetPersonId: targRelativeId,
					relationshipType: 'PARENT',
				});
			} else if (targRelationType === 'spouse') {
				rows.push({
					sourcePersonId: targRelativeId,
					targetPersonId: personId,
					relationshipType: 'SPOUSE',
				});
				if (adoptChildren) {
					for (const childId of selectedRelative.childrenIds ?? []) {
						rows.push({
							sourcePersonId: personId,
							targetPersonId: childId,
							relationshipType: 'PARENT',
						});
					}
				}
			}

			const { relationships } = await api.addRelationshipsBatch(rows);

			afterSave(
				existing ? existing.firstName : 'Person',
				async () => {
					for (const rel of relationships) {
						await api.removeRelationship(rel.id).catch(() => {});
					}
					await refreshTree();
				},
				`Link ${targRelationType} ${existing?.firstName ?? ''}`.trim(),
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to link person');
		} finally {
			setSaving(false);
		}
	}

	const title = isContextual
		? buildTitle(
				addPersonModal.relationType ?? null,
				(relative?.firstName ?? '').toUpperCase(),
			)
		: 'Add Relative';

	const inputClass =
		'w-full rounded-xl border border-transparent bg-stone-50 px-4 py-3 text-stone-800 transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200';

	return (
		<div
			className='modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center sm:p-4'
			onClick={() => dispatch({ type: 'CLOSE_ADD_PERSON_MODAL' })}
		>
			<div
				className='modal-card w-full max-h-[90vh] overflow-y-auto rounded-t-[32px] bg-white shadow-2xl shadow-stone-900/20 sm:max-w-sm sm:rounded-[32px]'
				onClick={(e) => e.stopPropagation()}
			>
				{/* Drag handle */}
				<div className='mx-auto mt-3 h-1.5 w-12 rounded-full bg-stone-200 sm:hidden' />

				<div className='px-6 pb-8 pt-5'>
					{/* Header with context chip */}
					<div className='mb-5'>
						{isContextual && relative && (
							<div className='mb-2 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600 uppercase'>
								<img
									src={getAvatarUrl(relative)}
									className='h-4 w-4 rounded-full object-cover'
									alt=''
								/>
								{relative.firstName} {relative.lastName}
							</div>
						)}
						<h2 className='text-[22px] font-bold text-stone-900'>{title}</h2>
					</div>

					<div className='space-y-4'>
						{/* Full form — only shown when opened from menu without context.
						    Reads as a sentence: Add a [Child] … of [ABDUL]. */}
						{!isContextual && (
							<>
								<div>
									<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
										I&rsquo;m adding a&hellip;
									</label>
									<RelationChips
										value={relationType}
										onChange={setRelationType}
										siblingDisabled={
											selectedRelative ? !canAddSibling : false
										}
									/>
								</div>
								<div>
									<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
										{
											{
												parent: 'Parent of…',
												child: 'Child of…',
												spouse: 'Spouse of…',
												sibling: 'Sibling of…',
											}[relationType]
										}
									</label>
									<PersonCombobox
										people={Object.values(state.people)}
										value={relativePersonId}
										onChange={setRelativePersonId}
									/>
								</div>
							</>
						)}

						{/* Sibling picked but anchor has no parents yet */}
						{targRelationType === 'sibling' &&
							selectedRelative &&
							selectedRelative.parentIds.length === 0 && (
								<div className='rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
									{(selectedRelative.firstName ?? '').toUpperCase()} has no
									parents linked yet — add a parent first, then siblings.
								</div>
							)}

						{/* Smart one-tap suggestions */}
						{suggestions.length > 0 && !parentSlotsFull && (
							<div className='rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3.5'>
								<p className='mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-700'>
									<Sparkles size={13} />
									Quick link
								</p>
								<div className='space-y-1.5'>
									{suggestions.map(({ person, reason }) => (
										<button
											key={person.id}
											type='button'
											disabled={saving}
											onClick={() => handleLinkSave(person.id)}
											className='flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-emerald-100 transition-all hover:ring-emerald-300 hover:shadow-sm active:scale-[0.99] disabled:opacity-50'
										>
											<PersonInitial person={person} />
											<span className='min-w-0 flex-1'>
												<span className='block truncate text-sm font-semibold text-stone-800 uppercase'>
													{getPersonFullName(person)}
												</span>
												<span className='block truncate text-xs text-stone-500'>
													{reason}
												</span>
											</span>
											<span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white'>
												<Plus size={13} strokeWidth={3} />
											</span>
										</button>
									))}
								</div>
							</div>
						)}

						{/* Parent slots already full */}
						{parentSlotsFull && (
							<div className='rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
								{(selectedRelative?.firstName ?? 'This person').toUpperCase()}{' '}
								already has two parents linked.
							</div>
						)}

						{/* Mode toggle: create new vs link existing */}
						{!parentSlotsFull && (
							<div className='flex rounded-xl bg-stone-100 p-1 text-sm font-semibold'>
								<button
									type='button'
									onClick={() => setMode('create')}
									className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
										mode === 'create'
											? 'bg-white text-stone-800 shadow-sm'
											: 'text-stone-400 hover:text-stone-600'
									}`}
								>
									<UserPlus size={14} />
									New person
								</button>
								<button
									type='button'
									onClick={() => setMode('link')}
									className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
										mode === 'link'
											? 'bg-white text-stone-800 shadow-sm'
											: 'text-stone-400 hover:text-stone-600'
									}`}
								>
									<Link2 size={14} />
									Link existing
								</button>
							</div>
						)}

						{/* ---- LINK EXISTING mode ---- */}
						{mode === 'link' && !parentSlotsFull && (
							<div>
								<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
									Who is the {targRelationType}?
								</label>
								<PersonCombobox
									people={linkCandidates}
									value={existingPersonId}
									onChange={setExistingPersonId}
									placeholder='Search existing people…'
								/>
							</div>
						)}

						{/* ---- NEW PERSON mode ---- */}
						{mode === 'create' && !parentSlotsFull && (
							<>
								{/* Name — 2-column layout */}
								<div className='grid grid-cols-2 gap-3'>
									<div>
										<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
											Name
										</label>
										<input
											ref={firstNameRef}
											type='text'
											value={firstName}
											onChange={(e) => setFirstName(e.target.value)}
											onKeyDown={(e) =>
												e.key === 'Enter' &&
												canSubmit &&
												!saving &&
												handleCreateSave()
											}
											placeholder='Name'
											className={inputClass}
										/>
									</div>
									<div>
										<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
											Nickname
										</label>
										<input
											type='text'
											value={lastName}
											onChange={(e) => setLastName(e.target.value)}
											placeholder='Nickname'
											className={inputClass}
										/>
									</div>
								</div>

								{/* Duplicate guard */}
								{similarPeople.length > 0 && (
									<div className='rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5'>
										<p className='mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-700'>
											Similar people already exist
										</p>
										<div className='space-y-1.5'>
											{similarPeople.map((p) => (
												<div
													key={p.id}
													className='flex items-center gap-2.5 rounded-xl bg-white px-3 py-2 ring-1 ring-amber-100'
												>
													<PersonInitial person={p} />
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
														</span>
													</span>
													<button
														type='button'
														disabled={saving}
														onClick={() => handleLinkSave(p.id)}
														className='shrink-0 rounded-full bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:opacity-50'
													>
														Link instead
													</button>
												</div>
											))}
										</div>
									</div>
								)}

								{/* Gender — visual toggle (not a select dropdown) */}
								<div>
									<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
										Gender
									</label>
									<GenderPicker value={gender} onChange={setGender} />
								</div>

								{/* Deceased checkbox */}
								<div className='flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3'>
									<input
										id='modal-late'
										type='checkbox'
										checked={isDeceased}
										onChange={(e) => setIsDeceased(e.target.checked)}
										className='h-5 w-5 cursor-pointer rounded border-stone-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500'
									/>
									<label
										htmlFor='modal-late'
										className='cursor-pointer text-sm font-medium text-stone-700'
									>
										Mark as Late / Deceased
									</label>
								</div>
							</>
						)}

						{/* Notice when second parent will be auto-linked */}
						{autoSecondParent && !parentSlotsFull && (
							<div className='flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3'>
								<input
									id='modal-auto-link-spouse'
									type='checkbox'
									checked={autoLinkSpouse}
									onChange={(e) => setAutoLinkSpouse(e.target.checked)}
									className='h-5 w-5 cursor-pointer rounded border-blue-300 text-blue-600 focus:ring-2 focus:ring-blue-500'
								/>
								<label
									htmlFor='modal-auto-link-spouse'
									className='cursor-pointer text-sm font-medium text-blue-800'
								>
									Also link to{' '}
									<strong className='uppercase'>
										{autoSecondParent.firstName}
									</strong>{' '}
									as the other parent
								</label>
							</div>
						)}

						{/* Toggle to adopt existing children when adding spouse */}
						{targRelationType === 'spouse' &&
							(selectedRelative?.childrenIds?.length ?? 0) > 0 && (
								<div className='flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3'>
									<input
										id='modal-adopt-children'
										type='checkbox'
										checked={adoptChildren}
										onChange={(e) => setAdoptChildren(e.target.checked)}
										className='h-5 w-5 cursor-pointer rounded border-stone-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500'
									/>
									<label
										htmlFor='modal-adopt-children'
										className='cursor-pointer text-sm font-medium text-stone-700 uppercase'
									>
										Also add as parent of{' '}
										{(selectedRelative?.childrenIds ?? [])
											.map((id) => state.people[id]?.firstName)
											.filter(Boolean)
											.join(', ')}
									</label>
								</div>
							)}

						{/* Save & add another (children / siblings) */}
						{showAddAnother && !parentSlotsFull && (
							<div className='flex items-center gap-3 rounded-xl bg-stone-50 px-4 py-3'>
								<input
									id='modal-add-another'
									type='checkbox'
									checked={addAnother}
									onChange={(e) => setAddAnother(e.target.checked)}
									className='h-5 w-5 cursor-pointer rounded border-stone-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500'
								/>
								<label
									htmlFor='modal-add-another'
									className='cursor-pointer text-sm font-medium text-stone-700'
								>
									Keep open to add another {targRelationType}
								</label>
							</div>
						)}

						{/* Inline confirmation of rapid adds */}
						{savedNames.length > 0 && (
							<div className='flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800'>
								<Check size={16} className='mt-0.5 shrink-0' />
								<span>Added: {savedNames.join(', ')}</span>
							</div>
						)}

						{/* Live preview — confirms the direction before saving */}
						{showPreview && (
							<div className='rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600'>
								<span className='font-bold text-stone-800 uppercase'>
									{previewName}
								</span>{' '}
								will be {mode === 'create' ? 'added' : 'linked'} as{' '}
								<span className='font-bold text-emerald-700 uppercase'>
									{selectedRelative?.firstName}
								</span>
								&rsquo;s{' '}
								<span className='font-bold text-emerald-700'>
									{relationWord(targRelationType, previewGender)}
								</span>
								.
							</div>
						)}

						{error && (
							<div className='rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'>
								{error}
							</div>
						)}

						{!parentSlotsFull && (
							<button
								onClick={() =>
									mode === 'create'
										? handleCreateSave()
										: handleLinkSave(existingPersonId)
								}
								disabled={!canSubmit || saving}
								className='mt-2 w-full rounded-xl bg-emerald-600 py-3.5 text-[15px] font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
							>
								{saving
									? 'Saving…'
									: mode === 'create'
										? 'Add Person'
										: 'Link Person'}
							</button>
						)}

						<button
							onClick={() => dispatch({ type: 'CLOSE_ADD_PERSON_MODAL' })}
							className='w-full rounded-xl bg-stone-100 py-3.5 text-[15px] font-semibold text-stone-700 transition-colors hover:bg-stone-200'
						>
							{savedNames.length > 0 ? 'Done' : 'Cancel'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

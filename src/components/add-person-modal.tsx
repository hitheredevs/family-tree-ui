import { useState, useEffect, useRef } from 'react';
import { useFamilyTree } from '../state/family-tree-context';
import { getAvatarUrl } from '../utils/avatar';
import type { Gender } from '../types';
import * as api from '../services/api-client';

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
							? 'border-lime-500 bg-lime-50 text-lime-700 shadow-sm'
							: 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-300'
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

	// Core form state
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName] = useState('');
	const [gender, setGender] = useState<Gender>('male');
	const [isDeceased, setIsDeceased] = useState(false);
	const [adoptChildren, setAdoptChildren] = useState(true);
	const [autoLinkSpouse, setAutoLinkSpouse] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	// Extra state for non-contextual (menu-triggered) full form
	const [relativePersonId, setRelativePersonId] = useState('');
	const [relationType, setRelationType] = useState<
		'parent' | 'child' | 'spouse' | 'sibling'
	>('child');

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

	if (!addPersonModal.isOpen) return null;

	const selectedRelative = isContextual
		? relative
		: relativePersonId
			? state.people[relativePersonId]
			: null;
	const canAddSibling =
		selectedRelative && selectedRelative.parentIds.length > 0;
	const canSubmit =
		firstName.trim().length > 0 && (isContextual || Boolean(relativePersonId));

	// If adding a child and relative has exactly one spouse, we will auto-link in background
	const autoSecondParent =
		isContextual &&
		addPersonModal.relationType === 'child' &&
		relative?.spouseIds?.length === 1
			? state.people[relative.spouseIds[0]]
			: null;

	async function handleSave() {
		const fin = firstName.trim();
		const targRelativeId = isContextual
			? (addPersonModal.relativePersonId ?? '')
			: relativePersonId;
		const targRelationType = isContextual
			? (addPersonModal.relationType ?? 'child')
			: relationType;

		if (!fin || !targRelativeId) return;
		setSaving(true);
		setError('');

		try {
			const created = await api.createPerson({
				firstName: fin,
				lastName: lastName.trim() || undefined,
				gender,
				isDeceased,
			});

			if (targRelationType === 'sibling') {
				const rel = state.people[targRelativeId];
				if (!rel || rel.parentIds.length === 0)
					throw new Error(
						'Cannot add sibling — this person has no parents yet.',
					);
				for (const parentId of rel.parentIds) {
					await api.addRelationship({
						sourcePersonId: parentId,
						targetPersonId: created.id,
						relationshipType: 'PARENT',
					});
					await api
						.addRelationship({
							sourcePersonId: created.id,
							targetPersonId: parentId,
							relationshipType: 'CHILD',
						})
						.catch(() => {});
				}
			} else {
				const relMap: Record<string, api.RelationshipType> = {
					child: 'PARENT',
					parent: 'CHILD',
					spouse: 'SPOUSE',
				};
				const inverseRelMap: Record<string, api.RelationshipType> = {
					child: 'CHILD',
					parent: 'PARENT',
					spouse: 'SPOUSE',
				};

				await api.addRelationship({
					sourcePersonId: targRelativeId,
					targetPersonId: created.id,
					relationshipType: relMap[targRelationType],
				});
				await api
					.addRelationship({
						sourcePersonId: created.id,
						targetPersonId: targRelativeId,
						relationshipType: inverseRelMap[targRelationType],
					})
					.catch(() => {});

				// When adding a spouse, optionally also link them as parent of all existing children
				if (targRelationType === 'spouse' && adoptChildren) {
					const rel = state.people[targRelativeId];
					if (rel?.childrenIds?.length) {
						for (const childId of rel.childrenIds) {
							await api
								.addRelationship({
									sourcePersonId: created.id,
									targetPersonId: childId,
									relationshipType: 'PARENT',
								})
								.catch(() => {}); // non-fatal if already linked

							await api
								.addRelationship({
									sourcePersonId: childId,
									targetPersonId: created.id,
									relationshipType: 'CHILD',
								})
								.catch(() => {});
						}
					}
				}

				// Auto-link spouse as second parent when adding a child
				if (targRelationType === 'child' && autoLinkSpouse) {
					const rel = state.people[targRelativeId];
					const spouseId =
						rel?.spouseIds?.length === 1 ? rel.spouseIds[0] : null;
					if (spouseId) {
						await api
							.addRelationship({
								sourcePersonId: spouseId,
								targetPersonId: created.id,
								relationshipType: 'PARENT',
							})
							.catch(() => {}); // non-fatal if already linked

						await api
							.addRelationship({
								sourcePersonId: created.id,
								targetPersonId: spouseId,
								relationshipType: 'CHILD',
							})
							.catch(() => {});
					}
				}
			}

			dispatch({
				type: 'PUSH_UNDO',
				entry: {
					label: `Add ${targRelationType} ${created.firstName}`,
					action: async () => {
						await api.deletePerson(created.id);
						await refreshTree();
					},
				},
			});

			dispatch({ type: 'CLOSE_ADD_PERSON_MODAL' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add person');
		} finally {
			setSaving(false);
		}
	}

	const title = isContextual
		? buildTitle(addPersonModal.relationType ?? null, relative?.firstName ?? '')
		: 'Add Relative';

	return (
		<div
			className='fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4'
			onClick={() => dispatch({ type: 'CLOSE_ADD_PERSON_MODAL' })}
		>
			<div
				className='w-full max-h-[90vh] overflow-y-auto rounded-t-[32px] bg-white shadow-2xl sm:max-w-sm sm:rounded-[32px]'
				onClick={(e) => e.stopPropagation()}
			>
				{/* Drag handle */}
				<div className='mx-auto mt-3 h-1.5 w-12 rounded-full bg-gray-200 sm:hidden' />

				<div className='px-6 pb-8 pt-5'>
					{/* Header with context chip */}
					<div className='mb-6'>
						{isContextual && relative && (
							<div className='mb-2 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600'>
								<img
									src={getAvatarUrl(relative)}
									className='h-4 w-4 rounded-full object-cover'
									alt=''
								/>
								{relative.firstName} {relative.lastName}
							</div>
						)}
						<h2 className='text-[22px] font-bold text-gray-900'>{title}</h2>
					</div>

					<div className='space-y-4'>
						{/* Full form — only shown when opened from menu without context */}
						{!isContextual && (
							<>
								<div>
									<label className='mb-1.5 block text-sm font-semibold text-gray-700'>
										Relative To
									</label>
									<select
										value={relativePersonId}
										onChange={(e) => setRelativePersonId(e.target.value)}
										className='w-full appearance-none rounded-xl border-transparent bg-gray-50 px-4 py-3 text-gray-800 focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-200'
									>
										<option value=''>Select a person…</option>
										{Object.values(state.people).map((p) => (
											<option key={p.id} value={p.id}>
												{p.firstName} {p.lastName}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className='mb-1.5 block text-sm font-semibold text-gray-700'>
										Relationship
									</label>
									<select
										value={relationType}
										onChange={(e) =>
											setRelationType(
												e.target.value as
													| 'parent'
													| 'child'
													| 'spouse'
													| 'sibling',
											)
										}
										className='w-full appearance-none rounded-xl border-transparent bg-gray-50 px-4 py-3 text-gray-800 focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-200'
									>
										<option value='parent'>Parent of</option>
										<option value='child'>Child of</option>
										<option value='spouse'>Spouse of</option>
										<option value='sibling' disabled={!canAddSibling}>
											Sibling of{!canAddSibling ? ' (no parents)' : ''}
										</option>
									</select>
								</div>
							</>
						)}

						{/* Name — 2-column layout */}
						<div className='grid grid-cols-2 gap-3'>
							<div>
								<label className='mb-1.5 block text-sm font-semibold text-gray-700'>
									First Name
								</label>
								<input
									ref={firstNameRef}
									type='text'
									value={firstName}
									onChange={(e) => setFirstName(e.target.value)}
									onKeyDown={(e) =>
										e.key === 'Enter' && canSubmit && handleSave()
									}
									placeholder='First'
									className='w-full rounded-xl border border-transparent bg-gray-50 px-4 py-3 text-gray-800 transition-colors focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-200'
								/>
							</div>
							<div>
								<label className='mb-1.5 block text-sm font-semibold text-gray-700'>
									Last Name
								</label>
								<input
									type='text'
									value={lastName}
									onChange={(e) => setLastName(e.target.value)}
									placeholder='Last'
									className='w-full rounded-xl border border-transparent bg-gray-50 px-4 py-3 text-gray-800 transition-colors focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-200'
								/>
							</div>
						</div>

						{/* Gender — visual toggle (not a select dropdown) */}
						<div>
							<label className='mb-1.5 block text-sm font-semibold text-gray-700'>
								Gender
							</label>
							<GenderPicker value={gender} onChange={setGender} />
						</div>

						{/* Deceased checkbox */}
						<div className='flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3'>
							<input
								id='modal-late'
								type='checkbox'
								checked={isDeceased}
								onChange={(e) => setIsDeceased(e.target.checked)}
								className='h-5 w-5 cursor-pointer rounded border-gray-300 text-lime-600 focus:ring-2 focus:ring-lime-500'
							/>
							<label
								htmlFor='modal-late'
								className='cursor-pointer text-sm font-medium text-gray-700'
							>
								Mark as Late / Deceased
							</label>
						</div>

						{/* Notice when second parent will be auto-linked */}
						{autoSecondParent && (
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
									Also link to <strong>{autoSecondParent.firstName}</strong> as
									the other parent
								</label>
							</div>
						)}

						{/* Toggle to adopt existing children when adding spouse */}
						{(() => {
							const effRelType = isContextual
								? addPersonModal.relationType
								: relationType;
							const effRelId = isContextual
								? addPersonModal.relativePersonId
								: relativePersonId;
							const effRel = effRelId ? state.people[effRelId] : null;
							if (effRelType !== 'spouse' || !effRel?.childrenIds?.length)
								return null;
							const childNames = effRel.childrenIds
								.map((id) => state.people[id]?.firstName)
								.filter(Boolean);
							return (
								<div className='flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3'>
									<input
										id='modal-adopt-children'
										type='checkbox'
										checked={adoptChildren}
										onChange={(e) => setAdoptChildren(e.target.checked)}
										className='h-5 w-5 cursor-pointer rounded border-gray-300 text-lime-600 focus:ring-2 focus:ring-lime-500'
									/>
									<label
										htmlFor='modal-adopt-children'
										className='cursor-pointer text-sm font-medium text-gray-700'
									>
										Also add as parent of {childNames.join(', ')}
									</label>
								</div>
							);
						})()}

						{error && (
							<div className='rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'>
								{error}
							</div>
						)}

						<button
							onClick={handleSave}
							disabled={!canSubmit || saving}
							className='mt-2 w-full rounded-xl bg-lime-500 py-3.5 text-[15px] font-semibold text-white shadow-sm shadow-lime-200 transition-colors hover:bg-lime-600 disabled:cursor-not-allowed disabled:opacity-50'
						>
							{saving ? 'Saving…' : 'Add Person'}
						</button>

						<button
							onClick={() => dispatch({ type: 'CLOSE_ADD_PERSON_MODAL' })}
							className='w-full rounded-xl bg-gray-100 py-3.5 text-[15px] font-semibold text-gray-700 transition-colors hover:bg-gray-200'
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

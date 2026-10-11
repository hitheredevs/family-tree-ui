import { useState } from 'react';
import { useFamilyTree } from '../state/family-tree-context';
import { canEdit, getRelationshipLabel } from '../state/permissions';
import * as api from '../services/api-client';
import { useLanguage } from '../state/language-context';
import { toUrdu } from '../utils/transliterate';

export function ProfilePopup() {
	const { state, dispatch, currentUser, centerPersonId, refreshTree } =
		useFamilyTree();
	const { isUrdu } = useLanguage();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);

	if (!state.selectedPersonId || !currentUser) return null;

	const person = state.people[state.selectedPersonId];
	const centerPerson = state.people[centerPersonId];
	if (!person || !centerPerson) return null;

	const relationship = getRelationshipLabel(person, centerPerson);
	const editable = canEdit(currentUser, person.id, state.people);
	const initials =
		person.firstName[0] + (person.lastName ? person.lastName[0] : '');

	let avatarColor = person.gender === 'female' ? 'bg-pink-400' : 'bg-sky-400';
	if (person.isDeceased) avatarColor = 'bg-gray-400';

	async function handleDelete() {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		setDeleting(true);
		try {
			await api.deletePerson(person.id);
			dispatch({ type: 'SELECT_PERSON', personId: null });
			await refreshTree();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to delete');
		} finally {
			setDeleting(false);
			setConfirmDelete(false);
		}
	}

	return (
		<div
			className='absolute right-0 top-0 h-full w-80 bg-white shadow-xl z-20 border-l border-gray-200 flex flex-col'
			onClick={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div className='flex items-center justify-between p-4 border-b border-gray-100'>
				<h2 className='font-semibold text-gray-800'>Profile</h2>
				<button
					onClick={() => dispatch({ type: 'SELECT_PERSON', personId: null })}
					className='text-gray-400 hover:text-gray-600 text-xl leading-none'
				>
					×
				</button>
			</div>

			{/* Content */}
			<div className='flex-1 p-6 flex flex-col items-center'>
				<div
					className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4 ${avatarColor}`}
				>
					{initials}
				</div>

				<h3 className='text-lg font-bold text-gray-800'>
					{isUrdu ? (
						<span
							style={{
								fontFamily: "'Noto Nastaliq Urdu', serif",
								direction: 'rtl',
							}}
						>
							{toUrdu(person.firstName)}{' '}
							{person.lastName ? toUrdu(person.lastName) : ''}
						</span>
					) : (
						<>
							{person.firstName} {person.lastName}
						</>
					)}
				</h3>

				<span className='text-sm text-indigo-500 font-medium mt-1'>
					{relationship}
				</span>

				{person.isDeceased && (
					<span className='text-xs text-gray-400 mt-1'>Deceased</span>
				)}

				{/* Actions */}
				<div className='mt-8 w-full space-y-2'>
					{editable && (
						<button
							onClick={() =>
								dispatch({ type: 'SET_EDITING', personId: person.id })
							}
							className='w-full py-2 px-4 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors'
						>
							Edit Person
						</button>
					)}

					{state.isAdminMode && (
						<>
							{person.parentIds.length < 2 && (
								<button
									onClick={() =>
										dispatch({
											type: 'OPEN_ADD_PERSON_MODAL',
											relativePersonId: person.id,
											relationType: 'parent',
										})
									}
									className='w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors'
								>
									+ Add Parent
								</button>
							)}

							<button
								onClick={() =>
									dispatch({
										type: 'OPEN_ADD_PERSON_MODAL',
										relativePersonId: person.id,
										relationType: 'spouse',
									})
								}
								className='w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors'
							>
								+ Add Spouse
							</button>

							<button
								onClick={() =>
									dispatch({
										type: 'OPEN_ADD_PERSON_MODAL',
										relativePersonId: person.id,
										relationType: 'child',
									})
								}
								className='w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors'
							>
								+ Add Child
							</button>

							{person.parentIds.length > 0 && (
								<button
									onClick={() =>
										dispatch({
											type: 'OPEN_ADD_PERSON_MODAL',
											relativePersonId: person.id,
											relationType: 'sibling',
										})
									}
									className='w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors'
								>
									+ Add Sibling
								</button>
							)}

							{/* Manage Relationships */}
							<button
								onClick={() =>
									dispatch({
										type: 'OPEN_MANAGE_RELATIONSHIPS_MODAL',
										personId: person.id,
									})
								}
								className='w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors'
							>
								🔗 Manage Arrows
							</button>

							{/* Delete */}
							<div className='pt-4 border-t border-gray-100'>
								{confirmDelete ? (
									<div className='space-y-2'>
										<p className='text-sm text-red-600 text-center'>
											Delete {person.firstName}? This cannot be undone.
											{(() => {
												const links =
													(person.parentIds?.length ?? 0) +
													(person.childrenIds?.length ?? 0) +
													(person.spouseIds?.length ?? 0) +
													(person.exSpouseIds?.length ?? 0);
												return links > 0
													? ` Their ${links} family link${links === 1 ? '' : 's'} will be removed too. If this is a duplicate, use Merge in the Fixer tab instead.`
													: '';
											})()}
										</p>
										<div className='flex gap-2'>
											<button
												onClick={() => setConfirmDelete(false)}
												className='flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors'
											>
												Cancel
											</button>
											<button
												onClick={handleDelete}
												disabled={deleting}
												className='flex-1 py-2 px-3 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50'
											>
												{deleting ? 'Deleting…' : 'Confirm'}
											</button>
										</div>
									</div>
								) : (
									<button
										onClick={handleDelete}
										className='w-full py-2 px-4 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors border border-red-100'
									>
										🗑 Delete Person
									</button>
								)}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

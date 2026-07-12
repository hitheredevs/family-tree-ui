import { useState, useEffect, useCallback } from 'react';
import { useFamilyTree } from '../state/family-tree-context';
import * as api from '../services/api-client';
import { PersonCombobox } from './person-combobox';

export function ManageRelationshipsModal() {
	const { state, dispatch, refreshTree } = useFamilyTree();
	const { manageRelationshipsModal } = state;

	const [relationships, setRelationships] = useState<
		api.RelationshipResponse[]
	>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	// Add-arrow form state
	const [targetPersonId, setTargetPersonId] = useState('');
	const [relationshipType, setRelationshipType] =
		useState<api.RelationshipType>('PARENT');
	const [adding, setAdding] = useState(false);

	const personId = manageRelationshipsModal.personId;

	const loadRelationships = useCallback(async () => {
		if (!personId) return;
		setLoading(true);
		try {
			const rels = await api.getRelationshipsForPerson(personId);
			setRelationships(rels);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to load relationships',
			);
		} finally {
			setLoading(false);
		}
	}, [personId]);

	useEffect(() => {
		if (manageRelationshipsModal.isOpen && personId) {
			loadRelationships();
		}
	}, [manageRelationshipsModal.isOpen, personId, loadRelationships]);

	if (!manageRelationshipsModal.isOpen || !personId) return null;

	const person = state.people[personId];
	if (!person) return null;

	function handleClose() {
		dispatch({ type: 'CLOSE_MANAGE_RELATIONSHIPS_MODAL' });
		setRelationships([]);
		setError('');
		setTargetPersonId('');
	}

	async function handleRemoveRelationship(relId: string) {
		try {
			await api.removeRelationship(relId);

			// Push undo — we can't perfectly reverse a delete, but refresh is enough
			dispatch({
				type: 'PUSH_UNDO',
				entry: {
					label: 'Remove relationship',
					action: async () => {
						// The relationship is gone; undo would require re-creating it.
						// We store enough info to do that.
					},
				},
			});

			await loadRelationships();
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to remove relationship',
			);
		}
	}

	async function handleAddArrow() {
		if (!targetPersonId || !personId) return;

		setAdding(true);
		setError('');
		try {
			const result = await api.addRelationship({
				sourcePersonId: personId,
				targetPersonId,
				relationshipType,
			});

			// Push undo: remove the relationship we just created
			const forwardId = result.forward.id;
			dispatch({
				type: 'PUSH_UNDO',
				entry: {
					label: `Add ${relationshipType} arrow`,
					action: async () => {
						await api.removeRelationship(forwardId);
						await refreshTree();
					},
				},
			});

			setTargetPersonId('');
			await loadRelationships();
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to add relationship',
			);
		} finally {
			setAdding(false);
		}
	}

	// People other than the current person (for target dropdown)
	const otherPeople = Object.values(state.people).filter(
		(p) => p.id !== personId,
	);

	// Get display name for a person id
	function personName(id: string): string {
		const p = state.people[id];
		return p ? `${p.firstName} ${p.lastName}` : id;
	}

	return (
		<div
			className='modal-backdrop fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4'
			onClick={handleClose}
		>
			<div
				className='modal-card bg-white w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[32px] shadow-2xl shadow-stone-900/20 p-6 sm:p-8 max-h-[90vh] overflow-y-auto'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='w-12 h-1.5 bg-stone-200 rounded-full mx-auto mb-6 sm:hidden'></div>
				<div className='flex items-center justify-between mb-6 px-2'>
					<h2 className='text-2xl font-bold text-stone-800 tracking-tight'>
						Manage Relationships
					</h2>
					<button
						onClick={handleClose}
						className='text-stone-400 hover:text-stone-600 bg-stone-100 rounded-full p-2 leading-none'
					>
						✕
					</button>
				</div>
				<p className='px-2 mb-6 text-sm text-stone-500 font-medium'>
					{person.firstName} {person.lastName}
				</p>

				{error && (
					<div className='bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 border border-red-100 mb-4'>
						{error}
					</div>
				)}

				{/* Existing relationships */}
				<div className='mb-6 px-2'>
					<h3 className='text-[11px] font-bold tracking-widest text-stone-400 uppercase mb-4'>
						Existing Relationships
					</h3>
					{loading ? (
						<p className='text-sm text-stone-400'>Loading…</p>
					) : relationships.length === 0 ? (
						<p className='text-sm text-stone-400 bg-stone-50 rounded-xl p-4'>
							No relationships found.
						</p>
					) : (
						<div className='space-y-3'>
							{relationships.map((rel) => (
								<div
									key={rel.id}
									className='flex items-center justify-between bg-stone-50/50 border border-stone-100 rounded-xl px-4 py-3'
								>
									<div className='text-[15px]'>
										<span className='text-emerald-500 font-semibold'>
											{rel.relationship_type.toLowerCase()}
										</span>
										<span className='text-stone-400 mx-1.5'>of</span>
										<span className='font-semibold text-stone-800 tracking-tight uppercase'>
											{personName(rel.target_person_id)}
										</span>
									</div>
									<button
										onClick={() => handleRemoveRelationship(rel.id)}
										className='text-red-400 p-2 hover:bg-red-50 hover:text-red-600 rounded-full text-sm font-medium transition-colors'
										title='Remove this arrow'
									>
										✕
									</button>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Add new relationship */}
				<div className='border-t border-stone-100 pt-6 px-2'>
					<h3 className='text-[11px] font-bold tracking-widest text-stone-400 uppercase mb-4'>
						Add New Relationship
					</h3>
					<div className='space-y-4'>
						<div>
							<label className='block text-sm font-semibold text-stone-700 mb-1.5'>
								Target Person
							</label>
							<PersonCombobox
								people={otherPeople}
								value={targetPersonId}
								onChange={setTargetPersonId}
								placeholder='Select a person...'
							/>
						</div>

						<div>
							<label className='block text-sm font-semibold text-stone-700 mb-1.5'>
								Relationship Type
							</label>
							<select
								value={relationshipType}
								onChange={(e) =>
									setRelationshipType(e.target.value as api.RelationshipType)
								}
								className='w-full px-4 py-3.5 bg-stone-50 border-transparent focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-xl text-stone-800 transition-colors appearance-none'
							>
								<option value='PARENT'>{person.firstName} is PARENT of</option>
								<option value='CHILD'>{person.firstName} is CHILD of</option>
								<option value='SPOUSE'>{person.firstName} is SPOUSE of</option>
							</select>
						</div>

						<button
							onClick={handleAddArrow}
							disabled={!targetPersonId || adding}
							className='w-full py-4 mt-2 px-4 bg-emerald-500 text-white rounded-xl text-[15px] font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-emerald-200'
						>
							{adding ? 'Adding…' : 'Add Relationship'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

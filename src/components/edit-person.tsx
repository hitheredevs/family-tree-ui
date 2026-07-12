import { useState, useEffect, useRef } from 'react';
import { useFamilyTree, usePersonDetails } from '../state/family-tree-context';
import type { Gender, SocialLink, SocialLinkType } from '../types';
import * as api from '../services/api-client';
import { PersonCombobox } from './person-combobox';
import { MonthDayInput } from './month-day-input';
import { PhoneNumberField } from './phone-number-field';
import {
	Facebook,
	Instagram,
	Twitter,
	Linkedin,
	Plus,
	Trash2,
	Phone,
	ShieldCheck,
} from 'lucide-react';

const SOCIAL_PLATFORMS: {
	type: SocialLinkType;
	label: string;
	icon: typeof Facebook;
	placeholder: string;
}[] = [
	{
		type: 'facebook',
		label: 'Facebook',
		icon: Facebook,
		placeholder: 'https://facebook.com/username',
	},
	{
		type: 'instagram',
		label: 'Instagram',
		icon: Instagram,
		placeholder: 'https://instagram.com/username',
	},
	{
		type: 'twitter',
		label: 'Twitter / X',
		icon: Twitter,
		placeholder: 'https://x.com/username',
	},
	{
		type: 'linkedin',
		label: 'LinkedIn',
		icon: Linkedin,
		placeholder: 'https://linkedin.com/in/username',
	},
];

export function EditPerson() {
	const { state, dispatch, refreshTree } = useFamilyTree();

	const { person } = usePersonDetails(state.editingPersonId);

	const [firstName, setFirstName] = useState(person?.firstName ?? '');
	const [lastName, setLastName] = useState(person?.lastName ?? '');
	const [gender, setGender] = useState<Gender>(person?.gender ?? 'male');
	const [isDeceased, setIsDeceased] = useState(person?.isDeceased ?? false);
	const [bio, setBio] = useState(person?.bio ?? '');
	const [location, setLocation] = useState(person?.location ?? '');
	const [birthDate, setBirthDate] = useState(person?.birthDate ?? '');
	const [deathYear, setDeathYear] = useState(
		person?.deathYear?.toString() ?? '',
	);
	const [phoneNumber, setPhoneNumber] = useState(person?.phoneNumber ?? '');
	const [socialLinks, setSocialLinks] = useState<SocialLink[]>(
		person?.socialLinks ?? [],
	);

	// When full details arrive, backfill form fields that were empty
	const detailsSyncedRef = useRef(false);
	useEffect(() => {
		if (!person || detailsSyncedRef.current) return;
		if (person.bio === undefined && person.phoneNumber === undefined) return;
		detailsSyncedRef.current = true;
		setBio(person.bio ?? '');
		setLocation(person.location ?? '');
		setBirthDate(person.birthDate ?? '');
		setDeathYear(person.deathYear?.toString() ?? '');
		setPhoneNumber(person.phoneNumber ?? '');
		setSocialLinks(person.socialLinks ?? []);
	}, [person]);
	const [addParentId, setAddParentId] = useState('');
	const [addSpouseId, setAddSpouseId] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const isSelf = state.currentUser?.personId === person?.id;

	if (!person) return null;

	/* ------------------------------------------------------------------ */
	/*  Social links helpers                                               */
	/* ------------------------------------------------------------------ */

	const usedPlatforms = new Set(socialLinks.map((l) => l.type));
	const availablePlatforms = SOCIAL_PLATFORMS.filter(
		(p) => !usedPlatforms.has(p.type),
	);

	function addSocialLink(type: SocialLinkType) {
		setSocialLinks((prev) => [...prev, { type, url: '', handle: '' }]);
	}

	function updateSocialLink(
		index: number,
		field: 'url' | 'handle',
		value: string,
	) {
		setSocialLinks((prev) =>
			prev.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
		);
	}

	function removeSocialLink(index: number) {
		setSocialLinks((prev) => prev.filter((_, i) => i !== index));
	}

	async function handleAddParent() {
		if (!person || !addParentId) return;
		setError('');
		try {
			await api.addRelationship({
				sourcePersonId: addParentId,
				targetPersonId: person.id,
				relationshipType: 'PARENT',
			});
			setAddParentId('');
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add parent');
		}
	}

	async function handleRemoveParent(parentId: string) {
		if (!person) return;
		setError('');
		try {
			// Find the relationship where parent -> person with type PARENT
			const rels = await api.getRelationshipsForPerson(parentId);
			const rel = rels.find(
				(r) =>
					r.target_person_id === person.id && r.relationship_type === 'PARENT',
			);
			if (rel) {
				await api.removeRelationship(rel.id);
			}
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to remove parent');
		}
	}

	async function handleAddSpouse() {
		if (!person || !addSpouseId) return;
		setError('');
		try {
			await api.addRelationship({
				sourcePersonId: person.id,
				targetPersonId: addSpouseId,
				relationshipType: 'SPOUSE',
			});
			setAddSpouseId('');
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add spouse');
		}
	}

	async function handleRemoveSpouse(spouseIdToRemove: string) {
		if (!person) return;
		setError('');
		try {
			const rels = await api.getRelationshipsForPerson(person.id);
			const rel = rels.find(
				(r) =>
					r.target_person_id === spouseIdToRemove &&
					r.relationship_type === 'SPOUSE',
			);
			if (rel) {
				await api.removeRelationship(rel.id);
			}
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to remove spouse');
		}
	}

	async function handleDivorceSpouse(spouseId: string) {
		if (!person) return;
		setError('');
		try {
			await api.updateRelationshipStatus({
				sourcePersonId: person.id,
				targetPersonId: spouseId,
				status: 'divorced',
			});
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update status');
		}
	}

	async function handleReconcileSpouse(spouseId: string) {
		if (!person) return;
		setError('');
		try {
			await api.updateRelationshipStatus({
				sourcePersonId: person.id,
				targetPersonId: spouseId,
				status: 'confirmed',
			});
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update status');
		}
	}

	async function handleSave() {
		if (!person) return;
		setSaving(true);
		setError('');

		try {
			const filteredLinks = socialLinks.filter(
				(l) => l.url.trim() || l.handle.trim(),
			);

			await api.updatePerson(person.id, {
				firstName,
				lastName,
				gender,
				isDeceased,
				bio: bio || undefined,
				location: location || undefined,
				birthDate: birthDate || undefined,
				deathYear: deathYear ? Number(deathYear) : null,
				phoneNumber: phoneNumber || null,
				socialLinks: filteredLinks.length > 0 ? filteredLinks : null,
			});
			dispatch({ type: 'SET_EDITING', personId: null });
			dispatch({ type: 'TREE_MUTATED' });
			await refreshTree();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update person');
		} finally {
			setSaving(false);
		}
	}

	function handleCancel() {
		dispatch({ type: 'SET_EDITING', personId: null });
	}

	return (
		<div className='flex h-full w-full flex-col bg-stone-50'>
			{/* Fixed header */}
			<div className='flex items-center justify-between border-b border-stone-100 bg-white px-5 py-4'>
				<button
					onClick={handleCancel}
					className='rounded-xl bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-200'
				>
					← Back
				</button>
				<h2 className='text-lg font-bold text-stone-800'>Edit Person</h2>
				<button
					onClick={handleSave}
					disabled={saving}
					className='rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50'
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>

			{/* Scrollable form body */}
			<div className='flex-1 overflow-y-auto overscroll-contain px-5 py-6'>
				<div className='mx-auto max-w-lg space-y-5'>
					{error && (
						<div className='rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'>
							{error}
						</div>
					)}

					{/* Names — 2-col */}
					<div className='grid grid-cols-2 gap-3'>
						<div>
							<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
								Name
							</label>
							<input
								type='text'
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
								className='w-full rounded-xl border border-transparent bg-white px-4 py-3 text-stone-800 shadow-sm transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
								placeholder='Name'
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
								className='w-full rounded-xl border border-transparent bg-white px-4 py-3 text-stone-800 shadow-sm transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
								placeholder='Nickname'
							/>
						</div>
					</div>

					{/* Gender — visual toggle */}
					<div>
						<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
							Gender
						</label>
						<div className='flex gap-2'>
							{(['male', 'female', 'other'] as Gender[]).map((g) => {
								const emoji = g === 'male' ? '♂' : g === 'female' ? '♀' : '⚧';
								const label = g.charAt(0).toUpperCase() + g.slice(1);
								return (
									<button
										key={g}
										type='button'
										onClick={() => setGender(g)}
										className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
											gender === g
												? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
												: 'border-stone-100 bg-white text-stone-500 hover:border-stone-300'
										}`}
									>
										<span className='block text-xl leading-none'>{emoji}</span>
										<span className='text-[11px]'>{label}</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* Bio */}
					<div>
						<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
							Biography
						</label>
						<textarea
							value={bio}
							onChange={(e) => setBio(e.target.value)}
							className='w-full rounded-xl border border-transparent bg-white px-4 py-3 text-stone-800 shadow-sm transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
							rows={3}
							placeholder='Short bio…'
						/>
					</div>

					{/* Location */}
					<div>
						<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
							Location
						</label>
						<input
							type='text'
							value={location}
							onChange={(e) => setLocation(e.target.value)}
							className='w-full rounded-xl border border-transparent bg-white px-4 py-3 text-stone-800 shadow-sm transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
							placeholder='City, Country'
						/>
					</div>

					{/* Birthday — Month + Day only */}
					<div>
						<label className='mb-1.5 block text-sm font-semibold text-stone-700'>
							Birthday (Month &amp; Day)
						</label>
						<MonthDayInput
							value={birthDate}
							onChange={(v) => setBirthDate(v ?? '')}
						/>
					</div>

					{/* Deceased */}
					<div className='flex flex-wrap items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm'>
						<div className='flex items-center gap-2'>
							<input
								type='checkbox'
								id='isDeceased'
								checked={isDeceased}
								onChange={(e) => setIsDeceased(e.target.checked)}
								className='h-5 w-5 cursor-pointer rounded border-stone-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500'
							/>
							<label
								htmlFor='isDeceased'
								className='cursor-pointer text-sm font-semibold text-stone-700'
							>
								Deceased
							</label>
						</div>
						{isDeceased && (
							<div className='flex items-center gap-2'>
								<label className='text-sm font-medium text-stone-600'>
									Death Year:
								</label>
								<input
									type='number'
									value={deathYear}
									onChange={(e) => setDeathYear(e.target.value)}
									className='w-24 rounded-lg border border-transparent bg-stone-50 px-3 py-1.5 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
									placeholder='YYYY'
								/>
							</div>
						)}
					</div>

					{/* Phone Number — only for own profile */}
					{isSelf && (
						<div className='rounded-xl bg-white p-4 shadow-sm'>
							<div className='mb-3 flex items-center justify-between'>
								<h3 className='flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-stone-500'>
									<Phone size={16} className='text-emerald-500' />
									Phone Number
								</h3>
								{person.phoneVerified ? (
									<span className='flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700'>
										<ShieldCheck size={12} /> Verified
									</span>
								) : null}
							</div>
							<PhoneNumberField
								value={phoneNumber}
								onChange={setPhoneNumber}
								placeholder='Enter your phone number'
							/>
							<p className='mt-2 text-xs text-stone-400'>
								This number is stored on your profile for contact purposes.
							</p>
						</div>
					)}

					{/* Social Links */}
					<div className='rounded-xl bg-white p-4 shadow-sm'>
						<h3 className='mb-3 text-sm font-bold uppercase tracking-wide text-stone-500'>
							Social Links
						</h3>
						<div className='space-y-3'>
							{socialLinks.map((link, index) => {
								const platform = SOCIAL_PLATFORMS.find(
									(p) => p.type === link.type,
								);
								if (!platform) return null;
								const Icon = platform.icon;
								return (
									<div key={link.type} className='space-y-2'>
										<div className='flex items-center gap-2'>
											<Icon size={18} className='shrink-0 text-stone-500' />
											<span className='text-sm font-medium text-stone-700'>
												{platform.label}
											</span>
											<button
												type='button'
												onClick={() => removeSocialLink(index)}
												className='ml-auto text-red-400 transition-colors hover:text-red-600'
											>
												<Trash2 size={14} />
											</button>
										</div>
										<div className='grid grid-cols-2 gap-2 pl-7'>
											<input
												type='text'
												value={link.handle}
												onChange={(e) =>
													updateSocialLink(index, 'handle', e.target.value)
												}
												placeholder='@username'
												className='w-full rounded-lg border border-transparent bg-stone-50 px-3 py-2 text-sm text-stone-800 transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
											/>
											<input
												type='url'
												value={link.url}
												onChange={(e) =>
													updateSocialLink(index, 'url', e.target.value)
												}
												placeholder={platform.placeholder}
												className='w-full rounded-lg border border-transparent bg-stone-50 px-3 py-2 text-sm text-stone-800 transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
											/>
										</div>
									</div>
								);
							})}

							{socialLinks.length === 0 && (
								<p className='text-sm text-stone-400'>
									No social links added yet.
								</p>
							)}

							{availablePlatforms.length > 0 && (
								<div className='flex flex-wrap gap-2 pt-1'>
									{availablePlatforms.map((platform) => {
										const Icon = platform.icon;
										return (
											<button
												key={platform.type}
												type='button'
												onClick={() => addSocialLink(platform.type)}
												className='flex items-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700'
											>
												<Plus size={12} />
												<Icon size={14} />
												{platform.label}
											</button>
										);
									})}
								</div>
							)}
						</div>
					</div>

					{/* Parents */}
					<div className='rounded-xl bg-white p-4 shadow-sm'>
						<h3 className='mb-3 text-sm font-bold text-stone-500 uppercase tracking-wide'>
							Parents
						</h3>
						<div className='space-y-2'>
							{person.parentIds.map((pid) => {
								const parent = state.people[pid];
								return (
									<div
										key={pid}
										className='flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2'
									>
										<span className='text-sm text-stone-700'>
											{parent ? `${parent.firstName} ${parent.lastName}` : pid}
										</span>
										<button
											type='button'
											onClick={() => handleRemoveParent(pid)}
											className='text-xs font-medium text-red-400 hover:text-red-600'
										>
											✕ Remove
										</button>
									</div>
								);
							})}
							{person.parentIds.length === 0 && (
								<p className='text-sm text-stone-400'>No parents</p>
							)}
							{person.parentIds.length < 2 && (
								<div className='mt-1 flex gap-2'>
									<div className='flex-1'>
										<PersonCombobox
											people={Object.values(state.people).filter(
												(p) =>
													p.id !== person.id &&
													!person.parentIds.includes(p.id),
											)}
											value={addParentId}
											onChange={setAddParentId}
											placeholder='Add a parent...'
											className='w-full appearance-none rounded-xl border border-transparent bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
										/>
									</div>
									<button
										type='button'
										onClick={handleAddParent}
										disabled={!addParentId}
										className='rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-200 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50'
									>
										+ Add
									</button>
								</div>
							)}
						</div>
					</div>

					{/* Spouses */}
					<div className='rounded-xl bg-white p-4 shadow-sm'>
						<h3 className='mb-3 text-sm font-bold text-stone-500 uppercase tracking-wide'>
							Spouses
						</h3>
						<div className='space-y-2'>
							{person.spouseIds.map((sid) => {
								const spouse = state.people[sid];
								return (
									<div
										key={sid}
										className='flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2'
									>
										<span className='text-sm text-stone-700'>
											{spouse ? `${spouse.firstName} ${spouse.lastName}` : sid}
										</span>
										<div className='flex gap-2'>
											<button
												type='button'
												onClick={() => handleDivorceSpouse(sid)}
												className='text-xs font-medium text-amber-500 hover:text-amber-700'
											>
												Divorce
											</button>
											<button
												type='button'
												onClick={() => handleRemoveSpouse(sid)}
												className='text-xs font-medium text-red-400 hover:text-red-600'
											>
												✕ Remove
											</button>
										</div>
									</div>
								);
							})}
							{person.exSpouseIds?.map((sid) => {
								const spouse = state.people[sid];
								return (
									<div
										key={sid}
										className='flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 border border-red-100'
									>
										<span className='text-sm text-stone-500'>
											{spouse ? `${spouse.firstName} ${spouse.lastName}` : sid}
											<span className='ml-1.5 text-xs text-red-400'>(ex)</span>
										</span>
										<div className='flex gap-2'>
											<button
												type='button'
												onClick={() => handleReconcileSpouse(sid)}
												className='text-xs font-medium text-green-500 hover:text-green-700'
											>
												Reconcile
											</button>
											<button
												type='button'
												onClick={() => handleRemoveSpouse(sid)}
												className='text-xs font-medium text-red-400 hover:text-red-600'
											>
												✕ Remove
											</button>
										</div>
									</div>
								);
							})}
							{person.spouseIds.length === 0 &&
								(!person.exSpouseIds || person.exSpouseIds.length === 0) && (
									<p className='text-sm text-stone-400'>No spouses</p>
								)}
							<div className='mt-1 flex gap-2'>
								<div className='flex-1'>
									<PersonCombobox
										people={Object.values(state.people).filter(
											(p) =>
												p.id !== person.id &&
												!person.spouseIds.includes(p.id) &&
												!person.exSpouseIds?.includes(p.id),
										)}
										value={addSpouseId}
										onChange={setAddSpouseId}
										placeholder='Add a spouse...'
										className='w-full appearance-none rounded-xl border border-transparent bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
									/>
								</div>
								<button
									type='button'
									onClick={handleAddSpouse}
									disabled={!addSpouseId}
									className='rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-200 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50'
								>
									+ Add
								</button>
							</div>
						</div>
					</div>

					{/* Children (read-only) */}
					{person.childrenIds.length > 0 && (
						<div className='rounded-xl bg-white p-4 shadow-sm'>
							<h3 className='mb-3 text-sm font-bold text-stone-500 uppercase tracking-wide'>
								Children
							</h3>
							<p className='text-sm text-stone-600'>
								{person.childrenIds
									.map((id) => state.people[id]?.firstName ?? id)
									.join(', ')}
							</p>
						</div>
					)}

					{/* Bottom spacer so content doesn't hide behind safe area */}
					<div className='h-8' />
				</div>
			</div>
		</div>
	);
}

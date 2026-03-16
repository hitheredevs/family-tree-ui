import { useState } from 'react';
import {
	Calendar,
	Heart,
	MoreVertical,
	MapPin,
	FileText,
	Edit,
	UserPlus,
	Trash2,
	Link as LinkIcon,
	Phone,
	Facebook,
	Instagram,
	Twitter,
	Linkedin,
	ShieldCheck,
	ExternalLink,
	Copy,
	KeyRound,
} from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import { getAvatarUrl } from '../../utils/avatar';
import { getRelationship } from '../../utils/relationship';
import { canEdit } from '../../state/permissions';
import { formatBirthday } from '../../utils/birthdate';
import * as api from '../../services/api-client';
import { useLanguage } from '../../state/language-context';
import { toUrdu } from '../../utils/transliterate';

const SOCIAL_ICONS: Record<string, typeof Facebook> = {
	facebook: Facebook,
	instagram: Instagram,
	twitter: Twitter,
	linkedin: Linkedin,
};

const SOCIAL_BASE_URLS: Record<string, string> = {
	facebook: 'https://facebook.com/',
	instagram: 'https://instagram.com/',
	twitter: 'https://x.com/',
	linkedin: 'https://linkedin.com/in/',
};

function buildSocialUrl(type: string, url?: string, handle?: string): string {
	// If a full URL is provided, use it directly
	if (url && /^https?:\/\//i.test(url)) return url;

	// Build from handle (strip leading @)
	const raw = handle || url || '';
	const clean = raw.replace(/^@/, '').trim();
	if (!clean) return '#';

	const base = SOCIAL_BASE_URLS[type];
	if (base) return `${base}${clean}`;

	// Unknown platform — try using `url` or `handle` as-is
	if (url) return url.startsWith('http') ? url : `https://${url}`;
	return '#';
}

export const ProfileScreen = () => {
	const { state, dispatch, currentUser, refreshTree } = useFamilyTree();
	const { isUrdu } = useLanguage();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [linkLoading, setLinkLoading] = useState<
		'setup-password' | 'reset-password' | null
	>(null);
	const [linkError, setLinkError] = useState('');
	const [linkSuccess, setLinkSuccess] = useState('');
	const [generatedLink, setGeneratedLink] =
		useState<api.GeneratedPasswordLinkResponse | null>(null);

	const personId = state.selectedPersonId || state.currentUser?.personId || '';
	const person = state.people[personId];

	if (!person) return null;

	const relationshipText = currentUser
		? getRelationship(currentUser.personId, person.id, state.people)
		: 'Relative';

	const isEditable = currentUser
		? canEdit(currentUser, person.id, state.people)
		: false;

	const isSelf = currentUser?.personId === person.id;

	async function handleGeneratePasswordLink(
		purpose: 'setup-password' | 'reset-password',
	) {
		setLinkLoading(purpose);
		setLinkError('');
		setLinkSuccess('');
		try {
			const result = await api.generatePasswordLink(person.id, purpose);
			setGeneratedLink(result);
			setLinkSuccess(
				`${purpose === 'setup-password' ? 'Setup' : 'Reset'} link generated for ${result.username}.`,
			);
		} catch (err) {
			setLinkError(
				err instanceof Error
					? err.message
					: 'Failed to generate password link.',
			);
		} finally {
			setLinkLoading(null);
		}
	}

	async function handleCopyLink() {
		if (!generatedLink) return;
		try {
			await navigator.clipboard.writeText(generatedLink.link);
			setLinkSuccess('Password link copied to clipboard.');
		} catch {
			setLinkError(
				'Failed to copy the link. Copy it manually from the field below.',
			);
		}
	}

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
		<div className='flex h-full w-full flex-col bg-gray-50'>
			{/* Header */}
			<div className='flex items-center justify-between px-6 py-4 mt-safe'>
				<button className='rounded-full bg-white p-2 shadow-sm opacity-0 pointer-events-none'>
					<MoreVertical size={20} />
				</button>
				<button
					className='rounded-full bg-white p-2 shadow-sm'
					onClick={() => dispatch({ type: 'SELECT_PERSON', personId: null })}
				>
					<MoreVertical size={20} className='text-gray-600' />
				</button>
			</div>

			{/* Profile Info */}
			<div className='mt-2 flex flex-col items-center px-4 text-center'>
				<div
					className={`relative mb-4 h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg ${person.isDeceased ? 'grayscale opacity-80' : ''}`}
				>
					<img
						src={getAvatarUrl(person)}
						alt={person.firstName}
						className='h-full w-full object-cover'
					/>
				</div>
				<h1 className='text-2xl font-bold text-gray-800 flex items-center justify-center gap-2 flex-wrap'>
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
					{person.isDeceased && (
						<span className='rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-white uppercase ml-1'>
							{isUrdu ? 'مرحوم' : 'Late'}
						</span>
					)}
				</h1>
				<p className='mt-1 text-sm font-semibold text-lime-600 uppercase tracking-widest'>
					{relationshipText}
				</p>
			</div>

			{/* Actions - Edit */}
			{isEditable && (
				<div className='mt-6 px-6 flex justify-center'>
					<button
						onClick={() =>
							dispatch({ type: 'SET_EDITING', personId: person.id })
						}
						className='flex items-center space-x-2 rounded-full bg-lime-500 px-6 py-2.5 text-sm font-medium text-white shadow-md transition-colors hover:bg-lime-600'
					>
						<Edit size={16} />
						<span>{isUrdu ? 'پروفائل میں ترمیم' : 'Edit Profile'}</span>
					</button>
				</div>
			)}

			{/* Details Section */}
			<div className='mt-8 flex-1 overflow-y-auto px-6 pb-24 space-y-6'>
				{/* Basic Info */}
				<div className='space-y-4 rounded-3xl bg-white p-6 shadow-sm border border-gray-100'>
					{person.bio && (
						<div className='pb-4 border-b border-gray-100'>
							<span className='flex items-center text-sm font-medium text-gray-600 mb-2'>
								<FileText className='mr-2 text-lime-500' size={18} />
								{isUrdu ? 'سوانح حیات' : 'Biography'}
							</span>
							<p className='text-sm text-gray-500 leading-relaxed whitespace-pre-wrap'>
								{person.bio}
							</p>
						</div>
					)}

					<div className='flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0'>
						<span className='flex items-center text-sm font-medium text-gray-600'>
							<MapPin className='mr-3 text-lime-500' size={18} />
							{isUrdu ? 'مقام:' : 'Living in:'}
						</span>
						<span className='text-sm text-gray-500 text-right'>
							{person.location || (isUrdu ? 'نامعلوم' : 'Unknown')}
						</span>
					</div>

					<div className='flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0'>
						<span className='flex items-center text-sm font-medium text-gray-600'>
							<Calendar className='mr-3 text-lime-500' size={18} />
							{isUrdu ? 'تاریخ پیدائش:' : 'Birthday:'}
						</span>
						<span className='text-sm text-gray-500 text-right'>
							{formatBirthday(person.birthDate)}
						</span>
					</div>

					{person.isDeceased && person.deathYear && (
						<div className='flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0'>
							<span className='flex items-center text-sm font-medium text-gray-600'>
								<Heart className='mr-3 text-gray-400' size={18} />
								{isUrdu ? 'سال وفات:' : 'Death Year:'}
							</span>
							<span className='text-sm text-gray-500 text-right'>
								{person.deathYear}
							</span>
						</div>
					)}
				</div>

				{/* Phone Number */}
				{(person.phoneNumber || isSelf) && (
					<div className='rounded-3xl bg-white p-6 shadow-sm border border-gray-100 space-y-3'>
						<div className='flex items-center justify-between'>
							<span className='flex items-center text-sm font-medium text-gray-600'>
								<Phone className='mr-2 text-lime-500' size={18} />
								{isUrdu ? 'فون نمبر' : 'Phone Number'}
							</span>
							{person.phoneNumber && person.phoneVerified ? (
								<span className='flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700'>
									<ShieldCheck size={12} /> {isUrdu ? 'تصدیق شدہ' : 'Verified'}
								</span>
							) : null}
						</div>

						<p className='text-sm text-gray-500'>
							{person.phoneNumber ||
								(isUrdu ? 'ابھی شامل نہیں' : 'Not added yet')}
						</p>
					</div>
				)}

				{/* Social Links */}
				{person.socialLinks && person.socialLinks.length > 0 && (
					<div className='rounded-3xl bg-white p-6 shadow-sm border border-gray-100 space-y-3'>
						<h3 className='flex items-center text-sm font-medium text-gray-600'>
							<LinkIcon className='mr-2 text-lime-500' size={18} />
							{isUrdu ? 'سوشل لنکس' : 'Social Links'}
						</h3>
						<div className='space-y-2'>
							{person.socialLinks.map((link) => {
								const Icon = SOCIAL_ICONS[link.type] ?? LinkIcon;
								const href = buildSocialUrl(link.type, link.url, link.handle);
								return (
									<a
										key={link.type}
										href={href}
										target='_blank'
										rel='noopener noreferrer'
										className='flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-gray-100'
									>
										<Icon size={18} className='shrink-0 text-gray-500' />
										<span className='flex-1 truncate'>
											{link.handle || link.url || link.type}
										</span>
										<ExternalLink
											size={14}
											className='shrink-0 text-gray-400'
										/>
									</a>
								);
							})}
						</div>
					</div>
				)}

				{/* Admin Controls for Relations */}
				{state.isAdminMode && currentUser?.role === 'admin' && (
					<div className='space-y-3 rounded-3xl bg-white p-6 shadow-sm border border-amber-100'>
						<h3 className='text-sm font-bold text-amber-600 mb-4 uppercase tracking-wider'>
							Admin Utilities (Relations)
						</h3>

						<div className='rounded-2xl border border-indigo-100 bg-indigo-50 p-4 space-y-3'>
							<div className='flex items-start gap-3'>
								<div className='rounded-xl bg-indigo-500 p-2 text-white'>
									<KeyRound size={16} />
								</div>
								<div>
									<h4 className='text-sm font-semibold text-indigo-900'>
										Account Links
									</h4>
									<p className='mt-1 text-xs text-indigo-800/80'>
										Generate a 1-day setup link or 1-hour reset link for{' '}
										{person.firstName}.
									</p>
								</div>
							</div>

							<div className='grid grid-cols-2 gap-3'>
								<button
									onClick={() => handleGeneratePasswordLink('setup-password')}
									disabled={Boolean(linkLoading)}
									className='rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50'
								>
									{linkLoading === 'setup-password'
										? 'Generating…'
										: 'Setup Link'}
								</button>
								<button
									onClick={() => handleGeneratePasswordLink('reset-password')}
									disabled={Boolean(linkLoading)}
									className='rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-indigo-700 border border-indigo-200 transition-colors hover:bg-indigo-100 disabled:opacity-50'
								>
									{linkLoading === 'reset-password'
										? 'Generating…'
										: 'Reset Link'}
								</button>
							</div>

							{linkError && (
								<div className='rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600'>
									{linkError}
								</div>
							)}

							{linkSuccess && (
								<div className='rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700'>
									{linkSuccess}
								</div>
							)}

							{generatedLink && (
								<div className='space-y-2 rounded-xl border border-indigo-100 bg-white p-3'>
									<div className='text-xs text-gray-500'>
										Username:{' '}
										<span className='font-semibold text-gray-700'>
											{generatedLink.username}
										</span>{' '}
										• valid until{' '}
										{new Date(generatedLink.expiresAt).toLocaleString()}
									</div>
									<input
										type='text'
										readOnly
										value={generatedLink.link}
										className='w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600'
									/>
									<div className='flex gap-2'>
										<button
											type='button'
											onClick={handleCopyLink}
											className='flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200'
										>
											<Copy size={14} /> Copy
										</button>
										<a
											href={generatedLink.link}
											target='_blank'
											rel='noopener noreferrer'
											className='flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-200'
										>
											<ExternalLink size={14} /> Open
										</a>
									</div>
								</div>
							)}
						</div>

						<div className='grid grid-cols-2 gap-3'>
							{person.parentIds.length < 2 && (
								<button
									onClick={() =>
										dispatch({
											type: 'OPEN_ADD_PERSON_MODAL',
											relativePersonId: person.id,
											relationType: 'parent',
										})
									}
									className='flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 shadow-sm'
								>
									<UserPlus size={14} className='text-gray-500' /> Add Parent
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
								className='flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 shadow-sm'
							>
								<UserPlus size={14} className='text-gray-500' /> Add Spouse
							</button>

							<button
								onClick={() =>
									dispatch({
										type: 'OPEN_ADD_PERSON_MODAL',
										relativePersonId: person.id,
										relationType: 'child',
									})
								}
								className='flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 shadow-sm'
							>
								<UserPlus size={14} className='text-gray-500' /> Add Child
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
									className='flex items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 shadow-sm'
								>
									<UserPlus size={14} className='text-gray-500' /> Add Sibling
								</button>
							)}
						</div>

						<button
							onClick={() =>
								dispatch({
									type: 'OPEN_MANAGE_RELATIONSHIPS_MODAL',
									personId: person.id,
								})
							}
							className='mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-50 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-100 border border-indigo-100'
						>
							<LinkIcon size={16} /> Manage Relations & Arrows
						</button>

						<div className='pt-5 mt-2 border-t border-gray-100'>
							{confirmDelete ? (
								<div className='flex flex-col space-y-3'>
									<p className='text-xs text-red-600 text-center font-medium'>
										Delete {person.firstName}? This cannot be undone.
									</p>
									<div className='flex gap-2'>
										<button
											onClick={() => setConfirmDelete(false)}
											className='flex-1 rounded-xl bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200'
										>
											Cancel
										</button>
										<button
											onClick={handleDelete}
											disabled={deleting}
											className='flex-1 rounded-xl bg-red-500 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-red-600'
										>
											{deleting ? 'Deleting…' : 'Confirm'}
										</button>
									</div>
								</div>
							) : (
								<button
									onClick={() => setConfirmDelete(true)}
									className='flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-red-600 py-3 text-sm font-medium hover:bg-red-100 border border-red-100'
								>
									<Trash2 size={16} /> Delete Person
								</button>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

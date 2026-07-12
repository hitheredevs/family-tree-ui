import { useState } from 'react';
import { changePassword } from '../services/api-client';
import type { User } from '../types';

interface ChangePasswordScreenProps {
	/** If true, the user MUST change their password before continuing (no skip/back). */
	forced?: boolean;
	user?: User;
	onComplete: () => void;
	/** Optional logout handler — shown as a button on forced screens so users can switch accounts. */
	onLogout?: () => void;
}

export function ChangePasswordScreen({
	forced = false,
	user: _user,
	onComplete,
	onLogout,
}: ChangePasswordScreenProps) {
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState('');
	const [success, setSuccess] = useState(false);
	const [loading, setLoading] = useState(false);

	const passwordsMatch = newPassword === confirmPassword;
	const canSubmit =
		currentPassword.trim().length > 0 &&
		newPassword.trim().length >= 6 &&
		passwordsMatch &&
		!loading;

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!canSubmit) return;

		setError('');
		setLoading(true);

		try {
			await changePassword(currentPassword, newPassword);
			setSuccess(true);
			// Brief delay so user sees the success state
			setTimeout(() => onComplete(), 1200);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to change password.',
			);
		} finally {
			setLoading(false);
		}
	}

	if (forced) {
		return (
			<div className='min-h-screen bg-linear-to-br from-emerald-50 to-green-50 flex items-center justify-center p-4'>
				<div className='w-full max-w-sm space-y-5'>
					<div className='rounded-2xl bg-white p-6 shadow-xl'>
						<div className='mb-6 text-center'>
							<div className='mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-3xl text-white shadow-lg'>
								🔒
							</div>
							<h1 className='text-2xl font-bold text-stone-800'>
								Set New Password
							</h1>
							<p className='mt-1 text-sm text-stone-500'>
								Use your temporary password once, or ask an admin for a fresh
								setup link.
							</p>
						</div>

						<form onSubmit={handleSubmit} className='space-y-5'>
							{error && (
								<div className='bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-100'>
									{error}
								</div>
							)}

							{success && (
								<div className='bg-green-50 text-green-700 text-sm rounded-lg px-4 py-3 border border-green-200'>
									Password changed successfully! Redirecting…
								</div>
							)}

							<div>
								<label className='block text-sm font-medium text-stone-600 mb-1'>
									Current Password
								</label>
								<input
									type='password'
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
									placeholder='Enter current password'
									autoFocus
									disabled={success}
									className='w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium text-stone-600 mb-1'>
									New Password
								</label>
								<input
									type='password'
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									placeholder='At least 6 characters'
									disabled={success}
									className='w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium text-stone-600 mb-1'>
									Confirm New Password
								</label>
								<input
									type='password'
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder='Re-enter new password'
									disabled={success}
									className='w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50'
								/>
								{confirmPassword && !passwordsMatch && (
									<p className='text-xs text-red-500 mt-1'>
										Passwords do not match.
									</p>
								)}
							</div>

							<button
								type='submit'
								disabled={!canSubmit || success}
								className='w-full py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md'
							>
								{loading ? 'Changing…' : success ? 'Done ✓' : 'Set Password'}
							</button>
						</form>
					</div>

					{onLogout && (
						<button
							type='button'
							onClick={onLogout}
							className='w-full text-center text-sm text-stone-400 hover:text-red-500 transition-colors pt-2'
						>
							Log out &amp; switch account
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className='min-h-screen bg-linear-to-br from-emerald-50 to-green-50 flex items-center justify-center p-4'>
			<div className='w-full max-w-sm'>
				{/* Header */}
				<div className='text-center mb-8'>
					<div className='inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl shadow-lg mb-4'>
						<span className='text-3xl'>🔒</span>
					</div>
					<h1 className='text-2xl font-bold text-stone-800'>
						{forced ? 'Set New Password' : 'Change Password'}
					</h1>
					<p className='text-sm text-stone-500 mt-1'>
						{forced
							? 'You must change your default password before continuing.'
							: 'Enter your current password and choose a new one.'}
					</p>
				</div>

				{/* Form */}
				<form
					onSubmit={handleSubmit}
					className='bg-white rounded-2xl shadow-xl p-8 space-y-5'
				>
					{error && (
						<div className='bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-100'>
							{error}
						</div>
					)}

					{success && (
						<div className='bg-green-50 text-green-700 text-sm rounded-lg px-4 py-3 border border-green-200'>
							Password changed successfully! Redirecting…
						</div>
					)}

					<div>
						<label className='block text-sm font-medium text-stone-600 mb-1'>
							Current Password
						</label>
						<input
							type='password'
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder='Enter current password'
							autoFocus
							disabled={success}
							className='w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-stone-600 mb-1'>
							New Password
						</label>
						<input
							type='password'
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder='At least 6 characters'
							disabled={success}
							className='w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-stone-600 mb-1'>
							Confirm New Password
						</label>
						<input
							type='password'
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder='Re-enter new password'
							disabled={success}
							className='w-full px-3 py-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm disabled:opacity-50'
						/>
						{confirmPassword && !passwordsMatch && (
							<p className='text-xs text-red-500 mt-1'>
								Passwords do not match.
							</p>
						)}
						{newPassword && newPassword.length < 6 && (
							<p className='text-xs text-amber-600 mt-1'>
								Must be at least 6 characters.
							</p>
						)}
					</div>

					<button
						type='submit'
						disabled={!canSubmit || success}
						className='w-full py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md'
					>
						{loading ? 'Changing…' : success ? 'Done ✓' : 'Change Password'}
					</button>

					{!forced && !success && (
						<button
							type='button'
							onClick={onComplete}
							className='w-full py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors'
						>
							Cancel
						</button>
					)}
				</form>
			</div>
		</div>
	);
}

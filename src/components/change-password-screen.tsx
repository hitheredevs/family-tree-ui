import { useState } from 'react';
import {
	changePassword,
	requestPhoneOtp,
	verifyPhoneOtp,
} from '../services/api-client';
import type { User } from '../types';
import { OtpPasswordResetForm } from './otp-password-reset-form';
import { PhoneNumberField } from './phone-number-field';

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
	user,
	onComplete,
	onLogout,
}: ChangePasswordScreenProps) {
	const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? '');
	const [phoneVerified, setPhoneVerified] = useState(
		Boolean(user?.phoneVerified),
	);
	const [otp, setOtp] = useState('');
	const [otpSent, setOtpSent] = useState(false);
	const [otpLoading, setOtpLoading] = useState(false);
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

	async function handleSendPhoneOtp() {
		if (!phoneNumber.trim()) return;
		setError('');
		setOtpLoading(true);
		try {
			await requestPhoneOtp(phoneNumber.trim());
			setOtpSent(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to send OTP');
		} finally {
			setOtpLoading(false);
		}
	}

	async function handleVerifyPhoneOtp() {
		if (!otp.trim()) return;
		setError('');
		setOtpLoading(true);
		try {
			await verifyPhoneOtp(otp.trim());
			setPhoneVerified(true);
			setSuccess(true);
			setTimeout(() => setSuccess(false), 1200);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to verify phone');
		} finally {
			setOtpLoading(false);
		}
	}

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
			<div className='min-h-screen bg-linear-to-br from-lime-50 to-green-50 flex items-center justify-center p-4'>
				<div className='w-full max-w-sm space-y-5'>
					{!phoneVerified ? (
						<div className='rounded-2xl bg-white p-6 shadow-xl space-y-4'>
							<div className='text-center'>
								<div className='mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-500 text-3xl text-white shadow-lg'>
									📱
								</div>
								<h1 className='text-2xl font-bold text-gray-800'>
									Verify Your Phone
								</h1>
								<p className='mt-1 text-sm text-gray-500'>
									Before setting a new password, verify your phone with OTP.
								</p>
							</div>

							{error && (
								<div className='rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600'>
									{error}
								</div>
							)}

							<div>
								<label className='mb-1 block text-sm font-medium text-gray-600'>
									Phone Number
								</label>
								<PhoneNumberField
									value={phoneNumber}
									onChange={setPhoneNumber}
								/>
							</div>

							<button
								type='button'
								onClick={handleSendPhoneOtp}
								disabled={!phoneNumber.trim() || otpLoading}
								className='w-full rounded-lg bg-lime-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-lime-600 disabled:cursor-not-allowed disabled:opacity-50'
							>
								{otpLoading && !otpSent
									? 'Sending…'
									: otpSent
										? 'Resend OTP'
										: 'Send OTP'}
							</button>

							{otpSent && (
								<>
									<input
										type='text'
										value={otp}
										onChange={(e) => setOtp(e.target.value)}
										placeholder='Enter OTP'
										className='w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm tracking-[0.3em] focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500'
									/>
									<button
										type='button'
										onClick={handleVerifyPhoneOtp}
										disabled={!otp.trim() || otpLoading}
										className='w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50'
									>
										{otpLoading ? 'Verifying…' : 'Verify Phone'}
									</button>
								</>
							)}
						</div>
					) : (
						<div className='rounded-2xl bg-white p-6 shadow-xl'>
							<OtpPasswordResetForm
								title='Set New Password'
								description='Your phone is verified. Request an OTP and set a new password.'
								defaultUsername={user?.username ?? ''}
								defaultPhoneNumber={phoneNumber}
								hideUsername
								onSuccess={onComplete}
								submitLabel='Finish Setup'
							/>
						</div>
					)}

					{onLogout && (
						<button
							type='button'
							onClick={onLogout}
							className='w-full text-center text-sm text-gray-400 hover:text-red-500 transition-colors pt-2'
						>
							Log out &amp; switch account
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className='min-h-screen bg-linear-to-br from-lime-50 to-green-50 flex items-center justify-center p-4'>
			<div className='w-full max-w-sm'>
				{/* Header */}
				<div className='text-center mb-8'>
					<div className='inline-flex items-center justify-center w-16 h-16 bg-lime-500 rounded-2xl shadow-lg mb-4'>
						<span className='text-3xl'>🔒</span>
					</div>
					<h1 className='text-2xl font-bold text-gray-800'>
						{forced ? 'Set New Password' : 'Change Password'}
					</h1>
					<p className='text-sm text-gray-500 mt-1'>
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
						<label className='block text-sm font-medium text-gray-600 mb-1'>
							Current Password
						</label>
						<input
							type='password'
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder='Enter current password'
							autoFocus
							disabled={success}
							className='w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm disabled:opacity-50'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-600 mb-1'>
							New Password
						</label>
						<input
							type='password'
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder='At least 6 characters'
							disabled={success}
							className='w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm disabled:opacity-50'
						/>
					</div>

					<div>
						<label className='block text-sm font-medium text-gray-600 mb-1'>
							Confirm New Password
						</label>
						<input
							type='password'
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder='Re-enter new password'
							disabled={success}
							className='w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm disabled:opacity-50'
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
						className='w-full py-2.5 bg-lime-500 text-white rounded-lg text-sm font-semibold hover:bg-lime-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md'
					>
						{loading ? 'Changing…' : success ? 'Done ✓' : 'Change Password'}
					</button>

					{!forced && !success && (
						<button
							type='button'
							onClick={onComplete}
							className='w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors'
						>
							Cancel
						</button>
					)}
				</form>
			</div>
		</div>
	);
}

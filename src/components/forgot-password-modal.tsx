export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
	return (
		<div
			className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm'
			onClick={onClose}
		>
			<div
				className='w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl'
				onClick={(e) => e.stopPropagation()}
			>
				<div className='space-y-4'>
					<div className='text-center'>
						<div className='mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-2xl text-white shadow-lg'>
							🔗
						</div>
						<h2 className='text-xl font-bold text-gray-800'>
							Password Reset Links
						</h2>
						<p className='mt-2 text-sm text-gray-500'>
							Ask an admin to generate a 1-hour reset link for your account.
							Open that link to set a new password.
						</p>
					</div>

					<div className='rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700'>
						If this is your first login, the admin can generate a setup link
						that stays valid for 1 day.
					</div>
				</div>
				<button
					type='button'
					onClick={onClose}
					className='mt-4 w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200'
				>
					Close
				</button>
			</div>
		</div>
	);
}

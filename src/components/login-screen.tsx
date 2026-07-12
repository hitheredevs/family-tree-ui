import { useState } from 'react';
import { Leaf } from 'lucide-react';
import { ForgotPasswordModal } from './forgot-password-modal';
import { login, setToken, type LoginResponse } from '../services/api-client';

interface LoginScreenProps {
	onLogin: (data: LoginResponse) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [showForgotPassword, setShowForgotPassword] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!username.trim() || !password.trim()) return;

		setError('');
		setLoading(true);

		try {
			const data = await login(username.trim(), password);
			setToken(data.token);
			onLogin(data);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Login failed. Please try again.',
			);
		} finally {
			setLoading(false);
		}
	}

	return (
		<>
			<div className='min-h-screen bg-gradient-to-br from-stone-50 via-emerald-50/40 to-teal-50/60 flex items-center justify-center p-4'>
				<div className='w-full max-w-sm'>
					{/* Logo / title */}
					<div className='text-center mb-8'>
						<div className='inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg shadow-emerald-600/25 mb-4'>
							<Leaf size={30} className='text-white' />
						</div>
						<h1 className='text-2xl font-bold text-stone-800 tracking-tight'>
							Family Tree
						</h1>
						<p className='text-sm text-stone-500 mt-1'>
							Sign in to explore your family
						</p>
					</div>

					{/* Form */}
					<form
						onSubmit={handleSubmit}
						className='modal-card bg-white rounded-3xl shadow-xl shadow-stone-900/5 ring-1 ring-stone-200/60 p-8 space-y-5'
					>
						{error && (
							<div className='bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 ring-1 ring-red-100'>
								{error}
							</div>
						)}

						<div>
							<label className='block text-sm font-medium text-stone-600 mb-1.5'>
								Username
							</label>
							<input
								type='text'
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder='Enter username'
								autoFocus
								className='w-full px-4 py-2.5 bg-stone-50 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 focus:bg-white text-sm text-stone-800 placeholder:text-stone-400 transition-colors'
							/>
						</div>

						<div>
							<label className='block text-sm font-medium text-stone-600 mb-1.5'>
								Password
							</label>
							<input
								type='password'
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder='Enter password'
								className='w-full px-4 py-2.5 bg-stone-50 border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 focus:bg-white text-sm text-stone-800 placeholder:text-stone-400 transition-colors'
							/>
						</div>

						<button
							type='submit'
							disabled={loading || !username.trim() || !password.trim()}
							className='w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20 active:scale-[0.99]'
						>
							{loading ? 'Signing in…' : 'Sign In'}
						</button>

						<button
							type='button'
							onClick={() => setShowForgotPassword(true)}
							className='w-full text-sm font-medium text-emerald-600 transition-colors hover:text-emerald-700'
						>
							Forgot password?
						</button>
					</form>
				</div>
			</div>
			{showForgotPassword && (
				<ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />
			)}
		</>
	);
}

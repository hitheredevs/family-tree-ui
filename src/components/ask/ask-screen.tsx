import { useMemo, useRef, useState, useEffect } from 'react';
import {
	Sparkles,
	Send,
	Route,
	X,
	Plus,
	ArrowRight,
	Bot,
} from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import { PersonCombobox } from '../person-combobox';
import { getRelationship, findRelationPath } from '../../utils/relationship';
import { getPersonFullName } from '../../utils/person-labels';
import * as api from '../../services/api-client';
import type { Person } from '../../types';

interface ChatEntry {
	role: 'user' | 'assistant';
	content: string;
}

const STEP_WORD: Record<string, string> = {
	parent: 'parent',
	child: 'child',
	spouse: 'spouse',
	'ex-spouse': 'ex-spouse',
};

export function AskScreen() {
	const { state, centerPersonId } = useFamilyTree();

	const allPeople = useMemo(
		() => Object.values(state.people),
		[state.people],
	);

	/* ---- Kinship tool ---- */
	const [personAId, setPersonAId] = useState('');
	const [personBId, setPersonBId] = useState(centerPersonId);

	const kinship = useMemo(() => {
		if (!personAId || !personBId || personAId === personBId) return null;
		const label = getRelationship(personBId, personAId, state.people);
		const path = findRelationPath(personBId, personAId, state.people);
		return { label, path };
	}, [personAId, personBId, state.people]);

	/* ---- AI chat ---- */
	const [contextIds, setContextIds] = useState<string[]>([]);
	const [pickerValue, setPickerValue] = useState('');
	const [messages, setMessages] = useState<ChatEntry[]>([]);
	const [input, setInput] = useState('');
	const [asking, setAsking] = useState(false);
	const [aiError, setAiError] = useState('');
	const chatEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, asking]);

	function addContext(personId: string) {
		if (!personId) return;
		setContextIds((prev) =>
			prev.includes(personId) ? prev : [...prev, personId].slice(0, 8),
		);
		setPickerValue('');
	}

	async function handleAsk() {
		const question = input.trim();
		if (!question || asking) return;
		setInput('');
		setAiError('');
		const nextMessages: ChatEntry[] = [
			...messages,
			{ role: 'user', content: question },
		];
		setMessages(nextMessages);
		setAsking(true);
		try {
			const { reply } = await api.askAi(nextMessages, contextIds);
			setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
		} catch (err) {
			setAiError(
				err instanceof Error ? err.message : 'The AI could not answer.',
			);
		} finally {
			setAsking(false);
		}
	}

	const contextPeople = contextIds
		.map((id) => state.people[id])
		.filter(Boolean);

	const pathNames = (kinship?.path ?? []).map((step) => ({
		name: state.people[step.personId]
			? getPersonFullName(state.people[step.personId])
			: '?',
		step: STEP_WORD[step.step] ?? step.step,
	}));

	return (
		<div className='flex h-full w-full flex-col bg-stone-50'>
			<div className='mx-auto w-full max-w-2xl px-6 pt-8 pb-4'>
				<h1 className='text-2xl font-bold text-stone-800 tracking-tight'>
					Ask
				</h1>
				<p className='text-sm text-stone-500'>
					Explore relationships and ask questions about the family
				</p>
			</div>

			<div className='flex-1 overflow-y-auto pb-24 md:pb-8'>
				<div className='mx-auto w-full max-w-2xl space-y-6 px-4'>
					{/* ── Kinship tool (works offline, instant) ── */}
					<div className='space-y-2.5'>
						<h2 className='px-2 text-[11px] font-bold uppercase tracking-widest text-stone-400'>
							<span className='inline-flex items-center gap-1.5'>
								<Route size={12} /> How are we related?
							</span>
						</h2>
						<div className='rounded-2xl bg-white p-4 shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/60 space-y-3'>
							<div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2'>
								<div>
									<label className='mb-1 block text-xs font-semibold text-stone-500'>
										Person
									</label>
									<PersonCombobox
										people={allPeople}
										value={personAId}
										onChange={setPersonAId}
										placeholder='Pick someone…'
									/>
								</div>
								<div>
									<label className='mb-1 block text-xs font-semibold text-stone-500'>
										Related to
									</label>
									<PersonCombobox
										people={allPeople}
										value={personBId}
										onChange={setPersonBId}
										placeholder='Defaults to you'
									/>
								</div>
							</div>

							{kinship && (
								<div className='rounded-xl bg-emerald-50/70 px-4 py-3 ring-1 ring-emerald-100'>
									<p className='text-sm text-stone-700'>
										<span className='font-bold uppercase'>
											{state.people[personAId] &&
												getPersonFullName(state.people[personAId])}
										</span>{' '}
										is{' '}
										<span className='font-bold text-emerald-700'>
											{kinship.label === 'Relative'
												? 'a distant relative'
												: `the ${kinship.label.toLowerCase()}`}
										</span>{' '}
										of{' '}
										<span className='font-bold uppercase'>
											{state.people[personBId] &&
												getPersonFullName(state.people[personBId])}
										</span>
										.
									</p>
									{pathNames.length > 1 && (
										<div className='mt-2 flex flex-wrap items-center gap-1 text-[11px] text-stone-500'>
											<span className='font-semibold uppercase'>
												{state.people[personBId]?.firstName}
											</span>
											{pathNames.map((n, i) => (
												<span
													key={i}
													className='flex items-center gap-1'
												>
													<ArrowRight size={10} className='text-stone-300' />
													<span>
														<span className='text-stone-400'>{n.step}:</span>{' '}
														<span className='font-semibold uppercase'>
															{n.name}
														</span>
													</span>
												</span>
											))}
										</div>
									)}
								</div>
							)}
							{personAId &&
								personBId &&
								personAId !== personBId &&
								kinship?.path === null && (
									<p className='text-sm text-stone-400'>
										These two people are not connected in the tree yet.
									</p>
								)}
						</div>
					</div>

					{/* ── AI chat ── */}
					<div className='space-y-2.5'>
						<h2 className='px-2 text-[11px] font-bold uppercase tracking-widest text-stone-400'>
							<span className='inline-flex items-center gap-1.5'>
								<Sparkles size={12} /> Ask anything
							</span>
						</h2>
						<div className='rounded-2xl bg-white p-4 shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/60 space-y-3'>
							{/* Context chips */}
							<div>
								<label className='mb-1.5 block text-xs font-semibold text-stone-500'>
									People in context (helps the AI answer accurately)
								</label>
								<div className='flex flex-wrap items-center gap-1.5'>
									{contextPeople.map((p: Person) => (
										<span
											key={p.id}
											className='flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-1 pr-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200'
										>
											<span
												className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white bg-gradient-to-b ${
													p.gender === 'female'
														? 'from-pink-300 to-pink-500'
														: 'from-blue-300 to-blue-500'
												}`}
											>
												{(p.firstName?.[0] ?? '?').toUpperCase()}
											</span>
											<span className='uppercase'>{p.firstName}</span>
											<button
												onClick={() =>
													setContextIds((prev) =>
														prev.filter((id) => id !== p.id),
													)
												}
												className='text-emerald-500 hover:text-emerald-700'
											>
												<X size={12} />
											</button>
										</span>
									))}
									{contextIds.length < 8 && (
										<div className='min-w-[180px] flex-1'>
											<PersonCombobox
												people={allPeople.filter(
													(p) => !contextIds.includes(p.id),
												)}
												value={pickerValue}
												onChange={addContext}
												placeholder={
													contextPeople.length === 0
														? 'Add a person as context…'
														: 'Add another…'
												}
												className='w-full rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-700 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200'
											/>
										</div>
									)}
								</div>
							</div>

							{/* Messages */}
							{messages.length > 0 && (
								<div className='max-h-80 space-y-2.5 overflow-y-auto rounded-xl bg-stone-50 p-3'>
									{messages.map((m, i) => (
										<div
											key={i}
											className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
										>
											<div
												className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
													m.role === 'user'
														? 'bg-emerald-600 text-white'
														: 'bg-white text-stone-700 ring-1 ring-stone-200'
												}`}
											>
												{m.content}
											</div>
										</div>
									))}
									{asking && (
										<div className='flex items-center gap-2 px-1 text-xs text-stone-400'>
											<Bot size={14} className='animate-pulse' />
											Thinking…
										</div>
									)}
									<div ref={chatEndRef} />
								</div>
							)}

							{aiError && (
								<div className='rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800'>
									{aiError}
								</div>
							)}

							{/* Input */}
							<div className='flex items-center gap-2'>
								<input
									type='text'
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
									placeholder='e.g. Who are the grandchildren of FAZAL?'
									className='w-full rounded-xl border border-transparent bg-stone-50 px-4 py-2.5 text-sm text-stone-800 transition-colors focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200'
								/>
								<button
									onClick={handleAsk}
									disabled={!input.trim() || asking}
									className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40'
								>
									<Send size={16} />
								</button>
							</div>
							{messages.length === 0 && (
								<div className='flex flex-wrap gap-1.5'>
									{[
										'Who has a birthday this month?',
										'List all children of the person in context',
										'Which family members live abroad?',
									].map((q) => (
										<button
											key={q}
											onClick={() => setInput(q)}
											className='rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-700'
										>
											<Plus size={10} className='mr-1 inline' />
											{q}
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

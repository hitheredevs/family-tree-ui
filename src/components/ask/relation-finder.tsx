import { useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Route, Sparkles } from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import { PersonCombobox } from '../person-combobox';
import { describeKinship, type KinStep } from '../../utils/kinship';
import { getPersonFullName } from '../../utils/person-labels';
import type { Person } from '../../types';

const STEP_WORD: Record<KinStep, [string, string, string]> = {
	parent: ['father', 'mother', 'parent'],
	child: ['son', 'daughter', 'child'],
	spouse: ['husband', 'wife', 'spouse'],
	'ex-spouse': ['ex-husband', 'ex-wife', 'ex-spouse'],
};

function stepWord(step: KinStep, person?: Person): string {
	const [m, f, n] = STEP_WORD[step];
	return person?.gender === 'male' ? m : person?.gender === 'female' ? f : n;
}

/**
 * "How are we related?" — instant, offline, no AI. Uses the same kinship
 * engine as the assistant, so both always give the same answer.
 */
export function RelationFinder({
	onPersonClick,
	onAskAi,
	compact = false,
}: {
	onPersonClick: (personId: string) => void;
	onAskAi?: (question: string, personIds: string[]) => void;
	compact?: boolean;
}) {
	const { state, centerPersonId } = useFamilyTree();
	const allPeople = useMemo(() => Object.values(state.people), [state.people]);
	const [personId, setPersonId] = useState('');
	const [relatedToId, setRelatedToId] = useState(centerPersonId);

	const person = state.people[personId];
	const relatedTo = state.people[relatedToId];
	const isMe = relatedToId === centerPersonId;

	const kinship = useMemo(() => {
		if (!personId || !relatedToId || personId === relatedToId) return null;
		return describeKinship(state.people, relatedToId, personId);
	}, [personId, relatedToId, state.people]);

	const owner = isMe ? 'your' : `${relatedTo ? getPersonFullName(relatedTo) : ''}'s`;
	const labelText = kinship
		? kinship.kind === 'extended'
			? lowerFirst(kinship.chain)
			: lowerFirst(kinship.label)
		: '';

	return (
		<div className={`rounded-2xl bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/70 ${compact ? 'p-3.5' : 'p-4'}`}>
			<div className='mb-3 flex items-center justify-between gap-2'>
				<h2 className='flex items-center gap-2 text-sm font-semibold text-stone-800'>
					<span className='flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-100'>
						<Route size={15} />
					</span>
					How are we related?
				</h2>
				<span className='rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500'>
					Instant · no AI
				</span>
			</div>

			<div className='grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-2'>
				<div className='min-w-0'>
					<label className='mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-400'>
						Person
					</label>
					<PersonCombobox people={allPeople} value={personId} onChange={setPersonId} placeholder='Pick someone…' />
				</div>
				<button
					type='button'
					onClick={() => {
						setPersonId(relatedToId);
						setRelatedToId(personId);
					}}
					disabled={!personId && !relatedToId}
					title='Swap'
					className='flex h-8 w-8 items-center justify-center justify-self-center rounded-xl text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-30 sm:mb-0.5 sm:h-9 sm:w-9'
				>
					<ArrowLeftRight size={16} className='rotate-90 sm:rotate-0' />
				</button>
				<div className='min-w-0'>
					<label className='mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-400'>
						Related to
					</label>
					<PersonCombobox people={allPeople} value={relatedToId} onChange={setRelatedToId} placeholder='Pick someone…' />
				</div>
			</div>

			{kinship && kinship.kind !== 'none' && person && relatedTo && (
				<div className='mt-3 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/60 px-4 py-3 ring-1 ring-emerald-100'>
					<p className='text-[15px] leading-snug text-stone-700'>
						<button type='button' onClick={() => onPersonClick(person.id)} className='font-bold uppercase text-stone-900 hover:underline'>
							{getPersonFullName(person)}
						</button>{' '}
						is {owner}{' '}
						<span className='font-bold text-emerald-700'>{labelText}</span>
						{kinship.term && (
							<span className='ml-1.5 inline-block rounded-full bg-white px-2 py-0.5 align-middle text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200'>
								{kinship.term}
							</span>
						)}
					</p>
					{kinship.kind !== 'extended' && kinship.chain && kinship.chain.toLowerCase() !== kinship.label.toLowerCase() && (
						<p className='mt-1 text-xs text-stone-500'>
							{isMe ? 'Your' : owner} {lowerFirst(kinship.chain)}
						</p>
					)}
					{kinship.also && <p className='mt-1 text-xs text-stone-500'>Also {owner} {lowerFirst(kinship.also)}</p>}

					{kinship.path && kinship.path.length > 1 && (
						<div className='mt-2.5 flex flex-wrap items-center gap-1 text-[11px]'>
							<PathChip person={relatedTo} onClick={onPersonClick} />
							{kinship.path.map((step, i) => {
								const p = state.people[step.personId];
								return (
									<span key={i} className='flex items-center gap-1'>
										<ArrowRight size={11} className='text-stone-300' />
										<span className='text-stone-400'>{stepWord(step.step, p)}</span>
										<PathChip person={p} onClick={onPersonClick} />
									</span>
								);
							})}
						</div>
					)}

					{onAskAi && (
						<button
							type='button'
							onClick={() =>
								onAskAi(
									`Explain how ${getPersonFullName(person).toUpperCase()} is related to ${isMe ? 'me' : getPersonFullName(relatedTo).toUpperCase()}, and tell me about the people in between.`,
									[person.id, relatedTo.id],
								)
							}
							className='mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-50'
						>
							<Sparkles size={12} /> Ask AI to explain
						</button>
					)}
				</div>
			)}
			{kinship && kinship.kind === 'none' && (
				<p className='mt-3 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-500'>
					These two people aren't connected in the tree yet.
				</p>
			)}
		</div>
	);
}

function PathChip({ person, onClick }: { person?: Person; onClick: (id: string) => void }) {
	if (!person) return <span className='text-stone-400'>?</span>;
	return (
		<button
			type='button'
			onClick={() => onClick(person.id)}
			className='rounded-md bg-white/80 px-1.5 py-0.5 font-semibold uppercase text-stone-700 ring-1 ring-stone-200 hover:bg-white'
		>
			{getPersonFullName(person)}
		</button>
	);
}

function lowerFirst(s: string): string {
	return s ? s[0].toLowerCase() + s.slice(1) : s;
}

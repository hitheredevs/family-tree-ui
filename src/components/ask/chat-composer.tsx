import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ArrowUp, AtSign, Square, X } from 'lucide-react';
import type { Person } from '../../types';
import {
	buildPeopleMap,
	getParentLabel,
	getPersonFullName,
	getPersonSearchText,
	matchesAllWords,
} from '../../utils/person-labels';

const MAX_CONTEXT = 8;
const MAX_CHARS = 2000;

export interface ComposerHandle {
	focus: () => void;
	setText: (text: string, contextIds?: string[]) => void;
}

interface Props {
	people: Record<string, Person>;
	/** People shown first when "@" is typed with nothing after it */
	closeFamilyIds: string[];
	initialText: string;
	onDraftChange: (text: string) => void;
	onSend: (text: string, contextIds: string[]) => Promise<boolean> | boolean;
	onStop: () => void;
	streaming: boolean;
	disabled?: boolean;
	disabledReason?: string;
}

const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Message box: grows with the text, Enter sends (Shift+Enter = new line;
 * on phones the send button sends). Typing "@" opens a person picker that
 * attaches that person to the question so the assistant knows exactly who.
 */
export const ChatComposer = forwardRef<ComposerHandle, Props>(function ChatComposer(
	{ people, closeFamilyIds, initialText, onDraftChange, onSend, onStop, streaming, disabled, disabledReason },
	ref,
) {
	const [text, setText] = useState(initialText);
	const [contextIds, setContextIds] = useState<string[]>([]);
	const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
	const [highlight, setHighlight] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const peopleList = useMemo(() => Object.values(people), [people]);
	const peopleById = useMemo(() => buildPeopleMap(peopleList), [peopleList]);
	const searchText = useMemo(() => {
		const map = new Map<string, string>();
		const dummy = new Map<string, number>();
		for (const p of peopleList) map.set(p.id, getPersonSearchText(p, peopleById, dummy));
		return map;
	}, [peopleList, peopleById]);

	useImperativeHandle(ref, () => ({
		focus: () => textareaRef.current?.focus(),
		setText: (value: string, ids?: string[]) => {
			setText(value);
			onDraftChange(value);
			if (ids) setContextIds(ids.slice(0, MAX_CONTEXT));
			requestAnimationFrame(() => {
				const el = textareaRef.current;
				if (!el) return;
				el.focus();
				el.setSelectionRange(value.length, value.length);
			});
		},
	}));

	// Grow with content
	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
	}, [text]);

	const suggestions = useMemo(() => {
		if (!mention) return [];
		const q = mention.query.trim();
		if (!q) {
			return closeFamilyIds
				.map((id) => people[id])
				.filter((p): p is Person => Boolean(p) && !contextIds.includes(p.id))
				.slice(0, 6);
		}
		const result: Person[] = [];
		for (const p of peopleList) {
			if (contextIds.includes(p.id)) continue;
			if (matchesAllWords(searchText.get(p.id) ?? '', q)) result.push(p);
			if (result.length >= 40) break;
		}
		// Names starting with the query first
		const lower = q.toLowerCase();
		result.sort(
			(a, b) =>
				Number(!getPersonFullName(a).toLowerCase().startsWith(lower)) -
					Number(!getPersonFullName(b).toLowerCase().startsWith(lower)) ||
				getPersonFullName(a).length - getPersonFullName(b).length,
		);
		return result.slice(0, 6);
	}, [mention, closeFamilyIds, people, peopleList, contextIds, searchText]);

	const detectMention = (value: string, caret: number) => {
		const before = value.slice(0, caret);
		const match = before.match(/(^|\s)@([^\s@]*(?:\s[^\s@]+){0,2})$/);
		if (!match) {
			setMention(null);
			return;
		}
		const query = match[2];
		setMention({ start: caret - query.length - 1, query });
		setHighlight(0);
	};

	const pick = (person: Person) => {
		if (!mention) return;
		const el = textareaRef.current;
		const caret = el?.selectionStart ?? text.length;
		const name = getPersonFullName(person).toUpperCase();
		const next = `${text.slice(0, mention.start)}@${name} ${text.slice(caret)}`;
		setText(next);
		onDraftChange(next);
		setContextIds((ids) => (ids.includes(person.id) ? ids : [...ids, person.id].slice(0, MAX_CONTEXT)));
		setMention(null);
		const pos = mention.start + name.length + 2;
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(pos, pos);
		});
	};

	const insertAt = () => {
		const el = textareaRef.current;
		const caret = el?.selectionStart ?? text.length;
		const needsSpace = caret > 0 && !/\s$/.test(text.slice(0, caret));
		const next = `${text.slice(0, caret)}${needsSpace ? ' ' : ''}@${text.slice(caret)}`;
		setText(next);
		const pos = caret + (needsSpace ? 2 : 1);
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(pos, pos);
			detectMention(next, pos);
		});
	};

	const submit = async () => {
		const value = text.trim();
		if (!value || streaming || disabled) return;
		const ids = contextIds;
		setText('');
		setContextIds([]);
		setMention(null);
		onDraftChange('');
		const ok = await onSend(value, ids);
		if (!ok) {
			// Not sent — give the question back
			setText(value);
			setContextIds(ids);
			onDraftChange(value);
		}
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (mention && suggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setHighlight((h) => (h + 1) % suggestions.length);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
				return;
			}
			if (e.key === 'Enter' || e.key === 'Tab') {
				e.preventDefault();
				pick(suggestions[Math.min(highlight, suggestions.length - 1)]);
				return;
			}
		}
		if (e.key === 'Escape' && mention) {
			setMention(null);
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
			e.preventDefault();
			submit();
		}
	};

	const attached = contextIds.map((id) => people[id]).filter(Boolean);
	const canSend = text.trim().length > 0 && !disabled;

	return (
		<div className='relative'>
			{mention && suggestions.length > 0 && (
				<div className='absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-2xl bg-white shadow-xl shadow-stone-900/10 ring-1 ring-stone-200'>
					<p className='border-b border-stone-100 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400'>
						{mention.query.trim() ? 'Attach a person' : 'Your close family'}
					</p>
					<ul className='max-h-64 overflow-y-auto overscroll-contain py-1'>
						{suggestions.map((p, i) => (
							<li key={p.id}>
								<button
									type='button'
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => pick(p)}
									onMouseEnter={() => setHighlight(i)}
									className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left ${
										i === highlight ? 'bg-emerald-50' : 'hover:bg-stone-50'
									}`}
								>
									<span
										className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
											p.gender === 'female' ? 'bg-pink-400' : 'bg-sky-500'
										}`}
									>
										{(p.firstName?.[0] ?? '?').toUpperCase()}
									</span>
									<span className='min-w-0'>
										<span className='block truncate text-sm font-semibold uppercase text-stone-800'>
											{getPersonFullName(p)}
										</span>
										<span className='block truncate text-xs text-stone-400'>{getParentLabel(p, people)}</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			<div
				className={`rounded-[22px] bg-white shadow-lg shadow-stone-900/5 ring-1 transition-shadow ${
					disabled ? 'ring-stone-200 opacity-70' : 'ring-stone-200 focus-within:ring-2 focus-within:ring-emerald-400/60'
				}`}
			>
				{attached.length > 0 && (
					<div className='flex flex-wrap gap-1.5 px-3 pt-3'>
						{attached.map((p) => (
							<span
								key={p.id}
								className='inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 py-0.5 pl-1 pr-1 text-xs font-semibold uppercase text-emerald-800 ring-1 ring-emerald-200'
							>
								<span
									className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white ${
										p.gender === 'female' ? 'bg-pink-400' : 'bg-sky-500'
									}`}
								>
									{(p.firstName?.[0] ?? '?').toUpperCase()}
								</span>
								<span className='truncate'>{getPersonFullName(p)}</span>
								<button
									type='button'
									aria-label={`Remove ${getPersonFullName(p)}`}
									onClick={() => setContextIds((ids) => ids.filter((id) => id !== p.id))}
									className='flex h-4 w-4 items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-100 hover:text-emerald-800'
								>
									<X size={11} />
								</button>
							</span>
						))}
					</div>
				)}
				<div className='flex items-end gap-1.5 p-2'>
					<button
						type='button'
						onClick={insertAt}
						disabled={disabled || contextIds.length >= MAX_CONTEXT}
						title='Mention a person (@)'
						aria-label='Mention a person'
						className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-emerald-600 disabled:opacity-40'
					>
						<AtSign size={19} />
					</button>
					<textarea
						ref={textareaRef}
						rows={1}
						value={text}
						maxLength={MAX_CHARS}
						disabled={disabled}
						onChange={(e) => {
							setText(e.target.value);
							onDraftChange(e.target.value);
							detectMention(e.target.value, e.target.selectionStart);
						}}
						onKeyDown={onKeyDown}
						onClick={(e) => detectMention(text, e.currentTarget.selectionStart)}
						onBlur={() => window.setTimeout(() => setMention(null), 150)}
						placeholder={disabled ? (disabledReason ?? 'Assistant unavailable') : 'Ask about your family…'}
						className='max-h-[168px] min-h-[40px] flex-1 resize-none bg-transparent py-2 text-base leading-6 text-stone-800 placeholder:text-stone-400 focus:outline-none md:text-[15px]'
					/>
					{streaming ? (
						<button
							key='stop'
							type='button'
							onClick={onStop}
							title='Stop'
							aria-label='Stop answering'
							className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-800 text-white transition-colors hover:bg-stone-700'
						>
							<Square size={14} fill='currentColor' />
						</button>
					) : (
						<button
							key='send'
							type='button'
							onClick={submit}
							disabled={!canSend}
							title='Send'
							aria-label='Send'
							className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-95 disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none'
						>
							<ArrowUp size={19} strokeWidth={2.5} />
						</button>
					)}
				</div>
			</div>
		</div>
	);
});

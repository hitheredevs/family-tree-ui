import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, RotateCcw, Search, Sparkles, Square } from 'lucide-react';
import type { AiMessage } from '../../services/api-client';
import type { Person } from '../../types';
import { ChatMarkdown, PersonChip } from './chat-markdown';
import type { LiveAnswer } from './use-ai-chat';

interface CommonProps {
	people: Record<string, Person>;
	resolveRef: (ref: string) => string | null;
	onPersonClick: (personId: string) => void;
}

export function AssistantAvatar({ pulsing = false }: { pulsing?: boolean }) {
	return (
		<div
			className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/25 ${
				pulsing ? 'animate-pulse' : ''
			}`}
		>
			<Sparkles size={15} />
		</div>
	);
}

function timeOf(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Strip [[NAME|id]] markup for copying */
function plainText(text: string): string {
	return text.replace(/\[\[([^|\]\n]{1,80})\|[^\]\n]{0,40}\]\]/g, '$1');
}

export function UserMessage({ message, people, onPersonClick }: CommonProps & { message: AiMessage }) {
	const attached = message.contextPersonIds.map((id) => people[id]).filter(Boolean);
	return (
		<div className='group flex flex-col items-end gap-1'>
			<div className='max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm shadow-emerald-700/15'>
				{message.content}
			</div>
			{attached.length > 0 && (
				<div className='flex max-w-[85%] flex-wrap justify-end gap-1'>
					{attached.map((p) => (
						<PersonChip key={p.id} person={p} onClick={() => onPersonClick(p.id)} />
					))}
				</div>
			)}
			<span className='px-1 text-[10px] text-stone-400 opacity-0 transition-opacity group-hover:opacity-100'>
				{timeOf(message.createdAt)}
			</span>
		</div>
	);
}

export function AssistantMessage({
	message,
	isLast,
	canRegenerate,
	onRegenerate,
	people,
	resolveRef,
	onPersonClick,
}: CommonProps & {
	message: AiMessage;
	isLast: boolean;
	canRegenerate: boolean;
	onRegenerate: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [showSteps, setShowSteps] = useState(false);

	if (message.status === 'error') {
		return (
			<div className='flex gap-3'>
				<div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600'>
					<AlertTriangle size={15} />
				</div>
				<div className='min-w-0 flex-1 rounded-2xl rounded-tl-md bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200'>
					<p>{message.error || 'The assistant could not answer.'}</p>
					{isLast && canRegenerate && (
						<button
							type='button'
							onClick={onRegenerate}
							className='mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100'
						>
							<RotateCcw size={12} /> Try again
						</button>
					)}
				</div>
			</div>
		);
	}

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(plainText(message.content));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			/* clipboard not available */
		}
	};

	return (
		<div className='group flex gap-3'>
			<AssistantAvatar />
			<div className='min-w-0 flex-1 pt-1 text-[15px] text-stone-700'>
				<ChatMarkdown text={message.content} people={people} resolveRef={resolveRef} onPersonClick={onPersonClick} />
				{message.status === 'stopped' && (
					<p className='mt-1.5 inline-flex items-center gap-1 text-xs text-stone-400'>
						<Square size={10} /> Stopped
					</p>
				)}

				<div
					className={`mt-1.5 flex flex-wrap items-center gap-1 text-stone-400 transition-opacity ${
						isLast ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
					}`}
				>
					<IconButton label={copied ? 'Copied' : 'Copy'} onClick={copy}>
						{copied ? <Check size={14} className='text-emerald-600' /> : <Copy size={14} />}
					</IconButton>
					{isLast && canRegenerate && (
						<IconButton label='Answer again' onClick={onRegenerate}>
							<RotateCcw size={14} />
						</IconButton>
					)}
					{message.steps.length > 0 && (
						<button
							type='button'
							onClick={() => setShowSteps((v) => !v)}
							className='ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600'
						>
							<Search size={11} />
							Checked {message.steps.length} thing{message.steps.length === 1 ? '' : 's'} in the tree
							<ChevronDown size={11} className={`transition-transform ${showSteps ? 'rotate-180' : ''}`} />
						</button>
					)}
					<span className='ml-auto text-[10px]'>{timeOf(message.createdAt)}</span>
				</div>
				{showSteps && (
					<ul className='mt-1 space-y-0.5 border-l-2 border-stone-100 pl-3 text-xs text-stone-500'>
						{message.steps.map((step, i) => (
							<li key={i}>{step.label}</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

export function LiveAssistantMessage({ live, people, resolveRef, onPersonClick }: CommonProps & { live: LiveAnswer }) {
	const writing = live.text.length > 0;
	return (
		<div className='flex gap-3' aria-live='polite'>
			<AssistantAvatar pulsing={!writing} />
			<div className='min-w-0 flex-1 pt-1 text-[15px] text-stone-700'>
				{!writing && (
					<div className='flex items-center gap-2 pt-0.5 text-sm text-stone-500'>
						<span className='flex gap-1'>
							<span className='h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]' />
							<span className='h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]' />
							<span className='h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500' />
						</span>
						<span className='truncate'>{live.status ? `${live.status}…` : 'Reading the question…'}</span>
					</div>
				)}
				{writing && (
					<div className='relative'>
						<ChatMarkdown text={live.text} people={people} resolveRef={resolveRef} onPersonClick={onPersonClick} streaming />
						<span className='ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-emerald-500' />
					</div>
				)}
				{live.steps.length > 0 && !writing && (
					<ul className='mt-2 space-y-0.5 border-l-2 border-emerald-100 pl-3 text-xs text-stone-400'>
						{live.steps.slice(0, -1).map((step, i) => (
							<li key={i} className='flex items-center gap-1'>
								<Check size={11} className='text-emerald-500' /> {step}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type='button'
			onClick={onClick}
			title={label}
			aria-label={label}
			className='flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-stone-100 hover:text-stone-700'
		>
			{children}
		</button>
	);
}

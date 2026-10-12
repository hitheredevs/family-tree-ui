import { Fragment, type ReactNode } from 'react';
import type { Person } from '../../types';
import { getParentLabel, getPersonFullName } from '../../utils/person-labels';

/**
 * Small, safe markdown renderer for assistant answers: paragraphs, line
 * breaks, bullet / numbered lists, headings, **bold**, *italic*, `code`,
 * and [[NAME|id]] person mentions rendered as tappable chips. No HTML
 * is ever injected.
 */

const MENTION = /\[\[([^|\]\n]{1,80})\|([^\]\n]{0,40})\]\]/;
const INLINE = /(\[\[[^|\]\n]{1,80}\|[^\]\n]{0,40}\]\]|\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;

interface Props {
	text: string;
	people: Record<string, Person>;
	resolveRef: (ref: string) => string | null;
	onPersonClick: (personId: string) => void;
	/** Hide a half-written [[mention while the answer is still streaming */
	streaming?: boolean;
}

export function ChatMarkdown({ text, people, resolveRef, onPersonClick, streaming }: Props) {
	const source = streaming ? text.replace(/\[\[[^\]]*$/, '') : text;

	const inline = (line: string, keyBase: string): ReactNode[] => {
		const parts = line.split(INLINE).filter((part) => part !== '');
		return parts.map((part, i) => {
			const key = `${keyBase}-${i}`;
			const mention = part.match(MENTION);
			if (mention && part.startsWith('[[')) {
				const name = mention[1].trim();
				const id = resolveRef(mention[2]);
				const person = id ? people[id] : undefined;
				if (!person) return <span key={key} className='font-semibold uppercase'>{name}</span>;
				return (
					<PersonChip
						key={key}
						person={person}
						label={name}
						subtitle={getParentLabel(person, people)}
						onClick={() => onPersonClick(person.id)}
					/>
				);
			}
			if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
				return <strong key={key} className='font-semibold text-stone-900'>{inline(part.slice(2, -2), key)}</strong>;
			}
			if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
				return <code key={key} className='rounded bg-stone-100 px-1 py-0.5 text-[0.85em]'>{part.slice(1, -1)}</code>;
			}
			if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
				return <em key={key}>{part.slice(1, -1)}</em>;
			}
			return <Fragment key={key}>{part}</Fragment>;
		});
	};

	const blocks: ReactNode[] = [];
	const lines = source.replace(/\r\n/g, '\n').split('\n');
	let paragraph: string[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;

	const flushParagraph = () => {
		if (!paragraph.length) return;
		const key = `p${blocks.length}`;
		blocks.push(
			<p key={key} className='leading-relaxed'>
				{paragraph.map((line, i) => (
					<Fragment key={i}>
						{i > 0 && <br />}
						{inline(line, `${key}-${i}`)}
					</Fragment>
				))}
			</p>,
		);
		paragraph = [];
	};
	const flushList = () => {
		if (!list) return;
		const key = `l${blocks.length}`;
		const items = list.items.map((item, i) => (
			<li key={i} className='pl-1 leading-relaxed'>
				{inline(item, `${key}-${i}`)}
			</li>
		));
		blocks.push(
			list.ordered ? (
				<ol key={key} className='list-decimal space-y-1 pl-5 marker:text-stone-400'>{items}</ol>
			) : (
				<ul key={key} className='list-disc space-y-1 pl-5 marker:text-emerald-500'>{items}</ul>
			),
		);
		list = null;
	};

	for (const raw of lines) {
		const line = raw.trimEnd();
		const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
		const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
		const heading = line.match(/^#{1,4}\s+(.*)$/);
		if (!line.trim()) {
			flushParagraph();
			flushList();
		} else if (bullet || numbered) {
			flushParagraph();
			const ordered = Boolean(numbered);
			if (list && list.ordered !== ordered) flushList();
			list ??= { ordered, items: [] };
			list.items.push((bullet ?? numbered)![1]);
		} else if (heading) {
			flushParagraph();
			flushList();
			blocks.push(
				<p key={`h${blocks.length}`} className='pt-1 font-semibold text-stone-900'>
					{inline(heading[1], `h${blocks.length}`)}
				</p>,
			);
		} else if (list && /^\s{2,}\S/.test(raw)) {
			// Continuation of the previous list item
			list.items[list.items.length - 1] += ` ${line.trim()}`;
		} else {
			flushList();
			paragraph.push(line);
		}
	}
	flushParagraph();
	flushList();

	return <div className='space-y-2.5 break-words'>{blocks}</div>;
}

export function PersonChip({
	person,
	label,
	subtitle,
	onClick,
}: {
	person: Person;
	label?: string;
	subtitle?: string;
	onClick?: () => void;
}) {
	const female = person.gender === 'female';
	return (
		<button
			type='button'
			onClick={onClick}
			title={subtitle ? `${getPersonFullName(person)} · ${subtitle}` : getPersonFullName(person)}
			className={`mx-px inline-flex max-w-full items-center gap-1 rounded-full py-px pl-0.5 pr-2 align-baseline text-[0.92em] font-semibold uppercase transition-colors ${
				female
					? 'bg-pink-50 text-pink-800 ring-1 ring-pink-200/70 hover:bg-pink-100'
					: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200/70 hover:bg-sky-100'
			} ${person.isDeceased ? 'opacity-80' : ''}`}
		>
			<span
				className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${
					female ? 'bg-pink-400' : 'bg-sky-500'
				}`}
			>
				{(person.firstName?.[0] ?? '?').toUpperCase()}
			</span>
			<span className='truncate'>{label ?? getPersonFullName(person)}</span>
		</button>
	);
}

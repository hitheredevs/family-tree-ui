import { useMemo } from 'react';
import { Cake, CalendarDays } from 'lucide-react';
import { useFamilyTree } from '../../state/family-tree-context';
import { useLanguage } from '../../state/language-context';
import { toUrdu } from '../../utils/transliterate';
import { parseMonthDay, MONTH_OPTIONS } from '../../utils/birthdate';
import { getPersonFullName } from '../../utils/person-labels';
import type { Person } from '../../types';

interface BirthdayEntry {
	person: Person;
	month: number; // 1-12
	day: number;
	/** Days from today (0 = today) within the next 365 */
	inDays: number;
	turns: number | null;
}

function daysUntil(month: number, day: number, today: Date): number {
	const year = today.getFullYear();
	const target = new Date(year, month - 1, day);
	const startOfToday = new Date(year, today.getMonth(), today.getDate());
	let diff = Math.round(
		(target.getTime() - startOfToday.getTime()) / 86400000,
	);
	if (diff < 0) diff += 365;
	return diff;
}

export function EventsScreen({ onPersonOpen }: { onPersonOpen: () => void }) {
	const { state, dispatch } = useFamilyTree();
	const { isUrdu } = useLanguage();

	const { entries, unknownCount } = useMemo(() => {
		const today = new Date();
		const list: BirthdayEntry[] = [];
		let unknown = 0;

		for (const person of Object.values(state.people)) {
			if (person.isDeceased) continue;
			const { month, day } = parseMonthDay(person.birthDate);
			if (!month || !day) {
				unknown++;
				continue;
			}
			const m = Number(month);
			const d = Number(day);

			/* Age only when a full ISO date with a real year is stored */
			const isoMatch = (person.birthDate ?? '').match(/^(\d{4})-/);
			const birthYear = isoMatch ? Number(isoMatch[1]) : null;
			const inDays = daysUntil(m, d, today);
			const targetYear =
				today.getMonth() + 1 > m ||
				(today.getMonth() + 1 === m && today.getDate() > d)
					? today.getFullYear() + 1
					: today.getFullYear();

			list.push({
				person,
				month: m,
				day: d,
				inDays,
				turns: birthYear ? targetYear - birthYear : null,
			});
		}

		list.sort((a, b) => a.inDays - b.inDays);
		return { entries: list, unknownCount: unknown };
	}, [state.people]);

	const todayEntries = entries.filter((e) => e.inDays === 0);
	const weekEntries = entries.filter((e) => e.inDays > 0 && e.inDays <= 7);
	const laterEntries = entries.filter((e) => e.inDays > 7);

	/* Group the rest by month, in upcoming order */
	const monthGroups = useMemo(() => {
		const groups = new Map<number, BirthdayEntry[]>();
		for (const e of laterEntries) {
			const bucket = groups.get(e.month);
			if (bucket) bucket.push(e);
			else groups.set(e.month, [e]);
		}
		return [...groups.entries()].sort(
			(a, b) =>
				Math.min(...a[1].map((e) => e.inDays)) -
				Math.min(...b[1].map((e) => e.inDays)),
		);
	}, [laterEntries]);

	function openPerson(p: Person) {
		dispatch({ type: 'SELECT_PERSON', personId: p.id });
		onPersonOpen();
	}

	const renderRow = (entry: BirthdayEntry, highlight = false) => {
		const name = getPersonFullName(entry.person);
		return (
			<button
				key={entry.person.id}
				onClick={() => openPerson(entry.person)}
				className={`flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left transition-colors last:border-0 ${
					highlight ? 'hover:bg-pink-50/60' : 'hover:bg-emerald-50/50'
				}`}
			>
				<span
					className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white bg-gradient-to-b ${
						entry.person.gender === 'female'
							? 'from-pink-300 to-pink-500'
							: 'from-blue-300 to-blue-500'
					}`}
				>
					{(entry.person.firstName?.[0] ?? '?').toUpperCase()}
				</span>
				<span className='min-w-0 flex-1'>
					<span className='block truncate text-[15px] font-semibold text-stone-800 uppercase'>
						{isUrdu ? (
							<span
								style={{
									fontFamily: "'Noto Nastaliq Urdu', serif",
									direction: 'rtl' as const,
								}}
							>
								{toUrdu(name)}
							</span>
						) : (
							name
						)}
					</span>
					<span className='block text-xs text-stone-400'>
						{MONTH_OPTIONS[entry.month - 1]} {entry.day}
						{entry.turns !== null && ` · turns ${entry.turns}`}
					</span>
				</span>
				<span
					className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
						entry.inDays === 0
							? 'bg-pink-500 text-white'
							: entry.inDays <= 7
								? 'bg-emerald-100 text-emerald-700'
								: 'bg-stone-100 text-stone-500'
					}`}
				>
					{entry.inDays === 0
						? 'Today!'
						: entry.inDays === 1
							? 'Tomorrow'
							: `in ${entry.inDays}d`}
				</span>
			</button>
		);
	};

	const Card = ({ children }: { children: React.ReactNode }) => (
		<div className='overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-900/5 ring-1 ring-stone-200/60'>
			{children}
		</div>
	);
	const SectionLabel = ({ children }: { children: React.ReactNode }) => (
		<h2 className='px-2 text-[11px] font-bold uppercase tracking-widest text-stone-400'>
			{children}
		</h2>
	);

	return (
		<div className='flex h-full w-full flex-col bg-stone-50'>
			<div className='mx-auto w-full max-w-2xl px-6 pt-8 pb-4'>
				<h1 className='text-2xl font-bold text-stone-800 tracking-tight'>
					Events
				</h1>
				<p className='text-sm text-stone-500'>
					{entries.length} birthdays on record
					{unknownCount > 0 && ` · ${unknownCount} people without a date`}
				</p>
			</div>

			<div className='flex-1 overflow-y-auto pb-24 md:pb-8'>
				<div className='mx-auto w-full max-w-2xl space-y-6 px-4'>
					{entries.length === 0 && (
						<Card>
							<div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
								<CalendarDays size={28} className='text-stone-300' />
								<p className='text-sm text-stone-400'>
									No birthdays recorded yet. Add birthdays from a person&rsquo;s
									Edit Profile screen.
								</p>
							</div>
						</Card>
					)}

					{todayEntries.length > 0 && (
						<div className='space-y-2.5'>
							<SectionLabel>
								<span className='inline-flex items-center gap-1.5 text-pink-500'>
									<Cake size={12} /> Today
								</span>
							</SectionLabel>
							<Card>{todayEntries.map((e) => renderRow(e, true))}</Card>
						</div>
					)}

					{weekEntries.length > 0 && (
						<div className='space-y-2.5'>
							<SectionLabel>Next 7 days</SectionLabel>
							<Card>{weekEntries.map((e) => renderRow(e))}</Card>
						</div>
					)}

					{monthGroups.map(([month, group]) => (
						<div key={month} className='space-y-2.5'>
							<SectionLabel>{MONTH_OPTIONS[month - 1]}</SectionLabel>
							<Card>{group.map((e) => renderRow(e))}</Card>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

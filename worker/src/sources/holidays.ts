import { HOLIDAYS_ICS_URL, HOLIDAY_NAMES_BN, dhakaDate, type Holiday, type Point } from '@bdnumbers/shared';
import { ParseError } from '../lib/errors';
import { fetchText } from '../lib/http';
import type { Source } from './types';

const unescapeIcs = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/**
 * Public holidays from Google's Bangladesh holiday calendar (ICS), for this year and next. Each event's
 * DESCRIPTION starts with "Public holiday" or "Observance"; only public holidays are kept.
 */
export function parseHolidaysIcs(ics: string, today: string): Holiday[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, '');
  const year = Number(today.slice(0, 4));
  const holidays: Holiday[] = [];
  for (const event of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const field = (name: string) => new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'm').exec(event)?.[1];
    const start = field('DTSTART');
    const summary = field('SUMMARY');
    const m = start ? /^(\d{4})(\d{2})(\d{2})/.exec(start) : null;
    if (!m || !summary) continue;
    const eventYear = Number(m[1]);
    if (eventYear < year || eventYear > year + 1) continue;
    if (!/^Public holiday/i.test(unescapeIcs(field('DESCRIPTION') ?? ''))) continue;
    const name = unescapeIcs(summary);
    holidays.push({ date: `${m[1]}-${m[2]}-${m[3]}`, name, name_bn: HOLIDAY_NAMES_BN[name] ?? null, type: 'public' });
  }
  if (holidays.length === 0) throw new ParseError('no public holidays for this year in the calendar');
  return holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export const holidays: Source = {
  key: 'holidays',
  cadence: 'periodic',
  writeMode: 'on-change',
  async fetch(env, ctx) {
    const today = dhakaDate();
    const list = parseHolidaysIcs(await fetchText(env, HOLIDAYS_ICS_URL), today);
    const unnamed = [...new Set(list.filter((h) => !h.name_bn).map((h) => h.name))];
    if (unnamed.length > 0) ctx.warn(`holidays without a Bengali name: ${unnamed.join('; ')}`);
    const thisYear = list.filter((h) => h.date.startsWith(today.slice(0, 4)));
    return [{ series_key: 'holidays_public', date: today, value: thisYear.length, meta: { holidays: list } }];
  },
};

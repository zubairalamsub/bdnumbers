// Formatting shared by server-rendered components and the browser script, so a refresh or a
// digits switch re-renders exactly what the build rendered.
import {
  dhakaDate,
  formatDate,
  formatNumber,
  formatSeriesValue,
  toBengaliDigits,
  type Category,
  type Change,
  type Digits,
  type Lang,
} from '@bdnumbers/shared';
import { STRINGS } from '../i18n';

/** Visitors see data at most this old: the page refreshes from the API once its data is older than this. */
export const REFRESH_MS = 5 * 60 * 1000;

export type Direction = 'up' | 'down' | 'flat';

export function direction(abs: number): Direction {
  return abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
}

const ARROWS: Record<Direction, string> = { up: '▲', down: '▼', flat: '■' };

/** Visible text and a screen-reader label for a change, e.g. "▲ 0.65 (0.53%)" / "up 0.65 (0.53%)". */
export function changeLabel(
  change: Pick<Change, 'abs' | 'pct'>,
  category: Category,
  lang: Lang,
  digits: Digits,
): { text: string; aria: string; dir: Direction } {
  const dir = direction(change.abs);
  const s = STRINGS[lang];
  if (dir === 'flat') return { text: `${ARROWS.flat} ${s.unchanged}`, aria: s.unchanged, dir };
  const amount = formatSeriesValue(Math.abs(change.abs), category, digits);
  const pct = change.pct === null ? '' : ` (${formatNumber(Math.abs(change.pct), digits, 2, 2)}%)`;
  return { text: `${ARROWS[dir]} ${amount}${pct}`, aria: `${dir === 'up' ? s.up : s.down} ${amount}${pct}`, dir };
}

/** "22 Oct 2026, 13:00" in Dhaka time (UTC+6, no DST). */
export function formatDateTime(iso: string, lang: Lang, digits: Digits): string {
  const dhaka = new Date(Date.parse(iso) + 6 * 60 * 60 * 1000);
  const time = dhaka.toISOString().slice(11, 16);
  return `${formatDate(dhakaDate(new Date(iso)), lang, digits)}, ${digits === 'beng' ? toBengaliDigits(time) : time}`;
}

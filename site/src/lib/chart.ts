import { addDays, formatDate, formatShortDate, type Digits, type Lang } from '@bdnumbers/shared';

/** [date, value] pairs, oldest first. */
export type Pt = [date: string, value: number];
/** Midpoints of two series (e.g. a bid and an ask, or a lowest and a highest price), on the dates both have. */
export function midpoints(a: readonly Pt[], b: readonly Pt[]): Pt[] {
  const other = new Map(b);
  return a.flatMap(([date, x]) => {
    const y = other.get(date);
    return y === undefined ? [] : [[date, (x + y) / 2] as Pt];
  });
}

export type Range = '30' | '90' | '365' | 'all';
export const RANGES: readonly Range[] = ['30', '90', '365', 'all'];

/** The plot is drawn in a 1000×1000 box stretched to the container (preserveAspectRatio="none"). */
const SIZE = 1000;

export interface Tick {
  value: number;
  /** 0 (top) … 1000 (bottom) */
  y: number;
}

export interface Geometry {
  line: string;
  area: string;
  ticks: Tick[];
  /** Plot coordinates of each point, 0…1000 on both axes. */
  xy: Array<[x: number, y: number]>;
}

const round = (n: number) => Math.round(n * 10) / 10;

function niceStep(span: number, target: number): number {
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const time = (date: string) => Date.parse(date.length > 10 ? `${date}:00Z` : `${date}T00:00:00Z`);

/** Line, area and y ticks on a time-proportional x axis. Null when there are fewer than two points. */
export function geometry(points: readonly Pt[]): Geometry | null {
  if (points.length < 2) return null;
  const values = points.map(([, v]) => v);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, 4);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const t0 = time(points[0]![0]);
  const t1 = time(points[points.length - 1]![0]);
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * SIZE;
  const y = (v: number) => SIZE - ((v - yMin) / (yMax - yMin)) * SIZE;

  const xy = points.map(([d, v]): [number, number] => [round(x(time(d))), round(y(v))]);
  const line = xy.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px},${py}`).join('');
  const area = `${line}L${xy[xy.length - 1]![0]},${SIZE}L${xy[0]![0]},${SIZE}Z`;
  const ticks: Tick[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push({ value: Math.round(v * 1e6) / 1e6, y: round(y(v)) });
  return { line, area, ticks, xy };
}

/** Decimals the y-axis labels need so ticks such as 122.5 / 123 / 123.5 stay distinct. */
export function tickDecimals(ticks: readonly Tick[]): number {
  return Math.min(4, Math.max(0, ...ticks.map((t) => (String(t.value).split('.')[1] ?? '').length)));
}

/** The points within `range` days of the latest point. */
export function sliceRange(points: readonly Pt[], range: Range): Pt[] {
  const last = points[points.length - 1];
  if (range === 'all' || !last) return [...points];
  const from = addDays(last[0], -Number(range));
  return points.filter(([d]) => d.slice(0, 10) >= from);
}

/** Start and end labels for the x axis; years appear only when the range crosses a year. */
export function axisLabels(first: string, last: string, lang: Lang, digits: Digits): [string, string] {
  const format = first.slice(0, 4) === last.slice(0, 4) ? formatShortDate : formatDate;
  return [format(first, lang, digits), format(last, lang, digits)];
}

/** Show a year by default, or everything when there's less than a year. */
export function defaultRange(points: readonly Pt[]): Range {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 'all';
  return first[0] < addDays(last[0], -365) ? '365' : 'all';
}

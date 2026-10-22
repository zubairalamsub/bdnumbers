import { addDays, dhakaDate, getSeriesDef, isPointDate, type Point } from '@bdnumbers/shared';
import { ValidationError } from './lib/errors';

/** Reject unknown series, malformed or future dates, non-finite values, values outside the series bounds, and duplicates. */
export function validatePoints(points: readonly Point[], today: string = dhakaDate()): void {
  if (points.length === 0) throw new ValidationError('no points');
  const latestAllowed = addDays(today, 1);
  const seen = new Set<string>();
  const problems: string[] = [];

  for (const p of points) {
    const def = getSeriesDef(p.series_key);
    if (!def) {
      problems.push(`${p.series_key}: unknown series`);
      continue;
    }
    if (!isPointDate(p.date)) problems.push(`${p.series_key}: bad date "${p.date}"`);
    else if (p.date.slice(0, 10) > latestAllowed) problems.push(`${p.series_key}: date ${p.date} is in the future`);

    if (!Number.isFinite(p.value)) problems.push(`${p.series_key}: value ${p.value} is not a number`);
    else if (def.bounds && (p.value < def.bounds[0] || p.value > def.bounds[1])) {
      problems.push(`${p.series_key}: ${p.value} outside [${def.bounds[0]}, ${def.bounds[1]}]`);
    }

    const id = `${p.series_key}@${p.date}`;
    if (seen.has(id)) problems.push(`${id}: duplicate`);
    seen.add(id);
  }

  if (problems.length > 0) throw new ValidationError(problems.join('; '));
}

/** The page was fetched but didn't have the structure a parser expects. */
export class ParseError extends Error {
  override name = 'ParseError';
}

/** Parsed values failed sanity checks (bounds, dates, ordering). */
export class ValidationError extends Error {
  override name = 'ValidationError';
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message;
  return String(err);
}

/** Parse the first number in a string such as "19,405 BDT/GRAM" or "123.6000". */
export function parseAmount(s: string, what: string): number {
  const match = /\d[\d,]*(?:\.\d+)?/.exec(s);
  const value = match ? Number(match[0].replace(/,/g, '')) : Number.NaN;
  if (!Number.isFinite(value)) throw new ParseError(`${what}: no number in "${s}"`);
  return value;
}

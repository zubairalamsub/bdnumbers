// Browser-only preferences shared by the site script and the calculators.
import { defaultDigits, toLatinDigits, type Digits, type Lang } from '@bdnumbers/shared';

/** Per language, so choosing Latin digits on Bengali pages doesn't change English pages. */
export const digitsKey = (lang: Lang) => `bdrate:digits:${lang}`;

/** The reader's light/dark choice; absent means "follow the device". */
export const THEME_KEY = 'bdrate:theme';
export type Theme = 'light' | 'dark';
/** Browser chrome colour (meta theme-color) for each theme. */
export const THEME_COLORS: Record<Theme, string> = { light: '#006a4e', dark: '#1a1a19' };

export function readDigits(lang: Lang): Digits {
  try {
    const saved = localStorage.getItem(digitsKey(lang));
    if (saved === 'beng' || saved === 'latn') return saved;
  } catch {
    // storage blocked: use the language default
  }
  return defaultDigits(lang);
}

export function pageLang(): Lang {
  return document.documentElement.lang === 'en' ? 'en' : 'bn';
}

/** A number typed in either digit system, with optional thousands separators; NaN if not a number. */
export function parseInput(value: string): number {
  const cleaned = toLatinDigits(value).replace(/[,\s]/g, '');
  return cleaned === '' ? Number.NaN : Number(cleaned);
}

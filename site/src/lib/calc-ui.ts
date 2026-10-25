// Browser helper for the calculator forms: read inputs (Bengali or Latin digits), recompute on every
// change and on a digits switch, and write formatted results into <output>/[data-out] elements.
import { formatNumber, type Digits, type Lang } from '@bdnumbers/shared';
import { pageLang, parseInput, readDigits } from './prefs';

export interface CalcContext {
  lang: Lang;
  digits: Digits;
  /** Numeric value of a named input (NaN if empty or invalid). */
  num(name: string): number;
  /** Raw value of a named input or select. */
  str(name: string): string;
  /** Write text into [data-out=name]. */
  out(name: string, text: string): void;
  /** Format money: up to 2 decimals, South Asian grouping. */
  money(n: number): string;
  /** money() with the currency: "১,২৩৪ টাকা" / "Tk 1,234". */
  taka(n: number): string;
}

export function bindCalculator(form: HTMLFormElement, compute: (ctx: CalcContext) => void): void {
  const lang = pageLang();
  // The calculator's frame (Shell): includes the pinned summary bar outside the form.
  const root = form.closest<HTMLElement>('[data-calc-root]') ?? form;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  const run = () => {
    const digits = readDigits(lang);
    const money = (n: number) => (Number.isFinite(n) ? formatNumber(n, digits, 2, 0) : '—');
    compute({
      lang,
      digits,
      num: (name) => {
        const el = field(name);
        const raw = el?.value ?? '';
        // Optional amounts start blank with a "0" placeholder; left blank, they count as 0.
        return raw.trim() === '' && el?.dataset.blankZero !== undefined ? 0 : parseInput(raw);
      },
      str: (name) => field(name)?.value ?? '',
      out: (name, text) => {
        for (const el of root.querySelectorAll<HTMLElement>(`[data-out="${name}"]`)) el.textContent = text;
      },
      money,
      // A no-break space keeps an amount and its currency on one line in narrow table cells.
      taka: (n) => (!Number.isFinite(n) ? '—' : lang === 'bn' ? `${money(n)} টাকা` : `Tk ${money(n)}`),
    });
  };
  form.addEventListener('input', run);
  form.addEventListener('change', run);
  form.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('bdrate:digits', run);
  run();
}

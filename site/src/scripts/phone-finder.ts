// The phone finder on /mobile-price, in the browser. The page carries every phone (a few dozen KB), so
// filtering and sorting need no request. The first rows are already in the HTML, drawn by the same code.
import {
  BUDGETS,
  DEFAULT_FINDER,
  FINDER_PAGE,
  findPhones,
  finderCount,
  finderRow,
  type FinderPhone,
  type FinderSort,
  type FinderState,
  type RowText,
} from '../lib/phone-finder';
import { pageLang, readDigits } from '../lib/prefs';

const root = document.querySelector<HTMLElement>('[data-phone-finder]');
if (root) {
  const data = JSON.parse(root.querySelector('script[type="application/json"]')!.textContent ?? '{}') as {
    phones: FinderPhone[];
    brands: Record<string, string>;
    text: RowText;
  };
  const lang = pageLang();
  const state: FinderState = { ...DEFAULT_FINDER };
  let shown = FINDER_PAGE;

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const query = $<HTMLInputElement>('[data-query]');
  const brand = $<HTMLSelectElement>('[data-brand]');
  const sort = $<HTMLSelectElement>('[data-sort]');
  const official = $<HTMLInputElement>('[data-official]');
  const budgets = [...root.querySelectorAll<HTMLButtonElement>('[data-budget]')];
  const results = $<HTMLUListElement>('[data-results]');
  const count = $<HTMLElement>('[data-count]');
  const empty = $<HTMLElement>('[data-empty]');
  const more = $<HTMLButtonElement>('[data-more]');

  const render = () => {
    const found = findPhones(data.phones, state);
    const digits = readDigits(lang);
    results.innerHTML = found
      .slice(0, shown)
      .map((p) => finderRow(p, { lang, digits, brands: data.brands, text: data.text, official: state.official }))
      .join('');
    count.textContent = finderCount(found.length, lang, digits);
    results.hidden = found.length === 0;
    empty.hidden = found.length > 0;
    more.hidden = found.length <= shown;
  };
  // Any filter change starts the list from the top again.
  const update = (change: Partial<FinderState>) => {
    Object.assign(state, change);
    shown = FINDER_PAGE;
    render();
  };

  query.addEventListener('input', () => update({ query: query.value }));
  brand.addEventListener('change', () => update({ brand: brand.value }));
  sort.addEventListener('change', () => update({ sort: sort.value as FinderSort }));
  official.addEventListener('change', () => update({ official: official.checked }));
  for (const b of budgets) {
    b.addEventListener('click', () => {
      for (const other of budgets) other.setAttribute('aria-pressed', String(other === b));
      update({ budget: b.dataset.budget ?? BUDGETS[0]!.id });
    });
  }
  more.addEventListener('click', () => {
    shown += FINDER_PAGE;
    render();
  });
  document.addEventListener('bdrate:digits', render);
  // A browser restoring a half-filled form after "back": start from what the controls show.
  Object.assign(state, {
    query: query.value,
    brand: brand.value,
    sort: sort.value as FinderSort,
    official: official.checked,
  });
  if (state.query || state.brand || state.official || state.sort !== DEFAULT_FINDER.sort) render();
}

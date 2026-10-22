// The site's one script: keeps numbers at most 5 minutes old, ticks "updated X ago", switches between
// Bengali and Latin digits, and drives the charts (range buttons, crosshair tooltip). Everything it
// renders comes from the same helpers the build used, so the page never changes shape.
import {
  BHORI_GRAMS,
  dhakaDate,
  formatNumber,
  fractionDigits,
  relativeTime,
  type Category,
  type Digits,
  type Lang,
  type LatestEntry,
  type LatestResponse,
  type StatusResponse,
  weatherCondition,
} from '@bdnumbers/shared';
import { STRINGS } from '../i18n';
import { axisLabels, geometry, sliceRange, tickDecimals, type Pt, type Range } from '../lib/chart';
import { digitsKey, readDigits } from '../lib/prefs';
import { REFRESH_MS, changeLabel, formatDateTime, formatPointDate } from '../lib/view';

const DIGITS_EVENT = 'bdrate:digits';

const root = document.documentElement;
const lang: Lang = root.lang === 'en' ? 'en' : 'bn';
const DIGITS_KEY = digitsKey(lang);
const api = document.body.dataset.api ?? '';
let digits: Digits = readDigits(lang);
// The build's data counts as the first fetch.
let lastFetch = Date.parse(document.body.dataset.generated ?? '') || 0;

// ---------- rendering ----------

function renderValues(scope: ParentNode = document): void {
  for (const el of scope.querySelectorAll<HTMLElement>('[data-num]')) {
    const fd = Number(el.dataset.fd ?? 0);
    el.textContent = formatNumber(Number(el.dataset.num), digits, fd, fd);
  }
  for (const el of scope.querySelectorAll<HTMLElement>('[data-change]')) {
    if (!el.dataset.abs) {
      el.hidden = el.dataset.empty !== 'dash';
      el.textContent = '—';
      el.removeAttribute('aria-label');
      continue;
    }
    const pct = el.dataset.pct ? Number(el.dataset.pct) : null;
    const label = changeLabel({ abs: Number(el.dataset.abs), pct }, el.dataset.cat as Category, lang, digits);
    el.textContent = label.text;
    el.setAttribute('aria-label', label.aria);
    el.hidden = false;
  }
  for (const el of scope.querySelectorAll<HTMLElement>('[data-date]')) {
    const date = el.dataset.date!;
    el.textContent = formatPointDate(date, lang, digits);
    el.setAttribute('datetime', date);
  }
  renderTimes(scope);
  renderDays(scope);
}

/** [data-day]: dim days already past; [data-countdown]: "in N days" until that Dhaka date. */
function renderDays(scope: ParentNode = document): void {
  const today = dhakaDate();
  for (const el of scope.querySelectorAll<HTMLElement>('[data-day]')) {
    el.classList.toggle('opacity-50', el.dataset.day! < today);
  }
  for (const el of scope.querySelectorAll<HTMLElement>('[data-countdown]')) {
    const days = Math.round((Date.parse(el.dataset.countdown!) - Date.parse(today)) / 86_400_000);
    // A page built before the date can be read after it: say nothing rather than "-2 days".
    el.hidden = days < 0;
    el.textContent =
      days === 0
        ? lang === 'bn'
          ? 'আজ'
          : 'today'
        : lang === 'bn'
          ? `${formatNumber(days, digits, 0)} দিন বাকি`
          : `in ${formatNumber(days, digits, 0)} day${days === 1 ? '' : 's'}`;
  }
}

function renderTimes(scope: ParentNode = document): void {
  for (const el of scope.querySelectorAll<HTMLElement>('[data-ago]')) {
    const at = el.dataset.ago;
    el.hidden = !at;
    if (!at) continue;
    el.textContent = relativeTime(at, lang, digits);
    el.title = formatDateTime(at, lang, digits);
    el.setAttribute('datetime', at);
  }
}

// ---------- live data ----------

function perGram(entry: LatestEntry): number {
  const raw = entry.meta?.per_gram;
  return typeof raw === 'number' ? raw : Math.round(entry.value / BHORI_GRAMS);
}

/** Write an entry into the [data-field] elements that belong to this [data-series] container. */
function applyEntry(container: HTMLElement, entry: LatestEntry): void {
  for (const el of container.querySelectorAll<HTMLElement>('[data-field]')) {
    if (el.closest('[data-series]') !== container) continue;
    const field = el.dataset.field!;
    if (field === 'value') {
      el.dataset.num = String(entry.value);
      el.dataset.fd = String(fractionDigits(entry.category, entry.value));
    } else if (field === 'per_gram') el.dataset.num = String(perGram(entry));
    else if (field === 'date') el.dataset.date = entry.date;
    else if (field === 'checked') el.dataset.ago = entry.checked_at ?? '';
    else if (field === 'stale') el.hidden = !entry.stale;
    else if (field === 'symbol') {
      const condition = weatherCondition(entry.meta?.symbol, lang);
      el.textContent = condition ? `${condition.icon} ${condition.text}` : '';
    } else if (field.startsWith('meta.')) {
      const value = entry.meta?.[field.slice('meta.'.length)];
      el.hidden = typeof value !== 'number';
      if (typeof value === 'number') el.dataset.num = String(value);
    }
    else if (field.startsWith('change.')) {
      const change = entry.change[field.slice('change.'.length) as keyof LatestEntry['change']];
      el.dataset.abs = change ? String(change.abs) : '';
      el.dataset.pct = change?.pct == null ? '' : String(change.pct);
    }
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${api}${path}`);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null; // offline or API down: keep showing what we have
  }
}

async function refreshLatest(): Promise<void> {
  const containers = document.querySelectorAll<HTMLElement>('[data-series]');
  if (containers.length === 0) return;
  // Only the series on this page; sorted so every visitor of a page shares one edge-cached URL.
  const keys = [...new Set([...containers].map((c) => c.dataset.series!))].sort();
  const latest = await getJson<LatestResponse>(`/api/latest.json?keys=${encodeURIComponent(keys.join(','))}`);
  if (!latest) return;
  const byKey = new Map(latest.series.map((e) => [e.key, e]));
  for (const container of containers) {
    const entry = byKey.get(container.dataset.series!);
    if (entry) applyEntry(container, entry);
  }
  renderValues();
}

async function refreshStatus(): Promise<void> {
  const table = document.querySelector<HTMLElement>('[data-status-table]');
  if (!table) return;
  const status = await getJson<StatusResponse>('/api/status.json');
  if (!status) return;
  const s = STRINGS[lang].status;
  for (const src of status.sources) {
    const row = table.querySelector<HTMLElement>(`[data-source="${CSS.escape(src.source)}"]`);
    if (!row) continue;
    const cell = (name: string) => row.querySelector<HTMLElement>(`[data-cell="${name}"]`);
    const run = src.last_run;
    const result = cell('result');
    if (result) {
      result.dataset.state = run ? (run.ok ? 'ok' : 'failed') : 'never';
      result.textContent = run ? (run.ok ? `✓ ${s.ok}` : `✕ ${s.failed}`) : s.never;
    }
    const lastRun = cell('last-run');
    if (lastRun) lastRun.dataset.ago = run?.started_at ?? '';
    const lastOk = cell('last-ok');
    if (lastOk) lastOk.dataset.ago = src.last_ok_at ?? '';
    const error = table.querySelector<HTMLElement>(`[data-source-error="${CSS.escape(src.source)}"] [data-cell="error"]`);
    if (error) error.textContent = run?.error ?? '';
    const failures = cell('failures');
    if (failures) failures.dataset.num = String(src.failures_24h);
    const stale = cell('stale');
    if (stale) stale.textContent = src.stale_series.length > 0 ? src.stale_series.join(', ') : s.none;
  }
  renderValues(table);
}

function maybeRefresh(): void {
  if (document.visibilityState !== 'visible' || Date.now() - lastFetch < REFRESH_MS) return;
  lastFetch = Date.now();
  void refreshLatest();
  void refreshStatus();
}

// ---------- charts ----------

function setupChart(fig: HTMLElement): void {
  const plot = fig.querySelector<HTMLElement>('[data-plot]');
  if (!plot) return;
  const points = JSON.parse(fig.querySelector('script[data-points]')?.textContent ?? '[]') as Pt[];
  const category = fig.dataset.cat as Category;
  const unit = fig.dataset.unit ?? '';
  const q = <T extends Element>(sel: string) => fig.querySelector<T>(sel)!;
  const line = q<SVGPathElement>('[data-line]');
  const area = q<SVGPathElement>('[data-area]');
  const yAxis = q<HTMLElement>('[data-y-axis]');
  const grid = q<HTMLElement>('[data-grid]');
  const endDot = q<HTMLElement>('[data-end-dot]');
  const crosshair = q<HTMLElement>('[data-crosshair]');
  const hoverDot = q<HTMLElement>('[data-hover-dot]');
  const tooltip = q<HTMLElement>('[data-tooltip]');
  const tipValue = q<HTMLElement>('[data-tooltip-value]');
  const tipDate = q<HTMLElement>('[data-tooltip-date]');
  const xStart = q<HTMLElement>('[data-x-start]');
  const xEnd = q<HTMLElement>('[data-x-end]');
  const buttons = [...fig.querySelectorAll<HTMLButtonElement>('[data-range-btn]')];

  let range = (fig.dataset.range ?? 'all') as Range;
  let view: Pt[] = [];
  let xy: Array<[number, number]> = [];
  let active = -1;

  // A range with fewer than two points can't be drawn.
  for (const b of buttons) b.disabled = sliceRange(points, b.dataset.rangeBtn as Range).length < 2;

  const positioned = (top: number, cls: string, text = '') => {
    const span = document.createElement('span');
    span.className = cls;
    span.style.top = `${top / 10}%`;
    span.textContent = text;
    return span;
  };

  function render(): void {
    view = sliceRange(points, range);
    const geo = geometry(view);
    if (!geo) return;
    xy = geo.xy;
    line.setAttribute('d', geo.line);
    area.setAttribute('d', geo.area);
    const decimals = tickDecimals(geo.ticks);
    const tickText = (v: number) => formatNumber(v, digits, decimals, decimals);
    yAxis.replaceChildren(
      ...geo.ticks.map((t) => positioned(t.y, 'absolute right-0 -translate-y-1/2 whitespace-nowrap', tickText(t.value))),
    );
    const sizer = document.createElement('span');
    sizer.className = 'invisible block whitespace-nowrap';
    sizer.textContent = tickText(geo.ticks[geo.ticks.length - 1]!.value);
    yAxis.append(sizer);
    grid.replaceChildren(...geo.ticks.map((t) => positioned(t.y, 'absolute inset-x-0 border-t border-grid')));
    const [ex, ey] = xy[xy.length - 1]!;
    endDot.style.left = `${ex / 10}%`;
    endDot.style.top = `${ey / 10}%`;
    [xStart.textContent, xEnd.textContent] = axisLabels(view[0]![0], view[view.length - 1]![0], lang, digits);
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.rangeBtn === range));
    if (active >= 0) show(Math.min(active, view.length - 1));
  }

  function show(i: number): void {
    const point = view[i];
    const pos = xy[i];
    if (!point || !pos) return;
    active = i;
    const [x, y] = pos;
    crosshair.style.left = `${x / 10}%`;
    hoverDot.style.left = `${x / 10}%`;
    hoverDot.style.top = `${y / 10}%`;
    const fd = fractionDigits(category, point[1]);
    tipValue.textContent = `${formatNumber(point[1], digits, fd, fd)} ${unit}`;
    tipDate.textContent = formatPointDate(point[0], lang, digits);
    // Keep the tooltip inside the plot: right of the crosshair on the left half, left of it on the right.
    tooltip.style.left = x < 600 ? `calc(${x / 10}% + 10px)` : '';
    tooltip.style.right = x < 600 ? '' : `calc(${(1000 - x) / 10}% + 10px)`;
    crosshair.hidden = hoverDot.hidden = tooltip.hidden = false;
    endDot.hidden = i === view.length - 1;
  }

  function hide(): void {
    active = -1;
    crosshair.hidden = hoverDot.hidden = tooltip.hidden = true;
    endDot.hidden = false;
  }

  function nearest(clientX: number): number {
    const rect = plot!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 1000;
    let best = 0;
    for (let i = 1; i < xy.length; i++) if (Math.abs(xy[i]![0] - x) < Math.abs(xy[best]![0] - x)) best = i;
    return best;
  }

  plot.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => show(view.length - 1));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity };
    const d = step[e.key];
    if (d === undefined) return;
    e.preventDefault();
    show(Math.max(0, Math.min(view.length - 1, (active < 0 ? view.length - 1 : active) + d)));
  });
  for (const b of buttons) {
    b.addEventListener('click', () => {
      range = b.dataset.rangeBtn as Range;
      fig.dataset.range = range;
      hide();
      render();
    });
  }
  document.addEventListener(DIGITS_EVENT, render);
  // Same output as the server render (or the reader's digit choice), and it sets up the hover state.
  render();
}

// ---------- digits toggle ----------

function setupDigitsToggle(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-digits-toggle]')) {
    const sync = () => {
      const next: Digits = digits === 'beng' ? 'latn' : 'beng';
      button.textContent = next === 'latn' ? '123' : '১২৩';
      button.setAttribute('aria-label', button.dataset[next === 'latn' ? 'labelLatn' : 'labelBeng'] ?? '');
    };
    button.addEventListener('click', () => {
      digits = digits === 'beng' ? 'latn' : 'beng';
      try {
        localStorage.setItem(DIGITS_KEY, digits);
      } catch {
        // not persisted; still applies to this page
      }
      root.dataset.digits = digits;
      renderValues();
      document.dispatchEvent(new Event(DIGITS_EVENT));
      sync();
    });
    sync();
  }
}

// ---------- start ----------

root.dataset.digits = digits;
renderValues();
setupDigitsToggle();
for (const fig of document.querySelectorAll<HTMLElement>('[data-chart]')) setupChart(fig);
void refreshStatus();
maybeRefresh();
setInterval(() => {
  renderTimes();
  maybeRefresh();
}, 60_000);
document.addEventListener('visibilitychange', maybeRefresh);

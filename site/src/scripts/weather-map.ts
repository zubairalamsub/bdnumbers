// The weather page's map: metric switch, zoom (buttons, pinch, ctrl/trackpad wheel, tapping
// a division) and pan, and from DISTRICT_SCALE up the 64 district outlines with each district's weather.
// The outlines (scripts/bd-map.mjs) and the API's hourly district snapshot load on the first zoom, so the
// page itself carries only the division map. Labels that would overlap are hidden, nearest the centre of
// the view kept first, so zooming in reveals more of them. Also lays out the 24-hour temperature ranges.
import {
  DISTRICTS,
  DIVISIONS,
  WEATHER_CITIES,
  formatNumber,
  toBengaliDigits,
  weatherCondition,
  type DistrictWeatherResponse,
} from '@bdnumbers/shared';
import { bdProject } from '../lib/bd-map';
import { pageLang, readDigits } from '../lib/prefs';

const MAX_SCALE = 8;
/** From this zoom on, districts are drawn and labelled. */
const DISTRICT_SCALE = 1.6;
const ZOOM_STEP = 1.8;
const ANIMATION_MS = 260;

type View = { x: number; y: number; w: number };
type Rect = { l: number; t: number; r: number; b: number };

const lang = pageLang();
const bn = lang === 'bn';
const T = bn
  ? { district: 'জেলা', division: 'বিভাগ', humidity: 'আর্দ্রতা', wind: 'বাতাস', rain: 'বৃষ্টি (পরের ১ ঘণ্টা)', next24: 'পরের ২৪ ঘণ্টা', kmh: 'কিমি/ঘণ্টা', mm: 'মিমি', source: 'MET Norway-এর পূর্বাভাস', at: 'ঢাকা সময়', stale: 'এই ঘণ্টায় হালনাগাদ হয়নি', none: 'এই জেলার আবহাওয়া এখন পাওয়া যাচ্ছে না।', close: 'বন্ধ করুন' }
  : { district: 'district', division: 'division', humidity: 'Humidity', wind: 'Wind', rain: 'Rain (next hour)', next24: 'Next 24 hours', kmh: 'km/h', mm: 'mm', source: 'MET Norway forecast', at: 'Dhaka time', stale: 'not refreshed this hour', none: 'No weather for this district right now.', close: 'Close' };
const HQ = new Set(WEATHER_CITIES.map((c) => c.id));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A number the site script re-renders when the digits switch flips. */
function num(value: number, fd: number): HTMLSpanElement {
  const span = el('span', '', formatNumber(value, readDigits(lang), fd, fd));
  span.dataset.num = String(value);
  span.dataset.fd = String(fd);
  return span;
}

export function setupWeatherMap(root: HTMLElement): void {
  const frame = root.querySelector<HTMLElement>('[data-map-frame]')!;
  const svg = frame.querySelector<SVGSVGElement>('[data-map-svg]')!;
  const districtLayer = svg.querySelector<SVGGElement>('[data-district-layer]')!;
  const detail = root.querySelector<HTMLElement>('[data-map-detail]')!;
  const controls = frame.querySelector<HTMLElement>('[data-zoom-controls]')!;
  const metricButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-metric-btn]')];
  const unit = root.querySelector<HTMLElement>('[data-metric-unit] span');
  const zoomButtons = Object.fromEntries([...frame.querySelectorAll<HTMLButtonElement>('[data-zoom]')].map((b) => [b.dataset.zoom!, b]));
  const [, , W, H] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
  const api = document.body.dataset.api ?? '';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let view: View = { x: 0, y: 0, w: W };
  let weather: DistrictWeatherResponse | null = null;
  let selected: string | null = null;
  let frameId = 0;
  const scale = () => W / view.w;
  const metric = () => metricButtons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.metricBtn ?? 'temp';

  // ---------- view ----------

  function clamp(v: View): View {
    const w = Math.min(W, Math.max(W / MAX_SCALE, v.w));
    const h = (w * H) / W;
    return { w, x: Math.min(W - w, Math.max(0, v.x)), y: Math.min(H - h, Math.max(0, v.y)) };
  }

  /** Zoom by `factor` keeping the map point (px, py) where it is on screen. */
  function zoomed(from: View, factor: number, px: number, py: number): View {
    const w = Math.min(W, Math.max(W / MAX_SCALE, from.w / factor));
    const k = w / from.w;
    return clamp({ w, x: px - (px - from.x) * k, y: py - (py - from.y) * k });
  }

  function setView(v: View): void {
    view = clamp(v);
    if (!frameId) frameId = requestAnimationFrame(render);
  }

  let animation = 0;
  function animateTo(target: View): void {
    cancelAnimationFrame(animation);
    const to = clamp(target);
    if (reduceMotion) return setView(to);
    const from = { ...view };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATION_MS);
      const e = 1 - (1 - t) ** 3;
      setView({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e });
      if (t < 1) animation = requestAnimationFrame(step);
    };
    animation = requestAnimationFrame(step);
  }

  /** Map units under a client (screen) point. */
  function mapPoint(clientX: number, clientY: number): [number, number] {
    const r = frame.getBoundingClientRect();
    return [view.x + ((clientX - r.left) / r.width) * view.w, view.y + ((clientY - r.top) / r.height) * ((view.w * H) / W)];
  }

  // ---------- drawing ----------

  function render(): void {
    frameId = 0;
    const h = (view.w * H) / W;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${h}`);
    const s = scale();
    const districts = s >= DISTRICT_SCALE;
    frame.toggleAttribute('data-zoomed', s > 1.001);
    frame.toggleAttribute('data-districts', districts);
    if (districts) void loadDistricts();
    for (const node of frame.querySelectorAll<HTMLElement>('[data-x]')) {
      node.style.left = `${((Number(node.dataset.x) - view.x) / view.w) * 100}%`;
      node.style.top = `${((Number(node.dataset.y) - view.y) / h) * 100}%`;
    }
    zoomButtons.in!.disabled = s >= MAX_SCALE - 0.01;
    zoomButtons.out!.disabled = s <= 1.001;
    zoomButtons.reset!.disabled = s <= 1.001;
    layoutLabels(districts);
  }

  /** Hide labels that would overlap one already shown: division cities first, then districts nearest the centre. */
  function layoutLabels(districts: boolean): void {
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const rectOf = (chip: HTMLElement): Rect => {
      const x = (parseFloat(chip.style.left) / 100) * fw;
      const y = (parseFloat(chip.style.top) / 100) * fh;
      const w = chip.offsetWidth;
      const h = chip.offsetHeight;
      switch (chip.dataset.place) {
        case 'left':
          return { l: x - 6 - w, t: y - h / 2, r: x - 6, b: y + h / 2 };
        case 'above':
          return { l: x - w / 2, t: y - 6 - h, r: x + w / 2, b: y - 6 };
        case 'below':
          return { l: x - w / 2, t: y + 6, r: x + w / 2, b: y + 6 + h };
        case 'center':
          return { l: x - w / 2, t: y - h / 2, r: x + w / 2, b: y + h / 2 };
        default:
          return { l: x + 6, t: y - h / 2, r: x + 6 + w, b: y + h / 2 };
      }
    };
    const overlaps = (a: Rect, b: Rect) => a.l < b.r + 2 && b.l < a.r + 2 && a.t < b.b + 2 && b.t < a.b + 2;
    // The zoom buttons' corner is off limits, and a label must fit inside the frame whole.
    const fr = frame.getBoundingClientRect();
    const cr = controls.getBoundingClientRect();
    const reserved: Rect = { l: cr.left - fr.left, t: cr.top - fr.top, r: cr.right - fr.left, b: cr.bottom - fr.top };
    const fits = (r: Rect) => r.l >= 0 && r.t >= 0 && r.r <= fw && r.b <= fh && !overlaps(r, reserved);

    // Read every size first, then write: no layout thrashing.
    const cities = [...frame.querySelectorAll<HTMLElement>('[data-map-city]')].map((chip) => {
      const rect = rectOf(chip);
      return { chip, rect, show: fits(rect) };
    });
    const others = districts
      ? [...frame.querySelectorAll<HTMLElement>('[data-district]')]
          .map((chip) => {
            const rect = rectOf(chip);
            return { chip, rect, show: fits(rect), d: Math.hypot(parseFloat(chip.style.left) - 50, parseFloat(chip.style.top) - 50) };
          })
          .sort((a, b) => a.d - b.d)
      : [];
    const placed = cities.filter((c) => c.show).map((c) => c.rect);
    for (const o of others) {
      o.show = o.show && !placed.some((p) => overlaps(p, o.rect));
      if (o.show) placed.push(o.rect);
    }
    for (const c of cities) {
      c.chip.toggleAttribute('data-collided', !c.show);
      c.chip.parentElement?.querySelector('.map-dot')?.toggleAttribute('data-collided', !c.show);
    }
    for (const o of others) o.chip.toggleAttribute('data-collided', !o.show);
    for (const chip of frame.querySelectorAll<HTMLElement>('[data-district]')) if (!districts) chip.setAttribute('data-collided', '');
  }

  // ---------- districts ----------

  let loading: Promise<void> | null = null;
  function loadDistricts(): Promise<void> {
    loading ??= (async () => {
      frame.setAttribute('aria-busy', 'true');
      const [{ BD_DISTRICTS }] = await Promise.all([import('../lib/bd-districts'), fetchWeather()]);
      for (const { id, d } of BD_DISTRICTS) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'bd-district');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.dataset.districtShape = id;
        districtLayer.append(path);
      }
      const layer = el('div', 'district-chips');
      for (const d of DISTRICTS) {
        if (HQ.has(d.id)) continue;
        const [x, y] = bdProject(d.lat, d.lon);
        const chip = el('button', 'map-chip district');
        chip.type = 'button';
        chip.dataset.district = d.id;
        chip.dataset.place = 'center';
        chip.dataset.x = String(x);
        chip.dataset.y = String(y);
        chip.setAttribute('data-collided', '');
        layer.append(chip);
      }
      frame.querySelector('[data-chips]')!.after(layer);
      fillChips();
      frame.removeAttribute('aria-busy');
      render();
    })();
    return loading;
  }

  async function fetchWeather(): Promise<void> {
    try {
      const res = await fetch(`${api}/api/weather/districts.json`);
      if (res.ok) weather = await res.json();
    } catch {
      // offline or not there yet: districts show their names only
    }
  }

  function fillChips(): void {
    const m = metric();
    for (const chip of frame.querySelectorAll<HTMLElement>('[data-district]')) {
      const d = DISTRICTS.find((x) => x.id === chip.dataset.district)!;
      const w = weather?.districts[d.id];
      const value = el('span', 'block whitespace-nowrap text-xs font-semibold text-ink');
      if (w) {
        const sky = weatherCondition(w.symbol, lang);
        const parts: Array<[string, HTMLElement[]]> = [
          ['temp', [el('span', 'wx-icon', sky?.icon ?? ''), num(w.temp, 1), el('span', '', '°')]],
          ['humidity', [num(w.humidity, 0), el('span', '', '%')]],
          ['rain', [num(w.rain, 1)]],
          ['wind', [num(w.wind, 0)]],
        ];
        for (const [id, nodes] of parts) {
          const span = el('span');
          span.dataset.m = id;
          span.hidden = id !== m;
          span.append(...nodes);
          value.append(span);
        }
      } else value.textContent = '—';
      chip.classList.toggle('opacity-70', !!w?.stale);
      chip.replaceChildren(el('span', 'block text-[0.6875rem] leading-tight text-ink-2', bn ? d.bn : d.en), value);
    }
    if (selected) showDetail(selected);
  }

  function showDetail(id: string): void {
    const d = DISTRICTS.find((x) => x.id === id);
    if (!d) return;
    selected = id;
    for (const p of districtLayer.querySelectorAll<SVGPathElement>('[data-district-shape]')) p.toggleAttribute('data-active', p.dataset.districtShape === id);
    const w = weather?.districts[id];
    const card = el('div', 'rounded-lg border border-hairline p-3 text-sm');
    const head = el('div', 'flex items-start justify-between gap-2');
    const title = el('p', 'font-semibold text-ink', `${bn ? d.bn : d.en} ${T.district}`);
    title.append(el('span', 'font-normal text-muted', ` · ${DIVISIONS[d.division][lang]} ${T.division}`));
    const close = el('button', '-m-1 rounded px-2 text-ink-2 hover:text-ink', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', T.close);
    close.addEventListener('click', hideDetail);
    head.append(title, close);
    card.append(head);
    if (!w) {
      card.append(el('p', 'mt-1 text-ink-2', T.none));
    } else {
      const sky = weatherCondition(w.symbol, lang);
      const now = el('p', 'mt-1 text-ink');
      const words = el('span', 'ml-2 text-ink-2');
      if (sky) words.append(el('span', 'wx-icon', sky.icon), ` ${sky.text}`);
      now.append(el('span', 'text-2xl font-semibold'), words);
      now.firstElementChild!.append(num(w.temp, 1), '°');
      card.append(now);
      const grid = el('dl', 'mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-ink-2');
      const row = (label: string, ...value: Array<Node | string>) => {
        const dd = el('dd', 'text-ink');
        dd.append(...value);
        grid.append(el('dt', '', label), dd);
      };
      row(T.humidity, num(w.humidity, 0), '%');
      row(T.wind, num(w.wind, 0), ` ${T.kmh}`);
      row(T.rain, num(w.rain, 1), ` ${T.mm}`);
      if (w.min24 !== null && w.max24 !== null) row(T.next24, num(w.min24, 0), '°–', num(w.max24, 0), '°');
      card.append(grid);
      const time = w.time.slice(11, 16);
      card.append(el('p', 'mt-2 text-xs text-muted', `${T.source}, ${T.at} ${bn ? toBengaliDigits(time) : time}${w.stale ? ` · ${T.stale}` : ''}`));
    }
    detail.replaceChildren(card);
    detail.hidden = false;
  }

  function hideDetail(): void {
    selected = null;
    detail.hidden = true;
    detail.replaceChildren();
    for (const p of districtLayer.querySelectorAll('[data-active]')) p.removeAttribute('data-active');
  }

  // ---------- input ----------

  let dragged = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { view: View; x: number; y: number; dist: number; mid: [number, number] } | null = null;

  const startGesture = () => {
    const pts = [...pointers.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
    gesture = { view: { ...view }, x, y, dist, mid: mapPoint(x, y) };
  };

  frame.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('[data-zoom]')) return;
    void loadDistricts();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    startGesture();
  });
  frame.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    if (!dragged && Math.hypot(x - gesture.x, y - gesture.y) < 5 && pts.length < 2) return;
    if (pts.length < 2 && scale() <= 1.001) return; // nothing to pan at full view; let the page scroll
    if (!dragged) {
      dragged = true;
      frame.setPointerCapture(e.pointerId);
      frame.setAttribute('data-dragging', '');
    }
    cancelAnimationFrame(animation);
    const r = frame.getBoundingClientRect();
    const g = gesture.view;
    const factor = pts.length > 1 && gesture.dist > 0 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) / gesture.dist : 1;
    const w = Math.min(W, Math.max(W / MAX_SCALE, g.w / factor));
    // Keep the map point that was under the fingers' midpoint under it.
    const fx = (x - r.left) / r.width;
    const fy = (y - r.top) / r.height;
    setView({ w, x: gesture.mid[0] - fx * w, y: gesture.mid[1] - fy * ((w * H) / W) });
  });
  const endPointer = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size > 0) startGesture();
    else {
      gesture = null;
      frame.removeAttribute('data-dragging');
    }
  };
  frame.addEventListener('pointerup', endPointer);
  frame.addEventListener('pointercancel', endPointer);
  // A drag ends with a click on whatever is under the pointer; swallow it.
  frame.addEventListener(
    'click',
    (e) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
        dragged = false;
      }
    },
    true,
  );

  frame.addEventListener(
    'wheel',
    (e) => {
      // Trackpad pinches arrive as ctrl+wheel; a plain wheel keeps scrolling the page.
      if (!e.ctrlKey) return;
      e.preventDefault();
      const [px, py] = mapPoint(e.clientX, e.clientY);
      setView(zoomed(view, Math.exp(-e.deltaY / 200), px, py));
    },
    { passive: false },
  );

  svg.addEventListener('click', (e) => {
    const target = e.target as Element;
    const district = target.closest<SVGPathElement>('[data-district-shape]');
    if (district && scale() >= DISTRICT_SCALE) return showDetail(district.dataset.districtShape!);
    const division = target.closest<SVGPathElement>('[data-division]');
    if (!division || scale() >= DISTRICT_SCALE) return;
    // Zoom to the division with a little room around it.
    void loadDistricts();
    const b = division.getBBox();
    const w = Math.max(b.width * 1.15, b.height * 1.15 * (W / H));
    animateTo({ w, x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - (w * H) / W / 2 });
  });
  frame.addEventListener('click', (e) => {
    const chip = (e.target as Element).closest<HTMLElement>('[data-district]');
    if (chip) showDetail(chip.dataset.district!);
  });

  for (const [kind, button] of Object.entries(zoomButtons)) {
    button.addEventListener('click', () => {
      const cx = view.x + view.w / 2;
      const cy = view.y + (view.w * H) / W / 2;
      if (kind === 'reset') {
        hideDetail();
        return animateTo({ x: 0, y: 0, w: W });
      }
      void loadDistricts();
      animateTo(zoomed(view, kind === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP, cx, cy));
    });
  }

  // Hovering a label highlights its area.
  const highlight = (e: Event, on: boolean) => {
    const chip = (e.target as Element).closest<HTMLElement>('[data-map-city], [data-district]');
    if (!chip) return;
    const area = chip.dataset.mapCity
      ? svg.querySelector(`[data-division="${chip.dataset.mapCity}"]`)
      : svg.querySelector(`[data-district-shape="${chip.dataset.district}"]`);
    if (area && chip.dataset.district !== selected) area.toggleAttribute('data-active', on);
  };
  frame.addEventListener('pointerover', (e) => highlight(e, true));
  frame.addEventListener('pointerout', (e) => highlight(e, false));
  frame.addEventListener('focusin', (e) => highlight(e, true));
  frame.addEventListener('focusout', (e) => highlight(e, false));

  for (const button of metricButtons) {
    button.addEventListener('click', () => {
      const m = button.dataset.metricBtn!;
      for (const b of metricButtons) b.setAttribute('aria-pressed', String(b === button));
      for (const node of root.querySelectorAll<HTMLElement>('[data-m]')) node.hidden = node.dataset.m !== m;
      if (unit) unit.textContent = button.dataset.unit ?? '';
      render(); // label widths changed
    });
  }

  // New numbers (live refresh) and the digits switch change label widths; refresh districts with the page.
  document.addEventListener('bdrate:digits', () => requestAnimationFrame(render));
  document.addEventListener('bdrate:refreshed', async () => {
    if (!loading) return render();
    await fetchWeather();
    fillChips();
    render();
  });
  new ResizeObserver(() => {
    if (!frameId) frameId = requestAnimationFrame(render);
  }).observe(frame);
}

/** Lay the 24-hour temperature ranges out on one scale, warmest first (again after each live refresh). */
export function layoutRanges(list: HTMLElement): void {
  const value = (row: HTMLElement, field: string) => Number(row.querySelector<HTMLElement>(`[data-field="${field}"]`)?.dataset.num);
  const rows = [...list.querySelectorAll<HTMLElement>('[data-range-row]')].map((row) => ({
    row,
    now: value(row, 'value'),
    low: value(row, 'meta.min24'),
    high: value(row, 'meta.max24'),
  }));
  const all = rows.flatMap((r) => [r.now, r.low, r.high]).filter(Number.isFinite);
  if (all.length === 0) return;
  const lo = Math.floor(Math.min(...all)) - 1;
  const hi = Math.ceil(Math.max(...all)) + 1;
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  for (const r of rows) {
    const bar = r.row.querySelector<HTMLElement>('[data-range-bar]');
    const dot = r.row.querySelector<HTMLElement>('[data-range-now]');
    if (bar && Number.isFinite(r.low) && Number.isFinite(r.high)) {
      bar.style.left = `${at(r.low)}%`;
      bar.style.width = `${at(r.high) - at(r.low)}%`;
    }
    if (dot && Number.isFinite(r.now)) dot.style.left = `${at(r.now)}%`;
  }
  rows.sort((a, b) => b.now - a.now).forEach((r) => list.append(r.row));
}

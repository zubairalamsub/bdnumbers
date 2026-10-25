// Light/dark switch. The inline script in Base.astro sets data-theme on <html> before first paint; this
// keeps it in step with the header switch, with the device setting until the reader picks one, with
// other open tabs, and with the browser's theme-color.
import { THEME_COLORS, THEME_KEY, type Theme } from '../lib/prefs';

const root = document.documentElement;
const media = matchMedia('(prefers-color-scheme: dark)');

function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null; // storage blocked: follow the device
  }
}

function apply(theme: Theme): void {
  root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = THEME_COLORS[theme];
  for (const button of document.querySelectorAll('[data-theme-toggle]')) button.setAttribute('aria-pressed', String(theme === 'dark'));
}

const deviceTheme = (): Theme => (media.matches ? 'dark' : 'light');

apply(savedTheme() ?? deviceTheme());
media.addEventListener('change', () => {
  if (!savedTheme()) apply(deviceTheme());
});
window.addEventListener('storage', (e) => {
  if (e.key === THEME_KEY) apply(savedTheme() ?? deviceTheme());
});
for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  button.addEventListener('click', () => {
    const next: Theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked: the switch still works for this page
    }
    apply(next);
  });
}

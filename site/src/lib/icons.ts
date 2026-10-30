// The section icons beside card titles, and which icon and hue each data category uses. Hues are CSS
// tokens (--hue-<name> in global.css), so they switch with the light and dark themes.
import type { Category } from '@bdnumbers/shared';

export const ICON_PATHS = {
  dollar:
    '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5"/><path d="M12 6.5V8m0 8v1.5"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15.2 9.4a6 6 0 1 1-5.8 5.8"/>',
  gold: '<path d="M3.5 20h7.5l-1.6-5H5.1z"/><path d="M13 20h7.5l-1.6-5h-4.3z"/><path d="M8.2 13h7.6L14.2 8H9.8z"/>',
  market: '<path d="M3 5h2.2l2.1 10h10.4L20 8H6.4"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  chart: '<path d="M3.5 3.5v17h17"/><path d="m7.5 14.5 4-4 3 3 5.5-6"/>',
  weather:
    '<path d="M12 2.5v1.5M5.3 5.3l1 1M2.5 12H4M18.7 5.3l-1 1"/><path d="M8.6 10.2a3.5 3.5 0 0 1 6.5-1.6"/><path d="M7.5 20.5h9.5a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.6 1.4 2.8 2.8 0 0 0-.4 5.6z"/>',
  fuel: '<path d="M4.5 21V5a2 2 0 0 1 2-2h5.5a2 2 0 0 1 2 2v16"/><path d="M3 21h12.5"/><path d="M4.5 10h9.5"/><path d="M14 8.5h1.5a2 2 0 0 1 2 2V16a1.5 1.5 0 0 0 3 0V9.5l-3-3"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.6 1.2 2.6 2.5 3 0-3-1-5.5 0-8z"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  calculator: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 6.5h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
  percent: '<circle cx="12" cy="12" r="9"/><path d="m9 15 6-6"/><circle cx="9.3" cy="9.3" r=".9"/><circle cx="14.7" cy="14.7" r=".9"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  arrow: '<path d="m9 6 6 6-6 6"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;
export type Hue = 'fx' | 'gold' | 'silver' | 'market' | 'stock' | 'weather' | 'fuel' | 'phone' | 'calendar' | 'tools' | 'savings';

export const CATEGORY_ICONS: Record<Category, { icon: IconName; hue: Hue }> = {
  fx: { icon: 'dollar', hue: 'fx' },
  gold: { icon: 'gold', hue: 'gold' },
  silver: { icon: 'gold', hue: 'silver' },
  market: { icon: 'market', hue: 'market' },
  stock: { icon: 'chart', hue: 'stock' },
  weather: { icon: 'weather', hue: 'weather' },
  fuel: { icon: 'fuel', hue: 'fuel' },
  lpg: { icon: 'flame', hue: 'fuel' },
  savings: { icon: 'percent', hue: 'savings' },
  holidays: { icon: 'calendar', hue: 'calendar' },
};

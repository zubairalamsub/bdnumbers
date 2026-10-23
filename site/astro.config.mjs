// @ts-check
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
  site: 'https://bdrate.fyi',
  // /dollar-rate-today, not /dollar-rate-today/ (Pages serves dollar-rate-today.html there).
  trailingSlash: 'never',
  build: {
    format: 'file',
    // Inline the (small) Tailwind output into every page: no render-blocking stylesheet request.
    inlineStylesheets: 'always',
  },
  // Astro 7 defaults to 'jsx' whitespace handling, which drops spaces between inline elements.
  compressHTML: true,
  i18n: {
    locales: ['bn', 'en'],
    defaultLocale: 'bn',
    routing: { prefixDefaultLocale: false },
  },
  // Noto Sans Bengali: the clearest Bengali at small sizes (large x-height, unambiguous digits), with
  // matching Latin. Only the two weights the site uses (400 and 600, as static files: smaller than the
  // variable font). Base.astro preloads just the subset a page's language needs.
  // display: optional — the font is used only if it arrives (preloaded) before the first paint, else
  // that page keeps the system font and the next page uses the cached one. No late swap means no layout
  // shift and no delayed LCP; Android, most of the audience, ships Noto Sans Bengali as its system font.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Noto Sans Bengali',
      cssVariable: '--font-bn',
      weights: [400, 600],
      styles: ['normal'],
      subsets: ['bengali', 'latin'],
      display: 'optional',
      fallbacks: ['Noto Sans Bengali', 'sans-serif'],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

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
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Hind Siliguri',
      cssVariable: '--font-hind',
      weights: [400, 600],
      styles: ['normal'],
      subsets: ['bengali', 'latin'],
      fallbacks: ['sans-serif'],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

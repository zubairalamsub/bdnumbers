import type { APIRoute, GetStaticPaths } from 'astro';
import { iconSvg, renderPng } from '../../lib/og';

// App icons for the web manifest and iOS, drawn from the same taka sign as favicon.svg.
const ICONS = {
  'icon-192': { size: 192, rounded: true },
  'icon-512': { size: 512, rounded: true },
  // Maskable: full-bleed, with the sign inside the central 80% safe zone.
  'maskable-512': { size: 512, rounded: false, inset: 0.2 },
  // iOS rounds the corners itself.
  'apple-touch-icon': { size: 180, rounded: false },
} as const;

export const getStaticPaths = (() => Object.keys(ICONS).map((icon) => ({ params: { icon } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const { size, ...opts } = ICONS[params.icon as keyof typeof ICONS];
  return new Response(renderPng(iconSvg(size, opts)), { headers: { 'Content-Type': 'image/png' } });
};

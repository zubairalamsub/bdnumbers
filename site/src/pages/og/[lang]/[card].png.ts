import type { APIRoute, GetStaticPaths } from 'astro';
import type { Lang } from '@bdnumbers/shared';
import { getLatest } from '../../../lib/data';
import { ogSvg, renderPng } from '../../../lib/og';
import { OG_CARDS, ogCard, type OgCardName } from '../../../lib/og-cards';

// Social cards with today's number, rendered at build time: /og/bn/dollar-rate-today.png etc.
export const getStaticPaths = (() =>
  (['bn', 'en'] as const).flatMap((lang) => OG_CARDS.map((card) => ({ params: { lang, card } })))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const latest = await getLatest();
  const card = ogCard(params.card as OgCardName, params.lang as Lang, latest);
  return new Response(renderPng(ogSvg(card)), { headers: { 'Content-Type': 'image/png' } });
};

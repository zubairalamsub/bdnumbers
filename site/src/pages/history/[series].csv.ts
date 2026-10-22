import type { APIRoute, GetStaticPaths } from 'astro';
import { getHistory, getLatest } from '../../lib/data';

export const getStaticPaths = (async () =>
  (await getLatest()).series.map((s) => ({ params: { series: s.key } }))) satisfies GetStaticPaths;

/** /history/<series>.csv: the full history as date,value rows (manual overrides applied). */
export const GET: APIRoute = async ({ params }) => {
  const history = await getHistory(params.series!);
  const lines = ['date,value', ...history.points.map((p) => `${p.date},${p.value}`)];
  return new Response(`${lines.join('\n')}\n`, { headers: { 'content-type': 'text/csv; charset=utf-8' } });
};

import { SERIES } from '@bdnumbers/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { escapeHtml } from '../lib/escape';

/** A tiny form for entering or correcting a value by hand. Posts to /api/ingest with your INGEST_TOKEN. */
export const manual = new Hono<AppEnv>();

/** Its own inline script and style, calls to this origin only, and never inside a frame. */
const MANUAL_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

manual.get('/', (c) =>
  c.html(renderManualPage(), 200, { 'cache-control': 'no-store', 'content-security-policy': MANUAL_CSP, 'x-frame-options': 'DENY' }),
);

function renderManualPage(): string {
  const options = SERIES.map(
    (s) => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.key)} — ${escapeHtml(s.name_en)} (${escapeHtml(s.unit)})</option>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Manual entry</title>
<style>
:root{--bg:#fff;--fg:#16181d;--muted:#5b6170;--line:#d5d8de;--accent:#0b5cad}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#f1f2f4;--muted:#a3a9b6;--line:#3a3f4a;--accent:#7ab7ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:520px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}
p{color:var(--muted);margin:0 0 20px}
label{display:block;font-weight:600;margin:14px 0 4px}
input,select,textarea{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit}
.row{display:flex;gap:8px;align-items:center;margin-top:14px}
.row input{width:auto}
button{margin-top:18px;padding:9px 16px;border:0;border-radius:6px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
pre{white-space:pre-wrap;word-break:break-word;border:1px solid var(--line);border-radius:6px;padding:10px;min-height:2em}
</style>
</head>
<body>
<main>
<h1>Manual entry</h1>
<p>Writes one value through <code>POST /api/ingest</code>. The token stays in this tab only.</p>
<form id="f">
<label for="token">Ingest token</label>
<input id="token" type="password" autocomplete="off" required>
<label for="series">Series</label>
<select id="series" required>${options}</select>
<label for="date">Date (Dhaka)</label>
<input id="date" type="date" required>
<label for="value">Value</label>
<input id="value" type="number" step="any" required>
<label for="note">Note (optional)</label>
<input id="note" type="text" maxlength="200">
<div class="row"><input id="override" type="checkbox"><label for="override" style="margin:0;font-weight:400">Override (correct a wrong fetched value instead of adding a point)</label></div>
<button type="submit">Save</button>
</form>
<label>Result</label>
<pre id="out"></pre>
</main>
<script>
const $ = (id) => document.getElementById(id);
try { $('token').value = sessionStorage.getItem('ingestToken') || ''; } catch {}
$('date').value = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
$('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('token').value.trim();
  try { sessionStorage.setItem('ingestToken', token); } catch {}
  const note = $('note').value.trim();
  const point = { series_key: $('series').value, date: $('date').value, value: Number($('value').value) };
  if (note) point.meta = { note };
  $('out').textContent = 'Saving…';
  try {
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ source: 'manual', override: $('override').checked, points: [point] }),
    });
    $('out').textContent = res.status + ' ' + JSON.stringify(await res.json(), null, 2);
  } catch (err) {
    $('out').textContent = String(err);
  }
});
</script>
</body>
</html>`;
}

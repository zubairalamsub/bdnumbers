// Build-time PNG rendering for Open Graph cards and app icons. Text is shaped with HarfBuzz and drawn as
// glyph outlines, because no SVG renderer available here shapes Bengali correctly on its own (resvg
// misplaces vowel signs and conjunct parts). resvg then only has to rasterise paths.
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as hb from 'harfbuzzjs';

type Weight = 'regular' | 'semibold';

// npm runs the site's scripts from site/, so the fonts are at src/og/fonts.
const FONT_DIR = path.resolve(process.cwd(), 'src/og/fonts');
const FONT_FILES: Record<Weight, string> = { regular: 'HindSiliguri-Regular.ttf', semibold: 'HindSiliguri-SemiBold.ttf' };

let fonts: Record<Weight, { font: hb.Font; upem: number }> | undefined;

function loadFonts() {
  if (fonts) return fonts;
  const load = (file: string) => {
    const face = new hb.Face(new hb.Blob(fs.readFileSync(path.join(FONT_DIR, file))));
    return { font: new hb.Font(face), upem: face.upem };
  };
  fonts = { regular: load(FONT_FILES.regular), semibold: load(FONT_FILES.semibold) };
  return fonts;
}

export interface TextRun {
  /** SVG <path> elements, positioned. */
  svg: string;
  width: number;
}

/**
 * Shape `text` and return its glyph outlines with the baseline starting at (x, y). If the text would be
 * wider than `maxWidth`, it is scaled down to fit.
 */
export function shapeText(
  text: string,
  opts: { x: number; y: number; size: number; weight?: Weight; fill: string; maxWidth?: number; anchor?: 'start' | 'middle' },
): TextRun {
  const { font, upem } = loadFonts()[opts.weight ?? 'regular'];
  const buffer = new hb.Buffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  hb.shape(font, buffer);
  const infos = buffer.getGlyphInfos();
  const positions = buffer.getGlyphPositions();
  const advance = positions.reduce((sum, p) => sum + p.xAdvance, 0);
  let scale = opts.size / upem;
  if (opts.maxWidth && advance * scale > opts.maxWidth) scale = opts.maxWidth / advance;
  const width = advance * scale;
  const left = opts.anchor === 'middle' ? opts.x - width / 2 : opts.x;

  let pen = 0;
  const paths: string[] = [];
  infos.forEach((info, i) => {
    const p = positions[i]!;
    const d = font.glyphToPath(info.codepoint);
    if (d) {
      const gx = left + (pen + p.xOffset) * scale;
      const gy = opts.y - p.yOffset * scale;
      paths.push(`<path transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>`);
    }
    pen += p.xAdvance;
  });
  return { svg: `<g fill="${opts.fill}">${paths.join('')}</g>`, width };
}

export function renderPng(svg: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng());
}

export const BRAND = { green: '#006a4e', greenDark: '#00543e', mint: '#cfeee2', white: '#ffffff' } as const;

/** The taka sign on a green tile: the site's icon. `inset` leaves a safe zone for maskable icons. */
export function iconSvg(size: number, opts: { rounded: boolean; inset?: number }): string {
  const radius = opts.rounded ? size * 0.22 : 0;
  const glyphSize = size * (opts.inset ? 0.72 * (1 - opts.inset) : 0.72);
  const sign = shapeText('৳', { x: size / 2, y: size * 0.5 + glyphSize * 0.36, size: glyphSize, weight: 'semibold', fill: BRAND.white, anchor: 'middle' });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND.green}"/>${sign.svg}</svg>`;
}

export interface OgCard {
  title: string;
  value: string;
  note: string;
  footer: string;
}

/** A 1200×630 social card: site name, page title, the headline number and a note. */
export function ogSvg(card: OgCard): string {
  const W = 1200;
  const H = 630;
  const X = 80;
  const maxWidth = W - 2 * X;
  const tile = 64;
  const brandIcon = shapeText('৳', { x: X + tile / 2, y: 120, size: 44, weight: 'semibold', fill: BRAND.white, anchor: 'middle' });
  const parts = [
    `<rect width="${W}" height="${H}" fill="${BRAND.green}"/>`,
    `<rect y="${H - 96}" width="${W}" height="96" fill="${BRAND.greenDark}"/>`,
    `<rect x="${X}" y="72" width="${tile}" height="${tile}" rx="14" fill="${BRAND.greenDark}"/>`,
    brandIcon.svg,
    shapeText('bdrate.fyi', { x: X + tile + 20, y: 117, size: 38, weight: 'semibold', fill: BRAND.white }).svg,
    shapeText(card.title, { x: X, y: 236, size: 58, weight: 'semibold', fill: BRAND.white, maxWidth }).svg,
    shapeText(card.value, { x: X, y: 390, size: 128, weight: 'semibold', fill: BRAND.white, maxWidth }).svg,
    shapeText(card.note, { x: X, y: 462, size: 38, fill: BRAND.mint, maxWidth }).svg,
    shapeText(card.footer, { x: X, y: H - 36, size: 30, fill: BRAND.mint, maxWidth }).svg,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

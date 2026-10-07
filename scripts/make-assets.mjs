// Renders the app icon, adaptive-icon layers, splash screens and Play Store
// graphics from SVG, in the paper & ink style. Outputs:
//   public/icon.svg, public/icon-192.png, public/icon-512.png      (PWA)
//   assets/*.png                                                    (input for @capacitor/assets)
//   store/icon-512.png, store/feature-graphic.png                   (Play Console)
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = { paper: '#F2EDE4', card: '#FFFCF6', ink: '#121212', signal: '#FF5A1F', lime: '#D7F75B', night: '#121110' };

/** One brutalist key: ink shadow, outlined face, glyph paths. */
function key(x, y, s, fill, glyph, r = s * 0.2) {
  const o = s * 0.09;
  const b = s * 0.07;
  return `
    <rect x="${x + o}" y="${y + o}" width="${s}" height="${s}" rx="${r}" fill="${C.ink}"/>
    <rect x="${x + b / 2}" y="${y + b / 2}" width="${s - b}" height="${s - b}" rx="${r}" fill="${fill}" stroke="${C.ink}" stroke-width="${b}"/>
    <g transform="translate(${x + s / 2} ${y + s / 2})" stroke="${C.ink}" stroke-width="${s * 0.11}" stroke-linecap="round" fill="none">${glyph(s)}</g>`;
}
const plus = (s) => `<path d="M${-s * 0.2} 0H${s * 0.2}M0 ${-s * 0.2}V${s * 0.2}"/>`;
const minus = (s) => `<path d="M${-s * 0.2} 0H${s * 0.2}"/>`;
const times = (s) => `<path d="M${-s * 0.15} ${-s * 0.15}L${s * 0.15} ${s * 0.15}M${s * 0.15} ${-s * 0.15}L${-s * 0.15} ${s * 0.15}"/>`;
const equals = (s) => `<path d="M${-s * 0.2} ${-s * 0.09}H${s * 0.2}M${-s * 0.2} ${s * 0.09}H${s * 0.2}"/>`;

/** 2×2 key grid centred in a box of size `size`, occupying `frac` of it. */
function keys(size, frac) {
  const span = size * frac;
  const gap = span * 0.1;
  const s = (span - gap) / 2;
  const x0 = (size - span) / 2;
  return [
    key(x0, x0, s, C.card, plus),
    key(x0 + s + gap, x0, s, C.card, minus),
    key(x0, x0 + s + gap, s, C.lime, times),
    key(x0 + s + gap, x0 + s + gap, s, C.signal, equals),
  ].join('');
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const iconFull = (n) => svg(n, n, `<rect width="${n}" height="${n}" fill="${C.paper}"/>${keys(n, 0.66)}`);
const iconForeground = (n) => svg(n, n, keys(n, 0.5)); // adaptive icon safe zone is the central 66%
const iconBackground = (n) => svg(n, n, `<rect width="${n}" height="${n}" fill="${C.paper}"/>`);
const splash = (n, bg) => svg(n, n, `<rect width="${n}" height="${n}" fill="${bg}"/>${keys(n, 0.18)}`);

function featureGraphic() {
  const w = 1024;
  const h = 500;
  const k = keys(360, 0.8).replace(/<rect/g, '<rect').toString();
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${C.paper}"/>
     <g transform="translate(620 70)">${k}</g>
     <text x="70" y="215" font-family="Bricolage Grotesque" font-weight="800" font-size="104" letter-spacing="-4" fill="${C.ink}">Cal<tspan font-family="Instrument Serif" font-style="italic" font-weight="400" font-size="116" letter-spacing="0">Sci.</tspan></text>
     <text x="74" y="285" font-family="Bricolage Grotesque" font-weight="600" font-size="34" fill="${C.ink}">Scientific calculator</text>
     <text x="74" y="340" font-family="IBM Plex Mono" font-weight="600" font-size="20" letter-spacing="2" fill="#5E594F">SYMBOLIC · MATRICES · UNITS · FINANCE</text>
     <text x="74" y="372" font-family="IBM Plex Mono" font-weight="600" font-size="20" letter-spacing="2" fill="#5E594F">100% OFFLINE</text>`,
  );
}

const fontCss = ['bricolage-grotesque/800', 'bricolage-grotesque/600', 'ibm-plex-mono/600', 'instrument-serif/400-italic']
  .map((f) => `@import url('file:///${join(root, 'node_modules/@fontsource', `${f}.css`).replace(/\\/g, '/')}');`)
  .join('\n');

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, w, h, out, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  // A real file URL (not setContent) so the local @fontsource files can load.
  const tmp = join(root, 'node_modules', '.calsci-asset.html');
  await writeFile(tmp, `<html><head><style>${fontCss} html,body{margin:0;background:transparent}</style></head><body>${markup}</body></html>`);
  await page.goto(`file:///${tmp.replace(/\\/g, '/')}`);
  await page.evaluate(() => globalThis.document.fonts.ready);
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent });
  console.log(out.replace(root, '.'));
}

await writeFile(join(root, 'public/icon.svg'), iconFull(512));
await render(iconFull(192), 192, 192, join(root, 'public/icon-192.png'));
await render(iconFull(512), 512, 512, join(root, 'public/icon-512.png'));
await render(iconFull(1024), 1024, 1024, join(root, 'assets/icon-only.png'));
await render(iconForeground(1024), 1024, 1024, join(root, 'assets/icon-foreground.png'), true);
await render(iconBackground(1024), 1024, 1024, join(root, 'assets/icon-background.png'));
await render(splash(2732, C.paper), 2732, 2732, join(root, 'assets/splash.png'));
await render(splash(2732, C.night), 2732, 2732, join(root, 'assets/splash-dark.png'));
await render(iconFull(512), 512, 512, join(root, 'store/icon-512.png'));
await render(featureGraphic(), 1024, 500, join(root, 'store/feature-graphic.png'));
await browser.close();

// Original hero art for Beacon Wars: the three hulls in both fleets' paint, and the beacon
// station. Each is an SVG drawn here (our own shapes, no third-party art), rendered to a PNG with
// a transparent background by the Chromium that Playwright drives.
//   node tools/art/hulls.mjs   -> assets/art/*.png   (then: python3 tools/art/build-atlas.py)
// Every sprite faces up (nose to -y), like the rest of the atlas.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'art');

/** Fleet paints: main colour, its shadow, its highlight, and the engine/light glow. */
const PAINT = {
  0: { main: '#2b9fe0', dark: '#145a8c', light: '#93e4ff', glow: '#7ff6ff' },
  1: { main: '#f0861f', dark: '#8c430d', light: '#ffd28a', glow: '#ffd27a' },
  n: { main: '#8e97ab', dark: '#4d5468', light: '#d6dbe6', glow: '#dfe6f5' },
};
const INK = '#141a28';

/** A closed path from the right half of a symmetric outline (x >= 0), mirrored about x = 0. */
function sym(half) {
  const pts = [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])];
  return 'M' + pts.map(([x, y]) => `${x},${y}`).join(' L') + ' Z';
}
/** The same shape on the left and right: a path drawn once at +x and once mirrored. */
const pair = (d, attrs) => `<path d="${d}" ${attrs}/><path d="${d}" transform="scale(-1,1)" ${attrs}/>`;

function defs(p, id) {
  return `<defs>
    <linearGradient id="metal${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9aa3b5"/><stop offset="0.45" stop-color="#eef1f6"/><stop offset="0.55" stop-color="#dfe3ea"/><stop offset="1" stop-color="#7d8698"/>
    </linearGradient>
    <linearGradient id="paint${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${p.dark}"/><stop offset="0.5" stop-color="${p.main}"/><stop offset="1" stop-color="${p.dark}"/>
    </linearGradient>
    <linearGradient id="glass${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bff6ff"/><stop offset="0.35" stop-color="#3a6f9e"/><stop offset="1" stop-color="#16243f"/>
    </linearGradient>
    <radialGradient id="glow${id}"><stop offset="0" stop-color="#ffffff"/><stop offset="0.4" stop-color="${p.glow}"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
  </defs>`;
}
const stroke = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
const line = (d, w = 1.6, o = 0.45) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-opacity="${o}" stroke-linecap="round"/>`;
const nozzle = (x, y, w, id) => `<rect x="${x - w / 2}" y="${y}" width="${w}" height="9" rx="2" fill="#3b4256" ${stroke}/><ellipse cx="${x}" cy="${y + 10}" rx="${w * 0.42}" ry="4" fill="url(#glow${id})"/>`;

/** Dart: a slim arrowhead interceptor with forward canards and one engine. */
function dart(p, id) {
  const body = sym([[0, -92], [10, -60], [16, -18], [44, 30], [52, 56], [30, 54], [16, 66], [0, 70]]);
  const fin = 'M14,-40 L30,-34 L18,-22 Z';
  return `${defs(p, id)}
    ${pair(fin, `fill="url(#paint${id})" ${stroke}`)}
    <path d="${body}" fill="url(#metal${id})" ${stroke}/>
    ${pair('M16,-12 L44,30 L50,52 L30,50 L18,40 Z', `fill="url(#paint${id})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"`)}
    <path d="M0,-80 L6,-60 L6,30 L0,40 L-6,30 L-6,-60 Z" fill="url(#paint${id})" opacity="0.9"/>
    <path d="M0,-50 C9,-44 10,-22 0,-12 C-10,-22 -9,-44 0,-50 Z" fill="url(#glass${id})" ${stroke}/>
    <path d="M-3,-44 C-1,-46 2,-44 3,-38" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.8" stroke-linecap="round"/>
    ${line('M-10,10 L10,10')}${line('M-12,30 L12,30')}${line('M28,36 L42,42')}${line('M-28,36 L-42,42')}
    <circle cx="48" cy="52" r="3" fill="${p.glow}"/><circle cx="-48" cy="52" r="3" fill="${p.glow}"/>
    ${nozzle(0, 64, 18, id)}`;
}

/** Lancer: an all-round fighter with a long lance nose, swept wings, wingtip pods, twin engines. */
function lancer(p, id) {
  const body = sym([[0, -96], [7, -70], [12, -30], [20, -6], [62, 26], [66, 44], [24, 40], [18, 62], [0, 58]]);
  const pod = 'M58,4 L66,4 L68,46 L56,46 Z';
  return `${defs(p, id)}
    <path d="${body}" fill="url(#metal${id})" ${stroke}/>
    ${pair('M20,-2 L60,26 L64,40 L24,36 Z', `fill="url(#paint${id})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"`)}
    ${pair(pod, `fill="url(#metal${id})" ${stroke}`)}
    ${pair('M58,4 L66,4 L66,12 L58,12 Z', `fill="${p.main}"`)}
    <path d="M0,-90 L5,-70 L5,20 L-5,20 L-5,-70 Z" fill="url(#paint${id})"/>
    <path d="M0,-40 C11,-34 12,-6 0,4 C-12,-6 -11,-34 0,-40 Z" fill="url(#glass${id})" ${stroke}/>
    <path d="M-4,-33 C-2,-36 2,-34 4,-27" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.8" stroke-linecap="round"/>
    ${line('M-14,14 L14,14')}${line('M-16,30 L16,30')}${line('M32,20 L44,30')}${line('M-32,20 L-44,30')}
    <rect x="-3" y="-100" width="6" height="12" fill="#5d6680" ${stroke} stroke-width="2"/>
    ${nozzle(12, 54, 14, id)}${nozzle(-12, 54, 14, id)}`;
}

/** Bulwark: a heavy armoured gunship, broad and blocky, with shoulder plates and three engines. */
function bulwark(p, id) {
  const body = sym([[0, -78], [22, -74], [34, -54], [36, -20], [58, -12], [64, 30], [52, 58], [30, 66], [0, 70]]);
  return `${defs(p, id)}
    <path d="${body}" fill="url(#metal${id})" ${stroke}/>
    ${pair('M36,-16 L58,-10 L63,28 L40,24 Z', `fill="url(#paint${id})" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`)}
    ${pair('M8,-70 L22,-68 L30,-52 L12,-48 Z', `fill="url(#paint${id})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"`)}
    <path d="M-22,-30 L22,-30 L26,40 L-26,40 Z" fill="url(#paint${id})" opacity="0.85" ${stroke} stroke-width="2"/>
    <path d="M-12,-46 L12,-46 L14,-26 L-14,-26 Z" fill="url(#glass${id})" ${stroke}/>
    <path d="M-8,-42 L4,-42" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.8" stroke-linecap="round"/>
    ${line('M-26,0 L26,0', 2)}${line('M-26,20 L26,20', 2)}${line('M0,-26 L0,40', 1.6, 0.3)}
    ${pair('M44,36 L56,40', 'fill="none" stroke="#141a28" stroke-width="2" stroke-opacity="0.45"')}
    <circle cx="48" cy="-2" r="3.5" fill="${p.glow}"/><circle cx="-48" cy="-2" r="3.5" fill="${p.glow}"/>
    ${nozzle(0, 64, 18, id)}${nozzle(22, 58, 14, id)}${nozzle(-22, 58, 14, id)}`;
}

/** The beacon station: a hexagonal core in a ring, four panel arms, lights in the holder's colour. */
function station(p, id) {
  const arm = (a) => `<g transform="rotate(${a})">
      <rect x="-5" y="-108" width="10" height="44" fill="#6b7489" ${stroke} stroke-width="2"/>
      <rect x="-26" y="-152" width="52" height="46" rx="3" fill="url(#paint${id})" ${stroke}/>
      ${[-13, 0, 13].map(x => `<line x1="${x}" y1="-150" x2="${x}" y2="-108" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.5"/>`).join('')}
      <line x1="-24" y1="-129" x2="24" y2="-129" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.5"/>
    </g>`;
  const hex = Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3 + Math.PI / 6; return `${(Math.cos(a) * 46).toFixed(1)},${(Math.sin(a) * 46).toFixed(1)}`; }).join(' ');
  const hexIn = Array.from({ length: 6 }, (_, i) => { const a = (i * Math.PI) / 3 + Math.PI / 6; return `${(Math.cos(a) * 26).toFixed(1)},${(Math.sin(a) * 26).toFixed(1)}`; }).join(' ');
  const lights = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4 + Math.PI / 8; return `<circle cx="${(Math.cos(a) * 64).toFixed(1)}" cy="${(Math.sin(a) * 64).toFixed(1)}" r="5" fill="url(#glow${id})"/>`; }).join('');
  return `${defs(p, id)}
    ${[0, 90, 180, 270].map(arm).join('')}
    <circle r="66" fill="none" stroke="${INK}" stroke-width="16"/>
    <circle r="66" fill="none" stroke="url(#metal${id})" stroke-width="11"/>
    ${lights}
    <polygon points="${hex}" fill="url(#metal${id})" ${stroke}/>
    <polygon points="${hexIn}" fill="url(#paint${id})" ${stroke} stroke-width="2"/>
    <circle r="10" fill="url(#glow${id})"/>`;
}

/** Salvage: a drifting cargo pod, white-gold with a violet core, so it reads as neither fleet. */
function salvage() {
  const p = { main: '#e9c46a', dark: '#8a6a22', light: '#fff1c4', glow: '#c9a2ff' }, id = 'sv';
  const body = sym([[0, -40], [22, -30], [30, -8], [30, 10], [22, 32], [0, 40]]);
  return `${defs(p, id)}
    <circle r="46" fill="url(#glow${id})" opacity="0.55"/>
    <path d="${body}" fill="url(#paint${id})" ${stroke}/>
    ${pair('M22,-30 L30,-8 L30,10 L22,32 L16,26 L16,-24 Z', `fill="${p.light}" opacity="0.35"`)}
    <rect x="-30" y="-6" width="60" height="12" rx="2" fill="#3b4256" ${stroke} stroke-width="2"/>
    <circle r="11" fill="#2a1a4a" ${stroke} stroke-width="2"/>
    <circle r="8" fill="url(#glow${id})"/>
    ${line('M-14,-22 L14,-22')}${line('M-14,22 L14,22')}`;
}

const SHIPS = { dart, lancer, bulwark };
const jobs = [];
for (const [name, draw] of Object.entries(SHIPS)) for (const t of [0, 1]) jobs.push({ file: `hull_${name}_${t}`, size: 220, svg: draw(PAINT[t], `${name}${t}`) });
for (const t of [0, 1, 'n']) jobs.push({ file: `station_${t}`, size: 320, svg: station(PAINT[t], `st${t}`) });
jobs.push({ file: 'salvage', size: 100, svg: salvage() });

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(process.env.PAGE_SHOT_BROWSER ? { executablePath: process.env.PAGE_SHOT_BROWSER } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const j of jobs) {
  const h = j.size / 2;
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <svg id="s" xmlns="http://www.w3.org/2000/svg" width="${j.size}" height="${j.size}" viewBox="${-h} ${-h} ${j.size} ${j.size}">${j.svg}</svg></body></html>`);
  await page.locator('#s').screenshot({ path: join(OUT, `${j.file}.png`), omitBackground: true });
}
await browser.close();
console.log(`drew ${jobs.length} sprites into assets/art/`);

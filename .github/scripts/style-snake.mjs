// Memoles SVG keluaran Platane/snk:
//   - ular bertambah panjang satu segmen setiap memakan sel kontribusi
//   - bingkai kartu, glow di kepala, ekor bergradasi, legenda, progress bar membulat
//
//   node .github/scripts/style-snake.mjs <input.svg> <output.svg>
//
// Kalau struktur SVG dari snk suatu saat berubah, skrip ini melewati bagian yang
// tidak dikenali (atau menyalin file aslinya apa adanya) supaya gambar di README
// tidak pernah rusak.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: style-snake.mjs <input.svg> <output.svg>");
  process.exit(1);
}

// ── tampilan ────────────────────────────────────────────────────────────────
const CARD = { from: "#1a1b27", to: "#13141d", border: "#2a2e42", radius: 16 };
const PAD = { side: 24, top: 44, bottom: 20 }; // ruang ekstra di sekeliling grid
const TAIL = ["#fb8b78", "#f7768e", "#d98bc4"]; // 3 segmen bawaan setelah kepala
const HEAD_CORE = "#fff4e6";
const LABEL = { text: "CONTRIBUTIONS", color: "#7aa2f7" };
const MUTED = "#565f89";

// ── pertumbuhan ekor ────────────────────────────────────────────────────────
const GROWTH = {
  enabled: true,
  max: 400, // batas jumlah segmen tambahan
  stepMs: 100, // durasi satu langkah snk (stepDurationMs bawaan action)
  endPause: 1600, // jeda di akhir loop: ekor ditarik masuk / memudar
  fadeMs: 400, // durasi memudar untuk segmen yang belum sempat masuk
  colorTo: "#9d7cd8", // warna ujung ekor yang panjang
  colorSpan: 24, // jumlah segmen untuk transisi warna TAIL[-1] -> colorTo
  sizeFrom: 9.6, // ukuran segmen tambahan pertama (px)
  sizeTo: 7, // ukuran minimum segmen
  sizeDrop: 0.12, // pengecilan per segmen
};

const source = readFileSync(input, "utf8");
mkdirSync(dirname(output), { recursive: true });

const fallback = (reason) => {
  console.warn(`style-snake: ${reason}; menyalin SVG asli tanpa perubahan.`);
  writeFileSync(output, source);
  process.exit(0);
};

const head = source.match(/^<svg viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"[^>]*>/);
if (!head) fallback("tag <svg> tidak dikenali");
if (!/<style>[\s\S]*<\/style>/.test(source)) fallback("blok <style> tidak ditemukan");
if (!source.includes('<rect class="s s0"')) fallback("segmen ular tidak ditemukan");

const [vx, vy, vw, vh] = head.slice(1).map(Number);

// Grid snk mulai di (0,0); viewBox aslinya menyisakan tepat satu sel di kiri.
const cell = -vx;
const gridW = vw - 2 * cell;

let svg = source;

// ── 1. ekor yang tumbuh ─────────────────────────────────────────────────────
//
// Di snk, segmen ke-i selalu berada di posisi kepala i langkah sebelumnya.
// Jadi segmen tambahan ke-j cukup memakai animasi kepala (s0) dengan jeda
// j langkah, lalu muncul saat sel ke-(j-3) dimakan.
const grown = GROWTH.enabled ? growTail(svg) : null;
if (grown) svg = grown.svg;
else if (GROWTH.enabled) console.warn("style-snake: pola animasi snk tidak dikenali; ekor tidak ditumbuhkan.");

function growTail(svg) {
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  const step = GROWTH.stepMs;

  const T = Number(style.match(/\.s\{[^}]*?(\d+)ms/)?.[1]);
  if (!T || T % step !== 0) return null;

  // waktu (ms) saat tiap sel berubah jadi kosong = saat dimakan
  const eats = [...style.matchAll(/@keyframes c\w+\{[\d.]+%\{[^}]*\}([\d.]+)%,100%\{/g)]
    .map((m) => (Number(m[1]) * T) / 100)
    .sort((a, b) => a - b)
    .slice(0, GROWTH.max);
  if (!eats.length) return null;

  // saat kepala berhenti di posisi istirahat (keyframe terakhir sebelum 100%)
  const headFrames = style.match(/@keyframes s0\{(.*?)\}\}/)?.[1];
  if (!headFrames) return null;
  const headPercents = [...headFrames.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1])).filter((p) => p < 100);
  const headStop = (Math.max(...headPercents) * T) / 100;

  // perpanjang loop tanpa menggeser waktu absolut animasi snk yang ada
  const total = T + GROWTH.endPause;
  const fmt = (n) => String(Number(n.toFixed(3)));
  const pct = (ms) => fmt((ms / total) * 100);

  const rescaled = style
    .replace(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})*\}/g, (kf) =>
      kf.replace(/([\d.]+)%/g, (m, p) => {
        const v = Number(p);
        return v === 0 || v === 100 ? m : `${fmt((v * T) / total)}%`;
      }),
    )
    .replaceAll(`${T}ms`, `${total}ms`);

  const fadeStart = total - GROWTH.fadeMs;
  const keyframes = [];
  const rects = [];

  eats.forEach((eatAt, k) => {
    const j = 4 + k; // indeks segmen (0 = kepala, 1..3 = bawaan snk)
    const lag = j * step;

    // segmen masuk ke bawah kepala begitu kepala berhenti; sembunyikan saat itu.
    // yang belum sempat masuk dibiarkan memudar di akhir loop.
    const arrive = headStop + lag;
    const visible = `${pct(eatAt)}%{opacity:0}${pct(eatAt + step)}%`;
    keyframes.push(
      arrive < fadeStart
        ? `@keyframes g${k}{0%,${visible},${pct(arrive)}%{opacity:1}${pct(arrive + 1)}%,100%{opacity:0}}`
        : `@keyframes g${k}{0%,${visible},${pct(fadeStart)}%{opacity:1}100%{opacity:0}}`,
    );

    const size = Math.max(GROWTH.sizeTo, GROWTH.sizeFrom - k * GROWTH.sizeDrop);
    const offset = (cell - size) / 2;
    const color = mix(TAIL[TAIL.length - 1], GROWTH.colorTo, Math.min(1, (k + 1) / GROWTH.colorSpan));
    rects.push(
      `<rect class="s g" x="${fmt(offset)}" y="${fmt(offset)}" width="${fmt(size)}" height="${fmt(size)}" rx="${fmt(size / 3)}"` +
        ` style="fill:${color};animation:s0 ${total}ms linear ${lag - total}ms infinite,g${k} ${total}ms linear infinite"/>`,
    );
  });

  // segmen terjauh digambar lebih dulu supaya segmen dekat kepala ada di atas
  rects.reverse();

  const css = `.g{opacity:0}` + keyframes.join("");
  const out = svg
    .replace(style, () => rescaled + css)
    .replace('<rect class="s s0"', () => rects.join("") + '<rect class="s s0"');

  console.log(`style-snake: ekor tumbuh hingga ${3 + eats.length} segmen (+${eats.length}), loop ${total}ms`);
  return { svg: out };
}

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// ── 2. tampilan kartu ───────────────────────────────────────────────────────
const x = vx - PAD.side;
const y = vy - PAD.top;
const w = vw + 2 * PAD.side;
const h = vh + PAD.top + PAD.bottom;

// glow hanya di kepala: filter pada ratusan segmen yang beranimasi terlalu berat
const css = `
.s.s0{filter:drop-shadow(0 0 3px var(--cs)) drop-shadow(0 0 9px var(--cs))}
${TAIL.map((color, i) => `.s.s${i + 1}{fill:${color}}`).join("")}
.s.core{fill:${HEAD_CORE};filter:none}
.lbl{font:600 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:3px;fill:${LABEL.color}}
.lgd{font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:${MUTED}}
`.replace(/\n/g, "");

const defs = `<defs>
<linearGradient id="snk-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CARD.from}"/><stop offset="1" stop-color="${CARD.to}"/></linearGradient>
<radialGradient id="snk-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#7aa2f7" stop-opacity="0.16"/><stop offset="1" stop-color="#7aa2f7" stop-opacity="0"/></radialGradient>
<clipPath id="snk-card"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${CARD.radius}"/></clipPath>
<clipPath id="snk-bar"><rect x="0" y="BAR_Y" width="${gridW}" height="BAR_H" rx="6"/></clipPath>
</defs>`.replace(/\n/g, "");

const labelY = vy - 16;
const legendCells = [0, 1, 2, 3, 4]
  .map((level, i) => `<rect x="${gridW - 105 + i * 15}" y="${labelY - 10}" width="11" height="11" rx="2.5" fill="var(--c${level})"/>`)
  .join("");

const backdrop =
  `<g clip-path="url(#snk-card)">` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#snk-bg)"/>` +
  `<circle cx="${x + w * 0.78}" cy="${y + h * 0.2}" r="${h * 1.1}" fill="url(#snk-glow)"/>` +
  `</g>` +
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${h - 1}" rx="${CARD.radius - 0.5}" fill="none" stroke="${CARD.border}"/>` +
  `<text class="lbl" x="2" y="${labelY}">${LABEL.text}</text>` +
  `<text class="lgd" x="${gridW - 111}" y="${labelY}" text-anchor="end">less</text>` +
  legendCells +
  `<text class="lgd" x="${gridW - 2}" y="${labelY}" text-anchor="end">more</text>`;

// kanvas lebih besar supaya muat bingkai kartu
svg = svg.replace(head[0], `<svg viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`);

// progress bar: beri track + sudut membulat
let barY = 0;
let barH = 12;
svg = svg.replace(/(?:<rect class="u [^>]*\/>)+/, (bars) => {
  barY = Number(bars.match(/ y="(-?[\d.]+)"/)?.[1] ?? 0);
  barH = Number(bars.match(/ height="([\d.]+)"/)?.[1] ?? 12);
  return (
    `<g clip-path="url(#snk-bar)">` +
    `<rect x="0" y="${barY}" width="${gridW}" height="${barH}" fill="var(--ce)"/>` +
    bars +
    `</g>`
  );
});

// gaya tambahan + latar kartu (digambar sebelum grid)
svg = svg.replace(
  "</style>",
  css + "</style>" + defs.replace("BAR_Y", barY).replace("BAR_H", barH) + backdrop,
);

// inti terang di kepala; kelas "s s0" membuatnya ikut animasi kepala
svg = svg.replace(/<\/svg>\s*$/, `<circle class="s s0 core" cx="${cell / 2}" cy="${cell / 2}" r="2.4"/></svg>`);

writeFileSync(output, svg);
console.log(`style-snake: ${output} (${w}x${h})`);

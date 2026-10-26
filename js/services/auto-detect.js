/**
 * Kerangka Deteksi Otomatis Field LKPD (Tahap 1)
 *
 * Tahap 1 menyediakan kerangka:
 *  - render halaman PDF ke canvas offscreen beresolusi tinggi,
 *  - registry detektor (plug-in),
 *  - normalisasi hasil ke format peta_field_json (persen 0-100).
 *
 * Detektor terpasang:
 *  - Tahap 2: 'dotted-lines' (garis titik-titik dan garis isian abu-abu), lihat detectors/dotted-lines.js
 *  - Tahap 3: 'table-cells' (sel tabel kosong dan kotak jawaban), lihat detectors/table-cells.js
 *  - Tahap 5: gabung garis bertumpuk jadi textarea, buang tumpang tindih, lihat detectors/merger.js
 *  - Tahap 4: pelabelan via OCR (opts.ocr = worker dari createLabelWorker), lihat detectors/labeler.js
 *
 * Kontrak detektor:
 *   async (ctx) => Array<{ x, y, w, h, type?, label? }>
 *   ctx = { pageNum, width, height, canvas, getImageData() }
 *   x, y, w, h dalam PERSEN halaman (0-100), sama seperti peta_field_json.
 */

import { dottedLinesDetector, detectDottedLines } from './detectors/dotted-lines.js';
import { tableCellsDetector } from './detectors/table-cells.js';
import { assignLabels } from './detectors/labeler.js';
import { mergeFields } from './detectors/merger.js';
import { recognizeWords } from './ocr-labels.js';

const DEBUG_KEY = 'ELKPD_DEBUG_DETECT';
const detectors = [];

export function registerDetector(name, fn) {
  if (typeof fn !== 'function') throw new Error('Detektor harus berupa fungsi.');
  const idx = detectors.findIndex((d) => d.name === name);
  if (idx >= 0) detectors[idx] = { name, fn };
  else detectors.push({ name, fn });
}

function isDebugOn() {
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch (e) {
    return false;
  }
}

registerDetector('dotted-lines', dottedLinesDetector);
registerDetector('table-cells', tableCellsDetector); // harus setelah dotted-lines: memakai garis titik untuk membersihkan isi sel

// Detektor uji: satu kotak per halaman. Aktif bila localStorage.ELKPD_DEBUG_DETECT = '1'.
// Dipakai untuk memastikan alur render -> deteksi -> gabung -> tampil sudah benar.
const debugDetector = {
  name: 'debug-sample',
  fn: async () => [{ x: 10, y: 10, w: 30, h: 4, type: 'text', label: 'Debug' }]
};

export function getDetectorCount() {
  return detectors.length + (isDebugOn() ? 1 : 0);
}

export async function renderPageToCanvas(pdfDoc, pageNum, scale = 2) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas'); // offscreen, tidak dipasang ke DOM
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export function normalizeDetections(rawList) {
  const out = [];
  (rawList || []).forEach((r) => {
    if (!r) return;
    const x = Number(r.x);
    const y = Number(r.y);
    const w = Number(r.w);
    const h = Number(r.h);
    if (![x, y, w, h].every(Number.isFinite)) return;

    const nx = clamp(x, 0, 100);
    const ny = clamp(y, 0, 100);
    const nw = clamp(w, 0, 100 - nx);
    const nh = clamp(h, 0, 100 - ny);
    if (nw < 1 || nh < 0.8) return;

    const item = {
      x: nx,
      y: ny,
      w: nw,
      h: nh,
      type: r.type === 'textarea' ? 'textarea' : 'text',
      label: r.label ? String(r.label).trim() : ''
    };
    if (r.source) item.source = String(r.source); // dipakai Tahap 4-5
    if (r.grid) item.grid = r.grid; // { table, row, col } untuk pelabelan tabel
    out.push(item);
  });
  return out;
}

// Garis titik yang jatuh di dalam sel/kotak terdeteksi tidak perlu jadi kotak sendiri:
// sel yang lebih besar sudah menjadi area menulis. (Penggabungan menyeluruh: Tahap 5.)
export function dropLinesInsideCells(list) {
  const cells = list.filter((f) => f.source === 'table-cell');
  if (!cells.length) return list;
  return list.filter((f) => {
    if (f.source !== 'dotted-line') return true;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    return !cells.some((c) => cx >= c.x && cx <= c.x + c.w && cy >= c.y && cy <= c.y + c.h);
  });
}

export async function detectPage(pdfDoc, pageNum, opts = {}) {
  const list = [...detectors];
  if (isDebugOn()) list.push(debugDetector);
  if (list.length === 0) return [];

  const canvas = await renderPageToCanvas(pdfDoc, pageNum, opts.scale || 2);
  try {
    let imageData = null;
    let dottedLines = null;
    const ctx = {
      pageNum,
      width: canvas.width,
      height: canvas.height,
      canvas,
      // Dimemoisasi: beberapa detektor memakai data piksel dan garis titik yang sama.
      getImageData: () => imageData || (imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)),
      getDottedLines: () => dottedLines || (dottedLines = detectDottedLines(ctx.getImageData()))
    };

    let all = [];
    for (const d of list) {
      try {
        const res = await d.fn(ctx);
        if (Array.isArray(res)) all = all.concat(res);
      } catch (err) {
        console.warn(`[auto-detect] detektor "${d.name}" gagal di halaman ${pageNum}:`, err);
      }
    }
    let result = dropLinesInsideCells(normalizeDetections(all));
    if (opts.ocr && result.length) {
      try {
        const words = await recognizeWords(opts.ocr, canvas);
        result = assignLabels(result, words, canvas.width, canvas.height);
      } catch (err) {
        console.warn(`[auto-detect] OCR label gagal di halaman ${pageNum}:`, err);
      }
    }
    return mergeFields(result, canvas.width, canvas.height); // Tahap 5: gabung garis, buang tumpang tindih
  } finally {
    releaseCanvas(canvas);
  }
}

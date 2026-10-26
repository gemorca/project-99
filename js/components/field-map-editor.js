import { setButtonLoading, showToast } from './modal.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { fetchPdfArrayBuffer } from '../services/ocr.js';
import { detectPage, getDetectorCount } from '../services/auto-detect.js';
import { createLabelWorker } from '../services/ocr-labels.js';
import { state, uiState } from '../state.js';

const MIN_W_PCT = 2;
const MIN_H_PCT = 1.2;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;
const SAVED_RENDER_SCALE = 1.4;

const isCoarse = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

let renderToken = 0;
let renderQueue = Promise.resolve();
let currentRenderTask = null;
let activeOp = null;
let keyListenerAttached = false;

function pageFields(page = uiState.currentPageGuru) {
  if (!uiState.fieldsByPageGuru[page]) uiState.fieldsByPageGuru[page] = [];
  return uiState.fieldsByPageGuru[page];
}

function findField(id, page = uiState.currentPageGuru) {
  return pageFields(page).find((f) => f.id === id) || null;
}

function allFields() {
  const out = [];
  Object.values(uiState.fieldsByPageGuru).forEach((arr) => {
    if (Array.isArray(arr)) out.push(...arr);
  });
  return out;
}

function markDirty() {
  uiState.dirtyGuru = true;
}

function ensureUiDefaults() {
  if (uiState.selectedFieldGuru === undefined) uiState.selectedFieldGuru = null;
  if (uiState.zoomGuru === undefined) uiState.zoomGuru = 1;
  if (uiState.modeGuru === undefined) uiState.modeGuru = 'draw';
  if (uiState.dirtyGuru === undefined) uiState.dirtyGuru = false;
  if (uiState.autoDetectRunningGuru === undefined) uiState.autoDetectRunningGuru = false;
  if (uiState.autoDetectCancelGuru === undefined) uiState.autoDetectCancelGuru = false;
}

function buildModal() {
  const modal = document.createElement('div');
  modal.id = 'lkpd-field-map-modal';
  modal.className = 'fixed inset-0 bg-slate-950/80 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-6xl h-full sm:h-[92vh] sm:rounded-3xl p-3 sm:p-5 flex flex-col gap-2 shadow-2xl border overflow-hidden">
      <div class="flex items-center justify-between gap-2 border-b pb-2">
        <div class="min-w-0">
          <span class="text-[10px] font-mono font-bold uppercase bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full">Editor Field Mapping PDF</span>
          <h3 id="field-map-modal-title" class="font-black text-brand-navy text-xs sm:text-sm font-heading mt-0.5 truncate">Pemetaan Area Isian LKPD</h3>
        </div>
        <button onclick="closeModalPetakanFieldGuru()" class="shrink-0 px-3 py-2 bg-red-600 text-white text-xs font-bold rounded-xl">Tutup ✖</button>
      </div>

      <div class="flex flex-wrap items-center gap-2 bg-slate-100 p-2 rounded-2xl text-xs">
        <div class="flex items-center gap-1">
          <button onclick="changeGuruPage(-1)" class="px-3 py-2 bg-white border font-bold rounded-xl hover:bg-slate-200 transition">◀</button>
          <span id="guru-pdf-page-num" class="font-bold text-slate-700 px-1 whitespace-nowrap">Halaman 1 / 1</span>
          <button onclick="changeGuruPage(1)" class="px-3 py-2 bg-white border font-bold rounded-xl hover:bg-slate-200 transition">▶</button>
        </div>
        <div class="flex items-center gap-1">
          <button onclick="zoomGuru(-0.25)" class="px-3 py-2 bg-white border font-bold rounded-xl hover:bg-slate-200 transition" aria-label="Perkecil">−</button>
          <button onclick="zoomGuruFit()" id="guru-zoom-text" class="px-2 py-2 bg-white border font-bold rounded-xl hover:bg-slate-200 transition min-w-[3.25rem]" title="Klik untuk pas layar">100%</button>
          <button onclick="zoomGuru(0.25)" class="px-3 py-2 bg-white border font-bold rounded-xl hover:bg-slate-200 transition" aria-label="Perbesar">+</button>
        </div>
        <button id="guru-mode-btn" onclick="toggleGuruMode()" class="px-3 py-2 font-black rounded-xl border transition"></button>
        <div class="flex-1"></div>
        <button id="btn-save-field-map-guru" class="px-4 py-2 bg-brand-blue text-white font-black rounded-xl shadow hover:bg-blue-700 transition">💾 Simpan Peta Field</button>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <button id="btn-autodetect-guru" onclick="runAutoDetectGuru()" class="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow transition">🪄 Deteksi Otomatis</button>
        <button id="btn-accept-auto-guru" onclick="acceptAllAutoGuru()" class="hidden px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition">✅ Terima Semua Draf</button>
        <button id="btn-accept-page-auto-guru" onclick="acceptPageAutoGuru()" class="hidden px-3 py-2 bg-white border border-emerald-600 text-emerald-700 font-bold rounded-xl transition">✔ Terima Halaman Ini</button>
        <button id="btn-clear-auto-guru" onclick="clearAutoGuru()" class="hidden px-3 py-2 bg-white border border-amber-500 text-amber-700 font-bold rounded-xl transition">🗑️ Hapus Draf Auto</button>
        <div id="guru-selection-bar" class="hidden items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-2 py-1">
          <span class="text-[11px] font-bold text-blue-900 max-w-[9rem] truncate">Terpilih: <span id="guru-sel-label"></span></span>
          <button id="btn-accept-sel-guru" onclick="acceptGuruField()" class="hidden px-2 py-1.5 bg-emerald-600 text-white font-bold rounded-lg">✔ Terima</button>
          <button onclick="duplicateGuruField()" class="px-2 py-1.5 bg-white border font-bold rounded-lg">⧉ Duplikat</button>
          <button onclick="deleteGuruField()" class="px-2 py-1.5 bg-white border border-red-300 text-red-600 font-bold rounded-lg">🗑 Hapus</button>
        </div>
      </div>

      <div id="guru-autodetect-progress" class="hidden">
        <div class="h-2 bg-slate-200 rounded-full overflow-hidden"><div id="guru-autodetect-bar" class="h-full bg-amber-500 transition-all" style="width:0%"></div></div>
        <p id="guru-autodetect-text" class="text-[11px] text-slate-600 mt-1"></p>
      </div>

      <p id="guru-tip" class="text-[10px] sm:text-[11px] text-slate-500 font-medium leading-snug"></p>

      <div class="flex-1 min-h-0 flex flex-col md:flex-row gap-2">
        <div id="guru-editor-container" class="flex-1 min-h-0 min-w-0 bg-slate-200 rounded-2xl p-2 sm:p-4 overflow-auto border" style="-webkit-overflow-scrolling:touch; overscroll-behavior:contain;"></div>
        <div class="md:w-64 bg-slate-50 border rounded-2xl p-2 flex flex-col text-xs shrink-0 md:overflow-y-auto">
          <div class="flex items-center justify-between gap-2">
            <h4 class="font-black text-brand-navy">Field Halaman Ini <span id="guru-field-count" class="font-mono text-slate-400"></span></h4>
            <button id="guru-panel-toggle" onclick="toggleGuruFieldPanel()" class="md:hidden px-2 py-1 border rounded-lg font-bold bg-white">Sembunyikan ▾</button>
          </div>
          <div id="guru-field-list-wrap" class="mt-1 max-h-[26vh] md:max-h-none overflow-y-auto md:!block">
            <div id="guru-field-list" class="space-y-2"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  if (!keyListenerAttached) {
    document.addEventListener('keydown', onGuruKeyDown);
    keyListenerAttached = true;
  }
  return modal;
}

export function openModalPetakanFieldGuru(idLkpd) {
  ensureUiDefaults();
  const lkpdObj = (state.cachedData.lkpd || []).find((l) => String(l.id_lkpd) === String(idLkpd));
  if (!lkpdObj) {
    showToast('error', 'Data LKPD tidak ditemukan!');
    return;
  }
  if (!lkpdObj.file_pdf_url) {
    Swal.fire({
      icon: 'warning',
      title: 'PDF Belum Diunggah',
      text: 'Unggah berkas PDF LKPD terlebih dahulu melalui tombol Edit LKPD sebelum memetakan area isian.'
    });
    return;
  }

  let modal = document.getElementById('lkpd-field-map-modal');
  if (!modal) modal = buildModal();

  document.getElementById('field-map-modal-title').textContent = `Pemetaan Area Isian: ${lkpdObj.judul_lkpd}`;
  document.getElementById('btn-save-field-map-guru').onclick = async () => {
    const btn = document.getElementById('btn-save-field-map-guru');
    setButtonLoading(btn, true, 'Menyimpan...', '💾 Simpan Peta Field');
    await saveFieldMapGuru(lkpdObj.id_lkpd);
    setButtonLoading(btn, false, '', '💾 Simpan Peta Field');
    await fetchAllInitialData(true);
  };

  uiState.modeGuru = isCoarse() ? 'pan' : 'draw';
  uiState.zoomGuru = 1;
  uiState.selectedFieldGuru = null;
  uiState.dirtyGuru = false;
  uiState.autoDetectRunningGuru = false;
  uiState.autoDetectCancelGuru = false;
  activeOp = null;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  updateModeUI();
  updateTipText();
  hideAutoProgress();

  const container = document.getElementById('guru-editor-container');
  openFieldMapEditorGuru(container, lkpdObj.file_pdf_url, lkpdObj.peta_field_json, lkpdObj.file_drive_id);
}

export function closeModalPetakanFieldGuru(force = false) {
  const modal = document.getElementById('lkpd-field-map-modal');
  if (!modal) return;

  if (force !== true && uiState.dirtyGuru) {
    Swal.fire({
      icon: 'warning',
      title: 'Perubahan belum disimpan',
      text: 'Tutup editor tanpa menyimpan peta field?',
      showCancelButton: true,
      confirmButtonText: 'Ya, tutup',
      cancelButtonText: 'Kembali'
    }).then((r) => {
      if (r.isConfirmed) closeModalPetakanFieldGuru(true);
    });
    return;
  }

  uiState.autoDetectCancelGuru = true;
  activeOp = null;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export async function openFieldMapEditorGuru(containerEl, pdfUrl, existingFieldMapJson, fileDriveId = null) {
  ensureUiDefaults();
  try {
    uiState.fieldsByPageGuru = existingFieldMapJson ? JSON.parse(existingFieldMapJson).fields || {} : {};
  } catch (e) {
    uiState.fieldsByPageGuru = {};
  }

  let maxNum = 0;
  Object.values(uiState.fieldsByPageGuru).forEach((arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((f) => {
        if (f.id) {
          const match = String(f.id).match(/(\d+)/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
        }
      });
    }
  });
  uiState.fieldCounterGuru = maxNum + 1;
  uiState.currentPageGuru = 1;
  uiState.selectedFieldGuru = null;
  uiState.zoomGuru = 1;

  containerEl.innerHTML = `<div class="p-8 text-slate-500 font-bold text-xs text-center">Memuat PDF untuk pemetaan...</div>`;

  try {
    const arrayBuffer = await fetchPdfArrayBuffer(pdfUrl, fileDriveId);
    uiState.currentPdfDocGuru = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    uiState.totalPagesGuru = uiState.currentPdfDocGuru.numPages;

    const firstPage = await uiState.currentPdfDocGuru.getPage(1);
    const natural = firstPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(containerEl.clientWidth - (isCoarse() ? 16 : 32), 240);
    uiState.renderScaleGuru = clamp(availableWidth / natural.width, 0.3, 2.5);

    containerEl.innerHTML = `
      <div id="guru-page-wrap" style="position:relative; margin:0 auto;">
        <canvas id="guru-pdf-canvas" style="display:block; background:#fff; border-radius:8px; box-shadow:0 4px 14px rgba(0,0,0,.18);"></canvas>
        <div id="guru-overlay" style="position:absolute; top:0; left:0; right:0; bottom:0; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;"></div>
      </div>
    `;

    attachGuruPointerHandlers();
    updateModeUI();
    await renderGuruPage();
  } catch (err) {
    console.error('Error loading PDF:', err);
    containerEl.innerHTML = `
      <div class="p-8 text-red-500 font-bold text-xs text-center space-y-2">
        <p>⚠️ Gagal memuat PDF untuk pemetaan.</p>
        <p class="font-mono text-[10px] text-slate-500">${esc(err.message)}</p>
        <p class="text-[11px] text-slate-600 font-normal">Pastikan hak akses berkas PDF di Google Drive sudah diatur ke <b>"Siapa saja yang memiliki link" (Public)</b>.</p>
      </div>
    `;
  }
}

export function renderGuruPage() {
  if (!uiState.currentPdfDocGuru) return Promise.resolve();
  const myToken = ++renderToken;
  if (currentRenderTask) {
    try {
      currentRenderTask.cancel();
    } catch (e) {}
  }

  const run = async () => {
    if (myToken !== renderToken) return;
    const pdf = uiState.currentPdfDocGuru;
    const canvas = document.getElementById('guru-pdf-canvas');
    const wrap = document.getElementById('guru-page-wrap');
    if (!pdf || !canvas || !wrap) return;

    const page = await pdf.getPage(uiState.currentPageGuru);
    if (myToken !== renderToken) return;

    const scale = uiState.renderScaleGuru * uiState.zoomGuru;
    const viewport = page.getViewport({ scale });

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    while (dpr > 1 && viewport.width * viewport.height * dpr * dpr > 16e6) dpr -= 0.25;

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    wrap.style.width = viewport.width + 'px';
    wrap.style.height = viewport.height + 'px';

    const task = page.render({
      canvasContext: canvas.getContext('2d'),
      viewport: page.getViewport({ scale: scale * dpr })
    });
    currentRenderTask = task;
    try {
      await task.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    } finally {
      if (currentRenderTask === task) currentRenderTask = null;
    }

    const pageNumElem = document.getElementById('guru-pdf-page-num');
    if (pageNumElem) pageNumElem.textContent = `Halaman ${uiState.currentPageGuru} / ${uiState.totalPagesGuru}`;
    const zoomElem = document.getElementById('guru-zoom-text');
    if (zoomElem) zoomElem.textContent = Math.round(uiState.zoomGuru * 100) + '%';

    pageFields();
    redrawGuruFieldBoxes();
  };

  renderQueue = renderQueue.catch(() => {}).then(run);
  return renderQueue;
}

export function changeGuruPage(delta) {
  const next = uiState.currentPageGuru + delta;
  if (next < 1 || next > uiState.totalPagesGuru) return;
  uiState.currentPageGuru = next;
  uiState.selectedFieldGuru = null;
  const container = document.getElementById('guru-editor-container');
  if (container) container.scrollTop = 0;
  renderGuruPage();
}

async function applyZoom(newZoom) {
  const container = document.getElementById('guru-editor-container');
  const z = Math.round(clamp(newZoom, ZOOM_MIN, ZOOM_MAX) * 100) / 100;
  if (z === uiState.zoomGuru) return;

  let rx = 0.5;
  let ry = 0;
  if (container && container.scrollWidth > 0 && container.scrollHeight > 0) {
    rx = (container.scrollLeft + container.clientWidth / 2) / container.scrollWidth;
    ry = (container.scrollTop + container.clientHeight / 2) / container.scrollHeight;
  }

  uiState.zoomGuru = z;
  await renderGuruPage();

  if (container) {
    container.scrollLeft = Math.max(rx * container.scrollWidth - container.clientWidth / 2, 0);
    container.scrollTop = Math.max(ry * container.scrollHeight - container.clientHeight / 2, 0);
  }
}

export function zoomGuru(delta) {
  return applyZoom(uiState.zoomGuru + delta);
}

export function zoomGuruFit() {
  return applyZoom(1);
}

export function toggleGuruMode() {
  uiState.modeGuru = uiState.modeGuru === 'draw' ? 'pan' : 'draw';
  updateModeUI();
}

function updateModeUI() {
  const btn = document.getElementById('guru-mode-btn');
  const overlay = document.getElementById('guru-overlay');
  const isDraw = uiState.modeGuru === 'draw';

  if (btn) {
    btn.textContent = isDraw ? '✏️ Mode: Gambar' : '✋ Mode: Gulir';
    btn.className =
      'px-3 py-2 font-black rounded-xl border transition ' +
      (isDraw ? 'bg-purple-600 text-white border-purple-700' : 'bg-white text-slate-700 border-slate-300');
  }
  if (overlay) {
    overlay.style.touchAction = isDraw ? 'none' : 'pan-x pan-y';
    overlay.style.cursor = isDraw ? 'crosshair' : 'default';
  }
  updateTipText();
}

function updateTipText() {
  const tip = document.getElementById('guru-tip');
  if (!tip) return;
  tip.innerHTML =
    uiState.modeGuru === 'draw'
      ? '💡 <b>Mode Gambar:</b> seret di area kosong untuk membuat kotak. Ketuk kotak untuk memilih, seret untuk menggeser, tarik titik sudut untuk mengubah ukuran. Pakai <b>+ / −</b> untuk zoom.'
      : '💡 <b>Mode Gulir:</b> geser layar untuk menggulir halaman. Ketuk kotak untuk memilih dan mengubahnya. Pindah ke <b>Mode Gambar</b> untuk membuat kotak baru.';
}

export function toggleGuruFieldPanel() {
  const wrap = document.getElementById('guru-field-list-wrap');
  const btn = document.getElementById('guru-panel-toggle');
  if (!wrap || !btn) return;
  const hidden = wrap.classList.toggle('hidden');
  btn.textContent = hidden ? 'Tampilkan ▴' : 'Sembunyikan ▾';
}

function updateSelectionBar() {
  const bar = document.getElementById('guru-selection-bar');
  const lbl = document.getElementById('guru-sel-label');
  if (!bar) return;
  const f = uiState.selectedFieldGuru ? findField(uiState.selectedFieldGuru) : null;
  if (f) {
    if (lbl) lbl.textContent = f.label || f.id;
    const acc = document.getElementById('btn-accept-sel-guru');
    if (acc) acc.classList.toggle('hidden', !f.auto);
    bar.classList.remove('hidden');
    bar.classList.add('flex');
  } else {
    bar.classList.add('hidden');
    bar.classList.remove('flex');
  }
}

function updateAutoButtons() {
  const hasAuto = allFields().some((f) => f.auto);
  ['btn-accept-auto-guru', 'btn-clear-auto-guru'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !hasAuto);
  });
  const pageEl = document.getElementById('btn-accept-page-auto-guru');
  if (pageEl) pageEl.classList.toggle('hidden', !pageFields().some((f) => f.auto));
}

function pctFromEvent(e, rect) {
  return {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100
  };
}

function boxElById(id) {
  const overlay = document.getElementById('guru-overlay');
  return overlay ? overlay.querySelector(`.guru-field-box[data-id="${id}"]`) : null;
}

function applyBoxStyle(el, f) {
  el.style.left = f.x + '%';
  el.style.top = f.y + '%';
  el.style.width = f.w + '%';
  el.style.height = f.h + '%';
}

export function attachGuruPointerHandlers() {
  const overlay = document.getElementById('guru-overlay');
  if (!overlay) return;

  overlay.oncontextmenu = (e) => e.preventDefault();

  overlay.onpointerdown = (e) => {
    if (activeOp) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const rect = overlay.getBoundingClientRect();
    const pt = pctFromEvent(e, rect);
    const handleEl = e.target.closest ? e.target.closest('.guru-handle') : null;
    const boxEl = e.target.closest ? e.target.closest('.guru-field-box') : null;
    const base = { pointerId: e.pointerId, startCX: e.clientX, startCY: e.clientY, startPx: pt.x, startPy: pt.y, moved: false };

    if (boxEl) {
      const id = boxEl.dataset.id;
      if (uiState.selectedFieldGuru !== id) selectGuruField(id);
      const f = findField(id);
      if (!f) return;
      activeOp = {
        ...base,
        type: handleEl ? 'resize' : 'move',
        handle: handleEl ? handleEl.dataset.handle : null,
        fieldId: id,
        orig: { x: f.x, y: f.y, w: f.w, h: f.h }
      };
      overlay.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (uiState.modeGuru === 'draw') {
      const preview = document.createElement('div');
      Object.assign(preview.style, {
        position: 'absolute',
        border: '2px dashed #d97706',
        background: 'rgba(217,119,6,0.15)',
        pointerEvents: 'none'
      });
      overlay.appendChild(preview);
      activeOp = {
        ...base,
        type: 'draw',
        originX: clamp(e.clientX - rect.left, 0, rect.width),
        originY: clamp(e.clientY - rect.top, 0, rect.height),
        preview
      };
      overlay.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    activeOp = { ...base, type: 'tap' };
  };

  overlay.onpointermove = (e) => {
    const op = activeOp;
    if (!op || e.pointerId !== op.pointerId) return;

    if (Math.hypot(e.clientX - op.startCX, e.clientY - op.startCY) > 3) op.moved = true;
    if (op.type === 'tap') return;

    const rect = overlay.getBoundingClientRect();

    if (op.type === 'draw') {
      const curX = clamp(e.clientX - rect.left, 0, rect.width);
      const curY = clamp(e.clientY - rect.top, 0, rect.height);
      Object.assign(op.preview.style, {
        left: Math.min(op.originX, curX) + 'px',
        top: Math.min(op.originY, curY) + 'px',
        width: Math.abs(curX - op.originX) + 'px',
        height: Math.abs(curY - op.originY) + 'px'
      });
      return;
    }

    const f = findField(op.fieldId);
    if (!f) return;
    const pt = pctFromEvent(e, rect);

    if (op.type === 'move') {
      f.x = clamp(op.orig.x + (pt.x - op.startPx), 0, 100 - op.orig.w);
      f.y = clamp(op.orig.y + (pt.y - op.startPy), 0, 100 - op.orig.h);
    } else if (op.type === 'resize') {
      const right = op.orig.x + op.orig.w;
      const bottom = op.orig.y + op.orig.h;
      let nx = op.orig.x;
      let ny = op.orig.y;
      let nr = right;
      let nb = bottom;
      if (op.handle.includes('w')) nx = clamp(pt.x, 0, right - MIN_W_PCT);
      if (op.handle.includes('e')) nr = clamp(pt.x, op.orig.x + MIN_W_PCT, 100);
      if (op.handle.includes('n')) ny = clamp(pt.y, 0, bottom - MIN_H_PCT);
      if (op.handle.includes('s')) nb = clamp(pt.y, op.orig.y + MIN_H_PCT, 100);
      f.x = nx;
      f.y = ny;
      f.w = nr - nx;
      f.h = nb - ny;
    }

    const el = boxElById(f.id);
    if (el) applyBoxStyle(el, f);
  };

  const finish = (e, cancelled) => {
    const op = activeOp;
    if (!op || e.pointerId !== op.pointerId) return;
    activeOp = null;
    try {
      overlay.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (op.type === 'draw') {
      const w = parseFloat(op.preview.style.width) || 0;
      const h = parseFloat(op.preview.style.height) || 0;
      const x = parseFloat(op.preview.style.left) || 0;
      const y = parseFloat(op.preview.style.top) || 0;
      if (op.preview.parentNode) op.preview.parentNode.removeChild(op.preview);
      if (cancelled) return;

      const minW = isCoarse() ? 24 : 15;
      const minH = isCoarse() ? 16 : 10;
      const rect = overlay.getBoundingClientRect();
      if (w >= minW && h >= minH) {
        addGuruField({
          x: (x / rect.width) * 100,
          y: (y / rect.height) * 100,
          w: (w / rect.width) * 100,
          h: (h / rect.height) * 100,
          type: 'text'
        });
      } else if (!op.moved && uiState.selectedFieldGuru) {
        selectGuruField(null);
      }
      return;
    }

    if (op.type === 'move' || op.type === 'resize') {
      if (op.moved) {
        markDirty();
        renderGuruFieldListPanel();
      }
      return;
    }

    if (op.type === 'tap' && !cancelled && !op.moved && uiState.selectedFieldGuru) {
      selectGuruField(null);
    }
  };

  overlay.onpointerup = (e) => finish(e, false);
  overlay.onpointercancel = (e) => finish(e, true);
}

export const attachGuruDrawHandlers = attachGuruPointerHandlers;

function onGuruKeyDown(e) {
  const modal = document.getElementById('lkpd-field-map-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (document.querySelector('.swal2-container')) return;
  const tag = (e.target && e.target.tagName ? e.target.tagName : '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const id = uiState.selectedFieldGuru;
  const f = id ? findField(id) : null;
  if (!f) return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    deleteGuruField(id);
    return;
  }

  const step = e.shiftKey ? 1 : 0.2;
  let moved = true;
  if (e.key === 'ArrowLeft') f.x = clamp(f.x - step, 0, 100 - f.w);
  else if (e.key === 'ArrowRight') f.x = clamp(f.x + step, 0, 100 - f.w);
  else if (e.key === 'ArrowUp') f.y = clamp(f.y - step, 0, 100 - f.h);
  else if (e.key === 'ArrowDown') f.y = clamp(f.y + step, 0, 100 - f.h);
  else moved = false;

  if (moved) {
    e.preventDefault();
    markDirty();
    const el = boxElById(f.id);
    if (el) applyBoxStyle(el, f);
  }
}

function addGuruField({ x, y, w, h, type = 'text', label = '', auto = false }) {
  const n = uiState.fieldCounterGuru++;
  const field = {
    id: 'field_' + n,
    label: label || 'Field ' + n,
    type,
    x,
    y,
    w,
    h
  };
  if (auto) field.auto = true;
  pageFields().push(field);
  uiState.selectedFieldGuru = field.id;
  markDirty();
  redrawGuruFieldBoxes();
  return field;
}

export function selectGuruField(fieldId, opts = {}) {
  uiState.selectedFieldGuru = fieldId || null;
  redrawGuruFieldBoxes();
  if (fieldId && opts.scrollToBox) {
    const el = boxElById(fieldId);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

export function duplicateGuruField(fieldId) {
  const id = fieldId || uiState.selectedFieldGuru;
  const src = id ? findField(id) : null;
  if (!src) return;

  let ny = src.y + src.h + 0.6;
  let nx = src.x;
  if (ny + src.h > 100) {
    ny = src.y;
    nx = clamp(src.x + 2, 0, 100 - src.w);
  }
  addGuruField({
    x: nx,
    y: ny,
    w: src.w,
    h: src.h,
    type: src.type,
    label: (src.label || src.id) + ' (salin)'
  });
}

export function deleteGuruField(fieldId) {
  const id = fieldId || uiState.selectedFieldGuru;
  if (!id) return;
  uiState.fieldsByPageGuru[uiState.currentPageGuru] = pageFields().filter((f) => f.id !== id);
  if (uiState.selectedFieldGuru === id) uiState.selectedFieldGuru = null;
  markDirty();
  redrawGuruFieldBoxes();
}

export function changeGuruFieldLabel(fieldId, newLabel) {
  const f = findField(fieldId);
  if (f) {
    f.label = String(newLabel).trim() || fieldId;
    markDirty();
    redrawGuruFieldBoxes();
  }
}

export function changeGuruFieldType(fieldId, newType) {
  const f = findField(fieldId);
  if (f) {
    f.type = newType;
    markDirty();
    redrawGuruFieldBoxes();
  }
}

export function redrawGuruFieldBoxes() {
  const overlay = document.getElementById('guru-overlay');
  if (!overlay) return;
  overlay.querySelectorAll('.guru-field-box').forEach((el) => el.remove());

  const selectedId = uiState.selectedFieldGuru;
  const handleSize = isCoarse() ? 28 : 16;

  pageFields().forEach((f) => {
    const isSel = f.id === selectedId;
    const color = f.auto ? '#d97706' : '#2563eb';
    const bg = f.auto ? 'rgba(217,119,6,0.14)' : 'rgba(37,99,235,0.12)';

    const box = document.createElement('div');
    box.className = 'guru-field-box';
    box.dataset.id = f.id;
    Object.assign(box.style, {
      position: 'absolute',
      border: (isSel ? '2.5px solid ' : '2px dashed ') + color,
      background: isSel ? bg.replace(/0\.1\d/, '0.25') : bg,
      boxSizing: 'border-box',
      cursor: 'move',
      touchAction: 'none',
      boxShadow: isSel ? '0 0 0 2px rgba(255,255,255,0.9)' : 'none',
      zIndex: isSel ? '5' : '1'
    });
    applyBoxStyle(box, f);
    box.title = `${f.label || f.id} (${f.type})${f.auto ? ' - draf auto' : ''}`;

    const badge = document.createElement('div');
    badge.className = 'guru-field-badge';
    badge.textContent = (f.auto ? '✨ ' : '') + (f.label || f.id);
    Object.assign(badge.style, {
      position: 'absolute',
      top: f.y < 3 ? '2px' : '-20px',
      left: '0px',
      background: color,
      color: '#ffffff',
      fontSize: '10px',
      fontWeight: 'bold',
      padding: '1px 5px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: '10',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
    });
    box.appendChild(badge);

    if (isSel) {
      const half = handleSize / 2;
      [
        ['nw', { left: -half + 'px', top: -half + 'px' }, 'nwse-resize'],
        ['ne', { right: -half + 'px', top: -half + 'px' }, 'nesw-resize'],
        ['sw', { left: -half + 'px', bottom: -half + 'px' }, 'nesw-resize'],
        ['se', { right: -half + 'px', bottom: -half + 'px' }, 'nwse-resize']
      ].forEach(([name, pos, cursor]) => {
        const h = document.createElement('div');
        h.className = 'guru-handle';
        h.dataset.handle = name;
        Object.assign(h.style, {
          position: 'absolute',
          width: handleSize + 'px',
          height: handleSize + 'px',
          background: '#ffffff',
          border: '2.5px solid ' + color,
          borderRadius: '50%',
          boxSizing: 'border-box',
          touchAction: 'none',
          cursor,
          zIndex: '20',
          ...pos
        });
        box.appendChild(h);
      });
    }

    overlay.appendChild(box);
  });

  renderGuruFieldListPanel();
  updateSelectionBar();
  updateAutoButtons();
}

export function renderGuruFieldListPanel() {
  const listContainer = document.getElementById('guru-field-list');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const fields = pageFields();
  const countEl = document.getElementById('guru-field-count');
  if (countEl) countEl.textContent = fields.length ? `(${fields.length})` : '';

  if (fields.length === 0) {
    listContainer.innerHTML = `<p class="text-slate-400 italic text-[11px]">Belum ada kotak isian di halaman ini.</p>`;
    return;
  }

  fields.forEach((f) => {
    const isSel = f.id === uiState.selectedFieldGuru;
    const item = document.createElement('div');
    item.dataset.id = f.id;
    item.className =
      'p-2 bg-white rounded-xl border space-y-1.5 shadow-2xs cursor-pointer ' +
      (isSel ? 'ring-2 ring-blue-500 border-blue-400' : '');
    item.innerHTML = `
      <div class="flex items-center justify-between gap-1">
        <span class="font-bold text-slate-800 text-[11px] font-mono truncate">${esc(f.id)}${f.auto ? ' <span class="px-1 rounded bg-amber-100 text-amber-800 text-[9px]">AUTO</span>' : ''}</span>
        <span class="shrink-0 flex items-center gap-2">
          ${f.auto ? `<button onclick="acceptGuruField('${f.id}')" class="text-emerald-600 font-bold text-[10px] hover:underline">Terima</button>` : ''}
          <button onclick="duplicateGuruField('${f.id}')" class="text-blue-600 font-bold text-[10px] hover:underline">Duplikat</button>
          <button onclick="deleteGuruField('${f.id}')" class="text-red-500 font-bold text-[10px] hover:underline">Hapus</button>
        </span>
      </div>
      <div class="space-y-1">
        <div class="flex items-center gap-1">
          <label class="text-[10px] text-slate-500 font-medium shrink-0 w-10">Label:</label>
          <input type="text" value="${esc(f.label || f.id)}" onchange="changeGuruFieldLabel('${f.id}', this.value)" placeholder="Label field..." class="w-full p-1 text-[11px] border rounded-lg font-bold bg-slate-50 text-brand-navy" />
        </div>
        <div class="flex items-center gap-1">
          <label class="text-[10px] text-slate-500 font-medium shrink-0 w-10">Tipe:</label>
          <select onchange="changeGuruFieldType('${f.id}', this.value)" class="w-full p-1 text-[11px] border rounded-lg font-bold bg-slate-50">
            <option value="text" ${f.type === 'text' ? 'selected' : ''}>Input Teks Singkat</option>
            <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Textarea Paragraf</option>
          </select>
        </div>
      </div>
    `;
    item.addEventListener('click', (ev) => {
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'button' || tag === 'option') return;
      if (uiState.selectedFieldGuru !== f.id) selectGuruField(f.id, { scrollToBox: true });
    });
    listContainer.appendChild(item);
  });

  const selItem = listContainer.querySelector(`[data-id="${uiState.selectedFieldGuru}"]`);
  if (selItem && selItem.scrollIntoView) selItem.scrollIntoView({ block: 'nearest' });
}

function showAutoProgress(pct, text) {
  const wrap = document.getElementById('guru-autodetect-progress');
  const bar = document.getElementById('guru-autodetect-bar');
  const txt = document.getElementById('guru-autodetect-text');
  if (wrap) wrap.classList.remove('hidden');
  if (bar) bar.style.width = clamp(pct, 0, 100) + '%';
  if (txt) txt.textContent = text || '';
}

function hideAutoProgress() {
  const wrap = document.getElementById('guru-autodetect-progress');
  if (wrap) wrap.classList.add('hidden');
}

function setAutoButtonRunning(isRunning) {
  const btn = document.getElementById('btn-autodetect-guru');
  if (!btn) return;
  btn.textContent = isRunning ? '⏹ Batalkan Deteksi' : '🪄 Deteksi Otomatis';
  btn.classList.toggle('bg-amber-500', !isRunning);
  btn.classList.toggle('bg-slate-600', isRunning);
}

export async function runAutoDetectGuru() {
  if (uiState.autoDetectRunningGuru) {
    uiState.autoDetectCancelGuru = true;
    return;
  }

  const pdf = uiState.currentPdfDocGuru;
  if (!pdf) {
    showToast('warning', 'PDF belum selesai dimuat.');
    return;
  }

  if (getDetectorCount() === 0) {
    showToast('info', 'Kerangka deteksi siap. Detektor garis & tabel dipasang pada Tahap 2-3.');
    return;
  }

  if (allFields().some((f) => f.auto)) {
    const r = await Swal.fire({
      icon: 'question',
      title: 'Ganti draf sebelumnya?',
      text: 'Draf deteksi otomatis yang belum diterima akan diganti hasil baru. Kotak manual tidak disentuh.',
      showCancelButton: true,
      confirmButtonText: 'Ya, ganti',
      cancelButtonText: 'Batal'
    });
    if (!r.isConfirmed) return;
  }

  uiState.autoDetectRunningGuru = true;
  uiState.autoDetectCancelGuru = false;
  setAutoButtonRunning(true);

  const total = uiState.totalPagesGuru;
  const found = {};
  let count = 0;

  let ocr = null;
  try {
    showAutoProgress(0, 'Memuat OCR (bahasa Indonesia)...');
    ocr = await createLabelWorker('ind');
  } catch (err) {
    console.warn('OCR tidak tersedia, label otomatis dilewati:', err);
    showToast('info', 'OCR tidak tersedia. Kotak diberi label default.');
  }

  try {
    for (let p = 1; p <= total; p++) {
      if (uiState.autoDetectCancelGuru) break;
      showAutoProgress(((p - 1) / total) * 100, `Mendeteksi${ocr ? ' + membaca label' : ''} halaman ${p} / ${total}...`);
      await new Promise((r) => setTimeout(r, 0));
      found[p] = await detectPage(pdf, p, { ocr });
      count += found[p].length;
    }
  } catch (err) {
    console.error('Deteksi otomatis gagal:', err);
    uiState.autoDetectCancelGuru = true;
    Swal.fire({ icon: 'error', title: 'Deteksi gagal', text: err.message || String(err) });
  }

  if (ocr) ocr.terminate().catch(() => {});

  const cancelled = uiState.autoDetectCancelGuru;
  const stillSameDoc = uiState.currentPdfDocGuru === pdf;
  uiState.autoDetectRunningGuru = false;
  uiState.autoDetectCancelGuru = false;
  setAutoButtonRunning(false);
  hideAutoProgress();

  if (cancelled || !stillSameDoc) {
    showToast('info', 'Deteksi dibatalkan. Tidak ada perubahan.');
    return;
  }

  Object.keys(uiState.fieldsByPageGuru).forEach((p) => {
    uiState.fieldsByPageGuru[p] = (uiState.fieldsByPageGuru[p] || []).filter((f) => !f.auto);
  });
  Object.keys(found).forEach((p) => {
    const list = pageFields(Number(p));
    found[p].forEach((d) => {
      const n = uiState.fieldCounterGuru++;
      list.push({
        id: 'field_' + n,
        label: d.label || 'Field ' + n,
        type: d.type || 'text',
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
        auto: true
      });
    });
  });

  uiState.selectedFieldGuru = null;
  if (count > 0) markDirty();
  redrawGuruFieldBoxes();
  showToast(
    count > 0 ? 'success' : 'info',
    count > 0 ? `${count} kotak draf ditambahkan. Periksa, lalu Terima Semua.` : 'Tidak ada kotak terdeteksi.'
  );
}

export function acceptGuruField(fieldId) {
  const f = findField(fieldId || uiState.selectedFieldGuru);
  if (!f || !f.auto) return;
  delete f.auto;
  markDirty();
  redrawGuruFieldBoxes();
}

export function acceptPageAutoGuru() {
  let n = 0;
  pageFields().forEach((f) => {
    if (f.auto) {
      delete f.auto;
      n++;
    }
  });
  if (n > 0) markDirty();
  redrawGuruFieldBoxes();
  showToast('success', `${n} draf halaman ini diterima.`);
}

export function acceptAllAutoGuru() {
  let n = 0;
  allFields().forEach((f) => {
    if (f.auto) {
      delete f.auto;
      n++;
    }
  });
  if (n > 0) markDirty();
  redrawGuruFieldBoxes();
  showToast('success', `${n} draf diterima sebagai kotak biasa.`);
}

export async function clearAutoGuru() {
  const r = await Swal.fire({
    icon: 'warning',
    title: 'Hapus semua draf auto?',
    text: 'Hanya kotak bertanda AUTO yang dihapus. Kotak manual aman.',
    showCancelButton: true,
    confirmButtonText: 'Ya, hapus',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  Object.keys(uiState.fieldsByPageGuru).forEach((p) => {
    uiState.fieldsByPageGuru[p] = (uiState.fieldsByPageGuru[p] || []).filter((f) => !f.auto);
  });
  uiState.selectedFieldGuru = null;
  markDirty();
  redrawGuruFieldBoxes();
}

export async function saveFieldMapGuru(idLkpd) {
  const payload = {
    totalPages: uiState.totalPagesGuru,
    renderScale: SAVED_RENDER_SCALE,
    fields: uiState.fieldsByPageGuru
  };

  const res = await apiPost({
    action: 'save_field_map_lkpd',
    id_lkpd: idLkpd,
    peta_field_json: JSON.stringify(payload)
  });

  if (res.success) {
    uiState.dirtyGuru = false;
    showToast('success', 'Peta isian LKPD berhasil disimpan!');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Peta Field', text: res.message });
  }
  return res;
}

window.openModalPetakanFieldGuru = openModalPetakanFieldGuru;
window.closeModalPetakanFieldGuru = closeModalPetakanFieldGuru;
window.changeGuruPage = changeGuruPage;
window.changeGuruFieldLabel = changeGuruFieldLabel;
window.changeGuruFieldType = changeGuruFieldType;
window.deleteGuruField = deleteGuruField;
window.duplicateGuruField = duplicateGuruField;
window.selectGuruField = selectGuruField;
window.zoomGuru = zoomGuru;
window.zoomGuruFit = zoomGuruFit;
window.toggleGuruMode = toggleGuruMode;
window.toggleGuruFieldPanel = toggleGuruFieldPanel;
window.runAutoDetectGuru = runAutoDetectGuru;
window.acceptAllAutoGuru = acceptAllAutoGuru;
window.acceptGuruField = acceptGuruField;
window.acceptPageAutoGuru = acceptPageAutoGuru;
window.clearAutoGuru = clearAutoGuru;

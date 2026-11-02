import { requireStudentAuth, setButtonLoading, showToast, toastSubmitResult } from '../components/modal.js';
import { markDraftForClear } from '../services/outbox-status.js';
import { CACHE_KEY } from '../config.js';
import { apiPost } from '../services/api.js';
import { markSelesai } from '../services/progress.js';
import { fetchPdfArrayBuffer } from '../services/ocr.js';
import { state, uiState } from '../state.js';
import { escapeHtml as e, jsArg } from '../services/html.js';

function activeRoot() {
  const fs = document.getElementById('lkpd-fullscreen-modal');
  if (fs && !fs.classList.contains('hidden')) return document.getElementById('lkpd-fullscreen-content') || fs;
  return document.getElementById('desktop-lkpd-pages') || document;
}

// Render halaman PDF tajam di layar DPR tinggi (HP).
// Ukuran CSS = viewport; piksel canvas = viewport x dpr.
async function renderPageSharp(page, canvas, viewport) {
  let dpr = Math.min(window.devicePixelRatio || 1, 3);
  // batas piksel canvas iOS/Android; turunkan dpr bila kebesaran
  while (dpr > 1 && viewport.width * viewport.height * dpr * dpr > 16e6) dpr -= 0.25;

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = viewport.width + 'px';
  canvas.style.height = viewport.height + 'px';

  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
  }).promise;
  return dpr;
}

function readAnswers(root) {
  const out = {};
  (root || document).querySelectorAll('.lkpd-fill-input').forEach((el) => {
    if (el.dataset.fieldId) out[el.dataset.fieldId] = el.value;
  });
  return out;
}

async function fetchServerAnswers(idLkpd, user) {
  if (!user || !user.username || user.username === 'guest') return {};
  try {
    const res = await apiPost({ action: 'get_jawaban_lkpd_isian', id_lkpd: idLkpd, username_siswa: user.username });
    return res && res.success && res.jawaban ? res.jawaban : {};
  } catch (err) {
    return {};
  }
}

export {
  openModalPetakanFieldGuru,
  closeModalPetakanFieldGuru,
  openFieldMapEditorGuru,
  renderGuruPage,
  changeGuruPage,
  attachGuruPointerHandlers,
  attachGuruDrawHandlers,
  redrawGuruFieldBoxes,
  renderGuruFieldListPanel,
  changeGuruFieldLabel,
  changeGuruFieldType,
  deleteGuruField,
  saveFieldMapGuru
} from './field-map-editor.js';

export async function renderLkpdUntukSiswa(containerEl, lkpdObj, ptmId) {
  const user = state.currentUser || { username: 'guest' };
  if (!lkpdObj.peta_field_json) return;

  containerEl.innerHTML = `<div class="p-6 text-center text-slate-500 font-bold text-xs">Memuat Lembar Isian LKPD...</div>`;

  try {
    const fieldMap = JSON.parse(lkpdObj.peta_field_json);
    const arrayBuffer = await fetchPdfArrayBuffer(lkpdObj.file_pdf_url, lkpdObj.file_drive_id);
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const savedServerAnswers = await fetchServerAnswers(lkpdObj.id_lkpd, user);
    const localDraft = getLkpdOverlayDraft(lkpdObj.id_lkpd);
    const combinedAnswers = { ...savedServerAnswers, ...localDraft };

    uiState.currentActiveLkpdContext = { ptmId, idLkpd: lkpdObj.id_lkpd, pdfDoc, fieldMap, savedAnswers: combinedAnswers };

    containerEl.innerHTML = `
      <div class="w-full space-y-4">

        <div class="block md:hidden space-y-3 text-center p-4 bg-slate-50 rounded-2xl border border-slate-200 shadow-xs">
          <span class="px-2.5 py-1 bg-purple-100 text-purple-800 font-bold rounded-xl text-[10px] inline-block uppercase font-mono">
            📱 Mode Mobile
          </span>
          <h5 class="font-black text-brand-navy text-xs">Lembar Kerja PDF Interaktif</h5>
          <p class="text-[11px] text-slate-600 font-medium max-w-xs mx-auto">
            Buka mode layar penuh untuk kenyamanan membaca dan mengetik jawaban di layar HP kamu.
          </p>
          <button onclick="openLkpdFullscreenModal(${jsArg(ptmId)}, ${jsArg(lkpdObj.id_lkpd)})" class="w-full px-5 py-3.5 bg-brand-purple hover:bg-purple-700 text-white font-black rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-xs">
            <span>🖥️ Buka Layar Penuh (Fullscreen)</span>
          </button>
        </div>

        <div id="desktop-inline-lkpd-wrap" class="hidden md:block space-y-4 w-full">
          <div id="desktop-lkpd-pages" class="space-y-4 flex flex-col items-center"></div>
          <button id="btn-simpan-jawaban-lkpd-desktop" class="w-full py-3.5 bg-brand-blue hover:bg-blue-700 text-white font-black rounded-2xl shadow transition text-xs">
            💾 Simpan Jawaban LKPD Overlay
          </button>
        </div>

      </div>
    `;

    const desktopPagesWrap = document.getElementById('desktop-lkpd-pages');
    if (desktopPagesWrap) {
      await renderDesktopInlinePdfPages(desktopPagesWrap, pdfDoc, fieldMap, combinedAnswers, lkpdObj.id_lkpd);
    }

    const btnSaveDesktop = document.getElementById('btn-simpan-jawaban-lkpd-desktop');
    if (btnSaveDesktop) {
      btnSaveDesktop.onclick = () => submitJawabanLkpdIsian(ptmId, lkpdObj.id_lkpd, btnSaveDesktop);
    }

    if (Object.keys(localDraft).length > 0) {
      showToast('info', 'Draft pengerjaan PDF Overlay dipulihkan!');
    }
  } catch (err) {
    console.error('Error rendering student PDF overlay:', err);
    containerEl.innerHTML = `<div class="p-4 text-center text-red-500 font-bold text-xs">Gagal memuat PDF Interaktif (${e(err.message)})</div>`;
  }
}

export async function renderDesktopInlinePdfPages(containerWrap, pdfDoc, fieldMap, savedAnswers, idLkpd) {
  containerWrap.innerHTML = '';
  const firstPage = await pdfDoc.getPage(1);
  const naturalViewport = firstPage.getViewport({ scale: 1 });
  const availableWidth = Math.max(containerWrap.clientWidth || 750, 600);
  const renderScale = Math.min(Math.max(availableWidth / naturalViewport.width, 0.8), fieldMap.renderScale || 1.4);

  let lastDpr = 1;
  for (let pageNum = 1; pageNum <= fieldMap.totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });

    const pageWrap = document.createElement('div');
    pageWrap.style.position = 'relative';
    pageWrap.style.width = viewport.width + 'px';
    pageWrap.style.height = viewport.height + 'px';
    pageWrap.className = 'shadow-md rounded-xl overflow-hidden bg-white border shrink-0 mx-auto';

    const canvas = document.createElement('canvas');
    pageWrap.appendChild(canvas);
    lastDpr = await renderPageSharp(page, canvas, viewport);

    const fields = fieldMap.fields[pageNum] || [];
    fields.forEach((f) => {
      const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type !== 'textarea') el.type = 'text';
      el.className = 'lkpd-fill-input';
      el.dataset.fieldId = f.id;
      const fh = (f.h / 100) * viewport.height;
      el.placeholder = fh >= 22 ? (f.label || f.id) : '';
      el.title = f.label || f.id;
      el.value = savedAnswers[f.id] || '';

      el.oninput = () => saveLkpdOverlayDraft(idLkpd);

      const calculatedFontSize = Math.max(Math.min(15, Math.round(fh * 0.6)), 8);

      Object.assign(el.style, {
        position: 'absolute',
        left: f.x + '%',
        top: f.y + '%',
        width: f.w + '%',
        height: f.h + '%',
        border: '1.5px solid #2563eb',
        background: 'rgba(255, 255, 255, 0.92)',
        fontFamily: 'inherit',
        fontSize: calculatedFontSize + 'px',
        padding: fh < 22 ? '0 4px' : '3px 6px',
        borderRadius: '6px',
        boxSizing: 'border-box'
      });
      pageWrap.appendChild(el);
    });

    containerWrap.appendChild(pageWrap);
  }
}

export async function renderLkpdInlineContainer(containerEl, pdfDoc, fieldMap, savedAnswers, ptmId, idLkpd) {
  containerEl.innerHTML = `
    <div class="space-y-3 w-full text-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
      <h5 class="font-bold text-brand-navy text-xs">Lembar Kerja PDF Interaktif</h5>
      <p class="text-[11px] text-slate-600 font-medium max-w-sm mx-auto">
        Klik tombol di bawah ini untuk membuka lembar pengerjaan layar penuh (Fullscreen) yang nyaman dan pas di layar HP.
      </p>
      <button onclick="openLkpdFullscreenModal(${jsArg(ptmId)}, ${jsArg(idLkpd)})" class="w-full sm:w-auto px-6 py-3.5 bg-brand-purple hover:bg-purple-700 text-white font-black rounded-2xl shadow-lg transition inline-flex items-center justify-center gap-2 text-xs">
        <span>Buka Layar Penuh (Fullscreen)</span>
      </button>
    </div>
  `;
}

export async function openLkpdFullscreenModal(ptmId, idLkpd) {
  const lkpdObj = (state.cachedData.lkpd || []).find((l) => String(l.id_lkpd) === String(idLkpd));
  if (!lkpdObj) return;

  const modal = document.getElementById('lkpd-fullscreen-modal');
  const titleElem = document.getElementById('lkpd-fullscreen-title');
  const contentWrap = document.getElementById('lkpd-fullscreen-content');

  if (titleElem) titleElem.textContent = lkpdObj.judul_lkpd;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  const floatBtn = document.getElementById('btn-floating-save-lkpd');
  if (floatBtn) floatBtn.onclick = (ev) => submitJawabanLkpdIsian(ptmId, idLkpd, ev.currentTarget);

  // seed isian dari desktop (belum tersimpan) sebelum layar penuh digambar
  const desktopVals = readAnswers(document.getElementById('desktop-lkpd-pages'));
  if (uiState.currentActiveLkpdContext && String(uiState.currentActiveLkpdContext.idLkpd) === String(idLkpd) && Object.keys(desktopVals).length) {
    uiState.currentActiveLkpdContext.savedAnswers = { ...uiState.currentActiveLkpdContext.savedAnswers, ...desktopVals };
  }

  if (uiState.currentActiveLkpdContext.pdfDoc && String(uiState.currentActiveLkpdContext.idLkpd) === String(idLkpd)) {
    await drawLkpdFullscreenPages(contentWrap);
  } else {
    contentWrap.innerHTML = `<div class="p-8 text-white font-bold text-xs">Memuat PDF...</div>`;
    const user = state.currentUser || { username: 'guest' };
    let fieldMap;
    let pdfDoc;
    try {
      fieldMap = JSON.parse(lkpdObj.peta_field_json);
      const arrayBuffer = await fetchPdfArrayBuffer(lkpdObj.file_pdf_url, lkpdObj.file_drive_id);
      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (err) {
      contentWrap.innerHTML = `<div class="p-8 text-white font-bold text-xs">Gagal memuat PDF (${e(err.message)})</div>`;
      return;
    }

    const savedServerAnswers = await fetchServerAnswers(lkpdObj.id_lkpd, user);
    const localDraft = getLkpdOverlayDraft(idLkpd);
    const combinedAnswers = { ...savedServerAnswers, ...localDraft };

    uiState.currentActiveLkpdContext = { ptmId, idLkpd, pdfDoc, fieldMap, savedAnswers: combinedAnswers };
    await drawLkpdFullscreenPages(contentWrap);
  }
}

export function closeLkpdFullscreenModal() {
  const modal = document.getElementById('lkpd-fullscreen-modal');
  closeFieldSheet();
  const fsVals = readAnswers(document.getElementById('lkpd-fullscreen-content'));
  if (Object.keys(fsVals).length) {
    document.querySelectorAll('#desktop-lkpd-pages .lkpd-fill-input').forEach((el) => {
      const v = fsVals[el.dataset.fieldId];
      if (v !== undefined) el.value = v;
    });
    if (uiState.currentActiveLkpdContext) {
      uiState.currentActiveLkpdContext.savedAnswers = { ...uiState.currentActiveLkpdContext.savedAnswers, ...fsVals };
    }
  }
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export async function drawLkpdFullscreenPages(containerEl) {
  const { pdfDoc, fieldMap, savedAnswers, idLkpd } = uiState.currentActiveLkpdContext;
  if (!pdfDoc || !fieldMap) return;

  const prevVals = readAnswers(containerEl);
  const useSheet = isMobileSheet();
  containerEl.innerHTML = '';
  const scrollBody = document.getElementById('lkpd-fullscreen-scroll-body');
  const viewportWidth = scrollBody.clientWidth - 24;

  const firstPage = await pdfDoc.getPage(1);
  const naturalViewport = firstPage.getViewport({ scale: 1 });

  let renderScale = 1.0;
  if (uiState.activeLkpdFitMode === 'fit') {
    renderScale = Math.max(viewportWidth / naturalViewport.width, 0.45);
    uiState.activeLkpdScale = renderScale;
  } else {
    renderScale = uiState.activeLkpdScale;
  }

  document.getElementById('lkpd-zoom-text').textContent = `${Math.round((renderScale / (viewportWidth / naturalViewport.width)) * 100)}%`;

  let lastDpr = 1;
  for (let pageNum = 1; pageNum <= fieldMap.totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });

    const pageWrap = document.createElement('div');
    pageWrap.className = 'lkpd-fullscreen-page-wrap relative bg-white rounded-xl overflow-hidden mb-6 border shrink-0';
    pageWrap.style.width = viewport.width + 'px';
    pageWrap.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    pageWrap.appendChild(canvas);
    lastDpr = await renderPageSharp(page, canvas, viewport);

    const fields = fieldMap.fields[pageNum] || [];
    fields.forEach((f) => {
      const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type !== 'textarea') el.type = 'text';
      el.className = 'lkpd-fill-input';
      el.dataset.fieldId = f.id;
      el.dataset.page = String(pageNum);
      el.dataset.x = String(f.x);
      el.dataset.y = String(f.y);
      el.dataset.label = f.label || '';
      const fh = (f.h / 100) * viewport.height;
      el.placeholder = fh >= 22 ? (f.label || f.id) : '';
      el.title = f.label || f.id;

      el.value = prevVals[f.id] !== undefined ? prevVals[f.id] : (savedAnswers[f.id] || '');

      markFilled(el);
      el.oninput = () => { markFilled(el); saveLkpdOverlayDraft(idLkpd); };

      // HP: kolom kecil tidak diketik langsung; ketuk membuka sheet isian besar
      if (useSheet) {
        el.readOnly = true;
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          openFieldSheet(el);
        });
      }

      const calculatedFontSize = Math.max(Math.min(15, Math.round(fh * 0.6)), 8);

      Object.assign(el.style, {
        position: 'absolute',
        left: f.x + '%',
        top: f.y + '%',
        width: f.w + '%',
        height: f.h + '%',
        border: '1.5px solid #2563eb',
        background: 'rgba(255, 255, 255, 0.92)',
        fontFamily: 'inherit',
        fontSize: calculatedFontSize + 'px',
        padding: fh < 22 ? '0 4px' : '3px 6px',
        borderRadius: '6px',
        boxSizing: 'border-box'
      });
      pageWrap.appendChild(el);
    });

    containerEl.appendChild(pageWrap);
  }
  // diagnosa: buka aplikasi dengan ?debug untuk cek patch aktif
  if (/[?&]debug\b/.test(location.search)) {
    showToast('info', `Render PDF ${lastDpr}x (DPR perangkat ${window.devicePixelRatio || 1})`);
  }
  // gambar ulang (zoom) saat sheet terbuka: sambungkan lagi ke kolom yang sama
  if (sheet.el && sheet.el.classList.contains('open')) renderSheet(false);
}


// ===== Sheet isian untuk HP =====
// Ketuk kolom kecil di PDF -> panel input besar (font 16px) di bawah layar,
// dengan tombol Sebelumnya/Berikutnya. Nilai ditulis balik ke kolom overlay.
const sheet = { el: null, input: null, area: null, label: null, meta: null, prev: null, next: null, fieldId: null, vvBound: false, timer: null };

function isMobileSheet() {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
}

function markFilled(el) {
  el.classList.toggle('lkpd-field-filled', el.value.trim() !== '');
}

// urutan baca: halaman, baris (dari atas), lalu kiri ke kanan
function getOrderedFields() {
  const root = document.getElementById('lkpd-fullscreen-content');
  const list = Array.from(root ? root.querySelectorAll('.lkpd-fill-input') : []);
  const row = (el) => Math.round(Number(el.dataset.y) / 1.2);
  return list.sort((a, b) =>
    (Number(a.dataset.page) - Number(b.dataset.page)) ||
    (row(a) - row(b)) ||
    (Number(a.dataset.x) - Number(b.dataset.x))
  );
}

function currentSheetTarget() {
  if (!sheet.fieldId) return null;
  return getOrderedFields().find((x) => x.dataset.fieldId === sheet.fieldId) || null;
}

function sheetLabelFor(el, pos) {
  const raw = (el.dataset.label || '').trim();
  const generic = !raw || raw === el.dataset.fieldId || /^field[\s_-]*\d+$/i.test(raw);
  return generic ? `Halaman ${el.dataset.page} · isian ${pos + 1}` : raw;
}

function ensureSheet() {
  if (sheet.el) return sheet.el;
  const modal = document.getElementById('lkpd-fullscreen-modal');
  const el = document.createElement('div');
  el.className = 'lkpd-sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Isi jawaban');
  el.innerHTML = `
    <div class="lkpd-sheet-head">
      <div class="lkpd-sheet-text">
        <div class="lkpd-sheet-label"></div>
        <div class="lkpd-sheet-meta"></div>
      </div>
      <button type="button" class="lkpd-sheet-close" aria-label="Tutup isian">✖</button>
    </div>
    <input type="text" class="lkpd-sheet-input" autocomplete="off" autocapitalize="sentences" enterkeyhint="next">
    <textarea class="lkpd-sheet-input" rows="4" hidden></textarea>
    <div class="lkpd-sheet-nav">
      <button type="button" class="lkpd-sheet-btn prev">‹ Sebelumnya</button>
      <button type="button" class="lkpd-sheet-btn next">Berikutnya ›</button>
    </div>`;
  modal.appendChild(el);

  sheet.el = el;
  sheet.label = el.querySelector('.lkpd-sheet-label');
  sheet.meta = el.querySelector('.lkpd-sheet-meta');
  sheet.input = el.querySelector('input.lkpd-sheet-input');
  sheet.area = el.querySelector('textarea.lkpd-sheet-input');
  sheet.prev = el.querySelector('.prev');
  sheet.next = el.querySelector('.next');

  // jaga keyboard tetap terbuka saat tombol disentuh
  el.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (ev) => ev.preventDefault()));
  el.querySelector('.lkpd-sheet-close').onclick = closeFieldSheet;
  sheet.prev.onclick = () => stepFieldSheet(-1);
  sheet.next.onclick = () => stepFieldSheet(1);

  const onType = (ev) => {
    const target = currentSheetTarget();
    if (!target) return;
    target.value = ev.target.value;
    markFilled(target);
    const ctx = uiState.currentActiveLkpdContext;
    if (ctx) saveLkpdOverlayDraft(ctx.idLkpd);
    updateSheetMeta();
  };
  sheet.input.addEventListener('input', onType);
  sheet.area.addEventListener('input', onType);
  sheet.input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      stepFieldSheet(1);
    }
  });
  return el;
}

function updateSheetMeta() {
  if (!sheet.el) return;
  const list = getOrderedFields();
  const pos = list.findIndex((x) => x.dataset.fieldId === sheet.fieldId);
  const filled = list.filter((x) => x.value.trim() !== '').length;
  sheet.meta.textContent = `Isian ${pos + 1}/${list.length} · terisi ${filled}`;
}

// sheet naik mengikuti keyboard; ruang kosong di bawah PDF supaya kolom terbawah bisa di-scroll ke atas sheet
function layoutSheet() {
  if (!sheet.el || !sheet.el.classList.contains('open')) return;
  const vv = window.visualViewport;
  const lift = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  sheet.el.style.bottom = lift + 'px';
  const content = document.getElementById('lkpd-fullscreen-content');
  if (content) content.style.paddingBottom = (sheet.el.offsetHeight + lift + 16) + 'px';
}

function scrollFieldIntoView(el) {
  const body = document.getElementById('lkpd-fullscreen-scroll-body');
  if (!body || !sheet.el) return;
  const br = body.getBoundingClientRect();
  const sr = sheet.el.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const visibleBottom = Math.min(br.bottom, sr.top);
  const centerY = (br.top + visibleBottom) / 2;
  const centerX = (br.left + br.right) / 2;
  body.scrollTo({
    top: body.scrollTop + (er.top + er.height / 2 - centerY),
    left: body.scrollLeft + (er.left + er.width / 2 - centerX),
    behavior: 'smooth'
  });
}

function bindViewport() {
  if (sheet.vvBound || !window.visualViewport) return;
  sheet.vvBound = true;
  const onVV = () => {
    layoutSheet();
    clearTimeout(sheet.timer);
    sheet.timer = setTimeout(() => {
      const el = currentSheetTarget();
      if (el) scrollFieldIntoView(el);
    }, 120);
  };
  window.visualViewport.addEventListener('resize', onVV);
  window.visualViewport.addEventListener('scroll', onVV);
}

function renderSheet(focus) {
  const list = getOrderedFields();
  const pos = list.findIndex((x) => x.dataset.fieldId === sheet.fieldId);
  if (pos < 0) {
    closeFieldSheet();
    return;
  }
  const el = list[pos];
  list.forEach((x) => x.classList.remove('lkpd-field-active'));
  el.classList.add('lkpd-field-active');

  const multi = el.tagName === 'TEXTAREA';
  const field = multi ? sheet.area : sheet.input;
  sheet.input.hidden = multi;
  sheet.area.hidden = !multi;
  field.value = el.value;
  field.placeholder = 'Ketik jawaban di sini…';

  const last = pos === list.length - 1;
  sheet.label.textContent = sheetLabelFor(el, pos);
  sheet.prev.disabled = pos === 0;
  sheet.next.textContent = last ? 'Selesai ✓' : 'Berikutnya ›';
  sheet.input.setAttribute('enterkeyhint', last ? 'done' : 'next');
  updateSheetMeta();

  if (focus) field.focus({ preventScroll: true });
  layoutSheet();
  scrollFieldIntoView(el);
}

function openFieldSheet(el) {
  ensureSheet();
  sheet.fieldId = el.dataset.fieldId;
  sheet.el.classList.add('open');
  const fab = document.getElementById('btn-floating-save-lkpd');
  if (fab && fab.parentElement) fab.parentElement.style.display = 'none';
  bindViewport();
  renderSheet(true);
}

function stepFieldSheet(dir) {
  const list = getOrderedFields();
  const pos = list.findIndex((x) => x.dataset.fieldId === sheet.fieldId);
  const nextPos = pos + dir;
  if (nextPos < 0) return;
  if (nextPos >= list.length) {
    closeFieldSheet();
    return;
  }
  sheet.fieldId = list[nextPos].dataset.fieldId;
  renderSheet(true);
}

export function closeFieldSheet() {
  if (!sheet.el) return;
  sheet.el.classList.remove('open');
  sheet.fieldId = null;
  sheet.input.blur();
  sheet.area.blur();
  document.querySelectorAll('#lkpd-fullscreen-content .lkpd-field-active').forEach((x) => x.classList.remove('lkpd-field-active'));
  const content = document.getElementById('lkpd-fullscreen-content');
  if (content) content.style.paddingBottom = '';
  const fab = document.getElementById('btn-floating-save-lkpd');
  if (fab && fab.parentElement) fab.parentElement.style.display = '';
}

export function setLkpdZoomMode(mode) {
  uiState.activeLkpdFitMode = mode;
  const contentWrap = document.getElementById('lkpd-fullscreen-content');
  if (contentWrap) drawLkpdFullscreenPages(contentWrap);
}

export function changeLkpdZoom(delta) {
  uiState.activeLkpdFitMode = 'custom';
  uiState.activeLkpdScale = Math.min(Math.max(uiState.activeLkpdScale + delta, 0.4), 2.5);
  const contentWrap = document.getElementById('lkpd-fullscreen-content');
  if (contentWrap) drawLkpdFullscreenPages(contentWrap);
}

export async function submitJawabanLkpdIsian(ptmId, idLkpd, btnEl) {
  const user = state.currentUser;
  if (!user) {
    requireStudentAuth();
    return;
  }

  const jawaban = readAnswers(activeRoot());

  const btn = btnEl || document.getElementById('btn-simpan-jawaban-lkpd-desktop');
  const origText = btn ? btn.innerHTML : '💾 Simpan Jawaban LKPD Overlay';
  setButtonLoading(btn, true, '🚀 Mengirim...', origText);

  const res = await apiPost({
    action: 'submit_lkpd_isian',
    id_pertemuan: ptmId,
    id_lkpd: idLkpd,
    username_siswa: user.username,
    nama_siswa: user.name,
    kelas: user.kelas,
    jawaban_json: JSON.stringify(jawaban)
  });

  setButtonLoading(btn, false, '', origText);

  if (res.success) {
    markSelesai('lkpd', idLkpd);
    if (res.queued) {
      markDraftForClear(`${CACHE_KEY}_DRAFT_OVERLAY_${idLkpd}_${user.username}`);
    } else {
      clearLkpdOverlayDraft(idLkpd);
    }
    toastSubmitResult(res, 'Jawaban LKPD Overlay tersimpan!');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Jawaban', text: res.message });
  }
}

export function saveLkpdOverlayDraft(idLkpd) {
  const username = state.currentUser ? state.currentUser.username : 'guest';
  const draftKey = `${CACHE_KEY}_DRAFT_OVERLAY_${idLkpd}_${username}`;
  const jawaban = readAnswers(activeRoot());
  try {
    localStorage.setItem(draftKey, JSON.stringify({ jawaban, timestamp: new Date().toISOString() }));
  } catch (err) {
    console.warn('Draft overlay tidak tersimpan:', err);
  }
}

export function getLkpdOverlayDraft(idLkpd) {
  const username = state.currentUser ? state.currentUser.username : 'guest';
  const draftKey = `${CACHE_KEY}_DRAFT_OVERLAY_${idLkpd}_${username}`;
  try {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed && parsed.jawaban ? parsed.jawaban : {};
    }
  } catch (e) {
    console.error('Gagal membaca draft overlay:', e);
  }
  return {};
}

export function clearLkpdOverlayDraft(idLkpd) {
  const username = state.currentUser ? state.currentUser.username : 'guest';
  const draftKey = `${CACHE_KEY}_DRAFT_OVERLAY_${idLkpd}_${username}`;
  try { localStorage.removeItem(draftKey); } catch (err) { /* abaikan */ }
}

window.openLkpdFullscreenModal = openLkpdFullscreenModal;
window.closeLkpdFullscreenModal = closeLkpdFullscreenModal;
window.closeFieldSheet = closeFieldSheet;
window.setLkpdZoomMode = setLkpdZoomMode;
window.changeLkpdZoom = changeLkpdZoom;

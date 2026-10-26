import { requireStudentAuth, setButtonLoading, showToast, toastSubmitResult } from '../components/modal.js';
import { markDraftForClear } from '../services/outbox-status.js';
import { CACHE_KEY } from '../config.js';
import { apiPost } from '../services/api.js';
import { fetchPdfArrayBuffer } from '../services/ocr.js';
import { state, uiState } from '../state.js';
import { escapeHtml as e, jsArg } from '../services/html.js';

function activeRoot() {
  const fs = document.getElementById('lkpd-fullscreen-modal');
  if (fs && !fs.classList.contains('hidden')) return document.getElementById('lkpd-fullscreen-content') || fs;
  return document.getElementById('desktop-lkpd-pages') || document;
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

  for (let pageNum = 1; pageNum <= fieldMap.totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });

    const pageWrap = document.createElement('div');
    pageWrap.style.position = 'relative';
    pageWrap.style.width = viewport.width + 'px';
    pageWrap.style.height = viewport.height + 'px';
    pageWrap.className = 'shadow-md rounded-xl overflow-hidden bg-white border shrink-0 mx-auto';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pageWrap.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const fields = fieldMap.fields[pageNum] || [];
    fields.forEach((f) => {
      const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type !== 'textarea') el.type = 'text';
      el.className = 'lkpd-fill-input';
      el.dataset.fieldId = f.id;
      el.placeholder = f.label || f.id;
      el.title = f.label || f.id;
      el.value = savedAnswers[f.id] || '';

      el.oninput = () => saveLkpdOverlayDraft(idLkpd);

      const calculatedFontSize = Math.max(Math.min(14, Math.round(11 * renderScale)), 10);

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
        padding: '3px 6px',
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

  for (let pageNum = 1; pageNum <= fieldMap.totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });

    const pageWrap = document.createElement('div');
    pageWrap.className = 'lkpd-fullscreen-page-wrap relative bg-white rounded-xl overflow-hidden mb-6 border shrink-0';
    pageWrap.style.width = viewport.width + 'px';
    pageWrap.style.height = viewport.height + 'px';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pageWrap.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const fields = fieldMap.fields[pageNum] || [];
    fields.forEach((f) => {
      const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
      if (f.type !== 'textarea') el.type = 'text';
      el.className = 'lkpd-fill-input';
      el.dataset.fieldId = f.id;
      el.placeholder = f.label || f.id;
      el.title = f.label || f.id;

      el.value = prevVals[f.id] !== undefined ? prevVals[f.id] : (savedAnswers[f.id] || '');

      el.oninput = () => saveLkpdOverlayDraft(idLkpd);

      const calculatedFontSize = Math.max(Math.min(15, Math.round(12 * (renderScale / 1.2))), 10);

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
        padding: '3px 6px',
        borderRadius: '6px',
        boxSizing: 'border-box'
      });
      pageWrap.appendChild(el);
    });

    containerEl.appendChild(pageWrap);
  }
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
window.setLkpdZoomMode = setLkpdZoomMode;
window.changeLkpdZoom = changeLkpdZoom;

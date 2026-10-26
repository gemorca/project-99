import { requireStudentAuth, setButtonLoading, showToast, toastSubmitResult } from '../components/modal.js';
import { markDraftForClear } from '../services/outbox-status.js';
import { CACHE_KEY } from '../config.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { state } from '../state.js';
import { escapeHtml as e, jsArg, safeUrl } from '../services/html.js';

export function getYoutubeEmbedUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/
  ];
  for (const re of patterns) {
    const match = trimmed.match(re);
    if (match && match[1]) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return '';
}

export function renderLkpdView(ptmId) {
  const lkpdObj = (state.cachedData.lkpd || []).find((l) => l.id_pertemuan === ptmId && l.status === 'Publish');
  if (!lkpdObj) return `<div class="p-8 text-center text-slate-400">LKPD belum tersedia pada pertemuan ini.</div>`;

  let questions = [];
  try {
    questions = typeof lkpdObj.soal_json === 'string' ? JSON.parse(lkpdObj.soal_json) : lkpdObj.soal_json || [];
  } catch (e) {
    questions = [];
  }
  if (!Array.isArray(questions)) questions = [];

  const questionCount = Math.max(questions.length, 1);
  const isiTeks = lkpdObj.isi_teks || '';
  const pdfUrl = safeUrl(lkpdObj.file_pdf_url);
  const hasPdfOverlay = Boolean(lkpdObj.peta_field_json && lkpdObj.file_pdf_url);
  const isPdfLkpd = lkpdObj.tipe_lkpd === 'pdf_interaktif' || Boolean(lkpdObj.file_pdf_url);
  const videoEmbedUrl = getYoutubeEmbedUrl(lkpdObj.video_url || '');

  return `
    <div class="max-w-4xl mx-auto space-y-4 text-xs">
      <div class="bg-white p-5 rounded-3xl border shadow-sm space-y-3">
        <div class="flex items-center justify-between border-b pb-2">
          <h3 class="font-black text-brand-navy text-sm font-heading">${e(lkpdObj.judul_lkpd)}</h3>
          <span class="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold">
            ${isPdfLkpd ? 'Form PDF Interaktif Overlay' : 'Modul LKPD Manual Teks'}
          </span>
        </div>
        <p class="text-slate-600 font-medium leading-relaxed">${e(lkpdObj.instruksi)}</p>
      </div>

      ${videoEmbedUrl
      ? `
      <div class="bg-white p-5 rounded-3xl border shadow-sm space-y-2">
        <h4 class="font-black text-brand-navy border-b pb-2">🎬 Video Bahan Ajar</h4>
        <div class="rounded-2xl overflow-hidden border bg-black aspect-video">
          <iframe src="${videoEmbedUrl}" class="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>
      </div>
      `
      : ''
    }

      ${isPdfLkpd
      ? hasPdfOverlay
        ? `
        <div class="bg-white p-5 rounded-3xl border shadow-sm space-y-4">
          <div class="border-b pb-2">
            <h4 class="font-black text-brand-navy">Form Isian PDF Interaktif</h4>
            <p class="text-[11px] text-slate-500 font-medium">Ketik jawaban langsung pada lembar kerja PDF</p>
          </div>
          <div id="siswa-lkpd-overlay-container" class="overflow-x-auto flex justify-center bg-slate-100 p-3 rounded-2xl border"></div>
        </div>
      `
        : `
        <div class="bg-amber-50 border border-amber-200 p-5 rounded-3xl shadow-sm space-y-3">
          <div class="flex items-center gap-2 text-amber-800 font-bold">
            <h4>Peta Area Isian Belum Dikonfigurasi Guru</h4>
          </div>
          <p class="text-amber-700 font-medium leading-relaxed text-xs">
            Dokumen PDF LKPD sudah diunggah, namun area isian interaktif belum dipetakan oleh guru.
          </p>
          ${pdfUrl
          ? `
            <div class="bg-slate-900 rounded-2xl overflow-hidden h-[500px] border mt-2">
              <iframe src="${e(pdfUrl)}" class="w-full h-full border-0" allow="fullscreen"></iframe>
            </div>
          `
          : ''
        }
        </div>
      `
      : ''
    }

      ${!isPdfLkpd && isiTeks
      ? `
        <div class="bg-white p-5 rounded-3xl border shadow-sm space-y-3">
          <h4 class="font-black text-brand-navy border-b pb-2">Material Teks LKPD</h4>
          <div class="prose max-w-none text-slate-800 leading-relaxed font-medium bg-slate-50 p-4 rounded-2xl border whitespace-pre-line text-xs">
            ${e(isiTeks)}
          </div>
        </div>
      `
      : ''
    }

      ${!isPdfLkpd
      ? `
      <div class="bg-white p-5 rounded-3xl border shadow-sm space-y-4">
        <h4 class="font-black text-brand-navy border-b pb-2">Form Jawaban Teks LKPD</h4>
        ${questions.length > 0
        ? questions
          .map(
            (q, idx) => `
          <div class="space-y-1.5 p-3 rounded-2xl bg-slate-50 border">
            <label class="block font-bold text-slate-800">${idx + 1}. ${e(q)}</label>
            <textarea id="lkpd-ans-${idx}" oninput="saveLkpdDraft(${jsArg(ptmId)}, ${questionCount})" rows="3" class="w-full p-3 rounded-xl border bg-white text-xs" placeholder="Tuliskan jawaban kamu..."></textarea>
          </div>
        `
          )
          .join('')
        : `
          <textarea id="lkpd-ans-0" oninput="saveLkpdDraft(${jsArg(ptmId)}, ${questionCount})" rows="6" class="w-full p-3 rounded-xl border bg-white text-xs" placeholder="Tuliskan jawaban lengkap kamu..."></textarea>
        `
      }
      </div>
      <button id="btn-submit-lkpd-siswa" onclick="requireStudentAuth(() => submitLkpdSiswa(${jsArg(ptmId)}, ${jsArg(lkpdObj.id_lkpd)}, ${questionCount}))" class="w-full py-3.5 bg-brand-emerald text-white font-black rounded-2xl shadow hover:bg-emerald-600 transition">
        Kirim Jawaban LKPD Manual
      </button>
      `
      : ''
    }
    </div>
  `;
}

export function saveLkpdDraft(ptmId, questionCount) {
  const username = state.currentUser ? state.currentUser.username : 'guest';
  const draftKey = `${CACHE_KEY}_DRAFT_${ptmId}_${username}`;
  const answers = [];
  for (let i = 0; i < questionCount; i++) {
    answers.push(document.getElementById(`lkpd-ans-${i}`)?.value || '');
  }
  localStorage.setItem(draftKey, JSON.stringify({ answers, timestamp: new Date().toISOString() }));
}

export function loadLkpdDraft(ptmId, questionCount) {
  const username = state.currentUser ? state.currentUser.username : 'guest';
  const draftKey = `${CACHE_KEY}_DRAFT_${ptmId}_${username}`;
  try {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && Array.isArray(parsed.answers)) {
        parsed.answers.forEach((ans, idx) => {
          const elem = document.getElementById(`lkpd-ans-${idx}`);
          if (elem) elem.value = ans;
        });
        showToast('info', 'Draft pengerjaan dipulihkan!');
      }
    }
  } catch (e) {
    console.error('Gagal memulihkan draft:', e);
  }
}

export function clearLkpdDraft(ptmId) {
  const username = state.currentUser ? state.currentUser.username : 'guest';
  const draftKey = `${CACHE_KEY}_DRAFT_${ptmId}_${username}`;
  localStorage.removeItem(draftKey);
}

export async function submitLkpdSiswa(ptmId, idLkpd, questionCount) {
  const user = state.currentUser;
  let answers = [];
  for (let i = 0; i < questionCount; i++) {
    answers.push(document.getElementById(`lkpd-ans-${i}`)?.value || '');
  }

  const btn = document.getElementById('btn-submit-lkpd-siswa');
  setButtonLoading(btn, true, '🚀 Mengirim LKPD...', 'Kirim Jawaban LKPD Manual');

  const res = await apiPost({
    action: 'submit_lkpd',
    id_pertemuan: ptmId,
    id_lkpd: idLkpd,
    username_siswa: user.username,
    nama_siswa: user.name,
    kelas: user.kelas,
    jawaban_json: answers
  });

  setButtonLoading(btn, false, '', 'Kirim Jawaban LKPD Manual');
  if (res.success) {
    if (res.queued) {
      markDraftForClear(`${CACHE_KEY}_DRAFT_${ptmId}_${user.username}`);
    } else {
      clearLkpdDraft(ptmId);
      await fetchAllInitialData(true);
    }
    toastSubmitResult(res, 'Jawaban LKPD Berhasil Terkirim!');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Mengirim', text: res.message });
  }
}

window.saveLkpdDraft = saveLkpdDraft;
window.submitLkpdSiswa = submitLkpdSiswa;

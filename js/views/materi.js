import { switchView } from '../components/drawer.js';
import { openPdfFullscreen, requireStudentAuth, setButtonLoading, showToast } from '../components/modal.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { state } from '../state.js';

export function renderMateriView(ptmId) {
  const materiList = (state.cachedData.materi || []).filter(
    (m) => m.id_pertemuan === ptmId && m.status === 'Publish'
  );
  if (materiList.length === 0)
    return `<div class="p-8 text-center text-slate-400">Belum ada bahan ajar pada pertemuan ini.</div>`;

  const allReviews = state.cachedData.reviews || [];

  return `
    <div class="max-w-4xl mx-auto space-y-6 text-xs">
      ${materiList
      .map((m) => {
        const mReviews = allReviews.filter((r) => String(r.id_materi) === String(m.id_materi));
        const totalRating = mReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
        const avgRating = mReviews.length > 0 ? (totalRating / mReviews.length).toFixed(1) : '0.0';

        return `
        <div class="bg-white p-5 rounded-3xl border shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b pb-2">
            <h3 class="font-black text-brand-navy text-sm font-heading">${m.judul_materi}</h3>
            <span class="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 font-bold rounded-full text-[11px] flex items-center gap-1">
              ⭐ ${avgRating} <span class="text-slate-400 font-normal">(${mReviews.length} ulasan)</span>
            </span>
          </div>

          ${m.isi_teks ? `<p class="text-slate-700 leading-relaxed font-medium whitespace-pre-line">${m.isi_teks}</p>` : ''}

          ${m.tipe_media === 'pdf_document' && m.file_pdf_url
            ? `
            <div class="space-y-2 mt-2">
              <div class="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-2xl">
                <span class="font-bold text-brand-navy text-[11px]">📄 Dokumen Bahan Ajar PDF</span>
                <div class="flex items-center gap-1.5">
                  <button onclick="openPdfFullscreen('${m.file_pdf_url}', '${m.judul_materi}')" class="px-3 py-1.5 bg-brand-navy hover:bg-slate-800 text-white font-bold rounded-xl text-[11px] transition shadow">
                    🖥️ Layar Penuh (Fullscreen)
                  </button>
                  <a href="${m.file_pdf_url.replace('/preview', '/view')}" target="_blank" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-[11px] transition">
                    🔗 Tab Baru
                  </a>
                </div>
              </div>
              <div class="bg-slate-900 rounded-2xl overflow-hidden h-[550px] relative border">
                <iframe src="${m.file_pdf_url}" class="w-full h-full border-0" allow="fullscreen"></iframe>
              </div>
            </div>
            `
            : ''
          }

          <div class="pt-4 border-t space-y-3">
            <h4 class="font-black text-brand-navy text-xs flex items-center gap-1">
              <span>💬 Ulasan & Rating Siswa</span>
            </h4>

            <div class="p-3 bg-slate-50 border rounded-2xl space-y-2">
              <span class="font-bold text-slate-700 block text-[11px]">Beri Penilaian Bahan Ajar Ini:</span>
              <div class="flex items-center gap-2">
                <select id="review-rating-${m.id_materi}" class="p-2 bg-white border rounded-xl font-bold text-amber-600 text-xs">
                  <option value="5">⭐⭐⭐⭐⭐ (5 - Sangat Sangat Jelas)</option>
                  <option value="4">⭐⭐⭐⭐ (4 - Jelas & Mudah Dipahami)</option>
                  <option value="3">⭐⭐⭐ (3 - Cukup Jelas)</option>
                  <option value="2">⭐⭐ (2 - Kurang Jelas)</option>
                  <option value="1">⭐ (1 - Sulit Dipahami)</option>
                </select>
              </div>
              <textarea id="review-komentar-${m.id_materi}" rows="2" placeholder="Tuliskan umpan balik atau tanggapan kamu terhadap materi ini..." class="w-full p-2.5 rounded-xl border bg-white text-xs font-medium focus:ring-2 focus:ring-brand-blue focus:outline-none"></textarea>
              <div class="flex justify-end">
                <button id="btn-submit-review-${m.id_materi}" onclick="submitReviewMateri('${m.id_materi}', '${ptmId}')" class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl shadow transition text-xs">
                  💬 Kirim Ulasan
                </button>
              </div>
            </div>

            <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
              ${mReviews.length === 0
                ? `<p class="text-slate-400 italic text-[11px] text-center py-2">Belum ada ulasan untuk materi ini. Jadilah yang pertama memberikan penilaian!</p>`
                : mReviews
                  .map(
                    (r) => `
                    <div class="p-3 bg-white border rounded-2xl space-y-1 shadow-2xs">
                      <div class="flex items-center justify-between">
                        <span class="font-bold text-brand-navy text-[11px]">${r.nama_siswa || 'Siswa'}</span>
                        <span class="text-amber-500 font-bold text-[10px]">${'⭐'.repeat(Number(r.rating || 5))}</span>
                      </div>
                      <p class="text-slate-600 font-medium text-[11px]">${r.komentar || ''}</p>
                    </div>
                  `
                  )
                  .join('')
              }
            </div>
          </div>
        </div>
      `;
      })
      .join('')}
    </div>
  `;
}

export async function submitReviewMateri(idMateri, ptmId) {
  if (!state.currentUser) {
    requireStudentAuth();
    return;
  }

  const ratingElem = document.getElementById(`review-rating-${idMateri}`);
  const commentElem = document.getElementById(`review-komentar-${idMateri}`);
  const btn = document.getElementById(`btn-submit-review-${idMateri}`);

  const rating = ratingElem ? Number(ratingElem.value) : 5;
  const komentar = commentElem ? commentElem.value.trim() : '';

  if (!komentar) {
    showToast('warning', 'Tuliskan komentar atau ulasan kamu terlebih dahulu!');
    return;
  }

  setButtonLoading(btn, true, 'Mengirim...', '💬 Kirim Ulasan');

  const res = await apiPost({
    action: 'save_review',
    id_materi: idMateri,
    username_siswa: state.currentUser.username,
    nama_siswa: state.currentUser.name,
    rating: rating,
    komentar: komentar
  });

  setButtonLoading(btn, false, '', '💬 Kirim Ulasan');

  if (res.success) {
    showToast('success', 'Ulasan berhasil dikirim!');
    await fetchAllInitialData(true);
    switchView('materi-ptm', ptmId);
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Mengirim Ulasan', text: res.message });
  }
}

window.submitReviewMateri = submitReviewMateri;

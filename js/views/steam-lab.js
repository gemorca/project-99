import { clearStandaloneCanvas, downloadSteamCanvasImage, setStandaloneCanvasColor, setStandaloneCanvasSize, undoStandaloneCanvas } from '../components/canvas-steam.js';
import { requireStudentAuth, showLoading, showToast } from '../components/modal.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { state } from '../state.js';
import { escapeHtml as e } from '../services/html.js';

export function renderRuangSteamView() {
  const userKelas = state.currentUser?.kelas || 'ALL';
  const allLkpd = state.cachedData.lkpd || [];

  const pertemuanList = (state.cachedData.pertemuan || [])
    .filter((p) => {
      const isPublishedAndClassMatch = p.status === 'Publish' && (p.id_kelas === 'ALL' || p.id_kelas === userKelas);
      if (!isPublishedAndClassMatch) return false;

      return allLkpd.some(
        (l) =>
          l.id_pertemuan === p.id_pertemuan &&
          l.status === 'Publish' &&
          (l.fitur_kanvas === 'TRUE' || l.fitur_kanvas === true)
      );
    })
    .sort((a, b) => Number(a.nomor_pertemuan) - Number(b.nomor_pertemuan));

  const optionsHtml =
    pertemuanList.length > 0
      ? pertemuanList
        .map((p) => `<option value="${e(p.id_pertemuan)}">Pertemuan ${e(p.nomor_pertemuan)}: ${e(p.judul_pertemuan)}</option>`)
        .join('')
      : '<option value="">-- Belum ada pertemuan STEAM aktif --</option>';

  const defaultPtm = pertemuanList[0] || null;

  return `
    <div class="max-w-5xl mx-auto space-y-5 text-xs">
      <div class="bg-gradient-to-r from-purple-900 via-brand-navy to-blue-900 text-white p-6 rounded-3xl shadow-xl space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-800/60 pb-3">
          <div>
            <span class="px-3 py-1 bg-purple-500/30 text-purple-200 border border-purple-400/30 rounded-full text-[10px] uppercase font-mono font-bold">
              Laboratorium Kreatif & Eksperimen
            </span>
            <h2 class="text-xl sm:text-2xl font-black font-heading mt-1">RUANG EKSPERIMEN STEAM</h2>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="downloadSteamCanvasImage()" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 transition">
              💾 Unduh PNG
            </button>
            <button id="btn-submit-steam-lab" onclick="requireStudentAuth(() => submitSteamLabToTeacher())" class="px-4 py-2 bg-brand-emerald hover:bg-emerald-600 text-white font-black rounded-xl shadow transition">
              🚀 Kirim ke Guru
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-center bg-slate-900/80 p-3.5 rounded-2xl border border-purple-500/30">
          <div>
            <label class="block font-black text-brand-yellow uppercase text-[10px] tracking-wider mb-1">
              Fokus Pertemuan Modul:
            </label>
            <select id="steam-select-pertemuan" onchange="updateSteamPertemuanInfo(this.value)" class="w-full p-2.5 rounded-xl border-0 bg-slate-800 text-white font-bold text-xs focus:ring-2 focus:ring-purple-400 focus:outline-none">
              ${optionsHtml}
            </select>
          </div>
          <div class="md:col-span-2 text-slate-300 text-[11px] border-t md:border-t-0 md:border-l border-slate-700 pt-2 md:pt-0 md:pl-3">
            <span class="font-bold text-white block">Capaian & Fokus Topik:</span>
            <p id="steam-pertemuan-deskripsi" class="text-slate-300 font-medium mt-0.5">
              ${defaultPtm
      ? e(defaultPtm.deskripsi || 'Silakan pilih modul pertemuan di samping.')
      : 'Belum ada modul STEAM aktif yang tersedia.'
    }
            </p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div class="lg:col-span-2 bg-white p-5 rounded-3xl border shadow-sm space-y-4">
          <div class="flex items-center justify-between border-b pb-3">
            <h3 class="font-black text-brand-navy text-sm font-heading">Kanvas Lukis & Prototyping</h3>
            <span id="steam-canvas-badge-ptm" class="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold">
              ${defaultPtm ? `Pertemuan ${defaultPtm.nomor_pertemuan}` : 'Mode Bebas'}
            </span>
          </div>

          <div class="p-3 bg-slate-50 border rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-bold text-slate-500 mr-1">Warna:</span>
              <button onclick="setStandaloneCanvasColor('#0B2545')" class="w-6 h-6 rounded-full bg-brand-navy border-2 border-white shadow-xs hover:scale-110 transition" title="Biru Tua"></button>
              <button onclick="setStandaloneCanvasColor('#EF4444')" class="w-6 h-6 rounded-full bg-red-500 border-2 border-white shadow-xs hover:scale-110 transition" title="Merah"></button>
              <button onclick="setStandaloneCanvasColor('#10B981')" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-white shadow-xs hover:scale-110 transition" title="Hijau"></button>
              <button onclick="setStandaloneCanvasColor('#6B38FB')" class="w-6 h-6 rounded-full bg-purple-600 border-2 border-white shadow-xs hover:scale-110 transition" title="Ungu"></button>
              <button onclick="setStandaloneCanvasColor('#F59E0B')" class="w-6 h-6 rounded-full bg-amber-500 border-2 border-white shadow-xs hover:scale-110 transition" title="Kuning"></button>
              <button onclick="setStandaloneCanvasColor('#000000')" class="w-6 h-6 rounded-full bg-black border-2 border-white shadow-xs hover:scale-110 transition" title="Hitam"></button>
              <button onclick="setStandaloneCanvasColor('#FFFFFF')" class="w-6 h-6 rounded-full bg-white border-2 border-slate-300 shadow-xs hover:scale-110 transition flex items-center justify-center text-[9px]" title="Penghapus">🧹</button>
            </div>

            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-bold text-slate-500">Kuas:</span>
              <button onclick="setStandaloneCanvasSize(2)" class="px-2 py-0.5 bg-white border rounded-lg text-[10px] font-bold hover:bg-slate-100">Halus</button>
              <button onclick="setStandaloneCanvasSize(5)" class="px-2 py-0.5 bg-white border rounded-lg text-[10px] font-bold hover:bg-slate-100">Sedang</button>
              <button onclick="setStandaloneCanvasSize(10)" class="px-2 py-0.5 bg-white border rounded-lg text-[10px] font-bold hover:bg-slate-100">Tebal</button>
            </div>

            <div class="flex items-center gap-1.5">
              <button onclick="undoStandaloneCanvas()" class="px-3 py-1 bg-amber-100 text-amber-800 font-bold rounded-xl text-[10px] hover:bg-amber-200 transition">Undo</button>
              <button onclick="clearStandaloneCanvas()" class="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-xl text-[10px] hover:bg-red-200 transition">Clear</button>
            </div>
          </div>

          <div class="border-2 border-dashed border-slate-300 bg-white rounded-3xl overflow-hidden shadow-inner">
            <canvas id="ruang-steam-canvas" class="w-full h-[380px] cursor-crosshair touch-none bg-white"></canvas>
          </div>
        </div>

        <div class="bg-white p-5 rounded-3xl border shadow-sm space-y-4">
          <h3 class="font-black text-brand-navy text-sm font-heading border-b pb-2">Catatan Ide Proyek</h3>

          <div class="space-y-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Judul / Topik Eksperimen</label>
              <input type="text" id="steam-note-title" placeholder="Contoh: Rancangan Katrol Sederhana" class="w-full p-2.5 rounded-xl border font-bold text-brand-navy focus:ring-2 focus:ring-purple-500 focus:outline-none" />
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Konsep Science & Technology</label>
              <textarea id="steam-note-science" rows="2" placeholder="Jelaskan fenomena sains/teknologi yang melandasi gambar kamu..." class="w-full p-2.5 rounded-xl border text-[11px] font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"></textarea>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Konsep Engineering & Math</label>
              <textarea id="steam-note-engineering" rows="2" placeholder="Jelaskan rancangan struktur, ukuran, atau perhitungan matematika..." class="w-full p-2.5 rounded-xl border text-[11px] font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none"></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function updateSteamPertemuanInfo(ptmId) {
  const ptmList = state.cachedData.pertemuan || [];
  const ptm = ptmList.find((p) => p.id_pertemuan === ptmId);

  const descElem = document.getElementById('steam-pertemuan-deskripsi');
  const badgeElem = document.getElementById('steam-canvas-badge-ptm');
  const sciTextarea = document.getElementById('steam-note-science');
  const engTextarea = document.getElementById('steam-note-engineering');

  if (ptm) {
    if (descElem) descElem.textContent = ptm.deskripsi || 'Tidak ada deskripsi khusus.';
    if (badgeElem) badgeElem.textContent = `Pertemuan ${ptm.nomor_pertemuan}`;
    if (sciTextarea) sciTextarea.placeholder = ptm.prompt_science || 'Jelaskan fenomena sains/teknologi yang melandasi gambar kamu...';
    if (engTextarea) engTextarea.placeholder = ptm.prompt_engineering || 'Jelaskan rancangan struktur, ukuran, atau perhitungan matematika...';
  } else {
    if (descElem) descElem.textContent = 'Pilih modul pertemuan di atas.';
    if (badgeElem) badgeElem.textContent = 'Mode Bebas';
  }
}

export async function submitSteamLabToTeacher() {
  const ptmId = document.getElementById('steam-select-pertemuan')?.value;
  if (!ptmId) {
    showToast('warning', 'Pilih pertemuan target terlebih dahulu!');
    return;
  }

  const title = document.getElementById('steam-note-title')?.value || 'Sketsa Eksperimen STEAM';
  const sci = document.getElementById('steam-note-science')?.value || '';
  const eng = document.getElementById('steam-note-engineering')?.value || '';

  const canvas = document.getElementById('ruang-steam-canvas');
  const canvasBase64 = canvas ? canvas.toDataURL('image/jpeg', 0.6) : '';

  Swal.fire({
    title: '🚀 Mengirim Karya STEAM...',
    html: 'Mohon tunggu sebentar, sistem sedang mengunggah sketsa dan catatan proyek kamu ke guru.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  const res = await apiPost({
    action: 'submit_lkpd',
    id_pertemuan: ptmId,
    username_siswa: state.currentUser.username,
    nama_siswa: state.currentUser.name,
    kelas: state.currentUser.kelas,
    jawaban_json: [
      `[RUANG STEAM LAB] Judul: ${title}`,
      `Science & Tech: ${sci}`,
      `Engineering & Math: ${eng}`
    ],
    canvas_image_base64: canvasBase64
  });

  if (res.success) {
    if (!res.queued) await fetchAllInitialData(true);
    Swal.fire({
      icon: 'success',
      title: res.queued ? 'Tersimpan di Perangkat! 📥' : 'Berhasil Terkirim! 🎉',
      html: `
        <div class="text-xs text-slate-600 space-y-2 mt-2">
          <p>${res.queued ? 'Karya tersimpan di perangkat dan dikirim otomatis ke guru saat koneksi tersedia.' : 'Karya proyek dan sketsa canvas kamu telah berhasil diterima oleh guru.'}</p>
          <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl font-bold text-emerald-800 text-left">
            📌 <b>Judul:</b> ${e(title)}<br>
            👤 <b>Siswa:</b> ${e(state.currentUser.name)} (${e(state.currentUser.kelas)})
          </div>
        </div>
      `,
      confirmButtonText: 'Mantap, Terima Kasih!',
      confirmButtonColor: '#10B981'
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Gagal Mengirim Karya',
      text: res.message || 'Terjadi kesalahan koneksi saat mengirim data.'
    });
  }
}

window.updateSteamPertemuanInfo = updateSteamPertemuanInfo;
window.submitSteamLabToTeacher = submitSteamLabToTeacher;

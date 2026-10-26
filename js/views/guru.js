import { switchView } from '../components/drawer.js';
import { closeLoading, setButtonLoading, showConfirm, showLoading, showToast } from '../components/modal.js';
import { openModalPetakanFieldGuru } from '../components/pdf-overlay.js';
import { collectHotspotItem, renderHotspotConfigForm, renderHotspotItemRow } from '../games/hotspot.js';
import { apiPost, fetchAllInitialData, refreshSubmissionsData, saveToLocalStorage } from '../services/api.js';
import { state } from '../state.js';
import { jsArg } from '../services/html.js';
import { labelGame, labelLkpdTipe, labelMedia } from '../services/labels.js';
import { buildRekap, buildRingkasanSiswa, csvDetailSubmisi, csvRekapMatriks, escapeHtml, filterSiswa, filterSubmisi, getNilaiSubmisi, KOLOM_TIPE, labelModul, labelTipe, statistikKelas } from '../services/nilai.js';
import { populateKelasSelects } from '../views/admin.js';

const koreksiFilter = { q: '', kelas: '', ptm: '', pending: false };
let koreksiDetailKey = null;

export function renderGuruPertemuanView(container) {
  const ptmList = state.cachedData.pertemuan || [];
  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex items-center justify-between bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Total Modul Pertemuan: <b>${ptmList.length}</b></span>
        <button onclick="openPertemuanModal()" class="px-4 py-2 bg-brand-blue text-white font-bold rounded-xl shadow">+ Tambah Pertemuan</button>
      </div>
      <div class="space-y-2">
        ${ptmList
      .map(
        (p) => `
          <div class="bg-white p-4 rounded-3xl border flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 bg-blue-100 text-brand-blue font-black rounded-full text-[10px]">Pertemuan ${p.nomor_pertemuan}</span>
              <h4 class="font-black text-brand-navy text-xs mt-1">${escapeHtml(p.judul_pertemuan)}</h4>
              <p class="text-slate-500 text-[11px]">${escapeHtml(p.deskripsi)}</p>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="openPertemuanModal(${jsArg(p.id_pertemuan)})" class="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold hover:bg-amber-200 transition">Edit</button>
              <button onclick="deletePertemuan(${jsArg(p.id_pertemuan)})" class="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Hapus</button>
            </div>
          </div>
        `
      )
      .join('')}
      </div>
    </div>
  `;
}

export function renderGuruMateriView(container) {
  const materiList = state.cachedData.materi || [];
  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex items-center justify-between bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Total Bahan Ajar: <b>${materiList.length}</b></span>
        <button onclick="openMateriModal()" class="px-4 py-2 bg-brand-blue text-white font-bold rounded-xl shadow">+ Tambah Bahan Ajar</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${materiList
      .map(
        (m) => `
          <div class="bg-white p-4 rounded-3xl border flex flex-col justify-between space-y-2">
            <div>
              <span class="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold text-[10px] rounded-full">${escapeHtml(labelMedia(m.tipe_media))}</span>
              <h4 class="font-black text-brand-navy mt-1">${escapeHtml(m.judul_materi)}</h4>
            </div>
            <div class="flex justify-end gap-1 pt-2 border-t">
              <button onclick="openMateriModal(${jsArg(m.id_materi)})" class="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold hover:bg-amber-200 transition">Edit</button>
              <button onclick="deleteMateri(${jsArg(m.id_materi)})" class="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Hapus</button>
            </div>
          </div>
        `
      )
      .join('')}
      </div>
    </div>
  `;
}

export function renderGuruLkpdView(container) {
  const lkpdList = state.cachedData.lkpd || [];
  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex items-center justify-between bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Total LKPD Aktif: <b>${lkpdList.length}</b></span>
        <button onclick="openLkpdModal()" class="px-4 py-2 bg-brand-blue text-white font-bold rounded-xl shadow">+ Buat LKPD Baru</button>
      </div>
      <div class="space-y-2">
        ${lkpdList
      .map(
        (l) => `
          <div class="bg-white p-4 rounded-3xl border flex items-center justify-between gap-3">
            <div>
              <span class="px-2 py-0.5 bg-blue-100 text-brand-blue font-bold text-[10px] rounded-full uppercase">${escapeHtml(labelLkpdTipe(l.tipe_lkpd))}</span>
              <h4 class="font-black text-brand-navy mt-1">${escapeHtml(l.judul_lkpd)}</h4>
              <p class="text-slate-500">${escapeHtml(l.instruksi)}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
              ${l.file_pdf_url
            ? `<button onclick="openModalPetakanFieldGuru(${jsArg(l.id_lkpd)})" class="px-3 py-1 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition shadow">🗺️ Petakan Field</button>`
            : ''
          }
              <button onclick="openLkpdModal(${jsArg(l.id_lkpd)})" class="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold hover:bg-amber-200 transition">Edit</button>
              <button onclick="deleteLkpd(${jsArg(l.id_lkpd)})" class="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Hapus</button>
            </div>
          </div>
        `
      )
      .join('')}
      </div>
    </div>
  `;
}

export function renderGuruGameView(container) {
  const gamesList = state.cachedData.games || [];
  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex items-center justify-between bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Total Game Aktif: <b>${gamesList.length}</b></span>
        <button onclick="openGameModal()" class="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl shadow">+ Konfigurasi Game</button>
      </div>
      <div class="space-y-2">
        ${gamesList
      .map(
        (g) => `
          <div class="bg-white p-4 rounded-3xl border flex items-center justify-between">
            <div>
              <span class="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold text-[10px] rounded-full uppercase">${escapeHtml(labelGame(g.tipe_game))}</span>
              <h4 class="font-black text-brand-navy mt-1">${escapeHtml(g.judul_game)}</h4>
              <p class="text-slate-500">${escapeHtml(g.instruksi)}</p>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="openGameModal(${jsArg(g.id_game)})" class="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold hover:bg-amber-200 transition">Edit</button>
              <button onclick="deleteGame(${jsArg(g.id_game)})" class="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Hapus</button>
            </div>
          </div>
        `
      )
      .join('')}
      </div>
    </div>
  `;
}

export function renderGuruSoalView(container) {
  const soalList = state.cachedData.soal_evaluasi || [];
  const evalList = state.cachedData.evaluasi || [];
  const ptmList = state.cachedData.pertemuan || [];

  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Bank Soal Evaluasi: <b>${soalList.length} Soal</b></span>
        <div class="flex items-center gap-2">
          <button onclick="openEvaluasiModal()" class="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition">
            ⚙️ Kelola Modul & Durasi Kuis
          </button>
          <button onclick="openSoalModal()" class="px-3.5 py-2 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl shadow transition">
            + Tambah Soal PG
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="font-black text-brand-navy text-xs font-heading">📌 Modul Evaluasi Per Pertemuan:</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${evalList.length === 0
            ? `<div class="p-4 bg-white rounded-2xl border text-slate-400 italic">Belum ada modul evaluasi yang dibuat.</div>`
            : evalList.map((ev) => {
                const ptmObj = ptmList.find((p) => String(p.id_pertemuan) === String(ev.id_pertemuan));
                const labelPertemuan = ptmObj ? `Pertemuan ${ptmObj.nomor_pertemuan}` : 'Pertemuan -';
                const jumlahSoal = soalList.filter((s) => String(s.id_evaluasi) === String(ev.id_evaluasi)).length;
                const isDraft = String(ev.status || '').trim() === 'Draft';

                return `
                  <div class="bg-white p-4 rounded-3xl border flex items-center justify-between shadow-xs">
                    <div>
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="px-2.5 py-0.5 bg-purple-50 text-purple-700 font-bold text-[10px] rounded-full border border-purple-200">
                          📌 ${labelPertemuan}
                        </span>
                        <span class="px-2.5 py-0.5 bg-blue-50 text-brand-blue font-bold text-[10px] rounded-full border border-blue-200">
                          ⏳ Durasi: ${ev.durasi_menit || 30} Menit
                        </span>
                        <span class="px-2.5 py-0.5 bg-slate-50 text-slate-600 font-bold text-[10px] rounded-full border border-slate-200">
                          📝 ${jumlahSoal} Soal
                        </span>
                        <span class="px-2.5 py-0.5 font-bold text-[10px] rounded-full border ${isDraft ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}">
                          ${isDraft ? 'Draft' : 'Publish'}
                        </span>
                      </div>
                      <h4 class="font-black text-brand-navy mt-1.5 text-xs">${escapeHtml(ev.judul_evaluasi)}</h4>
                    </div>
                    <div class="flex flex-col gap-1.5 shrink-0 ml-2">
                      <button onclick="openEvaluasiModal(${jsArg(ev.id_evaluasi)})" class="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-xl font-bold hover:bg-amber-200 transition text-[11px]">
                        Edit ✏️
                      </button>
                      <button onclick="deleteEvaluasi(${jsArg(ev.id_evaluasi)})" class="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 transition text-[11px]">
                        Hapus 🗑️
                      </button>
                    </div>
                  </div>
                `;
              }).join('')
          }
        </div>
      </div>

      <div class="space-y-2 pt-2">
        <h4 class="font-black text-brand-navy text-xs font-heading">📝 Daftar Soal Pilihan Ganda:</h4>
        ${soalList.length === 0
          ? `<div class="p-4 bg-white rounded-2xl border text-slate-400 italic">Belum ada soal dalam bank soal.</div>`
          : soalList
            .map(
              (s, idx) => {
                const evObj = evalList.find((ev) => String(ev.id_evaluasi) === String(s.id_evaluasi));
                const ptmObjOfSoal = evObj ? ptmList.find((p) => String(p.id_pertemuan) === String(evObj.id_pertemuan)) : null;
                const soalPtmLabel = ptmObjOfSoal ? `Pertemuan ${ptmObjOfSoal.nomor_pertemuan}` : (evObj ? 'Modul Evaluasi' : 'Umum');

                return `
                  <div class="bg-white p-4 rounded-3xl border space-y-1">
                    <div class="flex items-center justify-between border-b pb-1 gap-2">
                      <div class="flex items-center gap-2">
                        <span class="font-black text-brand-navy">#${idx + 1} Kunci:${escapeHtml(s.kunci_jawaban)}</span>
                        <span class="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[9px] rounded-md border border-slate-200">
                          📌 ${soalPtmLabel}
                        </span>
                      </div>
                      <div class="flex items-center gap-1">
                        <button onclick="openSoalModal(${jsArg(s.id_soal)})" class="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold hover:bg-amber-200 transition">Edit</button>
                        <button onclick="deleteSoal(${jsArg(s.id_soal)})" class="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Hapus</button>
                      </div>
                    </div>
                    <p class="font-bold text-slate-800">${escapeHtml(s.pertanyaan)}</p>
                  </div>
                `;
              }
            )
            .join('')}
      </div>
    </div>
  `;
}

export function renderGuruKoreksiView(container) {
  const subs = state.cachedData.submissions || [];
  const kelasList = Array.from(new Set(subs.map((s) => String(s.kelas || '').trim()).filter(Boolean))).sort();
  const ptmList = (state.cachedData.pertemuan || [])
    .slice()
    .sort((a, b) => Number(a.nomor_pertemuan) - Number(b.nomor_pertemuan));
  const inputCls = 'p-2.5 rounded-xl border border-slate-300 font-bold bg-white';

  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-4 rounded-2xl border shadow-xs">
        <span id="koreksi-total" class="font-bold text-slate-700"></span>
        <button onclick="refreshSubmissionsData()" class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl shadow transition flex items-center gap-1.5">
          <span>🔄</span> Refresh Data Submisi
        </button>
      </div>

      <div class="bg-white p-4 rounded-2xl border shadow-xs grid grid-cols-2 lg:grid-cols-4 gap-2">
        <input type="search" placeholder="Cari nama siswa..." value="${escapeHtml(koreksiFilter.q)}" oninput="setKoreksiFilter('q', this.value)" class="${inputCls} col-span-2 lg:col-span-1" />
        <select onchange="setKoreksiFilter('kelas', this.value)" class="${inputCls}">
          <option value="">Semua Kelas</option>
          ${kelasList.map((k) => `<option value="${escapeHtml(k)}" ${koreksiFilter.kelas === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
        </select>
        <select onchange="setKoreksiFilter('ptm', this.value)" class="${inputCls}">
          <option value="">Semua Pertemuan</option>
          ${ptmList.map((p) => `<option value="${escapeHtml(p.id_pertemuan)}" ${koreksiFilter.ptm === String(p.id_pertemuan) ? 'selected' : ''}>Pertemuan ${escapeHtml(p.nomor_pertemuan)}</option>`).join('')}
        </select>
        <label class="${inputCls} flex items-center gap-2 cursor-pointer">
          <input type="checkbox" ${koreksiFilter.pending ? 'checked' : ''} onchange="setKoreksiFilter('pending', this.checked)" />
          Belum dinilai saja
        </label>
      </div>

      <div class="bg-white p-5 rounded-3xl border shadow-sm">
        <h3 class="font-black text-brand-navy text-sm font-heading border-b pb-2">📥 Nilai Siswa</h3>
        <div class="overflow-x-auto mt-3">
          <table class="w-full text-left">
            <thead class="bg-brand-navy text-white font-heading">
              <tr>
                <th class="p-3">Siswa</th>
                <th class="p-3">Modul</th>
                <th class="p-3 text-center">Rata-rata</th>
                <th class="p-3">Nilai per Pertemuan</th>
                <th class="p-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody id="koreksi-list-body" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderKoreksiList();
}

function getKoreksiRingkasan() {
  let subs = state.cachedData.submissions || [];
  if (koreksiFilter.ptm) subs = subs.filter((s) => String(s.id_pertemuan || '').trim() === koreksiFilter.ptm);
  if (koreksiFilter.kelas) subs = subs.filter((s) => String(s.kelas || '').trim() === koreksiFilter.kelas);

  let list = buildRingkasanSiswa(subs);
  const q = koreksiFilter.q.trim().toLowerCase();
  if (q) list = list.filter((r) => r.nama.toLowerCase().includes(q) || r.username.toLowerCase().includes(q));
  if (koreksiFilter.pending) list = list.filter((r) => r.pending > 0);
  return list;
}

function nilaiBadge(nilai) {
  return nilai === null
    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Belum dinilai</span>'
    : `<span class="font-black text-brand-blue">${nilai}</span>`;
}

export function renderKoreksiList() {
  const body = document.getElementById('koreksi-list-body');
  if (!body) return;

  const list = getKoreksiRingkasan();
  const totalSub = list.reduce((n, r) => n + r.subs.length, 0);
  const totalPending = list.reduce((n, r) => n + r.pending, 0);
  const total = document.getElementById('koreksi-total');
  if (total) {
    total.innerHTML = `Siswa: <b>${list.length}</b> &nbsp;|&nbsp; Submisi: <b>${totalSub}</b> &nbsp;|&nbsp; Belum dinilai: <b>${totalPending}</b>`;
  }

  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400">Tidak ada data siswa yang sesuai.</td></tr>`;
    return;
  }

  body.innerHTML = list
    .map((r) => {
      const modulLabel = r.counted.length === 1 ? labelTipe(r.counted[0].tipe_sub) : `${r.counted.length} modul`;
      const pendingBadge = r.pending > 0
        ? `<span class="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">${r.pending} belum dinilai</span>`
        : '';
      const chips = r.perPertemuan
        .map((p) => `<span class="inline-block mr-1 mb-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(p.singkat)}: ${p.rata === null ? '-' : p.rata}</span>`)
        .join('');

      return `
        <tr>
          <td class="p-3"><span class="font-bold">${escapeHtml(r.nama)}</span><span class="block text-[10px] text-slate-500">${escapeHtml(r.kelas)}</span></td>
          <td class="p-3 font-mono uppercase">${escapeHtml(modulLabel)}${pendingBadge}</td>
          <td class="p-3 text-center">${nilaiBadge(r.rata)}</td>
          <td class="p-3">${chips || '-'}</td>
          <td class="p-3 text-center">
            <button onclick="openKoreksiSiswaModal(${jsArg(encodeURIComponent(r.key))})" class="px-3 py-1 bg-brand-blue text-white font-bold rounded-lg">Detail</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

export function setKoreksiFilter(key, value) {
  koreksiFilter[key] = key === 'pending' ? Boolean(value) : String(value);
  renderKoreksiList();
}

export function openKoreksiSiswaModal(encodedKey) {
  koreksiDetailKey = decodeURIComponent(encodedKey);
  renderKoreksiSiswaModal();
}

function renderKoreksiSiswaModal() {
  const r = buildRingkasanSiswa(state.cachedData.submissions || []).find((x) => x.key === koreksiDetailKey);
  if (!r) {
    closeKoreksiSiswaModal();
    return;
  }

  let modal = document.getElementById('koreksi-siswa-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'koreksi-siswa-modal';
    modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-40 hidden items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  const grupHtml = r.perPertemuan
    .map((p) => {
      const rows = p.subs
        .map((s) => {
          const nilai = getNilaiSubmisi(s);
          const dihitung = r.hitung.has(String(s.id_sub));
          const waktuStr = s.timestamp ? new Date(s.timestamp).toLocaleString('id-ID') : '-';
          return `
            <div class="p-3 bg-white rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 ${dihitung ? '' : 'opacity-60'}">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-mono font-bold text-[10px] uppercase">${escapeHtml(labelTipe(s.tipe_sub))}</span>
                  <span class="font-bold text-slate-800">${escapeHtml(labelModul(s))}</span>
                  ${dihitung ? '' : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">percobaan lama, tidak dihitung</span>'}
                </div>
                <span class="block text-[10px] text-slate-400 mt-0.5">${escapeHtml(waktuStr)} · ${escapeHtml(s.status || '-')}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                ${nilaiBadge(nilai)}
                <button onclick="openKoreksiModal(${jsArg(s.id_sub)})" class="px-3 py-1 bg-brand-blue text-white font-bold rounded-lg">Periksa</button>
                <button onclick="deleteSubmisi(${jsArg(s.id_sub)})" class="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition">Hapus</button>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="space-y-2">
          <div class="flex items-center justify-between border-b pb-1">
            <span class="font-black text-brand-navy">📌 ${escapeHtml(p.label)}${p.judul ? ` - ${escapeHtml(p.judul)}` : ''}</span>
            <span class="font-bold text-slate-600">Nilai pertemuan: ${nilaiBadge(p.rata)}</span>
          </div>
          ${rows}
        </div>
      `;
    })
    .join('');

  modal.innerHTML = `
    <div class="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
      <div class="flex items-start justify-between pb-3 border-b gap-3">
        <div>
          <h3 class="text-base font-black text-brand-navy font-heading">👤 ${escapeHtml(r.nama)}</h3>
          <p class="text-[11px] text-slate-500 font-bold mt-0.5">${escapeHtml(r.kelas)} · ${r.counted.length} modul · ${r.subs.length} submisi</p>
        </div>
        <div class="text-right shrink-0">
          <span class="block text-[10px] font-bold text-slate-500">Rata-rata semua modul</span>
          <span class="text-xl font-black">${nilaiBadge(r.rata)}</span>
        </div>
        <button onclick="closeKoreksiSiswaModal()" class="text-slate-400 font-bold text-xl hover:text-slate-700">&times;</button>
      </div>
      <div class="space-y-4">${grupHtml}</div>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeKoreksiSiswaModal() {
  koreksiDetailKey = null;
  const modal = document.getElementById('koreksi-siswa-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function deleteSubmisi(idSub) {
  const sub = (state.cachedData.submissions || []).find((s) => String(s.id_sub) === String(idSub));
  if (!sub) return;

  const tambahan = String(sub.tipe_sub || '').toLowerCase() === 'evaluasi' ? ' Siswa dapat mengerjakan evaluasi ini lagi.' : '';
  showConfirm(
    'Hapus Submisi?',
    `Jawaban ${labelTipe(sub.tipe_sub)} milik ${sub.nama_siswa || 'siswa'} dihapus permanen.${tambahan}`,
    async () => {
      showLoading('Menghapus submisi...');
      const res = await apiPost({ action: 'delete_submisi', id_sub: idSub });
      closeLoading();
      if (res.success) {
        showToast('success', res.message);
        await fetchAllInitialData(true);
        switchView('guru-koreksi');
        if (koreksiDetailKey) renderKoreksiSiswaModal();
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Menghapus Submisi', text: res.message });
      }
    }
  );
}

export function openEvaluasiModal(idEvaluasi = null) {
  const modal = document.getElementById('evaluasi-modal');
  if (!modal) {
    console.error('Modal #evaluasi-modal tidak ditemukan di index.html!');
    Swal.fire({
      icon: 'error',
      title: 'Modal Tidak Ditemukan',
      text: 'Pastikan kode HTML modal #evaluasi-modal sudah ditambahkan ke index.html!'
    });
    return;
  }

  populatePertemuanSelects();

  const titleElem = document.getElementById('evaluasi-modal-title');
  const idElem = document.getElementById('evaluasi-form-id');
  const ptmElem = document.getElementById('evaluasi-form-pertemuan');
  const judulElem = document.getElementById('evaluasi-form-judul');
  const durasiElem = document.getElementById('evaluasi-form-durasi');
  const statusElem = document.getElementById('evaluasi-form-status');

  if (idEvaluasi !== null && idEvaluasi !== undefined && String(idEvaluasi).trim() !== '') {
    const targetIdStr = String(idEvaluasi).trim();
    const ev = (state.cachedData.evaluasi || []).find(
      (x) => String(x.id_evaluasi || x.id || '').trim() === targetIdStr
    );

    if (ev) {
      if (titleElem) titleElem.textContent = 'Edit Modul & Durasi Evaluasi';
      if (idElem) idElem.value = ev.id_evaluasi || ev.id || '';
      if (ptmElem) ptmElem.value = ev.id_pertemuan || '';
      if (judulElem) judulElem.value = ev.judul_evaluasi || '';
      if (durasiElem) durasiElem.value = ev.durasi_menit || 30;
      if (statusElem) statusElem.value = ev.status || 'Publish';
    }
  } else {
    if (titleElem) titleElem.textContent = 'Buat Modul Evaluasi Baru';
    if (idElem) idElem.value = '';
    if (judulElem) judulElem.value = 'Evaluasi Kuis Pembelajaran';
    if (durasiElem) durasiElem.value = 30;
    if (statusElem) statusElem.value = 'Publish';
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeEvaluasiModal() {
  document.getElementById('evaluasi-modal').classList.add('hidden');
  document.getElementById('evaluasi-modal').classList.remove('flex');
}

export async function handleEvaluasiSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-evaluasi');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Evaluasi');

  const res = await apiPost({
    action: 'save_evaluasi',
    id_evaluasi: document.getElementById('evaluasi-form-id').value,
    id_pertemuan: document.getElementById('evaluasi-form-pertemuan').value,
    judul_evaluasi: document.getElementById('evaluasi-form-judul').value,
    durasi_menit: parseInt(document.getElementById('evaluasi-form-durasi').value, 10) || 30,
    status: document.getElementById('evaluasi-form-status').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Evaluasi');
  if (res.success) {
    closeEvaluasiModal();
    showToast('success', 'Modul & Durasi Evaluasi Berhasil Diperbarui!');
    await fetchAllInitialData(true);
    switchView('guru-soal');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Evaluasi', text: res.message });
  }
}

const rekapFilter = { q: '', kelas: '', ptm: '', mode: 'ptm', kkm: 75 };

function getRekapData() {
  const subs = filterSubmisi(state.cachedData.submissions || [], rekapFilter);
  const list = filterSiswa(buildRingkasanSiswa(subs), rekapFilter.q).sort(
    (a, b) => a.kelas.localeCompare(b.kelas, 'id') || a.nama.localeCompare(b.nama, 'id')
  );
  return { list, rekap: buildRekap(list, state.cachedData.pertemuan || [], rekapFilter.ptm) };
}

export function renderGuruRekapView(container) {
  const subs = state.cachedData.submissions || [];
  const kelasList = Array.from(new Set(subs.map((s) => String(s.kelas || '').trim()).filter(Boolean))).sort();
  const ptmList = (state.cachedData.pertemuan || [])
    .slice()
    .sort((a, b) => Number(a.nomor_pertemuan) - Number(b.nomor_pertemuan));
  const inputCls = 'p-2.5 rounded-xl border border-slate-300 font-bold bg-white';

  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2 bg-white p-4 rounded-2xl border shadow-xs">
        <span id="rekap-total" class="font-bold text-slate-700"></span>
        <div class="flex flex-wrap items-center gap-2">
          <button onclick="refreshSubmissionsData()" class="px-4 py-2 bg-brand-blue hover:bg-blue-600 text-white font-bold rounded-xl shadow transition flex items-center gap-1.5">
            <span>🔄</span> Refresh Data
          </button>
          <button onclick="exportRekapMatriksCsv()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition">📊 CSV Rekap Matriks</button>
          <button onclick="exportRekapDetailCsv()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition">📄 CSV Detail Submisi</button>
        </div>
      </div>

      <div class="bg-white p-4 rounded-2xl border shadow-xs grid grid-cols-2 lg:grid-cols-5 gap-2">
        <input type="search" placeholder="Cari nama siswa..." value="${escapeHtml(rekapFilter.q)}" oninput="setRekapFilter('q', this.value)" class="${inputCls} col-span-2 lg:col-span-1" />
        <select onchange="setRekapFilter('kelas', this.value)" class="${inputCls}">
          <option value="">Semua Kelas</option>
          ${kelasList.map((k) => `<option value="${escapeHtml(k)}" ${rekapFilter.kelas === k ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}
        </select>
        <select onchange="setRekapFilter('ptm', this.value)" class="${inputCls}">
          <option value="">Semua Pertemuan</option>
          ${ptmList.map((p) => `<option value="${escapeHtml(p.id_pertemuan)}" ${rekapFilter.ptm === String(p.id_pertemuan).trim() ? 'selected' : ''}>Pertemuan ${escapeHtml(p.nomor_pertemuan)}</option>`).join('')}
        </select>
        <label class="${inputCls} flex items-center gap-2">
          <span class="shrink-0">KKM</span>
          <input type="number" min="0" max="100" value="${escapeHtml(rekapFilter.kkm)}" oninput="setRekapKkm(this.value)" class="w-full bg-transparent font-black text-brand-blue" />
        </label>
        <div class="flex rounded-xl border border-slate-300 overflow-hidden font-bold">
          <button id="rekap-mode-ptm" onclick="setRekapMode('ptm')" class="flex-1 p-2.5">Per pertemuan</button>
          <button id="rekap-mode-tipe" onclick="setRekapMode('tipe')" class="flex-1 p-2.5 border-l border-slate-300">Per tipe modul</button>
        </div>
      </div>

      <div id="rekap-stats" class="grid grid-cols-2 lg:grid-cols-6 gap-2"></div>

      <div class="bg-white p-5 rounded-3xl border shadow-sm">
        <h3 class="font-black text-brand-navy text-sm font-heading border-b pb-2">🏆 Buku Nilai & Rekapitulasi Siswa</h3>
        <p class="text-[11px] text-slate-500 mt-2">Nilai = rata-rata modul (submisi terbaru per modul). <b class="text-amber-600">*</b> = masih ada submisi belum dinilai. Merah = di bawah KKM. Ubah nilai lewat menu Koreksi.</p>
        <div class="overflow-x-auto mt-3">
          <table class="w-full text-left">
            <thead id="rekap-head" class="bg-brand-navy text-white font-heading"></thead>
            <tbody id="rekap-body" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  renderRekapKonten();
}

function sel(c, kkm) {
  if (!c) return '<span class="text-slate-300">-</span>';
  if (c.rata === null) {
    return '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Belum dinilai</span>';
  }
  const warna = c.rata < kkm ? 'text-red-600' : 'text-slate-800';
  const tanda = c.pending > 0 ? `<span class="ml-0.5 text-amber-600 font-black" title="${c.pending} submisi belum dinilai">*</span>` : '';
  return `<span class="font-black ${warna}">${c.rata}</span>${tanda}`;
}

function kartuStat(judul, isi, sub = '') {
  return `
    <div class="bg-white p-3 rounded-2xl border shadow-xs">
      <span class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">${escapeHtml(judul)}</span>
      <span class="block text-base font-black text-brand-navy mt-0.5">${escapeHtml(isi)}</span>
      ${sub ? `<span class="block text-[10px] text-slate-500 truncate">${sub}</span>` : ''}
    </div>
  `;
}

export function renderRekapKonten() {
  const body = document.getElementById('rekap-body');
  if (!body) return;

  const { list, rekap } = getRekapData();
  const st = statistikKelas(rekap.baris, rekapFilter.kkm);
  const totalSub = list.reduce((n, r) => n + r.subs.length, 0);

  const total = document.getElementById('rekap-total');
  if (total) total.innerHTML = `Siswa: <b>${list.length}</b> &nbsp;|&nbsp; Submisi: <b>${totalSub}</b>`;

  ['ptm', 'tipe'].forEach((m) => {
    const btn = document.getElementById(`rekap-mode-${m}`);
    if (btn) btn.className = `flex-1 p-2.5 ${m === 'tipe' ? 'border-l border-slate-300 ' : ''}${rekapFilter.mode === m ? 'bg-brand-navy text-white' : 'bg-white text-slate-700'}`;
  });

  const stats = document.getElementById('rekap-stats');
  if (stats) {
    stats.innerHTML = [
      kartuStat('Jumlah Siswa', st.jumlahSiswa, `${st.jumlahBernilai} sudah punya nilai`),
      kartuStat('Rata-rata Kelas', st.rataKelas === null ? '-' : st.rataKelas),
      kartuStat('Tertinggi', st.tertinggi ? st.tertinggi.nilai : '-', st.tertinggi ? escapeHtml(st.tertinggi.nama) : ''),
      kartuStat('Terendah', st.terendah ? st.terendah.nilai : '-', st.terendah ? escapeHtml(st.terendah.nama) : ''),
      kartuStat('Belum Dinilai', st.pending, 'submisi'),
      kartuStat(`Tuntas (KKM ${escapeHtml(st.kkm)})`, st.persenTuntas === null ? '-' : `${st.persenTuntas}%`, `${st.tuntas} dari ${st.jumlahBernilai} siswa`)
    ].join('');
  }

  const kolom =
    rekapFilter.mode === 'tipe'
      ? KOLOM_TIPE.map((k) => ({ judul: k.label, tip: k.label }))
      : rekap.kolom.map((k) => ({ judul: k.singkat, tip: k.judul ? `${k.label} - ${k.judul}` : k.label }));

  const head = document.getElementById('rekap-head');
  if (head) {
    head.innerHTML = `
      <tr>
        <th class="p-3">Siswa</th>
        <th class="p-3">Kelas</th>
        ${kolom.map((k) => `<th class="p-3 text-center" title="${escapeHtml(k.tip)}">${escapeHtml(k.judul)}</th>`).join('')}
        <th class="p-3 text-center">Rata-rata</th>
        <th class="p-3 text-center">Belum dinilai</th>
      </tr>
    `;
  }

  if (rekap.baris.length === 0) {
    body.innerHTML = `<tr><td colspan="${kolom.length + 4}" class="p-4 text-center text-slate-400">Tidak ada data siswa yang sesuai.</td></tr>`;
    return;
  }

  body.innerHTML = rekap.baris
    .map((b) => {
      const sels = rekapFilter.mode === 'tipe' ? KOLOM_TIPE.map((k) => b.tipe[k.key]) : b.sel;
      return `
        <tr>
          <td class="p-3 font-bold whitespace-nowrap">
            <button data-key="${escapeHtml(encodeURIComponent(b.r.key))}" onclick="openRekapSiswa(this.dataset.key)" class="text-left text-brand-blue hover:underline font-bold">${escapeHtml(b.r.nama)}</button>
          </td>
          <td class="p-3">${escapeHtml(b.r.kelas)}</td>
          ${sels.map((c) => `<td class="p-3 text-center">${sel(c, st.kkm)}</td>`).join('')}
          <td class="p-3 text-center text-sm">${b.r.rata === null ? '<span class="text-slate-300">-</span>' : `<span class="font-black ${b.r.rata < st.kkm ? 'text-red-600' : 'text-emerald-600'}">${b.r.rata}</span>`}</td>
          <td class="p-3 text-center">${b.r.pending > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">${b.r.pending}</span>` : '<span class="text-slate-300">0</span>'}</td>
        </tr>
      `;
    })
    .join('');
}

export function setRekapFilter(key, value) {
  rekapFilter[key] = String(value);
  renderRekapKonten();
}

export function setRekapMode(mode) {
  rekapFilter.mode = mode === 'tipe' ? 'tipe' : 'ptm';
  renderRekapKonten();
}

export function setRekapKkm(value) {
  const n = parseFloat(value);
  rekapFilter.kkm = Number.isFinite(n) ? n : 75;
  renderRekapKonten();
}

export async function openRekapSiswa(encodedKey) {
  await switchView('guru-koreksi');
  openKoreksiSiswaModal(encodedKey);
}

function unduhCsv(namaFile, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', namaFile);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRekapMatriksCsv() {
  const { rekap } = getRekapData();
  if (rekap.baris.length === 0) {
    showToast('warning', 'Belum ada data nilai untuk diekspor!');
    return;
  }
  unduhCsv(`Rekap_Nilai_Matriks_${new Date().toISOString().slice(0, 10)}.csv`, csvRekapMatriks(rekap));
  showToast('success', 'Rekap matriks berhasil diunduh (CSV)!');
}

export function exportRekapDetailCsv() {
  const { list } = getRekapData();
  if (list.length === 0) {
    showToast('warning', 'Belum ada data submisi untuk diekspor!');
    return;
  }
  unduhCsv(`Rekap_Nilai_Detail_${new Date().toISOString().slice(0, 10)}.csv`, csvDetailSubmisi(list));
  showToast('success', 'Detail submisi berhasil diunduh (CSV)!');
}

export function populatePertemuanSelects() {
  const ptmList = state.cachedData.pertemuan || [];
  const opts = ptmList
    .map((p) => `<option value="${escapeHtml(p.id_pertemuan)}">Pertemuan ${escapeHtml(p.nomor_pertemuan)}: ${escapeHtml(p.judul_pertemuan)}</option>`)
    .join('');

  const mSel = document.getElementById('materi-form-pertemuan');
  if (mSel) mSel.innerHTML = opts;
  const lSel = document.getElementById('lkpd-form-pertemuan');
  if (lSel) lSel.innerHTML = opts;
  const gSel = document.getElementById('game-form-pertemuan');
  if (gSel) gSel.innerHTML = opts;
  const sSel = document.getElementById('soal-form-pertemuan');
  if (sSel) sSel.innerHTML = opts;
  const evSel = document.getElementById('evaluasi-form-pertemuan');
  if (evSel) evSel.innerHTML = opts;
}

export function openPertemuanModal(idPtm = null) {
  populateKelasSelects();

  const titleElem = document.getElementById('pertemuan-modal-title');
  const idElem = document.getElementById('pertemuan-form-id');
  const nomorElem = document.getElementById('pertemuan-form-nomor');
  const judulElem = document.getElementById('pertemuan-form-judul');
  const descElem = document.getElementById('pertemuan-form-deskripsi');
  const promptSciElem = document.getElementById('pertemuan-form-prompt-science');
  const promptEngElem = document.getElementById('pertemuan-form-prompt-engineering');
  const kelasElem = document.getElementById('pertemuan-form-kelas');
  const statusElem = document.getElementById('pertemuan-form-status');

  if (idPtm !== null && idPtm !== undefined && String(idPtm).trim() !== '') {
    const targetIdStr = String(idPtm).trim();
    const p = (state.cachedData.pertemuan || []).find(
      (x) => String(x.id_pertemuan || x.id || '').trim() === targetIdStr
    );

    if (p) {
      if (titleElem) titleElem.textContent = 'Edit Pertemuan Pembelajaran';
      if (idElem) idElem.value = p.id_pertemuan || p.id || '';
      if (nomorElem) nomorElem.value = p.nomor_pertemuan || '1';
      if (judulElem) judulElem.value = p.judul_pertemuan || '';
      if (descElem) descElem.value = p.deskripsi || '';
      if (promptSciElem) promptSciElem.value = p.prompt_science || '';
      if (promptEngElem) promptEngElem.value = p.prompt_engineering || '';
      if (kelasElem) kelasElem.value = p.id_kelas || 'ALL';
      if (statusElem) statusElem.value = p.status || 'Publish';
    }
  } else {
    if (titleElem) titleElem.textContent = 'Buat Pertemuan Pembelajaran';
    if (idElem) idElem.value = '';
    if (nomorElem) nomorElem.value = '1';
    if (judulElem) judulElem.value = '';
    if (descElem) descElem.value = '';
    if (promptSciElem) promptSciElem.value = '';
    if (promptEngElem) promptEngElem.value = '';
    if (kelasElem) kelasElem.value = 'ALL';
    if (statusElem) statusElem.value = 'Publish';
  }

  document.getElementById('pertemuan-modal').classList.remove('hidden');
  document.getElementById('pertemuan-modal').classList.add('flex');
}

export function closePertemuanModal() {
  document.getElementById('pertemuan-modal').classList.add('hidden');
  document.getElementById('pertemuan-modal').classList.remove('flex');
}

export async function handlePertemuanSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-pertemuan');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Pertemuan');

  const res = await apiPost({
    action: 'save_pertemuan',
    id_pertemuan: document.getElementById('pertemuan-form-id').value,
    nomor_pertemuan: document.getElementById('pertemuan-form-nomor').value,
    judul_pertemuan: document.getElementById('pertemuan-form-judul').value,
    deskripsi: document.getElementById('pertemuan-form-deskripsi').value,
    prompt_science: document.getElementById('pertemuan-form-prompt-science').value,
    prompt_engineering: document.getElementById('pertemuan-form-prompt-engineering').value,
    id_kelas: document.getElementById('pertemuan-form-kelas').value,
    status: document.getElementById('pertemuan-form-status').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Pertemuan');
  if (res.success) {
    closePertemuanModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('guru-pertemuan');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: res.message });
  }
}

export function deletePertemuan(id) {
  showConfirm('Hapus Pertemuan?', 'Data yang dihapus tidak dapat dikembalikan!', async () => {
    showLoading('Menghapus pertemuan...');
    await apiPost({ action: 'delete_pertemuan', id_pertemuan: id });
    closeLoading();
    showToast('success', 'Pertemuan berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('guru-pertemuan');
  });
}

export function openMateriModal(idMateri = null) {
  populatePertemuanSelects();

  const titleElem = document.getElementById('materi-modal-title');
  const idElem = document.getElementById('materi-form-id');
  const pdfIdElem = document.getElementById('materi-form-pdf-id');
  const ptmElem = document.getElementById('materi-form-pertemuan');
  const tipeElem = document.getElementById('materi-form-tipe');
  const judulElem = document.getElementById('materi-form-judul');
  const teksElem = document.getElementById('materi-form-teks');
  const pdfUrlElem = document.getElementById('materi-form-pdf-url');

  if (idMateri !== null && idMateri !== undefined && String(idMateri).trim() !== '') {
    const targetIdStr = String(idMateri).trim();
    const m = (state.cachedData.materi || []).find(
      (x) => String(x.id_materi || x.id || '').trim() === targetIdStr
    );

    if (m) {
      if (titleElem) titleElem.textContent = 'Edit Bahan Ajar Materi';
      if (idElem) idElem.value = m.id_materi || m.id || '';
      if (pdfIdElem) pdfIdElem.value = m.file_drive_id || '';
      if (ptmElem) ptmElem.value = m.id_pertemuan || '';
      if (tipeElem) tipeElem.value = m.tipe_media || 'web_text';
      if (judulElem) judulElem.value = m.judul_materi || '';
      if (teksElem) teksElem.value = m.isi_teks || '';
      if (pdfUrlElem) pdfUrlElem.value = m.file_pdf_url || '';
    }
  } else {
    if (titleElem) titleElem.textContent = 'Tambah Bahan Ajar Materi';
    if (idElem) idElem.value = '';
    if (pdfIdElem) pdfIdElem.value = '';
    if (judulElem) judulElem.value = '';
    if (teksElem) teksElem.value = '';
    if (pdfUrlElem) pdfUrlElem.value = '';
    if (tipeElem) tipeElem.value = 'web_text';
  }

  toggleMateriFormTipe();
  document.getElementById('materi-modal').classList.remove('hidden');
  document.getElementById('materi-modal').classList.add('flex');
}

export function closeMateriModal() {
  document.getElementById('materi-modal').classList.add('hidden');
  document.getElementById('materi-modal').classList.remove('flex');
}

export function toggleMateriFormTipe() {
  const tipe = document.getElementById('materi-form-tipe').value;
  const pdfCon = document.getElementById('container-materi-pdf');
  if (tipe === 'pdf_document') pdfCon.classList.remove('hidden');
  else pdfCon.classList.add('hidden');
}

export async function handleMateriSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-materi');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Materi');

  const res = await apiPost({
    action: 'save_materi',
    id_materi: document.getElementById('materi-form-id').value,
    id_pertemuan: document.getElementById('materi-form-pertemuan').value,
    judul_materi: document.getElementById('materi-form-judul').value,
    tipe_media: document.getElementById('materi-form-tipe').value,
    isi_teks: document.getElementById('materi-form-teks').value,
    file_pdf_url: document.getElementById('materi-form-pdf-url').value,
    file_drive_id: document.getElementById('materi-form-pdf-id').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Materi');
  if (res.success) {
    closeMateriModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('guru-materi');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Materi', text: res.message });
  }
}

export function deleteMateri(id) {
  showConfirm('Hapus Bahan Ajar?', 'Materi pembelajaran ini akan dihapus dari modul!', async () => {
    showLoading('Menghapus materi...');
    await apiPost({ action: 'delete_materi', id_materi: id });
    closeLoading();
    showToast('success', 'Bahan ajar berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('guru-materi');
  });
}

export function openLkpdModal(idLkpd = null) {
  populatePertemuanSelects();

  const titleElem = document.getElementById('lkpd-modal-title');
  const idElem = document.getElementById('lkpd-form-id');
  const pdfIdElem = document.getElementById('lkpd-form-pdf-id');
  const petaFieldElem = document.getElementById('lkpd-form-peta-field');
  const ptmElem = document.getElementById('lkpd-form-pertemuan');
  const tipeElem = document.getElementById('lkpd-form-tipe');
  const judulElem = document.getElementById('lkpd-form-judul');
  const instruksiElem = document.getElementById('lkpd-form-instruksi');
  const pdfUrlElem = document.getElementById('lkpd-form-pdf-url');
  const isiTeksElem = document.getElementById('lkpd-form-isi-teks');
  const gambarUrlElem = document.getElementById('lkpd-form-gambar-url');
  const videoUrlElem = document.getElementById('lkpd-form-video-url');
  const soalTextElem = document.getElementById('lkpd-form-soal-text');
  const kanvasElem = document.getElementById('lkpd-form-kanvas');

  if (idLkpd !== null && idLkpd !== undefined && String(idLkpd).trim() !== '') {
    const targetIdStr = String(idLkpd).trim();
    const l = (state.cachedData.lkpd || []).find(
      (x) => String(x.id_lkpd || x.id || '').trim() === targetIdStr
    );

    if (l) {
      if (titleElem) titleElem.textContent = 'Edit LKPD Pertemuan';
      if (idElem) idElem.value = l.id_lkpd || l.id || '';
      if (pdfIdElem) pdfIdElem.value = l.file_drive_id || '';

      let rawPeta = l.peta_field_json || '';
      if (typeof rawPeta === 'object' && rawPeta !== null) {
        rawPeta = JSON.stringify(rawPeta);
      }
      if (petaFieldElem) petaFieldElem.value = rawPeta;

      if (ptmElem) ptmElem.value = l.id_pertemuan || '';
      if (tipeElem) tipeElem.value = l.tipe_lkpd || 'pdf_interaktif';
      if (judulElem) judulElem.value = l.judul_lkpd || '';
      if (instruksiElem) instruksiElem.value = l.instruksi || '';
      if (pdfUrlElem) pdfUrlElem.value = l.file_pdf_url || '';
      if (isiTeksElem) isiTeksElem.value = l.isi_teks || '';
      if (gambarUrlElem) gambarUrlElem.value = l.gambar_url || '';
      if (videoUrlElem) videoUrlElem.value = l.video_url || '';

      let questions = [];
      try {
        questions = typeof l.soal_json === 'string' ? JSON.parse(l.soal_json) : l.soal_json || [];
      } catch (e) {
        questions = [];
      }
      if (soalTextElem) soalTextElem.value = Array.isArray(questions) ? questions.join('\n') : String(questions);
      if (kanvasElem) kanvasElem.checked = l.fitur_kanvas === 'TRUE' || l.fitur_kanvas === true;
    }
  } else {
    if (titleElem) titleElem.textContent = 'Kelola LKPD Pertemuan';
    if (idElem) idElem.value = '';
    if (pdfIdElem) pdfIdElem.value = '';
    if (petaFieldElem) petaFieldElem.value = '';
    if (judulElem) judulElem.value = '';
    if (instruksiElem) instruksiElem.value = '';
    if (pdfUrlElem) pdfUrlElem.value = '';
    if (isiTeksElem) isiTeksElem.value = '';
    if (gambarUrlElem) gambarUrlElem.value = '';
    if (videoUrlElem) videoUrlElem.value = '';
    if (soalTextElem) soalTextElem.value = '';
    if (kanvasElem) kanvasElem.checked = false;
    if (tipeElem) tipeElem.value = 'pdf_interaktif';
  }

  toggleLkpdFormTipe();

  document.getElementById('lkpd-modal').classList.remove('hidden');
  document.getElementById('lkpd-modal').classList.add('flex');
}

export function closeLkpdModal() {
  document.getElementById('lkpd-modal').classList.add('hidden');
  document.getElementById('lkpd-modal').classList.remove('flex');
}

export function toggleLkpdFormTipe() {
  const tipeElem = document.getElementById('lkpd-form-tipe');
  const pdfCon = document.getElementById('container-lkpd-pdf');
  const manualCon = document.getElementById('container-lkpd-manual');

  if (!tipeElem || !pdfCon || !manualCon) return;

  if (tipeElem.value === 'manual') {
    pdfCon.classList.add('hidden');
    manualCon.classList.remove('hidden');
  } else {
    pdfCon.classList.remove('hidden');
    manualCon.classList.add('hidden');
  }
}

export async function handleLkpdSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-lkpd');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan LKPD');

  const idLkpd = document.getElementById('lkpd-form-id').value;
  const soalArr = document
    .getElementById('lkpd-form-soal-text')
    .value.split('\n')
    .filter((s) => s.trim() !== '');

  let petaFieldVal = document.getElementById('lkpd-form-peta-field')?.value || '';

  if (!petaFieldVal && idLkpd) {
    const existingLkpd = (state.cachedData.lkpd || []).find(
      (x) => String(x.id_lkpd || x.id || '').trim() === String(idLkpd).trim()
    );
    if (existingLkpd && existingLkpd.peta_field_json) {
      petaFieldVal = typeof existingLkpd.peta_field_json === 'object'
        ? JSON.stringify(existingLkpd.peta_field_json)
        : existingLkpd.peta_field_json;
    }
  }

  if (typeof petaFieldVal === 'object' && petaFieldVal !== null) {
    petaFieldVal = JSON.stringify(petaFieldVal);
  }

  const payload = {
    action: 'save_lkpd',
    id_lkpd: idLkpd,
    id_pertemuan: document.getElementById('lkpd-form-pertemuan').value,
    judul_lkpd: document.getElementById('lkpd-form-judul').value,
    tipe_lkpd: document.getElementById('lkpd-form-tipe').value,
    instruksi: document.getElementById('lkpd-form-instruksi').value,
    file_pdf_url: document.getElementById('lkpd-form-pdf-url').value,
    file_drive_id: document.getElementById('lkpd-form-pdf-id').value,
    peta_field_json: petaFieldVal,
    isi_teks: document.getElementById('lkpd-form-isi-teks').value,
    gambar_url: document.getElementById('lkpd-form-gambar-url').value,
    video_url: document.getElementById('lkpd-form-video-url').value,
    soal_json: soalArr,
    fitur_kanvas: document.getElementById('lkpd-form-kanvas').checked
  };

  const res = await apiPost(payload);

  setButtonLoading(btn, false, '', '💾 Simpan LKPD');
  if (res.success) {
    closeLkpdModal();
    showToast('success', res.message);

    const targetId = res.id_lkpd || idLkpd || payload.id_lkpd;
    const newLkpdData = {
      id_lkpd: targetId,
      id_pertemuan: payload.id_pertemuan,
      id_kelas: 'ALL',
      judul_lkpd: payload.judul_lkpd,
      tipe_lkpd: payload.tipe_lkpd,
      instruksi: payload.instruksi,
      file_pdf_url: payload.file_pdf_url,
      file_drive_id: payload.file_drive_id,
      gambar_url: payload.gambar_url,
      video_url: payload.video_url,
      soal_json: typeof payload.soal_json === 'object' ? JSON.stringify(payload.soal_json) : payload.soal_json,
      fitur_kanvas: payload.fitur_kanvas ? 'TRUE' : 'FALSE',
      status: 'Publish',
      isi_teks: payload.isi_teks,
      peta_field_json: payload.peta_field_json
    };

    if (!Array.isArray(state.cachedData.lkpd)) state.cachedData.lkpd = [];
    const idx = state.cachedData.lkpd.findIndex((x) => String(x.id_lkpd || x.id) === String(targetId));
    if (idx !== -1) {
      state.cachedData.lkpd[idx] = { ...state.cachedData.lkpd[idx], ...newLkpdData };
    } else {
      state.cachedData.lkpd.push(newLkpdData);
    }

    await saveToLocalStorage();
    switchView('guru-lkpd');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan LKPD', text: res.message });
  }
}

export function deleteLkpd(id) {
  showConfirm('Hapus LKPD?', 'LKPD ini akan dihapus!', async () => {
    showLoading('Menghapus LKPD...');
    await apiPost({ action: 'delete_lkpd', id_lkpd: id });
    closeLoading();
    showToast('success', 'LKPD berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('guru-lkpd');
  });
}

export function openGameModal(idGame = null) {
  populatePertemuanSelects();

  const titleElem = document.getElementById('game-modal-title');
  const idElem = document.getElementById('game-form-id');
  const ptmElem = document.getElementById('game-form-pertemuan');
  const tipeElem = document.getElementById('game-form-tipe');
  const judulElem = document.getElementById('game-form-judul');
  const instruksiElem = document.getElementById('game-form-instruksi');

  if (idGame !== null && idGame !== undefined && String(idGame).trim() !== '') {
    const targetIdStr = String(idGame).trim();
    const g = (state.cachedData.games || []).find(
      (x) => String(x.id_game || x.id || '').trim() === targetIdStr
    );

    if (g) {
      if (titleElem) titleElem.textContent = 'Edit Game Interaktif';
      if (idElem) idElem.value = g.id_game || g.id || '';
      if (ptmElem) ptmElem.value = g.id_pertemuan || '';
      if (tipeElem) tipeElem.value = g.tipe_game || 'matching';
      if (judulElem) judulElem.value = g.judul_game || '';
      if (instruksiElem) instruksiElem.value = g.instruksi || '';

      let config = { items: [] };
      try {
        config =
          typeof g.konfigurasi_json === 'string'
            ? JSON.parse(g.konfigurasi_json)
            : g.konfigurasi_json || { items: [] };
      } catch (e) { }

      renderGameConfigInputs(config.items || []);
    }
  } else {
    if (titleElem) titleElem.textContent = 'Konfigurasi Game Interaktif';
    if (idElem) idElem.value = '';
    if (judulElem) judulElem.value = '';
    if (instruksiElem) instruksiElem.value = '';
    if (tipeElem) tipeElem.value = 'matching';

    renderGameConfigInputs();
  }

  document.getElementById('game-modal').classList.remove('hidden');
  document.getElementById('game-modal').classList.add('flex');
}

export function closeGameModal() {
  document.getElementById('game-modal').classList.add('hidden');
  document.getElementById('game-modal').classList.remove('flex');
}

export function renderGameConfigInputs(existingItems = null) {
  const tipeElem = document.getElementById('game-form-tipe');
  const tipe = tipeElem ? tipeElem.value : 'matching';
  const container = document.getElementById('game-dynamic-builder-container');
  if (!container) return;
  container.innerHTML = '';

  const firstItem = existingItems && existingItems.length > 0 ? existingItems[0] : null;

  if (tipe === 'matching') {
    container.innerHTML = `<div class="text-[10px] text-purple-700 font-bold mb-1">Isikan Pertanyaan / Teks dan Pasangan Kunci Jawaban:</div>`;
  } else if (tipe === 'drag_drop') {
    const catA = firstItem?.kategori_a || 'Energi Potensial';
    const catB = firstItem?.kategori_b || 'Energi Kinetik';
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label class="block font-bold text-slate-700">Nama Kategori A</label>
          <input type="text" id="gm-cat-name-a" value="${escapeHtml(catA)}" class="w-full p-2 border rounded-xl font-bold" />
        </div>
        <div>
          <label class="block font-bold text-slate-700">Nama Kategori B</label>
          <input type="text" id="gm-cat-name-b" value="${escapeHtml(catB)}" class="w-full p-2 border rounded-xl font-bold" />
        </div>
      </div>
    `;
  } else if (tipe === 'sequencer') {
    container.innerHTML = `<div class="text-[10px] text-purple-700 font-bold mb-1">Isikan tahapan proses berurutan DARI AWAL HINGGA AKHIR:</div>`;
  } else if (tipe === 'hotspot') {
    container.innerHTML = renderHotspotConfigForm(firstItem);
  } else if (tipe === 'simulator') {
    const scenario = firstItem?.soal || '';
    container.innerHTML = `
      <div class="space-y-2 mb-3">
        <div>
          <label class="block font-bold text-slate-700">Teks Skenario Studi Kasus Proyek</label>
          <textarea id="gm-sim-scenario" rows="2" placeholder="Contoh: Merancang Oven Tenaga Surya..." class="w-full p-2 border rounded-xl text-[11px]">${escapeHtml(scenario)}</textarea>
        </div>
        <div class="text-[10px] text-purple-700 font-bold">Isikan Parameter & Pilihan Keputusan:</div>
      </div>
    `;
  } else if (tipe === 'word_search') {
    container.innerHTML = `<div class="text-[10px] text-purple-700 font-bold mb-1">Isikan Kata-Kata Kunci Istilah IPA (Satu kata per baris):</div>`;
  } else {
    container.innerHTML = `<div class="text-[10px] text-purple-700 font-bold mb-1">Isikan Pertanyaan Singkat beserta Kunci Jawabannya:</div>`;
  }

  if (existingItems && Array.isArray(existingItems) && existingItems.length > 0) {
    existingItems.forEach((item) => addGameItemRow(item));
  } else {
    addGameItemRow();
  }
}

export function addGameItemRow(itemData = null) {
  const tipeElem = document.getElementById('game-form-tipe');
  const tipe = tipeElem ? tipeElem.value : 'matching';
  const container = document.getElementById('game-dynamic-builder-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'gm-item-row p-2.5 bg-white border rounded-2xl space-y-1.5 shadow-2xs relative';
  const removeBtnHtml = `<button type="button" onclick="this.closest('.gm-item-row').remove()" class="text-red-500 font-bold text-[10px] hover:underline float-right">✕ Hapus Item</button>`;

  if (tipe === 'matching') {
    const soal = itemData?.soal || '';
    const kunci = itemData?.kunci || '';
    row.innerHTML = `
      ${removeBtnHtml}
      <div class="grid grid-cols-2 gap-2 clear-both">
        <input type="text" class="gm-input-soal w-full p-2 rounded-xl border text-[11px]" value="${escapeHtml(soal)}" placeholder="Soal / Teks" />
        <input type="text" class="gm-input-kunci w-full p-2 rounded-xl border text-[11px]" value="${escapeHtml(kunci)}" placeholder="Pasangan Kunci" />
      </div>
    `;
  } else if (tipe === 'drag_drop') {
    const soal = itemData?.soal || '';
    const catKunci = itemData?.kategori_kunci || 'A';
    row.innerHTML = `
      ${removeBtnHtml}
      <div class="grid grid-cols-3 gap-2 clear-both">
        <input type="text" class="gm-input-soal col-span-2 w-full p-2 rounded-xl border text-[11px]" value="${escapeHtml(soal)}" placeholder="Objek / Teks" />
        <select class="gm-input-cat-kunci w-full p-2 rounded-xl border font-bold text-[11px] text-purple-700">
          <option value="A" ${catKunci === 'A' ? 'selected' : ''}>Kategori A</option>
          <option value="B" ${catKunci === 'B' ? 'selected' : ''}>Kategori B</option>
        </select>
      </div>
    `;
  } else if (tipe === 'sequencer') {
    const count = container.querySelectorAll('.gm-item-row').length + 1;
    const soal = itemData?.soal || '';
    row.innerHTML = `
      ${removeBtnHtml}
      <div class="flex items-center gap-2 clear-both">
        <span class="w-6 h-6 rounded-lg bg-purple-100 text-purple-800 font-black text-[10px] flex items-center justify-center shrink-0">${count}</span>
        <input type="text" class="gm-input-soal w-full p-2 rounded-xl border text-[11px]" value="${escapeHtml(soal)}" placeholder="Langkah urutan..." />
      </div>
    `;
  } else if (tipe === 'hotspot') {
    const pinNum = container.querySelectorAll('.gm-item-row').length + 1;
    row.innerHTML = renderHotspotItemRow(itemData, pinNum, removeBtnHtml);
  } else if (tipe === 'simulator') {
    const param = itemData?.parameter || '';
    const opsiA = itemData?.opsi_a || '';
    const opsiB = itemData?.opsi_b || '';
    const opsiC = itemData?.opsi_c || '';
    const kunci = itemData?.kunci || 'A';
    row.innerHTML = `
      ${removeBtnHtml}
      <div class="clear-both space-y-1">
        <input type="text" class="gm-input-param w-full p-2 rounded-xl border text-[11px] font-bold" value="${escapeHtml(param)}" placeholder="Nama Parameter" />
        <div class="grid grid-cols-3 gap-1">
          <input type="text" class="gm-input-opsi-a w-full p-1.5 rounded-lg border text-[10px]" value="${escapeHtml(opsiA)}" placeholder="Opsi A" />
          <input type="text" class="gm-input-opsi-b w-full p-1.5 rounded-lg border text-[10px]" value="${escapeHtml(opsiB)}" placeholder="Opsi B" />
          <input type="text" class="gm-input-opsi-c w-full p-1.5 rounded-lg border text-[10px]" value="${escapeHtml(opsiC)}" placeholder="Opsi C" />
        </div>
        <select class="gm-input-kunci w-full p-1.5 rounded-lg border font-bold text-[10px] text-purple-700">
          <option value="A" ${kunci === 'A' ? 'selected' : ''}>Kunci Terbaik: Opsi A</option>
          <option value="B" ${kunci === 'B' ? 'selected' : ''}>Kunci Terbaik: Opsi B</option>
          <option value="C" ${kunci === 'C' ? 'selected' : ''}>Kunci Terbaik: Opsi C</option>
        </select>
      </div>
    `;
  } else if (tipe === 'word_search') {
    const soal = itemData?.soal || '';
    row.innerHTML = `
      ${removeBtnHtml}
      <div class="clear-both">
        <input type="text" class="gm-input-soal w-full p-2 rounded-xl border text-[11px] font-mono uppercase" value="${escapeHtml(soal)}" placeholder="KATA ISTILAH" />
      </div>
    `;
  } else {
    const soal = itemData?.soal || '';
    const opsiA = itemData?.opsi_a || '';
    const opsiB = itemData?.opsi_b || '';
    const kunci = itemData?.kunci || 'A';
    row.innerHTML = `
      ${removeBtnHtml}
      <div class="clear-both space-y-1">
        <input type="text" class="gm-input-soal w-full p-2 rounded-xl border text-[11px]" value="${escapeHtml(soal)}" placeholder="Pertanyaan Kuis..." />
        <div class="grid grid-cols-3 gap-1">
          <input type="text" class="gm-input-opsi-a w-full p-1.5 rounded-lg border text-[10px]" value="${escapeHtml(opsiA)}" placeholder="Opsi A" />
          <input type="text" class="gm-input-opsi-b w-full p-1.5 rounded-lg border text-[10px]" value="${escapeHtml(opsiB)}" placeholder="Opsi B" />
          <select class="gm-input-kunci w-full p-1.5 rounded-lg border font-bold text-[10px] text-purple-700">
            <option value="A" ${kunci === 'A' ? 'selected' : ''}>Kunci A</option>
            <option value="B" ${kunci === 'B' ? 'selected' : ''}>Kunci B</option>
          </select>
        </div>
      </div>
    `;
  }

  container.appendChild(row);
}

export async function handleGameSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-game');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Game');

  const tipe = document.getElementById('game-form-tipe').value;
  const rows = document.querySelectorAll('.gm-item-row');
  let itemsList = [];

  const hotspotUrl = document.getElementById('gm-hotspot-img-url')?.value || '';
  const simScenario = document.getElementById('gm-sim-scenario')?.value || '';

  rows.forEach((r) => {
    const soal = r.querySelector('.gm-input-soal')?.value || '';

    if (tipe === 'matching') {
      const kunci = r.querySelector('.gm-input-kunci')?.value || '';
      if (soal) itemsList.push({ soal, kunci });
    } else if (tipe === 'drag_drop') {
      const catA = document.getElementById('gm-cat-name-a')?.value || 'Kategori A';
      const catB = document.getElementById('gm-cat-name-b')?.value || 'Kategori B';
      const catKunci = r.querySelector('.gm-input-cat-kunci')?.value || 'A';
      if (soal) itemsList.push({ soal, kategori_a: catA, kategori_b: catB, kategori_kunci: catKunci });
    } else if (tipe === 'sequencer') {
      if (soal) itemsList.push({ soal });
    } else if (tipe === 'hotspot') {
      const item = collectHotspotItem(soal, hotspotUrl);
      if (item) itemsList.push(item);
    } else if (tipe === 'simulator') {
      const param = r.querySelector('.gm-input-param')?.value || '';
      const opsiA = r.querySelector('.gm-input-opsi-a')?.value || '';
      const opsiB = r.querySelector('.gm-input-opsi-b')?.value || '';
      const opsiC = r.querySelector('.gm-input-opsi-c')?.value || '';
      const kunci = r.querySelector('.gm-input-kunci')?.value || 'A';
      if (param)
        itemsList.push({
          soal: simScenario,
          parameter: param,
          opsi_a: opsiA,
          opsi_b: opsiB,
          opsi_c: opsiC,
          kunci
        });
    } else if (tipe === 'word_search') {
      if (soal) itemsList.push({ soal: soal.toUpperCase().trim() });
    } else {
      const opsiA = r.querySelector('.gm-input-opsi-a')?.value || '';
      const opsiB = r.querySelector('.gm-input-opsi-b')?.value || '';
      const kunci = r.querySelector('.gm-input-kunci')?.value || 'A';
      if (soal) itemsList.push({ soal, opsi_a: opsiA, opsi_b: opsiB, kunci });
    }
  });

  const res = await apiPost({
    action: 'save_game',
    id_game: document.getElementById('game-form-id').value,
    id_pertemuan: document.getElementById('game-form-pertemuan').value,
    judul_game: document.getElementById('game-form-judul').value,
    tipe_game: tipe,
    instruksi: document.getElementById('game-form-instruksi').value,
    konfigurasi_json: { items: itemsList }
  });

  setButtonLoading(btn, false, '', '💾 Simpan Game');
  if (res.success) {
    closeGameModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('guru-game');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Game', text: res.message });
  }
}

export function deleteGame(id) {
  showConfirm('Hapus Game Interaktif?', 'Game ini akan dihapus dari modul!', async () => {
    showLoading('Menghapus game...');
    await apiPost({ action: 'delete_game', id_game: id });
    closeLoading();
    showToast('success', 'Game berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('guru-game');
  });
}

export function openSoalModal(idSoal = null) {
  populatePertemuanSelects();

  const titleElem = document.getElementById('soal-modal-title');
  const idElem = document.getElementById('soal-form-id');
  const ptmElem = document.getElementById('soal-form-pertemuan');
  const pertElem = document.getElementById('soal-form-pertanyaan');
  const opsiAElem = document.getElementById('soal-form-opsi-a');
  const opsiBElem = document.getElementById('soal-form-opsi-b');
  const opsiCElem = document.getElementById('soal-form-opsi-c');
  const opsiDElem = document.getElementById('soal-form-opsi-d');
  const kunciElem = document.getElementById('soal-form-kunci');

  if (idSoal !== null && idSoal !== undefined && String(idSoal).trim() !== '') {
    const targetIdStr = String(idSoal).trim();
    const s = (state.cachedData.soal_evaluasi || []).find(
      (x) => String(x.id_soal || x.id || '').trim() === targetIdStr
    );

    if (s) {
      const evalObj = (state.cachedData.evaluasi || []).find(
        (ev) => String(ev.id_evaluasi || ev.id || '').trim() === String(s.id_evaluasi || '').trim()
      );

      if (titleElem) titleElem.textContent = 'Edit Soal Evaluasi';
      if (idElem) idElem.value = s.id_soal || s.id || '';
      if (ptmElem) ptmElem.value = evalObj ? evalObj.id_pertemuan : '';
      if (pertElem) pertElem.value = s.pertanyaan || '';
      if (opsiAElem) opsiAElem.value = s.opsi_a || '';
      if (opsiBElem) opsiBElem.value = s.opsi_b || '';
      if (opsiCElem) opsiCElem.value = s.opsi_c || '';
      if (opsiDElem) opsiDElem.value = s.opsi_d || '';
      if (kunciElem) kunciElem.value = s.kunci_jawaban || 'A';
    }
  } else {
    if (titleElem) titleElem.textContent = 'Tambah Soal Evaluasi Baru';
    if (idElem) idElem.value = '';
    if (pertElem) pertElem.value = '';
    if (opsiAElem) opsiAElem.value = '';
    if (opsiBElem) opsiBElem.value = '';
    if (opsiCElem) opsiCElem.value = '';
    if (opsiDElem) opsiDElem.value = '';
    if (kunciElem) kunciElem.value = 'A';
  }

  document.getElementById('soal-modal').classList.remove('hidden');
  document.getElementById('soal-modal').classList.add('flex');
}

export function closeSoalModal() {
  document.getElementById('soal-modal').classList.add('hidden');
  document.getElementById('soal-modal').classList.remove('flex');
}

export async function handleSoalSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-soal');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Soal');

  const ptmId = document.getElementById('soal-form-pertemuan').value;
  let evalObj = (state.cachedData.evaluasi || []).find((ev) => ev.id_pertemuan === ptmId);
  let evalId = evalObj ? evalObj.id_evaluasi : '';

  if (!evalId) {
    const newEvalRes = await apiPost({
      action: 'save_evaluasi',
      id_pertemuan: ptmId,
      judul_evaluasi: 'Evaluasi Pembelajaran'
    });
    evalId = newEvalRes.id_evaluasi || 'EVL_' + new Date().getTime();
  }

  const res = await apiPost({
    action: 'save_soal_evaluasi',
    id_soal: document.getElementById('soal-form-id').value,
    id_evaluasi: evalId,
    pertanyaan: document.getElementById('soal-form-pertanyaan').value,
    opsi_a: document.getElementById('soal-form-opsi-a').value,
    opsi_b: document.getElementById('soal-form-opsi-b').value,
    opsi_c: document.getElementById('soal-form-opsi-c').value,
    opsi_d: document.getElementById('soal-form-opsi-d').value,
    kunci_jawaban: document.getElementById('soal-form-kunci').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Soal');
  if (res.success) {
    closeSoalModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('guru-soal');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Soal', text: res.message });
  }
}

export function deleteSoal(id) {
  showConfirm('Hapus Soal Evaluasi?', 'Soal ini akan dihapus dari bank soal!', async () => {
    showLoading('Menghapus soal...');
    await apiPost({ action: 'delete_soal_evaluasi', id_soal: id });
    closeLoading();
    showToast('success', 'Soal berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('guru-soal');
  });
}

export function deleteEvaluasi(id) {
  const jumlahSoal = (state.cachedData.soal_evaluasi || []).filter((s) => String(s.id_evaluasi) === String(id)).length;
  const jumlahNilai = (state.cachedData.submissions || []).filter(
    (s) => String(s.tipe_sub || '').toLowerCase() === 'evaluasi' && String(s.id_game) === String(id)
  ).length;

  showConfirm(
    'Hapus Modul Evaluasi?',
    `${jumlahSoal} soal di modul ini ikut terhapus. ${jumlahNilai} nilai siswa tetap tersimpan.`,
    async () => {
      showLoading('Menghapus modul evaluasi...');
      const res = await apiPost({ action: 'delete_evaluasi', id_evaluasi: id });
      closeLoading();
      if (res.success) {
        showToast('success', res.message);
        await fetchAllInitialData(true);
        switchView('guru-soal');
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal Menghapus Modul', text: res.message });
      }
    }
  );
}

export function openKoreksiModal(idSub) {
  const sub = (state.cachedData.submissions || []).find((s) => String(s.id_sub) === String(idSub));
  if (!sub) return;

  document.getElementById('koreksi-sub-id').value = sub.id_sub;
  document.getElementById(
    'koreksi-siswa-info'
  ).textContent = `Siswa: ${sub.nama_siswa} (${sub.kelas}) | Modul: ${sub.tipe_sub.toUpperCase()}`;
  document.getElementById('koreksi-nilai-esai').value =
    sub.nilai_esai !== '' && sub.nilai_esai !== null && sub.nilai_esai !== undefined
      ? sub.nilai_esai
      : sub.skor_otomatis || 80;
  document.getElementById('koreksi-catatan').value = sub.catatan_guru || '';

  let parsedJawaban = sub.jawaban_json;
  try {
    if (typeof sub.jawaban_json === 'string') {
      parsedJawaban = JSON.parse(sub.jawaban_json);
    }
  } catch (e) {
    parsedJawaban = sub.jawaban_json;
  }

  let jawabanHtml = '';

  if (sub.tipe_sub === 'lkpd' || sub.tipe_sub === 'lkpd_isian') {
    if (typeof parsedJawaban === 'object' && parsedJawaban !== null && !Array.isArray(parsedJawaban)) {
      let fieldLabels = {};
      const lkpdObj = (state.cachedData.lkpd || []).find((l) => String(l.id_lkpd) === String(sub.id_game));
      if (lkpdObj && lkpdObj.peta_field_json) {
        try {
          const pMap = typeof lkpdObj.peta_field_json === 'string' ? JSON.parse(lkpdObj.peta_field_json) : lkpdObj.peta_field_json;
          if (pMap && pMap.fields) {
            Object.values(pMap.fields).forEach((pageFields) => {
              if (Array.isArray(pageFields)) {
                pageFields.forEach((f) => {
                  if (f.id) fieldLabels[f.id] = f.label || f.id;
                });
              }
            });
          }
        } catch (e) { }
      }

      const entries = Object.keys(parsedJawaban).map((key) => {
        const numMatch = String(key).match(/(\d+)/);
        return { key, num: numMatch ? parseInt(numMatch[1], 10) : 0, value: parsedJawaban[key] };
      });
      entries.sort((a, b) => a.num - b.num);

      jawabanHtml = entries
        .map(
          (entry, idx) => `
            <div class="p-2.5 bg-white rounded-xl border border-slate-200 text-xs flex justify-between items-center gap-3">
              <span class="font-bold text-slate-600 shrink-0">${escapeHtml(fieldLabels[entry.key] || entry.key || `Isian #${idx + 1}`)}:</span>
              <span class="font-bold text-brand-blue bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-right break-words">${entry.value ? escapeHtml(entry.value) : '<i class="text-slate-400 font-normal">(Tidak diisi)</i>'
            }</span>
            </div>
          `
        )
        .join('');
    } else if (Array.isArray(parsedJawaban)) {
      jawabanHtml = parsedJawaban
        .map(
          (ans, idx) => `
                <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-1">
                    <span class="font-bold text-slate-700 text-[11px]">Pertanyaan #${idx + 1}</span>
                    <p class="text-slate-800 font-medium whitespace-pre-wrap bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">${ans ? escapeHtml(String(ans).trim()) : '<i class="text-slate-400">(Tidak diisi)</i>'
            }</p>
                </div>
            `
        )
        .join('');
    } else {
      jawabanHtml = `<p class="p-3 bg-white rounded-xl border text-slate-800 font-medium whitespace-pre-wrap text-xs">${escapeHtml(String(
        parsedJawaban
      ))}</p>`;
    }
  } else if (sub.tipe_sub === 'evaluasi') {
    if (typeof parsedJawaban === 'object' && parsedJawaban !== null) {
      const soalList = state.cachedData.soal_evaluasi || [];
      jawabanHtml =
        `<div class="space-y-2">` +
        Object.keys(parsedJawaban)
          .map((soalId, idx) => {
            const soalObj = soalList.find((s) => String(s.id_soal) === String(soalId));
            const userAns = parsedJawaban[soalId];
            const kunci = soalObj ? String(soalObj.kunci_jawaban).toUpperCase() : '';
            const isCorrect = userAns === kunci;
            const qText = soalObj ? soalObj.pertanyaan : `Soal (${soalId})`;

            return `
                    <div class="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                        <div class="flex items-start justify-between gap-2 border-b pb-1">
                            <span class="font-bold text-slate-800 text-xs">#${idx + 1}. ${escapeHtml(qText)}</span>
                            ${kunci
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                }">
                                ${isCorrect ? '✅ Benar' : '❌ Salah'} (Kunci: ${escapeHtml(kunci)})
                            </span>`
                : ''
              }
                        </div>
                        <p class="text-xs font-bold ${isCorrect ? 'text-emerald-600' : 'text-red-600'}">
                            Pilihan Jawaban Siswa: <span class="uppercase border px-2 py-0.5 rounded bg-slate-50">${escapeHtml(userAns || '-')
              }</span>
                        </p>
                    </div>
                `;
          })
          .join('') +
        `</div>`;
    } else {
      jawabanHtml = `<p class="p-3 bg-white rounded-xl border text-slate-800 font-medium text-xs">${escapeHtml(String(
        parsedJawaban
      ))}</p>`;
    }
  } else if (sub.tipe_sub === 'game') {
    if (typeof parsedJawaban === 'object' && parsedJawaban !== null) {
      jawabanHtml =
        `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">` +
        Object.keys(parsedJawaban)
          .map(
            (key, idx) => `
                <div class="p-2.5 bg-white rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                    <span class="font-bold text-slate-500">Item #${idx + 1}</span>
                    <span class="font-bold text-purple-700 uppercase bg-purple-50 px-2 py-0.5 rounded border border-purple-200">${escapeHtml(parsedJawaban[key])
              }</span>
                </div>
            `
          )
          .join('') +
        `</div>`;
    } else {
      jawabanHtml = `<p class="p-3 bg-white rounded-xl border text-slate-800 font-medium text-xs">${escapeHtml(String(
        parsedJawaban
      ))}</p>`;
    }
  } else {
    jawabanHtml = `<pre class="bg-white p-2.5 rounded-xl border text-[11px] font-mono text-slate-700 whitespace-pre-wrap">${escapeHtml(sub.jawaban_json)}</pre>`;
  }

  const body = document.getElementById('koreksi-detail-body');
  body.innerHTML = `
    <div class="p-3 bg-slate-50 border rounded-2xl space-y-2">
      <span class="font-black text-brand-navy block">📌 Isi Lembar Jawaban Siswa</span>
      <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
        ${jawabanHtml}
      </div>
    </div>
    ${/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(sub.canvas_image_base64 || ''))
      ? `<div class="p-3 bg-slate-50 border rounded-2xl">
            <span class="font-black text-brand-navy block mb-2">🎨 Sketsa Proyek STEAM</span>
            <img src="${escapeHtml(sub.canvas_image_base64)}" onerror="this.onerror=null; this.src='https://placehold.co/600x300?text=Gagal+Memuat+Gambar';" class="max-h-60 rounded-xl border mx-auto bg-white object-contain shadow-xs" />
          </div>`
      : ''
    }
  `;

  document.getElementById('koreksi-modal').classList.remove('hidden');
  document.getElementById('koreksi-modal').classList.add('flex');
}

export function closeKoreksiModal() {
  document.getElementById('koreksi-modal').classList.add('hidden');
  document.getElementById('koreksi-modal').classList.remove('flex');
}

export async function handleGradeSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-grade');
  setButtonLoading(btn, true, '💾 Menyimpan Nilai...', '💾 Simpan Penilaian');

  const res = await apiPost({
    action: 'grade_submisi',
    id_sub: document.getElementById('koreksi-sub-id').value,
    nilai_esai: document.getElementById('koreksi-nilai-esai').value,
    catatan_guru: document.getElementById('koreksi-catatan').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Penilaian');
  if (res.success) {
    closeKoreksiModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('guru-koreksi');
    if (koreksiDetailKey) renderKoreksiSiswaModal();
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Penilaian', text: res.message });
  }
}

window.exportRekapMatriksCsv = exportRekapMatriksCsv;
window.exportRekapDetailCsv = exportRekapDetailCsv;
window.setRekapFilter = setRekapFilter;
window.setRekapMode = setRekapMode;
window.setRekapKkm = setRekapKkm;
window.openRekapSiswa = openRekapSiswa;
window.openPertemuanModal = openPertemuanModal;
window.closePertemuanModal = closePertemuanModal;
window.handlePertemuanSubmit = handlePertemuanSubmit;
window.deletePertemuan = deletePertemuan;
window.openMateriModal = openMateriModal;
window.closeMateriModal = closeMateriModal;
window.toggleMateriFormTipe = toggleMateriFormTipe;
window.handleMateriSubmit = handleMateriSubmit;
window.deleteMateri = deleteMateri;
window.openLkpdModal = openLkpdModal;
window.closeLkpdModal = closeLkpdModal;
window.toggleLkpdFormTipe = toggleLkpdFormTipe;
window.handleLkpdSubmit = handleLkpdSubmit;
window.deleteLkpd = deleteLkpd;
window.openGameModal = openGameModal;
window.closeGameModal = closeGameModal;
window.renderGameConfigInputs = renderGameConfigInputs;
window.addGameItemRow = addGameItemRow;
window.handleGameSubmit = handleGameSubmit;
window.deleteGame = deleteGame;
window.openSoalModal = openSoalModal;
window.closeSoalModal = closeSoalModal;
window.handleSoalSubmit = handleSoalSubmit;
window.deleteSoal = deleteSoal;
window.openKoreksiModal = openKoreksiModal;
window.closeKoreksiModal = closeKoreksiModal;
window.handleGradeSubmit = handleGradeSubmit;
window.setKoreksiFilter = setKoreksiFilter;
window.openKoreksiSiswaModal = openKoreksiSiswaModal;
window.closeKoreksiSiswaModal = closeKoreksiSiswaModal;
window.deleteSubmisi = deleteSubmisi;
window.openEvaluasiModal = openEvaluasiModal;
window.deleteEvaluasi = deleteEvaluasi;
window.closeEvaluasiModal = closeEvaluasiModal;
window.handleEvaluasiSubmit = handleEvaluasiSubmit;

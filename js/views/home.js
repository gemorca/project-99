import { getPertemuanSiswa, getProgresPertemuan, ringkasProgres, TAB_PERTEMUAN } from '../services/progress.js';
import { state } from '../state.js';
import { escapeHtml as e, jsArg } from '../services/html.js';

function renderBanner(subteks) {
  return `
    <div class="bg-gradient-to-r from-brand-navy to-blue-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl space-y-3">
      <span class="px-3 py-1 bg-brand-yellow text-brand-navy font-black text-[10px] rounded-full uppercase tracking-wider font-heading">
        UNIVERSITAS NEGERI GORONTALO
      </span>
      <h2 class="text-2xl sm:text-3xl font-black font-heading leading-tight">
        E-LKPD INTERAKTIF BERBASIS STEAM
      </h2>
      <p class="text-xs text-slate-300 max-w-xl leading-relaxed">${subteks}</p>
    </div>
  `;
}

function cariLanjutan(daftarPertemuan) {
  for (const ptm of daftarPertemuan) {
    const progres = getProgresPertemuan(ptm.id_pertemuan);
    const tab = TAB_PERTEMUAN.find((t) => progres[t.key] && !progres[t.key].done);
    if (tab) return { ptm, tab };
  }
  return null;
}

function renderKartuPertemuan(ptm, login) {
  const progres = getProgresPertemuan(ptm.id_pertemuan);
  const tabs = TAB_PERTEMUAN.filter((t) => progres[t.key]);
  const ringkas = ringkasProgres(progres);
  const lengkap = login && ringkas.total > 0 && ringkas.selesai === ringkas.total;

  return `
    <div class="bg-white p-4 sm:p-5 rounded-3xl border shadow-xs space-y-3 ${lengkap ? 'border-emerald-300' : ''}">
      <div class="flex items-start justify-between gap-2">
        <div>
          <span class="text-[11px] font-black text-slate-500 uppercase tracking-wider">Pertemuan ${e(ptm.nomor_pertemuan)}</span>
          <h3 class="font-black text-brand-navy font-heading text-sm">${e(ptm.judul_pertemuan)}</h3>
        </div>
        ${login && ringkas.total > 0
      ? `<span class="shrink-0 px-2.5 py-1 rounded-full font-bold text-[11px] ${lengkap
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-100 text-slate-700'}">${lengkap ? '✓ Selesai' : `${ringkas.selesai} / ${ringkas.total}`}</span>`
      : ''}
      </div>
      ${tabs.length === 0
      ? '<p class="text-slate-500 font-medium">Belum ada konten pada pertemuan ini.</p>'
      : `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${tabs
        .map((t) => {
          const p = progres[t.key];
          const selesai = login && p.done;
          const sebagian = login && !p.done && p.selesai > 0;
          const info = p.total > 1 && login ? ` ${p.selesai}/${p.total}` : '';
          return `
          <button type="button" onclick="bukaTabPertemuan(${jsArg(t.view)}, ${jsArg(ptm.id_pertemuan)})"
            class="min-h-[44px] px-3 py-2 rounded-2xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${selesai
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : sebagian
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}">
            <span aria-hidden="true">${t.ikon}</span>
            <span>${t.label}${info}</span>
            ${selesai ? '<span class="text-emerald-600 font-black" aria-hidden="true">✓</span><span class="sr-only">selesai</span>' : ''}
          </button>`;
        })
        .join('')}
      </div>`}
    </div>
  `;
}

export function renderHomeView() {
  const user = state.currentUser;
  const peran = user?.role;

  if (peran === 'admin' || peran === 'guru') {
    return `
      <div class="space-y-4 max-w-4xl mx-auto text-xs">
        ${renderBanner('Platform Digital interaktif berbasis Science, Technology, Engineering, Arts, dan Mathematics. Pilih menu pada sidebar untuk mengelola data pembelajaran.')}
      </div>
    `;
  }

  const login = Boolean(user);
  const daftar = getPertemuanSiswa();
  const semua = daftar.map((p) => ringkasProgres(getProgresPertemuan(p.id_pertemuan)));
  const total = semua.reduce((n, p) => n + p.total, 0);
  const selesai = semua.reduce((n, p) => n + p.selesai, 0);
  const persen = total ? Math.round((selesai / total) * 100) : 0;
  const lanjut = login ? cariLanjutan(daftar) : null;

  const subteks = login
    ? `Halo, ${e(user.name)}! Pantau kemajuan belajarmu di bawah ini.`
    : 'Platform Digital interaktif berbasis Science, Technology, Engineering, Arts, dan Mathematics. Login untuk menyimpan jawaban dan melihat kemajuan belajarmu.';

  return `
    <div class="space-y-4 max-w-4xl mx-auto text-xs">
      ${renderBanner(subteks)}

      ${login && total > 0
      ? `<div class="bg-white p-4 sm:p-5 rounded-3xl border shadow-xs space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-black text-brand-navy font-heading text-sm">Kemajuan Belajar</h3>
          <span class="font-black text-brand-navy">${persen}%</span>
        </div>
        <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${persen}" aria-label="Kemajuan belajar">
          <div class="h-full bg-brand-emerald rounded-full" style="width:${persen}%"></div>
        </div>
        <p class="text-slate-600 font-medium">${selesai} dari ${total} kegiatan selesai.</p>
        ${lanjut
        ? `<button type="button" onclick="bukaTabPertemuan(${jsArg(lanjut.tab.view)}, ${jsArg(lanjut.ptm.id_pertemuan)})" class="min-h-[44px] w-full sm:w-auto px-5 bg-brand-blue hover:bg-blue-600 text-white font-black rounded-2xl shadow transition">
            Lanjutkan: Pertemuan ${e(lanjut.ptm.nomor_pertemuan)} - ${lanjut.tab.label}
          </button>`
        : '<p class="font-bold text-emerald-700">Semua kegiatan sudah selesai. Kerja bagus!</p>'}
      </div>`
      : ''}

      ${!login
      ? `<div class="bg-amber-50 border border-amber-200 p-4 rounded-3xl flex items-center justify-between gap-3 flex-wrap">
        <p class="text-amber-900 font-medium">Kamu sedang dalam Mode Tamu. Jawaban tidak tersimpan.</p>
        <button type="button" onclick="openLoginModal()" class="min-h-[44px] px-5 bg-brand-blue hover:bg-blue-600 text-white font-black rounded-2xl shadow transition">🔑 Login Siswa</button>
      </div>`
      : ''}

      ${daftar.length === 0
      ? '<div class="p-8 text-center text-slate-500 font-medium bg-white rounded-3xl border">Belum ada pertemuan yang dibuka untuk kelasmu.</div>'
      : daftar.map((p) => renderKartuPertemuan(p, login)).join('')}
    </div>
  `;
}

import { switchView } from './drawer.js';
import { getProgresPertemuan, ringkasProgres, TAB_PERTEMUAN } from '../services/progress.js';
import { state } from '../state.js';
import { escapeHtml as e, jsArg } from '../services/html.js';

export function renderPertemuanTabs(ptmId, viewAktif) {
  const ptm = (state.cachedData.pertemuan || []).find((p) => p.id_pertemuan === ptmId);
  if (!ptm) return '';

  const progres = getProgresPertemuan(ptmId);
  const tabs = TAB_PERTEMUAN.filter((t) => progres[t.key]);
  if (tabs.length === 0) return '';

  const ringkas = ringkasProgres(progres);
  const login = Boolean(state.currentUser);

  return `
    <div id="ptm-tabs" class="max-w-4xl mx-auto mb-4 space-y-2 text-xs">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h3 class="font-black text-brand-navy font-heading text-sm">
          Pertemuan ${e(ptm.nomor_pertemuan)}: ${e(ptm.judul_pertemuan)}
        </h3>
        ${login
      ? `<span class="px-2.5 py-1 rounded-full font-bold text-[11px] ${ringkas.selesai === ringkas.total
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-slate-100 text-slate-700'}">${ringkas.selesai} / ${ringkas.total} selesai</span>`
      : ''}
      </div>
      <div role="tablist" aria-label="Bagian pertemuan" class="flex gap-2 overflow-x-auto pb-1">
        ${tabs
      .map((t) => {
        const aktif = t.view === viewAktif;
        const p = progres[t.key];
        const selesai = login && p.done;
        return `
          <button type="button" role="tab" aria-selected="${aktif}"
            ${aktif ? 'aria-current="page"' : ''}
            onclick="bukaTabPertemuan(${jsArg(t.view)}, ${jsArg(ptmId)})"
            class="shrink-0 min-h-[44px] px-4 rounded-2xl font-bold text-xs flex items-center gap-1.5 border transition ${aktif
            ? 'bg-brand-navy text-white border-brand-navy shadow'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}">
            <span aria-hidden="true">${t.ikon}</span>
            <span>${t.label}</span>
            ${selesai
            ? '<span class="text-emerald-500 font-black" aria-hidden="true">✓</span><span class="sr-only">selesai</span>'
            : ''}
          </button>`;
      })
      .join('')}
      </div>
    </div>
  `;
}

window.bukaTabPertemuan = (view, ptmId) => switchView(view, ptmId);

import { initStandaloneSteamCanvas } from '../components/canvas-steam.js';
import { renderLkpdUntukSiswa } from '../components/pdf-overlay.js';
import { initPointerDragAndDropEngine } from '../games/drag-drop.js';
import { initMatchingLineEngine, redrawAllMatchingLines } from '../games/matching.js';
import { fetchAllInitialData } from '../services/api.js';
import { renderAdminClassesView, renderAdminUsersView } from '../views/admin.js';
import { renderEvaluasiView } from '../views/evaluasi.js';
import { renderGameView } from '../views/game.js';
import { renderGuruGameView, renderGuruKoreksiView, renderGuruLkpdView, renderGuruMateriView, renderGuruPertemuanView, renderGuruRekapView, renderGuruSoalView } from '../views/guru.js';
import { renderHomeView } from '../views/home.js';
import { loadLkpdDraft, renderLkpdView } from '../views/lkpd.js';
import { renderMateriView } from '../views/materi.js';
import { renderRuangSteamView, updateSteamPertemuanInfo } from '../views/steam-lab.js';
import { state, saveSessionState } from '../state.js';
import { escapeHtml as e } from '../services/html.js';

export function toggleDrawer(isOpen) {
  const drawer = document.getElementById('main-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (isOpen) {
    drawer.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
  } else {
    drawer.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  }
}

export function renderSidebarNav() {
  const navContainer = document.getElementById('sidebar-nav');
  if (!navContainer) return;
  navContainer.innerHTML = '';

  if (state.currentUser?.role === 'admin') {
    renderAdminNav(navContainer);
  } else if (state.currentUser?.role === 'guru') {
    renderGuruNav(navContainer);
  } else {
    renderSiswaNav(navContainer);
  }
}

export function renderSiswaNav(container) {
  const homeBtn = document.createElement('button');
  homeBtn.onclick = () => {
    switchView('home');
    toggleDrawer(false);
  };
  homeBtn.className = `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-heading text-left ${state.currentView === 'home'
      ? 'bg-brand-yellow text-slate-950 font-extrabold shadow-md'
      : 'text-slate-300 hover:bg-slate-800'
    }`;
  homeBtn.innerHTML = `<span>🏠</span><span>Beranda</span>`;
  container.appendChild(homeBtn);

  const steamBtn = document.createElement('button');
  steamBtn.onclick = () => {
    switchView('ruang-steam');
    toggleDrawer(false);
  };
  steamBtn.className = `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-heading text-left ${state.currentView === 'ruang-steam'
      ? 'bg-brand-yellow text-slate-950 font-extrabold shadow-md'
      : 'text-slate-300 hover:bg-slate-800'
    }`;
  steamBtn.innerHTML = `<span>🎨</span><span>Ruang STEAM Lab</span>`;
  container.appendChild(steamBtn);

  const userKelas = state.currentUser?.kelas || 'ALL';
  const pertemuanList = (state.cachedData.pertemuan || [])
    .filter((p) => p.status === 'Publish' && (p.id_kelas === 'ALL' || p.id_kelas === userKelas))
    .sort((a, b) => Number(a.nomor_pertemuan) - Number(b.nomor_pertemuan));

  if (pertemuanList.length > 0) {
    const titleDiv = document.createElement('div');
    titleDiv.className =
      'pt-3 pb-1 text-[10px] font-black text-slate-400 uppercase tracking-wider border-t border-slate-800/80';
    titleDiv.textContent = 'MODUL PERTEMUAN';
    container.appendChild(titleDiv);

    pertemuanList.forEach((ptm) => {
      const ptmId = ptm.id_pertemuan;

      const hasMateri = state.cachedData.materi.some((m) => m.id_pertemuan === ptmId && m.status === 'Publish');
      const hasLkpd = state.cachedData.lkpd.some((l) => l.id_pertemuan === ptmId && l.status === 'Publish');
      const hasGame = state.cachedData.games.some((g) => g.id_pertemuan === ptmId && g.status === 'Publish');
      const hasEvaluasi = state.cachedData.evaluasi.some((e) => e.id_pertemuan === ptmId && e.status === 'Publish');

      const groupWrapper = document.createElement('div');
      groupWrapper.className = 'space-y-1 bg-slate-900/60 p-2 rounded-2xl border border-slate-800/80';
      groupWrapper.innerHTML = `
        <div class="font-bold text-brand-yellow text-[11px] px-2 py-1 uppercase font-heading">
          Pertemuan ${e(ptm.nomor_pertemuan)}: ${e(ptm.judul_pertemuan)}
        </div>
      `;

      if (hasMateri)
        groupWrapper.appendChild(
          createSubNavButton(
            `📖 Bahan Ajar`,
            () => switchView('materi-ptm', ptmId),
            state.currentView === 'materi-ptm' && state.activePertemuanId === ptmId
          )
        );
      if (hasLkpd)
        groupWrapper.appendChild(
          createSubNavButton(
            `📝 LKPD Siswa`,
            () => switchView('lkpd-ptm', ptmId),
            state.currentView === 'lkpd-ptm' && state.activePertemuanId === ptmId
          )
        );
      if (hasGame)
        groupWrapper.appendChild(
          createSubNavButton(
            `🎮 Game Interaktif`,
            () => switchView('game-ptm', ptmId),
            state.currentView === 'game-ptm' && state.activePertemuanId === ptmId
          )
        );
      if (hasEvaluasi)
        groupWrapper.appendChild(
          createSubNavButton(
            `✍️ Evaluasi Kuis`,
            () => switchView('evaluasi-ptm', ptmId),
            state.currentView === 'evaluasi-ptm' && state.activePertemuanId === ptmId
          )
        );

      container.appendChild(groupWrapper);
    });
  }
}

export function createSubNavButton(label, onClickFn, isActive) {
  const btn = document.createElement('button');
  btn.onclick = () => {
    onClickFn();
    toggleDrawer(false);
  };
  btn.className = `w-full text-left px-3 py-1.5 rounded-xl font-medium transition text-[11px] flex items-center justify-between ${isActive ? 'bg-brand-blue text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
    }`;
  btn.innerHTML = `<span>${label}</span> <span>&rarr;</span>`;
  return btn;
}

export function renderGuruNav(container) {
  const menus = [
    { id: 'guru-pertemuan', title: 'Kelola Pertemuan Modul', icon: '📁' },
    { id: 'guru-materi', title: 'Kelola Bahan Ajar', icon: '📖' },
    { id: 'guru-lkpd', title: 'Kelola LKPD Siswa', icon: '📝' },
    { id: 'guru-game', title: 'Kelola Game Interaktif', icon: '🎮' },
    { id: 'guru-soal', title: 'Kelola Evaluasi & Soal', icon: '❓' },
    { id: 'guru-koreksi', title: 'Koreksi LKPD & Nilai', icon: '📊' },
    { id: 'guru-rekap', title: 'Buku Nilai & Rekapitulasi', icon: '🏆' }
  ];

  menus.forEach((m) => {
    const btn = document.createElement('button');
    btn.onclick = () => {
      switchView(m.id);
      toggleDrawer(false);
    };
    btn.className = `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-heading text-left ${state.currentView === m.id
        ? 'bg-brand-yellow text-slate-950 font-extrabold shadow-md'
        : 'text-slate-300 hover:bg-slate-800'
      }`;
    btn.innerHTML = `<span>${m.icon}</span><span>${m.title}</span>`;
    container.appendChild(btn);
  });
}

export function renderAdminNav(container) {
  const menus = [
    { id: 'admin-users', title: 'Kelola Pengguna', icon: '👥' },
    { id: 'admin-classes', title: 'Kelola Data Kelas', icon: '🏫' }
  ];

  menus.forEach((m) => {
    const btn = document.createElement('button');
    btn.onclick = () => {
      switchView(m.id);
      toggleDrawer(false);
    };
    btn.className = `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-heading text-left ${state.currentView === m.id
        ? 'bg-brand-yellow text-slate-950 font-extrabold shadow-md'
        : 'text-slate-300 hover:bg-slate-800'
      }`;
    btn.innerHTML = `<span>${m.icon}</span><span>${m.title}</span>`;
    container.appendChild(btn);
  });
}

export async function switchView(viewId, paramId = null) {
  state.currentView = viewId;
  state.activePertemuanId = paramId;

  if (state.currentUser) {
    saveSessionState();
  }

  const viewport = document.getElementById('content-viewport');
  const titleElem = document.getElementById('view-title');

  if (!state.isDataLoaded) {
    viewport.innerHTML = `<div class="p-8 text-center text-xs font-bold text-slate-500">Memuat data dari database...</div>`;
    await fetchAllInitialData();
    if (!state.isDataLoaded) return;
  }

  renderSidebarNav();

  switch (viewId) {
    case 'home':
      titleElem.textContent = 'BERANDA & DOKUMENTASI';
      viewport.innerHTML = renderHomeView();
      break;

    case 'ruang-steam':
      titleElem.textContent = 'RUANG EKSPERIMEN & LAB STEAM';
      viewport.innerHTML = renderRuangSteamView();
      setTimeout(() => {
        initStandaloneSteamCanvas();
        const selectElem = document.getElementById('steam-select-pertemuan');
        if (selectElem && selectElem.value) {
          updateSteamPertemuanInfo(selectElem.value);
        }
      }, 100);
      break;

    case 'materi-ptm':
      titleElem.textContent = 'BAHAN AJAR MATERI';
      viewport.innerHTML = renderMateriView(paramId);
      break;

    case 'lkpd-ptm':
      titleElem.textContent = 'LEMBAR KERJA PESERTA DIDIK (LKPD)';
      viewport.innerHTML = renderLkpdView(paramId);
      setTimeout(() => {
        const lkpdObj = (state.cachedData.lkpd || []).find((l) => l.id_pertemuan === paramId && l.status === 'Publish');
        const overlayContainer = document.getElementById('siswa-lkpd-overlay-container');
        if (lkpdObj && lkpdObj.peta_field_json && overlayContainer) {
          renderLkpdUntukSiswa(overlayContainer, lkpdObj, paramId);
        }
        const qCount = document.querySelectorAll(`[id^="lkpd-ans-"]`).length;
        loadLkpdDraft(paramId, qCount);
      }, 150);
      break;

    case 'game-ptm':
      titleElem.textContent = 'GAME INTERAKTIF PEMBELAJARAN';
      viewport.innerHTML = renderGameView(paramId);
      setTimeout(() => {
        initPointerDragAndDropEngine();
        initMatchingLineEngine();
        redrawAllMatchingLines();
      }, 100);
      break;

    case 'evaluasi-ptm':
      titleElem.textContent = 'EVALUASI PEMBELAJARAN';
      viewport.innerHTML = renderEvaluasiView(paramId);
      break;

    case 'admin-users':
      titleElem.textContent = 'KELOLA PENGGUNA SISTEM';
      renderAdminUsersView(viewport);
      break;

    case 'admin-classes':
      titleElem.textContent = 'KELOLA DATA KELAS';
      renderAdminClassesView(viewport);
      break;

    case 'guru-pertemuan':
      titleElem.textContent = 'KELOLA PERTEMUAN PEMBELAJARAN';
      renderGuruPertemuanView(viewport);
      break;

    case 'guru-materi':
      titleElem.textContent = 'KELOLA BAHAN AJAR';
      renderGuruMateriView(viewport);
      break;

    case 'guru-lkpd':
      titleElem.textContent = 'KELOLA LKPD SISWA';
      renderGuruLkpdView(viewport);
      break;

    case 'guru-game':
      titleElem.textContent = 'KELOLA GAME INTERAKTIF';
      renderGuruGameView(viewport);
      break;

    case 'guru-soal':
      titleElem.textContent = 'KELOLA EVALUASI & BANK SOAL';
      renderGuruSoalView(viewport);
      break;

    case 'guru-koreksi':
      titleElem.textContent = 'KOREKSI JAWABAN SISWA';
      renderGuruKoreksiView(viewport);
      break;

    case 'guru-rekap':
      titleElem.textContent = 'BUKU NILAI & REKAPITULASI';
      renderGuruRekapView(viewport);
      break;

    default:
      switchView('home');
  }

  if (window.MathJax && window.MathJax.typesetPromise) {
    MathJax.typesetPromise().catch((err) => console.log('MathJax info:', err));
  }
}

window.toggleDrawer = toggleDrawer;

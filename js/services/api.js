import { renderSidebarNav, switchView } from '../components/drawer.js';
import { closeLoading, showLoading, showToast, updateUIForAuthenticatedUser } from '../components/modal.js';
import { CACHE_KEY, GAS_API_URL } from '../config.js';
import { getIDBCache, saveToOutboxQueue, setIDBCache } from '../services/idb.js';
import { registerServiceWorkerAndSync, triggerOutboxFlushManual } from '../services/sw-register.js';
import { clearSessionState, state } from '../state.js';
import { escapeHtml } from '../services/html.js';

function tokenQuery() {
  return state.authToken ? `&token=${encodeURIComponent(state.authToken)}` : '';
}

export async function resetCachedData() {
  state.cachedData = {
    users: [],
    kelas: [],
    pertemuan: [],
    materi: [],
    lkpd: [],
    games: [],
    evaluasi: [],
    soal_evaluasi: [],
    submissions: [],
    reviews: []
  };
  state.isDataLoaded = false;
  try {
    await setIDBCache(CACHE_KEY, null);
  } catch (e) {
    console.error('Gagal mengosongkan cache IndexedDB:', e);
  }
}

let authExpiredHandling = false;
export async function handleAuthExpired(message) {
  if (authExpiredHandling) return;
  authExpiredHandling = true;
  try {
    state.authToken = null;
    state.currentUser = null;
    clearSessionState();
    const fm = document.getElementById('lkpd-field-map-modal');
    if (fm) {
      fm.classList.add('hidden');
      fm.classList.remove('flex');
    }
    await resetCachedData();
    updateUIForAuthenticatedUser();
    switchView('home');
    showToast('warning', message || 'Sesi berakhir. Silakan login ulang.');
  } finally {
    authExpiredHandling = false;
  }
}

export async function loadFromLocalStorage() {
  try {
    const saved = await getIDBCache(CACHE_KEY);
    if (saved) {
      state.cachedData = saved;
      state.isDataLoaded = true;
    }
  } catch (e) {
    console.error('Gagal membaca cache IndexedDB:', e);
  }
}

export async function saveToLocalStorage() {
  try {
    await setIDBCache(CACHE_KEY, state.cachedData);
  } catch (e) {
    console.error('Gagal menyimpan cache IndexedDB:', e);
  }
}

export async function fetchAllInitialData(forceRefresh = false) {
  if (!forceRefresh) {
    await loadFromLocalStorage();
    if (state.isDataLoaded) {
      fetchDataFromNetwork();
      return true;
    }
  }
  return fetchDataFromNetwork();
}

function renderLoadError(message) {
  const viewport = document.getElementById('content-viewport');
  if (!viewport || state.isDataLoaded) return;
  viewport.innerHTML = `
    <div class="p-8 text-center text-xs space-y-3">
      <div class="text-red-500 font-bold text-sm">⚠️ Gagal Memuat Data Database</div>
      <p class="text-slate-600 font-medium">${escapeHtml(message || 'Periksa koneksi internet atau konfigurasi URL backend Google Apps Script.')}</p>
      <button onclick="retryLoadData()" class="px-4 py-2 bg-brand-blue text-white font-bold rounded-xl shadow">
        🔄 Coba Muat Ulang Data
      </button>
    </div>
  `;
}

export async function retryLoadData() {
  showLoading('Memuat ulang data...');
  await fetchAllInitialData(true);
  closeLoading();
  if (state.isDataLoaded) switchView(state.currentView, state.activePertemuanId);
}

export async function fetchDataFromNetwork() {
  try {
    const res = await fetch(`${GAS_API_URL}?action=get_all_data${tokenQuery()}`);
    
    if (!res.ok) {
      throw new Error(`Server HTTP status: ${res.status}`);
    }

    const result = await res.json();

    if (result && result.auth === true) {
      await handleAuthExpired(result.message);
      return false;
    }

    const data = result.data || result;

    if (data && result.success !== false) {
      state.cachedData = {
        users: data.users || [],
        kelas: data.kelas || [],
        pertemuan: data.pertemuan || [],
        materi: data.materi || [],
        lkpd: data.lkpd || [],
        games: data.games || [],
        evaluasi: data.evaluasi || [],
        soal_evaluasi: data.soal_evaluasi || [],
        submissions: data.submissions || [],
        reviews: data.reviews || []
      };
      state.isDataLoaded = true;
      await saveToLocalStorage();
      renderSidebarNav();
      window.dispatchEvent(new Event('progres-changed'));
      return true;
    } else {
      throw new Error(result.message || 'Gagal mengambil data dari database.');
    }
  } catch (err) {
    console.error('Gagal memuat data dari database:', err);
    renderLoadError(err.message);
    return false;
  }
}

export async function refreshSubmissionsData() {
  try {
    showLoading('Memperbarui data jawaban siswa...');
    const res = await fetch(`${GAS_API_URL}?action=get_submissions${tokenQuery()}`);
    const result = await res.json();
    if (result && result.auth === true) {
      closeLoading();
      await handleAuthExpired(result.message);
      return;
    }
    const data = result.data || result;

    if (Array.isArray(data)) {
      state.cachedData.submissions = data;
      saveToLocalStorage();
      closeLoading();
      showToast('success', 'Data submisi berhasil diperbarui!');

      if (state.currentView === 'guru-koreksi') {
        switchView('guru-koreksi');
      } else if (state.currentView === 'guru-rekap') {
        switchView('guru-rekap');
      }
    } else {
      closeLoading();
      showToast('error', 'Gagal memperbarui data submisi!');
    }
  } catch (err) {
    closeLoading();
    console.error('Error refreshing submissions:', err);
    showToast('error', 'Terjadi kesalahan koneksi internet!');
  }
}

export async function apiPost(payload) {
  if (state.authToken && payload.action !== 'login') {
    payload = { ...payload, token: state.authToken };
  }

  const isSubmissionAction = ['submit_lkpd', 'submit_game', 'submit_lkpd_isian', 'save_review', 'submit_evaluasi'].includes(payload.action);

  if (isSubmissionAction) {
    const queueId = 'QUEUE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    try {
      await saveToOutboxQueue(queueId, { ...payload, queue_id: queueId });
    } catch (err) {
      console.error('Gagal menyimpan ke outbox:', err);
      return {
        success: false,
        message: 'Jawaban belum bisa disimpan di perangkat. Coba lagi, atau kosongkan ruang penyimpanan HP.'
      };
    }

    window.dispatchEvent(new Event('outbox-changed'));
    registerServiceWorkerAndSync();
    triggerOutboxFlushManual();

    return {
      success: true,
      queued: true,
      instant: true,
      queue_id: queueId,
      message: 'Tersimpan di perangkat. Dikirim otomatis ke server.'
    };
  }

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result && result.auth === true && payload.action !== 'login') {
      handleAuthExpired(result.message);
    }
    return result;
  } catch (err) {
    console.error('API POST Error:', err);
    return {
      success: false,
      message: 'Gagal terhubung ke server database! Periksa koneksi internet.'
    };
  }
}

window.refreshSubmissionsData = refreshSubmissionsData;
window.retryLoadData = retryLoadData;

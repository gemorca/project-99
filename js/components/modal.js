import { renderSidebarNav, switchView } from '../components/drawer.js';
import { CACHE_KEY } from '../config.js';
import { apiPost } from '../services/api.js';
import { playClick, playError, playSuccess, playWarning } from './sound.js';
import { clearSessionState, saveSessionState, state } from '../state.js';
import { escapeHtml, safeUrl } from '../services/html.js';

export function showToast(icon, title) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: icon,
    title: escapeHtml(title),
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true
  });

  if (icon === 'success') playSuccess();
  else if (icon === 'error') playError();
  else if (icon === 'warning') playWarning();
  else playClick();
}

export function showConfirm(title, text, confirmCallback, confirmBtnText = 'Ya, Lanjutkan') {
  playWarning();
  Swal.fire({
    title: title,
    text: text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#0D6EFD',
    cancelButtonColor: '#64748B',
    confirmButtonText: confirmBtnText,
    cancelButtonText: 'Batal'
  }).then((result) => {
    if (result.isConfirmed && confirmCallback) {
      confirmCallback();
    }
  });
}

export function showLoading(title = 'Memproses data...') {
  Swal.fire({
    title: escapeHtml(title),
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
}

export function closeLoading() {
  Swal.close();
}

export function togglePasswordVisibility(inputId, btnElem) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  if (btnElem) {
    btnElem.innerHTML = isPassword ? '🙈' : '👁️';
    btnElem.setAttribute('title', isPassword ? 'Sembunyikan Password' : 'Lihat Password');
  }
}

export function openPdfFullscreen(url, title = 'Dokumen PDF') {
  const safe = safeUrl(url);
  if (!safe) {
    showToast('error', 'Alamat dokumen tidak valid.');
    return;
  }
  document.getElementById('pdf-fullscreen-title').textContent = title;
  document.getElementById('pdf-fullscreen-iframe').src = safe;
  document.getElementById('pdf-fullscreen-external-link').href = safe.replace('/preview', '/view');
  const modal = document.getElementById('pdf-fullscreen-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closePdfFullscreenModal() {
  const modal = document.getElementById('pdf-fullscreen-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.getElementById('pdf-fullscreen-iframe').src = '';
}

export function requireStudentAuth(actionCallback) {
  if (!state.currentUser) {
    Swal.fire({
      icon: 'info',
      title: 'Akses Terbatas (Mode Guest)',
      text: 'Kamu sedang dalam Mode Guest. Silakan login sebagai Siswa untuk menyimpan jawaban!',
      showCancelButton: true,
      confirmButtonColor: '#0D6EFD',
      cancelButtonColor: '#64748B',
      confirmButtonText: '🔑 Login Siswa',
      cancelButtonText: 'Lanjut Melihat'
    }).then((res) => {
      if (res.isConfirmed) openLoginModal();
    });
    return false;
  }
  if (actionCallback) actionCallback();
  return true;
}

export function setButtonLoading(btn, isLoading, loadText = 'Menyimpan...', origText = 'Simpan') {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.setAttribute('data-orig-text', origText);
    btn.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span> ${loadText}`;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.getAttribute('data-orig-text') || origText;
    btn.classList.remove('opacity-75', 'cursor-not-allowed');
  }
}

function migrateGuestDrafts(username) {
  try {
    const prefix = `${CACHE_KEY}_DRAFT_`;
    const suffix = '_guest';
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && k.endsWith(suffix)) keys.push(k);
    }
    keys.forEach((k) => {
      const target = k.slice(0, -'guest'.length) + username;
      const val = localStorage.getItem(k);
      if (val && !localStorage.getItem(target)) localStorage.setItem(target, val);
      localStorage.removeItem(k);
    });
  } catch (err) {
    console.warn('Gagal memindahkan draft tamu:', err);
  }
}

export async function handleLoginSubmit(e) {
  e.preventDefault();
  const unElem = document.getElementById('login-username');
  const pwElem = document.getElementById('login-password');
  const un = unElem ? unElem.value.trim() : '';
  const pw = pwElem ? pwElem.value.trim() : '';
  const btn = document.getElementById('btn-submit-login');

  setButtonLoading(btn, true, 'Memproses Login...', 'Masuk');
  const res = await apiPost({ action: 'login', username: un, password: pw });
  setButtonLoading(btn, false, '', 'Masuk');

  if (res.success) {
    state.currentUser = res.user;
    state.lastActivity = Date.now();
    saveSessionState();

    migrateGuestDrafts(res.user.username);

    closeLoginModal();
    if (unElem) unElem.value = '';
    if (pwElem) pwElem.value = '';
    updateUIForAuthenticatedUser();
    showToast('success', `Selamat Datang, ${res.user.name}!`);

    if (res.user.role === 'guru') switchView('guru-pertemuan');
    else if (res.user.role === 'admin') switchView('admin-users');
    else switchView('home');
  } else {
    playError();
    if (pwElem) pwElem.value = '';
    Swal.fire({
      icon: 'error',
      title: 'Login Gagal',
      text: res.message || 'Periksa koneksi internet lalu coba lagi.',
      confirmButtonText: 'Coba Lagi',
      confirmButtonColor: '#0D6EFD'
    }).then(() => {
      if (pwElem) pwElem.focus();
    });
  }
}

export function toastSubmitResult(res, successText) {
  if (res && res.queued) {
    showToast('info', 'Tersimpan di perangkat. Dikirim otomatis ke server.');
  } else {
    showToast('success', successText);
  }
}

export function openLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
  document.getElementById('login-modal').classList.add('flex');
}

export function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('login-modal').classList.remove('flex');
}

export function logout() {
  showConfirm(
    'Keluar Sistem?',
    'Kamu akan keluar dari akun saat ini.',
    () => {
      state.currentUser = null;
      clearSessionState();
      updateUIForAuthenticatedUser();
      switchView('home');
      showToast('success', 'Berhasil Keluar Akun');
    },
    'Logout'
  );
}

export function performAutoLogout() {
  state.currentUser = null;
  clearSessionState();
  updateUIForAuthenticatedUser();
  switchView('home');
  showToast('warning', 'Sesi berakhir karena tidak ada aktivitas selama 15 menit.');
}

export function updateUIForAuthenticatedUser() {
  const nameElem = document.getElementById('user-display-name');
  const roleElem = document.getElementById('user-display-role');
  const badgeElem = document.getElementById('role-badge');
  const authBtn = document.getElementById('auth-action-btn');

  if (state.currentUser) {
    nameElem.textContent = state.currentUser.name;
    roleElem.textContent = state.currentUser.role.toUpperCase();
    badgeElem.textContent = `${state.currentUser.role.toUpperCase()}: ${state.currentUser.name}`;
    badgeElem.className = 'px-3 py-1 bg-blue-100 border border-blue-200 text-brand-blue text-xs font-black rounded-xl';

    authBtn.className =
      'w-full py-2.5 bg-red-900/80 text-red-200 font-black rounded-2xl text-xs flex items-center justify-center gap-2 border border-red-800 hover:bg-red-900 transition';
    authBtn.innerHTML = '<span>🚪 Keluar (Logout)</span>';
    authBtn.onclick = logout;
  } else {
    nameElem.textContent = 'Mode Tamu / Guest';
    roleElem.textContent = 'GUEST';
    badgeElem.textContent = 'Mode Tamu';
    badgeElem.className = 'px-3 py-1 bg-slate-100 border text-slate-700 text-xs font-black rounded-xl';

    authBtn.className =
      'w-full py-2.5 bg-brand-blue text-white font-black rounded-2xl text-xs shadow flex items-center justify-center gap-2 hover:bg-blue-600 transition';
    authBtn.innerHTML = '<span>🔑 Login Pengguna</span>';
    authBtn.onclick = openLoginModal;
  }
  renderSidebarNav();
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.openPdfFullscreen = openPdfFullscreen;
window.closePdfFullscreenModal = closePdfFullscreenModal;
window.requireStudentAuth = requireStudentAuth;
window.handleLoginSubmit = handleLoginSubmit;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;

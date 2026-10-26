import { switchView } from '../components/drawer.js';
import { closeLoading, setButtonLoading, showConfirm, showLoading, showToast } from '../components/modal.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { state } from '../state.js';
import { escapeHtml as e, jsArg, safeUrl } from '../services/html.js';

export function renderAdminUsersView(container) {
  const usersList = state.cachedData.users || [];
  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex items-center justify-between bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Total Pengguna: <b>${usersList.length}</b></span>
        <button onclick="openUserModal()" class="px-4 py-2 bg-brand-blue text-white font-bold rounded-xl shadow">+ Tambah Pengguna</button>
      </div>
      <div class="bg-white p-4 rounded-3xl border shadow-sm overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-brand-navy text-white font-heading">
            <tr>
              <th class="p-3">Nama Lengkap</th>
              <th class="p-3">Username</th>
              <th class="p-3">Role</th>
              <th class="p-3">Kelas</th>
              <th class="p-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${usersList
      .map(
        (u) => `
              <tr>
                <td class="p-3 font-bold whitespace-nowrap">${e(u.nama_lengkap)}</td>
                <td class="p-3 font-mono">${e(u.username)}</td>
                <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${u.role === 'admin'
            ? 'bg-red-100 text-red-700'
            : u.role === 'guru'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-blue-100 text-blue-700'
          }">${e(String(u.role).toUpperCase())}</span></td>
                <td class="p-3 font-bold">${e(u.kelas || '-')}</td>
                <td class="p-3 text-center whitespace-nowrap">
                  <div class="flex items-center justify-center gap-1.5">
                    <button onclick="openUserModal(${jsArg(u.user_id)})" class="px-3 py-1 bg-amber-100 text-amber-800 font-bold rounded-lg hover:bg-amber-200 transition">Edit</button>
                    <button onclick="deleteUser(${jsArg(u.user_id)})" class="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition">Hapus</button>
                  </div>
                </td>
              </tr>
            `
      )
      .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderAdminClassesView(container) {
  const kelasList = state.cachedData.kelas || [];
  container.innerHTML = `
    <div class="space-y-4 text-xs">
      <div class="flex items-center justify-between bg-white p-4 rounded-2xl border shadow-xs">
        <span class="font-bold text-slate-700">Total Kelas Registered: <b>${kelasList.length}</b></span>
        <button onclick="openKelasModal()" class="px-4 py-2 bg-brand-blue text-white font-bold rounded-xl shadow">+ Tambah Kelas</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        ${kelasList
      .map(
        (k) => `
          <div class="bg-white p-4 rounded-3xl border flex items-center justify-between gap-2 shadow-xs">
            <div>
              <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">Tingkat ${e(k.tingkat || '-')}</span>
              <h4 class="font-black text-brand-navy text-sm mt-1">${e(k.nama_kelas)}</h4>
              <p class="text-slate-500 text-[11px]">${e(k.keterangan || '')}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
              <button onclick="openKelasModal(${jsArg(k.id_kelas)})" class="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg font-bold hover:bg-amber-200 transition">Edit</button>
              <button onclick="deleteKelas(${jsArg(k.id_kelas)})" class="px-3 py-1 bg-red-100 text-red-700 rounded-lg font-bold hover:bg-red-200 transition">Hapus</button>
            </div>
          </div>
        `
      )
      .join('')}
      </div>
    </div>
  `;
}

export function openUserModal(userId = null) {
  populateKelasSelects();

  const titleElem = document.querySelector('#user-modal h3');
  const idElem = document.getElementById('user-form-id');
  const namaElem = document.getElementById('user-form-nama');
  const usernameElem = document.getElementById('user-form-username');
  const passElem = document.getElementById('user-form-password');
  const roleElem = document.getElementById('user-form-role');
  const kelasElem = document.getElementById('user-form-kelas');
  const btnEye = document.getElementById('btn-toggle-user-password');

  if (passElem) passElem.type = 'password';
  if (btnEye) btnEye.innerHTML = '👁️';

  if (userId !== null && userId !== undefined && String(userId).trim() !== '') {
    const targetIdStr = String(userId).trim();
    const u = (state.cachedData.users || []).find(
      (x) => String(x.user_id || x.id || '').trim() === targetIdStr
    );

    if (u) {
      if (titleElem) titleElem.textContent = 'Edit Data Pengguna';
      if (idElem) idElem.value = u.user_id || u.id || '';
      if (namaElem) namaElem.value = u.nama_lengkap || u.nama || '';
      if (usernameElem) usernameElem.value = u.username || '';
      if (passElem) passElem.value = u.password || '';
      if (roleElem) roleElem.value = u.role || 'siswa';
      if (kelasElem) kelasElem.value = u.kelas || '-';
    }
  } else {
    if (titleElem) titleElem.textContent = 'Tambah Pengguna Baru';
    if (idElem) idElem.value = '';
    if (namaElem) namaElem.value = '';
    if (usernameElem) usernameElem.value = '';
    if (passElem) passElem.value = '';
    if (roleElem) roleElem.value = 'siswa';
    if (kelasElem) kelasElem.value = '-';
  }

  document.getElementById('user-modal').classList.remove('hidden');
  document.getElementById('user-modal').classList.add('flex');
}

export function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
  document.getElementById('user-modal').classList.remove('flex');
}

export async function handleUserSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-user');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Pengguna');

  const res = await apiPost({
    action: 'add_user',
    user_id: document.getElementById('user-form-id').value,
    nama_lengkap: document.getElementById('user-form-nama').value,
    username: document.getElementById('user-form-username').value,
    password: document.getElementById('user-form-password').value,
    role: document.getElementById('user-form-role').value,
    kelas: document.getElementById('user-form-kelas').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Pengguna');
  if (res.success) {
    closeUserModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('admin-users');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: res.message });
  }
}

export function deleteUser(id) {
  showConfirm('Hapus Pengguna?', 'Akun pengguna ini akan dihapus permanen!', async () => {
    showLoading('Menghapus data...');
    await apiPost({ action: 'delete_user', user_id: id });
    closeLoading();
    showToast('success', 'Pengguna berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('admin-users');
  });
}

export function openKelasModal(idKelas = null) {
  const titleElem = document.querySelector('#kelas-modal h3');
  const idElem = document.getElementById('kelas-form-id');
  const namaElem = document.getElementById('kelas-form-nama');
  const tingkatElem = document.getElementById('kelas-form-tingkat');
  const ketElem = document.getElementById('kelas-form-keterangan');

  if (idKelas !== null && idKelas !== undefined && String(idKelas).trim() !== '') {
    const targetIdStr = String(idKelas).trim();
    const k = (state.cachedData.kelas || []).find(
      (x) => String(x.id_kelas || x.id || '').trim() === targetIdStr
    );

    if (k) {
      if (titleElem) titleElem.textContent = 'Edit Data Kelas';
      if (idElem) idElem.value = k.id_kelas || k.id || '';
      if (namaElem) namaElem.value = k.nama_kelas || '';
      if (tingkatElem) tingkatElem.value = k.tingkat || '';
      if (ketElem) ketElem.value = k.keterangan || '';
    }
  } else {
    if (titleElem) titleElem.textContent = 'Tambah Data Kelas Baru';
    if (idElem) idElem.value = '';
    if (namaElem) namaElem.value = '';
    if (tingkatElem) tingkatElem.value = '';
    if (ketElem) ketElem.value = '';
  }

  document.getElementById('kelas-modal').classList.remove('hidden');
  document.getElementById('kelas-modal').classList.add('flex');
}

export function closeKelasModal() {
  document.getElementById('kelas-modal').classList.add('hidden');
  document.getElementById('kelas-modal').classList.remove('flex');
}

export async function handleKelasSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-save-kelas');
  setButtonLoading(btn, true, '💾 Menyimpan...', '💾 Simpan Kelas');

  const res = await apiPost({
    action: 'save_kelas',
    id_kelas: document.getElementById('kelas-form-id').value,
    nama_kelas: document.getElementById('kelas-form-nama').value,
    tingkat: document.getElementById('kelas-form-tingkat').value,
    keterangan: document.getElementById('kelas-form-keterangan').value
  });

  setButtonLoading(btn, false, '', '💾 Simpan Kelas');
  if (res.success) {
    closeKelasModal();
    showToast('success', res.message);
    await fetchAllInitialData(true);
    switchView('admin-classes');
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: res.message });
  }
}

export function deleteKelas(id) {
  showConfirm('Hapus Data Kelas?', 'Data kelas ini akan dihapus!', async () => {
    showLoading('Menghapus kelas...');
    await apiPost({ action: 'delete_kelas', id_kelas: id });
    closeLoading();
    showToast('success', 'Kelas berhasil dihapus');
    await fetchAllInitialData(true);
    switchView('admin-classes');
  });
}

export function populateKelasSelects() {
  const kelasList = state.cachedData.kelas || [];
  const optionsHtml =
    '<option value="-">- (Khusus Guru/Admin)</option>' +
    kelasList.map((k) => `<option value="${e(k.nama_kelas)}">${e(k.nama_kelas)}</option>`).join('');

  const userKelasSel = document.getElementById('user-form-kelas');
  if (userKelasSel) userKelasSel.innerHTML = optionsHtml;

  const ptmKelasSel = document.getElementById('pertemuan-form-kelas');
  if (ptmKelasSel)
    ptmKelasSel.innerHTML =
      '<option value="ALL">Semua Kelas</option>' +
      kelasList.map((k) => `<option value="${e(k.nama_kelas)}">${e(k.nama_kelas)}</option>`).join('');
}

window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.handleUserSubmit = handleUserSubmit;
window.deleteUser = deleteUser;
window.openKelasModal = openKelasModal;
window.closeKelasModal = closeKelasModal;
window.handleKelasSubmit = handleKelasSubmit;
window.deleteKelas = deleteKelas;

import { state } from '../state.js';

const norm = (v) => String(v === null || v === undefined ? '' : v).trim().toLowerCase();

function username() {
  return state.currentUser ? norm(state.currentUser.username) : '';
}

const doneKey = (user) => `ELKPD_DONE_${user}`;
const readKey = (user) => `ELKPD_READ_${user}`;

function readSet(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err) {
    return new Set();
  }
}

function writeSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch (err) {
    console.warn('Gagal menyimpan tanda selesai:', err);
  }
}

// Tandai lokal supaya ✓ muncul langsung, sebelum antrean kirim sampai ke server.
export function markSelesai(tipe, id) {
  const user = username();
  if (!user || !id) return;
  const set = readSet(doneKey(user));
  set.add(`${tipe}:${id}`);
  writeSet(doneKey(user), set);
  window.dispatchEvent(new Event('progres-changed'));
}

export function markMateriDibaca(ptmId) {
  const user = username();
  if (!user || !ptmId) return;
  const set = readSet(readKey(user));
  if (set.has(String(ptmId))) return;
  set.add(String(ptmId));
  writeSet(readKey(user), set);
}

function hasSubmission(user, tipeList, idGame) {
  return (state.cachedData.submissions || []).some(
    (s) =>
      norm(s.username_siswa) === user &&
      tipeList.includes(norm(s.tipe_sub)) &&
      String(s.id_game || '').trim() === String(idGame).trim()
  );
}

function evalLocalDone(idEvaluasi) {
  try {
    return Boolean(JSON.parse(localStorage.getItem(`EVAL_DONE_${idEvaluasi}_${state.currentUser.username}`) || 'null'));
  } catch (err) {
    return false;
  }
}

export function getPertemuanSiswa() {
  const userKelas = state.currentUser?.kelas || 'ALL';
  return (state.cachedData.pertemuan || [])
    .filter((p) => p.status === 'Publish' && (p.id_kelas === 'ALL' || p.id_kelas === userKelas))
    .sort((a, b) => Number(a.nomor_pertemuan) - Number(b.nomor_pertemuan));
}

// Hasil: { materi, lkpd, game, evaluasi } masing-masing null (tidak ada) atau { selesai, total, done }.
export function getProgresPertemuan(ptmId) {
  const user = username();
  const data = state.cachedData;
  const publish = (list) => (list || []).filter((x) => x.id_pertemuan === ptmId && x.status === 'Publish');
  const local = user ? readSet(doneKey(user)) : new Set();

  const materi = publish(data.materi);
  const lkpd = publish(data.lkpd);
  const games = publish(data.games);
  const evaluasi = publish(data.evaluasi);

  const result = { materi: null, lkpd: null, game: null, evaluasi: null };

  if (materi.length) {
    const dibaca = user && readSet(readKey(user)).has(String(ptmId));
    result.materi = { total: 1, selesai: dibaca ? 1 : 0, done: Boolean(dibaca) };
  }

  if (lkpd.length) {
    const lk = lkpd[0];
    const done =
      Boolean(user) &&
      (hasSubmission(user, ['lkpd', 'lkpd_isian'], lk.id_lkpd) || local.has(`lkpd:${lk.id_lkpd}`));
    result.lkpd = { total: 1, selesai: done ? 1 : 0, done };
  }

  if (games.length) {
    const selesai = games.filter(
      (g) => user && (hasSubmission(user, ['game'], g.id_game) || local.has(`game:${g.id_game}`))
    ).length;
    result.game = { total: games.length, selesai, done: selesai === games.length };
  }

  if (evaluasi.length) {
    const ev = evaluasi[0];
    const done =
      Boolean(user) && (hasSubmission(user, ['evaluasi'], ev.id_evaluasi) || evalLocalDone(ev.id_evaluasi));
    result.evaluasi = { total: 1, selesai: done ? 1 : 0, done };
  }

  return result;
}

export function ringkasProgres(progres) {
  let total = 0;
  let selesai = 0;
  Object.values(progres).forEach((p) => {
    if (!p) return;
    total += p.total;
    selesai += p.selesai;
  });
  return { total, selesai, persen: total ? Math.round((selesai / total) * 100) : 0 };
}

export const TAB_PERTEMUAN = [
  { key: 'materi', view: 'materi-ptm', ikon: '📖', label: 'Bahan Ajar' },
  { key: 'lkpd', view: 'lkpd-ptm', ikon: '📝', label: 'LKPD' },
  { key: 'game', view: 'game-ptm', ikon: '🎮', label: 'Game' },
  { key: 'evaluasi', view: 'evaluasi-ptm', ikon: '✍️', label: 'Evaluasi' }
];

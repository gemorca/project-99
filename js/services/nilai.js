import { state } from '../state.js';

const TIPE_LABEL = {
  lkpd: 'LKPD',
  lkpd_isian: 'LKPD Isian',
  game: 'Game',
  evaluasi: 'Evaluasi'
};

export function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function terisi(v) {
  return v !== '' && v !== null && v !== undefined;
}

function waktu(s) {
  return new Date(s.timestamp).getTime() || 0;
}

function rataRata(angka) {
  if (!angka.length) return null;
  const total = angka.reduce((a, b) => a + b, 0);
  return Math.round((total / angka.length) * 10) / 10;
}

export function labelTipe(tipe) {
  const k = String(tipe || '').trim().toLowerCase();
  return TIPE_LABEL[k] || (k ? k.toUpperCase() : '-');
}

export function getNilaiSubmisi(s) {
  if (terisi(s.nilai_esai)) {
    const n = Number(s.nilai_esai);
    return isNaN(n) ? null : n;
  }
  if (String(s.status || '').trim() === 'Belum Dinilai') return null;
  if (terisi(s.skor_otomatis)) {
    const n = Number(s.skor_otomatis);
    return isNaN(n) ? null : n;
  }
  return null;
}

export function labelModul(s) {
  const tipe = String(s.tipe_sub || '').trim().toLowerCase();
  const id = String(s.id_game || '').trim();
  const data = state.cachedData;
  let judul = '';

  if (tipe === 'lkpd' || tipe === 'lkpd_isian') {
    const o = (data.lkpd || []).find((x) => String(x.id_lkpd).trim() === id);
    judul = o ? o.judul_lkpd : '';
  } else if (tipe === 'game') {
    const o = (data.games || []).find((x) => String(x.id_game).trim() === id);
    judul = o ? o.judul_game : '';
  } else if (tipe === 'evaluasi') {
    const o = (data.evaluasi || []).find((x) => String(x.id_evaluasi).trim() === id);
    judul = o ? o.judul_evaluasi : '';
  }
  return judul || '(modul dihapus)';
}

function infoPertemuan(idPtm) {
  const id = String(idPtm || '').trim();
  const ptm = (state.cachedData.pertemuan || []).find((p) => String(p.id_pertemuan).trim() === id);
  if (!ptm) return { id, nomor: 9999, label: 'Tanpa pertemuan', singkat: 'P?', judul: '' };
  return {
    id,
    nomor: Number(ptm.nomor_pertemuan) || 0,
    label: `Pertemuan ${ptm.nomor_pertemuan}`,
    singkat: `P${ptm.nomor_pertemuan}`,
    judul: ptm.judul_pertemuan || ''
  };
}

function kelompokPertemuan(subs, hitung) {
  const map = new Map();
  subs.forEach((s) => {
    const id = String(s.id_pertemuan || '').trim();
    if (!map.has(id)) map.set(id, { ...infoPertemuan(id), subs: [] });
    map.get(id).subs.push(s);
  });

  const hasil = [];
  map.forEach((g) => {
    const dihitung = g.subs.filter((s) => hitung.has(String(s.id_sub)));
    const nilai = dihitung.map(getNilaiSubmisi).filter((n) => n !== null);
    g.rata = rataRata(nilai);
    g.jumlah = dihitung.length;
    g.pending = dihitung.filter((s) => getNilaiSubmisi(s) === null).length;
    hasil.push(g);
  });
  hasil.sort((a, b) => a.nomor - b.nomor);
  return hasil;
}

export function buildRingkasanSiswa(subs) {
  const bySiswa = new Map();

  (subs || []).forEach((s) => {
    const username = String(s.username_siswa || '').trim();
    const key = (username || String(s.nama_siswa || '').trim()).toLowerCase();
    if (!key) return;
    if (!bySiswa.has(key)) {
      bySiswa.set(key, {
        key,
        username,
        nama: String(s.nama_siswa || username || '-'),
        kelas: String(s.kelas || '-'),
        subs: []
      });
    }
    bySiswa.get(key).subs.push(s);
  });

  const hasil = [];
  bySiswa.forEach((r) => {
    r.subs.sort((a, b) => waktu(b) - waktu(a));

    const terbaru = new Map();
    r.subs.forEach((s) => {
      const k = `${String(s.tipe_sub || '').trim().toLowerCase()}|${String(s.id_game || '').trim()}`;
      if (!terbaru.has(k)) terbaru.set(k, s);
    });

    r.counted = Array.from(terbaru.values());
    r.hitung = new Set(r.counted.map((s) => String(s.id_sub)));
    r.rata = rataRata(r.counted.map(getNilaiSubmisi).filter((n) => n !== null));
    r.pending = r.counted.filter((s) => getNilaiSubmisi(s) === null).length;
    r.perPertemuan = kelompokPertemuan(r.subs, r.hitung);
    hasil.push(r);
  });

  hasil.sort((a, b) => (b.pending > 0) - (a.pending > 0) || a.nama.localeCompare(b.nama, 'id'));
  return hasil;
}

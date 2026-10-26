import { state } from '../state.js';

const TIPE_LABEL = {
  lkpd: 'LKPD',
  lkpd_isian: 'LKPD Isian',
  game: 'Game',
  evaluasi: 'Evaluasi'
};

export { escapeHtml } from './html.js';

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

export const KOLOM_TIPE = [
  { key: 'lkpd', label: 'LKPD' },
  { key: 'game', label: 'Game' },
  { key: 'evaluasi', label: 'Evaluasi' }
];

export function kelompokTipe(tipe) {
  const k = String(tipe || '').trim().toLowerCase();
  if (k === 'lkpd' || k === 'lkpd_isian') return 'lkpd';
  if (k === 'game' || k === 'evaluasi') return k;
  return 'lain';
}

export function filterSubmisi(subs, { ptm = '', kelas = '' } = {}) {
  let out = subs || [];
  if (ptm) out = out.filter((s) => String(s.id_pertemuan || '').trim() === String(ptm).trim());
  if (kelas) out = out.filter((s) => String(s.kelas || '').trim() === String(kelas).trim());
  return out;
}

export function filterSiswa(list, q) {
  const k = String(q || '').trim().toLowerCase();
  if (!k) return list;
  return list.filter((r) => r.nama.toLowerCase().includes(k) || r.username.toLowerCase().includes(k));
}

function ringkasGrup(grup) {
  const nilai = grup.map(getNilaiSubmisi).filter((n) => n !== null);
  return { jumlah: grup.length, rata: rataRata(nilai), pending: grup.length - nilai.length };
}

export function buildRekap(list, ptmList, filterPtm = '') {
  const f = String(filterPtm || '').trim();
  const kolom = (ptmList || [])
    .slice()
    .sort((a, b) => Number(a.nomor_pertemuan) - Number(b.nomor_pertemuan))
    .filter((p) => !f || String(p.id_pertemuan).trim() === f)
    .map((p) => ({
      id: String(p.id_pertemuan).trim(),
      label: `Pertemuan ${p.nomor_pertemuan}`,
      singkat: `P${p.nomor_pertemuan}`,
      judul: p.judul_pertemuan || ''
    }));

  const known = new Set(kolom.map((k) => k.id));
  const adaLainnya = list.some((r) => r.counted.some((s) => !known.has(String(s.id_pertemuan || '').trim())));
  if (adaLainnya) kolom.push({ id: '', label: 'Pertemuan lain / terhapus', singkat: 'Lain', judul: '', lain: true });

  const baris = list.map((r) => {
    const byId = new Map(r.perPertemuan.map((g) => [g.id, g]));
    const sel = kolom.map((k) => {
      if (k.lain) {
        const grup = r.counted.filter((s) => !known.has(String(s.id_pertemuan || '').trim()));
        return grup.length ? ringkasGrup(grup) : null;
      }
      const g = byId.get(k.id);
      return g && g.jumlah > 0 ? { jumlah: g.jumlah, rata: g.rata, pending: g.pending } : null;
    });
    const tipe = {};
    KOLOM_TIPE.forEach(({ key }) => {
      const grup = r.counted.filter((s) => kelompokTipe(s.tipe_sub) === key);
      tipe[key] = grup.length ? ringkasGrup(grup) : null;
    });
    return { r, sel, tipe };
  });

  return { kolom, baris };
}

export function statistikKelas(baris, kkm = 75) {
  const batas = Number.isFinite(Number(kkm)) ? Number(kkm) : 75;
  const bernilai = baris.filter((b) => b.r.rata !== null);
  let tertinggi = null;
  let terendah = null;
  bernilai.forEach((b) => {
    if (!tertinggi || b.r.rata > tertinggi.nilai) tertinggi = { nama: b.r.nama, nilai: b.r.rata };
    if (!terendah || b.r.rata < terendah.nilai) terendah = { nama: b.r.nama, nilai: b.r.rata };
  });
  const tuntas = bernilai.filter((b) => b.r.rata >= batas).length;
  return {
    jumlahSiswa: baris.length,
    jumlahBernilai: bernilai.length,
    rataKelas: rataRata(bernilai.map((b) => b.r.rata)),
    tertinggi,
    terendah,
    pending: baris.reduce((n, b) => n + b.r.pending, 0),
    kkm: batas,
    tuntas,
    persenTuntas: bernilai.length ? Math.round((tuntas / bernilai.length) * 1000) / 10 : null
  };
}

export function csvCell(v) {
  if (typeof v === 'number') return String(v);
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(header, rows) {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function nilaiCsv(c) {
  if (!c) return '';
  if (c.rata === null) return 'Belum dinilai';
  return c.rata;
}

export function csvRekapMatriks(rekap) {
  const header = ['Siswa', 'Kelas', ...rekap.kolom.map((k) => k.label), 'Rata-rata', 'Belum dinilai'];
  const rows = rekap.baris.map((b) => [
    b.r.nama,
    b.r.kelas,
    ...b.sel.map(nilaiCsv),
    b.r.rata === null ? '' : b.r.rata,
    b.r.pending
  ]);
  return toCsv(header, rows);
}

export function csvDetailSubmisi(list) {
  const header = [
    'ID Submisi', 'Username', 'Nama Siswa', 'Kelas', 'Pertemuan', 'Tipe Modul', 'Judul Modul',
    'Nilai', 'Status', 'Waktu Submisi', 'Catatan Guru', 'Dihitung'
  ];
  const rows = [];
  list.forEach((r) => {
    r.perPertemuan.forEach((g) => {
      g.subs.forEach((s) => {
        const n = getNilaiSubmisi(s);
        rows.push([
          s.id_sub,
          s.username_siswa,
          s.nama_siswa,
          s.kelas,
          g.label,
          labelTipe(s.tipe_sub),
          labelModul(s),
          n === null ? '' : n,
          s.status,
          s.timestamp,
          s.catatan_guru,
          r.hitung.has(String(s.id_sub)) ? 'ya' : 'tidak'
        ]);
      });
    });
  });
  return toCsv(header, rows);
}

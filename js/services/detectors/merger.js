/**
 * Gabung dan bersihkan kotak hasil deteksi (Tahap 5).
 *
 * Murni fungsi (tanpa DOM). Masukan dan keluaran: kotak dalam PERSEN halaman.
 *
 *  1. Garis titik bertumpuk (kolom sama, jarak rapat) digabung jadi satu textarea.
 *     Pemimpin tumpukan hanya menyerap pengikut bila tanpa label, berlabel pertanyaan ("Mengapa?"),
 *     atau berlabel jawaban ("Jawaban ..."). Isian berlabel ("Nama", "Kelas") tidak pernah digabung,
 *     dan pengikut berlabel memutus tumpukan.
 *  2. Kotak yang tumpang tindih dibuang: yang berprioritas lebih rendah dan lebih kecil kalah.
 *     Prioritas: sel tabel > garis gabungan > garis titik tunggal.
 *  3. Tipe ditentukan dari tinggi: >= textareaH (u) atau hasil gabungan = textarea.
 *
 * Satuan u = lebar_gambar / 1190.
 */

export const MERGE_DEFAULTS = {
  alignTol: 8, // toleransi sejajar tepi kiri/kanan antar garis (u)
  maxGap: 16, // celah vertikal maksimum antar kotak yang digabung (u)
  overlapDrop: 0.8, // porsi luas yang tumpang tindih agar kotak yang kalah dibuang
  textareaH: 40 // tinggi minimum textarea (u)
};

const PRIORITY = { 'table-cell': 3, 'merged-lines': 2, 'dotted-line': 1 };
const prio = (f) => PRIORITY[f.source] || 0;

function absorbs(label) {
  return !label || /\?$/.test(label) || /^(jawaban|alasan|penjelasan|kesimpulan)/i.test(label);
}

function toPx(f, W, H) {
  return { x0: (f.x / 100) * W, y0: (f.y / 100) * H, x1: ((f.x + f.w) / 100) * W, y1: ((f.y + f.h) / 100) * H };
}

function mergeStacks(fields, W, H, o, u) {
  const tol = o.alignTol * u;
  const gap = o.maxGap * u;
  const lines = fields
    .map((f, i) => ({ f, i, b: toPx(f, W, H) }))
    .filter((q) => q.f.source === 'dotted-line' && q.f.type !== 'textarea')
    .sort((a, b) => a.b.y0 - b.b.y0);

  const chains = [];
  lines.forEach((q) => {
    let target = null;
    for (const c of chains) {
      const last = c[c.length - 1];
      const aligned = Math.abs(q.b.x0 - last.b.x0) <= tol && Math.abs(q.b.x1 - last.b.x1) <= tol;
      const close = q.b.y0 - last.b.y1 <= gap && q.b.y0 >= last.b.y0;
      if (aligned && close && absorbs(c[0].f.label) && !q.f.label) {
        target = c;
        break;
      }
    }
    if (target) target.push(q);
    else chains.push([q]);
  });

  const drop = new Set();
  const added = [];
  chains.forEach((c) => {
    if (c.length < 2) return;
    c.forEach((q) => drop.add(q.i));
    const x0 = Math.min(...c.map((q) => q.b.x0));
    const y0 = Math.min(...c.map((q) => q.b.y0));
    const x1 = Math.max(...c.map((q) => q.b.x1));
    const y1 = Math.max(...c.map((q) => q.b.y1));
    const merged = {
      ...c[0].f,
      x: (x0 / W) * 100,
      y: (y0 / H) * 100,
      w: ((x1 - x0) / W) * 100,
      h: ((y1 - y0) / H) * 100,
      type: 'textarea',
      source: 'merged-lines',
      lines: c.length
    };
    added.push(merged);
  });
  return fields.filter((_, i) => !drop.has(i)).concat(added);
}

function dropOverlaps(fields, W, H, o) {
  const items = fields
    .map((f) => ({ f, b: toPx(f, W, H) }))
    .map((q) => ({ ...q, area: (q.b.x1 - q.b.x0) * (q.b.y1 - q.b.y0) }))
    .sort((a, b) => prio(b.f) - prio(a.f) || b.area - a.area);
  const kept = [];
  items.forEach((q) => {
    const clash = kept.some((k) => {
      const ox = Math.min(q.b.x1, k.b.x1) - Math.max(q.b.x0, k.b.x0);
      const oy = Math.min(q.b.y1, k.b.y1) - Math.max(q.b.y0, k.b.y0);
      return ox > 0 && oy > 0 && (ox * oy) / Math.min(q.area, k.area) >= o.overlapDrop;
    });
    if (!clash) kept.push(q);
  });
  return kept.map((q) => q.f);
}

export function mergeFields(fields, W, H, options = {}) {
  const o = { ...MERGE_DEFAULTS, ...options };
  const u = W / 1190;
  let out = (fields || []).map((f) => ({ ...f }));
  out = mergeStacks(out, W, H, o, u);
  out = dropOverlaps(out, W, H, o);
  out.forEach((f) => {
    if (f.source === 'merged-lines') f.type = 'textarea';
    else if (f.source !== 'table-cell') f.type = (f.h / 100) * H >= o.textareaH * u ? 'textarea' : 'text';
  });
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Pelabelan kotak hasil deteksi dari teks OCR (Tahap 4).
 *
 * Murni fungsi (tanpa DOM, tanpa Tesseract), jadi bisa diuji di Node.
 *
 * Masukan:
 *  - fields: kotak dalam PERSEN halaman, boleh membawa { source, grid:{table,row,col} }
 *  - words : kata hasil OCR dalam PIKSEL gambar: { text, x0, y0, x1, y1, conf }
 *
 * Aturan label (berurutan, berhenti pada yang pertama cocok):
 *  1. Sel tabel (grid lebih dari 1 kolom): "Tabel T baris R <header kolom>".
 *     Header = teks di atas baris pertama tabel yang sejajar kolom. Tanpa header: "... kolom C".
 *  2. Teks di sebelah kiri pada baris yang sama ("Nama :" -> "Nama").
 *  3. Judul tepat di atas kotak ("Jawaban :", "Sketsa Rancangan").
 *     Judul "Jawaban" diberi nomor soal bila ada angka di kiri-atas ("Jawaban soal 2").
 *  4. Gagal: label tetap kosong, editor memakai "Field N".
 * Label kembar pada satu halaman diberi akhiran angka.
 *
 * Semua jarak dalam satuan u = lebar_gambar / 1190.
 */

export const LABEL_DEFAULTS = {
  minConf: 50, // keyakinan OCR minimum per kata (0-100)
  lineGap: 30, // celah horizontal yang memisahkan dua segmen teks sebaris (u)
  leftReach: 200, // jarak maksimum teks kiri ke kotak (u)
  leftSlack: 8, // teks kiri boleh menjorok ke kotak sejauh ini (u)
  headerReach: 70, // jarak maksimum header kolom di atas tabel (u)
  titleReach: 45, // jarak maksimum judul di atas kotak (u)
  numberReach: 450, // jarak maksimum nomor soal di atas kotak (u)
  maxWords: 5, // jumlah kata maksimum dalam label
  maxChars: 40
};

const isJunk = (t) => !/[A-Za-z0-9]{2,}|^\d$/.test(t);

/** Kata -> segmen teks (satu baris, dipisah bila celah > lineGap). */
export function buildLines(words, width, options = {}) {
  const o = { ...LABEL_DEFAULTS, ...options };
  const u = width / 1190;
  const ws = (words || [])
    .filter((w) => w && w.text && String(w.text).trim() && (w.conf === undefined || w.conf >= o.minConf))
    .map((w) => ({ text: String(w.text).trim(), x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, cy: (w.y0 + w.y1) / 2, h: w.y1 - w.y0 }))
    .sort((a, b) => a.cy - b.cy);

  const rows = [];
  ws.forEach((w) => {
    const row = rows.find((r) => Math.abs(r.cy - w.cy) <= 0.6 * Math.max(r.h, w.h));
    if (row) {
      row.words.push(w);
      row.cy = row.words.reduce((s, q) => s + q.cy, 0) / row.words.length;
      row.h = Math.max(row.h, w.h);
    } else rows.push({ cy: w.cy, h: w.h, words: [w] });
  });

  const lines = [];
  rows.forEach((r) => {
    r.words.sort((a, b) => a.x0 - b.x0);
    let seg = [];
    const flush = () => {
      if (!seg.length) return;
      const text = seg.map((q) => q.text).join(' ');
      if (!isJunk(text)) {
        const y0 = Math.min(...seg.map((q) => q.y0));
        const y1 = Math.max(...seg.map((q) => q.y1));
        lines.push({ text, x0: seg[0].x0, x1: seg[seg.length - 1].x1, y0, y1, cy: (y0 + y1) / 2 });
      }
      seg = [];
    };
    r.words.forEach((w) => {
      if (seg.length && w.x0 - seg[seg.length - 1].x1 > o.lineGap * u) flush();
      seg.push(w);
    });
    flush();
  });
  return lines;
}

export function cleanLabel(text, o = LABEL_DEFAULTS) {
  let t = String(text || '')
    .replace(/[|_=~\\\/]+/g, ' ')
    .replace(/[.:;,\s]+$/g, '')
    .replace(/^[\s.:;,\-•]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  let parts = t.split(' ');
  // Buang penanda daftar / ikon di depan ("a.", "it", "@") dan kata huruf kecil sebelum kata berkapital.
  while (parts.length > 1) {
    const hasCapLater = parts.slice(1).some((q) => /^[A-Z]/.test(q));
    if ((parts[0].length <= 2 && !/^\d+$/.test(parts[0])) || (/^[a-z]/.test(parts[0]) && hasCapLater)) parts.shift();
    else break;
  }
  t = parts.join(' ');
  if (parts.length > o.maxWords) t = parts.slice(0, o.maxWords).join(' ');
  if (t.length > o.maxChars) t = t.slice(0, o.maxChars).trim();
  // Tolak sampah OCR (ikon, garis): harus ada kata >= 3 huruf dan sebagian besar karakter huruf/angka.
  const compact = t.replace(/\s/g, '');
  const alnum = (compact.match(/[A-Za-z0-9]/g) || []).length;
  const hasWord = /[A-Za-z]{3,}/.test(t) || /^\d{1,2}$/.test(t);
  return hasWord && alnum >= 0.75 * compact.length ? t : '';
}

function tableLabels(fields, pxBoxes, lines, o, u) {
  const byTable = new Map();
  fields.forEach((f, i) => {
    if (!f.grid || f.label) return;
    if (!byTable.has(f.grid.table)) byTable.set(f.grid.table, []);
    byTable.get(f.grid.table).push(i);
  });

  const out = new Map();
  byTable.forEach((idxs, t) => {
    const cols = new Set(idxs.map((i) => fields[i].grid.col));
    if (cols.size < 2) return; // satu kolom saja = daftar kotak, bukan tabel
    const top = Math.min(...idxs.map((i) => pxBoxes[i].y0));
    idxs.forEach((i) => {
      const b = pxBoxes[i];
      const colCells = idxs.filter((j) => fields[j].grid.col === fields[i].grid.col).map((j) => pxBoxes[j]);
      const cx0 = Math.min(...colCells.map((c) => c.x0));
      const cx1 = Math.max(...colCells.map((c) => c.x1));
      const head = lines
        .filter((l) => l.cy < top && top - l.cy <= o.headerReach * u && l.x0 >= cx0 - 10 * u && l.x1 <= cx1 + 10 * u)
        .sort((a, b2) => a.cy - b2.cy)
        .map((l) => l.text)
        .join(' ');
      const header = cleanLabel(head, { ...o, maxWords: 4 });
      const g = fields[i].grid;
      out.set(i, header ? `Tabel ${t} baris ${g.row} ${header}` : `Tabel ${t} baris ${g.row} kolom ${g.col}`);
      void b;
    });
  });
  return out;
}

/**
 * @param {Array} fields kotak dalam persen halaman
 * @param {Array} words  kata OCR dalam piksel
 * @returns {Array} salinan fields dengan label terisi bila ditemukan
 */
export function assignLabels(fields, words, width, height, options = {}) {
  const o = { ...LABEL_DEFAULTS, ...options };
  const u = width / 1190;
  const lines = buildLines(words, width, o);
  const out = fields.map((f) => ({ ...f }));
  if (!lines.length) return out;

  const px = out.map((f) => ({
    x0: (f.x / 100) * width,
    y0: (f.y / 100) * height,
    x1: ((f.x + f.w) / 100) * width,
    y1: ((f.y + f.h) / 100) * height
  }));

  const tbl = tableLabels(out, px, lines, o, u);

  out.forEach((f, i) => {
    if (f.label) return;
    if (tbl.has(i)) {
      f.label = tbl.get(i);
      return;
    }
    const b = px[i];

    // 2. teks di kiri, satu baris dengan kotak
    const left = lines
      .filter((l) => l.cy >= b.y0 && l.cy <= b.y1 && l.x1 <= b.x0 + o.leftSlack * u && b.x0 - l.x1 <= o.leftReach * u)
      .sort((a, c) => a.cy - c.cy);
    if (left.length) {
      const raw = left.map((l) => l.text).join(' ');
      let lab = cleanLabel(raw, o);
      // Kotak garis titik: label harus berkapital di depan, dan pendek atau berakhir ":".
      // Teks kalimat yang terpotong baris (pertanyaan panjang) bukan label.
      if (lab && f.source !== 'table-cell') {
        const short = lab.split(' ').length <= 4 || /:\s*$/.test(raw);
        if (!/^[A-Z0-9]/.test(lab) || !short) lab = '';
      }
      if (lab) {
        f.label = lab;
        return;
      }
    }

    // 3. judul tepat di atas kotak
    const above = lines
      .filter((l) => l.cy <= b.y0 + 2 * u && b.y0 - l.cy <= o.titleReach * u && l.x0 >= b.x0 - 10 * u && l.x0 <= b.x0 + 0.5 * (b.x1 - b.x0))
      .sort((a, c) => c.cy - a.cy)[0];
    if (above) {
      let lab = cleanLabel(above.text, o);
      if (lab && !/^[A-Z0-9]/.test(lab)) lab = '';
      if (lab && f.source !== 'table-cell' && lab.split(' ').length > 4 && !/:\s*$/.test(above.text)) lab = '';
      if (lab) {
        f.label = lab;
        if (/^jawaban/i.test(lab)) {
          const num = lines
            .filter((l) => /^\d{1,2}[.)]?$/.test(l.text) && l.x1 < b.x0 && l.cy <= b.y0 + 20 * u && b.y0 - l.cy <= o.numberReach * u)
            .sort((a, c) => c.cy - a.cy)[0];
          if (num) f.label = `${lab} soal ${num.text.replace(/\D/g, '')}`;
        }
      }
    }
  });

  // Label kembar -> beri nomor urut.
  const seen = new Map();
  out.forEach((f) => {
    if (!f.label) return;
    const n = (seen.get(f.label) || 0) + 1;
    seen.set(f.label, n);
    if (n > 1) f.label = `${f.label} ${n}`;
  });
  return out;
}

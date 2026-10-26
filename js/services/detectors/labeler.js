export const LABEL_DEFAULTS = {
  minConf: 50,
  lineGap: 30,
  leftReach: 200,
  leftSlack: 8,
  headerReach: 70,
  titleReach: 45,
  numberReach: 450,
  maxWords: 5,
  maxChars: 40
};

const isJunk = (t) => !/[A-Za-z0-9]{2,}|^\d$/.test(t);

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
  while (parts.length > 1) {
    const hasCapLater = parts.slice(1).some((q) => /^[A-Z]/.test(q));
    if ((parts[0].length <= 2 && !/^\d+$/.test(parts[0])) || (/^[a-z]/.test(parts[0]) && hasCapLater)) parts.shift();
    else break;
  }
  t = parts.join(' ');
  if (parts.length > o.maxWords) t = parts.slice(0, o.maxWords).join(' ');
  if (t.length > o.maxChars) t = t.slice(0, o.maxChars).trim();
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
    if (cols.size < 2) return;
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

    const left = lines
      .filter((l) => l.cy >= b.y0 && l.cy <= b.y1 && l.x1 <= b.x0 + o.leftSlack * u && b.x0 - l.x1 <= o.leftReach * u)
      .sort((a, c) => a.cy - c.cy);
    if (left.length) {
      const raw = left.map((l) => l.text).join(' ');
      let lab = cleanLabel(raw, o);
      if (lab && f.source !== 'table-cell') {
        const short = lab.split(' ').length <= 4 || /:\s*$/.test(raw);
        if (!/^[A-Z0-9]/.test(lab) || !short) lab = '';
      }
      if (lab) {
        f.label = lab;
        return;
      }
    }

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

  const seen = new Map();
  out.forEach((f) => {
    if (!f.label) return;
    const n = (seen.get(f.label) || 0) + 1;
    seen.set(f.label, n);
    if (n > 1) f.label = `${f.label} ${n}`;
  });
  return out;
}

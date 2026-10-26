import { detectDottedLines } from './dotted-lines.js';

export const TABLE_DEFAULTS = {
  blurRadius: 7,
  inkThreshold: 18,
  closeRadius: 3,
  erasePad: 4,
  minCellW: 40,
  minCellH: 22,
  maxAreaFrac: 0.2,
  maxWidthFrac: 0.92,
  edgeCoverage: 0.7,
  edgeBand: 3,
  cornerSkip: 10,
  minFill: 0.6,
  minGray: 195,
  maxSat: 45,
  borderCoverage: 0.45,
  borderMean: 0.65,
  trimFrac: 0.6,
  inset: 4,
  labelZone: 30,
  labelZoneFrac: 0.35,
  labelGap: 3,
  glyphMinH: 5.5,
  maxInkFrac: 0.03,
  textareaH: 40,
  groupGap: 16,
  groupTol: 8
};

function toGray(data, n) {
  const g = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) g[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  return g;
}

function boxBlur(gray, w, h, r) {
  const W = w + 1;
  const integral = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * W + (x + 1)] = integral[y * W + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      out[y * w + x] = (sum / ((x1 - x0) * (y1 - y0))) | 0;
    }
  }
  return out;
}

function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let cnt = 0;
    for (let x = 0; x < Math.min(r, w); x++) cnt += mask[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) cnt += mask[row + x + r];
      if (x - r - 1 >= 0) cnt -= mask[row + x - r - 1];
      tmp[row + x] = cnt > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = 0; y < Math.min(r, h); y++) cnt += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) cnt += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) cnt -= tmp[(y - r - 1) * w + x];
      out[y * w + x] = cnt > 0 ? 1 : 0;
    }
  }
  return out;
}

function inkComponents(ink, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const comps = [];
  for (let s = 0; s < ink.length; s++) {
    if (!ink[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    let area = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (ink[ni] && !seen[ni]) {
            seen[ni] = 1;
            stack[sp++] = ni;
          }
        }
      }
    }
    comps.push({ x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, area });
  }
  return comps;
}

function openRegions(closed, w, h) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const regs = [];
  let id = 0;
  for (let s = 0; s < closed.length; s++) {
    if (closed[s] || labels[s]) continue;
    id++;
    let sp = 0;
    stack[sp++] = s;
    labels[s] = id;
    let x0 = w;
    let x1 = 0;
    let y0 = h;
    let y1 = 0;
    let area = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && !closed[idx - 1] && !labels[idx - 1]) (labels[idx - 1] = id), (stack[sp++] = idx - 1);
      if (x < w - 1 && !closed[idx + 1] && !labels[idx + 1]) (labels[idx + 1] = id), (stack[sp++] = idx + 1);
      if (y > 0 && !closed[idx - w] && !labels[idx - w]) (labels[idx - w] = id), (stack[sp++] = idx - w);
      if (y < h - 1 && !closed[idx + w] && !labels[idx + w]) (labels[idx + w] = id), (stack[sp++] = idx + w);
    }
    regs.push({ id, x0, x1, y0, y1, area });
  }
  return { labels, regs };
}

function trimLeaks(labels, w, r, trimFrac) {
  const bw = r.x1 - r.x0 + 1;
  const bh = r.y1 - r.y0 + 1;
  const rows = new Int32Array(bh);
  const cols = new Int32Array(bw);
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (labels[y * w + x] === r.id) {
        rows[y - r.y0]++;
        cols[x - r.x0]++;
      }
    }
  }
  const maxR = Math.max(...rows);
  const maxC = Math.max(...cols);
  let ya = 0;
  let yb = bh - 1;
  let xa = 0;
  let xb = bw - 1;
  while (ya < yb && rows[ya] < trimFrac * maxR) ya++;
  while (yb > ya && rows[yb] < trimFrac * maxR) yb--;
  while (xa < xb && cols[xa] < trimFrac * maxC) xa++;
  while (xb > xa && cols[xb] < trimFrac * maxC) xb--;
  r.x0 += xa;
  r.x1 = r.x0 - xa + xb;
  r.y0 += ya;
  r.y1 = r.y0 - ya + yb;
}

function borderInked(ink, w, h, reg, closeR, o, u) {
  const reach = 2 * closeR + 3;
  const skip = Math.round(o.cornerSkip * u);
  const side = (from, to, test) => {
    if (to <= from) return 1;
    let hit = 0;
    for (let i = from; i <= to; i++) if (test(i)) hit++;
    return hit / (to - from + 1);
  };
  const rowHit = (x, y0, dir) => {
    for (let k = 1; k <= reach; k++) {
      const y = y0 + dir * k;
      if (y >= 0 && y < h && ink[y * w + x]) return true;
    }
    return false;
  };
  const colHit = (y, x0, dir) => {
    for (let k = 1; k <= reach; k++) {
      const x = x0 + dir * k;
      if (x >= 0 && x < w && ink[y * w + x]) return true;
    }
    return false;
  };
  const xa = reg.x0 + skip;
  const xb = reg.x1 - skip;
  const ya = reg.y0 + skip;
  const yb = reg.y1 - skip;
  const fr = [
    side(xa, xb, (x) => rowHit(x, reg.y0, -1)),
    side(xa, xb, (x) => rowHit(x, reg.y1, 1)),
    side(ya, yb, (y) => colHit(y, reg.x0, -1)),
    side(ya, yb, (y) => colHit(y, reg.x1, 1))
  ];
  if (o.debugBorders) o.debugBorders.push({ x0: reg.x0, y0: reg.y0, x1: reg.x1, y1: reg.y1, fr: fr.map((v) => +v.toFixed(2)) });
  const good = fr.filter((v) => v >= o.borderCoverage).length;
  return good >= 3 && (fr[0] + fr[1] + fr[2] + fr[3]) / 4 >= o.borderMean;
}

function meanTone(data, labels, w, r) {
  let g = 0;
  let sat = 0;
  let n = 0;
  for (let y = r.y0; y <= r.y1; y += 3) {
    for (let x = r.x0; x <= r.x1; x += 3) {
      if (labels[y * w + x] !== r.id) continue;
      const p = (y * w + x) * 4;
      const mx = Math.max(data[p], data[p + 1], data[p + 2]);
      const mn = Math.min(data[p], data[p + 1], data[p + 2]);
      g += (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
      sat += mx - mn;
      n++;
    }
  }
  return n ? { gray: Math.round(g / n), sat: Math.round(sat / n) } : { gray: 0, sat: 255 };
}

function edgeCovered(labels, w, id, reg, o, u) {
  const band = Math.max(1, Math.round(o.edgeBand * u));
  const skip = Math.round(o.cornerSkip * u);
  const hasRow = (x, y0, dir) => {
    for (let k = 0; k < band; k++) if (labels[(y0 + dir * k) * w + x] === id) return true;
    return false;
  };
  const hasCol = (y, x0, dir) => {
    for (let k = 0; k < band; k++) if (labels[y * w + x0 + dir * k] === id) return true;
    return false;
  };
  const frac = (from, to, test) => {
    if (to <= from) return 1;
    let hit = 0;
    for (let i = from; i <= to; i++) if (test(i)) hit++;
    return hit / (to - from + 1);
  };
  const xa = reg.x0 + skip;
  const xb = reg.x1 - skip;
  const ya = reg.y0 + skip;
  const yb = reg.y1 - skip;
  const need = o.edgeCoverage;
  const fr = [
    frac(xa, xb, (x) => hasRow(x, reg.y0, 1)),
    frac(xa, xb, (x) => hasRow(x, reg.y1, -1)),
    frac(ya, yb, (y) => hasCol(y, reg.x0, 1)),
    frac(ya, yb, (y) => hasCol(y, reg.x1, -1))
  ];
  if (o.debugEdges) o.debugEdges.push({ id, x0: reg.x0, y0: reg.y0, x1: reg.x1, y1: reg.y1, fr: fr.map((v) => +v.toFixed(2)) });
  return fr.every((v) => v >= need);
}

export function detectTableCells(image, options = {}) {
  const o = { ...TABLE_DEFAULTS, ...options };
  const { width: w, height: h, data } = image;
  const u = w / 1190;
  const lines = options.lines || detectDottedLines(image);

  const gray = toGray(data, w * h);
  const bg = boxBlur(gray, w, h, Math.max(2, Math.round(o.blurRadius * u)));
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = Math.abs(bg[i] - gray[i]) > o.inkThreshold ? 1 : 0;

  const ep = Math.round(o.erasePad * u);
  lines.forEach((ln) => {
    const ya = Math.max(0, Math.round(ln.y) - ep);
    const yb = Math.min(h - 1, Math.round(ln.y) + ep);
    const xa = Math.max(0, Math.round(ln.x0));
    const xb = Math.min(w - 1, Math.round(ln.x1));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) ink[y * w + x] = 0;
  });

  const closeR = Math.max(1, Math.round(o.closeRadius * u));
  const closed = dilate(ink, w, h, closeR);
  const { labels, regs } = openRegions(closed, w, h);
  const comps = inkComponents(ink, w, h);

  const W1 = w + 1;
  const integ = new Int32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) {
      rs += ink[y * w + x];
      integ[(y + 1) * W1 + x + 1] = integ[y * W1 + x + 1] + rs;
    }
  }
  const inkIn = (xa, ya, xb, yb) => {
    xa = Math.max(0, xa);
    ya = Math.max(0, ya);
    xb = Math.min(w - 1, xb);
    yb = Math.min(h - 1, yb);
    if (xb < xa || yb < ya) return 0;
    return integ[(yb + 1) * W1 + xb + 1] - integ[ya * W1 + xb + 1] - integ[(yb + 1) * W1 + xa] + integ[ya * W1 + xa];
  };

  const cells = [];
  const pageArea = w * h;
  const minW = o.minCellW * u;
  const minH = o.minCellH * u;
  const inset = Math.round(o.inset * u);
  const glyphH = o.glyphMinH * u;

  const dbg = o.debugLog;
  const rej = (r, why, extra) => {
    if (dbg && r.area > 400 * u * u) dbg.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, why, extra });
  };

  regs.forEach((r) => {
    let bw = r.x1 - r.x0 + 1;
    let bh = r.y1 - r.y0 + 1;
    if (bw < minW || bh < minH) return;
    if (r.x0 <= 0 || r.y0 <= 0 || r.x1 >= w - 1 || r.y1 >= h - 1) return rej(r, 'border');
    if (r.area < o.minFill * 0.5 * bw * bh) return rej(r, 'sparse');
    trimLeaks(labels, w, r, o.trimFrac);
    bw = r.x1 - r.x0 + 1;
    bh = r.y1 - r.y0 + 1;
    if (bw < minW || bh < minH) return;
    if (bw > o.maxWidthFrac * w || r.area > o.maxAreaFrac * pageArea) return rej(r, 'big');
    if (r.area / (bw * bh) < o.minFill) return rej(r, 'fill', (r.area / (bw * bh)).toFixed(2));
    if (!edgeCovered(labels, w, r.id, r, o, u)) return rej(r, 'edge');
    if (!borderInked(ink, w, h, r, closeR, o, u)) return rej(r, 'noborder');
    const tone = meanTone(data, labels, w, r);
    if (tone.gray < o.minGray || tone.sat > o.maxSat) return rej(r, 'tone', tone.gray + '/' + tone.sat);

    const ix0 = r.x0 + inset;
    const iy0 = r.y0 + inset;
    const ix1 = r.x1 - inset;
    const iy1 = r.y1 - inset;
    if (ix1 <= ix0 || iy1 <= iy0) return;
    const zoneH = Math.min(o.labelZone * u, o.labelZoneFrac * (iy1 - iy0));
    const zoneEnd = iy0 + zoneH;

    let labelBottom = -1;
    for (const c of comps) {
      if (c.cx < ix0 || c.cx > ix1 || c.cy < iy0 || c.cy > iy1) continue;
      if (c.x1 - c.x0 + 1 >= bw * 0.9 && c.y1 - c.y0 + 1 >= bh * 0.9) continue;
      const ch = c.y1 - c.y0 + 1;
      if (c.cy <= zoneEnd) {
        labelBottom = Math.max(labelBottom, c.y1);
      } else if (ch >= glyphH) {
        labelBottom = -2;
        if (dbg) dbg.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, why: 'glyphcomp', extra: [c.x0, c.y0, c.x1, c.y1, c.area, 'zoneEnd', Math.round(zoneEnd)].join(',') });
        break;
      }
    }
    if (labelBottom === -2) return rej(r, 'glyph');

    const belowArea = (ix1 - ix0 + 1) * Math.max(1, iy1 - zoneEnd);
    const frac = inkIn(ix0, Math.ceil(zoneEnd), ix1, iy1) / belowArea;
    if (frac > o.maxInkFrac) return rej(r, 'ink', frac.toFixed(3));

    let top = r.y0;
    if (labelBottom >= 0) top = Math.max(top, labelBottom + Math.round(o.labelGap * u));
    if (r.y1 - top + 1 < minH) return rej(r, 'short');

    cells.push({ x0: r.x0, y0: top, x1: r.x1, y1: r.y1, fullY0: r.y0 });
  });

  const leaf = cells.filter((a) =>
    !cells.some((b) => {
      if (b === a) return false;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.fullY0, b.fullY0);
      if (ox <= 0 || oy <= 0) return false;
      const areaB = (b.x1 - b.x0) * (b.y1 - b.fullY0);
      const aArea = (a.x1 - a.x0) * (a.y1 - a.fullY0);
      return (ox * oy) / areaB > 0.9 && aArea > areaB;
    })
  );

  return groupIntoTables(leaf, o, u).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

function groupIntoTables(cells, o, u) {
  const gap = o.groupGap * u;
  const tol = o.groupTol * u;
  const parent = cells.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i];
      const b = cells[j];
      const sameRow = Math.abs(a.y0 - b.y0) <= tol && Math.abs(a.y1 - b.y1) <= tol;
      const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      const sameCol = Math.abs(a.x0 - b.x0) <= tol && Math.abs(a.x1 - b.x1) <= tol;
      const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
      if ((sameRow && gapX <= gap) || (sameCol && gapY <= gap)) union(i, j);
    }
  }

  const groups = new Map();
  cells.forEach((c, i) => {
    const g = find(i);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  });

  const rank = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const keys = [];
    sorted.forEach((v) => {
      if (!keys.length || v - keys[keys.length - 1] > tol) keys.push(v);
    });
    return (v) => keys.findIndex((k) => Math.abs(k - v) <= tol) + 1;
  };

  const out = [];
  const multi = [...groups.values()].filter((g) => g.length >= 2).sort((a, b) => Math.min(...a.map((c) => c.y0)) - Math.min(...b.map((c) => c.y0)));
  multi.forEach((g, gi) => {
    const rowOf = rank(g.map((c) => c.y0));
    const colOf = rank(g.map((c) => c.x0));
    g.forEach((c) => {
      c.table = gi + 1;
      c.row = rowOf(c.y0);
      c.col = colOf(c.x0);
    });
  });
  groups.forEach((g) => g.forEach((c) => out.push(c)));
  return out;
}

export function cellsToFields(cells, width, height, options = {}) {
  const o = { ...TABLE_DEFAULTS, ...options };
  const u = width / 1190;
  const pad = Math.round(1.5 * u);
  return cells.map((c) => {
    const x0 = c.x0 + pad;
    const y0 = c.y0 + pad;
    const x1 = c.x1 - pad;
    const y1 = c.y1 - pad;
    const hPx = y1 - y0;
    const f = {
      x: (x0 / width) * 100,
      y: (y0 / height) * 100,
      w: ((x1 - x0) / width) * 100,
      h: (hPx / height) * 100,
      type: hPx >= o.textareaH * u ? 'textarea' : 'text',
      label: '',
      source: 'table-cell'
    };
    if (c.table) f.grid = { table: c.table, row: c.row, col: c.col };
    return f;
  });
}

export async function tableCellsDetector(ctx) {
  const img = ctx.getImageData();
  const lines = ctx.getDottedLines ? ctx.getDottedLines() : detectDottedLines(img);
  const cells = detectTableCells(img, { lines });
  return cellsToFields(cells, ctx.width, ctx.height);
}

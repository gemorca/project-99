export const MERGE_DEFAULTS = {
  alignTol: 8,
  maxGap: 16,
  overlapDrop: 0.8,
  textareaH: 40,
  minLabeledW: 9,
  minLineH: 1.2,
  frameMinGap: 80,
  frameMaxGap: 420
};

const PRIORITY = { 'table-cell': 3, 'merged-lines': 2, 'dotted-line': 1 };
const prio = (f) => PRIORITY[f.source] || 0;

const QUESTION_START = /^(jawaban|alasan|penjelasan|kesimpulan|jelaskan|tuliskan|mengapa|bagaimana|apa|berikan|sebutkan|tentukan|buatlah|identifikasi|ide|tuliskan)/i;

function absorbs(label) {
  return !label || /[?!]$/.test(label) || QUESTION_START.test(label);
}

const baseLabel = (label) => String(label || '').replace(/\s+\d+$/, '').trim();

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
      const aligned = Math.abs(q.b.x0 - last.b.x0) <= tol && q.b.x1 <= c[0].b.x1 + tol;
      const close = q.b.y0 - last.b.y1 <= gap && q.b.y0 >= last.b.y0;
      const sameLabel = !q.f.label || baseLabel(q.f.label) === baseLabel(c[0].f.label);
      if (aligned && close && absorbs(c[0].f.label) && sameLabel) {
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

function pairFrames(fields, W, H, o, u) {
  const tol = o.alignTol * u;
  const cand = fields
    .map((f, i) => ({ f, i, b: toPx(f, W, H) }))
    .filter((q) => q.f.source === 'dotted-line' && !q.f.label)
    .sort((a, b) => a.b.y0 - b.b.y0);
  const drop = new Set();
  const added = [];
  for (let a = 0; a < cand.length; a++) {
    if (drop.has(cand[a].i)) continue;
    for (let c = a + 1; c < cand.length; c++) {
      const A = cand[a].b;
      const B = cand[c].b;
      const gapPx = B.y0 - A.y1;
      if (drop.has(cand[c].i) || gapPx < o.frameMinGap * u || gapPx > o.frameMaxGap * u) continue;
      if (Math.abs(A.x0 - B.x0) > tol || Math.abs(A.x1 - B.x1) > tol) continue;
      const inside = fields.some((f, i) => {
        if (i === cand[a].i || i === cand[c].i) return false;
        const b = toPx(f, W, H);
        const cy = (b.y0 + b.y1) / 2;
        const cx = (b.x0 + b.x1) / 2;
        return cy > A.y1 && cy < B.y0 && cx > A.x0 && cx < A.x1;
      });
      if (inside) continue;
      drop.add(cand[a].i);
      drop.add(cand[c].i);
      added.push({
        ...cand[a].f,
        x: (A.x0 / W) * 100,
        y: (A.y0 / H) * 100,
        w: ((Math.max(A.x1, B.x1) - Math.min(A.x0, B.x0)) / W) * 100,
        h: ((B.y1 - A.y0) / H) * 100,
        type: 'textarea',
        source: 'table-cell'
      });
      break;
    }
  }
  return fields.filter((_, i) => !drop.has(i)).concat(added);
}

function dropSlivers(fields, o) {
  return fields.filter((f) => {
    if (!f.label && f.w < o.minLabeledW) return false;
    if (f.source === 'dotted-line' && f.h < o.minLineH) return false;
    return true;
  });
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
  out = dropSlivers(out, o);
  out = pairFrames(out, W, H, o, u);
  out = mergeStacks(out, W, H, o, u);
  out = dropOverlaps(out, W, H, o);
  out.forEach((f) => {
    if (f.source === 'merged-lines') f.type = 'textarea';
    else if (f.source !== 'table-cell') f.type = (f.h / 100) * H >= o.textareaH * u ? 'textarea' : 'text';
  });
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

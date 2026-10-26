/**
 * Detektor garis titik-titik ("........") untuk LKPD hasil gambar/scan.
 *
 * Murni fungsi atas data piksel (tanpa DOM), jadi bisa diuji di Node maupun browser.
 *
 * Langkah:
 *  1. Gambar -> abu-abu. Piksel "tinta" = lebih gelap dari rata-rata sekitarnya (box blur).
 *     Ini membuat titik abu-abu terdeteksi di latar putih, biru muda, kuning, maupun hijau.
 *  2. Kumpulkan gumpalan (connected components) kecil: ukuran titik, bukan huruf atau garis tabel.
 *  3. Kelompokkan gumpalan yang sebaris (y hampir sama), lalu rantai dari kiri ke kanan.
 *     Rantai dengan cukup banyak titik dan cukup panjang = satu garis titik-titik.
 *  4. Ubah garis menjadi kotak isian (persen halaman): dari atas garis sampai sedikit di bawahnya.
 *
 * Semua parameter jarak dinyatakan dalam satuan u = lebar_gambar / 1190, sehingga hasil
 * tidak bergantung pada skala render.
 */

export const DOTTED_DEFAULTS = {
  blurRadius: 7, // radius box blur untuk estimasi latar (u)
  inkThreshold: 18, // selisih keabuan minimum agar piksel dianggap tinta
  maxBlobW: 14, // lebar maksimum gumpalan titik/garis-pendek (u)
  maxBlobH: 5.5, // tinggi maksimum gumpalan titik (u)
  minBlobArea: 2, // luas minimum gumpalan (piksel)
  rowTolerance: 2.2, // selisih y maksimum untuk dianggap sebaris (u)
  minFragLen: 8, // panjang minimum potongan garis menyatu sebelum digabung (u)
  minFragCycles: 2, // siklus minimum potongan sebelum digabung
  slantTolerance: 3.2, // selisih y maksimum antar potongan pada garis yang sama (u)
  mergeGapFar: 90, // celah lebih lebar boleh digabung bila ada punggung garis samar di dalamnya (u)
  ridgeDiff: 5, // beda keabuan minimum punggung garis samar
  mergeGap: 26, // jarak maksimum untuk menggabung potongan garis sebaris (u)
  maxGap: 10, // jarak maksimum antar gumpalan dalam satu rantai (u)
  minDots: 8, // jumlah titik minimum satu garis
  minSpan: 28, // panjang minimum satu garis (u)
  solidContrast: 45, // kontras minimum garis abu-abu menyatu terhadap latar (0-255)
  maxSaturation: 45, // saturasi warna maksimum garis abu-abu (garis tabel berwarna lebih jenuh)
  minModulation: 28, // beda terang-gelap minimum sepanjang garis menyatu (0-255)
  maxPitch: 9, // rata-rata jarak antar titik maksimum (u): menyingkirkan teks bertitik acak
  boxAbove: 24, // tinggi area menulis di atas garis (u)
  boxBelow: 3, // tambahan di bawah garis (u)
  padX: 4 // tambahan kiri-kanan (u)
};

function toGray(data, n) {
  const g = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return g;
}

// Rata-rata lokal lewat integral image: O(n), tidak bergantung radius.
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

function findBlobs(ink, w, h, maxW, maxH, minArea) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h > 4e6 ? 4e6 : w * h);
  const blobs = [];

  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue;

    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    let area = 0;
    let tooBig = false;

    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx - x) / w;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (maxY - minY + 1 > maxH * 3) tooBig = true;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const ni = ny * w + nx;
          if (ink[ni] && !seen[ni] && sp < stack.length) {
            seen[ni] = 1;
            stack[sp++] = ni;
          }
        }
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (tooBig || area < minArea || bh > maxH) continue;
    // thin = garis panjang-tipis (titik-titik yang menyatu karena resolusi/JPEG)
    blobs.push({ x0: minX, x1: maxX, y0: minY, y1: maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, thin: bw > maxW });
  }
  return blobs;
}


/**
 * Garis panjang-tipis: titik-titik yang menyatu. Dibedakan dari garis tabel padat
 * lewat modulasi keabuan sepanjang garis (naik-turun berkala), bukan datar.
 * @returns {{cycles:number}|null}
 */
function analyzeStreak(gray, bg, rgba, w, blob, o, u) {
  const len = blob.x1 - blob.x0 + 1;
  if (len < o.minFragLen * u) return null;

  const v = new Float32Array(len);
  let satSum = 0;
  let contrastSum = 0;
  for (let x = blob.x0; x <= blob.x1; x++) {
    let m = 255;
    let my = blob.y0;
    for (let y = blob.y0; y <= blob.y1; y++) {
      const g = gray[y * w + x];
      if (g < m) {
        m = g;
        my = y;
      }
    }
    v[x - blob.x0] = m;
    const p = (my * w + x) * 4;
    satSum += Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) - Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
    contrastSum += bg[my * w + x] - m;
  }
  const meanSat = satSum / len;
  const meanContrast = contrastSum / len;

  const sorted = Array.from(v).sort((a, b) => a - b);
  const p10 = sorted[Math.floor(len * 0.1)];
  const p90 = sorted[Math.floor(len * 0.9)];
  const amp = p90 - p10;

  // Jalur B: garis abu-abu netral yang kontras dan terisolasi. Titik-titik yang menyatu
  // oleh JPEG terlihat seperti garis padat; garis tabel/kotak berwarna jenuh sehingga ditolak.
  const solidish = meanContrast >= o.solidContrast && meanSat <= o.maxSaturation;
  if (o.debugLog) o.debugLog.push({ x0: blob.x0, x1: blob.x1, y: blob.cy, len, sat: Math.round(meanSat), contrast: Math.round(meanContrast), amp: Math.round(amp), solidish });
  if (amp < o.minModulation) {
    return solidish ? { cycles: Math.max(2, Math.round(len / (6 * u))) } : null;
  }

  // Hitung siklus dengan histeresis agar derau JPEG tidak dihitung
  const mid = (p90 + p10) / 2;
  const hy = amp / 6;
  let state = v[0] > mid ? 1 : 0;
  let crossings = 0;
  for (let i = 1; i < len; i++) {
    if (state === 0 && v[i] > mid + hy) {
      state = 1;
      crossings++;
    } else if (state === 1 && v[i] < mid - hy) {
      state = 0;
      crossings++;
    }
  }
  const cycles = Math.floor(crossings / 2);
  // Naik-turun jelas tetapi jaraknya terlalu renggang = garis putus-putus (tepi kotak), bukan titik-titik.
  if (cycles < o.minFragCycles || len / Math.max(cycles, 1) > o.maxPitch * u) return null;
  return { cycles };
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray|Uint8Array}} image  RGBA
 * @returns {Array<{x0:number,x1:number,y:number,n:number}>} garis dalam piksel gambar
 */
export function detectDottedLines(image, options = {}) {
  const o = { ...DOTTED_DEFAULTS, ...options };
  const { width: w, height: h, data } = image;
  const u = w / 1190;

  const gray = toGray(data, w * h);
  const bg = boxBlur(gray, w, h, Math.max(2, Math.round(o.blurRadius * u)));

  const ink = new Uint8Array(w * h);
  const thr = o.inkThreshold;
  for (let i = 0; i < ink.length; i++) ink[i] = bg[i] - gray[i] > thr ? 1 : 0;

  const blobs = findBlobs(ink, w, h, o.maxBlobW * u, o.maxBlobH * u, Math.max(1, Math.round(o.minBlobArea * u * u)));
  const lines = [];
  const dots = [];
  blobs.forEach((b) => {
    if (!b.thin) {
      dots.push(b);
      return;
    }
    const st = analyzeStreak(gray, bg, data, w, b, o, u);
    if (st) lines.push({ x0: b.x0, x1: b.x1, y: b.cy, n: st.cycles });
  });
  dots.sort((a, b) => a.cy - b.cy);

  // Kelompokkan sebaris
  const rows = [];
  let cur = [];
  let curMean = 0;
  dots.forEach((b) => {
    if (cur.length && b.cy - curMean > o.rowTolerance * u) {
      rows.push(cur);
      cur = [];
    }
    cur.push(b);
    curMean = cur.reduce((s, q) => s + q.cy, 0) / cur.length;
  });
  if (cur.length) rows.push(cur);

  // Rantai kiri->kanan dalam tiap baris
  const closeLine = (chain) => {
    if (chain.length < o.minDots) return;
    const x0 = chain[0].x0;
    const x1 = chain[chain.length - 1].x1;
    const span = x1 - x0 + 1;
    if (span < o.minSpan * u) return;
    if (span / chain.length > o.maxPitch * u) return;
    const ys = chain.map((q) => q.cy).sort((a, b) => a - b);
    lines.push({ x0, x1, y: ys[ys.length >> 1], n: chain.length });
  };

  rows.forEach((row) => {
    row.sort((a, b) => a.cx - b.cx);
    let chain = [];
    row.forEach((b) => {
      if (chain.length && b.x0 - chain[chain.length - 1].x1 > o.maxGap * u) {
        closeLine(chain);
        chain = [];
      }
      chain.push(b);
    });
    closeLine(chain);
  });

  return mergeCollinear(lines, o, u, gray, w, h);
}


// Apakah ada "punggung" garis tipis (lebih gelap dari baris di atas/bawahnya) di celah x0..x1 pada y?
// Dipakai untuk menyambung potongan garis yang terlalu pudar untuk lolos ambang tinta.
function hasRidge(gray, w, h, x0, x1, y, u, minDiff) {
  const yc = Math.round(y);
  const band = (ya, yb) => {
    let sum = 0;
    let n = 0;
    for (let yy = Math.max(0, ya); yy <= Math.min(h - 1, yb); yy++) {
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
        sum += gray[yy * w + x];
        n++;
      }
    }
    return n ? sum / n : 255;
  };
  const r = Math.max(1, Math.round(u));
  const core = band(yc - r, yc + r);
  const above = band(yc - 6 * r, yc - 4 * r);
  const below = band(yc + 4 * r, yc + 6 * r);
  return (above + below) / 2 - core >= minDiff;
}

// Apakah ada garis tegak (tepi sel tabel / kotak) yang memotong celah x0..x1 di sekitar y?
// Dipakai agar isian pada sel atau kotak bersebelahan tidak ikut tergabung.
function crossesVerticalBorder(gray, w, h, x0, x1, y, u) {
  const half = Math.round(25 * u);
  const ya = Math.max(0, Math.round(y) - half);
  const yb = Math.min(h - 1, Math.round(y) + half);
  const need = 0.7 * (yb - ya + 1);
  const d = Math.max(3, Math.round(4 * u));
  for (let x = Math.max(d, x0); x <= Math.min(w - 1 - d, x1); x++) {
    let hits = 0;
    for (let yy = ya; yy <= yb; yy++) {
      const ref = (gray[yy * w + x - d] + gray[yy * w + x + d]) / 2;
      if (ref - gray[yy * w + x] >= 8) hits++;
    }
    if (hits >= need) return true;
  }
  return false;
}

// Garis yang kedua ujungnya bertemu garis tegak adalah tepi atas/bawah sebuah kotak (mis. kotak
// "Sketsa"), bukan garis isian. Hanya dipakai bila KEDUA ujung memenuhi, agar aman.
function isBoxEdge(gray, w, h, ln, u) {
  const reach = Math.round(30 * u);
  const near = Math.max(1, Math.round(2 * u));
  const ref = Math.max(4, Math.round(5 * u));
  const verticalAt = (x) => {
    for (const dir of [-1, 1]) {
      let hits = 0;
      let total = 0;
      for (let k = Math.round(3 * u); k <= reach; k++) {
        const yy = Math.round(ln.y) + dir * k;
        if (yy < 0 || yy >= h) continue;
        total++;
        let dark = 255;
        for (let dx = -near; dx <= near; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          dark = Math.min(dark, gray[yy * w + xx]);
        }
        const l = gray[yy * w + Math.max(0, x - ref)];
        const r = gray[yy * w + Math.min(w - 1, x + ref)];
        if ((l + r) / 2 - dark >= 8) hits++;
      }
      if (total > 0 && hits / total >= 0.6) return true;
    }
    return false;
  };
  return verticalAt(Math.round(ln.x0)) && verticalAt(Math.round(ln.x1));
}

// Gabungkan potongan garis yang sebaris dan berdekatan (rantai titik + garis menyatu).
// Toleransi y dihitung terhadap potongan terakhir pada garis, sehingga garis yang
// sedikit miring (umum pada gambar AI/scan) tetap tersambung.
function mergeCollinear(lines, o, u, gray, w, h) {
  const frags = [...lines].sort((a, b) => a.x0 - b.x0);
  const open = [];

  frags.forEach((f) => {
    let best = null;
    let bestScore = Infinity;
    open.forEach((L) => {
      const gap = f.x0 - L.x1;
      const dy = Math.abs(f.y - L.lastY);
      const near = gap <= o.mergeGap * u;
      const far = !near && gap <= o.mergeGapFar * u && hasRidge(gray, w, h, L.x1 + 1, f.x0 - 1, (f.y + L.lastY) / 2, u, o.ridgeDiff) && !crossesVerticalBorder(gray, w, h, L.x1 + 1, f.x0 - 1, (f.y + L.lastY) / 2, u);
      if ((near || far) && dy <= o.slantTolerance * u) {
        const score = dy * 4 + Math.max(gap, 0);
        if (score < bestScore) {
          bestScore = score;
          best = L;
        }
      }
    });
    if (best) {
      best.x1 = Math.max(best.x1, f.x1);
      best.n += f.n;
      best.ys.push(f.y);
      best.lastY = f.y;
    } else {
      open.push({ x0: f.x0, x1: f.x1, n: f.n, ys: [f.y], lastY: f.y });
    }
  });

  return open
    .filter((c) => c.x1 - c.x0 + 1 >= o.minSpan * u && c.n >= o.minDots * 0.75)
    .map((c) => {
      const ys = [...c.ys].sort((a, b) => a - b);
      return { x0: c.x0, x1: c.x1, y: ys[ys.length >> 1], n: c.n };
    })
    .filter((ln) => !isBoxEdge(gray, w, h, ln, u))
    .sort((a, b) => a.y - b.y || a.x0 - b.x0);
}

/**
 * Garis -> kotak isian dalam PERSEN halaman (format peta_field_json).
 */
export function linesToFields(lines, width, height, options = {}) {
  const o = { ...DOTTED_DEFAULTS, ...options };
  const u = width / 1190;
  const out = [];

  lines.forEach((ln, i) => {
    let top = ln.y - o.boxAbove * u;
    const bottom = ln.y + o.boxBelow * u;
    const x0 = Math.max(0, ln.x0 - o.padX * u);
    const x1 = Math.min(width, ln.x1 + o.padX * u);

    // Jangan menimpa garis di atasnya yang sekolom (isian bertumpuk, mis. Nama/Kelas/Kelompok).
    for (let j = 0; j < i; j++) {
      const up = lines[j];
      if (up.y >= ln.y) continue;
      const overlap = Math.min(x1, up.x1) - Math.max(x0, up.x0);
      if (overlap > 0.5 * Math.min(x1 - x0, up.x1 - up.x0)) top = Math.max(top, up.y + 4 * u);
    }
    if (bottom - top < 8 * u) top = bottom - 8 * u;
    top = Math.max(0, top);

    out.push({
      x: (x0 / width) * 100,
      y: (top / height) * 100,
      w: ((x1 - x0) / width) * 100,
      h: ((bottom - top) / height) * 100,
      type: 'text',
      label: '',
      source: 'dotted-line'
    });
  });
  return out;
}

export async function dottedLinesDetector(ctx) {
  const img = ctx.getImageData();
  const lines = detectDottedLines(img);
  return linesToFields(lines, ctx.width, ctx.height);
}

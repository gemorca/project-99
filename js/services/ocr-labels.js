const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let loading = null;

function loadTesseract() {
  if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve(window.Tesseract);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.async = true;
    s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract.js tidak tersedia.')));
    s.onerror = () => {
      loading = null;
      reject(new Error('Gagal memuat Tesseract.js (periksa koneksi).'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export async function createLabelWorker(lang = 'ind') {
  const T = await loadTesseract();
  const worker = await T.createWorker(lang);
  await worker.setParameters({ tessedit_pageseg_mode: '11' });
  return worker;
}

function flattenWords(data) {
  if (Array.isArray(data.words) && data.words.length) return data.words;
  const out = [];
  (data.blocks || []).forEach((b) =>
    (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((w) => out.push(w))))
  );
  return out;
}

export async function recognizeWords(worker, canvas) {
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  return flattenWords(data)
    .filter((w) => w && w.text && w.bbox)
    .map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence }));
}

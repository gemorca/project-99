const MEDIA = { web_text: 'Rangkuman Teks', pdf_document: 'Dokumen PDF' };
const LKPD = { pdf_interaktif: 'PDF Interaktif', manual: 'Pertanyaan Manual' };
const GAME = {
  matching: 'Pasangkan',
  drag_drop: 'Seret & Kelompokkan',
  quiz_speed: 'Kuis Kilat',
  sequencer: 'Susun Urutan',
  hotspot: 'Label Gambar',
  simulator: 'Simulasi Keputusan',
  word_search: 'Cari Kata'
};

function pretty(v) {
  const s = String(v || '').trim().replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '-';
}

export const labelMedia = (v) => MEDIA[String(v || '').trim()] || pretty(v);
export const labelLkpdTipe = (v) => LKPD[String(v || '').trim()] || pretty(v || 'manual');
export const labelGame = (v) => GAME[String(v || '').trim()] || pretty(v);

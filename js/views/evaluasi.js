import { requireStudentAuth } from '../components/modal.js';
import { apiPost } from '../services/api.js';
import { state } from '../state.js';
import { switchView } from '../components/drawer.js';

let evalTimerInterval = null;
let activeEvalCtx = null;
let isSubmittingEval = false;

const keyStart = (idEvaluasi, username) => `EVAL_START_${idEvaluasi}_${username}`;
const keyAnswers = (idEvaluasi, username) => `EVAL_ANS_${idEvaluasi}_${username}`;
const keyDone = (idEvaluasi, username) => `EVAL_DONE_${idEvaluasi}_${username}`;

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Gagal menyimpan ke localStorage:', e);
  }
}

function currentUsername() {
  return state.currentUser ? state.currentUser.username : 'guest';
}

export function isEvaluasiBerlangsung() {
  return evalTimerInterval !== null || isSubmittingEval;
}

export function clearEvaluasiTimer() {
  if (evalTimerInterval) {
    clearInterval(evalTimerInterval);
    evalTimerInterval = null;
  }
}

function updateEvalProgress() {
  if (!activeEvalCtx) return;
  const total = activeEvalCtx.soalIds.length;
  const done = activeEvalCtx.soalIds.filter((id) => state.evaluasiAnswers[id]).length;
  const label = document.getElementById('eval-progress');
  const bar = document.getElementById('eval-progress-bar');
  if (label) label.textContent = `${done} / ${total} soal terjawab`;
  if (bar) bar.style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
}

export function renderEvaluasiView(ptmId) {
  clearEvaluasiTimer();

  const evalObj = (state.cachedData.evaluasi || []).find((e) => e.id_pertemuan === ptmId && e.status === 'Publish');
  if (!evalObj) return `<div class="p-8 text-center text-slate-400 font-bold">Evaluasi belum tersedia pada pertemuan ini.</div>`;

  const soalList = (state.cachedData.soal_evaluasi || []).filter((s) => s.id_evaluasi === evalObj.id_evaluasi);
  if (soalList.length === 0) return `<div class="p-8 text-center text-slate-400 font-bold">Belum ada soal pada modul evaluasi ini.</div>`;

  const username = currentUsername();

  const existingSub = (state.cachedData.submissions || []).find((s) =>
    String(s.username_siswa || '').trim().toLowerCase() === String(username).trim().toLowerCase() &&
    String(s.id_pertemuan || '').trim() === String(ptmId).trim() &&
    String(s.id_game || '').trim() === String(evalObj.id_evaluasi).trim() &&
    String(s.tipe_sub || '').trim().toLowerCase() === 'evaluasi'
  );

  const doneKey = keyDone(evalObj.id_evaluasi, username);
  const localDone = readJson(doneKey);
  if (existingSub && localDone) localStorage.removeItem(doneKey);

  if (existingSub || localDone) {
    const skor = existingSub
      ? (existingSub.nilai_esai !== '' && existingSub.nilai_esai !== null && existingSub.nilai_esai !== undefined
        ? existingSub.nilai_esai
        : existingSub.skor_otomatis || 0)
      : localDone.score;
    const waktu = existingSub ? existingSub.timestamp : localDone.timestamp;
    const menunggu = !existingSub;

    return `
      <div class="max-w-xl mx-auto space-y-5 text-xs text-center p-6 sm:p-8 bg-white rounded-3xl border shadow-lg my-6">
        <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center text-3xl font-black mx-auto shadow-inner">✅</div>
        <div>
          <span class="px-3 py-1 bg-emerald-100 text-emerald-800 font-extrabold rounded-full text-[10px] uppercase">Evaluasi Selesai</span>
          <h3 class="text-lg sm:text-xl font-black font-heading text-brand-navy mt-2">${evalObj.judul_evaluasi}</h3>
          <p class="text-slate-500 mt-1">Kamu telah menyelesaikan pengerjaan kuis ini.</p>
        </div>

        <div class="p-5 bg-gradient-to-br from-slate-900 to-brand-navy text-white rounded-2xl border shadow-md space-y-1">
          <span class="text-slate-300 font-bold text-[11px] uppercase tracking-wider block">Skor Akhir Kamu</span>
          <span class="text-4xl font-black text-brand-yellow font-heading block">${skor} / 100</span>
          <span class="text-[10px] text-slate-400 block pt-1">Dikerjakan pada: ${waktu ? new Date(waktu).toLocaleString('id-ID') : '-'}</span>
        </div>

        ${menunggu
        ? `<div class="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-left text-[11px] font-medium">
          ⏳ <b>Menunggu terkirim:</b> jawaban tersimpan di perangkat ini dan dikirim otomatis ke server begitu koneksi tersedia. Jangan hapus data browser sebelum badge "menunggu kirim" hilang.
        </div>`
        : `<div class="p-3 bg-blue-50 border border-blue-200 text-brand-navy rounded-xl text-left text-[11px] font-medium">
          💡 <b>Informasi:</b> Jawaban evaluasi telah tersimpan secara permanen di database server guru dan tidak dapat diisi ulang.
        </div>`}
      </div>
    `;
  }

  const startKey = keyStart(evalObj.id_evaluasi, username);
  const storedStartTime = localStorage.getItem(startKey);

  if (!storedStartTime) {
    return `
      <div class="max-w-xl mx-auto space-y-5 text-xs text-center p-6 sm:p-8 bg-white rounded-3xl border shadow-lg my-4 sm:my-6">
        <div class="w-16 h-16 bg-blue-100 text-brand-blue rounded-3xl flex items-center justify-center text-3xl font-black mx-auto shadow-inner">⏱️</div>
        <div>
          <span class="px-3 py-1 bg-blue-50 text-brand-blue border border-blue-200 font-bold rounded-full text-[10px]">Konfirmasi Pengerjaan</span>
          <h3 class="text-lg sm:text-xl font-black font-heading text-brand-navy mt-2">${evalObj.judul_evaluasi}</h3>
          <p class="text-slate-500 mt-1">Siapkan diri kamu dengan baik sebelum memulai pengerjaan kuis evaluasi ini.</p>
        </div>

        <div class="grid grid-cols-2 gap-3 text-left bg-slate-50 p-4 rounded-2xl border">
          <div>
            <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Durasi Waktu</span>
            <span class="font-black text-brand-blue text-sm">⏳ ${evalObj.durasi_menit || 30} Menit</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Jumlah Soal</span>
            <span class="font-black text-brand-navy text-sm">📝 ${soalList.length} Soal PG</span>
          </div>
        </div>

        <div class="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-left text-[11px] font-medium space-y-1">
          <p class="font-bold flex items-center gap-1">⚠️ Aturan & Petunjuk Kuis:</p>
          <p>• Timer waktu mundur akan berjalan otomatis setelah kamu menekan tombol di bawah.</p>
          <p>• Timer <b>tetap berjalan</b> walau kamu menutup halaman atau pindah menu. Jawabanmu tersimpan otomatis di perangkat ini.</p>
          <p>• Jika waktu habis (00:00), seluruh jawaban terisi akan <b>terkirim otomatis</b> ke guru.</p>
          <p>• Pengisian hanya diperbolehkan <b>1 (satu) kali</b> untuk setiap siswa.</p>
        </div>

        <button onclick="startEvaluasiQuiz('${ptmId}', '${evalObj.id_evaluasi}')" class="w-full py-4 bg-brand-emerald hover:bg-emerald-600 text-white font-black text-sm rounded-2xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2">
          <span>🚀 Mulai Mengerjakan Kuis Sekarang</span>
        </button>
      </div>
    `;
  }

  const stored = readJson(keyAnswers(evalObj.id_evaluasi, username));
  state.evaluasiAnswers = stored && stored.jawaban && typeof stored.jawaban === 'object' ? stored.jawaban : {};
  activeEvalCtx = {
    idEvaluasi: evalObj.id_evaluasi,
    username,
    soalIds: soalList.map((s) => s.id_soal)
  };
  const answeredNow = soalList.filter((s) => state.evaluasiAnswers[s.id_soal]).length;

  setTimeout(() => {
    initEvaluasiTimer(Number(evalObj.durasi_menit || 30), evalObj.id_evaluasi, ptmId);
  }, 100);

  return `
    <div class="max-w-4xl mx-auto space-y-4 text-xs">
      <div id="eval-timer-bar" class="sticky top-16 z-30 bg-brand-navy text-white p-4 rounded-2xl shadow-md flex items-center justify-between gap-3 transition-colors duration-300 border border-slate-700">
        <div class="min-w-0 flex-1">
          <span class="text-[9px] font-bold text-slate-300 uppercase tracking-wider block">KUIS EVALUASI AKTIF</span>
          <h3 class="text-xs sm:text-sm font-black font-heading truncate">${evalObj.judul_evaluasi}</h3>
          <span id="eval-progress" class="text-[11px] font-bold text-slate-200 block mt-0.5">${answeredNow} / ${soalList.length} soal terjawab</span>
          <div class="h-1 bg-white/20 rounded-full mt-1.5 overflow-hidden">
            <div id="eval-progress-bar" class="h-full bg-brand-yellow transition-all duration-300" style="width:${Math.round((answeredNow / soalList.length) * 100)}%"></div>
          </div>
        </div>
        <div class="flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-xl border border-white/20 shadow-inner shrink-0">
          <span class="text-sm">⏱️</span>
          <span id="eval-countdown-display" class="font-mono text-base font-black tracking-wider text-brand-yellow">00:00</span>
        </div>
      </div>

      <div class="space-y-4">
        ${soalList
      .map(
        (s, idx) => `
              <div id="eval-q-${s.id_soal}" class="bg-white p-5 rounded-3xl border space-y-3 shadow-xs">
                <div class="flex items-center justify-between border-b pb-2">
                  <span class="font-black text-brand-navy text-xs">Soal #${idx + 1}</span>
                  <span class="text-[10px] text-slate-400 font-bold">Pilihan Ganda</span>
                </div>
                <p class="font-bold text-slate-800 text-xs sm:text-sm leading-relaxed">${s.pertanyaan}</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  ${['A', 'B', 'C', 'D']
            .filter((o) => String(s['opsi_' + o.toLowerCase()] ?? '').trim() !== '')
            .map(
              (o) => {
                const isSelected = state.evaluasiAnswers[s.id_soal] === o;
                return `
                        <button id="eval-opt-${s.id_soal}-${o}" aria-pressed="${isSelected}" onclick="selectEvalOption('${s.id_soal}', '${o}')" class="w-full p-3 text-left rounded-2xl border transition flex items-center gap-2.5 ${isSelected
                    ? 'border-2 border-brand-blue bg-blue-50 font-bold text-brand-blue'
                    : 'border-slate-200 bg-white hover:bg-slate-50 font-medium text-slate-700'
                  }">
                          <span class="w-6 h-6 rounded-xl font-black text-[10px] flex items-center justify-center border shrink-0 ${isSelected ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }">${o}</span>
                          <span class="leading-snug">${s['opsi_' + o.toLowerCase()]}</span>
                        </button>
                      `;
              }
            )
            .join('')}
                </div>
              </div>
            `
      )
      .join('')}
      </div>

      <button id="btn-submit-eval-siswa" onclick="konfirmasiKirimEvaluasi('${ptmId}', '${evalObj.id_evaluasi}')" class="w-full py-4 bg-brand-emerald text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg hover:bg-emerald-600 transition">
        🚀 Kirim Jawaban Evaluasi & Hitung Skor
      </button>
    </div>
  `;
}

export function startEvaluasiQuiz(ptmId, idEvaluasi) {
  if (!requireStudentAuth()) return;

  const username = currentUsername();
  const nowSeconds = Math.floor(Date.now() / 1000);

  localStorage.removeItem(keyAnswers(idEvaluasi, username));
  localStorage.setItem(keyStart(idEvaluasi, username), nowSeconds.toString());
  switchView('evaluasi-ptm', ptmId);
}

export function initEvaluasiTimer(durasiMenit, idEvaluasi, ptmId) {
  clearEvaluasiTimer();

  const username = currentUsername();
  const stored = localStorage.getItem(keyStart(idEvaluasi, username));

  if (!stored) return;

  const startTime = parseInt(stored, 10);
  const totalAllowedSeconds = durasiMenit * 60;

  function updateTimerDisplay() {
    if (isSubmittingEval) return;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const elapsed = nowSeconds - startTime;
    const remaining = totalAllowedSeconds - elapsed;

    const timerDisplay = document.getElementById('eval-countdown-display');
    const timerBar = document.getElementById('eval-timer-bar');

    if (remaining <= 0) {
      if (timerDisplay) timerDisplay.textContent = '00:00';
      clearEvaluasiTimer();

      Swal.fire({
        icon: 'warning',
        title: 'Waktu Habis! ⏰',
        text: 'Waktu pengerjaan kuis evaluasi telah habis. Seluruh jawaban kamu akan dikirimkan otomatis!',
        allowOutsideClick: false,
        confirmButtonText: 'Proses Jawaban',
        confirmButtonColor: '#10B981'
      }).then(() => {
        submitEvaluasiSiswa(ptmId, idEvaluasi, true);
      });
      return;
    }

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (timerDisplay) timerDisplay.textContent = formatted;

    if (timerBar) {
      if (remaining < 60) {
        timerBar.className = 'sticky top-16 z-30 bg-red-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between gap-3 border border-red-500 animate-pulse';
      } else if (remaining < 180) {
        timerBar.className = 'sticky top-16 z-30 bg-amber-500 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between gap-3 border border-amber-400';
      }
    }
  }

  updateTimerDisplay();

  const sisa = totalAllowedSeconds - (Math.floor(Date.now() / 1000) - startTime);
  if (sisa > 0 && !isSubmittingEval) {
    evalTimerInterval = setInterval(updateTimerDisplay, 1000);
  }
}

export function selectEvalOption(soalId, option) {
  state.evaluasiAnswers[soalId] = option;

  if (activeEvalCtx) {
    writeJson(keyAnswers(activeEvalCtx.idEvaluasi, activeEvalCtx.username), {
      jawaban: state.evaluasiAnswers,
      timestamp: new Date().toISOString()
    });
  }

  ['A', 'B', 'C', 'D'].forEach((o) => {
    const btn = document.getElementById(`eval-opt-${soalId}-${o}`);
    if (!btn) return;
    const badge = btn.querySelector('span');
    const selected = state.evaluasiAnswers[soalId] === o;
    btn.setAttribute('aria-pressed', String(selected));
    if (selected) {
      btn.className = 'w-full p-3 text-left rounded-2xl border-2 border-brand-blue bg-blue-50 font-bold text-brand-blue transition flex items-center gap-2.5';
      if (badge) badge.className = 'w-6 h-6 rounded-xl font-black text-[10px] flex items-center justify-center border shrink-0 bg-brand-blue text-white border-brand-blue';
    } else {
      btn.className = 'w-full p-3 text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 font-medium text-slate-700 transition flex items-center gap-2.5';
      if (badge) badge.className = 'w-6 h-6 rounded-xl font-black text-[10px] flex items-center justify-center border shrink-0 bg-slate-100 text-slate-600 border-slate-200';
    }
  });

  updateEvalProgress();
}

export function konfirmasiKirimEvaluasi(ptmId, idEvaluasi) {
  if (!requireStudentAuth()) return;

  const soalList = (state.cachedData.soal_evaluasi || []).filter((s) => String(s.id_evaluasi) === String(idEvaluasi));
  const kosong = soalList.filter((s) => !state.evaluasiAnswers[s.id_soal]);

  Swal.fire({
    icon: kosong.length ? 'warning' : 'question',
    title: kosong.length ? `${kosong.length} soal belum dijawab` : 'Kirim jawaban sekarang?',
    text: kosong.length
      ? 'Soal yang kosong dihitung salah. Jawaban tidak bisa diubah setelah dikirim.'
      : 'Jawaban tidak bisa diubah setelah dikirim.',
    showCancelButton: true,
    confirmButtonText: 'Ya, Kirim',
    cancelButtonText: kosong.length ? 'Lengkapi Dulu' : 'Periksa Lagi',
    confirmButtonColor: '#10B981',
    cancelButtonColor: '#64748B'
  }).then((res) => {
    if (res.isConfirmed) {
      submitEvaluasiSiswa(ptmId, idEvaluasi);
    } else if (kosong.length) {
      const el = document.getElementById(`eval-q-${kosong[0].id_soal}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

export async function submitEvaluasiSiswa(ptmId, idEvaluasi, isAutoSubmit = false) {
  if (isSubmittingEval) return;
  if (!requireStudentAuth()) return;

  isSubmittingEval = true;
  const username = currentUsername();

  Swal.fire({
    title: isAutoSubmit ? '⏱️ Waktu Habis!' : '🚀 Menyimpan Jawaban...',
    text: 'Menyimpan jawaban kamu, mohon tunggu...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  const soalList = (state.cachedData.soal_evaluasi || []).filter((s) => String(s.id_evaluasi) === String(idEvaluasi));
  let benar = 0;
  soalList.forEach((s) => {
    if (state.evaluasiAnswers[s.id_soal] === s.kunci_jawaban) benar++;
  });
  const score = Math.round((benar / Math.max(soalList.length, 1)) * 100);

  let res;
  try {
    res = await apiPost({
      action: 'submit_evaluasi',
      id_pertemuan: ptmId,
      id_evaluasi: idEvaluasi,
      username_siswa: username,
      nama_siswa: state.currentUser ? state.currentUser.name : 'Guest',
      kelas: state.currentUser ? state.currentUser.kelas : '-',
      jawaban_json: state.evaluasiAnswers,
      skor_pg: score
    });
  } finally {
    isSubmittingEval = false;
  }

  if (res && res.success) {
    clearEvaluasiTimer();
    localStorage.removeItem(keyStart(idEvaluasi, username));
    localStorage.removeItem(keyAnswers(idEvaluasi, username));
    writeJson(keyDone(idEvaluasi, username), { score, timestamp: new Date().toISOString() });
    state.evaluasiAnswers = {};
    activeEvalCtx = null;

    switchView('evaluasi-ptm', ptmId);

    Swal.fire({
      icon: 'success',
      title: isAutoSubmit ? 'Waktu Habis - Kuis Tersimpan!' : 'Evaluasi Selesai!',
      html: `Skor Kamu: <b class="text-3xl text-brand-blue block mt-2 font-heading">${score} / 100</b>${res.queued ? '<span class="block text-xs text-slate-500 mt-2">Jawaban tersimpan di perangkat dan dikirim otomatis ke server.</span>' : ''}`,
      confirmButtonColor: '#0D6EFD'
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Jawaban Belum Tersimpan',
      text: (res && res.message) || 'Terjadi kesalahan saat menyimpan jawaban. Jawabanmu masih aman di layar ini.',
      showCancelButton: true,
      confirmButtonText: 'Coba Kirim Lagi',
      cancelButtonText: 'Nanti',
      allowOutsideClick: false,
      confirmButtonColor: '#10B981'
    }).then((r) => {
      if (r.isConfirmed) submitEvaluasiSiswa(ptmId, idEvaluasi, isAutoSubmit);
    });
  }
}

window.startEvaluasiQuiz = startEvaluasiQuiz;
window.selectEvalOption = selectEvalOption;
window.konfirmasiKirimEvaluasi = konfirmasiKirimEvaluasi;
window.submitEvaluasiSiswa = submitEvaluasiSiswa;

import { requireStudentAuth, setButtonLoading, showToast } from '../components/modal.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { state } from '../state.js';
import { switchView } from '../components/drawer.js';

let evalTimerInterval = null;

export function clearEvaluasiTimer() {
  if (evalTimerInterval) {
    clearInterval(evalTimerInterval);
    evalTimerInterval = null;
  }
}

export function renderEvaluasiView(ptmId) {
  clearEvaluasiTimer();

  const evalObj = (state.cachedData.evaluasi || []).find((e) => e.id_pertemuan === ptmId && e.status === 'Publish');
  if (!evalObj) return `<div class="p-8 text-center text-slate-400 font-bold">Evaluasi belum tersedia pada pertemuan ini.</div>`;

  const soalList = (state.cachedData.soal_evaluasi || []).filter((s) => s.id_evaluasi === evalObj.id_evaluasi);
  if (soalList.length === 0) return `<div class="p-8 text-center text-slate-400 font-bold">Belum ada soal pada modul evaluasi ini.</div>`;

  const username = state.currentUser ? state.currentUser.username : 'guest';

  const existingSub = (state.cachedData.submissions || []).find((s) =>
    String(s.username_siswa || '').trim().toLowerCase() === String(username).trim().toLowerCase() &&
    String(s.id_pertemuan || '').trim() === String(ptmId).trim() &&
    String(s.id_game || '').trim() === String(evalObj.id_evaluasi).trim() &&
    String(s.tipe_sub || '').trim().toLowerCase() === 'evaluasi'
  );

  if (existingSub) {
    const skor = existingSub.nilai_esai !== '' && existingSub.nilai_esai !== null && existingSub.nilai_esai !== undefined
      ? existingSub.nilai_esai
      : existingSub.skor_otomatis || 0;

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
          <span class="text-[10px] text-slate-400 block pt-1">Disimpan pada: ${existingSub.timestamp ? new Date(existingSub.timestamp).toLocaleString('id-ID') : '-'}</span>
        </div>

        <div class="p-3 bg-blue-50 border border-blue-200 text-brand-navy rounded-xl text-left text-[11px] font-medium">
          💡 <b>Informasi:</b> Jawaban evaluasi telah tersimpan secara permanen di database server guru dan tidak dapat diisi ulang.
        </div>
      </div>
    `;
  }

  const startKey = `EVAL_START_${evalObj.id_evaluasi}_${username}`;
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
          <p>• Jika waktu habis (00:00), seluruh jawaban terisi akan <b>terkirim otomatis</b> ke guru.</p>
          <p>• Pengisian hanya diperbolehkan <b>1 (satu) kali</b> untuk setiap siswa.</p>
        </div>

        <button onclick="startEvaluasiQuiz('${ptmId}', '${evalObj.id_evaluasi}')" class="w-full py-4 bg-brand-emerald hover:bg-emerald-600 text-white font-black text-sm rounded-2xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2">
          <span>🚀 Mulai Mengerjakan Kuis Sekarang</span>
        </button>
      </div>
    `;
  }

  setTimeout(() => {
    initEvaluasiTimer(Number(evalObj.durasi_menit || 30), evalObj.id_evaluasi, ptmId);
  }, 100);

  return `
    <div class="max-w-4xl mx-auto space-y-4 text-xs">
      <!-- Floating Sticky Timer Bar Header -->
      <div id="eval-timer-bar" class="sticky top-16 z-30 bg-brand-navy text-white p-4 rounded-2xl shadow-md flex items-center justify-between transition-colors duration-300 border border-slate-700">
        <div>
          <span class="text-[9px] font-bold text-slate-300 uppercase tracking-wider block">KUIS EVALUASI AKTIF</span>
          <h3 class="text-xs sm:text-sm font-black font-heading truncate max-w-[200px] sm:max-w-md">${evalObj.judul_evaluasi}</h3>
        </div>
        <div class="flex items-center gap-2 bg-slate-900/80 px-4 py-2 rounded-xl border border-white/20 shadow-inner">
          <span class="text-sm">⏱️</span>
          <span id="eval-countdown-display" class="font-mono text-base font-black tracking-wider text-brand-yellow">00:00</span>
        </div>
      </div>

      <!-- Daftar Soal Pilihan Ganda -->
      <div class="space-y-4">
        ${soalList
          .map(
            (s, idx) => `
              <div class="bg-white p-5 rounded-3xl border space-y-3 shadow-xs">
                <div class="flex items-center justify-between border-b pb-2">
                  <span class="font-black text-brand-navy text-xs">Soal #${idx + 1}</span>
                  <span class="text-[10px] text-slate-400 font-bold">Pilihan Ganda</span>
                </div>
                <p class="font-bold text-slate-800 text-xs sm:text-sm leading-relaxed">${s.pertanyaan}</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  ${['A', 'B', 'C', 'D']
                    .map(
                      (o) => {
                        const isSelected = state.evaluasiAnswers[s.id_soal] === o;
                        return `
                        <button id="eval-opt-${s.id_soal}-${o}" onclick="selectEvalOption('${s.id_soal}', '${o}')" class="w-full p-3 text-left rounded-2xl border transition flex items-center gap-2.5 ${
                          isSelected
                            ? 'border-2 border-brand-blue bg-blue-50 font-bold text-brand-blue'
                            : 'border-slate-200 bg-white hover:bg-slate-50 font-medium text-slate-700'
                        }">
                          <span class="w-6 h-6 rounded-xl font-black text-[10px] flex items-center justify-center border shrink-0 ${
                            isSelected ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 text-slate-600 border-slate-200'
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

      <button id="btn-submit-eval-siswa" onclick="requireStudentAuth(() => submitEvaluasiSiswa('${ptmId}', '${evalObj.id_evaluasi}'))" class="w-full py-4 bg-brand-emerald text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg hover:bg-emerald-600 transition">
        🚀 Kirim Jawaban Evaluasi & Hitung Skor
      </button>
    </div>
  `;
}

export function startEvaluasiQuiz(ptmId, idEvaluasi) {
  if (!requireStudentAuth()) return;

  const username = state.currentUser ? state.currentUser.username : 'guest';
  const startKey = `EVAL_START_${idEvaluasi}_${username}`;
  const nowSeconds = Math.floor(Date.now() / 1000);

  localStorage.setItem(startKey, nowSeconds.toString());
  switchView('evaluasi-ptm', ptmId);
}

export function initEvaluasiTimer(durasiMenit, idEvaluasi, ptmId) {
  clearEvaluasiTimer();

  const username = state.currentUser ? state.currentUser.username : 'guest';
  const startKey = `EVAL_START_${idEvaluasi}_${username}`;
  const stored = localStorage.getItem(startKey);

  if (!stored) return;

  const startTime = parseInt(stored, 10);
  const totalAllowedSeconds = durasiMenit * 60;

  function updateTimerDisplay() {
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
        timerBar.className = 'sticky top-16 z-30 bg-red-600 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between border border-red-500 animate-pulse';
      } else if (remaining < 180) {
        timerBar.className = 'sticky top-16 z-30 bg-amber-500 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between border border-amber-400';
      }
    }
  }

  updateTimerDisplay();
  evalTimerInterval = setInterval(updateTimerDisplay, 1000);
}

export function selectEvalOption(soalId, option) {
  state.evaluasiAnswers[soalId] = option;
  ['A', 'B', 'C', 'D'].forEach((o) => {
    const btn = document.getElementById(`eval-opt-${soalId}-${o}`);
    if (!btn) return;
    const badge = btn.querySelector('span');
    if (state.evaluasiAnswers[soalId] === o) {
      btn.className = 'w-full p-3 text-left rounded-2xl border-2 border-brand-blue bg-blue-50 font-bold text-brand-blue transition flex items-center gap-2.5';
      if (badge) badge.className = 'w-6 h-6 rounded-xl font-black text-[10px] flex items-center justify-center border shrink-0 bg-brand-blue text-white border-brand-blue';
    } else {
      btn.className = 'w-full p-3 text-left rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 font-medium text-slate-700 transition flex items-center gap-2.5';
      if (badge) badge.className = 'w-6 h-6 rounded-xl font-black text-[10px] flex items-center justify-center border shrink-0 bg-slate-100 text-slate-600 border-slate-200';
    }
  });
}

export async function submitEvaluasiSiswa(ptmId, idEvaluasi, isAutoSubmit = false) {
  if (!requireStudentAuth()) return;

  const username = state.currentUser ? state.currentUser.username : 'guest';

  Swal.fire({
    title: isAutoSubmit ? '⏱️ Waktu Habis!' : '🚀 Mengirim Evaluasi...',
    text: 'Sedang menyimpan jawaban ke database server, mohon tunggu...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  clearEvaluasiTimer();

  const soalList = (state.cachedData.soal_evaluasi || []).filter((s) => String(s.id_evaluasi) === String(idEvaluasi));
  let benar = 0;
  soalList.forEach((s) => {
    if (state.evaluasiAnswers[s.id_soal] === s.kunci_jawaban) benar++;
  });

  const score = Math.round((benar / Math.max(soalList.length, 1)) * 100);
  const startKey = `EVAL_START_${idEvaluasi}_${username}`;

  const res = await apiPost({
    action: 'submit_evaluasi',
    id_pertemuan: ptmId,
    id_evaluasi: idEvaluasi,
    username_siswa: username,
    nama_siswa: state.currentUser ? state.currentUser.name : 'Guest',
    kelas: state.currentUser ? state.currentUser.kelas : '-',
    jawaban_json: state.evaluasiAnswers,
    skor_pg: score
  });

  if (res.success) {
    localStorage.removeItem(startKey);
    state.evaluasiAnswers = {};
    await fetchAllInitialData(true);
    switchView('evaluasi-ptm', ptmId);

    Swal.fire({
      icon: 'success',
      title: isAutoSubmit ? 'Waktu Habis - Kuis Terkirim!' : 'Evaluasi Selesai!',
      html: `Skor Kamu: <b class="text-3xl text-brand-blue block mt-2 font-heading">${score} / 100</b>`,
      confirmButtonColor: '#0D6EFD'
    });
  } else {
    Swal.fire({ 
      icon: 'error', 
      title: 'Gagal Mengirim Evaluasi', 
      text: res.message || 'Terjadi kesalahan saat menyimpan jawaban.' 
    });
  }
}

window.startEvaluasiQuiz = startEvaluasiQuiz;
window.selectEvalOption = selectEvalOption;
window.submitEvaluasiSiswa = submitEvaluasiSiswa;
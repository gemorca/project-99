import { requireStudentAuth, setButtonLoading } from '../components/modal.js';
import { resetMatchingLines } from '../games/matching.js';
import { setQuizChoice } from '../games/quiz-speed.js';
import { moveSequencerItem } from '../games/sequencer.js';
import { setSimChoice } from '../games/simulator.js';
import { checkWordSearchMatch } from '../games/word-search.js';
import { renderHotspotGameBody, scoreHotspotAnswers } from '../games/hotspot.js';
import { apiPost, fetchAllInitialData } from '../services/api.js';
import { markSelesai } from '../services/progress.js';
import { state } from '../state.js';
import { escapeHtml as e, jsArg, safeUrl } from '../services/html.js';
import { labelGame } from '../services/labels.js';

export function renderGameView(ptmId) {
  const ptmGames = (state.cachedData.games || []).filter((g) => g.id_pertemuan === ptmId && g.status === 'Publish');
  if (ptmGames.length === 0)
    return `<div class="p-8 text-center text-slate-400">Belum ada game interaktif pada pertemuan ini.</div>`;

  return `
    <div class="max-w-4xl mx-auto space-y-6 text-xs">
      <div class="bg-gradient-to-r from-purple-900 to-brand-navy text-white p-5 rounded-3xl shadow-md flex items-center justify-between">
        <div>
          <span class="px-3 py-0.5 bg-purple-500/40 text-purple-200 border border-purple-400/30 rounded-full text-[10px] uppercase font-mono font-bold">
            MODUL PERTEMUAN GAME
          </span>
          <h3 class="text-base font-black font-heading mt-1">🎮 Game Interaktif Pembelajaran (${ptmGames.length} Permainan)</h3>
        </div>
      </div>

      ${ptmGames.map((g, gameIdx) => renderSingleGameCard(g, gameIdx, ptmId)).join('')}
    </div>
  `;
}

export function renderSingleGameCard(g, gameIdx, ptmId) {
  const gameId = g.id_game;
  const gid = e(gameId);
  let config = { items: [] };
  try {
    config = typeof g.konfigurasi_json === 'string' ? JSON.parse(g.konfigurasi_json) : g.konfigurasi_json;
  } catch (e) { }

  const items = config.items || [];
  const tipe = g.tipe_game || 'matching';

  if (!state.gameAnswers[gameId]) state.gameAnswers[gameId] = {};
  if (!state.gameStates[gameId]) state.gameStates[gameId] = {};

  return `
    <div id="game-card-${gid}" class="bg-white p-5 rounded-3xl border border-purple-100 shadow-sm space-y-4">
      <div class="flex items-center justify-between border-b pb-2">
        <div>
          <span class="px-2.5 py-0.5 bg-purple-100 text-purple-800 font-extrabold text-[10px] rounded-full uppercase">
            Game ${gameIdx + 1}: ${e(labelGame(tipe))}
          </span>
          <h4 class="font-black text-brand-navy text-sm font-heading mt-1">${e(g.judul_game)}</h4>
        </div>
      </div>
      <p class="text-slate-600 font-medium">${e(g.instruksi)}</p>

      ${renderGameTypeBody(gameId, tipe, items, ptmId)}
    </div>
  `;
}

export function renderGameTypeBody(gameId, tipe, items, ptmId) {
  const gid = e(gameId);
  const gj = jsArg(gameId);
  const pj = jsArg(ptmId);
  if (tipe === 'matching') {
    let rightAnswers = state.gameStates[gameId]?.shuffledRight;
    if (!rightAnswers) {
      rightAnswers = items.map((item) => ({ text: item.kunci })).sort(() => Math.random() - 0.5);
      if (!state.gameStates[gameId]) state.gameStates[gameId] = {};
      state.gameStates[gameId].shuffledRight = rightAnswers;
    }

    return `
      <div id="matching-container-${gid}" class="relative select-none my-4 p-2 touch-none">
        <svg id="matching-svg-${gid}" class="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"></svg>

        <div class="grid grid-cols-2 gap-6 sm:gap-16">
          <div class="space-y-4">
            <span class="font-black text-brand-navy block text-[11px] uppercase tracking-wider mb-2">Soal / Pertanyaan</span>
            ${items
        .map(
          (item, leftIdx) => `
              <div class="relative bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between min-h-[60px] shadow-xs">
                <span class="font-bold text-slate-800 text-xs pr-2">${leftIdx + 1}. ${e(item.soal)}</span>
                <div class="matching-dot left-dot absolute -right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-7 sm:h-7 rounded-full bg-brand-blue text-white border-2 border-white shadow-md flex items-center justify-center cursor-pointer touch-none hover:scale-110 transition z-20"
                     data-game-id="${gid}" data-left-idx="${leftIdx}">
                  <span class="w-2.5 h-2.5 rounded-full bg-white pointer-events-none"></span>
                </div>
              </div>
            `
        )
        .join('')}
          </div>

          <div class="space-y-4">
            <span class="font-black text-purple-700 block text-[11px] uppercase tracking-wider mb-2">Pilihan Pasangan</span>
            ${rightAnswers
        .map(
          (rightItem) => `
              <div class="relative bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 flex items-center min-h-[60px] shadow-xs">
                <div class="matching-dot right-dot absolute -left-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-7 sm:h-7 rounded-full bg-purple-600 text-white border-2 border-white shadow-md flex items-center justify-center cursor-pointer touch-none hover:scale-110 transition z-20"
                     data-game-id="${gid}" data-right-text="${e(rightItem.text)}">
                  <span class="w-2.5 h-2.5 rounded-full bg-white pointer-events-none"></span>
                </div>
                <span class="font-bold text-purple-950 text-xs pl-3">${e(rightItem.text)}</span>
              </div>
            `
        )
        .join('')}
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2">
        <button onclick="resetMatchingLines(${gj})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs flex items-center gap-1">
          <span>🔄</span> Reset Garis
        </button>
        <button id="btn-submit-game-${gid}" onclick="requireStudentAuth(() => submitGameSiswa(${pj}, ${gj}, 'matching'))" class="px-5 py-2.5 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition text-xs">
          🎮 Periksa & Simpan Hasil Garis
        </button>
      </div>
    `;
  } else if (tipe === 'drag_drop') {
    const cat1 = items[0]?.kategori_a || 'Kategori A';
    const cat2 = items[0]?.kategori_b || 'Kategori B';
    const answers = state.gameAnswers[gameId] || {};

    const poolItems = [];
    const aItems = [];
    const bItems = [];

    items.forEach((item, idx) => {
      const savedCat = answers[idx];
      const itemHtml = `
        <div id="drag-item-${gid}-${idx}" data-game-id="${gid}" data-item-idx="${idx}" class="draggable-item px-3.5 py-2.5 bg-white border border-slate-300 shadow-xs rounded-2xl font-bold text-slate-800 text-xs">
          ${e(item.soal)}
        </div>
      `;
      if (savedCat === 'A') aItems.push(itemHtml);
      else if (savedCat === 'B') bItems.push(itemHtml);
      else poolItems.push(itemHtml);
    });

    return `
      <div class="space-y-4" data-game-id="${gid}">
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-brand-navy font-medium">
          💡 <b>Petunjuk Drag & Drop:</b> Tekan, seret (drag), lalu lepaskan (drop) objek ke dalam area kategori yang sesuai di bawah ini!
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div id="drop-zone-${gid}-A" data-game-id="${gid}" data-cat="A" class="drop-zone bg-blue-50/60 border-2 border-dashed border-blue-300 p-4 rounded-3xl space-y-2">
            <span class="font-black text-brand-blue block uppercase font-heading text-center border-b border-blue-200 pb-1">${e(cat1)}</span>
            <div class="drop-zone-items space-y-2 min-h-[80px]">${aItems.join('')}</div>
          </div>

          <div id="drop-zone-${gid}-B" data-game-id="${gid}" data-cat="B" class="drop-zone bg-purple-50/60 border-2 border-dashed border-purple-300 p-4 rounded-3xl space-y-2">
            <span class="font-black text-purple-600 block uppercase font-heading text-center border-b border-purple-200 pb-1">${e(cat2)}</span>
            <div class="drop-zone-items space-y-2 min-h-[80px]">${bItems.join('')}</div>
          </div>
        </div>

        <div id="drop-zone-${gid}-pool" data-game-id="${gid}" data-cat="pool" class="drop-zone bg-slate-100 p-4 rounded-3xl border space-y-2">
          <span class="font-bold text-slate-500 block text-[11px] uppercase tracking-wider text-center">Pilihan Objek (Seret dari sini):</span>
          <div class="drop-zone-items flex flex-wrap gap-2 justify-center">
            ${poolItems.join('')}
          </div>
        </div>

        <button id="btn-submit-game-${gid}" onclick="requireStudentAuth(() => submitGameSiswa(${pj}, ${gj}, 'drag_drop'))" class="w-full py-3 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition">
          🎮 Periksa & Simpan Hasil Drag & Drop
        </button>
      </div>
    `;
  } else if (tipe === 'sequencer') {
    let seqState = state.gameStates[gameId];
    if (!seqState || !seqState.sequencerItems) {
      seqState = {
        sequencerItems: [...items]
          .map((it, origIdx) => ({ text: it.soal, correctOrder: origIdx }))
          .sort(() => Math.random() - 0.5)
      };
      state.gameStates[gameId] = seqState;
    }

    return `
      <div class="space-y-3">
        <div id="sequencer-list-container-${gid}" class="space-y-2">
          ${seqState.sequencerItems
        .map(
          (item, idx) => `
            <div class="p-3 bg-slate-50 rounded-2xl border flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 rounded-xl bg-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0">${idx + 1
            }</span>
                <span class="font-bold text-slate-800 text-xs">${e(item.text)}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button onclick="moveSequencerItem(${gj}, ${idx}, -1, ${pj})" ${idx === 0
              ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded-lg text-xs font-bold"'
              : 'class="px-2 py-1 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg text-xs font-bold"'
            }>▲</button>
                <button onclick="moveSequencerItem(${gj}, ${idx}, 1, ${pj})" ${idx === seqState.sequencerItems.length - 1
              ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded-lg text-xs font-bold"'
              : 'class="px-2 py-1 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg text-xs font-bold"'
            }>▼</button>
              </div>
            </div>
          `
        )
        .join('')}
        </div>
        <button id="btn-submit-game-${gid}" onclick="requireStudentAuth(() => submitGameSiswa(${pj}, ${gj}, 'sequencer'))" class="w-full py-3 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition">
          🎮 Periksa & Simpan Urutan
        </button>
      </div>
    `;
  } else if (tipe === 'hotspot') {
    return renderHotspotGameBody(gameId, items, ptmId);
  } else if (tipe === 'simulator') {
    return `
      <div class="space-y-4">
        <div class="bg-purple-50 border border-purple-200 p-4 rounded-3xl space-y-1">
          <span class="font-black text-purple-900 block text-xs">🧪 Skenario Proyek STEAM:</span>
          <p class="text-purple-800 font-bold text-xs">${e(items[0]?.soal || 'Skenario Keputusan Proyek')}</p>
        </div>

        <div class="space-y-3">
          ${items
        .map(
          (item, idx) => `
            <div class="bg-white p-4 rounded-3xl border space-y-2">
              <span class="font-black text-brand-navy block">Parameter #${idx + 1}: ${e(item.parameter || 'Variabel Keputusan')}</span>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button id="gm-${gid}-sim-${idx}-A" onclick="setSimChoice(${gj}, ${idx}, 'A')" class="p-2.5 rounded-xl border bg-slate-50 font-bold text-left text-xs">${e(item.opsi_a || 'Pilihan A')}</button>
                <button id="gm-${gid}-sim-${idx}-B" onclick="setSimChoice(${gj}, ${idx}, 'B')" class="p-2.5 rounded-xl border bg-slate-50 font-bold text-left text-xs">${e(item.opsi_b || 'Pilihan B')}</button>
                <button id="gm-${gid}-sim-${idx}-C" onclick="setSimChoice(${gj}, ${idx}, 'C')" class="p-2.5 rounded-xl border bg-slate-50 font-bold text-left text-xs">${e(item.opsi_c || 'Pilihan C')}</button>
              </div>
            </div>
          `
        )
        .join('')}
        </div>

        <button id="btn-submit-game-${gid}" onclick="requireStudentAuth(() => submitGameSiswa(${pj}, ${gj}, 'simulator'))" class="w-full py-3 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition">
          🎮 Simulasikan Keputusan & Hitung Skor
        </button>
      </div>
    `;
  } else if (tipe === 'word_search') {
    const words = items.map((it) => String(it.soal).toUpperCase().trim());
    let wsState = state.gameStates[gameId];
    if (!wsState || !wsState.wordSearchState) {
      wsState = { wordSearchState: { targetWords: words, foundWords: [] } };
      state.gameStates[gameId] = wsState;
    }

    return `
      <div class="space-y-4">
        <div class="p-3 bg-purple-50 border border-purple-200 rounded-2xl space-y-1">
          <span class="font-black text-purple-900 block text-xs">🔍 Cari Kata-Kata Istilah Berikut:</span>
          <div id="ws-${gid}-badges" class="flex flex-wrap gap-1.5 mt-1">
            ${words
        .map(
          (w) => `
              <span class="px-2.5 py-1 rounded-xl text-xs font-black ${wsState.wordSearchState.foundWords.includes(w)
              ? 'bg-emerald-500 text-white line-through'
              : 'bg-white border text-purple-800'
            }">${e(w)}</span>
            `
        )
        .join('')}
          </div>
        </div>

        <div class="bg-white p-4 rounded-3xl border space-y-3">
          <label class="block font-bold text-slate-700 text-xs">Ketikkan kata istilah IPA yang kamu temukan di bawah ini:</label>
          <div class="flex gap-2">
            <input type="text" id="ws-${gid}-input-word" placeholder="Ketik kata di sini..." class="w-full p-2.5 rounded-xl border font-bold uppercase text-brand-navy" />
            <button onclick="checkWordSearchMatch(${gj}, ${pj})" class="px-4 py-2.5 bg-brand-navy text-white font-bold rounded-xl shrink-0">Klaim Kata</button>
          </div>
        </div>

        <button id="btn-submit-game-${gid}" onclick="requireStudentAuth(() => submitGameSiswa(${pj}, ${gj}, 'word_search'))" class="w-full py-3 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition">
          🎮 Periksa & Simpan Skor Kata
        </button>
      </div>
    `;
  } else {
    return `
      <div class="space-y-3">
        ${items
        .map(
          (item, idx) => `
          <div class="bg-slate-50 p-3.5 rounded-2xl border space-y-2">
            <p class="font-bold text-slate-800">${idx + 1}. ${e(item.soal)}</p>
            <div class="grid grid-cols-2 gap-2">
              <button id="gm-${gid}-quiz-${idx}-A" onclick="setQuizChoice(${gj}, ${idx}, 'A')" class="p-2.5 rounded-xl border bg-white font-bold text-left">A. ${e(item.opsi_a || 'Opsi A')}</button>
              <button id="gm-${gid}-quiz-${idx}-B" onclick="setQuizChoice(${gj}, ${idx}, 'B')" class="p-2.5 rounded-xl border bg-white font-bold text-left">B. ${e(item.opsi_b || 'Opsi B')}</button>
            </div>
          </div>
        `
        )
        .join('')}
        <button id="btn-submit-game-${gid}" onclick="requireStudentAuth(() => submitGameSiswa(${pj}, ${gj}, 'quiz_speed'))" class="w-full py-3 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition">
          🎮 Periksa & Simpan Skor Game
        </button>
      </div>
    `;
  }
}

export async function submitGameSiswa(ptmId, idGame, tipe) {
  const gameObj = (state.cachedData.games || []).find((g) => g.id_game === idGame);
  if (!gameObj) return;

  let config = { items: [] };
  try {
    config = typeof gameObj.konfigurasi_json === 'string' ? JSON.parse(gameObj.konfigurasi_json) : gameObj.konfigurasi_json;
  } catch (e) { }

  const items = config.items || [];
  const answers = state.gameAnswers[idGame] || {};
  let correctCount = 0;

  if (tipe === 'matching') {
    items.forEach((item, idx) => {
      if (String(answers[idx] || '').trim().toLowerCase() === String(item.kunci || '').trim().toLowerCase())
        correctCount++;
    });
  } else if (tipe === 'drag_drop') {
    items.forEach((item, idx) => {
      if (answers[idx] === item.kategori_kunci) correctCount++;
    });
  } else if (tipe === 'sequencer') {
    const seqItems = state.gameStates[idGame]?.sequencerItems || [];
    seqItems.forEach((it, currentIdx) => {
      if (it.correctOrder === currentIdx) correctCount++;
    });
  } else if (tipe === 'hotspot') {
    correctCount = scoreHotspotAnswers(items, answers);
  } else if (tipe === 'simulator') {
    items.forEach((item, idx) => {
      if (answers[idx] === item.kunci) correctCount++;
    });
  } else if (tipe === 'word_search') {
    const wsState = state.gameStates[idGame]?.wordSearchState;
    if (wsState) correctCount = wsState.foundWords.length;
  } else {
    items.forEach((item, idx) => {
      if (answers[idx] === item.kunci) correctCount++;
    });
  }

  const score = Math.round((correctCount / Math.max(items.length, 1)) * 100);
  const btn = document.getElementById(`btn-submit-game-${idGame}`);
  setButtonLoading(btn, true, '🎮 Menyimpan Skor...', '🎮 Periksa & Simpan Skor Game');

  const res = await apiPost({
    action: 'submit_game',
    id_pertemuan: ptmId,
    id_game: idGame,
    username_siswa: state.currentUser.username,
    nama_siswa: state.currentUser.name,
    kelas: state.currentUser.kelas,
    jawaban_json: tipe === 'word_search' ? state.gameStates[idGame]?.wordSearchState?.foundWords || [] : answers,
    skor_game: score
  });

  setButtonLoading(btn, false, '', '🎮 Periksa & Simpan Skor Game');
  if (res.success) {
    markSelesai('game', idGame);
    if (!res.queued) await fetchAllInitialData(true);
    Swal.fire({
      icon: 'success',
      title: 'Permainan Selesai!',
      html: `Skor Kamu untuk <b>${gameObj.judul_game}</b>: <b class="text-2xl text-purple-600 block mt-1">${score} / 100</b>${res.queued ? '<span class="block text-xs text-slate-500 mt-2">Skor tersimpan di perangkat dan dikirim otomatis ke server.</span>' : ''}`
    });
  } else {
    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan Skor', text: res.message });
  }
}

window.submitGameSiswa = submitGameSiswa;

import { state } from '../state.js';
import { escapeHtml as e, jsArg, safeUrl } from '../services/html.js';

export function renderHotspotGameBody(gameId, items, ptmId) {
  const imgUrl = safeUrl(items[0]?.img_url);
  const allLabels = items.map((it) => it.soal).sort(() => Math.random() - 0.5);

  return `
    <div class="space-y-4">
      ${imgUrl
      ? `
        <div class="bg-white p-3 rounded-3xl border text-center">
          <img src="${e(imgUrl)}" alt="Diagram STEAM" class="max-h-80 mx-auto rounded-2xl object-contain border" />
        </div>
      `
      : ''
    }

      <div class="space-y-2">
        ${items
      .map(
        (item, idx) => `
          <div class="bg-slate-50 p-3 rounded-2xl border flex items-center justify-between gap-3">
            <span class="font-bold text-slate-800 text-xs flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-brand-navy text-white font-black text-xs flex items-center justify-center">Pin ${idx + 1
          }</span>
              <span>Label Pin #${idx + 1}:</span>
            </span>
            <select onchange="setHotspotChoice(${jsArg(gameId)}, ${idx}, this.value)" class="p-2 rounded-xl border font-bold text-xs text-brand-blue bg-white">
              <option value="">-- Pilih Label --</option>
              ${allLabels.map((lbl) => `<option value="${e(lbl)}">${e(lbl)}</option>`).join('')}
            </select>
          </div>
        `
      )
      .join('')}
      </div>

      <button id="btn-submit-game-${e(gameId)}" onclick="requireStudentAuth(() => submitGameSiswa(${jsArg(ptmId)}, ${jsArg(gameId)}, 'hotspot'))" class="w-full py-3 bg-purple-600 text-white font-black rounded-2xl shadow hover:bg-purple-700 transition">
        🎮 Periksa & Simpan Label Pin
      </button>
    </div>
  `;
}

export function setHotspotChoice(gameId, idx, value) {
  if (!state.gameAnswers[gameId]) state.gameAnswers[gameId] = {};
  state.gameAnswers[gameId][idx] = value;
}

window.setHotspotChoice = setHotspotChoice;

export function renderHotspotConfigForm(firstItem) {
  const imgUrl = firstItem?.img_url || '';
  return `
    <div class="space-y-2 mb-3">
      <div>
        <label class="block font-bold text-slate-700">URL Gambar Diagram / STEAM</label>
        <input type="url" id="gm-hotspot-img-url" value="${e(imgUrl)}" placeholder="https://example.com/diagram.png" class="w-full p-2 border rounded-xl font-mono text-[11px]" />
      </div>
      <div class="text-[10px] text-purple-700 font-bold">Isikan Label Bagian/Pin Gambar:</div>
    </div>
  `;
}

export function renderHotspotItemRow(itemData, pinNum, removeBtnHtml) {
  const soal = itemData?.soal || '';
  return `
    ${removeBtnHtml}
    <div class="flex items-center gap-2 clear-both">
      <span class="w-6 h-6 rounded-lg bg-brand-navy text-white font-black text-[10px] flex items-center justify-center shrink-0">Pin ${pinNum}</span>
      <input type="text" class="gm-input-soal w-full p-2 rounded-xl border text-[11px]" value="${e(soal)}" placeholder="Nama label pin ${pinNum}..." />
    </div>
  `;
}

export function collectHotspotItem(soal, hotspotUrl) {
  if (!soal) return null;
  return { soal, img_url: hotspotUrl };
}

export function scoreHotspotAnswers(items, answers) {
  let correctCount = 0;
  items.forEach((item, idx) => {
    if (answers[idx] === item.soal) correctCount++;
  });
  return correctCount;
}

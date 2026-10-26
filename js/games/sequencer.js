import { state } from '../state.js';
import { escapeHtml as e, jsArg } from '../services/html.js';

export function moveSequencerItem(gameId, index, direction, ptmId) {
  const seqState = state.gameStates[gameId];
  if (!seqState || !seqState.sequencerItems) return;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= seqState.sequencerItems.length) return;

  const temp = seqState.sequencerItems[index];
  seqState.sequencerItems[index] = seqState.sequencerItems[targetIndex];
  seqState.sequencerItems[targetIndex] = temp;

  const container = document.getElementById(`sequencer-list-container-${gameId}`);
  if (container) {
    container.innerHTML = seqState.sequencerItems
      .map(
        (item, idx) => `
        <div class="p-3 bg-slate-50 rounded-2xl border flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded-xl bg-purple-600 text-white font-black text-xs flex items-center justify-center shrink-0">${idx + 1}</span>
            <span class="font-bold text-slate-800 text-xs">${e(item.text)}</span>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="moveSequencerItem(${jsArg(gameId)}, ${idx}, -1, ${jsArg(ptmId)})" ${idx === 0
              ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded-lg text-xs font-bold"'
              : 'class="px-2 py-1 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg text-xs font-bold"'
            }>▲</button>
            <button onclick="moveSequencerItem(${jsArg(gameId)}, ${idx}, 1, ${jsArg(ptmId)})" ${idx === seqState.sequencerItems.length - 1
              ? 'disabled class="px-2 py-1 bg-slate-200 text-slate-400 rounded-lg text-xs font-bold"'
              : 'class="px-2 py-1 bg-purple-100 text-purple-800 hover:bg-purple-200 rounded-lg text-xs font-bold"'
            }>▼</button>
          </div>
        </div>
      `
      )
      .join('');
  }
}

window.moveSequencerItem = moveSequencerItem;

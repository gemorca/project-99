import './services/idb.js';
import './services/sw-register.js';
import './services/pwa-install.js';
import './services/outbox-status.js';
import './services/api.js';
import './services/ocr.js';
import './components/modal.js';
import './components/drawer.js';
import './components/canvas-steam.js';
import './components/pdf-overlay.js';
import './components/sound.js';
import './games/drag-drop.js';
import './games/matching.js';
import './games/quiz-speed.js';
import './games/simulator.js';
import './games/sequencer.js';
import './games/word-search.js';
import './games/hotspot.js';
import './views/home.js';
import './views/steam-lab.js';
import './views/materi.js';
import './views/lkpd.js';
import './views/game.js';
import './views/evaluasi.js';
import './views/admin.js';
import './views/guru.js';

import { switchView } from './components/drawer.js';
import { performAutoLogout, updateUIForAuthenticatedUser } from './components/modal.js';
import { initGlobalClickFeedback, updateSoundToggleUI } from './components/sound.js';
import { clearSessionState, IDLE_TIMEOUT_MS, loadSessionState, state, touchUserActivity } from './state.js';

initGlobalClickFeedback();

window.addEventListener('DOMContentLoaded', async () => {
  updateSoundToggleUI();

  const savedSession = loadSessionState();
  const now = Date.now();

  if (savedSession && (now - savedSession.lastActivity < IDLE_TIMEOUT_MS)) {
    state.currentUser = savedSession.user;
    state.lastActivity = savedSession.lastActivity;
    updateUIForAuthenticatedUser();
    await switchView(savedSession.view || 'home', savedSession.paramId || null);
  } else {
    clearSessionState();
    state.currentUser = null;
    updateUIForAuthenticatedUser();
    await switchView('home');
  }

  ['click', 'keydown', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, touchUserActivity, { passive: true });
  });

  setInterval(() => {
    if (state.currentUser && state.lastActivity) {
      if (Date.now() - state.lastActivity >= IDLE_TIMEOUT_MS) {
        performAutoLogout();
      }
    }
  }, 10000);
});
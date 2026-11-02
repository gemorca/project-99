import { switchView } from './drawer.js';
import { showToast } from './modal.js';
import { fetchDataFromNetwork } from '../services/api.js';
import { isEvaluasiBerlangsung } from '../views/evaluasi.js';
import { state } from '../state.js';

const THRESHOLD = 70; // jarak tarik (px) agar refresh jalan
const MAX_PULL = 110; // jarak tarik maksimum indikator
const MIN_GAP_MS = 3000; // jeda minimum antar refresh
const BLOCKED_VIEWS = ['lkpd-ptm', 'game-ptm', 'evaluasi-ptm']; // isian siswa bisa hilang
const IGNORE_SELECTOR =
  'canvas, input, textarea, select, #guru-editor-container, #main-drawer, .swal2-container, [data-no-ptr]';

let indicator = null;
let startY = 0;
let pull = 0;
let tracking = false;
let busy = false;
let lastRun = 0;

function injectStyle() {
  if (document.getElementById('ptr-style')) return;
  const s = document.createElement('style');
  s.id = 'ptr-style';
  s.textContent = `
    #ptr-indicator{position:fixed;left:50%;top:0;z-index:60;width:40px;height:40px;margin-left:-20px;
      display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#fff;
      box-shadow:0 4px 14px rgba(11,37,69,.25);font-size:18px;pointer-events:none;opacity:0;
      transform:translateY(-60px);will-change:transform,opacity}
    #ptr-indicator.ptr-anim{transition:transform .2s ease,opacity .2s ease}
    #ptr-indicator.ptr-spin span{display:inline-block;animation:ptr-rot .8s linear infinite}
    @keyframes ptr-rot{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(s);
}

function ensureIndicator() {
  if (indicator) return indicator;
  injectStyle();
  indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.innerHTML = '<span>🔄</span>';
  document.body.appendChild(indicator);
  return indicator;
}

function setIndicator(px, animate) {
  const el = ensureIndicator();
  el.classList.toggle('ptr-anim', Boolean(animate));
  const y = Math.max(0, px) - 60 + 12; // 12px = jarak dari tepi atas
  el.style.transform = `translateY(calc(${y}px + env(safe-area-inset-top, 0px))) rotate(${px * 3}deg)`;
  el.style.opacity = String(Math.min(1, px / THRESHOLD));
}

function hideIndicator() {
  const el = ensureIndicator();
  el.classList.remove('ptr-spin');
  setIndicator(0, true);
  el.style.opacity = '0';
}

function atTop() {
  const doc = document.scrollingElement || document.documentElement;
  const main = document.querySelector('main');
  return doc.scrollTop <= 0 && (!main || main.scrollTop <= 0);
}

function insideScrolledContainer(node) {
  const main = document.querySelector('main');
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    if (el === main) break;
    if (el.scrollTop > 0) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return true;
    }
  }
  return false;
}

function isBlocked() {
  if (busy) return true;
  if (Date.now() - lastRun < MIN_GAP_MS) return true;
  if (window.Swal && Swal.isVisible()) return true;
  const fm = document.getElementById('lkpd-field-map-modal');
  if (fm && !fm.classList.contains('hidden')) return true;
  const drawer = document.getElementById('main-drawer');
  if (drawer && !drawer.classList.contains('-translate-x-full') && window.innerWidth < 768) return true;
  try {
    if (isEvaluasiBerlangsung()) return true;
  } catch (err) {}
  return false;
}

async function doRefresh() {
  busy = true;
  const el = ensureIndicator();
  el.classList.add('ptr-spin');
  setIndicator(THRESHOLD, true);
  try {
    const ok = await fetchDataFromNetwork();
    if (ok) {
      await switchView(state.currentView, state.activePertemuanId);
      showToast('success', 'Data diperbarui.');
    } else if (state.currentUser || state.isDataLoaded) {
      showToast('error', 'Gagal memperbarui data. Periksa koneksi.');
    }
  } catch (err) {
    console.error('[pull-refresh] gagal:', err);
    showToast('error', 'Gagal memperbarui data.');
  } finally {
    lastRun = Date.now();
    busy = false;
    hideIndicator();
  }
}

function onStart(e) {
  tracking = false;
  pull = 0;
  if (e.touches.length !== 1) return;
  if (isBlocked()) return;
  if (!atTop()) return;
  const t = e.target;
  if (t.closest && t.closest(IGNORE_SELECTOR)) return;
  if (insideScrolledContainer(t)) return;
  startY = e.touches[0].clientY;
  tracking = true;
}

function onMove(e) {
  if (!tracking) return;
  const dy = e.touches[0].clientY - startY;
  if (dy <= 0 || !atTop()) {
    if (pull > 0) hideIndicator();
    pull = 0;
    return;
  }
  pull = Math.min(MAX_PULL, dy * 0.5);
  setIndicator(pull, false);
}

function onEnd() {
  if (!tracking) return;
  tracking = false;
  const reached = pull >= THRESHOLD;
  pull = 0;
  if (!reached) {
    hideIndicator();
    return;
  }
  if (BLOCKED_VIEWS.includes(state.currentView)) {
    hideIndicator();
    showToast('warning', 'Refresh dinonaktifkan di halaman ini agar isian tidak hilang.');
    return;
  }
  doRefresh();
}

document.addEventListener('touchstart', onStart, { passive: true });
document.addEventListener('touchmove', onMove, { passive: true });
document.addEventListener('touchend', onEnd, { passive: true });
document.addEventListener('touchcancel', onEnd, { passive: true });

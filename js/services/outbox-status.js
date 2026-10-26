import { countOutbox } from './idb.js';

const PENDING_KEY = 'ELKPD_PENDING_DRAFT_CLEAR';

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

export function markDraftForClear(draftKey) {
  const list = readPending();
  if (!list.includes(draftKey)) list.push(draftKey);
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch (e) {}
  updateOutboxBadge();
}

function clearPendingDrafts() {
  readPending().forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {}
}

export async function updateOutboxBadge() {
  const badge = document.getElementById('outbox-badge');
  const total = await countOutbox();

  if (badge) {
    if (total > 0) {
      badge.textContent = `⏳ ${total} menunggu kirim`;
      badge.title = 'Data tersimpan di perangkat dan dikirim otomatis saat koneksi tersedia.';
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  if (total === 0) clearPendingDrafts();
}

window.addEventListener('outbox-changed', updateOutboxBadge);
window.addEventListener('online', () => setTimeout(updateOutboxBadge, 1500));
window.addEventListener('offline', updateOutboxBadge);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'OUTBOX_CHANGED') updateOutboxBadge();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateOutboxBadge);
} else {
  updateOutboxBadge();
}

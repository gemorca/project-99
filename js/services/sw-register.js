import { GAS_API_URL } from '../config.js';
import { initIndexedDB } from '../services/idb.js';

let isFlushing = false;

export async function registerServiceWorkerAndSync() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      if ('sync' in reg) {
        await reg.sync.register('sync-outbox-submissions');
      }
    } catch (e) {
      console.warn('Service Worker / Background Sync tidak didukung:', e);
    }
  }
}

export async function triggerOutboxFlushManual() {
  if (isFlushing) return;
  isFlushing = true;

  try {
    const db = await initIndexedDB();
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    
    const items = await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (items.length === 0) {
      isFlushing = false;
      return;
    }

    for (const item of items) {
      try {
        const res = await fetch(GAS_API_URL, {
          method: 'POST',
          body: JSON.stringify(item.payload)
        });
        const result = await res.json();
        
        if (result && result.success) {
          const delTx = db.transaction('outbox', 'readwrite');
          await new Promise((resolveDel) => {
            const delReq = delTx.objectStore('outbox').delete(item.id);
            delReq.onsuccess = resolveDel;
            delReq.onerror = resolveDel;
          });
          window.dispatchEvent(new Event('outbox-changed'));
        }
      } catch (err) {
        console.warn('Manual Outbox Flush pending connection...', err);
      }
    }
  } catch (e) {
    console.error('Outbox flush error:', e);
  } finally {
    isFlushing = false;
  }
}

window.addEventListener('online', triggerOutboxFlushManual);

if ('serviceWorker' in navigator) {
  if (document.readyState === 'complete') {
    registerServiceWorkerAndSync();
  } else {
    window.addEventListener('load', registerServiceWorkerAndSync);
  }
}
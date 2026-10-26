import { DB_NAME, DB_VERSION } from '../config.js';

export function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setIDBCache(key, val) {
  try {
    const db = await initIndexedDB();
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').put(val, key);
  } catch (e) {
    console.error('IDB Cache Save Error:', e);
  }
}

export async function getIDBCache(key) {
  try {
    const db = await initIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction('cache', 'readonly');
      const req = tx.objectStore('cache').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function saveToOutboxQueue(id, payload) {
  const db = await initIndexedDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    tx.objectStore('outbox').put({ id, payload, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaksi outbox dibatalkan'));
  });
}

export async function countOutbox() {
  try {
    const db = await initIndexedDB();
    return await new Promise((resolve) => {
      const req = db.transaction('outbox', 'readonly').objectStore('outbox').count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch (e) {
    return 0;
  }
}

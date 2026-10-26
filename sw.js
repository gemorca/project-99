const CACHE_VERSION = 'v7';
const SHELL_CACHE = `elkpd-steam-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `elkpd-steam-runtime-${CACHE_VERSION}`;
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwguqi5nD3KayEz0iGmQdD5CUzRZSYimP0Y6MRynOa1tRnjjrRcCkPcN4W-_pEn8LNOcg/exec';

const SHELL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './js/main.js',
    './js/config.js',
    './js/state.js',
    './js/components/canvas-steam.js',
    './js/components/drawer.js',
    './js/components/field-map-editor.js',
    './js/components/modal.js',
    './js/components/pdf-overlay.js',
    './js/components/sound.js',
    './js/games/drag-drop.js',
    './js/games/hotspot.js',
    './js/games/matching.js',
    './js/games/quiz-speed.js',
    './js/games/sequencer.js',
    './js/games/simulator.js',
    './js/games/word-search.js',
    './js/services/api.js',
    './js/services/auto-detect.js',
    './js/services/detectors/dotted-lines.js',
    './js/services/detectors/table-cells.js',
    './js/services/detectors/labeler.js',
    './js/services/detectors/merger.js',
    './js/services/ocr-labels.js',
    './js/services/idb.js',
    './js/services/pwa-install.js',
    './js/services/ocr.js',
    './js/services/sw-register.js',
    './js/views/admin.js',
    './js/views/evaluasi.js',
    './js/views/game.js',
    './js/views/guru.js',
    './js/views/home.js',
    './js/views/lkpd.js',
    './js/views/materi.js',
    './js/views/steam-lab.js'
];

// Host CDN yang aman di-cache untuk offline (library statis + font)
const CDN_HOSTS = [
    'cdn.tailwindcss.com',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE).then((cache) =>
            Promise.all(
                SHELL_ASSETS.map((url) =>
                    cache.add(url).catch((err) => console.warn('[SW] Gagal precache:', url, err))
                )
            )
        ).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k.startsWith('elkpd-steam-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
                    .map((k) => caches.delete(k))
            )
        ).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // Jangan sentuh API Google Apps Script & proxy PDF: harus selalu live
    if (req.url.startsWith(GAS_API_URL) || url.hostname === 'script.google.com' ||
        url.hostname === 'script.googleusercontent.com' ||
        url.hostname === 'drive.google.com' || url.hostname === 'api.allorigins.win' ||
        url.hostname === 'corsproxy.io') return;

    // Navigasi halaman: network-first, fallback ke index.html cache
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
                    return res;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    const sameOrigin = url.origin === self.location.origin;
    if (!sameOrigin && !CDN_HOSTS.includes(url.hostname)) return;

    // Aset lain: stale-while-revalidate
    event.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req)
                .then((res) => {
                    if (res && (res.ok || res.type === 'opaque')) {
                        const copy = res.clone();
                        caches.open(sameOrigin ? SHELL_CACHE : RUNTIME_CACHE).then((c) => c.put(req, copy));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-outbox-submissions') {
        event.waitUntil(processOutboxQueue());
    }
});

function openOutboxDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('ELKPD_STEAM_DB', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function processOutboxQueue() {
    try {
        const db = await openOutboxDB();
        const tx = db.transaction('outbox', 'readonly');
        const store = tx.objectStore('outbox');
        const itemsReq = store.getAll();

        itemsReq.onsuccess = async () => {
            const items = itemsReq.result || [];
            for (const item of items) {
                try {
                    const response = await fetch(GAS_API_URL, {
                        method: 'POST',
                        body: JSON.stringify(item.payload)
                    });
                    const resJson = await response.json();

                    if (resJson && resJson.success) {
                        const delTx = db.transaction('outbox', 'readwrite');
                        delTx.objectStore('outbox').delete(item.id);
                    }
                } catch (err) {
                    console.warn('[SW Background Sync] Percobaan kirim gagal, akan dicoba otomatis nanti:', err);
                }
            }
        };
    } catch (err) {
        console.error('[SW Background Sync Error]:', err);
    }
}

const CACHE_NAME = 'notes-pwa-v14';
const APP_SHELL = [
    './', 'index.php', 'style.css', 'app.js', 'icon.svg',
    'vendor/dexie-4.0.8.js', 'vendor/medium-editor.min.js', 'vendor/medium-editor.min.css', 'vendor/medium-editor-theme.min.css', 'vendor/turndown-7.1.2.js', 'vendor/html-docx-0.3.1.js', 'vendor/html2pdf-0.10.1.js',
    'vendor/fonts/open-sans.woff2', 'vendor/fonts/roboto.woff2', 'vendor/fonts/opendyslexic.otf'
];
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))); });
self.addEventListener('activate', (e) => {
    self.skipWaiting(); e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', (e) => { e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request))); });

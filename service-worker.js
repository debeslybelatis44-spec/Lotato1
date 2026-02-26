const CACHE_NAME = 'lotato-pro-v6';
const urlsToCache = [
  '/',
  '/agent1.html',
  '/style.css',
  '/config.js',
  '/drawManager.js',
  '/gameEngine.js',
  '/cartManager.js',
  '/apiService.js',
  '/uiManager.js',
  '/main.js',
  '/manifest.json',
  // Icônes à la racine
  '/72.png',
  '/96.png',
  '/128.png',
  '/144.png',
  '/152.png',
  '/192.png',
  '/384.png',
  '/512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// Installation
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activation
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie de cache
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // API : réseau d'abord, puis cache
  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Ressources statiques : cache d'abord, puis réseau
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          fetch(event.request)
            .then(networkResponse => {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            })
            .catch(() => {});
          return response;
        }
        return fetch(event.request).then(networkResponse => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
      .catch(() => caches.match('/agent1.html'))
  );
});
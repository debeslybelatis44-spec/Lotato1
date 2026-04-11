const CACHE_NAME = 'lotato-pro-v8';
const STATIC_CACHE = 'lotato-static-v8';
const DATA_CACHE = 'lotato-data-v8';

// Durées de validité (en millisecondes)
const TTL = {
  STATIC: 7 * 24 * 60 * 60 * 1000,   // 7 jours pour le code statique
  DRAWS: 24 * 60 * 60 * 1000,        // 1 jour pour les tirages
  SETTINGS: 24 * 60 * 60 * 1000,     // 1 jour pour les paramètres
  OTHER_API: 5 * 60 * 1000           // 5 minutes pour les autres API
};

// Ressources statiques à mettre en cache (inclut player.html)
const urlsToCache = [
  '/',
  '/agent1.html',
  '/superadmin.html',
  '/player.html',        // <-- AJOUTÉ
  '/style.css',
  '/config.js',
  '/drawManager.js',
  '/gameEngine.js',
  '/cartManager.js',
  '/apiService.js',
  '/uiManager.js',
  '/main.js',
  '/manifest.json',
  '/installer.js',       // utile pour les agents
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

// Installation : mise en cache statique
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (![STATIC_CACHE, DATA_CACHE].includes(name)) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fonction utilitaire pour mettre à jour le cache avec TTL
function storeWithTTL(cacheName, request, response, ttl) {
  const copy = response.clone();
  const headers = new Headers(copy.headers);
  headers.set('sw-cache-expiry', Date.now() + ttl);
  const newResponse = new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers });
  return caches.open(cacheName).then(cache => cache.put(request, newResponse));
}

// Vérifier si une réponse en cache est encore valide
function isCacheValid(response) {
  const expiry = response.headers.get('sw-cache-expiry');
  if (!expiry) return false;
  return Date.now() < parseInt(expiry);
}

// Stratégie de cache avec fallback réseau et mise en cache avec TTL
function cacheFirstWithTTL(request, ttl, fallbackUrl = null) {
  return caches.match(request).then(cachedResponse => {
    if (cachedResponse && isCacheValid(cachedResponse)) {
      return cachedResponse;
    }
    return fetch(request).then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        storeWithTTL(DATA_CACHE, request, networkResponse.clone(), ttl);
      }
      return networkResponse;
    }).catch(() => {
      if (cachedResponse) return cachedResponse; // retourne même expiré si offline
      if (fallbackUrl) return caches.match(fallbackUrl);
      return new Response('Offline', { status: 503 });
    });
  });
}

// Gestion des requêtes
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isStatic = urlsToCache.some(res => event.request.url.includes(res) || event.request.url.match(/\.(css|js|png|jpg|json)$/));
  const isDrawsApi = url.pathname === '/api/draws';
  const isSettingsApi = url.pathname === '/api/lottery-settings';
  const isOwnerSettings = url.pathname.startsWith('/api/owner-settings/');
  const isOtherApi = url.pathname.startsWith('/api/');

  // Ressources statiques (CSS, JS, HTML, images) - cache avec TTL long
  if (isStatic) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache => 
        cache.match(event.request).then(cached => {
          const fetchAndCache = () => fetch(event.request).then(response => {
            if (response.status === 200) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          if (cached) {
            // Rafraîchir en arrière-plan une fois par semaine
            fetchAndCache();
            return cached;
          }
          return fetchAndCache();
        })
      )
    );
    return;
  }

  // API des tirages - cache 1 jour
  if (isDrawsApi) {
    event.respondWith(cacheFirstWithTTL(event.request, TTL.DRAWS, '/agent1.html'));
    return;
  }

  // API des paramètres (lottery-settings) - cache 1 jour
  if (isSettingsApi || isOwnerSettings) {
    event.respondWith(cacheFirstWithTTL(event.request, TTL.SETTINGS, '/agent1.html'));
    return;
  }

  // Autres API - cache 5 minutes
  if (isOtherApi) {
    event.respondWith(cacheFirstWithTTL(event.request, TTL.OTHER_API, '/agent1.html'));
    return;
  }

  // Par défaut : réseau d'abord, cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
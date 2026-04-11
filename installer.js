// installer.js - version avec fallback

let deferredPrompt = null;
let installButton = null;

function createInstallButton() {
  const btn = document.createElement('button');
  btn.id = 'lotato-install-button';
  btn.textContent = '📲 Installer l’application';
  // ... ton style existant ...
  btn.style.display = 'none';
  document.body.appendChild(btn);
  return btn;
}

function createManualInstallMessage() {
  const div = document.createElement('div');
  div.id = 'manual-install-message';
  div.innerHTML = `
    <div style="position:fixed; bottom:20px; right:20px; background:#333; color:white; padding:12px; border-radius:12px; max-width:260px; z-index:9999; font-size:14px; box-shadow:0 2px 10px rgba(0,0,0,0.3);">
      ⚠️ Installation manuelle :<br>
      • Sur <strong>Android (Chrome/Firefox)</strong> : Menu → "Ajouter à l'écran d'accueil"<br>
      • Sur <strong>iPhone/iPad (Safari)</strong> : Partager → "Sur l'écran d'accueil"
    </div>
  `;
  document.body.appendChild(div);
  return div;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('SW enregistré', reg))
      .catch(err => console.error('Erreur SW', err));
  } else {
    console.warn('Service Worker non supporté');
    // Afficher un message alternatif
    showNoSupportMessage();
  }
}

function showNoSupportMessage() {
  const msg = document.createElement('div');
  msg.textContent = 'Votre navigateur ne supporte pas l’installation d’applications. Veuillez le mettre à jour.';
  msg.style.cssText = 'position:fixed; bottom:20px; left:20px; background:red; color:white; padding:8px; border-radius:8px; z-index:9999;';
  document.body.appendChild(msg);
}

function showInstallButton() {
  if (installButton) installButton.style.display = 'block';
}

function hideInstallButton() {
  if (installButton) installButton.style.display = 'none';
}

async function handleInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Installation : ${outcome}`);
  deferredPrompt = null;
  hideInstallButton();
}

// --- Initialisation avec détection ---
window.addEventListener('load', () => {
  registerServiceWorker();

  // Si déjà installée, ne rien faire
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('App déjà installée');
    return;
  }

  // Cas 1 : navigateur compatible (beforeinstallprompt)
  if ('beforeinstallprompt' in window) {
    installButton = createInstallButton();
    installButton.addEventListener('click', handleInstallClick);
    // L'événement beforeinstallprompt viendra plus tard pour afficher le bouton
  } 
  // Cas 2 : navigateur avec service worker mais sans beforeinstallprompt (Firefox, Safari)
  else if ('serviceWorker' in navigator) {
    // Afficher un message d'aide manuelle
    createManualInstallMessage();
  }
  // Cas 3 : navigateur très ancien
  else {
    showNoSupportMessage();
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installButton) showInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (installButton) hideInstallButton();
  // Optionnel : supprimer aussi le message manuel s'il existe
  const manualMsg = document.getElementById('manual-install-message');
  if (manualMsg) manualMsg.remove();
});
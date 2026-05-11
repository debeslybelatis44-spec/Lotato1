// installer.js – Version robuste et universelle
(function() {
  // État
  let deferredPrompt = null;
  let installButton = null;
  let hasBeenDismissed = false;   // pour ne pas spammer
  let retryCount = 0;
  
  // Configuration
  const CONFIG = {
    swPath: (() => {
      // Détection automatique du chemin du SW : on suppose qu'il est à la racine du site
      // Si votre service-worker.js est ailleurs, modifiez ici
      const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
      return '/service-worker.js'; // ou base + 'service-worker.js' selon votre structure
    })(),
    manifestPath: '/manifest.json',
    buttonHideAfterInstall: true,
    showManualFallback: true,      // afficher une aide si beforeinstallprompt jamais déclenché
    maxRetry: 2,                  // nombre de fois où on réaffiche le bouton après annulation
  };
  
  // Utilitaires
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  
  function isRunningStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true; // iOS
  }
  
  function log(msg, type = 'info') {
    const prefix = '[PWA Installer]';
    if (type === 'error') console.error(prefix, msg);
    else if (type === 'warn') console.warn(prefix, msg);
    else console.log(prefix, msg);
  }
  
  // Création du bouton flottant (amélioré : refermable)
  function createInstallButton() {
    if (document.getElementById('lotato-install-button')) return;
    
    const btn = document.createElement('button');
    btn.id = 'lotato-install-button';
    btn.textContent = '📲 Installer l’application';
    btn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      background: #fbbf24;
      color: #121212;
      border: none;
      padding: 12px 20px;
      border-radius: 40px;
      font-weight: bold;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer;
      display: none;
      font-family: sans-serif;
      transition: all 0.2s;
    `;
    // Ajouter un petit X pour fermer
    const closeSpan = document.createElement('span');
    closeSpan.textContent = ' ✕';
    closeSpan.style.marginLeft = '10px';
    closeSpan.style.fontSize = '14px';
    closeSpan.style.opacity = '0.7';
    closeSpan.style.cursor = 'pointer';
    closeSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      hideInstallButton();
      // Stocker dans localStorage pour ne plus le montrer pendant 7 jours
      localStorage.setItem('pwa_install_dismissed', Date.now());
      log('Utilisateur a fermé le bouton');
    });
    btn.appendChild(closeSpan);
    
    btn.addEventListener('click', handleInstallClick);
    document.body.appendChild(btn);
    installButton = btn;
  }
  
  function showInstallButton() {
    if (installButton && !isRunningStandalone()) {
      // Vérifier si l'utilisateur a récemment fermé (moins de 7 jours)
      const dismissed = localStorage.getItem('pwa_install_dismissed');
      if (dismissed && (Date.now() - parseInt(dismissed) < 7 * 24 * 3600 * 1000)) {
        log('Bouton masqué car utilisateur a cliqué sur fermer récemment');
        return;
      }
      installButton.style.display = 'block';
    }
  }
  
  function hideInstallButton() {
    if (installButton) installButton.style.display = 'none';
  }
  
  // Gestion du clic sur installation
  async function handleInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      log(`Choix de l'utilisateur : ${outcome}`);
      if (outcome === 'dismissed') {
        retryCount++;
        if (retryCount <= CONFIG.maxRetry) {
          log(`Réessai possible (${retryCount}/${CONFIG.maxRetry})`);
          // On réaffiche le bouton plus tard ? Oui, mais on garde deferredPrompt
          // deferredPrompt reste utilisable après dismiss (selon navigateur)
          showInstallButton();
        } else {
          log('Trop d’annulations, on cache le bouton définitivement');
          hideInstallButton();
          localStorage.setItem('pwa_install_dismissed', Date.now());
          deferredPrompt = null;
        }
      } else {
        // Installé
        deferredPrompt = null;
        if (CONFIG.buttonHideAfterInstall) hideInstallButton();
      }
    } else {
      // Pas de beforeinstallprompt : on propose un fallback (aide manuelle)
      log('Aucun prompt disponible, fallback manuel', 'warn');
      showManualInstallHelp();
    }
  }
  
  // Message d'aide manuelle (iOS ou navigateur sans support)
  function showManualInstallHelp() {
    if (document.getElementById('pwa-manual-help')) return;
    const helpDiv = document.createElement('div');
    helpDiv.id = 'pwa-manual-help';
    helpDiv.style.cssText = `
      position: fixed;
      bottom: 90px;
      right: 20px;
      background: #1e293b;
      color: white;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      max-width: 260px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: sans-serif;
      border-left: 4px solid #fbbf24;
    `;
    if (isIOS()) {
      helpDiv.innerHTML = `
        📱 <strong>Installer sur iOS</strong><br>
        Appuyez sur <span style="background:#333; padding:2px 6px; border-radius:8px;">Partager</span> 
        puis <strong>“Ajouter à l’écran d’accueil”</strong>.
        <button id="close-manual-help" style="float:right; background:none; border:none; color:#fbbf24; cursor:pointer;">✖</button>
      `;
    } else {
      helpDiv.innerHTML = `
        🔧 <strong>Installation manuelle</strong><br>
        Ouvrez ce site avec <strong>Chrome</strong> ou <strong>Edge</strong> et regardez dans le menu.
        <button id="close-manual-help" style="float:right; background:none; border:none; color:#fbbf24; cursor:pointer;">✖</button>
      `;
    }
    document.body.appendChild(helpDiv);
    document.getElementById('close-manual-help')?.addEventListener('click', () => helpDiv.remove());
    // Auto-disparition après 10s
    setTimeout(() => {
      if (helpDiv.parentNode) helpDiv.remove();
    }, 10000);
  }
  
  // Enregistrement du Service Worker avec gestion d'erreur explicite
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      log('Service Worker non supporté par ce navigateur', 'warn');
      showManualInstallHelp();
      return false;
    }
    
    navigator.serviceWorker.register(CONFIG.swPath)
      .then(registration => {
        log('Service Worker enregistré avec succès', 'info');
        // Option : vérifier les mises à jour
        registration.update();
      })
      .catch(err => {
        log(`Erreur enregistrement SW : ${err.message}`, 'error');
        // Si le SW échoue, l'installation PWA est impossible
        showManualInstallHelp();
      });
    return true;
  }
  
  // Vérifier si le manifest est valide (optionnel)
  function checkManifest() {
    fetch(CONFIG.manifestPath)
      .then(res => {
        if (!res.ok) log(`Manifest introuvable (${res.status})`, 'warn');
        else log('Manifest trouvé', 'info');
      })
      .catch(() => log('Impossible de charger le manifest', 'warn'));
  }
  
  // Initialisation principale
  window.addEventListener('load', () => {
    if (isRunningStandalone()) {
      log('Application déjà installée - pas de bouton affiché');
      return;
    }
    
    createInstallButton();
    registerServiceWorker();
    checkManifest();
    
    // Gestion de beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      log('beforeinstallprompt capturé');
      showInstallButton();
    });
    
    // Si après 3 secondes le bouton n'est pas affiché et que beforeinstallprompt n'a pas eu lieu,
    // c'est probablement que le navigateur ne supporte pas l'installation automatique
    setTimeout(() => {
      if (installButton && installButton.style.display !== 'block' && deferredPrompt === null && CONFIG.showManualFallback) {
        log('Aucun événement beforeinstallprompt après délai, fallback manuel');
        showManualInstallHelp();
      }
    }, 3000);
    
    // App installé (via prompt ou manuellement)
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      hideInstallButton();
      log('Application installée avec succès');
    });
  });
})();
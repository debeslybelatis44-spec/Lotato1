async function initApp() {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('auth_token');
    const agentId = localStorage.getItem('agent_id');
    const agentName = localStorage.getItem('agent_name');

    if (!token || !agentId) {
        window.location.href = 'index.html';
        return;
    }

    APP_STATE.agentId = agentId;
    APP_STATE.agentName = agentName;

    await loadLotteryConfig();
    await loadDrawsFromServer();
    await loadBlockedNumbers();
    await APIService.getTickets();
    await APIService.getWinningTickets();
    await APIService.getWinningResults();
    
    renderDraws();
    updateClock();
    checkSelectedDrawStatus();
    setupInputAutoMove();
    
    document.getElementById('add-bet-btn').addEventListener('click', () => CartManager.addBet());
    updateGameSelector();
    updateSyncStatus();

    document.getElementById('agent-name').textContent = agentName;
    
    console.log("LOTATO PRO Ready - Authentification OK");
}

async function loadDrawsFromServer() {
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/draws`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Erreur chargement tirages');
        const data = await response.json();
        APP_STATE.draws = data.draws;
    } catch (error) {
        console.error('❌ Erreur chargement tirages, utilisation des tirages par défaut:', error);
        APP_STATE.draws = CONFIG.DRAWS.map(d => ({ ...d, active: true }));
    }
}

async function loadBlockedNumbers() {
    try {
        const globalRes = await fetch(`${API_CONFIG.BASE_URL}/blocked-numbers/global`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            APP_STATE.globalBlockedNumbers = globalData.blockedNumbers || [];
        } else {
            APP_STATE.globalBlockedNumbers = [];
        }

        const draws = APP_STATE.draws || CONFIG.DRAWS;
        APP_STATE.drawBlockedNumbers = {};
        for (const draw of draws) {
            try {
                const drawRes = await fetch(`${API_CONFIG.BASE_URL}/blocked-numbers/draw/${draw.id}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                if (drawRes.ok) {
                    const drawData = await drawRes.json();
                    APP_STATE.drawBlockedNumbers[draw.id] = drawData.blockedNumbers || [];
                } else {
                    APP_STATE.drawBlockedNumbers[draw.id] = [];
                }
            } catch (e) {
                APP_STATE.drawBlockedNumbers[draw.id] = [];
            }
        }
    } catch (error) {
        console.error('❌ Erreur chargement numéros bloqués:', error);
        APP_STATE.globalBlockedNumbers = [];
        APP_STATE.drawBlockedNumbers = {};
    }
}

async function logout() {
    if (!confirm('Èske ou sèten ou vle dekonekte?')) return;

    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Erreur lors de la déconnexion côté serveur :', error);
        }
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('agent_id');
    localStorage.removeItem('agent_name');

    window.location.href = 'index.html';
}
window.logout = logout;

// ========== CODE POUR L'INVITATION À L'INSTALLATION (UNIVERSEL) ==========
let deferredPrompt;

// Intercepter l'événement beforeinstallprompt (pour Chrome/Android/Edge)
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📦 Événement beforeinstallprompt reçu');
    e.preventDefault();
    deferredPrompt = e;
    // Le message sera de toute façon affiché par le setTimeout ci-dessous,
    // mais on peut ajuster son contenu si besoin.
});

// Afficher un message d'invitation après 3 secondes, indépendamment de l'événement
setTimeout(() => {
    showInstallMessage();
}, 3000);

function showInstallMessage() {
    // Éviter les doublons
    if (document.getElementById('install-message')) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // Ne pas afficher si déjà installé
    if (isStandalone) return;

    const installMessage = document.createElement('div');
    installMessage.id = 'install-message';
    installMessage.style.cssText = `
        position: fixed;
        top: 60px;  /* pour être visible, juste en dessous du header */
        left: 20px;
        right: 20px;
        background: #fbbf24;
        color: #000;
        padding: 15px 20px;
        border-radius: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        z-index: 10000;
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: bold;
        border: 2px solid #000;
        animation: slideDown 0.3s ease;
    `;

    let content = '';
    if (deferredPrompt) {
        // Installation automatique possible
        content = `
            <span style="font-size: 16px;">📱 Installe LOTATO PRO sur ton écran d'accueil !</span>
            <div style="display: flex; gap: 10px;">
                <button id="install-btn" style="background: #000; color: #fff; border: none; padding: 8px 20px; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 14px;">Installer</button>
                <span id="close-install" style="cursor:pointer; font-size: 22px; line-height: 1;">✕</span>
            </div>
        `;
    } else {
        // Installation manuelle (iOS ou navigateur non supporté)
        const instructions = isIOS 
            ? "Sur iOS, appuie sur Partager ➔ Sur l'écran d'accueil" 
            : "Utilise le menu du navigateur pour ajouter à l'écran d'accueil";
        content = `
            <span style="font-size: 14px;">📱 Installe LOTATO PRO : ${instructions}</span>
            <span id="close-install" style="cursor:pointer; font-size: 22px; line-height: 1; margin-left: 10px;">✕</span>
        `;
    }

    installMessage.innerHTML = content;
    document.body.appendChild(installMessage);

    // Ajouter une animation keyframes si elle n'existe pas
    if (!document.querySelector('#install-animation')) {
        const style = document.createElement('style');
        style.id = 'install-animation';
        style.textContent = `
            @keyframes slideDown {
                from { transform: translateY(-100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    // Gestionnaire pour le bouton d'installation automatique
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                installMessage.remove();
                return;
            }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Résultat installation : ${outcome}`);
            deferredPrompt = null;
            installMessage.remove();
        });
    }

    // Fermeture manuelle
    document.getElementById('close-install').addEventListener('click', () => {
        installMessage.remove();
    });
}

// Nettoyer le message si l'application est installée
window.addEventListener('appinstalled', () => {
    console.log('Application installée');
    const msg = document.getElementById('install-message');
    if (msg) msg.remove();
});
// ========== FIN CODE INVITATION ==========

document.addEventListener('DOMContentLoaded', initApp);
setInterval(updateClock, 1000);
setInterval(checkSelectedDrawStatus, 30000);
setInterval(updateSyncStatus, 10000);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}
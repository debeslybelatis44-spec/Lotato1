async function initApp() {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('auth_token');
    const agentId = localStorage.getItem('agent_id');
    const agentName = localStorage.getItem('agent_name');

    if (!token || !agentId) {
        // Rediriger vers la page de connexion
        window.location.href = 'index.html';
        return;
    }

    // Mettre à jour APP_STATE avec les valeurs du localStorage
    APP_STATE.agentId = agentId;
    APP_STATE.agentName = agentName;

    await loadLotteryConfig();
    // Charger les tirages et les numéros bloqués depuis le serveur
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

    // ✅ Afficher le nom de l'agent connecté
    document.getElementById('agent-name').textContent = agentName;
    
    console.log("LOTATO PRO Ready - Authentification OK");
}

// Charger les tirages depuis le serveur
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
        // Fallback : utiliser CONFIG.DRAWS avec active = true par défaut
        APP_STATE.draws = CONFIG.DRAWS.map(d => ({ ...d, active: true }));
    }
}

// Charger les numéros bloqués (global et par tirage)
async function loadBlockedNumbers() {
    try {
        // Numéros globaux
        const globalRes = await fetch(`${API_CONFIG.BASE_URL}/blocked-numbers/global`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (globalRes.ok) {
            const globalData = await globalRes.json();
            APP_STATE.globalBlockedNumbers = globalData.blockedNumbers || [];
        } else {
            APP_STATE.globalBlockedNumbers = [];
        }

        // Pour chaque tirage, charger ses numéros bloqués
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

// ========== FONCTION DE DÉCONNEXION ==========
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

// ========== CODE POUR L'INSTALLATION PWA ==========
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    console.log('📦 Événement beforeinstallprompt capturé !');
    e.preventDefault();
    deferredPrompt = e;
    // Afficher le message après un délai (pour laisser la page se stabiliser)
    setTimeout(() => {
        console.log('📢 Tentative d\'affichage du message d\'installation');
        showInstallPromotion();
    }, 3000);
});

function showInstallPromotion() {
    // Éviter les doublons
    if (document.getElementById('install-message')) return;

    const installMessage = document.createElement('div');
    installMessage.id = 'install-message';
    installMessage.style.cssText = `
        position: fixed;
        bottom: 20px;
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
    `;

    installMessage.innerHTML = `
        <span style="font-size: 16px;">📱 Installe LOTATO PRO sur ton écran d'accueil !</span>
        <div style="display: flex; gap: 10px;">
            <button id="install-btn" style="background: #000; color: #fff; border: none; padding: 8px 20px; border-radius: 30px; font-weight: bold; cursor: pointer; font-size: 14px;">Installer</button>
            <span id="close-install" style="cursor:pointer; font-size: 22px; line-height: 1;">✕</span>
        </div>
    `;

    document.body.appendChild(installMessage);
    console.log('✅ Message d\'installation ajouté au DOM');

    document.getElementById('install-btn').addEventListener('click', async () => {
        if (!deferredPrompt) {
            console.log('⚠️ deferredPrompt est null, suppression du message');
            installMessage.remove();
            return;
        }
        console.log('🖱️ Clic sur Installer, déclenchement de prompt()');
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`📊 Résultat de l'installation : ${outcome}`);
        deferredPrompt = null;
        installMessage.remove();
    });

    document.getElementById('close-install').addEventListener('click', () => {
        console.log('❌ Message fermé par l\'utilisateur');
        installMessage.remove();
    });
}

window.addEventListener('appinstalled', () => {
    console.log('🎉 Application installée avec succès !');
    const msg = document.getElementById('install-message');
    if (msg) msg.remove();
});
// ========== FIN CODE PWA ==========

// Exécution conditionnelle : si on est sur la page agent (présence de #draws-container), on initialise l'interface
if (document.getElementById('draws-container')) {
    document.addEventListener('DOMContentLoaded', initApp);
    setInterval(updateClock, 1000);
    setInterval(checkSelectedDrawStatus, 30000);
    setInterval(updateSyncStatus, 10000);
}

// Enregistrement du service worker pour toutes les pages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}
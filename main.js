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
    // Demander confirmation (optionnel)
    if (!confirm('Èske ou sèten ou vle dekonekte?')) return;

    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            // Informer le serveur de la déconnexion (optionnel)
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

    // Nettoyer le stockage local
    localStorage.removeItem('auth_token');
    localStorage.removeItem('agent_id');
    localStorage.removeItem('agent_name');

    // Rediriger vers la page de connexion
    window.location.href = 'index.html';
}

// Rendre la fonction accessible depuis le HTML
window.logout = logout;

document.addEventListener('DOMContentLoaded', initApp);
setInterval(updateClock, 1000);
setInterval(checkSelectedDrawStatus, 30000);
setInterval(updateSyncStatus, 10000);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('PWA: Service Worker actif'))
        .catch(err => console.error('PWA: Erreur', err));
}
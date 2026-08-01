// apiService.js

// ==================== Identifiant d'appareil stable (indépendant du réseau) ====================
// Contrairement à une empreinte IP+navigateur (qui change à chaque bascule
// wifi/données mobiles), cet identifiant est généré une seule fois puis
// stocké sur le téléphone — il reste donc identique tant que l'app n'est
// pas désinstallée, quel que soit le réseau utilisé. À inclure dans le
// corps de la requête de login sous la clé "deviceId".
function getOrCreateDeviceId() {
    const KEY = 'app_device_id';
    let id = localStorage.getItem(KEY);
    if (!id) {
        id = 'dev-' + (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).slice(2)));
        localStorage.setItem(KEY, id);
    }
    return id;
}
window.getOrCreateDeviceId = getOrCreateDeviceId;

const APIService = {
    // Renvoie l'heure du SERVEUR (jamais celle de l'appareil), utilisée pour
    // que les rapports (aujourd'hui/hier/semaine) soient calculés de façon
    // fiable même si l'horloge du téléphone est mal réglée.
    async getServerTime() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/api/server-time`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            return data.serverDateTime ? new Date(data.serverDateTime) : new Date();
        } catch (error) {
            console.error('Erreur récupération heure serveur, repli sur horloge locale:', error);
            return new Date();
        }
    },

    // Rapport calculé par le SERVEUR (mises/gains/commission déjà agrégés,
    // par période et par tirage) — remplace le téléchargement de tout
    // l'historique des tickets pour juste afficher des totaux.
    async getAgentReports(filters = {}) {
        try {
            const token = localStorage.getItem('auth_token');
            const params = new URLSearchParams();
            if (filters.period) params.set('period', filters.period);
            if (filters.period === 'custom') {
                if (filters.fromDate) params.set('fromDate', filters.fromDate);
                if (filters.toDate) params.set('toDate', filters.toDate);
            }
            if (filters.drawId && filters.drawId !== 'all') params.set('drawId', filters.drawId);
            const response = await fetch(`${API_CONFIG.BASE_URL}/api/agent/reports?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            return await response.json();
        } catch (error) {
            console.error('Erreur récupération rapport agent:', error);
            return { summary: { total_tickets: 0, total_bets: 0, total_wins: 0, total_commission: 0, net_result: 0 }, detail: [] };
        }
    },

    async saveTicket(ticket) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    ...ticket,
                    agentId: APP_STATE.agentId,
                    agentName: APP_STATE.agentName,
                    date: new Date().toISOString()
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur sauvegarde ticket:', error);
            throw error;
        }
    },

    async getTickets() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}?agentId=${APP_STATE.agentId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            APP_STATE.ticketsHistory = data.tickets || [];
            return data;
        } catch (error) {
            console.error('Erreur récupération tickets:', error);
            return { tickets: [] };
        }
    },

    async getReports() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_REPORTS}?agentId=${APP_STATE.agentId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération rapports:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getDrawReport(drawId) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_DRAW_REPORT}?agentId=${APP_STATE.agentId}&drawId=${drawId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération rapport tirage:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getWinningTickets(period = 'all') {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNERS}?agentId=${APP_STATE.agentId}&period=${encodeURIComponent(period)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            APP_STATE.winningTickets = data.winners || [];
            return data;
        } catch (error) {
            console.error('Erreur récupération gagnants:', error);
            APP_STATE.winningTickets = [];
            return { winners: [] };
        }
    },

    async getWinningResults() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNING_RESULTS}?agentId=${APP_STATE.agentId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            APP_STATE.winningResults = data.results || [];
            return data;
        } catch (error) {
            console.error('Erreur récupération résultats gagnants:', error);
            APP_STATE.winningResults = [];
            return { results: [] };
        }
    },

    async deleteTicket(ticketId) {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DELETE_TICKET}/${ticketId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur: ${response.status} - ${errorText}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur suppression ticket:', error);
            throw error;
        }
    },

    // Nom, logo, adresse, téléphone du borlette : ça ne change presque
    // jamais, donc on le garde en cache sur le téléphone (localStorage) et
    // on ne redemande au serveur qu'une fois par jour, ou si le cache est
    // vide. Les autres appels (immédiats) répondent instantanément sans
    // réseau.
    async getLotteryConfig() {
        const CACHE_KEY = 'lottery_config_cache';
        const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
        try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (cached.data && (Date.now() - cached.savedAt) < CACHE_MAX_AGE_MS) {
                    return cached.data; // encore frais, pas besoin de réseau
                }
            }
        } catch (e) { /* cache corrompu, on ignore et on recharge */ }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LOTTERY_CONFIG}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({ data, savedAt: Date.now() }));
            } catch (e) { /* stockage plein ou indisponible, pas grave */ }
            return data;
        } catch (error) {
            console.error('Erreur récupération configuration:', error);
            // En cas d'échec réseau, on retombe sur un cache même périmé
            // plutôt que de ne rien afficher du tout.
            try {
                const cachedRaw = localStorage.getItem(CACHE_KEY);
                if (cachedRaw) {
                    const cached = JSON.parse(cachedRaw);
                    if (cached.data) return cached.data;
                }
            } catch (e) { /* rien à faire */ }
            return null;
        }
    },

    async checkWinningTickets() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CHECK_WINNING_TICKETS}?agentId=${APP_STATE.agentId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur vérification tickets gagnants:', error);
            throw error;
        }
    },

    // Nouvelle méthode pour récupérer les limites de mise
    async getNumberLimits() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LIMITS}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!response.ok) throw new Error('Erreur réseau');
            const data = await response.json();
            return data; // tableau d'objets { draw_id, number, limit_amount }
        } catch (error) {
            console.error('Erreur récupération limites:', error);
            return [];
        }
    }
};
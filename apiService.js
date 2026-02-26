const APIService = {
    async saveTicket(ticket) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}?agentId=${APP_STATE.agentId}`);
            
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
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_REPORTS}?agentId=${APP_STATE.agentId}`);
            
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
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_DRAW_REPORT}?agentId=${APP_STATE.agentId}&drawId=${drawId}`);
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération rapport tirage:', error);
            return { totalTickets: 0, totalBets: 0, totalWins: 0, totalLoss: 0, balance: 0 };
        }
    },

    async getWinningTickets() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNERS}?agentId=${APP_STATE.agentId}`, {
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
            APP_STATE.winningTickets = [];   // ← ajout pour éviter undefined
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
            APP_STATE.winningResults = [];   // ← ajout
            return { results: [] };
        }
    },

    async deleteTicket(ticketId) {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.DELETE_TICKET}/${ticketId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
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

    async getLotteryConfig() {
        try {
            const token = localStorage.getItem('auth_token');   // ← CORRECTION : ajout du token
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LOTTERY_CONFIG}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) throw new Error('Erreur réseau');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Erreur récupération configuration:', error);
            return null;
        }
    },

    async checkWinningTickets() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CHECK_WINNING_TICKETS}?agentId=${APP_STATE.agentId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
    }
};
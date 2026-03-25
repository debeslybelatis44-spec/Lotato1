// resultsManager.js - Version avec commission sélectionnable par l'agent (10% à 20%)
// Les tickets sont analysés sur les 15 derniers jours pour déterminer les ventes.
// Le taux de commission est choisi manuellement via un menu déroulant.
// Sauvegarde locale (localStorage) en cas d'échec de l'API.
(function() {
    if (window.resultsManagerReady) return;
    window.resultsManagerReady = true;

    let currentFilter = 'all';
    const COMMISSION_DAYS = 15; // Période de calcul des ventes

    // ==================== Création de l'UI si absente ====================
    function createResultsUI() {
        const main = document.querySelector('.content-area');
        if (!main) {
            console.error('Élément .content-area introuvable');
            return;
        }

        // Écran des résultats
        if (!document.getElementById('results-screen')) {
            const screen = document.createElement('section');
            screen.id = 'results-screen';
            screen.className = 'screen';
            screen.innerHTML = `
                <div style="padding: 20px;">
                    <h2 class="section-title">Résultats des tirages</h2>
                    <div class="results-filter">
                        <button class="chip active" data-filter="all">Tous</button>
                        <button class="chip" data-filter="today">Aujourd'hui</button>
                        <button class="chip" data-filter="yesterday">Hier</button>
                        <button class="chip" data-filter="week">7 derniers jours</button>
                    </div>
                    <div id="results-container" class="results-list">Chargement...</div>
                </div>
            `;
            main.appendChild(screen);
        }

        // Écran des agents
        if (!document.getElementById('agents-screen')) {
            const agentsScreen = document.createElement('section');
            agentsScreen.id = 'agents-screen';
            agentsScreen.className = 'screen';
            agentsScreen.innerHTML = `
                <div style="padding: 20px;">
                    <h2 class="section-title">Balans Ajan ak Komisyon (dènye ${COMMISSION_DAYS} jou)</h2>
                    <div class="agents-actions" style="margin-bottom: 15px; text-align: right;">
                        <button id="refresh-agents-btn" class="filter-btn" style="padding: 8px 16px;">
                            <i class="fas fa-sync-alt"></i> Rafraîchir
                        </button>
                    </div>
                    <div id="agents-container" class="agents-list">Chajman...</div>
                </div>
            `;
            main.appendChild(agentsScreen);
        }

        // Onglet Résultats
        const nav = document.querySelector('.nav-bar');
        if (nav && !document.querySelector('.nav-item[data-tab="results"]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item';
            tab.setAttribute('data-tab', 'results');
            tab.innerHTML = '<i class="fas fa-calendar-alt"></i><span>Résultats</span>';
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.getElementById('results-screen').classList.add('active');
                this.classList.add('active');
                fetchResults(currentFilter);
            });
            nav.appendChild(tab);
        }

        // Onglet Agents
        if (nav && !document.querySelector('.nav-item[data-tab="agents"]')) {
            const agentsTab = document.createElement('a');
            agentsTab.href = '#';
            agentsTab.className = 'nav-item';
            agentsTab.setAttribute('data-tab', 'agents');
            agentsTab.innerHTML = '<i class="fas fa-users"></i><span>Agents</span>';
            agentsTab.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.getElementById('agents-screen').classList.add('active');
                this.classList.add('active');
                loadAgentsBalance();
            });
            nav.appendChild(agentsTab);
        }

        // Ajout des styles (avec scroll horizontal adapté)
        if (!document.getElementById('results-styles')) {
            const style = document.createElement('style');
            style.id = 'results-styles';
            style.textContent = `
                .results-filter { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                .results-list { display: flex; flex-direction: column; gap: 20px; padding-bottom: 80px; }
                .result-day-group { background: var(--surface); border-radius: 20px; padding: 15px; border: 1px solid var(--glass-border); }
                .result-day-group h3 { margin-bottom: 15px; color: var(--secondary); font-size: 1.2rem; }
                .result-draw-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.1); }
                .result-draw-row:last-child { border-bottom: none; }
                .draw-info { display: flex; flex-direction: column; }
                .draw-name { font-weight: 600; font-size: 1rem; }
                .draw-time { font-size: 0.8rem; color: var(--text-dim); }
                .result-numbers { font-family: 'Courier New', monospace; font-weight: bold; font-size: 1.2rem; background: rgba(0,212,255,0.1); padding: 6px 12px; border-radius: 20px; color: var(--secondary); }
                .no-result { color: var(--text-dim); font-style: italic; text-align: center; padding: 20px; }

                /* Styles pour l'affichage des agents avec scroll horizontal */
                .agents-list {
                    padding-bottom: 80px;
                    overflow-x: auto;
                    width: 100%;
                }
                .agents-table {
                    width: 100%;
                    min-width: 1000px;
                    border-collapse: collapse;
                    background: var(--surface);
                    border-radius: 16px;
                    overflow: hidden;
                }
                .agents-table th, .agents-table td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid var(--glass-border);
                }
                .agents-table th {
                    background: var(--primary);
                    color: white;
                }
                .profit { color: var(--success); font-weight: bold; }
                .loss { color: var(--danger); font-weight: bold; }
                .recevoir { color: var(--danger); font-weight: bold; }
                .remettre { color: var(--success); font-weight: bold; }
                .commission-rate-select {
                    padding: 6px 10px;
                    border-radius: 8px;
                    background: var(--surface);
                    color: var(--text);
                    border: 1px solid var(--glass-border);
                    cursor: pointer;
                }
                .commission-amount {
                    font-weight: bold;
                    color: var(--secondary);
                }
            `;
            document.head.appendChild(style);
        }

        // Bouton de rafraîchissement
        const refreshBtn = document.getElementById('refresh-agents-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadAgentsBalance());
        }
    }

    // ==================== Appel API résultats ====================
    async function fetchResults(filter = 'all') {
        const container = document.getElementById('results-container');
        if (!container) return;
        container.innerHTML = '<div class="no-result">Chargement...</div>';

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                container.innerHTML = '<div class="no-result">Vous devez être connecté.</div>';
                return;
            }

            const res = await fetch('/api/winners/results', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                if (res.status === 401) {
                    container.innerHTML = '<div class="no-result">Session expirée, veuillez vous reconnecter.</div>';
                } else {
                    throw new Error(`Erreur HTTP ${res.status}`);
                }
                return;
            }

            const data = await res.json();
            window.APP_STATE = window.APP_STATE || {};
            window.APP_STATE.winningResults = data.results || [];

            currentFilter = filter;
            renderResults(filter);
        } catch (error) {
            console.error('Erreur lors du chargement des résultats:', error);
            container.innerHTML = '<div class="no-result">Impossible de charger les résultats.</div>';
        }
    }

    // ==================== Affichage résultats ====================
    function renderResults(filter) {
        const container = document.getElementById('results-container');
        if (!container) return;

        const results = window.APP_STATE?.winningResults || [];
        if (results.length === 0) {
            container.innerHTML = '<div class="no-result">Aucun résultat publié pour le moment.</div>';
            return;
        }

        const now = new Date();
        const todayStr = now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);

        let filtered = results;
        if (filter === 'today') {
            filtered = results.filter(r => new Date(r.published_at).toDateString() === todayStr);
        } else if (filter === 'yesterday') {
            filtered = results.filter(r => new Date(r.published_at).toDateString() === yesterdayStr);
        } else if (filter === 'week') {
            filtered = results.filter(r => new Date(r.published_at) >= weekAgo);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="no-result">Aucun résultat pour cette période.</div>';
            return;
        }

        const grouped = {};
        filtered.forEach(r => {
            const day = new Date(r.published_at).toLocaleDateString('fr-FR', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(r);
        });

        const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        let html = '';
        sortedDays.forEach(day => {
            html += `<div class="result-day-group"><h3>${day}</h3>`;
            grouped[day].forEach(r => {
                const time = new Date(r.published_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit', minute: '2-digit'
                });

                let numbersDisplay = '—';
                if (r.lotto3) {
                    numbersDisplay = `${r.lotto3}  |  ${r.numbers[1]}  |  ${r.numbers[2]}`;
                } else if (r.numbers) {
                    numbersDisplay = Array.isArray(r.numbers) ? r.numbers.join(' - ') : r.numbers;
                }

                html += `
                    <div class="result-draw-row">
                        <div class="draw-info">
                            <span class="draw-name">${r.name || 'Tirage'}</span>
                            <span class="draw-time">${time}</span>
                        </div>
                        <span class="result-numbers">${numbersDisplay}</span>
                    </div>
                `;
            });
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ==================== Gestion locale des taux de commission ====================
    const LOCAL_STORAGE_KEY = 'agent_commission_rates';

    function getLocalCommissionRates() {
        try {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            return stored ? new Map(Object.entries(JSON.parse(stored))) : new Map();
        } catch (e) {
            return new Map();
        }
    }

    function saveLocalCommissionRate(agentId, rate) {
        const map = getLocalCommissionRates();
        map.set(agentId.toString(), rate);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
    }

    // ==================== Récupération des taux de commission (API + fallback) ====================
    async function fetchAgentsCommission() {
        const token = localStorage.getItem('auth_token');
        if (!token) return getLocalCommissionRates();

        try {
            const res = await fetch('/api/agents', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const agents = await res.json();
                const apiMap = new Map();
                agents.forEach(agent => {
                    apiMap.set(agent.id.toString(), agent.commission_rate || 10);
                });
                // Fusion avec les taux locaux (ceux-ci prévalent)
                const localMap = getLocalCommissionRates();
                for (let [id, rate] of localMap) {
                    apiMap.set(id, rate);
                }
                return apiMap;
            } else {
                console.warn('API agents inaccessible, utilisation des taux locaux');
                return getLocalCommissionRates();
            }
        } catch (error) {
            console.error('Erreur chargement taux commission depuis API:', error);
            return getLocalCommissionRates();
        }
    }

    // ==================== Balance des agents avec commission sélectionnable ====================
    async function loadAgentsBalance() {
        const container = document.getElementById('agents-container');
        if (!container) return;
        container.innerHTML = '<div class="no-result">Chajman...</div>';

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) throw new Error('Non authentifié');

            // Récupération des tickets
            const response = await fetch('/api/tickets', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
            const data = await response.json();
            const tickets = data.tickets || [];

            // Récupération des taux de commission (API + local)
            const agentsCommissionMap = await fetchAgentsCommission();

            // Calcul des ventes et gains par agent
            const agentsMap = new Map();
            const now = new Date();
            const startDate = new Date(now);
            startDate.setDate(now.getDate() - COMMISSION_DAYS);
            startDate.setHours(0, 0, 0, 0);

            tickets.forEach(ticket => {
                const agentId = ticket.agent_id || ticket.agentId;
                if (!agentId) return;

                if (!agentsMap.has(agentId)) {
                    agentsMap.set(agentId, {
                        agentId,
                        agentName: ticket.agent_name || ticket.agentName || 'Anonim',
                        totalVentes: 0,
                        totalGainsPayes: 0,
                        ventes15j: 0
                    });
                }
                const agent = agentsMap.get(agentId);

                const montant = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
                agent.totalVentes += montant;

                let ticketDate = null;
                if (ticket.created_at) ticketDate = new Date(ticket.created_at);
                else if (ticket.date) ticketDate = new Date(ticket.date);
                if (ticketDate && ticketDate >= startDate) {
                    agent.ventes15j += montant;
                }

                const estGagnant = (ticket.checked || ticket.verified) && parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0) > 0;
                const estPaye = ticket.paid === true;
                if (estGagnant && estPaye) {
                    const gain = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                    agent.totalGainsPayes += gain;
                }
            });

            if (agentsMap.size === 0) {
                container.innerHTML = '<div class="no-result">Pa gen done sou ajan.</div>';
                return;
            }

            // Construction du tableau avec select pour le taux
            let html = `<table class="agents-table">
                <thead>
                    <tr>
                        <th>Ajan</th>
                        <th>Vant Total (Gdes)</th>
                        <th>Vant ${COMMISSION_DAYS}j (Gdes)</th>
                        <th>Komisyon %</th>
                        <th>Komisyon (Gdes)</th>
                        <th>Ganyen Peye (Gdes)</th>
                        <th>Balans (Gdes)</th>
                        <th>Montan à Recevoir</th>
                        <th>Montan à Remèt</th>
                        <th>Eta</th>
                    </tr>
                </thead>
                <tbody>`;

            for (const [, agent] of agentsMap) {
                const balance = agent.totalVentes - agent.totalGainsPayes;
                let montantRecevoir = 0;
                let montantRemettre = 0;
                let etat = 'Neut';

                if (balance < 0) {
                    montantRecevoir = Math.abs(balance);
                    etat = 'Pèt (Mèt kay dwe bay ajan)';
                } else if (balance > 0) {
                    montantRemettre = balance;
                    etat = 'Benefis (Ajan dwe remèt)';
                } else {
                    etat = 'Ekilibr';
                }

                const balanceClass = balance >= 0 ? 'profit' : 'loss';
                const currentRate = agentsCommissionMap.get(agent.agentId.toString()) || 10;
                const commissionAmount = agent.ventes15j * (currentRate / 100);

                // Génération du select (10 à 20)
                let selectHtml = `<select class="commission-rate-select" data-agent-id="${agent.agentId}">`;
                for (let rate = 10; rate <= 20; rate++) {
                    selectHtml += `<option value="${rate}" ${currentRate === rate ? 'selected' : ''}>${rate}%</option>`;
                }
                selectHtml += `</select>`;

                html += `
                    <tr data-agent-id="${agent.agentId}">
                        <td>${escapeHtml(agent.agentName)} (ID: ${agent.agentId})</td>
                        <td>${agent.totalVentes.toLocaleString('fr-FR')}</td>
                        <td class="ventes-15j">${agent.ventes15j.toLocaleString('fr-FR')}</td>
                        <td>${selectHtml}</td>
                        <td class="commission-amount">${commissionAmount.toLocaleString('fr-FR')}</td>
                        <td>${agent.totalGainsPayes.toLocaleString('fr-FR')}</td>
                        <td class="${balanceClass}">${balance.toLocaleString('fr-FR')}</td>
                        <td class="recevoir">${montantRecevoir > 0 ? montantRecevoir.toLocaleString('fr-FR') + ' Gdes' : '—'}</td>
                        <td class="remettre">${montantRemettre > 0 ? montantRemettre.toLocaleString('fr-FR') + ' Gdes' : '—'}</td>
                        <td>${etat}</td>
                    </tr>
                `;
            }
            html += `</tbody></table>`;
            container.innerHTML = html;

            // Attacher les événements de changement de taux
            attachCommissionSelectListeners();

        } catch (error) {
            console.error('Erreur chargement balance agents:', error);
            container.innerHTML = '<div class="no-result">Erè chajman done ajan.</div>';
        }
    }

    // ==================== Gestion du changement de taux de commission ====================
    function attachCommissionSelectListeners() {
        document.querySelectorAll('.commission-rate-select').forEach(select => {
            select.removeEventListener('change', handleCommissionChange);
            select.addEventListener('change', handleCommissionChange);
        });
    }

    async function handleCommissionChange(event) {
        const select = event.target;
        const agentId = select.dataset.agentId;
        const newRate = parseInt(select.value, 10);
        const row = select.closest('tr');
        if (!row) return;

        // Récupérer le montant des ventes sur 15 jours
        const ventes15jCell = row.querySelector('.ventes-15j');
        if (!ventes15jCell) return;
        const ventes15j = parseFloat(ventes15jCell.textContent.replace(/\s/g, '').replace(',', '.'));

        // Calculer et mettre à jour le montant de la commission
        const commissionAmountCell = row.querySelector('.commission-amount');
        if (commissionAmountCell) {
            const newCommission = ventes15j * (newRate / 100);
            commissionAmountCell.textContent = newCommission.toLocaleString('fr-FR');
        }

        // Sauvegarder le nouveau taux
        const token = localStorage.getItem('auth_token');
        let saved = false;

        if (token) {
            try {
                const res = await fetch(`/api/agents/${agentId}/commission`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ commission_rate: newRate })
                });
                if (res.ok) {
                    saved = true;
                    // Nettoyer l'éventuelle entrée locale pour cet agent
                    const localMap = getLocalCommissionRates();
                    if (localMap.has(agentId)) {
                        localMap.delete(agentId);
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Object.fromEntries(localMap)));
                    }
                    showTemporaryMessage('Taux de commission mis à jour', 'success');
                } else {
                    console.warn(`Sauvegarde API échouée (${res.status}), utilisation du stockage local`);
                }
            } catch (error) {
                console.error('Erreur réseau lors de la sauvegarde:', error);
            }
        }

        if (!saved) {
            // Fallback : stockage local
            saveLocalCommissionRate(agentId, newRate);
            showTemporaryMessage('Taux enregistré localement (serveur indisponible)', 'warning');
        }
    }

    // Petit utilitaire pour afficher un message temporaire
    function showTemporaryMessage(message, type = 'info') {
        const msgDiv = document.createElement('div');
        msgDiv.textContent = message;
        msgDiv.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4caf50' : (type === 'warning' ? '#ff9800' : '#2196f3')};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1000;
            opacity: 0.9;
            transition: opacity 0.5s;
        `;
        document.body.appendChild(msgDiv);
        setTimeout(() => {
            msgDiv.style.opacity = '0';
            setTimeout(() => msgDiv.remove(), 500);
        }, 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // Exposer la fonction de rafraîchissement globalement
    window.refreshAgentsBalance = loadAgentsBalance;

    // ==================== Initialisation ====================
    function init() {
        createResultsUI();

        const filterContainer = document.querySelector('.results-filter');
        if (filterContainer) {
            filterContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.chip');
                if (!btn) return;
                const filter = btn.dataset.filter;
                if (!filter) return;

                document.querySelectorAll('.results-filter .chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                fetchResults(filter);
            });
        }

        fetchResults('all');
        // Les agents seront chargés lors du clic sur l'onglet Agents
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
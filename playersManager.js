// playersManager.js - Gestion des joueurs pour le propriétaire (avec résumé par agent)
(function() {
    if (window.playersManagerReady) return;
    window.playersManagerReady = true;

    // ==================== Création de l'UI ====================
    function createPlayersUI() {
        if (document.getElementById('players-management')) return;

        const ownerTabs = document.querySelector('.tabs');
        if (!ownerTabs) return;

        if (!document.querySelector('.tab[onclick*="players"]')) {
            const playersTab = document.createElement('div');
            playersTab.className = 'tab';
            playersTab.setAttribute('onclick', 'switchTab(\'players\')');
            playersTab.innerHTML = '👥 Joueurs';
            ownerTabs.appendChild(playersTab);
        }

        const tabsContainer = document.querySelector('.tabs').parentNode;
        let playersContent = document.getElementById('tab-players');
        if (!playersContent) {
            playersContent = document.createElement('div');
            playersContent.id = 'tab-players';
            playersContent.className = 'tab-content';
            playersContent.innerHTML = `
                <div class="section-title"><i class="fas fa-users"></i> Gestion des joueurs</div>
                <div class="stats-grid" id="player-stats">
                    <div class="stat-card"><div id="stat-total-players">0</div><div>Total joueurs</div></div>
                    <div class="stat-card"><div id="stat-total-balance">0 G</div><div>Solde total</div></div>
                    <div class="stat-card"><div id="stat-total-bets">0 G</div><div>Mises totales (joueurs)</div></div>
                    <div class="stat-card"><div id="stat-total-wins">0 G</div><div>Gains totaux (joueurs)</div></div>
                    <div class="stat-card"><div id="stat-net-result">0 G</div><div>Résultat net (joueurs)</div></div>
                </div>
                <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                    <input type="text" id="player-search" placeholder="Rechercher par nom, téléphone..." style="flex:1; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:#fff;">
                    <button id="search-players-btn" class="btn-primary">Rechercher</button>
                    <button id="add-player-btn" class="btn-primary">+ Nouveau joueur</button>
                </div>
                <div class="list-container" id="players-list-container"><p>Chargement...</p></div>

                <div id="player-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; justify-content:center; align-items:center;">
                    <div style="background:#1e1f36; border-radius:20px; padding:25px; max-width:500px; width:90%;">
                        <h3 id="modal-title">Ajouter un joueur</h3>
                        <input type="hidden" id="player-id">
                        <div class="form-group"><label>Nom complet</label><input type="text" id="player-name" class="form-control"></div>
                        <div class="form-group"><label>Téléphone</label><input type="tel" id="player-phone" class="form-control"></div>
                        <div class="form-group"><label>Zone</label><input type="text" id="player-zone" class="form-control"></div>
                        <div class="form-group"><label>Mot de passe</label><input type="password" id="player-password" class="form-control" placeholder="Laisser vide pour ne pas changer"></div>
                        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                            <button id="modal-cancel" class="btn-secondary">Annuler</button>
                            <button id="modal-save" class="btn-primary">Enregistrer</button>
                        </div>
                    </div>
                </div>

                <div id="player-details-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:1000; justify-content:center; align-items:center;">
                    <div style="background:#1e1f36; border-radius:20px; padding:25px; max-width:900px; width:90%; max-height:80%; overflow-y:auto;">
                        <h3 id="details-title">Détails du joueur</h3>
                        <div id="player-details-content"></div>
                        <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                            <button id="details-close" class="btn-secondary">Fermer</button>
                        </div>
                    </div>
                </div>
            `;
            tabsContainer.appendChild(playersContent);
        }

        if (!document.getElementById('players-manager-styles')) {
            const style = document.createElement('style');
            style.id = 'players-manager-styles';
            style.textContent = `
                .players-table { width:100%; border-collapse:collapse; }
                .players-table th, .players-table td { padding:12px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); }
                .players-table th { background:rgba(255,255,255,0.05); }
                .player-actions { display:flex; gap:8px; }
                .player-actions button { background:none; border:none; color:var(--text-dim); cursor:pointer; font-size:1rem; }
                .player-actions button:hover { color:var(--secondary); }
                .form-control { width:100%; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; margin-top:5px; }
                .btn-secondary { background:rgba(255,255,255,0.1); border:none; padding:8px 16px; border-radius:20px; color:#fff; cursor:pointer; }
                .message-input { width:100%; padding:10px; margin-top:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; }
                .send-msg-btn { margin-top:5px; background:var(--primary); border:none; padding:5px 10px; border-radius:20px; cursor:pointer; }
                .transaction-item { display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1); }
                .transaction-positive { color:#00f190; }
                .transaction-negative { color:#ff4d4d; }
            `;
            document.head.appendChild(style);
        }

        document.getElementById('search-players-btn')?.addEventListener('click', () => loadPlayers());
        document.getElementById('player-search')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') loadPlayers(); });
        document.getElementById('add-player-btn')?.addEventListener('click', () => openPlayerModal());
        document.getElementById('modal-cancel')?.addEventListener('click', () => closePlayerModal());
        document.getElementById('modal-save')?.addEventListener('click', () => savePlayer());
        document.getElementById('details-close')?.addEventListener('click', () => closeDetailsModal());
    }

    // ==================== API Calls ====================
    async function apiCall(endpoint, options = {}) {
        const token = localStorage.getItem('auth_token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };
        const response = await fetch(endpoint, { ...options, headers });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Erreur ${response.status}`);
        }
        return response.json();
    }

    // ==================== Chargement liste joueurs ====================
    async function loadPlayers() {
        const search = document.getElementById('player-search').value;
        const container = document.getElementById('players-list-container');
        container.innerHTML = '<p>Chargement...</p>';
        try {
            const data = await apiCall(`/api/owner/players?search=${encodeURIComponent(search)}`);
            const players = data.players || [];
            if (players.length === 0) {
                container.innerHTML = '<p>Aucun joueur trouvé.</p>';
                return;
            }
            const totalBalance = players.reduce((s, p) => s + (p.balance || 0), 0);
            document.getElementById('stat-total-players').innerText = players.length;
            document.getElementById('stat-total-balance').innerHTML = totalBalance.toLocaleString() + ' G';

            let globalStats = { totalBets: 0, totalWins: 0 };
            try {
                const res = await apiCall('/api/owner/player-stats');
                globalStats = {
                    totalBets: res.totalBets || 0,
                    totalWins: res.totalWins || 0
                };
            } catch(e) {}
            document.getElementById('stat-total-bets').innerHTML = (globalStats.totalBets || 0).toLocaleString() + ' G';
            document.getElementById('stat-total-wins').innerHTML = (globalStats.totalWins || 0).toLocaleString() + ' G';
            const netResult = (globalStats.totalBets || 0) - (globalStats.totalWins || 0);
            document.getElementById('stat-net-result').innerHTML = netResult.toLocaleString() + ' G';
            document.getElementById('stat-net-result').style.color = netResult >= 0 ? '#00f190' : '#ff4d4d';

            let html = '<div class="table-responsive"><table class="players-table"><thead><tr><th>Nom</th><th>Téléphone</th><th>Zone</th><th>Solde</th><th>Mises totales</th><th>Gains totaux</th><th>Résultat</th><th>Actions</th></tr></thead><tbody>';
            for (const p of players) {
                let playerStats = { totalBets: 0, totalWins: 0 };
                try {
                    const pstats = await apiCall(`/api/owner/player-stats/${p.id}`);
                    playerStats = {
                        totalBets: pstats.totalBets || 0,
                        totalWins: pstats.totalWins || 0
                    };
                } catch(e) {}
                const net = (playerStats.totalBets || 0) - (playerStats.totalWins || 0);
                html += `
                    <tr>
                        <td>${escapeHtml(p.name)}</td>
                        <td>${escapeHtml(p.phone)}</td>
                        <td>${escapeHtml(p.zone || '-')}</td>
                        <td class="${p.balance > 0 ? 'profit' : ''}">${(p.balance || 0).toLocaleString()} G</td>
                        <td>${(playerStats.totalBets || 0).toLocaleString()} G</td>
                        <td>${(playerStats.totalWins || 0).toLocaleString()} G</td>
                        <td class="${net >= 0 ? 'profit' : 'loss'}">${net.toLocaleString()} G</td>
                        <td class="player-actions">
                            <button onclick="viewPlayerDetails(${p.id})" title="Voir détails"><i class="fas fa-eye"></i></button>
                            <button onclick="editPlayer(${p.id})" title="Modifier"><i class="fas fa-edit"></i></button>
                            <button onclick="deletePlayer(${p.id})" title="Supprimer"><i class="fas fa-trash"></i></button>
                            <button onclick="sendMessageToPlayer(${p.id})" title="Envoyer message"><i class="fas fa-envelope"></i></button>
                        </td>
                    </tr>
                `;
            }
            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch (err) {
            console.error(err);
            container.innerHTML = `<p class="loss">❌ Erreur : ${err.message}</p>`;
        }
    }

    // ==================== Modal joueur ====================
    let currentPlayerId = null;
    function openPlayerModal(playerId = null) {
        currentPlayerId = playerId;
        const modal = document.getElementById('player-modal');
        const title = document.getElementById('modal-title');
        if (playerId) {
            title.innerText = 'Modifier le joueur';
            apiCall(`/api/owner/players/${playerId}`).then(player => {
                document.getElementById('player-id').value = player.id;
                document.getElementById('player-name').value = player.name;
                document.getElementById('player-phone').value = player.phone;
                document.getElementById('player-zone').value = player.zone || '';
                document.getElementById('player-password').value = '';
            }).catch(err => alert('Erreur chargement joueur : ' + err.message));
        } else {
            title.innerText = 'Ajouter un joueur';
            document.getElementById('player-id').value = '';
            document.getElementById('player-name').value = '';
            document.getElementById('player-phone').value = '';
            document.getElementById('player-zone').value = '';
            document.getElementById('player-password').value = '';
        }
        modal.style.display = 'flex';
    }
    function closePlayerModal() {
        document.getElementById('player-modal').style.display = 'none';
        currentPlayerId = null;
    }
    async function savePlayer() {
        const id = document.getElementById('player-id').value;
        const name = document.getElementById('player-name').value;
        const phone = document.getElementById('player-phone').value;
        const zone = document.getElementById('player-zone').value;
        const password = document.getElementById('player-password').value;
        if (!name || !phone) {
            alert('Nom et téléphone requis');
            return;
        }
        try {
            if (id) {
                await apiCall(`/api/owner/players/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, phone, zone, password: password || undefined })
                });
                alert('Joueur modifié avec succès');
            } else {
                await apiCall('/api/owner/create-player', {
                    method: 'POST',
                    body: JSON.stringify({ name, phone, password, zone })
                });
                alert('Joueur ajouté avec succès');
            }
            closePlayerModal();
            loadPlayers();
        } catch (err) {
            alert('Erreur : ' + err.message);
        }
    }
    async function deletePlayer(playerId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce joueur ?')) return;
        try {
            await apiCall(`/api/owner/players/${playerId}`, { method: 'DELETE' });
            alert('Joueur supprimé');
            loadPlayers();
        } catch (err) {
            alert('Erreur : ' + err.message);
        }
    }

    // ==================== Détails du joueur ====================
    async function viewPlayerDetails(playerId) {
        const modal = document.getElementById('player-details-modal');
        const contentDiv = document.getElementById('player-details-content');
        const titleSpan = document.getElementById('details-title');
        try {
            const player = await apiCall(`/api/owner/players/${playerId}`);
            titleSpan.innerText = `Détails de ${player.name}`;

            // Tickets
            const tickets = await apiCall(`/api/owner/player-tickets/${playerId}`);
            let ticketsHtml = '<h4>Historique des tickets</h4><div class="table-responsive"><table class="players-table"><thead><tr><th>Ticket</th><th>Tirage</th><th>Mise</th><th>Gain</th><th>Payé</th><th>Date</th></tr></thead><tbody>';
            if (tickets.tickets && tickets.tickets.length > 0) {
                tickets.tickets.forEach(t => {
                    ticketsHtml += `<tr>
                        <td>${escapeHtml(t.ticket_id)}</td>
                        <td>${escapeHtml(t.draw_name)}</td>
                        <td>${(t.total_amount || 0).toLocaleString()} G</td>
                        <td class="${t.win_amount > 0 ? 'profit' : ''}">${t.win_amount > 0 ? '+' + (t.win_amount || 0).toLocaleString() + ' G' : '-'}</td>
                        <td>${t.paid ? 'Payé' : 'Non payé'}</td>
                        <td>${new Date(t.date).toLocaleString()}</td>
                    </tr>`;
                });
            } else {
                ticketsHtml += '<tr><td colspan="6">Aucun ticket</td></tr>';
            }
            ticketsHtml += '</tbody></table></div>';

            // Résumé par agent (dépôts/retraits)
            let agentSummaryHtml = '<h4>Récapitulatif par agent (dépôts/retraits)</h4>';
            try {
                const summary = await apiCall(`/api/owner/player-agent-summary/${playerId}`);
                if (summary && summary.length > 0) {
                    agentSummaryHtml += '<div class="table-responsive"><table class="players-table"><thead><tr><th>Agent</th><th>Total dépôts</th><th>Total retraits</th><th>Net (dû au propriétaire)</th></tr></thead><tbody>';
                    summary.forEach(agent => {
                        const netClass = agent.net >= 0 ? 'profit' : 'loss';
                        agentSummaryHtml += `<tr>
                            <td>${escapeHtml(agent.agent_name || 'Agent inconnu')}</td>
                            <td>${parseFloat(agent.total_deposits).toLocaleString()} G</td>
                            <td>${parseFloat(agent.total_withdraws).toLocaleString()} G</td>
                            <td class="${netClass}">${parseFloat(agent.net).toLocaleString()} G</td>
                        </tr>`;
                    });
                    agentSummaryHtml += '</tbody></table></div>';
                } else {
                    agentSummaryHtml += '<p>Aucune transaction avec agent.</p>';
                }
            } catch(e) {
                agentSummaryHtml += '<p>Erreur chargement résumé par agent.</p>';
            }

            // Transactions (détail)
            let transactionsHtml = '<h4>Transactions (dépôts, retraits, paris, gains)</h4><div class="table-responsive"><table class="players-table"><thead><tr><th>Type</th><th>Montant</th><th>Méthode</th><th>Description</th><th>Date</th></tr></thead><tbody>';
            try {
                const transData = await apiCall(`/api/owner/player-transactions/${playerId}`);
                const transactions = transData.transactions || [];
                if (transactions.length > 0) {
                    transactions.forEach(t => {
                        let amountClass = (t.type === 'deposit' || t.type === 'win') ? 'profit' : 'loss';
                        let sign = (t.type === 'deposit' || t.type === 'win') ? '+' : '-';
                        transactionsHtml += `<tr>
                            <td>${t.type}</td>
                            <td class="${amountClass}">${sign} ${(t.amount || 0).toLocaleString()} G</td>
                            <td>${t.method || '-'}</td>
                            <td>${escapeHtml(t.description || '')}</td>
                            <td>${new Date(t.created_at).toLocaleString()}</td>
                        </tr>`;
                    });
                } else {
                    transactionsHtml += '<tr><td colspan="5">Aucune transaction</td></tr>';
                }
            } catch(e) {
                transactionsHtml += '<tr><td colspan="5">Erreur chargement des transactions</td></tr>';
            }
            transactionsHtml += '</tbody></table></div>';

            // Messages
            const messages = await apiCall(`/api/owner/player-messages/${playerId}`).catch(() => ({ messages: [] }));
            let messagesHtml = '<h4>Messages envoyés</h4><ul>';
            if (messages.messages && messages.messages.length > 0) {
                messages.messages.forEach(m => {
                    messagesHtml += `<li>${new Date(m.created_at).toLocaleString()} : ${escapeHtml(m.message)}</li>`;
                });
            } else {
                messagesHtml += '<li>Aucun message</li>';
            }
            messagesHtml += '</ul>';

            messagesHtml += `
                <h4>Envoyer un message</h4>
                <textarea id="msg-text" class="message-input" rows="2" placeholder="Votre message..."></textarea>
                <button onclick="sendMessageToPlayer(${playerId})" class="send-msg-btn">Envoyer</button>
            `;

            contentDiv.innerHTML = ticketsHtml + agentSummaryHtml + transactionsHtml + messagesHtml;
            modal.style.display = 'flex';
        } catch (err) {
            alert('Erreur chargement détails : ' + err.message);
        }
    }

    function closeDetailsModal() {
        document.getElementById('player-details-modal').style.display = 'none';
    }

    async function sendMessageToPlayer(playerId, messageText = null) {
        let message = messageText;
        if (!message) {
            message = document.getElementById('msg-text')?.value;
            if (!message) {
                alert('Veuillez saisir un message');
                return;
            }
        }
        try {
            await apiCall('/api/owner/send-player-message', {
                method: 'POST',
                body: JSON.stringify({ playerId, message })
            });
            alert('Message envoyé');
            if (document.getElementById('player-details-modal').style.display === 'flex') {
                viewPlayerDetails(playerId);
            } else {
                document.getElementById('msg-text').value = '';
            }
        } catch (err) {
            alert('Erreur envoi : ' + err.message);
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    window.viewPlayerDetails = viewPlayerDetails;
    window.editPlayer = (id) => openPlayerModal(id);
    window.deletePlayer = deletePlayer;
    window.sendMessageToPlayer = sendMessageToPlayer;

    function init() {
        createPlayersUI();
        const originalSwitchTab = window.switchTab;
        if (originalSwitchTab) {
            window.switchTab = function(tabId) {
                originalSwitchTab(tabId);
                if (tabId === 'players') loadPlayers();
            };
        } else {
            const observer = new MutationObserver(() => {
                const playersTab = document.getElementById('tab-players');
                if (playersTab && playersTab.classList.contains('active')) loadPlayers();
            });
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
        }
        if (document.getElementById('tab-players')?.classList.contains('active')) loadPlayers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
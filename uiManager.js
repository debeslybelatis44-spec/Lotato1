// uiManager.js

// ==========================
// Fonctions utilitaires robustes
// ==========================

/**
 * Convertit une chaîne de date en objet Date valide.
 * Gère les formats "YYYY-MM-DD HH:MM:SS" (sans T) et les timestamps.
 */
function safeParseDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date && !isNaN(dateValue)) return dateValue;

    let str = String(dateValue).trim();
    if (str === '') return null;

    // Si le format est "YYYY-MM-DD HH:MM:SS" (sans T), on le transforme
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
        // On remplace l'espace par 'T' pour obtenir un format ISO-like
        str = str.replace(' ', 'T');
    }

    const d = new Date(str);
    return isNaN(d) ? null : d;
}

// Variable globale pour le terme de recherche
window.historySearchTerm = '';

// Variables pour les filtres de rapports
window.reportFilters = {
    period: 'today',
    fromDate: '',
    toDate: '',
    drawId: 'all'
};

// ==========================
// Fonctions API
// ==========================

async function fetchTickets() {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Non authentifié');

    const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Erreur réseau');
    const data = await response.json();
    return data.tickets || [];
}

async function fetchTicketsWithFilters(filters) {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Non authentifié');

    let url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}?`;
    // Les filtres peuvent être ajoutés en paramètres si l'API les supporte
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Erreur réseau');
    const data = await response.json();
    return data.tickets || [];
}

function filterTicketsByDate(tickets, filters) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    return tickets.filter(ticket => {
        const ticketDate = safeParseDate(ticket.date || ticket.created_at);
        if (!ticketDate) return false;
        const ticketDateStr = ticketDate.toISOString().split('T')[0];

        if (filters.period === 'today') {
            return ticketDateStr === todayStr;
        } else if (filters.period === 'yesterday') {
            return ticketDateStr === yesterdayStr;
        } else if (filters.period === 'week') {
            return ticketDate >= weekAgo;
        } else if (filters.period === 'custom' && filters.fromDate && filters.toDate) {
            const from = new Date(filters.fromDate);
            const to = new Date(filters.toDate);
            to.setHours(23, 59, 59, 999);
            return ticketDate >= from && ticketDate <= to;
        }
        return true;
    });
}

// ==========================
// Navigation et onglets
// ==========================

function switchTab(tabName) {
    APP_STATE.currentTab = tabName;
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));

    let screenId = '';
    switch(tabName) {
        case 'home':
            screenId = 'draw-selection-screen';
            document.querySelector('.nav-item:nth-child(1)').classList.add('active');
            fixHomeScreenDisplay();
            break;
        case 'history':
            screenId = 'history-screen';
            document.querySelector('.nav-item:nth-child(2)').classList.add('active');
            loadHistory();
            break;
        case 'reports':
            screenId = 'reports-screen';
            document.querySelector('.nav-item:nth-child(3)').classList.add('active');
            loadReports();
            break;
        case 'winners':
            screenId = 'winners-screen';
            document.querySelector('.nav-item:nth-child(4)').classList.add('active');
            loadWinners();
            break;
    }
    if (screenId) document.getElementById(screenId).classList.add('active');
}

function fixHomeScreenDisplay() {
    setTimeout(() => {
        const drawNames = document.querySelectorAll('.draw-card .draw-name, .draw-item .draw-title, .draw-selection .draw-name');
        drawNames.forEach(el => {
            el.style.whiteSpace = 'normal';
            el.style.wordWrap = 'break-word';
            el.style.overflowWrap = 'break-word';
            el.style.maxWidth = '100%';
            el.style.fontSize = '1rem';
        });
        const drawContainers = document.querySelectorAll('.draw-card, .draw-item, .draw-selection');
        drawContainers.forEach(container => {
            container.style.width = 'auto';
            container.style.minWidth = '0';
            container.style.flex = '1 1 auto';
        });
        console.log('Affichage des tirages corrigé');
    }, 100);
}

// ==========================
// Historique
// ==========================

function initHistorySearchBar() {
    const historyScreen = document.getElementById('history-screen');
    if (!historyScreen || document.getElementById('history-search')) return;

    const searchBar = document.createElement('div');
    searchBar.className = 'search-bar';
    searchBar.innerHTML = '<input type="text" id="history-search" placeholder="Rechèch tikè (nimewo, tiraj, nimewo jwe...)" />';
    historyScreen.prepend(searchBar);

    if (!document.getElementById('history-search-styles')) {
        const style = document.createElement('style');
        style.id = 'history-search-styles';
        style.textContent = `
            .search-bar { padding: 10px 15px; background: var(--surface); border-bottom: 1px solid var(--glass-border); }
            .search-bar input { width: 100%; padding: 12px 15px; border: none; border-radius: 30px; background: var(--bg-light); color: var(--text); font-size: 1rem; outline: none; }
            .search-bar input::placeholder { color: var(--text-dim); }
        `;
        document.head.appendChild(style);
    }

    document.getElementById('history-search').addEventListener('input', e => {
        window.historySearchTerm = e.target.value;
        renderHistory();
    });
}

async function loadHistory() {
    try {
        const container = document.getElementById('history-container');
        container.innerHTML = '<div class="empty-msg">Chajman...</div>';

        // Charger les tirages si pas encore fait (pour les noms)
        if (!APP_STATE.draws && typeof window.loadDraws === 'function') {
            await window.loadDraws();
        }

        const tickets = await fetchTickets();
        APP_STATE.ticketsHistory = tickets;
        console.log('Tickets reçus:', tickets);

        initHistorySearchBar();
        renderHistory();
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        document.getElementById('history-container').innerHTML = '<div class="empty-msg">Erè chajman istorik: ' + error.message + '</div>';
    }
}

function filterTickets(tickets, term) {
    if (!term) return tickets;
    term = term.toLowerCase();
    return tickets.filter(ticket => {
        const ticketId = (ticket.ticket_id || ticket.id || '').toString().toLowerCase();
        if (ticketId.includes(term)) return true;

        const drawName = (ticket.draw_name || ticket.drawName || '').toLowerCase();
        if (drawName.includes(term)) return true;

        const date = safeParseDate(ticket.date || ticket.created_at);
        if (date) {
            const dateStr = date.toLocaleDateString('fr-FR').toLowerCase();
            if (dateStr.includes(term)) return true;
        }

        const bets = ticket.bets || [];
        let numbers = '';
        if (Array.isArray(bets)) numbers = bets.map(b => b.number || '').join(' ').toLowerCase();
        else if (typeof bets === 'string') numbers = bets.toLowerCase();
        if (numbers.includes(term)) return true;

        return false;
    });
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if (!APP_STATE.ticketsHistory || APP_STATE.ticketsHistory.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè nan istorik</div>';
        return;
    }

    const filteredTickets = filterTickets(APP_STATE.ticketsHistory, window.historySearchTerm);
    if (filteredTickets.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè ki koresponn ak rechèch la</div>';
        return;
    }

    // Construire un dictionnaire des tirages pour un accès rapide (depuis APP_STATE.draws ou CONFIG.DRAWS)
    const drawsMap = {};
    if (APP_STATE.draws && Array.isArray(APP_STATE.draws)) {
        APP_STATE.draws.forEach(d => drawsMap[d.id] = d.name);
    } else if (CONFIG && CONFIG.DRAWS) {
        CONFIG.DRAWS.forEach(d => drawsMap[d.id] = d.name);
    }

    container.innerHTML = filteredTickets.map(ticket => {
        const numericId = ticket.id; // ID numérique de la base
        const displayId = ticket.ticket_id || ticket.id;

        // --- Récupération du nom du tirage ---
        let drawName = ticket.draw_name || ticket.drawName || '';
        if (!drawName) {
            const drawId = ticket.draw_id || ticket.drawId;
            if (drawId) {
                drawName = drawsMap[drawId] || `Tiraj ${drawId}`;
            } else {
                drawName = 'Tiraj Inkonu';
            }
        }

        const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
        const date = ticket.date || ticket.created_at || ticket.created_date;

        // --- Traitement de la date ---
        const ticketDate = safeParseDate(date);
        let formattedDate = 'Date inkonu', formattedTime = '';
        if (ticketDate) {
            formattedDate = ticketDate.toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' });
            formattedTime = ticketDate.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit' });
        } else {
            console.warn('Date invalide pour le ticket', ticket);
        }

        // --- Calcul du délai pour modification/suppression ---
        const now = new Date();
        const minutesDiff = ticketDate ? (now - ticketDate) / (1000 * 60) : Infinity;
        const canDelete = minutesDiff <= 3 && numericId != null;
        const canEdit = minutesDiff <= 3;

        const bets = ticket.bets || [];
        let numberOfBets = 0;
        if (Array.isArray(bets)) numberOfBets = bets.length;
        else if (typeof bets === 'object' && bets !== null) numberOfBets = Object.keys(bets).length;
        else if (typeof bets === 'string') {
            try {
                const parsed = JSON.parse(bets);
                numberOfBets = Array.isArray(parsed) ? parsed.length : 1;
            } catch { numberOfBets = 1; }
        }

        const checked = ticket.checked || ticket.verified || false;
        const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;

        let status = '', statusClass = '';
        if (checked) {
            if (winAmount > 0) { status = 'GeNYEN'; statusClass = 'badge-win'; }
            else { status = 'PÈDI'; statusClass = 'badge-lost'; }
        } else { status = 'AP TANN'; statusClass = 'badge-wait'; }

        return `
            <div class="history-card" data-numeric-id="${numericId}" data-display-id="${displayId}">
                <div class="card-header">
                    <span class="ticket-id">#${displayId}</span>
                    <span class="ticket-date">${formattedDate} ${formattedTime}</span>
                </div>
                <div class="ticket-info">
                    <p><strong>Tiraj:</strong> <span class="draw-name">${drawName}</span></p>
                    <p><strong>Total:</strong> <span class="total-amount">${totalAmount}</span> Gdes</p>
                    <p><strong>Nimewo:</strong> <span class="bet-count">${numberOfBets}</span></p>
                </div>
                <div class="card-footer">
                    <span class="badge ${statusClass}">${status}</span>
                    <div class="action-buttons">
                        <button class="btn-small view-details-btn" onclick="viewTicketDetails('${displayId}')"><i class="fas fa-eye"></i> Detay</button>
                        ${canEdit ? `<button class="btn-small edit-btn" onclick="editTicket('${displayId}')"><i class="fas fa-edit"></i> Modifye</button>` : ''}
                        <button class="btn-small print-btn" onclick="reprintTicket('${displayId}')"><i class="fas fa-print"></i> Enprime</button>
                        <button class="btn-small replay-btn" onclick="replayTicket('${displayId}')"><i class="fas fa-redo"></i> Rejwe</button>
                        <button class="delete-history-btn" onclick="deleteTicketFromCard(this)" ${canDelete ? '' : 'disabled'}><i class="fas fa-trash"></i> Efase</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function deleteTicketFromCard(button) {
    const card = button.closest('.history-card');
    if (!card) return;
    const numericId = card.dataset.numericId;
    if (!numericId) { alert('ID tikè invalide'); return; }
    deleteTicket(numericId);
}

async function deleteTicket(ticketId) {
    if (!confirm('Èske ou sèten ou vle efase tikè sa a?')) return;
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/tickets/${ticketId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Erreur suppression');
        const data = await response.json();
        if (data.success) {
            APP_STATE.ticketsHistory = APP_STATE.ticketsHistory.filter(t => t.id !== ticketId && t.ticket_id !== ticketId);
            renderHistory();
            alert('Tikè efase ak siksè!');
        } else throw new Error('Repons envalid');
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erè nan efasman tikè a: ' + error.message);
    }
}

function editTicket(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) { alert("Tikè pa jwenn!"); return; }

    const ticketDate = safeParseDate(ticket.date || ticket.created_at);
    const now = new Date();
    const minutesDiff = ticketDate ? (now - ticketDate) / (1000 * 60) : Infinity;
    if (minutesDiff > 3) { alert("Tikè sa a gen plis pase 3 minit, ou pa ka modifye li."); return; }

    APP_STATE.currentCart = [];
    let bets = [];
    if (Array.isArray(ticket.bets)) bets = ticket.bets;
    else if (typeof ticket.bets === 'string') {
        try { bets = JSON.parse(ticket.bets); } catch { bets = []; }
    }
    bets.forEach(bet => {
        APP_STATE.currentCart.push({
            ...bet,
            id: Date.now() + Math.random(),
            drawId: bet.drawId || ticket.draw_id,
            drawName: bet.drawName || ticket.draw_name
        });
    });
    CartManager.renderCart();
    switchTab('home');
    alert(`Tikè #${ticket.ticket_id || ticket.id} charge nan panye. Ou kapab modifye l.`);
}

async function replayTicket(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) { alert("Tikè pa jwenn!"); return; }

    const selectedDraws = await showDrawSelectionModal();
    if (!selectedDraws || selectedDraws.length === 0) {
        alert("Ou pa chwazi okenn tiraj. Rejwe annile.");
        return;
    }

    let bets = [];
    if (Array.isArray(ticket.bets)) {
        bets = ticket.bets.filter(b => parseFloat(b.amount) > 0);
    } else if (typeof ticket.bets === 'string') {
        try {
            const parsed = JSON.parse(ticket.bets);
            if (Array.isArray(parsed)) bets = parsed.filter(b => parseFloat(b.amount) > 0);
        } catch { bets = []; }
    }

    if (bets.length === 0) {
        alert("Pa gen paryaj valab (montant > 0) nan tikè sa a.");
        return;
    }

    function getBetKey(bet) {
        const game = bet.game || bet.specialType || 'borlette';
        const number = bet.cleanNumber || bet.number || '';
        const option = bet.option || '';
        return `${game}_${number}_${option}`;
    }

    selectedDraws.forEach(drawId => {
        const drawName = (APP_STATE.draws || CONFIG.DRAWS).find(d => d.id === drawId)?.name || drawId;
        bets.forEach(bet => {
            const betKey = getBetKey(bet);
            const existingIndex = APP_STATE.currentCart.findIndex(existing => 
                existing.drawId === drawId && getBetKey(existing) === betKey
            );
            if (existingIndex >= 0) {
                APP_STATE.currentCart[existingIndex].amount += parseFloat(bet.amount);
            } else {
                APP_STATE.currentCart.push({
                    ...bet,
                    id: Date.now() + Math.random(),
                    drawId: drawId,
                    drawName: drawName,
                    replayFrom: ticket.ticket_id || ticket.id
                });
            }
        });
    });

    if (typeof CartManager.updateFreeMarriages === 'function') CartManager.updateFreeMarriages();
    switchTab('home');
    alert(`Tikè #${ticket.ticket_id || ticket.id} rejwete nan panye. Ou kapab modifye l.`);
}

function showDrawSelectionModal() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10000;
        `;
        const draws = APP_STATE.draws || CONFIG.DRAWS || [];
        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg); padding: 20px; border-radius: 20px; max-width: 90%; max-height: 80%; overflow-y: auto; border: 2px solid var(--primary);">
                <h3 style="margin-top:0; text-align:center;">Chwazi tiraj(yo) pou rejwete</h3>
                <div class="draws-list" style="margin: 15px 0;">
                    ${draws.map(draw => `
                        <label style="display:block; padding:8px; border-bottom:1px solid var(--glass-border);">
                            <input type="checkbox" value="${draw.id}" style="margin-right:10px;"> ${draw.name}
                        </label>
                    `).join('')}
                </div>
                <div class="modal-actions" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button id="cancel-replay" style="background: var(--text-dim); border: none; color: white; padding: 10px 20px; border-radius: 10px; cursor: pointer;">Anile</button>
                    <button id="confirm-replay" style="background: var(--primary); border: none; color: white; padding: 10px 20px; border-radius: 10px; cursor: pointer;">Konfime</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('cancel-replay').onclick = () => { document.body.removeChild(modal); resolve([]); };
        document.getElementById('confirm-replay').onclick = () => {
            const checkboxes = modal.querySelectorAll('input[type=checkbox]:checked');
            const selected = Array.from(checkboxes).map(cb => cb.value);
            document.body.removeChild(modal);
            resolve(selected);
        };
    });
}

function reprintTicket(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) { alert("Tikè pa jwenn!"); return; }

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) { alert("Veuillez autoriser les pop-ups pour imprimer le ticket."); return; }

    printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px; text-align:center;">Génération du ticket en cours...</p></body></html>');
    printWindow.document.close();

    // Utiliser la fonction printThermalTicket définie ailleurs (ex: cartManager.js)
    if (typeof printThermalTicket === 'function') {
        printThermalTicket(ticket, printWindow);
    } else {
        printWindow.document.write('<p>Fonction d\'impression non disponible</p>');
    }
}

// ==========================
// Rapports
// ==========================

function initReportFilters() {
    const reportsScreen = document.getElementById('reports-screen');
    if (!reportsScreen || document.getElementById('report-filters')) return;

    const filtersDiv = document.createElement('div');
    filtersDiv.id = 'report-filters';
    filtersDiv.className = 'report-filters';
    filtersDiv.innerHTML = `
        <div class="filter-row">
            <select id="report-period" class="filter-select">
                <option value="today">Jodi a</option>
                <option value="yesterday">Yè</option>
                <option value="week">Semèn sa a</option>
                <option value="custom">Dat pèsonalize</option>
            </select>
            <div id="custom-date-range" style="display: none; margin-top: 10px;">
                <input type="date" id="report-from-date" class="filter-input">
                <input type="date" id="report-to-date" class="filter-input">
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="apply-report-filters" class="filter-btn">Aplike Filtre</button>
                <button id="print-report-btn" class="filter-btn"><i class="fas fa-print"></i> Enprime</button>
            </div>
        </div>
    `;
    const header = reportsScreen.querySelector('.reports-header');
    if (header) header.after(filtersDiv); else reportsScreen.prepend(filtersDiv);

    if (!document.getElementById('report-filters-styles')) {
        const style = document.createElement('style');
        style.id = 'report-filters-styles';
        style.textContent = `
            .report-filters { padding: 15px; background: var(--surface); border-bottom: 1px solid var(--glass-border); margin-bottom: 15px; }
            .filter-row { display: flex; flex-direction: column; gap: 10px; }
            .filter-select, .filter-input { padding: 10px; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--bg-light); color: var(--text); font-size: 1rem; }
            .filter-btn { padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; transition: all 0.3s; }
            .filter-btn:hover { background: var(--primary-dark); transform: translateY(-2px); }
            @media (min-width: 768px) { .filter-row { flex-direction: row; align-items: center; } }
        `;
        document.head.appendChild(style);
    }

    const periodSelect = document.getElementById('report-period');
    const customRange = document.getElementById('custom-date-range');
    const fromDate = document.getElementById('report-from-date');
    const toDate = document.getElementById('report-to-date');
    const applyBtn = document.getElementById('apply-report-filters');
    const printBtn = document.getElementById('print-report-btn');

    const today = new Date().toISOString().split('T')[0];
    fromDate.value = today;
    toDate.value = today;

    periodSelect.addEventListener('change', function() {
        customRange.style.display = this.value === 'custom' ? 'block' : 'none';
    });

    applyBtn.addEventListener('click', function() {
        window.reportFilters = {
            period: periodSelect.value,
            fromDate: fromDate.value,
            toDate: toDate.value,
            drawId: document.getElementById('draw-report-selector')?.value || 'all'
        };
        loadReports();
    });

    printBtn.addEventListener('click', printReport);
}

async function loadReports() {
    try {
        initReportFilters();

        const allTickets = await fetchTickets();
        APP_STATE.ticketsHistory = allTickets;

        const filteredTickets = filterTicketsByDate(allTickets, window.reportFilters);
        const finalTickets = window.reportFilters.drawId !== 'all'
            ? filteredTickets.filter(t => (t.draw_id === window.reportFilters.drawId || t.drawId === window.reportFilters.drawId))
            : filteredTickets;

        let totalTickets = finalTickets.length;
        let totalBets = 0, totalWins = 0, totalLoss = 0;
        finalTickets.forEach(ticket => {
            const ticketAmount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
            totalBets += ticketAmount;
            if (ticket.checked || ticket.verified) {
                const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                if (winAmount > 0) totalWins += winAmount;
                else totalLoss += ticketAmount;
            }
        });
        const totalProfit = totalBets - totalWins;

        document.getElementById('total-tickets').textContent = totalTickets;
        document.getElementById('total-bets').textContent = totalBets.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-wins').textContent = totalWins.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-loss').textContent = totalLoss.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').textContent = totalProfit.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').style.color = (totalProfit >= 0) ? 'var(--success)' : 'var(--danger)';

        let periodText = '';
        if (window.reportFilters.period === 'today') periodText = 'Jodi a';
        else if (window.reportFilters.period === 'yesterday') periodText = 'Yè';
        else if (window.reportFilters.period === 'week') periodText = 'Semèn sa a';
        else if (window.reportFilters.period === 'custom') periodText = `Soti ${window.reportFilters.fromDate} rive ${window.reportFilters.toDate}`;

        const periodInfo = document.createElement('div');
        periodInfo.className = 'period-info';
        periodInfo.style.cssText = 'text-align: center; margin: 10px 0; font-size: 0.9rem; color: var(--text-dim);';
        periodInfo.innerHTML = `Peryòd: <strong>${periodText}</strong>`;
        const existing = document.querySelector('.period-info');
        if (existing) existing.remove();
        const reportsSummary = document.querySelector('.reports-summary');
        if (reportsSummary) reportsSummary.insertAdjacentElement('afterend', periodInfo);

        const drawSelector = document.getElementById('draw-report-selector');
        if (drawSelector) {
            drawSelector.innerHTML = '<option value="all">Tout Tiraj</option>';
            const draws = APP_STATE.draws || CONFIG.DRAWS || [];
            draws.forEach(draw => {
                const option = document.createElement('option');
                option.value = draw.id;
                option.textContent = draw.name;
                if (draw.id === window.reportFilters.drawId) option.selected = true;
                drawSelector.appendChild(option);
            });
        }

        await loadDrawReport(window.reportFilters.drawId);
    } catch (error) {
        console.error('Erreur chargement rapports:', error);
        // valeurs par défaut
        document.getElementById('total-tickets').textContent = '0';
        document.getElementById('total-bets').textContent = '0 Gdes';
        document.getElementById('total-wins').textContent = '0 Gdes';
        document.getElementById('total-loss').textContent = '0 Gdes';
        document.getElementById('balance').textContent = '0 Gdes';
        document.getElementById('balance').style.color = 'var(--success)';
    }
}

async function loadDrawReport(drawId = null) {
    try {
        const selectedDrawId = drawId || document.getElementById('draw-report-selector').value;
        window.reportFilters.drawId = selectedDrawId;

        const filteredTickets = filterTicketsByDate(APP_STATE.ticketsHistory, window.reportFilters);
        const finalTickets = selectedDrawId === 'all' 
            ? filteredTickets
            : filteredTickets.filter(t => (t.draw_id === selectedDrawId || t.drawId === selectedDrawId));

        let drawTotalTickets = finalTickets.length;
        let drawTotalBets = 0, drawTotalWins = 0, drawTotalLoss = 0;
        finalTickets.forEach(ticket => {
            const ticketAmount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
            drawTotalBets += ticketAmount;
            if (ticket.checked || ticket.verified) {
                const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                if (winAmount > 0) drawTotalWins += winAmount;
                else drawTotalLoss += ticketAmount;
            }
        });
        const drawProfit = drawTotalBets - drawTotalWins;

        document.getElementById('draw-report-card').style.display = 'block';
        document.getElementById('draw-total-tickets').textContent = drawTotalTickets;
        document.getElementById('draw-total-bets').textContent = drawTotalBets.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('draw-total-wins').textContent = drawTotalWins.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('draw-total-loss').textContent = drawTotalLoss.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('draw-balance').textContent = drawProfit.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('draw-balance').style.color = (drawProfit >= 0) ? 'var(--success)' : 'var(--danger)';
    } catch (error) {
        console.error('Erreur chargement rapport tirage:', error);
        document.getElementById('draw-report-card').style.display = 'block';
        document.getElementById('draw-total-tickets').textContent = '0';
        document.getElementById('draw-total-bets').textContent = '0 Gdes';
        document.getElementById('draw-total-wins').textContent = '0 Gdes';
        document.getElementById('draw-total-loss').textContent = '0 Gdes';
        document.getElementById('draw-balance').textContent = '0 Gdes';
        document.getElementById('draw-balance').style.color = 'var(--success)';
    }
}

function printReport() {
    const drawSelector = document.getElementById('draw-report-selector');
    const selectedDraw = drawSelector.options[drawSelector.selectedIndex].text;
    const selectedDrawId = drawSelector.value;

    const filteredTickets = filterTicketsByDate(APP_STATE.ticketsHistory, window.reportFilters);
    const tickets = selectedDrawId === 'all' 
        ? filteredTickets
        : filteredTickets.filter(t => t.draw_id === selectedDrawId || t.drawId === selectedDrawId);

    let totalTickets = tickets.length;
    let totalBets = 0, totalWins = 0, totalLoss = 0;
    tickets.forEach(ticket => {
        const amount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
        totalBets += amount;
        if (ticket.checked || ticket.verified) {
            const win = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
            if (win > 0) totalWins += win;
            else totalLoss += amount;
        }
    });
    const balance = totalBets - totalWins;

    let periodText = '';
    if (window.reportFilters.period === 'today') periodText = 'Jodi a';
    else if (window.reportFilters.period === 'yesterday') periodText = 'Yè';
    else if (window.reportFilters.period === 'week') periodText = 'Semèn sa a';
    else if (window.reportFilters.period === 'custom') periodText = `Soti ${window.reportFilters.fromDate} rive ${window.reportFilters.toDate}`;

    const cfg = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTERIE';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';
    const slogan = cfg.slogan || '';

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) { alert("Veuillez autoriser les pop-ups pour imprimer le rapport."); return; }

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Rapò ${selectedDraw}</title>
            <style>
                @page { size: 80mm auto; margin: 2mm; }
                body { font-family: 'Courier New', monospace; font-size: 28px; font-weight: bold; width: 76mm; margin: 0 auto; padding: 4mm; background: white; color: black; }
                .header { text-align: center; border-bottom: 2px dashed #000; padding: 0; margin: 0 0 10px 0; line-height: 1.2; }
                .header img { max-height: 180px; max-width: 100%; margin-bottom: 5px; }
                .header h1 { font-size: 40px; margin: 5px 0; }
                .header h2 { font-size: 32px; margin: 5px 0; font-weight: normal; }
                .header p { margin: 2px 0; font-size: 24px; }
                .period-info { text-align: center; font-size: 24px; margin: 10px 0; padding: 5px; background: #f0f0f0; }
                .section { margin: 15px 0; }
                .section-title { font-size: 32px; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 8px; }
                .row { display: flex; justify-content: space-between; margin: 5px 0; font-size: 28px; }
                .total-row { font-weight: bold; border-top: 1px solid #000; padding-top: 8px; margin-top: 8px; }
                .footer { margin-top: 20px; text-align: center; font-size: 20px; border-top: 1px dashed #000; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : ''}
                <h1>${lotteryName}</h1>
                ${slogan ? `<p>${slogan}</p>` : ''}
                <h2>Rapò ${selectedDraw}</h2>
                <p>${new Date().toLocaleDateString('fr-FR')} - Ajan: ${APP_STATE.agentName || ''}</p>
            </div>
            <div class="period-info">Peryòd: ${periodText}</div>
            <div class="section">
                <div class="section-title">Rekapitilatif</div>
                <div class="row"><span>Total Tikè:</span> <span>${totalTickets}</span></div>
                <div class="row"><span>Total Paris:</span> <span>${totalBets.toLocaleString('fr-FR')} G</span></div>
                <div class="row"><span>Total Ganyen:</span> <span>${totalWins.toLocaleString('fr-FR')} G</span></div>
                <div class="row"><span>Pèdi:</span> <span>${totalLoss.toLocaleString('fr-FR')} G</span></div>
                <div class="row total-row"><span>Balans:</span> <span>${balance.toLocaleString('fr-FR')} G</span></div>
            </div>
            <div class="footer">
                <p>Rapò jenere le: ${new Date().toLocaleString('fr-FR')}</p>
                <p>© ${lotteryName}</p>
            </div>
        </body>
        </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
}

// ==========================
// Gagnants
// ==========================

async function loadWinners() {
    try {
        if (typeof APIService !== 'undefined') {
            await APIService.getWinningTickets();
            await APIService.getWinningResults();
        } else {
            // fallback simple
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNERS}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                APP_STATE.winningTickets = data.winners || [];
            }
            const res2 = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_WINNING_RESULTS}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res2.ok) {
                const data = await res2.json();
                APP_STATE.winningResults = data.results || [];
            }
        }
        updateWinnersDisplay();
    } catch (error) {
        console.error('Erreur chargement gagnants:', error);
        APP_STATE.winningTickets = [];
        APP_STATE.winningResults = [];
        updateWinnersDisplay();
    }
}

function updateWinnersDisplay() {
    const container = document.getElementById('winners-container');
    if (!container) return;

    const winningTickets = APP_STATE.winningTickets || [];
    const winningResults = APP_STATE.winningResults || [];

    if (winningTickets.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè genyen pou kounye a</div>';
        document.getElementById('total-winners-today').textContent = '0';
        document.getElementById('total-winning-amount').textContent = '0 Gdes';
        document.getElementById('average-winning').textContent = '0 Gdes';
        return;
    }

    const totalWins = winningTickets.length;
    const totalAmount = winningTickets.reduce((sum, ticket) => sum + (parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0)), 0);
    const averageWin = totalWins > 0 ? totalAmount / totalWins : 0;

    document.getElementById('total-winners-today').textContent = totalWins;
    document.getElementById('total-winning-amount').textContent = totalAmount.toLocaleString('fr-FR') + ' Gdes';
    document.getElementById('average-winning').textContent = averageWin.toFixed(2).toLocaleString('fr-FR') + ' Gdes';

    container.innerHTML = winningTickets.map(ticket => {
        const isPaid = ticket.paid || false;
        const winningResult = winningResults.find(r => r.draw_id === (ticket.draw_id || ticket.drawId));
        const resultStr = winningResult ? (winningResult.numbers || []).join(', ') : 'N/A';
        const betAmount = parseFloat(ticket.bet_amount || ticket.total_amount || ticket.amount || 0) || 0;
        const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0) || 0;
        const netProfit = winAmount - betAmount;

        return `
            <div class="winner-ticket">
                <div class="winner-header">
                    <div>
                        <strong>Tikè #${ticket.ticket_id || ticket.id}</strong>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            ${ticket.draw_name || ticket.drawName} - ${safeParseDate(ticket.date || ticket.created_at)?.toLocaleDateString('fr-FR') || ''}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: var(--success); font-size: 1.1rem;">${winAmount.toLocaleString('fr-FR')} Gdes</div>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">(Mise: ${betAmount.toLocaleString('fr-FR')}G | Net: ${netProfit.toLocaleString('fr-FR')}G)</div>
                    </div>
                </div>
                <div>
                    <p><strong>Rezilta Tiraj:</strong> ${resultStr}</p>
                    <p><strong>Jwèt:</strong> ${ticket.game_type || ticket.gameType || 'Borlette'}</p>
                    <p><strong>Nimewo Ganyen:</strong> ${ticket.winning_number || ticket.winningNumber || 'N/A'}</p>
                </div>
                <div class="winner-actions">
                    ${isPaid ? 
                        '<button class="btn-paid" disabled><i class="fas fa-check"></i> Peye</button>' :
                        '<button class="btn-paid" onclick="markAsPaid(\'' + (ticket.id || ticket.ticket_id) + '\')"><i class="fas fa-money-bill-wave"></i> Make kòm Peye</button>'
                    }
                </div>
            </div>
        `;
    }).join('');
}

async function markAsPaid(ticketId) {
    try {
        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PAY_WINNER}/${ticketId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Erreur réseau');
        const data = await response.json();
        if (data.success) {
            alert('Tikè make kòm peye!');
            loadWinners();
        }
    } catch (error) {
        console.error('Erreur marquage payé:', error);
        alert('Erè nan makaj tikè a.');
    }
}

function viewTicketDetails(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) { alert(`Tikè pa jwenn!`); return; }

    const drawName = ticket.draw_name || ticket.drawName || 'Tiraj Inkonu';
    const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
    const date = safeParseDate(ticket.date || ticket.created_at);
    const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;
    const checked = ticket.checked || ticket.verified || false;

    let details = `
        <h3>Detay Tikè #${ticket.ticket_id || ticket.id || 'N/A'}</h3>
        <p><strong>Tiraj:</strong> ${drawName}</p>
        <p><strong>Dat:</strong> ${date ? date.toLocaleString('fr-FR', { timeZone: 'America/Port-au-Prince' }) : 'N/A'}</p>
        <p><strong>Total Mis:</strong> ${totalAmount} Gdes</p>
        <p><strong>Statis:</strong> ${checked ? (winAmount > 0 ? 'GANYEN' : 'PÈDI') : 'AP TANN'}</p>
        ${winAmount > 0 ? `<p><strong>Ganyen Total:</strong> ${winAmount} Gdes</p><p><strong>Pwofi Net:</strong> ${winAmount - totalAmount} Gdes</p>` : ''}
        <hr><h4>Paray yo:</h4>
    `;

    let bets = [];
    if (Array.isArray(ticket.bets)) bets = ticket.bets;
    else if (typeof ticket.bets === 'string') { try { bets = JSON.parse(ticket.bets); } catch { bets = []; } }
    else bets = [];

    if (bets.length === 0) details += '<p>Pa gen detay paryaj</p>';
    else bets.forEach(bet => {
        const gameName = (bet.game || '').toUpperCase() || 'BORLETTE';
        const betNumber = bet.number || bet.numero || 'N/A';
        const betAmount = bet.amount || 0;
        details += `<p>${gameName} ${betNumber} - ${betAmount} Gdes</p>`;
    });

    const modal = document.createElement('div');
    modal.style.cssText = 'position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:3000;';
    const modalContent = document.createElement('div');
    modalContent.style.cssText = 'background: var(--bg); padding:20px; border-radius:20px; max-width:90%; max-height:80%; overflow-y:auto; border:2px solid var(--primary);';
    modalContent.innerHTML = `<div style="text-align: left;">${details}</div><button onclick="this.parentElement.parentElement.remove()" style="background: var(--primary); border: none; color: white; padding: 10px 20px; border-radius: 10px; margin-top: 20px; cursor: pointer;">Fèmen</button>`;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

// ==========================
// Horloge et synchronisation
// ==========================

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').innerText = now.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince' });
    if (APP_STATE.currentTab === 'home' || APP_STATE.currentTab === 'betting') {
        checkSelectedDrawStatus(); // à définir ailleurs
    }
}

function updateSyncStatus() {
    const syncBar = document.getElementById('sync-status-bar');
    const syncText = document.getElementById('sync-text');
    const statuses = [
        { text: "Sistem OK", class: "sync-idle" },
        { text: "Synchro...", class: "sync-syncing" },
        { text: "Konekte", class: "sync-connected" }
    ];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    syncText.textContent = status.text;
    syncBar.className = "sync-status-bar " + status.class;
}

async function loadLotteryConfig() {
    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LOTTERY_CONFIG}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const config = await res.json();
            APP_STATE.lotteryConfig = config;
            CONFIG.LOTTERY_NAME = config.name || 'LOTATO';
            CONFIG.LOTTERY_LOGO = config.logo || config.logoUrl || '';
            CONFIG.slogan = config.slogan || '';
            document.getElementById('lottery-name').innerHTML = `${config.name} <span class="pro-badge">version 6</span>`;
            const sloganEl = document.getElementById('lottery-slogan');
            if (sloganEl) sloganEl.textContent = config.slogan || '';
            console.log('✅ Configuration chargée :', config);
        }
    } catch (error) {
        console.error('❌ Erreur chargement configuration:', error);
    }
}

// ==========================
// Déconnexion
// ==========================

function logout() {
    if (!confirm('Èske ou sèten ou vle dekonekte?')) return;
    const token = localStorage.getItem('auth_token');
    fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    }).catch(err => console.error('Erreur déconnexion:', err))
      .finally(() => {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('agent_id');
          localStorage.removeItem('agent_name');
          localStorage.removeItem('user_role');
          window.location.href = 'index.html';
      });
}

// ==========================
// Exposer les fonctions globales
// ==========================
window.switchTab = switchTab;
window.editTicket = editTicket;
window.deleteTicket = deleteTicket;
window.deleteTicketFromCard = deleteTicketFromCard;
window.viewTicketDetails = viewTicketDetails;
window.markAsPaid = markAsPaid;
window.printReport = printReport;
window.loadDrawReport = loadDrawReport;
window.logout = logout;
window.reprintTicket = reprintTicket;
window.replayTicket = replayTicket;
window.loadHistory = loadHistory;
window.loadReports = loadReports;
window.loadWinners = loadWinners;
window.loadLotteryConfig = loadLotteryConfig;
window.updateClock = updateClock;
window.updateSyncStatus = updateSyncStatus;
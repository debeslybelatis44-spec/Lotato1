// uiManager.js

// Fonction utilitaire pour récupérer les tickets depuis l'API
async function fetchTickets() {
    const token = localStorage.getItem('auth_token');
    if (!token) throw new Error('Non authentifié');

    const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_TICKETS}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    if (!response.ok) throw new Error('Erreur réseau');
    const data = await response.json();
    return data.tickets || [];
}

function switchTab(tabName) {
    APP_STATE.currentTab = tabName;
    
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
    });
    
    let screenId = '';
    switch(tabName) {
        case 'home':
            screenId = 'draw-selection-screen';
            document.querySelector('.nav-item:nth-child(1)').classList.add('active');
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
    
    if (screenId) {
        document.getElementById(screenId).classList.add('active');
    }
}

async function loadHistory() {
    try {
        const container = document.getElementById('history-container');
        container.innerHTML = '<div class="empty-msg">Chajman...</div>';
        
        const tickets = await fetchTickets();
        APP_STATE.ticketsHistory = tickets;
        
        renderHistory();
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        document.getElementById('history-container').innerHTML = 
            '<div class="empty-msg">Erè chajman istorik: ' + error.message + '</div>';
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    
    if (!APP_STATE.ticketsHistory || APP_STATE.ticketsHistory.length === 0) {
        container.innerHTML = '<div class="empty-msg">Pa gen tikè nan istorik</div>';
        return;
    }
    
    container.innerHTML = APP_STATE.ticketsHistory.map((ticket, index) => {
        // ID numérique pour l'API, ID d'affichage pour l'utilisateur
        const numericId = ticket.id;                     // Clé primaire (nombre)
        const displayId = ticket.ticket_id || ticket.id; // Identifiant lisible
        const drawName = ticket.draw_name || ticket.drawName || ticket.draw_name_fr || 'Tiraj Inkonu';
        const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
        const date = ticket.date || ticket.created_at || ticket.created_date || new Date().toISOString();
        const bets = ticket.bets || ticket.numbers || [];
        const checked = ticket.checked || ticket.verified || false;
        const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;
        
        let numberOfBets = 0;
        if (Array.isArray(bets)) {
            numberOfBets = bets.length;
        } else if (typeof bets === 'object' && bets !== null) {
            numberOfBets = Object.keys(bets).length;
        } else if (typeof bets === 'string') {
            try {
                const parsedBets = JSON.parse(bets);
                numberOfBets = Array.isArray(parsedBets) ? parsedBets.length : 1;
            } catch (e) {
                numberOfBets = 1;
            }
        }
        
        let status = '';
        let statusClass = '';
        
        if (checked) {
            if (winAmount > 0) {
                status = 'GeNYEN';
                statusClass = 'badge-win';
            } else {
                status = 'PÈDI';
                statusClass = 'badge-lost';
            }
        } else {
            status = 'AP TANN';
            statusClass = 'badge-wait';
        }
        
        const ticketDate = new Date(date);
        const now = new Date();
        const minutesDiff = (now - ticketDate) / (1000 * 60);
        // Délai de suppression : 3 minutes pour l'agent
        const canDelete = minutesDiff <= 3 && numericId != null;
        const canEdit = minutesDiff <= 3;
        
        let formattedDate = 'Date inkonu';
        let formattedTime = '';
        
        try {
            formattedDate = ticketDate.toLocaleDateString('fr-FR');
            formattedTime = ticketDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        } catch (e) {
            formattedDate = 'N/A';
            formattedTime = '';
        }
        
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
                        <button class="btn-small view-details-btn" onclick="viewTicketDetails('${displayId}')">
                            <i class="fas fa-eye"></i> Detay
                        </button>
                        ${canEdit ? `
                            <button class="btn-small edit-btn" onclick="editTicket('${displayId}')">
                                <i class="fas fa-edit"></i> Modifye
                            </button>
                        ` : ''}
                        <button class="btn-small print-btn" onclick="reprintTicket('${displayId}')">
                            <i class="fas fa-print"></i> Enprime
                        </button>
                        <button class="delete-history-btn" onclick="deleteTicketFromCard(this)" ${canDelete ? '' : 'disabled'}>
                            <i class="fas fa-trash"></i> Efase
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Nouvelle fonction : récupère l'ID numérique depuis la carte et appelle deleteTicket
function deleteTicketFromCard(button) {
    const card = button.closest('.history-card');
    if (!card) return;
    const numericId = card.dataset.numericId;
    if (!numericId) {
        alert('ID tikè invalide (pa gen id nimerik)');
        return;
    }
    deleteTicket(numericId);
}

async function deleteTicket(ticketId) {
    if (!confirm('Èske ou sèten ou vle efase tikè sa a?')) return;

    try {
        const response = await APIService.deleteTicket(ticketId);
        
        // Vérifier si la suppression a réussi (selon la structure de votre API)
        if (response && (response.success === true || response.status === 'ok' || response.message)) {
            // Supprimer localement
            APP_STATE.ticketsHistory = APP_STATE.ticketsHistory.filter(t => 
                (t.id !== ticketId && t.ticket_id !== ticketId)
            );
            renderHistory();
            alert('Tikè efase ak siksè!');
        } else {
            throw new Error('Repons envalid nan serve a');
        }
    } catch (error) {
        console.error('Erreur suppression:', error);
        alert('Erè nan efasman tikè a: ' + error.message);
    }
}

function editTicket(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) {
        alert("Tikè pa jwenn!");
        return;
    }

    const ticketDate = new Date(ticket.date || ticket.created_at);
    const now = new Date();
    const minutesDiff = (now - ticketDate) / (1000 * 60);
    if (minutesDiff > 3) {
        alert("Tikè sa a gen plis pase 3 minit, ou pa ka modifye li.");
        return;
    }

    APP_STATE.currentCart = [];

    let bets = [];
    if (Array.isArray(ticket.bets)) {
        bets = ticket.bets;
    } else if (typeof ticket.bets === 'string') {
        try {
            bets = JSON.parse(ticket.bets);
        } catch (e) {
            bets = [];
        }
    }

    bets.forEach(bet => {
        const newBet = {
            ...bet,
            id: Date.now() + Math.random(),
            drawId: bet.drawId || ticket.draw_id,
            drawName: bet.drawName || ticket.draw_name
        };
        APP_STATE.currentCart.push(newBet);
    });

    CartManager.renderCart();
    switchTab('home');
    alert(`Tikè #${ticket.ticket_id || ticket.id} charge nan panye. Ou kapab modifye l.`);
}

// Nouvelle fonction pour réimprimer un ticket depuis l'historique
function reprintTicket(ticketId) {
    const ticket = APP_STATE.ticketsHistory.find(t => t.id === ticketId || t.ticket_id === ticketId);
    if (!ticket) {
        alert("Tikè pa jwenn!");
        return;
    }
    // Réutilise la fonction d'impression définie dans cartManager.js
    printThermalTicket(ticket);
}

async function loadReports() {
    try {
        const tickets = await fetchTickets();
        APP_STATE.ticketsHistory = tickets;
        
        const reports = await APIService.getReports();
        
        let totalTickets = 0;
        let totalBets = 0;
        let totalWins = 0;
        let totalLoss = 0;
        
        if (reports && reports.total_tickets !== undefined) {
            totalTickets = reports.total_tickets || 0;
            totalBets = reports.total_bets || 0;
            totalWins = reports.total_wins || 0;
            totalLoss = reports.total_loss || 0;
        } else {
            totalTickets = APP_STATE.ticketsHistory.length;
            
            APP_STATE.ticketsHistory.forEach(ticket => {
                const ticketAmount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
                totalBets += ticketAmount;
                
                if (ticket.checked || ticket.verified) {
                    const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                    if (winAmount > 0) {
                        totalWins += winAmount;
                    } else {
                        totalLoss += ticketAmount;
                    }
                }
            });
        }
        
        const totalProfit = totalBets - totalWins;
        
        document.getElementById('total-tickets').textContent = totalTickets;
        document.getElementById('total-bets').textContent = totalBets.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-wins').textContent = totalWins.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('total-loss').textContent = totalLoss.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').textContent = totalProfit.toLocaleString('fr-FR') + ' Gdes';
        document.getElementById('balance').style.color = (totalProfit >= 0) ? 'var(--success)' : 'var(--danger)';
        
        const drawSelector = document.getElementById('draw-report-selector');
        drawSelector.innerHTML = '<option value="all">Tout Tiraj</option>';
        
        CONFIG.DRAWS.forEach(draw => {
            const option = document.createElement('option');
            option.value = draw.id;
            option.textContent = draw.name;
            drawSelector.appendChild(option);
        });
        
        await loadDrawReport('all');
        
        // 🔧 Forcer l'affichage du bouton d'impression des rapports
        const printBtn = document.querySelector('.print-report-btn');
        if (printBtn) {
            printBtn.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Erreur chargement rapports:', error);
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
        
        if (selectedDrawId === 'all') {
            const totalTickets = parseInt(document.getElementById('total-tickets').textContent) || 0;
            const totalBetsText = document.getElementById('total-bets').textContent;
            const totalWinsText = document.getElementById('total-wins').textContent;
            const totalLossText = document.getElementById('total-loss').textContent;
            
            const totalBets = parseFloat(totalBetsText.replace(/[^0-9.]/g, '')) || 0;
            const totalWins = parseFloat(totalWinsText.replace(/[^0-9.]/g, '')) || 0;
            const totalLoss = parseFloat(totalLossText.replace(/[^0-9.]/g, '')) || 0;
            const balance = totalBets - totalWins;
            
            document.getElementById('draw-report-card').style.display = 'block';
            document.getElementById('draw-total-tickets').textContent = totalTickets;
            document.getElementById('draw-total-bets').textContent = totalBets.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-total-wins').textContent = totalWins.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-total-loss').textContent = totalLoss.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-balance').textContent = balance.toLocaleString('fr-FR') + ' Gdes';
            document.getElementById('draw-balance').style.color = (balance >= 0) ? 'var(--success)' : 'var(--danger)';
        } else {
            const drawTickets = APP_STATE.ticketsHistory.filter(t => 
                t.draw_id === selectedDrawId || t.drawId === selectedDrawId
            );
            
            let drawTotalTickets = drawTickets.length;
            let drawTotalBets = 0;
            let drawTotalWins = 0;
            let drawTotalLoss = 0;
            
            drawTickets.forEach(ticket => {
                const ticketAmount = parseFloat(ticket.total_amount || ticket.totalAmount || ticket.amount || 0);
                drawTotalBets += ticketAmount;
                
                if (ticket.checked || ticket.verified) {
                    const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
                    if (winAmount > 0) {
                        drawTotalWins += winAmount;
                    } else {
                        drawTotalLoss += ticketAmount;
                    }
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
        }
        
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
    
    const tickets = selectedDrawId === 'all' 
        ? APP_STATE.ticketsHistory 
        : APP_STATE.ticketsHistory.filter(t => t.draw_id === selectedDrawId || t.drawId === selectedDrawId);
    
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
    
    const lotteryConfig = APP_STATE.lotteryConfig || CONFIG;
    const content = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Rapò ${selectedDraw}</title>
        <style>
            @page { size: A4; margin: 2cm; }
            body { font-family: 'Arial', sans-serif; line-height: 1.5; color: #222; }
            .header { text-align: center; margin-bottom: 30px; }
            .header h1 { font-size: 24px; margin: 5px 0; color: #000; }
            .header h2 { font-size: 18px; font-weight: normal; color: #333; }
            .header p { margin: 2px 0; font-size: 14px; }
            .section { margin: 20px 0; }
            .section h3 { border-bottom: 2px solid #000; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #aaa; padding: 8px; text-align: left; }
            th { background-color: #eee; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
            .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px; }
            .summary p { margin: 5px 0; font-size: 16px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${lotteryConfig.LOTTERY_NAME || 'LOTERIE'}</h1>
            <h2>Rapò Vann ${selectedDraw}</h2>
            <p>Dat: ${new Date().toLocaleDateString('fr-FR')}</p>
            <p>Ajan: ${APP_STATE.agentName}</p>
        </div>
        
        <div class="section">
            <h3>Rekapitilatif</h3>
            <table>
                <tr><th>Total Tikè</th><td>${totalTickets}</td></tr>
                <tr><th>Total Paris</th><td>${totalBets.toLocaleString('fr-FR')} Gdes</td></tr>
                <tr><th>Total Ganyen</th><td>${totalWins.toLocaleString('fr-FR')} Gdes</td></tr>
                <tr><th>Pèdi</th><td>${totalLoss.toLocaleString('fr-FR')} Gdes</td></tr>
                <tr class="total-row"><th>Balans</th><td>${balance.toLocaleString('fr-FR')} Gdes</td></tr>
            </table>
        </div>
        
        <div class="section">
            <h3>Detay Tikè</h3>
            <table>
                <thead>
                    <tr><th>N° Tikè</th><th>Tiraj</th><th>Lè</th><th>Montan</th><th>Ganyen</th></tr>
                </thead>
                <tbody>
                    ${tickets.map(t => `
                        <tr>
                            <td>${t.ticket_id || t.id}</td>
                            <td>${t.draw_name || ''}</td>
                            <td>${new Date(t.date).toLocaleTimeString('fr-FR')}</td>
                            <td>${(t.total_amount || t.amount || 0).toLocaleString('fr-FR')} Gdes</td>
                            <td>${(t.win_amount || 0).toLocaleString('fr-FR')} Gdes</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            <p>Rapò jenere le: ${new Date().toLocaleString('fr-FR')}</p>
            <p>© ${lotteryConfig.LOTTERY_NAME} - Tout dwa rezève</p>
        </div>
    </body>
    </html>
    `;
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

async function loadWinners() {
    try {
        await APIService.getWinningTickets();
        await APIService.getWinningResults();
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
    const totalAmount = winningTickets.reduce((sum, ticket) => {
        const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0);
        return sum + winAmount;
    }, 0);
    const averageWin = totalWins > 0 ? totalAmount / totalWins : 0;
    
    document.getElementById('total-winners-today').textContent = totalWins;
    document.getElementById('total-winning-amount').textContent = totalAmount.toLocaleString('fr-FR') + ' Gdes';
    document.getElementById('average-winning').textContent = averageWin.toFixed(2).toLocaleString('fr-FR') + ' Gdes';
    
    container.innerHTML = winningTickets.map(ticket => {
        const isPaid = ticket.paid || false;
        const winningResults = APP_STATE.winningResults.find(r => 
            r.draw_id === (ticket.draw_id || ticket.drawId)
        );
        const resultStr = winningResults ? winningResults.numbers.join(', ') : 'N/A';
        
        const betAmount = parseFloat(ticket.bet_amount || ticket.total_amount || ticket.amount || 0) || 0;
        const winAmount = parseFloat(ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0) || 0;
        const netProfit = winAmount - betAmount;
        
        return `
            <div class="winner-ticket">
                <div class="winner-header">
                    <div>
                        <strong>Tikè #${ticket.ticket_id || ticket.id}</strong>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            ${ticket.draw_name || ticket.drawName} - ${new Date(ticket.date || ticket.created_at).toLocaleDateString('fr-FR')}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: var(--success); font-size: 1.1rem;">
                            ${winAmount.toLocaleString('fr-FR')} Gdes
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-dim);">
                            (Mise: ${betAmount.toLocaleString('fr-FR')}G | Net: ${netProfit.toLocaleString('fr-FR')}G)
                        </div>
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
    const ticket = APP_STATE.ticketsHistory.find(t => 
        t.id === ticketId || t.ticket_id === ticketId
    );
    
    if (!ticket) {
        alert(`Tikè pa jwenn! ID: ${ticketId}\nTotal tickets disponibles: ${APP_STATE.ticketsHistory.length}`);
        return;
    }
    
    const drawName = ticket.draw_name || ticket.drawName || ticket.draw_name_fr || 'Tiraj Inkonu';
    const totalAmount = ticket.total_amount || ticket.totalAmount || ticket.amount || 0;
    const date = ticket.date || ticket.created_at || ticket.created_date || new Date().toISOString();
    const winAmount = ticket.win_amount || ticket.winAmount || ticket.prize_amount || 0;
    const checked = ticket.checked || ticket.verified || false;
    
    let details = `
        <h3>Detay Tikè #${ticket.ticket_id || ticket.id || 'N/A'}</h3>
        <p><strong>Tiraj:</strong> ${drawName}</p>
        <p><strong>Dat:</strong> ${new Date(date).toLocaleString('fr-FR')}</p>
        <p><strong>Total Mis:</strong> ${totalAmount} Gdes</p>
        <p><strong>Statis:</strong> ${checked ? (winAmount > 0 ? 'GANYEN' : 'PÈDI') : 'AP TANN'}</p>
        ${winAmount > 0 ? `
            <p><strong>Ganyen Total:</strong> ${winAmount} Gdes</p>
            <p><strong>Pwofi Net:</strong> ${winAmount - totalAmount} Gdes</p>
        ` : ''}
        <hr>
        <h4>Paray yo:</h4>
    `;
    
    let bets = [];
    
    if (Array.isArray(ticket.bets)) {
        bets = ticket.bets;
    } else if (Array.isArray(ticket.numbers)) {
        bets = ticket.numbers;
    } else if (typeof ticket.bets === 'string') {
        try {
            bets = JSON.parse(ticket.bets);
        } catch (e) {
            bets = [{ number: ticket.bets, amount: totalAmount }];
        }
    } else if (ticket.bets && typeof ticket.bets === 'object') {
        bets = Object.entries(ticket.bets).map(([key, value]) => {
            return { number: key, amount: value };
        });
    } else {
        bets = [{ number: 'N/A', amount: totalAmount }];
    }
    
    if (!Array.isArray(bets)) {
        bets = [bets];
    }
    
    if (bets.length === 0) {
        details += `<p>Pa gen detay paryaj</p>`;
    } else {
        bets.forEach((bet, index) => {
            if (!bet) return;
            
            let gameName = (bet.game || '').toUpperCase() || 'BORLETTE';
            if (bet.specialType) gameName = bet.specialType;
            if (bet.option) gameName += ` (Opsyon ${bet.option})`;
            
            const betNumber = bet.number || bet.numero || bet.n || 'N/A';
            const betAmount = bet.amount || bet.montant || bet.a || 0;
            const betGain = bet.gain || bet.prize || 0;
            
            let betDetails = `${gameName} ${betNumber} - ${betAmount} Gdes`;
            if (betGain) {
                const netGain = betGain - betAmount;
                betDetails += ` (Genyen: ${betGain}G | Net: ${netGain}G)`;
            }
            details += `<p>${betDetails}</p>`;
        });
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 3000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: var(--bg);
        padding: 20px;
        border-radius: 20px;
        max-width: 90%;
        max-height: 80%;
        overflow-y: auto;
        border: 2px solid var(--primary);
    `;
    
    modalContent.innerHTML = `
        <div style="text-align: left;">
            ${details}
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
            background: var(--primary);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 10px;
            margin-top: 20px;
            cursor: pointer;
        ">
            Fèmen
        </button>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').innerText = now.toLocaleTimeString('fr-FR');
    
    if (APP_STATE.currentTab === 'home' || APP_STATE.currentTab === 'betting') {
        checkSelectedDrawStatus();
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
        const config = await APIService.getLotteryConfig();
        if (config) {
            APP_STATE.lotteryConfig = config;
            
            document.getElementById('lottery-name').innerHTML = `${config.name} <span class="pro-badge">vession 6</span>`;
            
            const sloganEl = document.getElementById('lottery-slogan');
            if (sloganEl) sloganEl.textContent = config.slogan || '';

            CONFIG.LOTTERY_NAME = config.name;
            CONFIG.LOTTERY_LOGO = config.logo || '';
            CONFIG.LOTTERY_ADDRESS = config.address || '';
            CONFIG.LOTTERY_PHONE = config.phone || '';
        }
    } catch (error) {
        console.error('Erreur chargement configuration:', error);
    }
}

function logout() {
    if (!confirm('Èske ou sèten ou vle dekonekte?')) return;

    const token = localStorage.getItem('auth_token');
    
    fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .catch(err => console.error('Erreur lors de la déconnexion côté serveur:', err))
    .finally(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('agent_id');
        localStorage.removeItem('agent_name');
        localStorage.removeItem('user_role');
        
        window.location.href = 'index.html';
    });
}

// Exposer les fonctions globales
window.editTicket = editTicket;
window.deleteTicket = deleteTicket;
window.deleteTicketFromCard = deleteTicketFromCard;
window.viewTicketDetails = viewTicketDetails;
window.markAsPaid = markAsPaid;
window.printReport = printReport;
window.loadDrawReport = loadDrawReport;
window.logout = logout;
window.reprintTicket = reprintTicket;
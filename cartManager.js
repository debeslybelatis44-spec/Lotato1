// cartManager.js - VERSION FINALE CORRIGÉE

// 1. UTILITAIRES DE VÉRIFICATION
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers && APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = (APP_STATE.drawBlockedNumbers && APP_STATE.drawBlockedNumbers[drawId]) || [];
    return drawBlocked.includes(number);
}

// 2. OBJET CARTMANAGER (GESTION DU PANIER)
var CartManager = {
    addBet() {
        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit. Ou pa ka ajoute plis paray.");
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');
        let num = numInput.value.trim();
        const amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Tanpri antre yon montan ki valid");
            return;
        }

        // Cas spécial pour 'BO' (Boules paires)
        if (APP_STATE.selectedGame === 'bo') {
            const boBets = (typeof SpecialGames !== 'undefined') ? SpecialGames.generateBOBets(amt) : [];
            if (boBets.length === 0) return;
            
            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            draws.forEach(drawId => {
                boBets.forEach(bet => {
                    const newBet = { 
                        ...bet, 
                        id: Date.now() + Math.random(), 
                        drawId: drawId, 
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId).name 
                    };
                    APP_STATE.currentCart.push(newBet);
                });
            });
            this.renderCart();
            amtInput.value = '';
            return;
        }

        // Validation normale des numéros
        if (typeof GameEngine !== 'undefined' && !GameEngine.validateEntry(APP_STATE.selectedGame, num)) {
            alert("Nimewo sa pa bon pou jwèt sa a");
            return;
        }

        const cleanNum = (typeof GameEngine !== 'undefined') ? GameEngine.getCleanNumber(num) : num;
        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
        
        draws.forEach(drawId => {
            APP_STATE.currentCart.push({
                id: Date.now() + Math.random(),
                game: APP_STATE.selectedGame,
                number: cleanNum,
                amount: amt,
                drawId: drawId,
                drawName: CONFIG.DRAWS.find(d => d.id === drawId).name
            });
        });
        
        this.renderCart();
        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(item => item.id.toString() !== id.toString());
        this.renderCart();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const totalDisplay = document.getElementById('cart-total-display');
        const summary = document.getElementById('cart-summary');

        if (!display) return;

        if (APP_STATE.currentCart.length === 0) {
            display.innerHTML = '<div class="empty-msg" style="text-align:center; padding:20px; color:#999;">Panyen an vid</div>';
            if (totalDisplay) totalDisplay.innerText = "0 Gdes";
            if (summary) summary.style.display = 'none';
            return;
        }

        let total = 0;
        display.innerHTML = APP_STATE.currentCart.map(item => {
            total += item.amount;
            return `
                <div class="cart-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                    <div>
                        <strong style="text-transform:uppercase;">${item.game} ${item.number}</strong><br>
                        <small style="color:gray;">${item.drawName}</small>
                    </div>
                    <div style="display:flex; align-items:center;">
                        <span style="font-weight:bold; margin-right:15px;">${item.amount} G</span>
                        <button onclick="CartManager.removeBet('${item.id}')" style="background:red; color:white; border:none; border-radius:3px; cursor:pointer;">X</button>
                    </div>
                </div>
            `;
        }).join('');

        if (totalDisplay) totalDisplay.innerText = total.toLocaleString() + " Gdes";
        if (summary) summary.style.display = 'block';
    }
};

// 3. LOGIQUE D'IMPRESSION (FIXÉE)
function printThermalTicket(ticket) {
    const lotName = CONFIG.LOTTERY_NAME || "LOTERIE";
    const ticketId = ticket.ticket_id || ticket.id || '---';
    
    let betsHtml = (ticket.bets || []).map(b => `
        <div style="display:flex; justify-content:space-between; margin:4px 0; font-family:monospace; font-size:15px;">
            <span>${(b.game || '').toUpperCase()} ${(b.number || b.numero)}</span>
            <span>${(b.amount || 0)} G</span>
        </div>
    `).join('');

    const content = `
    <html>
    <head><meta charset="UTF-8">
    <style>
        body { width: 75mm; font-family: 'Courier New', monospace; padding: 10px; margin: 0; }
        .h { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
        .t { font-size: 20px; font-weight: bold; display: flex; justify-content: space-between; border-top: 2px solid #000; margin-top: 10px; padding-top: 5px; }
        .f { text-align: center; margin-top: 15px; font-size: 11px; }
    </style>
    </head>
    <body>
        <div class="h">
            <h2 style="margin:0;">${lotName}</h2>
            <div style="font-size:11px;">Dat: ${new Date(ticket.date).toLocaleString('fr-FR')}</div>
            <div style="font-size:11px;">Tiraj: <b>${ticket.draw_name}</b></div>
        </div>
        <div>${betsHtml}</div>
        <div class="t"><span>TOTAL:</span> <span>${(ticket.total_amount || ticket.total)} G</span></div>
        <div class="f">Mèsi! Bòn Chans!<br><b># ${ticketId}</b></div>
    </body>
    </html>`;

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(content);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); }, 500);
    } else {
        alert("Pèmèt pop-ups yo!");
    }
}

// 4. SAUVEGARDE FINALE
async function processFinalTicket() {
    if (APP_STATE.currentCart.length === 0) return;

    try {
        const ticketData = {
            agentId: APP_STATE.agentId,
            drawId: APP_STATE.selectedDraw,
            drawName: CONFIG.DRAWS.find(d => d.id === APP_STATE.selectedDraw).name,
            bets: APP_STATE.currentCart,
            total: APP_STATE.currentCart.reduce((sum, b) => sum + b.amount, 0)
        };

        const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(ticketData)
        });

        const result = await response.json();
        if (response.ok && result.success) {
            printThermalTicket(result.ticket);
            APP_STATE.currentCart = [];
            CartManager.renderCart();
            if (window.loadHistory) window.loadHistory();
        } else {
            alert("Erè: " + (result.message || "Echèk"));
        }
    } catch (e) {
        alert("Pwoblèm koneksyon");
    }
}

// Rendre les fonctions accessibles
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;

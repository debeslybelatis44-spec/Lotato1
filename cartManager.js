// ==========================
// cartManager.js (FIXED)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Cart Manager ----------
var CartManager = {

    addBet() {
        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit.");
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');

        let num = numInput.value.trim();
        const amt = parseFloat(amtInput.value);

        if (isNaN(amt) || amt <= 0) {
            alert("Montan pa valid");
            return;
        }

        if (!GameEngine.validateEntry(APP_STATE.selectedGame, num)) {
            alert("Nimewo pa valid");
            return;
        }

        num = GameEngine.getCleanNumber(num);

        const draws = APP_STATE.multiDrawMode
            ? APP_STATE.selectedDraws
            : [APP_STATE.selectedDraw];

        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) {
                alert(`Nimewo ${num} bloke`);
                return;
            }
        }

        draws.forEach(drawId => {
            APP_STATE.currentCart.push({
                id: Date.now() + Math.random(),
                game: APP_STATE.selectedGame,
                number: num,
                cleanNumber: num,
                amount: amt,
                drawId,
                drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId,
                timestamp: new Date().toISOString()
            });
        });

        this.renderCart();
        numInput.value = '';
        amtInput.value = '';
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.renderCart();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const totalEl = document.getElementById('cart-total-display');

        if (!APP_STATE.currentCart.length) {
            display.innerHTML = '<div class="empty-msg">Panye vid</div>';
            totalEl.innerText = '0 Gdes';
            return;
        }

        let total = 0;

        display.innerHTML = APP_STATE.currentCart.map(bet => {
            total += bet.amount;
            return `
                <div class="cart-item">
                    <span>${bet.game.toUpperCase()} ${bet.number}</span>
                    <span>${bet.amount} G</span>
                    <button onclick="CartManager.removeBet('${bet.id}')">✕</button>
                </div>
            `;
        }).join('');

        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
    }
};

// ---------- Save & Print Ticket ----------
async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) {
        alert("Panye vid");
        return;
    }

    const betsByDraw = {};
    APP_STATE.currentCart.forEach(b => {
        if (!betsByDraw[b.drawId]) betsByDraw[b.drawId] = [];
        betsByDraw[b.drawId].push(b);
    });

    try {
        for (const drawId in betsByDraw) {
            const bets = betsByDraw[drawId];
            const total = bets.reduce((s, b) => s + b.amount, 0);

            const payload = {
                agentId: APP_STATE.agentId,
                agentName: APP_STATE.agentName,
                drawId,
                drawName: bets[0].drawName,
                bets,
                total
            };

            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Erreur serveur");

            const data = await res.json();
            printThermalTicket(data.ticket);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }

        APP_STATE.currentCart = [];
        CartManager.renderCart();

        alert("✅ Tikè sove & enprime");

    } catch (err) {
        console.error(err);
        alert("❌ Erè pandan enpresyon");
    }
}

// ---------- PRINT (FIXED: using hidden iframe to avoid popup blocker) ----------
function printThermalTicket(ticket) {
    const html = generateTicketHTML(ticket);

    // Créer une iframe cachée
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.top = '-1000px';
    iframe.style.left = '-1000px';
    document.body.appendChild(iframe);

    // Attendre que l'iframe soit prête
    iframe.onload = function () {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ticket</title>
                <style>
                    @page { size: 80mm auto; margin: 2mm; }
                    body {
                        font-family: monospace;
                        font-size: 11px;
                        width: 76mm;
                        margin: 0 auto;
                    }
                </style>
            </head>
            <body>
                ${html}
            </body>
            </html>
        `);
        doc.close();

        // Lancer l'impression
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        // Supprimer l'iframe après impression (avec un délai pour éviter la suppression trop rapide)
        setTimeout(() => {
            document.body.removeChild(iframe);
        }, 1000);
    };

    // Déclencher l'écriture (l'événement onload se chargera du reste)
    iframe.src = 'about:blank';
}

// ---------- Ticket HTML ----------
function generateTicketHTML(ticket) {
    const cfg = APP_STATE.lotteryConfig || CONFIG;

    const betsHTML = (ticket.bets || []).map(b => `
        <div style="display:flex;justify-content:space-between;">
            <span>${b.game.toUpperCase()} ${b.number}</span>
            <span>${b.amount} G</span>
        </div>
    `).join('');

    return `
        <div style="text-align:center;border-bottom:1px solid #000;">
            <strong>${cfg.LOTTERY_NAME || 'LOTATO'}</strong><br>
            <small>${cfg.slogan || ''}</small>
        </div>

        <div>
            <p>Ticket #: ${ticket.ticket_id || ticket.id}</p>
            <p>Tiraj: ${ticket.draw_name}</p>
            <p>Date: ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p>Ajan: ${ticket.agent_name}</p>
        </div>

        <hr>
        ${betsHTML}
        <hr>

        <div style="display:flex;justify-content:space-between;font-weight:bold;">
            <span>TOTAL</span>
            <span>${ticket.total_amount || ticket.total} Gdes</span>
        </div>

        <div style="text-align:center;margin-top:10px;">
            <p>Mèsi & Bòn Chans</p>
        </div>
    `;
}

// ---------- Global ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
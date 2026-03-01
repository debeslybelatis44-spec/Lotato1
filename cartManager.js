// cartManager.js complet
// ==========================
// cartManager.js (FINAL - ajustements supplémentaires)
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

// ---------- PRINT (fenêtre pop-up) ----------
function printThermalTicket(ticket) {
    const html = generateTicketHTML(ticket);

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) {
        alert("Veuillez autoriser les pop-ups pour imprimer le ticket.");
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ticket</title>
            <style>
                @page {
                    size: 80mm auto;
                    margin: 2mm;
                }
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 30px; /* Texte général */
                    width: 76mm;
                    margin: 0 auto;
                    padding: 4mm;
                    background: white;
                    color: black;
                }
                .header {
                    text-align: center !important;
                    border-bottom: 2px dashed #000;
                    padding-bottom: 12px;
                    margin-bottom: 12px;
                }
                .header img {
                    display: block !important;
                    margin: 0 auto 10px auto !important;
                    max-height: 250px; /* Logo agrandi */
                    max-width: 100%;
                }
                .header strong {
                    display: block;
                    font-size: 34px;
                }
                .header small {
                    display: block;
                    font-size: 22px;
                    color: #555;
                }
                .info {
                    margin: 10px 0;
                }
                .info p {
                    margin: 5px 0;
                }
                hr {
                    border: none;
                    border-top: 2px dashed #000;
                    margin: 10px 0;
                }
                .bet-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    margin-top: 10px;
                    font-size: 34px; /* Total */
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-style: italic;
                    font-size: 26px; /* Footer */
                }
            </style>
        </head>
        <body>
            ${html}
        </body>
        </html>
    `);
    printWindow.document.close();

    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

// ---------- Ticket HTML ----------
function generateTicketHTML(ticket) {
    const cfg = APP_STATE.lotteryConfig || CONFIG;

    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    const slogan = cfg.slogan || '';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';

    // MODIFICATION : ajout de la mention (gratuit) pour les paris gratuits
    const betsHTML = (ticket.bets || []).map(b => {
        const freeLabel = b.free ? ' (gratuit)' : '';
        return `
            <div class="bet-row">
                <span>${b.game?.toUpperCase() || ''} ${b.number || ''}${freeLabel}</span>
                <span>${b.amount || 0} G</span>
            </div>
        `;
    }).join('');

    return `
        <div class="header">
            ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : ''}
            <strong>${lotteryName}</strong>
            ${slogan ? `<small>${slogan}</small>` : ''}
        </div>

        <div class="info">
            <p>Ticket #: ${ticket.ticket_id || ticket.id}</p>
            <p>Tiraj: ${ticket.draw_name || ticket.drawName || ''}</p>
            <p>Date: ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p>Ajan: ${ticket.agent_name || ticket.agentName || ''}</p>
        </div>

        <hr>
        ${betsHTML}
        <hr>

        <div class="total-row">
            <span>TOTAL</span>
            <span>${ticket.total_amount || ticket.total || 0} Gdes</span>
        </div>

        <div class="footer">
            <p>tickets valable jusqu'à 90 jours</p>
        </div>
    `;
}

// ---------- Global ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
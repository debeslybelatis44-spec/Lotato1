// ============================================================================
// cartManager.js - Version finale avec ticket unique (multi-tirage supporté côté serveur)
// ============================================================================

// ---------- Utilitaire date ----------
function normalizeDateString(dateStr) {
    if (!dateStr) return null;
    return dateStr.replace(' ', 'T');
}

// ---------- Configuration par défaut ----------
const CONFIG = {
    LOTTERY_NAME: 'LOTATO',
    name: 'LOTATO',
    slogan: '',
    logoUrl: '',
    address: '',
    phone_numbers: ''
};

// ---------- Paramètres avancés (mariages gratuits, etc.) ----------
async function loadAdvancedSettings() {
    if (!APP_STATE.advancedSettings) {
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_CONFIG.BASE_URL}/agent/advanced-settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                APP_STATE.advancedSettings = await res.json();
            } else {
                APP_STATE.advancedSettings = {
                    freeMarriage: {
                        tiers: [
                            { min: 100, max: 500, count: 4 },
                            { min: 501, max: 1500, count: 4 },
                            { min: 1501, max: null, count: 4 }
                        ],
                        winAmount: 1000
                    },
                    print: { fontSize: 24 },
                    footer: {
                        line1: "tickets valable jusqu'à 90 jours",
                        line2: "",
                        line3: "LOTATO S.A."
                    }
                };
            }
        } catch (e) {
            console.error(e);
            APP_STATE.advancedSettings = {
                freeMarriage: {
                    tiers: [
                        { min: 100, max: 500, count: 4 },
                        { min: 501, max: 1500, count: 4 },
                        { min: 1501, max: null, count: 4 }
                    ],
                    winAmount: 2500
                },
                print: { fontSize: 25 },
                footer: {
                    line1: "tickets valable jusqu'à 90 jours",
                    line2: "",
                    line3: "LOTATO S.A."
                }
            };
        }
    }
    return APP_STATE.advancedSettings;
}

// ---------- Vérifications ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers?.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers?.[drawId] || [];
    return drawBlocked.includes(number);
}

function checkNumberLimit(number, drawId, amountToAdd) {
    const key = `${drawId}_${number}`;
    const limit = APP_STATE.numberLimits?.[key];
    if (!limit) return { success: true };

    const currentTotal = APP_STATE.currentCart
        .filter(bet => bet.drawId === drawId && bet.cleanNumber === number)
        .reduce((sum, bet) => sum + (bet.amount || 0), 0);

    const newTotal = currentTotal + amountToAdd;
    if (newTotal > limit) {
        return {
            success: false,
            message: `❌ Limite atteinte : ${number} (${drawId}) – max ${limit} G, déjà misé ${currentTotal} G, tentative ${amountToAdd} G.`
        };
    }
    return { success: true };
}

// ---------- CartManager (sans free bets côté front) ----------
var CartManager = {

    addBet() {
        if (APP_STATE.isDrawBlocked) {
            alert("Tiraj sa a ap rantre nan 3 minit.");
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');
        const amt = parseFloat(amtInput.value);
        if (isNaN(amt) || amt <= 0) {
            alert("Montan pa valid");
            return;
        }

        const game = APP_STATE.selectedGame;

        if (game === 'auto_marriage' || game === 'bo' || game === 'grap' || game === 'auto_lotto4' || game === 'auto_lotto5') {
            let autoBets = [];
            switch (game) {
                case 'auto_marriage': autoBets = GameEngine.generateAutoMarriageBets(amt); break;
                case 'bo': autoBets = SpecialGames.generateBOBets(amt); break;
                case 'grap': autoBets = SpecialGames.generateGRAPBets(amt); break;
                case 'auto_lotto4': autoBets = GameEngine.generateAutoLotto4Bets(amt); break;
                case 'auto_lotto5': autoBets = GameEngine.generateAutoLotto5Bets(amt); break;
            }
            if (autoBets.length === 0) {
                alert("Pa gen ase nimevo nan panye pou jenere " + game);
                return;
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            const errors = [];
            for (const drawId of draws) {
                for (const bet of autoBets) {
                    const number = bet.cleanNumber || bet.number;
                    const check = checkNumberLimit(number, drawId, amt);
                    if (!check.success) errors.push(check.message);
                }
            }
            if (errors.length > 0) { alert("❌ Limites dépassées :\n" + errors.join("\n")); return; }

            for (const drawId of draws) {
                for (const bet of autoBets) {
                    const number = bet.cleanNumber || bet.number;
                    if (isNumberBlocked(number, drawId)) {
                        alert(`❌ Nimewo ${number} bloke pou tiraj ${drawId}`);
                        return;
                    }
                }
            }

            draws.forEach(drawId => {
                const drawName = APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId;
                autoBets.forEach(bet => {
                    APP_STATE.currentCart.push({ ...bet, id: Date.now() + Math.random(), drawId, drawName });
                });
            });
            this.renderCart();
            amtInput.value = '';
            numInput.focus();
            return;
        }

        if (/^n[0-9]$/.test(game)) {
            const lastDigit = parseInt(game.substring(1), 10);
            const numbers = [];
            for (let tens = 0; tens <= 9; tens++) {
                numbers.push(tens.toString() + lastDigit.toString());
            }

            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            const errors = [];
            for (const drawId of draws) {
                for (const num of numbers) {
                    const check = checkNumberLimit(num, drawId, amt);
                    if (!check.success) errors.push(check.message);
                }
            }
            if (errors.length > 0) { alert("❌ Limites dépassées :\n" + errors.join("\n")); return; }

            for (const drawId of draws) {
                for (const num of numbers) {
                    if (isNumberBlocked(num, drawId)) {
                        alert(`❌ Nimewo ${num} bloke pou tiraj ${drawId}`);
                        return;
                    }
                }
            }

            draws.forEach(drawId => {
                const drawName = APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId;
                numbers.forEach(num => {
                    APP_STATE.currentCart.push({
                        id: Date.now() + Math.random(),
                        game, number: num, cleanNumber: num,
                        amount: amt, drawId, drawName,
                        timestamp: new Date().toISOString()
                    });
                });
            });
            this.renderCart();
            numInput.value = '';
            amtInput.value = '';
            numInput.focus();
            return;
        }

        let num = numInput.value.trim();
        if (!GameEngine.validateEntry(game, num)) { alert("Nimewo pa valid"); return; }
        num = GameEngine.getCleanNumber(num);

        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
        const errors = [];
        for (const drawId of draws) {
            const check = checkNumberLimit(num, drawId, amt);
            if (!check.success) errors.push(check.message);
        }
        if (errors.length > 0) { alert("❌ Limites dépassées :\n" + errors.join("\n")); return; }

        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) {
                alert(`❌ Nimewo ${num} bloke pou tiraj ${drawId}`);
                return;
            }
        }

        draws.forEach(drawId => {
            if (game === 'lotto4' || game === 'lotto5') {
                const optionBets = GameEngine.generateLottoBetsWithOptions(game, num, amt);
                optionBets.forEach(bet => {
                    APP_STATE.currentCart.push({
                        ...bet, drawId,
                        drawName: APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId
                    });
                });
            } else {
                APP_STATE.currentCart.push({
                    id: Date.now() + Math.random(),
                    game, number: num, cleanNumber: num,
                    amount: amt, drawId,
                    drawName: APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId,
                    timestamp: new Date().toISOString()
                });
            }
        });
        this.renderCart();
        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.renderCart();
    },

    renderCart() {
        const display = document.getElementById('cart-display');
        const totalEl = document.getElementById('cart-total-display');
        const itemsCount = document.getElementById('items-count');

        if (!APP_STATE.currentCart.length) {
            display.innerHTML = '<div class="empty-msg">Panye vid</div>';
            totalEl.innerText = '0 Gdes';
            if (itemsCount) itemsCount.innerText = '0 jwèt';
            return;
        }

        let total = 0;
        let count = 0;
        display.innerHTML = APP_STATE.currentCart.map(bet => {
            total += bet.amount;
            count++;
            const gameAbbr = getGameAbbreviation(bet.game, bet);
            let displayNumber = bet.number;
            if (bet.game === 'auto_marriage' && bet.number && bet.number.includes('&')) {
                displayNumber = bet.number.replace('&', '*');
            }
            return `
                <div class="cart-item">
                    <span>${gameAbbr} ${displayNumber}</span>
                    <span>${bet.amount} G</span>
                    <button onclick="CartManager.removeBet('${bet.id}')">✕</button>
                </div>
            `;
        }).join('');
        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
        if (itemsCount) itemsCount.innerText = count + ' jwèt';
    }
};

// ---------- Abréviation jeux ----------
function getGameAbbreviation(gameName, bet) {
    if (bet && bet.free && bet.freeType === 'special_marriage') return 'marg';
    const map = {
        'borlette': 'bor', 'lotto3': 'lo3', 'lotto4': 'lo4', 'lotto5': 'lo5',
        'auto_marriage': 'mara', 'auto_lotto4': 'loa4', 'auto_lotto5': 'loa5',
        'mariage': 'mar', 'lotto 3': 'lo3', 'lotto 4': 'lo4', 'lotto 5': 'lo5',
        'loto3': 'lo3', 'loto4': 'lo4', 'loto5': 'lo5',
        'bo': 'bo', 'grap': 'grap',
        'n0': 'n0', 'n1': 'n1', 'n2': 'n2', 'n3': 'n3', 'n4': 'n4',
        'n5': 'n5', 'n6': 'n6', 'n7': 'n7', 'n8': 'n8', 'n9': 'n9'
    };
    const key = (gameName || '').trim().toLowerCase();
    return map[key] || gameName;
}

// ---------- Détection Android WebView ----------
function isAndroidWebView() {
    return /Android/i.test(navigator.userAgent) && typeof window.AndroidPrint !== 'undefined';
}

// ---------- Impression du ticket (version unique) ----------
async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) {
        alert("Panye vid");
        return;
    }

    // Construire la liste unique des tirages sélectionnés
    const drawsMap = new Map();
    APP_STATE.currentCart.forEach(bet => {
        if (!drawsMap.has(bet.drawId)) {
            drawsMap.set(bet.drawId, {
                id: bet.drawId,
                name: bet.drawName
            });
        }
    });
    const draws = Array.from(drawsMap.values());

    // Transformer les paris pour l'envoi (enlever les IDs front)
    const bets = APP_STATE.currentCart.map(bet => ({
        game: bet.game,
        number: bet.number,
        cleanNumber: bet.cleanNumber,
        amount: bet.amount,
        drawId: bet.drawId,
        drawName: bet.drawName,
        free: bet.free || false,
        freeType: bet.freeType || null
    }));

    const payload = {
        draws,
        bets,
        agentId: APP_STATE.agentId,
        agentName: APP_STATE.agentName
    };

    let printWindow = null;
    if (!isAndroidWebView()) {
        printWindow = window.open('', '_blank', 'width=500,height=700');
        if (!printWindow) {
            alert("Autorisez les popups pour imprimer.");
            return;
        }
        printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px;text-align:center;">Génération du ticket en cours...</p></body></html>');
        printWindow.document.close();
    }

    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_CONFIG.BASE_URL}/api/tickets/save-multi`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            let errorMsg = "Erreur inconnue du serveur";
            try {
                const errorData = await res.json();
                errorMsg = errorData.error || errorData.message || JSON.stringify(errorData);
            } catch (e) {
                errorMsg = await res.text() || `HTTP ${res.status}`;
            }
            throw new Error(errorMsg);
        }

        const data = await res.json();
        const ticket = data.ticket;  // ticket unique avec draws, bets (incluant gratuits), total_amount, etc.

        // Ajouter à l'historique
        if (APP_STATE.ticketsHistory) {
            APP_STATE.ticketsHistory.unshift(ticket);
        } else {
            APP_STATE.ticketsHistory = [ticket];
        }

        // Impression
        if (isAndroidWebView()) {
            const ticketHTML = generateTicketHTML(ticket);
            const fullHTML = buildFullPrintHTML(ticketHTML);
            window.AndroidPrint.printHTML(fullHTML);
        } else {
            printTicket(ticket, printWindow);
        }

        // Vider le panier
        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("✅ Ticket enregistré et imprimé");

    } catch (err) {
        console.error(err);
        alert(`❌ ${err.message}`);
        if (printWindow && !printWindow.closed) printWindow.close();
    }
}

function printTicket(ticket, printWindow) {
    const html = generateTicketHTML(ticket);
    const fullHTML = buildFullPrintHTML(html);
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

function generateTicketHTML(ticket) {
    const cfg = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    const slogan = cfg.slogan || '';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';
    const address = cfg.address || '';
    const phoneNumbers = cfg.phone_numbers || '';

    let formattedDate = 'Date invalide';
    if (ticket.date) {
        const normalized = normalizeDateString(ticket.date);
        const dateObj = new Date(normalized);
        if (!isNaN(dateObj)) {
            formattedDate = dateObj.toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' }) + ' ' +
                            dateObj.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit' });
        }
    }

    // Liste des tirages (depuis ticket.draws)
    const drawsList = (ticket.draws || []).map(d => `<p style="margin-left: 1em;">• ${d.name}</p>`).join('');

    // Générer les lignes de paris (en incluant les gratuits)
    const betsHTML = (ticket.bets || []).map(b => {
        const gameAbbr = getGameAbbreviation(b.game || '', b);
        let displayNumber = b.number || '';
        if (b.game === 'auto_marriage' && displayNumber.includes('&')) {
            displayNumber = displayNumber.replace('&', '*');
        }
        // Afficher (GRATUIT) si c'est un pari gratuit
        const gratis = b.free ? ' (GRATUIT)' : '';
        return `<div class="bet-row"><span>${gameAbbr} ${displayNumber}${gratis}</span><span>${b.amount || 0} G</span></div>`;
    }).join('');

    let headerHTML = `<div class="header">`;
    if (logoUrl) headerHTML += `<img src="${logoUrl}" alt="Logo">`;
    headerHTML += `<div class="lottery-name">${lotteryName}</div>`;
    if (slogan) headerHTML += `<div class="slogan">${slogan}</div>`;
    if (address) headerHTML += `<div class="address">${address}</div>`;
    if (phoneNumbers) headerHTML += `<div class="phone">${phoneNumbers}</div>`;
    headerHTML += `</div>`;

    const infoHTML = `
        <div class="info">
            <p>Ticket #: ${ticket.ticket_id}</p>
            <p>Tirages:</p>
            ${drawsList}
            <p>Date: ${formattedDate}</p>
            <p>Agent: ${ticket.agent_name || ''}</p>
        </div>
    `;

    const footerHTML = `
        <div class="footer">
            <p>tickets valable 90 jours</p>
            <p><strong>LOTATO S.A.</strong></p>
        </div>
    `;

    return `
        ${headerHTML}
        ${infoHTML}
        <hr>
        ${betsHTML}
        <hr>
        <div class="total-row">
            <span>TOTAL:</span>
            <span>${ticket.total_amount} Gdes</span>
        </div>
        ${footerHTML}
    `;
}

function buildFullPrintHTML(bodyHTML) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page { size: 80mm auto; margin: 2mm; }
    body {
        font-family: 'Courier New', monospace;
        font-weight: bold;
        width: 76mm;
        margin: 0 auto;
        padding: 4mm;
        background: white;
        color: black;
    }
    .header {
        text-align: center;
        border-bottom: 2px solid #000;
        padding-bottom: 8px;
        margin-bottom: 12px;
    }
    .header img {
        display: block;
        margin: 0 auto;
        max-height: 100px;
        max-width: 80%;
    }
    .header .lottery-name {
        font-size: 30px;
        font-weight: bold;
        letter-spacing: 1px;
        margin: 4px 0;
    }
    .header .slogan, .header .address, .header .phone {
        font-size: 17px;
        margin: 2px 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .info {
        margin: 8px 0;
        font-size: 17px;
    }
    .info p {
        margin: 3px 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    hr {
        border: none;
        border-top: 1px dashed #000;
        margin: 8px 0;
    }
    .bet-row {
        display: flex;
        justify-content: space-between;
        margin: 6px 0;
        font-weight: bold;
        font-size: 20px;
    }
    .total-row {
        display: flex;
        justify-content: space-between;
        font-weight: bold;
        margin-top: 12px;
        padding-top: 6px;
        border-top: 2px solid #000;
        font-size: 22px;
    }
    .footer {
        text-align: center;
        margin-top: 18px;
        font-size: 17px;
        font-weight: bold;
    }
    .footer p {
        margin: 5px 0;
    }
</style>
</head>
<body>${bodyHTML}</body>
</html>`;
}

// Chargement initial
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadAdvancedSettings());
} else {
    loadAdvancedSettings();
}

window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
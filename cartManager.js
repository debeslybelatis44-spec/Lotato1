// ==========================
// cartManager.js (corrigé - date normalisée sans forçage UTC)
// ==========================

// ---------- Fonction utilitaire pour normaliser une chaîne de date ----------
function normalizeDateString(dateStr) {
    if (!dateStr) return null;
    // Remplacer l'espace par 'T' pour un format ISO partiel
    let normalized = dateStr.replace(' ', 'T');
    // Ne pas ajouter 'Z' pour éviter de forcer UTC
    return normalized;
}

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// Vérifie si le montant dépasse la limite pour ce numéro et ce tirage
function checkNumberLimit(number, drawId, amountToAdd) {
    const key = `${drawId}_${number}`;
    const limit = APP_STATE.numberLimits[key];
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

// ---------- Génération aléatoire d'un mariage ----------
function generateRandomMarriageBet(amount) {
    const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return {
        game: 'auto_marriage',
        number: `${num1}&${num2}`,
        cleanNumber: `${num1}&${num2}`,
        amount: amount
    };
}

// ---------- Cart Manager ----------
var CartManager = {

    updateFreeMarriages() {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => !(b.free && b.freeType === 'special_marriage'));

        const payantsByDraw = {};
        APP_STATE.currentCart.forEach(bet => {
            if (bet.amount > 0) {
                if (!payantsByDraw[bet.drawId]) payantsByDraw[bet.drawId] = [];
                payantsByDraw[bet.drawId].push(bet);
            }
        });

        Object.keys(payantsByDraw).forEach(drawId => {
            const payants = payantsByDraw[drawId];
            const totalPayant = payants.reduce((sum, b) => sum + b.amount, 0);

            let requiredFree = 0;
            if (totalPayant >= 1 && totalPayant <= 50) requiredFree = 1;
            else if (totalPayant >= 51 && totalPayant <= 150) requiredFree = 2;
            else if (totalPayant >= 151) requiredFree = 3;

            for (let i = 0; i < requiredFree; i++) {
                const freeBet = generateRandomMarriageBet(0);
                const newFree = {
                    ...freeBet,
                    id: Date.now() + Math.random() + i,
                    drawId: drawId,
                    drawName: payants[0]?.drawName || 'Tiraj',
                    free: true,
                    freeType: 'special_marriage'
                };
                APP_STATE.currentCart.push(newFree);
            }
        });

        this.renderCart();
    },

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

        // --- Gestion des jeux automatiques ---
        if (game === 'auto_marriage' || game === 'bo' || game === 'grap' || game === 'auto_lotto4' || game === 'auto_lotto5') {
            let autoBets = [];
            switch (game) {
                case 'auto_marriage':
                    autoBets = GameEngine.generateAutoMarriageBets(amt);
                    break;
                case 'bo':
                    autoBets = SpecialGames.generateBOBets(amt);
                    break;
                case 'grap':
                    autoBets = SpecialGames.generateGRAPBets(amt);
                    break;
                case 'auto_lotto4':
                    autoBets = GameEngine.generateAutoLotto4Bets(amt);
                    break;
                case 'auto_lotto5':
                    autoBets = GameEngine.generateAutoLotto5Bets(amt);
                    break;
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
            if (errors.length > 0) {
                alert("❌ Limites dépassées :\n" + errors.join("\n"));
                return;
            }

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
                    APP_STATE.currentCart.push({
                        ...bet,
                        id: Date.now() + Math.random(),
                        drawId: drawId,
                        drawName: drawName
                    });
                });
            });

            this.updateFreeMarriages();
            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Gestion des jeux NX (n0 à n9) ---
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
            if (errors.length > 0) {
                alert("❌ Limites dépassées :\n" + errors.join("\n"));
                return;
            }

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
                        game: game,
                        number: num,
                        cleanNumber: num,
                        amount: amt,
                        drawId: drawId,
                        drawName: drawName,
                        timestamp: new Date().toISOString()
                    });
                });
            });

            this.updateFreeMarriages();
            numInput.value = '';
            amtInput.value = '';
            numInput.focus();
            return;
        }

        // --- Gestion des jeux normaux (saisie manuelle) ---
        let num = numInput.value.trim();

        if (!GameEngine.validateEntry(game, num)) {
            alert("Nimewo pa valid");
            return;
        }

        num = GameEngine.getCleanNumber(num);

        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];

        const errors = [];
        for (const drawId of draws) {
            const check = checkNumberLimit(num, drawId, amt);
            if (!check.success) errors.push(check.message);
        }
        if (errors.length > 0) {
            alert("❌ Limites dépassées :\n" + errors.join("\n"));
            return;
        }

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
                        ...bet,
                        drawId: drawId,
                        drawName: APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId
                    });
                });
            } else {
                APP_STATE.currentCart.push({
                    id: Date.now() + Math.random(),
                    game: game,
                    number: num,
                    cleanNumber: num,
                    amount: amt,
                    drawId: drawId,
                    drawName: APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId,
                    timestamp: new Date().toISOString()
                });
            }
        });

        this.updateFreeMarriages();
        numInput.value = '';
        amtInput.value = '';
        numInput.focus();
    },

    removeBet(id) {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => b.id != id);
        this.updateFreeMarriages();
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

// ---------- Fonction d'abréviation des jeux ----------
function getGameAbbreviation(gameName, bet) {
    if (bet && bet.free && bet.freeType === 'special_marriage') {
        return 'marg';
    }
    const map = {
        'borlette': 'bor',
        'lotto3': 'lo3',
        'lotto4': 'lo4',
        'lotto5': 'lo5',
        'auto_marriage': 'mara',
        'auto_lotto4': 'loa4',
        'auto_lotto5': 'loa5',
        'mariage': 'mar',
        'lotto 3': 'lo3',
        'lotto 4': 'lo4',
        'lotto 5': 'lo5',
        'loto3': 'lo3',
        'loto4': 'lo4',
        'loto5': 'lo5',
        'bo': 'bo',
        'grap': 'grap',
        'n0': 'n0',
        'n1': 'n1',
        'n2': 'n2',
        'n3': 'n3',
        'n4': 'n4',
        'n5': 'n5',
        'n6': 'n6',
        'n7': 'n7',
        'n8': 'n8',
        'n9': 'n9'
    };
    const key = (gameName || '').trim().toLowerCase();
    return map[key] || gameName;
}

// ---------- Save & Print Ticket ----------
async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) {
        alert("Panye vid");
        return;
    }

    // Vérifier si PrintBridge Sunmi est actif
    const sunmiActif = await isPrintBridgeActive();

    // Ouvrir popup seulement si pas de Sunmi
    let printWindow = null;
    if (!sunmiActif) {
        printWindow = window.open('', '_blank', 'width=500,height=700');
        if (!printWindow) {
            alert("Veuillez autoriser les pop-ups pour imprimer le ticket.");
            return;
        }
        printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px; text-align:center;">Génération du ticket en cours...</p></body></html>');
        printWindow.document.close();
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
            data.ticket.date = new Date().toISOString();
            await printThermalTicket(data.ticket, printWindow);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }

        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("✅ Tikè sove & enprime");

    } catch (err) {
        console.error('Erreur complète:', err);
        // Si Sunmi pas disponible, essayer fallback navigateur
        if (printWindow && !printWindow.closed) {
            // Le ticket a peut-être été sauvé, essayer d'imprimer quand même
            console.log('Tentative fallback impression navigateur');
        } else {
            alert("❌ Erè: " + (err.message || err));
        }
    }
}

// ---------- PRINT ----------
// ═══════════════════════════════════════════════════════════════
// LOTATO PRO - Impression Sunmi V2S via WebView Bridge
// ═══════════════════════════════════════════════════════════════

// Vérifie si le pont Sunmi est disponible (APK WebView)
async function isPrintBridgeActive() {
    return typeof window.SunmiBridge !== 'undefined' && window.SunmiBridge.isConnected();
}

// Impression ticket via SunmiBridge ou fallback navigateur
async function printThermalTicket(ticket, printWindow) {

    const cfg = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || 'https://lotato1.onrender.com/512.png';
    const drawName = ticket.draw_name || ticket.drawName || 'Tiraj';

    let formattedDate = '';
    if (ticket.date) {
        try {
            const d = new Date(ticket.date);
            formattedDate = d.toLocaleDateString('fr-FR') + ' ' +
                d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        } catch {}
    }

    const lines = [
        `Ticket #: ${ticket.ticket_id || ticket.id || ''}`,
        `Tiraj: ${drawName}`,
        `Date: ${formattedDate}`,
        `Ajan: ${ticket.agent_name || ticket.agentName || ''}`,
        `--------------------------------`,
    ];

    (ticket.bets || []).forEach(b => {
        const gameAbbr = typeof getGameAbbreviation === 'function'
            ? getGameAbbreviation(b.game || '', b) : (b.game || '');
        let num = b.number || '';
        if (b.game === 'auto_marriage') num = num.replace('&', '*');
        lines.push(`${gameAbbr} ${num}  ${b.amount || 0} G`);
    });

    lines.push(`--------------------------------`);
    lines.push(`TOTAL: ${ticket.total_amount || ticket.total || 0} Gdes`);
    lines.push(`tickets valable 90 jours`);
    lines.push(`LOTATO S.A.`);

    // ── Essayer Sunmi d'abord ────────────────────────────────────
    const sunmiActif = await isPrintBridgeActive();
    if (sunmiActif) {
        if (printWindow && !printWindow.closed) printWindow.close();
        try {
            window.SunmiBridge.printTicket(JSON.stringify({
                header: lotteryName,
                lines: lines,
                footer: 'Bonne chance!'
            }));
            console.log('✅ Ticket envoyé à Sunmi');
            return;
        } catch(e) {
            console.error('Erreur SunmiBridge:', e);
        }
    }

    // ── Fallback: popup navigateur avec bouton imprimer ──────────
    const html = generateTicketHTML(ticket);
    const popupHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ticket LOTATO</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; background: #f0f0f0; }
    
    /* Bouton imprimer - visible à l'écran, caché à l'impression */
    .print-btn {
        display: block;
        width: 100%;
        padding: 16px;
        background: #F0A500;
        color: #000;
        font-size: 18px;
        font-weight: bold;
        border: none;
        cursor: pointer;
        text-align: center;
    }
    .print-btn:hover { background: #d4920a; }

    @media print {
        .print-btn { display: none !important; }
        body { background: white; }
    }

    @page { size: 80mm auto; margin: 2mm; }

    .ticket {
        width: 76mm;
        margin: 0 auto;
        background: white;
        padding: 4mm;
        font-size: 22px;
        font-weight: bold;
        color: black;
    }
    .header { text-align: center; padding-bottom: 8px; border-bottom: 2px dashed #000; }
    .header img { display: block; margin: 0 auto 6px auto; max-width: 120px; max-height: 120px; }
    .header strong { display: block; font-size: 28px; }
    .info { margin: 8px 0; }
    .info p { margin: 4px 0; font-size: 18px; }
    hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
    .bet-row { display: flex; justify-content: space-between; font-size: 22px; margin: 3px 0; }
    .total-row { display: flex; justify-content: space-between; font-size: 26px; font-weight: bold; margin-top: 6px; }
    .footer { text-align: center; font-size: 18px; margin-top: 8px; }
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">🖨️ IMPRIMER LE TICKET</button>

<div class="ticket">
    <div class="header">
        <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">
        <strong>${lotteryName}</strong>
    </div>
    <div class="info">
        <p>Ticket #: ${ticket.ticket_id || ticket.id || ''}</p>
        <p>Tiraj: ${drawName}</p>
        <p>Date: ${formattedDate}</p>
        <p>Ajan: ${ticket.agent_name || ticket.agentName || ''}</p>
    </div>
    <hr>
    ${(ticket.bets || []).map(b => {
        const g = typeof getGameAbbreviation === 'function' ? getGameAbbreviation(b.game||'',b) : (b.game||'');
        let n = b.number || '';
        if (b.game === 'auto_marriage') n = n.replace('&','*');
        return `<div class="bet-row"><span>${g} ${n}</span><span>${b.amount||0} G</span></div>`;
    }).join('')}
    <hr>
    <div class="total-row">
        <span>TOTAL</span>
        <span>${ticket.total_amount || ticket.total || 0} Gdes</span>
    </div>
    <div class="footer">
        <p>tickets valable 90 jours</p>
        <p><strong>LOTATO S.A.</strong></p>
    </div>
</div>

</body>
</html>`;

    if (printWindow && !printWindow.closed) {
        printWindow.document.open();
        printWindow.document.write(popupHTML);
        printWindow.document.close();
    } else {
        // Ouvrir une nouvelle popup si nécessaire
        const w = window.open('', '_blank', 'width=420,height=700');
        if (w) {
            w.document.open();
            w.document.write(popupHTML);
            w.document.close();
        }
    }
}

window.printThermalTicket = printThermalTicket;
window.isPrintBridgeActive = isPrintBridgeActive;

// ---------- Ticket HTML ----------
function generateTicketHTML(ticket) {
    const cfg = APP_STATE.lotteryConfig || CONFIG;

    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    const slogan = cfg.slogan || '';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';

    // Normalisation de la date
    let formattedDate = 'Date invalide';
    if (ticket.date) {
        const normalized = normalizeDateString(ticket.date);
        const dateObj = new Date(normalized);
        if (!isNaN(dateObj)) {
            formattedDate = dateObj.toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' }) + ' ' + 
                            dateObj.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit' });
        }
    }

    // Récupération du nom du tirage
    let drawName = ticket.draw_name || ticket.drawName;
    if (!drawName && APP_STATE.draws && ticket.draw_id) {
        const draw = APP_STATE.draws.find(d => d.id == ticket.draw_id);
        drawName = draw ? draw.name : 'Tiraj Inkonu';
    } else if (!drawName) {
        drawName = 'Tiraj Inkonu';
    }

    const betsHTML = (ticket.bets || []).map(b => {
        const gameAbbr = getGameAbbreviation(b.game || '', b);
        let displayNumber = b.number || '';
        if (b.game === 'auto_marriage' && displayNumber.includes('&')) {
            displayNumber = displayNumber.replace('&', '*');
        }
        return `
            <div class="bet-row">
                <span>${gameAbbr} ${displayNumber}</span>
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
            <p>Tiraj: ${drawName}</p>
            <p>Date: ${formattedDate}</p>
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
            <p>Ref : +509 </p>
            <p><strong>LOTATO S.A.</strong></p>
        </div>
    `;
}

// ---------- Global ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
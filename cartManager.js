// ==========================
// cartManager.js (corrigé - gestion dynamique des gratuits avec seuils modifiés)
// ==========================

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

// ---------- Cart Manager ----------
var CartManager = {

    // Met à jour le nombre de mariages gratuits pour chaque tirage en fonction du total payant
    updateFreeMarriages() {
        // Regrouper les paris par drawId
        const betsByDraw = {};
        APP_STATE.currentCart.forEach(bet => {
            if (!betsByDraw[bet.drawId]) betsByDraw[bet.drawId] = [];
            betsByDraw[bet.drawId].push(bet);
        });

        // Pour chaque tirage
        Object.keys(betsByDraw).forEach(drawId => {
            const bets = betsByDraw[drawId];
            // Calculer le total des paris payants (amount > 0)
            const totalPayant = bets.reduce((sum, b) => sum + (b.amount > 0 ? b.amount : 0), 0);
            
            // Déterminer le nombre de gratuits requis selon les nouveaux seuils
            let requiredFree = 0;
            if (totalPayant >= 1 && totalPayant <= 200) requiredFree = 1;
            else if (totalPayant >= 201 && totalPayant <= 500) requiredFree = 2;
            else if (totalPayant >= 501) requiredFree = 3;

            // Compter les gratuits existants pour ce tirage
            const existingFree = bets.filter(b => b.free && b.freeType === 'special_marriage').length;

            // Trouver un modèle de pari normal (non gratuit) pour ce tirage
            const normalBet = bets.find(b => !b.free);
            if (!normalBet) {
                // Si pas de pari normal, on ne peut pas ajouter de gratuit (mais normalement il y en a)
                return;
            }

            if (existingFree < requiredFree) {
                // Ajouter des gratuits
                for (let i = 0; i < requiredFree - existingFree; i++) {
                    const newFree = {
                        ...normalBet,
                        id: Date.now() + Math.random() + i,
                        amount: 0,
                        free: true,
                        freeType: 'special_marriage'
                    };
                    APP_STATE.currentCart.push(newFree);
                }
            } else if (existingFree > requiredFree) {
                // Supprimer des gratuits en trop (on supprime les derniers ajoutés)
                const freeBets = bets.filter(b => b.free && b.freeType === 'special_marriage');
                const toRemove = existingFree - requiredFree;
                for (let i = 0; i < toRemove; i++) {
                    const lastFree = freeBets[freeBets.length - 1 - i];
                    if (lastFree) {
                        const index = APP_STATE.currentCart.findIndex(b => b.id === lastFree.id);
                        if (index !== -1) APP_STATE.currentCart.splice(index, 1);
                    }
                }
            }
        });

        // Re-rendre le panier
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
                    // On ne prend que les paris normaux, sans gratuits (ils seront ajoutés via updateFreeMarriages)
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

            // Récupérer les tirages sélectionnés
            const draws = APP_STATE.multiDrawMode
                ? APP_STATE.selectedDraws
                : [APP_STATE.selectedDraw];

            // Pour chaque tirage, ajouter une copie de chaque pari normal
            draws.forEach(drawId => {
                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
                autoBets.forEach(bet => {
                    APP_STATE.currentCart.push({
                        ...bet,
                        id: Date.now() + Math.random(), // nouvel ID unique
                        drawId: drawId,
                        drawName: drawName
                    });
                });
            });

            // Ajuster les gratuits en fonction du nouveau total
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

            const draws = APP_STATE.multiDrawMode
                ? APP_STATE.selectedDraws
                : [APP_STATE.selectedDraw];

            // Vérification des numéros bloqués
            for (const drawId of draws) {
                for (const num of numbers) {
                    if (isNumberBlocked(num, drawId)) {
                        alert(`Nimewo ${num} bloke pou tiraj sa a`);
                        return;
                    }
                }
            }

            // Ajout des paris
            draws.forEach(drawId => {
                const drawName = CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId;
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

            this.renderCart();
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
            if (game === 'lotto4' || game === 'lotto5') {
                const optionBets = GameEngine.generateLottoBetsWithOptions(game, num, amt);
                optionBets.forEach(bet => {
                    APP_STATE.currentCart.push({
                        ...bet,
                        drawId: drawId,
                        drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId
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
                    drawName: CONFIG.DRAWS.find(d => d.id === drawId)?.name || drawId,
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
        // Après suppression, on ajuste les gratuits
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

// ---------- Fonction d'abréviation des jeux (version courte) ----------
function getGameAbbreviation(gameName, bet) {
    // Cas spécial : mariage gratuit (freeType 'special_marriage')
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

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) {
        alert("Veuillez autoriser les pop-ups pour imprimer le ticket.");
        return;
    }

    printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px; text-align:center;">Génération du ticket en cours...</p></body></html>');
    printWindow.document.close();

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
            printThermalTicket(data.ticket, printWindow);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }

        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("✅ Tikè sove & enprime");

    } catch (err) {
        console.error(err);
        alert("❌ Erè pandan enpresyon");
        printWindow.close();
    }
}

// ---------- PRINT ----------
function printThermalTicket(ticket, printWindow) {
    const html = generateTicketHTML(ticket);

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
                    font-size: 32px;
                    font-weight: bold;
                    width: 76mm;
                    margin: 0 auto;
                    padding: 4mm;
                    background: white;
                    color: black;
                }
                .header {
                    text-align: center !important;
                    border-bottom: 2px dashed #000;
                    padding: 0 !important;
                    margin: 0 0 2px 0 !important;
                    line-height: 1;
                }
                .header img {
                    display: block !important;
                    margin: 0 auto !important;
                    vertical-align: bottom !important;
                    max-height: 350px;
                    max-width: 100%;
                }
                .header strong {
                    display: block;
                    font-size: 40px;
                    font-weight: bold;
                    margin: 0;
                    line-height: 1;
                }
                .header small {
                    display: block;
                    font-size: 26px;
                    color: #555;
                    margin: 0;
                    line-height: 1;
                }
                .info {
                    margin: 10px 0;
                }
                .info p {
                    margin: 5px 0;
                    font-size: 20px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
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
                    font-weight: bold;
                    font-size: 32px;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    margin-top: 10px;
                    font-size: 36px;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-style: italic;
                    font-size: 28px;
                }
                .footer p {
                    font-weight: bold;
                    margin: 3px 0;
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

    const dateObj = new Date(ticket.date);
    const formattedDate = dateObj.toLocaleDateString('fr-FR') + ' ' + 
                          dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

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
            <p>Tiraj: ${ticket.draw_name || ticket.drawName || ''}</p>
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
            <p>Ref : +509 40 64 3557</p>
            <p><strong>LOTATO S.A.</strong></p>
        </div>
    `;
}

// ---------- Global ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
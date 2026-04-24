// ==========================
// cartManager.js - VERSION FINALE POUR SUNMI V2s
// ==========================

// ---------- Fonctions utilitaires (inchangées) ----------
function normalizeDateString(dateStr) {
    if (!dateStr) return null;
    return dateStr.replace(' ', 'T');
}

function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

function checkNumberLimit(number, drawId, amountToAdd) {
    const key = `${drawId}_${number}`;
    const limit = APP_STATE.numberLimits[key];
    if (!limit) return { success: true };
    const currentTotal = APP_STATE.currentCart.filter(bet => bet.drawId === drawId && bet.cleanNumber === number).reduce((sum, bet) => sum + (bet.amount || 0), 0);
    const newTotal = currentTotal + amountToAdd;
    if (newTotal > limit) {
        return { success: false, message: `Limite atteinte : ${number} (${drawId}) – max ${limit} G, déjà ${currentTotal} G, tentative ${amountToAdd} G.` };
    }
    return { success: true };
}

function generateRandomMarriageBet(amount) {
    const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return { game: 'auto_marriage', number: `${num1}&${num2}`, cleanNumber: `${num1}&${num2}`, amount: amount };
}

// ---------- Cart Manager (inchangé) ----------
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
                const newFree = { ...freeBet, id: Date.now() + Math.random() + i, drawId: drawId, drawName: payants[0]?.drawName || 'Tiraj', free: true, freeType: 'special_marriage' };
                APP_STATE.currentCart.push(newFree);
            }
        });
        this.renderCart();
    },

    addBet() {
        if (APP_STATE.isDrawBlocked) { alert("Tiraj sa a ap rantre nan 3 minit."); return; }
        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');
        const amt = parseFloat(amtInput.value);
        if (isNaN(amt) || amt <= 0) { alert("Montan pa valid"); return; }
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
            if (autoBets.length === 0) { alert("Pa gen ase nimevo nan panye pou jenere " + game); return; }
            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            const errors = [];
            for (const drawId of draws) {
                for (const bet of autoBets) {
                    const number = bet.cleanNumber || bet.number;
                    const check = checkNumberLimit(number, drawId, amt);
                    if (!check.success) errors.push(check.message);
                }
            }
            if (errors.length > 0) { alert("Limites dépassées :\n" + errors.join("\n")); return; }
            for (const drawId of draws) {
                for (const bet of autoBets) {
                    const number = bet.cleanNumber || bet.number;
                    if (isNumberBlocked(number, drawId)) { alert(`Nimewo ${number} bloke pou tiraj ${drawId}`); return; }
                }
            }
            draws.forEach(drawId => {
                const drawName = APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId;
                autoBets.forEach(bet => {
                    APP_STATE.currentCart.push({ ...bet, id: Date.now() + Math.random(), drawId: drawId, drawName: drawName });
                });
            });
            this.updateFreeMarriages();
            amtInput.value = '';
            numInput.focus();
            return;
        }

        if (/^n[0-9]$/.test(game)) {
            const lastDigit = parseInt(game.substring(1), 10);
            const numbers = [];
            for (let tens = 0; tens <= 9; tens++) numbers.push(tens.toString() + lastDigit.toString());
            const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
            const errors = [];
            for (const drawId of draws) {
                for (const num of numbers) {
                    const check = checkNumberLimit(num, drawId, amt);
                    if (!check.success) errors.push(check.message);
                }
            }
            if (errors.length > 0) { alert("Limites dépassées :\n" + errors.join("\n")); return; }
            for (const drawId of draws) {
                for (const num of numbers) {
                    if (isNumberBlocked(num, drawId)) { alert(`Nimewo ${num} bloke pou tiraj ${drawId}`); return; }
                }
            }
            draws.forEach(drawId => {
                const drawName = APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId;
                numbers.forEach(num => {
                    APP_STATE.currentCart.push({ id: Date.now() + Math.random(), game: game, number: num, cleanNumber: num, amount: amt, drawId: drawId, drawName: drawName, timestamp: new Date().toISOString() });
                });
            });
            this.updateFreeMarriages();
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
        if (errors.length > 0) { alert("Limites dépassées :\n" + errors.join("\n")); return; }
        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) { alert(`Nimewo ${num} bloke pou tiraj ${drawId}`); return; }
        }
        draws.forEach(drawId => {
            if (game === 'lotto4' || game === 'lotto5') {
                const optionBets = GameEngine.generateLottoBetsWithOptions(game, num, amt);
                optionBets.forEach(bet => {
                    APP_STATE.currentCart.push({ ...bet, drawId: drawId, drawName: APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId });
                });
            } else {
                APP_STATE.currentCart.push({ id: Date.now() + Math.random(), game: game, number: num, cleanNumber: num, amount: amt, drawId: drawId, drawName: APP_STATE.draws?.find(d => d.id == drawId)?.name || drawId, timestamp: new Date().toISOString() });
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
            if (bet.game === 'auto_marriage' && bet.number && bet.number.includes('&')) displayNumber = bet.number.replace('&', '*');
            return `<div class="cart-item"><span>${gameAbbr} ${displayNumber}</span><span>${bet.amount} G</span><button onclick="CartManager.removeBet('${bet.id}')">✕</button></div>`;
        }).join('');
        totalEl.innerText = total.toLocaleString('fr-FR') + ' Gdes';
        if (itemsCount) itemsCount.innerText = count + ' jwèt';
    }
};

function getGameAbbreviation(gameName, bet) {
    if (bet && bet.free && bet.freeType === 'special_marriage') return 'marg';
    const map = { 'borlette':'bor', 'lotto3':'lo3', 'lotto4':'lo4', 'lotto5':'lo5', 'auto_marriage':'mara', 'auto_lotto4':'loa4', 'auto_lotto5':'loa5', 'mariage':'mar', 'lotto 3':'lo3', 'lotto 4':'lo4', 'lotto 5':'lo5', 'loto3':'lo3', 'loto4':'lo4', 'loto5':'lo5', 'bo':'bo', 'grap':'grap', 'n0':'n0', 'n1':'n1', 'n2':'n2', 'n3':'n3', 'n4':'n4', 'n5':'n5', 'n6':'n6', 'n7':'n7', 'n8':'n8', 'n9':'n9' };
    const key = (gameName || '').trim().toLowerCase();
    return map[key] || gameName;
}

// ---------- Impression native Sunmi (avec gestion forcée du service) ----------
async function printWithSunmi(ticket) {
    let SunmiPrinter;
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SunmiPrinter) {
            SunmiPrinter = window.Capacitor.Plugins.SunmiPrinter;
        } else if (window.SunmiPrinter) {
            SunmiPrinter = window.SunmiPrinter;
        } else {
            throw new Error("Plugin Sunmi non trouvé");
        }
        alert("✅ Plugin trouvé");
    } catch(e) {
        alert("❌ " + e.message);
        return;
    }

    try {
        alert("Tentative de bindService...");
        await SunmiPrinter.bindService();
        alert("bindService effectué");

        await new Promise(resolve => setTimeout(resolve, 500));

        // Vérification optionnelle de l'état du service
        let serviceStatus = await SunmiPrinter.getServiceStatus();
        alert("État service: " + (serviceStatus && serviceStatus.status === 1 ? "lié" : "non lié / code " + (serviceStatus?.status || "?")));

        alert("printerInit...");
        await SunmiPrinter.printerInit();
        alert("printerInit OK");

        let printerState = await SunmiPrinter.updatePrinterState();
        alert("État imprimante: " + (printerState && printerState.status === 1 ? "prête" : "code " + (printerState?.code || "?")));

        // Construction du contenu
        let content = "";
        content += "\nLOTATO\n";
        content += "Ticket #: " + (ticket.ticket_id || ticket.id) + "\n";
        let drawName = ticket.draw_name || ticket.drawName;
        if (!drawName && APP_STATE.draws && ticket.draw_id) {
            let draw = APP_STATE.draws.find(d => d.id == ticket.draw_id);
            drawName = draw ? draw.name : "Tiraj Inkonu";
        }
        content += "Tiraj: " + drawName + "\n";
        let dateStr = ticket.date ? new Date(ticket.date).toLocaleString() : "Date inconnue";
        content += "Date: " + dateStr + "\n";
        content += "Ajan: " + (ticket.agent_name || ticket.agentName || "") + "\n";
        content += "--------------------------------\n";
        let bets = ticket.bets || [];
        for (let b of bets) {
            let gameAbbr = getGameAbbreviation(b.game || "", b);
            let num = b.number || "";
            if (b.game === 'auto_marriage' && num.includes('&')) num = num.replace('&', '*');
            let amt = b.amount || 0;
            content += gameAbbr + " " + num + "  " + amt + " G\n";
        }
        content += "--------------------------------\n";
        let total = ticket.total_amount || ticket.total || 0;
        content += "TOTAL : " + total + " Gdes\n";
        content += "Merci et à bientôt!\n\n";

        alert("Envoi à l'imprimante...");
        await SunmiPrinter.enterPrinterBuffer();
        alert("enterPrinterBuffer OK");
        await SunmiPrinter.printText({ text: content });
        alert("printText OK");
        await SunmiPrinter.cutPaper();
        alert("cutPaper OK");
        await SunmiPrinter.exitPrinterBuffer();
        alert("✅ Impression terminée avec succès !");
    } catch(e) {
        alert("❌ Erreur: " + e.message);
        console.error(e);
        try { await SunmiPrinter.exitPrinterBuffer(); } catch(e2) {}
    }
}

// ---------- Sauvegarde et impression principale ----------
async function processFinalTicket() {
    alert("processFinalTicket appelée !");
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
            data.ticket.date = new Date().toISOString();
            await printWithSunmi(data.ticket);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }
        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("✅ Tikè sove & enprime");
    } catch (err) {
        console.error(err);
        alert("❌ Erè pandan enpresyon: " + err.message);
    }
}

// Expositions globales
window.processFinalTicket = processFinalTicket;
window.CartManager = CartManager;

alert("cartManager.js chargé - version finale Sunmi");
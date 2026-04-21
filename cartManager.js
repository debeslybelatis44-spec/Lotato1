// ==========================
// cartManager.js - Version APK native (sans import)
// ==========================

// ---------- Fonction utilitaire pour normaliser une chaîne de date ----------
function normalizeDateString(dateStr) {
    if (!dateStr) return null;
    let normalized = dateStr.replace(' ', 'T');
    return normalized;
}

// ---------- Utils ----------
function isNumberBlocked(number, drawId) {
    if (APP_STATE.globalBlockedNumbers.includes(number)) return true;
    const drawBlocked = APP_STATE.drawBlockedNumbers[drawId] || [];
    return drawBlocked.includes(number);
}

function checkNumberLimit(number, drawId, amountToAdd) {
    const key = `${drawId}_${number}`;
    const limit = APP_STATE.numberLimits[key];
    if (!limit) return { success: true };
    const currentTotal = APP_STATE.currentCart
        .filter(bet => bet.drawId === drawId && bet.cleanNumber === number)
        .reduce((sum, bet) => sum + (bet.amount || 0), 0);
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

        // Gestion des jeux automatiques
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

        // Gestion des jeux NX
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

        // Jeux normaux
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

// ---------- Impression ----------
async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) { alert("Panye vid"); return; }
    const isCapacitor = !!window.Capacitor;
    let printWindow = null;
    if (!isCapacitor) {
        printWindow = window.open('', '_blank', 'width=500,height=700');
        if (!printWindow) { alert("Veuillez autoriser les pop-ups pour imprimer le ticket."); return; }
        printWindow.document.write('<html><head><title>Chargement...</title></head><body><p style="font-size:20px; text-align:center;">Génération du ticket en cours...</p></body></html>');
        printWindow.document.close();
    }
    const betsByDraw = {};
    APP_STATE.currentCart.forEach(b => { if (!betsByDraw[b.drawId]) betsByDraw[b.drawId] = []; betsByDraw[b.drawId].push(b); });
    try {
        for (const drawId in betsByDraw) {
            const bets = betsByDraw[drawId];
            const total = bets.reduce((s, b) => s + b.amount, 0);
            const payload = { agentId: APP_STATE.agentId, agentName: APP_STATE.agentName, drawId, drawName: bets[0].drawName, bets, total };
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SAVE_TICKET}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Erreur serveur");
            const data = await res.json();
            data.ticket.date = new Date().toISOString();
            printThermalTicket(data.ticket, printWindow);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }
        APP_STATE.currentCart = [];
        CartManager.renderCart();
        alert("✅ Tikè sove & enprime");
    } catch (err) {
        console.error(err);
        alert("❌ Erè pandan enpresyon");
        if (printWindow) printWindow.close();
    }
}

function printThermalTicket(ticket, printWindow) {
    const isCapacitor = !!window.Capacitor;
    // Récupération du plugin Sunmi depuis l'objet global de Capacitor
    const sunmiPlugin = window.Capacitor?.Plugins?.SunmiPrinter || window.SunmiPrinter;
    const hasSunmi = !!sunmiPlugin;

    if (isCapacitor && hasSunmi) {
        printWithSunmi(ticket, sunmiPlugin);
    } else {
        // Fallback popup
        const html = generateTicketHTML(ticket);
        if (printWindow) {
            printWindow.document.write(`<!DOCTYPE html><html><head><title>Ticket</title><style>@page{size:80mm auto;margin:2mm;}body{font-family:'Courier New',monospace;font-size:32px;font-weight:bold;width:76mm;margin:0 auto;padding:4mm;background:white;color:black;}.header{text-align:center;border-bottom:2px dashed #000;margin-bottom:10px;}.info p{margin:5px 0;font-size:20px;}hr{border-top:2px dashed #000;margin:10px 0;}.bet-row{display:flex;justify-content:space-between;margin:5px 0;}.total-row{display:flex;justify-content:space-between;font-weight:bold;margin-top:10px;}.footer{text-align:center;margin-top:20px;font-style:italic;font-size:28px;}</style></head><body>${html}</body></html>`);
            printWindow.document.close();
            printWindow.onload = function() { printWindow.focus(); printWindow.print(); };
        } else {
            const newWin = window.open('', '_blank', 'width=500,height=700');
            if (newWin) { newWin.document.write(html); newWin.document.close(); newWin.print(); }
            else alert("Impossible d'ouvrir la fenêtre d'impression");
        }
    }
}

async function printWithSunmi(ticket, sunmiPlugin) {
    // Étape 0 : vérifier que le plugin est présent
    if (!sunmiPlugin) {
        alert("Erreur: Plugin Sunmi non trouvé dans l'APK.");
        return;
    }
    alert("✅ Plugin Sunmi détecté");

    try {
        alert("1. Tentative de enterPrinterBuffer...");
        await sunmiPlugin.enterPrinterBuffer();
        alert("2. enterPrinterBuffer réussi");

        alert("3. Tentative de setAlignment (CENTER)...");
        await sunmiPlugin.setAlignment({ alignment: 1 }); // 1 = CENTER
        alert("4. setAlignment CENTER réussi");

        const cfg = APP_STATE.lotteryConfig || CONFIG;
        const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
        const slogan = cfg.slogan || '';

        alert("5. Impression du nom de la loterie...");
        await sunmiPlugin.printText({ text: `\n${lotteryName}\n` });
        if (slogan) await sunmiPlugin.printText({ text: `${slogan}\n` });
        
        alert("6. Impression du numéro de ticket...");
        await sunmiPlugin.printText({ text: `Ticket #: ${ticket.ticket_id || ticket.id}\n` });
        
        let drawName = ticket.draw_name || ticket.drawName;
        if (!drawName && APP_STATE.draws && ticket.draw_id) {
            const draw = APP_STATE.draws.find(d => d.id == ticket.draw_id);
            drawName = draw ? draw.name : 'Tiraj Inkonu';
        }
        await sunmiPlugin.printText({ text: `Tiraj: ${drawName}\n` });
        
        let formattedDate = 'Date inkonu';
        if (ticket.date) {
            const normalized = normalizeDateString(ticket.date);
            const dateObj = new Date(normalized);
            if (!isNaN(dateObj)) {
                formattedDate = dateObj.toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' }) + ' ' + dateObj.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit' });
            }
        }
        await sunmiPlugin.printText({ text: `Date: ${formattedDate}\n` });
        await sunmiPlugin.printText({ text: `Ajan: ${ticket.agent_name || ticket.agentName || ''}\n` });
        await sunmiPlugin.printText({ text: `--------------------------------\n` });
        
        alert("7. Passage à l'alignement LEFT...");
        await sunmiPlugin.setAlignment({ alignment: 0 }); // 0 = LEFT
        
        const bets = ticket.bets || [];
        alert(`8. Impression de ${bets.length} paris...`);
        for (const bet of bets) {
            const gameAbbr = getGameAbbreviation(bet.game || '', bet);
            let displayNumber = bet.number || '';
            if (bet.game === 'auto_marriage' && displayNumber.includes('&')) displayNumber = displayNumber.replace('&', '*');
            const amount = bet.amount || 0;
            await sunmiPlugin.printText({ text: `${gameAbbr} ${displayNumber}  ${amount} G\n` });
        }
        
        await sunmiPlugin.printText({ text: `--------------------------------\n` });
        await sunmiPlugin.setAlignment({ alignment: 1 });
        const total = ticket.total_amount || ticket.total || 0;
        await sunmiPlugin.printText({ text: `TOTAL : ${total} Gdes\n` });
        await sunmiPlugin.printText({ text: `\ntickets valable jusqu'à 90 jours\nRef : +509 \nLOTATO S.A.\n\n` });
        
        alert("9. Découpe du papier...");
        await sunmiPlugin.cutPaper();
        alert("10. Sortie du buffer...");
        await sunmiPlugin.exitPrinterBuffer();
        
        alert("✅ Impression Sunmi réussie !");
        console.log("Impression Sunmi réussie");
    } catch (error) {
        console.error("Erreur impression Sunmi:", error);
        alert("Erreur détaillée: " + (error.message || JSON.stringify(error)));
        // Tente de sortir du buffer pour ne pas bloquer l'imprimante
        try { await sunmiPlugin.exitPrinterBuffer(); } catch(e) {}
    }
}
function generateTicketHTML(ticket) {
    const cfg = APP_STATE.lotteryConfig || CONFIG;
    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
    const slogan = cfg.slogan || '';
    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';
    let formattedDate = 'Date invalide';
    if (ticket.date) {
        const normalized = normalizeDateString(ticket.date);
        const dateObj = new Date(normalized);
        if (!isNaN(dateObj)) {
            formattedDate = dateObj.toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' }) + ' ' + dateObj.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit' });
        }
    }
    let drawName = ticket.draw_name || ticket.drawName;
    if (!drawName && APP_STATE.draws && ticket.draw_id) {
        const draw = APP_STATE.draws.find(d => d.id == ticket.draw_id);
        drawName = draw ? draw.name : 'Tiraj Inkonu';
    } else if (!drawName) drawName = 'Tiraj Inkonu';
    const betsHTML = (ticket.bets || []).map(b => {
        const gameAbbr = getGameAbbreviation(b.game || '', b);
        let displayNumber = b.number || '';
        if (b.game === 'auto_marriage' && displayNumber.includes('&')) displayNumber = displayNumber.replace('&', '*');
        return `<div class="bet-row"><span>${gameAbbr} ${displayNumber}</span><span>${b.amount || 0} G</span></div>`;
    }).join('');
    return `
        <div class="header">${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : ''}<strong>${lotteryName}</strong>${slogan ? `<small>${slogan}</small>` : ''}</div>
        <div class="info"><p>Ticket #: ${ticket.ticket_id || ticket.id}</p><p>Tiraj: ${drawName}</p><p>Date: ${formattedDate}</p><p>Ajan: ${ticket.agent_name || ticket.agentName || ''}</p></div>
        <hr>${betsHTML}<hr>
        <div class="total-row"><span>TOTAL</span><span>${ticket.total_amount || ticket.total || 0} Gdes</span></div>
        <div class="footer"><p>tickets valable jusqu'à 90 jours</p><p>Ref : +509 </p><p><strong>LOTATO S.A.</strong></p></div>
    `;
}

window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
window.printThermalTicket = printThermalTicket;
// ============================================================================
// cartManager.js - Version finale avec fusion multi-tirage et impression pro
// ============================================================================

// ---------- Message à l'écran (remplace alert() natif) ----------
// Sur certains WebView Android, alert() ne fait rien du tout si le code natif
// n'implémente pas onJsAlert() — le message ne s'affiche jamais, même si le
// JS s'exécute correctement. Cette popup est du HTML/CSS pur injecté dans la
// page : elle s'affiche toujours, quel que soit l'environnement.
function showAppMessage(message, isError = true) {
    const existing = document.getElementById('app-message-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'app-message-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:400px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
    box.innerHTML = `
        <div style="font-size:40px;margin-bottom:12px;">${isError ? '❌' : '✅'}</div>
        <div style="font-size:16px;color:#222;margin-bottom:20px;white-space:pre-line;">${message}</div>
        <button id="app-message-ok-btn" style="background:${isError ? '#dc3545' : '#28a745'};color:#fff;border:none;padding:12px 30px;border-radius:8px;font-size:16px;font-weight:bold;">OK</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.getElementById('app-message-ok-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
window.showAppMessage = showAppMessage;

// ---------- Choix Impression / WhatsApp / Les deux ----------
function showTicketDeliveryChoice() {
    return new Promise((resolve) => {
        const existing = document.getElementById('app-message-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'app-message-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:360px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);';
        box.innerHTML = `
            <div style="font-size:36px;margin-bottom:10px;">🎫</div>
            <div style="font-size:16px;color:#222;margin-bottom:20px;">Tikè kreye avèk siksè ! Kijan ou vle voye l ?</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="choice-print" style="background:#0d6efd;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:bold;"><i class="fas fa-print"></i> Enprime</button>
                <button id="choice-whatsapp" style="background:#25D366;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:bold;"><i class="fab fa-whatsapp"></i> WhatsApp</button>
                <button id="choice-both" style="background:#6c757d;color:#fff;border:none;padding:14px;border-radius:8px;font-size:16px;font-weight:bold;">Toude</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const cleanup = (choice) => { overlay.remove(); resolve(choice); };
        document.getElementById('choice-print').addEventListener('click', () => cleanup('print'));
        document.getElementById('choice-whatsapp').addEventListener('click', () => cleanup('whatsapp'));
        document.getElementById('choice-both').addEventListener('click', () => cleanup('both'));
    });
}

// ---------- Demande du numéro WhatsApp du joueur (optionnel) ----------
function askForPhoneNumber() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'app-phone-prompt-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:340px;width:100%;text-align:center;';
        box.innerHTML = `
            <div style="font-size:16px;color:#222;margin-bottom:14px;">Nimewo WhatsApp jwè a (opsyonèl)</div>
            <input id="phone-prompt-input" type="tel" placeholder="Ex: 50937xxxxxx" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:16px;margin-bottom:16px;box-sizing:border-box;">
            <div style="display:flex;gap:10px;">
                <button id="phone-prompt-skip" style="flex:1;background:#6c757d;color:#fff;border:none;padding:12px;border-radius:8px;font-size:15px;">Pase</button>
                <button id="phone-prompt-ok" style="flex:1;background:#25D366;color:#fff;border:none;padding:12px;border-radius:8px;font-size:15px;font-weight:bold;">OK</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const input = document.getElementById('phone-prompt-input');
        input.focus();
        const cleanup = (val) => { overlay.remove(); resolve(val); };
        document.getElementById('phone-prompt-ok').addEventListener('click', () => cleanup(input.value.trim()));
        document.getElementById('phone-prompt-skip').addEventListener('click', () => cleanup(''));
    });
}

// ---------- Génération de l'image du ticket (identique visuellement à l'impression) ----------
// Important : on utilise le HTML COMPLET (avec son <style>), rendu dans un
// iframe isolé — pas juste le contenu brut dans un <div>, sinon aucun style
// ne s'applique et l'image capturée est vide. On attend aussi le chargement
// du logo avant la capture.
async function generateTicketImageBlob(aggregatedTicket) {
    if (typeof html2canvas === 'undefined') {
        console.error('html2canvas non chargé');
        return null;
    }
    const innerHtml = generateAggregatedTicketHTML(aggregatedTicket);
    const fullHtml = buildTicketPrintHTML(innerHtml);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:340px;height:700px;border:none;';
    document.body.appendChild(iframe);

    try {
        iframe.contentDocument.open();
        iframe.contentDocument.write(fullHtml);
        iframe.contentDocument.close();

        // Laisse le temps au DOM/CSS de se poser, puis attend les images (logo)
        await new Promise(resolve => setTimeout(resolve, 150));
        await new Promise(resolve => {
            const images = iframe.contentDocument.images;
            if (!images || images.length === 0) return resolve();
            let remaining = images.length;
            const done = () => { remaining--; if (remaining <= 0) resolve(); };
            Array.from(images).forEach(img => {
                if (img.complete) done();
                else { img.onload = done; img.onerror = done; }
            });
            setTimeout(resolve, 2000); // filet de sécurité si une image bloque
        });

        const canvas = await html2canvas(iframe.contentDocument.body, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true
        });
        return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    } catch (e) {
        console.error('Erreur génération image ticket:', e);
        return null;
    } finally {
        document.body.removeChild(iframe);
    }
}

// ---------- Partage du ticket (image) via WhatsApp ----------
async function shareTicketViaWhatsApp(aggregatedTicket) {
    const phone = await askForPhoneNumber();
    const blob = await generateTicketImageBlob(aggregatedTicket);
    if (!blob) {
        showAppMessage("Erè pandan kreyasyon imaj tikè a", true);
        return;
    }
    const fileName = `tike-${aggregatedTicket.ticket_id}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    // Un numéro a été saisi : on télécharge l'image et on ouvre DIRECTEMENT
    // la conversation WhatsApp de ce numéro (pas le sélecteur général),
    // pour que l'envoi soit ciblé automatiquement. WhatsApp Click-to-Chat ne
    // permet pas de joindre un fichier automatiquement via un simple lien —
    // l'agent doit juste appuyer une fois sur 📎 pour joindre l'image déjà
    // téléchargée (WhatsApp l'affiche généralement en premier dans la galerie).
    if (phone) {
        downloadBlob(blob, fileName);
        const waText = encodeURIComponent(`Tikè #${aggregatedTicket.ticket_id}`);
        window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${waText}`, '_blank');
        showAppMessage("Imaj tikè a telechaje & WhatsApp louvri sou nimewo a — peze 📎 pou jwenn imaj la epi voye l.", false);
        return;
    }

    // Aucun numéro fourni : on essaie le partage natif (choix de contact/app)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Tikè Lotato',
                text: `Tikè #${aggregatedTicket.ticket_id}`
            });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return; // agent a annulé volontairement
            console.error('Erreur navigator.share:', e);
        }
    }

    // Repli : partage natif indisponible sur cet appareil/navigateur.
    downloadBlob(blob, fileName);
    window.open(`https://wa.me/?text=${encodeURIComponent(`Tikè #${aggregatedTicket.ticket_id}`)}`, '_blank');
    showAppMessage("Imaj tikè a telechaje. WhatsApp louvri — jwenn imaj la nan telechajman epi voye l manyèlman.", false);
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Utilitaire date ----------
function normalizeDateString(dateStr) {
    if (!dateStr) return null;
    return dateStr.replace(' ', 'T');
}

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
        return {
            success: false,
            message: `❌ Limite atteinte : ${number} (${drawId}) – max ${limit} G, déjà misé ${currentTotal} G, tentative ${amountToAdd} G.`
        };
    }
    return { success: true };
}

// ---------- Génération mariage gratuit ----------
function generateRandomMarriageBet(amount) {
    const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return {
        game: 'auto_marriage',
        number: `${num1}&${num2}`,         // Affichage
        cleanNumber: `${num1}${num2}`,     // Calcul (4 chiffres)
        amount: amount
    };
}

// ---------- CartManager ----------
var CartManager = {

    updateFreeMarriages() {
        APP_STATE.currentCart = APP_STATE.currentCart.filter(b => !(b.free && b.freeType === 'special_marriage'));

        const cfg = (APP_STATE.advancedSettings && APP_STATE.advancedSettings.freeMarriage) || {
            enabled: true,
            tiers: [
                { min: 100, max: 500, count: 4 },
                { min: 501, max: 1500, count: 4 },
                { min: 1501, max: null, count: 4 }
            ],
            winAmount: 2500
        };

        // Le propriétaire peut désactiver complètement les mariages
        // gratuits depuis ses réglages — dans ce cas on ne génère rien.
        if (cfg.enabled === false) {
            this.renderCart();
            return;
        }

        const payantsByDraw = {};
        APP_STATE.currentCart.forEach(bet => {
            if (bet.amount > 0) {
                if (!payantsByDraw[bet.drawId]) payantsByDraw[bet.drawId] = [];
                payantsByDraw[bet.drawId].push(bet);
            }
        });

        const tiers = cfg.tiers;

        Object.keys(payantsByDraw).forEach(drawId => {
            const payants = payantsByDraw[drawId];
            const totalPayant = payants.reduce((sum, b) => sum + b.amount, 0);

            let requiredFree = 0;
            for (const tier of tiers) {
                if (tier.max === null && totalPayant >= tier.min) {
                    requiredFree = tier.count;
                    break;
                } else if (tier.max !== null && totalPayant >= tier.min && totalPayant <= tier.max) {
                    requiredFree = tier.count;
                    break;
                }
            }

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
            showAppMessage("Tiraj sa a ap rantre nan 3 minit.", true);
            return;
        }

        const numInput = document.getElementById('num-input');
        const amtInput = document.getElementById('amt-input');
        const amt = parseFloat(amtInput.value);
        if (isNaN(amt) || amt <= 0) {
            showAppMessage("Montan pa valid", true);
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
                showAppMessage("Pa gen ase nimevo nan panye pou jenere " + game, true);
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
            if (errors.length > 0) { showAppMessage("Limites dépassées :\n" + errors.join("\n"), true); return; }

            for (const drawId of draws) {
                for (const bet of autoBets) {
                    const number = bet.cleanNumber || bet.number;
                    if (isNumberBlocked(number, drawId)) {
                        showAppMessage(`Nimewo ${number} bloke pou tiraj ${drawId}`, true);
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
            this.updateFreeMarriages();
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
            if (errors.length > 0) { showAppMessage("Limites dépassées :\n" + errors.join("\n"), true); return; }

            for (const drawId of draws) {
                for (const num of numbers) {
                    if (isNumberBlocked(num, drawId)) {
                        showAppMessage(`Nimewo ${num} bloke pou tiraj ${drawId}`, true);
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
            this.updateFreeMarriages();
            numInput.value = '';
            amtInput.value = '';
            numInput.focus();
            return;
        }

        let num = numInput.value.trim();
        if (!GameEngine.validateEntry(game, num)) { showAppMessage("Nimewo pa valid", true); return; }
        num = GameEngine.getCleanNumber(num);

        const draws = APP_STATE.multiDrawMode ? APP_STATE.selectedDraws : [APP_STATE.selectedDraw];
        const errors = [];
        for (const drawId of draws) {
            const check = checkNumberLimit(num, drawId, amt);
            if (!check.success) errors.push(check.message);
        }
        if (errors.length > 0) { showAppMessage("Limites dépassées :\n" + errors.join("\n"), true); return; }

        for (const drawId of draws) {
            if (isNumberBlocked(num, drawId)) {
                showAppMessage(`Nimewo ${num} bloke pou tiraj ${drawId}`, true);
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

// ---------- Impression et fusion multi-tirage ----------
async function processFinalTicket() {
    if (!APP_STATE.currentCart.length) {
        showAppMessage("Panye vid", true);
        return;
    }

    const betsByDraw = {};
    APP_STATE.currentCart.forEach(b => {
        if (!betsByDraw[b.drawId]) betsByDraw[b.drawId] = [];
        betsByDraw[b.drawId].push(b);
    });

    // On n'ouvre PLUS de fenêtre popup ici — elle passait devant la fenêtre
    // de choix (Enprime/WhatsApp) et la cachait. On ne l'ouvrira que si
    // l'agent choisit réellement "Enprime", juste après son clic.
    const savedTickets = [];

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
            data.ticket.date = new Date().toISOString();
            savedTickets.push(data.ticket);
            APP_STATE.ticketsHistory.unshift(data.ticket);
        }

        // Construction du ticket unique agrégé
        const aggregatedTicket = buildAggregatedTicket(savedTickets, betsByDraw);

        APP_STATE.currentCart = [];
        CartManager.renderCart();

        const choice = await showTicketDeliveryChoice();

        if (choice === 'print' || choice === 'both') {
            if (isAndroidWebView()) {
                const ticketHTML = generateAggregatedTicketHTML(aggregatedTicket);
                const fullHTML = buildTicketPrintHTML(ticketHTML);
                window.AndroidPrint.printHTML(fullHTML);
            } else {
                // Ouverture du popup ICI, juste après le clic sur "Enprime"
                // dans la fenêtre de choix — reste assez proche du geste de
                // l'utilisateur pour ne pas être bloqué par le navigateur.
                const printWindow = window.open('', '_blank', 'width=500,height=700');
                if (!printWindow) {
                    showAppMessage("Autorize popups pou enprime.", true);
                } else {
                    printAggregatedTicket(aggregatedTicket, printWindow);
                }
            }
        }

        if (choice === 'whatsapp' || choice === 'both') {
            await shareTicketViaWhatsApp(aggregatedTicket);
        }

        showAppMessage("Tikè sove" + (choice === 'print' || choice === 'both' ? " & enprime" : "") + (choice === 'whatsapp' || choice === 'both' ? " & voye sou WhatsApp" : ""), false);

    } catch (err) {
        console.error(err);
        showAppMessage(err.message, true);
    }
}

// ---------- Agrégation des tickets ----------
function buildAggregatedTicket(ticketsList, betsByDraw) {
    if (!ticketsList.length) return null;
    const firstTicket = ticketsList[0];
    const drawNames = ticketsList.map(t => t.draw_name || t.drawName);
    const grandTotal = ticketsList.reduce((sum, t) => sum + (t.total_amount || t.total || 0), 0);
    const bets = firstTicket.bets || [];
    return {
        ticket_id: ticketsList.map(t => t.ticket_id || t.id).join('_'),
        drawNames: drawNames,
        bets: bets,
        total: grandTotal,
        date: new Date().toISOString(),
        agent_name: firstTicket.agent_name || firstTicket.agentName,
    };
}

function printAggregatedTicket(aggregatedTicket, printWindow) {
    const html = generateAggregatedTicketHTML(aggregatedTicket);
    const fullHTML = buildTicketPrintHTML(html);  // ← renommé
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.onload = function() {
        printWindow.focus();
        printWindow.print();
    };
}

// ---------- Génération HTML du ticket fusionné ----------
function generateAggregatedTicketHTML(ticket) {
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

    // Liste verticale des tirages (un par ligne avec puce)
    const drawNamesList = ticket.drawNames.map(name => `<p style="margin-left: 1em;">• ${name}</p>`).join('');

    const betsHTML = (ticket.bets || []).map(b => {
        const gameAbbr = getGameAbbreviation(b.game || '', b);
        let displayNumber = b.number || '';
        if (b.game === 'auto_marriage' && displayNumber.includes('&')) {
            displayNumber = displayNumber.replace('&', '*');
        }
        return `<div class="bet-row"><span>${gameAbbr} ${displayNumber}</span><span>${b.amount || 0} G</span></div>`;
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
            <p># : ${ticket.ticket_id}</p>
            <p>Tirages:</p>
            ${drawNamesList}
            <p>Date: ${formattedDate}</p>
            <p>Ajan: ${ticket.agent_name || ''}</p>
        </div>
    `;

    const footerHTML = `
        <div class="footer">
            <p>tickets valable pour 90 jours</p>
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
            <span>${ticket.total} Gdes</span>
        </div>
        ${footerHTML}
    `;
}

// ---------- Construction HTML complet avec styles fixes pour ticket (renommée) ----------
function buildTicketPrintHTML(bodyHTML) {
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

// ---------- Chargement initial ----------
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => loadAdvancedSettings());
} else {
    loadAdvancedSettings();
}

// ---------- Exports globaux ----------
window.CartManager = CartManager;
window.processFinalTicket = processFinalTicket;
// La fonction buildFullPrintHTML n'est plus exposée globalement pour éviter conflit.
// On expose plutôt buildTicketPrintHTML si nécessaire (optionnel)
window.buildTicketPrintHTML = buildTicketPrintHTML;
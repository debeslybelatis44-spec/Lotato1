/**
 * ownerAdvancedSettings.js
 * Script indépendant pour ajouter un onglet "Réglages" à l'interface propriétaire.
 * Permet de configurer :
 *   - Mariages gratuits : paliers (min, max, nombre), montant gagné
 *   - Taille de police d'impression
 *   - Pied de page personnalisé (3 lignes)
 * Patch dynamiquement CartManager et generateTicketHTML pour utiliser ces paramètres.
 */

(function() {
    // Vérifier que l'utilisateur est propriétaire (basé sur le token et le rôle)
    const role = localStorage.getItem('user_role');
    if (role !== 'owner') {
        console.warn('ownerAdvancedSettings: utilisateur non propriétaire, script ignoré.');
        return;
    }

    // Attendre que le DOM soit chargé
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        // 1. Injecter l'onglet dans la barre de navigation
        addSettingsTab();

        // 2. Créer le contenu de l'onglet (sera ajouté après tous les .tab-content)
        createSettingsPanel();

        // 3. Charger les paramètres depuis l'API
        await loadAdvancedSettings();

        // 4. Patcher les fonctions de cartManager pour qu'elles utilisent ces paramètres
        patchCartManager();

        // 5. Écouter les changements de l'onglet pour recharger si nécessaire
        observeTabSwitch();

        console.log('⚙️ ownerAdvancedSettings: script actif');
    }

    // ==================== INJECTION DE L'ONGLET ====================
    function addSettingsTab() {
        const nav = document.querySelector('.tabs'); // la div avec les onglets dans owner.html
        if (!nav) {
            console.error('ownerAdvancedSettings: barre d\'onglets (.tabs) introuvable');
            return;
        }

        // Vérifier si l'onglet existe déjà
        if (document.querySelector('.tab[data-tab="advanced"]')) return;

        const settingsTab = document.createElement('div');
        settingsTab.className = 'tab';
        settingsTab.setAttribute('data-tab', 'advanced');
        settingsTab.innerHTML = '⚙️ Réglages';
        settingsTab.onclick = () => switchToTab('advanced');
        nav.appendChild(settingsTab);
    }

    // Fonction pour changer d'onglet (similaire à celle de owner.html)
    function switchToTab(tabId) {
        // Déclencher l'événement de clic sur l'onglet original pour que l'UI se mette à jour
        const tabElement = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tabElement && typeof window.switchTab === 'function') {
            window.switchTab(tabId);
        } else {
            // Fallback manuel
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            if (tabElement) tabElement.classList.add('active');
            const content = document.getElementById(`tab-${tabId}`);
            if (content) content.classList.add('active');
        }
    }

    // ==================== CRÉATION DU PANNEAU DE RÉGLAGES ====================
    function createSettingsPanel() {
        // Vérifier si le conteneur principal existe (le corps des onglets)
        const tabsContainer = document.querySelector('.tab-content.active')?.parentNode;
        if (!tabsContainer) return;

        // Si le panneau existe déjà, ne pas le recréer
        if (document.getElementById('tab-advanced')) return;

        const panel = document.createElement('div');
        panel.id = 'tab-advanced';
        panel.className = 'tab-content';
        panel.innerHTML = `
            <div class="section-title"><i class="fas fa-gift"></i> Configuration des mariages gratuits</div>
            <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                    <label>Structure des paliers (montant total payé → nombre de mariages offerts)</label>
                    <div id="free-marriage-tiers-container"></div>
                    <button type="button" class="btn-primary" style="margin-top:10px;" onclick="ownerAdvanced.addTier()">+ Ajouter un palier</button>
                </div>
                <div class="form-group">
                    <label>Montant gagné par mariage gratuit (G)</label>
                    <input type="number" id="free-marriage-win" step="1" value="1000">
                </div>
            </div>

            <div class="section-title"><i class="fas fa-print"></i> Personnalisation de l'impression</div>
            <div class="form-grid">
                <div class="form-group">
                    <label>Taille de la police (px)</label>
                    <input type="number" id="print-font-size" step="1" value="32">
                </div>
            </div>

            <div class="section-title"><i class="fas fa-comment"></i> Pied de page du ticket</div>
            <div class="form-grid">
                <div class="form-group" style="grid-column: span 2;">
                    <label>Ligne 1</label>
                    <input type="text" id="footer-line1" value="tickets valable jusqu'à 90 jours">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Ligne 2</label>
                    <input type="text" id="footer-line2" value="Ref : +509 ">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label>Ligne 3</label>
                    <input type="text" id="footer-line3" value="LOTATO S.A.">
                </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn-primary" onclick="ownerAdvanced.saveSettings()"><i class="fas fa-save"></i> Enregistrer les réglages</button>
                <button class="btn-primary" onclick="ownerAdvanced.loadSettings()"><i class="fas fa-undo"></i> Recharger</button>
            </div>
            <div id="advanced-settings-message" class="alert" style="display:none;"></div>
        `;

        // Ajouter après le dernier .tab-content
        tabsContainer.appendChild(panel);

        // Exposer les fonctions nécessaires globalement
        window.ownerAdvanced = {
            addTier,
            saveSettings,
            loadSettings: loadAdvancedSettings,
            currentTiers: []
        };

        // Fonctions internes
        function renderTiers() {
            const container = document.getElementById('free-marriage-tiers-container');
            if (!container) return;
            let html = `<div class="table-responsive"><table style="width:100%"><thead><tr><th>Montant min (G)</th><th>Montant max (G)</th><th>Mariages offerts</th><th></th></tr></thead><tbody>`;
            window.ownerAdvanced.currentTiers.forEach((tier, idx) => {
                html += `
                    <tr>
                        <td><input type="number" class="tier-min" value="${tier.min}" step="1" min="0"></td>
                        <td><input type="number" class="tier-max" value="${tier.max === null ? '' : tier.max}" step="1" min="0" placeholder="Infini"></td>
                        <td><input type="number" class="tier-count" value="${tier.count}" step="1" min="1"></td>
                        <td><button type="button" class="btn-danger" onclick="ownerAdvanced.removeTier(${idx})">✕</button></td>
                    </tr>
                `;
            });
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        }

        function addTier() {
            window.ownerAdvanced.currentTiers.push({ min: 0, max: null, count: 1 });
            renderTiers();
        }

        window.ownerAdvanced.removeTier = function(idx) {
            window.ownerAdvanced.currentTiers.splice(idx, 1);
            renderTiers();
        };
    }

    // ==================== CHARGEMENT / SAUVEGARDE API ====================
    async function loadAdvancedSettings() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/api/owner/advanced-settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Erreur chargement réglages');
            const data = await res.json();

            // Mettre à jour les champs du formulaire
            if (data.freeMarriage) {
                window.ownerAdvanced.currentTiers = data.freeMarriage.tiers || [
                    { min: 0, max: 50, count: 1 },
                    { min: 51, max: 150, count: 2 },
                    { min: 151, max: null, count: 3 }
                ];
                renderTiers();
                document.getElementById('free-marriage-win').value = data.freeMarriage.winAmount || 1000;
            }
            if (data.print) {
                document.getElementById('print-font-size').value = data.print.fontSize || 32;
            }
            if (data.footer) {
                document.getElementById('footer-line1').value = data.footer.line1 || "tickets valable jusqu'à 90 jours";
                document.getElementById('footer-line2').value = data.footer.line2 || "Ref : +509 ";
                document.getElementById('footer-line3').value = data.footer.line3 || "LOTATO S.A.";
            }

            // Stocker dans APP_STATE pour que les autres parties du code y aient accès
            if (window.APP_STATE) {
                window.APP_STATE.advancedSettings = data;
            }

            // Appliquer les nouveaux paramètres aux fonctions patchées
            applyPrintSettingsToCartManager();
        } catch (err) {
            console.error(err);
            showMessage('Erreur chargement réglages', false);
        }
    }

    async function saveSettings() {
        // Collecter les valeurs
        const tierInputs = document.querySelectorAll('.tier-min');
        const newTiers = [];
        for (let i = 0; i < tierInputs.length; i++) {
            const minElem = document.querySelectorAll('.tier-min')[i];
            const maxElem = document.querySelectorAll('.tier-max')[i];
            const countElem = document.querySelectorAll('.tier-count')[i];
            let maxVal = maxElem.value.trim() === '' ? null : parseFloat(maxElem.value);
            newTiers.push({
                min: parseFloat(minElem.value),
                max: maxVal,
                count: parseInt(countElem.value)
            });
        }

        const payload = {
            freeMarriage: {
                tiers: newTiers,
                winAmount: parseFloat(document.getElementById('free-marriage-win').value)
            },
            print: {
                fontSize: parseInt(document.getElementById('print-font-size').value)
            },
            footer: {
                line1: document.getElementById('footer-line1').value,
                line2: document.getElementById('footer-line2').value,
                line3: document.getElementById('footer-line3').value
            }
        };

        const token = localStorage.getItem('auth_token');
        try {
            const res = await fetch(`${API_URL}/api/owner/advanced-settings`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showMessage('✅ Réglages enregistrés', true);
                if (window.APP_STATE) {
                    window.APP_STATE.advancedSettings = payload;
                }
                // Appliquer immédiatement les changements d'impression et de mariages gratuits
                applyPrintSettingsToCartManager();
                // Recalculer les mariages gratuits dans le panier actuel (si CartManager existe)
                if (window.CartManager && typeof CartManager.updateFreeMarriages === 'function') {
                    window.CartManager.updateFreeMarriages();
                }
            } else {
                showMessage('❌ Erreur lors de la sauvegarde', false);
            }
        } catch (err) {
            console.error(err);
            showMessage('❌ Erreur réseau', false);
        }
    }

    function showMessage(msg, isSuccess) {
        const msgDiv = document.getElementById('advanced-settings-message');
        if (msgDiv) {
            msgDiv.style.display = 'block';
            msgDiv.className = isSuccess ? 'alert alert-success' : 'alert alert-danger';
            msgDiv.innerHTML = msg;
            setTimeout(() => { msgDiv.style.display = 'none'; }, 5000);
        }
    }

    function renderTiers() {
        const container = document.getElementById('free-marriage-tiers-container');
        if (!container) return;
        let html = `<div class="table-responsive"><table style="width:100%"><thead><tr><th>Montant min (G)</th><th>Montant max (G)</th><th>Mariages offerts</th><th></th></tr></thead><tbody>`;
        (window.ownerAdvanced.currentTiers || []).forEach((tier, idx) => {
            html += `
                <tr>
                    <td><input type="number" class="tier-min" value="${tier.min}" step="1" min="0"></td>
                    <td><input type="number" class="tier-max" value="${tier.max === null ? '' : tier.max}" step="1" min="0" placeholder="Infini"></td>
                    <td><input type="number" class="tier-count" value="${tier.count}" step="1" min="1"></td>
                    <td><button type="button" class="btn-danger" onclick="ownerAdvanced.removeTier(${idx})">✕</button></td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    // ==================== PATCH DE CARTMANAGER ====================
    function patchCartManager() {
        if (typeof window.CartManager === 'undefined') {
            // Attendre que CartManager soit disponible
            const checkInterval = setInterval(() => {
                if (typeof window.CartManager !== 'undefined') {
                    clearInterval(checkInterval);
                    performPatch();
                }
            }, 200);
        } else {
            performPatch();
        }

        function performPatch() {
            // 1. Patcher updateFreeMarriages
            const originalUpdate = window.CartManager.updateFreeMarriages;
            if (originalUpdate) {
                window.CartManager.updateFreeMarriages = function() {
                    // Copie des paramètres avancés
                    const cfg = (window.APP_STATE && window.APP_STATE.advancedSettings && window.APP_STATE.advancedSettings.freeMarriage) || {
                        tiers: [
                            { min: 0, max: 50, count: 1 },
                            { min: 51, max: 150, count: 2 },
                            { min: 151, max: null, count: 3 }
                        ],
                        winAmount: 1000
                    };
                    const tiers = cfg.tiers;

                    // Filtrer les anciens mariages gratuits
                    window.APP_STATE.currentCart = window.APP_STATE.currentCart.filter(b => !(b.free && b.freeType === 'special_marriage'));

                    const payantsByDraw = {};
                    window.APP_STATE.currentCart.forEach(bet => {
                        if (bet.amount > 0) {
                            if (!payantsByDraw[bet.drawId]) payantsByDraw[bet.drawId] = [];
                            payantsByDraw[bet.drawId].push(bet);
                        }
                    });

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
                            const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
                            const num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
                            const freeBet = {
                                game: 'auto_marriage',
                                number: `${num1}&${num2}`,
                                cleanNumber: `${num1}&${num2}`,
                                amount: 0
                            };
                            const newFree = {
                                ...freeBet,
                                id: Date.now() + Math.random() + i,
                                drawId: drawId,
                                drawName: payants[0]?.drawName || 'Tiraj',
                                free: true,
                                freeType: 'special_marriage',
                                freeWinAmount: cfg.winAmount
                            };
                            window.APP_STATE.currentCart.push(newFree);
                        }
                    });
                    window.CartManager.renderCart();
                };
            }

            // 2. Patcher generateTicketHTML (elle n'est pas dans CartManager mais globale)
            if (typeof window.generateTicketHTML === 'function') {
                window._originalGenerateTicketHTML = window.generateTicketHTML;
                window.generateTicketHTML = function(ticket) {
                    const advanced = (window.APP_STATE && window.APP_STATE.advancedSettings) || { print: { fontSize: 32 }, footer: { line1: "tickets valable jusqu'à 90 jours", line2: "Ref : +509 ", line3: "LOTATO S.A." } };
                    const printCfg = advanced.print || { fontSize: 32 };
                    const footerCfg = advanced.footer || { line1: "tickets valable jusqu'à 90 jours", line2: "Ref : +509 ", line3: "LOTATO S.A." };
                    const cfg = window.APP_STATE.lotteryConfig || window.CONFIG;
                    const lotteryName = cfg.LOTTERY_NAME || cfg.name || 'LOTATO';
                    const slogan = cfg.slogan || '';
                    const logoUrl = cfg.LOTTERY_LOGO || cfg.logo || cfg.logoUrl || '';

                    // Normalisation de la date (identique à l'original)
                    function normalizeDateString(dateStr) {
                        if (!dateStr) return null;
                        let normalized = dateStr.replace(' ', 'T');
                        return normalized;
                    }
                    let formattedDate = 'Date invalide';
                    if (ticket.date) {
                        const normalized = normalizeDateString(ticket.date);
                        const dateObj = new Date(normalized);
                        if (!isNaN(dateObj)) {
                            formattedDate = dateObj.toLocaleDateString('fr-FR', { timeZone: 'America/Port-au-Prince' }) + ' ' + 
                                            dateObj.toLocaleTimeString('fr-FR', { timeZone: 'America/Port-au-Prince', hour: '2-digit', minute: '2-digit' });
                        }
                    }
                    let drawName = ticket.draw_name || ticket.drawName;
                    if (!drawName && window.APP_STATE.draws && ticket.draw_id) {
                        const draw = window.APP_STATE.draws.find(d => d.id == ticket.draw_id);
                        drawName = draw ? draw.name : 'Tiraj Inkonu';
                    } else if (!drawName) drawName = 'Tiraj Inkonu';

                    const getGameAbbreviation = (gameName, bet) => {
                        if (bet && bet.free && bet.freeType === 'special_marriage') return 'marg';
                        const map = { 'borlette':'bor','lotto3':'lo3','lotto4':'lo4','lotto5':'lo5','auto_marriage':'mara','auto_lotto4':'loa4','auto_lotto5':'loa5','mariage':'mar','bo':'bo','grap':'grap' };
                        const key = (gameName || '').trim().toLowerCase();
                        return map[key] || gameName;
                    };

                    const betsHTML = (ticket.bets || []).map(b => {
                        const gameAbbr = getGameAbbreviation(b.game || '', b);
                        let displayNumber = b.number || '';
                        if (b.game === 'auto_marriage' && displayNumber.includes('&')) displayNumber = displayNumber.replace('&', '*');
                        return `<div class="bet-row"><span>${gameAbbr} ${displayNumber}</span><span>${b.amount || 0} G</span></div>`;
                    }).join('');

                    return `
                        <div style="font-size: ${printCfg.fontSize}px; font-family: 'Courier New', monospace;">
                            <div class="header">
                                ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : ''}
                                <strong style="font-size: ${printCfg.fontSize + 4}px;">${lotteryName}</strong>
                                ${slogan ? `<small style="font-size: ${printCfg.fontSize - 6}px;">${slogan}</small>` : ''}
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
                            <div class="total-row" style="font-size: ${printCfg.fontSize + 4}px;">
                                <span>TOTAL</span>
                                <span>${ticket.total_amount || ticket.total || 0} Gdes</span>
                            </div>
                            <div class="footer" style="font-size: ${printCfg.fontSize}px;">
                                <p>${footerCfg.line1}</p>
                                <p>${footerCfg.line2}</p>
                                <p><strong>${footerCfg.line3}</strong></p>
                            </div>
                        </div>
                    `;
                };
            }
        }
    }

    function applyPrintSettingsToCartManager() {
        // Force la mise à jour de la fonction generateTicketHTML avec les derniers paramètres
        if (typeof window.generateTicketHTML === 'function' && window.APP_STATE && window.APP_STATE.advancedSettings) {
            // La fonction patchée lira directement window.APP_STATE.advancedSettings, donc pas besoin de la redéfinir.
            // On va juste forcer un re-render si une impression est en cours ? pas nécessaire.
        }
        // Si CartManager a déjà des mariages gratuits, on les recalculera lors du prochain addBet ou on peut le faire manuellement
        if (window.CartManager && typeof CartManager.updateFreeMarriages === 'function') {
            window.CartManager.updateFreeMarriages();
        }
    }

    function observeTabSwitch() {
        // L'onglet "Réglages" a besoin d'être rechargé à chaque affichage ?
        // On peut attacher un événement sur les clics d'onglet, mais la fonction switchTab de owner.html
        // n'est pas toujours remplacée. On va simplement récupérer les paramètres à chaque fois que
        // l'onglet devient actif (polling ou mutation observer léger)
        const observer = new MutationObserver(() => {
            const advancedTab = document.getElementById('tab-advanced');
            if (advancedTab && advancedTab.classList.contains('active')) {
                loadAdvancedSettings(); // recharger à chaque affichage
            }
        });
        observer.observe(document.body, { attributes: true, subtree: false, attributeFilter: ['class'] });
    }
})();
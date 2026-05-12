// ownerAdvancedSettings.js - Version stable sans blocage
(function() {
    // Ne s'exécute que si l'utilisateur est propriétaire
    const role = localStorage.getItem('user_role');
    if (role !== 'owner') return;

    // Attendre le chargement complet du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    async function init() {
        try {
            // Injecter l'onglet
            addSettingsTab();
            // Créer le contenu de l'onglet
            createSettingsPanel();
            // Charger les paramètres
            await loadAdvancedSettings();
            // Écouter les changements d'onglet pour recharger si besoin
            observeTabSwitch();
        } catch (err) {
            console.error("ownerAdvancedSettings: erreur d'initialisation", err);
        }
    }

    function addSettingsTab() {
        const container = document.querySelector('.tabs');
        if (!container) return;
        if (document.querySelector('.tab[data-tab="advanced"]')) return;
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.setAttribute('data-tab', 'advanced');
        tab.innerHTML = '⚙️ Réglages';
        tab.onclick = () => switchToTab('advanced');
        container.appendChild(tab);
    }

    // Fonction pour changer d'onglet sans casser l'existant
    function switchToTab(tabId) {
        // Déclencher la fonction existante si elle existe
        if (typeof window.switchTab === 'function') {
            window.switchTab(tabId);
        } else {
            // Fallback manuel
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const tabEl = document.querySelector(`.tab[data-tab="${tabId}"]`);
            if (tabEl) tabEl.classList.add('active');
            const content = document.getElementById(`tab-${tabId}`);
            if (content) content.classList.add('active');
        }
    }

    function createSettingsPanel() {
        const parent = document.querySelector('.tab-content.active')?.parentNode;
        if (!parent) return;
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
                    <button type="button" class="btn-primary" style="margin-top:10px;" id="add-tier-btn">+ Ajouter un palier</button>
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
                <div class="form-group" style="grid-column: span 2;"><label>Ligne 1</label><input type="text" id="footer-line1"></div>
                <div class="form-group" style="grid-column: span 2;"><label>Ligne 2</label><input type="text" id="footer-line2"></div>
                <div class="form-group" style="grid-column: span 2;"><label>Ligne 3</label><input type="text" id="footer-line3"></div>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn-primary" id="save-settings-btn">Enregistrer</button>
                <button class="btn-primary" id="reload-settings-btn">Recharger</button>
            </div>
            <div id="advanced-settings-message" class="alert" style="display:none;"></div>
        `;
        parent.appendChild(panel);

        // Attacher les événements après création
        document.getElementById('add-tier-btn')?.addEventListener('click', () => addTier());
        document.getElementById('save-settings-btn')?.addEventListener('click', () => saveSettings());
        document.getElementById('reload-settings-btn')?.addEventListener('click', () => loadAdvancedSettings());

        window.ownerAdvanced = { currentTiers: [], renderTiers };
    }

    let currentTiers = [];
    function renderTiers() {
        const container = document.getElementById('free-marriage-tiers-container');
        if (!container) return;
        let html = `<div class="table-responsive"><table style="width:100%"><thead><tr><th>Montant min (G)</th><th>Montant max (G)</th><th>Mariages offerts</th><th></th></tr></thead><tbody>`;
        currentTiers.forEach((tier, idx) => {
            html += `
                <tr>
                    <td><input type="number" class="tier-min" value="${tier.min}" step="1" min="0"></td>
                    <td><input type="number" class="tier-max" value="${tier.max === null ? '' : tier.max}" step="1" min="0" placeholder="Infini"></td>
                    <td><input type="number" class="tier-count" value="${tier.count}" step="1" min="1"></td>
                    <td><button type="button" class="btn-danger remove-tier" data-idx="${idx}">✕</button></td>
                </tr>
            `;
        });
        html += `</tbody></table></div>`;
        container.innerHTML = html;
        // Attacher événements suppression
        document.querySelectorAll('.remove-tier').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.idx);
                currentTiers.splice(idx, 1);
                renderTiers();
            });
        });
    }

    function addTier() {
        currentTiers.push({ min: 0, max: null, count: 1 });
        renderTiers();
    }

    async function loadAdvancedSettings() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        try {
            const res = await fetch('/api/owner/advanced-settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Erreur chargement');
            const data = await res.json();
            if (data.freeMarriage) {
                currentTiers = data.freeMarriage.tiers || [
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
            // Mettre à jour APP_STATE si disponible
            if (window.APP_STATE) window.APP_STATE.advancedSettings = data;
            showMessage('Réglages chargés', true);
        } catch (err) {
            console.error(err);
            showMessage('Erreur chargement des réglages', false);
        }
    }

    async function saveSettings() {
        // Récupérer les valeurs des paliers depuis le DOM
        const tierMins = document.querySelectorAll('.tier-min');
        const newTiers = [];
        for (let i = 0; i < tierMins.length; i++) {
            const min = parseFloat(document.querySelectorAll('.tier-min')[i].value);
            const maxElem = document.querySelectorAll('.tier-max')[i];
            let max = maxElem.value.trim() === '' ? null : parseFloat(maxElem.value);
            const count = parseInt(document.querySelectorAll('.tier-count')[i].value);
            newTiers.push({ min, max, count });
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
            const res = await fetch('/api/owner/advanced-settings', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showMessage('✅ Réglages enregistrés', true);
                if (window.APP_STATE) window.APP_STATE.advancedSettings = payload;
                // Recalculer les mariages gratuits dans le panier si nécessaire
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

    function observeTabSwitch() {
        const observer = new MutationObserver(() => {
            const advancedTab = document.getElementById('tab-advanced');
            if (advancedTab && advancedTab.classList.contains('active')) {
                loadAdvancedSettings(); // recharger à chaque affichage
            }
        });
        observer.observe(document.body, { attributes: true, subtree: false, attributeFilter: ['class'] });
    }
})();
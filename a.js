// globalLimitsManager.js - Version stable avec intégration parfaite
(function() {
    if (window.globalLimitsManagerReady) return;
    window.globalLimitsManagerReady = true;

    // ========== Fonctions API ==========
    async function apiFetch(url, options = {}) {
        const token = localStorage.getItem('auth_token');
        if (!token) throw new Error('Non authentifié');
        const headers = {
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Erreur HTTP ${response.status}`);
        }
        return response.json();
    }

    // ========== Création de l'onglet et du contenu ==========
    function createGlobalLimitsUI() {
        // 1. Onglet
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) {
            console.error('Conteneur .tabs introuvable');
            return;
        }
        if (document.getElementById('global-limits-tab')) return; // déjà créé

        const tab = document.createElement('div');
        tab.id = 'global-limits-tab';
        tab.className = 'tab';
        tab.textContent = '🌍 Limites globales';
        tab.setAttribute('onclick', 'switchTab("global-limits")');
        tabsContainer.appendChild(tab);

        // 2. Contenu (tab-content)
        const main = document.querySelector('.content-area');
        if (!main) {
            console.error('Conteneur .content-area introuvable');
            return;
        }

        const content = document.createElement('div');
        content.id = 'tab-global-limits';
        content.className = 'tab-content';
        content.innerHTML = `
            <div class="section-title">
                <i class="fas fa-globe"></i> Limites globales (tous tirages)
                <button id="refresh-global-limits-btn" class="filter-btn" style="margin-left: 15px;">
                    <i class="fas fa-sync-alt"></i> Rafraîchir
                </button>
            </div>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr auto;">
                <div class="form-group">
                    <label>Numéro (00-99)</label>
                    <input type="text" id="global-number" maxlength="2" placeholder="ex: 48">
                </div>
                <div class="form-group">
                    <label>Montant maximum (G)</label>
                    <input type="number" id="global-amount" placeholder="ex: 1000" step="1" min="1">
                </div>
                <div style="display: flex; align-items: end;">
                    <button id="add-global-limit-btn" class="btn-primary">
                        <i class="fas fa-plus"></i> Ajouter / Modifier
                    </button>
                </div>
            </div>
            <div id="global-limits-list" class="list-container" style="margin-top: 20px;">
                <p>Chargement...</p>
            </div>
            <div id="global-limits-message" class="alert" style="display: none;"></div>
        `;
        main.appendChild(content);

        // 3. Événements
        const addBtn = document.getElementById('add-global-limit-btn');
        if (addBtn) addBtn.addEventListener('click', addGlobalLimit);
        const refreshBtn = document.getElementById('refresh-global-limits-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', loadGlobalLimits);
    }

    // ========== Chargement des limites ==========
    async function loadGlobalLimits() {
        const container = document.getElementById('global-limits-list');
        if (!container) return;
        container.innerHTML = '<p>Chargement...</p>';
        try {
            const data = await apiFetch('/api/owner/global-limits');
            if (!data || data.length === 0) {
                container.innerHTML = '<p>Aucune limite globale définie.</p>';
                return;
            }
            let html = `
                <div class="table-responsive">
                    <table class="agents-table">
                        <thead>
                            <tr><th>Numéro</th><th>Montant maximum (G)</th><th>Action</th> </tr>
                        </thead>
                        <tbody>
            `;
            for (const limit of data) {
                html += `
                    <tr>
                        <td><strong>${escapeHtml(limit.number)}</strong></td>
                        <td>${parseFloat(limit.limit_amount).toLocaleString('fr-FR')} G</td>
                        <td><button class="btn-danger" onclick="window.removeGlobalLimit('${limit.number}')">Supprimer</button></td>
                    </tr>
                `;
            }
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = `<p class="loss">❌ Erreur : ${error.message}</p>`;
        }
    }

    // ========== Ajouter une limite ==========
    async function addGlobalLimit() {
        const numberInput = document.getElementById('global-number');
        const amountInput = document.getElementById('global-amount');
        const number = numberInput.value.trim();
        const amount = parseFloat(amountInput.value);

        if (!number || !/^\d{1,2}$/.test(number)) {
            showMessage('Veuillez entrer un numéro valide (1 ou 2 chiffres).', false);
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            showMessage('Veuillez entrer un montant positif.', false);
            return;
        }

        const normalized = number.padStart(2, '0');
        try {
            await apiFetch('/api/owner/global-limits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: normalized, limitAmount: amount })
            });
            showMessage(`✅ Limite pour le numéro ${normalized} définie à ${amount.toLocaleString('fr-FR')} G`, true);
            numberInput.value = '';
            amountInput.value = '';
            loadGlobalLimits();
        } catch (error) {
            showMessage(`❌ Erreur : ${error.message}`, false);
        }
    }

    // ========== Supprimer une limite ==========
    window.removeGlobalLimit = async function(number) {
        if (!confirm(`Supprimer la limite pour le numéro ${number} ?`)) return;
        try {
            await apiFetch(`/api/owner/global-limits/${number}`, { method: 'DELETE' });
            showMessage(`✅ Limite supprimée pour le numéro ${number}`, true);
            loadGlobalLimits();
        } catch (error) {
            showMessage(`❌ Erreur : ${error.message}`, false);
        }
    };

    // ========== Affichage des messages ==========
    function showMessage(msg, isSuccess) {
        const msgDiv = document.getElementById('global-limits-message');
        if (msgDiv) {
            msgDiv.textContent = msg;
            msgDiv.className = `alert ${isSuccess ? 'alert-success' : 'alert-danger'}`;
            msgDiv.style.display = 'block';
            setTimeout(() => msgDiv.style.display = 'none', 5000);
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ========== Initialisation ==========
    function init() {
        createGlobalLimitsUI();

        // Charger les limites uniquement lorsque l'onglet devient actif
        const tab = document.getElementById('global-limits-tab');
        if (tab) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (tab.classList.contains('active')) {
                            loadGlobalLimits();
                        }
                    }
                });
            });
            observer.observe(tab, { attributes: true });

            // Si l'onglet est déjà actif au chargement (rare), on charge
            if (tab.classList.contains('active')) {
                loadGlobalLimits();
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
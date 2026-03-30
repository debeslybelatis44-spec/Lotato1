// globalLimitsManager.js - Version compatible avec owner.html
(function() {
    if (window.globalLimitsManagerReady) return;
    window.globalLimitsManagerReady = true;

    // Fonction utilitaire pour les appels API avec token
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

    // Création de l'interface dans l'onglet "Limites globales"
    function createGlobalLimitsTab() {
        // Vérifier si le conteneur d'onglets existe
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) {
            console.error('Conteneur .tabs introuvable');
            return;
        }

        // Vérifier si l'onglet existe déjà
        if (document.getElementById('global-limits-tab')) return;

        // Créer l'onglet
        const tab = document.createElement('div');
        tab.id = 'global-limits-tab';
        tab.className = 'tab';
        tab.textContent = '🌍 Limites globales';
        tab.onclick = () => switchTab('global-limits');
        tabsContainer.appendChild(tab);

        // Créer le contenu de l'onglet (screen)
        const screens = document.querySelectorAll('.screen');
        const lastScreen = screens[screens.length - 1];
        if (!lastScreen) return;

        const newScreen = document.createElement('div');
        newScreen.id = 'tab-global-limits';
        newScreen.className = 'tab-content';
        newScreen.innerHTML = `
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
        // Insérer après le dernier écran ou dans le main
        const main = document.querySelector('.content-area');
        if (main) main.appendChild(newScreen);
        else document.body.appendChild(newScreen);

        // Ajouter les événements
        document.getElementById('add-global-limit-btn').addEventListener('click', addGlobalLimit);
        document.getElementById('refresh-global-limits-btn').addEventListener('click', loadGlobalLimits);
    }

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
                        <td><button class="btn-danger" data-number="${limit.number}" onclick="window.removeGlobalLimit('${limit.number}')">Supprimer</button></td>
                    </tr>
                `;
            }
            html += `</tbody></table></div>`;
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = `<p class="loss">❌ Erreur : ${error.message}</p>`;
        }
    }

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

    // Initialisation après le chargement du DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createGlobalLimitsTab();
            // Si l'onglet est déjà actif par défaut, on peut charger les limites
            // mais on laisse l'utilisateur cliquer pour charger
        });
    } else {
        createGlobalLimitsTab();
    }

    // Exposer la fonction de rafraîchissement si nécessaire
    window.refreshGlobalLimits = loadGlobalLimits;
})();
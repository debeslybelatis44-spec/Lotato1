// globalLimitsManager.js
// Gestion indépendante des limites globales (tous tirages)
// Utilise les routes /api/owner/global-limits du serveur

(function() {
    // Éviter les doubles initialisations
    if (window.globalLimitsManagerReady) return;
    window.globalLimitsManagerReady = true;

    let currentOwnerId = null;

    // ========== Création de l'interface ==========
    function createUI() {
        // Vérifier si l'élément d'ancrage existe déjà
        if (document.getElementById('global-limits-manager')) return;

        // Chercher le conteneur principal (par exemple .content-area)
        const main = document.querySelector('.content-area');
        if (!main) {
            console.error('Élément .content-area introuvable');
            return;
        }

        // Créer une nouvelle section pour les limites globales
        const section = document.createElement('section');
        section.id = 'global-limits-manager';
        section.className = 'screen';
        section.innerHTML = `
            <div style="padding: 20px;">
                <h2 class="section-title">
                    <i class="fas fa-globe"></i> Limites globales (tous tirages)
                    <button id="refresh-global-limits" class="filter-btn" style="margin-left: 15px; padding: 5px 12px;">
                        <i class="fas fa-sync-alt"></i> Rafraîchir
                    </button>
                </h2>
                <div class="form-grid" style="grid-template-columns: 1fr 1fr auto;">
                    <div class="form-group">
                        <label>Numéro (00-99)</label>
                        <input type="text" id="global-number" maxlength="2" placeholder="ex: 48" autocomplete="off">
                    </div>
                    <div class="form-group">
                        <label>Montant maximum (G)</label>
                        <input type="number" id="global-amount" placeholder="ex: 1000" step="1" min="1">
                    </div>
                    <div style="display: flex; align-items: end;">
                        <button id="add-global-limit" class="btn-primary">
                            <i class="fas fa-plus"></i> Ajouter / Modifier
                        </button>
                    </div>
                </div>
                <div id="global-limits-list" class="list-container" style="margin-top: 20px;">
                    <p>Chargement...</p>
                </div>
                <div id="global-limits-message" class="alert" style="display: none;"></div>
            </div>
        `;
        main.appendChild(section);

        // Ajouter un onglet dans la barre de navigation s'il n'existe pas
        const nav = document.querySelector('.nav-bar');
        if (nav && !document.querySelector('.nav-item[data-tab="global-limits"]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item';
            tab.setAttribute('data-tab', 'global-limits');
            tab.innerHTML = '<i class="fas fa-chart-line"></i><span>Limites globales</span>';
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                // Cacher tous les écrans
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                // Désactiver tous les onglets
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                // Afficher notre section
                document.getElementById('global-limits-manager').classList.add('active');
                this.classList.add('active');
                // Recharger les limites
                loadGlobalLimits();
            });
            nav.appendChild(tab);
        }

        // Événements
        document.getElementById('add-global-limit').addEventListener('click', addGlobalLimit);
        document.getElementById('refresh-global-limits').addEventListener('click', loadGlobalLimits);
    }

    // ========== Appel API ==========
    async function fetchWithAuth(url, options = {}) {
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

    // Charger la liste des limites globales
    async function loadGlobalLimits() {
        const container = document.getElementById('global-limits-list');
        if (!container) return;
        container.innerHTML = '<p>Chargement...</p>';
        try {
            const data = await fetchWithAuth('/api/owner/global-limits');
            if (!data || data.length === 0) {
                container.innerHTML = '<p>Aucune limite globale définie.</p>';
                return;
            }
            let html = `
                <div class="table-responsive">
                    <table class="agents-table">
                        <thead>
                            <tr>
                                <th>Numéro</th>
                                <th>Montant maximum (G)</th>
                                <th>Action</th>
                            </tr>
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
            console.error('Erreur chargement limites globales:', error);
            container.innerHTML = `<p class="loss">❌ Erreur : ${error.message}</p>`;
        }
    }

    // Ajouter ou modifier une limite globale
    async function addGlobalLimit() {
        const numberInput = document.getElementById('global-number');
        const amountInput = document.getElementById('global-amount');
        const number = numberInput.value.trim();
        const amount = parseFloat(amountInput.value);

        if (!number || !/^\d{1,2}$/.test(number)) {
            showMessage('Veuillez entrer un numéro à 1 ou 2 chiffres (ex: 5 ou 48).', false);
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            showMessage('Veuillez entrer un montant valide (>0).', false);
            return;
        }

        const normalized = number.padStart(2, '0');
        try {
            await fetchWithAuth('/api/owner/global-limits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: normalized, limitAmount: amount })
            });
            showMessage(`✅ Limite globale pour le numéro ${normalized} définie à ${amount.toLocaleString('fr-FR')} G`, true);
            numberInput.value = '';
            amountInput.value = '';
            loadGlobalLimits();
        } catch (error) {
            showMessage(`❌ Erreur : ${error.message}`, false);
        }
    }

    // Supprimer une limite globale
    window.removeGlobalLimit = async function(number) {
        if (!confirm(`Supprimer la limite globale pour le numéro ${number} ?`)) return;
        try {
            await fetchWithAuth(`/api/owner/global-limits/${number}`, { method: 'DELETE' });
            showMessage(`✅ Limite globale pour le numéro ${number} supprimée`, true);
            loadGlobalLimits();
        } catch (error) {
            showMessage(`❌ Erreur : ${error.message}`, false);
        }
    };

    // Afficher un message temporaire
    function showMessage(msg, isSuccess) {
        const msgDiv = document.getElementById('global-limits-message');
        if (!msgDiv) return;
        msgDiv.textContent = msg;
        msgDiv.className = `alert ${isSuccess ? 'alert-success' : 'alert-danger'}`;
        msgDiv.style.display = 'block';
        setTimeout(() => {
            msgDiv.style.display = 'none';
        }, 5000);
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
        createUI();
        // Charger les limites dès que l'onglet est visible (on le fera au clic sur l'onglet)
        // Mais on peut aussi charger au démarrage si la section est active par défaut ?
        // Pour être sûr, on charge quand l'utilisateur clique sur l'onglet.
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
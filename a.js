// globalLimitsManager.js - Version ultra simple avec logs
(function() {
    console.log("🔵 Démarrage de globalLimitsManager.js");

    if (window.globalLimitsManagerReady) return;
    window.globalLimitsManagerReady = true;

    // Fonction API avec token
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

    // Création de l'onglet et du contenu
    function init() {
        console.log("🔵 Initialisation...");

        // 1. Trouver la barre d'onglets
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) {
            console.error("❌ .tabs introuvable");
            return;
        }
        console.log("✅ .tabs trouvé");

        // Éviter les doublons
        if (document.getElementById('global-limits-tab')) {
            console.log("⚠️ Onglet déjà présent");
            return;
        }

        // 2. Créer l'onglet
        const tab = document.createElement('div');
        tab.id = 'global-limits-tab';
        tab.className = 'tab';
        tab.textContent = '🌍 Limites globales';
        tab.setAttribute('onclick', 'switchTab("global-limits")');
        tabsContainer.appendChild(tab);
        console.log("✅ Onglet ajouté");

        // 3. Créer le contenu de l'onglet
        const main = document.querySelector('.content-area');
        if (!main) {
            console.error("❌ .content-area introuvable");
            return;
        }

        const content = document.createElement('div');
        content.id = 'tab-global-limits';
        content.className = 'tab-content';
        // Styles inline pour forcer l'affichage
        content.style.padding = '20px';
        content.style.backgroundColor = 'transparent';
        content.innerHTML = `
            <div class="section-title" style="margin-bottom: 20px;">
                <i class="fas fa-globe"></i> Limites globales (tous tirages)
                <button id="refresh-global-limits-btn" class="filter-btn" style="margin-left: 15px; padding: 5px 12px;">
                    <i class="fas fa-sync-alt"></i> Rafraîchir
                </button>
            </div>
            <div class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 15px; margin-bottom: 20px;">
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px;">Numéro (00-99)</label>
                    <input type="text" id="global-number" maxlength="2" placeholder="ex: 48" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white;">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 5px;">Montant maximum (G)</label>
                    <input type="number" id="global-amount" placeholder="ex: 1000" step="1" min="1" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white;">
                </div>
                <div style="display: flex; align-items: end;">
                    <button id="add-global-limit-btn" class="btn-primary" style="padding: 10px 20px;">
                        <i class="fas fa-plus"></i> Ajouter / Modifier
                    </button>
                </div>
            </div>
            <div id="global-limits-list" class="list-container" style="margin-top: 20px; background: rgba(255,255,255,0.02); border-radius: 20px; padding: 20px;">
                <p>Chargement...</p>
            </div>
            <div id="global-limits-message" class="alert" style="display: none; margin-top: 15px;"></div>
        `;
        main.appendChild(content);
        console.log("✅ Contenu de l'onglet ajouté");

        // 4. Écouteurs d'événements
        const addBtn = document.getElementById('add-global-limit-btn');
        if (addBtn) {
            addBtn.addEventListener('click', addGlobalLimit);
            console.log("✅ Bouton Ajouter connecté");
        } else {
            console.error("❌ Bouton Ajouter introuvable");
        }

        const refreshBtn = document.getElementById('refresh-global-limits-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadGlobalLimits);
            console.log("✅ Bouton Rafraîchir connecté");
        }

        // 5. Observer pour charger quand l'onglet devient actif
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (tab.classList.contains('active')) {
                        console.log("🔄 Onglet actif, chargement des limites...");
                        loadGlobalLimits();
                    }
                }
            });
        });
        observer.observe(tab, { attributes: true });

        // Charger si déjà actif
        if (tab.classList.contains('active')) {
            console.log("🔄 Onglet déjà actif, chargement initial...");
            loadGlobalLimits();
        }
    }

    // Charger les limites depuis le serveur
    async function loadGlobalLimits() {
        const container = document.getElementById('global-limits-list');
        if (!container) {
            console.error("❌ Container global-limits-list introuvable");
            return;
        }
        container.innerHTML = '<p>Chargement...</p>';
        try {
            console.log("📡 Appel API /api/owner/global-limits");
            const data = await apiFetch('/api/owner/global-limits');
            console.log("📡 Réponse reçue:", data);
            if (!data || data.length === 0) {
                container.innerHTML = '<p>Aucune limite globale définie.</p>';
                return;
            }
            let html = `
                <div class="table-responsive">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                                <th style="text-align: left; padding: 12px;">Numéro</th>
                                <th style="text-align: left; padding: 12px;">Montant maximum (G)</th>
                                <th style="text-align: left; padding: 12px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            for (const limit of data) {
                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 12px;"><strong>${escapeHtml(limit.number)}</strong></td>
                        <td style="padding: 12px;">${parseFloat(limit.limit_amount).toLocaleString('fr-FR')} G</td>
                        <td style="padding: 12px;"><button class="btn-danger" onclick="window.removeGlobalLimit('${limit.number}')" style="padding: 5px 10px;">Supprimer</button></td>
                    </tr>
                `;
            }
            html += `</tbody></table></div>`;
            container.innerHTML = html;
            console.log("✅ Affichage des limites mis à jour");
        } catch (error) {
            console.error("❌ Erreur chargement:", error);
            container.innerHTML = `<p class="loss">❌ Erreur : ${error.message}</p>`;
        }
    }

    // Ajouter une limite
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
            console.log(`📡 Ajout limite: ${normalized} = ${amount} G`);
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
            console.error("❌ Erreur ajout:", error);
            showMessage(`❌ Erreur : ${error.message}`, false);
        }
    }

    // Supprimer une limite
    window.removeGlobalLimit = async function(number) {
        if (!confirm(`Supprimer la limite pour le numéro ${number} ?`)) return;
        try {
            console.log(`📡 Suppression limite: ${number}`);
            await apiFetch(`/api/owner/global-limits/${number}`, { method: 'DELETE' });
            showMessage(`✅ Limite supprimée pour le numéro ${number}`, true);
            loadGlobalLimits();
        } catch (error) {
            console.error("❌ Erreur suppression:", error);
            showMessage(`❌ Erreur : ${error.message}`, false);
        }
    };

    // Message temporaire
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

    // Démarrer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
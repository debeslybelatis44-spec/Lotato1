// globalLimitsManager.js - Version modale simple
(function() {
    if (window.globalLimitsManagerReady) return;
    window.globalLimitsManagerReady = true;

    // Styles pour la modale
    const modalStyles = `
        <style id="global-limits-modal-styles">
            .global-limits-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.8);
                z-index: 10000;
                align-items: center;
                justify-content: center;
            }
            .global-limits-modal-content {
                background: #1e1f36;
                border-radius: 20px;
                width: 90%;
                max-width: 700px;
                max-height: 80vh;
                overflow-y: auto;
                padding: 25px;
                position: relative;
                color: white;
            }
            .global-limits-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 10px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .global-limits-modal-header h2 {
                margin: 0;
                font-size: 1.5rem;
            }
            .global-limits-modal-close {
                background: none;
                border: none;
                color: white;
                font-size: 28px;
                cursor: pointer;
            }
            .global-limits-form {
                display: grid;
                grid-template-columns: 1fr 1fr auto;
                gap: 15px;
                margin-bottom: 20px;
            }
            .global-limits-form input {
                width: 100%;
                padding: 10px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.2);
                background: rgba(0,0,0,0.3);
                color: white;
            }
            .global-limits-table {
                width: 100%;
                border-collapse: collapse;
            }
            .global-limits-table th,
            .global-limits-table td {
                padding: 10px;
                text-align: left;
                border-bottom: 1px solid rgba(255,255,255,0.1);
            }
            .global-limits-table th {
                background: rgba(0,212,255,0.2);
            }
            .global-limits-message {
                margin-top: 15px;
                padding: 10px;
                border-radius: 8px;
                display: none;
            }
            .global-limits-message.success {
                background: rgba(0,241,144,0.2);
                border: 1px solid #00f190;
                color: #00f190;
            }
            .global-limits-message.error {
                background: rgba(255,77,77,0.2);
                border: 1px solid #ff4d4d;
                color: #ff4d4d;
            }
            .global-limits-btn {
                background: linear-gradient(135deg, #ad00f1, #00d4ff);
                border: none;
                border-radius: 30px;
                padding: 8px 16px;
                color: white;
                cursor: pointer;
                font-weight: bold;
                margin-left: 15px;
            }
            .global-limits-delete-btn {
                background: rgba(255,77,77,0.2);
                border: 1px solid #ff4d4d;
                color: #ff4d4d;
                border-radius: 20px;
                padding: 4px 12px;
                cursor: pointer;
            }
        </style>
    `;

    // Injecter les styles
    document.head.insertAdjacentHTML('beforeend', modalStyles);

    // Créer la modale
    function createModal() {
        const modal = document.createElement('div');
        modal.className = 'global-limits-modal';
        modal.id = 'global-limits-modal';
        modal.innerHTML = `
            <div class="global-limits-modal-content">
                <div class="global-limits-modal-header">
                    <h2><i class="fas fa-globe"></i> Limites globales (tous tirages)</h2>
                    <button class="global-limits-modal-close" id="close-modal-btn">&times;</button>
                </div>
                <div class="global-limits-form">
                    <div>
                        <label>Numéro (00-99)</label>
                        <input type="text" id="modal-global-number" maxlength="2" placeholder="ex: 48">
                    </div>
                    <div>
                        <label>Montant max (G)</label>
                        <input type="number" id="modal-global-amount" placeholder="ex: 1000" step="1" min="1">
                    </div>
                    <div style="display: flex; align-items: end;">
                        <button id="modal-add-btn" class="global-limits-btn" style="margin:0;">Ajouter</button>
                    </div>
                </div>
                <div id="modal-limits-list" style="max-height: 400px; overflow-y: auto;">
                    <p>Chargement...</p>
                </div>
                <div id="modal-message" class="global-limits-message"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Événements
        document.getElementById('close-modal-btn').onclick = () => {
            modal.style.display = 'none';
        };
        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
        document.getElementById('modal-add-btn').onclick = addLimit;

        return modal;
    }

    // Fonction API
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
            throw new Error(error.error || `Erreur ${response.status}`);
        }
        return response.json();
    }

    // Charger les limites
    async function loadLimits() {
        const container = document.getElementById('modal-limits-list');
        if (!container) return;
        container.innerHTML = '<p>Chargement...</p>';
        try {
            const data = await apiFetch('/api/owner/global-limits');
            if (!data || data.length === 0) {
                container.innerHTML = '<p>Aucune limite globale définie.</p>';
                return;
            }
            let html = `
                <table class="global-limits-table">
                    <thead>
                        <tr><th>Numéro</th><th>Montant max (G)</th><th>Action</th> </tr>
                    </thead>
                    <tbody>
            `;
            for (const limit of data) {
                html += `
                    <tr>
                        <td><strong>${escapeHtml(limit.number)}</strong></td>
                        <td>${parseFloat(limit.limit_amount).toLocaleString('fr-FR')} G</td>
                        <td><button class="global-limits-delete-btn" data-number="${limit.number}">Supprimer</button></td>
                    </tr>
                `;
            }
            html += `</tbody></table>`;
            container.innerHTML = html;

            // Attacher les événements de suppression
            container.querySelectorAll('.global-limits-delete-btn').forEach(btn => {
                btn.onclick = () => removeLimit(btn.getAttribute('data-number'));
            });
        } catch (error) {
            container.innerHTML = `<p style="color: #ff4d4d;">❌ Erreur : ${error.message}</p>`;
        }
    }

    // Ajouter une limite
    async function addLimit() {
        const numberInput = document.getElementById('modal-global-number');
        const amountInput = document.getElementById('modal-global-amount');
        const number = numberInput.value.trim();
        const amount = parseFloat(amountInput.value);

        if (!number || !/^\d{1,2}$/.test(number)) {
            showMessage('Numéro invalide (1 ou 2 chiffres).', false);
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            showMessage('Montant invalide.', false);
            return;
        }

        const normalized = number.padStart(2, '0');
        try {
            await apiFetch('/api/owner/global-limits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: normalized, limitAmount: amount })
            });
            showMessage(`✅ Limite pour ${normalized} = ${amount} G`, true);
            numberInput.value = '';
            amountInput.value = '';
            loadLimits();
        } catch (error) {
            showMessage(`❌ ${error.message}`, false);
        }
    }

    // Supprimer une limite
    async function removeLimit(number) {
        if (!confirm(`Supprimer la limite pour le numéro ${number} ?`)) return;
        try {
            await apiFetch(`/api/owner/global-limits/${number}`, { method: 'DELETE' });
            showMessage(`✅ Limite supprimée pour ${number}`, true);
            loadLimits();
        } catch (error) {
            showMessage(`❌ ${error.message}`, false);
        }
    }

    function showMessage(msg, isSuccess) {
        const msgDiv = document.getElementById('modal-message');
        if (msgDiv) {
            msgDiv.textContent = msg;
            msgDiv.className = `global-limits-message ${isSuccess ? 'success' : 'error'}`;
            msgDiv.style.display = 'block';
            setTimeout(() => {
                msgDiv.style.display = 'none';
            }, 4000);
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

    // Ajouter un bouton dans l'en-tête (à côté du nom du propriétaire)
    function addButton() {
        const userInfo = document.querySelector('.user-info');
        if (!userInfo) {
            console.error('Pas de .user-info');
            return;
        }
        const btn = document.createElement('button');
        btn.className = 'global-limits-btn';
        btn.innerHTML = '<i class="fas fa-chart-line"></i> Limites globales';
        btn.onclick = () => {
            const modal = document.getElementById('global-limits-modal');
            if (modal) {
                modal.style.display = 'flex';
                loadLimits();
            } else {
                createModal();
                document.getElementById('global-limits-modal').style.display = 'flex';
                loadLimits();
            }
        };
        userInfo.appendChild(btn);
        console.log('✅ Bouton "Limites globales" ajouté dans .user-info');
    }

    // Initialisation
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                addButton();
                // Créer la modale au préalable mais cachée
                createModal();
                document.getElementById('global-limits-modal').style.display = 'none';
            });
        } else {
            addButton();
            createModal();
            document.getElementById('global-limits-modal').style.display = 'none';
        }
    }

    init();
})();
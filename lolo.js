// ownerCustomizations.js - Tout-en-un pour le propriétaire
(function() {
    if (window.ownerCustomizationsReady) return;
    window.ownerCustomizationsReady = true;

    document.addEventListener('DOMContentLoaded', async function() {
        const role = localStorage.getItem('user_role');
        if (role !== 'owner') return;

        // ==================== 1. ONGLET RÉSULTATS ====================
        const tabsContainer = document.querySelector('.tabs');
        if (tabsContainer && !document.getElementById('owner-results-tab')) {
            const resultsTab = document.createElement('div');
            resultsTab.id = 'owner-results-tab';
            resultsTab.className = 'tab';
            resultsTab.innerHTML = '📋 Résultats';
            resultsTab.onclick = () => switchToResultsTab();
            tabsContainer.appendChild(resultsTab);

            const mainContainer = document.querySelector('.tab-content.active')?.parentNode;
            if (mainContainer && !document.getElementById('tab-owner-results')) {
                const resultsSection = document.createElement('div');
                resultsSection.id = 'tab-owner-results';
                resultsSection.className = 'tab-content';
                resultsSection.innerHTML = `
                    <div class="section-title"><i class="fas fa-calendar-alt"></i> Résultats des tirages</div>
                    <div class="results-filter" style="margin-bottom:20px;">
                        <button class="chip active" data-filter="all">Tous</button>
                        <button class="chip" data-filter="today">Aujourd'hui</button>
                        <button class="chip" data-filter="yesterday">Hier</button>
                        <button class="chip" data-filter="week">7 derniers jours</button>
                    </div>
                    <div id="owner-results-container" class="list-container" style="max-height:500px;">Chargement...</div>
                `;
                mainContainer.appendChild(resultsSection);
            }
        }

        // Styles pour les résultats (ajout unique)
        if (!document.getElementById('owner-custom-styles')) {
            const style = document.createElement('style');
            style.id = 'owner-custom-styles';
            style.textContent = `
                .results-filter { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                .result-day-group { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 15px; margin-bottom: 15px; }
                .result-draw-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
                .draw-name { font-weight: 600; }
                .draw-time { font-size: 0.8rem; color: #aaa; }
                .result-numbers { font-family: monospace; font-weight: bold; background: rgba(0,212,255,0.2); padding: 4px 12px; border-radius: 20px; }
                .chip { background: rgba(255,255,255,0.1); border: none; padding: 8px 16px; border-radius: 30px; color: white; cursor: pointer; }
                .chip.active { background: linear-gradient(135deg, #ad00f1, #00d4ff); }
                .fm-tier-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
                .fm-tier-row input { width: 120px; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.3); color: white; }
                .fm-tier-row button { background: rgba(255,77,77,0.2); border: 1px solid #ff4d4d; color: #ff4d4d; padding: 6px 12px; border-radius: 20px; cursor: pointer; }
            `;
            document.head.appendChild(style);
        }

        // Fonctions résultats
        let currentResultsFilter = 'all';
        async function loadOwnerResults(filter = 'all') {
            const container = document.getElementById('owner-results-container');
            if (!container) return;
            container.innerHTML = '<p>Chargement...</p>';
            const token = localStorage.getItem('auth_token');
            if (!token) { container.innerHTML = '<p class="loss">Session expirée.</p>'; return; }
            try {
                const res = await fetch('/api/winners/results', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`Erreur ${res.status}`);
                const data = await res.json();
                const results = data.results || [];
                renderResults(results, filter, container);
            } catch (e) {
                console.error(e);
                container.innerHTML = '<p class="loss">Impossible de charger les résultats.</p>';
            }
        }

        function renderResults(results, filter, container) {
            const now = new Date();
            const todayStr = now.toDateString();
            const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
            const yesterdayStr = yesterday.toDateString();
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate()-7);
            let filtered = results;
            if (filter === 'today') filtered = results.filter(r => new Date(r.published_at).toDateString() === todayStr);
            else if (filter === 'yesterday') filtered = results.filter(r => new Date(r.published_at).toDateString() === yesterdayStr);
            else if (filter === 'week') filtered = results.filter(r => new Date(r.published_at) >= weekAgo);
            if (filtered.length === 0) { container.innerHTML = '<p>Aucun résultat pour cette période.</p>'; return; }
            const grouped = {};
            filtered.forEach(r => {
                const day = new Date(r.published_at).toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
                if (!grouped[day]) grouped[day] = [];
                grouped[day].push(r);
            });
            let html = '';
            for (const [day, items] of Object.entries(grouped)) {
                html += `<div class="result-day-group"><h3>${day}</h3>`;
                items.forEach(r => {
                    const time = new Date(r.published_at).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
                    let numbersDisplay = '—';
                    if (r.lotto3) numbersDisplay = `${r.lotto3}  |  ${r.numbers[1]}  |  ${r.numbers[2]}`;
                    else if (r.numbers) numbersDisplay = Array.isArray(r.numbers) ? r.numbers.join(' - ') : r.numbers;
                    html += `<div class="result-draw-row"><div><span class="draw-name">${r.name || 'Tirage'}</span><br><span class="draw-time">${time}</span></div><span class="result-numbers">${numbersDisplay}</span></div>`;
                });
                html += `</div>`;
            }
            container.innerHTML = html;
        }

        function bindFilterEvents() {
            const filterContainer = document.querySelector('#tab-owner-results .results-filter');
            if (!filterContainer) return;
            filterContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.chip');
                if (!btn) return;
                const filter = btn.dataset.filter;
                if (!filter) return;
                document.querySelectorAll('#tab-owner-results .results-filter .chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentResultsFilter = filter;
                loadOwnerResults(currentResultsFilter);
            });
        }

        window.switchToResultsTab = function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const resultsTab = document.getElementById('owner-results-tab');
            const resultsSection = document.getElementById('tab-owner-results');
            if (resultsTab) resultsTab.classList.add('active');
            if (resultsSection) {
                resultsSection.classList.add('active');
                if (!resultsSection.dataset.loaded) {
                    loadOwnerResults('all');
                    resultsSection.dataset.loaded = 'true';
                }
                bindFilterEvents();
            }
        };

        // ==================== 2. GESTION DES MARIAGES GRATUITS ====================
        let targetTab = document.getElementById('tab-advanced');
        if (!targetTab) targetTab = document.getElementById('tab-config');
        if (targetTab && !document.getElementById('free-marriage-manager')) {
            const section = document.createElement('div');
            section.id = 'free-marriage-manager';
            section.style.marginTop = '30px';
            section.style.borderTop = '1px solid rgba(255,255,255,0.1)';
            section.style.paddingTop = '20px';
            section.innerHTML = `
                <div class="section-title"><i class="fas fa-gift"></i> Gestion des mariages gratuits</div>
                <div class="form-grid">
                    <div class="form-group" style="grid-column: span 2;">
                        <label><input type="checkbox" id="fm-enabled"> Activer les mariages gratuits sur les tickets des agents</label>
                    </div>
                    <div class="form-group"><label>Montant gagné par mariage gratuit (G)</label><input type="number" id="fm-win-amount" step="1" value="1000"></div>
                    <div class="form-group" style="grid-column: span 2;">
                        <label>Paliers (montant payé → nombre de mariages offerts)</label>
                        <div id="fm-tiers-container"></div>
                        <button type="button" id="fm-add-tier" class="btn-primary" style="margin-top:10px;">+ Ajouter un palier</button>
                    </div>
                    <div style="display:flex; gap:10px;"><button id="fm-save" class="btn-primary">Enregistrer</button><button id="fm-reload" class="btn-primary">Recharger</button></div>
                </div>
                <div id="fm-message" class="alert" style="display:none; margin-top:15px;"></div>
            `;
            targetTab.appendChild(section);

            let currentTiers = [];
            function renderTiers() {
                const container = document.getElementById('fm-tiers-container');
                if (!container) return;
                let html = '';
                currentTiers.forEach((tier, idx) => {
                    html += `<div class="fm-tier-row">
                        <input type="number" class="fm-tier-min" value="${tier.min}" placeholder="Min (G)" step="1" min="0">
                        <input type="number" class="fm-tier-max" value="${tier.max === null ? '' : tier.max}" placeholder="Max (G)" step="1" min="0">
                        <input type="number" class="fm-tier-count" value="${tier.count}" placeholder="Nb mariages" step="1" min="1">
                        <button class="fm-remove-tier" data-idx="${idx}">Supprimer</button>
                    </div>`;
                });
                container.innerHTML = html;
                document.querySelectorAll('.fm-remove-tier').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const idx = parseInt(btn.dataset.idx);
                        currentTiers.splice(idx, 1);
                        renderTiers();
                    });
                });
            }

            async function loadFreeMarriageSettings() {
                const token = localStorage.getItem('auth_token');
                if (!token) return;
                try {
                    const res = await fetch('/api/owner/advanced-settings', { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!res.ok) throw new Error('Erreur chargement');
                    const data = await res.json();
                    const fm = data.freeMarriage || {};
                    document.getElementById('fm-enabled').checked = fm.enabled !== false;
                    document.getElementById('fm-win-amount').value = fm.winAmount || 1000;
                    currentTiers = fm.tiers || [{ min: 0, max: 50, count: 1 }, { min: 51, max: 150, count: 2 }, { min: 151, max: null, count: 3 }];
                    renderTiers();
                    showFMMessage('Paramètres chargés', true);
                } catch (err) { showFMMessage('Erreur chargement', false); }
            }

            async function saveFreeMarriageSettings() {
                const minInputs = document.querySelectorAll('.fm-tier-min');
                const maxInputs = document.querySelectorAll('.fm-tier-max');
                const countInputs = document.querySelectorAll('.fm-tier-count');
                const newTiers = [];
                for (let i = 0; i < minInputs.length; i++) {
                    const min = parseFloat(minInputs[i].value);
                    let max = maxInputs[i].value.trim() === '' ? null : parseFloat(maxInputs[i].value);
                    const count = parseInt(countInputs[i].value);
                    if (!isNaN(min) && !isNaN(count) && count > 0) newTiers.push({ min, max, count });
                }
                const payload = { freeMarriage: { enabled: document.getElementById('fm-enabled').checked, winAmount: parseFloat(document.getElementById('fm-win-amount').value), tiers: newTiers } };
                const token = localStorage.getItem('auth_token');
                try {
                    const res = await fetch('/api/owner/advanced-settings', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    if (res.ok) showFMMessage('✅ Paramètres enregistrés', true);
                    else showFMMessage('❌ Erreur enregistrement', false);
                } catch (err) { showFMMessage('❌ Erreur réseau', false); }
            }

            function showFMMessage(msg, isSuccess) {
                const msgDiv = document.getElementById('fm-message');
                if (!msgDiv) return;
                msgDiv.style.display = 'block';
                msgDiv.className = isSuccess ? 'alert alert-success' : 'alert alert-danger';
                msgDiv.innerHTML = msg;
                setTimeout(() => msgDiv.style.display = 'none', 4000);
            }

            document.getElementById('fm-save')?.addEventListener('click', saveFreeMarriageSettings);
            document.getElementById('fm-reload')?.addEventListener('click', loadFreeMarriageSettings);
            document.getElementById('fm-add-tier')?.addEventListener('click', () => { currentTiers.push({ min: 0, max: null, count: 1 }); renderTiers(); });
            await loadFreeMarriageSettings();
        }
    });
})();
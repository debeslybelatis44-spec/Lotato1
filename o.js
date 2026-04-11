/**
 * owner-results.js
 * Ajoute un onglet "Résultats" dans l'interface propriétaire pour afficher
 * les résultats des tirages (publiés par le propriétaire ou le Super Admin).
 * À placer dans le dossier du projet et à inclure dans owner.html via :
 * <script src="owner-results.js"></script>
 */

(function() {
    // Éviter une double exécution
    if (window.ownerResultsLoaded) return;
    window.ownerResultsLoaded = true;

    // Configuration
    const API_URL = window.API_URL || ''; // Si config.js définit API_URL
    let token = localStorage.getItem('auth_token');
    let userRole = localStorage.getItem('user_role');

    // Vérifier que l'utilisateur est bien un propriétaire connecté
    if (!token || userRole !== 'owner') {
        console.warn('owner-results.js : utilisateur non authentifié ou non propriétaire');
        return;
    }

    // Attendre que le DOM soit prêt
    function init() {
        // Vérifier si l'onglet existe déjà
        if (document.getElementById('tab-results')) return;

        // 1. Ajouter l'onglet dans la barre de navigation
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) {
            console.error('owner-results.js : Élément .tabs introuvable');
            return;
        }
        const resultsTab = document.createElement('div');
        resultsTab.className = 'tab';
        resultsTab.setAttribute('data-tab', 'results');
        resultsTab.innerHTML = '📋 Résultats';
        resultsTab.onclick = () => switchToResultsTab();
        tabsContainer.appendChild(resultsTab);

        // 2. Créer le contenu de l'onglet (caché initialement)
        const mainContent = document.querySelector('.app'); // ou le conteneur principal
        if (!mainContent) return;

        const tabContent = document.createElement('div');
        tabContent.id = 'tab-results';
        tabContent.className = 'tab-content';
        tabContent.innerHTML = `
            <div class="section-title"><i class="fas fa-calendar-alt"></i> Résultats des tirages</div>
            <div class="filters" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                <button class="filter-chip active" data-filter="all">Tous</button>
                <button class="filter-chip" data-filter="today">Aujourd'hui</button>
                <button class="filter-chip" data-filter="yesterday">Hier</button>
                <button class="filter-chip" data-filter="week">7 derniers jours</button>
            </div>
            <div id="results-list-container" class="list-container">
                <p><i class="fas fa-spinner fa-pulse"></i> Chargement des résultats...</p>
            </div>
        `;
        mainContent.appendChild(tabContent);

        // 3. Ajouter les styles spécifiques (s'ils ne sont pas déjà présents)
        if (!document.getElementById('owner-results-styles')) {
            const style = document.createElement('style');
            style.id = 'owner-results-styles';
            style.textContent = `
                .filter-chip {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 30px;
                    padding: 8px 16px;
                    cursor: pointer;
                    transition: 0.2s;
                    color: white;
                }
                .filter-chip.active {
                    background: linear-gradient(135deg, #ad00f1, #00d4ff);
                    border-color: transparent;
                }
                .results-day-group {
                    margin-bottom: 20px;
                    background: rgba(255,255,255,0.02);
                    border-radius: 16px;
                    padding: 15px;
                }
                .results-day-group h4 {
                    margin-bottom: 12px;
                    color: #00d4ff;
                }
                .result-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .result-item:last-child {
                    border-bottom: none;
                }
                .result-draw-name {
                    font-weight: 500;
                }
                .result-numbers {
                    font-family: monospace;
                    font-size: 1.1rem;
                    background: rgba(0,212,255,0.1);
                    padding: 4px 12px;
                    border-radius: 20px;
                }
                @media (max-width: 600px) {
                    .result-item {
                        flex-direction: column;
                        align-items: flex-start;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // 4. Fonctions de gestion
        let currentFilter = 'all';
        let allResults = [];

        async function loadResults() {
            const container = document.getElementById('results-list-container');
            if (!container) return;
            container.innerHTML = '<p><i class="fas fa-spinner fa-pulse"></i> Chargement des résultats...</p>';
            try {
                const response = await fetch(`${API_URL}/api/winners/results`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    if (response.status === 401) throw new Error('Session expirée');
                    throw new Error(`Erreur ${response.status}`);
                }
                const data = await response.json();
                allResults = data.results || [];
                renderResults();
            } catch (error) {
                console.error('Erreur chargement résultats:', error);
                container.innerHTML = '<p class="loss">❌ Impossible de charger les résultats.</p>';
            }
        }

        function renderResults() {
            const container = document.getElementById('results-list-container');
            if (!container) return;
            if (allResults.length === 0) {
                container.innerHTML = '<p>Aucun résultat publié pour le moment.</p>';
                return;
            }

            let filtered = [...allResults];
            const now = new Date();
            const todayStr = now.toDateString();
            const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = yesterday.toDateString();
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);

            if (currentFilter === 'today') {
                filtered = filtered.filter(r => new Date(r.published_at).toDateString() === todayStr);
            } else if (currentFilter === 'yesterday') {
                filtered = filtered.filter(r => new Date(r.published_at).toDateString() === yesterdayStr);
            } else if (currentFilter === 'week') {
                filtered = filtered.filter(r => new Date(r.published_at) >= weekAgo);
            }

            if (filtered.length === 0) {
                container.innerHTML = '<p>Aucun résultat pour cette période.</p>';
                return;
            }

            // Grouper par jour
            const grouped = {};
            filtered.forEach(r => {
                const date = new Date(r.published_at);
                const dayKey = date.toLocaleDateString('fr-FR', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
                if (!grouped[dayKey]) grouped[dayKey] = [];
                grouped[dayKey].push(r);
            });

            let html = '';
            for (const [day, results] of Object.entries(grouped)) {
                html += `<div class="results-day-group"><h4><i class="fas fa-calendar-day"></i> ${day}</h4>`;
                results.forEach(r => {
                    const time = new Date(r.published_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    let numbersDisplay = '—';
                    if (r.lotto3) {
                        numbersDisplay = `${r.lotto3}  |  ${r.numbers[1]}  |  ${r.numbers[2]}`;
                    } else if (r.numbers) {
                        numbersDisplay = Array.isArray(r.numbers) ? r.numbers.join(' - ') : r.numbers;
                    }
                    html += `
                        <div class="result-item">
                            <div>
                                <div class="result-draw-name">${escapeHtml(r.name || 'Tirage')}</div>
                                <div style="font-size:0.8rem; color:#a0a0b8;">${time}</div>
                            </div>
                            <div class="result-numbers">${numbersDisplay}</div>
                        </div>
                    `;
                });
                html += `</div>`;
            }
            container.innerHTML = html;
        }

        function escapeHtml(text) {
            if (!text) return '';
            return text.replace(/[&<>]/g, function(m) {
                if (m === '&') return '&amp;';
                if (m === '<') return '&lt;';
                if (m === '>') return '&gt;';
                return m;
            });
        }

        function initFilters() {
            const chips = document.querySelectorAll('#tab-results .filter-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', function() {
                    chips.forEach(c => c.classList.remove('active'));
                    this.classList.add('active');
                    currentFilter = this.dataset.filter;
                    renderResults();
                });
            });
        }

        // Fonction pour basculer vers l'onglet Résultats
        function switchToResultsTab() {
            // Désactiver tous les onglets et contenus
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            resultsTab.classList.add('active');
            tabContent.classList.add('active');
            // Charger les données si nécessaire
            if (allResults.length === 0) {
                loadResults();
            } else {
                renderResults();
            }
            initFilters();
        }

        // Intégration avec le système d'onglets existant
        // On remplace la fonction switchTab originale pour qu'elle gère aussi notre onglet
        // Mais attention à ne pas écraser si elle existe déjà. On va plutôt patcher.
        const originalSwitchTab = window.switchTab;
        if (typeof originalSwitchTab === 'function') {
            window.switchTab = function(tabId) {
                if (tabId === 'results') {
                    switchToResultsTab();
                } else {
                    originalSwitchTab(tabId);
                }
            };
        } else {
            // Si pas de switchTab globale, on ajoute la nôtre
            window.switchTab = function(tabId) {
                if (tabId === 'results') {
                    switchToResultsTab();
                } else {
                    // Fallback : essayer de sélectionner l'onglet par son onclick
                    const tab = document.querySelector(`.tab[onclick*="${tabId}"]`);
                    if (tab && tab.onclick) tab.onclick();
                }
            };
        }

        // Si l'onglet actif après chargement est "results" (cas d'un lien direct), on l'active
        if (window.location.hash === '#results') {
            switchToResultsTab();
        }
    }

    // Démarrer lorsque le DOM est prêt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
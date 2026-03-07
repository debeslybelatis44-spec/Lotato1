// resultsManager.js - Version corrigée avec appel API autonome et affichage du Lotto 3 complet
(function() {
    if (window.resultsManagerReady) return;
    window.resultsManagerReady = true;

    let currentFilter = 'all';

    // ==================== Création de l'UI si absente ====================
    function createResultsUI() {
        if (!document.getElementById('results-screen')) {
            const main = document.querySelector('.content-area');
            if (!main) {
                console.error('Élément .content-area introuvable');
                return;
            }
            const screen = document.createElement('section');
            screen.id = 'results-screen';
            screen.className = 'screen';
            screen.innerHTML = `
                <div style="padding: 20px;">
                    <h2 class="section-title">Résultats des tirages</h2>
                    <div class="results-filter">
                        <button class="chip active" data-filter="all">Tous</button>
                        <button class="chip" data-filter="today">Aujourd'hui</button>
                        <button class="chip" data-filter="yesterday">Hier</button>
                        <button class="chip" data-filter="week">7 derniers jours</button>
                    </div>
                    <div id="results-container" class="results-list">Chargement...</div>
                </div>
            `;
            main.appendChild(screen);
        }

        const nav = document.querySelector('.nav-bar');
        if (nav && !document.querySelector('.nav-item[data-tab="results"]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item';
            tab.setAttribute('data-tab', 'results');
            tab.innerHTML = '<i class="fas fa-calendar-alt"></i><span>Résultats</span>';
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                document.getElementById('results-screen').classList.add('active');
                this.classList.add('active');
                fetchResults(currentFilter);
            });
            nav.appendChild(tab);
        }

        if (!document.getElementById('results-styles')) {
            const style = document.createElement('style');
            style.id = 'results-styles';
            style.textContent = `
                .results-filter { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                .results-list { display: flex; flex-direction: column; gap: 20px; padding-bottom: 80px; }
                .result-day-group { background: var(--surface); border-radius: 20px; padding: 15px; border: 1px solid var(--glass-border); }
                .result-day-group h3 { margin-bottom: 15px; color: var(--secondary); font-size: 1.2rem; }
                .result-draw-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.1); }
                .result-draw-row:last-child { border-bottom: none; }
                .draw-info { display: flex; flex-direction: column; }
                .draw-name { font-weight: 600; font-size: 1rem; }
                .draw-time { font-size: 0.8rem; color: var(--text-dim); }
                .result-numbers { font-family: 'Courier New', monospace; font-weight: bold; font-size: 1.2rem; background: rgba(0,212,255,0.1); padding: 6px 12px; border-radius: 20px; color: var(--secondary); }
                .no-result { color: var(--text-dim); font-style: italic; text-align: center; padding: 20px; }
            `;
            document.head.appendChild(style);
        }
    }

    // ==================== Appel API ====================
    async function fetchResults(filter = 'all') {
        const container = document.getElementById('results-container');
        if (!container) return;
        container.innerHTML = '<div class="no-result">Chargement...</div>';

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                container.innerHTML = '<div class="no-result">Vous devez être connecté.</div>';
                return;
            }

            const res = await fetch('/api/winners/results', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                if (res.status === 401) {
                    container.innerHTML = '<div class="no-result">Session expirée, veuillez vous reconnecter.</div>';
                } else {
                    throw new Error(`Erreur HTTP ${res.status}`);
                }
                return;
            }

            const data = await res.json();
            window.APP_STATE = window.APP_STATE || {};
            window.APP_STATE.winningResults = data.results || [];

            currentFilter = filter;
            renderResults(filter);
        } catch (error) {
            console.error('Erreur lors du chargement des résultats:', error);
            container.innerHTML = '<div class="no-result">Impossible de charger les résultats.</div>';
        }
    }

    // ==================== Affichage ====================
    function renderResults(filter) {
        const container = document.getElementById('results-container');
        if (!container) return;

        const results = window.APP_STATE?.winningResults || [];
        if (results.length === 0) {
            container.innerHTML = '<div class="no-result">Aucun résultat publié pour le moment.</div>';
            return;
        }

        // Filtrer selon la période
        const now = new Date();
        const todayStr = now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);

        let filtered = results;
        if (filter === 'today') {
            filtered = results.filter(r => new Date(r.published_at).toDateString() === todayStr);
        } else if (filter === 'yesterday') {
            filtered = results.filter(r => new Date(r.published_at).toDateString() === yesterdayStr);
        } else if (filter === 'week') {
            filtered = results.filter(r => new Date(r.published_at) >= weekAgo);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<div class="no-result">Aucun résultat pour cette période.</div>';
            return;
        }

        // Grouper par jour
        const grouped = {};
        filtered.forEach(r => {
            const day = new Date(r.published_at).toLocaleDateString('fr-FR', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(r);
        });

        const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

        let html = '';
        sortedDays.forEach(day => {
            html += `<div class="result-day-group"><h3>${day}</h3>`;
            grouped[day].forEach(r => {
                const time = new Date(r.published_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit', minute: '2-digit'
                });

                // Formatage des numéros : utilisation de lotto3 pour le premier nombre
                let numbersDisplay = '—';
                if (r.lotto3) {
                    // Nouveau format : Lotto 3 complet (3 chiffres) suivi des deux autres lots (2 chiffres)
                    numbersDisplay = `${r.lotto3}  |  ${r.numbers[1]}  |  ${r.numbers[2]}`;
                } else if (r.numbers) {
                    // Anciens résultats (sans lotto3)
                    numbersDisplay = Array.isArray(r.numbers) ? r.numbers.join(' - ') : r.numbers;
                }

                html += `
                    <div class="result-draw-row">
                        <div class="draw-info">
                            <span class="draw-name">${r.name || 'Tirage'}</span>
                            <span class="draw-time">${time}</span>
                        </div>
                        <span class="result-numbers">${numbersDisplay}</span>
                    </div>
                `;
            });
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ==================== Initialisation ====================
    function init() {
        createResultsUI();

        const filterContainer = document.querySelector('.results-filter');
        if (filterContainer) {
            filterContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.chip');
                if (!btn) return;
                const filter = btn.dataset.filter;
                if (!filter) return;

                document.querySelectorAll('.results-filter .chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                fetchResults(filter);
            });
        }

        fetchResults('all');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
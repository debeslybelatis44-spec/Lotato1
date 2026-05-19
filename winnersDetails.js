// winnersDetails.js - Ajoute le bouton "Detay" pour voir les détails des gains
(function() {
    if (window.winnersDetailsReady) return;
    window.winnersDetailsReady = true;

    let initialized = false;

    // Ajoute les boutons "Detay" aux tickets gagnants existants
    function addDetailsButtons() {
        const container = document.getElementById('winners-container');
        if (!container) return;

        const winnerTickets = container.querySelectorAll('.winner-ticket');
        if (winnerTickets.length === 0) return;

        winnerTickets.forEach(ticket => {
            if (ticket.querySelector('.btn-details')) return; // déjà ajouté

            const actionsDiv = ticket.querySelector('.winner-actions');
            if (!actionsDiv) return;

            // Récupérer les détails de gain depuis APP_STATE (si disponibles)
            let winDetails = null;
            const ticketId = ticket.querySelector('strong')?.innerText?.match(/#(\S+)/)?.[1];
            if (ticketId && window.APP_STATE && window.APP_STATE.winningTickets) {
                const found = window.APP_STATE.winningTickets.find(t => (t.ticket_id || t.id) == ticketId);
                if (found && found.win_details) {
                    winDetails = found.win_details;
                    if (typeof winDetails === 'string') {
                        try { winDetails = JSON.parse(winDetails); } catch(e) { winDetails = null; }
                    }
                }
            }

            const btn = document.createElement('button');
            btn.className = 'btn-details';
            btn.innerHTML = '<i class="fas fa-info-circle"></i> Detay';
            btn.onclick = function() {
                if (!winDetails || winDetails.length === 0) {
                    alert("Pa gen detay pou tikè sa a.");
                    return;
                }
                showWinnerDetailsModal(winDetails, ticketId);
            };
            actionsDiv.insertBefore(btn, actionsDiv.firstChild);
        });
    }

    // Affiche les détails dans la modale existante
    function showWinnerDetailsModal(winDetails, ticketId) {
        const modal = document.getElementById('winner-overlay');
        const detailsDiv = document.getElementById('winner-details');
        if (!modal || !detailsDiv) return;
        const title = modal.querySelector('h2');
        if (title) title.innerText = `Detay Tikè #${ticketId}`;
        let html = '<ul style="list-style: none; padding: 0; text-align: left;">';
        winDetails.forEach(d => {
            let gameAbbr = d.gameAbbr || d.game;
            if (typeof getGameAbbreviation === 'function') {
                gameAbbr = getGameAbbreviation(d.game, d);
            }
            html += `<li style="margin-bottom: 8px;">${gameAbbr} ${d.number} : +${d.gain} G (${d.reason})</li>`;
        });
        html += '</ul>';
        detailsDiv.innerHTML = html;
        modal.style.display = 'flex';
    }

    // Surveille les changements dans le conteneur des gagnants
    function observeWinnersContainer() {
        const container = document.getElementById('winners-container');
        if (!container) return;

        const observer = new MutationObserver(function(mutations) {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
                if (mutation.type === 'attributes' && mutation.attributeName === 'innerHTML') {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) {
                setTimeout(addDetailsButtons, 50);
            }
        });
        observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['innerHTML'] });
        addDetailsButtons(); // premier passage
    }

    // Initialisation
    function init() {
        if (initialized) return;
        initialized = true;
        const checkInterval = setInterval(() => {
            if (document.getElementById('winners-container')) {
                clearInterval(checkInterval);
                observeWinnersContainer();
            }
        }, 200);
        setTimeout(() => clearInterval(checkInterval), 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
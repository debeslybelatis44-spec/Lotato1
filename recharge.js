// recharge.js - Gestion des recharges et retraits avec messages visibles
(function() {
    if (window.rechargeManagerReady) return;
    window.rechargeManagerReady = true;

    const API_URL = window.API_URL || 'https://lotato1.onrender.com/api';

    // Injecte le style des toasts directement dans la page
    function injectToastStyle() {
        if (document.getElementById('recharge-toast-style')) return;
        const style = document.createElement('style');
        style.id = 'recharge-toast-style';
        style.textContent = `
            .toast-notification {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 12px 24px;
                border-radius: 30px;
                font-weight: bold;
                z-index: 2000;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                font-size: 14px;
                text-align: center;
                white-space: normal;
                max-width: 90%;
                transition: opacity 0.3s;
            }
            .toast-notification.success {
                background: #00f190;
                color: #000;
            }
            .toast-notification.error {
                background: #ff4d4d;
                color: #fff;
            }
            .recharge-result {
                margin-top: 15px;
                padding: 10px;
                border-radius: 8px;
                text-align: center;
            }
            .recharge-result.success {
                background: rgba(0,241,144,0.2);
                border: 1px solid #00f190;
                color: #00f190;
            }
            .recharge-result.error {
                background: rgba(255,77,77,0.2);
                border: 1px solid #ff4d4d;
                color: #ff4d4d;
            }
        `;
        document.head.appendChild(style);
    }

    function showToast(message, type = 'success') {
        const existingToast = document.querySelector('.toast-notification');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    function createRechargeUI() {
        if (document.getElementById('recharge-screen')) return;

        const main = document.querySelector('.content-area');
        if (!main) {
            console.error('Élément .content-area introuvable');
            return;
        }

        const screen = document.createElement('section');
        screen.id = 'recharge-screen';
        screen.className = 'screen';
        screen.innerHTML = `
            <div style="padding: 20px;">
                <h2 class="section-title">Gestion des joueurs</h2>
                <div class="recharge-tabs">
                    <button class="recharge-tab active" data-tab="recharge">Recharger</button>
                    <button class="recharge-tab" data-tab="withdraw">Retirer</button>
                    <button class="recharge-tab" data-tab="balance">Consulter solde</button>
                    <button class="recharge-tab" data-tab="history">Historique</button>
                </div>

                <div id="recharge-tab-content" class="recharge-tab-content active">
                    <div class="recharge-form">
                        <div class="form-group"><label>Téléphone du joueur</label><input type="tel" id="player-phone-recharge" placeholder="Ex: 50912345678"></div>
                        <div class="form-group"><label>Montant (Gdes)</label><input type="number" id="recharge-amount" placeholder="Montant"></div>
                        <div class="form-group"><label>Méthode de paiement</label><select id="recharge-method"><option value="cash">Espèces</option><option value="moncash">MonCash</option><option value="ourcash">OurCash</option></select></div>
                        <button id="btn-recharge" class="btn-primary">Recharger</button>
                        <div id="recharge-result" class="recharge-result"></div>
                    </div>
                </div>

                <div id="withdraw-tab-content" class="recharge-tab-content">
                    <div class="recharge-form">
                        <div class="form-group"><label>Téléphone du joueur</label><input type="tel" id="player-phone-withdraw" placeholder="Ex: 50912345678"></div>
                        <div class="form-group"><label>Montant à retirer (Gdes)</label><input type="number" id="withdraw-amount" placeholder="Montant"></div>
                        <div class="form-group"><label>Méthode de retrait</label><select id="withdraw-method"><option value="cash">Espèces</option><option value="moncash">MonCash</option><option value="ourcash">OurCash</option></select></div>
                        <button id="btn-withdraw" class="btn-danger">Retirer</button>
                        <div id="withdraw-result" class="recharge-result"></div>
                    </div>
                </div>

                <div id="balance-tab-content" class="recharge-tab-content">
                    <div class="recharge-form">
                        <div class="form-group"><label>Téléphone du joueur</label><input type="tel" id="player-phone-balance" placeholder="Ex: 50912345678"></div>
                        <button id="btn-check-balance" class="btn-primary">Voir solde</button>
                        <div id="balance-result" class="recharge-result"></div>
                    </div>
                </div>

                <div id="history-tab-content" class="recharge-tab-content">
                    <div class="recharge-form"><h3>Dernières transactions (dépôts/retraits)</h3><div id="transactions-history" style="max-height: 400px; overflow-y: auto;"><p>Chargement...</p></div></div>
                </div>
            </div>
        `;
        main.appendChild(screen);

        // Styles existants (complémentaires)
        if (!document.getElementById('recharge-styles')) {
            const style = document.createElement('style');
            style.id = 'recharge-styles';
            style.textContent = `
                .recharge-tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; flex-wrap: wrap; }
                .recharge-tab { background: none; border: none; color: #aaa; padding: 10px 20px; cursor: pointer; font-weight: 600; transition: 0.2s; }
                .recharge-tab.active { color: #00d4ff; border-bottom: 2px solid #00d4ff; }
                .recharge-tab-content { display: none; }
                .recharge-tab-content.active { display: block; }
                .recharge-form { max-width: 500px; margin: 0 auto; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; margin-bottom: 5px; color: #aaa; }
                .form-group input, .form-group select { width: 100%; padding: 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: white; font-size: 1rem; }
                .btn-primary, .btn-danger { width: 100%; padding: 12px; border: none; border-radius: 30px; font-weight: bold; cursor: pointer; margin-top: 10px; }
                .btn-primary { background: linear-gradient(135deg, #ad00f1, #00d4ff); color: white; }
                .btn-danger { background: rgba(255,77,77,0.8); color: white; }
                .transaction-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-wrap: wrap; }
                .transaction-amount.positive { color: #00f190; font-weight: bold; }
                .transaction-amount.negative { color: #ff4d4d; font-weight: bold; }
            `;
            document.head.appendChild(style);
        }

        const nav = document.querySelector('.nav-bar');
        if (nav && !document.querySelector('.nav-item[data-tab="recharge"]')) {
            const tab = document.createElement('a');
            tab.href = '#';
            tab.className = 'nav-item';
            tab.setAttribute('data-tab', 'recharge');
            tab.innerHTML = '<i class="fas fa-wallet"></i><span>Recharger</span>';
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById('recharge-screen').classList.add('active');
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                loadTransactionsHistory();
            });
            nav.appendChild(tab);
        }

        const tabs = document.querySelectorAll('.recharge-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                document.querySelectorAll('.recharge-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.recharge-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tabId}-tab-content`).classList.add('active');
                if (tabId === 'history') loadTransactionsHistory();
            });
        });

        document.getElementById('btn-recharge')?.addEventListener('click', rechargePlayer);
        document.getElementById('btn-withdraw')?.addEventListener('click', withdrawPlayer);
        document.getElementById('btn-check-balance')?.addEventListener('click', checkPlayerBalance);
    }

    async function getPlayerByPhone(phone) {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_URL}/player/by-phone?phone=${encodeURIComponent(phone)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Joueur non trouvé');
        }
        return await res.json();
    }

    async function rechargePlayer() {
    const phone = document.getElementById('player-phone-recharge').value.trim();
    const amount = parseFloat(document.getElementById('recharge-amount').value);
    const method = document.getElementById('recharge-method').value;
    const resultDiv = document.getElementById('recharge-result');

    if (!phone || isNaN(amount) || amount <= 0) {
        resultDiv.innerHTML = '<div class="recharge-result error">❌ Veuillez remplir tous les champs correctement.</div>';
        showToast('Montant invalide', 'error');
        return;
    }

    resultDiv.innerHTML = '<div class="recharge-result">⏳ Traitement en cours...</div>';

    try {
        const player = await getPlayerByPhone(phone);
        const token = localStorage.getItem('auth_token');
        
        // Récupérer l'ancien solde
        const oldBalanceRes = await fetch(`${API_URL}/player/balance-by-id?playerId=${player.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const oldBalanceData = await oldBalanceRes.json();
        const oldBalance = oldBalanceData.balance || 0;

        // Tenter le dépôt
        const res = await fetch(`${API_URL}/player/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ playerId: player.id, amount, method })
        });
        const data = await res.json();

        // Vérifier le nouveau solde
        const newBalanceRes = await fetch(`${API_URL}/player/balance-by-id?playerId=${player.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const newBalanceData = await newBalanceRes.json();
        const newBalance = newBalanceData.balance || 0;

        // Si le solde a augmenté du montant, c'est un succès
        if (newBalance === oldBalance + amount) {
            const msg = `✅ Recharge de ${amount} G effectuée pour ${player.name}. Nouveau solde : ${newBalance} G`;
            resultDiv.innerHTML = `<div class="recharge-result success">${msg}</div>`;
            showToast(`Recharge de ${amount} G réussie !`, 'success');
            document.getElementById('player-phone-recharge').value = '';
            document.getElementById('recharge-amount').value = '';
            loadTransactionsHistory();
        } else {
            const errMsg = data.error || 'Erreur inconnue';
            resultDiv.innerHTML = `<div class="recharge-result error">❌ Erreur : ${errMsg}</div>`;
            showToast(`Erreur : ${errMsg}`, 'error');
        }
    } catch (err) {
        resultDiv.innerHTML = `<div class="recharge-result error">❌ ${err.message}</div>`;
        showToast(`Erreur : ${err.message}`, 'error');
    }
}

    async function withdrawPlayer() {
        const phone = document.getElementById('player-phone-withdraw').value.trim();
        const amount = parseFloat(document.getElementById('withdraw-amount').value);
        const method = document.getElementById('withdraw-method').value;
        const resultDiv = document.getElementById('withdraw-result');

        if (!phone || isNaN(amount) || amount <= 0) {
            resultDiv.innerHTML = '<div class="recharge-result error">❌ Veuillez remplir tous les champs correctement.</div>';
            showToast('Montant invalide', 'error');
            return;
        }

        resultDiv.innerHTML = '<div class="recharge-result">⏳ Traitement en cours...</div>';

        try {
            const player = await getPlayerByPhone(phone);
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_URL}/player/withdraw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ playerId: player.id, amount, method })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const msg = `✅ Retrait de ${amount} G effectué pour ${player.name}. Nouveau solde : ${data.balance} G`;
                resultDiv.innerHTML = `<div class="recharge-result success">${msg}</div>`;
                showToast(`Retrait de ${amount} G effectué !`, 'success');
                document.getElementById('player-phone-withdraw').value = '';
                document.getElementById('withdraw-amount').value = '';
                loadTransactionsHistory();
            } else {
                const errMsg = data.error || 'Erreur inconnue';
                resultDiv.innerHTML = `<div class="recharge-result error">❌ Erreur : ${errMsg}</div>`;
                showToast(`Erreur : ${errMsg}`, 'error');
            }
        } catch (err) {
            resultDiv.innerHTML = `<div class="recharge-result error">❌ ${err.message}</div>`;
            showToast(`Erreur : ${err.message}`, 'error');
        }
    }

    async function withdrawPlayer() {
    const phone = document.getElementById('player-phone-withdraw').value.trim();
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    const method = document.getElementById('withdraw-method').value;
    const resultDiv = document.getElementById('withdraw-result');

    if (!phone || isNaN(amount) || amount <= 0) {
        resultDiv.innerHTML = '<div class="recharge-result error">❌ Veuillez remplir tous les champs correctement.</div>';
        showToast('Montant invalide', 'error');
        return;
    }

    resultDiv.innerHTML = '<div class="recharge-result">⏳ Traitement en cours...</div>';

    try {
        const player = await getPlayerByPhone(phone);
        const token = localStorage.getItem('auth_token');

        // Récupérer l'ancien solde
        const oldBalanceRes = await fetch(`${API_URL}/player/balance-by-id?playerId=${player.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const oldBalanceData = await oldBalanceRes.json();
        const oldBalance = oldBalanceData.balance || 0;

        // Tenter le retrait
        const res = await fetch(`${API_URL}/player/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ playerId: player.id, amount, method })
        });
        const data = await res.json();

        // Vérifier le nouveau solde
        const newBalanceRes = await fetch(`${API_URL}/player/balance-by-id?playerId=${player.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const newBalanceData = await newBalanceRes.json();
        const newBalance = newBalanceData.balance || 0;

        // Si le solde a diminué du montant, c'est un succès
        if (newBalance === oldBalance - amount) {
            const msg = `✅ Retrait de ${amount} G effectué pour ${player.name}. Nouveau solde : ${newBalance} G`;
            resultDiv.innerHTML = `<div class="recharge-result success">${msg}</div>`;
            showToast(`Retrait de ${amount} G effectué !`, 'success');
            document.getElementById('player-phone-withdraw').value = '';
            document.getElementById('withdraw-amount').value = '';
            loadTransactionsHistory();
        } else {
            const errMsg = data.error || 'Erreur inconnue';
            resultDiv.innerHTML = `<div class="recharge-result error">❌ Erreur : ${errMsg}</div>`;
            showToast(`Erreur : ${errMsg}`, 'error');
        }
    } catch (err) {
        resultDiv.innerHTML = `<div class="recharge-result error">❌ ${err.message}</div>`;
        showToast(`Erreur : ${err.message}`, 'error');
    }
}
    async function loadTransactionsHistory() {
        const container = document.getElementById('transactions-history');
        if (!container) return;
        container.innerHTML = '<p>Chargement...</p>';
        try {
            const token = localStorage.getItem('auth_token');
            const res = await fetch(`${API_URL}/agent/transactions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                container.innerHTML = '<p>⚠️ Impossible de charger l\'historique.</p>';
                return;
            }
            const data = await res.json();
            const transactions = data.transactions || [];
            if (transactions.length === 0) {
                container.innerHTML = '<p>Aucune transaction récente.</p>';
                return;
            }
            container.innerHTML = transactions.map(t => `
                <div class="transaction-item">
                    <div><strong>${t.player_name}</strong><br><small>${new Date(t.created_at).toLocaleString()}</small></div>
                    <div class="transaction-amount ${t.type === 'deposit' ? 'positive' : 'negative'}">
                        ${t.type === 'deposit' ? '+' : '-'} ${t.amount} G
                    </div>
                    <div>${t.method || 'cash'}</div>
                </div>
            `).join('');
        } catch (err) {
            console.error(err);
            container.innerHTML = '<p>Erreur chargement historique.</p>';
        }
    }

    function init() {
        injectToastStyle();
        createRechargeUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
// lotato.js – Version sans données simulées (uniquement API réelle)

// ==========================================
// Configuration de base
// ==========================================
const API_BASE_URL = 'https://lotato1.onrender.com';

const APP_CONFIG = {
    health: `${API_BASE_URL}/api/health`,
    login: `${API_BASE_URL}/api/auth/login`,
    results: `${API_BASE_URL}/api/results`,
    checkWinners: `${API_BASE_URL}/api/check-winners`,
    tickets: `${API_BASE_URL}/api/tickets`,
    ticketsPending: `${API_BASE_URL}/api/tickets/pending`,
    winningTickets: `${API_BASE_URL}/api/tickets/winning`,
    history: `${API_BASE_URL}/api/history`,
    multiDrawTickets: `${API_BASE_URL}/api/tickets/multi-draw`,
    companyInfo: `${API_BASE_URL}/api/company-info`,
    logo: `${API_BASE_URL}/api/logo`,
    authCheck: `${API_BASE_URL}/api/auth/check`,
    draws: `${API_BASE_URL}/api/draws`          // Nouvel endpoint pour les tirages
};

const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes en millisecondes

// ==========================================
// Variables globales (initialement vides)
// ==========================================
let drawsData = {};                // Données des tirages (chargées depuis l'API)
let resultsData = {};              // Résultats des tirages (chargés depuis l'API)
let activeBets = [];
let ticketNumber = 100001;
let savedTickets = [];
let currentAdmin = null;
let pendingSyncTickets = [];
let isOnline = navigator.onLine;
let companyLogo = '';
let currentBetCategory = null;
let restrictedBalls = [];
let gameRestrictions = {};
let selectedMultiDraws = new Set();
let selectedMultiGame = 'borlette';
let selectedBalls = [];

// Variables pour les fiches multi-tirages
let currentMultiDrawTicket = {
    id: Date.now().toString(),
    bets: [],
    totalAmount: 0,
    draws: new Set(),
    createdAt: new Date().toISOString()
};
let multiDrawTickets = [];

// Informations de l'entreprise
let companyInfo = {
    name: "Nova Lotto",
    phone: "+509 32 53 49 58",
    address: "Cap Haïtien",
    reportTitle: "Nova Lotto",
    reportPhone: "40104585"
};

// Tickets gagnants
let winningTickets = [];

// Gestion du token
let authToken = null;
let currentUser = null;

// Types de paris (configuration statique – peut aussi être chargée depuis l'API si besoin)
const betTypes = {
    lotto3: {
        name: "LOTO 3",
        multiplier: 500,
        icon: "fas fa-list-ol",
        description: "3 chif (lot 1 + 1 chif devan)",
        category: "lotto"
    },
    grap: {
        name: "GRAP",
        multiplier: 500,
        icon: "fas fa-chart-line",
        description: "Grap boule paire (111, 222, ..., 000)",
        category: "special"
    },
    marriage: {
        name: "MARYAJ",
        multiplier: 1000,
        icon: "fas fa-link",
        description: "Maryaj 2 chif (ex: 12*34)",
        category: "special"
    },
    borlette: {
        name: "BORLETTE",
        multiplier: 60,
        multiplier2: 20,
        multiplier3: 10,
        icon: "fas fa-dice",
        description: "2 chif (1er lot ×60, 2e ×20, 3e ×10)",
        category: "borlette"
    },
    boulpe: {
        name: "BOUL PE",
        multiplier: 60,
        multiplier2: 20,
        multiplier3: 10,
        icon: "fas fa-circle",
        description: "Boul pe (00-99)",
        category: "borlette"
    },
    lotto4: {
        name: "LOTO 4",
        multiplier: 5000,
        icon: "fas fa-list-ol",
        description: "4 chif (lot 1+2 accumulate) - 3 opsyon",
        category: "lotto"
    },
    lotto5: {
        name: "LOTO 5",
        multiplier: 25000,
        icon: "fas fa-list-ol",
        description: "5 chif (lot 1+2+3 accumulate) - 3 opsyon",
        category: "lotto"
    },
    'auto-marriage': {
        name: "MARYAJ OTOMATIK",
        multiplier: 1000,
        icon: "fas fa-robot",
        description: "Marie boules otomatik",
        category: "special"
    },
    'auto-lotto4': {
        name: "LOTO 4 OTOMATIK",
        multiplier: 5000,
        icon: "fas fa-robot",
        description: "Lotto 4 otomatik",
        category: "special"
    }
};

// ==========================================
// Fonctions API
// ==========================================
async function apiCall(url, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['x-auth-token'] = authToken;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        if (response.status === 401) {
            handleLogout();
            return null;
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return { success: response.ok };
        }
    } catch (error) {
        console.error('Erreur API:', error);
        return null;
    }
}

// ==========================================
// Vérification d'authentification
// ==========================================
async function checkAuth() {
    console.log("Vérification authentification...");
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const tokenFromStorage = localStorage.getItem('nova_token');
    const token = tokenFromUrl || tokenFromStorage;

    if (!token) {
        window.location.href = '/index.html';
        return false;
    }

    authToken = token;
    if (tokenFromUrl && !tokenFromStorage) {
        localStorage.setItem('nova_token', tokenFromUrl);
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    try {
        const response = await apiCall(APP_CONFIG.authCheck);
        if (response && response.success && response.admin) {
            currentUser = response.admin;
            document.getElementById('login-screen').style.display = 'none';
            showMainApp();
            updateUserDisplay();
            return true;
        } else {
            handleLogout();
            return false;
        }
    } catch (error) {
        console.error('Erreur vérification authentification:', error);
        handleLogout();
        return false;
    }
}

function updateUserDisplay() {
    if (currentUser) {
        document.querySelectorAll('.user-name-display').forEach(el => {
            el.textContent = currentUser.name || currentUser.username;
        });
    }
}

function handleLogout() {
    localStorage.removeItem('nova_token');
    authToken = null;
    currentUser = null;
    window.location.href = '/index.html';
}

// ==========================================
// Chargement des données depuis l'API
// ==========================================
async function loadDrawsFromAPI() {
    try {
        const response = await apiCall(APP_CONFIG.draws);
        if (response && response.success) {
            drawsData = response.draws;
            console.log('✅ Tirages chargés:', drawsData);
        } else {
            console.error('❌ Impossible de charger les tirages');
        }
    } catch (error) {
        console.error('Erreur chargement tirages:', error);
    }
}

async function loadResultsFromAPI() {
    try {
        const response = await apiCall(APP_CONFIG.results);
        if (response && response.success) {
            resultsData = response.results;
            console.log('✅ Résultats chargés:', resultsData);
            updateResultsDisplay();
        } else {
            console.error('❌ Impossible de charger les résultats');
        }
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
    }
}

async function loadDataFromAPI() {
    try {
        if (!currentUser && !await checkAuth()) return;

        // Charger les tirages d'abord (nécessaires pour beaucoup de fonctions)
        await loadDrawsFromAPI();

        // Charger les tickets
        const ticketsData = await apiCall(APP_CONFIG.tickets);
        if (ticketsData && ticketsData.success) {
            savedTickets = ticketsData.tickets || [];
            ticketNumber = ticketsData.nextTicketNumber || ticketNumber;
        }

        // Charger les tickets gagnants
        const winningData = await apiCall(APP_CONFIG.winningTickets);
        if (winningData && winningData.success) {
            winningTickets = winningData.tickets || [];
        }

        // Charger les fiches multi-tirages
        const multiDrawData = await apiCall(APP_CONFIG.multiDrawTickets);
        if (multiDrawData && multiDrawData.success) {
            multiDrawTickets = multiDrawData.tickets || [];
        }

        // Charger les infos entreprise
        const companyData = await apiCall(APP_CONFIG.companyInfo);
        if (companyData && companyData.success) {
            companyInfo = companyData;
        }

        // Charger le logo
        const logoData = await apiCall(APP_CONFIG.logo);
        if (logoData && logoData.success && logoData.logoUrl) {
            companyLogo = logoData.logoUrl;
            updateLogoDisplay();
        }

        // Charger les résultats
        await loadResultsFromAPI();

        console.log('✅ Données chargées depuis l\'API');
    } catch (error) {
        console.error('❌ Erreur chargement données:', error);
        showNotification("Erreur de chargement des données", "error");
    }
}

// ==========================================
// Blocage des tirages (basé sur drawsData)
// ==========================================
function isDrawBlocked(drawId, drawTime) {
    const draw = drawsData[drawId];
    if (!draw || !draw.times || !draw.times[drawTime]) {
        return true; // Sécurité : bloquer si données manquantes
    }

    const now = new Date();
    const drawTimeInfo = draw.times[drawTime];
    const drawDate = new Date(now);
    drawDate.setHours(drawTimeInfo.hour, drawTimeInfo.minute, 0, 0);
    const blockTime = new Date(drawDate.getTime() - FIVE_MINUTES);

    return now >= blockTime;
}

function checkDrawBeforeOpening(drawId, time) {
    if (isDrawBlocked(drawId, time)) {
        const drawTime = drawsData[drawId].times[time].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab fè parye 5 minit avan.`, "error");
        return false;
    }
    return true;
}

// ==========================================
// Sauvegarde des tickets
// ==========================================
async function saveTicketAPI(ticketData) {
    try {
        const requestData = {
            number: ticketData.number,
            draw: ticketData.draw,
            draw_time: ticketData.drawTime,
            bets: ticketData.bets,
            total: ticketData.total,
            agent_id: ticketData.agent_id,
            agent_name: ticketData.agent_name,
            subsystem_id: ticketData.subsystem_id,
            date: ticketData.date
        };
        return await apiCall(APP_CONFIG.tickets, 'POST', requestData);
    } catch (error) {
        console.error('❌ Erreur sauvegarde ticket:', error);
        throw error;
    }
}

async function saveTicket() {
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou sove nan fiche a", "warning");
        return;
    }

    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = drawsData[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab sove fiche 5 minit avan.`, "error");
        return;
    }

    if (!currentUser) {
        showNotification("Ou pa konekte. Tanpri rekonekte.", "error");
        handleLogout();
        return;
    }

    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    const ticket = {
        number: ticketNumber,
        draw: currentDraw,
        drawTime: currentDrawTime,
        bets: activeBets,
        total: total,
        agent_id: currentUser.id,
        agent_name: currentUser.name,
        subsystem_id: currentUser.subsystem_id,
        date: new Date().toISOString()
    };

    try {
        const response = await saveTicketAPI(ticket);
        if (response && response.success) {
            const savedTicket = { ...response.ticket, id: response.ticket.id || Date.now().toString() };
            savedTickets.push(savedTicket);
            ticketNumber = response.ticket.number + 1;
            showNotification("Fiche sove avèk siksè!", "success");
            activeBets = [];
            updateBetsList();
            return savedTicket;
        } else {
            showNotification(`Erreur: ${response?.error || "inconnue"}`, "error");
            return null;
        }
    } catch (error) {
        showNotification("Erreur lors de la sauvegarde", "error");
        throw error;
    }
}

// ==========================================
// Sauvegarder et imprimer la fiche
// ==========================================
async function saveAndPrintTicket() {
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou sove nan fiche a", "warning");
        return;
    }

    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = drawsData[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab sove oswa enprime fiche 5 minit avan.`, "error");
        return;
    }

    const savedTicket = await saveTicket();
    if (savedTicket) {
        setTimeout(() => printTicket(savedTicket), 100);
    }
}

// ==========================================
// Imprimer la fiche
// ==========================================
function printTicket(ticketToPrint = null) {
    let ticket = ticketToPrint;
    if (!ticket) {
        if (savedTickets.length === 0) {
            showNotification("Pa gen fiche ki sove pou enprime.", "warning");
            return;
        }
        ticket = savedTickets[savedTickets.length - 1];
    }

    const printContent = document.createElement('div');
    printContent.className = 'print-ticket';

    const groupedBets = groupBetsByType(ticket.bets);
    let betsHTML = '';
    let total = 0;

    for (const [type, bets] of Object.entries(groupedBets)) {
        betsHTML += `<div style="margin-bottom: 15px;"><div style="font-weight: bold; margin-bottom: 5px;">${type}</div><div style="display: flex; flex-wrap: wrap; gap: 5px;">`;
        bets.forEach(bet => {
            let betInfo = bet.number;
            if (bet.isLotto4 || bet.isLotto5) {
                const options = [];
                if (bet.options?.option1) options.push('O1');
                if (bet.options?.option2) options.push('O2');
                if (bet.options?.option3) options.push('O3');
                if (options.length > 0) betInfo += ` (${options.join(',')})`;
            }
            betsHTML += `<div style="background: #f0f0f0; padding: 5px 10px; border-radius: 4px; font-size: 0.9rem;">${betInfo}<br><strong>${bet.amount} G</strong></div>`;
            total += bet.amount;
        });
        betsHTML += `</div></div>`;
    }

    printContent.innerHTML = `
        <div style="text-align: center; padding: 20px; border: 2px solid #000; font-family: Arial, sans-serif;">
            <div style="margin-bottom: 15px;"><img src="${companyLogo}" alt="Logo Nova Lotto" class="ticket-logo" style="max-width: 80px; height: auto;"></div>
            <h2>${companyInfo.name}</h2>
            <p>Fiche Parye</p>
            <p><strong>Nimewo:</strong> #${String(ticket.number).padStart(6, '0')}</p>
            <p><strong>Dat:</strong> ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p><strong>Tiraj:</strong> ${drawsData[ticket.draw].name} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})</p>
            <p><strong>Ajan:</strong> ${ticket.agent_name}</p>
            <p><strong>Sous-système:</strong> ${currentUser ? (currentUser.subsystem_name || 'Non spécifié') : 'Non connecté'}</p>
            <hr>
            <div style="margin: 15px 0;">${betsHTML}</div>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 1.1rem;"><span>Total:</span><span>${total} goud</span></div>
            <p style="margin-top: 20px;">Mèsi pou konfyans ou!</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">Fiche kreye: ${new Date().toLocaleString('fr-FR')}</p>
        </div>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>Fiche ${companyInfo.name}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;}@media print{body{margin:0;padding:0;}@page{margin:0;}}</style></head><body>${printContent.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// ==========================================
// Fonctions pour les multi-tirages
// ==========================================
async function saveMultiDrawTicketAPI(ticket) {
    try {
        const requestData = {
            ticket: {
                bets: ticket.bets,
                draws: Array.from(ticket.draws),
                totalAmount: ticket.totalAmount,
                agent_id: ticket.agentId,
                agent_name: ticket.agentName,
                subsystem_id: ticket.subsystem_id
            }
        };
        return await apiCall(APP_CONFIG.multiDrawTickets, 'POST', requestData);
    } catch (error) {
        console.error('Erreur sauvegarde multi-tirages:', error);
        throw error;
    }
}

function addToMultiDrawTicket() {
    const amount = parseInt(document.getElementById('multi-draw-amount').value);
    let number = '';

    switch(selectedMultiGame) {
        case 'borlette':
        case 'boulpe':
            number = document.getElementById('multi-draw-number').value;
            break;
        case 'marriage':
        case 'lotto4':
            const num1 = document.getElementById('multi-draw-number1').value;
            const num2 = document.getElementById('multi-draw-number2').value;
            number = `${num1}*${num2}`;
            break;
        case 'lotto3':
        case 'grap':
            number = document.getElementById('multi-draw-number').value;
            break;
        case 'lotto5':
            const num5_1 = document.getElementById('multi-draw-number1').value;
            const num5_2 = document.getElementById('multi-draw-number2').value;
            number = `${num5_1}*${num5_2}`;
            break;
    }

    let isValid = true;
    let errorMessage = '';

    if (selectedMultiGame === 'borlette' || selectedMultiGame === 'boulpe') {
        if (!/^\d{2}$/.test(number)) { errorMessage = "Tanpri antre yon nimewo 2 chif valab"; isValid = false; }
    } else if (selectedMultiGame === 'lotto3' || selectedMultiGame === 'grap') {
        if (!/^\d{3}$/.test(number)) { errorMessage = "Tanpri antre yon nimewo 3 chif valab"; isValid = false; }
    } else if (selectedMultiGame === 'marriage' || selectedMultiGame === 'lotto4') {
        const [p1, p2] = number.split('*');
        if (!/^\d{2}$/.test(p1) || !/^\d{2}$/.test(p2)) { errorMessage = "Chak nimewo dwe gen 2 chif valab"; isValid = false; }
    } else if (selectedMultiGame === 'lotto5') {
        const [p1, p2] = number.split('*');
        if (!/^\d{3}$/.test(p1) || !/^\d{2}$/.test(p2)) { errorMessage = "Premye nimewo 3 chif, dezyèm 2 chif"; isValid = false; }
    }

    if (isNaN(amount) || amount <= 0) { errorMessage = "Tanpri antre yon kantite valab"; isValid = false; }
    if (selectedMultiDraws.size === 0) { errorMessage = "Tanpri chwazi pou pi piti yon tiraj"; isValid = false; }

    for (const drawId of selectedMultiDraws) {
        if (isDrawBlocked(drawId, 'morning') || isDrawBlocked(drawId, 'evening')) {
            errorMessage = "Youn nan tiraj yo bloke (5 minit avan lè tiraj la)";
            isValid = false;
            break;
        }
    }

    if (!isValid) {
        showNotification(errorMessage, "warning");
        return;
    }

    const multiBet = {
        id: Date.now().toString(),
        gameType: selectedMultiGame,
        name: betTypes[selectedMultiGame].name,
        number: number,
        amount: amount,
        multiplier: betTypes[selectedMultiGame].multiplier,
        draws: Array.from(selectedMultiDraws)
    };

    currentMultiDrawTicket.bets.push(multiBet);
    selectedMultiDraws.forEach(drawId => currentMultiDrawTicket.draws.add(drawId));
    currentMultiDrawTicket.totalAmount += amount * selectedMultiDraws.size;
    updateMultiDrawTicketDisplay();
    showTotalNotification(currentMultiDrawTicket.totalAmount, 'multi-draw');
    document.getElementById('multi-draw-amount').value = '1';
    showNotification(`Parye ajoute nan fiche multi-tirages!`, "success");
}

function updateMultiDrawTicketDisplay() {
    const infoPanel = document.getElementById('current-multi-ticket-info');
    const summary = document.getElementById('multi-ticket-summary');
    if (currentMultiDrawTicket.bets.length === 0) {
        infoPanel.style.display = 'none';
        return;
    }
    infoPanel.style.display = 'block';
    let summaryHTML = `<div style="margin-bottom:10px;"><strong>${currentMultiDrawTicket.bets.length} parye</strong><div style="font-size:0.9rem;color:#7f8c8d;">${currentMultiDrawTicket.draws.size} tiraj</div></div><div style="max-height:150px;overflow-y:auto;margin-bottom:10px;">`;
    currentMultiDrawTicket.bets.forEach((bet, index) => {
        summaryHTML += `<div class="multi-draw-bet-item"><div><strong>${bet.name}</strong><br><small>${bet.number} (${bet.draws.length} tiraj)</small></div><div>${bet.amount * bet.draws.length} G <span style="color:var(--accent-color);cursor:pointer;margin-left:5px;" onclick="removeFromMultiDrawTicket('${bet.id}')"><i class="fas fa-times"></i></span></div></div>`;
    });
    summaryHTML += `</div><div style="font-weight:bold;border-top:1px solid #ddd;padding-top:10px;">Total: ${currentMultiDrawTicket.totalAmount} G</div>`;
    summary.innerHTML = summaryHTML;
}

window.removeFromMultiDrawTicket = function(betId) {
    const index = currentMultiDrawTicket.bets.findIndex(b => b.id === betId);
    if (index !== -1) {
        const bet = currentMultiDrawTicket.bets[index];
        currentMultiDrawTicket.totalAmount -= bet.amount * bet.draws.length;
        currentMultiDrawTicket.bets.splice(index, 1);
        const usedDraws = new Set();
        currentMultiDrawTicket.bets.forEach(b => b.draws.forEach(d => usedDraws.add(d)));
        currentMultiDrawTicket.draws = usedDraws;
        updateMultiDrawTicketDisplay();
        showTotalNotification(currentMultiDrawTicket.totalAmount, 'multi-draw');
        showNotification("Parye retire nan fiche multi-tirages", "info");
    }
};

async function saveAndPrintMultiDrawTicket() {
    if (currentMultiDrawTicket.bets.length === 0) {
        showNotification("Fiche multi-tirages la vid", "warning");
        return;
    }

    for (const drawId of currentMultiDrawTicket.draws) {
        if (isDrawBlocked(drawId, 'morning') || isDrawBlocked(drawId, 'evening')) {
            showNotification("Youn nan tiraj yo bloke! Ou pa kapab sove fiche multi-tirages 5 minit avan tiraj la.", "error");
            return;
        }
    }

    if (!currentUser) {
        showNotification("Ou pa konekte. Tanpri rekonekte.", "error");
        handleLogout();
        return;
    }

    try {
        const ticket = {
            id: currentMultiDrawTicket.id,
            bets: [...currentMultiDrawTicket.bets],
            totalAmount: currentMultiDrawTicket.totalAmount,
            draws: Array.from(currentMultiDrawTicket.draws),
            agentId: currentUser.id,
            agentName: currentUser.name,
            subsystem_id: currentUser.subsystem_id
        };

        const response = await saveMultiDrawTicketAPI(ticket);
        if (response && response.success) {
            printMultiDrawTicket(response.ticket);
            currentMultiDrawTicket = {
                id: Date.now().toString(),
                bets: [],
                totalAmount: 0,
                draws: new Set(),
                createdAt: new Date().toISOString()
            };
            updateMultiDrawTicketDisplay();
            await loadMultiDrawTickets();
            showNotification("Fiche multi-tirages anrejistre ak enprime avèk siksè!", "success");
        } else {
            showNotification("Erreur lors de la sauvegarde de la fiche multi-tirages", "error");
        }
    } catch (error) {
        showNotification("Erreur lors de la sauvegarde de la fiche multi-tirages", "error");
    }
}

function printMultiDrawTicket(ticket) {
    const printContent = document.createElement('div');
    printContent.className = 'print-ticket';
    let betsHTML = '';
    let total = 0;
    ticket.bets.forEach(bet => {
        const betTotal = bet.amount * bet.draws.length;
        total += betTotal;
        betsHTML += `<div style="margin-bottom:15px;padding:10px;background:#f8f9fa;border-radius:8px;"><div style="font-weight:bold;margin-bottom:5px;">${bet.name}</div><div style="margin-bottom:5px;">Nimewo: ${bet.number}</div><div style="margin-bottom:5px;">Tirages: ${bet.draws.map(d => drawsData[d].name).join(', ')}</div><div style="font-weight:bold;">${bet.amount} G × ${bet.draws.length} = ${betTotal} G</div></div>`;
    });
    printContent.innerHTML = `
        <div style="text-align: center; padding: 20px; border: 2px solid #000; font-family: Arial, sans-serif;">
            <div style="margin-bottom: 15px;"><img src="${companyLogo}" alt="Logo Nova Lotto" class="ticket-logo" style="max-width: 80px; height: auto;"></div>
            <h2>${companyInfo.name}</h2>
            <p>Fiche Multi-Tirages</p>
            <p><strong>Nimewo:</strong> #${String(ticket.number).padStart(6, '0')} (Multi)</p>
            <p><strong>Dat:</strong> ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p><strong>Ajan:</strong> ${ticket.agent_name}</p>
            <p><strong>Sous-système:</strong> ${currentUser ? (currentUser.subsystem_name || 'Non spécifié') : 'Non connecté'}</p>
            <hr>
            <div style="margin: 15px 0;"><h3>Parye Multi-Tirages</h3>${betsHTML}</div>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 1.1rem;"><span>Total:</span><span>${total} goud</span></div>
            <p style="margin-top: 20px;">Mèsi pou konfyans ou!</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">Fiche kreye: ${new Date().toLocaleString('fr-FR')}</p>
        </div>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Fiche Multi-Tirages ${companyInfo.name}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;}@media print{body{margin:0;padding:0;}@page{margin:0;}}</style></head><body>${printContent.innerHTML}</body></html>`);
    printWindow.document.close();
    printWindow.print();
}

function viewCurrentMultiDrawTicket() {
    if (currentMultiDrawTicket.bets.length === 0) {
        showNotification("Fiche multi-tirages la vid", "warning");
        return;
    }
    const ticket = {
        number: 'Aktyèl',
        date: new Date(currentMultiDrawTicket.createdAt).toLocaleString('fr-FR'),
        bets: [...currentMultiDrawTicket.bets],
        total: currentMultiDrawTicket.totalAmount,
        draws: Array.from(currentMultiDrawTicket.draws)
    };
    const previewWindow = window.open('', '_blank');
    previewWindow.document.write(`
        <html><head><title>Preview Fiche Multi-Tirages</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;}.ticket{border:2px solid #000;padding:20px;max-width:500px;margin:0 auto;}.ticket-header{text-align:center;margin-bottom:20px;}.bet-item{margin-bottom:15px;padding:10px;background:#f8f9fa;border-radius:8px;}</style></head><body>
        <div class="ticket"><div class="ticket-header"><h2>${companyInfo.name}</h2><h3>Fiche Multi-Tirages (Preview)</h3><p><strong>Nimewo:</strong> #${ticket.number}</p><p><strong>Dat:</strong> ${ticket.date}</p><p><strong>Ajan:</strong> ${currentUser ? currentUser.name : 'Non connecté'}</p><p><strong>Sous-système:</strong> ${currentUser ? (currentUser.subsystem_name || 'Non spécifié') : 'Non connecté'}</p></div><div><h3>Parye Multi-Tirages</h3>`
    );
    ticket.bets.forEach(bet => {
        const betTotal = bet.amount * bet.draws.length;
        previewWindow.document.write(`<div class="bet-item"><div><strong>${bet.name}</strong></div><div>Nimewo: ${bet.number}</div><div>Tirages: ${bet.draws.map(d => drawsData[d].name).join(', ')}</div><div><strong>${bet.amount} G × ${bet.draws.length} = ${betTotal} G</strong></div></div>`);
    });
    previewWindow.document.write(`</div><div style="margin-top:20px;padding-top:20px;border-top:2px solid #000;text-align:center;"><h2>Total: ${ticket.total} G</h2></div></div></body></html>`);
    previewWindow.document.close();
}

function openMultiTicketsScreen() {
    document.querySelector('.container').style.display = 'none';
    document.getElementById('multi-tickets-screen').style.display = 'block';
    updateMultiTicketsScreen();
}

function updateMultiTicketsScreen() {
    const ticketsList = document.getElementById('multi-tickets-list');
    ticketsList.innerHTML = '';
    if (multiDrawTickets.length === 0) {
        ticketsList.innerHTML = `<div style="text-align:center;padding:40px;color:#7f8c8d;"><i class="fas fa-ticket-alt" style="font-size:3rem;margin-bottom:15px;"></i><p>Pa gen fiche multi-tirages ki sove.</p></div>`;
        return;
    }
    const sortedTickets = [...multiDrawTickets].sort((a,b) => new Date(b.date) - new Date(a.date));
    sortedTickets.forEach(ticket => {
        const ticketItem = document.createElement('div');
        ticketItem.className = 'multi-ticket-item';
        const ticketDate = new Date(ticket.date);
        const drawNames = ticket.draws.map(d => drawsData[d].name).join(', ');
        let betsHTML = '';
        ticket.bets.forEach(bet => {
            betsHTML += `<div style="margin-bottom:5px;padding:5px;background:#f8f9fa;border-radius:4px;"><div><strong>${bet.name}</strong>: ${bet.number}</div><div style="font-size:0.8rem;">${bet.draws.length} tiraj - ${bet.amount} G × ${bet.draws.length} = ${bet.amount * bet.draws.length} G</div></div>`;
        });
        ticketItem.innerHTML = `
            <div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;align-items:center;"><strong>Fiche #${String(ticket.number).padStart(6, '0')} (Multi)</strong><span style="font-size:0.8rem;color:#7f8c8d;">${ticketDate.toLocaleDateString()}</span></div><div style="font-size:0.9rem;color:#7f8c8d;margin-top:5px;">${drawNames}</div></div>
            <div style="margin-bottom:10px;max-height:150px;overflow-y:auto;">${betsHTML}</div>
            <div style="display:flex;justify-content:space-between;font-weight:bold;border-top:1px solid #ddd;padding-top:10px;"><span>Total:</span><span>${ticket.total} G</span></div>
            <div style="display:flex;gap:10px;margin-top:10px;"><button class="ticket-action-btn print-ticket-btn" style="flex:1;padding:8px;" onclick="printMultiDrawTicketFromList('${ticket.id}')"><i class="fas fa-print"></i> Enprime</button></div>
        `;
        ticketsList.appendChild(ticketItem);
    });
}

window.printMultiDrawTicketFromList = function(ticketId) {
    const ticket = multiDrawTickets.find(t => t.id === ticketId);
    if (ticket) printMultiDrawTicket(ticket);
    else showNotification("Fiche pa jwenn", "error");
};

// ==========================================
// Affichage des résultats (depuis resultsData)
// ==========================================
function updateResultsDisplay() {
    const resultsGrid = document.querySelector('.results-grid');
    if (!resultsGrid) return;
    resultsGrid.innerHTML = '';

    Object.keys(drawsData).forEach(drawId => {
        const resultCard = document.createElement('div');
        resultCard.className = 'result-card';
        const result = resultsData[drawId]?.morning || { lot1: '---' };
        resultCard.innerHTML = `
            <h4>${drawsData[drawId].name}</h4>
            <div class="result-number">${result.lot1}</div>
        `;
        resultsGrid.appendChild(resultCard);
    });

    const latestResults = document.getElementById('latest-results');
    if (latestResults) {
        latestResults.innerHTML = '';
        Object.keys(drawsData).forEach(drawId => {
            Object.keys(drawsData[drawId].times).forEach(time => {
                const result = resultsData[drawId]?.[time];
                if (result) {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'lot-result';
                    const timeName = time === 'morning' ? 'Maten' : 'Swè';
                    resultDiv.innerHTML = `
                        <div><strong>${drawsData[drawId].name} ${timeName}</strong><br><small>${new Date(result.date).toLocaleString()}</small></div>
                        <div style="text-align:right;"><div class="lot-number">${result.lot1}</div><div>${result.lot2} (×20)</div><div>${result.lot3} (×10)</div></div>
                    `;
                    latestResults.appendChild(resultDiv);
                }
            });
        });
    }
}

// ==========================================
// Vérification des tickets gagnants
// ==========================================
function checkWinningTickets() {
    winningTickets = [];
    savedTickets.forEach(ticket => {
        const result = resultsData[ticket.draw]?.[ticket.drawTime];
        if (!result) return;

        const winningBets = [];
        let totalWinnings = 0;

        ticket.bets.forEach(bet => {
            const winningInfo = checkBetAgainstResult(bet, result);
            if (winningInfo.isWinner) {
                winningBets.push({ ...bet, winAmount: winningInfo.winAmount, winType: winningInfo.winType, matchedNumber: winningInfo.matchedNumber });
                totalWinnings += winningInfo.winAmount;
            }
        });

        if (winningBets.length > 0) {
            winningTickets.push({ ...ticket, winningBets, totalWinnings, result });
        }
    });

    displayWinningTickets();
    if (winningTickets.length > 0) {
        showNotification(`${winningTickets.length} fiche gagnant detekte!`, "success");
    } else {
        showNotification("Pa gen fiche genyen pou moman sa", "info");
    }
}

function checkBetAgainstResult(bet, result) {
    const lot1 = result.lot1;
    const lot2 = result.lot2;
    const lot3 = result.lot3;
    const lot1Last2 = lot1.substring(1);

    let isWinner = false;
    let winAmount = 0;
    let winType = '';
    let matchedNumber = '';

    switch(bet.type) {
        case 'borlette':
            if (bet.number === lot1Last2) {
                isWinner = true;
                winAmount = bet.amount * 60;
                winType = '1er lot';
                matchedNumber = lot1Last2;
            } else if (bet.number === lot2) {
                isWinner = true;
                winAmount = bet.amount * 20;
                winType = '2e lot';
                matchedNumber = lot2;
            } else if (bet.number === lot3) {
                isWinner = true;
                winAmount = bet.amount * 10;
                winType = '3e lot';
                matchedNumber = lot3;
            }
            break;
        case 'boulpe':
            if (bet.number === lot1Last2) {
                isWinner = true;
                winAmount = bet.amount * 60;
                winType = '1er lot';
                matchedNumber = lot1Last2;
            } else if (bet.number === lot2) {
                isWinner = true;
                winAmount = bet.amount * 20;
                winType = '2e lot';
                matchedNumber = lot2;
            } else if (bet.number === lot3) {
                isWinner = true;
                winAmount = bet.amount * 10;
                winType = '3e lot';
                matchedNumber = lot3;
            }
            break;
        case 'lotto3':
            if (bet.number === lot1) {
                isWinner = true;
                winAmount = bet.amount * 500;
                winType = 'Lotto 3';
                matchedNumber = lot1;
            }
            break;
        case 'lotto4':
            winAmount = 0;
            winType = '';
            if (bet.options?.option1) {
                const option1Result = lot2 + lot3;
                if (bet.number === option1Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 1, ';
                    matchedNumber = option1Result;
                }
            }
            if (bet.options?.option2) {
                const option2Result = lot1.substring(1) + lot2;
                if (bet.number === option2Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 2, ';
                    matchedNumber = option2Result;
                }
            }
            if (bet.options?.option3) {
                const betDigits = bet.number.split('');
                const lot2Digits = lot2.split('');
                const lot3Digits = lot3.split('');
                const tempDigits = [...betDigits];
                let containsLot2 = true;
                let containsLot3 = true;
                for (const digit of lot2Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) { containsLot2 = false; break; }
                    tempDigits.splice(index, 1);
                }
                for (const digit of lot3Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) { containsLot3 = false; break; }
                    tempDigits.splice(index, 1);
                }
                if (containsLot2 && containsLot3) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 3, ';
                    matchedNumber = bet.number;
                }
            }
            break;
        case 'lotto5':
            winAmount = 0;
            winType = '';
            if (bet.options?.option1) {
                const option1Result = lot1 + lot2;
                if (bet.number === option1Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 1, ';
                    matchedNumber = option1Result;
                }
            }
            if (bet.options?.option2) {
                const option2Result = lot1 + lot3;
                if (bet.number === option2Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 2, ';
                    matchedNumber = option2Result;
                }
            }
            if (bet.options?.option3) {
                const allResultDigits = (lot1 + lot2 + lot3).split('');
                const betDigits = bet.number.split('');
                let allFound = true;
                const tempResultDigits = [...allResultDigits];
                for (const digit of betDigits) {
                    const index = tempResultDigits.indexOf(digit);
                    if (index === -1) { allFound = false; break; }
                    tempResultDigits.splice(index, 1);
                }
                if (allFound) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 3, ';
                    matchedNumber = bet.number;
                }
            }
            break;
        case 'marriage':
        case 'auto-marriage':
            const [num1, num2] = bet.number.split('*');
            const numbers = [lot1Last2, lot2, lot3];
            if (numbers.includes(num1) && numbers.includes(num2)) {
                isWinner = true;
                winAmount = bet.amount * 1000;
                winType = 'Maryaj';
                matchedNumber = `${num1}*${num2}`;
            }
            break;
        case 'grap':
            if (lot1[0] === lot1[1] && lot1[1] === lot1[2]) {
                if (bet.number === lot1) {
                    isWinner = true;
                    winAmount = bet.amount * 500;
                    winType = 'Grap';
                    matchedNumber = lot1;
                }
            }
            break;
        case 'auto-lotto4':
            const lotto4Digits = bet.number.split('');
            const autoLot2Digits = lot2.split('');
            const autoLot3Digits = lot3.split('');
            const autoTempDigits = [...lotto4Digits];
            let autoContainsLot2 = true;
            let autoContainsLot3 = true;
            for (const digit of autoLot2Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) { autoContainsLot2 = false; break; }
                autoTempDigits.splice(index, 1);
            }
            for (const digit of autoLot3Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) { autoContainsLot3 = false; break; }
                autoTempDigits.splice(index, 1);
            }
            if (autoContainsLot2 && autoContainsLot3) {
                isWinner = true;
                winAmount = bet.amount * 5000;
                winType = 'Lotto 4 Auto';
                matchedNumber = bet.number;
            }
            break;
    }
    return { isWinner, winAmount, winType, matchedNumber };
}

function displayWinningTickets() {
    const container = document.getElementById('winning-tickets-container');
    const summary = document.getElementById('winning-summary');
    container.innerHTML = '';
    if (winningTickets.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#7f8c8d;"><i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:10px;"></i><p>Pa gen fiche gagnant pou moman sa.</p></div>`;
        summary.innerHTML = '';
        return;
    }
    const totalWinnings = winningTickets.reduce((sum, t) => sum + t.totalWinnings, 0);
    summary.innerHTML = `<div class="stat-card"><div class="stat-value">${winningTickets.length}</div><div class="stat-label">Fiche Gagnant</div></div><div class="stat-card"><div class="stat-value">${totalWinnings} G</div><div class="stat-label">Total Gains</div></div>`;
    winningTickets.forEach(ticket => {
        const ticketDiv = document.createElement('div');
        ticketDiv.className = 'winning-ticket';
        let betsHTML = '';
        ticket.winningBets.forEach(winBet => {
            betsHTML += `<div class="bet-item"><div class="bet-details"><strong>${winBet.name}</strong><br>${winBet.number} → ${winBet.matchedNumber || winBet.number} (${winBet.winType})</div><div class="bet-amount"><span class="winning-amount">+${winBet.winAmount} G</span></div></div>`;
        });
        ticketDiv.innerHTML = `
            <div style="margin-bottom:10px;"><strong>Fiche #${String(ticket.number).padStart(6, '0')}</strong><div style="font-size:0.9rem;color:#7f8c8d;">${drawsData[ticket.draw].name} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})</div></div>
            <div style="margin-bottom:10px;"><strong>Rezilta:</strong> ${ticket.result.lot1} | ${ticket.result.lot2} | ${ticket.result.lot3}</div>
            ${betsHTML}
            <div class="bet-total"><span>Total Gains:</span><span class="winning-amount">${ticket.totalWinnings} G</span></div>
        `;
        container.appendChild(ticketDiv);
    });
}

// ==========================================
// Gestion des paris et de l'interface
// ==========================================
function showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('sync-status').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'block';
}

function updateLogoDisplay() {
    const logoElements = document.querySelectorAll('#company-logo, #ticket-logo');
    logoElements.forEach(logo => {
        logo.src = companyLogo;
        logo.onerror = function() {
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzOWMxMiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Qk9STEVUVEU8L3RleHQ+PC9zdmc+';
        };
    });
}

function setupConnectionDetection() {
    window.addEventListener('online', () => {
        isOnline = true;
        showNotification("Koneksyon entènèt retabli", "success");
        loadResultsFromAPI();
    });
    window.addEventListener('offline', () => {
        isOnline = false;
        showNotification("Pa konekte ak entènèt", "warning");
    });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';
    if (type === 'error') icon = 'fas fa-times-circle';
    notification.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 20px)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen, .betting-screen, .container, .report-screen, .results-check-screen, .multi-tickets-screen').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-screen') === screenId) item.classList.add('active');
    });
    if (screenId === 'home') document.querySelector('.container').style.display = 'block';
    else {
        const screen = document.getElementById(screenId + '-screen');
        if (screen) {
            screen.style.display = 'block';
            if (screenId === 'ticket-management') updateTicketManagementScreen();
            else if (screenId === 'history') updateHistoryScreen();
            else if (screenId === 'winning-tickets') updateWinningTicketsScreen();
        }
    }
}

function updateCurrentTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    const dateString = now.toLocaleDateString('fr-FR', options);
    const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('current-time').textContent = `${dateString} - ${timeString}`;
    document.getElementById('ticket-date').textContent = `${dateString} - ${timeString}`;
}

function updatePendingBadge() {
    // peut être étendu
}

function openBettingScreen(drawId, time = null) {
    currentDraw = drawId;
    currentDrawTime = time;
    const draw = drawsData[drawId];
    let title = draw.name;
    if (time) title += ` (${time === 'morning' ? 'Maten' : 'Swè'})`;
    document.getElementById('betting-title').textContent = title;

    const bettingScreen = document.getElementById('betting-screen');
    bettingScreen.style.display = 'block';
    bettingScreen.classList.remove('slide-out');
    bettingScreen.classList.add('slide-in');
    document.querySelector('.container').style.display = 'none';

    document.getElementById('games-interface').style.display = 'block';
    document.getElementById('bet-type-nav').style.display = 'none';
    document.getElementById('auto-buttons').style.display = 'none';
    document.getElementById('bet-form').style.display = 'none';
    document.getElementById('active-bets').style.display = 'block';

    setupGameSelection();
    updateBetsList();
}

function setupGameSelection() {
    document.querySelectorAll('.game-item').forEach(item => {
        item.removeEventListener('click', handleGameClick);
        item.addEventListener('click', handleGameClick);
    });
}

function handleGameClick() {
    const gameType = this.getAttribute('data-game');
    if (gameType === 'auto-marriage' || gameType === 'auto-lotto4') {
        showAutoGameForm(gameType);
    } else {
        showBetForm(gameType);
    }
}

function showAutoGameForm(gameType) {
    const bet = betTypes[gameType];
    document.getElementById('games-interface').style.display = 'none';
    document.getElementById('bet-type-nav').style.display = 'none';
    document.getElementById('auto-buttons').style.display = 'none';
    const betForm = document.getElementById('bet-form');
    betForm.style.display = 'block';
    selectedBalls = [];

    let formHTML = '';
    if (gameType === 'auto-marriage') {
        formHTML = `
            <h3>${bet.name} - ${bet.description}</h3>
            <p class="info-text"><small>Chwazi plizyè boule (2 chif) pou maryaj otomatik</small></p>
            <div class="options-container">
                <div style="margin-bottom:15px;">
                    <div class="all-graps-btn" id="use-basket-balls"><i class="fas fa-shopping-basket"></i> Itilize Boul nan Panye</div>
                    <div class="all-graps-btn" id="enter-manual-balls"><i class="fas fa-keyboard"></i> Antre Boul Manyèlman</div>
                </div>
                <div id="manual-balls-input" style="display:none;">
                    <div class="form-group"><label for="manual-balls">Antre boul yo (separe pa espas):</label><input type="text" id="manual-balls" class="manual-balls-input" placeholder="12 34 56 78"><small style="color:#7f8c8d;">Egzanp: 12 34 56 78 (4 boul 2 chif)</small></div>
                    <button class="btn-primary" id="process-manual-balls"><i class="fas fa-check"></i> Proses Boul yo</button>
                </div>
                <div style="margin-bottom:15px;"><strong>Boules disponib:</strong><div class="balls-list" id="available-balls-list"></div></div>
                <div style="margin-bottom:15px;"><div class="all-graps-btn" id="clear-balls-btn"><i class="fas fa-times-circle"></i> Retire Tout Boul</div></div>
                <div style="margin-bottom:15px;"><strong>Boules sélectionnées:</strong><div id="selected-balls-list" style="min-height:50px;border:1px dashed #ccc;padding:10px;margin-top:5px;border-radius:5px;">Pa gen boul chwazi</div></div>
            </div>
            <div class="form-group"><label for="auto-game-amount">Kantite pou chak maryaj</label><input type="number" id="auto-game-amount" placeholder="Kantite" min="1" value="1"></div>
            <div class="bet-actions"><button class="btn-primary" id="add-auto-marriages">Ajoute Maryaj Otomatik</button><button class="btn-secondary" id="return-to-types">Retounen</button></div>
        `;
    } else if (gameType === 'auto-lotto4') {
        formHTML = `
            <h3>${bet.name} - ${bet.description}</h3>
            <p class="info-text"><small>Chwazi plizyè boule (2 chif) pou Lotto 4 otomatik</small></p>
            <div class="options-container">
                <div style="margin-bottom:15px;">
                    <div class="all-graps-btn" id="use-basket-balls"><i class="fas fa-shopping-basket"></i> Itilize Boul nan Panye</div>
                    <div class="all-graps-btn" id="enter-manual-balls"><i class="fas fa-keyboard"></i> Antre Boul Manyèlman</div>
                </div>
                <div id="manual-balls-input" style="display:none;">
                    <div class="form-group"><label for="manual-balls">Antre boul yo (separe pa espas):</label><input type="text" id="manual-balls" class="manual-balls-input" placeholder="12 34 56 78"><small style="color:#7f8c8d;">Egzanp: 12 34 56 78 (4 boul 2 chif)</small></div>
                    <button class="btn-primary" id="process-manual-balls"><i class="fas fa-check"></i> Proses Boul yo</button>
                </div>
                <div style="margin-bottom:15px;"><strong>Boules disponib:</strong><div class="balls-list" id="available-balls-list"></div></div>
                <div style="margin-bottom:15px;"><div class="all-graps-btn" id="clear-balls-btn"><i class="fas fa-times-circle"></i> Retire Tout Boul</div></div>
                <div style="margin-bottom:15px;"><strong>Boules sélectionnées:</strong><div id="selected-balls-list" style="min-height:50px;border:1px dashed #ccc;padding:10px;margin-top:5px;border-radius:5px;">Pa gen boul chwazi</div></div>
                <div style="margin-bottom:15px;"><div class="option-group"><label class="option-label"><input type="checkbox" id="include-reverse" checked><span>Enkli renverse yo</span></label></div></div>
            </div>
            <div class="form-group"><label for="auto-game-amount">Kantite pou chak Lotto 4</label><input type="number" id="auto-game-amount" placeholder="Kantite" min="1" value="1"></div>
            <div class="bet-actions"><button class="btn-primary" id="add-auto-lotto4">Ajoute Lotto 4 Otomatik</button><button class="btn-secondary" id="return-to-types">Retounen</button></div>
        `;
    }
    betForm.innerHTML = formHTML;
    document.getElementById('use-basket-balls').addEventListener('click', loadBasketBalls);
    document.getElementById('enter-manual-balls').addEventListener('click', () => document.getElementById('manual-balls-input').style.display = 'block');
    document.getElementById('process-manual-balls').addEventListener('click', processManualBalls);
    document.getElementById('clear-balls-btn').addEventListener('click', () => { selectedBalls = []; updateSelectedBallsList(); updateAvailableBallsList(); });
    if (gameType === 'auto-marriage') document.getElementById('add-auto-marriages').addEventListener('click', addAutoMarriages);
    else document.getElementById('add-auto-lotto4').addEventListener('click', addAutoLotto4);
    document.getElementById('return-to-types').addEventListener('click', () => {
        betForm.style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
    });
    document.getElementById('active-bets').style.display = 'block';
}

function loadBasketBalls() {
    const basketBalls = [];
    activeBets.forEach(bet => {
        if (bet.type === 'borlette' || bet.type === 'boulpe') {
            if (bet.isGroup) bet.details.forEach(d => { if (/^\d{2}$/.test(d.number)) basketBalls.push(d.number); });
            else if (/^\d{2}$/.test(bet.number)) basketBalls.push(bet.number);
        }
    });
    selectedBalls = [...new Set(basketBalls)];
    if (selectedBalls.length === 0) showNotification("Pa gen boul borlette nan panye a", "warning");
    else {
        updateSelectedBallsList();
        updateAvailableBallsList();
        showNotification(`${selectedBalls.length} boul chaje nan panye a`, "success");
    }
}

function processManualBalls() {
    const manualInput = document.getElementById('manual-balls').value.trim();
    if (!manualInput) { showNotification("Tanpri antre kèk boul", "warning"); return; }
    const balls = manualInput.split(/\s+/);
    const validBalls = [], invalidBalls = [];
    balls.forEach(b => /^\d{2}$/.test(b) ? validBalls.push(b) : invalidBalls.push(b));
    if (validBalls.length === 0) { showNotification("Pa gen boul valab. Boul yo dwe gen 2 chif.", "warning"); return; }
    selectedBalls = [...new Set(validBalls)];
    updateSelectedBallsList();
    updateAvailableBallsList();
    let message = `${selectedBalls.length} boul valab ajoute`;
    if (invalidBalls.length > 0) message += `. ${invalidBalls.length} boul envalid: ${invalidBalls.join(', ')}`;
    showNotification(message, "success");
    document.getElementById('manual-balls-input').style.display = 'none';
    document.getElementById('manual-balls').value = '';
}

function updateAvailableBallsList() {
    const ballsList = document.getElementById('available-balls-list');
    if (selectedBalls.length === 0) { ballsList.innerHTML = '<p>Pa gen boul disponib.</p>'; return; }
    ballsList.innerHTML = '';
    selectedBalls.forEach((ball, index) => {
        const ballTag = document.createElement('div');
        ballTag.className = 'ball-tag';
        ballTag.innerHTML = `${ball}<span class="remove-ball" onclick="removeBall(${index})"><i class="fas fa-times"></i></span>`;
        ballsList.appendChild(ballTag);
    });
}

window.removeBall = function(index) {
    selectedBalls.splice(index, 1);
    updateSelectedBallsList();
    updateAvailableBallsList();
};

function updateSelectedBallsList() {
    const ballsList = document.getElementById('selected-balls-list');
    ballsList.innerHTML = selectedBalls.length ? selectedBalls.join(', ') : "Pa gen boul chwazi";
}

function addAutoMarriages() {
    const amount = parseInt(document.getElementById('auto-game-amount').value);
    if (selectedBalls.length < 2) { showNotification("Fò gen omwen 2 boul pou fè maryaj otomatik", "warning"); return; }
    if (isNaN(amount) || amount <= 0) { showNotification("Tanpri antre yon kantite valab", "warning"); return; }
    let addedCount = 0;
    for (let i = 0; i < selectedBalls.length; i++) {
        for (let j = i + 1; j < selectedBalls.length; j++) {
            activeBets.push({ type: 'marriage', name: 'MARYAJ OTOMATIK', number: `${selectedBalls[i]}*${selectedBalls[j]}`, amount: amount, multiplier: betTypes.marriage.multiplier, isAuto: true });
            addedCount++;
        }
    }
    updateBetsList();
    showNotification(`${addedCount} maryaj otomatik ajoute avèk siksè!`, "success");
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
        selectedBalls = [];
    }, 500);
}

function addAutoLotto4() {
    const amount = parseInt(document.getElementById('auto-game-amount').value);
    const includeReverse = document.getElementById('include-reverse').checked;
    if (selectedBalls.length < 2) { showNotification("Fò gen omwen 2 boul pou fè Lotto 4 otomatik", "warning"); return; }
    if (isNaN(amount) || amount <= 0) { showNotification("Tanpri antre yon kantite valab", "warning"); return; }
    let addedCount = 0;
    for (let i = 0; i < selectedBalls.length; i++) {
        for (let j = i + 1; j < selectedBalls.length; j++) {
            activeBets.push({ type: 'lotto4', name: 'LOTO 4 OTOMATIK', number: selectedBalls[i] + selectedBalls[j], amount: amount, multiplier: betTypes.lotto4.multiplier, isAuto: true, options: { option1: false, option2: false, option3: true }, perOptionAmount: amount });
            addedCount++;
            if (includeReverse) {
                activeBets.push({ type: 'lotto4', name: 'LOTO 4 OTOMATIK (RENVÈSE)', number: selectedBalls[j] + selectedBalls[i], amount: amount, multiplier: betTypes.lotto4.multiplier, isAuto: true, options: { option1: false, option2: false, option3: true }, perOptionAmount: amount });
                addedCount++;
            }
        }
    }
    updateBetsList();
    showNotification(`${addedCount} Lotto 4 otomatik ajoute avèk siksè!`, "success");
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
        selectedBalls = [];
    }, 500);
}

function showBetForm(gameType) {
    const bet = betTypes[gameType];
    document.getElementById('games-interface').style.display = 'none';
    document.getElementById('bet-type-nav').style.display = 'none';
    document.getElementById('auto-buttons').style.display = 'none';
    const betForm = document.getElementById('bet-form');
    betForm.style.display = 'block';

    let formHTML = '';
    switch(gameType) {
        case 'lotto3':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><p class="info-text"><small>Chwazi 3 chif (lot 1 + 1 chif devan)</small></p><div class="quick-bet-form"><input type="text" id="lotto3-number" class="quick-number-input" placeholder="000" maxlength="3" pattern="[0-9]{3}" title="Antre 3 chif (0-9)"><input type="number" id="lotto3-amount" class="quick-amount-input" placeholder="Kantite" min="1"><button class="btn-primary" id="add-bet">Ajoute</button></div><div class="bet-actions"><button class="btn-secondary" id="return-to-types">Retounen</button></div>`;
            break;
        case 'marriage':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><div class="form-group"><label>2 Chif yo</label><div class="number-inputs"><input type="text" id="marriage-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}"><input type="text" id="marriage-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}"></div></div><div class="quick-bet-form"><input type="number" id="marriage-amount" class="quick-amount-input" placeholder="Kantite" min="1"><button class="btn-primary" id="add-bet">Ajoute</button></div><div class="bet-actions"><button class="btn-secondary" id="return-to-types">Retounen</button></div>`;
            break;
        case 'borlette':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><p class="info-text"><small>1er lot ×60, 2e lot ×20, 3e lot ×10</small></p><div class="quick-bet-form"><input type="text" id="borlette-number" class="quick-number-input" placeholder="00" maxlength="2" pattern="[0-9]{2}"><input type="number" id="borlette-amount" class="quick-amount-input" placeholder="Kantite" min="1"><button class="btn-primary" id="add-bet">Ajoute</button></div><div class="bet-actions"><button class="btn-secondary" id="return-to-types">Retounen</button></div><div class="n-balls-container"><div class="n-ball" data-n="0">N0</div><div class="n-ball" data-n="1">N1</div><div class="n-ball" data-n="2">N2</div><div class="n-ball" data-n="3">N3</div><div class="n-ball" data-n="4">N4</div><div class="n-ball" data-n="5">N5</div><div class="n-ball" data-n="6">N6</div><div class="n-ball" data-n="7">N7</div><div class="n-ball" data-n="8">N8</div><div class="n-ball" data-n="9">N9</div></div>`;
            break;
        case 'boulpe':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><p class="info-text"><small>1er lot ×60, 2e lot ×20, 3e lot ×10</small></p><div class="quick-bet-form"><input type="text" id="boulpe-number" class="quick-number-input" placeholder="00" maxlength="2" pattern="[0-9]{2}"><input type="number" id="boulpe-amount" class="quick-amount-input" placeholder="Kantite" min="1"><button class="btn-primary" id="add-bet">Ajoute</button></div><div class="bet-actions"><button class="btn-secondary" id="return-to-types">Retounen</button></div><div class="n-balls-container"><div class="n-ball" data-number="00">00</div><div class="n-ball" data-number="11">11</div><div class="n-ball" data-number="22">22</div><div class="n-ball" data-number="33">33</div><div class="n-ball" data-number="44">44</div><div class="n-ball" data-number="55">55</div><div class="n-ball" data-number="66">66</div><div class="n-ball" data-number="77">77</div><div class="n-ball" data-number="88">88</div><div class="n-ball" data-number="99">99</div><div class="bo-ball" id="bo-all">BO</div></div>`;
            break;
        case 'lotto4':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><p class="info-text"><small>4 chif (lot 1+2 accumulate) - 3 opsyon</small></p><div class="form-group"><label>4 Chif yo</label><div class="number-inputs"><input type="text" id="lotto4-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}"><input type="text" id="lotto4-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}"></div></div><div class="options-container"><div class="option-checkbox"><input type="checkbox" id="lotto4-option1" checked><label for="lotto4-option1"><strong>Opsyon 1:</strong> lot2 + lot3 (ex: 45 + 34 = 4534)</label><span class="option-multiplier">×5000</span></div><div class="option-checkbox"><input type="checkbox" id="lotto4-option2" checked><label for="lotto4-option2"><strong>Opsyon 2:</strong> 2 dènye chif lot1 + lot2 (ex: 23 + 45 = 2345)</label><span class="option-multiplier">×5000</span></div><div class="option-checkbox"><input type="checkbox" id="lotto4-option3" checked><label for="lotto4-option3"><strong>Opsyon 3:</strong> N'importe lòd lot2 ak lot3 (ex: 4523, 3423, 4534, etc.)</label><span class="option-multiplier">×5000</span></div></div><div class="form-group"><label for="lotto4-amount">Kantite pa opsyon</label><input type="number" id="lotto4-amount" placeholder="Kantite" min="1" value="1"><small style="color:#7f8c8d;">Total = kantite × nimewo opsyon chwazi</small></div><div class="bet-actions"><button class="btn-primary" id="add-bet">Ajoute</button><button class="btn-secondary" id="return-to-types">Retounen</button></div>`;
            break;
        case 'lotto5':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><p class="info-text"><small>5 chif (lot 1+2+3 accumulate) - 3 opsyon</small></p><div class="form-group"><label>5 Chif yo</label><div class="number-inputs"><input type="text" id="lotto5-number1" placeholder="000" maxlength="3" pattern="[0-9]{3}"><input type="text" id="lotto5-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}"></div></div><div class="options-container"><div class="option-checkbox"><input type="checkbox" id="lotto5-option1" checked><label for="lotto5-option1"><strong>Opsyon 1:</strong> lot1 + lot2 (ex: 123 + 45 = 12345)</label><span class="option-multiplier">×25000</span></div><div class="option-checkbox"><input type="checkbox" id="lotto5-option2" checked><label for="lotto5-option2"><strong>Opsyon 2:</strong> lot1 + lot3 (ex: 123 + 34 = 12334)</label><span class="option-multiplier">×25000</span></div><div class="option-checkbox"><input type="checkbox" id="lotto5-option3" checked><label for="lotto5-option3"><strong>Opsyon 3:</strong> N'importe fason 5 boul yo (ex: 14523, 13445, 12334, etc.)</label><span class="option-multiplier">×25000</span></div></div><div class="form-group"><label for="lotto5-amount">Kantite pa opsyon</label><input type="number" id="lotto5-amount" placeholder="Kantite" min="1" value="1"><small style="color:#7f8c8d;">Total = kantite × nimewo opsyon chwazi</small></div><div class="bet-actions"><button class="btn-primary" id="add-bet">Ajoute</button><button class="btn-secondary" id="return-to-types">Retounen</button></div>`;
            break;
        case 'grap':
            formHTML = `<h3>${bet.name} - ${bet.description}</h3><p class="info-text"><small>Chwazi boule paire pou grap (3 chif menm)</small></p><div style="margin-bottom:15px;"><div class="all-graps-btn" id="select-all-graps"><i class="fas fa-check-square"></i> Chwazi Tout Graps</div><div class="all-graps-btn" id="deselect-all-graps"><i class="fas fa-times-circle"></i> Retire Tout Graps</div></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:15px;" id="grap-selection-container"><div class="pair-ball" data-pair="111">111</div><div class="pair-ball" data-pair="222">222</div><div class="pair-ball" data-pair="333">333</div><div class="pair-ball" data-pair="444">444</div><div class="pair-ball" data-pair="555">555</div><div class="pair-ball" data-pair="666">666</div><div class="pair-ball" data-pair="777">777</div><div class="pair-ball" data-pair="888">888</div><div class="pair-ball" data-pair="999">999</div><div class="pair-ball" data-pair="000">000</div></div><div class="form-group"><label for="grap-amount">Kantite pou chak grap</label><input type="number" id="grap-amount" placeholder="Kantite" min="1" value="1"></div><div class="bet-actions"><button class="btn-primary" id="add-selected-graps">Ajoute Graps Chwazi</button><button class="btn-secondary" id="return-to-types">Retounen</button></div>`;
            break;
    }
    betForm.innerHTML = formHTML;
    setupAutoFocusInputs();

    if (gameType === 'grap') {
        setupGrapSelection();
    } else {
        document.getElementById('add-bet').addEventListener('click', () => addBet(gameType));
    }

    document.getElementById('return-to-types').addEventListener('click', () => {
        betForm.style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
    });

    if (gameType === 'boulpe') {
        document.querySelectorAll('.n-ball[data-number]').forEach(ball => {
            ball.addEventListener('click', function() {
                document.getElementById('boulpe-number').value = this.getAttribute('data-number');
                document.getElementById('boulpe-amount').focus();
            });
        });
        document.getElementById('bo-all').addEventListener('click', function() {
            const amount = prompt("Kantite pou chak boule pe (00-99):", "1");
            if (amount && !isNaN(amount) && amount > 0) {
                const numbers = ['00','11','22','33','44','55','66','77','88','99'];
                activeBets.push({ type: gameType, name: 'BOUL PE (Tout)', number: '00-99', amount: parseInt(amount) * numbers.length, multiplier: bet.multiplier, isGroup: true, details: numbers.map(n => ({number: n, amount: parseInt(amount)})) });
                updateBetsList();
                showNotification(`${numbers.length} boule pe ajoute avèk siksè!`, "success");
            }
        });
    }

    if (gameType === 'borlette' || gameType === 'boulpe') {
        document.querySelectorAll('.n-ball[data-n]').forEach(ball => {
            ball.addEventListener('click', function() {
                const n = this.getAttribute('data-n');
                const numbers = [];
                for (let i = 0; i <= 9; i++) numbers.push(i.toString() + n);
                const amount = prompt(`Kantite pou chak boule nan N${n}:`, "1");
                if (amount && !isNaN(amount) && amount > 0) {
                    activeBets.push({ type: gameType, name: `N${n} (Tout)`, number: `0${n}-9${n}`, amount: parseInt(amount) * numbers.length, multiplier: bet.multiplier, isGroup: true, details: numbers.map(num => ({number: num, amount: parseInt(amount)})) });
                    updateBetsList();
                    showNotification(`${numbers.length} boule N${n} ajoute avèk siksè!`, "success");
                }
            });
        });
    }

    const numberInput = betForm.querySelector('input[type="text"]');
    if (numberInput) numberInput.focus();
    document.getElementById('active-bets').style.display = 'block';
}

function setupGrapSelection() {
    const grapBalls = document.querySelectorAll('#grap-selection-container .pair-ball');
    let selectedGraps = new Set();
    grapBalls.forEach(ball => {
        ball.addEventListener('click', function() {
            this.classList.toggle('selected');
            const pair = this.getAttribute('data-pair');
            if (this.classList.contains('selected')) selectedGraps.add(pair);
            else selectedGraps.delete(pair);
        });
    });
    document.getElementById('select-all-graps').addEventListener('click', () => {
        grapBalls.forEach(ball => { ball.classList.add('selected'); selectedGraps.add(ball.getAttribute('data-pair')); });
    });
    document.getElementById('deselect-all-graps').addEventListener('click', () => {
        grapBalls.forEach(ball => { ball.classList.remove('selected'); selectedGraps.clear(); });
    });
    document.getElementById('add-selected-graps').addEventListener('click', () => addSelectedGraps(selectedGraps));
}

function addSelectedGraps(selectedGraps) {
    const amount = parseInt(document.getElementById('grap-amount').value);
    const selectedBalls = document.querySelectorAll('#grap-selection-container .pair-ball.selected');
    if (selectedBalls.length === 0) { showNotification("Tanpri chwazi omwen yon grap", "warning"); return; }
    if (isNaN(amount) || amount <= 0) { showNotification("Tanpri antre yon kantite valab", "warning"); return; }
    let addedCount = 0;
    selectedBalls.forEach(ball => {
        const pair = ball.getAttribute('data-pair');
        activeBets.push({ type: 'grap', name: 'GRAP', number: pair, amount: amount, multiplier: betTypes.grap.multiplier });
        addedCount++;
        ball.classList.remove('selected');
        selectedGraps.delete(pair);
    });
    updateBetsList();
    showNotification(`${addedCount} graps ajoute avèk siksè!`, "success");
    document.getElementById('grap-amount').value = '1';
}

function addBet(betType) {
    const bet = betTypes[betType];
    let number, amount;

    switch(betType) {
        case 'lotto3':
            number = document.getElementById('lotto3-number').value;
            amount = parseInt(document.getElementById('lotto3-amount').value);
            if (!/^\d{3}$/.test(number)) { showNotification("Lotto 3 dwe gen 3 chif egzat (0-9)", "warning"); return; }
            break;
        case 'marriage':
            const num1 = document.getElementById('marriage-number1').value;
            const num2 = document.getElementById('marriage-number2').value;
            number = `${num1}*${num2}`;
            amount = parseInt(document.getElementById('marriage-amount').value);
            if (!/^\d{2}$/.test(num1) || !/^\d{2}$/.test(num2)) { showNotification("Chak chif maryaj dwe gen 2 chif", "warning"); return; }
            break;
        case 'borlette':
            number = document.getElementById('borlette-number').value;
            amount = parseInt(document.getElementById('borlette-amount').value);
            if (!/^\d{2}$/.test(number)) { showNotification("Borlette dwe gen 2 chif", "warning"); return; }
            break;
        case 'boulpe':
            number = document.getElementById('boulpe-number').value;
            amount = parseInt(document.getElementById('boulpe-amount').value);
            if (!/^\d{2}$/.test(number)) { showNotification("Boul pe dwe gen 2 chif", "warning"); return; }
            if (number.length === 2 && number[0] !== number[1]) { showNotification("Pou boul pe, fòk de chif yo menm! (ex: 00, 11, 22)", "warning"); return; }
            break;
        case 'lotto4':
            const num4_1 = document.getElementById('lotto4-number1').value;
            const num4_2 = document.getElementById('lotto4-number2').value;
            number = num4_1 + num4_2;
            const option1 = document.getElementById('lotto4-option1')?.checked || false;
            const option2 = document.getElementById('lotto4-option2')?.checked || false;
            const option3 = document.getElementById('lotto4-option3')?.checked || false;
            amount = parseInt(document.getElementById('lotto4-amount').value);
            if (!/^\d{2}$/.test(num4_1) || !/^\d{2}$/.test(num4_2)) { showNotification("Chak boule Lotto 4 dwe gen 2 chif", "warning"); return; }
            const optionsCount = [option1, option2, option3].filter(opt => opt).length;
            if (optionsCount === 0) { showNotification("Tanpri chwazi omwen yon opsyon", "warning"); return; }
            const totalAmount = amount * optionsCount;
            activeBets.push({ type: betType, name: bet.name, number: number, amount: totalAmount, multiplier: bet.multiplier, options: { option1, option2, option3 }, perOptionAmount: amount, isLotto4: true });
            updateBetsList();
            showNotification("Lotto 4 ajoute avèk siksè!", "success");
            setTimeout(() => {
                document.getElementById('bet-form').style.display = 'none';
                document.getElementById('games-interface').style.display = 'block';
            }, 500);
            return;
        case 'lotto5':
            const num5_1 = document.getElementById('lotto5-number1').value;
            const num5_2 = document.getElementById('lotto5-number2').value;
            number = num5_1 + num5_2;
            const lotto5Option1 = document.getElementById('lotto5-option1')?.checked || false;
            const lotto5Option2 = document.getElementById('lotto5-option2')?.checked || false;
            const lotto5Option3 = document.getElementById('lotto5-option3')?.checked || false;
            amount = parseInt(document.getElementById('lotto5-amount').value);
            if (!/^\d{3}$/.test(num5_1) || !/^\d{2}$/.test(num5_2)) { showNotification("Lotto 5: Premye boule 3 chif, Dezyèm boule 2 chif", "warning"); return; }
            const lotto5OptionsCount = [lotto5Option1, lotto5Option2, lotto5Option3].filter(opt => opt).length;
            if (lotto5OptionsCount === 0) { showNotification("Tanpri chwazi omwen yon opsyon", "warning"); return; }
            const lotto5TotalAmount = amount * lotto5OptionsCount;
            activeBets.push({ type: betType, name: bet.name, number: number, amount: lotto5TotalAmount, multiplier: bet.multiplier, options: { option1: lotto5Option1, option2: lotto5Option2, option3: lotto5Option3 }, perOptionAmount: amount, isLotto5: true });
            updateBetsList();
            showNotification("Lotto 5 ajoute avèk siksè!", "success");
            setTimeout(() => {
                document.getElementById('bet-form').style.display = 'none';
                document.getElementById('games-interface').style.display = 'block';
            }, 500);
            return;
    }

    if (!number || isNaN(amount) || amount <= 0) { showNotification("Tanpri rantre yon nimewo ak yon kantite valab", "warning"); return; }
    activeBets.push({ type: betType, name: bet.name, number: number, amount: amount, multiplier: bet.multiplier });
    updateBetsList();
    updateNormalBetTotalNotification();
    showNotification("Parye ajoute avèk siksè!", "success");
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
    }, 500);
}

function updateBetsList() {
    const betsList = document.getElementById('bets-list');
    const betTotal = document.getElementById('bet-total');
    betsList.innerHTML = '';
    if (activeBets.length === 0) {
        betsList.innerHTML = '<p>Pa gen okenn parye aktif.</p>';
        betTotal.textContent = '0 goud';
        const notification = document.querySelector('.total-notification');
        if (notification) notification.remove();
        return;
    }

    const groupedBets = {};
    activeBets.forEach((bet, index) => {
        const key = (bet.isLotto4 || bet.isLotto5) ? `${bet.type}_${bet.number}_${JSON.stringify(bet.options)}` : `${bet.type}_${bet.number}`;
        if (!groupedBets[key]) groupedBets[key] = { bet, count: 1, totalAmount: bet.amount, indexes: [index] };
        else { groupedBets[key].count++; groupedBets[key].totalAmount += bet.amount; groupedBets[key].indexes.push(index); }
    });

    for (const key in groupedBets) {
        const group = groupedBets[key];
        const bet = group.bet;
        const betItem = document.createElement('div');
        betItem.className = 'bet-item';
        if (bet.isGroup) {
            betItem.innerHTML = `<div class="bet-details"><strong>${bet.name}</strong><br>${bet.number} (${bet.details.length} parye)</div><div class="bet-amount">${group.totalAmount} goud<span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span></div>`;
        } else if (bet.isLotto4 || bet.isLotto5) {
            let optionsText = '';
            if (bet.isLotto4) {
                const opts = [];
                if (bet.options.option1) opts.push('Opsyon 1');
                if (bet.options.option2) opts.push('Opsyon 2');
                if (bet.options.option3) opts.push('Opsyon 3');
                optionsText = opts.join(', ');
            } else if (bet.isLotto5) {
                const opts = [];
                if (bet.options.option1) opts.push('Opsyon 1');
                if (bet.options.option2) opts.push('Opsyon 2');
                if (bet.options.option3) opts.push('Opsyon 3');
                optionsText = opts.join(', ');
            }
            betItem.innerHTML = `<div class="bet-details"><strong>${bet.name}</strong><br>${bet.number}<br><small style="color:#7f8c8d;">${optionsText}</small></div><div class="bet-amount">${group.totalAmount} goud<span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span></div>`;
        } else {
            betItem.innerHTML = `<div class="bet-details"><strong>${bet.name}</strong><br>${bet.number}</div><div class="bet-amount">${group.totalAmount} goud<span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span></div>`;
        }
        betsList.appendChild(betItem);
        const removeBtn = betItem.querySelector('.bet-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                const indexes = this.getAttribute('data-indexes').split(',').map(Number);
                indexes.sort((a,b) => b-a).forEach(idx => activeBets.splice(idx, 1));
                updateBetsList();
            });
        }
    }

    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    betTotal.textContent = `${total} goud`;
    updateNormalBetTotalNotification();
}

function updateNormalBetTotalNotification() {
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    if (total > 0) showTotalNotification(total, 'normal');
}

function showTotalNotification(totalAmount, type = 'normal') {
    const container = document.getElementById('total-notification-container');
    const old = document.querySelector('.total-notification');
    if (old) old.remove();
    const notification = document.createElement('div');
    notification.className = 'total-notification';
    notification.innerHTML = `<i class="fas fa-calculator"></i><span>Total ${type === 'normal' ? 'Normal' : 'Multi-Tirages'}:</span><span class="total-amount">${totalAmount} G</span>`;
    container.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function submitBets() {
    if (activeBets.length === 0) { showNotification("Pa gen okenn parye pou soumèt", "warning"); return; }
    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = drawsData[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab soumèt parye 5 minit avan.`, "error");
        return;
    }
    showNotification(`${activeBets.length} parye soumèt avèk siksè!`, "success");
    saveBetsToHistory();
    activeBets = [];
    updateBetsList();
    closeBettingScreen();
}

async function saveBetsToHistory() {
    try {
        const record = { id: Date.now(), date: new Date().toLocaleString(), draw: currentDraw, drawTime: currentDrawTime, bets: [...activeBets], total: activeBets.reduce((sum, bet) => sum + bet.amount, 0) };
        await apiCall(APP_CONFIG.history, 'POST', record);
    } catch (error) {
        console.error("Erreur sauvegarde historique:", error);
    }
}

function closeBettingScreen() {
    const bettingScreen = document.getElementById('betting-screen');
    bettingScreen.classList.remove('slide-in');
    bettingScreen.classList.add('slide-out');
    setTimeout(() => {
        bettingScreen.style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    }, 300);
}

function checkConnectionBeforeSavePrint() {
    const connectionCheck = document.getElementById('connection-check');
    connectionCheck.style.display = 'flex';
    const internetStatus = document.getElementById('internet-status');
    const internetText = document.getElementById('internet-text');
    if (navigator.onLine) {
        internetStatus.className = 'status-indicator connected';
        internetText.textContent = 'Entènèt: Konekte';
    } else {
        internetStatus.className = 'status-indicator disconnected';
        internetText.textContent = 'Entènèt: Pa konekte';
        document.getElementById('connection-message').textContent = 'Pa gen koneksyon entènèt. Fiche a pa kapab enprime.';
        return;
    }
    setTimeout(() => {
        connectionCheck.style.display = 'none';
        saveAndPrintTicket();
    }, 1500);
}

function checkConnectionBeforePrint() {
    const connectionCheck = document.getElementById('connection-check');
    connectionCheck.style.display = 'flex';
    document.getElementById('connection-message').textContent = 'Koneksyon entènèt ok. Wap kontinye...';
    setTimeout(() => {
        connectionCheck.style.display = 'none';
        printTicket();
    }, 1000);
}

function retryConnectionCheck() {
    if (document.getElementById('save-print-ticket').disabled) checkConnectionBeforeSavePrint();
    else checkConnectionBeforePrint();
}

function cancelPrint() {
    document.getElementById('connection-check').style.display = 'none';
}

function groupBetsByType(bets) {
    const grouped = {};
    bets.forEach(bet => {
        if (!grouped[bet.name]) grouped[bet.name] = [];
        const existing = grouped[bet.name].find(b => b.number === bet.number);
        if (existing && bet.type === 'boulpe') existing.amount += bet.amount;
        else grouped[bet.name].push({...bet});
    });
    return grouped;
}

function updateWinningTicketsScreen() {
    const winningTicketsList = document.getElementById('winning-tickets-list');
    winningTicketsList.innerHTML = '';
    if (winningTickets.length === 0) {
        winningTicketsList.innerHTML = '<p>Pa gen fiche gagnant pou montre.</p>';
        return;
    }
    winningTickets.forEach(ticket => {
        const item = document.createElement('div');
        item.className = 'history-item winning-ticket';
        let betsHTML = '';
        ticket.winningBets.forEach(winBet => {
            betsHTML += `<div class="history-bet"><span>${winBet.name}: ${winBet.number}</span><span style="color:var(--success-color);font-weight:bold;">+${winBet.winAmount} G (${winBet.winType})</span></div>`;
        });
        item.innerHTML = `<div class="history-header"><span class="history-draw">Fiche #${String(ticket.number).padStart(6,'0')}</span><span class="history-date">${new Date(ticket.date).toLocaleString()}</span></div><div class="history-bets">${betsHTML}</div><div class="history-total"><span>Total Gains:</span><span style="color:var(--success-color);font-weight:bold;">${ticket.totalWinnings} G</span></div>`;
        winningTicketsList.appendChild(item);
    });
}

function searchHistory() {
    const term = document.getElementById('search-history').value.toLowerCase();
    document.querySelectorAll('#history-list .history-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(term) ? 'block' : 'none';
    });
}

function searchWinningTickets() {
    const term = document.getElementById('search-winning-tickets').value.toLowerCase();
    document.querySelectorAll('#winning-tickets-list .history-item').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(term) ? 'block' : 'none';
    });
}

function updateHistoryScreen() {
    const reportsContainer = document.getElementById('reports-container');
    const historyList = document.getElementById('history-list');
    reportsContainer.innerHTML = '';
    const generalBtn = document.createElement('button');
    generalBtn.className = 'report-btn general';
    generalBtn.textContent = 'Rapò Jeneral';
    generalBtn.addEventListener('click', generateGeneralReport);
    reportsContainer.appendChild(generalBtn);
    for (const [drawId, draw] of Object.entries(drawsData)) {
        const morningBtn = document.createElement('button');
        morningBtn.className = 'report-btn';
        morningBtn.textContent = `${draw.name} Midi`;
        morningBtn.addEventListener('click', () => generateDrawReport(drawId, 'morning'));
        reportsContainer.appendChild(morningBtn);
        const eveningBtn = document.createElement('button');
        eveningBtn.className = 'report-btn';
        eveningBtn.textContent = `${draw.name} Swè`;
        eveningBtn.addEventListener('click', () => generateDrawReport(drawId, 'evening'));
        reportsContainer.appendChild(eveningBtn);
    }
    historyList.innerHTML = '';
    if (savedTickets.length === 0) { historyList.innerHTML = '<p>Pa gen fiche ki sove.</p>'; return; }
    const sorted = [...savedTickets].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(ticket => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const ticketDate = new Date(ticket.date);
        const canEdit = (new Date() - ticketDate) <= FIVE_MINUTES;
        const grouped = groupBetsByType(ticket.bets);
        let betsHTML = '';
        for (const [type, bets] of Object.entries(grouped)) {
            betsHTML += `<div style="margin-bottom:8px;"><strong>${type}:</strong> `;
            const betStrings = bets.map(b => {
                let info = b.number;
                if (b.isLotto4 || b.isLotto5) {
                    const opts = [];
                    if (b.options?.option1) opts.push('O1');
                    if (b.options?.option2) opts.push('O2');
                    if (b.options?.option3) opts.push('O3');
                    if (opts.length) info += ` (${opts.join(',')})`;
                }
                return `${info} (${b.amount} G)`;
            });
            betsHTML += betStrings.join(', ') + '</div>';
        }
        item.innerHTML = `
            <div class="history-header"><span class="history-draw">${drawsData[ticket.draw].name} (${ticket.drawTime==='morning'?'Maten':'Swè'})</span><span class="history-date">${ticketDate.toLocaleString()}</span></div>
            <div class="history-bets">${betsHTML}</div>
            <div class="history-total"><span>Total:</span><span>${ticket.total} G</span></div>
            ${canEdit ? `<div style="display:flex;gap:10px;margin-top:10px;"><button class="edit-btn" onclick="loadTicketForEdit('${ticket.id}')"><i class="fas fa-edit"></i> Modifye</button><button class="delete-btn" onclick="deleteTicket('${ticket.id}')"><i class="fas fa-trash"></i> Efase</button></div>` : ''}
        `;
        historyList.appendChild(item);
    });
}

function updateTicketManagementScreen() {
    const ticketList = document.getElementById('ticket-management-list');
    if (savedTickets.length === 0) {
        ticketList.innerHTML = `<div style="text-align:center;padding:40px;color:#7f8c8d;"><i class="fas fa-file-invoice" style="font-size:3rem;margin-bottom:15px;"></i><p>Pa gen fiche ki sove.</p></div>`;
        return;
    }
    let html = '';
    const sorted = [...savedTickets].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(ticket => {
        const ticketDate = new Date(ticket.date);
        const canEdit = (new Date() - ticketDate) <= FIVE_MINUTES;
        const grouped = groupBetsByType(ticket.bets);
        let betsHTML = '';
        for (const [type, bets] of Object.entries(grouped)) {
            const total = bets.reduce((s,b) => s + b.amount, 0);
            betsHTML += `<div style="margin-bottom:5px;"><strong>${type}:</strong> ${bets.length} parye (${total} G)</div>`;
        }
        html += `
            <div class="ticket-management">
                <div class="ticket-management-header"><div><strong>Fiche #${String(ticket.number).padStart(6,'0')}</strong>${ticket.draw?`<div style="font-size:0.9rem;color:#7f8c8d;">${drawsData[ticket.draw]?.name||'Tiraj'} (${ticket.drawTime==='morning'?'Maten':'Swè'})</div>`:''}</div><div style="text-align:right;"><div>${ticketDate.toLocaleString()}</div>${ticket.total?`<div style="font-weight:bold;">${ticket.total} G</div>`:''}</div></div>
                <div class="ticket-details">${betsHTML}${ticket.agent_name?`<div><strong>Ajan:</strong> ${ticket.agent_name}</div>`:''}</div>
                ${canEdit ? `<div style="display:flex;gap:10px;margin-top:10px;"><button class="edit-btn" onclick="loadTicketForEdit('${ticket.id}')"><i class="fas fa-edit"></i> Modifye</button><button class="delete-btn" onclick="deleteTicket('${ticket.id}')"><i class="fas fa-trash"></i> Efase</button></div>` : `<div style="margin-top:10px;color:#7f8c8d;font-size:0.9rem;"><i class="fas fa-info-circle"></i> Fiche sa pa ka modifye ankò (5 minit deja pase)</div>`}
            </div>
        `;
    });
    ticketList.innerHTML = html;
}

window.loadTicketForEdit = function(ticketId) {
    const ticket = savedTickets.find(t => t.id === ticketId);
    if (!ticket) { showNotification("Fiche pa jwenn", "error"); return; }
    if (new Date() - new Date(ticket.date) > FIVE_MINUTES) { showNotification("Fiche sa pa ka modifye ankò. 5 minit deja pase.", "warning"); return; }
    if (!confirm(`Èske ou vreman vle modifye fiche #${String(ticket.number).padStart(6,'0')}? Fiche sa pral efase epi parye yo pral mete nan panier aktif.`)) return;
    activeBets = [...ticket.bets];
    currentDraw = ticket.draw;
    currentDrawTime = ticket.drawTime;
    const savedIdx = savedTickets.findIndex(t => t.id === ticketId);
    if (savedIdx !== -1) savedTickets.splice(savedIdx, 1);
    updateBetsList();
    updateTicketManagementScreen();
    openBettingScreen(ticket.draw, ticket.drawTime);
    showNotification(`Fiche #${String(ticket.number).padStart(6,'0')} chaje pou modification`, "success");
};

window.deleteTicket = function(ticketId) {
    const ticket = savedTickets.find(t => t.id === ticketId);
    if (!ticket) { showNotification("Fiche pa jwenn", "error"); return; }
    if (new Date() - new Date(ticket.date) > FIVE_MINUTES) { showNotification("Fiche sa pa ka efase ankò. 5 minit deja pase.", "warning"); return; }
    if (!confirm(`Èske ou vreman vle efase fiche #${String(ticket.number).padStart(6,'0')}? Aksyon sa a pa ka anile.`)) return;
    const savedIdx = savedTickets.findIndex(t => t.id === ticketId);
    if (savedIdx !== -1) savedTickets.splice(savedIdx, 1);
    updateTicketManagementScreen();
    showNotification(`Fiche #${String(ticket.number).padStart(6,'0')} efase avèk siksè`, "success");
};

function searchTicket() {
    const term = document.getElementById('search-ticket-number').value.toLowerCase();
    document.querySelectorAll('#ticket-management-list .ticket-management').forEach(item => {
        item.style.display = term ? (item.textContent.toLowerCase().includes(term) ? 'block' : 'none') : 'block';
    });
}

function showAllTickets() {
    document.getElementById('search-ticket-number').value = '';
    updateTicketManagementScreen();
}

function generateEndOfDrawReport() {
    const reportScreen = document.getElementById('report-screen');
    const reportContent = document.getElementById('report-content');
    const totalBets = savedTickets.length;
    const totalAmount = savedTickets.reduce((sum, t) => sum + t.total, 0);
    reportContent.innerHTML = `
        <div class="report-header"><h3>${companyInfo.reportTitle}</h3><p>Rapò Fin Tiraj</p><p>${new Date().toLocaleString()}</p></div>
        <div class="report-details"><div class="report-row"><span>Nimewo fiche:</span><span>${totalBets}</span></div><div class="report-row"><span>Montan total:</span><span>${totalAmount} G</span></div><div class="report-row total"><span>TOTAL GENERAL:</span><span>${totalAmount} G</span></div></div>
        <p style="margin-top:20px;text-align:center;"><strong>Tel:</strong> ${companyInfo.reportPhone}<br><strong>Adrès:</strong> ${companyInfo.address}</p>
    `;
    document.querySelector('.container').style.display = 'none';
    reportScreen.style.display = 'block';
}

function generateGeneralReport() {
    document.getElementById('report-results').innerHTML = `
        <div class="report-results"><h3>Rapò Jeneral</h3><div class="report-item"><span>Total fiche:</span><span>${savedTickets.length}</span></div><div class="report-item"><span>Total montan:</span><span>${savedTickets.reduce((sum, t) => sum + t.total, 0)} G</span></div></div>
    `;
}

function generateDrawReport(drawId, time) {
    const drawTickets = savedTickets.filter(t => t.draw === drawId && t.drawTime === time);
    document.getElementById('report-results').innerHTML = `
        <div class="report-results"><h3>Rapò ${drawsData[drawId].name} (${time==='morning'?'Maten':'Swè'})</h3><div class="report-item"><span>Nimewo fiche:</span><span>${drawTickets.length}</span></div><div class="report-item"><span>Total montan:</span><span>${drawTickets.reduce((sum, t) => sum + t.total, 0)} G</span></div></div>
    `;
}

// ==========================================
// Initialisation du panneau multi-tirages
// ==========================================
function initMultiDrawPanel() {
    const multiDrawOptions = document.getElementById('multi-draw-options');
    const multiGameSelect = document.getElementById('multi-game-select');
    multiDrawOptions.innerHTML = '';
    multiGameSelect.innerHTML = '';

    Object.keys(drawsData).forEach(drawId => {
        const option = document.createElement('div');
        option.className = 'multi-draw-option';
        option.setAttribute('data-draw', drawId);
        option.textContent = drawsData[drawId].name;
        option.addEventListener('click', function() {
            this.classList.toggle('selected');
            const d = this.getAttribute('data-draw');
            if (this.classList.contains('selected')) selectedMultiDraws.add(d);
            else selectedMultiDraws.delete(d);
        });
        multiDrawOptions.appendChild(option);
    });

    const games = [
        { id: 'borlette', name: 'BORLETTE' },
        { id: 'boulpe', name: 'BOUL PE' },
        { id: 'lotto3', name: 'LOTO 3' },
        { id: 'lotto4', name: 'LOTO 4' },
        { id: 'lotto5', name: 'LOTO 5' },
        { id: 'grap', name: 'GRAP' },
        { id: 'marriage', name: 'MARYAJ' }
    ];
    games.forEach(game => {
        const option = document.createElement('div');
        option.className = 'multi-game-option';
        if (game.id === 'borlette') option.classList.add('selected');
        option.setAttribute('data-game', game.id);
        option.textContent = game.name;
        option.addEventListener('click', function() {
            document.querySelectorAll('.multi-game-option').forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            selectedMultiGame = this.getAttribute('data-game');
            updateMultiGameForm(selectedMultiGame);
        });
        multiGameSelect.appendChild(option);
    });
    updateMultiGameForm('borlette');
}

function updateMultiGameForm(gameType) {
    const numberInputs = document.getElementById('multi-number-inputs');
    let html = '';
    switch(gameType) {
        case 'borlette':
        case 'boulpe':
            html = `<label for="multi-draw-number">Nimewo 2 chif</label><input type="text" id="multi-draw-number" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">`;
            break;
        case 'lotto3':
        case 'grap':
            html = `<label for="multi-draw-number">Nimewo 3 chif</label><input type="text" id="multi-draw-number" placeholder="000" maxlength="3" pattern="[0-9]{3}" class="auto-focus-input">`;
            break;
        case 'marriage':
            html = `<label>2 Nimewo pou maryaj</label><div class="number-inputs"><input type="text" id="multi-draw-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input"><input type="text" id="multi-draw-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input"></div>`;
            break;
        case 'lotto4':
            html = `<label>4 Chif (lot 1+2 accumulate) - 3 opsyon</label><div class="number-inputs"><input type="text" id="multi-draw-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input"><input type="text" id="multi-draw-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input"></div>`;
            break;
        case 'lotto5':
            html = `<label>5 Chif (lot 1+2+3 accumulate) - 3 opsyon</label><div class="number-inputs"><input type="text" id="multi-draw-number1" placeholder="000" maxlength="3" pattern="[0-9]{3}" class="auto-focus-input"><input type="text" id="multi-draw-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input"></div>`;
            break;
    }
    numberInputs.innerHTML = html;
    setupAutoFocusInputs();
}

function setupAutoFocusInputs() {
    document.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('input', function(e) {
            const max = parseInt(this.getAttribute('maxlength'));
            if (max && this.value.length >= max) {
                const all = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
                const idx = all.indexOf(this);
                if (idx < all.length - 1) all[idx+1].focus();
            }
        });
        input.addEventListener('keydown', function(e) {
            const all = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
            const idx = all.indexOf(this);
            if (e.key === 'ArrowRight' && idx < all.length-1) { e.preventDefault(); all[idx+1].focus(); }
            else if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); all[idx-1].focus(); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (idx < all.length-1) all[idx+1].focus();
                else document.getElementById('add-bet')?.click();
            }
        });
    });
}

function toggleMultiDrawPanel() {
    const content = document.getElementById('multi-draw-content');
    const toggleBtn = document.getElementById('multi-draw-toggle');
    content.classList.toggle('expanded');
    toggleBtn.innerHTML = content.classList.contains('expanded') ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-down"></i>';
}

// ==========================================
// Démarrage
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Document chargé, initialisation...");
    if (!await checkAuth()) return;
    updateCurrentTime();
    await loadDataFromAPI();  // Charge tirages, tickets, résultats, etc.
    setupConnectionDetection();
    updateLogoDisplay();

    // Écouteurs d'événements pour les tirages (générés dynamiquement)
    document.querySelectorAll('.draw-card').forEach(card => {
        card.addEventListener('click', function() {
            const drawId = this.getAttribute('data-draw');
            if (!checkDrawBeforeOpening(drawId, 'morning')) return;
            openBettingScreen(drawId, 'morning');
        });
    });

    document.querySelectorAll('.draw-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.draw-card');
            const drawId = card.getAttribute('data-draw');
            const time = this.getAttribute('data-time');
            if (!checkDrawBeforeOpening(drawId, time)) return;
            card.querySelectorAll('.draw-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            openBettingScreen(drawId, time);
        });
    });

    document.getElementById('back-button').addEventListener('click', closeBettingScreen);
    document.getElementById('confirm-bet-top').addEventListener('click', submitBets);
    document.getElementById('save-print-ticket').addEventListener('click', saveAndPrintTicket);
    document.getElementById('save-ticket-only').addEventListener('click', saveTicket);
    document.getElementById('print-ticket-only').addEventListener('click', printTicket);
    document.getElementById('save-print-multi-ticket').addEventListener('click', saveAndPrintMultiDrawTicket);
    document.getElementById('view-current-multi-ticket').addEventListener('click', viewCurrentMultiDrawTicket);
    document.getElementById('open-multi-tickets').addEventListener('click', openMultiTicketsScreen);
    document.getElementById('back-from-multi-tickets').addEventListener('click', () => {
        document.getElementById('multi-tickets-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() { showScreen(this.getAttribute('data-screen')); });
    });

    document.querySelectorAll('.back-button').forEach(btn => {
        btn.addEventListener('click', function() { showScreen(this.getAttribute('data-screen') || 'home'); });
    });

    document.getElementById('back-from-report').addEventListener('click', () => {
        document.getElementById('report-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });

    document.getElementById('back-from-results').addEventListener('click', () => {
        document.getElementById('results-check-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });

    document.getElementById('retry-connection').addEventListener('click', retryConnectionCheck);
    document.getElementById('cancel-print').addEventListener('click', cancelPrint);
    document.getElementById('generate-report-btn').addEventListener('click', generateEndOfDrawReport);
    document.getElementById('open-results-check').addEventListener('click', openResultsCheckScreen);
    document.getElementById('check-winners-btn').addEventListener('click', checkWinningTickets);
    document.getElementById('multi-draw-toggle').addEventListener('click', toggleMultiDrawPanel);
    document.getElementById('add-to-multi-draw').addEventListener('click', addToMultiDrawTicket);

    initMultiDrawPanel();

    document.getElementById('search-ticket-btn').addEventListener('click', searchTicket);
    document.getElementById('show-all-tickets').addEventListener('click', showAllTickets);
    document.getElementById('search-history-btn').addEventListener('click', searchHistory);
    document.getElementById('search-winning-btn').addEventListener('click', searchWinningTickets);

    setInterval(updateCurrentTime, 60000);
    setInterval(updatePendingBadge, 30000);
    setInterval(loadResultsFromAPI, 300000); // Rafraîchir résultats toutes les 5 min

    console.log("✅ Initialisation terminée");
});
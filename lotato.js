// Configuration de base avec APP_CONFIG
const API_BASE_URL = 'https://lotatonova-fv0b.onrender.com';
// Configuration API Backend
const APP_CONFIG = {
    health: `${API_BASE_URL}/api/health`,
    login: `${API_BASE_URL}/api/auth/login`,
    // Endpoints pour les résultats
    results: `${API_BASE_URL}/api/results`,
    checkWinners: `${API_BASE_URL}/api/check-winners`,
    // Endpoints pour les tickets
    tickets: `${API_BASE_URL}/api/tickets`,
    ticketsPending: `${API_BASE_URL}/api/tickets/pending`,
    winningTickets: `${API_BASE_URL}/api/tickets/winning`,
    history: `${API_BASE_URL}/api/history`,
    multiDrawTickets: `${API_BASE_URL}/api/tickets/multi-draw`,
    companyInfo: `${API_BASE_URL}/api/company-info`,
    logo: `${API_BASE_URL}/api/logo`,
    authCheck: `${API_BASE_URL}/api/auth/check`
};

const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes en millisecondes

// Base de données simulée pour les résultats (sera remplacée par l'API)
let resultsDatabase = {
    'miami': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '123', // 3 chiffres
            lot2: '45',  // 2 chiffres
            lot3: '34'   // 2 chiffres
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '892',
            lot2: '34',
            lot3: '56'
        }
    },
    'georgia': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '327',
            lot2: '45',
            lot3: '89'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '567',
            lot2: '12',
            lot3: '34'
        }
    },
    'newyork': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '892',
            lot2: '34',
            lot3: '56'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '123',
            lot2: '45',
            lot3: '67'
        }
    },
    'texas': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '567',
            lot2: '89',
            lot3: '01'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '234',
            lot2: '56',
            lot3: '78'
        }
    },
    'tunisia': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '234',
            lot2: '56',
            lot3: '78'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '345',
            lot2: '67',
            lot3: '89'
        }
    }
};

// Données des tirages avec heures spécifiques pour le blocage
const draws = {
    miami: {
        name: "Miami (Florida)",
        times: {
            morning: { time: "1:30 PM", hour: 13, minute: 30 },
            evening: { time: "9:50 PM", hour: 21, minute: 50 }
        },
        date: "Sam, 29 Nov",
        countdown: "18 h 30 min"
    },
    georgia: {
        name: "Georgia",
        times: {
            morning: { time: "12:30 PM", hour: 12, minute: 30 },
            evening: { time: "7:00 PM", hour: 19, minute: 0 }
        },
        date: "Sam, 29 Nov",
        countdown: "17 h 29 min"
    },
    newyork: {
        name: "New York",
        times: {
            morning: { time: "2:30 PM", hour: 14, minute: 30 },
            evening: { time: "8:00 PM", hour: 20, minute: 0 }
        },
        date: "Sam, 29 Nov",
        countdown: "19 h 30 min"
    },
    texas: {
        name: "Texas",
        times: {
            morning: { time: "12:00 PM", hour: 12, minute: 0 },
            evening: { time: "6:00 PM", hour: 18, minute: 0 }
        },
        date: "Sam, 29 Nov",
        countdown: "18 h 27 min"
    },
    tunisia: {
        name: "Tunisie",
        times: {
            morning: { time: "10:30 AM", hour: 10, minute: 30 },
            evening: { time: "2:00 PM", hour: 14, minute: 0 }
        },
        date: "Sam, 29 Nov",
        countdown: "8 h 30 min"
    }
};

// Types de paris disponibles avec multiplicateurs
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
        multiplier: 60, // 1er lot ×60
        multiplier2: 20, // 2e lot ×20
        multiplier3: 10, // 3e lot ×10
        icon: "fas fa-dice",
        description: "2 chif (1er lot ×60, 2e ×20, 3e ×10)",
        category: "borlette"
    },
    boulpe: {
        name: "BOUL PE",
        multiplier: 60, // 1er lot ×60
        multiplier2: 20, // 2e lot ×20
        multiplier3: 10, // 3e lot ×10
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
    // Types de paris automatiques
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

// Variables globales
let currentDraw = null;
let currentDrawTime = null;
let activeBets = [];
let ticketNumber = 100001; // Valeur initiale
let savedTickets = [];
let currentAdmin = null;
let pendingSyncTickets = [];
let isOnline = navigator.onLine;
let companyLogo = "logo-borlette.jpg";
let currentBetCategory = null;
let restrictedBalls = [];
let gameRestrictions = {};
let selectedMultiDraws = new Set();
let selectedMultiGame = 'borlette';
let selectedBalls = []; // Stocke les boules sélectionnées pour les jeux automatiques

// Variables pour les fiches multi-tirages
let currentMultiDrawTicket = {
    id: Date.now().toString(),
    bets: [], // Liste des paris multi-tirages
    totalAmount: 0,
    draws: new Set(), // Tirages sélectionnés
    createdAt: new Date().toISOString()
};

let multiDrawTickets = []; // Liste des fiches multi-tirages sauvegardées

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
let currentUser = null; // AJOUT: Stocker les infos de l'utilisateur connecté

// ==========================================
// 1. Fonction de communication API (Corrigée)
// ==========================================
async function apiCall(url, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    // CORRECTION: Utiliser 'x-auth-token' comme attendu par server.js
    if (authToken) {
        headers['x-auth-token'] = authToken;
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        if (response.status === 401) {
            // Token invalide ou expiré
            handleLogout();
            return null;
        }

        // Gérer les réponses vides ou non-JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return { success: response.ok };
        }
    } catch (error) {
        console.error('Erreur API:', error);
        // Si erreur réseau, retourner null
        return null;
    }
}

// ==========================================
// Vérifier si un tirage est bloqué
// ==========================================
function isDrawBlocked(drawId, drawTime) {
    const draw = draws[drawId];
    if (!draw || !draw.times[drawTime]) {
        return true; // Par sécurité, bloquer si non trouvé
    }

    const now = new Date();
    const drawTimeInfo = draw.times[drawTime];
    
    // Créer la date du tirage pour aujourd'hui
    const drawDate = new Date(now);
    drawDate.setHours(drawTimeInfo.hour, drawTimeInfo.minute, 0, 0);
    
    // Calculer 5 minutes avant le tirage
    const blockTime = new Date(drawDate.getTime() - (5 * 60 * 1000));
    
    // Si nous sommes entre le blocage (5 min avant) et après le tirage, bloquer
    if (now >= blockTime) {
        return true;
    }
    
    return false;
}

// ==========================================
// Vérifier le blocage avant d'ouvrir l'écran de pari
// ==========================================
function checkDrawBeforeOpening(drawId, time) {
    if (isDrawBlocked(drawId, time)) {
        const drawTime = draws[drawId].times[time].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab fè parye 5 minit avan.`, "error");
        return false;
    }
    return true;
}

// ==========================================
// CORRECTION 1: Vérifier l'authentification et charger les données de l'utilisateur
// ==========================================
async function checkAuth() {
    console.log("Vérification authentification...");
    
    // Vérifier d'abord si le token est dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    // Vérifier ensuite dans le localStorage
    const tokenFromStorage = localStorage.getItem('nova_token');
    
    // Priorité: token URL > token storage
    const token = tokenFromUrl || tokenFromStorage;
    
    if (!token) {
        console.log("Aucun token trouvé, redirection vers index.html");
        // Rediriger vers la page de connexion
        window.location.href = '/index.html';
        return false;
    }
    
    authToken = token;
    
    // Stocker le token dans localStorage s'il vient de l'URL
    if (tokenFromUrl && !tokenFromStorage) {
        localStorage.setItem('nova_token', tokenFromUrl);
        // Nettoyer l'URL du token
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
    
    // Charger les informations de l'utilisateur depuis l'API
    try {
        console.log("Vérification du token via API...");
        const response = await apiCall(APP_CONFIG.authCheck);
        console.log("Réponse authCheck:", response);
        
        if (response && response.success && response.admin) {
            currentUser = response.admin;
            console.log('✅ Utilisateur connecté:', currentUser);
            
            // Masquer l'écran de connexion intégré
            document.getElementById('login-screen').style.display = 'none';
            
            // Afficher l'application principale
            showMainApp();
            
            // Mettre à jour l'affichage du nom d'utilisateur
            updateUserDisplay();
            
            return true;
        } else {
            console.log('Token invalide ou réponse incorrecte');
            // Token invalide
            handleLogout();
            return false;
        }
    } catch (error) {
        console.error('Erreur vérification authentification:', error);
        handleLogout();
        return false;
    }
}

// Mettre à jour l'affichage de l'utilisateur
function updateUserDisplay() {
    if (currentUser) {
        const userElements = document.querySelectorAll('.user-name-display');
        userElements.forEach(element => {
            element.textContent = currentUser.name || currentUser.username;
        });
    }
}

// Gérer la déconnexion
function handleLogout() {
    console.log("Déconnexion...");
    localStorage.removeItem('nova_token');
    authToken = null;
    currentUser = null;
    window.location.href = '/index.html';
}

// Charger les données depuis l'API
async function loadDataFromAPI() {
    try {
        console.log("Chargement des données depuis l'API...");
        
        // Vérifier d'abord que l'utilisateur est connecté
        if (!currentUser) {
            if (!await checkAuth()) {
                return;
            }
        }
        
        // Charger les tickets
        const ticketsData = await apiCall(APP_CONFIG.tickets);
        console.log("Données tickets reçues:", ticketsData);
        
        if (ticketsData && ticketsData.success) {
            savedTickets = ticketsData.tickets || [];
            ticketNumber = ticketsData.nextTicketNumber || ticketNumber;
            console.log(`${savedTickets.length} tickets chargés, prochain numéro: ${ticketNumber}`);
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
        
        // Charger les informations de l'entreprise
        const companyData = await apiCall(APP_CONFIG.companyInfo);
        if (companyData && companyData.success) {
            companyInfo = companyData;
        }
        
        // Charger le logo
        const logoData = await apiCall(APP_CONFIG.logo);
        if (logoData && logoData.success && logoData.logoUrl) {
            companyLogo = logoData.logoUrl;
        }
        
        console.log('✅ Données chargées depuis l\'API:', { 
            tickets: savedTickets.length, 
            ticketNumber, 
            winning: winningTickets.length,
            multiDraw: multiDrawTickets.length,
            user: currentUser ? currentUser.name : 'Non connecté'
        });
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données:', error);
        showNotification("Erreur de chargement des données", "error");
    }
}

// ==========================================
// 2. CORRECTION CRITIQUE: Fonction saveTicketAPI()
// ==========================================
async function saveTicketAPI(ticketData) {
    try {
        console.log("Envoi du ticket à l'API:", ticketData);
        
        // Format des données attendu par le serveur
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
        
        console.log("Données envoyées au serveur:", requestData);
        
        const response = await apiCall(APP_CONFIG.tickets, 'POST', requestData);
        console.log("Réponse du serveur:", response);
        return response;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du ticket:', error);
        throw error;
    }
}

// ==========================================
// 3. CORRECTION: Sauvegarder un ticket avec les informations de l'utilisateur
// ==========================================
async function saveTicket() {
    console.log("Sauvegarder fiche via API");
    
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou sove nan fiche a", "warning");
        return;
    }
    
    // Vérifier que le tirage n'est pas bloqué
    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = draws[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab sove fiche 5 minit avan.`, "error");
        return;
    }
    
    // Vérifier que l'utilisateur est connecté
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
        // Sauvegarder via API
        const response = await saveTicketAPI(ticket);
        
        if (response && response.success) {
            console.log("✅ Ticket sauvegardé avec succès:", response.ticket);
            
            // IMPORTANT: Utiliser le ticket retourné par le serveur, pas le ticket local
            // Le serveur génère un ID unique et peut ajuster le numéro
            const savedTicket = {
                ...response.ticket,
                id: response.ticket.id || Date.now().toString()
            };
            
            // Ajouter aux tickets sauvegardés localement
            savedTickets.push(savedTicket);
            
            // Mettre à jour le numéro de ticket pour le prochain
            ticketNumber = response.ticket.number + 1;
            
            showNotification("Fiche sove avèk siksè!", "success");
            
            // Réinitialiser les paris actifs
            activeBets = [];
            updateBetsList();
            
            return savedTicket;
        } else {
            const errorMsg = response?.error || "Erreur inconnue";
            console.error('❌ Erreur sauvegarde:', errorMsg);
            showNotification(`Erreur lors de la sauvegarde du ticket: ${errorMsg}`, "error");
            return null;
        }
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du ticket:', error);
        showNotification("Erreur lors de la sauvegarde du ticket", "error");
        throw error;
    }
}

// ==========================================
// 4. CORRECTION: Fonctions pour les fiches multi-tirages
// ==========================================
async function saveMultiDrawTicketAPI(ticket) {
    try {
        console.log("Envoi fiche multi-tirages à l'API:", ticket);
        
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
        
        const response = await apiCall(APP_CONFIG.multiDrawTickets, 'POST', requestData);
        console.log("Réponse multi-tirages:", response);
        return response;
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la fiche multi-tirages:', error);
        throw error;
    }
}

// ==========================================
// 5. Initialisation corrigée
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Document chargé, initialisation...");
    
    // Vérifier l'authentification
    if (!await checkAuth()) {
        return;
    }
    
    // Mettre à jour l'heure
    updateCurrentTime();
    
    // Charger les données depuis l'API
    await loadDataFromAPI();
    
    // Configurer la détection de connexion
    setupConnectionDetection();
    
    // Mettre à jour l'affichage du logo
    updateLogoDisplay();
    
    // Charger les résultats depuis la base de données
    loadResultsFromDatabase();
    
    // Ajouter les écouteurs d'événements pour les tirages
    document.querySelectorAll('.draw-card').forEach(card => {
        card.addEventListener('click', function() {
            console.log("Carte de tiraj cliquée:", this.getAttribute('data-draw'));
            const drawId = this.getAttribute('data-draw');
            
            // Vérifier si le tirage du matin est bloqué
            if (!checkDrawBeforeOpening(drawId, 'morning')) {
                return;
            }
            
            openBettingScreen(drawId, 'morning');
        });
    });
    
    // Ajouter les écouteurs d'événements pour les boutons de tirage
    document.querySelectorAll('.draw-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.draw-card');
            const drawId = card.getAttribute('data-draw');
            const time = this.getAttribute('data-time');
            
            console.log("Bouton tiraj cliqué:", drawId, time);
            
            // Vérifier si le tirage est bloqué
            if (!checkDrawBeforeOpening(drawId, time)) {
                return;
            }
            
            card.querySelectorAll('.draw-btn').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            
            openBettingScreen(drawId, time);
        });
    });
    
    // Bouton de retour
    document.getElementById('back-button').addEventListener('click', closeBettingScreen);
    
    // Bouton de confirmation en haut
    document.getElementById('confirm-bet-top').addEventListener('click', submitBets);
    
    // Boutons de fiche
    document.getElementById('save-print-ticket').addEventListener('click', function() {
        console.log("Sauvegarder et imprimer cliqué");
        saveAndPrintTicket();
    });
    
    document.getElementById('save-ticket-only').addEventListener('click', function() {
        console.log("Sauvegarder seulement cliqué");
        saveTicket();
    });
    
    document.getElementById('print-ticket-only').addEventListener('click', function() {
        console.log("Imprimer seulement cliqué");
        printTicket();
    });
    
    // Bouton pour sauvegarder et imprimer la fiche multi-tirages
    document.getElementById('save-print-multi-ticket').addEventListener('click', function() {
        console.log("Sauvegarder et imprimer fiche multi-tirages");
        saveAndPrintMultiDrawTicket();
    });
    
    // Bouton pour voir la fiche multi-tirages actuelle
    document.getElementById('view-current-multi-ticket').addEventListener('click', function() {
        console.log("Voir fiche multi-tirages actuelle");
        viewCurrentMultiDrawTicket();
    });
    
    // Bouton pour ouvrir l'écran des fiches multi-tirages
    document.getElementById('open-multi-tickets').addEventListener('click', function() {
        console.log("Ouvrir écran fiches multi-tirages");
        openMultiTicketsScreen();
    });
    
    // Bouton de retour de l'écran multi-tirages
    document.getElementById('back-from-multi-tickets').addEventListener('click', function() {
        console.log("Retour de l'écran multi-tirages");
        document.getElementById('multi-tickets-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
            console.log("Navigation cliquée:", screen);
            showScreen(screen);
        });
    });
    
    // Boutons de retour
    document.querySelectorAll('.back-button').forEach(btn => {
        btn.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen') || 'home';
            console.log("Bouton retour cliqué vers:", screen);
            showScreen(screen);
        });
    });
    
    // Bouton retour du rapport
    document.getElementById('back-from-report').addEventListener('click', function() {
        console.log("Retour du rapport");
        document.getElementById('report-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });
    
    // Bouton retour de vérification des résultats
    document.getElementById('back-from-results').addEventListener('click', function() {
        console.log("Retour de vérification des résultats");
        document.getElementById('results-check-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });
    
    // Boutons de connexion
    document.getElementById('retry-connection').addEventListener('click', function() {
        console.log("Réessayer connexion");
        retryConnectionCheck();
    });
    
    document.getElementById('cancel-print').addEventListener('click', function() {
        console.log("Annuler impression");
        cancelPrint();
    });
    
    // Bouton pour générer le rapport
    document.getElementById('generate-report-btn').addEventListener('click', function() {
        console.log("Générer rapport");
        generateEndOfDrawReport();
    });
    
    // Bouton pour ouvrir l'écran de vérification des résultats
    document.getElementById('open-results-check').addEventListener('click', function() {
        console.log("Ouvrir vérification des résultats");
        openResultsCheckScreen();
    });
    
    // Bouton pour vérifier les fiches gagnantes
    document.getElementById('check-winners-btn').addEventListener('click', function() {
        console.log("Vérifier fiches gagnantes");
        checkWinningTickets();
    });
    
    // Multi-tirages
    document.getElementById('multi-draw-toggle').addEventListener('click', function() {
        console.log("Toggle multi-tirages");
        toggleMultiDrawPanel();
    });
    
    // Changement du bouton pour ajouter à la fiche multi-tirages
    document.getElementById('add-to-multi-draw').addEventListener('click', function() {
        console.log("Ajouter à la fiche multi-tirages");
        addToMultiDrawTicket();
    });
    
    // Initialiser le panneau multi-tirages
    initMultiDrawPanel();
    
    // Gestion des fiches - Écouteurs d'événements ajoutés
    document.getElementById('search-ticket-btn').addEventListener('click', function() {
        console.log("Rechercher fiche");
        searchTicket();
    });
    
    document.getElementById('show-all-tickets').addEventListener('click', function() {
        console.log("Afficher toutes les fiches");
        showAllTickets();
    });
    
    // Recherche historique
    document.getElementById('search-history-btn').addEventListener('click', function() {
        console.log("Rechercher historique");
        searchHistory();
    });
    
    document.getElementById('search-winning-btn').addEventListener('click', function() {
        console.log("Rechercher fiches gagnantes");
        searchWinningTickets();
    });
    
    // Actualiser périodiquement
    setInterval(updateCurrentTime, 60000);
    setInterval(updatePendingBadge, 30000);
    // Vérifier périodiquement les résultats
    setInterval(checkForNewResults, 300000); // Toutes les 5 minutes
    
    console.log("✅ Initialisation terminée");
});

// ==========================================
// 6. CORRECTION: Sauvegarder et imprimer la fiche
// ==========================================
async function saveAndPrintTicket() {
    console.log("Sauvegarder et imprimer");
    
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou sove nan fiche a", "warning");
        return;
    }
    
    // Vérifier si le tirage est bloqué
    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = draws[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab sove oswa enprime fiche 5 minit avan.`, "error");
        return;
    }
    
    const savedTicket = await saveTicket();
    
    if (savedTicket) {
        setTimeout(() => {
            printTicket(savedTicket);
        }, 100);
    }
}

// ==========================================
// 7. CORRECTION: Imprimer la fiche (utilise le ticket sauvegardé)
// ==========================================
function printTicket(ticketToPrint = null) {
    console.log("Imprimer fiche");
    
    // Utiliser le ticket passé en paramètre ou le dernier ticket sauvegardé
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
        betsHTML += `
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; margin-bottom: 5px;">${type}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 5px;">
        `;
        
        bets.forEach(bet => {
            // Pour Lotto 4 et Lotto 5, afficher les options
            let betInfo = bet.number;
            if (bet.isLotto4 || bet.isLotto5) {
                const options = [];
                if (bet.options?.option1) options.push('O1');
                if (bet.options?.option2) options.push('O2');
                if (bet.options?.option3) options.push('O3');
                if (options.length > 0) {
                    betInfo += ` (${options.join(',')})`;
                }
            }
            
            betsHTML += `
                <div style="background: #f0f0f0; padding: 5px 10px; border-radius: 4px; font-size: 0.9rem;">
                    ${betInfo}<br>
                    <strong>${bet.amount} G</strong>
                </div>
            `;
            total += bet.amount;
        });
        
        betsHTML += `
                </div>
            </div>
        `;
    }
    
    printContent.innerHTML = `
        <div style="text-align: center; padding: 20px; border: 2px solid #000; font-family: Arial, sans-serif;">
            <div style="margin-bottom: 15px;">
                <img src="${companyLogo}" alt="Logo Nova Lotto" class="ticket-logo" style="max-width: 80px; height: auto;">
            </div>
            <h2>${companyInfo.name}</h2>
            <p>Fiche Parye</p>
            <p><strong>Nimewo:</strong> #${String(ticket.number).padStart(6, '0')}</p>
            <p><strong>Dat:</strong> ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p><strong>Tiraj:</strong> ${draws[ticket.draw].name} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})</p>
            <p><strong>Ajan:</strong> ${ticket.agent_name}</p>
            <p><strong>Sous-système:</strong> ${currentUser ? (currentUser.subsystem_name || 'Non spécifié') : 'Non connecté'}</p>
            <hr>
            <div style="margin: 15px 0;">
                ${betsHTML}
            </div>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 1.1rem;">
                <span>Total:</span>
                <span>${total} goud</span>
            </div>
            <p style="margin-top: 20px;">Mèsi pou konfyans ou!</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">
                Fiche kreye: ${new Date().toLocaleString('fr-FR')}
            </p>
        </div>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Fiche ${companyInfo.name}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        @page { margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${printContent.innerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// ==========================================
// 8. CORRECTION: Afficher l'application principale
// ==========================================
function showMainApp() {
    console.log("Affichage application principale");
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('sync-status').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'block';
}

// ==========================================
// Le reste du code reste inchangé (toutes les autres fonctions)
// ==========================================

// Charger les fiches multi-tirages depuis l'API
async function loadMultiDrawTickets() {
    console.log("Chargement des fiches multi-tirages depuis l'API...");
    try {
        const response = await apiCall(APP_CONFIG.multiDrawTickets);
        if (response && response.success) {
            multiDrawTickets = response.tickets || [];
            console.log(`${multiDrawTickets.length} fiches multi-tirages chargées`);
        }
    } catch (error) {
        console.error('Erreur lors du chargement des fiches multi-tirages:', error);
        multiDrawTickets = [];
    }
}

// Ajouter un pari à la fiche multi-tirages
function addToMultiDrawTicket() {
    console.log("Ajouter à la fiche multi-tirages");
    const amount = parseInt(document.getElementById('multi-draw-amount').value);
    let number = '';
    
    // Récupérer le numéro selon le type de jeu
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
    
    console.log("Données:", { selectedMultiGame, number, amount, selectedMultiDraws: Array.from(selectedMultiDraws) });
    
    // Validation
    let isValid = true;
    let errorMessage = '';
    
    if (selectedMultiGame === 'borlette' || selectedMultiGame === 'boulpe') {
        if (!/^\d{2}$/.test(number)) {
            errorMessage = "Tanpri antre yon nimewo 2 chif valab";
            isValid = false;
        }
    } else if (selectedMultiGame === 'lotto3' || selectedMultiGame === 'grap') {
        if (!/^\d{3}$/.test(number)) {
            errorMessage = "Tanpri antre yon nimewo 3 chif valab";
            isValid = false;
        }
    } else if (selectedMultiGame === 'marriage' || selectedMultiGame === 'lotto4') {
        const num1 = number.split('*')[0];
        const num2 = number.split('*')[1];
        if (!/^\d{2}$/.test(num1) || !/^\d{2}$/.test(num2)) {
            errorMessage = "Chak nimewo dwe gen 2 chif valab";
            isValid = false;
        }
    } else if (selectedMultiGame === 'lotto5') {
        const num1 = number.split('*')[0];
        const num2 = number.split('*')[1];
        if (!/^\d{3}$/.test(num1) || !/^\d{2}$/.test(num2)) {
            errorMessage = "Premye nimewo 3 chif, dezyèm 2 chif";
            isValid = false;
        }
    }
    
    if (isNaN(amount) || amount <= 0) {
        errorMessage = "Tanpri antre yon kantite valab";
        isValid = false;
    }
    
    if (selectedMultiDraws.size === 0) {
        errorMessage = "Tanpri chwazi pou pi piti yon tiraj";
        isValid = false;
    }
    
    // Vérifier si un des tirages sélectionnés est bloqué
    for (const drawId of selectedMultiDraws) {
        // Pour multi-tirages, vérifier les deux créneaux (matin et soir)
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
    
    // Ajouter le pari à la fiche multi-tirages
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
    
    // Ajouter les tirages à la liste des tirages de la fiche
    selectedMultiDraws.forEach(drawId => {
        currentMultiDrawTicket.draws.add(drawId);
    });
    
    // Recalculer le total
    currentMultiDrawTicket.totalAmount += amount * selectedMultiDraws.size;
    
    // Mettre à jour l'affichage
    updateMultiDrawTicketDisplay();
    
    // Afficher le total
    showTotalNotification(currentMultiDrawTicket.totalAmount, 'multi-draw');
    
    // Réinitialiser le formulaire
    document.getElementById('multi-draw-amount').value = '1';
    
    showNotification(`Parye ajoute nan fiche multi-tirages!`, "success");
}

// Mettre à jour l'affichage de la fiche multi-tirages
function updateMultiDrawTicketDisplay() {
    const infoPanel = document.getElementById('current-multi-ticket-info');
    const summary = document.getElementById('multi-ticket-summary');
    
    if (currentMultiDrawTicket.bets.length === 0) {
        infoPanel.style.display = 'none';
        return;
    }
    
    infoPanel.style.display = 'block';
    
    let summaryHTML = `
        <div style="margin-bottom: 10px;">
            <strong>${currentMultiDrawTicket.bets.length} parye</strong>
            <div style="font-size: 0.9rem; color: #7f8c8d;">
                ${currentMultiDrawTicket.draws.size} tiraj
            </div>
        </div>
        <div style="max-height: 150px; overflow-y: auto; margin-bottom: 10px;">
    `;
    
    currentMultiDrawTicket.bets.forEach((bet, index) => {
        summaryHTML += `
            <div class="multi-draw-bet-item">
                <div>
                    <strong>${bet.name}</strong><br>
                    <small>${bet.number} (${bet.draws.length} tiraj)</small>
                </div>
                <div>
                    ${bet.amount * bet.draws.length} G
                    <span style="color: var(--accent-color); cursor: pointer; margin-left: 5px;" 
                          onclick="removeFromMultiDrawTicket('${bet.id}')">
                        <i class="fas fa-times"></i>
                    </span>
                </div>
            </div>
        `;
    });
    
    summaryHTML += `
        </div>
        <div style="font-weight: bold; border-top: 1px solid #ddd; padding-top: 10px;">
            Total: ${currentMultiDrawTicket.totalAmount} G
        </div>
    `;
    
    summary.innerHTML = summaryHTML;
}

// Supprimer un pari de la fiche multi-tirages
window.removeFromMultiDrawTicket = function(betId) {
    console.log("Supprimer pari multi-tirages:", betId);
    const index = currentMultiDrawTicket.bets.findIndex(bet => bet.id === betId);
    
    if (index !== -1) {
        const bet = currentMultiDrawTicket.bets[index];
        
        // Soustraire du total
        currentMultiDrawTicket.totalAmount -= bet.amount * bet.draws.length;
        
        // Retirer le pari
        currentMultiDrawTicket.bets.splice(index, 1);
        
        // Recalculer les tirages utilisés
        const usedDraws = new Set();
        currentMultiDrawTicket.bets.forEach(b => {
            b.draws.forEach(draw => usedDraws.add(draw));
        });
        currentMultiDrawTicket.draws = usedDraws;
        
        // Mettre à jour l'affichage
        updateMultiDrawTicketDisplay();
        
        // Afficher le nouveau total
        showTotalNotification(currentMultiDrawTicket.totalAmount, 'multi-draw');
        
        showNotification("Parye retire nan fiche multi-tirages", "info");
    }
};

// Sauvegarder et imprimer la fiche multi-tirages
async function saveAndPrintMultiDrawTicket() {
    console.log("Sauvegarder et imprimer fiche multi-tirages");
    
    if (currentMultiDrawTicket.bets.length === 0) {
        showNotification("Fiche multi-tirages la vid", "warning");
        return;
    }
    
    // Vérifier si un des tirages est bloqué
    for (const drawId of currentMultiDrawTicket.draws) {
        if (isDrawBlocked(drawId, 'morning') || isDrawBlocked(drawId, 'evening')) {
            showNotification("Youn nan tiraj yo bloke! Ou pa kapab sove fiche multi-tirages 5 minit avan tiraj la.", "error");
            return;
        }
    }
    
    // Vérifier que l'utilisateur est connecté
    if (!currentUser) {
        showNotification("Ou pa konekte. Tanpri rekonekte.", "error");
        handleLogout();
        return;
    }
    
    try {
        // Créer la fiche avec les informations de l'utilisateur
        const ticket = {
            id: currentMultiDrawTicket.id,
            bets: [...currentMultiDrawTicket.bets],
            totalAmount: currentMultiDrawTicket.totalAmount,
            draws: Array.from(currentMultiDrawTicket.draws),
            agentId: currentUser.id,
            agentName: currentUser.name,
            subsystem_id: currentUser.subsystem_id
        };
        
        // Sauvegarder via API
        const response = await saveMultiDrawTicketAPI(ticket);
        
        if (response && response.success) {
            // Imprimer
            printMultiDrawTicket(response.ticket);
            
            // Réinitialiser la fiche actuelle
            currentMultiDrawTicket = {
                id: Date.now().toString(),
                bets: [],
                totalAmount: 0,
                draws: new Set(),
                createdAt: new Date().toISOString()
            };
            
            // Mettre à jour l'affichage
            updateMultiDrawTicketDisplay();
            
            // Recharger les fiches multi-tirages depuis l'API
            await loadMultiDrawTickets();
            
            showNotification("Fiche multi-tirages anrejistre ak enprime avèk siksè!", "success");
        } else {
            showNotification("Erreur lors de la sauvegarde de la fiche multi-tirages", "error");
        }
    } catch (error) {
        console.error('Erreur sauvegarde fiche multi-tirages:', error);
        showNotification("Erreur lors de la sauvegarde de la fiche multi-tirages", "error");
    }
}

// Imprimer la fiche multi-tirages
function printMultiDrawTicket(ticket) {
    console.log("Imprimer fiche multi-tirages:", ticket);
    
    const printContent = document.createElement('div');
    printContent.className = 'print-ticket';
    
    let betsHTML = '';
    let total = 0;
    
    ticket.bets.forEach(bet => {
        const betTotal = bet.amount * bet.draws.length;
        total += betTotal;
        
        betsHTML += `
            <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                <div style="font-weight: bold; margin-bottom: 5px;">${bet.name}</div>
                <div style="margin-bottom: 5px;">Nimewo: ${bet.number}</div>
                <div style="margin-bottom: 5px;">Tirages: ${bet.draws.map(d => draws[d].name).join(', ')}</div>
                <div style="font-weight: bold;">${bet.amount} G × ${bet.draws.length} = ${betTotal} G</div>
            </div>
        `;
    });
    
    printContent.innerHTML = `
        <div style="text-align: center; padding: 20px; border: 2px solid #000; font-family: Arial, sans-serif;">
            <div style="margin-bottom: 15px;">
                <img src="${companyLogo}" alt="Logo Nova Lotto" class="ticket-logo" style="max-width: 80px; height: auto;">
            </div>
            <h2>${companyInfo.name}</h2>
            <p>Fiche Multi-Tirages</p>
            <p><strong>Nimewo:</strong> #${String(ticket.number).padStart(6, '0')} (Multi)</p>
            <p><strong>Dat:</strong> ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p><strong>Ajan:</strong> ${ticket.agent_name}</p>
            <p><strong>Sous-système:</strong> ${currentUser.subsystem_name || 'Non spécifié'}</p>
            <hr>
            <div style="margin: 15px 0;">
                <h3>Parye Multi-Tirages</h3>
                ${betsHTML}
            </div>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 1.1rem;">
                <span>Total:</span>
                <span>${total} goud</span>
            </div>
            <p style="margin-top: 20px;">Mèsi pou konfyans ou!</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">
                Fiche kreye: ${new Date().toLocaleString('fr-FR')}
            </p>
        </div>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Fiche Multi-Tirages ${companyInfo.name}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        @page { margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${printContent.innerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Voir la fiche multi-tirages actuelle
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
    
    // Ouvrir une fenêtre de prévisualisation
    const previewWindow = window.open('', '_blank');
    previewWindow.document.write(`
        <html>
            <head>
                <title>Preview Fiche Multi-Tirages</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    .ticket { border: 2px solid #000; padding: 20px; max-width: 500px; margin: 0 auto; }
                    .ticket-header { text-align: center; margin-bottom: 20px; }
                    .bet-item { margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 8px; }
                </style>
            </head>
            <body>
                <div class="ticket">
                    <div class="ticket-header">
                        <h2>${companyInfo.name}</h2>
                        <h3>Fiche Multi-Tirages (Preview)</h3>
                        <p><strong>Nimewo:</strong> #${ticket.number}</p>
                        <p><strong>Dat:</strong> ${ticket.date}</p>
                        <p><strong>Ajan:</strong> ${currentUser ? currentUser.name : 'Non connecté'}</p>
                        <p><strong>Sous-système:</strong> ${currentUser ? (currentUser.subsystem_name || 'Non spécifié') : 'Non connecté'}</p>
                    </div>
                    <div>
                        <h3>Parye Multi-Tirages</h3>
    `);
    
    ticket.bets.forEach(bet => {
        const betTotal = bet.amount * bet.draws.length;
        previewWindow.document.write(`
            <div class="bet-item">
                <div><strong>${bet.name}</strong></div>
                <div>Nimewo: ${bet.number}</div>
                <div>Tirages: ${bet.draws.map(d => draws[d].name).join(', ')}</div>
                <div><strong>${bet.amount} G × ${bet.draws.length} = ${betTotal} G</strong></div>
            </div>
        `);
    });
    
    previewWindow.document.write(`
                    </div>
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #000; text-align: center;">
                        <h2>Total: ${ticket.total} G</h2>
                    </div>
                </div>
            </body>
        </html>
    `);
    previewWindow.document.close();
}

// Ouvrir l'écran des fiches multi-tirages
function openMultiTicketsScreen() {
    console.log("Ouverture écran fiches multi-tirages");
    
    document.querySelector('.container').style.display = 'none';
    document.getElementById('multi-tickets-screen').style.display = 'block';
    
    updateMultiTicketsScreen();
}

// Mettre à jour l'écran des fiches multi-tirages
function updateMultiTicketsScreen() {
    const ticketsList = document.getElementById('multi-tickets-list');
    
    ticketsList.innerHTML = '';
    
    if (multiDrawTickets.length === 0) {
        ticketsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #7f8c8d;">
                <i class="fas fa-ticket-alt" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p>Pa gen fiche multi-tirages ki sove.</p>
            </div>
        `;
        return;
    }
    
    // Trier par date (plus récent d'abord)
    const sortedTickets = [...multiDrawTickets].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedTickets.forEach(ticket => {
        const ticketItem = document.createElement('div');
        ticketItem.className = 'multi-ticket-item';
        
        const ticketDate = new Date(ticket.date);
        const drawNames = ticket.draws.map(d => draws[d].name).join(', ');
        
        let betsHTML = '';
        ticket.bets.forEach(bet => {
            betsHTML += `
                <div style="margin-bottom: 5px; padding: 5px; background: #f8f9fa; border-radius: 4px;">
                    <div><strong>${bet.name}</strong>: ${bet.number}</div>
                    <div style="font-size: 0.8rem;">${bet.draws.length} tiraj - ${bet.amount} G × ${bet.draws.length} = ${bet.amount * bet.draws.length} G</div>
                </div>
            `;
        });
        
        ticketItem.innerHTML = `
            <div style="margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>Fiche #${String(ticket.number).padStart(6, '0')} (Multi)</strong>
                    <span style="font-size: 0.8rem; color: #7f8c8d;">${ticketDate.toLocaleDateString()}</span>
                </div>
                <div style="font-size: 0.9rem; color: #7f8c8d; margin-top: 5px;">
                    ${drawNames}
                </div>
            </div>
            <div style="margin-bottom: 10px; max-height: 150px; overflow-y: auto;">
                ${betsHTML}
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px solid #ddd; padding-top: 10px;">
                <span>Total:</span>
                <span>${ticket.total} G</span>
            </div>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="ticket-action-btn print-ticket-btn" style="flex: 1; padding: 8px;" onclick="printMultiDrawTicketFromList('${ticket.id}')">
                    <i class="fas fa-print"></i> Enprime
                </button>
            </div>
        `;
        
        ticketsList.appendChild(ticketItem);
    });
}

// Imprimer une fiche multi-tirages depuis la liste
window.printMultiDrawTicketFromList = function(ticketId) {
    console.log("Imprimer fiche multi-tirages depuis liste:", ticketId);
    const ticket = multiDrawTickets.find(t => t.id === ticketId);
    
    if (ticket) {
        printMultiDrawTicket(ticket);
    } else {
        showNotification("Fiche pa jwenn", "error");
    }
};

// Afficher une notification avec le total
function showTotalNotification(totalAmount, type = 'normal') {
    const container = document.getElementById('total-notification-container');
    
    // Supprimer l'ancienne notification
    const oldNotification = document.querySelector('.total-notification');
    if (oldNotification) {
        oldNotification.remove();
    }
    
    // Créer la nouvelle notification
    const notification = document.createElement('div');
    notification.className = 'total-notification';
    
    let typeText = 'Normal';
    if (type === 'multi-draw') {
        typeText = 'Multi-Tirages';
    }
    
    notification.innerHTML = `
        <i class="fas fa-calculator"></i>
        <span>Total ${typeText}:</span>
        <span class="total-amount">${totalAmount} G</span>
    `;
    
    container.appendChild(notification);
    
    // Cacher automatiquement après 5 secondes
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, -20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

// Modifier la fonction addBet pour inclure la notification du total
function addBet(betType) {
    console.log("Ajouter pari:", betType);
    const bet = betTypes[betType];
    let number, amount;
    
    switch(betType) {
        case 'lotto3':
            number = document.getElementById('lotto3-number').value;
            amount = parseInt(document.getElementById('lotto3-amount').value);
            
            if (!/^\d{3}$/.test(number)) {
                showNotification("Lotto 3 dwe gen 3 chif egzat (0-9)", "warning");
                return;
            }
            break;
            
        case 'marriage':
            const num1 = document.getElementById('marriage-number1').value;
            const num2 = document.getElementById('marriage-number2').value;
            number = `${num1}*${num2}`;
            amount = parseInt(document.getElementById('marriage-amount').value);
            
            if (!/^\d{2}$/.test(num1) || !/^\d{2}$/.test(num2)) {
                showNotification("Chak chif maryaj dwe gen 2 chif", "warning");
                return;
            }
            break;
            
        case 'borlette':
            number = document.getElementById('borlette-number').value;
            amount = parseInt(document.getElementById('borlette-amount').value);
            
            if (!/^\d{2}$/.test(number)) {
                showNotification("Borlette dwe gen 2 chif", "warning");
                return;
            }
            break;
            
        case 'boulpe':
            number = document.getElementById('boulpe-number').value;
            amount = parseInt(document.getElementById('boulpe-amount').value);
            
            if (!/^\d{2}$/.test(number)) {
                showNotification("Boul pe dwe gen 2 chif", "warning");
                return;
            }
            
            if (number.length === 2 && number[0] === number[1]) {
                // C'est une boule paire
            } else {
                showNotification("Pou boul pe, fòk de chif yo menm! (ex: 00, 11, 22)", "warning");
                return;
            }
            break;
            
        case 'lotto4':
            const num4_1 = document.getElementById('lotto4-number1').value;
            const num4_2 = document.getElementById('lotto4-number2').value;
            number = `${num4_1}${num4_2}`; // Concaténation simple pour 4 chiffres
            
            // Récupérer les options cochées
            const option1 = document.getElementById('lotto4-option1')?.checked || false;
            const option2 = document.getElementById('lotto4-option2')?.checked || false;
            const option3 = document.getElementById('lotto4-option3')?.checked || false;
            amount = parseInt(document.getElementById('lotto4-amount').value);
            
            if (!/^\d{2}$/.test(num4_1) || !/^\d{2}$/.test(num4_2)) {
                showNotification("Chak boule Lotto 4 dwe gen 2 chif", "warning");
                return;
            }
            
            // Calculer le montant total basé sur les options cochées
            const optionsCount = [option1, option2, option3].filter(opt => opt).length;
            if (optionsCount === 0) {
                showNotification("Tanpri chwazi omwen yon opsyon", "warning");
                return;
            }
            
            const totalAmount = amount * optionsCount;
            
            activeBets.push({
                type: betType,
                name: bet.name,
                number: number,
                amount: totalAmount,
                multiplier: bet.multiplier,
                options: {
                    option1: option1,
                    option2: option2,
                    option3: option3
                },
                perOptionAmount: amount,
                isLotto4: true
            });
            
            updateBetsList();
            showNotification("Lotto 4 ajoute avèk siksè!", "success");
            
            // Retourner à la liste des jeux après un court délai
            setTimeout(() => {
                document.getElementById('bet-form').style.display = 'none';
                document.getElementById('bet-type-nav').style.display = 'none';
                document.getElementById('auto-buttons').style.display = 'none';
                document.getElementById('games-interface').style.display = 'block';
            }, 500);
            return; // Retourner pour éviter l'exécution du code général
            
        case 'lotto5':
            const num5_1 = document.getElementById('lotto5-number1').value;
            const num5_2 = document.getElementById('lotto5-number2').value;
            number = `${num5_1}${num5_2}`;
            
            // Récupérer les options cochées pour Lotto 5
            const lotto5Option1 = document.getElementById('lotto5-option1')?.checked || false;
            const lotto5Option2 = document.getElementById('lotto5-option2')?.checked || false;
            const lotto5Option3 = document.getElementById('lotto5-option3')?.checked || false;
            amount = parseInt(document.getElementById('lotto5-amount').value);
            
            if (!/^\d{3}$/.test(num5_1) || !/^\d{2}$/.test(num5_2)) {
                showNotification("Lotto 5: Premye boule 3 chif, Dezyèm boule 2 chif", "warning");
                return;
            }
            
            // Calculer le montant total basé sur les options cochées
            const lotto5OptionsCount = [lotto5Option1, lotto5Option2, lotto5Option3].filter(opt => opt).length;
            if (lotto5OptionsCount === 0) {
                showNotification("Tanpri chwazi omwen yon opsyon", "warning");
                return;
            }
            
            const lotto5TotalAmount = amount * lotto5OptionsCount;
            
            activeBets.push({
                type: betType,
                name: bet.name,
                number: number,
                amount: lotto5TotalAmount,
                multiplier: bet.multiplier,
                options: {
                    option1: lotto5Option1,
                    option2: lotto5Option2,
                    option3: lotto5Option3
                },
                perOptionAmount: amount,
                isLotto5: true
            });
            
            updateBetsList();
            showNotification("Lotto 5 ajoute avèk siksè!", "success");
            
            // Retourner à la liste des jeux après un court délai
            setTimeout(() => {
                document.getElementById('bet-form').style.display = 'none';
                document.getElementById('bet-type-nav').style.display = 'none';
                document.getElementById('auto-buttons').style.display = 'none';
                document.getElementById('games-interface').style.display = 'block';
            }, 500);
            return; // Retourner pour éviter l'exécution du code général
    }
    
    if (!number || isNaN(amount) || amount <= 0) {
        showNotification("Tanpri rantre yon nimewo ak yon kantite valab", "warning");
        return;
    }
    
    activeBets.push({
        type: betType,
        name: bet.name,
        number: number,
        amount: amount,
        multiplier: bet.multiplier
    });
    
    updateBetsList();
    
    // Afficher la notification du total
    updateNormalBetTotalNotification();
    
    showNotification("Parye ajoute avèk siksè!", "success");
    
    // Retourner à la liste des jeux après un court délai
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('bet-type-nav').style.display = 'none';
        document.getElementById('auto-buttons').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
    }, 500);
}

// Modifier la fonction updateBetsList pour inclure la notification du total
function updateBetsList() {
    console.log("Mise à jour liste paris");
    const betsList = document.getElementById('bets-list');
    const betTotal = document.getElementById('bet-total');
    
    betsList.innerHTML = '';
    
    if (activeBets.length === 0) {
        betsList.innerHTML = '<p>Pa gen okenn parye aktif.</p>';
        betTotal.textContent = '0 goud';
        
        // Cacher la notification du total si aucun pari
        const notification = document.querySelector('.total-notification');
        if (notification) {
            notification.remove();
        }
        return;
    }
    
    const groupedBets = {};
    
    activeBets.forEach((bet, index) => {
        // Pour Lotto 4 et Lotto 5, on gère les options séparément
        if (bet.isLotto4 || bet.isLotto5) {
            const key = `${bet.type}_${bet.number}_${JSON.stringify(bet.options)}`;
            
            if (!groupedBets[key]) {
                groupedBets[key] = {
                    bet: bet,
                    count: 1,
                    totalAmount: bet.amount,
                    indexes: [index]
                };
            } else {
                groupedBets[key].count++;
                groupedBets[key].totalAmount += bet.amount;
                groupedBets[key].indexes.push(index);
            }
        } else {
            const key = `${bet.type}_${bet.number}`;
            
            if (!groupedBets[key]) {
                groupedBets[key] = {
                    bet: bet,
                    count: 1,
                    totalAmount: bet.amount,
                    indexes: [index]
                };
            } else {
                groupedBets[key].count++;
                groupedBets[key].totalAmount += bet.amount;
                groupedBets[key].indexes.push(index);
            }
        }
    });
    
    for (const key in groupedBets) {
        const group = groupedBets[key];
        const bet = group.bet;
        
        const betItem = document.createElement('div');
        betItem.className = 'bet-item';
        
        if (bet.isGroup) {
            betItem.innerHTML = `
                <div class="bet-details">
                    <strong>${bet.name}</strong><br>
                    ${bet.number} (${bet.details.length} parye)
                </div>
                <div class="bet-amount">
                    ${group.totalAmount} goud
                    <span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span>
                </div>
            `;
        } else if (bet.isLotto4 || bet.isLotto5) {
            let optionsText = '';
            if (bet.isLotto4) {
                const options = [];
                if (bet.options.option1) options.push('Opsyon 1');
                if (bet.options.option2) options.push('Opsyon 2');
                if (bet.options.option3) options.push('Opsyon 3');
                optionsText = options.join(', ');
            } else if (bet.isLotto5) {
                const options = [];
                if (bet.options.option1) options.push('Opsyon 1');
                if (bet.options.option2) options.push('Opsyon 2');
                if (bet.options.option3) options.push('Opsyon 3');
                optionsText = options.join(', ');
            }
            
            betItem.innerHTML = `
                <div class="bet-details">
                    <strong>${bet.name}</strong><br>
                    ${bet.number}<br>
                    <small style="color: #7f8c8d;">${optionsText}</small>
                </div>
                <div class="bet-amount">
                    ${group.totalAmount} goud
                    <span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span>
                </div>
            `;
        } else {
            betItem.innerHTML = `
                <div class="bet-details">
                    <strong>${bet.name}</strong><br>
                    ${bet.number}
                </div>
                <div class="bet-amount">
                    ${group.totalAmount} goud
                    <span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span>
                </div>
            `;
        }
        
        betsList.appendChild(betItem);
        
        // Ajouter l'événement pour supprimer
        const removeBtn = betItem.querySelector('.bet-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                const indexes = this.getAttribute('data-indexes').split(',').map(Number);
                
                indexes.sort((a, b) => b - a).forEach(index => {
                    activeBets.splice(index, 1);
                });
                
                updateBetsList();
            });
        }
    }
    
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    betTotal.textContent = `${total} goud`;
    
    // Mettre à jour la notification du total
    updateNormalBetTotalNotification();
}

// Charger les résultats depuis la base de données
async function loadResultsFromDatabase() {
    console.log("Chargement des résultats depuis la base de données...");
    
    try {
        // Appel API pour les résultats
        const resultsData = await apiCall(APP_CONFIG.results);
        if (resultsData && resultsData.results) {
            resultsDatabase = resultsData.results;
        }
        
        console.log("Utilisation des résultats:", resultsDatabase);
        
        // Mettre à jour l'affichage des résultats
        updateResultsDisplay();
        
    } catch (error) {
        console.error("Erreur lors du chargement des résultats:", error);
        showNotification("Erreur chargement résultats", "error");
    }
}

// Vérifier les nouveaux résultats
async function checkForNewResults() {
    console.log("Vérification des nouveaux résultats...");
    
    if (!isOnline) {
        console.log("Pas de connexion Internet");
        return;
    }
    
    try {
        const resultsData = await apiCall(APP_CONFIG.results);
        if (resultsData && resultsData.results) {
            resultsDatabase = resultsData.results;
            updateResultsDisplay();
            console.log("Résultats mis à jour");
        }
    } catch (error) {
        console.error("Erreur lors de la vérification des résultats:", error);
    }
}

// Mettre à jour l'affichage des résultats
function updateResultsDisplay() {
    console.log("Mise à jour affichage des résultats");
    
    // Mettre à jour les résultats dans la section principale
    const resultsGrid = document.querySelector('.results-grid');
    if (resultsGrid) {
        resultsGrid.innerHTML = '';
        
        Object.keys(draws).forEach(drawId => {
            const resultCard = document.createElement('div');
            resultCard.className = 'result-card';
            
            // Prendre le dernier résultat disponible (matin par défaut)
            const result = resultsDatabase[drawId]?.morning || { lot1: '---' };
            
            resultCard.innerHTML = `
                <h4>${draws[drawId].name}</h4>
                <div class="result-number">${result.lot1}</div>
            `;
            
            resultsGrid.appendChild(resultCard);
        });
    }
    
    // Mettre à jour l'écran de vérification des résultats
    const latestResults = document.getElementById('latest-results');
    if (latestResults) {
        latestResults.innerHTML = '';
        
        Object.keys(draws).forEach(drawId => {
            Object.keys(draws[drawId].times).forEach(time => {
                const result = resultsDatabase[drawId]?.[time];
                if (result) {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'lot-result';
                    
                    const timeName = time === 'morning' ? 'Maten' : 'Swè';
                    resultDiv.innerHTML = `
                        <div>
                            <strong>${draws[drawId].name} ${timeName}</strong><br>
                            <small>${new Date(result.date).toLocaleString()}</small>
                        </div>
                        <div style="text-align: right;">
                            <div class="lot-number">${result.lot1}</div>
                            <div>${result.lot2} (×20)</div>
                            <div>${result.lot3} (×10)</div>
                        </div>
                    `;
                    
                    latestResults.appendChild(resultDiv);
                }
            });
        });
    }
}

// Ouvrir l'écran de vérification des résultats
function openResultsCheckScreen() {
    console.log("Ouverture écran vérification résultats");
    
    document.querySelector('.container').style.display = 'none';
    document.getElementById('results-check-screen').style.display = 'block';
    
    // Mettre à jour l'affichage des résultats
    updateResultsDisplay();
    
    // Réinitialiser l'affichage des fiches gagnantes
    document.getElementById('winning-tickets-container').innerHTML = '';
    document.getElementById('winning-summary').innerHTML = '';
}

// Vérifier les tickets gagnants avec les nouvelles règles Lotto 4 et 5
function checkWinningTickets() {
    console.log("Vérification des tickets gagnants...");
    
    winningTickets = [];
    
    // Parcourir tous les tickets sauvegardés
    const allTickets = [...savedTickets];
    
    allTickets.forEach(ticket => {
        const result = resultsDatabase[ticket.draw]?.[ticket.drawTime];
        
        if (!result) {
            console.log(`Pas de résultat pour ${ticket.draw} ${ticket.drawTime}`);
            return;
        }
        
        console.log(`Vérification ticket #${ticket.number} contre résultat:`, result);
        
        const winningBets = [];
        let totalWinnings = 0;
        
        // Vérifier chaque pari du ticket
        ticket.bets.forEach(bet => {
            const winningInfo = checkBetAgainstResult(bet, result);
            
            if (winningInfo.isWinner) {
                winningBets.push({
                    ...bet,
                    winAmount: winningInfo.winAmount,
                    winType: winningInfo.winType,
                    matchedNumber: winningInfo.matchedNumber
                });
                totalWinnings += winningInfo.winAmount;
            }
        });
        
        // Si le ticket a des paris gagnants
        if (winningBets.length > 0) {
            const winningTicket = {
                ...ticket,
                winningBets: winningBets,
                totalWinnings: totalWinnings,
                result: result
            };
            
            winningTickets.push(winningTicket);
            
            console.log(`Ticket #${ticket.number} est gagnant! Gains: ${totalWinnings} G`);
        }
    });
    
    // Afficher les résultats
    displayWinningTickets();
    
    // Afficher une notification si des tickets gagnants sont trouvés
    if (winningTickets.length > 0) {
        showNotification(`${winningTickets.length} fiche gagnant detekte!`, "success");
    } else {
        showNotification("Pa gen fiche genyen pou moman sa", "info");
    }
}

// Vérifier un pari contre un résultat avec les nouvelles règles
function checkBetAgainstResult(bet, result) {
    // Extraire les lots
    const lot1 = result.lot1; // 3 chiffres
    const lot2 = result.lot2; // 2 chiffres
    const lot3 = result.lot3; // 2 chiffres
    
    // Derniers 2 chiffres du lot 1 (pour borlette 1er lot)
    const lot1Last2 = lot1.substring(1); // Prend les 2 derniers chiffres
    
    let isWinner = false;
    let winAmount = 0;
    let winType = '';
    let matchedNumber = '';
    
    switch(bet.type) {
        case 'borlette':
            // Vérifier contre les 3 lots
            if (bet.number === lot1Last2) {
                // 1er lot
                isWinner = true;
                winAmount = bet.amount * 60; // ×60
                winType = '1er lot';
                matchedNumber = lot1Last2;
            } else if (bet.number === lot2) {
                // 2e lot
                isWinner = true;
                winAmount = bet.amount * 20; // ×20
                winType = '2e lot';
                matchedNumber = lot2;
            } else if (bet.number === lot3) {
                // 3e lot
                isWinner = true;
                winAmount = bet.amount * 10; // ×10
                winType = '3e lot';
                matchedNumber = lot3;
            }
            break;
            
        case 'boulpe':
            // Même logique que borlette pour les boules paires
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
            // Lotto 3: vérifier contre le lot 1 (3 chiffres)
            if (bet.number === lot1) {
                isWinner = true;
                winAmount = bet.amount * 500; // ×500
                winType = 'Lotto 3';
                matchedNumber = lot1;
            }
            break;
            
        case 'lotto4':
            // Règles Lotto 4 avec 3 options
            winAmount = 0;
            winType = '';
            
            // Option 1: lot2 + lot3 (ex: 45 + 34 = 4534)
            if (bet.options?.option1) {
                const option1Result = lot2 + lot3;
                if (bet.number === option1Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 1, ';
                    matchedNumber = option1Result;
                }
            }
            
            // Option 2: derniers 2 chiffres de lot1 + lot2 (ex: 23 + 45 = 2345)
            if (bet.options?.option2) {
                const option2Result = lot1.substring(1) + lot2;
                if (bet.number === option2Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 5000;
                    winType += 'Opsyon 2, ';
                    matchedNumber = option2Result;
                }
            }
            
            // Option 3: n'importe quel arrangement contenant lot2 et lot3
            if (bet.options?.option3) {
                // Vérifier si les 4 chiffres contiennent les deux boules (lot2 et lot3)
                // Les boules peuvent être dans n'importe quel ordre
                const betDigits = bet.number.split('');
                const lot2Digits = lot2.split('');
                const lot3Digits = lot3.split('');
                
                // Créer une copie des chiffres pour vérification
                const tempDigits = [...betDigits];
                let containsLot2 = true;
                let containsLot3 = true;
                
                // Vérifier lot2
                for (const digit of lot2Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) {
                        containsLot2 = false;
                        break;
                    }
                    tempDigits.splice(index, 1); // Retirer le chiffre trouvé
                }
                
                // Vérifier lot3
                for (const digit of lot3Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) {
                        containsLot3 = false;
                        break;
                    }
                    tempDigits.splice(index, 1); // Retirer le chiffre trouvé
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
            // Règles Lotto 5 avec 3 options
            winAmount = 0;
            winType = '';
            
            // Option 1: lot1 + lot2 (ex: 123 + 45 = 12345)
            if (bet.options?.option1) {
                const option1Result = lot1 + lot2;
                if (bet.number === option1Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 1, ';
                    matchedNumber = option1Result;
                }
            }
            
            // Option 2: lot1 + lot3 (ex: 123 + 34 = 12334)
            if (bet.options?.option2) {
                const option2Result = lot1 + lot3;
                if (bet.number === option2Result) {
                    isWinner = true;
                    winAmount += bet.perOptionAmount * 25000;
                    winType += 'Opsyon 2, ';
                    matchedNumber = option2Result;
                }
            }
            
            // Option 3: n'importe quel arrangement contenant les chiffres des 3 lots
            if (bet.options?.option3) {
                // Les 5 chiffres doivent contenir tous les chiffres des 3 lots
                // (mais il y a 7 chiffres au total, donc certains peuvent manquer)
                // Vérification simplifiée: les 5 chiffres doivent être présents dans la combinaison des 3 lots
                const allResultDigits = (lot1 + lot2 + lot3).split('');
                const betDigits = bet.number.split('');
                
                let allFound = true;
                const tempResultDigits = [...allResultDigits];
                
                for (const digit of betDigits) {
                    const index = tempResultDigits.indexOf(digit);
                    if (index === -1) {
                        allFound = false;
                        break;
                    }
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
            // Mariage: vérifier si les deux nombres sont présents dans les lots
            const [num1, num2] = bet.number.split('*');
            const numbers = [lot1Last2, lot2, lot3];
            
            if (numbers.includes(num1) && numbers.includes(num2)) {
                isWinner = true;
                winAmount = bet.amount * 1000; // ×1000
                winType = 'Maryaj';
                matchedNumber = `${num1}*${num2}`;
            }
            break;
            
        case 'grap':
            // Grap: vérifier si le lot1 est un grap (3 chiffres identiques)
            if (lot1[0] === lot1[1] && lot1[1] === lot1[2]) {
                if (bet.number === lot1) {
                    isWinner = true;
                    winAmount = bet.amount * 500; // ×500
                    winType = 'Grap';
                    matchedNumber = lot1;
                }
            }
            break;
            
        case 'auto-lotto4':
            // Même logique que lotto4 option 3 (arrangement quelconque)
            const lotto4Digits = bet.number.split('');
            const autoLot2Digits = lot2.split('');
            const autoLot3Digits = lot3.split('');
            
            const autoTempDigits = [...lotto4Digits];
            let autoContainsLot2 = true;
            let autoContainsLot3 = true;
            
            // Vérifier lot2
            for (const digit of autoLot2Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) {
                    autoContainsLot2 = false;
                    break;
                }
                autoTempDigits.splice(index, 1);
            }
            
            // Vérifier lot3
            for (const digit of autoLot3Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) {
                    autoContainsLot3 = false;
                    break;
                }
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
    
    return {
        isWinner,
        winAmount,
        winType,
        matchedNumber
    };
}

// Afficher les tickets gagnants
function displayWinningTickets() {
    const container = document.getElementById('winning-tickets-container');
    const summary = document.getElementById('winning-summary');
    
    container.innerHTML = '';
    
    if (winningTickets.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #7f8c8d;">
                <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Pa gen fiche gagnant pou moman sa.</p>
            </div>
        `;
        summary.innerHTML = '';
        return;
    }
    
    // Calculer le total des gains
    const totalWinnings = winningTickets.reduce((sum, ticket) => sum + ticket.totalWinnings, 0);
    
    // Afficher le résumé
    summary.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${winningTickets.length}</div>
            <div class="stat-label">Fiche Gagnant</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalWinnings} G</div>
            <div class="stat-label">Total Gains</div>
        </div>
    `;
    
    // Afficher chaque ticket gagnant
    winningTickets.forEach(ticket => {
        const ticketDiv = document.createElement('div');
        ticketDiv.className = 'winning-ticket';
        
        let betsHTML = '';
        ticket.winningBets.forEach(winBet => {
            betsHTML += `
                <div class="bet-item">
                    <div class="bet-details">
                        <strong>${winBet.name}</strong><br>
                        ${winBet.number} → ${winBet.matchedNumber || winBet.number} (${winBet.winType})
                    </div>
                    <div class="bet-amount">
                        <span class="winning-amount">+${winBet.winAmount} G</span>
                    </div>
                </div>
            `;
        });
        
        ticketDiv.innerHTML = `
            <div style="margin-bottom: 10px;">
                <strong>Fiche #${String(ticket.number).padStart(6, '0')}</strong>
                <div style="font-size: 0.9rem; color: #7f8c8d;">
                    ${draws[ticket.draw].name} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})
                </div>
            </div>
            <div style="margin-bottom: 10px;">
                <strong>Rezilta:</strong> ${ticket.result.lot1} | ${ticket.result.lot2} | ${ticket.result.lot3}
            </div>
            ${betsHTML}
            <div class="bet-total">
                <span>Total Gains:</span>
                <span class="winning-amount">${ticket.totalWinnings} G</span>
            </div>
        `;
        
        container.appendChild(ticketDiv);
    });
}

// Initialiser le panneau multi-tirages
function initMultiDrawPanel() {
    console.log("Initialisation panneau multi-tirages");
    const multiDrawOptions = document.getElementById('multi-draw-options');
    const multiGameSelect = document.getElementById('multi-game-select');
    
    multiDrawOptions.innerHTML = '';
    multiGameSelect.innerHTML = '';
    
    // Options de tirage
    Object.keys(draws).forEach(drawId => {
        const option = document.createElement('div');
        option.className = 'multi-draw-option';
        option.setAttribute('data-draw', drawId);
        option.textContent = draws[drawId].name;
        
        option.addEventListener('click', function() {
            this.classList.toggle('selected');
            const drawId = this.getAttribute('data-draw');
            
            if (this.classList.contains('selected')) {
                selectedMultiDraws.add(drawId);
            } else {
                selectedMultiDraws.delete(drawId);
            }
            console.log("Tirage sélectionné:", drawId, selectedMultiDraws);
        });
        
        multiDrawOptions.appendChild(option);
    });
    
    // Options de jeu
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
        if (game.id === 'borlette') {
            option.classList.add('selected');
        }
        option.setAttribute('data-game', game.id);
        option.textContent = game.name;
        
        option.addEventListener('click', function() {
            document.querySelectorAll('.multi-game-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            this.classList.add('selected');
            selectedMultiGame = this.getAttribute('data-game');
            console.log("Jeu sélectionné:", selectedMultiGame);
            updateMultiGameForm(selectedMultiGame);
        });
        
        multiGameSelect.appendChild(option);
    });
    
    // Initialiser le formulaire
    updateMultiGameForm('borlette');
}

// Mettre à jour le formulaire pour le jeu sélectionné
function updateMultiGameForm(gameType) {
    console.log("Mise à jour formulaire pour:", gameType);
    const numberInputs = document.getElementById('multi-number-inputs');
    const bet = betTypes[gameType];
    
    let html = '';
    
    switch(gameType) {
        case 'borlette':
        case 'boulpe':
            html = `
                <label for="multi-draw-number">Nimewo 2 chif</label>
                <input type="text" id="multi-draw-number" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">
            `;
            break;
            
        case 'lotto3':
        case 'grap':
            html = `
                <label for="multi-draw-number">Nimewo 3 chif</label>
                <input type="text" id="multi-draw-number" placeholder="000" maxlength="3" pattern="[0-9]{3}" class="auto-focus-input">
            `;
            break;
            
        case 'marriage':
            html = `
                <label>2 Nimewo pou maryaj</label>
                <div class="number-inputs">
                    <input type="text" id="multi-draw-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">
                    <input type="text" id="multi-draw-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">
                </div>
            `;
            break;
            
        case 'lotto4':
            html = `
                <label>4 Chif (lot 1+2 accumulate) - 3 opsyon</label>
                <div class="number-inputs">
                    <input type="text" id="multi-draw-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">
                    <input type="text" id="multi-draw-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">
                </div>
            `;
            break;
            
        case 'lotto5':
            html = `
                <label>5 Chif (lot 1+2+3 accumulate) - 3 opsyon</label>
                <div class="number-inputs">
                    <input type="text" id="multi-draw-number1" placeholder="000" maxlength="3" pattern="[0-9]{3}" class="auto-focus-input">
                    <input type="text" id="multi-draw-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}" class="auto-focus-input">
                </div>
            `;
            break;
    }
    
    numberInputs.innerHTML = html;
    
    // Appliquer le comportement de focus automatique
    setupAutoFocusInputs();
}

// Configurer le focus automatique pour tous les champs numériques
function setupAutoFocusInputs() {
    document.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('input', function(e) {
            const maxLength = parseInt(this.getAttribute('maxlength'));
            if (maxLength && this.value.length >= maxLength) {
                // Trouver le prochain champ
                const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
                const currentIndex = allInputs.indexOf(this);
                if (currentIndex < allInputs.length - 1) {
                    allInputs[currentIndex + 1].focus();
                }
            }
        });
        
        // Permettre la navigation avec les flèches
        input.addEventListener('keydown', function(e) {
            const allInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="number"]'));
            const currentIndex = allInputs.indexOf(this);
            
            if (e.key === 'ArrowRight' && currentIndex < allInputs.length - 1) {
                e.preventDefault();
                allInputs[currentIndex + 1].focus();
            } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
                e.preventDefault();
                allInputs[currentIndex - 1].focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentIndex < allInputs.length - 1) {
                    allInputs[currentIndex + 1].focus();
                } else {
                    // Si c'est le dernier champ, simuler un clic sur le bouton d'ajout
                    const addButton = document.getElementById('add-bet');
                    if (addButton) addButton.click();
                }
            }
        });
    });
}

// Afficher/masquer le panneau multi-tirages
function toggleMultiDrawPanel() {
    console.log("Toggle multi-tirages");
    const content = document.getElementById('multi-draw-content');
    const toggleBtn = document.getElementById('multi-draw-toggle');
    
    content.classList.toggle('expanded');
    
    if (content.classList.contains('expanded')) {
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    } else {
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

// Mettre à jour l'affichage du logo
function updateLogoDisplay() {
    const logoElements = document.querySelectorAll('#company-logo, #ticket-logo');
    logoElements.forEach(logo => {
        logo.src = companyLogo;
        logo.onerror = function() {
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzOWMxMiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Qk9STEVUVEU8L3RleHQ+PC9zdmc+';
        };
    });
}

// Configurer la détection de connexion
function setupConnectionDetection() {
    window.addEventListener('online', function() {
        isOnline = true;
        showNotification("Koneksyon entènèt retabli", "success");
        // Vérifier les nouveaux résultats quand la connexion revient
        checkForNewResults();
    });
    
    window.addEventListener('offline', function() {
        isOnline = false;
        showNotification("Pa konekte ak entènèt", "warning");
    });
}

// Afficher une notification
function showNotification(message, type = 'info') {
    console.log("Notification:", type, message);
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';
    if (type === 'error') icon = 'fas fa-times-circle';
    
    notification.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 20px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Afficher un écran spécifique
function showScreen(screenId) {
    console.log("Afficher écran:", screenId);
    
    // Cacher tous les écrans
    document.querySelectorAll('.screen, .betting-screen, .container, .report-screen, .results-check-screen, .multi-tickets-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // Mettre à jour la navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-screen') === screenId) {
            item.classList.add('active');
        }
    });
    
    if (screenId === 'home') {
        document.querySelector('.container').style.display = 'block';
    } else {
        const screen = document.getElementById(screenId + '-screen');
        if (screen) {
            screen.style.display = 'block';
            
            // Mettre à jour le contenu de l'écran si nécessaire
            if (screenId === 'ticket-management') {
                updateTicketManagementScreen();
            } else if (screenId === 'history') {
                updateHistoryScreen();
            } else if (screenId === 'winning-tickets') {
                updateWinningTicketsScreen();
            }
        }
    }
}

// Mettre à jour l'heure actuelle
function updateCurrentTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    const dateString = now.toLocaleDateString('fr-FR', options);
    const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    document.getElementById('current-time').textContent = `${dateString} - ${timeString}`;
    document.getElementById('ticket-date').textContent = `${dateString} - ${timeString}`;
}

// Mettre à jour le badge des fiches en attente
function updatePendingBadge() {
    const pendingCount = pendingSyncTickets.length;
    console.log("Mise à jour badge:", pendingCount);
    // Cette fonction peut être étendue pour afficher un badge visuel
}

// Ouvrir l'écran de pari
function openBettingScreen(drawId, time = null) {
    console.log("Ouvrir écran pari:", drawId, time);
    currentDraw = drawId;
    currentDrawTime = time;
    const draw = draws[drawId];
    
    let title = draw.name;
    if (time) {
        title += ` (${time === 'morning' ? 'Maten' : 'Swè'})`;
    }
    document.getElementById('betting-title').textContent = title;
    
    const bettingScreen = document.getElementById('betting-screen');
    bettingScreen.style.display = 'block';
    bettingScreen.classList.remove('slide-out');
    bettingScreen.classList.add('slide-in');
    
    document.querySelector('.container').style.display = 'none';
    
    // Afficher TOUTES les catégories de jeux
    document.getElementById('games-interface').style.display = 'block';
    document.getElementById('bet-type-nav').style.display = 'none';
    document.getElementById('auto-buttons').style.display = 'none';
    document.getElementById('bet-form').style.display = 'none';
    document.getElementById('active-bets').style.display = 'block';
    
    // Configurer les événements des jeux
    setupGameSelection();
    
    updateBetsList();
}

// Configurer la sélection des jeux
function setupGameSelection() {
    console.log("Configuration sélection jeux");
    // Retirer d'abord les anciens écouteurs
    const existingItems = document.querySelectorAll('.game-item');
    existingItems.forEach(item => {
        item.replaceWith(item.cloneNode(true));
    });
    
    // Ajouter les nouveaux écouteurs
    document.querySelectorAll('.game-item').forEach(item => {
        item.addEventListener('click', function() {
            const gameType = this.getAttribute('data-game');
            console.log("Jeu sélectionné:", gameType);
            
            // Gestion des jeux automatiques
            if (gameType === 'auto-marriage' || gameType === 'auto-lotto4') {
                showAutoGameForm(gameType);
            } else {
                showBetForm(gameType);
            }
        });
    });
}

// Afficher le formulaire pour les jeux automatiques
function showAutoGameForm(gameType) {
    console.log("Afficher formulaire jeu automatique:", gameType);
    const bet = betTypes[gameType];
    
    // Cacher l'interface des jeux
    document.getElementById('games-interface').style.display = 'none';
    document.getElementById('bet-type-nav').style.display = 'none';
    document.getElementById('auto-buttons').style.display = 'none';
    
    const betForm = document.getElementById('bet-form');
    betForm.style.display = 'block';
    
    // Réinitialiser les boules sélectionnées
    selectedBalls = [];
    
    let formHTML = '';
    
    if (gameType === 'auto-marriage') {
        formHTML = `
            <h3>${bet.name} - ${bet.description}</h3>
            <p class="info-text"><small>Chwazi plizyè boule (2 chif) pou maryaj otomatik</small></p>
            
            <div class="options-container">
                <div style="margin-bottom: 15px;">
                    <div class="all-graps-btn" id="use-basket-balls">
                        <i class="fas fa-shopping-basket"></i> Itilize Boul nan Panye
                    </div>
                    <div class="all-graps-btn" id="enter-manual-balls">
                        <i class="fas fa-keyboard"></i> Antre Boul Manyèlman
                    </div>
                </div>
                
                <div id="manual-balls-input" style="display: none;">
                    <div class="form-group">
                        <label for="manual-balls">Antre boul yo (separe pa espas):</label>
                        <input type="text" id="manual-balls" class="manual-balls-input" placeholder="12 34 56 78">
                        <small style="color: #7f8c8d;">Egzanp: 12 34 56 78 (4 boul 2 chif)</small>
                    </div>
                    <button class="btn-primary" id="process-manual-balls">
                        <i class="fas fa-check"></i> Proses Boul yo
                    </button>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong>Boules disponib:</strong>
                    <div class="balls-list" id="available-balls-list">
                        <!-- Les boules apparaîtront ici -->
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div class="all-graps-btn" id="clear-balls-btn">
                        <i class="fas fa-times-circle"></i> Retire Tout Boul
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong>Boules sélectionnées:</strong>
                    <div id="selected-balls-list" style="min-height: 50px; border: 1px dashed #ccc; padding: 10px; margin-top: 5px; border-radius: 5px;">
                        Pa gen boul chwazi
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label for="auto-game-amount">Kantite pou chak maryaj</label>
                <input type="number" id="auto-game-amount" placeholder="Kantite" min="1" value="1">
            </div>
            
            <div class="bet-actions">
                <button class="btn-primary" id="add-auto-marriages">Ajoute Maryaj Otomatik</button>
                <button class="btn-secondary" id="return-to-types">Retounen</button>
            </div>
        `;
    } else if (gameType === 'auto-lotto4') {
        formHTML = `
            <h3>${bet.name} - ${bet.description}</h3>
            <p class="info-text"><small>Chwazi plizyè boule (2 chif) pou Lotto 4 otomatik</small></p>
            
            <div class="options-container">
                <div style="margin-bottom: 15px;">
                    <div class="all-graps-btn" id="use-basket-balls">
                        <i class="fas fa-shopping-basket"></i> Itilize Boul nan Panye
                    </div>
                    <div class="all-graps-btn" id="enter-manual-balls">
                        <i class="fas fa-keyboard"></i> Antre Boul Manyèlman
                    </div>
                </div>
                
                <div id="manual-balls-input" style="display: none;">
                    <div class="form-group">
                        <label for="manual-balls">Antre boul yo (separe pa espas):</label>
                        <input type="text" id="manual-balls" class="manual-balls-input" placeholder="12 34 56 78">
                        <small style="color: #7f8c8d;">Egzanp: 12 34 56 78 (4 boul 2 chif)</small>
                    </div>
                    <button class="btn-primary" id="process-manual-balls">
                        <i class="fas fa-check"></i> Proses Boul yo
                    </button>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong>Boules disponib:</strong>
                    <div class="balls-list" id="available-balls-list">
                        <!-- Les boules apparaîtront ici -->
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div class="all-graps-btn" id="clear-balls-btn">
                        <i class="fas fa-times-circle"></i> Retire Tout Boul
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <strong>Boules sélectionnées:</strong>
                    <div id="selected-balls-list" style="min-height: 50px; border: 1px dashed #ccc; padding: 10px; margin-top: 5px; border-radius: 5px;">
                        Pa gen boul chwazi
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div class="option-group">
                        <label class="option-label">
                            <input type="checkbox" id="include-reverse" checked>
                            <span>Enkli renverse yo</span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="form-group">
                <label for="auto-game-amount">Kantite pou chak Lotto 4</label>
                <input type="number" id="auto-game-amount" placeholder="Kantite" min="1" value="1">
            </div>
            
            <div class="bet-actions">
                <button class="btn-primary" id="add-auto-lotto4">Ajoute Lotto 4 Otomatik</button>
                <button class="btn-secondary" id="return-to-types">Retounen</button>
            </div>
        `;
    }
    
    betForm.innerHTML = formHTML;
    
    // Configurer les événements
    document.getElementById('use-basket-balls').addEventListener('click', function() {
        loadBasketBalls();
    });
    
    document.getElementById('enter-manual-balls').addEventListener('click', function() {
        document.getElementById('manual-balls-input').style.display = 'block';
    });
    
    document.getElementById('process-manual-balls').addEventListener('click', function() {
        processManualBalls();
    });
    
    document.getElementById('clear-balls-btn').addEventListener('click', function() {
        selectedBalls = [];
        updateSelectedBallsList();
        updateAvailableBallsList();
    });
    
    if (gameType === 'auto-marriage') {
        document.getElementById('add-auto-marriages').addEventListener('click', function() {
            addAutoMarriages();
        });
    } else if (gameType === 'auto-lotto4') {
        document.getElementById('add-auto-lotto4').addEventListener('click', function() {
            addAutoLotto4();
        });
    }
    
    const returnButton = document.getElementById('return-to-types');
    if (returnButton) {
        returnButton.addEventListener('click', function() {
            document.getElementById('bet-form').style.display = 'none';
            document.getElementById('bet-type-nav').style.display = 'none';
            document.getElementById('auto-buttons').style.display = 'none';
            document.getElementById('games-interface').style.display = 'block';
        });
    }
    
    document.getElementById('active-bets').style.display = 'block';
}

// Charger les boules du panier
function loadBasketBalls() {
    console.log("Chargement des boules du panier");
    
    // Récupérer toutes les boules borlette/boulpe du panier actif
    const basketBalls = [];
    
    activeBets.forEach(bet => {
        if (bet.type === 'borlette' || bet.type === 'boulpe') {
            if (bet.isGroup) {
                // Pour les groupes, ajouter toutes les boules
                bet.details.forEach(detail => {
                    if (/^\d{2}$/.test(detail.number)) {
                        basketBalls.push(detail.number);
                    }
                });
            } else {
                if (/^\d{2}$/.test(bet.number)) {
                    basketBalls.push(bet.number);
                }
            }
        }
    });
    
    // Filtrer les doublons
    selectedBalls = [...new Set(basketBalls)];
    
    if (selectedBalls.length === 0) {
        showNotification("Pa gen boul borlette nan panye a", "warning");
        return;
    }
    
    updateSelectedBallsList();
    updateAvailableBallsList();
    
    showNotification(`${selectedBalls.length} boul chaje nan panye a`, "success");
}

// Traiter les boules manuelles
function processManualBalls() {
    const manualInput = document.getElementById('manual-balls').value.trim();
    
    if (!manualInput) {
        showNotification("Tanpri antre kèk boul", "warning");
        return;
    }
    
    // Séparer par espaces
    const balls = manualInput.split(/\s+/);
    
    // Valider chaque boule
    const validBalls = [];
    const invalidBalls = [];
    
    balls.forEach(ball => {
        if (/^\d{2}$/.test(ball)) {
            validBalls.push(ball);
        } else {
            invalidBalls.push(ball);
        }
    });
    
    if (validBalls.length === 0) {
        showNotification("Pa gen boul valab. Boul yo dwe gen 2 chif.", "warning");
        return;
    }
    
    // Filtrer les doublons
    selectedBalls = [...new Set(validBalls)];
    
    updateSelectedBallsList();
    updateAvailableBallsList();
    
    let message = `${selectedBalls.length} boul valab ajoute`;
    if (invalidBalls.length > 0) {
        message += `. ${invalidBalls.length} boul envalid: ${invalidBalls.join(', ')}`;
    }
    
    showNotification(message, "success");
    
    // Cacher le champ manuel
    document.getElementById('manual-balls-input').style.display = 'none';
    document.getElementById('manual-balls').value = '';
}

// Mettre à jour la liste des boules disponibles
function updateAvailableBallsList() {
    const ballsList = document.getElementById('available-balls-list');
    
    if (selectedBalls.length === 0) {
        ballsList.innerHTML = '<p>Pa gen boul disponib.</p>';
        return;
    }
    
    ballsList.innerHTML = '';
    
    selectedBalls.forEach((ball, index) => {
        const ballTag = document.createElement('div');
        ballTag.className = 'ball-tag';
        ballTag.innerHTML = `
            ${ball}
            <span class="remove-ball" onclick="removeBall(${index})">
                <i class="fas fa-times"></i>
            </span>
        `;
        ballsList.appendChild(ballTag);
    });
}

// Retirer une boule
window.removeBall = function(index) {
    selectedBalls.splice(index, 1);
    updateSelectedBallsList();
    updateAvailableBallsList();
};

// Mettre à jour la liste des boules sélectionnées
function updateSelectedBallsList() {
    const ballsList = document.getElementById('selected-balls-list');
    
    if (selectedBalls.length === 0) {
        ballsList.innerHTML = "Pa gen boul chwazi";
        return;
    }
    
    ballsList.innerHTML = selectedBalls.join(', ');
}

// Ajouter des mariages automatiques
function addAutoMarriages() {
    console.log("Ajouter mariages automatiques");
    const amount = parseInt(document.getElementById('auto-game-amount').value);
    
    if (selectedBalls.length < 2) {
        showNotification("Fò gen omwen 2 boul pou fè maryaj otomatik", "warning");
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        showNotification("Tanpri antre yon kantite valab", "warning");
        return;
    }
    
    // Générer toutes les combinaisons possibles
    let addedCount = 0;
    
    for (let i = 0; i < selectedBalls.length; i++) {
        for (let j = i + 1; j < selectedBalls.length; j++) {
            const ball1 = selectedBalls[i];
            const ball2 = selectedBalls[j];
            
            activeBets.push({
                type: 'marriage',
                name: 'MARYAJ OTOMATIK',
                number: `${ball1}*${ball2}`,
                amount: amount,
                multiplier: betTypes.marriage.multiplier,
                isAuto: true
            });
            
            addedCount++;
        }
    }
    
    updateBetsList();
    showNotification(`${addedCount} maryaj otomatik ajoute avèk siksè!`, "success");
    
    // Retourner à la liste des jeux
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
        selectedBalls = [];
    }, 500);
}

// Ajouter des Lotto 4 automatiques
function addAutoLotto4() {
    console.log("Ajouter Lotto 4 automatiques");
    const amount = parseInt(document.getElementById('auto-game-amount').value);
    const includeReverse = document.getElementById('include-reverse').checked;
    
    if (selectedBalls.length < 2) {
        showNotification("Fò gen omwen 2 boul pou fè Lotto 4 otomatik", "warning");
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        showNotification("Tanpri antre yon kantite valab", "warning");
        return;
    }
    
    // Générer toutes les combinaisons possibles
    let addedCount = 0;
    
    for (let i = 0; i < selectedBalls.length; i++) {
        for (let j = i + 1; j < selectedBalls.length; j++) {
            const ball1 = selectedBalls[i];
            const ball2 = selectedBalls[j];
            
            // Ajouter la combinaison normale
            activeBets.push({
                type: 'lotto4',
                name: 'LOTO 4 OTOMATIK',
                number: ball1 + ball2, // Concaténation pour 4 chiffres
                amount: amount,
                multiplier: betTypes.lotto4.multiplier,
                isAuto: true,
                options: {
                    option1: false,
                    option2: false,
                    option3: true // Seulement l'option 3 pour automatique
                },
                perOptionAmount: amount
            });
            
            addedCount++;
            
            // Ajouter la version renversée si demandée
            if (includeReverse) {
                activeBets.push({
                    type: 'lotto4',
                    name: 'LOTO 4 OTOMATIK (RENVÈSE)',
                    number: ball2 + ball1, // Version renversée
                    amount: amount,
                    multiplier: betTypes.lotto4.multiplier,
                    isAuto: true,
                    options: {
                        option1: false,
                        option2: false,
                        option3: true
                    },
                    perOptionAmount: amount
                });
                
                addedCount++;
            }
        }
    }
    
    updateBetsList();
    showNotification(`${addedCount} Lotto 4 otomatik ajoute avèk siksè!`, "success");
    
    // Retourner à la liste des jeux
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
        selectedBalls = [];
    }, 500);
}

// Charger les types de paris pour édition
function loadBetTypesForEdit() {
    console.log("Charger types pari pour édition");
    const betTypeNav = document.getElementById('bet-type-nav');
    const autoButtons = document.getElementById('auto-buttons');
    const gamesInterface = document.getElementById('games-interface');
    
    // Pour l'édition, on utilise la navigation par catégories
    gamesInterface.style.display = 'none';
    betTypeNav.style.display = 'flex';
    autoButtons.style.display = 'flex';
    
    betTypeNav.innerHTML = '';
    
    // Catégories
    const categories = [
        { id: 'borlette', name: 'BORLETTE' },
        { id: 'lotto', name: 'LOTTO' },
        { id: 'special', name: 'ESPECIAL' }
    ];
    
    categories.forEach(category => {
        const navItem = document.createElement('div');
        navItem.className = 'bet-type-nav-item';
        if (category.id === 'borlette') {
            navItem.classList.add('active');
        }
        navItem.textContent = category.name;
        navItem.setAttribute('data-category', category.id);
        
        navItem.addEventListener('click', function() {
            document.querySelectorAll('.bet-type-nav-item').forEach(item => {
                item.classList.remove('active');
            });
            this.classList.add('active');
            showGameCategoryEdit(category.id);
        });
        
        betTypeNav.appendChild(navItem);
    });
    
    // Configurer les boutons automatiques
    setupAutoButtons();
    
    // Afficher la première catégorie
    showGameCategoryEdit('borlette');
}

// Afficher une catégorie de jeu pour édition
function showGameCategoryEdit(categoryId) {
    console.log("Afficher catégorie pour édition:", categoryId);
    // Cacher toutes les catégories
    document.querySelectorAll('.game-category').forEach(cat => {
        cat.style.display = 'none';
    });
    
    // Afficher la catégorie sélectionnée
    const categoryElement = document.getElementById(`${categoryId}-category`);
    if (categoryElement) {
        categoryElement.style.display = 'block';
    }
    
    currentBetCategory = categoryId;
    
    // Configurer les événements
    setupGameSelection();
}

// Configurer les boutons automatiques
function setupAutoButtons() {
    const autoMarriageBtn = document.getElementById('auto-marriage-btn');
    const autoLotto4Btn = document.getElementById('auto-lotto4-btn');
    const reverseLotto4Btn = document.getElementById('reverse-lotto4-btn');
    
    if (autoMarriageBtn) {
        autoMarriageBtn.addEventListener('click', generateAutoMarriages);
    }
    
    if (autoLotto4Btn) {
        autoLotto4Btn.addEventListener('click', generateAutoLotto4);
    }
    
    if (reverseLotto4Btn) {
        reverseLotto4Btn.addEventListener('click', reverseLotto4Combinations);
    }
}

// Afficher le formulaire de pari avec les nouvelles options Lotto 4 et 5
function showBetForm(gameType) {
    console.log("Afficher formulaire pour:", gameType);
    const bet = betTypes[gameType];
    
    // Cacher l'interface des jeux
    document.getElementById('games-interface').style.display = 'none';
    document.getElementById('bet-type-nav').style.display = 'none';
    document.getElementById('auto-buttons').style.display = 'none';
    
    const betForm = document.getElementById('bet-form');
    betForm.style.display = 'block';
    
    let formHTML = '';
    
    switch(gameType) {
        case 'lotto3':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <p class="info-text"><small>Chwazi 3 chif (lot 1 + 1 chif devan)</small></p>
                <div class="quick-bet-form">
                    <input type="text" id="lotto3-number" class="quick-number-input" 
                           placeholder="000" maxlength="3" pattern="[0-9]{3}"
                           title="Antre 3 chif (0-9)">
                    <input type="number" id="lotto3-amount" class="quick-amount-input" 
                           placeholder="Kantite" min="1">
                    <button class="btn-primary" id="add-bet">Ajoute</button>
                </div>
                <div class="bet-actions">
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
            `;
            break;
            
        case 'marriage':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <div class="form-group">
                    <label>2 Chif yo</label>
                    <div class="number-inputs">
                        <input type="text" id="marriage-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                        <input type="text" id="marriage-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                    </div>
                </div>
                <div class="quick-bet-form">
                    <input type="number" id="marriage-amount" class="quick-amount-input" placeholder="Kantite" min="1">
                    <button class="btn-primary" id="add-bet">Ajoute</button>
                </div>
                <div class="bet-actions">
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
            `;
            break;
            
        case 'borlette':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <p class="info-text"><small>1er lot ×60, 2e lot ×20, 3e lot ×10</small></p>
                <div class="quick-bet-form">
                    <input type="text" id="borlette-number" class="quick-number-input" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                    <input type="number" id="borlette-amount" class="quick-amount-input" placeholder="Kantite" min="1">
                    <button class="btn-primary" id="add-bet">Ajoute</button>
                </div>
                <div class="bet-actions">
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
                <div class="n-balls-container">
                    <div class="n-ball" data-n="0">N0</div>
                    <div class="n-ball" data-n="1">N1</div>
                    <div class="n-ball" data-n="2">N2</div>
                    <div class="n-ball" data-n="3">N3</div>
                    <div class="n-ball" data-n="4">N4</div>
                    <div class="n-ball" data-n="5">N5</div>
                    <div class="n-ball" data-n="6">N6</div>
                    <div class="n-ball" data-n="7">N7</div>
                    <div class="n-ball" data-n="8">N8</div>
                    <div class="n-ball" data-n="9">N9</div>
                </div>
            `;
            break;
            
        case 'boulpe':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <p class="info-text"><small>1er lot ×60, 2e lot ×20, 3e lot ×10</small></p>
                <div class="quick-bet-form">
                    <input type="text" id="boulpe-number" class="quick-number-input" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                    <input type="number" id="boulpe-amount" class="quick-amount-input" placeholder="Kantite" min="1">
                    <button class="btn-primary" id="add-bet">Ajoute</button>
                </div>
                <div class="bet-actions">
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
                <div class="n-balls-container">
                    <div class="n-ball" data-number="00">00</div>
                    <div class="n-ball" data-number="11">11</div>
                    <div class="n-ball" data-number="22">22</div>
                    <div class="n-ball" data-number="33">33</div>
                    <div class="n-ball" data-number="44">44</div>
                    <div class="n-ball" data-number="55">55</div>
                    <div class="n-ball" data-number="66">66</div>
                    <div class="n-ball" data-number="77">77</div>
                    <div class="n-ball" data-number="88">88</div>
                    <div class="n-ball" data-number="99">99</div>
                    <div class="bo-ball" id="bo-all">BO</div>
                </div>
            `;
            break;
            
        case 'lotto4':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <p class="info-text"><small>4 chif (lot 1+2 accumulate) - 3 opsyon</small></p>
                
                <div class="form-group">
                    <label>4 Chif yo</label>
                    <div class="number-inputs">
                        <input type="text" id="lotto4-number1" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                        <input type="text" id="lotto4-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                    </div>
                </div>
                
                <div class="options-container">
                    <div class="option-checkbox">
                        <input type="checkbox" id="lotto4-option1" checked>
                        <label for="lotto4-option1">
                            <strong>Opsyon 1:</strong> lot2 + lot3 (ex: 45 + 34 = 4534)
                        </label>
                        <span class="option-multiplier">×5000</span>
                    </div>
                    
                    <div class="option-checkbox">
                        <input type="checkbox" id="lotto4-option2" checked>
                        <label for="lotto4-option2">
                            <strong>Opsyon 2:</strong> 2 dènye chif lot1 + lot2 (ex: 23 + 45 = 2345)
                        </label>
                        <span class="option-multiplier">×5000</span>
                    </div>
                    
                    <div class="option-checkbox">
                        <input type="checkbox" id="lotto4-option3" checked>
                        <label for="lotto4-option3">
                            <strong>Opsyon 3:</strong> N'importe lòd lot2 ak lot3 (ex: 4523, 3423, 4534, etc.)
                        </label>
                        <span class="option-multiplier">×5000</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="lotto4-amount">Kantite pa opsyon</label>
                    <input type="number" id="lotto4-amount" placeholder="Kantite" min="1" value="1">
                    <small style="color: #7f8c8d;">Total = kantite × nimewo opsyon chwazi</small>
                </div>
                
                <div class="bet-actions">
                    <button class="btn-primary" id="add-bet">Ajoute</button>
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
            `;
            break;
            
        case 'lotto5':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <p class="info-text"><small>5 chif (lot 1+2+3 accumulate) - 3 opsyon</small></p>
                
                <div class="form-group">
                    <label>5 Chif yo</label>
                    <div class="number-inputs">
                        <input type="text" id="lotto5-number1" placeholder="000" maxlength="3" pattern="[0-9]{3}">
                        <input type="text" id="lotto5-number2" placeholder="00" maxlength="2" pattern="[0-9]{2}">
                    </div>
                </div>
                
                <div class="options-container">
                    <div class="option-checkbox">
                        <input type="checkbox" id="lotto5-option1" checked>
                        <label for="lotto5-option1">
                            <strong>Opsyon 1:</strong> lot1 + lot2 (ex: 123 + 45 = 12345)
                        </label>
                        <span class="option-multiplier">×25000</span>
                    </div>
                    
                    <div class="option-checkbox">
                        <input type="checkbox" id="lotto5-option2" checked>
                        <label for="lotto5-option2">
                            <strong>Opsyon 2:</strong> lot1 + lot3 (ex: 123 + 34 = 12334)
                        </label>
                        <span class="option-multiplier">×25000</span>
                    </div>
                    
                    <div class="option-checkbox">
                        <input type="checkbox" id="lotto5-option3" checked>
                        <label for="lotto5-option3">
                            <strong>Opsyon 3:</strong> N'importe fason 5 boul yo (ex: 14523, 13445, 12334, etc.)
                        </label>
                        <span class="option-multiplier">×25000</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="lotto5-amount">Kantite pa opsyon</label>
                    <input type="number" id="lotto5-amount" placeholder="Kantite" min="1" value="1">
                    <small style="color: #7f8c8d;">Total = kantite × nimewo opsyon chwazi</small>
                </div>
                
                <div class="bet-actions">
                    <button class="btn-primary" id="add-bet">Ajoute</button>
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
            `;
            break;
            
        case 'grap':
            formHTML = `
                <h3>${bet.name} - ${bet.description}</h3>
                <p class="info-text"><small>Chwazi boule paire pou grap (3 chif menm)</small></p>
                
                <div style="margin-bottom: 15px;">
                    <div class="all-graps-btn" id="select-all-graps">
                        <i class="fas fa-check-square"></i> Chwazi Tout Graps
                    </div>
                    <div class="all-graps-btn" id="deselect-all-graps">
                        <i class="fas fa-times-circle"></i> Retire Tout Graps
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px;" id="grap-selection-container">
                    <div class="pair-ball" data-pair="111">111</div>
                    <div class="pair-ball" data-pair="222">222</div>
                    <div class="pair-ball" data-pair="333">333</div>
                    <div class="pair-ball" data-pair="444">444</div>
                    <div class="pair-ball" data-pair="555">555</div>
                    <div class="pair-ball" data-pair="666">666</div>
                    <div class="pair-ball" data-pair="777">777</div>
                    <div class="pair-ball" data-pair="888">888</div>
                    <div class="pair-ball" data-pair="999">999</div>
                    <div class="pair-ball" data-pair="000">000</div>
                </div>
                
                <div class="form-group">
                    <label for="grap-amount">Kantite pou chak grap</label>
                    <input type="number" id="grap-amount" placeholder="Kantite" min="1" value="1">
                </div>
                
                <div class="bet-actions">
                    <button class="btn-primary" id="add-selected-graps">Ajoute Graps Chwazi</button>
                    <button class="btn-secondary" id="return-to-types">Retounen</button>
                </div>
            `;
            break;
    }
    
    betForm.innerHTML = formHTML;
    
    // Configurer le focus automatique
    setupAutoFocusInputs();
    
    // Configurer les événements
    if (gameType === 'grap') {
        setupGrapSelection();
    } else {
        // Pour les autres jeux
        const addButton = document.getElementById('add-bet');
        if (addButton) {
            addButton.addEventListener('click', function() {
                addBet(gameType);
            });
        }
    }
    
    const returnButton = document.getElementById('return-to-types');
    if (returnButton) {
        returnButton.addEventListener('click', function() {
            document.getElementById('bet-form').style.display = 'none';
            document.getElementById('bet-type-nav').style.display = 'none';
            document.getElementById('auto-buttons').style.display = 'none';
            document.getElementById('games-interface').style.display = 'block';
        });
    }
    
    if (gameType === 'boulpe') {
        document.querySelectorAll('.n-ball[data-number]').forEach(ball => {
            ball.addEventListener('click', function() {
                const number = this.getAttribute('data-number');
                document.getElementById('boulpe-number').value = number;
                document.getElementById('boulpe-amount').focus();
            });
        });
        
        document.getElementById('bo-all').addEventListener('click', function() {
            const amount = prompt("Kantite pou chak boule pe (00-99):", "1");
            if (amount && !isNaN(amount) && amount > 0) {
                const numbers = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
                
                activeBets.push({
                    type: gameType,
                    name: 'BOUL PE (Tout)',
                    number: '00-99',
                    amount: parseInt(amount) * numbers.length,
                    multiplier: bet.multiplier,
                    isGroup: true,
                    details: numbers.map(n => ({number: n, amount: parseInt(amount)}))
                });
                
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
                for (let i = 0; i <= 9; i++) {
                    numbers.push(i.toString() + n);
                }
                
                const amount = prompt(`Kantite pou chak boule nan N${n}:`, "1");
                if (amount && !isNaN(amount) && amount > 0) {
                    activeBets.push({
                        type: gameType,
                        name: `N${n} (Tout)`,
                        number: `0${n}-9${n}`,
                        amount: parseInt(amount) * numbers.length,
                        multiplier: bet.multiplier,
                        isGroup: true,
                        details: numbers.map(num => ({number: num, amount: parseInt(amount)}))
                    });
                    
                    updateBetsList();
                    showNotification(`${numbers.length} boule N${n} ajoute avèk siksè!`, "success");
                }
            });
        });
    }
    
    // Focus automatique sur le premier champ
    const numberInput = betForm.querySelector('input[type="text"]');
    if (numberInput) {
        numberInput.focus();
    }
    
    document.getElementById('active-bets').style.display = 'block';
}

// Configurer la sélection des graps
function setupGrapSelection() {
    console.log("Configuration sélection graps");
    const grapBalls = document.querySelectorAll('#grap-selection-container .pair-ball');
    let selectedGraps = new Set();
    
    // Sélectionner/désélectionner un grap
    grapBalls.forEach(ball => {
        ball.addEventListener('click', function() {
            this.classList.toggle('selected');
            const pair = this.getAttribute('data-pair');
            
            if (this.classList.contains('selected')) {
                selectedGraps.add(pair);
            } else {
                selectedGraps.delete(pair);
            }
            console.log("Grap sélectionné:", pair, Array.from(selectedGraps));
        });
    });
    
    // Sélectionner tous les graps
    document.getElementById('select-all-graps').addEventListener('click', function() {
        grapBalls.forEach(ball => {
            ball.classList.add('selected');
            const pair = ball.getAttribute('data-pair');
            selectedGraps.add(pair);
        });
        console.log("Tous graps sélectionnés");
    });
    
    // Désélectionner tous les graps
    document.getElementById('deselect-all-graps').addEventListener('click', function() {
        grapBalls.forEach(ball => {
            ball.classList.remove('selected');
            const pair = ball.getAttribute('data-pair');
            selectedGraps.delete(pair);
        });
        console.log("Tous graps désélectionnés");
    });
    
    // Ajouter les graps sélectionnés
    document.getElementById('add-selected-graps').addEventListener('click', function() {
        addSelectedGraps(selectedGraps);
    });
}

// Ajouter les graps sélectionnés
function addSelectedGraps(selectedGraps) {
    console.log("Ajouter graps:", Array.from(selectedGraps));
    const amount = parseInt(document.getElementById('grap-amount').value);
    const selectedBalls = document.querySelectorAll('#grap-selection-container .pair-ball.selected');
    
    if (selectedBalls.length === 0) {
        showNotification("Tanpri chwazi omwen yon grap", "warning");
        return;
    }
    
    if (isNaN(amount) || amount <= 0) {
        showNotification("Tanpri antre yon kantite valab", "warning");
        return;
    }
    
    let addedCount = 0;
    
    selectedBalls.forEach(ball => {
        const pair = ball.getAttribute('data-pair');
        
        activeBets.push({
            type: 'grap',
            name: 'GRAP',
            number: pair,
            amount: amount,
            multiplier: betTypes.grap.multiplier
        });
        
        addedCount++;
        
        // Désélectionner après ajout
        ball.classList.remove('selected');
        selectedGraps.delete(pair);
    });
    
    updateBetsList();
    showNotification(`${addedCount} graps ajoute avèk siksè!`, "success");
    
    // Réinitialiser le formulaire
    document.getElementById('grap-amount').value = '1';
}

// Générer les mariages automatiques (ancienne version)
function generateAutoMarriages() {
    console.log("Générer mariages automatiques");
    // Récupérer toutes les boules borlette/boulpe jouées
    const borletteBalls = activeBets.filter(bet => 
        (bet.type === 'borlette' || bet.type === 'boulpe') && 
        !bet.isGroup && 
        bet.number.length === 2
    ).map(bet => bet.number);
    
    if (borletteBalls.length < 2) {
        showNotification("Fò gen omwen 2 boule borlette pou fè maryaj otomatik", "warning");
        return;
    }
    
    const amount = prompt("Kantite pou chak maryaj:", "1");
    if (!amount || isNaN(amount) || amount <= 0) {
        return;
    }
    
    // Générer toutes les combinaisons possibles
    for (let i = 0; i < borletteBalls.length; i++) {
        for (let j = i + 1; j < borletteBalls.length; j++) {
            const ball1 = borletteBalls[i];
            const ball2 = borletteBalls[j];
            
            activeBets.push({
                type: 'marriage',
                name: 'MARYAJ',
                number: `${ball1}*${ball2}`,
                amount: parseInt(amount),
                multiplier: betTypes.marriage.multiplier
            });
        }
    }
    
    updateBetsList();
    showNotification(`${borletteBalls.length * (borletteBalls.length - 1) / 2} maryaj otomatik ajoute!`, "success");
}

// Générer les Lotto 4 automatiques (ancienne version)
function generateAutoLotto4() {
    console.log("Générer Lotto 4 automatiques");
    // Récupérer toutes les boules borlette/boulpe jouées
    const borletteBalls = activeBets.filter(bet => 
        (bet.type === 'borlette' || bet.type === 'boulpe') && 
        !bet.isGroup && 
        bet.number.length === 2
    ).map(bet => bet.number);
    
    if (borletteBalls.length < 2) {
        showNotification("Fò gen omwen 2 boul pou fè Lotto 4 otomatik", "warning");
        return;
    }
    
    const amount = prompt("Kantite pou chak Lotto 4:", "1");
    if (!amount || isNaN(amount) || amount <= 0) {
        return;
    }
    
    // Générer toutes les combinaisons possibles de 2 boules
    for (let i = 0; i < borletteBalls.length; i++) {
        for (let j = i + 1; j < borletteBalls.length; j++) {
            const ball1 = borletteBalls[i];
            const ball2 = borletteBalls[j];
            
            activeBets.push({
                type: 'lotto4',
                name: 'LOTO 4',
                number: `${ball1}*${ball2}`,
                amount: parseInt(amount),
                multiplier: betTypes.lotto4.multiplier
            });
        }
    }
    
    updateBetsList();
    showNotification(`${borletteBalls.length * (borletteBalls.length - 1) / 2} Lotto 4 otomatik ajoute!`, "success");
}

// Renverser les combinaisons Lotto 4
function reverseLotto4Combinations() {
    console.log("Renverser Lotto 4");
    // Récupérer tous les Lotto 4 existants
    const lotto4Bets = activeBets.filter(bet => bet.type === 'lotto4' && !bet.isAuto);
    
    if (lotto4Bets.length === 0) {
        showNotification("Pa gen Lotto 4 pou renverse", "warning");
        return;
    }
    
    const amount = prompt("Kantite pou chak Lotto 4 renverse:", "1");
    if (!amount || isNaN(amount) || amount <= 0) {
        return;
    }
    
    // Pour chaque Lotto 4, créer la version renversée
    lotto4Bets.forEach(bet => {
        // Extraire les boules (format: "1234" pour 4 chiffres)
        if (bet.number.length === 4) {
            const ball1 = bet.number.substring(0, 2);
            const ball2 = bet.number.substring(2, 4);
            
            // Renverser: 1234 devient 3412
            const reversedNumber = ball2 + ball1;
            
            // Copier les options du pari original
            activeBets.push({
                type: 'lotto4',
                name: 'LOTO 4 (RENVÈSE)',
                number: reversedNumber,
                amount: parseInt(amount),
                multiplier: betTypes.lotto4.multiplier,
                options: bet.options || { option1: true, option2: true, option3: true },
                perOptionAmount: parseInt(amount)
            });
        }
    });
    
    updateBetsList();
    showNotification(`${lotto4Bets.length} Lotto 4 renverse ajoute!`, "success");
}

// Soumettre les paris
function submitBets() {
    console.log("Soumettre paris");
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou soumèt", "warning");
        return;
    }
    
    // Vérifier si le tirage est bloqué
    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = draws[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab soumèt parye 5 minit avan.`, "error");
        return;
    }
    
    let drawInfo = draws[currentDraw].name;
    if (currentDrawTime) {
        drawInfo += ` (${currentDrawTime === 'morning' ? 'Maten' : 'Swè'})`;
    }
    
    showNotification(`${activeBets.length} parye soumèt avèk siksè pou ${drawInfo}!`, "success");
    
    saveBetsToHistory();
    
    activeBets = [];
    updateBetsList();
    closeBettingScreen();
}

// Enregistrer les paris dans l'historique via API
async function saveBetsToHistory() {
    try {
        const record = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            draw: currentDraw,
            drawTime: currentDrawTime,
            bets: [...activeBets],
            total: activeBets.reduce((sum, bet) => sum + bet.amount, 0)
        };
        
        await apiCall(APP_CONFIG.history, 'POST', record);
        console.log("Historique sauvegardé via API");
    } catch (error) {
        console.error("Erreur lors de la sauvegarde de l'historique:", error);
        showNotification("Erreur de sauvegarde de l'historique", "error");
    }
}

// Fermer l'écran de pari
function closeBettingScreen() {
    console.log("Fermer écran pari");
    const bettingScreen = document.getElementById('betting-screen');
    bettingScreen.classList.remove('slide-in');
    bettingScreen.classList.add('slide-out');
    
    setTimeout(() => {
        bettingScreen.style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    }, 300);
}

// Vérifier la connexion avant sauvegarde et impression
async function checkConnectionBeforeSavePrint() {
    console.log("Vérification connexion avant sauvegarde/impression");
    const connectionCheck = document.getElementById('connection-check');
    connectionCheck.style.display = 'flex';
    
    // Vérifier Internet
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
    
    // Pour la démo, on simule que tout est ok
    setTimeout(() => {
        connectionCheck.style.display = 'none';
        saveAndPrintTicket();
    }, 1500);
}

// Vérifier la connexion avant impression
async function checkConnectionBeforePrint() {
    console.log("Vérification connexion avant impression");
    const connectionCheck = document.getElementById('connection-check');
    connectionCheck.style.display = 'flex';
    
    // Pour l'impression seule, on est moins strict
    document.getElementById('connection-message').textContent = 'Koneksyon entènèt ok. Wap kontinye...';
    
    setTimeout(() => {
        connectionCheck.style.display = 'none';
        printTicket();
    }, 1000);
}

// Réessayer la connexion
function retryConnectionCheck() {
    console.log("Réessayer connexion");
    if (document.getElementById('save-print-ticket').disabled) {
        checkConnectionBeforeSavePrint();
    } else {
        checkConnectionBeforePrint();
    }
}

// Annuler l'impression
function cancelPrint() {
    console.log("Annuler impression");
    document.getElementById('connection-check').style.display = 'none';
}

// Grouper les paris par type
function groupBetsByType(bets) {
    const grouped = {};
    
    bets.forEach(bet => {
        if (!grouped[bet.name]) {
            grouped[bet.name] = [];
        }
        
        if (bet.type === 'boulpe') {
            const existingBet = grouped[bet.name].find(b => b.number === bet.number);
            if (existingBet) {
                existingBet.amount += bet.amount;
            } else {
                grouped[bet.name].push({...bet});
            }
        } else {
            grouped[bet.name].push({...bet});
        }
    });
    
    return grouped;
}

// Mettre à jour l'écran des fiches gagnantes
function updateWinningTicketsScreen() {
    console.log("Mise à jour fiches gagnantes");
    const winningTicketsList = document.getElementById('winning-tickets-list');
    
    // Afficher les tickets gagnants détectés
    winningTicketsList.innerHTML = '';
    
    if (winningTickets.length === 0) {
        winningTicketsList.innerHTML = '<p>Pa gen fiche gagnant pou montre.</p>';
        return;
    }
    
    winningTickets.forEach(ticket => {
        const ticketItem = document.createElement('div');
        ticketItem.className = 'history-item winning-ticket';
        
        let betsHTML = '';
        ticket.winningBets.forEach(winBet => {
            betsHTML += `
                <div class="history-bet">
                    <span>${winBet.name}: ${winBet.number}</span>
                    <span style="color: var(--success-color); font-weight: bold;">+${winBet.winAmount} G (${winBet.winType})</span>
                </div>
            `;
        });
        
        ticketItem.innerHTML = `
            <div class="history-header">
                <span class="history-draw">Fiche #${String(ticket.number).padStart(6, '0')}</span>
                <span class="history-date">${new Date(ticket.date).toLocaleString()}</span>
            </div>
            <div class="history-bets">
                ${betsHTML}
            </div>
            <div class="history-total">
                <span>Total Gains:</span>
                <span style="color: var(--success-color); font-weight: bold;">${ticket.totalWinnings} G</span>
            </div>
        `;
        
        winningTicketsList.appendChild(ticketItem);
    });
}

// Rechercher dans l'historique
function searchHistory() {
    console.log("Recherche historique");
    const searchTerm = document.getElementById('search-history').value.toLowerCase();
    const historyItems = document.querySelectorAll('#history-list .history-item');
    
    historyItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Rechercher dans les fiches gagnantes
function searchWinningTickets() {
    console.log("Recherche fiches gagnantes");
    const searchTerm = document.getElementById('search-winning-tickets').value.toLowerCase();
    const winningItems = document.querySelectorAll('#winning-tickets-list .history-item');
    
    winningItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Mettre à jour l'écran historique
function updateHistoryScreen() {
    console.log("Mise à jour historique");
    const reportsContainer = document.getElementById('reports-container');
    const historyList = document.getElementById('history-list');
    
    reportsContainer.innerHTML = '';
    
    const generalBtn = document.createElement('button');
    generalBtn.className = 'report-btn general';
    generalBtn.textContent = 'Rapò Jeneral';
    generalBtn.addEventListener('click', function() {
        generateGeneralReport();
    });
    reportsContainer.appendChild(generalBtn);
    
    for (const [drawId, draw] of Object.entries(draws)) {
        const morningBtn = document.createElement('button');
        morningBtn.className = 'report-btn';
        morningBtn.textContent = `${draw.name} Midi`;
        morningBtn.addEventListener('click', function() {
            generateDrawReport(drawId, 'morning');
        });
        reportsContainer.appendChild(morningBtn);
        
        const eveningBtn = document.createElement('button');
        eveningBtn.className = 'report-btn';
        eveningBtn.textContent = `${draw.name} Swè`;
        eveningBtn.addEventListener('click', function() {
            generateDrawReport(drawId, 'evening');
        });
        reportsContainer.appendChild(eveningBtn);
    }
    
    historyList.innerHTML = '';
    
    if (savedTickets.length === 0) {
        historyList.innerHTML = '<p>Pa gen fiche ki sove.</p>';
        return;
    }
    
    const sortedTickets = [...savedTickets].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedTickets.forEach(ticket => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const ticketDate = new Date(ticket.date);
        const now = new Date();
        const timeDiff = now - ticketDate;
        const canEdit = timeDiff <= FIVE_MINUTES;
        
        const groupedBets = groupBetsByType(ticket.bets);
        let betsHTML = '';
        
        for (const [type, bets] of Object.entries(groupedBets)) {
            betsHTML += `<div style="margin-bottom: 8px;"><strong>${type}:</strong> `;
            const betStrings = bets.map(bet => {
                let betInfo = bet.number;
                if (bet.isLotto4 || bet.isLotto5) {
                    const options = [];
                    if (bet.options?.option1) options.push('O1');
                    if (bet.options?.option2) options.push('O2');
                    if (bet.options?.option3) options.push('O3');
                    if (options.length > 0) {
                        betInfo += ` (${options.join(',')})`;
                    }
                }
                return `${betInfo} (${bet.amount} G)`;
            });
            betsHTML += betStrings.join(', ') + '</div>';
        }
        
        historyItem.innerHTML = `
            <div class="history-header">
                <span class="history-draw">${draws[ticket.draw].name} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})</span>
                <span class="history-date">${ticketDate.toLocaleString()}</span>
            </div>
            <div class="history-bets">
                ${betsHTML}
            </div>
            <div class="history-total">
                <span>Total:</span>
                <span>${ticket.total} G</span>
            </div>
            ${canEdit ? `
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="edit-btn" onclick="loadTicketForEdit('${ticket.id}')">
                        <i class="fas fa-edit"></i> Modifye
                    </button>
                    <button class="delete-btn" onclick="deleteTicket('${ticket.id}')">
                        <i class="fas fa-trash"></i> Efase
                    </button>
                </div>
            ` : ''}
        `;
        
        historyList.appendChild(historyItem);
    });
}

// Mettre à jour l'écran de gestion des fiches
function updateTicketManagementScreen() {
    console.log("Mise à jour écran gestion fiches");
    const ticketList = document.getElementById('ticket-management-list');
    
    if (savedTickets.length === 0) {
        ticketList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #7f8c8d;">
                <i class="fas fa-file-invoice" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <p>Pa gen fiche ki sove.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Combiner toutes les fiches
    const allTickets = [...savedTickets];
    
    // Trier par date (plus récent d'abord)
    const sortedTickets = [...allTickets].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedTickets.forEach(ticket => {
        const ticketDate = new Date(ticket.date);
        const now = new Date();
        const timeDiff = now - ticketDate;
        const canEdit = timeDiff <= FIVE_MINUTES;
        
        // Grouper les paris pour l'affichage
        const groupedBets = groupBetsByType(ticket.bets);
        let betsHTML = '';
        
        for (const [type, bets] of Object.entries(groupedBets)) {
            const betCount = bets.length;
            const totalAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);
            betsHTML += `<div style="margin-bottom: 5px;"><strong>${type}:</strong> ${betCount} parye (${totalAmount} G)</div>`;
        }
        
        html += `
            <div class="ticket-management">
                <div class="ticket-management-header">
                    <div>
                        <strong>Fiche #${String(ticket.number).padStart(6, '0')}</strong>
                        ${ticket.draw ? `<div style="font-size: 0.9rem; color: #7f8c8d;">${draws[ticket.draw]?.name || 'Tiraj'} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})</div>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <div>${ticketDate.toLocaleString()}</div>
                        ${ticket.total ? `<div style="font-weight: bold;">${ticket.total} G</div>` : ''}
                    </div>
                </div>
                <div class="ticket-details">
                    ${betsHTML}
                    ${ticket.agent_name ? `<div><strong>Ajan:</strong> ${ticket.agent_name}</div>` : ''}
                </div>
                ${canEdit ? `
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="edit-btn" onclick="loadTicketForEdit('${ticket.id}')">
                            <i class="fas fa-edit"></i> Modifye
                        </button>
                        <button class="delete-btn" onclick="deleteTicket('${ticket.id}')">
                            <i class="fas fa-trash"></i> Efase
                        </button>
                    </div>
                ` : `
                    <div style="margin-top: 10px; color: #7f8c8d; font-size: 0.9rem;">
                        <i class="fas fa-info-circle"></i> Fiche sa pa ka modifye ankò (5 minit deja pase)
                    </div>
                `}
            </div>
        `;
    });
    
    ticketList.innerHTML = html;
}

// Charger un ticket pour modification
window.loadTicketForEdit = function(ticketId) {
    console.log("Charger ticket pour modification:", ticketId);
    
    // Trouver le ticket
    const allTickets = [...savedTickets];
    const ticketIndex = allTickets.findIndex(t => t.id === ticketId);
    
    if (ticketIndex === -1) {
        showNotification("Fiche pa jwenn", "error");
        return;
    }
    
    const ticket = allTickets[ticketIndex];
    
    // Vérifier si on peut encore modifier (5 minutes)
    const ticketDate = new Date(ticket.date);
    const now = new Date();
    const timeDiff = now - ticketDate;
    
    if (timeDiff > FIVE_MINUTES) {
        showNotification("Fiche sa pa ka modifye ankò. 5 minit deja pase.", "warning");
        return;
    }
    
    // Demander confirmation
    if (!confirm(`Èske ou vreman vle modifye fiche #${String(ticket.number).padStart(6, '0')}? Fiche sa pral efase epi parye yo pral mete nan panier aktif.`)) {
        return;
    }
    
    // Mettre les paris dans les paris actifs
    activeBets = [...ticket.bets];
    
    // Mettre à jour le tiraj actuel
    currentDraw = ticket.draw;
    currentDrawTime = ticket.drawTime;
    
    // Supprimer le ticket des listes
    const savedIndex = savedTickets.findIndex(t => t.id === ticketId);
    if (savedIndex !== -1) {
        savedTickets.splice(savedIndex, 1);
    }
    
    // Mettre à jour l'affichage
    updateBetsList();
    updateTicketManagementScreen();
    
    // Ouvrir l'écran de pari
    openBettingScreen(ticket.draw, ticket.drawTime);
    
    showNotification(`Fiche #${String(ticket.number).padStart(6, '0')} chaje pou modification`, "success");
};

// Supprimer un ticket
window.deleteTicket = function(ticketId) {
    console.log("Supprimer ticket:", ticketId);
    
    // Trouver le ticket
    const allTickets = [...savedTickets];
    const ticket = allTickets.find(t => t.id === ticketId);
    
    if (!ticket) {
        showNotification("Fiche pa jwenn", "error");
        return;
    }
    
    // Vérifier si on peut encore supprimer (5 minutes)
    const ticketDate = new Date(ticket.date);
    const now = new Date();
    const timeDiff = now - ticketDate;
    
    if (timeDiff > FIVE_MINUTES) {
        showNotification("Fiche sa pa ka efase ankò. 5 minit deja pase.", "warning");
        return;
    }
    
    // Demander confirmation
    if (!confirm(`Èske ou vreman vle efase fiche #${String(ticket.number).padStart(6, '0')}? Aksyon sa a pa ka anile.`)) {
        return;
    }
    
    // Supprimer le ticket des listes
    const savedIndex = savedTickets.findIndex(t => t.id === ticketId);
    if (savedIndex !== -1) {
        savedTickets.splice(savedIndex, 1);
    }
    
    // Mettre à jour l'affichage
    updateTicketManagementScreen();
    
    showNotification(`Fiche #${String(ticket.number).padStart(6, '0')} efase avèk siksè`, "success");
};

// Rechercher un ticket
function searchTicket() {
    const searchTerm = document.getElementById('search-ticket-number').value.toLowerCase();
    const ticketItems = document.querySelectorAll('#ticket-management-list .ticket-management');
    
    if (!searchTerm) {
        // Si la recherche est vide, tout afficher
        ticketItems.forEach(item => {
            item.style.display = 'block';
        });
        return;
    }
    
    ticketItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// Afficher toutes les fiches
function showAllTickets() {
    document.getElementById('search-ticket-number').value = '';
    updateTicketManagementScreen();
}

function generateEndOfDrawReport() {
    const reportScreen = document.getElementById('report-screen');
    const reportContent = document.getElementById('report-content');
    
    // Calculer les totaux
    let totalBets = savedTickets.length;
    let totalAmount = savedTickets.reduce((sum, ticket) => sum + ticket.total, 0);
    
    reportContent.innerHTML = `
        <div class="report-header">
            <h3>${companyInfo.reportTitle}</h3>
            <p>Rapò Fin Tiraj</p>
            <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="report-details">
            <div class="report-row">
                <span>Nimewo fiche:</span>
                <span>${totalBets}</span>
            </div>
            <div class="report-row">
                <span>Montan total:</span>
                <span>${totalAmount} G</span>
            </div>
            <div class="report-row total">
                <span>TOTAL GENERAL:</span>
                <span>${totalAmount} G</span>
            </div>
        </div>
        <p style="margin-top: 20px; text-align: center;">
            <strong>Tel:</strong> ${companyInfo.reportPhone}<br>
            <strong>Adrès:</strong> ${companyInfo.address}
        </p>
    `;
    
    document.querySelector('.container').style.display = 'none';
    reportScreen.style.display = 'block';
}

function generateGeneralReport() {
    const reportResults = document.getElementById('report-results');
    reportResults.innerHTML = `
        <div class="report-results">
            <h3>Rapò Jeneral</h3>
            <div class="report-item">
                <span>Total fiche:</span>
                <span>${savedTickets.length}</span>
            </div>
            <div class="report-item">
                <span>Total montan:</span>
                <span>${savedTickets.reduce((sum, ticket) => sum + ticket.total, 0)} G</span>
            </div>
        </div>
    `;
}

function generateDrawReport(drawId, time) {
    const reportResults = document.getElementById('report-results');
    
    const drawTickets = savedTickets.filter(ticket => 
        ticket.draw === drawId && ticket.drawTime === time
    );
    
    reportResults.innerHTML = `
        <div class="report-results">
            <h3>Rapò ${draws[drawId].name} (${time === 'morning' ? 'Maten' : 'Swè'})</h3>
            <div class="report-item">
                <span>Nimewo fiche:</span>
                <span>${drawTickets.length}</span>
            </div>
            <div class="report-item">
                <span>Total montan:</span>
                <span>${drawTickets.reduce((sum, ticket) => sum + ticket.total, 0)} G</span>
            </div>
        </div>
    `;
}

// Fonctions pour la gestion des tickets dans l'historique
window.loadTicketForEditFromHistory = function(ticketId) {
    console.log("Charger ticket pour édition depuis historique:", ticketId);
    
    // Trouver le ticket dans savedTickets
    const ticketIndex = savedTickets.findIndex(t => t.id === ticketId);
    
    if (ticketIndex === -1) {
        showNotification("Fiche pa jwenn", "error");
        return;
    }
    
    const ticket = savedTickets[ticketIndex];
    
    // Vérifier si on peut encore modifier (5 minutes)
    const ticketDate = new Date(ticket.date);
    const now = new Date();
    const timeDiff = now - ticketDate;
    
    if (timeDiff > FIVE_MINUTES) {
        showNotification("Fiche sa pa ka modifye ankò. 5 minit deja pase.", "warning");
        return;
    }
    
    // Demander confirmation
    if (!confirm(`Èske ou vreman vle modifye fiche #${String(ticket.number).padStart(6, '0')}? Fiche sa pral efase epi parye yo pral mete nan panier aktif.`)) {
        return;
    }
    
    // Mettre les paris dans les paris actifs
    activeBets = [...ticket.bets];
    
    // Mettre à jour le tiraj actuel
    currentDraw = ticket.draw;
    currentDrawTime = ticket.drawTime;
    
    // Supprimer le ticket
    savedTickets.splice(ticketIndex, 1);
    
    // Mettre à jour l'affichage
    updateBetsList();
    updateHistoryScreen();
    
    // Ouvrir l'écran de pari
    openBettingScreen(ticket.draw, ticket.drawTime);
    
    showNotification(`Fiche #${String(ticket.number).padStart(6, '0')} chaje pou modification`, "success");
};

window.deleteTicketFromHistory = function(ticketId) {
    console.log("Supprimer ticket depuis historique:", ticketId);
    
    // Trouver le ticket
    const ticketIndex = savedTickets.findIndex(t => t.id === ticketId);
    
    if (ticketIndex === -1) {
        showNotification("Fiche pa jwenn", "error");
        return;
    }
    
    const ticket = savedTickets[ticketIndex];
    
    // Vérifier si on peut encore supprimer (5 minutes)
    const ticketDate = new Date(ticket.date);
    const now = new Date();
    const timeDiff = now - ticketDate;
    
    if (timeDiff > FIVE_MINUTES) {
        showNotification("Fiche sa pa ka efase ankò. 5 minit deja pase.", "warning");
        return;
    }
    
    // Demander confirmation
    if (!confirm(`Èske ou vreman vle efase fiche #${String(ticket.number).padStart(6, '0')}? Aksyon sa a pa ka anile.`)) {
        return;
    }
    
    // Supprimer le ticket
    savedTickets.splice(ticketIndex, 1);
    
    // Mettre à jour l'affichage
    updateHistoryScreen();
    
    showNotification(`Fiche #${String(ticket.number).padStart(6, '0')} efase avèk siksè`, "success");
};

// Mettre à jour la notification du total pour les paris normaux
function updateNormalBetTotalNotification() {
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    if (total > 0) {
        showTotalNotification(total, 'normal');
    }
}
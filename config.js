// Configuration API Backend
const API_BASE_URL = 'https://lotatonova-fv0b.onrender.com';

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
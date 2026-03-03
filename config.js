const API_CONFIG = {
    BASE_URL: 'https://lotata-islp.onrender.com/api',
    ENDPOINTS: {
        LOGIN: '/auth/login',
        SAVE_TICKET: '/tickets/save',
        GET_TICKETS: '/tickets',
        GET_REPORTS: '/reports',
        GET_DRAWS: '/draws',
        GET_WINNERS: '/winners',
        GET_WINNING_RESULTS: '/winners/results',
        PAY_WINNER: '/winners/pay',
        GET_AGENTS: '/agents',
        DELETE_TICKET: '/tickets',
        GET_DRAW_REPORT: '/reports/draw',
        GET_LOTTERY_CONFIG: '/lottery-config',
        CHECK_WINNING_TICKETS: '/tickets/check-winners'
    }
};

const CONFIG = {
    CURRENCY: 'Gdes',
    GAMING_RULES: {
        BORLETTE: { lot1: 60, lot2: 20, lot3: 10 },
        LOTTO3: 500,
        LOTTO4: 1000,
        LOTTO5: 5000,
        MARIAGE: 1000,
        AUTO_MARRIAGE: 1000,
        AUTO_LOTTO4: 1000,
        AUTO_LOTTO5: 5000
    },
    // Tirages par défaut (fallback si serveur indisponible)
    DRAWS: [
        { id: 'tn_matin', name: 'Tunisia Matin', time: '10:00', color: 'var(--tunisia)' },
        { id: 'tn_soir', name: 'Tunisia Soir', time: '17:00', color: 'var(--tunisia)' },
        { id: 'fl_matin', name: 'Florida Matin', time: '13:30', color: 'var(--florida)' },
        { id: 'fl_soir', name: 'Florida Soir', time: '21:50', color: 'var(--florida)' },
        { id: 'ny_matin', name: 'New York Matin', time: '14:30', color: 'var(--newyork)' },
        { id: 'ny_soir', name: 'New York Soir', time: '20:00', color: 'var(--newyork)' },
        { id: 'ga_matin', name: 'Georgia Matin', time: '12:30', color: 'var(--georgia)' },
        { id: 'ga_soir', name: 'Georgia Soir', time: '19:00', color: 'var(--georgia)' },
        { id: 'tx_matin', name: 'Texas Matin', time: '11:30', color: 'var(--texas)' },
        { id: 'tx_soir', name: 'Texas Soir', time: '18:30', color: 'var(--texas)' }
    ],
    LOTTERY_NAME: 'LOTATO PRO',
    LOTTERY_LOGO: 'https://raw.githubusercontent.com/your-username/your-repo/main/logo.png',
    LOTTERY_ADDRESS: '',
    LOTTERY_PHONE: ''
};

// État initial – valeurs lues depuis localStorage + nouvelles propriétés
let APP_STATE = {
    selectedDraw: 'tn_matin',
    selectedDraws: ['tn_matin'],
    multiDrawMode: false,
    selectedGame: 'borlette',
    currentCart: [],
    ticketsHistory: [],
    winningTickets: [],
    winningResults: [],
    lotto4Options: [true, true, true],
    lotto5Options: [true, true, true],
    showNumericChips: false,
    showLottoGames: false,
    showSpecialGames: false,
    currentTab: 'home',
    isDrawBlocked: false,
    agentId: localStorage.getItem('agent_id') || null,
    agentName: localStorage.getItem('agent_name') || 'Agent',
    lotteryConfig: null,
    // NOUVEAU : données chargées depuis le serveur
    draws: null,                 // tirages avec leur statut actif
    globalBlockedNumbers: [],    // numéros globalement bloqués
    drawBlockedNumbers: {}       // dictionnaire : drawId -> [numéros bloqués]
};
// ============================================================
// server.js — Tonton Kondo Paryaj Backend
// Node.js + Express + PostgreSQL (Neon)
// Version complète avec tous les endpoints pour app.html
// ============================================================

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const path = require('path');

// Fichier de configuration optionnel (si vous utilisez des variables d'environnement via dotenv)
try {
  require('dotenv').config();
} catch(e) {}
let CONFIG = {};
try {
  CONFIG = require('./config.js');
} catch(e) {}

// ── CONFIG PAIEMENT PLOP PLOP ─────────────────────────────────
const MERCHANT_CLIENT_ID = process.env.MERCHANT_CLIENT_ID || CONFIG.MERCHANT_CLIENT_ID;
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY || CONFIG.MERCHANT_SECRET_KEY;
const PLOPPLOP_BASE = process.env.PLOPPLOP_BASE_URL || CONFIG.PLOPPLOP_BASE_URL;

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS & MIDDLEWARES ──────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(__dirname));  // sert les fichiers statiques (HTML, CSS, JS)

// ── DATABASE ───────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── CONFIG ─────────────────────────────────────────────────
const ADMIN_PASSWORD    = process.env.ADMIN_PASSWORD    || 'admin';
const FOOTBALL_API_KEY  = process.env.FOOTBALL_API_KEY  || '';
const JACKPOT_PCT       = 5; // 5%

// ── TABLE INIT (création automatique des tables) ───────────
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      user_code TEXT,
      user_phone TEXT,
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days'
    );
    CREATE TABLE IF NOT EXISTS directors (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone TEXT,
      phone TEXT,
      pwd_hash TEXT NOT NULL,
      pct REAL DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cashiers (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dir_code TEXT REFERENCES directors(code),
      phone TEXT,
      pwd_hash TEXT NOT NULL,
      jeu TEXT DEFAULT 'all',
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      pwd_hash TEXT NOT NULL,
      solde REAL DEFAULT 0,
      dir_code TEXT REFERENCES directors(code),
      caiss_code TEXT REFERENCES cashiers(code),
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bets (
      id SERIAL PRIMARY KEY,
      player_phone TEXT REFERENCES players(phone),
      dir_code TEXT REFERENCES directors(code),
      caiss_code TEXT REFERENCES cashiers(code),
      type TEXT NOT NULL,
      sub_type TEXT,
      selection TEXT,
      mise REAL,
      cote REAL,
      gain_potentiel REAL,
      draw TEXT,
      match_id TEXT,
      match_name TEXT,
      statut TEXT DEFAULT 'en_attente',
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      player_phone TEXT REFERENCES players(phone),
      dir_code TEXT REFERENCES directors(code),
      caiss_code TEXT REFERENCES cashiers(code),
      type TEXT,
      montant REAL,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS recharges (
      id SERIAL PRIMARY KEY,
      player_phone TEXT REFERENCES players(phone),
      dir_code TEXT REFERENCES directors(code),
      caiss_code TEXT REFERENCES cashiers(code),
      montant REAL,
      methode TEXT,
      reference_id TEXT,
      transaction_id TEXT,
      statut TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS borlette_results (
      id SERIAL PRIMARY KEY,
      draw TEXT NOT NULL,
      lotto3 TEXT,
      lot1 TEXT,
      lot2 TEXT,
      lot3 TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS borlette_blocked (
      id SERIAL PRIMARY KEY,
      number TEXT NOT NULL,
      draw TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(number, draw)
    );
    CREATE TABLE IF NOT EXISTS borlette_limits (
      id SERIAL PRIMARY KEY,
      number TEXT NOT NULL,
      draw TEXT DEFAULT '',
      max_amount REAL NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(number, draw)
    );
    CREATE TABLE IF NOT EXISTS jackpots (
      dir_code TEXT PRIMARY KEY REFERENCES directors(code),
      amount REAL DEFAULT 0,
      week_sales REAL DEFAULT 0,
      last_reset TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS jackpot_history (
      id SERIAL PRIMARY KEY,
      dir_code TEXT REFERENCES directors(code),
      amount REAL,
      winner_phone TEXT,
      winner_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS game_difficulty (
      id SERIAL PRIMARY KEY,
      dir_code TEXT REFERENCES directors(code),
      game_name TEXT NOT NULL,
      win_probability INTEGER DEFAULT 45,
      UNIQUE(dir_code, game_name)
    );
  `);
  console.log('✅ Tables vérifiées/créées');
})();

// ── HELPERS ────────────────────────────────────────────────
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function getSession(req) {
  const token = req.headers['x-session-token'];
  if (!token) return null;
  const r = await pool.query(
    "SELECT * FROM sessions WHERE id=$1 AND expires_at > NOW()",
    [token]
  );
  return r.rows[0] || null;
}

async function requireAuth(req, res, next) {
  const sess = await getSession(req);
  if (!sess) return res.status(401).json({ error: 'Non autorisé — connectez-vous' });
  req.session = sess;
  next();
}

async function requireAdmin(req, res, next) {
  const sess = await getSession(req);
  if (!sess || sess.role !== 'admin')
    return res.status(403).json({ error: 'Accès administrateur requis' });
  req.session = sess;
  next();
}

async function requireDirector(req, res, next) {
  const sess = await getSession(req);
  if (!sess || (sess.role !== 'admin' && sess.role !== 'directeur'))
    return res.status(403).json({ error: 'Accès directeur requis' });
  req.session = sess;
  next();
}

// Récupérer la probabilité de gain pour un jeu et un directeur
async function getWinProbability(dirCode, gameName) {
  const r = await pool.query(
    "SELECT win_probability FROM game_difficulty WHERE dir_code=$1 AND game_name=$2",
    [dirCode, gameName]
  );
  if (r.rows.length) return r.rows[0].win_probability;
  const def = await pool.query("SELECT value FROM settings WHERE key=$1", [`${gameName}_default_diff`]);
  if (def.rows.length) return parseInt(def.rows[0].value) || 45;
  return 45;
}

function isWin(probability) {
  const rand = Math.random() * 100;
  return rand <= probability;
}

function getKenoMultiplier(hits, selectedCount) {
  const table = {
    1: {1: 3},
    2: {2: 5},
    3: {3: 8},
    4: {4: 12},
    5: {5: 18},
    6: {6: 25, 5: 5, 4: 2},
    7: {7: 40, 6: 10, 5: 3},
    8: {8: 60, 7: 15, 6: 5},
    9: {9: 100, 8: 20, 7: 8},
    10: {10: 150, 9: 30, 8: 12}
  };
  return table[selectedCount]?.[hits] || 0;
}

// Fonction générique pour les appels PlopPlop entrants (dépôts)
async function callPlopPlop(endpoint, body) {
  const BASE = PLOPPLOP_BASE || 'https://plopplop.solutionip.app';
  const auth = Buffer.from(`${MERCHANT_CLIENT_ID}:${MERCHANT_SECRET_KEY}`).toString('base64');
  const response = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

// Fonction retrait PlopPlop - flux 3 étapes obligatoires
async function executerRetraitPlopPlop(montant, methode, recipient, reference) {
  const BASE = PLOPPLOP_BASE || 'https://plopplop.solutionip.app';

  // Étape 1: Authentification → AUTH_TOKEN
  const authResp = await fetch(`${BASE}/api/auth/marchand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: MERCHANT_CLIENT_ID, client_secret: MERCHANT_SECRET_KEY })
  });
  const authData = await authResp.json();
  if (!authData.token) throw new Error(authData.message || 'Échec authentification PlopPlop');
  const authToken = authData.token;

  // Étape 2: Générer withdrawal-token avec les paramètres EXACTS
  const wtResp = await fetch(`${BASE}/api/auth/marchand/withdrawal-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ amount: montant, method: methode, recipient, reference })
  });
  const wtData = await wtResp.json();
  if (!wtData.withdrawal_token) throw new Error(wtData.message || 'Échec génération token retrait');
  const withdrawalToken = wtData.withdrawal_token;

  // Étape 3: Exécuter le retrait avec les MÊMES paramètres exacts
  const wResp = await fetch(`${BASE}/api/withdraw/marchand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${withdrawalToken}` },
    body: JSON.stringify({ amount: montant, method: methode, recipient, reference })
  });
  const wData = await wResp.json();
  if (!wResp.ok || wData.success === false) {
    const code = wData.error_code;
    if (code === 'WITHDRAWAL_COOLDOWN') throw new Error(`Cooldown: attendez ${wData.remaining_seconds||60}s avant un autre retrait`);
    if (code === 'TOKEN_ALREADY_USED') throw new Error('Token déjà utilisé, réessayez');
    if (code === 'PARAMETER_MISMATCH') throw new Error('Erreur paramètres PlopPlop');
    throw new Error(wData.message || 'Retrait PlopPlop échoué');
  }
  return wData;
}

// ============================================================
// ROUTES API (toutes commençant par /api)
// ============================================================

// ── SANTÉ ─────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: e.message });
  }
});

// ── AUTHENTIFICATION ──────────────────────────────────────
app.post('/api/auth/admin', async (req, res) => {
  try {
    const { pwd } = req.body;
    if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const token = genToken();
    await pool.query("INSERT INTO sessions (id, role) VALUES ($1, 'admin')", [token]);
    res.json({ token, role: 'admin', name: 'Administrateur' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/director', async (req, res) => {
  try {
    const { code, pwd } = req.body;
    const r = await pool.query("SELECT * FROM directors WHERE code=$1 AND active=TRUE", [code.toUpperCase()]);
    const dir = r.rows[0];
    if (!dir) return res.status(401).json({ error: 'Code introuvable' });
    const ok = await bcrypt.compare(pwd, dir.pwd_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const token = genToken();
    await pool.query("INSERT INTO sessions (id, role, user_code) VALUES ($1, 'directeur', $2)", [token, dir.code]);
    res.json({ token, role: 'directeur', code: dir.code, name: dir.name, zone: dir.zone, pct: dir.pct });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/cashier', async (req, res) => {
  try {
    const { code, pwd } = req.body;
    const r = await pool.query(
      "SELECT c.*, d.name AS dir_name FROM cashiers c LEFT JOIN directors d ON c.dir_code=d.code WHERE c.code=$1 AND c.active=TRUE",
      [code.toUpperCase()]
    );
    const caiss = r.rows[0];
    if (!caiss) return res.status(401).json({ error: 'Code introuvable' });
    const ok = await bcrypt.compare(pwd, caiss.pwd_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const token = genToken();
    await pool.query("INSERT INTO sessions (id, role, user_code) VALUES ($1, 'caissier', $2)", [token, caiss.code]);
    res.json({ token, role: 'caissier', code: caiss.code, name: caiss.name, dirCode: caiss.dir_code, jeu: caiss.jeu });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/player', async (req, res) => {
  try {
    const { phone, pwd } = req.body;
    const r = await pool.query("SELECT * FROM players WHERE phone=$1 AND active=TRUE", [phone]);
    const player = r.rows[0];
    if (!player) return res.status(401).json({ error: 'Numéro introuvable' });
    const ok = await bcrypt.compare(pwd, player.pwd_hash);
    if (!ok) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const token = genToken();
    await pool.query("INSERT INTO sessions (id, role, user_phone) VALUES ($1, 'joueur', $2)", [token, player.phone]);
    res.json({ token, role: 'joueur', phone: player.phone, name: player.name, solde: parseFloat(player.solde), dirCode: player.dir_code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, pwd, dirCode, caissCode } = req.body;
    if (!name || !phone || !pwd) return res.status(400).json({ error: 'Champs obligatoires manquants' });
    const exists = await pool.query("SELECT id FROM players WHERE phone=$1", [phone]);
    if (exists.rows.length) return res.status(409).json({ error: 'Numéro déjà utilisé' });
    const hash = await bcrypt.hash(pwd, 10);
    const r = await pool.query(
      "INSERT INTO players (name, phone, pwd_hash, dir_code, caiss_code) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,phone,solde",
      [name, phone, hash, dirCode||null, caissCode||null]
    );
    res.json({ success: true, player: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) await pool.query("DELETE FROM sessions WHERE id=$1", [token]);
  res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const sess = await getSession(req);
    if (!sess) return res.status(401).json({ error: 'Session expirée' });
    if (sess.role === 'joueur') {
      const r = await pool.query("SELECT name,phone,solde,dir_code FROM players WHERE phone=$1", [sess.user_phone]);
      return res.json({ ...sess, ...r.rows[0] });
    }
    if (sess.role === 'directeur') {
      const r = await pool.query("SELECT name,code,zone,pct FROM directors WHERE code=$1", [sess.user_code]);
      return res.json({ ...sess, ...r.rows[0] });
    }
    if (sess.role === 'caissier') {
      const r = await pool.query("SELECT name,code,dir_code,jeu FROM cashiers WHERE code=$1", [sess.user_code]);
      return res.json({ ...sess, ...r.rows[0] });
    }
    res.json(sess);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── FOOTBALL / MATCHS ─────────────────────────────────────
let matchCache = { data: [], updatedAt: 0 };
const CACHE_TTL = 90 * 1000;
// Tous les championnats disponibles sur football-data.org
const COMPETITIONS = ['PL','PD','BL1','SA','FL1','CL','ELC','PPL','DED','BSA','WC','EC','CLI'];
const COMP_LABELS = {
  PL:  '🏴 Premier League',
  PD:  '🇪🇸 La Liga',
  BL1: '🇩🇪 Bundesliga',
  SA:  '🇮🇹 Serie A',
  FL1: '🇫🇷 Ligue 1',
  CL:  '🏆 Champions League',
  ELC: '🏴 Championship',
  PPL: '🇵🇹 Primeira Liga',
  DED: '🇳🇱 Eredivisie',
  BSA: '🇧🇷 Brasileirão',
  WC:  '🌍 Coupe du Monde',
  EC:  '🇪🇺 Euro',
  CLI: '🌎 Copa Libertadores',
};

// Calculer des cotes réalistes basées sur le nom des équipes
function calculateOdds(homeTeam, awayTeam, compCode) {
  // Équipes considérées "fortes" par compétition
  const STRONG = {
    PL:  ['Man City','Arsenal','Liverpool','Chelsea','Man Utd','Spurs','Newcastle'],
    PD:  ['Real Madrid','Barcelona','Atletico','Athletic','Real Sociedad','Villarreal'],
    BL1: ['Bayern','Dortmund','Leipzig','Leverkusen','Frankfurt','Union Berlin'],
    SA:  ['Napoli','Inter','Milan','Juventus','Roma','Lazio','Atalanta'],
    FL1: ['PSG','Marseille','Monaco','Lyon','Lens','Rennes'],
    CL:  ['Man City','Real Madrid','Bayern','PSG','Arsenal','Barcelona','Inter'],
  };
  const strong = STRONG[compCode] || [];
  const homeIsStrong = strong.some(s => homeTeam.includes(s) || s.includes(homeTeam));
  const awayIsStrong = strong.some(s => awayTeam.includes(s) || s.includes(awayTeam));

  let h, d, a;
  if (homeIsStrong && !awayIsStrong) {
    h = +(1.35 + Math.random()*0.30).toFixed(2);
    d = +(3.80 + Math.random()*0.60).toFixed(2);
    a = +(5.50 + Math.random()*2.00).toFixed(2);
  } else if (!homeIsStrong && awayIsStrong) {
    h = +(4.50 + Math.random()*2.00).toFixed(2);
    d = +(3.60 + Math.random()*0.60).toFixed(2);
    a = +(1.45 + Math.random()*0.35).toFixed(2);
  } else if (homeIsStrong && awayIsStrong) {
    h = +(1.90 + Math.random()*0.50).toFixed(2);
    d = +(3.20 + Math.random()*0.40).toFixed(2);
    a = +(3.00 + Math.random()*0.70).toFixed(2);
  } else {
    // Match équilibré — favoriser légèrement le domicile
    h = +(2.10 + Math.random()*0.70).toFixed(2);
    d = +(3.00 + Math.random()*0.50).toFixed(2);
    a = +(2.80 + Math.random()*0.80).toFixed(2);
  }
  return [h, d, a];
}

function formatMatch(match, compCode) {
  const home = match.homeTeam?.shortName || match.homeTeam?.name || '?';
  const away = match.awayTeam?.shortName || match.awayTeam?.name || '?';
  const status = match.status;
  const isLive = ['IN_PLAY','PAUSED'].includes(status);
  const score = match.score?.fullTime || match.score?.halfTime || {home:null,away:null};
  return {
    id: match.id,
    lk: compCode.toLowerCase(),
    lg: COMP_LABELS[compCode] || compCode,
    t1: home,
    t2: away,
    s1: score.home ?? null,
    s2: score.away ?? null,
    time: isLive ? 'LIVE' : (match.utcDate ? new Date(match.utcDate).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : ''),
    live: isLive,
    status: status,
    utcDate: match.utcDate,
    odds: calculateOdds(home, away, compCode),
    mkt: 12
  };
}

app.get('/api/matches', async (req, res) => {
  try {
    const now = Date.now();
    if (now - matchCache.updatedAt < CACHE_TTL && matchCache.data.length) {
      return res.json({ matches: matchCache.data, cached: true });
    }
    const allMatches = [];
    const today = new Date().toISOString().split('T')[0];
    const in7days = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    for (const comp of COMPETITIONS) {
      try {
        // Matchs en cours et à venir
        const url = `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${today}&dateTo=${in7days}`;
        const r = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_API_KEY } });
        if (!r.ok) continue;
        const data = await r.json();
        if (data.matches) {
          const formatted = data.matches.map(m => formatMatch(m, comp));
          allMatches.push(...formatted);
        }
      } catch (e) { console.error(`Failed ${comp}:`, e.message); }
    }
    allMatches.sort((a,b) => {
      if (a.live && !b.live) return -1;
      if (!a.live && b.live) return 1;
      return new Date(a.utcDate||0) - new Date(b.utcDate||0);
    });
    matchCache = { data: allMatches, updatedAt: now };
    res.json({ matches: allMatches, count: allMatches.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Route pour les matchs d'un championnat spécifique
app.get('/api/matches/:comp', async (req, res) => {
  try {
    const comp = req.params.comp.toUpperCase();
    const today = new Date().toISOString().split('T')[0];
    const in7days = new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    const r = await fetch(`https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${today}&dateTo=${in7days}`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    if (!r.ok) return res.status(502).json({ error: 'Compétition indisponible' });
    const data = await r.json();
    const matches = (data.matches||[]).map(m => formatMatch(m, comp));
    res.json({ matches, competition: COMP_LABELS[comp]||comp });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Route pour résultats récents (derniers 7 jours)
app.get('/api/results', async (req, res) => {
  try {
    const allResults = [];
    const ago7 = new Date(Date.now()-7*86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    for (const comp of ['PL','PD','BL1','SA','FL1','CL']) {
      try {
        const r = await fetch(`https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${ago7}&dateTo=${today}&status=FINISHED`, {
          headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
        });
        if (!r.ok) continue;
        const data = await r.json();
        if (data.matches) allResults.push(...data.matches.map(m => formatMatch(m, comp)));
      } catch(e) {}
    }
    allResults.sort((a,b) => new Date(b.utcDate||0) - new Date(a.utcDate||0));
    res.json({ results: allResults });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── JOUEUR ────────────────────────────────────────────────
app.get('/api/player/me', requireAuth, async (req, res) => {
  if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueur seulement' });
  const r = await pool.query("SELECT name, phone, solde, dir_code, caiss_code, created_at FROM players WHERE phone=$1", [req.session.user_phone]);
  res.json(r.rows[0]);
});

app.get('/api/player/bets', requireAuth, async (req, res) => {
  const phone = req.session.role === 'joueur' ? req.session.user_phone : req.query.phone;
  const limit = parseInt(req.query.limit) || 50;
  const r = await pool.query("SELECT * FROM bets WHERE player_phone=$1 ORDER BY created_at DESC LIMIT $2", [phone, limit]);
  res.json({ bets: r.rows });
});

app.get('/api/player/transactions', requireAuth, async (req, res) => {
  const phone = req.session.role === 'joueur' ? req.session.user_phone : req.query.phone;
  const r = await pool.query("SELECT * FROM transactions WHERE player_phone=$1 ORDER BY created_at DESC LIMIT 100", [phone]);
  res.json({ transactions: r.rows });
});

app.post('/api/bets/place', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, sub_type, selection, mise, cote, draw, match_id, match_name, player_phone } = req.body;
    if (!type || !selection || !mise) return res.status(400).json({ error: 'Données manquantes' });
    let phone, dir_code, caiss_code;
    if (req.session.role === 'joueur') {
      phone = req.session.user_phone;
    } else if (req.session.role === 'caissier') {
      phone = player_phone;
      const c = await pool.query("SELECT dir_code FROM cashiers WHERE code=$1", [req.session.user_code]);
      caiss_code = req.session.user_code;
      dir_code = c.rows[0]?.dir_code;
    } else return res.status(403).json({ error: 'Non autorisé' });
    await client.query('BEGIN');
    const pr = await client.query("SELECT solde, dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    const player = pr.rows[0];
    if (!player) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Joueur introuvable' }); }
    if (parseFloat(player.solde) < parseFloat(mise)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Solde insuffisant' }); }
    if (!dir_code) dir_code = player.dir_code;
    // Vérifications borlette si besoin
    if (type === 'borlette') {
      const num = String(selection).padStart(2,'0');
      const drawKey = draw ? draw.toLowerCase().replace(/\s/g,'') : '';
      const blocked = await client.query("SELECT id FROM borlette_blocked WHERE (number=$1 AND draw='') OR (number=$1 AND draw=$2)", [num, drawKey]);
      if (blocked.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Numéro ${num} bloqué` }); }
      const limits = await client.query("SELECT max_amount FROM borlette_limits WHERE (number=$1 AND draw='') OR (number=$1 AND draw=$2) ORDER BY max_amount ASC LIMIT 1", [num, drawKey]);
      if (limits.rows.length && parseFloat(mise) > parseFloat(limits.rows[0].max_amount)) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Limite: max ${limits.rows[0].max_amount} Gd pour numéro ${num}` }); }
    }
    const gain_potentiel = Math.round(parseFloat(mise) * parseFloat(cote || 1));
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, caiss_code, type, montant, note) VALUES ($1,$2,$3,'perte',$4,$5)", [phone, dir_code, caiss_code, -mise, `Mise ${type}: ${selection}`]);
    const betResult = await client.query(
      "INSERT INTO bets (player_phone, dir_code, caiss_code, type, sub_type, selection, mise, cote, gain_potentiel, draw, match_id, match_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
      [phone, dir_code, caiss_code, type, sub_type||'', selection, mise, cote||1, gain_potentiel, draw||'', match_id||'', match_name||'']
    );
    if (dir_code) {
      await client.query(
        "INSERT INTO jackpots (dir_code, amount, week_sales) VALUES ($1, $2, $3) ON CONFLICT (dir_code) DO UPDATE SET amount = jackpots.amount + $2, week_sales = jackpots.week_sales + $3",
        [dir_code, Math.round(parseFloat(mise) * JACKPOT_PCT / 100), mise]
      );
    }
    await client.query('COMMIT');
    const updated = await pool.query("SELECT solde FROM players WHERE phone=$1", [phone]);
    res.json({ success: true, bet: betResult.rows[0], newSolde: parseFloat(updated.rows[0].solde) });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── RECHARGES ─────────────────────────────────────────────
app.post('/api/recharges/initiate', requireAuth, async (req, res) => {
  try {
    const { montant, methode, player_phone } = req.body;
    if (!montant || montant < 20) return res.status(400).json({ error: 'Montant minimum 20 Gourdes' });
    if (!['moncash','natcash','kashpaw'].includes(methode)) return res.status(400).json({ error: 'Méthode invalide' });
    let phone;
    if (req.session.role === 'joueur') phone = req.session.user_phone;
    else if (req.session.role === 'caissier') phone = player_phone;
    else return res.status(403).json({ error: 'Non autorisé' });
    const player = await pool.query("SELECT phone, name FROM players WHERE phone=$1", [phone]);
    if (!player.rows.length) return res.status(404).json({ error: 'Joueur introuvable' });
    const reference_id = `TK_${phone}_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
    const plopData = await callPlopPlop('/api/paiement-marchand', {
      client_id: MERCHANT_CLIENT_ID,
      refference_id: reference_id,
      montant: montant,
      payment_method: methode
    });
    if (!plopData.status) throw new Error(plopData.message || 'Erreur paiement');
    await pool.query(
      `INSERT INTO recharges (player_phone, montant, methode, reference_id, transaction_id, statut) VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [phone, montant, methode, reference_id, plopData.transaction_id]
    );
    res.json({ success: true, url: plopData.url, reference_id, transaction_id: plopData.transaction_id });
  } catch(e) {
    console.error(e);
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/recharges/status/:referenceId', requireAuth, async (req, res) => {
  try {
    const { referenceId } = req.params;
    const recharge = await pool.query("SELECT * FROM recharges WHERE reference_id=$1", [referenceId]);
    if (!recharge.rows.length) return res.status(404).json({ error: 'Recharge non trouvée' });
    const r = recharge.rows[0];
    if (req.session.role === 'joueur' && r.player_phone !== req.session.user_phone) return res.status(403).json({ error: 'Non autorisé' });
    if (r.statut === 'completed') return res.json({ status: 'completed', montant: r.montant });
    if (r.statut === 'failed') return res.json({ status: 'failed' });
    const verifyData = await callPlopPlop('/api/paiement-verify', { client_id: MERCHANT_CLIENT_ID, refference_id: referenceId });
    if (verifyData.trans_status === 'ok') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("UPDATE players SET solde = solde + $1 WHERE phone = $2", [r.montant, r.player_phone]);
        await client.query("UPDATE recharges SET statut='completed', updated_at=NOW() WHERE id=$1", [r.id]);
        await client.query("INSERT INTO transactions (player_phone, type, montant, note) VALUES ($1, 'depot', $2, $3)", [r.player_phone, r.montant, `Recharge ${r.methode} via Plop Plop`]);
        await client.query('COMMIT');
        res.json({ status: 'completed', montant: r.montant });
      } catch(err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
    } else res.json({ status: 'pending' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/recharges', requireAuth, async (req, res) => {
  try {
    let query = `SELECT r.*, p.name AS player_name FROM recharges r LEFT JOIN players p ON r.player_phone = p.phone`;
    let params = [];
    if (req.session.role === 'caissier') { query += ` WHERE r.caiss_code = $1 OR r.caiss_code IS NULL`; params.push(req.session.user_code); }
    else if (req.session.role === 'directeur') { query += ` WHERE r.dir_code = $1`; params.push(req.session.user_code); }
    query += ` ORDER BY r.created_at DESC LIMIT 200`;
    const r = await pool.query(query, params);
    res.json({ recharges: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/recharges/:id/validate', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id);
    if (!['admin','caissier','directeur'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    await client.query('BEGIN');
    const r = await client.query("SELECT * FROM recharges WHERE id=$1 AND statut='pending' FOR UPDATE", [id]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Recharge introuvable' }); }
    const rch = r.rows[0];
    await client.query("UPDATE players SET solde = solde + $1 WHERE phone = $2", [rch.montant, rch.player_phone]);
    await client.query("UPDATE recharges SET statut='completed', updated_at=NOW() WHERE id=$1", [id]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, caiss_code, type, montant, note) VALUES ($1,$2,$3,'depot',$4,$5)", [rch.player_phone, rch.dir_code, rch.caiss_code, rch.montant, `Recharge ${rch.methode} validée`]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/recharges/:id/reject', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id);
    if (!['admin','caissier','directeur'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    await client.query('BEGIN');
    const r = await client.query("SELECT * FROM recharges WHERE id=$1 AND statut='pending' FOR UPDATE", [id]);
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Recharge introuvable' }); }
    await client.query("UPDATE recharges SET statut='rejected', updated_at=NOW() WHERE id=$1", [id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── BORLETTE ──────────────────────────────────────────────
app.get('/api/borlette/results', requireAuth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const draw = req.query.draw;
  let query = "SELECT * FROM borlette_results";
  let params = [];
  if (draw) { query += " WHERE draw=$1"; params.push(draw); }
  query += " ORDER BY created_at DESC LIMIT $" + (params.length+1);
  params.push(limit);
  const r = await pool.query(query, params);
  res.json({ results: r.rows });
});

app.post('/api/borlette/publish', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { draw, lotto3, lot2, lot3 } = req.body;
    if (!draw || !lotto3 || lotto3.length !== 3) return res.status(400).json({ error: 'Données invalides' });
    const lot1 = lotto3.slice(-2);
    await client.query('BEGIN');
    const r = await client.query("INSERT INTO borlette_results (draw, lotto3, lot1, lot2, lot3) VALUES ($1,$2,$3,$4,$5) RETURNING *", [draw, lotto3, lot1, lot2||'', lot3||'']);
    const pending = await client.query("SELECT * FROM bets WHERE type='borlette' AND statut='en_attente' AND (draw='' OR draw=$1)", [draw]);
    for (const bet of pending.rows) {
      const sel = String(bet.selection);
      let won = false;
      if (bet.sub_type === 'borlette' && sel === lot1) won = true;
      if (bet.sub_type === 'lotto3'   && sel === lotto3) won = true;
      if (bet.sub_type === 'lotto2'   && sel === lot2) won = true;
      if (bet.sub_type === 'lotto3b'  && sel === lot3) won = true;
      if (won) {
        await client.query("UPDATE bets SET statut='gagne', resolved_at=NOW() WHERE id=$1", [bet.id]);
        const gain = Math.round(parseFloat(bet.mise) * parseFloat(bet.cote));
        await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, bet.player_phone]);
        await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'gain',$3,$4)", [bet.player_phone, bet.dir_code, gain, `Gain Borlette ${draw} ${sel}`]);
      } else {
        await client.query("UPDATE bets SET statut='perdu', resolved_at=NOW() WHERE id=$1", [bet.id]);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true, result: r.rows[0], resolved: pending.rows.length });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── JACKPOT ───────────────────────────────────────────────
app.get('/api/jackpots', requireAuth, async (req, res) => {
  const r = await pool.query("SELECT j.*, d.name AS dir_name, d.zone FROM jackpots j JOIN directors d ON j.dir_code=d.code ORDER BY j.amount DESC");
  res.json({ jackpots: r.rows });
});

app.get('/api/jackpots/:dirCode', async (req, res) => {
  const r = await pool.query("SELECT j.amount, d.name AS dir_name FROM jackpots j JOIN directors d ON j.dir_code=d.code WHERE j.dir_code=$1", [req.params.dirCode]);
  res.json(r.rows[0] || { amount: 0 });
});

app.post('/api/jackpots/award', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { dir_code, player_phone } = req.body;
    await client.query('BEGIN');
    const jk = await client.query("SELECT amount FROM jackpots WHERE dir_code=$1 FOR UPDATE", [dir_code]);
    if (!jk.rows.length || parseFloat(jk.rows[0].amount) <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Jackpot vide' }); }
    const amount = parseFloat(jk.rows[0].amount);
    let phone = player_phone;
    let winnerName = '';
    if (!phone) {
      const players = await client.query("SELECT phone, name FROM players WHERE dir_code=$1 AND active=TRUE", [dir_code]);
      if (!players.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Aucun joueur' }); }
      const winner = players.rows[Math.floor(Math.random() * players.rows.length)];
      phone = winner.phone;
      winnerName = winner.name;
    } else {
      const wr = await client.query("SELECT name FROM players WHERE phone=$1", [phone]);
      winnerName = wr.rows[0]?.name || '';
    }
    await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [amount, phone]);
    await client.query("UPDATE jackpots SET amount=0, week_sales=0, last_reset=NOW(), updated_at=NOW() WHERE dir_code=$1", [dir_code]);
    await client.query("INSERT INTO jackpot_history (dir_code, amount, winner_phone, winner_name) VALUES ($1,$2,$3,$4)", [dir_code, amount, phone, winnerName]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'gain',$3,'🎰 JACKPOT GAGNÉ')", [phone, dir_code, amount]);
    await client.query('COMMIT');
    res.json({ success: true, amount, winner: winnerName, phone });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── ADMIN ─────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  const [players, directors, cashiers, bets, trans, recharges] = await Promise.all([
    pool.query("SELECT COUNT(*) as cnt, SUM(solde) as total_solde FROM players WHERE active=TRUE"),
    pool.query("SELECT COUNT(*) as cnt FROM directors WHERE active=TRUE"),
    pool.query("SELECT COUNT(*) as cnt FROM cashiers WHERE active=TRUE"),
    pool.query("SELECT COUNT(*) as cnt, SUM(mise) as total_mise FROM bets"),
    pool.query("SELECT SUM(CASE WHEN montant>0 THEN montant ELSE 0 END) as entrees, SUM(CASE WHEN montant<0 THEN ABS(montant) ELSE 0 END) as sorties FROM transactions"),
    pool.query("SELECT COUNT(*) as cnt FROM recharges WHERE statut='pending'"),
  ]);
  res.json({
    players: parseInt(players.rows[0].cnt),
    totalSolde: parseFloat(players.rows[0].total_solde)||0,
    directors: parseInt(directors.rows[0].cnt),
    cashiers: parseInt(cashiers.rows[0].cnt),
    totalBets: parseInt(bets.rows[0].cnt),
    totalMise: parseFloat(bets.rows[0].total_mise)||0,
    entrees: parseFloat(trans.rows[0].entrees)||0,
    sorties: parseFloat(trans.rows[0].sorties)||0,
    benefice: (parseFloat(trans.rows[0].entrees)||0) - (parseFloat(trans.rows[0].sorties)||0),
    pendingRecharges: parseInt(recharges.rows[0].cnt),
  });
});

app.get('/api/admin/players', requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT id,name,phone,solde,dir_code,caiss_code,active,created_at FROM players ORDER BY created_at DESC");
  res.json({ players: r.rows });
});

app.get('/api/admin/directors', requireAdmin, async (req, res) => {
  const r = await pool.query(`
    SELECT d.*, j.amount as jackpot,
      COALESCE((SELECT SUM(ABS(t.montant)) FROM transactions t WHERE t.dir_code=d.code AND t.type='perte'),0) as total_mise,
      COALESCE((SELECT SUM(t.montant) FROM transactions t WHERE t.dir_code=d.code AND t.type='gain'),0) as total_gains
    FROM directors d
    LEFT JOIN jackpots j ON j.dir_code = d.code
    ORDER BY d.created_at
  `);
  res.json({ directors: r.rows });
});

app.post('/api/admin/directors', requireAdmin, async (req, res) => {
  const { name, code, zone, phone, pwd, pct } = req.body;
  if (!name||!code||!zone||!pwd) return res.status(400).json({ error: 'Champs obligatoires' });
  const hash = await bcrypt.hash(pwd, 10);
  const r = await pool.query("INSERT INTO directors (name,code,zone,phone,pwd_hash,pct) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [name, code.toUpperCase(), zone, phone||'', hash, pct||0]);
  await pool.query("INSERT INTO jackpots (dir_code) VALUES ($1) ON CONFLICT DO NOTHING", [code.toUpperCase()]);
  res.json({ success: true, director: r.rows[0] });
});

app.delete('/api/admin/directors/:code', requireAdmin, async (req, res) => {
  await pool.query("UPDATE directors SET active=FALSE WHERE code=$1", [req.params.code]);
  res.json({ success: true });
});

app.get('/api/admin/cashiers', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT c.*,d.name AS dir_name FROM cashiers c LEFT JOIN directors d ON c.dir_code=d.code ORDER BY c.created_at DESC");
    res.json({ cashiers: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/cashiers/delete', requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query("UPDATE cashiers SET active=FALSE WHERE id=$1", [id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/cashiers', requireAdmin, async (req, res) => {
  const { name, code, dir_code, phone, pwd, jeu } = req.body;
  if (!name||!code||!pwd) return res.status(400).json({ error: 'Champs obligatoires' });
  const hash = await bcrypt.hash(pwd, 10);
  const r = await pool.query("INSERT INTO cashiers (name,code,dir_code,phone,pwd_hash,jeu) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [name, code.toUpperCase(), dir_code, phone||'', hash, jeu||'all']);
  res.json({ success: true, cashier: r.rows[0] });
});

// Route accessible par le directeur pour créer un caissier
app.post('/api/cashiers', requireAuth, async (req, res) => {
  try {
    if (!['admin','directeur'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const { name, code, phone, pwd, jeu, dir_code } = req.body;
    if (!name||!code||!pwd) return res.status(400).json({ error: 'Nom, code et mot de passe obligatoires' });
    // Un directeur ne peut créer que pour son propre code
    const effectiveDirCode = req.session.role === 'directeur' ? req.session.user_code : (dir_code || req.session.user_code);
    const hash = await bcrypt.hash(pwd, 10);
    const existing = await pool.query("SELECT id FROM cashiers WHERE code=$1", [code.toUpperCase()]);
    if (existing.rows.length) return res.status(400).json({ error: 'Ce code caissier existe déjà' });
    const r = await pool.query(
      "INSERT INTO cashiers (name,code,dir_code,phone,pwd_hash,jeu) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,code,dir_code,phone,jeu",
      [name, code.toUpperCase(), effectiveDirCode, phone||'', hash, jeu||'all']
    );
    res.json({ success: true, cashier: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/cashiers/:code', requireAdmin, async (req, res) => {
  await pool.query("UPDATE cashiers SET active=FALSE WHERE code=$1", [req.params.code]);
  res.json({ success: true });
});

app.get('/api/admin/bets', requireAdmin, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const type  = req.query.type;
  const statut= req.query.statut;
  let q = "SELECT b.*, p.name AS player_name FROM bets b LEFT JOIN players p ON b.player_phone=p.phone WHERE 1=1";
  const params = [];
  if (type)   { params.push(type);   q += ` AND b.type=$${params.length}`; }
  if (statut) { params.push(statut); q += ` AND b.statut=$${params.length}`; }
  params.push(limit);
  q += ` ORDER BY b.created_at DESC LIMIT $${params.length}`;
  const r = await pool.query(q, params);
  res.json({ bets: r.rows });
});

app.get('/api/admin/transactions', requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT t.*, p.name AS player_name FROM transactions t LEFT JOIN players p ON t.player_phone=p.phone ORDER BY t.created_at DESC LIMIT 200");
  res.json({ transactions: r.rows });
});

app.get('/api/admin/recharges', requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT r.*, p.name AS player_name FROM recharges r LEFT JOIN players p ON r.player_phone=p.phone ORDER BY r.created_at DESC LIMIT 100");
  res.json({ recharges: r.rows });
});

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT * FROM settings");
  const settings = {};
  r.rows.forEach(row => { settings[row.key] = row.value; });
  res.json(settings);
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    await pool.query("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()", [key, String(value)]);
  }
  res.json({ success: true });
});

app.post('/api/admin/reset-password', requireAdmin, async (req, res) => {
  const { role, code, newPwd } = req.body;
  if (!role || !code || !newPwd) return res.status(400).json({ error: 'Champs manquants' });
  const hash = await bcrypt.hash(newPwd, 10);
  if (role === 'director') await pool.query("UPDATE directors SET pwd_hash=$1 WHERE code=$2", [hash, code]);
  else if (role === 'cashier') await pool.query("UPDATE cashiers SET pwd_hash=$1 WHERE code=$2", [hash, code]);
  else return res.status(400).json({ error: 'Rôle invalide' });
  res.json({ success: true });
});

app.post('/api/admin/settings/game-diff', requireAdmin, async (req, res) => {
  const { dir_code, game_name, win_probability } = req.body;
  if (!game_name || win_probability === undefined) return res.status(400).json({ error: 'Données manquantes' });
  if (dir_code) {
    await pool.query(`INSERT INTO game_difficulty (dir_code, game_name, win_probability) VALUES ($1, $2, $3) ON CONFLICT (dir_code, game_name) DO UPDATE SET win_probability=$3`, [dir_code, game_name, win_probability]);
  } else {
    await pool.query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`, [`${game_name}_default_diff`, win_probability.toString()]);
  }
  res.json({ success: true });
});

// ── DIRECTEUR ─────────────────────────────────────────────
app.get('/api/director/stats', requireAuth, async (req, res) => {
  if (!['directeur','admin'].includes(req.session.role)) return res.status(403).json({error:'Non autorisé'});
  const code = req.session.role === 'directeur' ? req.session.user_code : req.query.code;
  const [players, cashiers, bets, jk] = await Promise.all([
    pool.query("SELECT COUNT(*) as cnt, SUM(solde) as total FROM players WHERE dir_code=$1 AND active=TRUE", [code]),
    pool.query("SELECT COUNT(*) as cnt FROM cashiers WHERE dir_code=$1 AND active=TRUE", [code]),
    pool.query("SELECT COUNT(*) as cnt, SUM(mise) as total_mise, SUM(CASE WHEN statut='gagne' THEN gain_potentiel ELSE 0 END) as total_gains FROM bets WHERE dir_code=$1", [code]),
    pool.query("SELECT amount, week_sales FROM jackpots WHERE dir_code=$1", [code]),
  ]);
  const totalMise  = parseFloat(bets.rows[0].total_mise)||0;
  const totalGains = parseFloat(bets.rows[0].total_gains)||0;
  res.json({
    players:    parseInt(players.rows[0].cnt),
    totalSolde: parseFloat(players.rows[0].total)||0,
    cashiers:   parseInt(cashiers.rows[0].cnt),
    totalBets:  parseInt(bets.rows[0].cnt),
    totalMise,
    totalGains,
    benefice:   totalMise - totalGains,
    jackpot:    parseFloat(jk.rows[0]?.amount||0),
    weekSales:  parseFloat(jk.rows[0]?.week_sales||0),
  });
});

app.get('/api/director/players', requireAuth, async (req, res) => {
  const code = req.session.role === 'directeur' ? req.session.user_code : req.query.code;
  const r = await pool.query("SELECT id,name,phone,solde,caiss_code,created_at FROM players WHERE dir_code=$1 AND active=TRUE ORDER BY created_at DESC", [code]);
  res.json({ players: r.rows });
});

// ── CAISSIER ──────────────────────────────────────────────
app.get('/api/cashier/players', requireAuth, async (req, res) => {
  if (req.session.role !== 'caissier') return res.status(403).json({error:'Non autorisé'});
  const r = await pool.query("SELECT id,name,phone,solde,created_at FROM players WHERE caiss_code=$1 AND active=TRUE ORDER BY name", [req.session.user_code]);
  res.json({ players: r.rows });
});

app.post('/api/cashier/players', requireAuth, async (req, res) => {
  if (!['caissier','directeur','admin'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
  const { name, phone, pwd } = req.body;
  const hash = await bcrypt.hash(pwd || 'test123', 10);
  let dir_code, caiss_code;
  if (req.session.role === 'caissier') {
    const c = await pool.query("SELECT dir_code FROM cashiers WHERE code=$1", [req.session.user_code]);
    dir_code = c.rows[0]?.dir_code;
    caiss_code = req.session.user_code;
  }
  const r = await pool.query("INSERT INTO players (name,phone,pwd_hash,dir_code,caiss_code) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,phone,solde", [name, phone, hash, dir_code, caiss_code]);
  res.json({ success: true, player: r.rows[0] });
});

// ── JEUX DE CASINO ───────────────────────────────────────
app.post('/api/games/keno/play', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const { numbers, mise } = req.body;
    const phone = req.session.user_phone;
    if (!numbers || !numbers.length || numbers.length > 10 || !mise || mise <= 0) return res.status(400).json({ error: 'Données invalides' });
    const playerNums = numbers.map(Number);
    const nbJoues = playerNums.length;
    await client.query('BEGIN');
    const player = await client.query("SELECT solde, dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!player.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(player.rows[0].solde) < mise) throw new Error('Solde insuffisant');
    const dirCode = player.rows[0].dir_code;

    // Difficulté 0-100 depuis la DB
    // Facile (>= 60): tirage favorise le joueur → 5 à nbJoues hits possibles → gagne
    // Difficile (< 40): tirage défavorise le joueur → 1 à 4 hits → perd (seuil non atteint)
    // Moyen (40-59): comportement standard
    const difficulte = await getWinProbability(dirCode, 'keno'); // 0-100

    const pool80 = Array.from({length:80}, (_,i) => i+1);
    const joues = pool80.filter(n => playerNums.includes(n));
    const autres = pool80.filter(n => !playerNums.includes(n));
    // Shuffle
    for (let i=joues.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[joues[i],joues[j]]=[joues[j],joues[i]];}
    for (let i=autres.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[autres[i],autres[j]]=[autres[j],autres[i]];}

    let nbJouesDansTirage;
    if (difficulte >= 60) {
      // MODE FACILE: on garantit entre 5 et nbJoues hits
      const minHits = Math.min(5, nbJoues);
      nbJouesDansTirage = minHits + Math.floor(Math.random() * (nbJoues - minHits + 1));
    } else if (difficulte < 40) {
      // MODE DIFFICILE: on garantit entre 1 et 4 hits (jamais assez pour gagner)
      const maxHits = Math.min(4, nbJoues);
      nbJouesDansTirage = 1 + Math.floor(Math.random() * maxHits);
    } else {
      // MODE MOYEN: proportionnel à la difficulté
      nbJouesDansTirage = Math.round((difficulte / 100) * nbJoues);
    }
    nbJouesDansTirage = Math.max(0, Math.min(nbJouesDansTirage, Math.min(nbJoues, 20)));

    const tirageFavoris = joues.slice(0, nbJouesDansTirage);
    const tirageAutres = autres.slice(0, 20 - tirageFavoris.length);
    const winningNumbers = [...tirageFavoris, ...tirageAutres].sort((a,b)=>a-b);
    const hits = playerNums.filter(n => winningNumbers.includes(n)).length;

    // Table de gain selon hits (seuil minimum = 5 hits pour gagner)
    // Si facile: 5 hits → mise×1, 6 hits → ×3, 7 hits → ×6, 8 hits → ×9, 9 hits → ×12, 10 hits → ×15
    // Si <5 hits → perd toujours (mode difficile garantit ça)
    let mult = 0;
    if (hits >= 5) {
      const gainTable = {5:1, 6:3, 7:6, 8:9, 9:12, 10:15};
      mult = gainTable[hits] || 1;
    }
    const gain = Math.round(mise * mult);

    // Transactions
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    if (gain > 0) await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'mise',$3,'Mise Keno')", [phone,dirCode,-mise]);
    if (gain > 0) await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'gain',$3,$4)", [phone,dirCode,gain,`Gain Keno ${hits}/${nbJoues} hits ×${mult}`]);
    await client.query("INSERT INTO bets (player_phone,dir_code,type,selection,mise,gain_potentiel,statut) VALUES ($1,$2,'keno',$3,$4,$5,$6)", [phone,dirCode,playerNums.join(','),mise,gain,gain>0?'gagne':'perdu']);
    if (dirCode) await client.query("INSERT INTO jackpots (dir_code,amount,week_sales) VALUES ($1,$2,$3) ON CONFLICT (dir_code) DO UPDATE SET amount=jackpots.amount+$2,week_sales=jackpots.week_sales+$3", [dirCode,mise*JACKPOT_PCT/100,mise]);
    await client.query('COMMIT');
    const nb = await pool.query("SELECT solde FROM players WHERE phone=$1",[phone]);
    const newBalance = parseFloat(nb.rows[0].solde);
    const modeLabel = difficulte >= 60 ? '(Facile)' : difficulte < 40 ? '(Difficile)' : '(Moyen)';
    res.json({ success:true, winningNumbers, hits, gain, newBalance, multiplier: mult,
      message: gain>0 ? `🎉 ${hits}/${nbJoues} boules ${modeLabel} — ×${mult} — Gain: ${gain} Gd` : `😔 ${hits}/${nbJoues} boules ${modeLabel} — Perdu` });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/games/lucky6/play', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const { numbers, mise } = req.body;
    const phone = req.session.user_phone;
    if (!numbers || numbers.length !== 6 || !mise || mise <= 0) return res.status(400).json({ error: '6 numéros requis' });
    const playerNums = numbers.map(Number);
    await client.query('BEGIN');
    const player = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!player.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(player.rows[0].solde) < mise) throw new Error('Solde insuffisant');
    const dirCode = player.rows[0].dir_code;

    // Difficulté 0-100 depuis la DB
    const difficulte = await getWinProbability(dirCode, 'lucky6');

    // Tirage Lucky6: 6 rangées de 6 boules (total 36 boules tirées sur 48)
    // Rangée 1 = premier tirage (jackpot), rangée 6 = dernier (perd)
    const pool48 = Array.from({length:48},(_,i)=>i+1);
    // Shuffle le pool
    for (let i=pool48.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool48[i],pool48[j]]=[pool48[j],pool48[i]];}

    // Construire 6 rangées de 6 boules
    // Selon difficulté, on biaise la distribution des numéros joués dans les rangées:
    //  - Facile (>= 60): placer les numéros joués majoritairement dans les premières rangées
    //  - Difficile (< 40): placer les numéros joués dans les dernières rangées
    //  - Moyen (40-59): distribution normale
    const joues = pool48.filter(n => playerNums.includes(n));
    const autres = pool48.filter(n => !playerNums.includes(n));
    for (let i=joues.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[joues[i],joues[j]]=[joues[j],joues[i]];}
    for (let i=autres.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[autres[i],autres[j]]=[autres[j],autres[i]];}

    // Construire les 6 rangées de 6 boules
    let jouesIdx = 0, autresIdx = 0;
    const rows = []; // 6 rangées de 6 boules
    // Selon difficulté: répartir les 6 numéros joués dans des rangées spécifiques
    let jouesDansRangee = Array(6).fill(0); // combien de numéros joués dans chaque rangée
    if (difficulte >= 60) {
      // Facile: concentrer les joués dans les 1-2 premières rangées
      jouesDansRangee = [3, 2, 1, 0, 0, 0];
    } else if (difficulte >= 45) {
      // Moyen-facile: distribuer dans les 3 premières rangées
      jouesDansRangee = [2, 2, 1, 1, 0, 0];
    } else if (difficulte >= 35) {
      // Moyen: distribution équilibrée
      jouesDansRangee = [1, 1, 1, 1, 1, 1];
    } else {
      // Difficile: concentrer dans les dernières rangées
      jouesDansRangee = [0, 0, 1, 1, 2, 2];
    }

    for (let r=0; r<6; r++) {
      const row = [];
      const nbJouesIci = jouesDansRangee[r];
      for (let k=0; k<nbJouesIci && jouesIdx<joues.length; k++) {
        row.push(joues[jouesIdx++]);
      }
      while (row.length < 6 && autresIdx < autres.length) {
        row.push(autres[autresIdx++]);
      }
      // Mélanger la rangée
      for (let i=row.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[row[i],row[j]]=[row[j],row[i]];}
      rows.push(row);
    }

    // Tableau de toutes les boules (pour affichage)
    const winningNumbers = rows.flat();

    // Calculer hits par rangée et gain
    // Règles:
    //  - Tous 6 en rangée 1 → 10000× (jackpot ultime)
    //  - Les 6 en rangées 1-2 → 500×
    //  - Les 6 en rangées 1-3 → 100×
    //  - Les 6 en rangées 1-4 → 20×
    //  - Les 6 en rangées 1-5 → 5×
    //  - Toujours dans dernière rangée → perd
    //  - Partiel selon position: selon difficulté + proportion haute/basse
    let hitsParRangee = rows.map(row => row.filter(n => playerNums.includes(n)).length);
    let totalHits = hitsParRangee.reduce((a,b)=>a+b,0);
    let hitsHauts = hitsParRangee.slice(0,3).reduce((a,b)=>a+b,0); // rangées 1-3
    let hitsBas = hitsParRangee.slice(3).reduce((a,b)=>a+b,0);    // rangées 4-6

    let gain = 0;
    let gainLabel = '';

    // Trouver la rangée dans laquelle tous les 6 sont trouvés (si possible)
    let premierRangeeComplete = -1;
    let cumulHits = 0;
    for (let r=0; r<6; r++) {
      cumulHits += hitsParRangee[r];
      if (cumulHits >= 6) { premierRangeeComplete = r; break; }
    }

    if (totalHits >= 6) {
      // Tous les 6 numéros ont été trouvés — gain selon la rangée où le 6ème arrive
      if (premierRangeeComplete === 0) { gain = Math.round(mise * 10000); gainLabel = '🏆 JACKPOT RANGÉE 1 ! 10000×'; }
      else if (premierRangeeComplete === 1) { gain = Math.round(mise * 500); gainLabel = '🎉 6/6 rangée 2 — 500×'; }
      else if (premierRangeeComplete === 2) { gain = Math.round(mise * 100); gainLabel = '🎉 6/6 rangée 3 — 100×'; }
      else if (premierRangeeComplete === 3) { gain = Math.round(mise * 20); gainLabel = '✅ 6/6 rangée 4 — 20×'; }
      else if (premierRangeeComplete === 4) { gain = Math.round(mise * 5); gainLabel = '✅ 6/6 rangée 5 — 5×'; }
      else { gain = 0; gainLabel = '😔 6/6 mais en dernière rangée — Perdu'; }
    } else if (totalHits >= 4 && hitsHauts > hitsBas) {
      // Majorité dans le haut: petit gain
      gain = Math.round(mise * 2);
      gainLabel = `✅ ${totalHits}/6 (majorité haut) — 2×`;
    } else if (totalHits >= 5 && hitsHauts >= 3) {
      gain = Math.round(mise * 3);
      gainLabel = `✅ ${totalHits}/6 en haut — 3×`;
    } else {
      gain = 0;
      gainLabel = `😔 ${totalHits}/6 — Perdu`;
    }

    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    if (gain > 0) await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'mise',$3,'Mise Lucky6')", [phone,dirCode,-mise]);
    if (gain > 0) await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'gain',$3,$4)", [phone,dirCode,gain,`Gain Lucky6 ${totalHits}/6`]);
    await client.query("INSERT INTO bets (player_phone,dir_code,type,selection,mise,gain_potentiel,statut) VALUES ($1,$2,'lucky6',$3,$4,$5,$6)", [phone,dirCode,playerNums.join(','),mise,gain,gain>0?'gagne':'perdu']);
    if (dirCode) await client.query("INSERT INTO jackpots (dir_code,amount,week_sales) VALUES ($1,$2,$3) ON CONFLICT (dir_code) DO UPDATE SET amount=jackpots.amount+$2,week_sales=jackpots.week_sales+$3", [dirCode,mise*JACKPOT_PCT/100,mise]);
    await client.query('COMMIT');
    const nb = await pool.query("SELECT solde FROM players WHERE phone=$1",[phone]);
    const newBalance = parseFloat(nb.rows[0].solde);
    res.json({ success:true, winningNumbers, rows, hitsParRangee, hits: totalHits, gain, newBalance, message: gainLabel });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/games/course/play', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const { carId, mise } = req.body;
    const phone = req.session.user_phone;
    if (!carId || !mise || mise <= 0) return res.status(400).json({ error: 'Données invalides' });
    await client.query('BEGIN');
    const player = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!player.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(player.rows[0].solde) < mise) throw new Error('Solde insuffisant');
    const dirCode = player.rows[0].dir_code;
    // Difficulté: % chance que la voiture choisie gagne
    const difficulte = await getWinProbability(dirCode, 'course'); // 0-100
    const rand = Math.random() * 100;
    const gagne = rand <= difficulte;
    const odds = {1:2.10, 2:1.75, 3:2.50, 4:3.20, 5:4.00, 6:5.50};
    const cote = odds[parseInt(carId)] || 2.0;
    const gain = gagne ? Math.round(mise * cote) : 0;
    // Classement visuel biaisé
    const voitures = [1,2,3,4,5,6];
    const autres = voitures.filter(v => v !== parseInt(carId));
    for (let i=autres.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[autres[i],autres[j]]=[autres[j],autres[i]];}
    const ranking = gagne
      ? [parseInt(carId), ...autres]
      : [autres[0], ...autres.slice(1).filter(v=>v!==parseInt(carId)), parseInt(carId)];
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    if (gain > 0) await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'mise',$3,$4)", [phone,dirCode,-mise,`Mise Course voiture ${carId}`]);
    if (gain > 0) await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'gain',$3,$4)", [phone,dirCode,gain,`Gain Course voiture ${carId} ×${cote}`]);
    await client.query("INSERT INTO bets (player_phone,dir_code,type,selection,mise,cote,gain_potentiel,statut) VALUES ($1,$2,'course',$3,$4,$5,$6,$7)", [phone,dirCode,`Voiture ${carId}`,mise,cote,gain,gain>0?'gagne':'perdu']);
    if (dirCode) await client.query("INSERT INTO jackpots (dir_code,amount,week_sales) VALUES ($1,$2,$3) ON CONFLICT (dir_code) DO UPDATE SET amount=jackpots.amount+$2,week_sales=jackpots.week_sales+$3", [dirCode,mise*JACKPOT_PCT/100,mise]);
    await client.query('COMMIT');
    const nb = await pool.query("SELECT solde FROM players WHERE phone=$1",[phone]);
    res.json({ success:true, ranking, gagne, gain, newBalance:parseFloat(nb.rows[0].solde),
      message: gagne?`🏆 Voiture #${carId} gagne ! +${gain} Gd`:`😔 Voiture #${carId} n'a pas gagné` });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// Hélicoptère – sessions en mémoire
let helicoSessions = new Map();
app.post('/api/games/helico/start', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { mise } = req.body;
    const phone = req.session.user_phone;
    if (!mise || mise <= 0) throw new Error('Mise invalide');
    const player = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!player.rows.length) throw new Error('Joueur inconnu');
    if (parseFloat(player.rows[0].solde) < mise) throw new Error('Solde insuffisant');
    const dirCode = player.rows[0].dir_code;
    // Difficulté: plus c'est haut, plus le crash est retardé (favorable au joueur)
    const difficulte = await getWinProbability(dirCode, 'helico'); // 0-100
    await client.query('BEGIN');
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'mise',$3,'Mise Hélicoptère')", [phone, dirCode, -mise]);
    await client.query('COMMIT');
    const sessionId = require('crypto').randomBytes(16).toString('hex');
    // crashMultiplier: difficulte=50 → crash moyen à ×1.5, difficulte=80 → crash tard à ×2.5
    const crashAt = 1.0 + (difficulte / 100) * 3.0 + Math.random() * 1.5;
    helicoSessions.set(sessionId, { phone, mise, dirCode, altitude:0, crashed:false, crashAt });
    const newBalance = parseFloat(player.rows[0].solde) - mise;
    res.json({ success:true, sessionId, newBalance, message:'Décollage ! Encaissez avant le crash.' });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/games/helico/cashout', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { sessionId } = req.body;
    const session = helicoSessions.get(sessionId);
    if (!session) throw new Error('Session invalide');
    if (session.crashed) throw new Error('Déjà crashé');
    const gainMultiplier = 1 + (session.altitude / 100);
    const gain = Math.floor(session.mise * gainMultiplier);
    await client.query("UPDATE players SET solde = solde + $1 WHERE phone = $2", [gain, session.phone]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1, $2, 'gain', $3, $4)", [session.phone, session.dirCode, gain, `Gain Hélicoptère (altitude ${session.altitude}m)`]);
    await client.query("INSERT INTO bets (player_phone, dir_code, type, mise, gain_potentiel, statut) VALUES ($1, $2, 'helico', $3, $4, 'gagne')", [session.phone, session.dirCode, session.mise, gain]);
    if (session.dirCode) {
      await client.query(`INSERT INTO jackpots (dir_code, amount, week_sales) VALUES ($1, $2, $3) ON CONFLICT (dir_code) DO UPDATE SET amount = jackpots.amount + $2, week_sales = jackpots.week_sales + $3`, [session.dirCode, session.mise * JACKPOT_PCT / 100, session.mise]);
    }
    helicoSessions.delete(sessionId);
    const newBalance = (await client.query("SELECT solde FROM players WHERE phone=$1", [session.phone])).rows[0].solde;
    res.json({ success: true, gain, newBalance, message: `Encaissé ! Gain ${gain} Gd` });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// Alias pour le frontend qui envoie gain+mise directement
app.post('/api/games/helico/encaisse', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role!=='joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const { mise, altitude, cote, gain } = req.body;
    if (!gain||gain<=0) return res.status(400).json({ error: 'Gain invalide' });
    const phone = req.session.user_phone;
    await client.query('BEGIN');
    const pr = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!pr.rows.length) throw new Error('Joueur introuvable');
    await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'gain',$3,$4)",
      [phone, pr.rows[0].dir_code, gain, `Gain Hélicoptère encaissé à ${altitude}m (×${parseFloat(cote||1).toFixed(2)})`]);
    await client.query('COMMIT');
    const newBalance = parseFloat((await pool.query("SELECT solde FROM players WHERE phone=$1",[phone])).rows[0].solde);
    res.json({ success:true, gain, newBalance });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/games/helico/update', requireAuth, async (req, res) => {
  const { sessionId, altitude } = req.body;
  const session = helicoSessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  if (session.crashed) return res.json({ crashed: true });
  session.altitude = altitude || session.altitude;
  // Crash basé sur crashAt (multiplier courant vs seuil)
  const currentMult = 1.0 + (session.altitude / 100);
  const crash = currentMult >= session.crashAt;
  if (crash) {
    session.crashed = true;
    helicoSessions.delete(sessionId);
  }
  res.json({ crashed: crash, altitude: session.altitude, crashAt: session.crashAt });
});

// ── AUTRES ROUTES API (bets, transactions, etc.) ──────────
app.get('/api/bets', requireAuth, async (req, res) => {
  let query = `SELECT b.*, p.name AS player_name FROM bets b LEFT JOIN players p ON b.player_phone = p.phone`;
  let params = [];
  if (req.session.role === 'joueur') { query += ` WHERE b.player_phone = $1`; params.push(req.session.user_phone); }
  query += ` ORDER BY b.created_at DESC LIMIT 200`;
  const r = await pool.query(query, params);
  res.json({ bets: r.rows });
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    let q, params = [];
    if (req.session.role === 'joueur') {
      q = "SELECT * FROM transactions WHERE player_phone=$1 ORDER BY created_at DESC LIMIT 200";
      params = [req.session.user_phone];
    } else {
      q = "SELECT t.*, p.name AS player_name FROM transactions t LEFT JOIN players p ON t.player_phone=p.phone ORDER BY t.created_at DESC LIMIT 300";
    }
    const r = await pool.query(q, params);
    res.json({ transactions: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// ── BORLETTE BLOCKED & LIMITS (routes manquantes) ────────
app.get('/api/borlette/blocked', requireAuth, async (req, res) => {
  const r = await pool.query("SELECT * FROM borlette_blocked ORDER BY created_at DESC");
  res.json({ blocked: r.rows });
});

app.post('/api/borlette/block', requireAuth, async (req, res) => {
  if (!['admin','directeur','caissier'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
  const { number, draw } = req.body;
  if (!number) return res.status(400).json({ error: 'Numéro requis' });
  await pool.query("INSERT INTO borlette_blocked (number, draw) VALUES ($1, $2) ON CONFLICT (number, draw) DO NOTHING", [number.padStart(2,'0'), draw||'']);
  res.json({ success: true });
});

app.delete('/api/borlette/block/:id', requireAuth, async (req, res) => {
  if (!['admin','directeur','caissier'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
  await pool.query("DELETE FROM borlette_blocked WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

app.get('/api/borlette/limits', requireAuth, async (req, res) => {
  const r = await pool.query("SELECT * FROM borlette_limits ORDER BY number");
  res.json({ limits: r.rows });
});

app.post('/api/borlette/limit', requireAuth, async (req, res) => {
  if (!['admin','directeur','caissier'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
  const { number, draw, max_amount } = req.body;
  if (!number || !max_amount) return res.status(400).json({ error: 'Données manquantes' });
  await pool.query("INSERT INTO borlette_limits (number, draw, max_amount) VALUES ($1,$2,$3) ON CONFLICT (number, draw) DO UPDATE SET max_amount=$3, updated_at=NOW()", [number.padStart(2,'0'), draw||'', max_amount]);
  res.json({ success: true });
});

app.delete('/api/borlette/limit/:id', requireAuth, async (req, res) => {
  if (!['admin','directeur','caissier'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
  await pool.query("DELETE FROM borlette_limits WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

// ── RETRAITS JOUEUR (Moncash / Natcash / Cash) ────────────
// Table retraits
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS retraits (
      id SERIAL PRIMARY KEY,
      player_phone TEXT REFERENCES players(phone),
      dir_code TEXT REFERENCES directors(code),
      montant REAL NOT NULL,
      methode TEXT NOT NULL,
      numero_mobile TEXT,
      statut TEXT DEFAULT 'pending',
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP
    );
  `);
})();

app.post('/api/retraits/demande', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const { montant, methode, numero_mobile } = req.body;
    if (!montant || montant < 50) return res.status(400).json({ error: 'Montant minimum 50 Gourdes' });
    if (!['moncash','natcash','cash','kashpaw'].includes(methode)) return res.status(400).json({ error: 'Méthode invalide' });
    const phone = req.session.user_phone;
    await client.query('BEGIN');
    const pr = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!pr.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(pr.rows[0].solde) < montant) throw new Error('Solde insuffisant');
    const dirCode = pr.rows[0].dir_code;
    // Déduire immédiatement
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [montant, phone]);

    let statut = 'pending';
    let apiRef = null;
    let apiMsg = 'En attente de traitement';

    // Traitement automatique via API pour Moncash, Natcash et Kashpaw
    if ((methode === 'moncash' || methode === 'natcash' || methode === 'kashpaw') && MERCHANT_CLIENT_ID && MERCHANT_SECRET_KEY && numero_mobile) {
      try {
        const reference = `TK_${phone.replace(/\D/g,'')}_${Date.now()}`;
        const methodApi = methode === 'moncash' ? 'moncash' : 'natcash';
        await executerRetraitPlopPlop(montant, methodApi, numero_mobile, reference);
        statut = 'approved';
        apiMsg = `✅ Retrait envoyé via ${methode} au ${numero_mobile}`;
      } catch(apiErr) {
        console.error('PlopPlop retrait error:', apiErr.message);
        if (apiErr.message.includes('Cooldown')) {
          // Rembourser et rejeter
          await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [montant, phone]);
          await client.query('ROLLBACK');
          return res.status(429).json({ error: apiErr.message });
        }
        // Autres erreurs → pending pour traitement manuel
        statut = 'pending';
        apiMsg = `⏳ Retrait en attente (${apiErr.message})`;
      }
    }

    const r = await client.query(
      "INSERT INTO retraits (player_phone,dir_code,montant,methode,numero_mobile,statut,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [phone, dirCode, montant, methode, numero_mobile||phone, statut, apiMsg]
    );
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'retrait',$3,$4)",
      [phone, dirCode, -montant, apiMsg]);
    await client.query('COMMIT');
    const newSolde = parseFloat((await pool.query("SELECT solde FROM players WHERE phone=$1",[phone])).rows[0].solde);
    res.json({
      success: true,
      retrait_id: r.rows[0].id,
      newSolde,
      statut,
      message: statut === 'approved'
        ? `✅ Retrait de ${montant} Gd envoyé directement sur votre ${methode} !`
        : `⏳ Retrait de ${montant} Gd en cours de traitement.`
    });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.get('/api/retraits', requireAuth, async (req, res) => {
  let q = "SELECT rt.*, p.name AS player_name FROM retraits rt LEFT JOIN players p ON rt.player_phone=p.phone WHERE 1=1";
  const params = [];
  if (req.session.role === 'joueur') { params.push(req.session.user_phone); q += ` AND rt.player_phone=$${params.length}`; }
  else if (req.session.role === 'directeur') { params.push(req.session.user_code); q += ` AND rt.dir_code=$${params.length}`; }
  q += " ORDER BY rt.created_at DESC LIMIT 100";
  const r = await pool.query(q, params);
  res.json({ retraits: r.rows });
});

app.post('/api/retraits/:id/approve', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['admin','caissier','directeur'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const id = parseInt(req.params.id);
    await client.query('BEGIN');
    const r = await client.query("SELECT * FROM retraits WHERE id=$1 AND statut='pending' FOR UPDATE", [id]);
    if (!r.rows.length) throw new Error('Retrait introuvable ou déjà traité');
    const rt = r.rows[0];
    await client.query("UPDATE retraits SET statut='approved', updated_at=NOW(), note=$1 WHERE id=$2", [req.body.note||'Approuvé', id]);
    await client.query("UPDATE transactions SET note='Retrait '+$1+' approuvé' WHERE player_phone=$2 AND type='retrait_demande' AND note LIKE 'Demande retrait%' AND created_at=(SELECT MAX(created_at) FROM transactions WHERE player_phone=$2 AND type='retrait_demande')", [rt.methode, rt.player_phone]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/retraits/:id/reject', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['admin','caissier','directeur'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const id = parseInt(req.params.id);
    await client.query('BEGIN');
    const r = await client.query("SELECT * FROM retraits WHERE id=$1 AND statut='pending' FOR UPDATE", [id]);
    if (!r.rows.length) throw new Error('Retrait introuvable');
    const rt = r.rows[0];
    // Rembourser le solde
    await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [rt.montant, rt.player_phone]);
    await client.query("UPDATE retraits SET statut='rejected', updated_at=NOW() WHERE id=$1", [id]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'remboursement',$3,'Retrait rejeté — solde remboursé')", [rt.player_phone, rt.dir_code, rt.montant]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── CAISSIER: RECHARGE ET RETRAIT CASH DIRECT ────────────
app.post('/api/cashier/recharge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['caissier','directeur','admin'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const { player_phone, montant, methode, note } = req.body;
    if (!player_phone || !montant || montant <= 0) return res.status(400).json({ error: 'Données invalides' });
    await client.query('BEGIN');
    const pr = await client.query("SELECT solde, dir_code FROM players WHERE phone=$1 FOR UPDATE", [player_phone]);
    if (!pr.rows.length) throw new Error('Joueur introuvable');
    let caiss_code = null, dir_code = pr.rows[0].dir_code;
    if (req.session.role === 'caissier') { caiss_code = req.session.user_code; }
    await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [montant, player_phone]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, caiss_code, type, montant, note) VALUES ($1,$2,$3,'depot',$4,$5)", [player_phone, dir_code, caiss_code, montant, note||`Rechargement ${methode||'cash'} par caissier`]);
    await client.query("INSERT INTO recharges (player_phone, dir_code, caiss_code, montant, methode, reference_id, statut) VALUES ($1,$2,$3,$4,$5,$6,'completed')", [player_phone, dir_code, caiss_code, montant, methode||'cash', `CASH_${Date.now()}`]);
    await client.query('COMMIT');
    const newSolde = (await pool.query("SELECT solde FROM players WHERE phone=$1",[player_phone])).rows[0].solde;
    res.json({ success: true, newSolde });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/cashier/retrait', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['caissier','directeur','admin'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const { player_phone, montant, note } = req.body;
    if (!player_phone || !montant || montant <= 0) return res.status(400).json({ error: 'Données invalides' });
    await client.query('BEGIN');
    const pr = await client.query("SELECT solde, dir_code FROM players WHERE phone=$1 FOR UPDATE", [player_phone]);
    if (!pr.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(pr.rows[0].solde) < montant) throw new Error('Solde insuffisant');
    let caiss_code = req.session.role === 'caissier' ? req.session.user_code : null;
    const dir_code = pr.rows[0].dir_code;
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [montant, player_phone]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, caiss_code, type, montant, note) VALUES ($1,$2,$3,'retrait',$4,$5)", [player_phone, dir_code, caiss_code, -montant, note||'Retrait cash bureau']);
    await client.query('COMMIT');
    const newSolde = (await pool.query("SELECT solde FROM players WHERE phone=$1",[player_phone])).rows[0].solde;
    res.json({ success: true, newSolde });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── MATH VEDETTE (résultats borlette) ────────────────────
// Table math_vedette
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS math_vedette (
      id SERIAL PRIMARY KEY,
      date_tirage DATE NOT NULL,
      draw TEXT NOT NULL,
      numero TEXT NOT NULL,
      occurrences INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
})();

app.get('/api/borlette/math-vedette', requireAuth, async (req, res) => {
  try {
    // Calculer les numéros les plus fréquents des 30 derniers résultats
    const r = await pool.query(`
      SELECT lot1 as num, COUNT(*) as cnt FROM borlette_results WHERE lot1 IS NOT NULL GROUP BY lot1
      UNION ALL
      SELECT lot2, COUNT(*) FROM borlette_results WHERE lot2 IS NOT NULL AND lot2!='' GROUP BY lot2
      UNION ALL
      SELECT lot3, COUNT(*) FROM borlette_results WHERE lot3 IS NOT NULL AND lot3!='' GROUP BY lot3
    `);
    // Agréger par numéro
    const counts = {};
    r.rows.forEach(row => {
      counts[row.num] = (counts[row.num]||0) + parseInt(row.cnt);
    });
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,20).map(([num,cnt]) => ({ num, cnt }));
    res.json({ vedette: sorted });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RÉSOLUTION AUTOMATIQUE DES PARIS SPORTIFS ─────────────
app.post('/api/bets/:id/resolve', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['admin','directeur'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const { statut } = req.body; // 'gagne' ou 'perdu'
    if (!['gagne','perdu'].includes(statut)) return res.status(400).json({ error: 'Statut invalide' });
    await client.query('BEGIN');
    const br = await client.query("SELECT * FROM bets WHERE id=$1 AND statut='en_attente' FOR UPDATE", [req.params.id]);
    if (!br.rows.length) throw new Error('Pari introuvable ou déjà résolu');
    const bet = br.rows[0];
    await client.query("UPDATE bets SET statut=$1, resolved_at=NOW() WHERE id=$2", [statut, bet.id]);
    if (statut === 'gagne') {
      const gain = parseFloat(bet.gain_potentiel)||0;
      if (gain > 0) {
        await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, bet.player_phone]);
        await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'gain',$3,$4)", [bet.player_phone, bet.dir_code, gain, `Gain pari sportif résolu`]);
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── JOUEUR: SOLDE ET PROFIL ────────────────────────────────
app.get('/api/player/solde', requireAuth, async (req, res) => {
  if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
  const r = await pool.query("SELECT solde FROM players WHERE phone=$1", [req.session.user_phone]);
  res.json({ solde: parseFloat(r.rows[0]?.solde||0) });
});

// ── ADMIN: RETRAITS ────────────────────────────────────────
app.get('/api/admin/retraits', requireAdmin, async (req, res) => {
  const r = await pool.query("SELECT rt.*, p.name AS player_name FROM retraits rt LEFT JOIN players p ON rt.player_phone=p.phone ORDER BY rt.created_at DESC LIMIT 200");
  res.json({ retraits: r.rows });
});

// ── ADMIN: CRÉDITER SOLDE JOUEUR ──────────────────────────
app.post('/api/admin/players/:phone/credit', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { montant, note } = req.body;
    const phone = req.params.phone;
    if (!montant) return res.status(400).json({ error: 'Montant requis' });
    await client.query('BEGIN');
    const pr = await client.query("SELECT dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!pr.rows.length) throw new Error('Joueur introuvable');
    await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [montant, phone]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'credit_admin',$3,$4)", [phone, pr.rows[0].dir_code, montant, note||'Crédit administrateur']);
    await client.query('COMMIT');
    const ns = (await pool.query("SELECT solde FROM players WHERE phone=$1",[phone])).rows[0].solde;
    res.json({ success: true, newSolde: ns });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ============================================================
// ── ROUTES JEUX CASINO ──────────────────────────────────────
// ============================================================

// Helper: déduire mise + insérer transaction + MAJ solde
async function deductAndRecord(client, phone, mise, gameType, detail) {
  const pr = await client.query("SELECT solde, dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
  if (!pr.rows.length) throw new Error('Joueur introuvable');
  const solde = parseFloat(pr.rows[0].solde);
  if (solde < mise) throw new Error('Solde insuffisant');
  await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
  await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,$3,$4,$5)",
    [phone, pr.rows[0].dir_code, 'mise', -mise, `${gameType}: ${detail}`]);
  return { dirCode: pr.rows[0].dir_code, soldeBefore: solde };
}

// Helper: créditer gain
async function creditGain(client, phone, dirCode, gain, gameType, detail) {
  if (gain <= 0) return;
  await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
  await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'gain',$3,$4)",
    [phone, dirCode, gain, `Gain ${gameType}: ${detail}`]);
}

// ── PENALTY ───────────────────────────────────────────────
app.post('/api/games/penalty/play', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const phone = req.session.user_phone;
    const { direction, mise } = req.body;
    if (!direction || !mise || mise <= 0) return res.status(400).json({ error: 'Données invalides' });
    await client.query('BEGIN');
    const player = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!player.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(player.rows[0].solde) < mise) throw new Error('Solde insuffisant');
    const dirCode = player.rows[0].dir_code;
    // Difficulté: % de chance que le gardien plonge du MAUVAIS côté (joueur marque)
    const difficulte = await getWinProbability(dirCode, 'penalty');
    const rand = Math.random() * 100;
    const gagne = rand <= difficulte;
    const dirs = ['gauche','centre','droite'];
    let goalieDir;
    if (gagne) {
      // Gardien plonge ailleurs
      goalieDir = dirs.filter(d => d !== direction)[Math.floor(Math.random()*2)];
    } else {
      // Gardien plonge du bon côté
      goalieDir = direction;
    }
    const gain = gagne ? Math.round(mise * 1.9) : 0;
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    if (gain > 0) await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'mise',$3,$4)", [phone,dirCode,-mise,`Mise Penalty ${direction}`]);
    if (gain > 0) await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'gain',$3,$4)", [phone,dirCode,gain,`Gain Penalty BUT ${direction}`]);
    await client.query("INSERT INTO bets (player_phone,dir_code,type,selection,mise,gain_potentiel,statut) VALUES ($1,$2,'penalty',$3,$4,$5,$6)", [phone,dirCode,direction,mise,gain,gain>0?'gagne':'perdu']);
    if (dirCode) await client.query("INSERT INTO jackpots (dir_code,amount,week_sales) VALUES ($1,$2,$3) ON CONFLICT (dir_code) DO UPDATE SET amount=jackpots.amount+$2,week_sales=jackpots.week_sales+$3", [dirCode,mise*JACKPOT_PCT/100,mise]);
    await client.query('COMMIT');
    const nb = await pool.query("SELECT solde FROM players WHERE phone=$1",[phone]);
    res.json({ goalieDir, gagne, gain, newBalance:parseFloat(nb.rows[0].solde),
      message: gagne ? `⚽ BUT ! +${gain} Gd` : `🧤 Arrêté ! Gardien → ${goalieDir}` });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

app.post('/api/games/roulette/play', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.session.role !== 'joueur') return res.status(403).json({ error: 'Joueurs seulement' });
    const phone = req.session.user_phone;
    const { betType, betValue, mise } = req.body;
    if (!betType || betValue === undefined || !mise || mise <= 0) return res.status(400).json({ error: 'Données invalides' });
    await client.query('BEGIN');
    const player = await client.query("SELECT solde,dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!player.rows.length) throw new Error('Joueur introuvable');
    if (parseFloat(player.rows[0].solde) < mise) throw new Error('Solde insuffisant');
    const dirCode = player.rows[0].dir_code;
    // Difficulté: % de chance que le résultat soit gagnant
    const difficulte = await getWinProbability(dirCode, 'roulette');
    const rand = Math.random() * 100;
    const playerWins = rand <= difficulte;
    const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    let result;
    if (playerWins) {
      // Générer un résultat qui fait gagner le joueur
      const allNums = Array.from({length:37},(_,i)=>i);
      const winning = allNums.filter(n => {
        const col = n===0?'vert':reds.includes(n)?'rouge':'noir';
        const par = n===0?'zero':n%2===0?'pair':'impair';
        const doz = n===0?0:n<=12?1:n<=24?2:3;
        const c   = n===0?0:(n%3===0?3:n%3);
        if (betType==='number') return parseInt(betValue)===n;
        if (betType==='color')  return betValue===col;
        if (betType==='parity') return betValue===par;
        if (betType==='dozen')  return parseInt(betValue)===doz;
        if (betType==='column') return parseInt(betValue)===c;
        return false;
      });
      result = winning.length > 0 ? winning[Math.floor(Math.random()*winning.length)] : Math.floor(Math.random()*37);
    } else {
      // Générer un résultat perdant
      const allNums = Array.from({length:37},(_,i)=>i);
      const losing = allNums.filter(n => {
        const col = n===0?'vert':reds.includes(n)?'rouge':'noir';
        const par = n===0?'zero':n%2===0?'pair':'impair';
        const doz = n===0?0:n<=12?1:n<=24?2:3;
        const c   = n===0?0:(n%3===0?3:n%3);
        if (betType==='number') return parseInt(betValue)!==n;
        if (betType==='color')  return betValue!==col;
        if (betType==='parity') return betValue!==par;
        if (betType==='dozen')  return parseInt(betValue)!==doz;
        if (betType==='column') return parseInt(betValue)!==c;
        return true;
      });
      result = losing.length > 0 ? losing[Math.floor(Math.random()*losing.length)] : 0;
    }
    const color = result===0?'vert':reds.includes(result)?'rouge':'noir';
    const parity = result===0?'zero':result%2===0?'pair':'impair';
    const dozen = result===0?0:result<=12?1:result<=24?2:3;
    const column = result===0?0:(result%3===0?3:result%3);
    let mult = 0;
    if (betType==='number' && parseInt(betValue)===result) mult=36;
    else if (betType==='color' && betValue===color) mult=2;
    else if (betType==='parity' && betValue===parity) mult=2;
    else if (betType==='dozen' && parseInt(betValue)===dozen) mult=3;
    else if (betType==='column' && parseInt(betValue)===column) mult=3;
    const gain = mult > 0 ? Math.round(mise * mult) : 0;
    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [mise, phone]);
    if (gain > 0) await client.query("UPDATE players SET solde=solde+$1 WHERE phone=$2", [gain, phone]);
    await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'mise',$3,$4)", [phone,dirCode,-mise,`Mise Roulette ${betType}:${betValue}`]);
    if (gain > 0) await client.query("INSERT INTO transactions (player_phone,dir_code,type,montant,note) VALUES ($1,$2,'gain',$3,$4)", [phone,dirCode,gain,`Gain Roulette ${result}(${color}) ×${mult}`]);
    await client.query("INSERT INTO bets (player_phone,dir_code,type,selection,mise,gain_potentiel,statut) VALUES ($1,$2,'roulette',$3,$4,$5,$6)", [phone,dirCode,`${betType}:${betValue}`,mise,gain,gain>0?'gagne':'perdu']);
    if (dirCode) await client.query("INSERT INTO jackpots (dir_code,amount,week_sales) VALUES ($1,$2,$3) ON CONFLICT (dir_code) DO UPDATE SET amount=jackpots.amount+$2,week_sales=jackpots.week_sales+$3", [dirCode,mise*JACKPOT_PCT/100,mise]);
    await client.query('COMMIT');
    const nb = await pool.query("SELECT solde FROM players WHERE phone=$1",[phone]);
    res.json({ result, color, parity, dozen, column, gain, newBalance:parseFloat(nb.rows[0].solde),
      message: gain>0?`🎉 ${result} (${color}) — +${gain} Gd`:`😔 ${result} (${color}) — Perdu` });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── BORLETTE: PLACER UN TICKET ────────────────────────────
app.post('/api/borlette/bet', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const phone = req.session.user_phone || req.session.user_code;
    const { numeros, types, montants, draw } = req.body;
    // numeros: ['12','34',...], types: ['bolet','mariage',...], montants: [50,100,...]
    if (!numeros || !numeros.length) return res.status(400).json({ error: 'Numéros requis' });

    await client.query('BEGIN');
    const pr = await client.query("SELECT solde, dir_code FROM players WHERE phone=$1 FOR UPDATE", [phone]);
    if (!pr.rows.length) throw new Error('Joueur introuvable');
    const totalMise = montants.reduce((a,b)=>a+parseFloat(b),0);
    if (parseFloat(pr.rows[0].solde) < totalMise) throw new Error('Solde insuffisant');

    // Vérifier les numéros bloqués
    for (const num of numeros) {
      const bl = await client.query("SELECT id FROM borlette_blocked WHERE number=$1 AND (draw='' OR draw=$2)", [num.padStart(2,'0'), draw||'']);
      if (bl.rows.length) throw new Error(`Numéro ${num} bloqué pour ce tirage`);
    }
    // Vérifier les limites
    for (let i=0; i<numeros.length; i++) {
      const lim = await client.query("SELECT max_amount FROM borlette_limits WHERE number=$1 AND (draw='' OR draw=$2)", [numeros[i].padStart(2,'0'), draw||'']);
      if (lim.rows.length) {
        const totalSurNum = await client.query("SELECT COALESCE(SUM(b.montant),0) as tot FROM borlette_bets b WHERE b.numero=$1 AND b.draw=$2 AND b.statut!='annule'", [numeros[i].padStart(2,'0'), draw||'']);
        if (parseFloat(totalSurNum.rows[0].tot) + parseFloat(montants[i]) > parseFloat(lim.rows[0].max_amount))
          throw new Error(`Limite atteinte pour le numéro ${numeros[i]}`);
      }
    }

    await client.query("UPDATE players SET solde=solde-$1 WHERE phone=$2", [totalMise, phone]);
    await client.query("INSERT INTO transactions (player_phone, dir_code, type, montant, note) VALUES ($1,$2,'mise',$3,$4)",
      [phone, pr.rows[0].dir_code, -totalMise, `Borlette ${draw||''}: ${numeros.join(',')}`]);

    const ticketRef = 'BOR'+Date.now().toString(36).toUpperCase();
    const ticketId = (await client.query("INSERT INTO borlette_tickets (player_phone, dir_code, draw, ticket_ref, total_mise, statut) VALUES ($1,$2,$3,$4,$5,'actif') RETURNING id",
      [phone, pr.rows[0].dir_code, draw||'', ticketRef, totalMise])).rows[0].id;

    for (let i=0; i<numeros.length; i++) {
      await client.query("INSERT INTO borlette_bets (ticket_id, player_phone, dir_code, numero, type_jeu, montant, draw) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [ticketId, phone, pr.rows[0].dir_code, numeros[i].padStart(2,'0'), types[i]||'bolet', montants[i], draw||'']);
    }

    await client.query('COMMIT');
    const newBalance = parseFloat((await pool.query("SELECT solde FROM players WHERE phone=$1",[phone])).rows[0].solde);
    res.json({ success: true, ticketRef, ticketId, newBalance });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); } finally { client.release(); }
});

// ── BORLETTE: RÉSOUDRE UN TIRAGE ─────────────────────────
app.post('/api/borlette/resolve', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    if (!['admin','directeur','caissier'].includes(req.session.role)) return res.status(403).json({ error: 'Non autorisé' });
    const { draw, lot1, lot2, lot3 } = req.body;
    if (!draw || !lot1) return res.status(400).json({ error: 'Tirage et lot1 requis' });

    await client.query('BEGIN');
    // Sauvegarder résultat
    await client.query("INSERT INTO borlette_results (draw, lot1, lot2, lo
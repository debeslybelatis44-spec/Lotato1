// server-player.js - Serveur dédié aux joueurs (port 3001)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PLAYER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Base de données (même connexion que le serveur principal)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Port-au-Prince'", (err) => {
    if (err) console.error('❌ Erreur fuseau:', err);
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

// Création des tables joueurs si elles n'existent pas
async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        zone VARCHAR(100),
        owner_id INTEGER NOT NULL,
        balance DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('deposit','withdraw','bet','win')),
        amount DECIMAL(10,2) NOT NULL,
        method VARCHAR(20),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // On ne touche pas à la table tickets existante, mais on suppose qu'elle a une colonne player_id
  // Si elle n'existe pas, on l'ajoute (sans erreur si déjà présente)
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS player_id INTEGER`).catch(() => {});
  console.log('✅ Tables joueurs prêtes');
}

// Middleware d'authentification joueur
const authenticatePlayer = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'player') return res.status(403).json({ error: 'Accès réservé aux joueurs' });
    req.player = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
app.use(express.static(__dirname));
// Puis ajoutez une route pour la racine :
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'player.html'));
});

// ==================== ROUTES PUBLIQUES ====================

// Liste des borlettes actives (pour l'inscription)
app.get('/api/owners/active', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM users WHERE role = $1 AND blocked = false ORDER BY name',
      ['owner']
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Inscription joueur
app.post('/api/auth/player/register', async (req, res) => {
  const { name, phone, password, zone, ownerId } = req.body;
  if (!name || !phone || !password || !ownerId) {
    return res.status(400).json({ error: 'Nom, téléphone, mot de passe et propriétaire requis' });
  }
  try {
    const ownerCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND role = $2 AND blocked = false',
      [ownerId, 'owner']
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Borlette invalide ou inactive' });
    }
    const existing = await pool.query('SELECT id FROM players WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO players (name, phone, password, zone, owner_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, balance`,
      [name, phone, hashed, zone || null, ownerId]
    );
    const player = result.rows[0];
    const token = jwt.sign(
      { id: player.id, role: 'player', name: player.name, phone: player.phone, ownerId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ success: true, token, playerId: player.id, name: player.name, balance: parseFloat(player.balance) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Connexion joueur
app.post('/api/auth/player/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'Téléphone et mot de passe requis' });
  try {
    const result = await pool.query(
      'SELECT id, name, phone, password, balance, owner_id FROM players WHERE phone = $1',
      [phone]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Téléphone ou mot de passe incorrect' });
    const player = result.rows[0];
    const valid = await bcrypt.compare(password, player.password);
    if (!valid) return res.status(401).json({ error: 'Téléphone ou mot de passe incorrect' });
    const token = jwt.sign(
      { id: player.id, role: 'player', name: player.name, phone: player.phone, ownerId: player.owner_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ success: true, token, playerId: player.id, name: player.name, balance: parseFloat(player.balance) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES PROTÉGÉES JOUEUR ====================

// Obtenir le solde
app.get('/api/player/balance', authenticatePlayer, async (req, res) => {
  try {
    const result = await pool.query('SELECT balance FROM players WHERE id = $1', [req.player.id]);
    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Lister les tirages actifs (communs)
app.get('/api/draws', authenticatePlayer, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, color, active FROM draws ORDER BY time');
    res.json({ draws: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Enregistrer un ticket (avec débit du solde)
app.post('/api/player/tickets/save', authenticatePlayer, async (req, res) => {
  const { drawId, drawName, bets, total } = req.body;
  const playerId = req.player.id;
  const ownerId = req.player.ownerId;
  const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);

  if (!drawId || !bets || !total || total <= 0) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  try {
    // Vérifier le solde
    const playerRes = await pool.query('SELECT balance FROM players WHERE id = $1', [playerId]);
    const currentBalance = parseFloat(playerRes.rows[0].balance);
    if (currentBalance < total) {
      return res.status(400).json({ error: 'Solde insuffisant' });
    }

    // Vérifier que le tirage est actif
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
    }

    // Débiter le solde
    await pool.query('UPDATE players SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [total, playerId]);

    // Insérer le ticket
    const result = await pool.query(
      `INSERT INTO tickets (owner_id, player_id, draw_id, draw_name, ticket_id, total_amount, bets, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
      [ownerId, playerId, drawId, drawName, ticketId, total, JSON.stringify(bets)]
    );

    // Enregistrer la transaction
    await pool.query(
      `INSERT INTO transactions (player_id, type, amount, description) VALUES ($1, $2, $3, $4)`,
      [playerId, 'bet', total, `Ticket ${ticketId} - ${drawName}`]
    );

    res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, total_amount: total } });
  } catch (err) {
    console.error('Erreur sauvegarde ticket joueur:', err);
    // Tenter de rembourser en cas d'erreur
    await pool.query('UPDATE players SET balance = balance + $1 WHERE id = $2', [total, playerId]).catch(() => {});
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Historique des tickets du joueur
app.get('/api/player/tickets', authenticatePlayer, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tickets WHERE player_id = $1 ORDER BY date DESC LIMIT 50',
      [req.player.id]
    );
    res.json({ tickets: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Historique des transactions
app.get('/api/player/transactions', authenticatePlayer, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.player.id]
    );
    res.json({ transactions: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES POUR AGENTS/SUPERVISEURS (dépôt/retrait) ====================
// Ces routes permettent aux agents, superviseurs, propriétaires de créditer/débiter un compte joueur.
// Elles utilisent un token d'authentification (rôle agent, supervisor, owner, superadmin)
const authenticateStaff = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!['agent', 'supervisor', 'owner', 'superadmin'].includes(decoded.role)) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

app.post('/api/player/deposit', authenticateStaff, async (req, res) => {
  const { playerId, amount, method } = req.body;
  if (!playerId || !amount || amount <= 0) return res.status(400).json({ error: 'Données invalides' });
  try {
    const playerOwner = await pool.query('SELECT owner_id FROM players WHERE id = $1', [playerId]);
    if (playerOwner.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    if (playerOwner.rows[0].owner_id !== req.user.ownerId) {
      return res.status(403).json({ error: 'Joueur non autorisé pour ce compte' });
    }
    const update = await pool.query('UPDATE players SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING balance', [amount, playerId]);
    await pool.query('INSERT INTO transactions (player_id, type, amount, method, description) VALUES ($1, $2, $3, $4, $5)',
      [playerId, 'deposit', amount, method || 'cash', `Dépôt par ${req.user.role} ${req.user.name}`]);
    res.json({ success: true, balance: parseFloat(update.rows[0].balance) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/player/withdraw', authenticateStaff, async (req, res) => {
  const { playerId, amount, method } = req.body;
  if (!playerId || !amount || amount <= 0) return res.status(400).json({ error: 'Données invalides' });
  try {
    const playerOwner = await pool.query('SELECT owner_id, balance FROM players WHERE id = $1', [playerId]);
    if (playerOwner.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    if (playerOwner.rows[0].owner_id !== req.user.ownerId) {
      return res.status(403).json({ error: 'Joueur non autorisé' });
    }
    const balance = parseFloat(playerOwner.rows[0].balance);
    if (balance < amount) return res.status(400).json({ error: 'Solde insuffisant' });
    const update = await pool.query('UPDATE players SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING balance', [amount, playerId]);
    await pool.query('INSERT INTO transactions (player_id, type, amount, method, description) VALUES ($1, $2, $3, $4, $5)',
      [playerId, 'withdraw', amount, method || 'cash', `Retrait par ${req.user.role} ${req.user.name}`]);
    res.json({ success: true, balance: parseFloat(update.rows[0].balance) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Démarrer le serveur
initTables().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎮 Serveur JOUEUR démarré sur http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Impossible de démarrer le serveur joueur:', err);
  process.exit(1);
});
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const moment = require('moment-timezone');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me';

// ========== Middleware ==========
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Accès interdit' });
  next();
};

const requirePlayer = (req, res, next) => {
  if (req.user.role !== 'player') return res.status(403).json({ error: 'Accès réservé aux joueurs' });
  next();
};

// ========== Création des tables ==========
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      username VARCHAR(50) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(20),
      phone VARCHAR(20),
      blocked BOOLEAN DEFAULT false,
      quota INTEGER DEFAULT 10,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      phone VARCHAR(20) UNIQUE,
      password VARCHAR(255),
      zone VARCHAR(100),
      owner_id INTEGER REFERENCES users(id),
      balance DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      agent_id INTEGER,
      agent_name VARCHAR(100),
      draw_id INTEGER,
      draw_name VARCHAR(100),
      ticket_id VARCHAR(50) UNIQUE,
      total_amount DECIMAL(10,2),
      win_amount DECIMAL(10,2) DEFAULT 0,
      paid BOOLEAN DEFAULT false,
      bets JSONB,
      date TIMESTAMP DEFAULT NOW(),
      player_id INTEGER REFERENCES players(id),
      player_name VARCHAR(100)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      player_id INTEGER REFERENCES players(id),
      type VARCHAR(20),
      amount DECIMAL(10,2),
      method VARCHAR(20),
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS owner_messages (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      message TEXT,
      expires_at TIMESTAMP
    );
  `);
  console.log('✅ Base initialisée');
}
initDB();

// ========== Routes publiques ==========
app.get('/api/owners/active', async (req, res) => {
  const result = await pool.query('SELECT id, name FROM users WHERE role = $1 AND blocked = false', ['owner']);
  res.json(result.rows);
});

// ========== Authentification joueur ==========
app.post('/api/auth/player/register', async (req, res) => {
  const { name, phone, password, zone, ownerId } = req.body;
  if (!name || !phone || !password || !ownerId)
    return res.status(400).json({ error: 'Champs requis' });
  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO players (name, phone, password, zone, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [name, phone, hashed, zone, ownerId]
  );
  const token = jwt.sign({ id: result.rows[0].id, role: 'player', name, phone, ownerId }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, playerId: result.rows[0].id, name, balance: 0 });
});

app.post('/api/auth/player/login', async (req, res) => {
  const { phone, password } = req.body;
  const result = await pool.query('SELECT * FROM players WHERE phone = $1', [phone]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
  const player = result.rows[0];
  if (!await bcrypt.compare(password, player.password))
    return res.status(401).json({ error: 'Identifiants incorrects' });
  const token = jwt.sign({ id: player.id, role: 'player', name: player.name, phone, ownerId: player.owner_id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, playerId: player.id, name: player.name, balance: parseFloat(player.balance) });
});

app.get('/api/player/balance', authenticate, requirePlayer, async (req, res) => {
  const result = await pool.query('SELECT balance FROM players WHERE id = $1', [req.user.id]);
  res.json({ balance: parseFloat(result.rows[0].balance) });
});

// ========== Tickets pour joueur (avec débit) ==========
app.post('/api/tickets/save', authenticate, async (req, res) => {
  const { drawId, drawName, bets, total, playerId, playerName } = req.body;
  if (!playerId) return res.status(400).json({ error: 'playerId requis' });
  const ownerId = req.user.ownerId;
  const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
  // Vérifier solde
  const playerRes = await pool.query('SELECT balance FROM players WHERE id = $1', [playerId]);
  if (playerRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
  if (playerRes.rows[0].balance < total) return res.status(400).json({ error: 'Solde insuffisant' });
  // Débiter
  await pool.query('UPDATE players SET balance = balance - $1 WHERE id = $2', [total, playerId]);
  await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES ($1,$2,$3,$4)', [playerId, 'bet', total, `Ticket ${ticketId}`]);
  // Sauvegarder ticket
  await pool.query(
    `INSERT INTO tickets (owner_id, draw_id, draw_name, ticket_id, total_amount, bets, player_id, player_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ownerId, drawId, drawName, ticketId, total, JSON.stringify(bets), playerId, playerName]
  );
  res.json({ success: true, ticket: { ticket_id: ticketId } });
});

app.get('/api/tickets', authenticate, async (req, res) => {
  const { playerId } = req.query;
  if (req.user.role === 'player' && playerId && req.user.id == playerId) {
    const result = await pool.query('SELECT * FROM tickets WHERE player_id = $1 ORDER BY date DESC', [playerId]);
    return res.json({ tickets: result.rows });
  }
  res.json({ tickets: [] });
});

// ========== Routes superadmin ==========
app.post('/api/auth/superadmin-login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM users WHERE username = $1 AND role = $2', [username, 'superadmin']);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
  const user = result.rows[0];
  if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Identifiants incorrects' });
  const token = jwt.sign({ id: user.id, role: 'superadmin', name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, token, name: user.name });
});

app.get('/api/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
  const result = await pool.query('SELECT id, name, username as email, phone, blocked as active, quota FROM users WHERE role = $1', ['owner']);
  res.json(result.rows);
});

app.post('/api/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, email, password, phone, quota } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (name, username, password, role, phone, quota) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [name, email, hashed, 'owner', phone, quota || 10]
  );
  res.json({ success: true });
});

app.delete('/api/superadmin/owners/:id', authenticate, requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [req.params.id, 'owner']);
  res.json({ success: true });
});

app.put('/api/superadmin/owners/:id/quota', authenticate, requireSuperAdmin, async (req, res) => {
  await pool.query('UPDATE users SET quota = $1 WHERE id = $2', [req.body.quota, req.params.id]);
  res.json({ success: true });
});

app.get('/api/superadmin/agents', authenticate, requireSuperAdmin, async (req, res) => {
  const result = await pool.query('SELECT id, name, username as email, phone, owner_id FROM users WHERE role = $1', ['agent']);
  res.json(result.rows);
});

app.get('/api/superadmin/supervisors', authenticate, requireSuperAdmin, async (req, res) => {
  const result = await pool.query('SELECT id, name, username as email, phone, owner_id FROM users WHERE role = $1', ['supervisor']);
  res.json(result.rows);
});

app.delete('/api/superadmin/agents/:id', authenticate, requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [req.params.id, 'agent']);
  res.json({ success: true });
});

app.delete('/api/superadmin/supervisors/:id', authenticate, requireSuperAdmin, async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [req.params.id, 'supervisor']);
  res.json({ success: true });
});

app.post('/api/superadmin/messages', authenticate, requireSuperAdmin, async (req, res) => {
  const { ownerId, message } = req.body;
  await pool.query('INSERT INTO owner_messages (owner_id, message, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')', [ownerId, message]);
  res.json({ success: true });
});

app.get('/api/superadmin/reports/owners', authenticate, requireSuperAdmin, async (req, res) => {
  const result = await pool.query(`
    SELECT o.id, o.name, COUNT(DISTINCT a.id) as agent_count, COUNT(DISTINCT t.id) as ticket_count,
           COALESCE(SUM(t.total_amount),0) as total_bets, COALESCE(SUM(t.win_amount),0) as total_wins
    FROM users o
    LEFT JOIN users a ON a.owner_id = o.id AND a.role = 'agent'
    LEFT JOIN tickets t ON t.owner_id = o.id AND t.date >= CURRENT_DATE
    WHERE o.role = 'owner'
    GROUP BY o.id
  `);
  res.json(result.rows);
});

app.listen(port, () => console.log(`🚀 Serveur sur port ${port}`));
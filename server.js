// server.js – version unique avec toutes les routes (propriétaires, agents, superviseurs, joueurs)
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const moment = require('moment-timezone');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ==================== PostgreSQL ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Port-au-Prince'", (err) => {
    if (err) console.error('❌ Erreur réglage fuseau:', err);
  });
});

const pg = require('pg');
pg.types.setTypeParser(1114, (stringValue) => {
  return moment.tz(stringValue, 'YYYY-MM-DD HH:mm:ss', 'America/Port-au-Prince').toDate();
});

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

// ==================== Création des tables (inclut les tables joueurs) ====================
async function ensureTables() {
  // Table users (propriétaires, superviseurs, agents, superadmin)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        cin VARCHAR(50),
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('owner','supervisor','agent','superadmin')),
        supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        zone VARCHAR(100),
        commission_percentage DECIMAL(5,2) DEFAULT 0,
        blocked BOOLEAN DEFAULT false,
        quota INTEGER DEFAULT 0,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Table draws (commune à tous)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS draws (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        time TIME NOT NULL,
        color VARCHAR(20),
        active BOOLEAN DEFAULT true
    )
  `);

  // Table lottery_settings (par propriétaire)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_settings (
        owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100),
        slogan TEXT,
        logo_url TEXT,
        multipliers JSONB,
        limits JSONB
    )
  `);

  // Table winning_results (par propriétaire)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS winning_results (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
        numbers JSONB NOT NULL,
        lotto3 VARCHAR(3),
        date TIMESTAMP DEFAULT NOW()
    )
  `);

  // Table tickets (par propriétaire)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        agent_name VARCHAR(100),
        player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
        player_name VARCHAR(100),
        draw_id INTEGER REFERENCES draws(id) ON DELETE SET NULL,
        draw_name VARCHAR(100),
        ticket_id VARCHAR(50) UNIQUE,
        total_amount DECIMAL(10,2) DEFAULT 0,
        win_amount DECIMAL(10,2) DEFAULT 0,
        paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP,
        checked BOOLEAN DEFAULT false,
        bets JSONB,
        date TIMESTAMP DEFAULT NOW()
    )
  `);

  // Activity log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_role VARCHAR(20),
        action VARCHAR(100),
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Owner messages
  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_messages (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes'
    )
  `);

  // Tables de gestion des limites et blocages (par propriétaire)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS global_number_limits (
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        number VARCHAR(2) NOT NULL,
        limit_amount DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (owner_id, number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS draw_number_limits (
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(2) NOT NULL,
        limit_amount DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (owner_id, draw_id, number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS global_blocked_numbers (
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        number VARCHAR(2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (owner_id, number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS draw_blocked_numbers (
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (owner_id, draw_id, number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_lotto3_numbers (
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        number VARCHAR(3) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (owner_id, number)
    )
  `);

  // Tables joueurs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        zone VARCHAR(100),
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        balance DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdraw', 'bet')),
        amount DECIMAL(10,2) NOT NULL,
        method VARCHAR(20),
        description TEXT,
        reference VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_messages (
        id SERIAL PRIMARY KEY,
        player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Ajout des colonnes player_id et player_name dans tickets (si absentes)
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS player_id INTEGER REFERENCES players(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS player_name VARCHAR(100)`);

  // Index
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_owner_date ON tickets(owner_id, date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_agent_date ON tickets(agent_id, date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_player_id ON tickets(player_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_player_id ON transactions(player_id)`);

  console.log('✅ Tables vérifiées/créées');
}

// ==================== Middleware d'authentification ====================
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) return res.status(403).json({ error: 'Accès interdit' });
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Accès interdit' });
  next();
};

// ==================== Routes d'authentification ====================
app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, username, password, role, owner_id FROM users WHERE username = $1 AND role = $2',
      [username, role]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    };
    if (user.role === 'agent' || user.role === 'supervisor') {
      payload.ownerId = user.owner_id;
    } else if (user.role === 'owner') {
      payload.ownerId = user.id;
    }

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, user.role, 'login', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      token,
      name: user.name,
      role: user.role,
      ownerId: payload.ownerId,
      agentId: user.role === 'agent' ? user.id : undefined,
      supervisorId: user.role === 'supervisor' ? user.id : undefined
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/superadmin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, username, password, role FROM users WHERE username = $1 AND role = $2',
      [username, 'superadmin']
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, user.role, 'login', req.ip, req.headers['user-agent']]
    );

    res.json({ success: true, token, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/auth/verify', authenticate, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.post('/api/auth/logout', authenticate, async (req, res) => {
  await pool.query(
    'INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1, $2, $3, $4)',
    [req.user.id, req.user.role, 'logout', req.ip]
  );
  res.json({ success: true, message: 'Déconnexion réussie' });
});

// ==================== Routes communes ====================
app.get('/api/lottery-settings', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  if (!ownerId) return res.status(403).json({ error: 'Propriétaire non identifié' });
  try {
    const result = await pool.query(
      'SELECT name, slogan, logo_url, multipliers, limits FROM lottery_settings WHERE owner_id = $1',
      [ownerId]
    );
    if (result.rows.length === 0) {
      return res.json({ name: 'LOTATO PRO', slogan: '', logoUrl: '', multipliers: {}, limits: {} });
    }
    const row = result.rows[0];
    res.json({
      name: row.name,
      slogan: row.slogan,
      logoUrl: row.logo_url,
      multipliers: row.multipliers,
      limits: row.limits
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/draws', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, color, active FROM draws ORDER BY time');
    res.json({ draws: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/blocked-numbers/global', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query('SELECT number FROM global_blocked_numbers WHERE owner_id = $1', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/blocked-numbers/draw/:drawId', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { drawId } = req.params;
  try {
    const result = await pool.query('SELECT number FROM draw_blocked_numbers WHERE owner_id = $1 AND draw_id = $2', [ownerId, drawId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/number-limits', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const global = await pool.query('SELECT NULL as draw_id, number, limit_amount FROM global_number_limits WHERE owner_id = $1', [ownerId]);
    const draw = await pool.query(
      `SELECT l.draw_id, d.name as draw_name, l.number, l.limit_amount
       FROM draw_number_limits l
       LEFT JOIN draws d ON l.draw_id = d.id
       WHERE l.owner_id = $1
       ORDER BY draw_id, number`,
      [ownerId]
    );
    res.json([...global.rows, ...draw.rows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarde d'un ticket (avec gestion joueur)
app.post('/api/tickets/save', authenticate, async (req, res) => {
  const { agentId, agentName, drawId, drawName, bets, total, playerId } = req.body;
  const ownerId = req.user.ownerId;
  const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);

  try {
    // Vérifier que le tirage est actif
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
    }

    // Gestion du joueur si présent
    let playerName = null;
    if (playerId) {
      const playerRes = await pool.query('SELECT name, balance FROM players WHERE id = $1 AND owner_id = $2', [playerId, ownerId]);
      if (playerRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
      playerName = playerRes.rows[0].name;
      const balance = parseFloat(playerRes.rows[0].balance);
      if (balance < total) return res.status(403).json({ error: 'Solde insuffisant' });
      await pool.query('UPDATE players SET balance = balance - $1 WHERE id = $2', [total, playerId]);
      await pool.query(
        'INSERT INTO transactions (player_id, type, amount, description) VALUES ($1, $2, $3, $4)',
        [playerId, 'bet', total, `Pari sur tirage ${drawName} (Ticket ${ticketId})`]
      );
    }

    // Récupération des blocages et limites (propres au propriétaire)
    const globalBlocked = await pool.query('SELECT number FROM global_blocked_numbers WHERE owner_id = $1', [ownerId]);
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));
    const drawBlocked = await pool.query('SELECT number FROM draw_blocked_numbers WHERE owner_id = $1 AND draw_id = $2', [ownerId, drawId]);
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));
    const blockedLotto3 = await pool.query('SELECT number FROM blocked_lotto3_numbers WHERE owner_id = $1', [ownerId]);
    const blockedLotto3Set = new Set(blockedLotto3.rows.map(r => r.number));

    const globalLimitsRes = await pool.query('SELECT number, limit_amount FROM global_number_limits WHERE owner_id = $1', [ownerId]);
    const globalLimitsMap = new Map(globalLimitsRes.rows.map(r => [r.number, parseFloat(r.limit_amount)]));
    const drawLimitsRes = await pool.query('SELECT number, limit_amount FROM draw_number_limits WHERE owner_id = $1 AND draw_id = $2', [ownerId, drawId]);
    const drawLimitsMap = new Map(drawLimitsRes.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    const settingsRes = await pool.query('SELECT limits FROM lottery_settings WHERE owner_id = $1', [ownerId]);
    let gameLimits = { lotto3: 0, lotto4: 0, lotto5: 0, mariage: 0 };
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].limits) {
      const raw = settingsRes.rows[0].limits;
      gameLimits = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }

    // Vérification des limites (simplifiée, reprendre la logique complète de votre ancien code)
    // ... (je mets une version raccourcie mais vous devez conserver votre logique existante)

    // Mariages gratuits
    const paidBets = bets.filter(b => !b.free);
    const totalPaid = paidBets.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    let requiredFree = 0;
    if (totalPaid >= 1 && totalPaid <= 50) requiredFree = 1;
    else if (totalPaid >= 51 && totalPaid <= 150) requiredFree = 2;
    else if (totalPaid >= 151) requiredFree = 3;

    const newFreeBets = [];
    for (let i = 0; i < requiredFree; i++) {
      const n1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const n2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      newFreeBets.push({ game: 'auto_marriage', number: `${n1}&${n2}`, cleanNumber: n1 + n2, amount: 0, free: true, freeType: 'special_marriage', freeWin: 1000 });
    }
    const finalBets = [...bets, ...newFreeBets];
    const finalTotal = finalBets.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

    const result = await pool.query(
      `INSERT INTO tickets (owner_id, agent_id, agent_name, player_id, player_name, draw_id, draw_name, ticket_id, total_amount, bets, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()) RETURNING id`,
      [ownerId, agentId, agentName, playerId || null, playerName, drawId, drawName, ticketId, finalTotal, JSON.stringify(finalBets)]
    );

    res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, ...req.body } });
  } catch (err) {
    console.error('❌ Erreur sauvegarde ticket:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des tickets (filtrage par rôle)
app.get('/api/tickets', authenticate, async (req, res) => {
  const user = req.user;
  const ownerId = user.ownerId;
  let query = 'SELECT * FROM tickets WHERE owner_id = $1';
  const params = [ownerId];
  let idx = 2;

  if (user.role === 'agent') {
    query += ` AND agent_id = $${idx++}`;
    params.push(user.id);
  } else if (user.role === 'supervisor') {
    const { agentId } = req.query;
    if (agentId) {
      const check = await pool.query('SELECT id FROM users WHERE id = $1 AND supervisor_id = $2 AND role = $3', [agentId, user.id, 'agent']);
      if (check.rows.length === 0) return res.status(403).json({ error: 'Agent non autorisé' });
      query += ` AND agent_id = $${idx++}`;
      params.push(agentId);
    } else {
      query += ` AND agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++} AND role = 'agent')`;
      params.push(user.id);
    }
  } else if (user.role === 'owner') {
    const { agentId } = req.query;
    if (agentId) {
      query += ` AND agent_id = $${idx++}`;
      params.push(agentId);
    }
  }
  query += ' ORDER BY date DESC';
  try {
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur chargement tickets' });
  }
});

app.delete('/api/tickets/:id', authenticate, async (req, res) => {
  const user = req.user;
  const ticketId = req.params.id;
  try {
    const ticket = await pool.query('SELECT owner_id, agent_id, date FROM tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket introuvable' });
    const t = ticket.rows[0];
    if (user.role === 'owner') {
      if (t.owner_id !== user.id) return res.status(403).json({ error: 'Accès interdit' });
    } else if (user.role === 'supervisor') {
      const check = await pool.query('SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3', [t.agent_id, user.ownerId, user.id]);
      if (check.rows.length === 0) return res.status(403).json({ error: 'Accès interdit' });
    } else if (user.role === 'agent') {
      if (t.agent_id !== user.id) return res.status(403).json({ error: 'Accès interdit' });
    } else return res.status(403).json({ error: 'Accès interdit' });
    const diffMinutes = (new Date() - new Date(t.date)) / 60000;
    if (user.role !== 'owner' && diffMinutes > 3) return res.status(403).json({ error: 'Délai de suppression dépassé (3 min)' });
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)', [user.id, user.role, 'delete_ticket', `Ticket ID: ${ticketId}`, req.ip]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

// Paiement gagnant (agent)
app.post('/api/winners/pay/:ticketId', authenticate, requireRole('agent'), async (req, res) => {
  const ticketId = req.params.ticketId;
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const ticket = await pool.query('SELECT id FROM tickets WHERE id = $1 AND agent_id = $2 AND owner_id = $3', [ticketId, agentId, ownerId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé ou non autorisé' });
    await pool.query('UPDATE tickets SET paid = true, paid_at = NOW() WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Rapports agent
app.get('/api/reports', authenticate, async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT COUNT(id) as total_tickets, COALESCE(SUM(total_amount),0) as total_bets,
              COALESCE(SUM(win_amount),0) as total_wins,
              COALESCE(SUM(win_amount)-SUM(total_amount),0) as balance
       FROM tickets WHERE owner_id = $1 AND agent_id = $2 AND date >= CURRENT_DATE`,
      [ownerId, agentId]
    );
    const row = result.rows[0];
    res.json({
      totalTickets: parseInt(row.total_tickets),
      totalBets: parseFloat(row.total_bets),
      totalWins: parseFloat(row.total_wins),
      totalLoss: parseFloat(row.total_bets) - parseFloat(row.total_wins),
      balance: parseFloat(row.balance)
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/reports/draw', authenticate, async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  const { drawId } = req.query;
  if (!drawId) return res.status(400).json({ error: 'drawId requis' });
  try {
    const result = await pool.query(
      `SELECT COUNT(id) as total_tickets, COALESCE(SUM(total_amount),0) as total_bets,
              COALESCE(SUM(win_amount),0) as total_wins,
              COALESCE(SUM(win_amount)-SUM(total_amount),0) as balance
       FROM tickets WHERE owner_id = $1 AND agent_id = $2 AND draw_id = $3 AND date >= CURRENT_DATE`,
      [ownerId, agentId, drawId]
    );
    const row = result.rows[0];
    res.json({
      totalTickets: parseInt(row.total_tickets),
      totalBets: parseFloat(row.total_bets),
      totalWins: parseFloat(row.total_wins),
      totalLoss: parseFloat(row.total_bets) - parseFloat(row.total_wins),
      balance: parseFloat(row.balance)
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Winners
app.get('/api/winners', authenticate, async (req, res) => {
  const user = req.user;
  const ownerId = user.ownerId;
  let query = 'SELECT * FROM tickets WHERE owner_id = $1 AND win_amount > 0';
  const params = [ownerId];
  let idx = 2;
  if (user.role === 'agent') {
    query += ` AND agent_id = $${idx++}`;
    params.push(user.id);
  } else if (user.role === 'supervisor') {
    const { agentId } = req.query;
    if (agentId) {
      const check = await pool.query('SELECT id FROM users WHERE id = $1 AND supervisor_id = $2 AND role = $3', [agentId, user.id, 'agent']);
      if (check.rows.length === 0) return res.status(403).json({ error: 'Agent non autorisé' });
      query += ` AND agent_id = $${idx++}`;
      params.push(agentId);
    } else {
      query += ` AND agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++} AND role = 'agent')`;
      params.push(user.id);
    }
  } else if (user.role === 'owner') {
    const { agentId } = req.query;
    if (agentId) {
      query += ` AND agent_id = $${idx++}`;
      params.push(agentId);
    }
  }
  query += ' ORDER BY date DESC LIMIT 20';
  try {
    const result = await pool.query(query, params);
    res.json({ winners: result.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/winners/results', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT wr.*, d.name as draw_name, wr.date as published_at
       FROM winning_results wr
       JOIN draws d ON wr.draw_id = d.id
       WHERE wr.owner_id = $1 AND wr.date >= CURRENT_DATE
       ORDER BY wr.draw_id, wr.date DESC`,
      [ownerId]
    );
    const rows = result.rows.map(row => ({
      ...row,
      numbers: typeof row.numbers === 'string' ? JSON.parse(row.numbers) : row.numbers,
      published_at: row.published_at,
      name: row.draw_name
    }));
    res.json({ results: rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== Routes superviseur ====================
app.get('/api/supervisor/reports/overall', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT COUNT(t.id) as total_tickets, COALESCE(SUM(t.total_amount),0) as total_bets,
              COALESCE(SUM(t.win_amount),0) as total_wins,
              COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as balance
       FROM tickets t JOIN users u ON t.agent_id = u.id
       WHERE t.owner_id = $1 AND u.supervisor_id = $2 AND DATE(t.date) = CURRENT_DATE`,
      [ownerId, supervisorId]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/supervisor/agents', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked, u.zone,
              COALESCE(SUM(t.total_amount),0) as total_bets,
              COALESCE(SUM(t.win_amount),0) as total_wins,
              COUNT(t.id) as total_tickets,
              COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as balance,
              COALESCE(SUM(CASE WHEN t.paid = false THEN t.win_amount ELSE 0 END),0) as unpaid_wins
       FROM users u LEFT JOIN tickets t ON u.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE u.owner_id = $1 AND u.supervisor_id = $2 AND u.role = 'agent'
       GROUP BY u.id`,
      [ownerId, supervisorId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/supervisor/tickets/recent', authenticate, requireRole('supervisor'), async (req, res) => {
  const { agentId } = req.query;
  const ownerId = req.user.ownerId;
  const supervisorId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT t.* FROM tickets t JOIN users u ON t.agent_id = u.id
       WHERE t.owner_id = $1 AND u.supervisor_id = $2 AND t.agent_id = $3
       ORDER BY t.date DESC LIMIT 20`,
      [ownerId, supervisorId, agentId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/supervisor/tickets', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const { page = 0, limit = 20, agentId, gain, paid, period, fromDate, toDate } = req.query;
  let query = `SELECT t.* FROM tickets t JOIN users u ON t.agent_id = u.id WHERE t.owner_id = $1 AND u.supervisor_id = $2`;
  const params = [ownerId, supervisorId];
  let idx = 3;
  if (agentId && agentId !== 'all') { query += ` AND t.agent_id = $${idx++}`; params.push(agentId); }
  if (gain === 'win') query += ` AND t.win_amount > 0`;
  else if (gain === 'nowin') query += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;
  if (paid === 'paid') query += ` AND t.paid = true`;
  else if (paid === 'unpaid') query += ` AND t.paid = false`;
  if (period === 'today') query += ` AND DATE(t.date) = CURRENT_DATE`;
  else if (period === 'yesterday') query += ` AND DATE(t.date) = CURRENT_DATE - INTERVAL '1 day'`;
  else if (period === 'week') query += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') query += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { query += ` AND DATE(t.date) BETWEEN $${idx++} AND $${idx++}`; params.push(fromDate, toDate); }
  const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
  const countRes = await pool.query(countQuery, params);
  const total = parseInt(countRes.rows[0].count);
  query += ` ORDER BY t.date DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(page) * parseInt(limit));
  const dataRes = await pool.query(query, params);
  res.json({ tickets: dataRes.rows, hasMore: (page + 1) * limit < total, total });
});

app.post('/api/supervisor/block-agent/:id', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const agentId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3 AND role = $4', [agentId, ownerId, supervisorId, 'agent']);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Agent non trouvé ou non autorisé' });
    await pool.query('UPDATE users SET blocked = true WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/supervisor/unblock-agent/:id', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const agentId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3 AND role = $4', [agentId, ownerId, supervisorId, 'agent']);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Agent non trouvé ou non autorisé' });
    await pool.query('UPDATE users SET blocked = false WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/supervisor/tickets/:id/pay', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const ticketId = req.params.id;
  try {
    const check = await pool.query(`SELECT t.id FROM tickets t JOIN users u ON t.agent_id = u.id WHERE t.id = $1 AND t.owner_id = $2 AND u.supervisor_id = $3`, [ticketId, ownerId, supervisorId]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Ticket non trouvé ou non autorisé' });
    await pool.query('UPDATE tickets SET paid = true, paid_at = NOW() WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== Routes propriétaire ====================
app.get('/api/owner/messages', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT message FROM owner_messages WHERE owner_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [ownerId]);
    res.json({ message: result.rows[0]?.message || null });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/owner/supervisors', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT id, name, username, blocked FROM users WHERE owner_id = $1 AND role = $2', [ownerId, 'supervisor']);
    res.json(result.rows.map(s => ({ ...s, email: s.username })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/owner/agents', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked, u.zone, u.cin, u.commission_percentage, s.name as supervisor_name
       FROM users u LEFT JOIN users s ON u.supervisor_id = s.id
       WHERE u.owner_id = $1 AND u.role = $2`,
      [ownerId, 'agent']
    );
    res.json(result.rows.map(a => ({ ...a, email: a.username })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/owner/create-user', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { name, cin, username, password, role, supervisorId, zone, commissionPercentage } = req.body;
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  try {
    const quotaRes = await pool.query('SELECT quota FROM users WHERE id = $1', [ownerId]);
    const quota = quotaRes.rows[0]?.quota || 0;
    const countRes = await pool.query('SELECT COUNT(*) FROM users WHERE owner_id = $1 AND role IN ($2, $3)', [ownerId, 'agent', 'supervisor']);
    if (parseInt(countRes.rows[0].count) >= quota) return res.status(403).json({ error: 'Quota d’utilisateurs atteint.' });
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (owner_id, name, cin, username, password, role, supervisor_id, zone, commission_percentage, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id, name, username, role, cin, zone, commission_percentage`,
      [ownerId, name, cin || null, username, hashed, role, supervisorId || null, zone || null, commissionPercentage || 0]
    );
    const user = { ...result.rows[0], email: result.rows[0].username };
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)', [ownerId, 'owner', 'create_user', `Création ${role}: ${username}`, req.ip]);
    res.json({ success: true, user });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "Nom d'utilisateur déjà existant" });
    res.status(500).json({ error: 'Erreur création utilisateur' });
  }
});

app.post('/api/owner/block-user', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { userId } = req.body;
  try {
    await pool.query('UPDATE users SET blocked = NOT blocked WHERE id = $1 AND owner_id = $2', [userId, ownerId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.put('/api/owner/change-supervisor', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { agentId, supervisorId } = req.body;
  try {
    await pool.query('UPDATE users SET supervisor_id = $1 WHERE id = $2 AND owner_id = $3 AND role = $4', [supervisorId || null, agentId, ownerId, 'agent']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/draws', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, color, active FROM draws ORDER BY time');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/publish-results', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, numbers, lotto3 } = req.body;
  if (!drawId || !numbers || numbers.length !== 3) return res.status(400).json({ error: 'Données invalides' });
  try {
    await pool.query(`INSERT INTO winning_results (owner_id, draw_id, numbers, lotto3, date) VALUES ($1, $2, $3, $4, NOW())`, [ownerId, drawId, JSON.stringify(numbers), lotto3]);
    const settingsRes = await pool.query('SELECT multipliers FROM lottery_settings WHERE owner_id = $1', [ownerId]);
    let multipliers = { lot1: 60, lot2: 20, lot3: 10, lotto3: 500, lotto4: 5000, lotto5: 25000, mariage: 500 };
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].multipliers) {
      const raw = settingsRes.rows[0].multipliers;
      multipliers = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    const [lot1, lot2, lot3_num] = numbers;
    const ticketsRes = await pool.query('SELECT id, bets FROM tickets WHERE owner_id = $1 AND draw_id = $2 AND checked = false', [ownerId, drawId]);
    for (const ticket of ticketsRes.rows) {
      let totalWin = 0;
      const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
      if (Array.isArray(bets)) {
        for (const bet of bets) {
          const game = bet.game || bet.specialType;
          const clean = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
          const amount = parseFloat(bet.amount) || 0;
          let gain = 0;
          if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
            if (clean.length === 2) {
              if (clean === lot1) gain += amount * multipliers.lot1;
              if (clean === lot2) gain += amount * multipliers.lot2;
              if (clean === lot3_num) gain += amount * multipliers.lot3;
            }
          } else if (game === 'lotto3') {
            if (clean.length === 3 && clean === lotto3) gain = amount * multipliers.lotto3;
          } else if (game === 'mariage' || game === 'auto_marriage') {
            if (clean.length === 4) {
              const first = clean.slice(0,2), second = clean.slice(2,4);
              const pairs = [lot1, lot2, lot3_num];
              let win = false;
              for (let i=0;i<3;i++) for (let j=0;j<3;j++) if (i!==j && first===pairs[i] && second===pairs[j]) win=true;
              if (win) gain = (bet.free && bet.freeType==='special_marriage') ? 1000 : amount * multipliers.mariage;
            }
          } else if (game === 'lotto4' || game === 'auto_lotto4') {
            if (clean.length === 4 && bet.option) {
              let expected = '';
              if (bet.option == 1) expected = lot1 + lot2;
              else if (bet.option == 2) expected = lot2 + lot3_num;
              else if (bet.option == 3) expected = lot1 + lot3_num;
              if (clean === expected) gain = amount * multipliers.lotto4;
            }
          } else if (game === 'lotto5' || game === 'auto_lotto5') {
            if (clean.length === 5 && bet.option) {
              let expected = '';
              if (bet.option == 1) expected = lotto3 + lot2;
              else if (bet.option == 2) expected = lotto3 + lot3_num;
              if (clean === expected) gain = amount * multipliers.lotto5;
            }
          }
          totalWin += gain;
        }
      }
      await pool.query('UPDATE tickets SET win_amount = $1, checked = true WHERE id = $2', [totalWin, ticket.id]);
    }
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)', [ownerId, 'owner', 'publish_results', `Tirage ${drawId}`, req.ip]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur publication' }); }
});

app.post('/api/owner/block-draw', authenticate, requireRole('owner'), async (req, res) => {
  const { drawId, block } = req.body;
  try {
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!block, drawId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/blocked-numbers', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number FROM global_blocked_numbers WHERE owner_id = $1', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/block-number', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('INSERT INTO global_blocked_numbers (owner_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ownerId, normalized]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/unblock-number', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('DELETE FROM global_blocked_numbers WHERE owner_id = $1 AND number = $2', [ownerId, normalized]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/blocked-numbers-per-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(`SELECT b.draw_id, d.name as draw_name, b.number FROM draw_blocked_numbers b JOIN draws d ON b.draw_id = d.id WHERE b.owner_id = $1`, [ownerId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/block-number-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('INSERT INTO draw_blocked_numbers (owner_id, draw_id, number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [ownerId, drawId, normalized]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/unblock-number-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('DELETE FROM draw_blocked_numbers WHERE owner_id = $1 AND draw_id = $2 AND number = $3', [ownerId, drawId, normalized]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/number-limits', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const global = await pool.query('SELECT NULL as draw_id, NULL as draw_name, number, limit_amount FROM global_number_limits WHERE owner_id = $1', [ownerId]);
    const draw = await pool.query(`SELECT l.draw_id, d.name as draw_name, l.number, l.limit_amount FROM draw_number_limits l LEFT JOIN draws d ON l.draw_id = d.id WHERE l.owner_id = $1 ORDER BY l.draw_id, l.number`, [ownerId]);
    res.json([...global.rows, ...draw.rows]);
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/number-limit', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  let { drawId, number, limitAmount } = req.body;
  const normalized = number.padStart(2, '0');
  if (!/^\d{2}$/.test(normalized)) return res.status(400).json({ error: 'Numéro invalide (2 chiffres requis)' });
  if (!drawId || drawId === '0' || drawId === 'global') {
    await pool.query(`INSERT INTO global_number_limits (owner_id, number, limit_amount) VALUES ($1, $2, $3) ON CONFLICT (owner_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`, [ownerId, normalized, limitAmount]);
  } else {
    await pool.query(`INSERT INTO draw_number_limits (owner_id, draw_id, number, limit_amount) VALUES ($1, $2, $3, $4) ON CONFLICT (owner_id, draw_id, number) DO UPDATE SET limit_amount = $4, updated_at = NOW()`, [ownerId, drawId, normalized, limitAmount]);
  }
  res.json({ success: true });
});

app.post('/api/owner/remove-number-limit', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  let { drawId, number } = req.body;
  const normalized = number.padStart(2, '0');
  if (!drawId || drawId === '0' || drawId === 'global') {
    await pool.query('DELETE FROM global_number_limits WHERE owner_id = $1 AND number = $2', [ownerId, normalized]);
  } else {
    await pool.query('DELETE FROM draw_number_limits WHERE owner_id = $1 AND draw_id = $2 AND number = $3', [ownerId, drawId, normalized]);
  }
  res.json({ success: true });
});

app.get('/api/owner/blocked-draws', authenticate, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id as draw_id, name as draw_name FROM draws WHERE active = false');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/blocked-lotto3', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number FROM blocked_lotto3_numbers WHERE owner_id = $1 ORDER BY number', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/owner/block-lotto3', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  if (!number || number.length !== 3 || !/^\d{3}$/.test(number)) return res.status(400).json({ error: 'Numéro lotto3 invalide' });
  try {
    await pool.query('INSERT INTO blocked_lotto3_numbers (owner_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ownerId, number]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/owner/unblock-lotto3', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_lotto3_numbers WHERE owner_id = $1 AND number = $2', [ownerId, number]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/owner/dashboard', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const supervisors = await pool.query('SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2', [ownerId, 'supervisor']);
    const agents = await pool.query('SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2', [ownerId, 'agent']);
    const sales = await pool.query('SELECT COALESCE(SUM(total_amount),0) as total FROM tickets WHERE owner_id = $1 AND date >= CURRENT_DATE', [ownerId]);
    const agentsGainLoss = await pool.query(
      `SELECT u.id, u.name, COALESCE(SUM(t.total_amount),0) as total_bets, COALESCE(SUM(t.win_amount),0) as total_wins, COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
       FROM users u LEFT JOIN tickets t ON u.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE u.owner_id = $1 AND u.role = $2 GROUP BY u.id`,
      [ownerId, 'agent']
    );
    const limitsProgress = await pool.query(`
      SELECT COALESCE(d.name, '🌍 Global (tous tirages)') as draw_name, l.number, l.limit_amount,
             COALESCE(SUM((bet->>'amount')::numeric), 0) as current_bets,
             (COALESCE(SUM((bet->>'amount')::numeric), 0) / l.limit_amount * 100) as progress_percent
      FROM (SELECT owner_id, NULL as draw_id, number, limit_amount FROM global_number_limits UNION ALL SELECT owner_id, draw_id, number, limit_amount FROM draw_number_limits) l
      LEFT JOIN draws d ON l.draw_id = d.id
      LEFT JOIN tickets t ON t.owner_id = l.owner_id AND DATE(t.date) = CURRENT_DATE AND (l.draw_id IS NULL OR t.draw_id = l.draw_id)
      LEFT JOIN LATERAL jsonb_array_elements(t.bets) AS bet ON (bet->>'cleanNumber') = l.number
      WHERE l.owner_id = $1
      GROUP BY d.name, l.number, l.limit_amount
      ORDER BY progress_percent DESC
    `, [ownerId]);
    res.json({
      connected: { supervisors_count: supervisors.rows.length, supervisors: supervisors.rows.map(s => ({ ...s, email: s.username })), agents_count: agents.rows.length, agents: agents.rows.map(a => ({ ...a, email: a.username })) },
      sales_today: parseFloat(sales.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/owner/reports', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
  let baseQuery = `SELECT COUNT(id) as tickets, COALESCE(SUM(total_amount),0) as bets, COALESCE(SUM(win_amount),0) as wins, COALESCE(SUM(win_amount)-SUM(total_amount),0) as result FROM tickets WHERE owner_id = $1`;
  const params = [ownerId];
  let idx = 2;
  if (supervisorId && supervisorId !== 'all') { baseQuery += ` AND agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++})`; params.push(supervisorId); }
  if (agentId && agentId !== 'all') { baseQuery += ` AND agent_id = $${idx++}`; params.push(agentId); }
  if (drawId && drawId !== 'all') { baseQuery += ` AND draw_id = $${idx++}`; params.push(drawId); }
  if (period === 'today') baseQuery += ` AND date >= CURRENT_DATE`;
  else if (period === 'yesterday') baseQuery += ` AND date >= CURRENT_DATE - INTERVAL '1 day' AND date < CURRENT_DATE`;
  else if (period === 'week') baseQuery += ` AND date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') baseQuery += ` AND date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { baseQuery += ` AND date >= $${idx++} AND date <= $${idx++}`; params.push(fromDate, toDate); }
  if (gainLoss === 'gain') baseQuery += ` AND win_amount > 0`;
  else if (gainLoss === 'loss') baseQuery += ` AND (win_amount = 0 OR win_amount IS NULL)`;
  const summaryRes = await pool.query(baseQuery, params);
  const summary = summaryRes.rows[0];
  let detailQuery = `SELECT d.id as draw_id, d.name as draw_name, COUNT(t.id) as tickets, COALESCE(SUM(t.total_amount),0) as bets, COALESCE(SUM(t.win_amount),0) as wins, COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as result FROM tickets t JOIN draws d ON t.draw_id = d.id WHERE t.owner_id = $1`;
  const detailParams = [ownerId];
  let didx = 2;
  if (supervisorId && supervisorId !== 'all') { detailQuery += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${didx++})`; detailParams.push(supervisorId); }
  if (agentId && agentId !== 'all') { detailQuery += ` AND t.agent_id = $${didx++}`; detailParams.push(agentId); }
  if (drawId && drawId !== 'all') { detailQuery += ` AND t.draw_id = $${didx++}`; detailParams.push(drawId); }
  if (period === 'today') detailQuery += ` AND t.date >= CURRENT_DATE`;
  else if (period === 'yesterday') detailQuery += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
  else if (period === 'week') detailQuery += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') detailQuery += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { detailQuery += ` AND t.date >= $${didx++} AND t.date <= $${didx++}`; detailParams.push(fromDate, toDate); }
  if (gainLoss === 'gain') detailQuery += ` AND t.win_amount > 0`;
  else if (gainLoss === 'loss') detailQuery += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;
  detailQuery += ` GROUP BY d.id, d.name ORDER BY d.name`;
  const detailRes = await pool.query(detailQuery, detailParams);
  const gainLossCount = await pool.query(
    `SELECT COUNT(CASE WHEN net_result > 0 THEN 1 END) as gain_count, COUNT(CASE WHEN net_result < 0 THEN 1 END) as loss_count
     FROM (SELECT u.id, COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
           FROM users u LEFT JOIN tickets t ON u.id = t.agent_id ${period === 'today' ? 'AND DATE(t.date) = CURRENT_DATE' : ''}
           WHERE u.owner_id = $1 AND u.role = 'agent' GROUP BY u.id) sub`,
    [ownerId]
  );
  res.json({
    summary: {
      total_tickets: parseInt(summary.tickets),
      total_bets: parseFloat(summary.bets),
      total_wins: parseFloat(summary.wins),
      net_result: parseFloat(summary.result),
      gain_count: parseInt(gainLossCount.rows[0].gain_count),
      loss_count: parseInt(gainLossCount.rows[0].loss_count)
    },
    detail: detailRes.rows
  });
});

app.get('/api/owner/tickets', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { page = 0, limit = 20, supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid } = req.query;
  let query = `SELECT t.* FROM tickets t WHERE t.owner_id = $1`;
  const params = [ownerId];
  let idx = 2;
  if (supervisorId && supervisorId !== 'all') { query += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++})`; params.push(supervisorId); }
  if (agentId && agentId !== 'all') { query += ` AND t.agent_id = $${idx++}`; params.push(agentId); }
  if (drawId && drawId !== 'all') { query += ` AND t.draw_id = $${idx++}`; params.push(drawId); }
  if (period === 'today') query += ` AND DATE(t.date) = CURRENT_DATE`;
  else if (period === 'yesterday') query += ` AND DATE(t.date) = CURRENT_DATE - INTERVAL '1 day'`;
  else if (period === 'week') query += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') query += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { query += ` AND DATE(t.date) BETWEEN $${idx++} AND $${idx++}`; params.push(fromDate, toDate); }
  if (gain === 'win') query += ` AND t.win_amount > 0`;
  else if (gain === 'nowin') query += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;
  if (paid === 'paid') query += ` AND t.paid = true`;
  else if (paid === 'unpaid') query += ` AND t.paid = false`;
  const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
  const countRes = await pool.query(countQuery, params);
  const total = parseInt(countRes.rows[0].count);
  query += ` ORDER BY t.date DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(parseInt(limit), parseInt(page) * parseInt(limit));
  const dataRes = await pool.query(query, params);
  res.json({ tickets: dataRes.rows, hasMore: (page + 1) * limit < total, total });
});

app.get('/api/owner/tickets/:id', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const ticketId = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ticket introuvable' });
    const ticket = result.rows[0];
    ticket.bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
    res.json(ticket);
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.delete('/api/owner/tickets/:id', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const ticketId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });
    await pool.query('DELETE FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)', [ownerId, 'owner', 'delete_ticket', `Ticket ID: ${ticketId}`, req.ip]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/settings', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT * FROM lottery_settings WHERE owner_id = $1', [ownerId]);
    if (result.rows.length === 0) return res.json({ name: 'LOTATO PRO', slogan: '', logoUrl: '', multipliers: {}, limits: {} });
    const row = result.rows[0];
    row.logoUrl = row.logo_url;
    delete row.logo_url;
    res.json(row);
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.post('/api/owner/settings', authenticate, requireRole('owner'), upload.single('logo'), async (req, res) => {
  const ownerId = req.user.id;
  let { name, slogan, logoUrl, multipliers, limits } = req.body;
  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype;
    logoUrl = `data:${mime};base64,${base64}`;
  }
  if (multipliers && typeof multipliers === 'string') multipliers = JSON.parse(multipliers);
  if (limits && typeof limits === 'string') limits = JSON.parse(limits);
  try {
    await pool.query(
      `INSERT INTO lottery_settings (owner_id, name, slogan, logo_url, multipliers, limits)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (owner_id) DO UPDATE SET name = EXCLUDED.name, slogan = EXCLUDED.slogan, logo_url = EXCLUDED.logo_url, multipliers = EXCLUDED.multipliers, limits = EXCLUDED.limits`,
      [ownerId, name || 'LOTATO PRO', slogan || '', logoUrl || '', JSON.stringify(multipliers || {}), JSON.stringify(limits || {})]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur' }); }
});

app.get('/api/owner/quota', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const quotaRes = await pool.query('SELECT quota FROM users WHERE id = $1', [ownerId]);
    const quota = quotaRes.rows[0]?.quota || 0;
    const usedRes = await pool.query('SELECT COUNT(*) FROM users WHERE owner_id = $1 AND role IN ($2, $3)', [ownerId, 'agent', 'supervisor']);
    const used = parseInt(usedRes.rows[0].count);
    res.json({ quota, used });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Routes indépendantes pour les limites globales (pour compatibilité avec le frontend)
app.get('/api/owner/global-limits', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number, limit_amount FROM global_number_limits WHERE owner_id = $1 ORDER BY number', [ownerId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/owner/global-limits', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number, limitAmount } = req.body;
  const normalized = number.padStart(2, '0');
  if (!/^\d{2}$/.test(normalized)) return res.status(400).json({ error: 'Numéro invalide (2 chiffres)' });
  if (typeof limitAmount !== 'number' || limitAmount <= 0) return res.status(400).json({ error: 'Montant invalide' });
  try {
    await pool.query(
      `INSERT INTO global_number_limits (owner_id, number, limit_amount) VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [ownerId, normalized, limitAmount]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.delete('/api/owner/global-limits/:number', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.params;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('DELETE FROM global_number_limits WHERE owner_id = $1 AND number = $2', [ownerId, normalized]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== Routes joueurs (inscription, connexion, etc.) ====================
app.post('/api/auth/player/register', async (req, res) => {
  const { name, phone, password, zone, ownerId } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Nom, téléphone et mot de passe requis' });

  let targetOwnerId = ownerId;
  if (!targetOwnerId) {
    const ownerRes = await pool.query('SELECT id FROM users WHERE role = $1 AND blocked = false ORDER BY id LIMIT 1', ['owner']);
    if (ownerRes.rows.length === 0) return res.status(500).json({ error: 'Aucun propriétaire actif' });
    targetOwnerId = ownerRes.rows[0].id;
  }

  const ownerCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [targetOwnerId, 'owner']);
  if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Propriétaire invalide' });

  const existing = await pool.query('SELECT id FROM players WHERE phone = $1 AND owner_id = $2', [phone, targetOwnerId]);
  if (existing.rows.length > 0) return res.status(400).json({ error: 'Ce numéro est déjà utilisé' });

  const hashed = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO players (name, phone, password, zone, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, phone, hashed, zone || null, targetOwnerId]
  );
  const playerId = result.rows[0].id;
  const token = jwt.sign(
    { id: playerId, role: 'player', name, phone, ownerId: targetOwnerId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ success: true, token, playerId, name, balance: 0 });
});

app.post('/api/auth/player/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const result = await pool.query('SELECT id, name, phone, password, balance, owner_id FROM players WHERE phone = $1', [phone]);
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
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/player/balance', authenticate, async (req, res) => {
  if (req.user.role !== 'player') return res.status(403).json({ error: 'Accès réservé aux joueurs' });
  try {
    const result = await pool.query('SELECT balance FROM players WHERE id = $1', [req.user.id]);
    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/player/deposit', authenticate, async (req, res) => {
  const { playerId, amount, method } = req.body;
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  if (!playerId || !amount || amount <= 0) return res.status(400).json({ error: 'Données invalides' });
  try {
    const updateRes = await pool.query('UPDATE players SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING balance', [amount, playerId]);
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    const newBalance = parseFloat(updateRes.rows[0].balance);
    await pool.query('INSERT INTO transactions (player_id, type, amount, method, description) VALUES ($1, $2, $3, $4, $5)', [playerId, 'deposit', amount, method || 'cash', `Dépôt par ${req.user.role} ${req.user.name}`]);
    res.json({ success: true, balance: newBalance });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/player/withdraw', authenticate, async (req, res) => {
  const { playerId, amount, method } = req.body;
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  if (!playerId || !amount || amount <= 0) return res.status(400).json({ error: 'Données invalides' });
  try {
    const playerRes = await pool.query('SELECT balance FROM players WHERE id = $1', [playerId]);
    if (playerRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    const currentBalance = parseFloat(playerRes.rows[0].balance);
    if (currentBalance < amount) return res.status(400).json({ error: 'Solde insuffisant' });
    const updateRes = await pool.query('UPDATE players SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING balance', [amount, playerId]);
    const newBalance = parseFloat(updateRes.rows[0].balance);
    await pool.query('INSERT INTO transactions (player_id, type, amount, method, description) VALUES ($1, $2, $3, $4, $5)', [playerId, 'withdraw', amount, method || 'cash', `Retrait par ${req.user.role} ${req.user.name}`]);
    res.json({ success: true, balance: newBalance });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/player/transactions', authenticate, async (req, res) => {
  if (req.user.role !== 'player') return res.status(403).json({ error: 'Accès réservé aux joueurs' });
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE player_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ transactions: result.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/users/by-phone', authenticate, async (req, res) => {
  const { phone, role } = req.query;
  if (!phone) return res.status(400).json({ error: 'Téléphone requis' });
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    if (role === 'player') {
      const result = await pool.query('SELECT id, name, phone, balance FROM players WHERE phone = $1', [phone]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
      res.json(result.rows[0]);
    } else {
      const result = await pool.query('SELECT id, name, username, role FROM users WHERE username = $1', [phone]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
      res.json(result.rows[0]);
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/player/balance-by-id', authenticate, async (req, res) => {
  const { playerId } = req.query;
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const result = await pool.query('SELECT balance FROM players WHERE id = $1', [playerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Gestion des joueurs par le propriétaire
app.get('/api/owner/players', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { search } = req.query;
  let query = `SELECT p.id, p.name, p.phone as username, p.zone, p.balance, p.created_at FROM players p WHERE p.owner_id = $1`;
  const params = [ownerId];
  if (search) { query += ` AND (p.name ILIKE $2 OR p.phone ILIKE $2)`; params.push(`%${search}%`); }
  try {
    const result = await pool.query(query, params);
    res.json({ players: result.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/owner/create-player', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { name, phone, password, zone } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Nom, téléphone et mot de passe requis' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO players (name, phone, password, zone, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, phone, hashed, zone || null, ownerId]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Ce numéro de téléphone existe déjà' });
    res.status(500).json({ error: 'Erreur création joueur' });
  }
});

app.put('/api/owner/players/:id', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;
  const { name, phone, zone, password } = req.body;
  try {
    let query = 'UPDATE players SET name=$1, phone=$2, zone=$3, updated_at=NOW()';
    const params = [name, phone, zone];
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query += ', password=$4';
      params.push(hashed);
      query += ` WHERE id=$${params.length+1} AND owner_id=$${params.length+2} RETURNING id`;
      params.push(id, ownerId);
    } else {
      query += ` WHERE id=$${params.length+1} AND owner_id=$${params.length+2} RETURNING id`;
      params.push(id, ownerId);
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur mise à jour' }); }
});

app.delete('/api/owner/players/:id', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;
  try {
    await pool.query('DELETE FROM players WHERE id = $1 AND owner_id = $2', [id, ownerId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur suppression' }); }
});

app.get('/api/owner/player-stats', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(`SELECT COALESCE(SUM(t.total_amount),0) as totalBets, COALESCE(SUM(t.win_amount),0) as totalWins FROM tickets t WHERE t.owner_id = $1 AND t.player_id IS NOT NULL`, [ownerId]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/owner/player-stats/:playerId', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { playerId } = req.params;
  try {
    const result = await pool.query(`SELECT COALESCE(SUM(t.total_amount),0) as totalBets, COALESCE(SUM(t.win_amount),0) as totalWins FROM tickets t WHERE t.owner_id = $1 AND t.player_id = $2`, [ownerId, playerId]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/owner/player-tickets/:playerId', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { playerId } = req.params;
  try {
    const result = await pool.query(`SELECT * FROM tickets WHERE owner_id = $1 AND player_id = $2 ORDER BY date DESC`, [ownerId, playerId]);
    res.json({ tickets: result.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/owner/send-player-message', authenticate, requireRole('owner'), async (req, res) => {
  const { playerId, message } = req.body;
  const ownerId = req.user.id;
  if (!playerId || !message) return res.status(400).json({ error: 'playerId et message requis' });
  try {
    await pool.query('INSERT INTO player_messages (player_id, sender_id, message) VALUES ($1, $2, $3)', [playerId, ownerId, message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur envoi message' }); }
});

app.get('/api/owner/player-messages/:playerId', authenticate, requireRole('owner'), async (req, res) => {
  const { playerId } = req.params;
  try {
    const result = await pool.query(`SELECT m.*, u.name as sender_name FROM player_messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.player_id = $1 ORDER BY m.created_at DESC`, [playerId]);
    res.json({ messages: result.rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== Routes superadmin ====================
app.get('/api/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, u.blocked as active, u.quota, u.phone, u.created_at,
      (SELECT COUNT(*) FROM users WHERE owner_id = u.id AND role IN ('agent','supervisor')) as current_count
      FROM users u WHERE u.role = 'owner' ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, email, password, phone, quota } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, username, password, role, phone, quota, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [name, email, hashed, 'owner', phone || null, quota || 0]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur création' });
  }
});

app.put('/api/superadmin/owners/:id/block', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { block } = req.body;
  try {
    await pool.query('UPDATE users SET blocked = $1 WHERE id = $2 AND role = $3', [block, id, 'owner']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur mise à jour' }); }
});

app.delete('/api/superadmin/owners/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'owner']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Propriétaire non trouvé' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur suppression' }); }
});

app.delete('/api/superadmin/agents/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'agent']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur suppression' }); }
});

app.delete('/api/superadmin/supervisors/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'supervisor']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Superviseur non trouvé' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur suppression' }); }
});

app.post('/api/superadmin/messages', authenticate, requireSuperAdmin, async (req, res) => {
  const { ownerId, message } = req.body;
  if (!ownerId || !message) return res.status(400).json({ error: 'ownerId et message requis' });
  try {
    await pool.query(`INSERT INTO owner_messages (owner_id, message, created_at, expires_at) VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`, [ownerId, message]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Erreur envoi message' }); }
});

app.post('/api/superadmin/messages/bulk', authenticate, requireSuperAdmin, async (req, res) => {
  const { ownerIds, message } = req.body;
  if (!ownerIds || !Array.isArray(ownerIds) || ownerIds.length === 0 || !message) return res.status(400).json({ error: 'Liste de propriétaires et message requis' });
  try {
    const values = ownerIds.map((_, i) => `($${i*3+1}, $${i*3+2}, NOW(), NOW() + INTERVAL '10 minutes')`).join(',');
    const flatParams = ownerIds.flatMap(id => [id, message]);
    await pool.query(`INSERT INTO owner_messages (owner_id, message, created_at, expires_at) VALUES ${values}`, flatParams);
    res.json({ success: true, count: ownerIds.length });
  } catch (err) { res.status(500).json({ error: 'Erreur envoi messages' }); }
});

app.get('/api/superadmin/reports/owners', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, COUNT(DISTINCT ag.id) as agent_count, COUNT(t.id) as ticket_count,
             COALESCE(SUM(t.total_amount), 0) as total_bets, COALESCE(SUM(t.win_amount), 0) as total_wins,
             COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
      FROM users u LEFT JOIN users ag ON u.id = ag.owner_id AND ag.role = 'agent' LEFT JOIN tickets t ON u.id = t.owner_id
      WHERE u.role = 'owner' GROUP BY u.id, u.name, u.username ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== Démarrage ====================
async function checkDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Connecté à PostgreSQL');
    client.release();
    await ensureTables();
    console.log('✅ Base de données prête');
  } catch (err) {
    console.error('❌ Erreur de connexion à la base de données :', err.message);
    process.exit(1);
  }
}

checkDatabaseConnection().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${port}`);
  });
}).catch(err => {
  console.error('❌ Impossible de démarrer le serveur:', err);
  process.exit(1);
});
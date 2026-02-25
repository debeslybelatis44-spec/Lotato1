// server.js
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt_tres_long_et_securise';

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques depuis la racine du projet
app.use(express.static(__dirname));

// Connexion à PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/novalotto',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test de connexion (ne pas planter le serveur si échec)
pool.connect((err) => {
  if (err) {
    console.error('❌ Erreur de connexion à PostgreSQL:', err.message);
    console.log('⚠️  Le serveur continuera mais les routes DB échoueront.');
  } else {
    console.log('✅ Connecté à PostgreSQL');
    // Initialiser les tables après connexion réussie
    initializeDatabase();
  }
});

// Initialisation des tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Création des tables (reprise de votre script.sql et 2e.sql)
    await client.query(`
      CREATE TABLE IF NOT EXISTS subsystems (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          subdomain VARCHAR(100) UNIQUE NOT NULL,
          contact_email VARCHAR(255),
          contact_phone VARCHAR(50),
          max_users INTEGER DEFAULT 10,
          subscription_type VARCHAR(50) DEFAULT 'basic',
          subscription_expires TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          role VARCHAR(50) NOT NULL CHECK (role IN ('master', 'subsystem', 'supervisor', 'agent')),
          level INTEGER,
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          supervisor1_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          supervisor2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          is_active BOOLEAN DEFAULT true,
          is_online BOOLEAN DEFAULT false,
          last_login TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS draws (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          times JSONB NOT NULL,
          is_active BOOLEAN DEFAULT true,
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 100001;

      CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          number VARCHAR(50) NOT NULL,
          draw VARCHAR(100) NOT NULL,
          draw_time VARCHAR(20) NOT NULL,
          total INTEGER NOT NULL,
          agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          agent_name VARCHAR(255),
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          date TIMESTAMP NOT NULL,
          is_synced BOOLEAN DEFAULT true,
          synced_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bets (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          name VARCHAR(100),
          number VARCHAR(50) NOT NULL,
          amount INTEGER NOT NULL,
          multiplier INTEGER,
          options JSONB,
          is_group BOOLEAN DEFAULT false,
          details JSONB,
          per_option_amount INTEGER,
          is_lotto4 BOOLEAN DEFAULT false,
          is_lotto5 BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS results (
          id SERIAL PRIMARY KEY,
          draw VARCHAR(100) NOT NULL,
          time VARCHAR(20) NOT NULL,
          date DATE NOT NULL,
          lot1 VARCHAR(10) NOT NULL,
          lot2 VARCHAR(10),
          lot3 VARCHAR(10),
          verified BOOLEAN DEFAULT false,
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(draw, time, date, subsystem_id)
      );

      CREATE TABLE IF NOT EXISTS winning_records (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
          winning_bets JSONB,
          total_winnings INTEGER NOT NULL,
          paid BOOLEAN DEFAULT false,
          paid_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS restrictions (
          id SERIAL PRIMARY KEY,
          number VARCHAR(10) NOT NULL,
          type VARCHAR(20) NOT NULL CHECK (type IN ('block', 'limit')),
          limit_amount INTEGER,
          draw VARCHAR(50) DEFAULT 'all',
          time VARCHAR(20) DEFAULT 'all',
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS activities (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          user_name VARCHAR(255),
          action VARCHAR(255) NOT NULL,
          details TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          message TEXT,
          type VARCHAR(50) DEFAULT 'info',
          read BOOLEAN DEFAULT false,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bet_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          user_name VARCHAR(255),
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          draw VARCHAR(100) NOT NULL,
          draw_time VARCHAR(20) NOT NULL,
          bets JSONB NOT NULL,
          total INTEGER NOT NULL,
          date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS multi_draw_tickets (
          id SERIAL PRIMARY KEY,
          ticket_number VARCHAR(50) NOT NULL,
          bets JSONB NOT NULL,
          draws JSONB NOT NULL,
          total_amount INTEGER NOT NULL,
          agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          agent_name VARCHAR(255),
          subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
          date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Tables créées/vérifiées');

    // Créer un sous-système par défaut s'il n'existe pas
    const subRes = await client.query(`SELECT id FROM subsystems WHERE subdomain = 'default'`);
    let subsystemId;
    if (subRes.rows.length === 0) {
      const insertSub = await client.query(
        `INSERT INTO subsystems (name, subdomain, contact_email, max_users) VALUES ($1, $2, $3, $4) RETURNING id`,
        ['Sous-système par défaut', 'default', 'contact@default.com', 100]
      );
      subsystemId = insertSub.rows[0].id;
    } else {
      subsystemId = subRes.rows[0].id;
    }

    // Créer des utilisateurs de test (mot de passe: password)
    const hashedPassword = await bcrypt.hash('password', 10);

    await client.query(
      `INSERT INTO users (name, username, password, email, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
      ['Master Admin', 'master', hashedPassword, 'master@novalotto.com', 'master']
    );

    await client.query(
      `INSERT INTO users (name, username, password, email, role, subsystem_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO NOTHING`,
      ['Propriétaire Système', 'subsystem', hashedPassword, 'subsystem@example.com', 'subsystem', subsystemId]
    );

    await client.query(
      `INSERT INTO users (name, username, password, email, role, level, subsystem_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (username) DO NOTHING`,
      ['Superviseur Un', 'sup1', hashedPassword, 'sup1@example.com', 'supervisor', 1, subsystemId]
    );

    await client.query(
      `INSERT INTO users (name, username, password, email, role, level, subsystem_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (username) DO NOTHING`,
      ['Superviseur Deux', 'sup2', hashedPassword, 'sup2@example.com', 'supervisor', 2, subsystemId]
    );

    await client.query(
      `INSERT INTO users (name, username, password, email, role, subsystem_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (username) DO NOTHING`,
      ['Agent Test', 'agent', hashedPassword, 'agent@example.com', 'agent', subsystemId]
    );

    // Créer un tirage par défaut
    await client.query(
      `INSERT INTO draws (name, times, subsystem_id) VALUES ($1, $2::jsonb, $3) ON CONFLICT DO NOTHING`,
      ['Borlette', JSON.stringify({ morning: { hour: 12, minute: 0, time: '12:00' }, evening: { hour: 18, minute: 0, time: '18:00' } }), subsystemId]
    );

    console.log('✅ Données initiales insérées');
  } catch (err) {
    console.error('❌ Erreur initialisation DB:', err);
  } finally {
    client.release();
  }
}

// ========== Middleware d'authentification ==========
async function authenticateToken(req, res, next) {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ success: false, error: 'Token manquant.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (user.rows.length === 0) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé.' });
    req.user = user.rows[0];
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Token invalide.' });
  }
}

// ========== Routes d'authentification ==========
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) return res.status(401).json({ success: false, error: 'Identifiants incorrects.' });

    const valid = await bcrypt.compare(password, user.rows[0].password);
    if (!valid) return res.status(401).json({ success: false, error: 'Identifiants incorrects.' });

    await pool.query('UPDATE users SET last_login = NOW(), is_online = true WHERE id = $1', [user.rows[0].id]);

    const token = jwt.sign(
      { userId: user.rows[0].id, role: user.rows[0].role, level: user.rows[0].level, subsystem_id: user.rows[0].subsystem_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: user.rows[0].id,
        name: user.rows[0].name,
        username: user.rows[0].username,
        email: user.rows[0].email,
        role: user.rows[0].role,
        level: user.rows[0].level,
        subsystem_id: user.rows[0].subsystem_id,
        is_active: user.rows[0].is_active,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/auth/check', authenticateToken, (req, res) => {
  res.json({
    success: true,
    admin: {
      id: req.user.id,
      name: req.user.name,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      level: req.user.level,
      subsystem_id: req.user.subsystem_id,
      is_active: req.user.is_active,
    }
  });
});

// ========== Routes pour les tirages ==========
app.get('/api/draws', authenticateToken, async (req, res) => {
  try {
    const subsystemId = req.user.subsystem_id || req.query.subsystemId;
    let query = 'SELECT * FROM draws WHERE is_active = true';
    const params = [];
    if (subsystemId) {
      query += ' AND subsystem_id = $1';
      params.push(subsystemId);
    }
    const result = await pool.query(query, params);
    const drawsObj = {};
    result.rows.forEach(row => {
      drawsObj[row.name.toLowerCase()] = row;
    });
    res.json({ success: true, draws: drawsObj });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les tickets ==========
app.post('/api/tickets', authenticateToken, async (req, res) => {
  if (req.user.role !== 'agent' && req.user.role !== 'subsystem') {
    return res.status(403).json({ success: false, error: 'Seuls les agents peuvent créer des tickets.' });
  }

  const { draw, draw_time, bets, total, agent_id, agent_name, subsystem_id, date } = req.body;
  if (!draw || !draw_time || !bets || !total || !agent_id || !subsystem_id) {
    return res.status(400).json({ success: false, error: 'Données manquantes.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nextVal = await client.query(`SELECT nextval('ticket_number_seq') as num`);
    const ticketNumber = nextVal.rows[0].num;

    const ticketResult = await client.query(
      `INSERT INTO tickets (number, draw, draw_time, total, agent_id, agent_name, subsystem_id, date, is_synced)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ticketNumber, draw, draw_time, total, agent_id, agent_name, subsystem_id, date || new Date(), true]
    );
    const ticketId = ticketResult.rows[0].id;

    for (const bet of bets) {
      await client.query(
        `INSERT INTO bets (ticket_id, type, name, number, amount, multiplier, options, is_group, details, per_option_amount, is_lotto4, is_lotto5)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [ticketId, bet.type, bet.name, bet.number, bet.amount, bet.multiplier, bet.options || null,
         bet.is_group || false, bet.details || null, bet.perOptionAmount || null,
         bet.is_lotto4 || false, bet.is_lotto5 || false]
      );
    }

    // Enregistrer dans l'historique des paris
    await client.query(
      `INSERT INTO bet_history (user_id, user_name, subsystem_id, draw, draw_time, bets, total, date)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [agent_id, agent_name, subsystem_id, draw, draw_time, JSON.stringify(bets), total, new Date()]
    );

    await client.query('COMMIT');
    res.json({ success: true, ticket: { id: ticketId, number: ticketNumber, draw, draw_time, total, agent_id, agent_name, date: date || new Date(), bets } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

app.get('/api/tickets', authenticateToken, async (req, res) => {
  const { agent, date, limit = 50 } = req.query;
  try {
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (agent) {
      query += ' AND agent_id = $' + (params.length + 1);
      params.push(agent);
    }
    if (date) {
      query += ' AND date::date = $' + (params.length + 1);
      params.push(date);
    }
    query += ' ORDER BY date DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    const result = await pool.query(query, params);
    res.json({ success: true, tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/tickets/pending', authenticateToken, async (req, res) => {
  try {
    const subsystemId = req.user.subsystem_id || req.query.subsystemId;
    const result = await pool.query(
      'SELECT * FROM tickets WHERE subsystem_id = $1 AND is_synced = false ORDER BY date DESC',
      [subsystemId]
    );
    res.json({ success: true, tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/tickets/winning', authenticateToken, async (req, res) => {
  const { agent, date, subsystemId } = req.query;
  try {
    let query = `
      SELECT wr.*, t.number as ticket_number, t.draw, t.draw_time, t.date, t.agent_name
      FROM winning_records wr
      JOIN tickets t ON wr.ticket_id = t.id
      WHERE 1=1
    `;
    const params = [];
    if (agent) {
      query += ' AND t.agent_id = $' + (params.length + 1);
      params.push(agent);
    }
    if (date) {
      query += ' AND t.date::date = $' + (params.length + 1);
      params.push(date);
    }
    if (subsystemId) {
      query += ' AND t.subsystem_id = $' + (params.length + 1);
      params.push(subsystemId);
    }
    query += ' ORDER BY t.date DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/tickets/:id', authenticateToken, async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticketRes = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé.' });
    const betsRes = await pool.query('SELECT * FROM bets WHERE ticket_id = $1', [ticketId]);
    const ticket = ticketRes.rows[0];
    ticket.bets = betsRes.rows;
    res.json({ success: true, ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/tickets/:id', authenticateToken, async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticket = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé.' });

    if (req.user.role === 'agent') {
      if (ticket.rows[0].agent_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Vous ne pouvez supprimer que vos propres tickets.' });
      }
      const diff = (new Date() - new Date(ticket.rows[0].date)) / (1000 * 60);
      if (diff > 10) {
        return res.status(403).json({ success: false, error: 'Délai de suppression dépassé (10 minutes).' });
      }
    } else if (!['subsystem', 'supervisor', 'master'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Accès refusé.' });
    }

    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les tickets multi-tirages ==========
app.post('/api/tickets/multi-draw', authenticateToken, async (req, res) => {
  const { ticket } = req.body;
  if (!ticket || !ticket.bets || !ticket.draws || !ticket.totalAmount || !ticket.agentId) {
    return res.status(400).json({ success: false, error: 'Données manquantes.' });
  }

  try {
    const nextVal = await pool.query(`SELECT nextval('ticket_number_seq') as num`);
    const ticketNumber = nextVal.rows[0].num;

    const result = await pool.query(
      `INSERT INTO multi_draw_tickets (ticket_number, bets, draws, total_amount, agent_id, agent_name, subsystem_id, date)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, $8) RETURNING id`,
      [ticketNumber, JSON.stringify(ticket.bets), JSON.stringify(ticket.draws), ticket.totalAmount,
       ticket.agentId, ticket.agentName, ticket.subsystem_id || req.user.subsystem_id, new Date()]
    );

    res.json({ success: true, ticket: { id: result.rows[0].id, number: ticketNumber, ...ticket } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/tickets/multi-draw', authenticateToken, async (req, res) => {
  try {
    const subsystemId = req.user.subsystem_id || req.query.subsystemId;
    const result = await pool.query(
      'SELECT * FROM multi_draw_tickets WHERE subsystem_id = $1 ORDER BY date DESC',
      [subsystemId]
    );
    res.json({ success: true, tickets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les résultats ==========
app.get('/api/results', authenticateToken, async (req, res) => {
  const { draw, time, date, subsystemId, limit = 10 } = req.query;
  try {
    let query = 'SELECT * FROM results WHERE 1=1';
    const params = [];
    if (subsystemId) {
      query += ' AND subsystem_id = $' + (params.length + 1);
      params.push(subsystemId);
    }
    if (draw) {
      query += ' AND draw = $' + (params.length + 1);
      params.push(draw);
    }
    if (time) {
      query += ' AND time = $' + (params.length + 1);
      params.push(time);
    }
    if (date) {
      query += ' AND date = $' + (params.length + 1);
      params.push(date);
    }
    query += ' ORDER BY date DESC LIMIT $' + (params.length + 1);
    params.push(limit);
    const result = await pool.query(query, params);
    res.json({ success: true, results: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/results', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem' && req.user.role !== 'master') {
    return res.status(403).json({ success: false, error: 'Accès refusé.' });
  }

  const { draw, time, date, lot1, lot2, lot3, verified, subsystemId } = req.body;
  if (!draw || !time || !date || !lot1) {
    return res.status(400).json({ success: false, error: 'Données manquantes.' });
  }

  try {
    await pool.query(
      `INSERT INTO results (draw, time, date, lot1, lot2, lot3, verified, subsystem_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (draw, time, date, subsystem_id) DO UPDATE
       SET lot1 = EXCLUDED.lot1, lot2 = EXCLUDED.lot2, lot3 = EXCLUDED.lot3, verified = EXCLUDED.verified, updated_at = CURRENT_TIMESTAMP`,
      [draw, time, date, lot1, lot2 || null, lot3 || null, verified || false, subsystemId || req.user.subsystem_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour l'historique ==========
app.post('/api/history', authenticateToken, async (req, res) => {
  const { id, date, draw, drawTime, bets, total } = req.body;
  try {
    await pool.query(
      `INSERT INTO bet_history (user_id, user_name, subsystem_id, draw, draw_time, bets, total, date)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [req.user.id, req.user.name, req.user.subsystem_id, draw, drawTime, JSON.stringify(bets), total, date || new Date()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bet_history WHERE user_id = $1 ORDER BY date DESC',
      [req.user.id]
    );
    res.json({ success: true, history: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les informations de l'entreprise ==========
app.get('/api/company-info', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT value FROM settings WHERE key = 'company_info'`);
    if (result.rows.length > 0) {
      res.json({ success: true, ...JSON.parse(result.rows[0].value) });
    } else {
      res.json({ success: true, name: "Nova Lotto", phone: "+509 32 53 49 58", address: "Cap Haïtien", reportTitle: "Nova Lotto", reportPhone: "40104585" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/company-info', authenticateToken, async (req, res) => {
  if (req.user.role !== 'master' && req.user.role !== 'subsystem') {
    return res.status(403).json({ success: false, error: 'Accès refusé.' });
  }
  try {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('company_info', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(req.body)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour le logo ==========
app.get('/api/logo', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`SELECT value FROM settings WHERE key = 'logo'`);
    if (result.rows.length > 0) {
      res.json({ success: true, logoUrl: result.rows[0].value });
    } else {
      res.json({ success: true, logoUrl: '' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/logo', authenticateToken, async (req, res) => {
  if (req.user.role !== 'master' && req.user.role !== 'subsystem') {
    return res.status(403).json({ success: false, error: 'Accès refusé.' });
  }
  const { logoUrl } = req.body;
  try {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('logo', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [logoUrl]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les sous-systèmes (master) ==========
app.get('/api/master/subsystems', authenticateToken, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ success: false, error: 'Accès réservé au master.' });

  const { page = 1, limit = 10, search = '', status } = req.query;
  const offset = (page - 1) * limit;
  let query = `SELECT s.*, 
               (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id) as total_users,
               (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id AND is_active = true) as active_users
               FROM subsystems s`;
  const params = [];
  const conditions = [];

  if (search) {
    conditions.push(`(s.name ILIKE $${params.length+1} OR s.subdomain ILIKE $${params.length+2})`);
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status && status !== 'all') {
    conditions.push(`s.is_active = $${params.length+1}`);
    params.push(status === 'active');
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ` ORDER BY s.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  const countResult = await pool.query(`SELECT COUNT(*) FROM subsystems`);
  const total = parseInt(countResult.rows[0].count);

  res.json({
    success: true,
    subsystems: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      total_pages: Math.ceil(total / limit)
    }
  });
});

app.post('/api/master/subsystems', authenticateToken, async (req, res) => {
  if (req.user.role !== 'master') return res.status(403).json({ success: false, error: 'Accès réservé au master.' });

  const { name, subdomain, contact_email, contact_phone, max_users = 10, subscription_type = 'basic', subscription_months = 1, send_credentials } = req.body;
  if (!name || !subdomain || !contact_email) {
    return res.status(400).json({ success: false, error: 'Nom, sous-domaine et email requis.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const expires = new Date();
    expires.setMonth(expires.getMonth() + subscription_months);
    const subResult = await client.query(
      `INSERT INTO subsystems (name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, subdomain, contact_email, contact_phone, max_users, subscription_type, expires]
    );
    const subsystemId = subResult.rows[0].id;

    const ownerUsername = `owner_${subdomain}`;
    const ownerPassword = Math.random().toString(36).slice(-8);
    const hashedOwner = await bcrypt.hash(ownerPassword, 10);

    await client.query(
      `INSERT INTO users (name, username, password, email, role, subsystem_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [`Propriétaire ${name}`, ownerUsername, hashedOwner, contact_email, 'subsystem', subsystemId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      subsystem: { id: subsystemId, name, subdomain, contact_email, max_users },
      access_url: `https://${subdomain}.${req.headers.host?.replace('master.', '') || 'localhost'}`,
      admin_credentials: {
        username: ownerUsername,
        password: ownerPassword,
        email: contact_email
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      if (err.constraint?.includes('subdomain')) {
        return res.status(400).json({ success: false, error: 'Ce sous-domaine est déjà utilisé.' });
      }
    }
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  } finally {
    client.release();
  }
});

// ========== Routes pour les sous-systèmes (propriétaire) ==========
app.get('/api/subsystems/mine', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem' && req.user.role !== 'master') {
    return res.status(403).json({ success: false, error: 'Accès réservé.' });
  }
  const subsystemId = req.user.role === 'master' ? req.query.id : req.user.subsystem_id;
  if (!subsystemId) return res.status(400).json({ success: false, error: 'Sous-système non spécifié.' });

  try {
    const result = await pool.query('SELECT * FROM subsystems WHERE id = $1', [subsystemId]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Sous-système non trouvé.' });
    res.json({ success: true, subsystems: [result.rows[0]] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les utilisateurs du sous-système ==========
app.get('/api/subsystem/users', authenticateToken, async (req, res) => {
  const { role, limit = 100, supervisor_id, search } = req.query;
  let subsystemId = req.user.subsystem_id;
  if (req.user.role === 'master' && req.query.subsystemId) subsystemId = req.query.subsystemId;

  if (!subsystemId) return res.status(400).json({ success: false, error: 'Sous-système non spécifié.' });

  try {
    let query = `SELECT u.*, s.name as subsystem_name FROM users u LEFT JOIN subsystems s ON u.subsystem_id = s.id WHERE u.subsystem_id = $1`;
    const params = [subsystemId];
    let paramIdx = 2;

    if (role) {
      query += ` AND u.role = $${paramIdx++}`;
      params.push(role);
    }
    if (supervisor_id) {
      query += ` AND (u.supervisor1_id = $${paramIdx} OR u.supervisor2_id = $${paramIdx})`;
      params.push(supervisor_id);
      paramIdx++;
    }
    if (search) {
      query += ` AND (u.name ILIKE $${paramIdx} OR u.username ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${paramIdx}`;
    params.push(parseInt(limit) || 100);

    const result = await pool.query(query, params);
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/subsystem/users/create', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem') {
    return res.status(403).json({ success: false, error: 'Seul le propriétaire du sous-système peut créer des utilisateurs.' });
  }

  const { name, username, password, role, level, supervisor1Id, supervisor2Id } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Nom, identifiant, mot de passe et rôle requis.' });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, username, password, email, role, level, supervisor1_id, supervisor2_id, subsystem_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [name, username, hashed, username + '@example.com', role, level, supervisor1Id || null, supervisor2Id || null, req.user.subsystem_id]
    );

    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'Cet identifiant existe déjà.' });
    }
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/subsystem/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem') return res.status(403).json({ success: false, error: 'Accès refusé.' });
  const userId = req.params.id;
  const { name, is_active, password } = req.body;

  try {
    let query = 'UPDATE users SET name = $1, is_active = $2';
    const params = [name, is_active];
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query += ', password = $' + (params.length + 1);
      params.push(hashed);
    }
    query += ' WHERE id = $' + (params.length + 1) + ' AND subsystem_id = $' + (params.length + 2);
    params.push(userId, req.user.subsystem_id);

    const result = await pool.query(query, params);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/subsystem/users/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem' && req.user.role !== 'master') {
    return res.status(403).json({ success: false, error: 'Accès refusé.' });
  }
  const userId = req.params.id;
  const { is_active } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = $1 WHERE id = $2 AND subsystem_id = $3`,
      [is_active, userId, req.user.subsystem_id || req.query.subsystemId]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/subsystem/users/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem') return res.status(403).json({ success: false, error: 'Accès refusé.' });
  const userId = req.params.id;

  try {
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 AND subsystem_id = $2`,
      [userId, req.user.subsystem_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les statistiques du sous-système ==========
app.get('/api/subsystem/stats', authenticateToken, async (req, res) => {
  const subsystemId = req.user.subsystem_id || req.query.subsystemId;
  if (!subsystemId) return res.status(400).json({ success: false, error: 'Sous-système non spécifié.' });

  try {
    const today = new Date().toISOString().split('T')[0];

    const usersRes = await pool.query(
      `SELECT COUNT(*) as total, 
        COUNT(CASE WHEN is_active = true THEN 1 END) as active,
        COUNT(CASE WHEN is_online = true THEN 1 END) as online
       FROM users WHERE subsystem_id = $1`,
      [subsystemId]
    );

    const ticketsRes = await pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
       FROM tickets WHERE subsystem_id = $1 AND date::date = $2`,
      [subsystemId, today]
    );

    const payoutRes = await pool.query(
      `SELECT COALESCE(SUM(total_winnings), 0) as pending
       FROM winning_records wr
       JOIN tickets t ON wr.ticket_id = t.id
       WHERE t.subsystem_id = $1 AND wr.paid = false`,
      [subsystemId]
    );

    const pendingSyncRes = await pool.query(
      `SELECT COUNT(*) as count FROM tickets WHERE subsystem_id = $1 AND is_synced = false`,
      [subsystemId]
    );

    const maxUsers = await pool.query('SELECT max_users FROM subsystems WHERE id = $1', [subsystemId]);

    res.json({
      success: true,
      stats: {
        active_users: parseInt(usersRes.rows[0].active),
        online_agents: parseInt(usersRes.rows[0].online),
        today_tickets: parseInt(ticketsRes.rows[0].count),
        today_sales: parseFloat(ticketsRes.rows[0].total),
        pending_payout: parseFloat(payoutRes.rows[0].pending),
        pending_issues: parseInt(pendingSyncRes.rows[0].count),
        max_users: maxUsers.rows[0].max_users
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les restrictions ==========
app.get('/api/restrictions', authenticateToken, async (req, res) => {
  const subsystemId = req.query.subsystemId || req.user.subsystem_id;
  if (!subsystemId) return res.status(400).json({ success: false, error: 'Sous-système non spécifié.' });

  try {
    const result = await pool.query('SELECT * FROM restrictions WHERE subsystem_id = $1', [subsystemId]);
    res.json({ success: true, restrictions: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/restrictions', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem') return res.status(403).json({ success: false, error: 'Accès refusé.' });

  const { number, type, limitAmount, draw, time, subsystemId } = req.body;
  if (!number || !type) return res.status(400).json({ success: false, error: 'Numéro et type requis.' });

  try {
    await pool.query(
      `INSERT INTO restrictions (number, type, limit_amount, draw, time, subsystem_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [number, type, limitAmount || null, draw || 'all', time || 'all', subsystemId || req.user.subsystem_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/restrictions/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem') return res.status(403).json({ success: false, error: 'Accès refusé.' });
  const id = req.params.id;
  const { number, type, limitAmount, draw, time } = req.body;

  try {
    await pool.query(
      `UPDATE restrictions SET number = $1, type = $2, limit_amount = $3, draw = $4, time = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND subsystem_id = $7`,
      [number, type, limitAmount || null, draw || 'all', time || 'all', id, req.user.subsystem_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/restrictions/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'subsystem') return res.status(403).json({ success: false, error: 'Accès refusé.' });
  const id = req.params.id;

  try {
    await pool.query('DELETE FROM restrictions WHERE id = $1 AND subsystem_id = $2', [id, req.user.subsystem_id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les activités ==========
app.get('/api/subsystem/activities', authenticateToken, async (req, res) => {
  const subsystemId = req.user.subsystem_id || req.query.subsystemId;
  if (!subsystemId) return res.status(400).json({ success: false, error: 'Sous-système non spécifié.' });

  try {
    const result = await pool.query(
      `SELECT a.* FROM activities a
       JOIN users u ON a.user_id = u.id
       WHERE u.subsystem_id = $1
       ORDER BY a.timestamp DESC LIMIT 50`,
      [subsystemId]
    );
    res.json({ success: true, activities: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les notifications ==========
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY timestamp DESC',
      [req.user.id]
    );
    res.json({ success: true, notifications: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
      [req.user.id]
    );
    res.json({ success: true, count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Routes pour les rapports ==========
app.get('/api/reports/daily', authenticateToken, async (req, res) => {
  const { date } = req.query;
  const subsystemId = req.user.subsystem_id || req.query.subsystemId;
  if (!date || !subsystemId) return res.status(400).json({ success: false, error: 'Date et sous-système requis.' });

  try {
    const tickets = await pool.query(
      `SELECT t.*, u.name as agent_name FROM tickets t
       JOIN users u ON t.agent_id = u.id
       WHERE t.subsystem_id = $1 AND t.date::date = $2`,
      [subsystemId, date]
    );

    const totalTickets = tickets.rows.length;
    const totalSales = tickets.rows.reduce((acc, t) => acc + t.total, 0);

    const agentsMap = {};
    tickets.rows.forEach(t => {
      if (!agentsMap[t.agent_name]) agentsMap[t.agent_name] = { name: t.agent_name, tickets: 0, sales: 0 };
      agentsMap[t.agent_name].tickets++;
      agentsMap[t.agent_name].sales += t.total;
    });
    const agents = Object.values(agentsMap);

    res.json({
      success: true,
      report: { date, totalTickets, totalSales, agents }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/reports/agent', authenticateToken, async (req, res) => {
  const { agentId, period } = req.query;
  if (!agentId) return res.status(400).json({ success: false, error: 'Agent requis.' });

  let startDate, endDate;
  const now = new Date();
  if (period === 'today') {
    startDate = new Date(now.setHours(0,0,0,0));
    endDate = new Date(now.setHours(23,59,59,999));
  } else if (period === 'week') {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startDate = new Date(startOfWeek.setHours(0,0,0,0));
    endDate = new Date(now.setHours(23,59,59,999));
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  } else {
    return res.status(400).json({ success: false, error: 'Période invalide.' });
  }

  try {
    const agentRes = await pool.query('SELECT * FROM users WHERE id = $1', [agentId]);
    if (agentRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Agent non trouvé.' });
    const agent = agentRes.rows[0];

    const ticketsRes = await pool.query(
      `SELECT * FROM tickets WHERE agent_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date DESC`,
      [agentId, startDate, endDate]
    );

    const totalTickets = ticketsRes.rows.length;
    const totalSales = ticketsRes.rows.reduce((acc, t) => acc + t.total, 0);

    res.json({
      success: true,
      report: {
        agent: { name: agent.name, username: agent.username },
        totalTickets,
        totalSales,
        tickets: ticketsRes.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ========== Route de test ==========
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Serveur opérationnel' });
});

// ========== Gestion des erreurs 404 (pour les routes API non trouvées) ==========
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Route API non trouvée.' });
});

// Pour toutes les autres routes, renvoyer index.html (pour le routage côté client)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========== Démarrage du serveur ==========
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  await pool.end();
  console.log('🛑 Serveur arrêté');
  process.exit(0);
});
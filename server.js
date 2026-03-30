require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const path = require('path');
const multer = require('multer');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== Middlewares ====================
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, keyGenerator: (req) => req.ip });
app.use('/api/', limiter);

// ==================== Base de données ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Port-au-Prince'", (err) => {
    if (err) console.error('❌ Erreur réglage fuseau:', err);
  });
});
pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

const pg = require('pg');
pg.types.setTypeParser(1114, (stringValue) => {
  return moment.tz(stringValue, 'YYYY-MM-DD HH:mm:ss', 'America/Port-au-Prince').toDate();
});

// ==================== Utilitaires ====================
async function columnExists(table, column) {
  const res = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = $1 AND column_name = $2
  `, [table, column]);
  return res.rows.length > 0;
}

async function addColumnIfNotExists(table, column, definition) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✅ Colonne ${table}.${column} ajoutée`);
  }
}

async function initializeDatabase() {
  try {
    console.log('🔄 Vérification de la base de données...');
    await addColumnIfNotExists('tickets', 'paid', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('tickets', 'paid_at', 'TIMESTAMP');
    await addColumnIfNotExists('lottery_config', 'slogan', 'TEXT');
    await addColumnIfNotExists('lottery_config', 'multipliers', 'JSONB');
    await addColumnIfNotExists('lottery_config', 'game_limits', 'JSONB');
    await addColumnIfNotExists('draw_results', 'lotto3', 'VARCHAR(3)');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_numbers (
        number VARCHAR(2) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_lotto3_numbers (
        number VARCHAR(3) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_number_limits (
        number VARCHAR(2) PRIMARY KEY,
        limit_amount DECIMAL(10,2) NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Base de données prête');
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
  }
}

// ==================== Authentification ====================
const JWT_SECRET = process.env.JWT_SECRET || 'lotato-pro-secret-key-change-in-production';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.user = user;
    next();
  });
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
  };
}

// ==================== Cache-Control helper ====================
const cacheControl = (duration) => (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${duration}`);
  next();
};

// ==================== Routes publiques ====================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    let user = null;
    let table = '';
    if (role === 'supervisor') {
      table = 'supervisors';
    } else if (role === 'agent') {
      table = 'agents';
    } else if (role === 'owner') {
      table = 'supervisors'; // propriétaires aussi dans supervisors
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    const result = await pool.query(
      `SELECT id, name, email, password, active FROM ${table} WHERE email = $1 OR name = $1`,
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    user = result.rows[0];

    if (!user.active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role,
        agentId: role === 'agent' ? user.id : null,
        supervisorId: role === 'supervisor' ? user.id : null,
        ownerId: role === 'owner' ? user.id : null
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, role, 'login', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      token,
      name: user.name,
      role: role,
      agentId: role === 'agent' ? user.id : null,
      supervisorId: role === 'supervisor' ? user.id : null,
      ownerId: role === 'owner' ? user.id : null
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Login superadmin (spécifique)
app.post('/api/auth/superadmin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    const result = await pool.query(
      'SELECT id, name, email, password FROM superadmins WHERE email = $1 OR name = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'superadmin'
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, 'superadmin', 'login', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      token,
      name: user.name
    });
  } catch (error) {
    console.error('❌ Erreur superadmin login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rafraîchir le token
app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const user = req.user;
  const newToken = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agentId: user.agentId,
      supervisorId: user.supervisorId,
      ownerId: user.ownerId
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ success: true, token: newToken });
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await pool.query(
    'INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1, $2, $3, $4)',
    [req.user.id, req.user.role, 'logout', req.ip]
  );
  res.json({ success: true });
});

// Vérifier le token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ==================== Routes protégées (tous utilisateurs) ====================
app.use('/api', authenticateToken);

// --- Tickets ---
app.post('/api/tickets/save', async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    if (req.user.role === 'agent' && req.user.id != agentId) {
      return res.status(403).json({ error: 'Vous ne pouvez enregistrer que vos propres tickets' });
    }

    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
    }

    // === Récupération des blocages globaux (borlette) ===
    const globalBlocked = await pool.query('SELECT number FROM blocked_numbers');
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));

    // === Blocages pour ce tirage (borlette) ===
    const drawBlocked = await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1', [drawId]);
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));

    // === Blocages Lotto3 ===
    const blockedLotto3Res = await pool.query('SELECT number FROM blocked_lotto3_numbers');
    const blockedLotto3Set = new Set(blockedLotto3Res.rows.map(r => r.number));

    // === Limites par numéro pour ce tirage (draw_number_limits) ===
    const limits = await pool.query('SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1', [drawId]);
    const limitsMap = new Map(limits.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    // === Limites globales (tous tirages) ===
    const globalLimitsResult = await pool.query('SELECT number, limit_amount FROM global_number_limits');
    const globalLimitsMap = new Map();
    globalLimitsResult.rows.forEach(r => globalLimitsMap.set(r.number, parseFloat(r.limit_amount)));

    // === Collecte des numéros (borlette) ayant une limite globale ===
    const numbersWithGlobalLimit = new Set();
    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
        const rawNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/\D/g, '') : '');
        const normalized = rawNumber.padStart(2, '0');
        if (globalLimitsMap.has(normalized)) numbersWithGlobalLimit.add(normalized);
      }
    }

    // === Totaux globaux aujourd'hui pour ces numéros (tous tirages) ===
    const globalTotals = new Map();
    if (numbersWithGlobalLimit.size > 0) {
      const todayAllDrawsResult = await pool.query(
        `SELECT bet->>'cleanNumber' as number, SUM((bet->>'amount')::numeric) as total
         FROM tickets, jsonb_array_elements(bets::jsonb) as bet
         WHERE DATE(date) = CURRENT_DATE AND bet->>'cleanNumber' = ANY($1)
         GROUP BY bet->>'cleanNumber'`,
        [Array.from(numbersWithGlobalLimit)]
      );
      for (const row of todayAllDrawsResult.rows) {
        globalTotals.set(row.number, parseFloat(row.total) || 0);
      }
    }

    // === Collecte des numéros ayant une limite par tirage ===
    const numbersWithLimits = new Set();
    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
        const rawNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/\D/g, '') : '');
        const normalized = rawNumber.padStart(2, '0');
        if (limitsMap.has(normalized)) numbersWithLimits.add(normalized);
      }
    }

    // === Totaux pour ce tirage aujourd'hui ===
    const currentTotals = new Map();
    if (numbersWithLimits.size > 0) {
      const todayBetsResult = await pool.query(
        `SELECT bet->>'cleanNumber' as number, SUM((bet->>'amount')::numeric) as total
         FROM tickets, jsonb_array_elements(bets::jsonb) as bet
         WHERE draw_id = $1 AND DATE(date) = CURRENT_DATE AND bet->>'cleanNumber' = ANY($2)
         GROUP BY bet->>'cleanNumber'`,
        [drawId, Array.from(numbersWithLimits)]
      );
      for (const row of todayBetsResult.rows) {
        currentTotals.set(row.number, parseFloat(row.total) || 0);
      }
    }

    // === Vérifications : blocages et limites ===
    const exceeded = [];

    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      let rawNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/\D/g, '') : '');
      if (!rawNumber) continue;

      let normalizedNumber = rawNumber;

      if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
        normalizedNumber = rawNumber.padStart(2, '0');
      } else if (game === 'lotto3' || game === 'auto_lotto3') {
        normalizedNumber = rawNumber.padStart(3, '0');
      }

      if (globalBlockedSet.has(normalizedNumber)) {
        return res.status(403).json({ error: `Numéro ${normalizedNumber} est bloqué globalement` });
      }

      if (drawBlockedSet.has(normalizedNumber)) {
        return res.status(403).json({ error: `Numéro ${normalizedNumber} est bloqué pour ce tirage` });
      }

      if ((game === 'lotto3' || game === 'auto_lotto3') && normalizedNumber.length === 3 && blockedLotto3Set.has(normalizedNumber)) {
        return res.status(403).json({ error: `Numéro Lotto3 ${normalizedNumber} est bloqué globalement` });
      }

      const limitPerDraw = limitsMap.get(normalizedNumber);
      if (limitPerDraw && limitPerDraw > 0 && !bet.free) {
        const currentTotal = currentTotals.get(normalizedNumber) || 0;
        const betAmount = parseFloat(bet.amount) || 0;
        if (currentTotal + betAmount > limitPerDraw) {
          exceeded.push({
            number: normalizedNumber,
            limit: limitPerDraw,
            already: currentTotal,
            requested: betAmount,
            remaining: limitPerDraw - currentTotal,
            type: 'per_draw'
          });
        }
      }

      const globalLimit = globalLimitsMap.get(normalizedNumber);
      if (globalLimit && globalLimit > 0 && !bet.free) {
        const currentGlobalTotal = globalTotals.get(normalizedNumber) || 0;
        const betAmount = parseFloat(bet.amount) || 0;
        if (currentGlobalTotal + betAmount > globalLimit) {
          exceeded.push({
            number: normalizedNumber,
            limit: globalLimit,
            already: currentGlobalTotal,
            requested: betAmount,
            remaining: globalLimit - currentGlobalTotal,
            type: 'global'
          });
        }
      }
    }

    if (exceeded.length > 0) {
      const message = exceeded.map(e => `Numéro ${e.number} : limite atteinte, reste ${e.remaining} G maximum.`).join('\n');
      return res.status(403).json({
        error: `Limite dépassée.\n${message}`,
        limitExceeded: exceeded
      });
    }

    // === Limites par type de jeu (game_limits) ===
    const configResult = await pool.query('SELECT game_limits FROM lottery_config LIMIT 1');
    let gameLimits = {};
    if (configResult.rows.length > 0 && configResult.rows[0].game_limits) {
      const raw = configResult.rows[0].game_limits;
      gameLimits = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } else {
      gameLimits = { lotto3: 0, lotto4: 0, lotto5: 0 };
    }

    const totalsByGame = {};
    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      let category = null;
      if (game === 'lotto3' || game === 'auto_lotto3') category = 'lotto3';
      else if (game === 'lotto4' || game === 'auto_lotto4') category = 'lotto4';
      else if (game === 'lotto5' || game === 'auto_lotto5') category = 'lotto5';
      else continue;

      const amount = parseFloat(bet.amount) || 0;
      totalsByGame[category] = (totalsByGame[category] || 0) + amount;
    }

    for (const [category, total] of Object.entries(totalsByGame)) {
      const limit = gameLimits[category] || 0;
      if (limit > 0 && total > limit) {
        return res.status(403).json({
          error: `Limite de mise pour ${category} dépassée (max ${limit} Gdes par ticket)`
        });
      }
    }

    // === Génération des free bets (mariage spécial) ===
    const paidBets = bets.filter(b => !b.free);
    const totalPaid = paidBets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

    let requiredFree = 0;
    if (totalPaid >= 1 && totalPaid <= 50) requiredFree = 1;
    else if (totalPaid >= 51 && totalPaid <= 150) requiredFree = 2;
    else if (totalPaid >= 151) requiredFree = 3;

    const newFreeBets = [];
    for (let i = 0; i < requiredFree; i++) {
      const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      const number = `${num1}&${num2}`;
      const cleanNumber = num1 + num2;
      newFreeBets.push({
        game: 'auto_marriage',
        number: number,
        cleanNumber: cleanNumber,
        amount: 0,
        free: true,
        freeType: 'special_marriage',
        freeWin: 1000
      });
    }

    const finalBets = [...paidBets, ...newFreeBets];
    const betsJson = JSON.stringify(finalBets);
    const finalTotal = finalBets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const result = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [ticketId, agentId, agentName, drawId, drawName, betsJson, finalTotal]
    );

    res.json({ success: true, ticket: result.rows[0] });
  } catch (error) {
    console.error('❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/tickets', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    if (req.user.role === 'agent') {
      params.push(req.user.id);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 50';
    const result = await pool.query(query, params);
    const tickets = result.rows.map(t => ({
      ...t,
      bets: typeof t.bets === 'string' ? JSON.parse(t.bets) : t.bets
    }));
    res.json({ tickets });
  } catch (error) {
    console.error('❌ Erreur récupération tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/tickets/:ticketId', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const user = req.user;

    const id = parseInt(ticketId);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de ticket invalide' });
    }

    if (!['supervisor', 'owner', 'agent'].includes(user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    const ticketResult = await pool.query(
      'SELECT date, agent_id FROM tickets WHERE id = $1',
      [id]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    const ticket = ticketResult.rows[0];

    const diffMinutes = moment().diff(moment(ticket.date), 'minutes');

    if (user.role === 'agent') {
      if (diffMinutes > 3) {
        return res.status(403).json({ error: 'Suppression impossible après 3 minutes' });
      }
      if (ticket.agent_id !== user.id) {
        return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres tickets' });
      }
    } else if (user.role === 'supervisor') {
      if (diffMinutes > 10) {
        return res.status(403).json({ error: 'Suppression impossible après 10 minutes' });
      }
      const agentCheck = await pool.query(
        'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
        [ticket.agent_id, user.id]
      );
      if (agentCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Ce ticket n\'est pas sous votre supervision' });
      }
    }

    await pool.query('DELETE FROM tickets WHERE id = $1', [id]);

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1, $2, $3, $4)',
      [user.id, user.role, 'delete_ticket', req.ip]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    if (req.user.role === 'agent') {
      params.push(req.user.id);
      query += ` AND agent_id = $${params.length}`;
    }
    query += ' ORDER BY date DESC LIMIT 20';
    const result = await pool.query(query, params);
    res.json({ winners: result.rows });
  } catch (error) {
    console.error('❌ Erreur gagnants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/winners/results', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, draw_id, name, results, lotto3, published_at FROM draw_results ORDER BY published_at DESC LIMIT 10'
    );
    const results = result.rows.map(r => ({
      ...r,
      numbers: typeof r.results === 'string' ? JSON.parse(r.results) : r.results,
      lotto3: r.lotto3
    }));
    res.json({ results });
  } catch (error) {
    console.error('❌ Erreur résultats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/tickets/check-winners', async (req, res) => {
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE win_amount > 0 AND checked = false';
    const params = [];
    if (agentId) {
      params.push(agentId);
      query += ` AND agent_id = $${params.length}`;
    }
    const result = await pool.query(query, params);
    for (const ticket of result.rows) {
      await pool.query('UPDATE tickets SET checked = true WHERE id = $1', [ticket.id]);
    }
    res.json({ success: true, count: result.rows.length, tickets: result.rows });
  } catch (error) {
    console.error('❌ Erreur vérification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/winners/pay/:ticketId', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    let query = 'UPDATE tickets SET paid = true, paid_at = NOW() WHERE id = $1';
    const params = [ticketId];
    if (req.user.role === 'agent') {
      query += ' AND agent_id = $2';
      params.push(req.user.id);
    }
    const result = await pool.query(query, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé ou non autorisé' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur paiement ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/lottery-config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    if (result.rows.length) res.json(result.rows[0]);
    else res.json({ name: 'LOTATO PRO', logo: '', address: '', phone: '' });
  } catch (error) {
    console.error('❌ Erreur config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/lottery-config', authenticateToken, authorize('owner'), async (req, res) => {
  try {
    const { name, logo, address, phone } = req.body;
    const check = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (check.rows.length === 0) {
      await pool.query(
        'INSERT INTO lottery_config (name, logo, address, phone) VALUES ($1, $2, $3, $4)',
        [name, logo, address, phone]
      );
    } else {
      await pool.query(
        'UPDATE lottery_config SET name = $1, logo = $2, address = $3, phone = $4',
        [name, logo, address, phone]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/blocked-numbers/global', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/blocked-numbers/draw/:drawId', authenticateToken, async (req, res) => {
  try {
    const { drawId } = req.params;
    const result = await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1', [drawId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/number-limits/draw/:drawId', authenticateToken, async (req, res) => {
  try {
    const { drawId } = req.params;
    const result = await pool.query('SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1', [drawId]);
    const limits = {};
    result.rows.forEach(r => limits[r.number] = parseFloat(r.limit_amount));
    res.json(limits);
  } catch (error) {
    console.error('❌ Erreur limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    let { agentId } = req.query;
    if (!agentId && req.user.role === 'agent') {
      agentId = req.user.id;
    }
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });

    const todayStats = await pool.query(
      `SELECT 
         COUNT(*) as total_tickets,
         COALESCE(SUM(total_amount), 0) as total_bets,
         COALESCE(SUM(win_amount), 0) as total_wins,
         COALESCE(SUM(total_amount) - SUM(win_amount), 0) as total_loss,
         COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
       FROM tickets 
       WHERE agent_id = $1 AND DATE(date) = CURRENT_DATE`,
      [agentId]
    );
    res.json(todayStats.rows[0]);
  } catch (error) {
    console.error('❌ Erreur rapports:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/api/reports/draw', async (req, res) => {
  try {
    const { agentId, drawId } = req.query;
    if (!agentId || !drawId) return res.status(400).json({ error: 'Agent ID et Draw ID requis' });
    const stats = await pool.query(
      `SELECT 
         COUNT(*) as total_tickets,
         COALESCE(SUM(total_amount), 0) as total_bets,
         COALESCE(SUM(win_amount), 0) as total_wins,
         COALESCE(SUM(total_amount) - SUM(win_amount), 0) as total_loss,
         COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
       FROM tickets 
       WHERE agent_id = $1 AND draw_id = $2 AND DATE(date) = CURRENT_DATE`,
      [agentId, drawId]
    );
    res.json(stats.rows[0]);
  } catch (error) {
    console.error('❌ Erreur rapport tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Routes superviseur ====================
const supervisorRouter = express.Router();
supervisorRouter.use(authorize('supervisor'));

supervisorRouter.get('/reports/overall', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const result = await pool.query(
      `SELECT 
         COUNT(DISTINCT t.id) as total_tickets,
         COALESCE(SUM(t.total_amount), 0) as total_bets,
         COALESCE(SUM(t.win_amount), 0) as total_wins,
         COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance
       FROM tickets t
       JOIN agents a ON t.agent_id = a.id
       WHERE a.supervisor_id = $1 AND DATE(t.date) = CURRENT_DATE`,
      [supervisorId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Erreur stats superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.get('/agents', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const agents = await pool.query(
      `SELECT a.id, a.name, a.email, a.phone, a.active as blocked,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COUNT(t.id) as total_tickets,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance,
              COALESCE(SUM(t.win_amount) FILTER (WHERE t.paid = false), 0) as unpaid_wins
       FROM agents a
       LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE a.supervisor_id = $1
       GROUP BY a.id, a.name, a.email, a.phone, a.active`,
      [supervisorId]
    );
    res.json(agents.rows);
  } catch (error) {
    console.error('❌ Erreur liste agents superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.post('/block-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    await pool.query('UPDATE agents SET active = false WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.post('/unblock-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    await pool.query('UPDATE agents SET active = true WHERE id = $1', [agentId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.get('/tickets/recent', async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });
    const check = await pool.query(
      'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
      [agentId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    }
    const tenMinutesAgo = moment().subtract(10, 'minutes').toDate();
    const tickets = await pool.query(
      'SELECT * FROM tickets WHERE agent_id = $1 AND date > $2 ORDER BY date DESC',
      [agentId, tenMinutesAgo]
    );
    res.json(tickets.rows);
  } catch (error) {
    console.error('❌ Erreur tickets récents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.get('/tickets', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const { agentId, drawId, period, fromDate, toDate, gain, paid, page = 0, limit = 20 } = req.query;

    let conditions = ['a.supervisor_id = $1'];
    let params = [supervisorId];
    let paramIndex = 2;

    if (agentId && agentId !== 'all') {
      conditions.push(`t.agent_id = $${paramIndex++}`);
      params.push(agentId);
    }

    if (drawId && drawId !== 'all') {
      conditions.push(`t.draw_id = $${paramIndex++}`);
      params.push(drawId);
    }

    let dateCondition = '';
    if (period === 'today') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE';
    } else if (period === 'yesterday') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE - INTERVAL \'1 day\'';
    } else if (period === 'week') {
      dateCondition = 't.date >= DATE_TRUNC(\'week\', CURRENT_DATE)';
    } else if (period === 'month') {
      dateCondition = 't.date >= DATE_TRUNC(\'month\', CURRENT_DATE)';
    } else if (period === 'custom' && fromDate && toDate) {
      dateCondition = `DATE(t.date) BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(fromDate, toDate);
    }
    if (dateCondition) {
      conditions.push(dateCondition);
    }

    if (gain === 'win') {
      conditions.push('t.win_amount > 0');
    } else if (gain === 'nowin') {
      conditions.push('t.win_amount = 0');
    }

    if (paid === 'paid') {
      conditions.push('t.paid = true');
    } else if (paid === 'unpaid') {
      conditions.push('t.paid = false');
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    const hasMore = (page * limit + limit) < total;

    const offset = page * limit;
    const dataQuery = `
      SELECT t.*
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id
      ${whereClause}
      ORDER BY t.date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);
    const dataResult = await pool.query(dataQuery, params);

    const tickets = dataResult.rows.map(t => ({
      ...t,
      bets: typeof t.bets === 'string' ? JSON.parse(t.bets) : t.bets
    }));

    res.json({ tickets, hasMore, total });
  } catch (error) {
    console.error('❌ Erreur GET /supervisor/tickets:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

supervisorRouter.post('/tickets/:ticketId/pay', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const supervisorId = req.user.id;

    const check = await pool.query(
      `SELECT t.id FROM tickets t
       JOIN agents a ON t.agent_id = a.id
       WHERE t.id = $1 AND a.supervisor_id = $2`,
      [ticketId, supervisorId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé ou non autorisé' });
    }

    await pool.query('UPDATE tickets SET paid = true, paid_at = NOW() WHERE id = $1', [ticketId]);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur POST /supervisor/tickets/:ticketId/pay:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/supervisor', supervisorRouter);

// ==================== Routes propriétaire ====================
const ownerRouter = express.Router();
ownerRouter.use(authorize('owner'));

// ---------- Données quasi‑statiques avec cache 12h ----------
ownerRouter.get('/draws', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM draws ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/settings', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    const config = result.rows[0] || {};

    const defaultMultipliers = {
      lot1: 60,
      lot2: 20,
      lot3: 10,
      lotto3: 500,
      lotto4: 5000,
      lotto5: 25000,
      mariage: 500
    };

    const defaultGameLimits = {
      lotto3: 0,
      lotto4: 0,
      lotto5: 0
    };

    let multipliers = config.multipliers || defaultMultipliers;
    if (typeof multipliers === 'string') {
      try { multipliers = JSON.parse(multipliers); } catch { multipliers = defaultMultipliers; }
    }

    let gameLimits = config.game_limits || defaultGameLimits;
    if (typeof gameLimits === 'string') {
      try { gameLimits = JSON.parse(gameLimits); } catch { gameLimits = defaultGameLimits; }
    }

    res.json({
      name: config.name || 'LOTATO PRO',
      slogan: config.slogan || '',
      logoUrl: config.logo || '',
      multipliers: multipliers,
      limits: gameLimits
    });
  } catch (error) {
    console.error('❌ Erreur GET /settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/global-limits', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query('SELECT number, limit_amount FROM global_number_limits ORDER BY number');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération limites globales:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/blocked-numbers', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers ORDER BY number');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur récupération numéros globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/blocked-numbers-per-draw', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dbn.draw_id, d.name as draw_name, dbn.number
       FROM draw_blocked_numbers dbn
       JOIN draws d ON dbn.draw_id = d.id
       ORDER BY d.name, dbn.number`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération blocages par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/number-limits', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT dnl.draw_id, d.name as draw_name, dnl.number, dnl.limit_amount
       FROM draw_number_limits dnl
       JOIN draws d ON dnl.draw_id = d.id
       ORDER BY d.name, dnl.number`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/blocked-draws', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id as drawId, name as drawName FROM draws WHERE active = false ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération tirages bloqués:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/blocked-lotto3', cacheControl(43200), async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_lotto3_numbers ORDER BY number');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur récupération lotto3 bloqués:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Routes d'administration des limites globales ----------
ownerRouter.post('/global-limits', async (req, res) => {
  try {
    const { number, limitAmount } = req.body;
    if (!number || limitAmount === undefined) {
      return res.status(400).json({ error: 'Numéro et montant requis' });
    }
    const normalized = number.toString().padStart(2, '0');
    if (!/^\d{2}$/.test(normalized)) {
      return res.status(400).json({ error: 'Numéro invalide (2 chiffres requis)' });
    }
    const amount = parseFloat(limitAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Montant limite invalide (doit être un nombre positif)' });
    }

    await pool.query(
      `INSERT INTO global_number_limits (number, limit_amount)
       VALUES ($1, $2)
       ON CONFLICT (number) DO UPDATE SET limit_amount = $2, updated_at = NOW()`,
      [normalized, amount]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur création/modification limite globale:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.delete('/global-limits/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const normalized = number.padStart(2, '0');
    const result = await pool.query(
      'DELETE FROM global_number_limits WHERE number = $1',
      [normalized]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Limite globale non trouvée' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression limite globale:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ---------- Routes sans cache (modifications, tickets, rapports) ----------
ownerRouter.get('/dashboard', async (req, res) => {
  try {
    const connectedSupervisors = await pool.query(
      `SELECT id, name, email FROM supervisors WHERE active = true LIMIT 5`
    );
    const connectedAgents = await pool.query(
      `SELECT id, name, email FROM agents WHERE active = true LIMIT 5`
    );

    const salesToday = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM tickets WHERE DATE(date) = CURRENT_DATE`
    );

    // Limites par tirage
    const limitsProgress = await pool.query(
      `SELECT d.name as draw_name, l.number, l.limit_amount,
              COALESCE(SUM(t.total_amount), 0) as current_bets,
              (COALESCE(SUM(t.total_amount), 0) / l.limit_amount * 100) as progress_percent
       FROM draw_number_limits l
       JOIN draws d ON l.draw_id = d.id
       LEFT JOIN tickets t ON t.draw_id = l.draw_id AND t.bets::text LIKE '%'||l.number||'%' AND DATE(t.date) = CURRENT_DATE
       GROUP BY d.name, l.number, l.limit_amount
       ORDER BY progress_percent DESC`
    );

    // Limites globales
    const globalLimitsProgress = await pool.query(`
      SELECT '🌍 Global (tous tirages)' as draw_name,
             g.number,
             g.limit_amount,
             COALESCE(SUM((bet->>'amount')::numeric), 0) as current_bets,
             (COALESCE(SUM((bet->>'amount')::numeric), 0) / g.limit_amount * 100) as progress_percent
      FROM global_number_limits g
      LEFT JOIN tickets t ON DATE(t.date) = CURRENT_DATE
      LEFT JOIN LATERAL jsonb_array_elements(t.bets) AS bet ON (bet->>'cleanNumber') = g.number
      GROUP BY g.number, g.limit_amount
      ORDER BY progress_percent DESC
    `);

    const allLimitsProgress = [...limitsProgress.rows, ...globalLimitsProgress.rows];
    allLimitsProgress.sort((a, b) => parseFloat(b.progress_percent) - parseFloat(a.progress_percent));

    const agentsGainLoss = await pool.query(
      `SELECT a.id, a.name,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
       FROM agents a
       LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       GROUP BY a.id, a.name
       HAVING COALESCE(SUM(t.total_amount), 0) > 0 OR COALESCE(SUM(t.win_amount), 0) > 0
       ORDER BY net_result DESC`
    );

    const globalStats = await pool.query(`
      SELECT
        COUNT(*)::integer AS total_tickets_all,
        COALESCE(SUM(win_amount), 0)::float AS total_wins_all,
        COALESCE(SUM(total_amount - win_amount), 0)::float AS balance_all
      FROM tickets
    `);

    res.json({
      connected: {
        supervisors_count: connectedSupervisors.rows.length,
        supervisors: connectedSupervisors.rows,
        agents_count: connectedAgents.rows.length,
        agents: connectedAgents.rows
      },
      sales_today: parseFloat(salesToday.rows[0].total),
      limits_progress: allLimitsProgress,
      agents_gain_loss: agentsGainLoss.rows,
      global_stats: globalStats.rows[0]
    });
  } catch (error) {
    console.error('❌ Erreur dashboard owner:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/messages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT message FROM owner_messages WHERE owner_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );
    const message = result.rows.length > 0 ? result.rows[0].message : '';
    res.json({ message });
  } catch (error) {
    console.error('❌ Erreur récupération message propriétaire:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/supervisors', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, active as blocked FROM supervisors ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/agents', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.name, a.email, a.phone, a.active as blocked,
              s.name as supervisor_name, a.supervisor_id
       FROM agents a
       LEFT JOIN supervisors s ON a.supervisor_id = s.id
       ORDER BY a.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/create-user', async (req, res) => {
  try {
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let result;

    if (role === 'supervisor') {
      result = await pool.query(
        `INSERT INTO supervisors (name, email, password, phone, active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id`,
        [name, username, hashedPassword, cin || '']
      );
    } else if (role === 'agent') {
      result = await pool.query(
        `INSERT INTO agents (name, email, password, phone, supervisor_id, location, active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id`,
        [name, username, hashedPassword, cin || '', supervisorId || null, zone || '']
      );
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    console.error('❌ Erreur création utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/block-user', async (req, res) => {
  try {
    const { userId, type } = req.body;
    if (!userId || !type) return res.status(400).json({ error: 'Paramètres manquants' });
    const table = type === 'agent' ? 'agents' : 'supervisors';
    const current = await pool.query(`SELECT active FROM ${table} WHERE id = $1`, [userId]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const newStatus = !current.rows[0].active;
    await pool.query(`UPDATE ${table} SET active = $1 WHERE id = $2`, [newStatus, userId]);
    res.json({ success: true, blocked: !newStatus });
  } catch (error) {
    console.error('❌ Erreur blocage utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.put('/change-supervisor', async (req, res) => {
  try {
    const { agentId, supervisorId } = req.body;
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });
    await pool.query(
      'UPDATE agents SET supervisor_id = $1 WHERE id = $2',
      [supervisorId || null, agentId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur changement superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/publish-results', async (req, res) => {
  try {
    const { drawId, numbers, lotto3 } = req.body;
    if (!drawId || !numbers || !Array.isArray(numbers) || numbers.length !== 3) {
      return res.status(400).json({ error: 'Données invalides' });
    }
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });

    await pool.query(
      `INSERT INTO draw_results (draw_id, name, results, lotto3, draw_time, published_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers), lotto3]
    );

    await pool.query('UPDATE draws SET last_draw = NOW() WHERE id = $1', [drawId]);

    const lot1 = numbers[0];
    const lot2 = numbers[1];
    const lot3 = numbers[2];

    const ticketsRes = await pool.query(
      'SELECT id, bets FROM tickets WHERE draw_id = $1 AND checked = false',
      [drawId]
    );

    for (const ticket of ticketsRes.rows) {
      let totalWin = 0;
      const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;

      if (Array.isArray(bets)) {
        for (const bet of bets) {
          const game = bet.game || bet.specialType;
          const cleanNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
          const amount = parseFloat(bet.amount) || 0;
          let gain = 0;

          if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
            if (cleanNumber.length === 2) {
              let totalGain = 0;
              if (cleanNumber === lot1) totalGain += amount * 60;
              if (cleanNumber === lot2) totalGain += amount * 20;
              if (cleanNumber === lot3) totalGain += amount * 10;
              gain = totalGain;
            }
          }
          else if (game === 'lotto3') {
            if (cleanNumber.length === 3 && cleanNumber === lotto3) {
              gain = amount * 500;
            }
          }
          else if (game === 'mariage' || game === 'auto_marriage') {
            if (cleanNumber.length === 4) {
              const firstPair = cleanNumber.slice(0, 2);
              const secondPair = cleanNumber.slice(2, 4);
              const pairs = [lot1, lot2, lot3];
              let win = false;
              for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                  if (i !== j && firstPair === pairs[i] && secondPair === pairs[j]) {
                    win = true;
                    break;
                  }
                }
                if (win) break;
              }
              if (win) {
                if (bet.free && bet.freeType === 'special_marriage') {
                  gain = 1000;
                } else {
                  gain = amount * 1000;
                }
              }
            }
          }
          else if (game === 'lotto4' || game === 'auto_lotto4') {
            if (cleanNumber.length === 4 && bet.option) {
              const option = bet.option;
              let expected = '';
              if (option == 1) expected = lot1 + lot2;
              else if (option == 2) expected = lot2 + lot3;
              else if (option == 3) expected = lot1 + lot3;
              if (cleanNumber === expected) gain = amount * 5000;
            }
          }
          else if (game === 'lotto5' || game === 'auto_lotto5') {
            if (cleanNumber.length === 5 && bet.option) {
              const option = bet.option;
              let expected = '';
              if (option == 1) expected = lotto3 + lot2;
              else if (option == 2) expected = lotto3 + lot3;
              if (cleanNumber === expected) gain = amount * 5000;
            }
          }

          totalWin += gain;
        }
      }

      await pool.query(
        'UPDATE tickets SET win_amount = $1, checked = true WHERE id = $2',
        [totalWin, ticket.id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur publication résultats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/block-draw', async (req, res) => {
  try {
    const { drawId, block } = req.body;
    if (!drawId) return res.status(400).json({ error: 'drawId requis' });
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!block, drawId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/block-number', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Numéro requis' });
    const normalized = number.padStart(2, '0');
    if (!/^\d{2}$/.test(normalized)) {
      return res.status(400).json({ error: 'Numéro invalide (2 chiffres requis)' });
    }
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING',
      [normalized]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-number', async (req, res) => {
  try {
    const { number } = req.body;
    const normalized = number.padStart(2, '0');
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [normalized]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/block-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
    const normalized = number.padStart(2, '0');
    await pool.query(
      'INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [drawId, normalized]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage numéro par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    const normalized = number.padStart(2, '0');
    await pool.query(
      'DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2',
      [drawId, normalized]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/number-limit', async (req, res) => {
  try {
    const { drawId, number, limitAmount } = req.body;
    if (!number || !limitAmount) {
      return res.status(400).json({ error: 'number et limitAmount requis' });
    }

    const normalized = number.padStart(2, '0');
    if (!/^\d{2}$/.test(normalized)) {
      return res.status(400).json({ error: 'Numéro invalide (2 chiffres requis)' });
    }

    if (drawId === '0') {
      await pool.query(`
        INSERT INTO global_number_limits (number, limit_amount)
        VALUES ($1, $2)
        ON CONFLICT (number) DO UPDATE SET limit_amount = $2, updated_at = NOW()
      `, [normalized, limitAmount]);
      return res.json({ success: true });
    }

    if (!drawId) return res.status(400).json({ error: 'drawId requis' });

    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [drawId, normalized, limitAmount]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur définition limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/remove-number-limit', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    if (!drawId || !number) {
      return res.status(400).json({ error: 'drawId et number requis' });
    }
    const normalized = number.padStart(2, '0');
    await pool.query(
      'DELETE FROM draw_number_limits WHERE draw_id = $1 AND number = $2',
      [drawId, normalized]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/block-lotto3', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number || number.length !== 3 || !/^\d{3}$/.test(number)) {
      return res.status(400).json({ error: 'Numéro lotto3 invalide (3 chiffres requis)' });
    }
    await pool.query(
      'INSERT INTO blocked_lotto3_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING',
      [number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage lotto3:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-lotto3', async (req, res) => {
  try {
    const { number } = req.body;
    await pool.query('DELETE FROM blocked_lotto3_numbers WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage lotto3:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/reports', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (agentId && agentId !== 'all') {
      conditions.push(`t.agent_id = $${paramIndex++}`);
      params.push(agentId);
    } else if (supervisorId && supervisorId !== 'all') {
      conditions.push(`a.supervisor_id = $${paramIndex++}`);
      params.push(supervisorId);
    }

    if (drawId && drawId !== 'all') {
      conditions.push(`t.draw_id = $${paramIndex++}`);
      params.push(drawId);
    }

    let dateCondition = '';
    if (period === 'today') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE';
    } else if (period === 'yesterday') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE - INTERVAL \'1 day\'';
    } else if (period === 'week') {
      dateCondition = 't.date >= DATE_TRUNC(\'week\', CURRENT_DATE)';
    } else if (period === 'month') {
      dateCondition = 't.date >= DATE_TRUNC(\'month\', CURRENT_DATE)';
    } else if (period === 'custom' && fromDate && toDate) {
      dateCondition = `DATE(t.date) BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(fromDate, toDate);
    }
    if (dateCondition) {
      conditions.push(dateCondition);
    }

    if (gainLoss === 'gain') {
      conditions.push('t.win_amount > t.total_amount');
    } else if (gainLoss === 'loss') {
      conditions.push('t.win_amount < t.total_amount');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT t.id) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_bets,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result,
        COUNT(DISTINCT CASE WHEN t.win_amount > t.total_amount THEN t.agent_id END) as gain_count,
        COUNT(DISTINCT CASE WHEN t.win_amount < t.total_amount THEN t.agent_id END) as loss_count
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;

    const summary = await pool.query(summaryQuery, params);

    let detailQuery = '';
    if (drawId && drawId !== 'all') {
      detailQuery = `
        SELECT a.name as agent_name, a.id as agent_id,
               COUNT(t.id) as tickets,
               COALESCE(SUM(t.total_amount), 0) as bets,
               COALESCE(SUM(t.win_amount), 0) as wins,
               COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
        FROM tickets t
        JOIN agents a ON t.agent_id = a.id
        ${whereClause}
        GROUP BY a.id, a.name
        ORDER BY result DESC
      `;
    } else {
      detailQuery = `
        SELECT d.name as draw_name, d.id as draw_id,
               COUNT(t.id) as tickets,
               COALESCE(SUM(t.total_amount), 0) as bets,
               COALESCE(SUM(t.win_amount), 0) as wins,
               COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
        FROM tickets t
        JOIN draws d ON t.draw_id = d.id
        ${whereClause}
        GROUP BY d.id, d.name
        ORDER BY result DESC
      `;
    }

    const detail = await pool.query(detailQuery, params);

    res.json({
      summary: summary.rows[0],
      detail: detail.rows
    });
  } catch (error) {
    console.error('❌ Erreur rapport owner:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/tickets', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid, page = 0, limit = 20 } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    if (agentId && agentId !== 'all') {
      conditions.push(`t.agent_id = $${paramIndex++}`);
      params.push(agentId);
    }
    else if (supervisorId && supervisorId !== 'all') {
      conditions.push(`a.supervisor_id = $${paramIndex++}`);
      params.push(supervisorId);
    }

    if (drawId && drawId !== 'all') {
      conditions.push(`t.draw_id = $${paramIndex++}`);
      params.push(drawId);
    }

    let dateCondition = '';
    if (period === 'today') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE';
    } else if (period === 'yesterday') {
      dateCondition = 'DATE(t.date) = CURRENT_DATE - INTERVAL \'1 day\'';
    } else if (period === 'week') {
      dateCondition = 't.date >= DATE_TRUNC(\'week\', CURRENT_DATE)';
    } else if (period === 'month') {
      dateCondition = 't.date >= DATE_TRUNC(\'month\', CURRENT_DATE)';
    } else if (period === 'custom' && fromDate && toDate) {
      dateCondition = `DATE(t.date) BETWEEN $${paramIndex++} AND $${paramIndex++}`;
      params.push(fromDate, toDate);
    }
    if (dateCondition) {
      conditions.push(dateCondition);
    }

    if (gain === 'win') {
      conditions.push('t.win_amount > 0');
    } else if (gain === 'nowin') {
      conditions.push('t.win_amount = 0');
    }

    if (paid === 'paid') {
      conditions.push('t.paid = true');
    } else if (paid === 'unpaid') {
      conditions.push('t.paid = false');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    const hasMore = (page * limit + limit) < total;

    const offset = page * limit;
    const dataQuery = `
      SELECT t.*
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id = a.id
      ${whereClause}
      ORDER BY t.date DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);
    const dataResult = await pool.query(dataQuery, params);

    const tickets = dataResult.rows.map(t => ({
      ...t,
      bets: typeof t.bets === 'string' ? JSON.parse(t.bets) : t.bets
    }));

    res.json({
      tickets,
      hasMore,
      total
    });
  } catch (error) {
    console.error('❌ Erreur GET /tickets (owner):', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    const ticket = result.rows[0];
    ticket.bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
    res.json(ticket);
  } catch (error) {
    console.error('❌ Erreur GET /tickets/:id:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.delete('/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const check = await pool.query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }

    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'owner', 'delete_ticket', `Ticket ID: ${ticketId}`, req.ip]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur DELETE /tickets/:id:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/settings', upload.single('logo'), async (req, res) => {
  try {
    let { name, slogan, logoUrl, multipliers, limits } = req.body;

    if (multipliers && typeof multipliers === 'string') {
      try { multipliers = JSON.parse(multipliers); } catch { multipliers = {}; }
    }
    if (limits && typeof limits === 'string') {
      try { limits = JSON.parse(limits); } catch { limits = {}; }
    }

    const defaultMultipliers = {
      lot1: 60,
      lot2: 20,
      lot3: 10,
      lotto3: 500,
      lotto4: 5000,
      lotto5: 25000,
      mariage: 500
    };
    multipliers = { ...defaultMultipliers, ...(multipliers || {}) };

    const defaultGameLimits = {
      lotto3: 0,
      lotto4: 0,
      lotto5: 0
    };
    limits = { ...defaultGameLimits, ...(limits || {}) };

    let logo = logoUrl;
    if (req.file) {
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      logo = `data:${mimeType};base64,${base64}`;
    }

    const check = await pool.query('SELECT id FROM lottery_config LIMIT 1');
    if (check.rows.length === 0) {
      await pool.query(
        `INSERT INTO lottery_config (name, slogan, logo, multipliers, game_limits) VALUES ($1, $2, $3, $4, $5)`,
        [name || 'LOTATO PRO', slogan || '', logo || '', JSON.stringify(multipliers), JSON.stringify(limits)]
      );
    } else {
      const updates = [];
      const values = [];
      let idx = 1;

      if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
      if (slogan !== undefined) { updates.push(`slogan = $${idx++}`); values.push(slogan); }
      if (logo !== undefined) { updates.push(`logo = $${idx++}`); values.push(logo); }
      if (multipliers !== undefined) { updates.push(`multipliers = $${idx++}`); values.push(JSON.stringify(multipliers)); }
      if (limits !== undefined) { updates.push(`game_limits = $${idx++}`); values.push(JSON.stringify(limits)); }

      if (updates.length > 0) {
        await pool.query(
          `UPDATE lottery_config SET ${updates.join(', ')}`,
          values
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur POST /settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/owner', ownerRouter);

// ==================== Routes superadmin ====================
const superadminRouter = express.Router();
superadminRouter.use(authorize('superadmin'));

superadminRouter.get('/owners', async (req, res) => {
  try {
    const roleExists = await columnExists('supervisors', 'role');
    let query;
    if (roleExists) {
      query = `SELECT id, name, email, phone, active FROM supervisors WHERE role = 'owner' ORDER BY name`;
    } else {
      query = `SELECT id, name, email, phone, active FROM supervisors ORDER BY name`;
    }
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération propriétaires:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.post('/owners', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const roleExists = await columnExists('supervisors', 'role');
    if (roleExists) {
      await pool.query(
        `INSERT INTO supervisors (name, email, password, phone, active, role) VALUES ($1, $2, $3, $4, true, 'owner')`,
        [name, email, hashedPassword, phone || '']
      );
    } else {
      await pool.query(
        `INSERT INTO supervisors (name, email, password, phone, active) VALUES ($1, $2, $3, $4, true)`,
        [name, email, hashedPassword, phone || '']
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur création propriétaire:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.put('/owners/:id/block', async (req, res) => {
  try {
    const { id } = req.params;
    const { block } = req.body;
    await pool.query('UPDATE supervisors SET active = $1 WHERE id = $2', [!block, id]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage propriétaire:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.delete('/owners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM supervisors WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression propriétaire:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.get('/agents', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, active FROM agents ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.delete('/agents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM agents WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression agent:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.get('/supervisors', async (req, res) => {
  try {
    const roleExists = await columnExists('supervisors', 'role');
    let query;
    if (roleExists) {
      query = `SELECT id, name, email, phone, active FROM supervisors WHERE role != 'owner' OR role IS NULL ORDER BY name`;
    } else {
      query = `SELECT id, name, email, phone, active FROM supervisors ORDER BY name`;
    }
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.delete('/supervisors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM supervisors WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.post('/messages', async (req, res) => {
  try {
    const { ownerId, message } = req.body;
    if (!ownerId || !message) {
      return res.status(400).json({ error: 'ownerId et message requis' });
    }
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'owner_messages'
      )
    `);
    if (!tableExists.rows[0].exists) {
      await pool.query(`
        CREATE TABLE owner_messages (
          id SERIAL PRIMARY KEY,
          owner_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes'
        )
      `);
    }
    await pool.query(
      `INSERT INTO owner_messages (owner_id, message, created_at, expires_at) VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
      [ownerId, message]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur envoi message:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.get('/reports/owners', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name,
        COUNT(DISTINCT a.id) as agent_count,
        COUNT(DISTINCT t.id) as ticket_count,
        COALESCE(SUM(t.total_amount), 0) as total_bets,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
      FROM supervisors s
      LEFT JOIN agents a ON a.supervisor_id = s.id
      LEFT JOIN tickets t ON t.agent_id = a.id AND DATE(t.date) = CURRENT_DATE
      GROUP BY s.id, s.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur rapports propriétaires:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/superadmin', superadminRouter);

// ==================== Routes statiques ====================
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));
app.get('/superadmin.html', (req, res) => res.sendFile(path.join(__dirname, 'superadmin.html')));

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvée' });
});

app.use('*', (req, res) => {
  res.status(404).send('Page non trouvée');
});

app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// ==================== Démarrage ====================
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
  });
});
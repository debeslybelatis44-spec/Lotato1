// server.js - Version multi‑propriétaire avec limites globales fonctionnelles
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

// ==================== Connexion PostgreSQL ====================
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

console.log('🔄 Vérification de la base de données...');

// ==================== Création des tables ====================
async function ensureTables() {
  // Table users (propriétaires, superviseurs, agents)
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

  // Table draws (commune à tous les propriétaires)
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
        numbers VARCHAR(3) NOT NULL,
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

  // === Tables de gestion des limites et blocages (par propriétaire) ===
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

  // Index
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_owner_date ON tickets(owner_id, date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_agent_date ON tickets(agent_id, date)`);

  console.log('✅ Tables vérifiées/créées');
}

async function checkDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Connecté à PostgreSQL');
    client.release();
    const result = await pool.query('SELECT NOW() as current_time');
    console.log(`🕒 Heure du serveur DB : ${result.rows[0].current_time}`);
    await ensureTables();
    console.log('✅ Base de données prête');
  } catch (err) {
    console.error('❌ Erreur de connexion à la base de données :', err.message);
    process.exit(1);
  }
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

    const payload = { id: user.id, username: user.username, role: user.role, name: user.name };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

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
  res.json({ success: true });
});

// ==================== Routes communes ====================
app.get('/api/lottery-settings', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
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

// Blocages globaux (propres au propriétaire)
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

// Blocages par tirage (propres au propriétaire)
app.get('/api/blocked-numbers/draw/:drawId', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { drawId } = req.params;
  try {
    const result = await pool.query(
      'SELECT number FROM draw_blocked_numbers WHERE owner_id = $1 AND draw_id = $2',
      [ownerId, drawId]
    );
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Limites (globales et par tirage) fusionnées
app.get('/api/number-limits', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const global = await pool.query(
      'SELECT NULL as draw_id, number, limit_amount FROM global_number_limits WHERE owner_id = $1',
      [ownerId]
    );
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

// ==================== Sauvegarde des tickets (avec vérification des limites globales) ====================
app.post('/api/tickets/save', authenticate, async (req, res) => {
  const { agentId, agentName, drawId, drawName, bets, total } = req.body;
  const ownerId = req.user.ownerId;
  const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);

  try {
    // Vérifier que le tirage est actif
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
    }

    // === Récupération des blocages (propres au propriétaire) ===
    const globalBlocked = await pool.query('SELECT number FROM global_blocked_numbers WHERE owner_id = $1', [ownerId]);
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));
    const drawBlocked = await pool.query('SELECT number FROM draw_blocked_numbers WHERE owner_id = $1 AND draw_id = $2', [ownerId, drawId]);
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));
    const blockedLotto3 = await pool.query('SELECT number FROM blocked_lotto3_numbers WHERE owner_id = $1', [ownerId]);
    const blockedLotto3Set = new Set(blockedLotto3.rows.map(r => r.number));

    // === Limites globales (tous tirages) ===
    const globalLimitsRes = await pool.query('SELECT number, limit_amount FROM global_number_limits WHERE owner_id = $1', [ownerId]);
    const globalLimitsMap = new Map(globalLimitsRes.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    // === Limites par tirage ===
    const drawLimitsRes = await pool.query('SELECT number, limit_amount FROM draw_number_limits WHERE owner_id = $1 AND draw_id = $2', [ownerId, drawId]);
    const drawLimitsMap = new Map(drawLimitsRes.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    // === Collecte des numéros ayant une limite globale (borlette) ===
    const numbersWithGlobalLimit = new Set();
    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
        const rawNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/\D/g, '') : '');
        const normalized = rawNumber.padStart(2, '0');
        if (globalLimitsMap.has(normalized)) numbersWithGlobalLimit.add(normalized);
      }
    }

    // === Totaux globaux aujourd'hui (tous tirages) pour ces numéros ===
    const globalTotalsMap = new Map();
    if (numbersWithGlobalLimit.size > 0) {
      const resTot = await pool.query(`
        SELECT bet->>'cleanNumber' as number,
               SUM((bet->>'amount')::numeric) as total
        FROM tickets,
             LATERAL jsonb_array_elements(bets::jsonb) as bet
        WHERE owner_id = $1
          AND DATE(date) = CURRENT_DATE
          AND bet->>'cleanNumber' = ANY($2::text[])
        GROUP BY bet->>'cleanNumber'
      `, [ownerId, Array.from(numbersWithGlobalLimit)]);
      for (const row of resTot.rows) {
        globalTotalsMap.set(row.number, parseFloat(row.total) || 0);
      }
    }

    // === Collecte des numéros ayant une limite par tirage ===
    const numbersWithDrawLimit = new Set();
    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
        const rawNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/\D/g, '') : '');
        const normalized = rawNumber.padStart(2, '0');
        if (drawLimitsMap.has(normalized)) numbersWithDrawLimit.add(normalized);
      }
    }

    // === Totaux pour ce tirage aujourd'hui ===
    const drawTotalsMap = new Map();
    if (numbersWithDrawLimit.size > 0) {
      const resTot = await pool.query(`
        SELECT bet->>'cleanNumber' as number,
               SUM((bet->>'amount')::numeric) as total
        FROM tickets,
             LATERAL jsonb_array_elements(bets::jsonb) as bet
        WHERE owner_id = $1
          AND draw_id = $2
          AND DATE(date) = CURRENT_DATE
          AND bet->>'cleanNumber' = ANY($3::text[])
        GROUP BY bet->>'cleanNumber'
      `, [ownerId, drawId, Array.from(numbersWithDrawLimit)]);
      for (const row of resTot.rows) {
        drawTotalsMap.set(row.number, parseFloat(row.total) || 0);
      }
    }

    // === Vérifications : blocages et limites ===
    const exceeded = [];

    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      const rawNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/\D/g, '') : '');
      if (!rawNumber) continue;

      let normalizedNumber = rawNumber;
      if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
        normalizedNumber = rawNumber.padStart(2, '0');
      } else if (game === 'lotto3' || game === 'auto_lotto3') {
        normalizedNumber = rawNumber.padStart(3, '0');
      }

      // Blocages
      if (globalBlockedSet.has(normalizedNumber)) {
        return res.status(403).json({ error: `Numéro ${normalizedNumber} est bloqué globalement` });
      }
      if (drawBlockedSet.has(normalizedNumber)) {
        return res.status(403).json({ error: `Numéro ${normalizedNumber} est bloqué pour ce tirage` });
      }
      if ((game === 'lotto3' || game === 'auto_lotto3') && normalizedNumber.length === 3 && blockedLotto3Set.has(normalizedNumber)) {
        return res.status(403).json({ error: `Numéro Lotto3 ${normalizedNumber} est bloqué globalement` });
      }

      // Limite par tirage
      const limitPerDraw = drawLimitsMap.get(normalizedNumber);
      if (limitPerDraw && limitPerDraw > 0 && !bet.free) {
        const current = drawTotalsMap.get(normalizedNumber) || 0;
        const amount = parseFloat(bet.amount) || 0;
        if (current + amount > limitPerDraw) {
          exceeded.push({
            number: normalizedNumber,
            limit: limitPerDraw,
            already: current,
            requested: amount,
            remaining: limitPerDraw - current,
            type: 'per_draw'
          });
        }
      }

      // Limite globale (tous tirages)
      const globalLimit = globalLimitsMap.get(normalizedNumber);
      if (globalLimit && globalLimit > 0 && !bet.free) {
        const currentGlobal = globalTotalsMap.get(normalizedNumber) || 0;
        const amount = parseFloat(bet.amount) || 0;
        if (currentGlobal + amount > globalLimit) {
          exceeded.push({
            number: normalizedNumber,
            limit: globalLimit,
            already: currentGlobal,
            requested: amount,
            remaining: globalLimit - currentGlobal,
            type: 'global'
          });
        }
      }
    }

    if (exceeded.length > 0) {
      const message = exceeded.map(e => `Numéro ${e.number} (${e.type === 'global' ? 'limite globale' : 'limite tirage'}) : limite ${e.limit} G, déjà ${e.already} G, demande ${e.requested} G, reste ${e.remaining} G.`).join('\n');
      return res.status(403).json({
        error: `Limite dépassée.\n${message}`,
        limitExceeded: exceeded
      });
    }

    // === Limites par type de jeu (inchangé) ===
    const settingsRes = await pool.query('SELECT limits FROM lottery_settings WHERE owner_id = $1', [ownerId]);
    let gameLimits = { lotto3: 0, lotto4: 0, lotto5: 0, mariage: 0 };
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].limits) {
      const raw = settingsRes.rows[0].limits;
      gameLimits = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }

    const totalsByGame = {};
    for (const bet of bets) {
      const game = bet.game || bet.specialType;
      let category = null;
      if (game === 'lotto3' || game === 'auto_lotto3') category = 'lotto3';
      else if (game === 'lotto4' || game === 'auto_lotto4') category = 'lotto4';
      else if (game === 'lotto5' || game === 'auto_lotto5') category = 'lotto5';
      else if (game === 'mariage' || game === 'auto_marriage') category = 'mariage';
      if (category) {
        const amount = parseFloat(bet.amount) || 0;
        totalsByGame[category] = (totalsByGame[category] || 0) + amount;
      }
    }
    for (const [category, total] of Object.entries(totalsByGame)) {
      const limit = gameLimits[category] || 0;
      if (limit > 0 && total > limit) {
        return res.status(403).json({ error: `Limite de mise pour ${category} dépassée (max ${limit} Gdes par ticket)` });
      }
    }

    // === Génération des mariages gratuits ===
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
      newFreeBets.push({
        game: 'auto_marriage',
        number: `${n1}&${n2}`,
        cleanNumber: n1 + n2,
        amount: 0,
        free: true,
        freeType: 'special_marriage',
        freeWin: 1000
      });
    }

    const finalBets = [...bets, ...newFreeBets];
    const finalTotal = finalBets.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

    const result = await pool.query(
      `INSERT INTO tickets (owner_id, agent_id, agent_name, draw_id, draw_name, ticket_id, total_amount, bets, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id`,
      [ownerId, agentId, agentName, drawId, drawName, ticketId, finalTotal, JSON.stringify(finalBets)]
    );

    res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, ...req.body } });
  } catch (err) {
    console.error('❌ Erreur sauvegarde ticket:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Routes propriétaire ====================
const ownerRouter = express.Router();
ownerRouter.use(authenticate, requireRole('owner'));

ownerRouter.get('/messages', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT message FROM owner_messages WHERE owner_id = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [ownerId]
    );
    res.json({ message: result.rows[0]?.message || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/supervisors', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT id, name, username, blocked FROM users WHERE owner_id = $1 AND role = $2',
      [ownerId, 'supervisor']
    );
    res.json(result.rows.map(s => ({ ...s, email: s.username })));
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/agents', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked, u.zone, u.cin, u.commission_percentage, s.name as supervisor_name
       FROM users u
       LEFT JOIN users s ON u.supervisor_id = s.id
       WHERE u.owner_id = $1 AND u.role = $2`,
      [ownerId, 'agent']
    );
    res.json(result.rows.map(a => ({ ...a, email: a.username })));
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/create-user', async (req, res) => {
  const ownerId = req.user.id;
  const { name, cin, username, password, role, supervisorId, zone, commissionPercentage } = req.body;
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'Champs obligatoires manquants' });

  try {
    const quotaRes = await pool.query('SELECT quota FROM users WHERE id = $1', [ownerId]);
    const quota = quotaRes.rows[0]?.quota || 0;
    const countRes = await pool.query('SELECT COUNT(*) FROM users WHERE owner_id = $1 AND role IN ($2, $3)', [ownerId, 'agent', 'supervisor']);
    if (parseInt(countRes.rows[0].count) >= quota) return res.status(403).json({ error: 'Quota d’utilisateurs atteint' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (owner_id, name, cin, username, password, role, supervisor_id, zone, commission_percentage, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id, name, username, role, cin, zone, commission_percentage`,
      [ownerId, name, cin || null, username, hashed, role, supervisorId || null, zone || null, commissionPercentage || 0]
    );
    const user = { ...result.rows[0], email: result.rows[0].username };
    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [ownerId, 'owner', 'create_user', `Création ${role}: ${username}`, req.ip]
    );
    res.json({ success: true, user });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "Nom d'utilisateur déjà existant" });
    res.status(500).json({ error: 'Erreur création utilisateur' });
  }
});

ownerRouter.post('/block-user', async (req, res) => {
  const ownerId = req.user.id;
  const { userId } = req.body;
  try {
    await pool.query('UPDATE users SET blocked = NOT blocked WHERE id = $1 AND owner_id = $2', [userId, ownerId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.put('/change-supervisor', async (req, res) => {
  const ownerId = req.user.id;
  const { agentId, supervisorId } = req.body;
  try {
    await pool.query(
      'UPDATE users SET supervisor_id = $1 WHERE id = $2 AND owner_id = $3 AND role = $4',
      [supervisorId || null, agentId, ownerId, 'agent']
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.get('/draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, color, active FROM draws ORDER BY time');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/publish-results', async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, numbers, lotto3 } = req.body;
  if (!drawId || !numbers || numbers.length !== 3) return res.status(400).json({ error: 'Données invalides' });
  try {
    await pool.query(
      `INSERT INTO winning_results (owner_id, draw_id, numbers, lotto3, date) VALUES ($1, $2, $3, $4, NOW())`,
      [ownerId, drawId, JSON.stringify(numbers), lotto3]
    );

    const settingsRes = await pool.query('SELECT multipliers FROM lottery_settings WHERE owner_id = $1', [ownerId]);
    let multipliers = { lot1: 60, lot2: 20, lot3: 10, lotto3: 500, lotto4: 5000, lotto5: 25000, mariage: 500 };
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].multipliers) {
      const raw = settingsRes.rows[0].multipliers;
      multipliers = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }

    const [lot1, lot2, lot3_num] = numbers;
    const ticketsRes = await pool.query(
      'SELECT id, bets FROM tickets WHERE owner_id = $1 AND draw_id = $2 AND checked = false',
      [ownerId, drawId]
    );

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
          }
          else if (game === 'lotto3') {
            if (clean.length === 3 && clean === lotto3) gain = amount * multipliers.lotto3;
          }
          else if (game === 'mariage' || game === 'auto_marriage') {
            if (clean.length === 4) {
              const first = clean.slice(0,2);
              const second = clean.slice(2,4);
              const pairs = [lot1, lot2, lot3_num];
              let win = false;
              for (let i=0; i<3; i++) {
                for (let j=0; j<3; j++) {
                  if (i!==j && first === pairs[i] && second === pairs[j]) { win = true; break; }
                }
                if (win) break;
              }
              if (win) gain = (bet.free && bet.freeType === 'special_marriage') ? 1000 : amount * multipliers.mariage;
            }
          }
          else if (game === 'lotto4' || game === 'auto_lotto4') {
            if (clean.length === 4 && bet.option) {
              let expected = '';
              if (bet.option == 1) expected = lot1 + lot2;
              else if (bet.option == 2) expected = lot2 + lot3_num;
              else if (bet.option == 3) expected = lot1 + lot3_num;
              if (clean === expected) gain = amount * multipliers.lotto4;
            }
          }
          else if (game === 'lotto5' || game === 'auto_lotto5') {
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

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [ownerId, 'owner', 'publish_results', `Tirage ${drawId}`, req.ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur publication' });
  }
});

ownerRouter.post('/block-draw', async (req, res) => {
  const { drawId, block } = req.body;
  try {
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!block, drawId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.get('/blocked-numbers', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number FROM global_blocked_numbers WHERE owner_id = $1', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/block-number', async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('INSERT INTO global_blocked_numbers (owner_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ownerId, normalized]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/unblock-number', async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('DELETE FROM global_blocked_numbers WHERE owner_id = $1 AND number = $2', [ownerId, normalized]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.get('/blocked-numbers-per-draw', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT b.draw_id, d.name as draw_name, b.number
       FROM draw_blocked_numbers b
       JOIN draws d ON b.draw_id = d.id
       WHERE b.owner_id = $1`,
      [ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/block-number-draw', async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('INSERT INTO draw_blocked_numbers (owner_id, draw_id, number) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [ownerId, drawId, normalized]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/unblock-number-draw', async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  const normalized = number.padStart(2, '0');
  try {
    await pool.query('DELETE FROM draw_blocked_numbers WHERE owner_id = $1 AND draw_id = $2 AND number = $3', [ownerId, drawId, normalized]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.get('/number-limits', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const global = await pool.query('SELECT NULL as draw_id, NULL as draw_name, number, limit_amount FROM global_number_limits WHERE owner_id = $1', [ownerId]);
    const draw = await pool.query(
      `SELECT l.draw_id, d.name as draw_name, l.number, l.limit_amount
       FROM draw_number_limits l
       LEFT JOIN draws d ON l.draw_id = d.id
       WHERE l.owner_id = $1
       ORDER BY l.draw_id, l.number`,
      [ownerId]
    );
    res.json([...global.rows, ...draw.rows]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/number-limit', async (req, res) => {
  const ownerId = req.user.id;
  let { drawId, number, limitAmount } = req.body;
  const normalized = number.padStart(2, '0');
  if (!/^\d{2}$/.test(normalized)) return res.status(400).json({ error: 'Numéro invalide (2 chiffres requis)' });

  if (!drawId || drawId === '0' || drawId === 'global') {
    await pool.query(
      `INSERT INTO global_number_limits (owner_id, number, limit_amount) VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [ownerId, normalized, limitAmount]
    );
  } else {
    await pool.query(
      `INSERT INTO draw_number_limits (owner_id, draw_id, number, limit_amount) VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_id, draw_id, number) DO UPDATE SET limit_amount = $4, updated_at = NOW()`,
      [ownerId, drawId, normalized, limitAmount]
    );
  }
  res.json({ success: true });
});

ownerRouter.post('/remove-number-limit', async (req, res) => {
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

ownerRouter.get('/blocked-lotto3', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number FROM blocked_lotto3_numbers WHERE owner_id = $1 ORDER BY number', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/block-lotto3', async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  if (!number || number.length !== 3 || !/^\d{3}$/.test(number)) return res.status(400).json({ error: 'Numéro lotto3 invalide' });
  try {
    await pool.query('INSERT INTO blocked_lotto3_numbers (owner_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ownerId, number]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-lotto3', async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_lotto3_numbers WHERE owner_id = $1 AND number = $2', [ownerId, number]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/blocked-draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT id as drawId, name as drawName FROM draws WHERE active = false ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/dashboard', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const supervisors = await pool.query('SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2', [ownerId, 'supervisor']);
    const agents = await pool.query('SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2', [ownerId, 'agent']);
    const sales = await pool.query('SELECT COALESCE(SUM(total_amount),0) as total FROM tickets WHERE owner_id = $1 AND date >= CURRENT_DATE', [ownerId]);

    const agentsGainLoss = await pool.query(
      `SELECT u.id, u.name,
              COALESCE(SUM(t.total_amount),0) as total_bets,
              COALESCE(SUM(t.win_amount),0) as total_wins,
              COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
       FROM users u
       LEFT JOIN tickets t ON u.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE u.owner_id = $1 AND u.role = $2
       GROUP BY u.id`,
      [ownerId, 'agent']
    );

    const limitsProgress = await pool.query(`
      SELECT 
        COALESCE(d.name, '🌍 Global (tous tirages)') as draw_name,
        l.number,
        l.limit_amount,
        COALESCE(SUM((bet->>'amount')::numeric), 0) as current_bets,
        (COALESCE(SUM((bet->>'amount')::numeric), 0) / l.limit_amount * 100) as progress_percent
      FROM (
        SELECT owner_id, NULL as draw_id, number, limit_amount FROM global_number_limits
        UNION ALL
        SELECT owner_id, draw_id, number, limit_amount FROM draw_number_limits
      ) l
      LEFT JOIN draws d ON l.draw_id = d.id
      LEFT JOIN tickets t ON t.owner_id = l.owner_id AND DATE(t.date) = CURRENT_DATE
        AND (l.draw_id IS NULL OR t.draw_id = l.draw_id)
      LEFT JOIN LATERAL jsonb_array_elements(t.bets) AS bet ON (bet->>'cleanNumber') = l.number
      WHERE l.owner_id = $1
      GROUP BY d.name, l.number, l.limit_amount
      ORDER BY progress_percent DESC
    `, [ownerId]);

    res.json({
      connected: {
        supervisors_count: supervisors.rows.length,
        supervisors: supervisors.rows.map(s => ({ ...s, email: s.username })),
        agents_count: agents.rows.length,
        agents: agents.rows.map(a => ({ ...a, email: a.username }))
      },
      sales_today: parseFloat(sales.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.get('/reports', async (req, res) => {
  const ownerId = req.user.id;
  const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

  let baseQuery = 'SELECT COUNT(id) as tickets, COALESCE(SUM(total_amount),0) as bets, COALESCE(SUM(win_amount),0) as wins, COALESCE(SUM(win_amount)-SUM(total_amount),0) as result FROM tickets WHERE owner_id = $1';
  const params = [ownerId];
  let idx = 2;

  if (supervisorId && supervisorId !== 'all') {
    baseQuery += ` AND agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++})`;
    params.push(supervisorId);
  }
  if (agentId && agentId !== 'all') {
    baseQuery += ` AND agent_id = $${idx++}`;
    params.push(agentId);
  }
  if (drawId && drawId !== 'all') {
    baseQuery += ` AND draw_id = $${idx++}`;
    params.push(drawId);
  }

  if (period === 'today') baseQuery += ` AND date >= CURRENT_DATE`;
  else if (period === 'yesterday') baseQuery += ` AND date >= CURRENT_DATE - INTERVAL '1 day' AND date < CURRENT_DATE`;
  else if (period === 'week') baseQuery += ` AND date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') baseQuery += ` AND date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) {
    baseQuery += ` AND date >= $${idx++} AND date <= $${idx++}`;
    params.push(fromDate, toDate);
  }

  if (gainLoss === 'gain') baseQuery += ` AND win_amount > 0`;
  else if (gainLoss === 'loss') baseQuery += ` AND (win_amount = 0 OR win_amount IS NULL)`;

  const summaryRes = await pool.query(baseQuery, params);
  const summary = summaryRes.rows[0];

  let detailQuery = `
    SELECT d.id as draw_id, d.name as draw_name, 
           COUNT(t.id) as tickets, 
           COALESCE(SUM(t.total_amount),0) as bets, 
           COALESCE(SUM(t.win_amount),0) as wins, 
           COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as result
    FROM tickets t
    JOIN draws d ON t.draw_id = d.id
    WHERE t.owner_id = $1
  `;
  const detailParams = [ownerId];
  let didx = 2;
  if (supervisorId && supervisorId !== 'all') {
    detailQuery += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${didx++})`;
    detailParams.push(supervisorId);
  }
  if (agentId && agentId !== 'all') {
    detailQuery += ` AND t.agent_id = $${didx++}`;
    detailParams.push(agentId);
  }
  if (drawId && drawId !== 'all') {
    detailQuery += ` AND t.draw_id = $${didx++}`;
    detailParams.push(drawId);
  }

  if (period === 'today') detailQuery += ` AND t.date >= CURRENT_DATE`;
  else if (period === 'yesterday') detailQuery += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
  else if (period === 'week') detailQuery += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') detailQuery += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) {
    detailQuery += ` AND t.date >= $${didx++} AND t.date <= $${didx++}`;
    detailParams.push(fromDate, toDate);
  }

  if (gainLoss === 'gain') detailQuery += ` AND t.win_amount > 0`;
  else if (gainLoss === 'loss') detailQuery += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;

  detailQuery += ` GROUP BY d.id, d.name ORDER BY d.name`;
  const detailRes = await pool.query(detailQuery, detailParams);

  const gainLossCount = await pool.query(
    `SELECT COUNT(CASE WHEN net_result > 0 THEN 1 END) as gain_count, COUNT(CASE WHEN net_result < 0 THEN 1 END) as loss_count
     FROM (SELECT u.id, COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
           FROM users u
           LEFT JOIN tickets t ON u.id = t.agent_id ${period === 'today' ? 'AND DATE(t.date) = CURRENT_DATE' : ''}
           WHERE u.owner_id = $1 AND u.role = 'agent'
           GROUP BY u.id) sub`,
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

ownerRouter.get('/tickets', async (req, res) => {
  const ownerId = req.user.id;
  const { page = 0, limit = 20, supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid } = req.query;

  let query = 'SELECT t.* FROM tickets t WHERE t.owner_id = $1';
  const params = [ownerId];
  let idx = 2;

  if (supervisorId && supervisorId !== 'all') {
    query += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++})`;
    params.push(supervisorId);
  }
  if (agentId && agentId !== 'all') {
    query += ` AND t.agent_id = $${idx++}`;
    params.push(agentId);
  }
  if (drawId && drawId !== 'all') {
    query += ` AND t.draw_id = $${idx++}`;
    params.push(drawId);
  }

  if (period === 'today') query += ` AND DATE(t.date) = CURRENT_DATE`;
  else if (period === 'yesterday') query += ` AND DATE(t.date) = CURRENT_DATE - INTERVAL '1 day'`;
  else if (period === 'week') query += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
  else if (period === 'month') query += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) {
    query += ` AND DATE(t.date) BETWEEN $${idx++} AND $${idx++}`;
    params.push(fromDate, toDate);
  }

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
  res.json({
    tickets: dataRes.rows,
    hasMore: (page + 1) * limit < total,
    total
  });
});

ownerRouter.get('/tickets/:id', async (req, res) => {
  const ownerId = req.user.id;
  const ticketId = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ticket introuvable' });
    const ticket = result.rows[0];
    ticket.bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.delete('/tickets/:id', async (req, res) => {
  const ownerId = req.user.id;
  const ticketId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });
    await pool.query('DELETE FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [ownerId, 'owner', 'delete_ticket', `Ticket ID: ${ticketId}`, req.ip]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.get('/settings', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT * FROM lottery_settings WHERE owner_id = $1', [ownerId]);
    if (result.rows.length === 0) return res.json({ name: 'LOTATO PRO', slogan: '', logoUrl: '', multipliers: {}, limits: {} });
    const row = result.rows[0];
    row.logoUrl = row.logo_url;
    delete row.logo_url;
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.post('/settings', upload.single('logo'), async (req, res) => {
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
       ON CONFLICT (owner_id) DO UPDATE SET
         name = EXCLUDED.name,
         slogan = EXCLUDED.slogan,
         logo_url = EXCLUDED.logo_url,
         multipliers = EXCLUDED.multipliers,
         limits = EXCLUDED.limits`,
      [ownerId, name || 'LOTATO PRO', slogan || '', logoUrl || '', JSON.stringify(multipliers || {}), JSON.stringify(limits || {})]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur' });
  }
});

ownerRouter.get('/quota', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const quotaRes = await pool.query('SELECT quota FROM users WHERE id = $1', [ownerId]);
    const quota = quotaRes.rows[0]?.quota || 0;
    const usedRes = await pool.query('SELECT COUNT(*) FROM users WHERE owner_id = $1 AND role IN ($2, $3)', [ownerId, 'agent', 'supervisor']);
    const used = parseInt(usedRes.rows[0].count);
    res.json({ quota, used });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Routes dédiées aux limites globales (indépendantes)
ownerRouter.get('/global-limits', async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT number, limit_amount FROM global_number_limits WHERE owner_id = $1 ORDER BY number',
      [ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Erreur récupération limites globales:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/global-limits', async (req, res) => {
  const ownerId = req.user.id;
  const { number, limitAmount } = req.body;
  const normalized = number?.toString().padStart(2, '0');
  if (!/^\d{2}$/.test(normalized)) {
    return res.status(400).json({ error: 'Numéro invalide (2 chiffres requis)' });
  }
  if (typeof limitAmount !== 'number' || limitAmount <= 0) {
    return res.status(400).json({ error: 'Montant limite invalide (doit être un nombre positif)' });
  }
  try {
    await pool.query(
      `INSERT INTO global_number_limits (owner_id, number, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [ownerId, normalized, limitAmount]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur création/modification limite globale:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.delete('/global-limits/:number', async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.params;
  const normalized = number.padStart(2, '0');
  try {
    const result = await pool.query(
      'DELETE FROM global_number_limits WHERE owner_id = $1 AND number = $2',
      [ownerId, normalized]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Limite globale non trouvée' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur suppression limite globale:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/owner', ownerRouter);

// ==================== Routes superviseur et agent (simplifiées pour l'exemple) ====================
// (Vous pouvez conserver vos routes existantes pour superviseur et agent, ici un exemple minimal)

const supervisorRouter = express.Router();
supervisorRouter.use(authenticate, requireRole('supervisor'));

supervisorRouter.get('/agents', async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked, u.zone,
              COALESCE(SUM(t.total_amount),0) as total_bets,
              COALESCE(SUM(t.win_amount),0) as total_wins,
              COUNT(t.id) as total_tickets,
              COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as balance
       FROM users u
       LEFT JOIN tickets t ON u.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE u.owner_id = $1 AND u.supervisor_id = $2 AND u.role = 'agent'
       GROUP BY u.id`,
      [ownerId, supervisorId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/supervisor', supervisorRouter);

// Routes agent minimales
app.get('/api/reports', authenticate, requireRole('agent'), async (req, res) => {
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
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Routes superadmin (simplifiées) ====================
const superadminRouter = express.Router();
superadminRouter.use(authenticate, requireSuperAdmin);

superadminRouter.get('/owners', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username as email, blocked as active, quota, phone, created_at FROM users WHERE role = $1 ORDER BY created_at DESC',
      ['owner']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

superadminRouter.post('/owners', async (req, res) => {
  const { name, email, password, phone, quota } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, username, password, role, phone, quota, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id`,
      [name, email, hashed, 'owner', phone || null, quota || 0]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur création' });
  }
});

superadminRouter.put('/owners/:id/block', async (req, res) => {
  const { id } = req.params;
  const { block } = req.body;
  try {
    await pool.query('UPDATE users SET blocked = $1 WHERE id = $2 AND role = $3', [block, id, 'owner']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour' });
  }
});

superadminRouter.delete('/owners/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [id, 'owner']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

superadminRouter.post('/messages', async (req, res) => {
  const { ownerId, message } = req.body;
  if (!ownerId || !message) return res.status(400).json({ error: 'ownerId et message requis' });
  try {
    await pool.query(
      `INSERT INTO owner_messages (owner_id, message, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
      [ownerId, message]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur envoi message' });
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

// 404 API
app.use('/api/*', (req, res) => res.status(404).json({ error: 'Route API non trouvée' }));
app.use('*', (req, res) => res.status(404).send('Page non trouvée'));

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// Démarrage
checkDatabaseConnection().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${port}`);
  });
});
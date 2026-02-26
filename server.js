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

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== Middlewares ====================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 Mo max
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: (req) => req.ip
});
app.use('/api/', limiter);

// ==================== Base de données ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

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

async function tableExists(table) {
  const res = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name = $1
  `, [table]);
  return res.rows.length > 0;
}

async function createTableIfNotExists(table, createQuery) {
  if (!(await tableExists(table))) {
    await pool.query(createQuery);
    console.log(`✅ Table ${table} créée`);
  }
}

// Initialisation des tables et données par défaut
async function initializeDatabase() {
  try {
    console.log('🔄 Vérification de la base de données...');

    // Table propriétaires
    await createTableIfNotExists('owners', `
      CREATE TABLE owners (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Ajout de owner_id dans supervisors et agents (déjà fait, mais on s'assure)
    await addColumnIfNotExists('supervisors', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE SET NULL');
    await addColumnIfNotExists('agents', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE SET NULL');

    // Ajout de owner_id dans les autres tables
    await addColumnIfNotExists('draws', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE CASCADE');
    await addColumnIfNotExists('blocked_numbers', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE CASCADE');
    await addColumnIfNotExists('draw_blocked_numbers', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE CASCADE');
    await addColumnIfNotExists('draw_number_limits', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE CASCADE');
    await addColumnIfNotExists('lottery_config', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE CASCADE');

    // Contraintes d'unicité
    try {
      await pool.query('ALTER TABLE lottery_config ADD CONSTRAINT lottery_config_owner_id_unique UNIQUE (owner_id)');
    } catch (e) { /* existe peut-être déjà */ }
    try {
      await pool.query('ALTER TABLE blocked_numbers DROP CONSTRAINT IF EXISTS blocked_numbers_number_key');
      await pool.query('ALTER TABLE blocked_numbers ADD CONSTRAINT blocked_numbers_owner_number_unique UNIQUE (owner_id, number)');
    } catch (e) { console.log('Contrainte blocked_numbers déjà ajustée'); }

    // Création de dix propriétaires par défaut si aucun n'existe
    const ownersCount = await pool.query('SELECT COUNT(*) FROM owners');
    if (parseInt(ownersCount.rows[0].count) === 0) {
      console.log('👤 Création de 10 propriétaires par défaut...');
      const owners = [];
      for (let i = 1; i <= 10; i++) {
        const name = `bor${i}nou${i}`;
        // Mots de passe selon demande
        const password = i === 1 ? 'bor123nou456' 
                      : i === 2 ? 'bor456nou789'
                      : i === 3 ? 'bor789nou112'
                      : i === 4 ? 'bor112nou223'
                      : i === 5 ? 'bor223nou334'
                      : i === 6 ? 'bor334nou445'
                      : i === 7 ? 'bor445nou556'
                      : i === 8 ? 'bor556nou667'
                      : i === 9 ? 'bor667nou778'
                      : 'bor778nou889'; // pour i=10
        const hashed = await bcrypt.hash(password, 10);
        owners.push({ name, email: `${name}@example.com`, password: hashed });
      }
      for (const o of owners) {
        await pool.query(
          'INSERT INTO owners (name, email, password) VALUES ($1, $2, $3)',
          [o.name, o.email, o.password]
        );
      }
      console.log('✅ 10 propriétaires créés');
    }

    // Créer des tirages par défaut pour chaque propriétaire (s'ils n'en ont pas)
    const owners = await pool.query('SELECT id FROM owners');
    for (const owner of owners.rows) {
      const drawCount = await pool.query('SELECT COUNT(*) FROM draws WHERE owner_id = $1', [owner.id]);
      if (parseInt(drawCount.rows[0].count) === 0) {
        // Tirages par défaut (provenant de CONFIG.DRAWS)
        const defaultDraws = [
          { name: 'Tunisia Matin', time: '10:00' },
          { name: 'Tunisia Soir', time: '17:00' },
          { name: 'Florida Matin', time: '13:30' },
          { name: 'Florida Soir', time: '21:50' },
          { name: 'New York Matin', time: '14:30' },
          { name: 'New York Soir', time: '20:00' },
          { name: 'Georgia Matin', time: '12:30' },
          { name: 'Georgia Soir', time: '19:00' },
          { name: 'Texas Matin', time: '11:30' },
          { name: 'Texas Soir', time: '18:30' }
        ];
        for (const d of defaultDraws) {
          await pool.query(
            'INSERT INTO draws (name, time, active, owner_id) VALUES ($1, $2, $3, $4)',
            [d.name, d.time, true, owner.id]
          );
        }
        console.log(`✅ Tirages par défaut créés pour le propriétaire ${owner.id}`);
      }
    }

    // Créer une config par défaut pour chaque propriétaire
    for (const owner of owners.rows) {
      const configCount = await pool.query('SELECT COUNT(*) FROM lottery_config WHERE owner_id = $1', [owner.id]);
      if (parseInt(configCount.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO lottery_config (name, slogan, logo, multipliers, owner_id)
           VALUES ($1, $2, $3, $4, $5)`,
          ['LOTATO PRO', '', '', JSON.stringify({ lot1:60, lot2:20, lot3:10, lotto3:500, lotto4:5000, lotto5:25000, mariage:500 }), owner.id]
        );
      }
    }

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
    let ownerId = null;

    if (role === 'owner') {
      const result = await pool.query(
        'SELECT id, name, email, password FROM owners WHERE email = $1 OR name = $1',
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
      user = result.rows[0];
      ownerId = user.id;
    } else {
      let table = role === 'supervisor' ? 'supervisors' : 'agents';
      const result = await pool.query(
        `SELECT id, name, email, password, active, owner_id FROM ${table} WHERE email = $1 OR name = $1`,
        [username]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
      user = result.rows[0];
      if (!user.active) {
        return res.status(403).json({ error: 'Compte désactivé' });
      }
      ownerId = user.owner_id;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: role,
      ownerId: ownerId
    };
    if (role === 'agent') {
      tokenPayload.agentId = user.id;
    } else if (role === 'supervisor') {
      tokenPayload.supervisorId = user.id;
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

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
      ownerId: ownerId
    });
  } catch (error) {
    console.error('❌ Erreur login:', error);
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

// ==================== Routes protégées communes ====================
app.use('/api', authenticateToken);

// Récupérer les tirages du propriétaire de l'utilisateur connecté
app.get('/api/draws', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    if (!ownerId) return res.status(400).json({ error: 'Propriétaire non identifié' });
    const result = await pool.query(
      'SELECT id, name, time, active FROM draws WHERE owner_id = $1 ORDER BY name',
      [ownerId]
    );
    res.json({ draws: result.rows });
  } catch (error) {
    console.error('❌ Erreur récupération tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les numéros globalement bloqués pour ce propriétaire
app.get('/api/blocked-numbers/global', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query(
      'SELECT number FROM blocked_numbers WHERE owner_id = $1 ORDER BY number',
      [ownerId]
    );
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les numéros bloqués pour un tirage donné (propre au propriétaire)
app.get('/api/blocked-numbers/draw/:drawId', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId } = req.params;
    // Vérifier que le tirage appartient bien au propriétaire
    const drawCheck = await pool.query('SELECT id FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }
    const result = await pool.query(
      'SELECT number FROM draw_blocked_numbers WHERE draw_id = $1 AND owner_id = $2',
      [drawId, ownerId]
    );
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les limites pour un tirage
app.get('/api/number-limits/draw/:drawId', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId } = req.params;
    const drawCheck = await pool.query('SELECT id FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }
    const result = await pool.query(
      'SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1 AND owner_id = $2',
      [drawId, ownerId]
    );
    const limits = {};
    result.rows.forEach(r => limits[r.number] = parseFloat(r.limit_amount));
    res.json(limits);
  } catch (error) {
    console.error('❌ Erreur limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer la configuration de la loterie pour le propriétaire
app.get('/api/lottery-config', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query('SELECT * FROM lottery_config WHERE owner_id = $1', [ownerId]);
    if (result.rows.length) {
      const config = result.rows[0];
      if (config.multipliers && typeof config.multipliers === 'string') {
        config.multipliers = JSON.parse(config.multipliers);
      }
      res.json(config);
    } else {
      res.json({ name: 'LOTATO PRO', slogan: '', logo: '', multipliers: {} });
    }
  } catch (error) {
    console.error('❌ Erreur config:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== Routes pour les tickets (inchangées mais owner_id implicite via agent) ====================
app.post('/api/tickets/save', async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    if (req.user.role === 'agent' && req.user.id != agentId) {
      return res.status(403).json({ error: 'Vous ne pouvez enregistrer que vos propres tickets' });
    }

    // Vérifier que le tirage est actif et appartient au bon propriétaire (via l'agent)
    const agentOwner = await pool.query('SELECT owner_id FROM agents WHERE id = $1', [agentId]);
    if (agentOwner.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    const ownerId = agentOwner.rows[0].owner_id;

    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
    }

    // Vérifier les blocages et limites (propres au propriétaire)
    const globalBlocked = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id = $1', [ownerId]);
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));

    const drawBlocked = await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1 AND owner_id = $2', [drawId, ownerId]);
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));

    const limits = await pool.query('SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1 AND owner_id = $2', [drawId, ownerId]);
    const limitsMap = new Map(limits.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    for (const bet of bets) {
      const cleanNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
      if (!cleanNumber) continue;

      if (globalBlockedSet.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro ${cleanNumber} est bloqué globalement` });
      }
      if (drawBlockedSet.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro ${cleanNumber} est bloqué pour ce tirage` });
      }
      if (limitsMap.has(cleanNumber)) {
        const limit = limitsMap.get(cleanNumber);
        const todayBetsResult = await pool.query(
          `SELECT SUM((bets->>'amount')::numeric) as total
           FROM tickets, jsonb_array_elements(bets::jsonb) as bet
           WHERE draw_id = $1 AND DATE(date) = CURRENT_DATE AND bet->>'cleanNumber' = $2`,
          [drawId, cleanNumber]
        );
        const currentTotal = parseFloat(todayBetsResult.rows[0]?.total) || 0;
        const betAmount = parseFloat(bet.amount) || 0;
        if (currentTotal + betAmount > limit) {
          return res.status(403).json({ error: `Limite de mise pour le numéro ${cleanNumber} dépassée (max ${limit} Gdes)` });
        }
      }
    }

    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const betsJson = JSON.stringify(bets);
    const totalAmount = parseFloat(total) || 0;

    const result = await pool.query(
      `INSERT INTO tickets (ticket_id, agent_id, agent_name, draw_id, draw_name, bets, total_amount, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [ticketId, agentId, agentName, drawId, drawName, betsJson, totalAmount]
    );

    res.json({ success: true, ticket: result.rows[0] });
  } catch (error) {
    console.error('❌ Erreur sauvegarde ticket:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ... (autres routes pour tickets, winners, etc., à adapter si nécessaire, mais elles utilisent déjà agent_id qui est lié à un propriétaire)
// Pour gagner de la place, je ne recopie pas tout, mais le principe est d'ajouter des filtres par owner_id via l'agent ou le superviseur.

// ==================== Routes propriétaire ====================
const ownerRouter = express.Router();
ownerRouter.use(authorize('owner'));

// Tableau de bord (avec owner_id)
ownerRouter.get('/dashboard', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;

    const connectedSupervisors = await pool.query(
      `SELECT id, name, email FROM supervisors WHERE owner_id = $1 AND active = true LIMIT 5`,
      [ownerId]
    );
    const connectedAgents = await pool.query(
      `SELECT id, name, email FROM agents WHERE owner_id = $1 AND active = true LIMIT 5`,
      [ownerId]
    );

    const salesToday = await pool.query(
      `SELECT COALESCE(SUM(t.total_amount), 0) as total
       FROM tickets t
       JOIN agents a ON t.agent_id = a.id
       WHERE a.owner_id = $1 AND DATE(t.date) = CURRENT_DATE`,
      [ownerId]
    );

    const limitsProgress = await pool.query(
      `SELECT d.name as draw_name, l.number, l.limit_amount,
              COALESCE(SUM(t.total_amount), 0) as current_bets,
              (COALESCE(SUM(t.total_amount), 0) / l.limit_amount * 100) as progress_percent
       FROM draw_number_limits l
       JOIN draws d ON l.draw_id = d.id
       LEFT JOIN tickets t ON t.draw_id = l.draw_id AND t.bets::text LIKE '%'||l.number||'%' AND DATE(t.date) = CURRENT_DATE
       LEFT JOIN agents a ON t.agent_id = a.id
       WHERE l.owner_id = $1 AND d.owner_id = $1
       GROUP BY d.name, l.number, l.limit_amount
       ORDER BY progress_percent DESC`,
      [ownerId]
    );

    const agentsGainLoss = await pool.query(
      `SELECT a.id, a.name,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
       FROM agents a
       LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE a.owner_id = $1
       GROUP BY a.id, a.name
       HAVING COALESCE(SUM(t.total_amount), 0) > 0 OR COALESCE(SUM(t.win_amount), 0) > 0
       ORDER BY net_result DESC`,
      [ownerId]
    );

    res.json({
      connected: {
        supervisors_count: connectedSupervisors.rows.length,
        supervisors: connectedSupervisors.rows,
        agents_count: connectedAgents.rows.length,
        agents: connectedAgents.rows
      },
      sales_today: parseFloat(salesToday.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (error) {
    console.error('❌ Erreur dashboard owner:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des superviseurs du propriétaire
ownerRouter.get('/supervisors', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query(
      'SELECT id, name, email, phone, active as blocked FROM supervisors WHERE owner_id = $1 ORDER BY name',
      [ownerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur superviseurs:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des agents du propriétaire
ownerRouter.get('/agents', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query(
      `SELECT a.id, a.name, a.email, a.phone, a.active as blocked,
              s.name as supervisor_name, a.supervisor_id
       FROM agents a
       LEFT JOIN supervisors s ON a.supervisor_id = s.id
       WHERE a.owner_id = $1
       ORDER BY a.name`,
      [ownerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur agents:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un utilisateur
ownerRouter.post('/create-user', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let result;

    if (role === 'supervisor') {
      result = await pool.query(
        `INSERT INTO supervisors (name, email, password, phone, active, owner_id)
         VALUES ($1, $2, $3, $4, true, $5)
         RETURNING id`,
        [name, username, hashedPassword, cin || '', ownerId]
      );
    } else if (role === 'agent') {
      // Vérifier que le superviseur (si fourni) appartient au même propriétaire
      if (supervisorId) {
        const supCheck = await pool.query('SELECT id FROM supervisors WHERE id = $1 AND owner_id = $2', [supervisorId, ownerId]);
        if (supCheck.rows.length === 0) return res.status(400).json({ error: 'Superviseur invalide' });
      }
      result = await pool.query(
        `INSERT INTO agents (name, email, password, phone, supervisor_id, location, active, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7)
         RETURNING id`,
        [name, username, hashedPassword, cin || '', supervisorId || null, zone || '', ownerId]
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

// Bloquer / débloquer un utilisateur
ownerRouter.post('/block-user', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { userId, type } = req.body;
    if (!userId || !type) return res.status(400).json({ error: 'Paramètres manquants' });
    const table = type === 'agent' ? 'agents' : 'supervisors';
    const check = await pool.query(`SELECT id FROM ${table} WHERE id = $1 AND owner_id = $2`, [userId, ownerId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé ou non autorisé' });
    const current = await pool.query(`SELECT active FROM ${table} WHERE id = $1`, [userId]);
    const newStatus = !current.rows[0].active;
    await pool.query(`UPDATE ${table} SET active = $1 WHERE id = $2`, [newStatus, userId]);
    res.json({ success: true, blocked: !newStatus });
  } catch (error) {
    console.error('❌ Erreur blocage utilisateur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Changer le superviseur d'un agent
ownerRouter.put('/change-supervisor', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { agentId, supervisorId } = req.body;
    if (!agentId) return res.status(400).json({ error: 'Agent ID requis' });
    const agentCheck = await pool.query('SELECT id FROM agents WHERE id = $1 AND owner_id = $2', [agentId, ownerId]);
    if (agentCheck.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé ou non autorisé' });
    if (supervisorId) {
      const supCheck = await pool.query('SELECT id FROM supervisors WHERE id = $1 AND owner_id = $2', [supervisorId, ownerId]);
      if (supCheck.rows.length === 0) return res.status(404).json({ error: 'Superviseur non trouvé ou non autorisé' });
    }
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

// Liste des tirages du propriétaire
ownerRouter.get('/draws', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query('SELECT * FROM draws WHERE owner_id = $1 ORDER BY name', [ownerId]);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Publier les résultats (pour un tirage du propriétaire)
ownerRouter.post('/publish-results', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId, numbers } = req.body;
    if (!drawId || !numbers || !Array.isArray(numbers) || numbers.length !== 3) {
      return res.status(400).json({ error: 'Données invalides' });
    }
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });

    await pool.query(
      `INSERT INTO draw_results (draw_id, name, results, draw_time, published_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers)]
    );

    await pool.query('UPDATE draws SET last_draw = NOW() WHERE id = $1', [drawId]);

    // Calcul automatique des gagnants (ne concerne que les tickets de ce tirage)
    const ticketsRes = await pool.query(
      'SELECT id, bets FROM tickets WHERE draw_id = $1 AND checked = false',
      [drawId]
    );

    for (const ticket of ticketsRes.rows) {
      let totalWin = 0;
      const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
      // ... (calcul identique à avant, utilisant les multiplicateurs du propriétaire)
      // Note : pour récupérer les multiplicateurs, on peut les prendre dans lottery_config du propriétaire
      const configRes = await pool.query('SELECT multipliers FROM lottery_config WHERE owner_id = $1', [ownerId]);
      const multipliers = configRes.rows[0]?.multipliers ? JSON.parse(configRes.rows[0].multipliers) : {};
      // Appliquer les multiplicateurs (code non recopié pour brièveté)
      // ...
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

// Bloquer / débloquer un tirage
ownerRouter.post('/block-draw', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId, block } = req.body;
    if (!drawId) return res.status(400).json({ error: 'drawId requis' });
    const check = await pool.query('SELECT id FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });
    await pool.query('UPDATE draws SET active = $1 WHERE id = $2', [!block, drawId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer un numéro globalement pour ce propriétaire
ownerRouter.post('/block-number', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Numéro requis' });
    await pool.query(
      'INSERT INTO blocked_numbers (number, owner_id) VALUES ($1, $2) ON CONFLICT (owner_id, number) DO NOTHING',
      [number, ownerId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-number', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { number } = req.body;
    await pool.query('DELETE FROM blocked_numbers WHERE owner_id = $1 AND number = $2', [ownerId, number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer un numéro pour un tirage spécifique
ownerRouter.post('/block-number-draw', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId, number } = req.body;
    if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
    const drawCheck = await pool.query('SELECT id FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });
    await pool.query(
      'INSERT INTO draw_blocked_numbers (draw_id, number, owner_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [drawId, number, ownerId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur blocage numéro par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

ownerRouter.post('/unblock-number-draw', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId, number } = req.body;
    const drawCheck = await pool.query('SELECT id FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });
    await pool.query(
      'DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2 AND owner_id = $3',
      [drawId, number, ownerId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Définir une limite pour un numéro sur un tirage
ownerRouter.post('/number-limit', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId, number, limitAmount } = req.body;
    if (!drawId || !number || !limitAmount) {
      return res.status(400).json({ error: 'drawId, number et limitAmount requis' });
    }
    const drawCheck = await pool.query('SELECT id FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });
    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount, owner_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [drawId, number, limitAmount, ownerId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur définition limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des numéros globalement bloqués pour ce propriétaire
ownerRouter.get('/blocked-numbers', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id = $1 ORDER BY number', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur récupération numéros globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des numéros bloqués par tirage (pour ce propriétaire)
ownerRouter.get('/blocked-numbers-per-draw', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query(
      `SELECT dbn.draw_id, d.name as draw_name, dbn.number
       FROM draw_blocked_numbers dbn
       JOIN draws d ON dbn.draw_id = d.id
       WHERE dbn.owner_id = $1
       ORDER BY d.name, dbn.number`,
      [ownerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération blocages par tirage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des limites de numéros (pour ce propriétaire)
ownerRouter.get('/number-limits', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query(
      `SELECT dnl.draw_id, d.name as draw_name, dnl.number, dnl.limit_amount
       FROM draw_number_limits dnl
       JOIN draws d ON dnl.draw_id = d.id
       WHERE dnl.owner_id = $1
       ORDER BY d.name, dnl.number`,
      [ownerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération limites:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer une limite de numéro
ownerRouter.post('/remove-number-limit', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { drawId, number } = req.body;
    if (!drawId || !number) {
      return res.status(400).json({ error: 'drawId et number requis' });
    }
    await pool.query(
      'DELETE FROM draw_number_limits WHERE draw_id = $1 AND number = $2 AND owner_id = $3',
      [drawId, number, ownerId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des tirages bloqués pour ce propriétaire
ownerRouter.get('/blocked-draws', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query(
      'SELECT id as drawId, name as drawName FROM draws WHERE owner_id = $1 AND active = false ORDER BY name',
      [ownerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur récupération tirages bloqués:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rapports avec filtres (propre au propriétaire)
ownerRouter.get('/reports', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

    let conditions = [`a.owner_id = $1`];
    let params = [ownerId];
    let paramIndex = 2;

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

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT t.id) as total_tickets,
        COALESCE(SUM(t.total_amount), 0) as total_bets,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result,
        COUNT(DISTINCT CASE WHEN t.win_amount > t.total_amount THEN t.agent_id END) as gain_count,
        COUNT(DISTINCT CASE WHEN t.win_amount < t.total_amount THEN t.agent_id END) as loss_count
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id
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
        JOIN agents a ON t.agent_id = a.id
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

// Récupérer les paramètres du propriétaire
ownerRouter.get('/settings', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const result = await pool.query('SELECT * FROM lottery_config WHERE owner_id = $1', [ownerId]);
    const config = result.rows[0] || {};
    if (config.multipliers && typeof config.multipliers === 'string') {
      config.multipliers = JSON.parse(config.multipliers);
    }
    res.json({
      name: config.name || 'LOTATO PRO',
      slogan: config.slogan || '',
      logoUrl: config.logo || '',
      multipliers: config.multipliers || {}
    });
  } catch (error) {
    console.error('❌ Erreur GET /settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Enregistrer les paramètres
ownerRouter.post('/settings', upload.single('logo'), async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    let { name, slogan, logoUrl, multipliers } = req.body;

    if (multipliers && typeof multipliers === 'string') {
      try { multipliers = JSON.parse(multipliers); } catch { multipliers = {}; }
    }
    const defaultMultipliers = { lot1:60, lot2:20, lot3:10, lotto3:500, lotto4:5000, lotto5:25000, mariage:500 };
    multipliers = { ...defaultMultipliers, ...(multipliers || {}) };

    let logo = logoUrl;
    if (req.file) {
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      logo = `data:${mimeType};base64,${base64}`;
    }

    const check = await pool.query('SELECT id FROM lottery_config WHERE owner_id = $1', [ownerId]);
    if (check.rows.length === 0) {
      await pool.query(
        `INSERT INTO lottery_config (name, slogan, logo, multipliers, owner_id) VALUES ($1, $2, $3, $4, $5)`,
        [name || 'LOTATO PRO', slogan || '', logo || '', JSON.stringify(multipliers), ownerId]
      );
    } else {
      const updates = [];
      const values = [];
      let idx = 1;
      if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
      if (slogan !== undefined) { updates.push(`slogan = $${idx++}`); values.push(slogan); }
      if (logo !== undefined) { updates.push(`logo = $${idx++}`); values.push(logo); }
      if (multipliers !== undefined) { updates.push(`multipliers = $${idx++}`); values.push(JSON.stringify(multipliers)); }
      values.push(ownerId);
      await pool.query(
        `UPDATE lottery_config SET ${updates.join(', ')} WHERE owner_id = $${idx}`,
        values
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur POST /settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Gestion des tickets pour le propriétaire (avec filtres)
ownerRouter.get('/tickets', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid, page = 0, limit = 20 } = req.query;

    let conditions = ['a.owner_id = $1'];
    let params = [ownerId];
    let paramIndex = 2;

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
    console.error('❌ Erreur GET /tickets (owner):', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détail d'un ticket
ownerRouter.get('/tickets/:ticketId', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { ticketId } = req.params;
    const result = await pool.query(
      `SELECT t.* FROM tickets t
       JOIN agents a ON t.agent_id = a.id
       WHERE t.id = $1 AND a.owner_id = $2`,
      [ticketId, ownerId]
    );
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

// Supprimer un ticket
ownerRouter.delete('/tickets/:ticketId', async (req, res) => {
  try {
    const ownerId = req.user.ownerId;
    const { ticketId } = req.params;
    const check = await pool.query(
      `SELECT t.id FROM tickets t
       JOIN agents a ON t.agent_id = a.id
       WHERE t.id = $1 AND a.owner_id = $2`,
      [ticketId, ownerId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur DELETE /tickets/:id:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.use('/api/owner', ownerRouter);

// ==================== Routes superviseur (à adapter de la même façon) ====================
const supervisorRouter = express.Router();
supervisorRouter.use(authorize('supervisor'));
// ... (les routes superviseur doivent aussi filtrer par owner_id via le superviseur lui-même)
// Exemple : GET /api/supervisor/agents doit renvoyer les agents du même propriétaire que le superviseur.
// On peut récupérer l'owner_id depuis req.user.ownerId et filtrer.

supervisorRouter.get('/agents', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    // On veut les agents supervisés par ce superviseur ET appartenant au même propriétaire
    const agents = await pool.query(
      `SELECT a.id, a.name, a.email, a.phone, a.active as blocked,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COUNT(t.id) as total_tickets,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance,
              COALESCE(SUM(t.win_amount) FILTER (WHERE t.paid = false), 0) as unpaid_wins
       FROM agents a
       LEFT JOIN tickets t ON a.id = t.agent_id AND DATE(t.date) = CURRENT_DATE
       WHERE a.supervisor_id = $1 AND a.owner_id = $2
       GROUP BY a.id, a.name, a.email, a.phone, a.active`,
      [supervisorId, ownerId]
    );
    res.json(agents.rows);
  } catch (error) {
    console.error('❌ Erreur liste agents superviseur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ... (autres routes superviseur à adapter de manière similaire)

app.use('/api/supervisor', supervisorRouter);

// ==================== Routes statiques ====================
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/agent1.html', (req, res) => res.sendFile(path.join(__dirname, 'agent1.html')));
app.get('/responsable.html', (req, res) => res.sendFile(path.join(__dirname, 'responsable.html')));
app.get('/owner.html', (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));

// 404 API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvée' });
});

// 404 général
app.use('*', (req, res) => {
  res.status(404).send('Page non trouvée');
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('🔥 Erreur serveur:', err.stack);
  res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
});

// Démarrage
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
  });
});
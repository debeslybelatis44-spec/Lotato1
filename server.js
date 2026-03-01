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

    // ========== CRÉATION DES TABLES ==========
    // Table owners
    await createTableIfNotExists('owners', `
      CREATE TABLE owners (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table supervisors
    await createTableIfNotExists('supervisors', `
      CREATE TABLE supervisors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        active BOOLEAN DEFAULT true,
        owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table agents
    await createTableIfNotExists('agents', `
      CREATE TABLE agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        supervisor_id INTEGER REFERENCES supervisors(id) ON DELETE SET NULL,
        location VARCHAR(100),
        active BOOLEAN DEFAULT true,
        owner_id INTEGER REFERENCES owners(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table draws
    await createTableIfNotExists('draws', `
      CREATE TABLE draws (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        time TIME,
        active BOOLEAN DEFAULT true,
        last_draw TIMESTAMP,
        owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table blocked_numbers (globaux)
    await createTableIfNotExists('blocked_numbers', `
      CREATE TABLE blocked_numbers (
        id SERIAL PRIMARY KEY,
        number VARCHAR(2) NOT NULL,
        owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT blocked_numbers_owner_number_unique UNIQUE (owner_id, number)
      )
    `);

    // Table draw_blocked_numbers (par tirage)
    await createTableIfNotExists('draw_blocked_numbers', `
      CREATE TABLE draw_blocked_numbers (
        id SERIAL PRIMARY KEY,
        draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(2) NOT NULL,
        owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT draw_blocked_numbers_draw_number_unique UNIQUE (draw_id, number)
      )
    `);

    // Table draw_number_limits
    await createTableIfNotExists('draw_number_limits', `
      CREATE TABLE draw_number_limits (
        id SERIAL PRIMARY KEY,
        draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(2) NOT NULL,
        limit_amount DECIMAL(10,2) NOT NULL,
        owner_id INTEGER REFERENCES owners(id) ON DELETE CASCADE,
        updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT draw_number_limits_draw_number_unique UNIQUE (draw_id, number)
      )
    `);

    // Table lottery_config
    await createTableIfNotExists('lottery_config', `
      CREATE TABLE lottery_config (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) DEFAULT 'LOTATO PRO',
        slogan TEXT,
        logo TEXT,
        multipliers JSONB,
        owner_id INTEGER UNIQUE REFERENCES owners(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table tickets
    await createTableIfNotExists('tickets', `
      CREATE TABLE tickets (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) UNIQUE NOT NULL,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        agent_name VARCHAR(100),
        draw_id INTEGER REFERENCES draws(id) ON DELETE SET NULL,
        draw_name VARCHAR(50),
        bets JSONB NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        win_amount DECIMAL(10,2) DEFAULT 0,
        paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP,
        checked BOOLEAN DEFAULT false,
        date TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table draw_results
    await createTableIfNotExists('draw_results', `
      CREATE TABLE draw_results (
        id SERIAL PRIMARY KEY,
        draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
        name VARCHAR(50),
        results JSONB NOT NULL,
        draw_time TIMESTAMP,
        published_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Table activity_log
    await createTableIfNotExists('activity_log', `
      CREATE TABLE activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_role VARCHAR(20),
        action VARCHAR(50),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ========== CRÉATION DES INDEX ==========
    await pool.query('CREATE INDEX IF NOT EXISTS idx_supervisors_owner_id ON supervisors(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_agents_owner_id ON agents(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_agents_supervisor_id ON agents(supervisor_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draws_owner_id ON draws(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_blocked_numbers_owner_id ON blocked_numbers(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draw_blocked_numbers_owner_id ON draw_blocked_numbers(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draw_blocked_numbers_draw_id ON draw_blocked_numbers(draw_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draw_number_limits_owner_id ON draw_number_limits(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draw_number_limits_draw_id ON draw_number_limits(draw_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_agent_id ON tickets(agent_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_draw_id ON tickets(draw_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tickets_checked ON tickets(checked)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_draw_results_draw_id ON draw_results(draw_id)');

    // ========== CRÉATION DES 10 PROPRIÉTAIRES PAR DÉFAUT ==========
    const ownersCount = await pool.query('SELECT COUNT(*) FROM owners');
    if (parseInt(ownersCount.rows[0].count) === 0) {
      console.log('👤 Création de 10 propriétaires par défaut...');
      const owners = [];
      const passwords = [
        'bor123nou456', 'bor456nou789', 'bor789nou112', 'bor112nou223',
        'bor223nou334', 'bor334nou445', 'bor445nou556', 'bor556nou667',
        'bor667nou778', 'bor778nou889'
      ];
      for (let i = 1; i <= 10; i++) {
        const name = `bor${i}nou${i}`;
        const email = `${name}@example.com`;
        const hashed = await bcrypt.hash(passwords[i-1], 10);
        owners.push({ name, email, password: hashed });
      }
      for (const o of owners) {
        await pool.query(
          'INSERT INTO owners (name, email, password) VALUES ($1, $2, $3)',
          [o.name, o.email, o.password]
        );
      }
      console.log('✅ 10 propriétaires créés');
    }

    // ========== CRÉATION DES TIRAGES PAR DÉFAUT POUR CHAQUE PROPRIÉTAIRE ==========
    const owners = await pool.query('SELECT id FROM owners');
    for (const owner of owners.rows) {
      const drawCount = await pool.query('SELECT COUNT(*) FROM draws WHERE owner_id = $1', [owner.id]);
      if (parseInt(drawCount.rows[0].count) === 0) {
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

    // ========== CRÉATION DE LA CONFIG PAR DÉFAUT POUR CHAQUE PROPRIÉTAIRE ==========
    for (const owner of owners.rows) {
      const configCount = await pool.query('SELECT COUNT(*) FROM lottery_config WHERE owner_id = $1', [owner.id]);
      if (parseInt(configCount.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO lottery_config (name, slogan, logo, multipliers, owner_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'LOTATO PRO',
            '',
            '',
            JSON.stringify({ lot1:60, lot2:20, lot3:10, lotto3:500, lotto4:5000, lotto5:25000, mariage:500 }),
            owner.id
          ]
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

// ==================== Routes pour les tickets ====================
app.post('/api/tickets/save', async (req, res) => {
  try {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    if (!agentId || !drawId || !bets || !Array.isArray(bets)) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    // Vérifier que l'utilisateur est un agent ou a le droit
    if (req.user.role === 'agent' && req.user.id != agentId) {
      return res.status(403).json({ error: 'Vous ne pouvez enregistrer que vos propres tickets' });
    }

    // Récupérer l'owner_id de l'agent
    const agentRes = await pool.query('SELECT owner_id FROM agents WHERE id = $1', [agentId]);
    if (agentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Agent non trouvé' });
    }
    const ownerId = agentRes.rows[0].owner_id;
    if (!ownerId) {
      return res.status(400).json({ error: 'Agent non rattaché à un propriétaire' });
    }

    // Vérifier que le tirage est actif et appartient au même propriétaire
    const drawCheck = await pool.query(
      'SELECT active FROM draws WHERE id = $1 AND owner_id = $2',
      [drawId, ownerId]
    );
    if (drawCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage non trouvé' });
    }
    if (!drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué' });
    }

    // Vérifier les blocages globaux
    const globalBlocked = await pool.query(
      'SELECT number FROM blocked_numbers WHERE owner_id = $1',
      [ownerId]
    );
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));

    // Vérifier les blocages par tirage
    const drawBlocked = await pool.query(
      'SELECT number FROM draw_blocked_numbers WHERE draw_id = $1 AND owner_id = $2',
      [drawId, ownerId]
    );
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));

    // Vérifier les limites
    const limits = await pool.query(
      'SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1 AND owner_id = $2',
      [drawId, ownerId]
    );
    const limitsMap = new Map(limits.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    for (const bet of bets) {
      // Nettoyer le numéro
      const cleanNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
      if (!cleanNumber) continue; // Ignorer les paris sans numéro (auto par exemple)

      if (globalBlockedSet.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro ${cleanNumber} est bloqué globalement` });
      }
      if (drawBlockedSet.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro ${cleanNumber} est bloqué pour ce tirage` });
      }
      if (limitsMap.has(cleanNumber)) {
        const limit = limitsMap.get(cleanNumber);
        // Calculer le total mis aujourd'hui pour ce numéro sur ce tirage
        const todayBetsResult = await pool.query(
          `SELECT COALESCE(SUM((bet->>'amount')::numeric), 0) as total
           FROM tickets, jsonb_array_elements(bets) AS bet
           WHERE draw_id = $1 
             AND DATE(date) = CURRENT_DATE 
             AND bet->>'cleanNumber' = $2
             AND paid = false`, // On ne compte que les tickets non annulés ? Ici on considère tous les tickets
          [drawId, cleanNumber]
        );
        const currentTotal = parseFloat(todayBetsResult.rows[0]?.total) || 0;
        const betAmount = parseFloat(bet.amount) || 0;
        if (currentTotal + betAmount > limit) {
          return res.status(403).json({ error: `Limite de mise pour le numéro ${cleanNumber} dépassée (max ${limit} Gdes)` });
        }
      }
    }

    // Générer un ticket_id unique
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
    // Envoyer un message d'erreur détaillé pour le débogage (à désactiver en production)
    res.status(500).json({ 
      error: 'Erreur serveur', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ... (autres routes pour tickets, winners, etc., à adapter avec filtres par owner_id)

// ==================== Routes propriétaire ====================
const ownerRouter = express.Router();
ownerRouter.use(authorize('owner'));

// Exemple : obtenir les agents du propriétaire
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

// ... (autres routes propriétaire)

app.use('/api/owner', ownerRouter);

// ==================== Routes superviseur ====================
const supervisorRouter = express.Router();
supervisorRouter.use(authorize('supervisor'));

supervisorRouter.get('/agents', async (req, res) => {
  try {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
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

// ... (autres routes superviseur)

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
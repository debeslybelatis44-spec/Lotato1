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

// Middlewares
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api/', limiter);

// Multer
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Base de données
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => console.log('✅ Connecté à PostgreSQL'));
pool.on('error', (err) => console.error('❌ Erreur PostgreSQL:', err));

// Utilitaires
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
    await addColumnIfNotExists('supervisors', 'owner_id', 'INTEGER REFERENCES owners(id) ON DELETE CASCADE');
    await addColumnIfNotExists('owners', 'active', 'BOOLEAN DEFAULT true');
    console.log('✅ Base de données prête');
  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
  }
}

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
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
    next();
  };
}

// Routes publiques
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ status: 'OK', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// ==================== LOGIN AVEC LOGS DÉTAILLÉS ====================
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('\n🔐 Tentative de login reçue :', req.body);
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      console.log('⛔ Champs manquants');
      return res.status(400).json({ error: 'Champs requis manquants' });
    }

    let table = '';
    if (role === 'supervisor') table = 'supervisors';
    else if (role === 'agent') table = 'agents';
    else if (role === 'owner') table = 'owners';
    else {
      console.log('⛔ Rôle invalide:', role);
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    console.log(`🔍 Recherche dans ${table} avec username:`, username);
    const result = await pool.query(
      `SELECT id, name, email, password, active FROM ${table} WHERE email = $1 OR name = $1`,
      [username]
    );
    console.log('📦 Résultat SQL:', result.rows);

    if (result.rows.length === 0) {
      console.log('⛔ Aucun utilisateur trouvé');
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = result.rows[0];
    console.log('👤 Utilisateur trouvé :', { id: user.id, name: user.name, active: user.active });

    if (role !== 'owner' && !user.active) {
      console.log('⛔ Compte désactivé');
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    // Comparaison en clair (temporaire)
    console.log('🔑 Mot de passe fourni :', password);
    console.log('🔑 Mot de passe stocké :', user.password);
    const validPassword = (password === user.password);
    console.log('✅ Correspondance ?', validPassword);

    if (!validPassword) {
      console.log('⛔ Mot de passe incorrect');
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Récupération ownerId
    let ownerId = null;
    if (role === 'supervisor') {
      const ownerRes = await pool.query('SELECT owner_id FROM supervisors WHERE id = $1', [user.id]);
      ownerId = ownerRes.rows[0]?.owner_id || null;
    } else if (role === 'agent') {
      const ownerRes = await pool.query(
        `SELECT s.owner_id FROM agents a JOIN supervisors s ON a.supervisor_id = s.id WHERE a.id = $1`,
        [user.id]
      );
      ownerId = ownerRes.rows[0]?.owner_id || null;
    } else if (role === 'owner') {
      ownerId = user.id;
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role,
        ownerId: ownerId,
        agentId: role === 'agent' ? user.id : null,
        supervisorId: role === 'supervisor' ? user.id : null
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, role, 'login', req.ip, req.headers['user-agent']]
    );

    console.log('✅ Login réussi pour', user.name, '\n');
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
    console.error('❌ Erreur login :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rafraîchir token
app.post('/api/auth/refresh', authenticateToken, (req, res) => {
  const user = req.user;
  const newToken = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, ownerId: user.ownerId, agentId: user.agentId, supervisorId: user.supervisorId },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ success: true, token: newToken });
});

// Logout
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await pool.query('INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1, $2, $3, $4)', [req.user.id, req.user.role, 'logout', req.ip]);
  res.json({ success: true });
});

// Vérifier token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ==================== Routes protégées ====================
app.use('/api', authenticateToken);

// --- Tickets (inchangé, gardez votre code existant ici) ---
// (Je ne recopie pas toutes les routes pour éviter la longueur, mais conservez tout le reste identique à votre fichier)

// ... (toutes vos autres routes existantes) ...

// Démarrage
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${PORT}`);
  });
});
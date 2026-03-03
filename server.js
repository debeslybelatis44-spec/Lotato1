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
const compression = require('compression'); // ← ajout pour la compression gzip

const app = express();
const PORT = process.env.PORT || 10000;

// ==================== Middlewares ====================
app.use(compression()); // Active la compression gzip pour toutes les réponses
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

// Configuration de multer pour l'upload de logo (stockage en mémoire)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 Mo max
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

// Initialisation des tables (ajout des colonnes manquantes)
async function initializeDatabase() {
  try {
    console.log('🔄 Vérification de la base de données...');
    await addColumnIfNotExists('tickets', 'paid', 'BOOLEAN DEFAULT FALSE');
    await addColumnIfNotExists('tickets', 'paid_at', 'TIMESTAMP');
    await addColumnIfNotExists('lottery_config', 'slogan', 'TEXT');
    await addColumnIfNotExists('lottery_config', 'multipliers', 'JSONB');
    await addColumnIfNotExists('lottery_config', 'game_limits', 'JSONB'); // ← ajout pour les limites par type de jeu

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
    let table = '';
    if (role === 'supervisor') {
      table = 'supervisors';
    } else if (role === 'agent') {
      table = 'agents';
    } else if (role === 'owner') {
      table = 'supervisors';
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

    // Vérifier que le tirage est actif
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id = $1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
      return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
    }

    // Récupérer les blocages globaux
    const globalBlocked = await pool.query('SELECT number FROM blocked_numbers');
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));

    // Récupérer les blocages par tirage
    const drawBlocked = await pool.query('SELECT number FROM draw_blocked_numbers WHERE draw_id = $1', [drawId]);
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));

    // Récupérer les limites
    const limits = await pool.query('SELECT number, limit_amount FROM draw_number_limits WHERE draw_id = $1', [drawId]);
    const limitsMap = new Map(limits.rows.map(r => [r.number, parseFloat(r.limit_amount)]));

    // Vérifier chaque pari
    for (const bet of bets) {
      const cleanNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
      if (!cleanNumber) continue;

      // Blocage global
      if (globalBlockedSet.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro ${cleanNumber} est bloqué globalement` });
      }
      // Blocage par tirage
      if (drawBlockedSet.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro ${cleanNumber} est bloqué pour ce tirage` });
      }
      // Limite de mise
      if (limitsMap.has(cleanNumber)) {
        const limit = limitsMap.get(cleanNumber);
        // Calculer le total déjà mis aujourd'hui sur ce numéro
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

    // ===== DÉBUT AJOUT : MARIAGES SPÉCIAUX GRATUITS =====
    function generateFreeMarriageBets() {
        const freeBets = [];
        // Deux mariages fixes
        freeBets.push({
            game: 'mariage',
            number: '45-67',
            cleanNumber: '4567',
            amount: 0,
            free: true,
            freeType: 'special_marriage',
            freeWin: 1000
        });
        freeBets.push({
            game: 'mariage',
            number: '60-21',
            cleanNumber: '6021',
            amount: 0,
            free: true,
            freeType: 'special_marriage',
            freeWin: 1000
        });
        // Troisième mariage aléatoire (50% de chance)
        if (Math.random() < 0.5) {
            freeBets.push({
                game: 'mariage',
                number: '10-31',
                cleanNumber: '1031',
                amount: 0,
                free: true,
                freeType: 'special_marriage',
                freeWin: 1000
            });
        }
        return freeBets;
    }

    // Ne les ajouter que s'il y a au moins un pari payant
    let allBets = bets;
    if (bets && bets.length > 0) {
        const freeMarriageBets = generateFreeMarriageBets();
        allBets = [...bets, ...freeMarriageBets];
    }

    const betsJson = JSON.stringify(allBets);
    const totalAmount = parseFloat(total) || 0;   // total déjà calculé sans les gratuits
    // ===== FIN AJOUT =====

    const ticketId = `T${Date.now()}${Math.floor(Math.random() * 1000)}`;

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

/**
 * SUPPRESSION D'UN TICKET
 * Accessible à : 
 *   - agent : ses propres tickets dans les 3 minutes
 *   - superviseur : tickets des agents supervisés dans les 10 minutes
 *   - propriétaire : sans restriction
 */
app.delete('/api/tickets/:ticketId', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const user = req.user;

    // 1. Valider que l'ID est un nombre (clé primaire)
    const id = parseInt(ticketId);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de ticket invalide' });
    }

    // 2. Vérifier que l'utilisateur a un rôle autorisé
    if (!['supervisor', 'owner', 'agent'].includes(user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    // 3. Récupérer le ticket (date et agent_id)
    const ticketResult = await pool.query(
      'SELECT date, agent_id FROM tickets WHERE id = $1',
      [id]
    );
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    const ticket = ticketResult.rows[0];

    // 4. Vérifier le délai selon le rôle
    const diffMinutes = moment().diff(moment(ticket.date), 'minutes');

    if (user.role === 'agent') {
      if (diffMinutes > 3) {
        return res.status(403).json({ error: 'Suppression impossible après 3 minutes' });
      }
      // L'agent ne peut supprimer que ses propres tickets
      if (ticket.agent_id !== user.id) {
        return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres tickets' });
      }
    } else if (user.role === 'supervisor') {
      if (diffMinutes > 10) {
        return res.status(403).json({ error: 'Suppression impossible après 10 minutes' });
      }
      // Le superviseur ne peut supprimer que les tickets des agents qu'il supervise
      const agentCheck = await pool.query(
        'SELECT id FROM agents WHERE id = $1 AND supervisor_id = $2',
        [ticket.agent_id, user.id]
      );
      if (agentCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Ce ticket n\'est pas sous votre supervision' });
      }
    }
    // Propriétaire : pas de restriction de délai ni de vérification supplémentaire

    // 5. Suppression effective
    await pool.query('DELETE FROM tickets WHERE id = $1', [id]);

    // 6. Journalisation (sans colonne "details" qui n'existe pas)
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

// --- Winners et résultats ---
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
      'SELECT * FROM draw_results ORDER BY published_at DESC LIMIT 10'
    );
    const results = result.rows.map(r => ({
      ...r,
      numbers: typeof r.results === 'string' ? JSON.parse(r.results) : r.results
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

// Marquer un ticket comme payé
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

// --- Configuration loterie ---
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

// --- Numéros bloqués (globaux) ---
app.get('/api/blocked-numbers/global', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur numéros globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// --- Numéros bloqués par tirage ---
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

// --- Limites de mise par tirage ---
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

// --- Rapports simples pour agent ---
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

// ==================== NOUVELLES ROUTES SUPERVISEUR ====================

// Liste des tickets avec filtres (superviseur)
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

    // Compter le total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    const hasMore = (page * limit + limit) < total;

    // Récupérer les tickets avec pagination
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

// Marquer un ticket comme payé (superviseur)
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

// Tableau de bord
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

// Liste des superviseurs
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

// Liste des agents
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

// Créer un utilisateur
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

// Bloquer / débloquer un utilisateur
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

// Changer le superviseur d'un agent
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

// Liste des tirages
ownerRouter.get('/draws', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM draws ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Erreur tirages:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Publier les résultats (MODIFIÉ pour inclure les gains des mariages gratuits)
ownerRouter.post('/publish-results', async (req, res) => {
  try {
    const { drawId, numbers } = req.body;
    if (!drawId || !numbers || !Array.isArray(numbers) || numbers.length !== 3) {
      return res.status(400).json({ error: 'Données invalides' });
    }
    const draw = await pool.query('SELECT name FROM draws WHERE id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });

    await pool.query(
      `INSERT INTO draw_results (draw_id, name, results, draw_time, published_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [drawId, draw.rows[0].name, JSON.stringify(numbers)]
    );

    await pool.query('UPDATE draws SET last_draw = NOW() WHERE id = $1', [drawId]);

    // Calcul automatique des gagnants
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
              if (cleanNumber === lot2) gain = amount * 20;
              else if (cleanNumber === lot3) gain = amount * 10;
              else if (cleanNumber === lot1.slice(-2)) gain = amount * 60;
            }
          }
          else if (game === 'lotto3') {
            if (cleanNumber.length === 3 && cleanNumber === lot1) gain = amount * 500;
          }
          else if (game === 'mariage' || game === 'auto_marriage') {
            if (cleanNumber.length === 4) {
              const firstPair = cleanNumber.slice(0, 2);
              const secondPair = cleanNumber.slice(2, 4);
              const pairs = [lot1.slice(-2), lot2, lot3];
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
                // MODIFICATION : si c'est un pari gratuit spécial, gain fixe 1000, sinon normal
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
              if (option == 1) expected = lot1.slice(-2) + lot2;
              else if (option == 2) expected = lot2 + lot3;
              else if (option == 3) expected = lot1.slice(-2) + lot3;
              if (cleanNumber === expected) gain = amount * 5000;
            }
          }
          else if (game === 'lotto5' || game === 'auto_lotto5') {
            if (cleanNumber.length === 5 && bet.option) {
              const option = bet.option;
              let expected = '';
              if (option == 1) expected = lot1 + lot2;
              else if (option == 2) expected = lot1 + lot3;
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

// Bloquer / débloquer un tirage
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

// Bloquer un numéro globalement
ownerRouter.post('/block-number', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'Numéro requis' });
    await pool.query(
      'INSERT INTO blocked_numbers (number) VALUES ($1) ON CONFLICT DO NOTHING',
      [number]
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
    await pool.query('DELETE FROM blocked_numbers WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur déblocage numéro:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer un numéro pour un tirage spécifique
ownerRouter.post('/block-number-draw', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    if (!drawId || !number) return res.status(400).json({ error: 'drawId et number requis' });
    await pool.query(
      'INSERT INTO draw_blocked_numbers (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [drawId, number]
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
    await pool.query(
      'DELETE FROM draw_blocked_numbers WHERE draw_id = $1 AND number = $2',
      [drawId, number]
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
    const { drawId, number, limitAmount } = req.body;
    if (!drawId || !number || !limitAmount) {
      return res.status(400).json({ error: 'drawId, number et limitAmount requis' });
    }
    await pool.query(
      `INSERT INTO draw_number_limits (draw_id, number, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = $3, updated_at = NOW()`,
      [drawId, number, limitAmount]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur définition limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des numéros globalement bloqués (GET)
ownerRouter.get('/blocked-numbers', async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers ORDER BY number');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (error) {
    console.error('❌ Erreur récupération numéros globaux:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des numéros bloqués par tirage
ownerRouter.get('/blocked-numbers-per-draw', async (req, res) => {
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

// Liste des limites de numéros
ownerRouter.get('/number-limits', async (req, res) => {
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

// Supprimer une limite de numéro
ownerRouter.post('/remove-number-limit', async (req, res) => {
  try {
    const { drawId, number } = req.body;
    if (!drawId || !number) {
      return res.status(400).json({ error: 'drawId et number requis' });
    }
    await pool.query(
      'DELETE FROM draw_number_limits WHERE draw_id = $1 AND number = $2',
      [drawId, number]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression limite:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des tirages bloqués (inactifs)
ownerRouter.get('/blocked-draws', async (req, res) => {
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

// Rapports avec filtres
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

// ========== NOUVELLES ROUTES POUR LA CONFIGURATION PROPRIÉTAIRE ==========

// GET /api/owner/settings - Récupérer les paramètres généraux (nom, slogan, logo, multiplicateurs, limites de jeu)
ownerRouter.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config LIMIT 1');
    const config = result.rows[0] || {};

    // Valeurs par défaut des multiplicateurs
    const defaultMultipliers = {
      lot1: 60,
      lot2: 20,
      lot3: 10,
      lotto3: 500,
      lotto4: 5000,
      lotto5: 25000,
      mariage: 500
    };

    // Valeurs par défaut des limites de jeu
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
      limits: gameLimits // Renommé en 'limits' pour correspondre au frontend
    });
  } catch (error) {
    console.error('❌ Erreur GET /settings:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/owner/settings - Enregistrer les paramètres (gère à la fois JSON et multipart/form-data)
ownerRouter.post('/settings', upload.single('logo'), async (req, res) => {
  try {
    let { name, slogan, logoUrl, multipliers, limits } = req.body;

    // Si c'est du FormData, multipliers et limits peuvent être des chaînes JSON, on les parse
    if (multipliers && typeof multipliers === 'string') {
      try { multipliers = JSON.parse(multipliers); } catch { multipliers = {}; }
    }
    if (limits && typeof limits === 'string') {
      try { limits = JSON.parse(limits); } catch { limits = {}; }
    }

    // Valeurs par défaut
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

    // Gestion du logo
    let logo = logoUrl;
    if (req.file) {
      const base64 = req.file.buffer.toString('base64');
      const mimeType = req.file.mimetype;
      logo = `data:${mimeType};base64,${base64}`;
    }

    // Mettre à jour ou insérer dans lottery_config
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

// ========== NOUVELLES ROUTES POUR LA GESTION DES TICKETS (PROPRIÉTAIRE) ==========

// Récupérer les tickets avec filtres (pour le propriétaire)
ownerRouter.get('/tickets', async (req, res) => {
  try {
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid, page = 0, limit = 20 } = req.query;

    let conditions = [];
    let params = [];
    let paramIndex = 1;

    // Filtre par agent
    if (agentId && agentId !== 'all') {
      conditions.push(`t.agent_id = $${paramIndex++}`);
      params.push(agentId);
    }
    // Filtre par superviseur (via les agents)
    else if (supervisorId && supervisorId !== 'all') {
      conditions.push(`a.supervisor_id = $${paramIndex++}`);
      params.push(supervisorId);
    }

    // Filtre par tirage
    if (drawId && drawId !== 'all') {
      conditions.push(`t.draw_id = $${paramIndex++}`);
      params.push(drawId);
    }

    // Filtre par période
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

    // Filtre gain
    if (gain === 'win') {
      conditions.push('t.win_amount > 0');
    } else if (gain === 'nowin') {
      conditions.push('t.win_amount = 0');
    }

    // Filtre paiement
    if (paid === 'paid') {
      conditions.push('t.paid = true');
    } else if (paid === 'unpaid') {
      conditions.push('t.paid = false');
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Compter le total pour savoir s'il y a plus de pages
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tickets t
      LEFT JOIN agents a ON t.agent_id = a.id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    const hasMore = (page * limit + limit) < total;

    // Récupérer les tickets avec pagination
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

    // Convertir bets en objet JSON
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

// Récupérer un ticket par son ID (pour afficher les détails)
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

// Supprimer un ticket (propriétaire seulement, sans restriction de temps)
ownerRouter.delete('/tickets/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    // Vérifier si le ticket existe
    const check = await pool.query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }

    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);

    // Optionnel: journaliser la suppression
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

app.use('/api/owner', ownerRouter);

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
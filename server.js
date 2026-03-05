// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration de la base de données (Neon PostgreSQL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // nécessaire pour Neon
  }
});

// Test de connexion
pool.connect((err, client, release) => {
  if (err) {
    console.error('Erreur de connexion à la base de données:', err);
  } else {
    console.log('Connecté à PostgreSQL');
    release();
  }
});

// Middlewares globaux
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Limiteur de taux
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limite chaque IP à 1000 requêtes par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Dossier pour les uploads (logo)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Servir les fichiers statiques (uploads)
app.use('/uploads', express.static(uploadDir));

// ==================== MIDDLEWARE D'AUTHENTIFICATION ====================
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalide' });
  }
};

// Middleware pour vérifier le rôle (owner, supervisor, agent)
const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
  };
};

// ==================== ROUTES D'AUTHENTIFICATION ====================
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis' });
  }
  try {
    const result = await pool.query(
      'SELECT id, name, username, password_hash, role, supervisor_id, blocked FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Identifiant incorrect' });
    }
    if (user.blocked) {
      return res.status(403).json({ error: 'Compte bloqué' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    // Mettre à jour last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        supervisor_id: user.supervisor_id
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  // Rien à faire côté serveur pour JWT, le client supprime le token
  res.json({ success: true });
});

// ==================== ROUTES POUR LES AGENTS ====================
// Récupérer les tirages (actifs)
app.get('/api/draws', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, draw_id, name, time::text, color, active FROM draws ORDER BY order_index'
    );
    const draws = result.rows.map(r => ({
      id: r.draw_id,
      name: r.name,
      time: r.time,
      color: r.color,
      active: r.active
    }));
    res.json({ draws });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Sauvegarder un ticket
app.post('/api/tickets/save', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { bets, drawId, totalAmount, agentName } = req.body;
    const agentId = req.user.id;

    // Récupérer l'ID numérique du tirage à partir du drawId (string)
    const drawRes = await client.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
    if (drawRes.rows.length === 0) {
      throw new Error('Tirage invalide');
    }
    const drawNumericId = drawRes.rows[0].id;

    // Générer un ticket_id unique (timestamp + aléatoire)
    const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);

    // Insérer le ticket
    const ticketInsert = await client.query(
      'INSERT INTO tickets (ticket_id, agent_id, draw_id, total_amount, date) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [ticketId, agentId, drawNumericId, totalAmount]
    );
    const ticketPk = ticketInsert.rows[0].id;

    // Insérer chaque pari
    for (const bet of bets) {
      await client.query(
        `INSERT INTO bets 
         (ticket_id, game, number, clean_number, amount, option_selected, special_type, is_auto) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ticketPk, bet.game, bet.number, bet.cleanNumber, bet.amount,
         bet.option || null, bet.specialType || null, bet.isAutoGenerated || false]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, ticketId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Récupérer les tickets de l'agent connecté
app.get('/api/tickets', authenticate, async (req, res) => {
  try {
    const agentId = req.user.id;
    const result = await pool.query(
      `SELECT t.*, d.name as draw_name, d.draw_id
       FROM tickets t
       JOIN draws d ON t.draw_id = d.id
       WHERE t.agent_id = $1
       ORDER BY t.date DESC`,
      [agentId]
    );
    // Pour chaque ticket, récupérer ses bets
    const tickets = [];
    for (const row of result.rows) {
      const betsRes = await pool.query('SELECT * FROM bets WHERE ticket_id = $1', [row.id]);
      tickets.push({
        ...row,
        bets: betsRes.rows,
        draw_name: row.draw_name,
        draw_id: row.draw_id
      });
    }
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un ticket (agent seulement si < 3 min)
app.delete('/api/tickets/:id', authenticate, async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticket = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket introuvable' });
    }
    const t = ticket.rows[0];
    // Vérifier que le ticket appartient à l'agent
    if (t.agent_id !== req.user.id) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    // Vérifier délai de 3 minutes
    const now = new Date();
    const diff = (now - new Date(t.date)) / (1000 * 60);
    if (diff > 3) {
      return res.status(400).json({ error: 'Délai de suppression dépassé (3 min)' });
    }
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Vérifier les tickets gagnants (pour l'agent)
app.post('/api/tickets/check-winners', authenticate, async (req, res) => {
  // Logique complexe, on laisse vide pour l'instant (peut être implémentée plus tard)
  res.json({ success: true, message: 'Fonctionnalité à implémenter' });
});

// ==================== ROUTES POUR LES SUPERVISEURS ====================
// Récupérer tous les agents (pour le superviseur)
app.get('/api/supervisor/agents', authenticate, allowRoles('supervisor'), async (req, res) => {
  try {
    // Le superviseur voit les agents qui lui sont rattachés
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.cin, u.zone, u.blocked,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance,
              COALESCE(SUM(CASE WHEN t.paid = false THEN t.win_amount ELSE 0 END), 0) as unpaid_wins,
              COUNT(t.id) as total_tickets
       FROM users u
       LEFT JOIN tickets t ON u.id = t.agent_id AND t.date >= CURRENT_DATE
       WHERE u.supervisor_id = $1 AND u.role = 'agent'
       GROUP BY u.id`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rapports globaux pour superviseur
app.get('/api/supervisor/reports/overall', authenticate, allowRoles('supervisor'), async (req, res) => {
  try {
    // Récupérer les IDs des agents sous ce superviseur
    const agents = await pool.query('SELECT id FROM users WHERE supervisor_id = $1', [req.user.id]);
    const agentIds = agents.rows.map(a => a.id);
    if (agentIds.length === 0) {
      return res.json({ total_tickets:0, total_bets:0, total_wins:0, balance:0 });
    }
    const result = await pool.query(
      `SELECT COUNT(*) as total_tickets,
              COALESCE(SUM(total_amount), 0) as total_bets,
              COALESCE(SUM(win_amount), 0) as total_wins,
              COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
       FROM tickets
       WHERE agent_id = ANY($1::int[]) AND date >= CURRENT_DATE`,
      [agentIds]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tickets récents d'un agent (moins de 10 min)
app.get('/api/supervisor/tickets/recent', authenticate, allowRoles('supervisor'), async (req, res) => {
  const agentId = req.query.agentId;
  try {
    const result = await pool.query(
      `SELECT t.*, d.name as draw_name
       FROM tickets t
       JOIN draws d ON t.draw_id = d.id
       WHERE t.agent_id = $1 AND t.date > NOW() - INTERVAL '10 minutes'
       ORDER BY t.date DESC`,
      [agentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer/débloquer un agent
app.post('/api/supervisor/block-agent/:agentId', authenticate, allowRoles('supervisor'), async (req, res) => {
  const agentId = req.params.agentId;
  try {
    await pool.query('UPDATE users SET blocked = TRUE WHERE id = $1 AND supervisor_id = $2', [agentId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
app.post('/api/supervisor/unblock-agent/:agentId', authenticate, allowRoles('supervisor'), async (req, res) => {
  const agentId = req.params.agentId;
  try {
    await pool.query('UPDATE users SET blocked = FALSE WHERE id = $1 AND supervisor_id = $2', [agentId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES POUR LE PROPRIÉTAIRE ====================
// Tableau de bord propriétaire
app.get('/api/owner/dashboard', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    // Connexions (simulé car on a pas de session persistante)
    // On peut compter les utilisateurs avec last_login récent (15 min)
    const connected = await pool.query(
      `SELECT 
         (SELECT COUNT(*) FROM users WHERE role='supervisor' AND last_login > NOW() - INTERVAL '15 minutes') as supervisors_count,
         (SELECT COUNT(*) FROM users WHERE role='agent' AND last_login > NOW() - INTERVAL '15 minutes') as agents_count`
    );
    const supervisors = await pool.query(
      `SELECT id, name, username FROM users WHERE role='supervisor' AND last_login > NOW() - INTERVAL '15 minutes'`
    );
    const agents = await pool.query(
      `SELECT id, name, username FROM users WHERE role='agent' AND last_login > NOW() - INTERVAL '15 minutes'`
    );

    const salesToday = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM tickets WHERE date >= CURRENT_DATE`
    );

    // Progression des limites (complexe, on peut renvoyer un tableau vide)
    const limitsProgress = []; // à implémenter si nécessaire

    // Gains/pertes par agent aujourd'hui
    const agentsGL = await pool.query(
      `SELECT u.id, u.name,
              COALESCE(SUM(t.total_amount), 0) as total_bets,
              COALESCE(SUM(t.win_amount), 0) as total_wins,
              COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
       FROM users u
       LEFT JOIN tickets t ON u.id = t.agent_id AND t.date >= CURRENT_DATE
       WHERE u.role = 'agent'
       GROUP BY u.id
       ORDER BY u.name`
    );

    res.json({
      connected: {
        supervisors_count: connected.rows[0].supervisors_count,
        agents_count: connected.rows[0].agents_count,
        supervisors: supervisors.rows,
        agents: agents.rows
      },
      sales_today: parseFloat(salesToday.rows[0].total),
      limits_progress: limitsProgress,
      agents_gain_loss: agentsGL.rows.map(r => ({
        ...r,
        total_bets: parseFloat(r.total_bets),
        total_wins: parseFloat(r.total_wins),
        net_result: parseFloat(r.net_result)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des superviseurs
app.get('/api/owner/supervisors', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, username, email, blocked FROM users WHERE role = $1',
      ['supervisor']
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des agents
app.get('/api/owner/agents', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.cin, u.zone, u.blocked, 
              COALESCE(s.name, '') as supervisor_name
       FROM users u
       LEFT JOIN users s ON u.supervisor_id = s.id
       WHERE u.role = 'agent'`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un utilisateur (owner seulement)
app.post('/api/owner/create-user', authenticate, allowRoles('owner'), async (req, res) => {
  const { name, cin, username, password, role, supervisorId, zone } = req.body;
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  try {
    // Vérifier si username existe déjà
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, cin, username, password_hash, role, supervisor_id, zone)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, username, role`,
      [name, cin || null, username, hashed, role, supervisorId || null, zone || null]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer/débloquer un utilisateur
app.post('/api/owner/block-user', authenticate, allowRoles('owner'), async (req, res) => {
  const { userId, block } = req.body; // block = true pour bloquer
  try {
    await pool.query('UPDATE users SET blocked = $1 WHERE id = $2', [block, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Changer superviseur d'un agent
app.put('/api/owner/change-supervisor', authenticate, allowRoles('owner'), async (req, res) => {
  const { agentId, supervisorId } = req.body;
  try {
    await pool.query('UPDATE users SET supervisor_id = $1 WHERE id = $2 AND role = $3',
      [supervisorId || null, agentId, 'agent']);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Récupérer les tirages (pour le propriétaire)
app.get('/api/owner/draws', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, draw_id, name, time::text, color, active FROM draws ORDER BY order_index');
    res.json(result.rows.map(r => ({ id: r.draw_id, name: r.name, time: r.time, color: r.color, active: r.active })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Publier des résultats
app.post('/api/owner/publish-results', authenticate, allowRoles('owner'), async (req, res) => {
  const { drawId, numbers, lotto3 } = req.body; // numbers = [premierLot, lot2, lot3]
  if (!drawId || !numbers || !lotto3) {
    return res.status(400).json({ error: 'Données incomplètes' });
  }
  try {
    // Récupérer l'ID numérique du tirage
    const draw = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
    if (draw.rows.length === 0) {
      return res.status(404).json({ error: 'Tirage introuvable' });
    }
    const drawNumericId = draw.rows[0].id;

    // Insérer le résultat
    await pool.query(
      'INSERT INTO winning_results (draw_id, numbers, lotto3, published_by) VALUES ($1, $2, $3, $4)',
      [drawNumericId, numbers, lotto3, req.user.id]
    );

    // Optionnel : marquer les tickets gagnants (à faire par un job séparé)
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Bloquer/débloquer un tirage
app.post('/api/owner/block-draw', authenticate, allowRoles('owner'), async (req, res) => {
  const { drawId, block } = req.body;
  try {
    await pool.query('UPDATE draws SET active = $1 WHERE draw_id = $2', [block ? false : true, drawId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Numéros globalement bloqués
app.get('/api/owner/blocked-numbers', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers_global ORDER BY number');
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/block-number', authenticate, allowRoles('owner'), async (req, res) => {
  const { number } = req.body;
  try {
    await pool.query('INSERT INTO blocked_numbers_global (number) VALUES ($1) ON CONFLICT DO NOTHING', [number]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/unblock-number', authenticate, allowRoles('owner'), async (req, res) => {
  const { number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_numbers_global WHERE number = $1', [number]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Numéros bloqués par tirage
app.get('/api/owner/blocked-numbers-per-draw', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.draw_id, d.draw_id as draw_code, d.name as draw_name, b.number
       FROM blocked_numbers_draw b
       JOIN draws d ON b.draw_id = d.id`
    );
    res.json(result.rows.map(r => ({ draw_id: r.draw_code, draw_name: r.draw_name, number: r.number })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/block-number-draw', authenticate, allowRoles('owner'), async (req, res) => {
  const { drawId, number } = req.body;
  try {
    const draw = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });
    await pool.query(
      'INSERT INTO blocked_numbers_draw (draw_id, number) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [draw.rows[0].id, number]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/unblock-number-draw', authenticate, allowRoles('owner'), async (req, res) => {
  const { drawId, number } = req.body;
  try {
    const draw = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });
    await pool.query(
      'DELETE FROM blocked_numbers_draw WHERE draw_id = $1 AND number = $2',
      [draw.rows[0].id, number]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Limites de mise par numéro
app.get('/api/owner/number-limits', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, d.draw_id, d.name as draw_name
       FROM number_limits l
       JOIN draws d ON l.draw_id = d.id`
    );
    res.json(result.rows.map(r => ({
      draw_id: r.draw_id,
      draw_name: r.draw_name,
      number: r.number,
      limit_amount: r.limit_amount
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/number-limit', authenticate, allowRoles('owner'), async (req, res) => {
  const { drawId, number, limitAmount } = req.body;
  try {
    const draw = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });
    await pool.query(
      `INSERT INTO number_limits (draw_id, number, limit_amount) VALUES ($1, $2, $3)
       ON CONFLICT (draw_id, number) DO UPDATE SET limit_amount = EXCLUDED.limit_amount`,
      [draw.rows[0].id, number, limitAmount]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/remove-number-limit', authenticate, allowRoles('owner'), async (req, res) => {
  const { drawId, number } = req.body;
  try {
    const draw = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
    if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage inconnu' });
    await pool.query('DELETE FROM number_limits WHERE draw_id = $1 AND number = $2', [draw.rows[0].id, number]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Liste des tirages bloqués (draws avec active = false)
app.get('/api/owner/blocked-draws', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT draw_id, name FROM draws WHERE active = false');
    res.json(result.rows.map(r => ({ drawId: r.draw_id, drawName: r.name })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Rapports (version propriétaire)
app.get('/api/owner/reports', authenticate, allowRoles('owner'), async (req, res) => {
  const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
  try {
    let sql = `
      SELECT 
        COALESCE(SUM(t.total_amount), 0) as total_bets,
        COALESCE(SUM(t.win_amount), 0) as total_wins,
        COUNT(t.id) as total_tickets,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result,
        COUNT(CASE WHEN t.win_amount > 0 THEN 1 END) as gain_count,
        COUNT(CASE WHEN t.win_amount = 0 AND t.checked = true THEN 1 END) as loss_count
      FROM tickets t
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (agentId && agentId !== 'all') {
      sql += ` AND t.agent_id = $${idx++}`;
      params.push(agentId);
    } else if (supervisorId && supervisorId !== 'all') {
      sql += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${idx++})`;
      params.push(supervisorId);
    }

    if (drawId && drawId !== 'all') {
      const drawRes = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
      if (drawRes.rows.length > 0) {
        sql += ` AND t.draw_id = $${idx++}`;
        params.push(drawRes.rows[0].id);
      }
    }

    // Période
    if (period === 'today') {
      sql += ` AND t.date >= CURRENT_DATE`;
    } else if (period === 'yesterday') {
      sql += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
    } else if (period === 'week') {
      sql += ` AND t.date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      sql += ` AND t.date >= date_trunc('month', CURRENT_DATE)`;
    } else if (period === 'custom' && fromDate && toDate) {
      sql += ` AND t.date >= $${idx++} AND t.date <= $${idx++} + INTERVAL '1 day'`;
      params.push(fromDate, toDate);
    }

    if (gainLoss === 'gain') {
      sql += ` AND t.win_amount > 0`;
    } else if (gainLoss === 'loss') {
      sql += ` AND t.win_amount = 0 AND t.checked = true`;
    }

    const summaryRes = await pool.query(sql, params);
    const summary = summaryRes.rows[0];

    // Détail (par agent ou tirage)
    let detailSql = `
      SELECT 
        COALESCE(u.name, d.name) as name,
        COUNT(t.id) as tickets,
        COALESCE(SUM(t.total_amount), 0) as bets,
        COALESCE(SUM(t.win_amount), 0) as wins,
        COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
      FROM tickets t
      JOIN draws d ON t.draw_id = d.id
      LEFT JOIN users u ON t.agent_id = u.id
      WHERE 1=1
    `;
    // (mêmes conditions)
    // ... (pour simplifier, on renvoie un tableau vide)
    const detail = [];

    res.json({
      summary: {
        total_tickets: parseInt(summary.total_tickets),
        total_bets: parseFloat(summary.total_bets),
        total_wins: parseFloat(summary.total_wins),
        net_result: parseFloat(summary.net_result),
        gain_count: parseInt(summary.gain_count),
        loss_count: parseInt(summary.loss_count)
      },
      detail
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Tickets (pour propriétaire)
app.get('/api/owner/tickets', authenticate, allowRoles('owner'), async (req, res) => {
  const { page = 0, limit = 20, agentId, drawId, period, fromDate, toDate, gain, paid } = req.query;
  try {
    let sql = `
      SELECT t.*, d.name as draw_name, u.name as agent_name
      FROM tickets t
      JOIN draws d ON t.draw_id = d.id
      JOIN users u ON t.agent_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (agentId && agentId !== 'all') {
      sql += ` AND t.agent_id = $${idx++}`;
      params.push(agentId);
    }
    if (drawId && drawId !== 'all') {
      const drawRes = await pool.query('SELECT id FROM draws WHERE draw_id = $1', [drawId]);
      if (drawRes.rows.length > 0) {
        sql += ` AND t.draw_id = $${idx++}`;
        params.push(drawRes.rows[0].id);
      }
    }
    // Période
    if (period === 'today') {
      sql += ` AND t.date >= CURRENT_DATE`;
    } else if (period === 'yesterday') {
      sql += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
    } else if (period === 'week') {
      sql += ` AND t.date >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      sql += ` AND t.date >= date_trunc('month', CURRENT_DATE)`;
    } else if (period === 'custom' && fromDate && toDate) {
      sql += ` AND t.date >= $${idx++} AND t.date <= $${idx++} + INTERVAL '1 day'`;
      params.push(fromDate, toDate);
    }
    if (gain === 'win') {
      sql += ` AND t.win_amount > 0`;
    } else if (gain === 'nowin') {
      sql += ` AND t.win_amount = 0`;
    }
    if (paid === 'paid') {
      sql += ` AND t.paid = true`;
    } else if (paid === 'unpaid') {
      sql += ` AND t.paid = false`;
    }

    // Pagination
    const offset = page * limit;
    sql += ` ORDER BY t.date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const ticketsRes = await pool.query(sql, params);
    // Compter le total pour hasMore
    const countSql = sql.replace(/SELECT t.*, d.name as draw_name, u.name as agent_name/, 'SELECT COUNT(*) as total').split('ORDER BY')[0];
    const countRes = await pool.query(countSql, params.slice(0, -2)); // enlever limit/offset
    const total = parseInt(countRes.rows[0].total);
    const hasMore = offset + limit < total;

    res.json({
      tickets: ticketsRes.rows,
      hasMore,
      total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Détail d'un ticket
app.get('/api/owner/tickets/:id', authenticate, allowRoles('owner'), async (req, res) => {
  const ticketId = req.params.id;
  try {
    const ticketRes = await pool.query(
      `SELECT t.*, d.name as draw_name, u.name as agent_name
       FROM tickets t
       JOIN draws d ON t.draw_id = d.id
       JOIN users u ON t.agent_id = u.id
       WHERE t.id = $1`,
      [ticketId]
    );
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket introuvable' });
    }
    const betsRes = await pool.query('SELECT * FROM bets WHERE ticket_id = $1', [ticketId]);
    res.json({ ...ticketRes.rows[0], bets: betsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un ticket (propriétaire)
app.delete('/api/owner/tickets/:id', authenticate, allowRoles('owner'), async (req, res) => {
  const ticketId = req.params.id;
  try {
    await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Marquer un ticket comme payé (superviseur/propriétaire)
app.post('/api/supervisor/tickets/:id/pay', authenticate, allowRoles('supervisor', 'owner'), async (req, res) => {
  const ticketId = req.params.id;
  try {
    await pool.query('UPDATE tickets SET paid = true WHERE id = $1', [ticketId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES POUR LES RÉSULTATS (PUBLIC) ====================
app.get('/api/winners/results', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, d.name, d.draw_id
       FROM winning_results w
       JOIN draws d ON w.draw_id = d.id
       ORDER BY w.published_at DESC`
    );
    res.json({ results: result.rows.map(r => ({
      id: r.id,
      draw_id: r.draw_id,
      name: r.name,
      numbers: r.numbers,
      lotto3: r.lotto3,
      published_at: r.published_at
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== CONFIGURATION ====================
app.get('/api/owner/settings', authenticate, allowRoles('owner'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM lottery_config WHERE id = 1');
    const cfg = result.rows[0] || {};
    res.json({
      name: cfg.name,
      slogan: cfg.slogan,
      logoUrl: cfg.logo_url,
      address: cfg.address,
      phone: cfg.phone,
      multipliers: cfg.multipliers,
      limits: cfg.limits
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/owner/settings', authenticate, allowRoles('owner'), upload.single('logo'), async (req, res) => {
  try {
    const { name, slogan, logoUrl, multipliers, limits } = req.body;
    let logo_url = logoUrl;
    if (req.file) {
      logo_url = `/uploads/${req.file.filename}`;
    }
    const multipliersObj = typeof multipliers === 'string' ? JSON.parse(multipliers) : multipliers;
    const limitsObj = typeof limits === 'string' ? JSON.parse(limits) : limits;

    await pool.query(
      `UPDATE lottery_config SET 
        name = COALESCE($1, name),
        slogan = COALESCE($2, slogan),
        logo_url = COALESCE($3, logo_url),
        multipliers = COALESCE($4, multipliers),
        limits = COALESCE($5, limits),
        updated_at = NOW()
       WHERE id = 1`,
      [name, slogan, logo_url, multipliersObj, limitsObj]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== FICHIERS STATIQUES (FRONT-END) ====================
// Cette ligne doit être placée APRÈS toutes les routes API
app.use(express.static(path.join(__dirname)));

// ==================== DÉMARRAGE DU SERVEUR ====================
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
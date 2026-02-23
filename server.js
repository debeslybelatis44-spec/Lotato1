// server.js - Backend complet pour Nova/Lotato
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_difficile_a_deviner';

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques depuis la racine (index.html, control-level1.html, lotato.html, subsystem-admin.html, master-dashboard.html, etc.)
app.use(express.static(path.join(__dirname)));

// Connexion à PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==================== MIDDLEWARE D'AUTHENTIFICATION ====================
const authenticate = async (req, res, next) => {
  const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Accès non autorisé' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (user.rows.length === 0) throw new Error();
    req.user = user.rows[0];
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Token invalide' });
  }
};

// Middleware pour vérifier le rôle master
const isMaster = (req, res, next) => {
  if (req.user.role !== 'master') {
    return res.status(403).json({ success: false, error: 'Accès réservé au master' });
  }
  next();
};

// Middleware pour vérifier le rôle subsystem (admin de sous-système)
const isSubsystem = (req, res, next) => {
  if (req.user.role !== 'subsystem') {
    return res.status(403).json({ success: false, error: 'Accès réservé aux administrateurs de sous-système' });
  }
  next();
};

// Middleware pour vérifier que l'utilisateur appartient au bon sous-système
const belongsToSubsystem = (req, res, next) => {
  const subsystemId = parseInt(req.params.subsystemId || req.body.subsystemId || req.query.subsystemId);
  if (req.user.role === 'master') return next(); // master a accès à tout
  if (req.user.subsystem_id !== subsystemId) {
    return res.status(403).json({ success: false, error: 'Accès interdit à ce sous-système' });
  }
  next();
};

// ==================== FONCTIONS UTILES ====================
const logActivity = async (userId, userName, action, details) => {
  try {
    await pool.query(
      'INSERT INTO activities (user_id, user_name, action, details) VALUES ($1, $2, $3, $4)',
      [userId, userName, action, details]
    );
  } catch (err) {
    console.error('Erreur logActivity:', err);
  }
};

// ==================== ROUTES PUBLIQUES ====================
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Serveur opérationnel' });
});

// Connexion
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Identifiant et mot de passe requis' });
  }

  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userQuery.rows[0];
    if (!user) return res.status(401).json({ success: false, error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, error: 'Identifiants incorrects' });

    // Mettre à jour la connexion
    await pool.query('UPDATE users SET last_login = NOW(), is_online = true WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, level: user.level, subsystem_id: user.subsystem_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Déterminer l'URL de redirection en fonction du rôle
    let redirectUrl = '/';
    if (user.role === 'agent') {
      redirectUrl = '/lotato.html'; // Les agents restent sur la page principale (index.html)
    } else if (user.role === 'supervisor') {
      if (user.level === 1) redirectUrl = '/control-level1.html';
      else if (user.level === 2) redirectUrl = '/control-level2.html';
    } else if (user.role === 'subsystem') {
      redirectUrl = '/subsystem-admin.html';
    } else if (user.role === 'master') {
      redirectUrl = '/master-dashboard.html'; // À créer si nécessaire, sinon '/'
    }

    // Récupérer les infos du sous-système si nécessaire
    let subsystem = null;
    if (user.subsystem_id) {
      const subRes = await pool.query('SELECT * FROM subsystems WHERE id = $1', [user.subsystem_id]);
      subsystem = subRes.rows[0];
    }

    res.json({
      success: true,
      token,
      redirectUrl,
      admin: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        subsystem_id: user.subsystem_id,
        subsystem_name: subsystem ? subsystem.name : null
      }
    });

    await logActivity(user.id, user.name, 'Connexion', `Utilisateur connecté`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Vérification du token
app.get('/api/auth/check', authenticate, async (req, res) => {
  try {
    const user = req.user;
    let subsystem = null;
    if (user.subsystem_id) {
      const subRes = await pool.query('SELECT * FROM subsystems WHERE id = $1', [user.subsystem_id]);
      subsystem = subRes.rows[0];
    }
    res.json({
      success: true,
      admin: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        level: user.level,
        subsystem_id: user.subsystem_id,
        subsystem_name: subsystem ? subsystem.name : null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES MASTER (admin général) ====================
// Toutes les routes /api/master/* nécessitent le rôle master
app.use('/api/master', authenticate, isMaster);

// Récupérer tous les sous-systèmes (avec pagination et recherche)
app.get('/api/master/subsystems', async (req, res) => {
  const { page = 1, limit = 10, search = '', status } = req.query;
  const offset = (page - 1) * limit;
  let whereClause = '';
  const params = [];
  let paramIndex = 1;

  if (search) {
    whereClause += `WHERE (name ILIKE $${paramIndex} OR subdomain ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (status && status !== 'all') {
    whereClause += whereClause ? ' AND' : 'WHERE';
    if (status === 'active') {
      whereClause += ` is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` is_active = false`;
    } else if (status === 'expired') {
      whereClause += ` subscription_expires < NOW()`;
    }
  }

  const countQuery = await pool.query(`SELECT COUNT(*) FROM subsystems ${whereClause}`, params);
  const total = parseInt(countQuery.rows[0].count);

  const dataQuery = await pool.query(
    `SELECT * FROM subsystems ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex+1}`,
    [...params, limit, offset]
  );

  // Ajouter des statistiques basiques pour chaque sous-système
  const subsystems = [];
  for (const sub of dataQuery.rows) {
    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND is_active = true) as active_users,
        (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = $1 AND date >= CURRENT_DATE) as today_sales,
        (SELECT COUNT(*) FROM tickets WHERE subsystem_id = $1 AND date >= CURRENT_DATE) as today_tickets,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1) as total_users
      `, [sub.id]
    );
    subsystems.push({
      ...sub,
      stats: stats.rows[0]
    });
  }

  res.json({
    success: true,
    subsystems,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      total_pages: Math.ceil(total / limit)
    }
  });
});

// Créer un nouveau sous-système
app.post('/api/master/subsystems', async (req, res) => {
  const { name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_months, send_credentials } = req.body;
  if (!name || !subdomain || !contact_email) {
    return res.status(400).json({ success: false, error: 'Nom, sous-domaine et email sont requis' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier si le sous-domaine existe déjà
    const existing = await client.query('SELECT id FROM subsystems WHERE subdomain = $1', [subdomain]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Ce sous-domaine est déjà utilisé' });
    }

    // Calculer la date d'expiration
    let expires = null;
    if (subscription_months) {
      expires = new Date();
      expires.setMonth(expires.getMonth() + parseInt(subscription_months));
    }

    // Insérer le sous-système
    const subResult = await client.query(
      `INSERT INTO subsystems (name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, subdomain, contact_email, contact_phone, max_users || 10, subscription_type || 'basic', expires]
    );
    const subsystemId = subResult.rows[0].id;

    // Créer un utilisateur admin pour ce sous-système
    const adminUsername = `admin_${subdomain}`;
    const adminPassword = Math.random().toString(36).slice(-8); // mot de passe aléatoire
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const userResult = await client.query(
      `INSERT INTO users (name, username, password, email, role, subsystem_id)
       VALUES ($1, $2, $3, $4, 'subsystem', $5) RETURNING id`,
      [name, adminUsername, hashedPassword, contact_email, subsystemId]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      subsystem_id: subsystemId,
      access_url: `https://${subdomain}.votredomaine.com`,
      admin_credentials: {
        username: adminUsername,
        password: adminPassword,
        email: contact_email
      }
    });

    await logActivity(req.user.id, req.user.name, 'Création sous-système', `Sous-système ${name} créé`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// Récupérer un sous-système par ID
app.get('/api/master/subsystems/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const sub = await pool.query('SELECT * FROM subsystems WHERE id = $1', [id]);
    if (sub.rows.length === 0) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });

    // Statistiques
    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1) as total_users,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND is_active = true) as active_users,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND role = 'agent') as total_agents,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND role = 'supervisor') as total_supervisors,
        (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = $1 AND date >= CURRENT_DATE) as today_sales,
        (SELECT COUNT(*) FROM tickets WHERE subsystem_id = $1 AND date >= CURRENT_DATE) as today_tickets,
        (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = $1 AND date >= date_trunc('month', CURRENT_DATE)) as monthly_sales,
        (SELECT COALESCE(SUM(total_winnings), 0) FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id WHERE t.subsystem_id = $1 AND wr.paid = false) as pending_payout
      `, [id]
    );

    res.json({
      success: true,
      subsystem: {
        ...sub.rows[0],
        stats: stats.rows[0]
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Désactiver un sous-système
app.put('/api/master/subsystems/:id/deactivate', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE subsystems SET is_active = false WHERE id = $1', [id]);
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Désactivation sous-système', `Sous-système ${id} désactivé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Activer un sous-système
app.put('/api/master/subsystems/:id/activate', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE subsystems SET is_active = true WHERE id = $1', [id]);
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Activation sous-système', `Sous-système ${id} activé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Récupérer les utilisateurs d'un sous-système (pour master)
app.get('/api/master/subsystems/:id/users', async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const count = await pool.query('SELECT COUNT(*) FROM users WHERE subsystem_id = $1', [id]);
    const users = await pool.query(
      'SELECT id, name, username, email, role, level, is_active, is_online, last_login, created_at FROM users WHERE subsystem_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [id, limit, offset]
    );

    res.json({
      success: true,
      users: users.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count.rows[0].count),
        total_pages: Math.ceil(count.rows[0].count / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Statistiques globales pour le master
app.get('/api/master/quick-stats', async (req, res) => {
  try {
    const todayTickets = await pool.query('SELECT COUNT(*) FROM tickets WHERE date >= CURRENT_DATE');
    const onlineUsers = await pool.query('SELECT COUNT(*) FROM users WHERE is_online = true');
    const expiringSoon = await pool.query("SELECT COUNT(*) FROM subsystems WHERE subscription_expires < NOW() + INTERVAL '7 days' AND subscription_expires > NOW()");
    const systemAlerts = await pool.query('SELECT COUNT(*) FROM activities WHERE timestamp > NOW() - INTERVAL \'1 day\' AND action LIKE \'%erreur%\'');
    res.json({
      success: true,
      today_tickets: parseInt(todayTickets.rows[0].count),
      online_users: parseInt(onlineUsers.rows[0].count),
      expiring_soon: parseInt(expiringSoon.rows[0].count),
      system_alerts: parseInt(systemAlerts.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES SOUS-SYSTÈME (admin subsystem) ====================
// Toutes les routes /api/subsystem/* nécessitent le rôle subsystem
app.use('/api/subsystem', authenticate, isSubsystem);

// Récupérer les informations du sous-système de l'utilisateur connecté
app.get('/api/subsystem/mine', async (req, res) => {
  try {
    const sub = await pool.query('SELECT * FROM subsystems WHERE id = $1', [req.user.subsystem_id]);
    res.json({ success: true, subsystems: sub.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Statistiques du sous-système
app.get('/api/subsystem/stats', async (req, res) => {
  const subId = req.user.subsystem_id;
  try {
    const stats = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1) as total_users,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND is_active = true) as active_users,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND role = 'agent') as total_agents,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND role = 'supervisor') as total_supervisors,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND is_online = true AND role = 'agent') as online_agents,
        (SELECT COUNT(*) FROM users WHERE subsystem_id = $1 AND is_online = true AND role = 'supervisor') as online_supervisors,
        (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = $1 AND date >= CURRENT_DATE) as today_sales,
        (SELECT COUNT(*) FROM tickets WHERE subsystem_id = $1 AND date >= CURRENT_DATE) as today_tickets,
        (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = $1 AND date >= date_trunc('month', CURRENT_DATE)) as monthly_sales,
        (SELECT COUNT(*) FROM tickets WHERE subsystem_id = $1 AND date >= date_trunc('month', CURRENT_DATE)) as monthly_tickets,
        (SELECT COALESCE(SUM(total_winnings), 0) FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id WHERE t.subsystem_id = $1 AND wr.paid = false) as pending_payout,
        (SELECT COUNT(*) FROM tickets WHERE subsystem_id = $1 AND is_synced = false) as pending_issues,
        (SELECT max_users FROM subsystems WHERE id = $1) as max_users
      `, [subId]
    );
    const usage_percentage = stats.rows[0].max_users ? Math.round((stats.rows[0].active_users / stats.rows[0].max_users) * 100) : 0;
    res.json({
      success: true,
      stats: { ...stats.rows[0], usage_percentage }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Récupérer les utilisateurs du sous-système avec filtres
app.get('/api/subsystem/users', async (req, res) => {
  const subId = req.user.subsystem_id;
  const { role, search, supervisor_id, limit = 50 } = req.query;
  let query = 'SELECT * FROM users WHERE subsystem_id = $1';
  const params = [subId];
  let paramIndex = 2;

  if (role) {
    query += ` AND role = $${paramIndex}`;
    params.push(role);
    paramIndex++;
  }
  if (search) {
    query += ` AND (name ILIKE $${paramIndex} OR username ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (supervisor_id) {
    query += ` AND (supervisor1_id = $${paramIndex} OR supervisor2_id = $${paramIndex})`;
    params.push(supervisor_id);
    paramIndex++;
  }

  query += ' ORDER BY created_at DESC';
  if (limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(parseInt(limit));
  }

  try {
    const users = await pool.query(query, params);
    res.json({ success: true, users: users.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Créer un utilisateur (agent ou superviseur) dans le sous-système
app.post('/api/subsystem/users/create', async (req, res) => {
  const { name, username, password, role, level, supervisor1Id, supervisor2Id } = req.body;
  const subId = req.user.subsystem_id;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ success: false, error: 'Champs manquants' });
  }
  if (role === 'supervisor' && !level) {
    return res.status(400).json({ success: false, error: 'Niveau requis pour superviseur' });
  }

  try {
    // Vérifier si username existe déjà
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Nom d\'utilisateur déjà pris' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, username, password, role, level, subsystem_id, supervisor1_id, supervisor2_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [name, username, hashedPassword, role, level || null, subId, supervisor1Id || null, supervisor2Id || null]
    );

    res.json({ success: true, userId: result.rows[0].id });
    await logActivity(req.user.id, req.user.name, 'Création utilisateur', `Utilisateur ${username} créé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Modifier un utilisateur
app.put('/api/subsystem/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_active, password } = req.body;
  const subId = req.user.subsystem_id;

  try {
    // Vérifier que l'utilisateur appartient bien au sous-système
    const user = await pool.query('SELECT * FROM users WHERE id = $1 AND subsystem_id = $2', [id, subId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    let updateQuery = 'UPDATE users SET name = $1, is_active = $2';
    const params = [name, is_active];
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      updateQuery += ', password = $' + (params.length + 1);
      params.push(hashed);
    }
    updateQuery += ' WHERE id = $' + (params.length + 1) + ' RETURNING id';
    params.push(id);

    await pool.query(updateQuery, params);
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Modification utilisateur', `Utilisateur ${id} modifié`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Changer le statut (activer/désactiver) d'un utilisateur
app.put('/api/subsystem/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const subId = req.user.subsystem_id;

  try {
    const result = await pool.query(
      'UPDATE users SET is_active = $1 WHERE id = $2 AND subsystem_id = $3 RETURNING id',
      [is_active, id, subId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Changement statut', `Utilisateur ${id} ${is_active ? 'activé' : 'désactivé'}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Supprimer un utilisateur (hard delete)
app.delete('/api/subsystem/users/:id', async (req, res) => {
  const { id } = req.params;
  const subId = req.user.subsystem_id;

  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 AND subsystem_id = $2 RETURNING id', [id, subId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Suppression utilisateur', `Utilisateur ${id} supprimé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Récupérer les tickets du sous-système avec filtres
app.get('/api/subsystem/tickets', async (req, res) => {
  const subId = req.user.subsystem_id;
  const { start_date, end_date, agent_id, agent_ids, status, limit = 50 } = req.query;
  let query = 'SELECT t.*, u.name as agent_name FROM tickets t LEFT JOIN users u ON t.agent_id = u.id WHERE t.subsystem_id = $1';
  const params = [subId];
  let paramIndex = 2;

  if (start_date) {
    query += ` AND t.date >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }
  if (end_date) {
    query += ` AND t.date <= $${paramIndex}`;
    params.push(end_date + ' 23:59:59');
    paramIndex++;
  }
  if (agent_id) {
    query += ` AND t.agent_id = $${paramIndex}`;
    params.push(agent_id);
    paramIndex++;
  }
  if (agent_ids) {
    const ids = agent_ids.split(',').map(id => parseInt(id));
    query += ` AND t.agent_id = ANY($${paramIndex})`;
    params.push(ids);
    paramIndex++;
  }
  if (status === 'pending') {
    query += ` AND t.is_synced = false`;
  } else if (status === 'synced') {
    query += ` AND t.is_synced = true`;
  }

  query += ' ORDER BY t.date DESC LIMIT $' + paramIndex;
  params.push(parseInt(limit));

  try {
    const tickets = await pool.query(query, params);
    res.json({ success: true, tickets: tickets.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES TICKETS (pour agents et superviseurs) ====================
// Routes générales pour les tickets, accessibles selon rôle

// Créer un ticket (agent)
app.post('/api/tickets', authenticate, async (req, res) => {
  const { number, draw, draw_time, bets, total, agent_id, agent_name, subsystem_id, date } = req.body;
  // Vérifier que l'utilisateur est bien un agent ou a le droit
  if (req.user.role !== 'agent' && req.user.role !== 'subsystem' && req.user.role !== 'master') {
    return res.status(403).json({ success: false, error: 'Seuls les agents peuvent créer des tickets' });
  }
  if (!number || !draw || !draw_time || !bets || !total || !agent_id || !subsystem_id || !date) {
    return res.status(400).json({ success: false, error: 'Données incomplètes' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketResult = await client.query(
      `INSERT INTO tickets (number, draw, draw_time, total, agent_id, agent_name, subsystem_id, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [number, draw, draw_time, total, agent_id, agent_name, subsystem_id, date]
    );
    const ticketId = ticketResult.rows[0].id;

    // Insérer les paris
    for (const bet of bets) {
      await client.query(
        `INSERT INTO bets (ticket_id, type, name, number, amount, multiplier, options, is_group, details, per_option_amount, is_lotto4, is_lotto5)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [ticketId, bet.type, bet.name, bet.number, bet.amount, bet.multiplier || null, bet.options || null, bet.isGroup || false, bet.details || null, bet.perOptionAmount || null, bet.isLotto4 || false, bet.isLotto5 || false]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, ticket: { id: ticketId, number, total, agent_name, date, bets } });
    await logActivity(req.user.id, req.user.name, 'Création ticket', `Ticket #${number} créé`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// Récupérer les tickets (avec filtres) - accessible selon rôle
app.get('/api/tickets', authenticate, async (req, res) => {
  const { agent, date, limit = 50 } = req.query;
  let query = 'SELECT t.*, u.name as agent_name FROM tickets t LEFT JOIN users u ON t.agent_id = u.id WHERE 1=1';
  const params = [];

  if (req.user.role === 'agent') {
    query += ' AND t.agent_id = $' + (params.length + 1);
    params.push(req.user.id);
  } else if (req.user.role === 'supervisor') {
    // Superviseur voit les tickets des agents qu'il supervise
    query += ' AND t.agent_id IN (SELECT id FROM users WHERE (supervisor1_id = $' + (params.length + 1) + ' OR supervisor2_id = $' + (params.length + 2) + '))';
    params.push(req.user.id, req.user.id);
  } else if (req.user.role === 'subsystem') {
    query += ' AND t.subsystem_id = $' + (params.length + 1);
    params.push(req.user.subsystem_id);
  } else if (req.user.role === 'master') {
    // master voit tout
  }

  if (agent) {
    query += ' AND t.agent_id = $' + (params.length + 1);
    params.push(agent);
  }
  if (date) {
    query += ' AND DATE(t.date) = $' + (params.length + 1);
    params.push(date);
  }

  query += ' ORDER BY t.date DESC LIMIT $' + (params.length + 1);
  params.push(parseInt(limit));

  try {
    const tickets = await pool.query(query, params);
    res.json({ success: true, tickets: tickets.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Récupérer un ticket par ID
app.get('/api/tickets/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const ticket = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticket.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });

    // Vérifier les droits
    if (req.user.role === 'agent' && ticket.rows[0].agent_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Accès interdit' });
    }
    if (req.user.role === 'supervisor') {
      const agent = await pool.query('SELECT * FROM users WHERE id = $1', [ticket.rows[0].agent_id]);
      if (agent.rows.length === 0 || (agent.rows[0].supervisor1_id !== req.user.id && agent.rows[0].supervisor2_id !== req.user.id)) {
        return res.status(403).json({ success: false, error: 'Accès interdit' });
      }
    }
    if (req.user.role === 'subsystem' && ticket.rows[0].subsystem_id !== req.user.subsystem_id) {
      return res.status(403).json({ success: false, error: 'Accès interdit' });
    }

    // Récupérer les paris
    const bets = await pool.query('SELECT * FROM bets WHERE ticket_id = $1', [id]);

    res.json({ success: true, ticket: { ...ticket.rows[0], bets: bets.rows } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Supprimer un ticket (si moins de 5 min)
app.delete('/api/tickets/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const ticket = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticket.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });

    // Vérifier les droits (agent propriétaire ou superviseur/subsystem)
    let allowed = false;
    if (req.user.role === 'agent' && ticket.rows[0].agent_id === req.user.id) allowed = true;
    else if (req.user.role === 'supervisor') {
      const agent = await pool.query('SELECT * FROM users WHERE id = $1', [ticket.rows[0].agent_id]);
      if (agent.rows.length && (agent.rows[0].supervisor1_id === req.user.id || agent.rows[0].supervisor2_id === req.user.id)) allowed = true;
    } else if (req.user.role === 'subsystem' && ticket.rows[0].subsystem_id === req.user.subsystem_id) allowed = true;
    else if (req.user.role === 'master') allowed = true;

    if (!allowed) return res.status(403).json({ success: false, error: 'Accès interdit' });

    // Vérifier le délai de 5 minutes
    const diff = (new Date() - new Date(ticket.rows[0].date)) / (1000 * 60);
    if (diff > 5 && req.user.role !== 'master' && req.user.role !== 'subsystem') {
      return res.status(400).json({ success: false, error: 'Ticket trop ancien pour être supprimé (plus de 5 min)' });
    }

    await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Suppression ticket', `Ticket #${ticket.rows[0].number} supprimé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Marquer un ticket comme synchronisé
app.put('/api/tickets/:id/sync', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const ticket = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticket.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });

    // Seul subsystem ou master peut synchroniser
    if (req.user.role !== 'subsystem' && req.user.role !== 'master') {
      return res.status(403).json({ success: false, error: 'Seul l\'admin peut synchroniser' });
    }

    await pool.query('UPDATE tickets SET is_synced = true, synced_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Synchronisation ticket', `Ticket #${ticket.rows[0].number} synchronisé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Récupérer les tickets gagnants (avec filtre)
app.get('/api/tickets/winning', authenticate, async (req, res) => {
  const { agent, subsystem_id, date } = req.query;
  let query = `
    SELECT wr.*, t.number as ticket_number, t.draw, t.draw_time, t.date, t.agent_id, t.agent_name, t.subsystem_id
    FROM winning_records wr
    JOIN tickets t ON wr.ticket_id = t.id
    WHERE 1=1
  `;
  const params = [];

  if (agent) {
    query += ' AND t.agent_id = $' + (params.length + 1);
    params.push(agent);
  }
  if (subsystem_id) {
    query += ' AND t.subsystem_id = $' + (params.length + 1);
    params.push(subsystem_id);
  } else if (req.user.role === 'subsystem') {
    query += ' AND t.subsystem_id = $' + (params.length + 1);
    params.push(req.user.subsystem_id);
  } else if (req.user.role === 'supervisor') {
    // superviseur voit les tickets gagnants des agents qu'il supervise
    query += ' AND t.agent_id IN (SELECT id FROM users WHERE supervisor1_id = $' + (params.length + 1) + ' OR supervisor2_id = $' + (params.length + 2) + ')';
    params.push(req.user.id, req.user.id);
  } else if (req.user.role === 'agent') {
    query += ' AND t.agent_id = $' + (params.length + 1);
    params.push(req.user.id);
  }

  if (date) {
    query += ' AND DATE(t.date) = $' + (params.length + 1);
    params.push(date);
  }

  query += ' ORDER BY t.date DESC';

  try {
    const winners = await pool.query(query, params);
    res.json({ success: true, tickets: winners.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Marquer un ticket gagnant comme payé
app.put('/api/winners/:id/pay', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const winner = await pool.query('SELECT * FROM winning_records WHERE id = $1', [id]);
    if (winner.rows.length === 0) return res.status(404).json({ success: false, error: 'Enregistrement non trouvé' });

    // Vérifier les droits (subsystem ou master)
    if (req.user.role !== 'subsystem' && req.user.role !== 'master') {
      return res.status(403).json({ success: false, error: 'Seul l\'admin peut marquer comme payé' });
    }

    await pool.query('UPDATE winning_records SET paid = true, paid_at = NOW() WHERE id = $1', [id]);
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Paiement gagnant', `Winner ${id} marqué payé`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES RÉSULTATS ====================
// Obtenir les résultats (public)
app.get('/api/results', async (req, res) => {
  const { subsystem_id } = req.query;
  try {
    const results = await pool.query(
      'SELECT * FROM results WHERE subsystem_id = $1 ORDER BY date DESC, time DESC LIMIT 20',
      [subsystem_id || 1] // par défaut sous-système 1
    );
    res.json({ success: true, results: results.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Ajouter/modifier un résultat (subsystem)
app.post('/api/results', authenticate, isSubsystem, async (req, res) => {
  const { draw, time, date, lot1, lot2, lot3, verified } = req.body;
  const subId = req.user.subsystem_id;

  if (!draw || !time || !date || !lot1) {
    return res.status(400).json({ success: false, error: 'Données incomplètes' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insérer ou remplacer
    await client.query(
      `INSERT INTO results (draw, time, date, lot1, lot2, lot3, verified, subsystem_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (draw, time, date, subsystem_id) DO UPDATE SET
         lot1 = EXCLUDED.lot1,
         lot2 = EXCLUDED.lot2,
         lot3 = EXCLUDED.lot3,
         verified = EXCLUDED.verified,
         updated_at = NOW()`,
      [draw, time, date, lot1, lot2, lot3, verified, subId]
    );

    // Déclencher le calcul des gagnants
    await calculateWinnersForDraw(client, draw, time, date, subId);

    await client.query('COMMIT');
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Saisie résultat', `Résultat ${draw} ${time} ${date} enregistré`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// Fonction pour calculer les gagnants d'un tirage
async function calculateWinnersForDraw(client, draw, time, date, subsystemId) {
  // Récupérer tous les tickets pour ce tirage et cette date
  const tickets = await client.query(
    'SELECT * FROM tickets WHERE draw = $1 AND draw_time = $2 AND DATE(date) = $3 AND subsystem_id = $4',
    [draw, time, date, subsystemId]
  );

  for (const ticket of tickets.rows) {
    const bets = await client.query('SELECT * FROM bets WHERE ticket_id = $1', [ticket.id]);
    const result = await client.query(
      'SELECT * FROM results WHERE draw = $1 AND time = $2 AND date = $3 AND subsystem_id = $4',
      [draw, time, date, subsystemId]
    );
    if (result.rows.length === 0) continue;
    const resData = result.rows[0];

    // Logique de calcul des gains (simplifiée, à adapter selon les règles)
    const winningBets = [];
    let totalWinnings = 0;

    for (const bet of bets.rows) {
      let winAmount = 0;
      // Implémenter la logique selon le type de jeu
      // Pour l'exemple, on va faire un calcul basique pour borlette
      if (bet.type === 'borlette' && bet.number === resData.lot1?.slice(-2)) {
        winAmount = bet.amount * 60;
      } else if (bet.type === 'borlette' && bet.number === resData.lot2) {
        winAmount = bet.amount * 20;
      } else if (bet.type === 'borlette' && bet.number === resData.lot3) {
        winAmount = bet.amount * 10;
      }
      // Ajouter d'autres jeux...

      if (winAmount > 0) {
        winningBets.push({ ...bet, winAmount });
        totalWinnings += winAmount;
      }
    }

    if (totalWinnings > 0) {
      await client.query(
        `INSERT INTO winning_records (ticket_id, winning_bets, total_winnings, paid)
         VALUES ($1, $2, $3, false)`,
        [ticket.id, JSON.stringify(winningBets), totalWinnings]
      );
    }
  }
}

// ==================== ROUTES TIRAGES (draws) ====================
// Obtenir les tirages (public ou selon sous-système)
app.get('/api/draws', async (req, res) => {
  const { subsystem_id } = req.query;
  try {
    const draws = await pool.query(
      'SELECT * FROM draws WHERE subsystem_id = $1 AND is_active = true',
      [subsystem_id || 1]
    );
    // Formater pour le frontend
    const formatted = {};
    draws.rows.forEach(d => {
      formatted[d.name.toLowerCase().replace(' ', '')] = {
        name: d.name,
        times: d.times
      };
    });
    res.json({ success: true, draws: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES RESTRICTIONS ====================
// Obtenir les restrictions d'un sous-système
app.get('/api/restrictions', authenticate, async (req, res) => {
  const subsystemId = req.user.subsystem_id || req.query.subsystemId;
  if (!subsystemId) return res.status(400).json({ success: false, error: 'subsystemId requis' });

  try {
    const restrictions = await pool.query('SELECT * FROM restrictions WHERE subsystem_id = $1 ORDER BY created_at DESC', [subsystemId]);
    res.json({ success: true, restrictions: restrictions.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Créer une restriction
app.post('/api/restrictions', authenticate, isSubsystem, async (req, res) => {
  const { number, type, limitAmount, draw, time } = req.body;
  const subId = req.user.subsystem_id;

  if (!number || !type) {
    return res.status(400).json({ success: false, error: 'Numéro et type requis' });
  }

  try {
    await pool.query(
      `INSERT INTO restrictions (number, type, limit_amount, draw, time, subsystem_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [number, type, limitAmount || null, draw || 'all', time || 'all', subId]
    );
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Ajout restriction', `Restriction ${number} créée`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Modifier une restriction
app.put('/api/restrictions/:id', authenticate, isSubsystem, async (req, res) => {
  const { id } = req.params;
  const { number, type, limitAmount, draw, time } = req.body;
  const subId = req.user.subsystem_id;

  try {
    const result = await pool.query(
      `UPDATE restrictions SET number = $1, type = $2, limit_amount = $3, draw = $4, time = $5
       WHERE id = $6 AND subsystem_id = $7 RETURNING id`,
      [number, type, limitAmount || null, draw, time, id, subId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Restriction non trouvée' });
    }
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Modification restriction', `Restriction ${id} modifiée`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Supprimer une restriction
app.delete('/api/restrictions/:id', authenticate, isSubsystem, async (req, res) => {
  const { id } = req.params;
  const subId = req.user.subsystem_id;

  try {
    const result = await pool.query('DELETE FROM restrictions WHERE id = $1 AND subsystem_id = $2 RETURNING id', [id, subId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Restriction non trouvée' });
    }
    res.json({ success: true });
    await logActivity(req.user.id, req.user.name, 'Suppression restriction', `Restriction ${id} supprimée`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES NOTIFICATIONS ====================
// Obtenir les notifications de l'utilisateur connecté
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const notifs = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY timestamp DESC',
      [req.user.id]
    );
    res.json({ success: true, notifications: notifs.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Compter les notifications non lues
app.get('/api/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const count = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
      [req.user.id]
    );
    res.json({ success: true, count: parseInt(count.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Marquer une notification comme lue
app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Supprimer une notification
app.delete('/api/notifications/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Tout marquer comme lu
app.put('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Tout effacer
app.delete('/api/notifications/clear', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES ACTIVITÉS ====================
// Obtenir les activités (pour subsystem)
app.get('/api/subsystem/activities', authenticate, isSubsystem, async (req, res) => {
  const subId = req.user.subsystem_id;
  try {
    const activities = await pool.query(
      `SELECT a.* FROM activities a
       JOIN users u ON a.user_id = u.id
       WHERE u.subsystem_id = $1
       ORDER BY a.timestamp DESC LIMIT 50`,
      [subId]
    );
    res.json({ success: true, activities: activities.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== ROUTES RAPPORTS (simplifiées) ====================
// Rapport quotidien (subsystem)
app.get('/api/reports/daily', authenticate, isSubsystem, async (req, res) => {
  const { date } = req.query;
  const subId = req.user.subsystem_id;
  if (!date) return res.status(400).json({ success: false, error: 'Date requise' });

  try {
    const tickets = await pool.query(
      `SELECT t.*, u.name as agent_name FROM tickets t
       JOIN users u ON t.agent_id = u.id
       WHERE t.subsystem_id = $1 AND DATE(t.date) = $2`,
      [subId, date]
    );

    const totalTickets = tickets.rows.length;
    const totalSales = tickets.rows.reduce((sum, t) => sum + t.total, 0);

    // Grouper par agent
    const agentsMap = {};
    tickets.rows.forEach(t => {
      if (!agentsMap[t.agent_name]) {
        agentsMap[t.agent_name] = { name: t.agent_name, tickets: 0, sales: 0 };
      }
      agentsMap[t.agent_name].tickets++;
      agentsMap[t.agent_name].sales += t.total;
    });
    const agents = Object.values(agentsMap);

    res.json({
      success: true,
      report: {
        date,
        totalTickets,
        totalSales,
        agents
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Rapport mensuel (subsystem)
app.get('/api/reports/monthly', authenticate, isSubsystem, async (req, res) => {
  const { month } = req.query; // format YYYY-MM
  const subId = req.user.subsystem_id;
  if (!month) return res.status(400).json({ success: false, error: 'Mois requis' });

  try {
    const startDate = month + '-01';
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    const tickets = await pool.query(
      `SELECT * FROM tickets
       WHERE subsystem_id = $1 AND date >= $2 AND date <= $3`,
      [subId, startDate, endDate + ' 23:59:59']
    );

    const totalTickets = tickets.rows.length;
    const totalSales = tickets.rows.reduce((sum, t) => sum + t.total, 0);

    // Regrouper par jour
    const dailyMap = {};
    tickets.rows.forEach(t => {
      const day = new Date(t.date).toISOString().split('T')[0];
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, tickets: 0, sales: 0 };
      }
      dailyMap[day].tickets++;
      dailyMap[day].sales += t.total;
    });
    const daily = Object.values(dailyMap).sort((a,b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      report: {
        month,
        totalTickets,
        totalSales,
        daily
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// Rapport par agent
app.get('/api/reports/agent', authenticate, isSubsystem, async (req, res) => {
  const { agentId, period } = req.query; // period: today, week, month
  const subId = req.user.subsystem_id;
  if (!agentId) return res.status(400).json({ success: false, error: 'agentId requis' });

  let startDate;
  const today = new Date();
  if (period === 'today') {
    startDate = new Date(today.setHours(0,0,0,0)).toISOString().split('T')[0];
  } else if (period === 'week') {
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    startDate = weekAgo.toISOString().split('T')[0];
  } else if (period === 'month') {
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    startDate = monthAgo.toISOString().split('T')[0];
  } else {
    return res.status(400).json({ success: false, error: 'Période invalide' });
  }

  try {
    const agent = await pool.query('SELECT * FROM users WHERE id = $1 AND subsystem_id = $2', [agentId, subId]);
    if (agent.rows.length === 0) return res.status(404).json({ success: false, error: 'Agent non trouvé' });

    const tickets = await pool.query(
      `SELECT * FROM tickets WHERE agent_id = $1 AND date >= $2 ORDER BY date DESC`,
      [agentId, startDate]
    );

    const totalTickets = tickets.rows.length;
    const totalSales = tickets.rows.reduce((sum, t) => sum + t.total, 0);

    res.json({
      success: true,
      report: {
        agent: agent.rows[0],
        totalTickets,
        totalSales,
        tickets: tickets.rows
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ==================== GESTION DES ERREURS 404 ====================
// Cette route doit être placée après toutes les routes API
app.use((req, res) => {
  // Si la requête commence par /api, c'est une API introuvable → erreur JSON
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Route API non trouvée' });
  }
  // Sinon, on renvoie une page 404 personnalisée (ou un simple message)
  res.status(404).send(`
    <html>
      <head><title>404 - Page non trouvée</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>404</h1>
        <p>La page que vous cherchez n'existe pas.</p>
        <a href="/">Retour à l'accueil</a>
      </body>
    </html>
  `);
});

// ==================== CRÉATION DES UTILISATEURS DE TEST AU DÉMARRAGE ====================
async function createTestUsers() {
  const client = await pool.connect();
  try {
    // Vérifier si des utilisateurs existent déjà
    const count = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(count.rows[0].count) > 0) {
      console.log('Des utilisateurs existent déjà, pas de création de test.');
      return;
    }

    console.log('Création des utilisateurs de test...');

    // Mot de passe par défaut : 1111 (hashé)
    const defaultPassword = await bcrypt.hash('1111', 10);

    // Sous-système par défaut (déjà créé dans le SQL)
    const subRes = await client.query('SELECT id FROM subsystems LIMIT 1');
    const subId = subRes.rows[0].id;

    // Créer les utilisateurs
    const users = [
      { name: 'Master Admin', username: 'master001', password: defaultPassword, role: 'master', subsystem_id: null },
      { name: 'Subsystem Admin', username: 'subsystem001', password: defaultPassword, role: 'subsystem', subsystem_id: subId },
      { name: 'Supervisor Level 1', username: 'supervisor1001', password: defaultPassword, role: 'supervisor', level: 1, subsystem_id: subId },
      { name: 'Supervisor Level 2', username: 'supervisor2001', password: defaultPassword, role: 'supervisor', level: 2, subsystem_id: subId },
      { name: 'Agent 001', username: 'agent001', password: defaultPassword, role: 'agent', subsystem_id: subId }
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (name, username, password, role, level, subsystem_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.name, u.username, u.password, u.role, u.level || null, u.subsystem_id]
      );
    }

    console.log('Utilisateurs de test créés avec succès.');
  } catch (err) {
    console.error('Erreur lors de la création des utilisateurs de test:', err);
  } finally {
    client.release();
  }
}

// ==================== DÉMARRAGE DU SERVEUR ====================
app.listen(PORT, async () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  // Initialiser la base de données (créer les tables si nécessaire)
  try {
    await pool.query('SELECT 1'); // test connexion
    console.log('Connexion à la base de données réussie');
    await createTestUsers();
  } catch (err) {
    console.error('Erreur de connexion à la base de données:', err);
  }
});

// Gestion propre de l'arrêt
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
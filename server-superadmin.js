// server-superadmin.js - Serveur dédié à l'interface Super Admin (port 3002)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.SUPERADMIN_PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Base de données (la même que le serveur principal)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Port-au-Prince'", (err) => {
    if (err) console.error('❌ Erreur fuseau:', err);
  });
});

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

// Middleware d'authentification superadmin
const authenticateSuperAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Accès réservé au superadmin' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide' });
  }
};
app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'superadmin.html'));
});

// ==================== ROUTES PUBLIQUES ====================
app.post('/api/auth/superadmin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, username, password, role FROM users WHERE username = $1 AND role = $2',
      [username, 'superadmin']
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ==================== ROUTES PROTÉGÉES (superadmin) ====================

// Liste des propriétaires
app.get('/api/superadmin/owners', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, u.blocked as active, u.quota, u.phone, u.created_at,
             (SELECT COUNT(*) FROM users WHERE owner_id = u.id AND role IN ('agent', 'supervisor')) as current_count
      FROM users u WHERE u.role = 'owner' ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un propriétaire
app.post('/api/superadmin/owners', authenticateSuperAdmin, async (req, res) => {
  const { name, email, password, phone, quota } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
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

// Bloquer / débloquer un propriétaire
app.put('/api/superadmin/owners/:id/block', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { block } = req.body;
  try {
    await pool.query('UPDATE users SET blocked = $1 WHERE id = $2 AND role = $3', [block, id, 'owner']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour' });
  }
});

// Supprimer un propriétaire
app.delete('/api/superadmin/owners/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'owner']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Propriétaire non trouvé' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

// Modifier un propriétaire
app.put('/api/superadmin/owners/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, password } = req.body;
  try {
    let query = 'UPDATE users SET name = $1, username = $2, phone = $3 WHERE id = $4 AND role = $5';
    const params = [name, email, phone, id, 'owner'];
    if (password && password.trim() !== '') {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET name = $1, username = $2, phone = $3, password = $4 WHERE id = $5 AND role = $6';
      params.splice(3, 0, hashed);
    }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur mise à jour' });
  }
});

// Modifier le quota d'un propriétaire
app.put('/api/superadmin/owners/:id/quota', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { quota } = req.body;
  try {
    await pool.query('UPDATE users SET quota = $1 WHERE id = $2 AND role = $3', [quota, id, 'owner']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour quota' });
  }
});

// Liste des agents (tous propriétaires confondus)
app.get('/api/superadmin/agents', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, u.phone, u.owner_id, o.name as owner_name
      FROM users u
      LEFT JOIN users o ON u.owner_id = o.id
      WHERE u.role = 'agent'
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un agent
app.put('/api/superadmin/agents/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, password, ownerId } = req.body;
  try {
    let query = 'UPDATE users SET name = $1, username = $2, phone = $3, owner_id = $4 WHERE id = $5 AND role = $6';
    const params = [name, email, phone, ownerId || null, id, 'agent'];
    if (password && password.trim() !== '') {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET name = $1, username = $2, phone = $3, password = $4, owner_id = $5 WHERE id = $6 AND role = $7';
      params.splice(3, 0, hashed);
    }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour agent' });
  }
});

// Supprimer un agent
app.delete('/api/superadmin/agents/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'agent']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

// Liste des superviseurs
app.get('/api/superadmin/supervisors', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, u.phone, u.owner_id, o.name as owner_name
      FROM users u
      LEFT JOIN users o ON u.owner_id = o.id
      WHERE u.role = 'supervisor'
      ORDER BY u.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Modifier un superviseur
app.put('/api/superadmin/supervisors/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, password, ownerId } = req.body;
  try {
    let query = 'UPDATE users SET name = $1, username = $2, phone = $3, owner_id = $4 WHERE id = $5 AND role = $6';
    const params = [name, email, phone, ownerId || null, id, 'supervisor'];
    if (password && password.trim() !== '') {
      const hashed = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET name = $1, username = $2, phone = $3, password = $4, owner_id = $5 WHERE id = $6 AND role = $7';
      params.splice(3, 0, hashed);
    }
    await pool.query(query, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur mise à jour superviseur' });
  }
});

// Supprimer un superviseur
app.delete('/api/superadmin/supervisors/:id', authenticateSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'supervisor']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Superviseur non trouvé' });
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur suppression' });
  }
});

// Envoyer un message à un propriétaire
app.post('/api/superadmin/messages', authenticateSuperAdmin, async (req, res) => {
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

// Envoi groupé
app.post('/api/superadmin/messages/bulk', authenticateSuperAdmin, async (req, res) => {
  const { ownerIds, message } = req.body;
  if (!ownerIds || !Array.isArray(ownerIds) || ownerIds.length === 0 || !message) {
    return res.status(400).json({ error: 'Liste de propriétaires et message requis' });
  }
  try {
    const values = ownerIds.map((_, i) => `($${i*3+1}, $${i*3+2}, NOW(), NOW() + INTERVAL '10 minutes')`).join(',');
    const flatParams = ownerIds.flatMap(id => [id, message]);
    await pool.query(`INSERT INTO owner_messages (owner_id, message, created_at, expires_at) VALUES ${values}`, flatParams);
    res.json({ success: true, count: ownerIds.length });
  } catch (err) {
    res.status(500).json({ error: 'Erreur envoi messages' });
  }
});

// Rapport consolidé des propriétaires
app.get('/api/superadmin/reports/owners', authenticateSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email,
             COUNT(DISTINCT ag.id) as agent_count,
             COUNT(t.id) as ticket_count,
             COALESCE(SUM(t.total_amount), 0) as total_bets,
             COALESCE(SUM(t.win_amount), 0) as total_wins,
             COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
      FROM users u
      LEFT JOIN users ag ON u.id = ag.owner_id AND ag.role = 'agent'
      LEFT JOIN tickets t ON u.id = t.owner_id
      WHERE u.role = 'owner'
      GROUP BY u.id, u.name, u.username
      ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Démarrer le serveur
pool.connect().then(() => {
  console.log('✅ Base de données connectée pour SuperAdmin');
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`👑 Serveur SUPERADMIN démarré sur http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Impossible de démarrer le serveur superadmin:', err);
  process.exit(1);
});
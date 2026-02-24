// server.js – Version complète avec toutes les routes
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques (CSS, JS, Images)
app.use(express.static(__dirname));

// ==================== ROUTES POUR LES FICHIERS HTML ====================
// Liste des pages HTML disponibles
const pages = [
    'index',
    'control-level1',
    'control-level2',
    'master-dashboard',
    'subsystem-admin',
    'agent-dashboard',
    'supervisor-dashboard',
    'login'
];

// Route pour servir les pages sans extension .html ou avec
pages.forEach(page => {
    const routeHandler = (req, res) => {
        const filePath = path.join(__dirname, `${page}.html`);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            // Si le fichier spécifique n'existe pas, on laisse passer au middleware 404
            console.warn(`Tentative d'accès à une page inexistante : ${page}.html`);
            res.status(404).json({ success: false, error: 'Page non trouvée' });
        }
    };
    app.get(`/${page}`, routeHandler);
    app.get(`/${page}.html`, routeHandler);
});

// Route de débogage (optionnelle)
app.get('/debug-files', (req, res) => {
    fs.readdir(__dirname, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
            cwd: process.cwd(),
            __dirname,
            files
        });
    });
});

// Connexion PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/nova_lotato',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err) => {
    if (err) {
        console.error('❌ Erreur de connexion à PostgreSQL:', err);
        process.exit(1);
    }
    console.log('✅ Connecté à PostgreSQL');
});

// ==================== MIDDLEWARE D'AUTHENTIFICATION ====================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
    const token = authHeader && authHeader.split(' ')[1] || authHeader;

    if (!token) return res.status(401).json({ success: false, error: 'Token manquant' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const userResult = await pool.query(
            'SELECT id, name, username, email, role, level, subsystem_id, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );
        if (userResult.rows.length === 0) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        const user = userResult.rows[0];
        if (!user.is_active) return res.status(403).json({ success: false, error: 'Compte désactivé' });
        req.user = user;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Token invalide' });
    }
};

const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ success: false, error: 'Non authentifié' });
        if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Accès interdit' });
        next();
    };
};

// ==================== ROUTES D'AUTHENTIFICATION ====================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Identifiants manquants' });

    try {
        const result = await pool.query(
            `SELECT u.*, s.name as subsystem_name, s.subdomain 
             FROM users u 
             LEFT JOIN subsystems s ON u.subsystem_id = s.id 
             WHERE u.username = $1`,
            [username]
        );
        if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
        if (!user.is_active) return res.status(403).json({ success: false, error: 'Compte désactivé' });

        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP, is_online = true WHERE id = $1', [user.id]);
        const token = jwt.sign({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        await pool.query(
            'INSERT INTO activities (user_id, user_name, action, details) VALUES ($1, $2, $3, $4)',
            [user.id, user.name, 'Connexion', `Connexion réussie en tant que ${user.role}`]
        );

        res.json({
            success: true,
            token,
            admin: {
                id: user.id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                level: user.level,
                subsystem_id: user.subsystem_id,
                subsystem_name: user.subsystem_name,
                subdomain: user.subdomain
            }
        });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/auth/check', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.*, s.name as subsystem_name, s.subdomain 
             FROM users u 
             LEFT JOIN subsystems s ON u.subsystem_id = s.id 
             WHERE u.id = $1`,
            [req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        const user = result.rows[0];
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
                subsystem_name: user.subsystem_name,
                subdomain: user.subdomain,
                is_active: user.is_active
            }
        });
    } catch (err) {
        console.error('Erreur check auth:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES SOUS-SYSTÈMES (MASTER) ====================
app.get('/api/master/subsystems', authenticateToken, requireRole('master'), async (req, res) => {
    const { page = 1, limit = 10, search, status } = req.query;
    const offset = (page - 1) * limit;
    try {
        let query = `
            SELECT s.*, 
                   (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id) as total_users,
                   (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id AND is_active = true) as active_users,
                   (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id AND is_online = true) as online_users,
                   (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = s.id AND date >= CURRENT_DATE) as today_sales,
                   (SELECT COUNT(*) FROM tickets WHERE subsystem_id = s.id AND date >= CURRENT_DATE) as today_tickets
            FROM subsystems s
        `;
        const params = [];
        let whereClause = '';
        if (search) {
            whereClause += ` WHERE (s.name ILIKE $${params.length + 1} OR s.subdomain ILIKE $${params.length + 1})`;
            params.push(`%${search}%`);
        }
        if (status && status !== 'all') {
            whereClause += whereClause ? ' AND' : ' WHERE';
            whereClause += ` s.is_active = $${params.length + 1}`;
            params.push(status === 'active');
        }
        query += whereClause + ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        const result = await pool.query(query, params);
        const countQuery = `SELECT COUNT(*) FROM subsystems s${whereClause}`;
        const countResult = await pool.query(countQuery, params.slice(0, -2));
        const total = parseInt(countResult.rows[0].count);
        res.json({ success: true, subsystems: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error('Erreur récupération sous-systèmes:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/master/subsystems', authenticateToken, requireRole('master'), async (req, res) => {
    const { name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_months } = req.body;
    if (!name || !subdomain || !contact_email) return res.status(400).json({ success: false, error: 'Nom, sous-domaine et email requis' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query('SELECT id FROM subsystems WHERE subdomain = $1', [subdomain]);
        if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Ce sous-domaine est déjà utilisé' });
        const expires = new Date();
        expires.setMonth(expires.getMonth() + (subscription_months || 1));
        const subsystemResult = await client.query(
            `INSERT INTO subsystems (name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_expires)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [name, subdomain, contact_email, contact_phone, max_users || 10, subscription_type || 'standard', expires]
        );
        const subsystemId = subsystemResult.rows[0].id;
        const adminUsername = `admin_${subdomain}`;
        const adminPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await client.query(
            `INSERT INTO users (name, username, password, email, role, subsystem_id, is_active)
             VALUES ($1, $2, $3, $4, 'subsystem', $5, true)`,
            [`Administrateur ${name}`, adminUsername, hashedPassword, contact_email, subsystemId]
        );
        const draws = [
            { name: 'Borlette', times: { morning: { hour: 12, minute: 0, time: '12:00' }, evening: { hour: 18, minute: 0, time: '18:00' } } },
            { name: 'Lotto 3', times: { morning: { hour: 12, minute: 30, time: '12:30' }, evening: { hour: 18, minute: 30, time: '18:30' } } },
            { name: 'Lotto 4', times: { morning: { hour: 13, minute: 0, time: '13:00' }, evening: { hour: 19, minute: 0, time: '19:00' } } },
            { name: 'Lotto 5', times: { morning: { hour: 13, minute: 30, time: '13:30' }, evening: { hour: 19, minute: 30, time: '19:30' } } }
        ];
        for (const draw of draws) {
            await client.query(
                `INSERT INTO draws (name, times, subsystem_id) VALUES ($1, $2::jsonb, $3)`,
                [draw.name, JSON.stringify(draw.times), subsystemId]
            );
        }
        await client.query('COMMIT');
        res.json({
            success: true,
            subsystem: { id: subsystemId, name, subdomain },
            admin_credentials: { username: adminUsername, password: adminPassword, email: contact_email },
            access_url: `https://${subdomain}.${req.headers.host}`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur création sous-système:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    } finally {
        client.release();
    }
});

app.get('/api/master/subsystems/:id', authenticateToken, requireRole('master'), async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `SELECT s.*, 
                    (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id) as total_users,
                    (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id AND is_active = true) as active_users,
                    (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id AND is_online = true) as online_users,
                    (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = s.id AND date >= CURRENT_DATE) as today_sales,
                    (SELECT COUNT(*) FROM tickets WHERE subsystem_id = s.id AND date >= CURRENT_DATE) as today_tickets,
                    (SELECT json_agg(json_build_object('user', u)) FROM users u WHERE u.subsystem_id = s.id) as users
             FROM subsystems s WHERE s.id = $1`,
            [id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });
        res.json({ success: true, subsystem: result.rows[0] });
    } catch (err) {
        console.error('Erreur récupération sous-système:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/master/subsystems/:id/deactivate', authenticateToken, requireRole('master'), async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;
    try {
        await pool.query('UPDATE subsystems SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [is_active, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur mise à jour sous-système:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/subsystems/:id/users', authenticateToken, requireRole('master'), async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    try {
        const result = await pool.query(
            `SELECT id, name, username, email, role, level, is_active, last_login, created_at
             FROM users WHERE subsystem_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [id, limit, offset]
        );
        const countResult = await pool.query('SELECT COUNT(*) FROM users WHERE subsystem_id = $1', [id]);
        const total = parseInt(countResult.rows[0].count);
        res.json({ success: true, users: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, total_pages: Math.ceil(total / limit) } });
    } catch (err) {
        console.error('Erreur récupération utilisateurs sous-système:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LE SOUS-SYSTÈME COURANT ====================
app.get('/api/subsystems/mine', authenticateToken, requireRole('subsystem', 'supervisor', 'agent'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(404).json({ success: false, error: 'Aucun sous-système associé' });
    try {
        const result = await pool.query('SELECT * FROM subsystems WHERE id = $1', [subsystemId]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });
        res.json({ success: true, subsystems: [result.rows[0]] });
    } catch (err) {
        console.error('Erreur récupération sous-système mine:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/subsystem/stats', authenticateToken, requireRole('subsystem', 'supervisor'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(400).json({ success: false, error: 'Pas de sous-système' });
    try {
        const usersResult = await pool.query(
            `SELECT COUNT(*) as total_users,
                    SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_users,
                    SUM(CASE WHEN is_online THEN 1 ELSE 0 END) as online_users,
                    SUM(CASE WHEN role = 'agent' AND is_online THEN 1 ELSE 0 END) as online_agents,
                    SUM(CASE WHEN role = 'supervisor' AND is_online THEN 1 ELSE 0 END) as online_supervisors
             FROM users WHERE subsystem_id = $1`,
            [subsystemId]
        );
        const maxUsersResult = await pool.query('SELECT max_users FROM subsystems WHERE id = $1', [subsystemId]);
        const maxUsers = maxUsersResult.rows[0]?.max_users || 10;
        const today = new Date().toISOString().split('T')[0];
        const ticketsResult = await pool.query(
            `SELECT COUNT(*) as today_tickets,
                    COALESCE(SUM(total), 0) as today_sales,
                    COALESCE(SUM(CASE WHEN is_synced = false THEN 1 ELSE 0 END), 0) as pending_issues
             FROM tickets WHERE subsystem_id = $1 AND date::date = $2`,
            [subsystemId, today]
        );
        const payoutResult = await pool.query(
            `SELECT COALESCE(SUM(total_winnings), 0) as pending_payout
             FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id
             WHERE t.subsystem_id = $1 AND wr.paid = false`,
            [subsystemId]
        );
        const stats = {
            ...usersResult.rows[0],
            max_users: maxUsers,
            ...ticketsResult.rows[0],
            ...payoutResult.rows[0],
            usage_percentage: maxUsers > 0 ? Math.round((usersResult.rows[0].active_users / maxUsers) * 100) : 0
        };
        res.json({ success: true, stats });
    } catch (err) {
        console.error('Erreur stats sous-système:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES UTILISATEURS (SOUS-SYSTÈME) ====================
app.get('/api/subsystem/users', authenticateToken, requireRole('subsystem', 'supervisor2', 'supervisor'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(400).json({ success: false, error: 'Pas de sous-système' });
    const { role, supervisor_id, limit = 100, search } = req.query;
    try {
        let query = `
            SELECT u.*, 
                   s1.name as supervisor_name, 
                   s2.name as supervisor2_name,
                   (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE agent_id = u.id AND date >= CURRENT_DATE) as total_sales
            FROM users u
            LEFT JOIN users s1 ON u.supervisor1_id = s1.id
            LEFT JOIN users s2 ON u.supervisor2_id = s2.id
            WHERE u.subsystem_id = $1
        `;
        const params = [subsystemId];
        let paramIndex = 2;
        if (role) {
            query += ` AND u.role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }
        if (supervisor_id) {
            query += ` AND (u.supervisor1_id = $${paramIndex} OR u.supervisor2_id = $${paramIndex})`;
            params.push(supervisor_id);
            paramIndex++;
        }
        if (search) {
            query += ` AND (u.name ILIKE $${paramIndex} OR u.username ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex}`;
        params.push(limit);
        const result = await pool.query(query, params);
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error('Erreur récupération utilisateurs:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/subsystem/users/create', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(400).json({ success: false, error: 'Pas de sous-système' });
    const { name, username, password, role, level, supervisor1Id, supervisor2Id } = req.body;
    if (!name || !username || !password || !role) {
        return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE username = $1 AND subsystem_id = $2', [username, subsystemId]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Nom d\'utilisateur déjà utilisé' });
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query(
            `INSERT INTO users (name, username, password, email, role, level, subsystem_id, supervisor1_id, supervisor2_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [name, username, hashedPassword, null, role, level || null, subsystemId, supervisor1Id || null, supervisor2Id || null]
        );
        res.json({ success: true, user: { id: result.rows[0].id, name, username, role } });
    } catch (err) {
        console.error('Erreur création utilisateur:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/subsystem/users/:userId', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const userId = req.params.userId;
    const { name, is_active, password } = req.body;
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND subsystem_id = $2', [userId, subsystemId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        let query = 'UPDATE users SET name = $1, is_active = $2';
        const params = [name, is_active];
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            query += ', password = $' + (params.length + 1);
            params.push(hashed);
        }
        query += ', updated_at = CURRENT_TIMESTAMP WHERE id = $' + (params.length + 1) + ' RETURNING id';
        params.push(userId);
        await pool.query(query, params);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur mise à jour utilisateur:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/subsystem/users/:userId/status', authenticateToken, requireRole('subsystem', 'supervisor2'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const userId = req.params.userId;
    const { is_active } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND subsystem_id = $3 RETURNING id',
            [is_active, userId, subsystemId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur changement statut:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/subsystem/users/:userId', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const userId = req.params.userId;
    try {
        const userCheck = await pool.query('SELECT role FROM users WHERE id = $1 AND subsystem_id = $2', [userId, subsystemId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        if (userCheck.rows[0].role === 'subsystem') return res.status(403).json({ success: false, error: 'Impossible de supprimer le propriétaire' });
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression utilisateur:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/subsystem/assign', authenticateToken, requireRole('subsystem', 'supervisor2'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { userId, supervisorId, supervisorType } = req.body;
    try {
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND subsystem_id = $2', [userId, subsystemId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Agent non trouvé' });
        const supervisorCheck = await pool.query('SELECT id FROM users WHERE id = $1 AND subsystem_id = $2', [supervisorId, subsystemId]);
        if (supervisorCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Superviseur non trouvé' });
        const field = supervisorType === 'supervisor1' ? 'supervisor1_id' : 'supervisor2_id';
        await pool.query(`UPDATE users SET ${field} = $1 WHERE id = $2`, [supervisorId, userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur assignation:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES TIRAGES ====================
app.get('/api/draws', authenticateToken, async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(400).json({ success: false, error: 'Pas de sous-système' });
    try {
        const result = await pool.query('SELECT * FROM draws WHERE subsystem_id = $1', [subsystemId]);
        const draws = {};
        result.rows.forEach(row => {
            draws[row.name] = { name: row.name, times: row.times, is_active: row.is_active };
        });
        res.json({ success: true, draws });
    } catch (err) {
        console.error('Erreur récupération tirages:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES TICKETS ====================
app.post('/api/tickets', authenticateToken, requireRole('agent'), async (req, res) => {
    const { draw, draw_time, bets, total, date } = req.body;
    const agentId = req.user.id;
    const agentName = req.user.name;
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(400).json({ success: false, error: 'Compte non lié à un sous-système' });
    if (!draw || !draw_time || !bets || !total) return res.status(400).json({ success: false, error: 'Données incomplètes' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const seqResult = await client.query(`SELECT nextval('ticket_number_seq') as number`);
        const ticketNumber = seqResult.rows[0].number;
        const ticketDate = date || new Date().toISOString();
        const ticketResult = await client.query(
            `INSERT INTO tickets (number, draw, draw_time, total, agent_id, agent_name, subsystem_id, date, is_synced, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP) RETURNING id`,
            [ticketNumber, draw, draw_time, total, agentId, agentName, subsystemId, ticketDate]
        );
        const ticketId = ticketResult.rows[0].id;
        for (const bet of bets) {
            await client.query(
                `INSERT INTO bets (ticket_id, type, name, number, amount, multiplier, options, is_group, details, per_option_amount, is_lotto4, is_lotto5)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11, $12)`,
                [
                    ticketId,
                    bet.type,
                    bet.name,
                    bet.number,
                    bet.amount,
                    bet.multiplier,
                    bet.options ? JSON.stringify(bet.options) : null,
                    bet.isGroup || false,
                    bet.details ? JSON.stringify(bet.details) : null,
                    bet.perOptionAmount,
                    bet.isLotto4 || false,
                    bet.isLotto5 || false
                ]
            );
        }
        await client.query('COMMIT');
        const newTicket = await client.query(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
        res.json({ success: true, ticket: newTicket.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erreur création ticket:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    } finally {
        client.release();
    }
});

app.get('/api/tickets', authenticateToken, async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    if (!subsystemId) return res.status(400).json({ success: false, error: 'Pas de sous-système' });
    const { agent, date, start, end, limit = 50 } = req.query;
    try {
        let query = `
            SELECT t.*, u.name as agent_name
            FROM tickets t
            LEFT JOIN users u ON t.agent_id = u.id
            WHERE t.subsystem_id = $1
        `;
        const params = [subsystemId];
        let paramIndex = 2;
        if (agent) {
            query += ` AND t.agent_id = $${paramIndex}`;
            params.push(agent);
            paramIndex++;
        }
        if (date) {
            query += ` AND t.date::date = $${paramIndex}`;
            params.push(date);
            paramIndex++;
        }
        if (start) {
            query += ` AND t.date >= $${paramIndex}`;
            params.push(start);
            paramIndex++;
        }
        if (end) {
            query += ` AND t.date <= $${paramIndex}`;
            params.push(end);
            paramIndex++;
        }
        query += ` ORDER BY t.date DESC LIMIT $${paramIndex}`;
        params.push(limit);
        const result = await pool.query(query, params);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('Erreur récupération tickets:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/:id', authenticateToken, async (req, res) => {
    const ticketId = req.params.id;
    const subsystemId = req.user.subsystem_id;
    try {
        const result = await pool.query(
            `SELECT t.*, u.name as agent_name
             FROM tickets t
             LEFT JOIN users u ON t.agent_id = u.id
             WHERE t.id = $1 AND t.subsystem_id = $2`,
            [ticketId, subsystemId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });
        const ticket = result.rows[0];
        const betsResult = await pool.query('SELECT * FROM bets WHERE ticket_id = $1', [ticketId]);
        ticket.bets = betsResult.rows;
        res.json({ success: true, ticket });
    } catch (err) {
        console.error('Erreur récupération ticket:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/tickets/:id', authenticateToken, async (req, res) => {
    const ticketId = req.params.id;
    const subsystemId = req.user.subsystem_id;
    try {
        const ticketCheck = await pool.query(
            'SELECT id, date FROM tickets WHERE id = $1 AND subsystem_id = $2',
            [ticketId, subsystemId]
        );
        if (ticketCheck.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });
        const ticketDate = new Date(ticketCheck.rows[0].date);
        const now = new Date();
        const minutesDiff = (now - ticketDate) / (1000 * 60);
        if (minutesDiff > 15) return res.status(403).json({ success: false, error: 'Suppression impossible après 15 minutes' });
        await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression ticket:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/pending', authenticateToken, async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { agent } = req.query;
    try {
        let query = `
            SELECT t.*, u.name as agent_name
            FROM tickets t
            LEFT JOIN users u ON t.agent_id = u.id
            WHERE t.subsystem_id = $1 AND t.is_synced = false
        `;
        const params = [subsystemId];
        if (agent) {
            query += ` AND t.agent_id = $2`;
            params.push(agent);
        }
        query += ` ORDER BY t.date DESC`;
        const result = await pool.query(query, params);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('Erreur récupération tickets en attente:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/tickets/:id/sync', authenticateToken, requireRole('subsystem', 'supervisor'), async (req, res) => {
    const ticketId = req.params.id;
    const subsystemId = req.user.subsystem_id;
    try {
        const result = await pool.query(
            `UPDATE tickets SET is_synced = true, synced_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND subsystem_id = $2 RETURNING id`,
            [ticketId, subsystemId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur synchronisation ticket:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/winning', authenticateToken, async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { agent, date, start, end, paid } = req.query;
    try {
        let query = `
            SELECT wr.*, t.number as ticket_number, t.draw, t.draw_time, t.date, t.agent_id, u.name as agent_name
            FROM winning_records wr
            JOIN tickets t ON wr.ticket_id = t.id
            LEFT JOIN users u ON t.agent_id = u.id
            WHERE t.subsystem_id = $1
        `;
        const params = [subsystemId];
        let paramIndex = 2;
        if (agent) {
            query += ` AND t.agent_id = $${paramIndex}`;
            params.push(agent);
            paramIndex++;
        }
        if (date) {
            query += ` AND t.date::date = $${paramIndex}`;
            params.push(date);
            paramIndex++;
        }
        if (start) {
            query += ` AND t.date >= $${paramIndex}`;
            params.push(start);
            paramIndex++;
        }
        if (end) {
            query += ` AND t.date <= $${paramIndex}`;
            params.push(end);
            paramIndex++;
        }
        if (paid !== undefined) {
            query += ` AND wr.paid = $${paramIndex}`;
            params.push(paid === 'true');
            paramIndex++;
        }
        query += ` ORDER BY t.date DESC`;
        const result = await pool.query(query, params);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('Erreur récupération tickets gagnants:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/winners/:id/pay', authenticateToken, requireRole('subsystem', 'supervisor'), async (req, res) => {
    const winnerId = req.params.id;
    try {
        const result = await pool.query(
            `UPDATE winning_records SET paid = true, paid_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
            [winnerId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Enregistrement gagnant non trouvé' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur marquage payé:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES RÉSULTATS ====================
app.get('/api/results', authenticateToken, async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { draw, time, date, limit = 10 } = req.query;
    try {
        let query = 'SELECT * FROM results WHERE subsystem_id = $1';
        const params = [subsystemId];
        let paramIndex = 2;
        if (draw) {
            query += ` AND draw = $${paramIndex}`;
            params.push(draw);
            paramIndex++;
        }
        if (time) {
            query += ` AND time = $${paramIndex}`;
            params.push(time);
            paramIndex++;
        }
        if (date) {
            query += ` AND date = $${paramIndex}`;
            params.push(date);
            paramIndex++;
        }
        query += ` ORDER BY date DESC, time DESC LIMIT $${paramIndex}`;
        params.push(limit);
        const result = await pool.query(query, params);
        if (draw && time && date) {
            res.json({ success: true, result: result.rows[0] || null });
        } else {
            const resultsObj = {};
            result.rows.forEach(row => {
                if (!resultsObj[row.draw]) resultsObj[row.draw] = {};
                resultsObj[row.draw][row.time] = row;
            });
            res.json({ success: true, results: resultsObj });
        }
    } catch (err) {
        console.error('Erreur récupération résultats:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/results', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { draw, time, date, lot1, lot2, lot3, verified } = req.body;
    if (!draw || !time || !date || !lot1) return res.status(400).json({ success: false, error: 'Données incomplètes' });
    try {
        const result = await pool.query(
            `INSERT INTO results (draw, time, date, lot1, lot2, lot3, verified, subsystem_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (draw, time, date, subsystem_id) DO UPDATE
             SET lot1 = EXCLUDED.lot1, lot2 = EXCLUDED.lot2, lot3 = EXCLUDED.lot3, verified = EXCLUDED.verified, updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [draw, time, date, lot1, lot2 || null, lot3 || null, verified || false, subsystemId]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Erreur enregistrement résultat:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/results', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { draw, time, date } = req.query;
    if (!draw || !time || !date) return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    try {
        const result = await pool.query(
            'DELETE FROM results WHERE draw = $1 AND time = $2 AND date = $3 AND subsystem_id = $4 RETURNING id',
            [draw, time, date, subsystemId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Résultat non trouvé' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression résultat:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES RESTRICTIONS ====================
app.get('/api/restrictions', authenticateToken, requireRole('subsystem', 'supervisor'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { draw, time } = req.query;
    try {
        let query = 'SELECT * FROM restrictions WHERE subsystem_id = $1';
        const params = [subsystemId];
        let paramIndex = 2;
        if (draw) {
            query += ` AND (draw = 'all' OR draw = $${paramIndex})`;
            params.push(draw);
            paramIndex++;
        }
        if (time) {
            query += ` AND (time = 'all' OR time = $${paramIndex})`;
            params.push(time);
            paramIndex++;
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        res.json({ success: true, restrictions: result.rows });
    } catch (err) {
        console.error('Erreur récupération restrictions:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/restrictions', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { number, type, limitAmount, draw, time } = req.body;
    if (!number || !type) return res.status(400).json({ success: false, error: 'Données manquantes' });
    try {
        const result = await pool.query(
            `INSERT INTO restrictions (number, type, limit_amount, draw, time, subsystem_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [number, type, limitAmount || null, draw || 'all', time || 'all', subsystemId]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Erreur création restriction:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/restrictions/:id', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const restrictionId = req.params.id;
    const subsystemId = req.user.subsystem_id;
    const { number, type, limitAmount, draw, time } = req.body;
    try {
        const result = await pool.query(
            `UPDATE restrictions SET number = $1, type = $2, limit_amount = $3, draw = $4, time = $5, updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 AND subsystem_id = $7 RETURNING id`,
            [number, type, limitAmount || null, draw || 'all', time || 'all', restrictionId, subsystemId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Restriction non trouvée' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur mise à jour restriction:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/restrictions/:id', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const restrictionId = req.params.id;
    const subsystemId = req.user.subsystem_id;
    try {
        const result = await pool.query(
            'DELETE FROM restrictions WHERE id = $1 AND subsystem_id = $2 RETURNING id',
            [restrictionId, subsystemId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Restriction non trouvée' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression restriction:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES NOTIFICATIONS ====================
app.get('/api/notifications', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY timestamp DESC',
            [userId]
        );
        res.json({ success: true, notifications: result.rows });
    } catch (err) {
        console.error('Erreur récupération notifications:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/notifications/unread-count', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
            [userId]
        );
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (err) {
        console.error('Erreur compteur notifications:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    const notificationId = req.params.id;
    const userId = req.user.id;
    try {
        const result = await pool.query(
            'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING id',
            [notificationId, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Notification non trouvée' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur marquage notification lue:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    const notificationId = req.params.id;
    const userId = req.user.id;
    try {
        const result = await pool.query(
            'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
            [notificationId, userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Notification non trouvée' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression notification:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.delete('/api/notifications/clear', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur effacement notifications:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur marquage toutes lues:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES ACTIVITÉS ====================
app.get('/api/subsystem/activities', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { limit = 50 } = req.query;
    try {
        const result = await pool.query(
            `SELECT a.*, u.name as user_name
             FROM activities a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE u.subsystem_id = $1 OR a.user_id IS NULL
             ORDER BY a.timestamp DESC
             LIMIT $2`,
            [subsystemId, limit]
        );
        res.json({ success: true, activities: result.rows });
    } catch (err) {
        console.error('Erreur récupération activités:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES RAPPORTS ====================
app.get('/api/reports/daily', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'Date requise' });
    try {
        const ticketsResult = await pool.query(
            `SELECT t.*, u.name as agent_name
             FROM tickets t
             LEFT JOIN users u ON t.agent_id = u.id
             WHERE t.subsystem_id = $1 AND t.date::date = $2`,
            [subsystemId, date]
        );
        const tickets = ticketsResult.rows;
        const totalTickets = tickets.length;
        const totalSales = tickets.reduce((sum, t) => sum + t.total, 0);
        const agentsMap = {};
        tickets.forEach(t => {
            const agentId = t.agent_id;
            if (!agentsMap[agentId]) {
                agentsMap[agentId] = { agent_id: agentId, name: t.agent_name, tickets: 0, sales: 0 };
            }
            agentsMap[agentId].tickets++;
            agentsMap[agentId].sales += t.total;
        });
        const agents = Object.values(agentsMap);
        res.json({ success: true, report: { date, totalTickets, totalSales, agents } });
    } catch (err) {
        console.error('Erreur rapport quotidien:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/reports/monthly', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ success: false, error: 'Mois requis' });
    try {
        const startDate = month + '-01';
        const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];
        const ticketsResult = await pool.query(
            `SELECT t.*, u.name as agent_name
             FROM tickets t
             LEFT JOIN users u ON t.agent_id = u.id
             WHERE t.subsystem_id = $1 AND t.date::date BETWEEN $2 AND $3
             ORDER BY t.date ASC`,
            [subsystemId, startDate, endDate]
        );
        const tickets = ticketsResult.rows;
        const totalTickets = tickets.length;
        const totalSales = tickets.reduce((sum, t) => sum + t.total, 0);
        const dailyMap = {};
        tickets.forEach(t => {
            const day = t.date.toISOString().split('T')[0];
            if (!dailyMap[day]) {
                dailyMap[day] = { date: day, tickets: 0, sales: 0 };
            }
            dailyMap[day].tickets++;
            dailyMap[day].sales += t.total;
        });
        const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
        res.json({ success: true, report: { month, totalTickets, totalSales, daily } });
    } catch (err) {
        console.error('Erreur rapport mensuel:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/reports/agent', authenticateToken, requireRole('subsystem'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { agentId, period } = req.query;
    if (!agentId) return res.status(400).json({ success: false, error: 'ID agent requis' });
    try {
        let startDate, endDate;
        const now = new Date();
        if (period === 'today') {
            startDate = new Date(now.setHours(0,0,0,0)).toISOString();
            endDate = new Date(now.setHours(23,59,59,999)).toISOString();
        } else if (period === 'week') {
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startDate = new Date(startOfWeek.setHours(0,0,0,0)).toISOString();
            endDate = new Date(now.setHours(23,59,59,999)).toISOString();
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23,59,59,999).toISOString();
        } else {
            return res.status(400).json({ success: false, error: 'Période invalide' });
        }
        const agentResult = await pool.query('SELECT name, username FROM users WHERE id = $1', [agentId]);
        if (agentResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Agent non trouvé' });
        const agent = agentResult.rows[0];
        const ticketsResult = await pool.query(
            `SELECT * FROM tickets WHERE agent_id = $1 AND subsystem_id = $2 AND date BETWEEN $3 AND $4 ORDER BY date DESC`,
            [agentId, subsystemId, startDate, endDate]
        );
        const tickets = ticketsResult.rows;
        const totalTickets = tickets.length;
        const totalSales = tickets.reduce((sum, t) => sum + t.total, 0);
        res.json({ success: true, report: { agent: { name: agent.name, username: agent.username }, period, totalTickets, totalSales, tickets } });
    } catch (err) {
        console.error('Erreur rapport agent:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/consolidated-report', authenticateToken, requireRole('master'), async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        const subsystems = await pool.query('SELECT id, name FROM subsystems WHERE is_active = true');
        const subsystemIds = subsystems.rows.map(s => s.id);
        const ticketsResult = await pool.query(
            `SELECT t.*, s.name as subsystem_name
             FROM tickets t
             JOIN subsystems s ON t.subsystem_id = s.id
             WHERE t.subsystem_id = ANY($1::int[]) AND t.date::date BETWEEN $2 AND $3`,
            [subsystemIds, start_date, end_date]
        );
        const tickets = ticketsResult.rows;
        const summary = { total_tickets: tickets.length, total_sales: tickets.reduce((sum, t) => sum + t.total, 0), total_payout: 0 };
        const subsystemsDetail = {};
        tickets.forEach(t => {
            if (!subsystemsDetail[t.subsystem_id]) {
                subsystemsDetail[t.subsystem_id] = { subsystem_id: t.subsystem_id, subsystem_name: t.subsystem_name, tickets_count: 0, total_sales: 0, total_payout: 0, profit: 0 };
            }
            subsystemsDetail[t.subsystem_id].tickets_count++;
            subsystemsDetail[t.subsystem_id].total_sales += t.total;
        });
        for (const subId in subsystemsDetail) {
            const payoutResult = await pool.query(
                `SELECT COALESCE(SUM(total_winnings), 0) as total_payout
                 FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id
                 WHERE t.subsystem_id = $1 AND t.date::date BETWEEN $2 AND $3`,
                [subId, start_date, end_date]
            );
            subsystemsDetail[subId].total_payout = parseInt(payoutResult.rows[0].total_payout);
            subsystemsDetail[subId].profit = subsystemsDetail[subId].total_sales - subsystemsDetail[subId].total_payout;
        }
        const dailyBreakdown = {};
        tickets.forEach(t => {
            const day = t.date.toISOString().split('T')[0];
            if (!dailyBreakdown[day]) dailyBreakdown[day] = { date: day, ticket_count: 0, total_amount: 0 };
            dailyBreakdown[day].ticket_count++;
            dailyBreakdown[day].total_amount += t.total;
        });
        const daily = Object.values(dailyBreakdown).sort((a, b) => a.date.localeCompare(b.date));
        res.json({
            success: true,
            report: {
                period: { start_date, end_date },
                total_subsystems: subsystems.rows.length,
                summary,
                subsystems_detail: Object.values(subsystemsDetail),
                daily_breakdown: daily
            }
        });
    } catch (err) {
        console.error('Erreur rapport consolidé:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES STATISTIQUES MASTER ====================
app.get('/api/master/revenue/month', authenticateToken, requireRole('master'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT COALESCE(SUM(total), 0) as revenue
             FROM tickets WHERE date >= date_trunc('month', CURRENT_DATE)`
        );
        res.json({ success: true, revenue: parseInt(result.rows[0].revenue) });
    } catch (err) {
        console.error('Erreur revenue month:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/trends', authenticateToken, requireRole('master'), async (req, res) => {
    try {
        const currentMonth = await pool.query(
            `SELECT COUNT(DISTINCT id) as subsystems,
                    (SELECT COUNT(*) FROM users WHERE role != 'master') as total_users,
                    COALESCE(SUM(total), 0) as revenue
             FROM tickets WHERE date >= date_trunc('month', CURRENT_DATE)`
        );
        const lastMonth = await pool.query(
            `SELECT COUNT(DISTINCT id) as subsystems,
                    (SELECT COUNT(*) FROM users WHERE role != 'master') as total_users,
                    COALESCE(SUM(total), 0) as revenue
             FROM tickets WHERE date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
               AND date < date_trunc('month', CURRENT_DATE)`
        );
        const calcTrend = (current, last) => {
            if (last == 0) return { direction: 'up', percent: 100 };
            const percent = ((current - last) / last) * 100;
            return { direction: percent >= 0 ? 'up' : 'down', percent: Math.abs(Math.round(percent)) };
        };
        res.json({
            success: true,
            subsystems: calcTrend(currentMonth.rows[0].subsystems, lastMonth.rows[0].subsystems),
            users: calcTrend(currentMonth.rows[0].total_users, lastMonth.rows[0].total_users),
            revenue: calcTrend(currentMonth.rows[0].revenue, lastMonth.rows[0].revenue),
            activity: { direction: 'up', percent: 5 }
        });
    } catch (err) {
        console.error('Erreur trends:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/quick-stats', authenticateToken, requireRole('master'), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await pool.query(
            `SELECT 
                (SELECT COUNT(*) FROM tickets WHERE date::date = $1) as today_tickets,
                (SELECT COUNT(*) FROM users WHERE is_online = true) as online_users,
                (SELECT COUNT(*) FROM subsystems WHERE subscription_expires < CURRENT_DATE + INTERVAL '7 days' AND subscription_expires > CURRENT_DATE) as expiring_soon,
                (SELECT COUNT(*) FROM users WHERE is_active = false) as system_alerts`,
            [today]
        );
        res.json({ success: true, ...result.rows[0] });
    } catch (err) {
        console.error('Erreur quick stats:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/revenue/daily', authenticateToken, requireRole('master'), async (req, res) => {
    const { days = 30 } = req.query;
    try {
        const result = await pool.query(
            `SELECT date::date as day, COALESCE(SUM(total), 0) as revenue
             FROM tickets WHERE date >= CURRENT_DATE - ($1 || ' days')::interval
             GROUP BY date::date ORDER BY date::date ASC`,
            [days]
        );
        const labels = [];
        const values = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            const dayStr = d.toISOString().split('T')[0];
            labels.push(dayStr.slice(5));
            const found = result.rows.find(r => r.day.toISOString().split('T')[0] === dayStr);
            values.push(found ? parseInt(found.revenue) : 0);
        }
        res.json({ success: true, labels, values });
    } catch (err) {
        console.error('Erreur revenue daily:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/subsystems/stats', authenticateToken, requireRole('master'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.id, s.name, s.subdomain,
                    (SELECT COUNT(*) FROM users WHERE subsystem_id = s.id AND role = 'agent' AND is_active = true) as active_agents,
                    (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE subsystem_id = s.id) as total_sales,
                    (SELECT COALESCE(SUM(total_winnings), 0) FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id WHERE t.subsystem_id = s.id) as total_payout
             FROM subsystems s WHERE s.is_active = true`
        );
        res.json({ success: true, subsystems: result.rows });
    } catch (err) {
        console.error('Erreur stats sous-systèmes:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/global/profit/daily', authenticateToken, requireRole('master'), async (req, res) => {
    const { days = 30 } = req.query;
    try {
        const result = await pool.query(
            `SELECT date::date as day,
                    COALESCE(SUM(total), 0) as sales,
                    COALESCE((SELECT SUM(total_winnings) FROM winning_records wr WHERE wr.ticket_id IN (SELECT id FROM tickets WHERE date::date = t.date::date)), 0) as payout
             FROM tickets t
             WHERE date >= CURRENT_DATE - ($1 || ' days')::interval
             GROUP BY date::date ORDER BY date::date ASC`,
            [days]
        );
        const labels = [];
        const values = [];
        for (let i = 0; i < days; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            const dayStr = d.toISOString().split('T')[0];
            labels.push(dayStr.slice(5));
            const found = result.rows.find(r => r.day.toISOString().split('T')[0] === dayStr);
            const profit = found ? parseInt(found.sales) - parseInt(found.payout) : 0;
            values.push(profit);
        }
        res.json({ success: true, labels, values });
    } catch (err) {
        console.error('Erreur profit daily:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/games/distribution', authenticateToken, requireRole('master'), async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.type, COALESCE(SUM(b.amount), 0) as total
             FROM bets b
             JOIN tickets t ON b.ticket_id = t.id
             WHERE t.date >= date_trunc('month', CURRENT_DATE)
             GROUP BY b.type`
        );
        const games = [];
        const sales = [];
        result.rows.forEach(row => {
            games.push(row.type);
            sales.push(parseInt(row.total));
        });
        res.json({ success: true, games, sales });
    } catch (err) {
        console.error('Erreur distribution jeux:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES AGENTS ET SUPERVISEURS ====================
app.get('/api/agents', authenticateToken, requireRole('master', 'subsystem'), async (req, res) => {
    const { detailed = false } = req.query;
    const subsystemId = req.user.role === 'master' ? null : req.user.subsystem_id;
    try {
        let query = `
            SELECT u.id, u.name, u.username, u.email, u.is_online, u.last_login,
                   (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE agent_id = u.id) as total_sales,
                   (SELECT COUNT(*) FROM tickets WHERE agent_id = u.id) as total_tickets,
                   (SELECT COALESCE(SUM(total_winnings), 0) FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id WHERE t.agent_id = u.id) as total_payout,
                   (SELECT COUNT(*) FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id WHERE t.agent_id = u.id) as winning_tickets,
                   s.name as subsystem_name
            FROM users u
            LEFT JOIN subsystems s ON u.subsystem_id = s.id
            WHERE u.role = 'agent'
        `;
        const params = [];
        if (subsystemId) {
            query += ' AND u.subsystem_id = $1';
            params.push(subsystemId);
        }
        query += ' ORDER BY u.created_at DESC';
        const result = await pool.query(query, params);
        res.json({ success: true, agents: result.rows });
    } catch (err) {
        console.error('Erreur récupération agents:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/supervisors', authenticateToken, requireRole('master'), async (req, res) => {
    const { detailed = false } = req.query;
    try {
        const result = await pool.query(
            `SELECT u.*, s.name as subsystem_name,
                    (SELECT COUNT(*) FROM users WHERE supervisor1_id = u.id OR supervisor2_id = u.id) as agents_count,
                    (SELECT COALESCE(SUM(total), 0) FROM tickets WHERE agent_id IN (SELECT id FROM users WHERE supervisor1_id = u.id OR supervisor2_id = u.id)) as total_sales,
                    (SELECT COALESCE(SUM(total_winnings), 0) FROM winning_records wr JOIN tickets t ON wr.ticket_id = t.id WHERE t.agent_id IN (SELECT id FROM users WHERE supervisor1_id = u.id OR supervisor2_id = u.id)) as total_payout
             FROM users u
             LEFT JOIN subsystems s ON u.subsystem_id = s.id
             WHERE u.role = 'supervisor'`
        );
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error('Erreur récupération superviseurs:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES TICKETS DU SOUS-SYSTÈME (superviseur) ====================
app.get('/api/subsystem/tickets', authenticateToken, requireRole('subsystem', 'supervisor2'), async (req, res) => {
    const subsystemId = req.user.subsystem_id;
    const { start_date, end_date, agent_id, agent_ids, limit = 50, period } = req.query;
    try {
        let query = `
            SELECT t.*, u.name as agent_name
            FROM tickets t
            LEFT JOIN users u ON t.agent_id = u.id
            WHERE t.subsystem_id = $1
        `;
        const params = [subsystemId];
        let paramIndex = 2;
        if (period === 'today') {
            query += ` AND t.date::date = CURRENT_DATE`;
        } else if (start_date && end_date) {
            query += ` AND t.date::date BETWEEN $${paramIndex} AND $${paramIndex+1}`;
            params.push(start_date, end_date);
            paramIndex += 2;
        }
        if (agent_id) {
            query += ` AND t.agent_id = $${paramIndex}`;
            params.push(agent_id);
            paramIndex++;
        }
        if (agent_ids) {
            const ids = agent_ids.split(',').map(id => parseInt(id));
            query += ` AND t.agent_id = ANY($${paramIndex}::int[])`;
            params.push(ids);
            paramIndex++;
        }
        query += ` ORDER BY t.date DESC LIMIT $${paramIndex}`;
        params.push(limit);
        const result = await pool.query(query, params);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('Erreur récupération tickets sous-système:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ==================== ROUTES POUR LES INFORMATIONS ENTREPRISE ====================
app.get('/api/company-info', async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'company_info'");
        if (result.rows.length > 0) {
            res.json(JSON.parse(result.rows[0].value));
        } else {
            res.json({ name: "Nova Lotto", phone: "+509 32 53 49 58", address: "Cap Haïtien", reportTitle: "Nova Lotto", reportPhone: "40104585" });
        }
    } catch (err) {
        console.error('Erreur company-info:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/logo', async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'logo_url'");
        const logoUrl = result.rows.length > 0 ? result.rows[0].value : 'logo-borlette.jpg';
        res.json({ success: true, logoUrl });
    } catch (err) {
        console.error('Erreur logo:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ==================== ROUTE HEALTH ====================
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rediriger la racine vers index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ==================== GESTION DES ERREURS 404 ====================
app.use((req, res) => {
    console.log('404 - Route non trouvée:', req.originalUrl);
    res.status(404).json({ success: false, error: 'Route non trouvée' });
});

// ==================== DÉMARRAGE DU SERVEUR ====================
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📅 Accès: http://localhost:${PORT}`);
});
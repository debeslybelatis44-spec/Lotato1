// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // sert index.html, agent1.html, etc.

// Connexion PostgreSQL (Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

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
    if (req.user.role !== role) {
        return res.status(403).json({ error: 'Accès interdit' });
    }
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
        if (user.role === 'agent' || user.role === 'supervisor') {
            payload.ownerId = user.owner_id;
        } else if (user.role === 'owner') {
            payload.ownerId = user.id;
        }

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

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

// ==================== Routes communes ====================
app.get('/api/draws', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            'SELECT id, name, time, color, active FROM draws WHERE owner_id = $1 ORDER BY time',
            [ownerId]
        );
        res.json({ draws: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/blocked-numbers/global', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            'SELECT number FROM blocked_numbers WHERE owner_id = $1 AND global = true',
            [ownerId]
        );
        res.json({ blockedNumbers: result.rows.map(r => r.number) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/blocked-numbers/draw/:drawId', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    const { drawId } = req.params;
    try {
        const result = await pool.query(
            'SELECT number FROM blocked_numbers WHERE owner_id = $1 AND draw_id = $2 AND global = false',
            [ownerId, drawId]
        );
        res.json({ blockedNumbers: result.rows.map(r => r.number) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/tickets/save', authenticate, async (req, res) => {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    const ownerId = req.user.ownerId;
    const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
    try {
        const result = await pool.query(
            `INSERT INTO tickets (owner_id, agent_id, agent_name, draw_id, draw_name, ticket_id, total_amount, bets, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id`,
            [ownerId, agentId, agentName, drawId, drawName, ticketId, total, JSON.stringify(bets)]
        );
        res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, ...req.body } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur sauvegarde ticket' });
    }
});

app.get('/api/tickets', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    const { agentId } = req.query;
    let query = 'SELECT * FROM tickets WHERE owner_id = $1';
    const params = [ownerId];
    if (agentId) {
        query += ' AND agent_id = $2 ORDER BY date DESC';
        params.push(agentId);
    } else {
        query += ' ORDER BY date DESC';
    }
    try {
        const result = await pool.query(query, params);
        res.json({ tickets: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur chargement tickets' });
    }
});

app.delete('/api/tickets/:id', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    const ticketId = req.params.id;
    try {
        const ticket = await pool.query(
            'SELECT date FROM tickets WHERE id = $1 AND owner_id = $2',
            [ticketId, ownerId]
        );
        if (ticket.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket introuvable' });
        }
        const date = new Date(ticket.rows[0].date);
        const now = new Date();
        const diffMinutes = (now - date) / (1000 * 60);
        if (diffMinutes > 3) {
            return res.status(403).json({ error: 'Délai de suppression dépassé (3 min)' });
        }
        await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

// ==================== Routes propriétaire ====================
app.get('/api/owner/supervisors', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT id, name, username, blocked FROM users WHERE owner_id = $1 AND role = $2',
            [ownerId, 'supervisor']
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/owner/agents', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT u.id, u.name, u.username, u.blocked, u.zone, u.cin, s.name as supervisor_name
             FROM users u
             LEFT JOIN users s ON u.supervisor_id = s.id
             WHERE u.owner_id = $1 AND u.role = $2`,
            [ownerId, 'agent']
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/owner/create-user', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { name, cin, username, password, role, supervisorId, zone } = req.body;
    if (!name || !username || !password || !role) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (owner_id, name, cin, username, password, role, supervisor_id, zone, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id, name, username, role, cin, zone`,
            [ownerId, name, cin || null, username, hashed, role, supervisorId || null, zone || null]
        );
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Nom d\'utilisateur déjà existant' });
        }
        res.status(500).json({ error: 'Erreur création utilisateur' });
    }
});

app.post('/api/owner/block-user', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { userId } = req.body;
    try {
        await pool.query(
            'UPDATE users SET blocked = NOT blocked WHERE id = $1 AND owner_id = $2',
            [userId, ownerId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.put('/api/owner/change-supervisor', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { agentId, supervisorId } = req.body;
    try {
        await pool.query(
            'UPDATE users SET supervisor_id = $1 WHERE id = $2 AND owner_id = $3 AND role = $4',
            [supervisorId || null, agentId, ownerId, 'agent']
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/draws', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT id, name, time, color, active FROM draws WHERE owner_id = $1 ORDER BY time',
            [ownerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/publish-results', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, numbers, lotto3 } = req.body;
    if (!drawId || !numbers || numbers.length !== 3) {
        return res.status(400).json({ error: 'Données invalides' });
    }
    try {
        await pool.query(
            `INSERT INTO winning_results (owner_id, draw_id, numbers, lotto3, date)
             VALUES ($1, $2, $3, $4, NOW())`,
            [ownerId, drawId, numbers, lotto3]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur publication' });
    }
});

app.post('/api/owner/block-draw', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, block } = req.body;
    try {
        await pool.query(
            'UPDATE draws SET active = $1 WHERE id = $2 AND owner_id = $3',
            [!block, drawId, ownerId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/blocked-numbers', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT number FROM blocked_numbers WHERE owner_id = $1 AND global = true',
            [ownerId]
        );
        res.json({ blockedNumbers: result.rows.map(r => r.number) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/block-number', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { number } = req.body;
    try {
        await pool.query(
            'INSERT INTO blocked_numbers (owner_id, number, global) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [ownerId, number, true]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/unblock-number', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { number } = req.body;
    try {
        await pool.query(
            'DELETE FROM blocked_numbers WHERE owner_id = $1 AND number = $2 AND global = true',
            [ownerId, number]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/blocked-numbers-per-draw', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT b.draw_id, d.name as draw_name, b.number
             FROM blocked_numbers b
             JOIN draws d ON b.draw_id = d.id
             WHERE b.owner_id = $1 AND b.global = false`,
            [ownerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/block-number-draw', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, number } = req.body;
    try {
        await pool.query(
            'INSERT INTO blocked_numbers (owner_id, draw_id, number, global) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [ownerId, drawId, number, false]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/unblock-number-draw', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, number } = req.body;
    try {
        await pool.query(
            'DELETE FROM blocked_numbers WHERE owner_id = $1 AND draw_id = $2 AND number = $3 AND global = false',
            [ownerId, drawId, number]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/number-limits', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT l.draw_id, d.name as draw_name, l.number, l.limit_amount
             FROM number_limits l
             JOIN draws d ON l.draw_id = d.id
             WHERE l.owner_id = $1`,
            [ownerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/number-limit', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, number, limitAmount } = req.body;
    try {
        await pool.query(
            `INSERT INTO number_limits (owner_id, draw_id, number, limit_amount)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (owner_id, draw_id, number) DO UPDATE SET limit_amount = EXCLUDED.limit_amount`,
            [ownerId, drawId, number, limitAmount]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/remove-number-limit', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, number } = req.body;
    try {
        await pool.query(
            'DELETE FROM number_limits WHERE owner_id = $1 AND draw_id = $2 AND number = $3',
            [ownerId, drawId, number]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/blocked-draws', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT id as draw_id, name as draw_name FROM draws WHERE owner_id = $1 AND active = false',
            [ownerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

// Rapports (simplifié)
app.get('/api/owner/reports', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { period, agentId, drawId, fromDate, toDate } = req.query;
    // Implémentation à compléter selon vos besoins
    res.json({ summary: { total_tickets: 0, total_bets: 0, total_wins: 0, net_result: 0 }, detail: [] });
});

app.get('/api/owner/tickets', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { page = 0, limit = 20 } = req.query;
    try {
        const result = await pool.query(
            'SELECT * FROM tickets WHERE owner_id = $1 ORDER BY date DESC LIMIT $2 OFFSET $3',
            [ownerId, limit, page * limit]
        );
        const countResult = await pool.query('SELECT COUNT(*) FROM tickets WHERE owner_id = $1', [ownerId]);
        const total = parseInt(countResult.rows[0].count);
        res.json({
            tickets: result.rows,
            hasMore: (page + 1) * limit < total,
            total
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/tickets/:id', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const ticketId = req.params.id;
    try {
        const result = await pool.query(
            'SELECT * FROM tickets WHERE id = $1 AND owner_id = $2',
            [ticketId, ownerId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket introuvable' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.delete('/api/owner/tickets/:id', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const ticketId = req.params.id;
    try {
        await pool.query('DELETE FROM tickets WHERE id = $1 AND owner_id = $2', [ticketId, ownerId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/owner/settings', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query('SELECT * FROM lottery_settings WHERE owner_id = $1', [ownerId]);
        if (result.rows.length === 0) {
            res.json({ name: 'LOTATO PRO', slogan: '', logoUrl: '', multipliers: {}, limits: {} });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.post('/api/owner/settings', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { name, slogan, logoUrl, multipliers, limits } = req.body;
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
            [ownerId, name, slogan, logoUrl, multipliers, limits]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

// ==================== Routes superviseur ====================
app.get('/api/supervisor/reports/overall', authenticate, requireRole('supervisor'), async (req, res) => {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            `SELECT 
                COUNT(t.id) as total_tickets,
                COALESCE(SUM(t.total_amount), 0) as total_bets,
                COALESCE(SUM(t.win_amount), 0) as total_wins,
                COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance
             FROM tickets t
             JOIN users u ON t.agent_id = u.id
             WHERE t.owner_id = $1 AND u.supervisor_id = $2`,
            [ownerId, supervisorId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/supervisor/agents', authenticate, requireRole('supervisor'), async (req, res) => {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            `SELECT u.id, u.name, u.username, u.blocked, u.zone,
                    COALESCE(SUM(t.total_amount), 0) as total_bets,
                    COALESCE(SUM(t.win_amount), 0) as total_wins,
                    COUNT(t.id) as total_tickets,
                    COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as balance,
                    COALESCE(SUM(CASE WHEN t.paid = false THEN t.win_amount ELSE 0 END), 0) as unpaid_wins
             FROM users u
             LEFT JOIN tickets t ON u.id = t.agent_id AND t.date >= NOW() - INTERVAL '1 day'
             WHERE u.owner_id = $1 AND u.supervisor_id = $2 AND u.role = 'agent'
             GROUP BY u.id`,
            [ownerId, supervisorId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

app.get('/api/supervisor/tickets/recent', authenticate, requireRole('supervisor'), async (req, res) => {
    const { agentId } = req.query;
    const ownerId = req.user.ownerId;
    const supervisorId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT t.* FROM tickets t
             JOIN users u ON t.agent_id = u.id
             WHERE t.owner_id = $1 AND u.supervisor_id = $2 AND t.agent_id = $3
             ORDER BY t.date DESC LIMIT 20`,
            [ownerId, supervisorId, agentId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

// ==================== Démarrage ====================
app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port} avec fichiers statiques`);
});
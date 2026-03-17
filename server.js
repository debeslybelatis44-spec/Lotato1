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
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

console.log('🔄 Vérification de la base de données...');

// ==================== Création des tables (si elles n'existent pas) ====================
async function ensureTables() {
    // Table draws
    await pool.query(`
        CREATE TABLE IF NOT EXISTS draws (
            id SERIAL PRIMARY KEY,
            owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            time TIME NOT NULL,
            color VARCHAR(20),
            active BOOLEAN DEFAULT true
        )
    `);

    // Table lottery_settings
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

    // Table blocked_numbers
    await pool.query(`
        CREATE TABLE IF NOT EXISTS blocked_numbers (
            id SERIAL PRIMARY KEY,
            owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
            number VARCHAR(2) NOT NULL,
            global BOOLEAN DEFAULT false,
            UNIQUE(owner_id, draw_id, number)
        )
    `);

    // Table number_limits
    await pool.query(`
        CREATE TABLE IF NOT EXISTS number_limits (
            owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
            number VARCHAR(2),
            limit_amount DECIMAL(10,2) NOT NULL,
            PRIMARY KEY (owner_id, draw_id, number)
        )
    `);

    // Table winning_results
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

    // Table tickets
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
            bets JSONB,
            date TIMESTAMP DEFAULT NOW()
        )
    `);

    // Table owner_messages (messages du superadmin aux propriétaires)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS owner_messages (
            id SERIAL PRIMARY KEY,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes',
            is_read BOOLEAN DEFAULT FALSE
        )
    `);

    // Index pour améliorer les performances
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
    if (req.user.role !== role) {
        return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
};

const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
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

        res.json({
            success: true,
            token,
            name: user.name
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({ valid: true, user: req.user });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
    res.json({ success: true, message: 'Déconnexion réussie' });
});
// ==================== Route pour les paramètres de la loterie (accessible à tous les utilisateurs authentifiés) ====================
app.get('/api/lottery-settings', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId; // Pour les agents et superviseurs, ownerId est défini. Pour un propriétaire, ownerId = user.id
    try {
        const result = await pool.query(
            'SELECT name, slogan, logo_url, multipliers, limits FROM lottery_settings WHERE owner_id = $1',
            [ownerId]
        );
        if (result.rows.length === 0) {
            // Valeurs par défaut si aucun réglage n'existe
            return res.json({ 
                name: 'LOTATO PRO', 
                slogan: '', 
                logoUrl: '', 
                multipliers: {}, 
                limits: {} 
            });
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
        console.error('Erreur lors de la récupération des paramètres de loterie :', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ==================== Routes superadmin ====================
app.get('/api/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, username as email, blocked as active, created_at FROM users WHERE role = $1 ORDER BY created_at DESC',
            ['owner']
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Champs requis manquants' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (name, username, password, role, phone, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
            [name, email, hashed, 'owner', phone || null]
        );
        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Email déjà utilisé' });
        }
        res.status(500).json({ error: 'Erreur création' });
    }
});

app.put('/api/superadmin/owners/:id/block', authenticate, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { block } = req.body; // true = bloquer, false = débloquer
    try {
        await pool.query(
            'UPDATE users SET blocked = $1 WHERE id = $2 AND role = $3',
            [block, id, 'owner']
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur mise à jour' });
    }
});

app.delete('/api/superadmin/owners/:id', authenticate, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'owner']);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Propriétaire non trouvé' });
        }
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

app.delete('/api/superadmin/agents/:id', authenticate, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'agent']);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Agent non trouvé' });
        }
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

app.delete('/api/superadmin/supervisors/:id', authenticate, requireSuperAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const check = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [id, 'supervisor']);
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Superviseur non trouvé' });
        }
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

app.post('/api/superadmin/messages', authenticate, requireSuperAdmin, async (req, res) => {
    const { ownerId, message } = req.body;
    if (!ownerId || !message) {
        return res.status(400).json({ error: 'ownerId et message requis' });
    }
    try {
        await pool.query(
            `INSERT INTO owner_messages (owner_id, message, created_at, expires_at)
             VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
            [ownerId, message]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur envoi message' });
    }
});

app.get('/api/superadmin/reports/owners', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id,
                u.name,
                u.username as email,
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

app.get('/api/number-limits', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            'SELECT draw_id, number, limit_amount FROM number_limits WHERE owner_id = $1',
            [ownerId]
        );
        res.json(result.rows);
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
    const user = req.user;
    const ticketId = req.params.id;
    try {
        const ticket = await pool.query(
            'SELECT owner_id, agent_id, date FROM tickets WHERE id = $1',
            [ticketId]
        );
        if (ticket.rows.length === 0) {
            return res.status(404).json({ error: 'Ticket introuvable' });
        }
        const t = ticket.rows[0];

        if (user.role === 'owner') {
            if (t.owner_id !== user.id) {
                return res.status(403).json({ error: 'Accès interdit' });
            }
        } else if (user.role === 'supervisor') {
            const check = await pool.query(
                'SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3',
                [t.agent_id, user.ownerId, user.id]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'Accès interdit' });
            }
        } else if (user.role === 'agent') {
            if (t.agent_id !== user.id) {
                return res.status(403).json({ error: 'Accès interdit' });
            }
        } else {
            return res.status(403).json({ error: 'Accès interdit' });
        }

        const date = new Date(t.date);
        const now = new Date();
        const diffMinutes = (now - date) / (1000 * 60);
        if (user.role !== 'owner' && diffMinutes > 3) {
            return res.status(403).json({ error: 'Délai de suppression dépassé (3 min)' });
        }

        await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

// ==================== Rapports et gagnants pour les agents ====================
app.get('/api/reports', authenticate, async (req, res) => {
    if (req.user.role !== 'agent') {
        return res.status(403).json({ error: 'Accès réservé aux agents' });
    }
    const agentId = req.user.id;
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            `SELECT 
                COUNT(id) as total_tickets,
                COALESCE(SUM(total_amount), 0) as total_bets,
                COALESCE(SUM(win_amount), 0) as total_wins,
                COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
             FROM tickets
             WHERE owner_id = $1 AND agent_id = $2 AND date >= CURRENT_DATE`,
            [ownerId, agentId]
        );
        const row = result.rows[0];
        res.json({
            totalTickets: parseInt(row.total_tickets),
            totalBets: parseFloat(row.total_bets),
            totalWins: parseFloat(row.total_wins),
            totalLoss: parseFloat(row.total_bets) - parseFloat(row.total_wins),
            balance: parseFloat(row.balance)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/reports/draw', authenticate, async (req, res) => {
    if (req.user.role !== 'agent') {
        return res.status(403).json({ error: 'Accès réservé aux agents' });
    }
    const agentId = req.user.id;
    const ownerId = req.user.ownerId;
    const { drawId } = req.query;
    if (!drawId) {
        return res.status(400).json({ error: 'drawId requis' });
    }
    try {
        const result = await pool.query(
            `SELECT 
                COUNT(id) as total_tickets,
                COALESCE(SUM(total_amount), 0) as total_bets,
                COALESCE(SUM(win_amount), 0) as total_wins,
                COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance
             FROM tickets
             WHERE owner_id = $1 AND agent_id = $2 AND draw_id = $3 AND date >= CURRENT_DATE`,
            [ownerId, agentId, drawId]
        );
        const row = result.rows[0];
        res.json({
            totalTickets: parseInt(row.total_tickets),
            totalBets: parseFloat(row.total_bets),
            totalWins: parseFloat(row.total_wins),
            totalLoss: parseFloat(row.total_bets) - parseFloat(row.total_wins),
            balance: parseFloat(row.balance)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/winners', authenticate, async (req, res) => {
    if (req.user.role !== 'agent') {
        return res.status(403).json({ error: 'Accès réservé aux agents' });
    }
    const agentId = req.user.id;
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            `SELECT * FROM tickets
             WHERE owner_id = $1 AND agent_id = $2 AND win_amount > 0 AND date >= CURRENT_DATE
             ORDER BY date DESC`,
            [ownerId, agentId]
        );
        res.json({ winners: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/winners/results', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            `SELECT * FROM winning_results
             WHERE owner_id = $1 AND date >= CURRENT_DATE
             ORDER BY draw_id, date DESC`,
            [ownerId]
        );
        res.json({ results: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/tickets/check-winners', authenticate, async (req, res) => {
    res.json({ success: true, message: 'Vérification des gagnants déclenchée' });
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
        res.status(500).json({ error: 'Erreur serveur' });
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
        res.status(500).json({ error: 'Erreur serveur' });
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
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/supervisor/tickets', authenticate, requireRole('supervisor'), async (req, res) => {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    const { page = 0, limit = 20, agentId, gain, paid, period, fromDate, toDate } = req.query;

    let query = `
        SELECT t.*
        FROM tickets t
        JOIN users u ON t.agent_id = u.id
        WHERE t.owner_id = $1 AND u.supervisor_id = $2
    `;
    const params = [ownerId, supervisorId];
    let paramIndex = 3;

    if (agentId && agentId !== 'all') {
        query += ` AND t.agent_id = $${paramIndex++}`;
        params.push(agentId);
    }
    if (gain === 'win') {
        query += ` AND t.win_amount > 0`;
    } else if (gain === 'nowin') {
        query += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;
    }
    if (paid === 'paid') {
        query += ` AND t.paid = true`;
    } else if (paid === 'unpaid') {
        query += ` AND t.paid = false`;
    }

    if (period === 'today') {
        query += ` AND t.date >= CURRENT_DATE`;
    } else if (period === 'yesterday') {
        query += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
    } else if (period === 'week') {
        query += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else if (period === 'month') {
        query += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && fromDate && toDate) {
        query += ` AND t.date >= $${paramIndex} AND t.date <= $${paramIndex+1}`;
        params.push(fromDate, toDate);
        paramIndex += 2;
    }

    const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY t.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex+1}`;
    params.push(limit, page * limit);

    try {
        const result = await pool.query(query, params);
        res.json({
            tickets: result.rows,
            hasMore: (page + 1) * limit < total,
            total
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/supervisor/block-agent/:id', authenticate, requireRole('supervisor'), async (req, res) => {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    const agentId = req.params.id;
    try {
        const check = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3 AND role = $4',
            [agentId, ownerId, supervisorId, 'agent']
        );
        if (check.rows.length === 0) {
            return res.status(403).json({ error: 'Agent non trouvé ou non autorisé' });
        }
        await pool.query('UPDATE users SET blocked = true WHERE id = $1', [agentId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/supervisor/unblock-agent/:id', authenticate, requireRole('supervisor'), async (req, res) => {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    const agentId = req.params.id;
    try {
        const check = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3 AND role = $4',
            [agentId, ownerId, supervisorId, 'agent']
        );
        if (check.rows.length === 0) {
            return res.status(403).json({ error: 'Agent non trouvé ou non autorisé' });
        }
        await pool.query('UPDATE users SET blocked = false WHERE id = $1', [agentId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/supervisor/tickets/:id/pay', authenticate, requireRole('supervisor'), async (req, res) => {
    const supervisorId = req.user.id;
    const ownerId = req.user.ownerId;
    const ticketId = req.params.id;
    try {
        const check = await pool.query(
            `SELECT t.id FROM tickets t
             JOIN users u ON t.agent_id = u.id
             WHERE t.id = $1 AND t.owner_id = $2 AND u.supervisor_id = $3`,
            [ticketId, ownerId, supervisorId]
        );
        if (check.rows.length === 0) {
            return res.status(403).json({ error: 'Ticket non trouvé ou non autorisé' });
        }
        await pool.query('UPDATE tickets SET paid = true WHERE id = $1', [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ==================== Routes propriétaire ====================
app.get('/api/owner/messages', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            `SELECT message FROM owner_messages
             WHERE owner_id = $1 AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [ownerId]
        );
        if (result.rows.length > 0) {
            res.json({ message: result.rows[0].message });
        } else {
            res.json({ message: null });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/owner/supervisors', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const result = await pool.query(
            'SELECT id, name, username, blocked FROM users WHERE owner_id = $1 AND role = $2',
            [ownerId, 'supervisor']
        );
        const supervisors = result.rows.map(s => ({ ...s, email: s.username }));
        res.json(supervisors);
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
        const agents = result.rows.map(a => ({ ...a, email: a.username }));
        res.json(agents);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.post('/api/owner/create-user', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { name, cin, username, password, role, supervisorId, zone, commissionPercentage } = req.body;
    if (!name || !username || !password || !role) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (owner_id, name, cin, username, password, role, supervisor_id, zone, commission_percentage, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id, name, username, role, cin, zone, commission_percentage`,
            [ownerId, name, cin || null, username, hashed, role, supervisorId || null, zone || null, commissionPercentage || 0]
        );
        const user = { ...result.rows[0], email: result.rows[0].username };
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            return res.status(400).json({ error: "Nom d'utilisateur déjà existant" });
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

app.get('/api/owner/dashboard', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const supervisors = await pool.query(
            'SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2',
            [ownerId, 'supervisor']
        );
        const agents = await pool.query(
            'SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2',
            [ownerId, 'agent']
        );
        const sales = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM tickets WHERE owner_id = $1 AND date >= CURRENT_DATE',
            [ownerId]
        );
        const agentsGainLoss = await pool.query(
            `SELECT u.id, u.name,
                COALESCE(SUM(t.total_amount), 0) as total_bets,
                COALESCE(SUM(t.win_amount), 0) as total_wins,
                COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
             FROM users u
             LEFT JOIN tickets t ON u.id = t.agent_id AND t.date >= CURRENT_DATE
             WHERE u.owner_id = $1 AND u.role = $2
             GROUP BY u.id`,
            [ownerId, 'agent']
        );
        const limitsProgress = [];
        const globalStats = await pool.query(
            `SELECT 
                COUNT(*) as total_tickets_all,
                COUNT(CASE WHEN win_amount > 0 THEN 1 END) as total_winning_tickets_all,
                COALESCE(SUM(total_amount), 0) as total_bets_all,
                COALESCE(SUM(win_amount), 0) as total_wins_all,
                COALESCE(SUM(win_amount) - SUM(total_amount), 0) as balance_all
             FROM tickets
             WHERE owner_id = $1`,
            [ownerId]
        );

        const connected = {
            supervisors_count: supervisors.rows.length,
            supervisors: supervisors.rows.map(s => ({ ...s, email: s.username })),
            agents_count: agents.rows.length,
            agents: agents.rows.map(a => ({ ...a, email: a.username }))
        };

        res.json({
            connected,
            sales_today: parseFloat(sales.rows[0].total),
            limits_progress: limitsProgress,
            agents_gain_loss: agentsGainLoss.rows,
            global_stats: {
                total_tickets_all: parseInt(globalStats.rows[0].total_tickets_all),
                total_winning_tickets_all: parseInt(globalStats.rows[0].total_winning_tickets_all),
                balance_all: parseFloat(globalStats.rows[0].balance_all)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/owner/reports', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

    let baseQuery = `
        SELECT 
            COUNT(id) as tickets,
            COALESCE(SUM(total_amount), 0) as bets,
            COALESCE(SUM(win_amount), 0) as wins,
            COALESCE(SUM(win_amount) - SUM(total_amount), 0) as result
        FROM tickets
        WHERE owner_id = $1
    `;
    const params = [ownerId];
    let paramIndex = 2;

    if (supervisorId && supervisorId !== 'all') {
        baseQuery += ` AND agent_id IN (SELECT id FROM users WHERE supervisor_id = $${paramIndex++})`;
        params.push(supervisorId);
    }
    if (agentId && agentId !== 'all') {
        baseQuery += ` AND agent_id = $${paramIndex++}`;
        params.push(agentId);
    }
    if (drawId && drawId !== 'all') {
        baseQuery += ` AND draw_id = $${paramIndex++}`;
        params.push(drawId);
    }

    if (period === 'today') {
        baseQuery += ` AND date >= CURRENT_DATE`;
    } else if (period === 'yesterday') {
        baseQuery += ` AND date >= CURRENT_DATE - INTERVAL '1 day' AND date < CURRENT_DATE`;
    } else if (period === 'week') {
        baseQuery += ` AND date >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else if (period === 'month') {
        baseQuery += ` AND date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && fromDate && toDate) {
        baseQuery += ` AND date >= $${paramIndex} AND date <= $${paramIndex+1}`;
        params.push(fromDate, toDate);
        paramIndex += 2;
    }

    if (gainLoss === 'gain') {
        baseQuery += ` AND win_amount > 0`;
    } else if (gainLoss === 'loss') {
        baseQuery += ` AND (win_amount = 0 OR win_amount IS NULL)`;
    }

    try {
        const summaryResult = await pool.query(baseQuery, params);
        const summary = summaryResult.rows[0];

        let detailQuery = `
            SELECT d.id as draw_id, d.name as draw_name, 
                   COUNT(t.id) as tickets, 
                   COALESCE(SUM(t.total_amount), 0) as bets, 
                   COALESCE(SUM(t.win_amount), 0) as wins, 
                   COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
            FROM tickets t
            JOIN draws d ON t.draw_id = d.id
            WHERE t.owner_id = $1
        `;
        const detailParams = [ownerId];
        let detailParamIndex = 2;

        if (supervisorId && supervisorId !== 'all') {
            detailQuery += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${detailParamIndex++})`;
            detailParams.push(supervisorId);
        }
        if (agentId && agentId !== 'all') {
            detailQuery += ` AND t.agent_id = $${detailParamIndex++}`;
            detailParams.push(agentId);
        }
        if (drawId && drawId !== 'all') {
            detailQuery += ` AND t.draw_id = $${detailParamIndex++}`;
            detailParams.push(drawId);
        }

        if (period === 'today') {
            detailQuery += ` AND t.date >= CURRENT_DATE`;
        } else if (period === 'yesterday') {
            detailQuery += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
        } else if (period === 'week') {
            detailQuery += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
        } else if (period === 'month') {
            detailQuery += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
        } else if (period === 'custom' && fromDate && toDate) {
            detailQuery += ` AND t.date >= $${detailParamIndex} AND t.date <= $${detailParamIndex+1}`;
            detailParams.push(fromDate, toDate);
            detailParamIndex += 2;
        }

        if (gainLoss === 'gain') {
            detailQuery += ` AND t.win_amount > 0`;
        } else if (gainLoss === 'loss') {
            detailQuery += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;
        }

        detailQuery += ` GROUP BY d.id, d.name ORDER BY d.name`;

        const detailResult = await pool.query(detailQuery, detailParams);

        const gainLossCount = await pool.query(
            `SELECT 
                COUNT(CASE WHEN net_result > 0 THEN 1 END) as gain_count,
                COUNT(CASE WHEN net_result < 0 THEN 1 END) as loss_count
             FROM (
                SELECT u.id, COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result
                FROM users u
                LEFT JOIN tickets t ON u.id = t.agent_id AND t.date >= CURRENT_DATE
                WHERE u.owner_id = $1 AND u.role = 'agent'
                GROUP BY u.id
             ) sub`,
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
            detail: detailResult.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/owner/tickets', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { page = 0, limit = 20, supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid } = req.query;

    let query = `
        SELECT t.*
        FROM tickets t
        WHERE t.owner_id = $1
    `;
    const params = [ownerId];
    let paramIndex = 2;

    if (supervisorId && supervisorId !== 'all') {
        query += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id = $${paramIndex++})`;
        params.push(supervisorId);
    }
    if (agentId && agentId !== 'all') {
        query += ` AND t.agent_id = $${paramIndex++}`;
        params.push(agentId);
    }
    if (drawId && drawId !== 'all') {
        query += ` AND t.draw_id = $${paramIndex++}`;
        params.push(drawId);
    }

    if (period === 'today') {
        query += ` AND t.date >= CURRENT_DATE`;
    } else if (period === 'yesterday') {
        query += ` AND t.date >= CURRENT_DATE - INTERVAL '1 day' AND t.date < CURRENT_DATE`;
    } else if (period === 'week') {
        query += ` AND t.date >= DATE_TRUNC('week', CURRENT_DATE)`;
    } else if (period === 'month') {
        query += ` AND t.date >= DATE_TRUNC('month', CURRENT_DATE)`;
    } else if (period === 'custom' && fromDate && toDate) {
        query += ` AND t.date >= $${paramIndex} AND t.date <= $${paramIndex+1}`;
        params.push(fromDate, toDate);
        paramIndex += 2;
    }

    if (gain === 'win') {
        query += ` AND t.win_amount > 0`;
    } else if (gain === 'nowin') {
        query += ` AND (t.win_amount = 0 OR t.win_amount IS NULL)`;
    }

    if (paid === 'paid') {
        query += ` AND t.paid = true`;
    } else if (paid === 'unpaid') {
        query += ` AND t.paid = false`;
    }

    const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY t.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex+1}`;
    params.push(parseInt(limit), parseInt(page) * parseInt(limit));

    try {
        const result = await pool.query(query, params);
        res.json({
            tickets: result.rows,
            hasMore: (parseInt(page) + 1) * parseInt(limit) < total,
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
            const row = result.rows[0];
            row.logoUrl = row.logo_url;
            delete row.logo_url;
            res.json(row);
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

// ==================== Démarrage du serveur ====================
checkDatabaseConnection().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${port}`);
    });
}).catch(err => {
    console.error('❌ Impossible de démarrer le serveur:', err);
    process.exit(1);
});
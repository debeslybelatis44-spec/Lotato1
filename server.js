// server.js (version enrichie compatible multi-tenant avec table users)
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const multer = require('multer');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares de sécurité et performance
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, keyGenerator: (req) => req.ip });
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname)));

// Connexion PostgreSQL (Neon)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

// Vérification DB et ajout de colonnes manquantes
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
        await addColumnIfNotExists('lottery_settings', 'slogan', 'TEXT');
        await addColumnIfNotExists('lottery_settings', 'multipliers', 'JSONB');
        await addColumnIfNotExists('lottery_settings', 'limits', 'JSONB'); // pour les limites par type de jeu
        await addColumnIfNotExists('winning_results', 'lotto3', 'VARCHAR(3)');
        console.log('✅ Base de données prête');
    } catch (error) {
        console.error('❌ Erreur initialisation:', error);
    }
}

// Middleware d'authentification
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

// Routes d'authentification
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

        // Journalisation
        await pool.query(
            'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
            [user.id, role, 'login', req.ip, req.headers['user-agent']]
        );

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

// Rafraîchir le token
app.post('/api/auth/refresh', authenticate, (req, res) => {
    const user = req.user;
    const newToken = jwt.sign(
        {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
            ownerId: user.ownerId
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    res.json({ success: true, token: newToken });
});

// Logout
app.post('/api/auth/logout', authenticate, async (req, res) => {
    await pool.query(
        'INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1, $2, $3, $4)',
        [req.user.id, req.user.role, 'logout', req.ip]
    );
    res.json({ success: true });
});

// Vérifier le token
app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Configuration loterie (accessible à tous les utilisateurs authentifiés)
app.get('/api/lottery-config', authenticate, async (req, res) => {
    const ownerId = req.user.ownerId;
    try {
        const result = await pool.query(
            'SELECT name, slogan, logo_url as "logoUrl", multipliers, limits FROM lottery_settings WHERE owner_id = $1',
            [ownerId]
        );
        if (result.rows.length === 0) {
            // Valeurs par défaut
            res.json({
                name: 'LOTATO PRO',
                slogan: '',
                logoUrl: '',
                multipliers: {
                    lot1: 60,
                    lot2: 20,
                    lot3: 10,
                    lotto3: 500,
                    lotto4: 5000,
                    lotto5: 25000,
                    mariage: 500
                },
                limits: {
                    lotto3: 0,
                    lotto4: 0,
                    lotto5: 0
                }
            });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes communes
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

// Sauvegarde d'un ticket (avec mariages gratuits et vérifications)
app.post('/api/tickets/save', authenticate, async (req, res) => {
    const { agentId, agentName, drawId, drawName, bets, total } = req.body;
    const ownerId = req.user.ownerId;

    // Vérifications d'accès
    if (req.user.role === 'agent' && req.user.id != agentId) {
        return res.status(403).json({ error: 'Vous ne pouvez enregistrer que vos propres tickets' });
    }

    try {
        // Vérifier que le tirage est actif
        const drawCheck = await pool.query(
            'SELECT active FROM draws WHERE id = $1 AND owner_id = $2',
            [drawId, ownerId]
        );
        if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) {
            return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });
        }

        // Récupérer les blocages globaux
        const globalBlocked = await pool.query(
            'SELECT number FROM blocked_numbers WHERE owner_id = $1 AND global = true',
            [ownerId]
        );
        const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));

        // Récupérer les blocages par tirage
        const drawBlocked = await pool.query(
            'SELECT number FROM blocked_numbers WHERE owner_id = $1 AND draw_id = $2 AND global = false',
            [ownerId, drawId]
        );
        const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));

        // Récupérer les limites
        const limits = await pool.query(
            'SELECT number, limit_amount FROM number_limits WHERE owner_id = $1 AND draw_id = $2',
            [ownerId, drawId]
        );
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
                     WHERE owner_id = $1 AND draw_id = $2 AND DATE(date) = CURRENT_DATE AND bet->>'cleanNumber' = $3`,
                    [ownerId, drawId, cleanNumber]
                );
                const currentTotal = parseFloat(todayBetsResult.rows[0]?.total) || 0;
                const betAmount = parseFloat(bet.amount) || 0;
                if (currentTotal + betAmount > limit) {
                    return res.status(403).json({ error: `Limite de mise pour le numéro ${cleanNumber} dépassée (max ${limit} G)` });
                }
            }
        }

        // Récupérer les limites par type de jeu depuis lottery_settings
        const configResult = await pool.query(
            'SELECT limits FROM lottery_settings WHERE owner_id = $1',
            [ownerId]
        );
        let gameLimits = {};
        if (configResult.rows.length > 0 && configResult.rows[0].limits) {
            const raw = configResult.rows[0].limits;
            gameLimits = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }

        // Calculer les totaux par type de jeu
        const totalsByGame = {};
        for (const bet of bets) {
            const game = bet.game || bet.specialType;
            let category = null;
            if (game === 'lotto3' || game === 'auto_lotto3') category = 'lotto3';
            else if (game === 'lotto4' || game === 'auto_lotto4') category = 'lotto4';
            else if (game === 'lotto5' || game === 'auto_lotto5') category = 'lotto5';
            else continue;

            const amount = parseFloat(bet.amount) || 0;
            totalsByGame[category] = (totalsByGame[category] || 0) + amount;
        }

        for (const [category, total] of Object.entries(totalsByGame)) {
            const limit = gameLimits[category] || 0;
            if (limit > 0 && total > limit) {
                return res.status(403).json({
                    error: `Limite de mise pour ${category} dépassée (max ${limit} G par ticket)`
                });
            }
        }

        // Gestion des mariages gratuits
        const paidBets = bets.filter(b => !b.free);
        const totalPaid = paidBets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

        let requiredFree = 0;
        if (totalPaid >= 1 && totalPaid <= 50) requiredFree = 1;
        else if (totalPaid >= 51 && totalPaid <= 150) requiredFree = 2;
        else if (totalPaid >= 151) requiredFree = 3;

        const newFreeBets = [];
        for (let i = 0; i < requiredFree; i++) {
            const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            const num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            const number = `${num1}&${num2}`;
            const cleanNumber = num1 + num2;
            newFreeBets.push({
                game: 'auto_marriage',
                number: number,
                cleanNumber: cleanNumber,
                amount: 0,
                free: true,
                freeType: 'special_marriage',
                freeWin: 1000
            });
        }

        const finalBets = [...paidBets, ...newFreeBets];
        const betsJson = JSON.stringify(finalBets);
        const finalTotal = finalBets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);

        const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);

        const result = await pool.query(
            `INSERT INTO tickets (owner_id, agent_id, agent_name, draw_id, draw_name, ticket_id, total_amount, bets, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id`,
            [ownerId, agentId, agentName, drawId, drawName, ticketId, finalTotal, betsJson]
        );

        res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, ...req.body } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur sauvegarde ticket' });
    }
});

// Récupération des tickets (avec filtres pour owner)
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
        const tickets = result.rows.map(t => ({
            ...t,
            bets: typeof t.bets === 'string' ? JSON.parse(t.bets) : t.bets
        }));
        res.json({ tickets });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur chargement tickets' });
    }
});

// Suppression d'un ticket (avec délais)
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

        if (t.owner_id !== user.ownerId) {
            return res.status(403).json({ error: 'Accès interdit' });
        }

        // Délai de suppression
        const date = new Date(t.date);
        const now = new Date();
        const diffMinutes = (now - date) / (1000 * 60);
        if (user.role !== 'owner' && diffMinutes > 3) {
            return res.status(403).json({ error: 'Délai de suppression dépassé (3 min)' });
        }
        if (user.role === 'supervisor') {
            // Vérifier que l'agent est sous sa supervision
            const check = await pool.query(
                'SELECT id FROM users WHERE id = $1 AND owner_id = $2 AND supervisor_id = $3',
                [t.agent_id, user.ownerId, user.id]
            );
            if (check.rows.length === 0) {
                return res.status(403).json({ error: 'Accès interdit' });
            }
            if (diffMinutes > 10) {
                return res.status(403).json({ error: 'Délai de suppression dépassé (10 min)' });
            }
        } else if (user.role === 'agent') {
            if (t.agent_id !== user.id) {
                return res.status(403).json({ error: 'Accès interdit' });
            }
        }

        await pool.query('DELETE FROM tickets WHERE id = $1', [ticketId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

// Rapports et gagnants pour les agents
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
    // Placeholder – déclencherait normalement un calcul des gains
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

    // Filtre date
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

    // Comptage total
    const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Pagination
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

// Publication des résultats avec calcul complet des gagnants
app.post('/api/owner/publish-results', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { drawId, numbers, lotto3 } = req.body;
    if (!drawId || !numbers || numbers.length !== 3) {
        return res.status(400).json({ error: 'Données invalides' });
    }
    try {
        const draw = await pool.query('SELECT name FROM draws WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);
        if (draw.rows.length === 0) return res.status(404).json({ error: 'Tirage non trouvé' });

        await pool.query(
            `INSERT INTO winning_results (owner_id, draw_id, numbers, lotto3, date)
             VALUES ($1, $2, $3, $4, NOW())`,
            [ownerId, drawId, numbers, lotto3]
        );

        // Mettre à jour la date du dernier tirage
        await pool.query('UPDATE draws SET last_draw = NOW() WHERE id = $1 AND owner_id = $2', [drawId, ownerId]);

        // Récupérer les multiplicateurs depuis la config
        const configRes = await pool.query('SELECT multipliers FROM lottery_settings WHERE owner_id = $1', [ownerId]);
        let multipliers = {
            lot1: 60,
            lot2: 20,
            lot3: 10,
            lotto3: 500,
            lotto4: 5000,
            lotto5: 25000,
            mariage: 500
        };
        if (configRes.rows.length > 0 && configRes.rows[0].multipliers) {
            const raw = configRes.rows[0].multipliers;
            multipliers = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }

        const lot1 = numbers[0]; // 2 chiffres (premier lot)
        const lot2 = numbers[1];
        const lot3 = numbers[2];

        // Récupérer tous les tickets non encore vérifiés pour ce tirage
        const ticketsRes = await pool.query(
            'SELECT id, bets FROM tickets WHERE owner_id = $1 AND draw_id = $2 AND (checked = false OR checked IS NULL)',
            [ownerId, drawId]
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

                    // Borlette (2 chiffres)
                    if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
                        if (cleanNumber.length === 2) {
                            if (cleanNumber === lot2) gain = amount * multipliers.lot2;
                            else if (cleanNumber === lot3) gain = amount * multipliers.lot3;
                            else if (cleanNumber === lot1) gain = amount * multipliers.lot1;
                        }
                    }
                    // Lotto 3 (3 chiffres)
                    else if (game === 'lotto3' || game === 'auto_lotto3') {
                        if (cleanNumber.length === 3 && cleanNumber === lotto3) {
                            gain = amount * multipliers.lotto3;
                        }
                    }
                    // Mariage (combinaison de deux lots)
                    else if (game === 'mariage' || game === 'auto_marriage') {
                        if (cleanNumber.length === 4) {
                            const firstPair = cleanNumber.slice(0, 2);
                            const secondPair = cleanNumber.slice(2, 4);
                            const pairs = [lot1, lot2, lot3];
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
                                if (bet.free && bet.freeType === 'special_marriage') {
                                    gain = bet.freeWin || 1000; // montant fixe pour les gratuits
                                } else {
                                    gain = amount * multipliers.mariage;
                                }
                            }
                        }
                    }
                    // Lotto 4 (combinaison de deux lots)
                    else if (game === 'lotto4' || game === 'auto_lotto4') {
                        if (cleanNumber.length === 4 && bet.option) {
                            const option = bet.option;
                            let expected = '';
                            if (option == 1) expected = lot1 + lot2;
                            else if (option == 2) expected = lot2 + lot3;
                            else if (option == 3) expected = lot1 + lot3;
                            if (cleanNumber === expected) gain = amount * multipliers.lotto4;
                        }
                    }
                    // Lotto 5 (combinaison de trois lots)
                    else if (game === 'lotto5' || game === 'auto_lotto5') {
                        if (cleanNumber.length === 5 && bet.option) {
                            const option = bet.option;
                            let expected = '';
                            if (option == 1) expected = lotto3 + lot2;      // lotto3 (3) + lot2 (2)
                            else if (option == 2) expected = lotto3 + lot3; // lotto3 (3) + lot3 (2)
                            if (cleanNumber === expected) gain = amount * multipliers.lotto5;
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

// Tableau de bord propriétaire enrichi (avec global_stats)
app.get('/api/owner/dashboard', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    try {
        const supervisors = await pool.query(
            'SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2 AND blocked = false',
            [ownerId, 'supervisor']
        );
        const agents = await pool.query(
            'SELECT id, name, username FROM users WHERE owner_id = $1 AND role = $2 AND blocked = false',
            [ownerId, 'agent']
        );
        const sales = await pool.query(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM tickets WHERE owner_id = $1 AND date >= CURRENT_DATE',
            [ownerId]
        );

        // Progression des limites (à adapter)
        const limitsProgress = await pool.query(
            `SELECT d.name as draw_name, l.number, l.limit_amount,
                    COALESCE(SUM(t.total_amount), 0) as current_bets,
                    (COALESCE(SUM(t.total_amount), 0) / l.limit_amount * 100) as progress_percent
             FROM number_limits l
             JOIN draws d ON l.draw_id = d.id
             LEFT JOIN tickets t ON t.draw_id = l.draw_id AND t.bets::text LIKE '%'||l.number||'%' AND DATE(t.date) = CURRENT_DATE
             WHERE l.owner_id = $1
             GROUP BY d.name, l.number, l.limit_amount
             ORDER BY progress_percent DESC`,
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

        // Statistiques globales (tous temps)
        const globalStats = await pool.query(
            `SELECT
                COUNT(*)::integer AS total_tickets_all,
                COUNT(CASE WHEN win_amount > 0 THEN 1 END)::integer AS total_winning_tickets_all,
                COALESCE(SUM(total_amount - win_amount), 0)::float AS balance_all
             FROM tickets
             WHERE owner_id = $1`,
            [ownerId]
        );

        res.json({
            connected: {
                supervisors_count: supervisors.rows.length,
                supervisors: supervisors.rows,
                agents_count: agents.rows.length,
                agents: agents.rows
            },
            sales_today: parseFloat(sales.rows[0].total),
            limits_progress: limitsProgress.rows,
            agents_gain_loss: agentsGainLoss.rows,
            global_stats: globalStats.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Messages propriétaire
app.get('/api/owner/messages', authenticate, requireRole('owner'), async (req, res) => {
    try {
        // Exemple : récupérer un message depuis une variable d'environnement
        const message = process.env.OWNER_MESSAGE || '';
        res.json({ message });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Rapports propriétaire avec filtres
app.get('/api/owner/reports', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;

    let conditions = ['t.owner_id = $1'];
    let params = [ownerId];
    let paramIndex = 2;

    if (agentId && agentId !== 'all') {
        conditions.push(`t.agent_id = $${paramIndex++}`);
        params.push(agentId);
    } else if (supervisorId && supervisorId !== 'all') {
        conditions.push(`u.supervisor_id = $${paramIndex++}`);
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
        conditions.push('t.win_amount > 0');
    } else if (gainLoss === 'loss') {
        conditions.push('t.win_amount = 0');
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    try {
        const summaryQuery = `
            SELECT 
                COUNT(t.id) as total_tickets,
                COALESCE(SUM(t.total_amount), 0) as total_bets,
                COALESCE(SUM(t.win_amount), 0) as total_wins,
                COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as net_result,
                COUNT(DISTINCT CASE WHEN t.win_amount > 0 THEN t.agent_id END) as gain_count,
                COUNT(DISTINCT CASE WHEN t.win_amount = 0 THEN t.agent_id END) as loss_count
            FROM tickets t
            LEFT JOIN users u ON t.agent_id = u.id
            ${whereClause}
        `;
        const summaryResult = await pool.query(summaryQuery, params);
        const summary = summaryResult.rows[0];

        let detailQuery = '';
        if (drawId && drawId !== 'all') {
            detailQuery = `
                SELECT u.name as agent_name, u.id as agent_id,
                       COUNT(t.id) as tickets,
                       COALESCE(SUM(t.total_amount), 0) as bets,
                       COALESCE(SUM(t.win_amount), 0) as wins,
                       COALESCE(SUM(t.win_amount) - SUM(t.total_amount), 0) as result
                FROM tickets t
                JOIN users u ON t.agent_id = u.id
                ${whereClause}
                GROUP BY u.id, u.name
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

        const detailResult = await pool.query(detailQuery, params);

        res.json({
            summary: {
                total_tickets: parseInt(summary.total_tickets),
                total_bets: parseFloat(summary.total_bets),
                total_wins: parseFloat(summary.total_wins),
                net_result: parseFloat(summary.net_result),
                gain_count: parseInt(summary.gain_count),
                loss_count: parseInt(summary.loss_count)
            },
            detail: detailResult.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Tickets avec filtres (pour propriétaire)
app.get('/api/owner/tickets', authenticate, requireRole('owner'), async (req, res) => {
    const ownerId = req.user.id;
    const { supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid, page = 0, limit = 20 } = req.query;

    let conditions = ['t.owner_id = $1'];
    let params = [ownerId];
    let paramIndex = 2;

    if (agentId && agentId !== 'all') {
        conditions.push(`t.agent_id = $${paramIndex++}`);
        params.push(agentId);
    } else if (supervisorId && supervisorId !== 'all') {
        conditions.push(`u.supervisor_id = $${paramIndex++}`);
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
        conditions.push('(t.win_amount = 0 OR t.win_amount IS NULL)');
    }

    if (paid === 'paid') {
        conditions.push('t.paid = true');
    } else if (paid === 'unpaid') {
        conditions.push('t.paid = false');
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    try {
        const countQuery = `
            SELECT COUNT(*) as total
            FROM tickets t
            LEFT JOIN users u ON t.agent_id = u.id
            ${whereClause}
        `;
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        const hasMore = (page * limit + limit) < total;

        const offset = page * limit;
        const dataQuery = `
            SELECT t.*
            FROM tickets t
            LEFT JOIN users u ON t.agent_id = u.id
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
        const ticket = result.rows[0];
        ticket.bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
        res.json(ticket);
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

// Configuration propriétaire (avec upload de logo)
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

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

app.post('/api/owner/settings', authenticate, requireRole('owner'), upload.single('logo'), async (req, res) => {
    const ownerId = req.user.id;
    let { name, slogan, logoUrl, multipliers, limits } = req.body;

    if (multipliers && typeof multipliers === 'string') {
        try { multipliers = JSON.parse(multipliers); } catch { multipliers = {}; }
    }
    if (limits && typeof limits === 'string') {
        try { limits = JSON.parse(limits); } catch { limits = {}; }
    }

    let logo = logoUrl;
    if (req.file) {
        const base64 = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;
        logo = `data:${mimeType};base64,${base64}`;
    }

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
            [ownerId, name || 'LOTATO PRO', slogan || '', logo || '', JSON.stringify(multipliers || {}), JSON.stringify(limits || {})]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur' });
    }
});

// Démarrage
initializeDatabase().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${port}`);
    });
}).catch(err => {
    console.error('❌ Impossible de démarrer le serveur:', err);
    process.exit(1);
});
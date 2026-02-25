const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_cle_secrete_ultra_secure';

// Configuration de la base de données
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middlewares
app.use(cors());
app.use(compression());
app.use(express.json());

// --- MIDDLEWARE D'AUTHENTIFICATION ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ success: false, error: "Token manquant" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: "Session expirée" });
        req.user = user;
        next();
    });
};

// --- ROUTES AUTHENTIFICATION ---

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ 
                id: user.id, 
                username: user.username, 
                role: user.role, 
                subsystem_id: user.subsystem_id,
                level: user.level 
            }, JWT_SECRET, { expiresIn: '24h' });

            res.json({ success: true, token, admin: user });
        } else {
            res.status(401).json({ success: false, error: "Identifiants invalides" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/auth/check', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, username, role, level, subsystem_id FROM users WHERE id = $1', [req.user.id]);
        res.json({ success: true, admin: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- ROUTES TICKETS & JEUX (lotato.js) ---

app.post('/api/tickets', authenticateToken, async (req, res) => {
    const { draw, draw_time, bets, total, subsystem_id } = req.body;
    try {
        const numResult = await pool.query("SELECT nextval('ticket_number_seq') as num");
        const ticketNumber = numResult.rows[0].num;

        const result = await pool.query(
            `INSERT INTO bet_history (user_id, user_name, subsystem_id, draw, draw_time, bets, total) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.user.id, req.user.username, req.user.subsystem_id, draw, draw_time, JSON.stringify(bets), total]
        );

        res.json({ success: true, ticket: { ...result.rows[0], number: ticketNumber } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/history', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM bet_history WHERE subsystem_id = $1 ORDER BY date DESC LIMIT 100', 
            [req.user.subsystem_id]
        );
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- ROUTES ADMINISTRATION (Master & Subsystem) ---

// Lister les sous-systèmes (Master Dashboard)
app.get('/api/master/subsystems', authenticateToken, async (req, res) => {
    if (req.user.role !== 'master') return res.status(403).json({ success: false });
    try {
        const result = await pool.query('SELECT * FROM subsystems');
        res.json({ success: true, subsystems: result.rows });
    } catch (err) { res.status(500).json({ success: false }); }
});

// Gestion des utilisateurs (Hiérarchie : Master > Sub > Supervisor > Agent)
app.get('/api/users', authenticateToken, async (req, res) => {
    let query = 'SELECT id, name, username, role, level, is_active FROM users WHERE subsystem_id = $1';
    let params = [req.user.subsystem_id];

    if (req.user.role === 'supervisor') {
        if (req.user.level === 2) {
            query += ' AND (supervisor2_id = $2 OR supervisor1_id IN (SELECT id FROM users WHERE supervisor2_id = $2))';
        } else {
            query += ' AND supervisor1_id = $2';
        }
        params.push(req.user.id);
    }

    try {
        const result = await pool.query(query, params);
        res.json({ success: true, users: result.rows });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- ROUTES TIRAGES & RÉSULTATS ---

app.get('/api/draws', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM draws');
        const drawsObj = {};
        result.rows.forEach(d => { drawsObj[d.name.toLowerCase()] = d; });
        res.json({ success: true, draws: drawsObj });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/results', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM results ORDER BY date DESC LIMIT 20');
        res.json({ success: true, results: result.rows });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- ROUTES RESTRICTIONS (subsystem-admin.html) ---

app.get('/api/restrictions/:subsystem_id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM restrictions WHERE subsystem_id = $1', [req.params.subsystem_id]);
        res.json({ success: true, restrictions: result.rows });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/restrictions/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM restrictions WHERE id = $1 AND subsystem_id = $2', [req.params.id, req.user.subsystem_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- SANTÉ DU SERVEUR ---
app.get('/api/health', (req, res) => res.json({ success: true, status: "Online", time: new Date() }));

app.listen(PORT, () => {
    console.log(`✅ Serveur NOVA opérationnel sur le port ${PORT}`);
});

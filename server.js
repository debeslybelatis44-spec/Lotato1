// server.js – Version Corrigée pour enregistrement effectif des tickets
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_cle_secrete_ultra_secure';

// Configuration de la base de données (Neon.tech)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

// ==================== AUTHENTIFICATION ====================

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND is_active = true', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Utilisateur non trouvé' });

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Mot de passe incorrect' });

        const token = jwt.sign(
            { id: user.id, role: user.role, subsystem_id: user.subsystem_id },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, role: user.role, subsystem_id: user.subsystem_id }
        });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Middleware de vérification du Token
const authenticateToken = (req, res, next) => {
    const token = req.headers['x-auth-token'] || req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Accès refusé' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide' });
        req.user = user;
        next();
    });
};

// ==================== GESTION DES TICKETS (LA CORRECTION) ====================



app.post('/api/tickets', authenticateToken, async (req, res) => {
    const { draw, drawTime, bets, total } = req.body;
    const { id: user_id, subsystem_id } = req.user;

    // 1. Vérification ultime du subsystem_id
    if (!subsystem_id) {
        return res.status(400).json({ error: "L'agent n'est pas rattaché à un sous-système." });
    }

    try {
        // Début de la transaction
        await pool.query('BEGIN');

        // 2. Génération d'un numéro de ticket unique via la séquence SQL
        const seqResult = await pool.query("SELECT nextval('ticket_number_seq') as num");
        const ticketNumber = `TKT-${subsystem_id}-${seqResult.rows[0].num}`;

        // 3. Insertion dans bet_history (nom de table conforme à votre SQL)
        const insertQuery = `
            INSERT INTO bet_history 
            (user_id, subsystem_id, draw, draw_time, bets, total, date) 
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
            RETURNING id
        `;

        const values = [
            user_id,
            subsystem_id,
            draw,
            drawTime, // Le serveur mappe drawTime du JS vers draw_time du SQL
            JSON.stringify(bets),
            total
        ];

        const result = await pool.query(insertQuery, values);
        
        await pool.query('COMMIT');

        res.json({
            success: true,
            ticketId: result.rows[0].id,
            ticketNumber: ticketNumber, // Retourné pour l'impression dans lotato.js
            message: "Ticket enregistré avec succès"
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('ERREUR SQL TICKET:', err.message);
        res.status(500).json({ error: 'Erreur lors de l’enregistrement : ' + err.message });
    }
});

// ==================== ROUTES DE CONSULTATION ====================

app.get('/api/history', authenticateToken, async (req, res) => {
    const { subsystem_id } = req.user;
    try {
        const result = await pool.query(
            'SELECT * FROM bet_history WHERE subsystem_id = $1 ORDER BY date DESC LIMIT 50',
            [subsystem_id]
        );
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Erreur historique' });
    }
});

// Route pour les paramètres (Logo, Nom entreprise)
app.get('/api/company-info', async (req, res) => {
    try {
        const result = await pool.query("SELECT value FROM settings WHERE key = 'company_info'");
        if (result.rows.length > 0) {
            res.json(JSON.parse(result.rows[0].value));
        } else {
            res.json({ name: "Nova Lotto", phone: "+509 0000-0000", reportTitle: "LOTATO" });
        }
    } catch (err) {
        res.status(500).json({ error: 'Erreur settings' });
    }
});

// Santé du serveur
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', database: 'Connected', timestamp: new Date() });
});

// Démarrage
app.listen(PORT, () => {
    console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
});

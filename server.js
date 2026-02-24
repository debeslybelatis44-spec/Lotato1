const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

const app = express();

// === MIDDLEWARE ===
app.use(compression({ level: 6, threshold: 1024 }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// === CONNEXION POSTGRESQL (Neon) ===
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/lottodb',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erreur de connexion PostgreSQL:', err.stack);
    } else {
        console.log('✅ PostgreSQL connecté avec succès !');
        release();
    }
});

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN ===================
function vérifierToken(req, res, next) {
    let token = req.query.token || req.body?.token || req.headers['x-auth-token'];

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }

    console.log('Token reçu:', token);

    if (!token || !token.startsWith('nova_')) {
        return req.path.startsWith('/api/') 
            ? res.status(401).json({ success: false, error: 'Token manquant ou invalide' })
            : next();
    }

    const parts = token.split('_');
    if (parts.length >= 5) {
        req.tokenInfo = {
            token,
            userId: parts[2],
            role: parts[3],
            level: parts[4] || '1'
        };
    }
    next();
}

// =================== ROUTES DE CONNEXION ===================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        console.log('--- Tentative de connexion ---');
        console.log({ username, password, role });

        let dbRole = role;
        let level = 1;
        if (role === 'supervisor1') { dbRole = 'supervisor'; level = 1; }
        else if (role === 'supervisor2') { dbRole = 'supervisor'; level = 2; }

        const query = `
            SELECT id, name, username, password, role, level, subsystem_id
            FROM users
            WHERE username = $1 AND password = $2 AND role = $3
            ${dbRole === 'supervisor' ? 'AND level = $4' : ''}
        `;
        const params = dbRole === 'supervisor' 
            ? [username, password, dbRole, level]
            : [username, password, dbRole];

        const result = await pool.query(query, params);
        const user = result.rows[0];

        if (!user) {
            console.log('Échec : utilisateur non trouvé');
            return res.status(401).json({ success: false, error: 'Identifiants ou rôle incorrect' });
        }

        console.log('Utilisateur trouvé:', user);

        const token = `nova_${Date.now()}_${user.id}_${user.role}_${user.level || 1}`;

        let redirectUrl;
        switch (user.role) {
            case 'agent': redirectUrl = '/lotato.html'; break;
            case 'supervisor':
                redirectUrl = user.level === 1 ? '/control-level1.html' : '/control-level2.html';
                break;
            case 'subsystem': redirectUrl = '/subsystem-admin.html'; break;
            case 'master': redirectUrl = '/master-dashboard.html'; break;
            default: redirectUrl = '/';
        }
        redirectUrl += `?token=${encodeURIComponent(token)}`;

        // Mettre à jour last_login
        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        res.json({
            success: true,
            redirectUrl,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                subsystem_id: user.subsystem_id
            }
        });

    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== VÉRIFICATION DE SESSION ===================
app.get('/api/auth/check', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo) return res.status(401).json({ success: false, error: 'Session invalide' });

        const result = await pool.query(`
            SELECT u.id, u.username, u.name, u.role, u.level, u.email, u.subsystem_id,
                   s.name as subsystem_name
            FROM users u
            LEFT JOIN subsystems s ON u.subsystem_id = s.id
            WHERE u.id = $1
        `, [req.tokenInfo.userId]);

        const user = result.rows[0];
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        res.json({
            success: true,
            admin: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role,
                level: user.level,
                email: user.email,
                subsystem_id: user.subsystem_id,
                subsystem_name: user.subsystem_name || 'Non spécifié'
            }
        });
    } catch (error) {
        console.error('Erreur vérification session:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES POUR LOTATO ===================

// Récupérer les tirages
app.get('/api/draws', vérifierToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, times, is_active, subsystem_id
            FROM draws
            WHERE is_active = true
            ORDER BY id
        `);
        const draws = {};
        result.rows.forEach(row => {
            draws[row.id] = {
                name: row.name,
                times: row.times
            };
        });
        res.json({ success: true, draws });
    } catch (error) {
        console.error('Erreur chargement tirages:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les tickets de l'agent
app.get('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [req.tokenInfo.userId]);
        if (!userResult.rows[0]) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        const userId = userResult.rows[0].id;

        const ticketsResult = await pool.query(`
            SELECT t.id, t.number, t.draw, t.draw_time, t.total, t.agent_name, t.date,
                   COALESCE(json_agg(
                       json_build_object(
                           'type', b.type,
                           'name', b.name,
                           'number', b.number,
                           'amount', b.amount,
                           'multiplier', b.multiplier,
                           'options', b.options,
                           'isLotto4', b.is_lotto4,
                           'isLotto5', b.is_lotto5,
                           'isGroup', b.is_group,
                           'details', b.details,
                           'perOptionAmount', b.per_option_amount
                       )
                   ) FILTER (WHERE b.id IS NOT NULL), '[]') as bets
            FROM tickets t
            LEFT JOIN bets b ON t.id = b.ticket_id
            WHERE t.agent_id = $1
            GROUP BY t.id
            ORDER BY t.date DESC
            LIMIT 100
        `, [userId]);

        const tickets = ticketsResult.rows.map(row => ({
            id: row.id,
            number: parseInt(row.number),
            date: row.date,
            draw: row.draw,
            draw_time: row.draw_time,
            bets: row.bets,
            total: row.total,
            agent_name: row.agent_name
        }));

        // Prochain numéro de ticket via séquence
        const seqResult = await pool.query("SELECT nextval('ticket_number_seq') as next");
        const nextTicketNumber = seqResult.rows[0].next;

        res.json({ success: true, tickets, nextTicketNumber });
    } catch (error) {
        console.error('Erreur chargement tickets:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Sauvegarder un ticket
app.post('/api/tickets', vérifierToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { draw, draw_time, bets, total, agent_id, agent_name, subsystem_id, date } = req.body;

        const userResult = await client.query('SELECT id, name, subsystem_id FROM users WHERE id = $1', [req.tokenInfo.userId]);
        if (!userResult.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        }

        const finalSubsystemId = subsystem_id || userResult.rows[0].subsystem_id;
        if (!finalSubsystemId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'L\'agent doit être associé à un sous-système' });
        }

        // Générer le numéro de ticket via séquence
        const seqResult = await client.query("SELECT nextval('ticket_number_seq') as next");
        const ticketNumber = seqResult.rows[0].next;

        // Insérer le ticket
        const ticketInsert = await client.query(`
            INSERT INTO tickets (number, draw, draw_time, total, agent_id, agent_name, subsystem_id, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, number, date, draw, draw_time, total, agent_name
        `, [
            ticketNumber,
            draw,
            draw_time,
            total,
            agent_id || userResult.rows[0].id,
            agent_name || userResult.rows[0].name,
            finalSubsystemId,
            date || new Date()
        ]);

        const ticket = ticketInsert.rows[0];

        // Insérer les paris
        for (const bet of bets) {
            await client.query(`
                INSERT INTO bets (ticket_id, type, name, number, amount, multiplier, options, is_group, details, per_option_amount, is_lotto4, is_lotto5)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                ticket.id,
                bet.type,
                bet.name,
                bet.number,
                bet.amount,
                bet.multiplier,
                bet.options || null,
                bet.isGroup || false,
                bet.details || null,
                bet.perOptionAmount || null,
                bet.isLotto4 || false,
                bet.isLotto5 || false
            ]);
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            ticket: {
                id: ticket.id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: bets,
                total: ticket.total,
                agent_name: ticket.agent_name
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erreur sauvegarde ticket:', error);
        res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde : ' + error.message });
    } finally {
        client.release();
    }
});

// Récupérer les résultats
app.get('/api/results', vérifierToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT draw, time, date, lot1, lot2, lot3
            FROM results
            ORDER BY date DESC, draw, time
            LIMIT 100
        `);

        const resultsData = {};
        result.rows.forEach(row => {
            if (!resultsData[row.draw]) resultsData[row.draw] = {};
            resultsData[row.draw][row.time] = {
                date: row.date,
                lot1: row.lot1,
                lot2: row.lot2 || '',
                lot3: row.lot3 || ''
            };
        });

        res.json({ success: true, results: resultsData });
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les informations de l'entreprise depuis settings
app.get('/api/company-info', vérifierToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT key, value FROM settings WHERE key IN ('company_name', 'company_phone', 'company_address', 'report_title', 'report_phone')
        `);
        const config = {};
        result.rows.forEach(row => {
            config[row.key] = row.value;
        });

        // Valeurs par défaut
        res.json({
            success: true,
            company_name: config.company_name || 'Nova Lotto',
            company_phone: config.company_phone || '+509 32 53 49 58',
            company_address: config.company_address || 'Cap Haïtien',
            report_title: config.report_title || 'Nova Lotto',
            report_phone: config.report_phone || '40104585'
        });
    } catch (error) {
        console.error('Erreur chargement info entreprise:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer le logo
app.get('/api/logo', vérifierToken, async (req, res) => {
    try {
        const result = await pool.query(`SELECT value FROM settings WHERE key = 'logo_url'`);
        const logoUrl = result.rows[0]?.value || 'logo-borlette.jpg';
        res.json({ success: true, logoUrl });
    } catch (error) {
        console.error('Erreur chargement logo:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les fiches multi-tirages
app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [req.tokenInfo.userId]);
        if (!userResult.rows[0]) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        const userId = userResult.rows[0].id;

        const result = await pool.query(`
            SELECT id, ticket_number, bets, draws, total_amount, agent_name, date
            FROM multi_draw_tickets
            WHERE agent_id = $1
            ORDER BY date DESC
            LIMIT 50
        `, [userId]);

        const tickets = result.rows.map(row => ({
            id: row.id,
            number: row.ticket_number,
            date: row.date,
            bets: row.bets,
            draws: row.draws,
            total: row.total_amount,
            agent_name: row.agent_name
        }));

        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Erreur fiches multi-tirages:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Sauvegarder une fiche multi-tirages
app.post('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
    try {
        const { ticket } = req.body; // ticket contient bets, draws, totalAmount, agentId, agentName, subsystem_id

        const userResult = await pool.query('SELECT id, name FROM users WHERE id = $1', [req.tokenInfo.userId]);
        if (!userResult.rows[0]) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        const userId = userResult.rows[0].id;
        const userName = userResult.rows[0].name;

        // Générer un numéro de ticket (on peut utiliser une autre séquence ou un préfixe)
        const seqResult = await pool.query("SELECT nextval('ticket_number_seq') as next");
        const ticketNumber = 'M' + seqResult.rows[0].next; // préfixe pour multi

        const insertResult = await pool.query(`
            INSERT INTO multi_draw_tickets (ticket_number, bets, draws, total_amount, agent_id, agent_name, subsystem_id, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id, ticket_number, date, bets, draws, total_amount, agent_name
        `, [
            ticketNumber,
            JSON.stringify(ticket.bets),
            JSON.stringify(ticket.draws),
            ticket.totalAmount,
            ticket.agentId || userId,
            ticket.agentName || userName,
            ticket.subsystem_id
        ]);

        const newTicket = insertResult.rows[0];
        res.json({
            success: true,
            ticket: {
                id: newTicket.id,
                number: newTicket.ticket_number,
                date: newTicket.date,
                bets: newTicket.bets,
                draws: newTicket.draws,
                total: newTicket.total_amount,
                agent_name: newTicket.agent_name
            }
        });
    } catch (error) {
        console.error('Erreur sauvegarde multi-tirages:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Enregistrer un historique (bet_history)
app.post('/api/history', vérifierToken, async (req, res) => {
    try {
        const { draw, drawTime, bets, total } = req.body;

        const userResult = await pool.query('SELECT id, name, subsystem_id FROM users WHERE id = $1', [req.tokenInfo.userId]);
        if (!userResult.rows[0]) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        const userId = userResult.rows[0].id;
        const userName = userResult.rows[0].name;
        const subsystemId = userResult.rows[0].subsystem_id;

        await pool.query(`
            INSERT INTO bet_history (user_id, user_name, subsystem_id, draw, draw_time, bets, total, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [userId, userName, subsystemId, draw, drawTime, JSON.stringify(bets), total]);

        res.json({ success: true });
    } catch (error) {
        console.error('Erreur enregistrement historique:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer l'historique (optionnel)
app.get('/api/history', vérifierToken, async (req, res) => {
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [req.tokenInfo.userId]);
        if (!userResult.rows[0]) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        const userId = userResult.rows[0].id;

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const countResult = await pool.query('SELECT COUNT(*) FROM bet_history WHERE user_id = $1', [userId]);
        const total = parseInt(countResult.rows[0].count);

        const historyResult = await pool.query(`
            SELECT id, draw, draw_time, bets, total, date
            FROM bet_history
            WHERE user_id = $1
            ORDER BY date DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        const history = historyResult.rows.map(row => ({
            id: row.id,
            draw: row.draw,
            draw_time: row.draw_time,
            bets: row.bets,
            total: row.total,
            date: row.date
        }));

        res.json({
            success: true,
            history,
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Erreur récupération historique:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Récupérer les tickets gagnants (simplifié pour l'instant)
app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
    // À implémenter avec une table winning_records
    res.json({ success: true, tickets: [] });
});

// Vérifier les gagnants
app.post('/api/check-winners', vérifierToken, async (req, res) => {
    // À implémenter
    res.json({ success: true, winningTickets: [] });
});

// =================== ROUTES POUR MASTER / SOUS-SYSTÈMES ===================
// (à compléter si nécessaire, mais l'essentiel pour lotato est déjà là)

// =================== ROUTES HTML ===================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).send('Page non trouvée');
        res.sendFile(filePath);
    });
});

// =================== GESTION D'ERREURS ===================
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({ success: false, error: 'Erreur serveur interne' });
    }
    res.status(500).send('Erreur serveur interne');
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ success: false, error: 'Route API non trouvée' });
    } else {
        res.status(404).send('Page non trouvée');
    }
});

// =================== DÉMARRAGE ===================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📁 Compression GZIP activée`);
    console.log(`🌐 CORS activé`);
    console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
});
const express = require('express');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const sequelize = require('./database'); // Assurez-vous que database.js est configuré correctement

const app = express();

// =================== MIDDLEWARE ===================
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// =================== MODÈLES SEQUELIZE ===================
// Modèle Subsystem
const Subsystem = sequelize.define('Subsystem', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    subdomain: { type: DataTypes.STRING, allowNull: false, unique: true },
    contact_email: { type: DataTypes.STRING, allowNull: false },
    contact_phone: DataTypes.STRING,
    max_users: { type: DataTypes.INTEGER, defaultValue: 10 },
    subscription_type: { type: DataTypes.ENUM('basic','standard','premium','enterprise'), defaultValue: 'standard' },
    subscription_months: { type: DataTypes.INTEGER, defaultValue: 1 },
    subscription_expires: DataTypes.DATE,
    admin_user: { type: DataTypes.INTEGER }, // référence à User
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    stats_active_users: { type: DataTypes.INTEGER, defaultValue: 0 },
    stats_today_sales: { type: DataTypes.DECIMAL(10,2), defaultValue: 0 },
    stats_today_tickets: { type: DataTypes.INTEGER, defaultValue: 0 },
    stats_usage_percentage: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'subsystems', timestamps: false });

// Modèle User
const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    role: { type: DataTypes.ENUM('master','subsystem','supervisor','agent'), allowNull: false },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    subsystem_id: { type: DataTypes.INTEGER, references: { model: Subsystem, key: 'id' } },
    supervisor_id: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
    supervisor2_id: { type: DataTypes.INTEGER, references: { model: 'users', key: 'id' } },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    dateCreation: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    last_login: DataTypes.DATE
}, { tableName: 'users', timestamps: false });

// Modèle Draw (tirages)
const Draw = sequelize.define('Draw', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false, unique: true },
    icon: { type: DataTypes.STRING, defaultValue: 'fas fa-dice' },
    morning_time: { type: DataTypes.TIME, allowNull: false },
    evening_time: { type: DataTypes.TIME, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: Sequelize.NOW }
}, { tableName: 'draws', timestamps: false });

// Modèle Result
const Result = sequelize.define('Result', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    draw: { type: DataTypes.STRING, allowNull: false },
    draw_time: { type: DataTypes.ENUM('morning','evening'), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    lot1: { type: DataTypes.STRING(3), allowNull: false },
    lot2: DataTypes.STRING(2),
    lot3: DataTypes.STRING(2),
    verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    verified_by: { type: DataTypes.INTEGER, references: { model: User, key: 'id' } },
    verified_at: DataTypes.DATE
}, { tableName: 'results', timestamps: false, indexes: [{ fields: ['draw', 'draw_time', 'date'], unique: true }] });

// Modèle Bet
const Bet = sequelize.define('Bet', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    ticket_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tickets', key: 'id' } },
    type: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    number: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    multiplier: { type: DataTypes.INTEGER, allowNull: false },
    options: { type: DataTypes.JSON },
    perOptionAmount: DataTypes.DECIMAL(10,2),
    isLotto4: DataTypes.BOOLEAN,
    isLotto5: DataTypes.BOOLEAN,
    isAuto: DataTypes.BOOLEAN,
    isGroup: DataTypes.BOOLEAN,
    details: DataTypes.JSON
}, { tableName: 'bets', timestamps: false });

// Modèle Ticket
const Ticket = sequelize.define('Ticket', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    number: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    draw: { type: DataTypes.STRING, allowNull: false },
    draw_time: { type: DataTypes.ENUM('morning','evening'), allowNull: false },
    date: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    total: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    agent_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' } },
    agent_name: { type: DataTypes.STRING, allowNull: false },
    subsystem_id: { type: DataTypes.INTEGER, references: { model: Subsystem, key: 'id' } },
    is_printed: { type: DataTypes.BOOLEAN, defaultValue: false },
    printed_at: DataTypes.DATE,
    is_synced: { type: DataTypes.BOOLEAN, defaultValue: false },
    synced_at: DataTypes.DATE
}, { tableName: 'tickets', timestamps: false });

// Modèle MultiDrawTicket
const MultiDrawTicket = sequelize.define('MultiDrawTicket', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    number: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    date: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    bets: { type: DataTypes.JSON },
    draws: { type: DataTypes.JSON },
    total: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    agent_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' } },
    agent_name: { type: DataTypes.STRING, allowNull: false },
    subsystem_id: { type: DataTypes.INTEGER, references: { model: Subsystem, key: 'id' } },
    is_printed: { type: DataTypes.BOOLEAN, defaultValue: false },
    printed_at: DataTypes.DATE
}, { tableName: 'multi_draw_tickets', timestamps: false });

// Modèle Winner
const Winner = sequelize.define('Winner', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    ticket_id: { type: DataTypes.INTEGER, references: { model: Ticket, key: 'id' } },
    ticket_number: { type: DataTypes.INTEGER, allowNull: false },
    draw: { type: DataTypes.STRING, allowNull: false },
    draw_time: { type: DataTypes.ENUM('morning','evening'), allowNull: false },
    date: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    winning_bets: { type: DataTypes.JSON },
    total_winnings: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    paid: { type: DataTypes.BOOLEAN, defaultValue: false },
    paid_at: DataTypes.DATE,
    paid_by: { type: DataTypes.INTEGER, references: { model: User, key: 'id' } },
    agent_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' } }
}, { tableName: 'winners', timestamps: false });

// Modèle Config
const Config = sequelize.define('Config', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    company_name: { type: DataTypes.STRING, defaultValue: 'Nova Lotto' },
    company_phone: { type: DataTypes.STRING, defaultValue: '+509 32 53 49 58' },
    company_address: { type: DataTypes.STRING, defaultValue: 'Cap Haïtien' },
    report_title: { type: DataTypes.STRING, defaultValue: 'Nova Lotto' },
    report_phone: { type: DataTypes.STRING, defaultValue: '40104585' },
    logo_url: { type: DataTypes.STRING, defaultValue: 'logo-borlette.jpg' }
}, { tableName: 'config', timestamps: false });

// Modèle History
const History = sequelize.define('History', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    date: { type: DataTypes.DATE, defaultValue: Sequelize.NOW },
    draw: { type: DataTypes.STRING, allowNull: false },
    draw_time: { type: DataTypes.ENUM('morning','evening'), allowNull: false },
    bets: { type: DataTypes.JSON },
    total: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    agent_id: { type: DataTypes.INTEGER, references: { model: User, key: 'id' } },
    agent_name: { type: DataTypes.STRING, allowNull: false }
}, { tableName: 'history', timestamps: false });

// =================== ASSOCIATIONS ===================
User.belongsTo(Subsystem, { foreignKey: 'subsystem_id' });
User.belongsTo(User, { as: 'supervisor', foreignKey: 'supervisor_id' });
User.belongsTo(User, { as: 'supervisor2', foreignKey: 'supervisor2_id' });

Subsystem.belongsTo(User, { as: 'admin', foreignKey: 'admin_user' });

Ticket.belongsTo(User, { as: 'agent', foreignKey: 'agent_id' });
Ticket.belongsTo(Subsystem, { foreignKey: 'subsystem_id' });
Ticket.hasMany(Bet, { foreignKey: 'ticket_id', onDelete: 'CASCADE' });

MultiDrawTicket.belongsTo(User, { as: 'agent', foreignKey: 'agent_id' });
MultiDrawTicket.belongsTo(Subsystem, { foreignKey: 'subsystem_id' });

Winner.belongsTo(Ticket, { foreignKey: 'ticket_id' });
Winner.belongsTo(User, { as: 'agent', foreignKey: 'agent_id' });
Winner.belongsTo(User, { as: 'paidBy', foreignKey: 'paid_by' });

History.belongsTo(User, { as: 'agent', foreignKey: 'agent_id' });

Result.belongsTo(User, { as: 'verifier', foreignKey: 'verified_by' });

// =================== SYNC BASE DE DONNÉES ===================
// Utilisation de sync({ alter: true }) pour ajuster les tables existantes sans perdre les données
// et éviter l'erreur de contrainte UNIQUE sur la colonne subdomain.
sequelize.sync({ alter: true })
    .then(async () => {
        console.log('✅ Base de données synchronisée (alter: true)');
        // Ajout des données de test si nécessaire
        await seedTestData();
    })
    .catch(err => console.error('❌ Erreur synchronisation DB:', err));

// =================== DONNÉES DE TEST ===================
async function seedTestData() {
    try {
        // Vérifier si un utilisateur master existe déjà
        const masterCount = await User.count({ where: { role: 'master' } });
        if (masterCount === 0) {
            console.log('Création des utilisateurs de test...');

            // 1. Créer un master
            const master = await User.create({
                username: 'master',
                password: 'master123',
                name: 'Master Admin',
                email: 'master@novalotto.com',
                role: 'master',
                level: 1
            });
            console.log('Master créé:', master.username);

            // 2. Créer un sous-système exemple
            const sub1 = await Subsystem.create({
                name: 'Sous-système Alpha',
                subdomain: 'alpha',
                contact_email: 'admin@alpha.com',
                contact_phone: '+123456789',
                max_users: 50,
                subscription_type: 'enterprise',
                subscription_months: 12,
                subscription_expires: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
                is_active: true
            });

            // 3. Créer un administrateur de sous-système (propriétaire)
            const subAdmin = await User.create({
                username: 'subadmin_alpha',
                password: 'sub123',
                name: 'Admin Alpha',
                email: 'admin@alpha.com',
                role: 'subsystem',
                level: 1,
                subsystem_id: sub1.id
            });
            sub1.admin_user = subAdmin.id;
            await sub1.save();

            // 4. Créer des superviseurs niveau 1 et 2
            const sup1 = await User.create({
                username: 'supervisor1_alpha',
                password: 'sup1',
                name: 'Superviseur N1 Alpha',
                email: 'sup1@alpha.com',
                role: 'supervisor',
                level: 1,
                subsystem_id: sub1.id
            });
            const sup2 = await User.create({
                username: 'supervisor2_alpha',
                password: 'sup2',
                name: 'Superviseur N2 Alpha',
                email: 'sup2@alpha.com',
                role: 'supervisor',
                level: 2,
                subsystem_id: sub1.id
            });

            // 5. Créer 5 agents pour ce sous-système
            for (let i = 1; i <= 5; i++) {
                const agent = await User.create({
                    username: `agent_alpha_${i}`,
                    password: `agent${i}`,
                    name: `Agent Alpha ${i}`,
                    email: `agent${i}@alpha.com`,
                    role: 'agent',
                    level: 1,
                    subsystem_id: sub1.id,
                    supervisor_id: sup1.id,
                    supervisor2_id: sup2.id
                });
            }

            // 6. Créer un second sous-système pour variété
            const sub2 = await Subsystem.create({
                name: 'Sous-système Beta',
                subdomain: 'beta',
                contact_email: 'admin@beta.com',
                contact_phone: '+987654321',
                max_users: 30,
                subscription_type: 'standard',
                subscription_months: 6,
                subscription_expires: new Date(new Date().setMonth(new Date().getMonth() + 6)),
                is_active: true
            });

            const subAdmin2 = await User.create({
                username: 'subadmin_beta',
                password: 'subbeta123',
                name: 'Admin Beta',
                email: 'admin@beta.com',
                role: 'subsystem',
                level: 1,
                subsystem_id: sub2.id
            });
            sub2.admin_user = subAdmin2.id;
            await sub2.save();

            // Superviseurs Beta
            const sup1b = await User.create({
                username: 'supervisor1_beta',
                password: 'sup1beta',
                name: 'Superviseur N1 Beta',
                email: 'sup1@beta.com',
                role: 'supervisor',
                level: 1,
                subsystem_id: sub2.id
            });
            const sup2b = await User.create({
                username: 'supervisor2_beta',
                password: 'sup2beta',
                name: 'Superviseur N2 Beta',
                email: 'sup2@beta.com',
                role: 'supervisor',
                level: 2,
                subsystem_id: sub2.id
            });

            // 5 agents Beta
            for (let i = 1; i <= 5; i++) {
                await User.create({
                    username: `agent_beta_${i}`,
                    password: `agentbeta${i}`,
                    name: `Agent Beta ${i}`,
                    email: `agent${i}@beta.com`,
                    role: 'agent',
                    level: 1,
                    subsystem_id: sub2.id,
                    supervisor_id: sup1b.id,
                    supervisor2_id: sup2b.id
                });
            }

            // 7. Créer quelques tirages par défaut
            await Draw.bulkCreate([
                { name: 'Borlette', code: 'boro', morning_time: '12:00:00', evening_time: '18:00:00', order: 1 },
                { name: 'Lotto 3', code: 'lotto3', morning_time: '13:00:00', evening_time: '19:00:00', order: 2 },
                { name: 'Lotto 4', code: 'lotto4', morning_time: '14:00:00', evening_time: '20:00:00', order: 3 },
                { name: 'Lotto 5', code: 'lotto5', morning_time: '15:00:00', evening_time: '21:00:00', order: 4 }
            ]);

            console.log('✅ Données de test insérées avec succès.');
        } else {
            console.log('ℹ️ Des utilisateurs existent déjà, pas de création de test.');
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'insertion des données de test:', error);
    }
}

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN ===================
function vérifierToken(req, res, next) {
    let token = req.query.token || req.body.token || req.headers['x-auth-token'];
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.substring(7);
    }
    if (!token || !token.startsWith('nova_')) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ success: false, error: 'Token manquant ou invalide' });
        }
    }
    if (token && token.startsWith('nova_')) {
        const parts = token.split('_');
        if (parts.length >= 5) {
            req.tokenInfo = {
                token,
                userId: parts[2],
                role: parts[3],
                level: parts[4] || '1'
            };
        }
    }
    next();
}

// =================== MIDDLEWARE POUR L'ACCÈS AUX SOUS-SYSTÈMES ===================
async function vérifierAccèsSubsystem(req, res, next) {
    try {
        if (!req.tokenInfo) return res.status(401).json({ success: false, error: 'Non authentifié' });
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        if (user.role === 'subsystem' || (user.role === 'supervisor' && user.level === 2)) {
            req.currentUser = user;
            next();
        } else {
            return res.status(403).json({ success: false, error: 'Accès refusé. Rôle subsystem ou superviseur level 2 requis.' });
        }
    } catch (error) {
        console.error('Erreur vérification accès sous-système:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
}

async function vérifierAgent(req, res, next) {
    try {
        if (!req.tokenInfo) return res.status(401).json({ success: false, error: 'Non authentifié' });
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        if (user.role !== 'agent') return res.status(403).json({ success: false, error: 'Accès refusé. Rôle agent requis.' });
        req.currentUser = user;
        next();
    } catch (error) {
        console.error('Erreur vérification agent:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
}

// =================== ROUTES DE CONNEXION ===================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        let dbRole = role;
        let level = 1;
        if (role === 'supervisor1') { dbRole = 'supervisor'; level = 1; }
        else if (role === 'supervisor2') { dbRole = 'supervisor'; level = 2; }

        const where = { username, password, role: dbRole };
        if (dbRole === 'supervisor') where.level = level;

        const user = await User.findOne({ where, include: [{ model: Subsystem }] });
        if (!user) return res.status(401).json({ success: false, error: 'Identifiants ou rôle incorrect' });

        const token = `nova_${Date.now()}_${user.id}_${user.role}_${user.level || 1}`;

        let redirectUrl;
        switch (user.role) {
            case 'agent': redirectUrl = '/lotato.html'; break;
            case 'supervisor':
                if (user.level === 1) redirectUrl = '/control-level1.html';
                else if (user.level === 2) redirectUrl = '/control-level2.html';
                else redirectUrl = '/supervisor-control.html';
                break;
            case 'subsystem': redirectUrl = '/subsystem-admin.html'; break;
            case 'master': redirectUrl = '/master-dashboard.html'; break;
            default: redirectUrl = '/';
        }
        redirectUrl += `?token=${encodeURIComponent(token)}`;

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
                email: user.email,
                subsystem_id: user.subsystem_id,
                subsystem_name: user.Subsystem ? user.Subsystem.name : null
            }
        });
    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES POUR LOTATO (AGENT) ===================
app.post('/api/history', vérifierToken, async (req, res) => {
    try {
        const { draw, drawTime, bets, total } = req.body;
        if (!draw || !drawTime || !bets || total === undefined) {
            return res.status(400).json({ success: false, error: 'Données manquantes' });
        }
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        await History.create({
            draw, draw_time: drawTime, bets, total,
            agent_id: user.id, agent_name: user.name
        });
        res.json({ success: true, message: 'Historique enregistré' });
    } catch (error) {
        console.error('Erreur enregistrement historique:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/history', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const { count, rows } = await History.findAndCountAll({
            where: { agent_id: user.id },
            order: [['date', 'DESC']],
            limit, offset
        });

        res.json({
            success: true,
            history: rows.map(r => ({
                id: r.id,
                date: r.date,
                draw: r.draw,
                draw_time: r.draw_time,
                bets: r.bets,
                total: r.total
            })),
            pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('Erreur récupération historique:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const tickets = await Ticket.findAll({
            where: { agent_id: user.id },
            order: [['date', 'DESC']],
            limit: 100,
            include: [{ model: Bet }]
        });

        // Trouver le prochain numéro de ticket
        const lastTicket = await Ticket.findOne({ order: [['number', 'DESC']] });
        const nextTicketNumber = lastTicket ? lastTicket.number + 1 : 100001;

        res.json({
            success: true,
            tickets: tickets.map(t => ({
                id: t.id,
                number: t.number,
                date: t.date,
                draw: t.draw,
                draw_time: t.draw_time,
                bets: t.Bets,
                total: t.total,
                agent_name: t.agent_name,
                subsystem_id: t.subsystem_id
            })),
            nextTicketNumber
        });
    } catch (error) {
        console.error('Erreur chargement tickets:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/tickets', vérifierToken, async (req, res) => {
    try {
        const { number, draw, draw_time, bets, total, agent_id, agent_name, subsystem_id, date } = req.body;
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        let finalSubsystemId = subsystem_id || user.subsystem_id;
        if (!finalSubsystemId) {
            return res.status(400).json({ success: false, error: 'L\'agent doit être associé à un sous-système' });
        }

        let ticketNumber;
        if (number) {
            const existing = await Ticket.findOne({ where: { number } });
            if (existing) {
                const last = await Ticket.findOne({ order: [['number', 'DESC']] });
                ticketNumber = last ? last.number + 1 : 100001;
            } else {
                ticketNumber = number;
            }
        } else {
            const last = await Ticket.findOne({ order: [['number', 'DESC']] });
            ticketNumber = last ? last.number + 1 : 100001;
        }

        const ticket = await Ticket.create({
            number: ticketNumber,
            draw, draw_time,
            total: total || bets.reduce((sum, b) => sum + b.amount, 0),
            agent_id: agent_id || user.id,
            agent_name: agent_name || user.name,
            subsystem_id: finalSubsystemId,
            date: date || new Date()
        });

        // Créer les bets associés
        if (bets && Array.isArray(bets)) {
            await Bet.bulkCreate(bets.map(b => ({ ...b, ticket_id: ticket.id })));
        }

        const createdTicket = await Ticket.findByPk(ticket.id, { include: [{ model: Bet }] });
        res.json({ success: true, ticket: createdTicket });
    } catch (error) {
        console.error('❌ Erreur sauvegarde fiche:', error);
        res.status(500).json({ success: false, error: 'Erreur lors de la sauvegarde de la fiche: ' + error.message });
    }
});

app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const tickets = await Ticket.findAll({
            where: { agent_id: user.id, is_synced: false },
            order: [['date', 'DESC']],
            limit: 50,
            include: [{ model: Bet }]
        });

        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Erreur tickets en attente:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/tickets/pending', vérifierToken, async (req, res) => {
    try {
        const { ticket } = req.body;
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const last = await Ticket.findOne({ order: [['number', 'DESC']] });
        const ticketNumber = last ? last.number + 1 : 100001;

        const newTicket = await Ticket.create({
            number: ticketNumber,
            draw: ticket.draw,
            draw_time: ticket.drawTime,
            bets: ticket.bets,
            total: ticket.total,
            agent_id: user.id,
            agent_name: user.name,
            subsystem_id: user.subsystem_id,
            date: new Date(),
            is_synced: false
        });

        if (ticket.bets && Array.isArray(ticket.bets)) {
            await Bet.bulkCreate(ticket.bets.map(b => ({ ...b, ticket_id: newTicket.id })));
        }

        res.json({ success: true, ticket: newTicket });
    } catch (error) {
        console.error('Erreur sauvegarde ticket en attente:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        let where = {};
        if (user.role === 'agent') where.agent_id = user.id;
        else if (user.role === 'subsystem' || (user.role === 'supervisor' && user.level === 2)) {
            const subsystem = await Subsystem.findByPk(user.subsystem_id);
            if (!subsystem) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });
            const agents = await User.findAll({ where: { subsystem_id: subsystem.id, role: 'agent' }, attributes: ['id'] });
            where.agent_id = { [Op.in]: agents.map(a => a.id) };
        } else return res.status(403).json({ success: false, error: 'Accès refusé' });

        const winners = await Winner.findAll({ where, order: [['date', 'DESC']], limit: 50 });
        res.json({ success: true, tickets: winners });
    } catch (error) {
        console.error('Erreur chargement gagnants:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const tickets = await MultiDrawTicket.findAll({
            where: { agent_id: user.id },
            order: [['date', 'DESC']],
            limit: 50
        });
        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Erreur fiches multi-tirages:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
    try {
        const { ticket } = req.body;
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const last = await MultiDrawTicket.findOne({ order: [['number', 'DESC']] });
        const ticketNumber = last ? last.number + 1 : 500001;

        const multiDrawTicket = await MultiDrawTicket.create({
            number: ticketNumber,
            date: new Date(),
            bets: ticket.bets,
            draws: Array.from(ticket.draws),
            total: ticket.totalAmount,
            agent_id: user.id,
            agent_name: user.name,
            subsystem_id: user.subsystem_id
        });

        res.json({ success: true, ticket: multiDrawTicket });
    } catch (error) {
        console.error('Erreur sauvegarde fiche multi-tirages:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/company-info', vérifierToken, async (req, res) => {
    try {
        let config = await Config.findOne();
        if (!config) config = await Config.create();
        res.json({ success: true, ...config.toJSON() });
    } catch (error) {
        console.error('Erreur chargement info entreprise:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/logo', vérifierToken, async (req, res) => {
    try {
        const config = await Config.findOne();
        res.json({ success: true, logoUrl: config ? config.logo_url : 'logo-borlette.jpg' });
    } catch (error) {
        console.error('Erreur chargement logo:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/results', vérifierToken, async (req, res) => {
    try {
        const { draw, draw_time, date } = req.query;
        let where = {};
        if (draw) where.draw = draw;
        if (draw_time) where.draw_time = draw_time;
        if (date) {
            where.date = date; // exact date
        }
        const results = await Result.findAll({ where, order: [['date', 'DESC']], limit: 50 });

        // Convertir en format attendu par le frontend (objet imbriqué)
        const resultsDatabase = {};
        results.forEach(r => {
            if (!resultsDatabase[r.draw]) resultsDatabase[r.draw] = {};
            resultsDatabase[r.draw][r.draw_time] = {
                date: r.date,
                lot1: r.lot1,
                lot2: r.lot2 || '',
                lot3: r.lot3 || ''
            };
        });

        res.json({ success: true, results: resultsDatabase });
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/check-winners', vérifierToken, async (req, res) => {
    try {
        const { draw, draw_time } = req.body;
        const result = await Result.findOne({ where: { draw, draw_time }, order: [['date', 'DESC']] });
        if (!result) {
            return res.json({ success: true, winningTickets: [], message: 'Aucun résultat trouvé' });
        }

        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });

        const tickets = await Ticket.findAll({
            where: {
                agent_id: user.id,
                draw,
                draw_time,
                date: { [Op.gte]: new Date(new Date().setHours(0,0,0,0)) }
            },
            include: [{ model: Bet }]
        });

        const winningTickets = [];
        for (const ticket of tickets) {
            const winningBets = [];
            let totalWinnings = 0;
            // Logique de vérification simplifiée (à adapter selon vos règles)
            // Exemple minimal : on considère qu'un ticket est gagnant si un pari correspond au résultat
            // Vous devrez implémenter la logique complète ici
            if (ticket.Bets) {
                for (const bet of ticket.Bets) {
                    // Exemple basique : si le numéro du pari est le même que le lot1
                    if (bet.number === result.lot1) {
                        winningBets.push(bet);
                        totalWinnings += parseFloat(bet.amount) * bet.multiplier;
                    }
                }
            }
            if (winningBets.length > 0) {
                const winner = await Winner.create({
                    ticket_id: ticket.id,
                    ticket_number: ticket.number,
                    draw, draw_time,
                    date: new Date(),
                    winning_bets: winningBets,
                    total_winnings: totalWinnings,
                    agent_id: user.id
                });
                winningTickets.push({
                    id: ticket.id,
                    number: ticket.number,
                    date: ticket.date,
                    draw, draw_time,
                    result: { lot1: result.lot1, lot2: result.lot2, lot3: result.lot3 },
                    winningBets,
                    totalWinnings
                });
            }
        }

        res.json({ success: true, winningTickets });
    } catch (error) {
        console.error('Erreur vérification gagnants:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES API EXISTANTES ===================
app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'online', timestamp: new Date().toISOString() });
});

app.get('/api/auth/verify', (req, res) => {
    const token = req.query.token;
    if (!token || !token.startsWith('nova_')) return res.json({ success: false, valid: false });
    res.json({ success: true, valid: true });
});

app.get('/api/auth/check', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo) return res.status(401).json({ success: false, error: 'Session invalide' });
        const user = await User.findByPk(req.tokenInfo.userId, { include: [{ model: Subsystem }] });
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
                subsystem_name: user.Subsystem ? user.Subsystem.name : null
            }
        });
    } catch (error) {
        console.error('Erreur vérification session:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES POUR MASTER DASHBOARD ===================
app.post('/api/master/init', async (req, res) => {
    try {
        const { masterUsername, masterPassword, companyName, masterEmail } = req.body;
        const existingMaster = await User.findOne({ where: { role: 'master' } });
        if (existingMaster) return res.status(400).json({ success: false, error: 'Un compte master existe déjà' });

        const masterUser = await User.create({
            username: masterUsername || 'master',
            password: masterPassword || 'master123',
            name: companyName || 'Master Admin',
            email: masterEmail || 'master@novalotto.com',
            role: 'master',
            level: 1
        });

        const token = `nova_${Date.now()}_${masterUser.id}_master_1`;
        res.json({ success: true, token, user: masterUser });
    } catch (error) {
        console.error('Erreur initialisation master:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/master/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ where: { username, password, role: 'master' } });
        if (!user) return res.status(401).json({ success: false, error: 'Identifiants master incorrects' });

        const token = `nova_${Date.now()}_${user.id}_master_1`;
        res.json({ success: true, token, user });
    } catch (error) {
        console.error('Erreur connexion master:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/check-session', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        res.json({ success: true, user });
    } catch (error) {
        console.error('Erreur vérification session master:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Routes Master pour les sous-systèmes
app.post('/api/master/subsystems', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        const { name, subdomain, contact_email, contact_phone, max_users, subscription_type, subscription_months, send_credentials } = req.body;

        const existing = await Subsystem.findOne({ where: { subdomain: subdomain.toLowerCase() } });
        if (existing) return res.status(400).json({ success: false, error: 'Sous-domaine déjà utilisé' });

        let adminUser = await User.findOne({ where: { username: contact_email } });
        if (!adminUser) {
            const generatedPassword = Math.random().toString(36).slice(-8);
            adminUser = await User.create({
                username: contact_email,
                password: generatedPassword,
                name,
                email: contact_email,
                role: 'subsystem',
                level: 1
            });
        } else if (adminUser.role !== 'subsystem') {
            return res.status(400).json({ success: false, error: 'Email déjà utilisé avec un rôle différent' });
        }

        const subscription_expires = new Date();
        subscription_expires.setMonth(subscription_expires.getMonth() + (subscription_months || 1));

        const subsystem = await Subsystem.create({
            name,
            subdomain: subdomain.toLowerCase(),
            contact_email,
            contact_phone,
            max_users: max_users || 10,
            subscription_type: subscription_type || 'standard',
            subscription_months: subscription_months || 1,
            subscription_expires,
            admin_user: adminUser.id,
            is_active: true
        });

        adminUser.subsystem_id = subsystem.id;
        await adminUser.save();

        // Construction de l'URL d'accès
        let domain = 'novalotto.com';
        if (req.headers.host) {
            const hostParts = req.headers.host.split('.');
            if (hostParts.length > 2) domain = hostParts.slice(1).join('.');
            else domain = req.headers.host;
        }
        domain = domain.replace('master.', '');
        const access_url = `https://${subdomain.toLowerCase()}.${domain}`;

        res.json({
            success: true,
            subsystem,
            admin_credentials: { username: contact_email, password: adminUser.password, email: contact_email },
            access_url
        });
    } catch (error) {
        console.error('Erreur création sous-système:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur: ' + error.message });
    }
});

app.get('/api/master/subsystems', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search;
        const status = req.query.status;

        let where = {};
        if (search) {
            where[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { subdomain: { [Op.like]: `%${search}%` } },
                { contact_email: { [Op.like]: `%${search}%` } }
            ];
        }
        if (status && status !== 'all') {
            if (status === 'active') where.is_active = true;
            else if (status === 'inactive') where.is_active = false;
            else if (status === 'expired') where.subscription_expires = { [Op.lt]: new Date() };
        }

        const { count, rows } = await Subsystem.findAndCountAll({
            where,
            order: [['created_at', 'DESC']],
            limit,
            offset,
            include: [{ model: User, as: 'admin', attributes: ['id', 'username', 'name', 'email'] }]
        });

        const formatted = await Promise.all(rows.map(async (sub) => {
            const activeUsers = await User.count({ where: { subsystem_id: sub.id, is_active: true, role: { [Op.in]: ['agent', 'supervisor'] } } });
            const usage = sub.max_users > 0 ? Math.round((activeUsers / sub.max_users) * 100) : 0;
            return {
                id: sub.id,
                name: sub.name,
                subdomain: sub.subdomain,
                contact_email: sub.contact_email,
                contact_phone: sub.contact_phone,
                max_users: sub.max_users,
                subscription_type: sub.subscription_type,
                subscription_expires: sub.subscription_expires,
                is_active: sub.is_active,
                created_at: sub.created_at,
                stats: {
                    active_users: activeUsers,
                    today_sales: sub.stats_today_sales,
                    today_tickets: sub.stats_today_tickets,
                    usage_percentage: usage
                },
                users: activeUsers
            };
        }));

        res.json({
            success: true,
            subsystems: formatted,
            pagination: { page, limit, total: count, total_pages: Math.ceil(count / limit) }
        });
    } catch (error) {
        console.error('Erreur listage sous-systèmes:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/master/subsystems/:id', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        const subsystem = await Subsystem.findByPk(req.params.id, { include: [{ model: User, as: 'admin' }] });
        if (!subsystem) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });

        const users = await User.findAll({ where: { subsystem_id: subsystem.id, is_active: true } });
        const usersByRole = {
            owner: users.filter(u => u.role === 'subsystem').length,
            admin: 0,
            supervisor: users.filter(u => u.role === 'supervisor').length,
            agent: users.filter(u => u.role === 'agent').length
        };
        const activeUsers = users.length;
        const usage = subsystem.max_users > 0 ? Math.round((activeUsers / subsystem.max_users) * 100) : 0;

        res.json({
            success: true,
            subsystem: {
                ...subsystem.toJSON(),
                stats: { active_users: activeUsers, today_sales: subsystem.stats_today_sales, today_tickets: subsystem.stats_today_tickets, usage_percentage: usage },
                users,
                users_by_role: usersByRole
            }
        });
    } catch (error) {
        console.error('Erreur détails sous-système:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/master/subsystems/:id/deactivate', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') return res.status(403).json({ success: false, error: 'Accès refusé' });
        const subsystem = await Subsystem.findByPk(req.params.id);
        if (!subsystem) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });
        subsystem.is_active = false;
        await subsystem.save();
        await User.update({ is_active: false }, { where: { subsystem_id: subsystem.id } });
        res.json({ success: true, message: 'Sous-système désactivé' });
    } catch (error) {
        console.error('Erreur désactivation:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/master/subsystems/:id/activate', vérifierToken, async (req, res) => {
    try {
        if (!req.tokenInfo || req.tokenInfo.role !== 'master') return res.status(403).json({ success: false, error: 'Accès refusé' });
        const subsystem = await Subsystem.findByPk(req.params.id);
        if (!subsystem) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });
        subsystem.is_active = true;
        await subsystem.save();
        await User.update({ is_active: true }, { where: { id: subsystem.admin_user } });
        res.json({ success: true, message: 'Sous-système activé' });
    } catch (error) {
        console.error('Erreur activation:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES POUR LES SOUS-SYSTÈMES ===================
app.get('/api/subsystems/mine', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user) return res.status(401).json({ success: false, error: 'Utilisateur non trouvé' });
        let subsystems = [];
        if (user.role === 'subsystem') {
            subsystems = await Subsystem.findAll({ where: { admin_user: user.id, is_active: true } });
        } else if (user.role === 'master') {
            subsystems = await Subsystem.findAll({ where: { is_active: true } });
        } else if (user.role === 'supervisor' && user.level === 2) {
            subsystems = await Subsystem.findAll({ where: { id: user.subsystem_id, is_active: true } });
        } else return res.status(403).json({ success: false, error: 'Accès refusé' });

        res.json({ success: true, subsystems });
    } catch (error) {
        console.error('Erreur récupération mes sous-systèmes:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/subsystem/users', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const user = req.currentUser;
        const { role, status } = req.query;
        let where = { subsystem_id: user.subsystem_id };
        if (role) {
            if (role === 'supervisor1') {
                where.role = 'supervisor';
                where.level = 1;
            } else if (role === 'supervisor2') {
                where.role = 'supervisor';
                where.level = 2;
            } else {
                where.role = role;
            }
        }
        if (status) where.is_active = status === 'active';

        const users = await User.findAll({ where, order: [['dateCreation', 'DESC']] });
        const usersWithStats = await Promise.all(users.map(async (u) => {
            if (u.role === 'agent') {
                const today = new Date(); today.setHours(0,0,0,0);
                const ticketsCount = await Ticket.count({ where: { agent_id: u.id, date: { [Op.gte]: today } } });
                return { ...u.toJSON(), tickets_today: ticketsCount, is_online: Math.random() > 0.3 };
            }
            if (u.role === 'supervisor') {
                const agents = await User.count({ where: { subsystem_id: user.subsystem_id, role: 'agent', [Op.or]: [{ supervisor_id: u.id }, { supervisor2_id: u.id }] } });
                return { ...u.toJSON(), agents_count: agents, is_online: Math.random() > 0.3 };
            }
            return u.toJSON();
        }));
        res.json({ success: true, users: usersWithStats });
    } catch (error) {
        console.error('Erreur listage utilisateurs:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const user = req.currentUser;
        const userId = req.params.id;
        const found = await User.findOne({ where: { id: userId, subsystem_id: user.subsystem_id } });
        if (!found) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        res.json({ success: true, user: found });
    } catch (error) {
        console.error('Erreur récupération utilisateur:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/subsystem/users/:id/status', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const { is_active } = req.body;
        const userId = req.params.id;

        const user = await User.findOne({ where: { id: userId, subsystem_id: currentUser.subsystem_id } });
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        if (user.id === currentUser.id) return res.status(400).json({ success: false, error: 'Vous ne pouvez pas modifier votre propre statut' });

        user.is_active = is_active;
        await user.save();

        // Mise à jour des stats du sous-système
        const subsystem = await Subsystem.findByPk(currentUser.subsystem_id);
        const activeUsers = await User.count({ where: { subsystem_id: subsystem.id, is_active: true, role: { [Op.in]: ['agent', 'supervisor'] } } });
        subsystem.stats_active_users = activeUsers;
        subsystem.stats_usage_percentage = subsystem.max_users > 0 ? Math.round((activeUsers / subsystem.max_users) * 100) : 0;
        await subsystem.save();

        res.json({ success: true, message: `Utilisateur ${is_active ? 'activé' : 'désactivé'}` });
    } catch (error) {
        console.error('Erreur changement statut:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const userId = req.params.id;
        const { name, level, password } = req.body;

        const user = await User.findOne({ where: { id: userId, subsystem_id: currentUser.subsystem_id } });
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
        if (user.role === 'subsystem' && currentUser.role !== 'subsystem') {
            return res.status(403).json({ success: false, error: 'Vous ne pouvez pas modifier un administrateur' });
        }

        if (name) user.name = name;
        if (level && user.role === 'supervisor') user.level = level;
        if (password) user.password = password;
        await user.save();

        res.json({ success: true, message: 'Utilisateur modifié', user });
    } catch (error) {
        console.error('Erreur modification utilisateur:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/subsystem/assign', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const { userId, supervisorId, supervisorType } = req.body;

        const user = await User.findOne({ where: { id: userId, subsystem_id: currentUser.subsystem_id } });
        const supervisor = await User.findOne({ where: { id: supervisorId, subsystem_id: currentUser.subsystem_id } });
        if (!user || !supervisor) return res.status(404).json({ success: false, error: 'Utilisateur ou superviseur non trouvé' });
        if (supervisor.role !== 'supervisor') return res.status(400).json({ success: false, error: 'Le superviseur doit avoir le rôle superviseur' });

        if (supervisorType === 'supervisor1') user.supervisor_id = supervisorId;
        else if (supervisorType === 'supervisor2') user.supervisor2_id = supervisorId;
        await user.save();

        res.json({ success: true, message: 'Assignation réussie' });
    } catch (error) {
        console.error('Erreur assignation:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/subsystem/stats', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const subsystem = await Subsystem.findByPk(currentUser.subsystem_id);
        if (!subsystem) return res.status(404).json({ success: false, error: 'Sous-système non trouvé' });

        const totalUsers = await User.count({ where: { subsystem_id: subsystem.id, role: { [Op.in]: ['agent', 'supervisor'] } } });
        const activeUsers = await User.count({ where: { subsystem_id: subsystem.id, is_active: true, role: { [Op.in]: ['agent', 'supervisor'] } } });
        const usage = subsystem.max_users > 0 ? Math.round((activeUsers / subsystem.max_users) * 100) : 0;

        subsystem.stats_active_users = activeUsers;
        subsystem.stats_usage_percentage = usage;
        await subsystem.save();

        res.json({
            success: true,
            stats: {
                total_users: totalUsers,
                active_users: activeUsers,
                max_users: subsystem.max_users,
                usage_percentage: usage,
                today_sales: subsystem.stats_today_sales,
                today_tickets: subsystem.stats_today_tickets,
                subsystem_name: subsystem.name
            }
        });
    } catch (error) {
        console.error('Erreur statistiques sous-système:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/subsystem/tickets', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const { period, limit, draw, date } = req.query;

        let where = { subsystem_id: currentUser.subsystem_id };
        if (period === 'today') {
            const today = new Date(); today.setHours(0,0,0,0);
            where.date = { [Op.gte]: today };
        } else if (period === 'week') {
            const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
            where.date = { [Op.gte]: weekAgo };
        } else if (period === 'month') {
            const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
            where.date = { [Op.gte]: monthAgo };
        }
        if (draw && draw !== 'all') where.draw = draw;
        if (date) {
            const start = new Date(date); start.setHours(0,0,0,0);
            const end = new Date(date); end.setHours(23,59,59,999);
            where.date = { [Op.between]: [start, end] };
        }

        const limitValue = parseInt(limit) || 100;
        const tickets = await Ticket.findAll({ where, order: [['date', 'DESC']], limit: limitValue, include: [{ model: Bet }] });

        const totalTickets = tickets.length;
        const totalSales = tickets.reduce((sum, t) => sum + parseFloat(t.total), 0);

        if (period === 'today' || !period) {
            const subsystem = await Subsystem.findByPk(currentUser.subsystem_id);
            subsystem.stats_today_tickets = totalTickets;
            subsystem.stats_today_sales = totalSales;
            await subsystem.save();
        }

        res.json({ success: true, tickets, stats: { total_tickets: totalTickets, total_sales: totalSales } });
    } catch (error) {
        console.error('Erreur récupération tickets:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.put('/api/tickets/:id/sync', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
    try {
        const currentUser = req.currentUser;
        const ticket = await Ticket.findOne({ where: { id: req.params.id, subsystem_id: currentUser.subsystem_id } });
        if (!ticket) return res.status(404).json({ success: false, error: 'Ticket non trouvé' });

        ticket.is_synced = true;
        ticket.synced_at = new Date();
        await ticket.save();

        res.json({ success: true, message: 'Ticket synchronisé' });
    } catch (error) {
        console.error('Erreur synchronisation ticket:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES POUR LES SUPERVISEURS NIVEAU 1 ===================
app.get('/api/supervisor1/agent-stats', vérifierToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.tokenInfo.userId);
        if (!user || user.role !== 'supervisor' || user.level !== 1) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const agents = await User.findAll({
            where: {
                role: 'agent',
                subsystem_id: user.subsystem_id,
                [Op.or]: [{ supervisor_id: user.id }, { supervisor2_id: user.id }],
                is_active: true
            }
        });

        const agentStats = await Promise.all(agents.map(async (agent) => {
            const today = new Date(); today.setHours(0,0,0,0);
            const ticketsCount = await Ticket.count({ where: { agent_id: agent.id, date: { [Op.gte]: today } } });
            const salesResult = await Ticket.sum('total', { where: { agent_id: agent.id, date: { [Op.gte]: today } } });
            const totalSales = salesResult || 0;
            return {
                id: agent.id,
                name: agent.name,
                username: agent.username,
                tickets_today: ticketsCount,
                sales_today: totalSales,
                is_online: Math.random() > 0.3
            };
        }));

        const totals = {
            total_agents: agents.length,
            total_tickets: agentStats.reduce((sum, s) => sum + s.tickets_today, 0),
            total_sales: agentStats.reduce((sum, s) => sum + s.sales_today, 0),
            online_agents: agentStats.filter(s => s.is_online).length
        };

        res.json({ success: true, agents: agentStats, totals });
    } catch (error) {
        console.error('Erreur récupération statistiques agents:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/supervisor1/agent-reports/:agentId', vérifierToken, async (req, res) => {
    try {
        const supervisor = await User.findByPk(req.tokenInfo.userId);
        if (!supervisor || supervisor.role !== 'supervisor' || supervisor.level !== 1) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }

        const agent = await User.findOne({
            where: {
                id: req.params.agentId,
                role: 'agent',
                subsystem_id: supervisor.subsystem_id,
                [Op.or]: [{ supervisor_id: supervisor.id }, { supervisor2_id: supervisor.id }]
            }
        });
        if (!agent) return res.status(404).json({ success: false, error: 'Agent non trouvé' });

        const { start_date, end_date } = req.query;
        let dateFilter = {};
        if (start_date && end_date) {
            const start = new Date(start_date); start.setHours(0,0,0,0);
            const end = new Date(end_date); end.setHours(23,59,59,999);
            dateFilter = { date: { [Op.between]: [start, end] } };
        } else {
            const today = new Date(); today.setHours(0,0,0,0);
            dateFilter = { date: { [Op.gte]: today } };
        }

        const tickets = await Ticket.findAll({ where: { agent_id: agent.id, ...dateFilter }, order: [['date', 'DESC']] });
        const multiDrawTickets = await MultiDrawTicket.findAll({ where: { agent_id: agent.id, ...dateFilter }, order: [['date', 'DESC']] });

        const totalTickets = tickets.length + multiDrawTickets.length;
        const totalSales = tickets.reduce((s, t) => s + parseFloat(t.total), 0) + multiDrawTickets.reduce((s, t) => s + parseFloat(t.total), 0);

        res.json({
            success: true,
            agent: { id: agent.id, name: agent.name, username: agent.username },
            period: dateFilter,
            tickets,
            multiDrawTickets,
            totals: { total_tickets: totalTickets, total_sales: totalSales, regular_tickets: tickets.length, multi_draw_tickets: multiDrawTickets.length }
        });
    } catch (error) {
        console.error('Erreur récupération rapport agent:', error);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// =================== ROUTES HTML ===================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).send('Page non trouvée');
        res.sendFile(filePath);
    });
});

// =================== MIDDLEWARE D'ERREUR ===================
app.use((err, req, res, next) => {
    if (err) {
        console.error('Erreur serveur:', err);
        if (req.path.startsWith('/api/')) return res.status(500).json({ success: false, error: 'Erreur serveur interne' });
        return res.status(500).send('Erreur serveur interne');
    }
    next();
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Route API non trouvée' });
    res.status(404).send('Page non trouvée');
});

// =================== DÉMARRAGE DU SERVEUR ===================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`✅ Compression GZIP activée`);
    console.log(`🌐 CORS activé`);
    console.log(`📦 Base de données: MySQL (TiDB)`);
    // Afficher les routes disponibles (similaire à avant)
});
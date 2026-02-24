const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

const app = express();

// === MIDDLEWARE GZIP COMPRESSION ===
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Middleware CORS
app.use(cors());

// Middleware standard
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve tous les fichiers statiques à la racine avec compression GZIP
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/lottodb', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Connexion MongoDB échouée'));
db.once('open', () => {
  console.log('✅ MongoDB connecté avec succès !');
});

// =================== SCHÉMAS SIMPLES ===================

// Schema utilisateur simple
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  email: { type: String },
  role: {
    type: String,
    enum: ['master', 'subsystem', 'supervisor', 'agent'],
    required: true
  },
  level: { type: Number, default: 1 },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  supervisor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  supervisor2_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
  dateCreation: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// =================== SCHÉMAS POUR LES SOUS-SYSTÈMES ===================

const subsystemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subdomain: { type: String, required: true, unique: true },
  contact_email: { type: String, required: true },
  contact_phone: { type: String },
  max_users: { type: Number, default: 10 },
  subscription_type: { 
    type: String, 
    enum: ['basic', 'standard', 'premium', 'enterprise'], 
    default: 'standard' 
  },
  subscription_months: { type: Number, default: 1 },
  subscription_expires: { type: Date },
  admin_user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  stats: {
    active_users: { type: Number, default: 0 },
    today_sales: { type: Number, default: 0 },
    today_tickets: { type: Number, default: 0 },
    usage_percentage: { type: Number, default: 0 }
  }
});

const Subsystem = mongoose.model('Subsystem', subsystemSchema);

// =================== NOUVEAUX SCHÉMAS POUR LOTATO ===================

const drawSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  icon: { type: String, default: 'fas fa-dice' },
  times: {
    morning: { type: String, required: true },
    evening: { type: String, required: true }
  },
  is_active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const Draw = mongoose.model('Draw', drawSchema);

const resultSchema = new mongoose.Schema({
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, required: true },
  lot1: { type: String, required: true },
  lot2: { type: String },
  lot3: { type: String },
  verified: { type: Boolean, default: false },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verified_at: { type: Date }
});

const Result = mongoose.model('Result', resultSchema);

const betSchema = new mongoose.Schema({
  type: { type: String, required: true },
  name: { type: String, required: true },
  number: { type: String, required: true },
  amount: { type: Number, required: true },
  multiplier: { type: Number, required: true },
  options: { type: mongoose.Schema.Types.Mixed },
  perOptionAmount: { type: Number },
  isLotto4: { type: Boolean, default: false },
  isLotto5: { type: Boolean, default: false },
  isAuto: { type: Boolean, default: false },
  isGroup: { type: Boolean, default: false },
  details: { type: mongoose.Schema.Types.Mixed }
});

const ticketSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, default: Date.now },
  bets: [betSchema],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date },
  is_synced: { type: Boolean, default: false },
  synced_at: { type: Date }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

const multiDrawTicketSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  date: { type: Date, default: Date.now },
  bets: [{
    gameType: { type: String, required: true },
    name: { type: String, required: true },
    number: { type: String, required: true },
    amount: { type: Number, required: true },
    multiplier: { type: Number, required: true },
    draws: [{ type: String }],
    options: { type: mongoose.Schema.Types.Mixed }
  }],
  draws: [{ type: String }],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true },
  subsystem_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
  is_printed: { type: Boolean, default: false },
  printed_at: { type: Date }
});

const MultiDrawTicket = mongoose.model('MultiDrawTicket', multiDrawTicketSchema);

const winnerSchema = new mongoose.Schema({
  ticket_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  ticket_number: { type: Number, required: true },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  date: { type: Date, default: Date.now },
  winning_bets: [{
    type: { type: String },
    name: { type: String },
    number: { type: String },
    matched_number: { type: String },
    win_type: { type: String },
    win_amount: { type: Number }
  }],
  total_winnings: { type: Number, required: true },
  paid: { type: Boolean, default: false },
  paid_at: { type: Date },
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const Winner = mongoose.model('Winner', winnerSchema);

const configSchema = new mongoose.Schema({
  company_name: { type: String, default: 'Nova Lotto' },
  company_phone: { type: String, default: '+509 32 53 49 58' },
  company_address: { type: String, default: 'Cap Haïtien' },
  report_title: { type: String, default: 'Nova Lotto' },
  report_phone: { type: String, default: '40104585' },
  logo_url: { type: String, default: 'logo-borlette.jpg' }
});

const Config = mongoose.model('Config', configSchema);

const historySchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  draw: { type: String, required: true },
  draw_time: { type: String, enum: ['morning', 'evening'], required: true },
  bets: [betSchema],
  total: { type: Number, required: true },
  agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  agent_name: { type: String, required: true }
});

const History = mongoose.model('History', historySchema);

// =================== MIDDLEWARE DE VÉRIFICATION DE TOKEN ===================

function vérifierToken(req, res, next) {
  let token = req.query.token;
  
  if (!token && req.body) {
    token = req.body.token;
  }
  
  if (!token) {
    token = req.headers['x-auth-token'];
  }
  
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  
  console.log('Token reçu dans vérifierToken:', token);
  
  if (!token || !token.startsWith('nova_')) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token manquant ou invalide' 
      });
    }
  }
  
  if (token && token.startsWith('nova_')) {
    const parts = token.split('_');
    console.log('Parts du token:', parts);
    if (parts.length >= 5) {
      req.tokenInfo = {
        token: token,
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
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    if (user.role === 'subsystem' || (user.role === 'supervisor' && user.level === 2)) {
      req.currentUser = user;
      next();
    } else {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle subsystem ou superviseur level 2 requis.'
      });
    }
  } catch (error) {
    console.error('Erreur vérification accès sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la vérification des droits d\'accès'
    });
  }
}

// =================== MIDDLEWARE POUR LES AGENTS ===================

async function vérifierAgent(req, res, next) {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    if (user.role !== 'agent') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle agent requis.'
      });
    }

    req.currentUser = user;
    next();
  } catch (error) {
    console.error('Erreur vérification agent:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la vérification des droits'
    });
  }
}

// =================== ROUTES DE CONNEXION ===================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    console.log('--- Tentative de connexion ---');
    console.log('Body reçu:', { username, password, role });
    
    let dbRole = role;
    let level = 1;
    
    if (role === 'supervisor1') {
      dbRole = 'supervisor';
      level = 1;
    } else if (role === 'supervisor2') {
      dbRole = 'supervisor';
      level = 2;
    }
    
    let query = {
      username,
      password,
      role: dbRole
    };
    
    if (dbRole === 'supervisor') {
      query.level = level;
    }
    
    console.log('Requête MongoDB:', query);
    const user = await User.findOne(query);

    if (!user) {
      console.log('Utilisateur non trouvé ou informations incorrectes');
      return res.status(401).json({
        success: false,
        error: 'Identifiants ou rôle incorrect'
      });
    }

    console.log('Utilisateur trouvé:', user.username, user.role, user.level, 'subsystem_id:', user.subsystem_id);

    const token = `nova_${Date.now()}_${user._id}_${user.role}_${user.level || 1}`;

    let redirectUrl;
    switch (user.role) {
      case 'agent':
        redirectUrl = '/lotato.html';
        break;
      case 'supervisor':
        if (user.level === 1) {
          redirectUrl = '/control-level1.html';
        } else if (user.level === 2) {
          redirectUrl = '/control-level2.html';
        } else {
          redirectUrl = '/supervisor-control.html';
        }
        break;
      case 'subsystem':
        redirectUrl = '/subsystem-admin.html';
        break;
      case 'master':
        redirectUrl = '/master-dashboard.html';
        break;
      default:
        redirectUrl = '/';
    }

    redirectUrl += `?token=${encodeURIComponent(token)}`;

    console.log('Token généré:', token);
    console.log('Redirection vers:', redirectUrl);

    res.json({
      success: true,
      redirectUrl: redirectUrl,
      token: token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        subsystem_id: user.subsystem_id
      }
    });

  } catch (error) {
    console.error('Erreur login:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la connexion'
    });
  }
});

// =================== ROUTES POUR LOTATO ===================

app.post('/api/history', vérifierToken, async (req, res) => {
  try {
    const { draw, drawTime, bets, total } = req.body;

    if (!draw || !drawTime || !bets || total === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Données manquantes pour l\'historique'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const history = new History({
      date: new Date(),
      draw: draw,
      draw_time: drawTime,
      bets: bets,
      total: total,
      agent_id: user._id,
      agent_name: user.name
    });

    await history.save();

    res.json({
      success: true,
      message: 'Historique enregistré avec succès'
    });
  } catch (error) {
    console.error('Erreur enregistrement historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'historique'
    });
  }
});

app.get('/api/history', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const history = await History.find({ agent_id: user._id })
      .skip(skip)
      .limit(limit)
      .sort({ date: -1 });

    const total = await History.countDocuments({ agent_id: user._id });

    res.json({
      success: true,
      history: history.map(record => ({
        id: record._id,
        date: record.date,
        draw: record.draw,
        draw_time: record.draw_time,
        bets: record.bets,
        total: record.total
      })),
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'historique'
    });
  }
});

app.get('/api/tickets', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const tickets = await Ticket.find({ agent_id: user._id })
      .sort({ date: -1 })
      .limit(100);

    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const nextTicketNumber = lastTicket ? lastTicket.number + 1 : 100001;

    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id
      })),
      nextTicketNumber: nextTicketNumber
    });
  } catch (error) {
    console.error('Erreur chargement tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets'
    });
  }
});

app.post('/api/tickets', vérifierToken, async (req, res) => {
    try {
        console.log('--- Sauvegarde ticket ---');
        console.log('Body reçu:', req.body);
        console.log('Token info:', req.tokenInfo);

        const { 
            number, 
            draw, 
            draw_time, 
            bets, 
            total, 
            agent_id, 
            agent_name, 
            subsystem_id, 
            date 
        } = req.body;

        const user = await User.findById(req.tokenInfo.userId);
        console.log('Utilisateur authentifié:', user ? user.toObject() : 'Aucun');

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Utilisateur non trouvé'
            });
        }

        let finalSubsystemId = subsystem_id || user.subsystem_id;
        console.log('subsystem_id final:', finalSubsystemId);

        if (!finalSubsystemId) {
            console.log('ERREUR: Pas de subsystem_id');
            return res.status(400).json({
                success: false,
                error: 'L\'agent doit être associé à un sous-système'
            });
        }

        let ticketNumber;
        if (number) {
            const existingTicket = await Ticket.findOne({ number: number });
            if (existingTicket) {
                const lastTicket = await Ticket.findOne().sort({ number: -1 });
                ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
            } else {
                ticketNumber = number;
            }
        } else {
            const lastTicket = await Ticket.findOne().sort({ number: -1 });
            ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;
        }

        const ticket = new Ticket({
            number: ticketNumber,
            draw: draw,
            draw_time: draw_time,
            bets: bets,
            total: total || bets.reduce((sum, bet) => sum + bet.amount, 0),
            agent_id: agent_id || user._id,
            agent_name: agent_name || user.name,
            subsystem_id: finalSubsystemId,
            date: date || new Date()
        });

        await ticket.save();

        console.log('✅ Ticket sauvegardé:', ticket._id, 'numéro:', ticket.number);

        res.json({
            success: true,
            ticket: {
                id: ticket._id,
                number: ticket.number,
                date: ticket.date,
                draw: ticket.draw,
                draw_time: ticket.draw_time,
                bets: ticket.bets,
                total: ticket.total,
                agent_name: ticket.agent_name,
                subsystem_id: ticket.subsystem_id
            }
        });
    } catch (error) {
        console.error('❌ Erreur sauvegarde fiche:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur lors de la sauvegarde de la fiche: ' + error.message
        });
    }
});

app.get('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const tickets = await Ticket.find({ 
      agent_id: user._id,
      is_synced: false 
    })
      .sort({ date: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_name: ticket.agent_name
      }))
    });
  } catch (error) {
    console.error('Erreur tickets en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des tickets en attente'
    });
  }
});

app.post('/api/tickets/pending', vérifierToken, async (req, res) => {
  try {
    const { ticket } = req.body;

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const lastTicket = await Ticket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 100001;

    const newTicket = new Ticket({
      number: ticketNumber,
      draw: ticket.draw,
      draw_time: ticket.drawTime,
      bets: ticket.bets,
      total: ticket.total,
      agent_id: user._id,
      agent_name: user.name,
      subsystem_id: user.subsystem_id,
      date: new Date(),
      is_synced: false
    });

    await newTicket.save();

    res.json({
      success: true,
      ticket: {
        id: newTicket._id,
        number: newTicket.number,
        date: newTicket.date,
        draw: newTicket.draw,
        draw_time: newTicket.draw_time,
        bets: newTicket.bets,
        total: newTicket.total,
        agent_name: newTicket.agent_name
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde ticket en attente:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde du ticket en attente'
    });
  }
});

app.get('/api/tickets/winning', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const winners = await Winner.find({ agent_id: user._id })
      .sort({ date: -1 })
      .limit(50);

    res.json({
      success: true,
      tickets: winners.map(winner => ({
        id: winner._id,
        ticket_number: winner.ticket_number,
        date: winner.date,
        draw: winner.draw,
        draw_time: winner.draw_time,
        winning_bets: winner.winning_bets,
        total_winnings: winner.total_winnings,
        paid: winner.paid
      }))
    });
  } catch (error) {
    console.error('Erreur chargement gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des gagnants'
    });
  }
});

app.get('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const tickets = await MultiDrawTicket.find({ agent_id: user._id })
      .sort({ date: -1 })
      .limit(50);
    
    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        bets: ticket.bets,
        draws: ticket.draws,
        total: ticket.total,
        agent_name: ticket.agent_name,
        subsystem_id: ticket.subsystem_id
      }))
    });
  } catch (error) {
    console.error('Erreur fiches multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des fiches multi-tirages'
    });
  }
});

app.post('/api/tickets/multi-draw', vérifierToken, async (req, res) => {
  try {
    const { ticket } = req.body;

    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    const lastTicket = await MultiDrawTicket.findOne().sort({ number: -1 });
    const ticketNumber = lastTicket ? lastTicket.number + 1 : 500001;

    const multiDrawTicket = new MultiDrawTicket({
      number: ticketNumber,
      date: new Date(),
      bets: ticket.bets,
      draws: Array.from(ticket.draws),
      total: ticket.totalAmount,
      agent_id: user._id,
      agent_name: user.name,
      subsystem_id: user.subsystem_id
    });

    await multiDrawTicket.save();

    res.json({
      success: true,
      ticket: {
        id: multiDrawTicket._id,
        number: multiDrawTicket.number,
        date: multiDrawTicket.date,
        bets: multiDrawTicket.bets,
        draws: multiDrawTicket.draws,
        total: multiDrawTicket.total,
        agent_name: multiDrawTicket.agent_name,
        subsystem_id: multiDrawTicket.subsystem_id
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde fiche multi-tirages:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la sauvegarde de la fiche multi-tirages'
    });
  }
});

app.get('/api/company-info', vérifierToken, async (req, res) => {
  try {
    let config = await Config.findOne();
    
    if (!config) {
      config = new Config();
      await config.save();
    }
    
    res.json({
      success: true,
      company_name: config.company_name,
      company_phone: config.company_phone,
      company_address: config.company_address,
      report_title: config.report_title,
      report_phone: config.report_phone
    });
  } catch (error) {
    console.error('Erreur chargement info entreprise:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des informations de l\'entreprise'
    });
  }
});

app.get('/api/logo', vérifierToken, async (req, res) => {
  try {
    const config = await Config.findOne();
    
    res.json({
      success: true,
      logoUrl: config ? config.logo_url : 'logo-borlette.jpg'
    });
  } catch (error) {
    console.error('Erreur chargement logo:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement du logo'
    });
  }
});

app.get('/api/results', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time, date } = req.query;
    
    let query = {};
    if (draw) query.draw = draw;
    if (draw_time) query.draw_time = draw_time;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }
    
    const results = await Result.find(query)
      .sort({ date: -1 })
      .limit(50);
    
    const resultsDatabase = {};
    results.forEach(result => {
      if (!resultsDatabase[result.draw]) {
        resultsDatabase[result.draw] = {};
      }
      resultsDatabase[result.draw][result.draw_time] = {
        date: result.date,
        lot1: result.lot1,
        lot2: result.lot2 || '',
        lot3: result.lot3 || ''
      };
    });
    
    res.json({
      success: true,
      results: resultsDatabase
    });
  } catch (error) {
    console.error('Erreur chargement résultats:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du chargement des résultats'
    });
  }
});

app.post('/api/check-winners', vérifierToken, async (req, res) => {
  try {
    const { draw, draw_time } = req.body;
    
    const result = await Result.findOne({ 
      draw: draw,
      draw_time: draw_time 
    }).sort({ date: -1 });
    
    if (!result) {
      return res.json({
        success: true,
        winningTickets: [],
        message: 'Aucun résultat trouvé pour ce tirage'
      });
    }
    
    const user = await User.findById(req.tokenInfo.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    const tickets = await Ticket.find({
      agent_id: user._id,
      draw: draw,
      draw_time: draw_time,
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });
    
    const winningTickets = [];
    
    for (const ticket of tickets) {
      const winningBets = [];
      
      for (const bet of ticket.bets) {
        let winAmount = 0;
        let winType = '';
        let matchedNumber = '';
        
        if (bet.type === 'borlette' || bet.type === 'boulpe') {
          const lot1Last2 = result.lot1.substring(1);
          
          if (bet.number === lot1Last2) {
            winAmount = bet.amount * 60;
            winType = '1er lot';
            matchedNumber = lot1Last2;
          } else if (bet.number === result.lot2) {
            winAmount = bet.amount * 20;
            winType = '2e lot';
            matchedNumber = result.lot2;
          } else if (bet.number === result.lot3) {
            winAmount = bet.amount * 10;
            winType = '3e lot';
            matchedNumber = result.lot3;
          }
        } else if (bet.type === 'lotto3') {
          if (bet.number === result.lot1) {
            winAmount = bet.amount * 500;
            winType = 'Lotto 3';
            matchedNumber = result.lot1;
          }
        } else if (bet.type === 'marriage') {
          const [num1, num2] = bet.number.split('*');
          const numbers = [result.lot1.substring(1), result.lot2, result.lot3];
          
          if (numbers.includes(num1) && numbers.includes(num2)) {
            winAmount = bet.amount * 1000;
            winType = 'Maryaj';
            matchedNumber = `${num1}*${num2}`;
          }
        } else if (bet.type === 'grap') {
          if (result.lot1[0] === result.lot1[1] && result.lot1[1] === result.lot1[2]) {
            if (bet.number === result.lot1) {
              winAmount = bet.amount * 500;
              winType = 'Grap';
              matchedNumber = result.lot1;
            }
          }
        }
        
        if (winAmount > 0) {
          winningBets.push({
            type: bet.type,
            name: bet.name,
            number: bet.number,
            matched_number: matchedNumber,
            win_type: winType,
            win_amount: winAmount
          });
        }
      }
      
      if (winningBets.length > 0) {
        const totalWinnings = winningBets.reduce((sum, bet) => sum + bet.win_amount, 0);
        
        const winner = new Winner({
          ticket_id: ticket._id,
          ticket_number: ticket.number,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          date: new Date(),
          winning_bets: winningBets,
          total_winnings: totalWinnings,
          agent_id: user._id
        });
        
        await winner.save();
        
        winningTickets.push({
          id: ticket._id,
          number: ticket.number,
          date: ticket.date,
          draw: ticket.draw,
          draw_time: ticket.draw_time,
          result: {
            lot1: result.lot1,
            lot2: result.lot2,
            lot3: result.lot3
          },
          winningBets: winningBets,
          totalWinnings: totalWinnings
        });
      }
    }
    
    res.json({
      success: true,
      winningTickets: winningTickets
    });
  } catch (error) {
    console.error('Erreur vérification gagnants:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification des gagnants'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    database: db.readyState === 1 ? 'connected' : 'disconnected'
  });
});

app.get('/api/auth/verify', (req, res) => {
  try {
    const token = req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
      return res.json({
        success: false,
        valid: false
      });
    }
    
    res.json({
      success: true,
      valid: true
    });
  } catch (error) {
    res.json({
      success: false,
      valid: false
    });
  }
});

app.get('/api/auth/check', vérifierToken, async (req, res) => {
  try {
    console.log('--- Auth check ---');
    console.log('Token info:', req.tokenInfo);

    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Session invalide'
      });
    }
    
    const user = await User.findById(req.tokenInfo.userId);
    console.log('Utilisateur trouvé par ID:', user ? user.toObject() : 'Aucun');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    const subsystem = await Subsystem.findById(user.subsystem_id);
    
    res.json({
      success: true,
      admin: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        subsystem_id: user.subsystem_id,
        subsystem_name: subsystem ? subsystem.name : 'Non spécifié'
      }
    });
  } catch (error) {
    console.error('Erreur vérification session:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de la session'
    });
  }
});

// =================== ROUTES POUR LE MASTER DASHBOARD ===================

app.post('/api/master/init', async (req, res) => {
  try {
    const { masterUsername, masterPassword, companyName, masterEmail } = req.body;
    
    const existingMaster = await User.findOne({ role: 'master' });
    if (existingMaster) {
      return res.status(400).json({
        success: false,
        error: 'Un compte master existe déjà'
      });
    }
    
    const masterUser = new User({
      username: masterUsername || 'master',
      password: masterPassword || 'master123',
      name: companyName || 'Master Admin',
      email: masterEmail || 'master@novalotto.com',
      role: 'master',
      level: 1
    });
    
    await masterUser.save();
    
    const token = `nova_${Date.now()}_${masterUser._id}_master_1`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: masterUser._id,
        username: masterUser.username,
        name: masterUser.name,
        role: masterUser.role,
        level: masterUser.level,
        email: masterUser.email,
        full_name: masterUser.name
      }
    });
    
  } catch (error) {
    console.error('Erreur initialisation master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'initialisation'
    });
  }
});

app.post('/api/master/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ 
      username: username,
      password: password,
      role: 'master'
    });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants master incorrects'
      });
    }
    
    const token = `nova_${Date.now()}_${user._id}_master_1`;
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        full_name: user.name
      }
    });
    
  } catch (error) {
    console.error('Erreur connexion master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion'
    });
  }
});

app.get('/api/master/check-session', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }
    
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        role: user.role,
        level: user.level,
        email: user.email,
        full_name: user.name
      }
    });
    
  } catch (error) {
    console.error('Erreur vérification session master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de la session'
    });
  }
});

// =================== ROUTES POUR LES SOUS-SYSTÈMES ===================

app.post('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const {
      name,
      subdomain,
      contact_email,
      contact_phone,
      max_users,
      subscription_type,
      subscription_months,
      send_credentials
    } = req.body;

    if (!name || !subdomain || !contact_email) {
      return res.status(400).json({
        success: false,
        error: 'Le nom, le sous-domaine et l\'email de contact sont obligatoires'
      });
    }

    const existingSubsystem = await Subsystem.findOne({ subdomain: subdomain.toLowerCase() });
    if (existingSubsystem) {
      return res.status(400).json({
        success: false,
        error: 'Ce sous-domaine est déjà utilisé'
      });
    }

    let adminUser = await User.findOne({ username: contact_email });
    
    if (!adminUser) {
      const generatedPassword = Math.random().toString(36).slice(-8);

      adminUser = new User({
        username: contact_email,
        password: generatedPassword,
        name: name,
        email: contact_email,
        role: 'subsystem',
        level: 1
      });

      await adminUser.save();
    } else {
      if (adminUser.role !== 'subsystem') {
        return res.status(400).json({
          success: false,
          error: 'Cet email est déjà utilisé avec un rôle différent'
        });
      }
    }

    const subscription_expires = new Date();
    subscription_expires.setMonth(subscription_expires.getMonth() + (subscription_months || 1));

    const subsystem = new Subsystem({
      name,
      subdomain: subdomain.toLowerCase(),
      contact_email,
      contact_phone,
      max_users: max_users || 10,
      subscription_type: subscription_type || 'standard',
      subscription_months: subscription_months || 1,
      subscription_expires,
      admin_user: adminUser._id,
      is_active: true,
      stats: {
        active_users: 0,
        today_sales: 0,
        today_tickets: 0,
        usage_percentage: 0
      }
    });

    await subsystem.save();

    adminUser.subsystem_id = subsystem._id;
    await adminUser.save();

    let domain = 'novalotto.com';
    if (req.headers.host) {
      const hostParts = req.headers.host.split('.');
      if (hostParts.length > 2) {
        domain = hostParts.slice(1).join('.');
      } else {
        domain = req.headers.host;
      }
    }
    
    domain = domain.replace('master.', '');
    
    const access_url = `https://${subdomain.toLowerCase()}.${domain}`;

    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        max_users: subsystem.max_users,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        is_active: subsystem.is_active,
        created_at: subsystem.created_at
      },
      admin_credentials: {
        username: contact_email,
        password: adminUser.password,
        email: contact_email
      },
      access_url: access_url
    });

  } catch (error) {
    console.error('Erreur création sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création du sous-système: ' + error.message
    });
  }
});

app.get('/api/master/subsystems', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search;
    const status = req.query.status;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subdomain: { $regex: search, $options: 'i' } },
        { contact_email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        query.is_active = true;
      } else if (status === 'inactive') {
        query.is_active = false;
      } else if (status === 'expired') {
        query.subscription_expires = { $lt: new Date() };
      }
    }

    const total = await Subsystem.countDocuments(query);

    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const subsystems = await Subsystem.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 })
      .populate('admin_user', 'username name email');

    const formattedSubsystems = await Promise.all(subsystems.map(async (subsystem) => {
      const activeUsers = await User.countDocuments({ 
        subsystem_id: subsystem._id,
        is_active: true 
      });
      
      const usage_percentage = subsystem.max_users > 0 ? 
        Math.round((activeUsers / subsystem.max_users) * 100) : 0;
      
      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        max_users: subsystem.max_users,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        is_active: subsystem.is_active,
        created_at: subsystem.created_at,
        stats: {
          active_users: activeUsers,
          today_sales: 0,
          today_tickets: 0,
          usage_percentage: usage_percentage
        },
        users: activeUsers
      };
    }));

    res.json({
      success: true,
      subsystems: formattedSubsystems,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        total_pages: totalPages
      }
    });

  } catch (error) {
    console.error('Erreur listage sous-systèmes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors du listage des sous-systèmes'
    });
  }
});

app.get('/api/master/subsystems/:id', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystemId = req.params.id;

    const subsystem = await Subsystem.findById(subsystemId).populate('admin_user', 'username name email');

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const users = await User.find({ subsystem_id: subsystemId, is_active: true });
    
    const usersByRole = {
      owner: 0,
      admin: 0,
      supervisor: 0,
      agent: 0
    };
    
    users.forEach(user => {
      if (user.role === 'subsystem') usersByRole.owner++;
      else if (user.role === 'supervisor') usersByRole.supervisor++;
      else if (user.role === 'agent') usersByRole.agent++;
    });

    const activeUsers = users.length;
    const usage_percentage = subsystem.max_users > 0 ? 
      Math.round((activeUsers / subsystem.max_users) * 100) : 0;

    res.json({
      success: true,
      subsystem: {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        contact_email: subsystem.contact_email,
        contact_phone: subsystem.contact_phone,
        max_users: subsystem.max_users,
        subscription_type: subsystem.subscription_type,
        subscription_expires: subsystem.subscription_expires,
        is_active: subsystem.is_active,
        created_at: subsystem.created_at,
        stats: {
          active_users: activeUsers,
          today_sales: 0,
          today_tickets: 0,
          usage_percentage: usage_percentage
        },
        users: users,
        users_by_role: usersByRole
      }
    });

  } catch (error) {
    console.error('Erreur détails sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération du sous-système'
    });
  }
});

app.put('/api/master/subsystems/:id/deactivate', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystemId = req.params.id;

    const subsystem = await Subsystem.findById(subsystemId);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    subsystem.is_active = false;
    await subsystem.save();

    await User.updateMany(
      { subsystem_id: subsystemId },
      { $set: { is_active: false } }
    );

    res.json({
      success: true,
      message: 'Sous-système désactivé avec succès'
    });

  } catch (error) {
    console.error('Erreur désactivation sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la désactivation du sous-système'
    });
  }
});

app.put('/api/master/subsystems/:id/activate', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystemId = req.params.id;

    const subsystem = await Subsystem.findById(subsystemId);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    subsystem.is_active = true;
    await subsystem.save();

    await User.findByIdAndUpdate(
      subsystem.admin_user,
      { $set: { is_active: true } }
    );

    res.json({
      success: true,
      message: 'Sous-système activé avec succès'
    });

  } catch (error) {
    console.error('Erreur activation sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'activation du sous-système'
    });
  }
});

app.get('/api/master/subsystems/stats', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const subsystems = await Subsystem.find();

    const subsystemsWithStats = await Promise.all(subsystems.map(async (subsystem) => {
      const active_agents = await User.countDocuments({ 
        subsystem_id: subsystem._id,
        role: 'agent',
        is_active: true
      });

      return {
        id: subsystem._id,
        name: subsystem.name,
        subdomain: subsystem.subdomain,
        total_sales: 0,
        total_payout: 0,
        profit: 0,
        master_commission: 0,
        active_agents: active_agents,
        profit_rate: 0
      };
    }));

    res.json({
      success: true,
      subsystems: subsystemsWithStats
    });

  } catch (error) {
    console.error('Erreur statistiques sous-systèmes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

app.get('/api/master/consolidated-report', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo || req.tokenInfo.role !== 'master') {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle master requis.'
      });
    }

    const { start_date, end_date, group_by } = req.query;

    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = end_date ? new Date(end_date) : new Date();
    
    if (start_date) startDate.setHours(0, 0, 0, 0);
    if (end_date) endDate.setHours(23, 59, 59, 999);

    const subsystemsMap = new Map();
    
    const subsystems = await Subsystem.find();
    
    subsystems.forEach(subsystem => {
      const subsystemId = subsystem._id.toString();
      subsystemsMap.set(subsystemId, {
        subsystem_id: subsystemId,
        subsystem_name: subsystem.name,
        tickets_count: 0,
        total_sales: 0,
        total_payout: 0,
        profit: 0
      });
    });

    const subsystems_detail = Array.from(subsystemsMap.values());

    const report = {
      period: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      },
      summary: {
        total_tickets: 0,
        total_sales: 0,
        total_payout: 0,
        total_profit: 0,
        profit_margin: 0
      },
      subsystems_detail: subsystems_detail,
      daily_breakdown: []
    };

    res.json({
      success: true,
      report: report
    });

  } catch (error) {
    console.error('Erreur génération rapport:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la génération du rapport'
    });
  }
});

app.get('/api/subsystems/mine', vérifierToken, async (req, res) => {
  try {
    if (!req.tokenInfo) {
      return res.status(401).json({
        success: false,
        error: 'Non authentifié'
      });
    }

    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    let subsystems = [];
    
    if (user.role === 'subsystem') {
      subsystems = await Subsystem.find({ 
        admin_user: user._id,
        is_active: true 
      });
    } else if (user.role === 'master') {
      subsystems = await Subsystem.find({ is_active: true });
    } else if (user.role === 'supervisor' && user.level === 2) {
      subsystems = await Subsystem.find({ 
        _id: user.subsystem_id,
        is_active: true 
      });
    } else {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle insuffisant.'
      });
    }

    const formattedSubsystems = subsystems.map(subsystem => ({
      id: subsystem._id,
      name: subsystem.name,
      subdomain: subsystem.subdomain,
      contact_email: subsystem.contact_email,
      contact_phone: subsystem.contact_phone,
      max_users: subsystem.max_users,
      subscription_type: subsystem.subscription_type,
      subscription_expires: subsystem.subscription_expires,
      is_active: subsystem.is_active,
      created_at: subsystem.created_at
    }));

    res.json({
      success: true,
      subsystems: formattedSubsystems
    });

  } catch (error) {
    console.error('Erreur récupération sous-systèmes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des sous-systèmes'
    });
  }
});

// =================== ROUTES POUR LA GESTION DES UTILISATEURS DANS UN SOUS-SYSTÈME ===================

app.post('/api/subsystem/users/create', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const { 
      name, 
      username, 
      password, 
      role, 
      level, 
      supervisorId, 
      supervisorType 
    } = req.body;

    if (!name || !username || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'Nom, identifiant, mot de passe et rôle sont obligatoires'
      });
    }

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const activeUsersCount = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });

    if (activeUsersCount >= subsystem.max_users) {
      return res.status(400).json({
        success: false,
        error: `Limite d'utilisateurs atteinte (${subsystem.max_users} maximum)`
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Cet identifiant est déjà utilisé'
      });
    }

    let userLevel = 1;
    if (role === 'supervisor') {
      userLevel = level || 1;
    } else if (role === 'agent') {
      userLevel = 1;
    }

    const newUser = new User({
      username,
      password,
      name,
      role,
      level: userLevel,
      subsystem_id: subsystem._id,
      is_active: true,
      dateCreation: new Date()
    });

    if (role === 'agent' && supervisorId) {
      const supervisor = await User.findOne({
        _id: supervisorId,
        subsystem_id: subsystem._id,
        role: 'supervisor'
      });

      if (supervisor) {
        if (supervisorType === 'supervisor1') {
          newUser.supervisor_id = supervisorId;
        } else if (supervisorType === 'supervisor2') {
          newUser.supervisor2_id = supervisorId;
        }
      }
    }

    await newUser.save();

    subsystem.stats.active_users = activeUsersCount + 1;
    subsystem.stats.usage_percentage = Math.round(((activeUsersCount + 1) / subsystem.max_users) * 100);
    await subsystem.save();

    res.json({
      success: true,
      message: 'Utilisateur créé avec succès',
      user: {
        id: newUser._id,
        name: newUser.name,
        username: newUser.username,
        role: newUser.role,
        level: newUser.level,
        subsystem_id: newUser.subsystem_id
      }
    });

  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la création de l\'utilisateur'
    });
  }
});

app.delete('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const userId = req.params.id;

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    if (user.role === 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez pas supprimer un administrateur de sous-système'
      });
    }

    if (user._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas vous supprimer vous-même'
      });
    }

    user.is_active = false;
    await user.save();

    const activeUsersCount = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    subsystem.stats.active_users = activeUsersCount;
    subsystem.stats.usage_percentage = Math.round((activeUsersCount / subsystem.max_users) * 100);
    await subsystem.save();

    res.json({
      success: true,
      message: 'Utilisateur désactivé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la suppression de l\'utilisateur'
    });
  }
});

app.get('/api/subsystem/tickets', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const { period, limit, draw, date } = req.query;

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    let query = { subsystem_id: subsystem._id };
    
    if (period === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.date = { $gte: today };
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      query.date = { $gte: weekAgo };
    } else if (period === 'month') {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      query.date = { $gte: monthAgo };
    }

    if (draw && draw !== 'all') {
      query.draw = draw;
    }

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const limitValue = parseInt(limit) || 100;

    const tickets = await Ticket.find(query)
      .sort({ date: -1 })
      .limit(limitValue);

    const totalTickets = tickets.length;
    const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);

    if (period === 'today' || !period) {
      subsystem.stats.today_tickets = totalTickets;
      subsystem.stats.today_sales = totalSales;
      await subsystem.save();
    }

    res.json({
      success: true,
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        number: ticket.number,
        date: ticket.date,
        draw: ticket.draw,
        draw_time: ticket.draw_time,
        bets: ticket.bets,
        total: ticket.total,
        agent_id: ticket.agent_id,
        agent_name: ticket.agent_name,
        is_synced: ticket.is_synced
      })),
      stats: {
        total_tickets: totalTickets,
        total_sales: totalSales
      }
    });

  } catch (error) {
    console.error('Erreur récupération tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des tickets'
    });
  }
});

app.get('/api/subsystem/activities', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const subsystem = await Subsystem.findById(currentUser.subsystem_id);

    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const activities = [
      {
        user: 'Debesly borlette',
        action: 'Création d\'utilisateur',
        details: 'Création de l\'agent Dédie jean',
        timestamp: new Date(Date.now() - 3600000)
      },
      {
        user: 'Debesly borlette',
        action: 'Modification des paramètres',
        details: 'Changement des multiplicateurs Borlette',
        timestamp: new Date(Date.now() - 7200000)
      },
      {
        user: 'Dédie jean',
        action: 'Vente de ticket',
        details: 'Ticket #100001 vendu pour 500 HTG',
        timestamp: new Date(Date.now() - 10800000)
      }
    ];

    res.json({
      success: true,
      activities: activities
    });

  } catch (error) {
    console.error('Erreur récupération activités:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des activités'
    });
  }
});

app.put('/api/tickets/:id/sync', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const ticketId = req.params.id;

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    const ticket = await Ticket.findOne({
      _id: ticketId,
      subsystem_id: subsystem._id
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket non trouvé dans votre sous-système'
      });
    }

    ticket.is_synced = true;
    ticket.synced_at = new Date();
    await ticket.save();

    res.json({
      success: true,
      message: 'Ticket synchronisé avec succès'
    });

  } catch (error) {
    console.error('Erreur synchronisation ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la synchronisation du ticket'
    });
  }
});

app.get('/api/supervisor1/agent-stats', vérifierToken, async (req, res) => {
  try {
    const user = await User.findById(req.tokenInfo.userId);
    
    if (!user || user.role !== 'supervisor' || user.level !== 1) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle superviseur level 1 requis.'
      });
    }

    const agents = await User.find({
      role: 'agent',
      subsystem_id: user.subsystem_id,
      $or: [
        { supervisor_id: user._id },
        { supervisor2_id: user._id }
      ],
      is_active: true
    });

    const agentStats = await Promise.all(agents.map(async (agent) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const ticketsCount = await Ticket.countDocuments({
        agent_id: agent._id,
        date: { $gte: today }
      });

      const salesResult = await Ticket.aggregate([
        {
          $match: {
            agent_id: agent._id,
            date: { $gte: today }
          }
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$total' }
          }
        }
      ]);

      const totalSales = salesResult.length > 0 ? salesResult[0].totalSales : 0;

      return {
        id: agent._id,
        name: agent.name,
        username: agent.username,
        tickets_today: ticketsCount,
        sales_today: totalSales,
        is_online: Math.random() > 0.3
      };
    }));

    const totals = {
      total_agents: agents.length,
      total_tickets: agentStats.reduce((sum, stat) => sum + stat.tickets_today, 0),
      total_sales: agentStats.reduce((sum, stat) => sum + stat.sales_today, 0),
      online_agents: agentStats.filter(stat => stat.is_online).length
    };

    res.json({
      success: true,
      agents: agentStats,
      totals: totals
    });

  } catch (error) {
    console.error('Erreur récupération statistiques agents:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

app.get('/api/supervisor1/agent-reports/:agentId', vérifierToken, async (req, res) => {
  try {
    const supervisor = await User.findById(req.tokenInfo.userId);
    
    if (!supervisor || supervisor.role !== 'supervisor' || supervisor.level !== 1) {
      return res.status(403).json({
        success: false,
        error: 'Accès refusé. Rôle superviseur level 1 requis.'
      });
    }

    const agentId = req.params.agentId;
    
    const agent = await User.findOne({
      _id: agentId,
      role: 'agent',
      subsystem_id: supervisor.subsystem_id,
      $or: [
        { supervisor_id: supervisor._id },
        { supervisor2_id: supervisor._id }
      ]
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent non trouvé ou non assigné à ce superviseur'
      });
    }

    const { start_date, end_date } = req.query;
    let dateFilter = {};

    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      dateFilter = { date: { $gte: startDate, $lte: endDate } };
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateFilter = { date: { $gte: today, $lt: tomorrow } };
    }

    const tickets = await Ticket.find({
      agent_id: agent._id,
      ...dateFilter
    }).sort({ date: -1 });

    const multiDrawTickets = await MultiDrawTicket.find({
      agent_id: agent._id,
      ...dateFilter
    }).sort({ date: -1 });

    const totalTickets = tickets.length + multiDrawTickets.length;
    const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0) +
                      multiDrawTickets.reduce((sum, ticket) => sum + ticket.total, 0);

    res.json({
      success: true,
      agent: {
        id: agent._id,
        name: agent.name,
        username: agent.username
      },
      period: dateFilter,
      tickets: tickets,
      multiDrawTickets: multiDrawTickets,
      totals: {
        total_tickets: totalTickets,
        total_sales: totalSales,
        regular_tickets: tickets.length,
        multi_draw_tickets: multiDrawTickets.length
      }
    });

  } catch (error) {
    console.error('Erreur récupération rapport agent:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération du rapport'
    });
  }
});

app.get('/api/subsystem/users', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const user = req.currentUser;
    const subsystem = await Subsystem.findById(user.subsystem_id);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const { role, status } = req.query;
    let query = { subsystem_id: subsystem._id };

    if (role) {
      if (role === 'supervisor1') {
        query.role = 'supervisor';
        query.level = 1;
      } else if (role === 'supervisor2') {
        query.role = 'supervisor';
        query.level = 2;
      } else {
        query.role = role;
      }
    }

    if (status) {
      query.is_active = status === 'active';
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ dateCreation: -1 });

    const usersWithStats = await Promise.all(users.map(async (user) => {
      if (user.role === 'agent') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const ticketsCount = await Ticket.countDocuments({
          agent_id: user._id,
          date: { $gte: today }
        });

        return {
          ...user.toObject(),
          tickets_today: ticketsCount,
          is_online: Math.random() > 0.3
        };
      }

      if (user.role === 'supervisor') {
        const agents = await User.find({ 
          subsystem_id: subsystem._id,
          role: 'agent',
          $or: [
            { supervisor_id: user._id },
            { supervisor2_id: user._id }
          ]
        });

        return {
          ...user.toObject(),
          agents_count: agents.length,
          is_online: Math.random() > 0.3
        };
      }

      return user.toObject();
    }));

    res.json({
      success: true,
      users: usersWithStats
    });

  } catch (error) {
    console.error('Erreur récupération utilisateurs:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des utilisateurs'
    });
  }
});

app.get('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const userId = req.params.id;
    
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Erreur récupération utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération de l\'utilisateur'
    });
  }
});

app.put('/api/subsystem/users/:id/status', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const { is_active } = req.body;

    const userId = req.params.id;

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    if (user._id.toString() === currentUser._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Vous ne pouvez pas modifier votre propre statut'
      });
    }

    user.is_active = is_active;
    await user.save();

    const activeUsersCount = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });
    
    subsystem.stats.active_users = activeUsersCount;
    subsystem.stats.usage_percentage = Math.round((activeUsersCount / subsystem.max_users) * 100);
    await subsystem.save();

    res.json({
      success: true,
      message: `Utilisateur ${is_active ? 'activé' : 'désactivé'} avec succès`
    });

  } catch (error) {
    console.error('Erreur changement statut:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors du changement de statut'
    });
  }
});

app.put('/api/subsystem/users/:id', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const userId = req.params.id;
    const { name, level, password } = req.body;

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé dans votre sous-système'
      });
    }

    if (user.role === 'subsystem' && currentUser.role !== 'subsystem') {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez pas modifier un administrateur de sous-système'
      });
    }

    if (name) user.name = name;
    if (level && (user.role === 'supervisor')) user.level = level;
    if (password) user.password = password;

    await user.save();

    res.json({
      success: true,
      message: 'Utilisateur modifié avec succès',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        level: user.level
      }
    });

  } catch (error) {
    console.error('Erreur modification utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la modification de l\'utilisateur'
    });
  }
});

app.post('/api/subsystem/assign', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const { userId, supervisorId, supervisorType } = req.body;

    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    
    const user = await User.findOne({
      _id: userId,
      subsystem_id: subsystem._id
    });

    const supervisor = await User.findOne({
      _id: supervisorId,
      subsystem_id: subsystem._id
    });

    if (!user || !supervisor) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur ou superviseur non trouvé dans votre sous-système'
      });
    }

    if (supervisor.role !== 'supervisor') {
      return res.status(400).json({
        success: false,
        error: 'L\'utilisateur assigné comme superviseur n\'a pas le rôle superviseur'
      });
    }

    if (supervisorType === 'supervisor1') {
      user.supervisor_id = supervisorId;
    } else if (supervisorType === 'supervisor2') {
      user.supervisor2_id = supervisorId;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Assignation réussie'
    });

  } catch (error) {
    console.error('Erreur assignation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'assignation'
    });
  }
});

app.get('/api/subsystem/stats', vérifierToken, vérifierAccèsSubsystem, async (req, res) => {
  try {
    const currentUser = req.currentUser;
    const subsystem = await Subsystem.findById(currentUser.subsystem_id);
    
    if (!subsystem) {
      return res.status(404).json({
        success: false,
        error: 'Sous-système non trouvé'
      });
    }

    const totalUsers = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      role: { $in: ['agent', 'supervisor'] }
    });
    const activeUsers = await User.countDocuments({ 
      subsystem_id: subsystem._id,
      is_active: true,
      role: { $in: ['agent', 'supervisor'] }
    });

    const usage_percentage = subsystem.max_users > 0 ? 
      Math.round((activeUsers / subsystem.max_users) * 100) : 0;

    subsystem.stats.active_users = activeUsers;
    subsystem.stats.usage_percentage = usage_percentage;
    await subsystem.save();

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        active_users: activeUsers,
        max_users: subsystem.max_users,
        usage_percentage: usage_percentage
      }
    });

  } catch (error) {
    console.error('Erreur statistiques sous-système:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

app.post('/api/agents/create', vérifierToken, async (req, res) => {
    try {
        const { name, email, level, password } = req.body;
        const newAgent = new User({
            username: email,
            password: password,
            name: name,
            role: 'agent',
            level: parseInt(level)
        });
        await newAgent.save();
        res.json({ success: true, message: 'Agent créé avec succès' });
    } catch (error) {
        console.error('Erreur création agent:', error);
        res.status(500).json({ success: false, error: 'Erreur lors de la création de l\'agent' });
    }
});

app.post('/api/init/master', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    const existingMaster = await User.findOne({ role: 'master' });
    if (existingMaster) {
      return res.status(400).json({
        success: false,
        error: 'Un compte master existe déjà'
      });
    }
    
    const master = new User({
      username: username,
      password: password,
      name: name || 'Master Admin',
      role: 'master',
      level: 1
    });
    
    await master.save();
    
    res.json({
      success: true,
      message: 'Compte master créé avec succès'
    });
  } catch (error) {
    console.error('Erreur création compte master:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du compte master'
    });
  }
});

app.post('/api/init/subsystem', async (req, res) => {
  try {
    const { username, password, name } = req.body;
    
    const existingUser = await User.findOne({ username: username });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Cet utilisateur existe déjà'
      });
    }
    
    const subsystemUser = new User({
      username: username,
      password: password,
      name: name || 'Subsystem Admin',
      role: 'subsystem',
      level: 1
    });
    
    await subsystemUser.save();
    
    res.json({
      success: true,
      message: 'Compte subsystem créé avec succès'
    });
  } catch (error) {
    console.error('Erreur création compte subsystem:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du compte subsystem'
    });
  }
});

// =================== ROUTES HTML ===================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, req.path);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('Page non trouvée');
    }
    
    res.sendFile(filePath);
  });
});

app.get('/subsystem-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

app.get('/control-level1.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/control-level2.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/supervisor-control.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'supervisor-control.html'));
});

app.get('/master-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/lotato.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lotato.html'));
});

// =================== MIDDLEWARE DE GESTION D'ERREURS ===================

app.use((err, req, res, next) => {
  if (err) {
    console.error('Erreur serveur:', err);
    
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({
        success: false,
        error: 'Erreur serveur interne'
      });
    }
    
    return res.status(500).send('Erreur serveur interne');
  }
  next();
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'Route API non trouvée'
    });
  }
  
  res.status(404).send('Page non trouvée');
});

// =================== DÉMARRAGE DU SERVEUR ===================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📁 Compression GZIP activée`);
  console.log(`🌐 CORS activé`);
  console.log(`👑 Master Dashboard: http://localhost:${PORT}/master-dashboard.html`);
  console.log(`🏢 Subsystem Admin: http://localhost:${PORT}/subsystem-admin.html`);
  console.log(`🎰 LOTATO: http://localhost:${PORT}/lotato.html`);
  console.log(`👮 Control Level 1: http://localhost:${PORT}/control-level1.html`);
  console.log(`👮 Control Level 2: http://localhost:${PORT}/control-level2.html`);
  console.log(`📊 Supervisor Control: http://localhost:${PORT}/supervisor-control.html`);
  console.log(`🏠 Login: http://localhost:${PORT}/`);
  console.log('');
  console.log('✅ Serveur prêt avec toutes les routes !');
});
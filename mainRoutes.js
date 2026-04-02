const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { authenticate, requireRole, requireSuperAdmin, requirePlayer, generateETag } = require('./auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

// ==================== AUTHENTIFICATION ====================
router.post('/auth/login', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, username, password, role, owner_id FROM users WHERE username = $1 AND role = $2',
      [username, role]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    const payload = { id: user.id, username: user.username, role: user.role, name: user.name };
    if (user.role === 'agent' || user.role === 'supervisor') payload.ownerId = user.owner_id;
    else if (user.role === 'owner') payload.ownerId = user.id;
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5)',
      [user.id, user.role, 'login', req.ip, req.headers['user-agent']]
    );
    res.json({
      success: true, token, name: user.name, role: user.role, ownerId: payload.ownerId,
      agentId: user.role === 'agent' ? user.id : undefined,
      supervisorId: user.role === 'supervisor' ? user.id : undefined
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/auth/superadmin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT id, name, username, password, role FROM users WHERE username = $1 AND role = $2',
      [username, 'superadmin']
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    await pool.query(
      'INSERT INTO activity_log (user_id, user_role, action, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5)',
      [user.id, user.role, 'login', req.ip, req.headers['user-agent']]
    );
    res.json({ success: true, token, name: user.name });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/auth/verify', authenticate, (req, res) => { res.json({ valid: true, user: req.user }); });

router.post('/auth/logout', authenticate, async (req, res) => {
  await pool.query(
    'INSERT INTO activity_log (user_id, user_role, action, ip_address) VALUES ($1,$2,$3,$4)',
    [req.user.id, req.user.role, 'logout', req.ip]
  );
  res.json({ success: true, message: 'Déconnexion réussie' });
});

// ==================== ROUTES COMMUNES ====================
router.get('/lottery-settings', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      'SELECT name, slogan, logo_url, multipliers, limits, updated_at FROM lottery_settings WHERE owner_id = $1',
      [ownerId]
    );
    let data = result.rows.length === 0
      ? { name: 'LOTATO PRO', slogan: '', logoUrl: '', multipliers: {}, limits: {} }
      : {
          name: result.rows[0].name,
          slogan: result.rows[0].slogan,
          logoUrl: result.rows[0].logo_url,
          multipliers: result.rows[0].multipliers,
          limits: result.rows[0].limits,
          updatedAt: result.rows[0].updated_at
        };
    const etag = generateETag(data);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=43200');
    res.json(data);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/draws', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  if (!ownerId) return res.status(403).json({ error: 'Propriétaire non identifié' });
  try {
    const result = await pool.query(
      'SELECT id, name, time, color, active FROM draws WHERE owner_id = $1 ORDER BY time',
      [ownerId]
    );
    const data = { draws: result.rows };
    const etag = generateETag(data);
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=43200');
    res.json(data);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/blocked-numbers/global', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id=$1 AND global=true', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/blocked-numbers/draw/:drawId', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { drawId } = req.params;
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id=$1 AND draw_id=$2 AND global=false', [ownerId, drawId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/number-limits', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query('SELECT draw_id, number, limit_amount FROM number_limits WHERE owner_id=$1', [ownerId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Sauvegarde d'un ticket (version originale, sans logique joueur)
router.post('/tickets/save', authenticate, async (req, res) => {
  const { agentId, agentName, drawId, drawName, bets, total } = req.body;
  const ownerId = req.user.ownerId;
  const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
  try {
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id=$1 AND owner_id=$2', [drawId, ownerId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });

    const globalBlocked = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id=$1 AND global=true', [ownerId]);
    const globalBlockedSet = new Set(globalBlocked.rows.map(r => r.number));
    const drawBlocked = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id=$1 AND draw_id=$2 AND global=false', [ownerId, drawId]);
    const drawBlockedSet = new Set(drawBlocked.rows.map(r => r.number));
    const limits = await pool.query('SELECT number, limit_amount FROM number_limits WHERE owner_id=$1 AND draw_id=$2', [ownerId, drawId]);
    const limitsMap = new Map(limits.rows.map(r => [r.number, parseFloat(r.limit_amount)]));
    const settingsRes = await pool.query('SELECT limits FROM lottery_settings WHERE owner_id=$1', [ownerId]);
    let gameLimits = { lotto3:0, lotto4:0, lotto5:0, mariage:0 };
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].limits) {
      const raw = settingsRes.rows[0].limits;
      gameLimits = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    const blockedLotto3Res = await pool.query('SELECT number FROM blocked_lotto3_numbers WHERE owner_id=$1', [ownerId]);
    const blockedLotto3Set = new Set(blockedLotto3Res.rows.map(r => r.number));

    const totalsByGame = {};
    for (const bet of bets) {
      const cleanNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
      if (!cleanNumber) continue;
      if (globalBlockedSet.has(cleanNumber)) return res.status(403).json({ error: `Numéro ${cleanNumber} bloqué globalement` });
      if (drawBlockedSet.has(cleanNumber)) return res.status(403).json({ error: `Numéro ${cleanNumber} bloqué pour ce tirage` });
      const game = bet.game || bet.specialType;
      if ((game === 'lotto3' || game === 'auto_lotto3') && cleanNumber.length===3 && blockedLotto3Set.has(cleanNumber)) {
        return res.status(403).json({ error: `Numéro Lotto3 ${cleanNumber} bloqué` });
      }
      if (limitsMap.has(cleanNumber)) {
        const limit = limitsMap.get(cleanNumber);
        const todayBetsResult = await pool.query(
          `SELECT SUM((bets->>'amount')::numeric) as total FROM tickets, jsonb_array_elements(bets::jsonb) as bet
           WHERE owner_id=$1 AND draw_id=$2 AND DATE(date)=CURRENT_DATE AND bet->>'cleanNumber'=$3`,
          [ownerId, drawId, cleanNumber]
        );
        const currentTotal = parseFloat(todayBetsResult.rows[0]?.total) || 0;
        const betAmount = parseFloat(bet.amount) || 0;
        if (currentTotal + betAmount > limit) return res.status(403).json({ error: `Limite de mise pour ${cleanNumber} dépassée (max ${limit} Gdes)` });
      }
      let category = null;
      if (game === 'lotto3' || game === 'auto_lotto3') category = 'lotto3';
      else if (game === 'lotto4' || game === 'auto_lotto4') category = 'lotto4';
      else if (game === 'lotto5' || game === 'auto_lotto5') category = 'lotto5';
      else if (game === 'mariage' || game === 'auto_marriage') category = 'mariage';
      if (category) totalsByGame[category] = (totalsByGame[category] || 0) + (parseFloat(bet.amount) || 0);
    }
    for (const [category, totalGame] of Object.entries(totalsByGame)) {
      const limit = gameLimits[category] || 0;
      if (limit > 0 && totalGame > limit) return res.status(403).json({ error: `Limite de mise pour ${category} dépassée (max ${limit} Gdes par ticket)` });
    }

    const paidBets = bets.filter(b => !b.free);
    const totalPaid = paidBets.reduce((s,b) => s + (parseFloat(b.amount)||0), 0);
    let requiredFree = 0;
    if (totalPaid >= 1 && totalPaid <= 50) requiredFree = 1;
    else if (totalPaid >= 51 && totalPaid <= 150) requiredFree = 2;
    else if (totalPaid >= 151) requiredFree = 3;
    const newFreeBets = [];
    for (let i=0; i<requiredFree; i++) {
      const n1 = Math.floor(Math.random()*100).toString().padStart(2,'0');
      const n2 = Math.floor(Math.random()*100).toString().padStart(2,'0');
      newFreeBets.push({ game:'auto_marriage', number:`${n1}&${n2}`, cleanNumber:n1+n2, amount:0, free:true, freeType:'special_marriage', freeWin:1000 });
    }
    const finalBets = [...bets, ...newFreeBets];
    const finalTotal = finalBets.reduce((s,b) => s + (parseFloat(b.amount)||0), 0);
    const result = await pool.query(
      `INSERT INTO tickets (owner_id, agent_id, agent_name, draw_id, draw_name, ticket_id, total_amount, bets, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id`,
      [ownerId, agentId, agentName, drawId, drawName, ticketId, finalTotal, JSON.stringify(finalBets)]
    );
    res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, ...req.body } });
  } catch (err) { console.error('❌ Erreur sauvegarde ticket:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Liste des tickets (agent ne voit que les siens)
router.get('/tickets', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { agentId } = req.query;
  let query = 'SELECT * FROM tickets WHERE owner_id = $1';
  const params = [ownerId];
  if (req.user.role === 'agent') {
    query += ' AND agent_id = $2 ORDER BY date DESC';
    params.push(req.user.id);
  } else if (agentId) {
    query += ' AND agent_id = $2 ORDER BY date DESC';
    params.push(agentId);
  } else {
    query += ' ORDER BY date DESC';
  }
  try {
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur chargement tickets' }); }
});

router.delete('/tickets/:id', authenticate, async (req, res) => {
  const user = req.user;
  const ticketId = req.params.id;
  try {
    const ticket = await pool.query('SELECT owner_id, agent_id, date FROM tickets WHERE id=$1', [ticketId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket introuvable' });
    const t = ticket.rows[0];
    if (user.role === 'owner') { if (t.owner_id !== user.id) return res.status(403).json({ error: 'Accès interdit' }); }
    else if (user.role === 'supervisor') {
      const check = await pool.query('SELECT id FROM users WHERE id=$1 AND owner_id=$2 AND supervisor_id=$3', [t.agent_id, user.ownerId, user.id]);
      if (check.rows.length === 0) return res.status(403).json({ error: 'Accès interdit' });
    } else if (user.role === 'agent') { if (t.agent_id !== user.id) return res.status(403).json({ error: 'Accès interdit' }); }
    else return res.status(403).json({ error: 'Accès interdit' });
    const diffMinutes = (new Date() - new Date(t.date)) / (1000 * 60);
    if (user.role !== 'owner' && diffMinutes > 3) return res.status(403).json({ error: 'Délai de suppression dépassé (3 min)' });
    await pool.query('DELETE FROM tickets WHERE id=$1', [ticketId]);
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [user.id, user.role, 'delete_ticket', `Ticket ID: ${ticketId}`, req.ip]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur suppression' }); }
});

// ==================== ROUTES SUPERVISEUR ====================
router.get('/supervisor/reports/overall', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT COUNT(t.id) as total_tickets, COALESCE(SUM(t.total_amount),0) as total_bets, COALESCE(SUM(t.win_amount),0) as total_wins,
       COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as balance FROM tickets t JOIN users u ON t.agent_id=u.id
       WHERE t.owner_id=$1 AND u.supervisor_id=$2`,
      [ownerId, supervisorId]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/supervisor/agents', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked, u.zone,
       COALESCE(SUM(t.total_amount),0) as total_bets, COALESCE(SUM(t.win_amount),0) as total_wins, COUNT(t.id) as total_tickets,
       COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as balance, COALESCE(SUM(CASE WHEN t.paid=false THEN t.win_amount ELSE 0 END),0) as unpaid_wins
       FROM users u LEFT JOIN tickets t ON u.id=t.agent_id AND t.date>=NOW()-INTERVAL '1 day'
       WHERE u.owner_id=$1 AND u.supervisor_id=$2 AND u.role='agent' GROUP BY u.id`,
      [ownerId, supervisorId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/supervisor/tickets/recent', authenticate, requireRole('supervisor'), async (req, res) => {
  const { agentId } = req.query;
  const ownerId = req.user.ownerId;
  const supervisorId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT t.* FROM tickets t JOIN users u ON t.agent_id=u.id WHERE t.owner_id=$1 AND u.supervisor_id=$2 AND t.agent_id=$3 ORDER BY t.date DESC LIMIT 20`,
      [ownerId, supervisorId, agentId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/supervisor/tickets', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const { page=0, limit=20, agentId, gain, paid, period, fromDate, toDate } = req.query;
  let query = `SELECT t.* FROM tickets t JOIN users u ON t.agent_id=u.id WHERE t.owner_id=$1 AND u.supervisor_id=$2`;
  const params = [ownerId, supervisorId];
  let paramIndex = 3;
  if (agentId && agentId !== 'all') { query += ` AND t.agent_id=$${paramIndex++}`; params.push(agentId); }
  if (gain === 'win') query += ` AND t.win_amount>0`;
  else if (gain === 'nowin') query += ` AND (t.win_amount=0 OR t.win_amount IS NULL)`;
  if (paid === 'paid') query += ` AND t.paid=true`;
  else if (paid === 'unpaid') query += ` AND t.paid=false`;
  if (period === 'today') query += ` AND t.date>=CURRENT_DATE`;
  else if (period === 'yesterday') query += ` AND t.date>=CURRENT_DATE-INTERVAL '1 day' AND t.date<CURRENT_DATE`;
  else if (period === 'week') query += ` AND t.date>=DATE_TRUNC('week',CURRENT_DATE)`;
  else if (period === 'month') query += ` AND t.date>=DATE_TRUNC('month',CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { query += ` AND t.date>=$${paramIndex} AND t.date<=$${paramIndex+1}`; params.push(fromDate, toDate); paramIndex+=2; }
  const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);
  query += ` ORDER BY t.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex+1}`;
  params.push(limit, page*limit);
  try {
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows, hasMore: (page+1)*limit < total, total });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/supervisor/block-agent/:id', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const agentId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id=$1 AND owner_id=$2 AND supervisor_id=$3 AND role=$4', [agentId, ownerId, supervisorId, 'agent']);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Agent non trouvé ou non autorisé' });
    await pool.query('UPDATE users SET blocked=true WHERE id=$1', [agentId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/supervisor/unblock-agent/:id', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const agentId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id=$1 AND owner_id=$2 AND supervisor_id=$3 AND role=$4', [agentId, ownerId, supervisorId, 'agent']);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Agent non trouvé ou non autorisé' });
    await pool.query('UPDATE users SET blocked=false WHERE id=$1', [agentId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/supervisor/tickets/:id/pay', authenticate, requireRole('supervisor'), async (req, res) => {
  const supervisorId = req.user.id;
  const ownerId = req.user.ownerId;
  const ticketId = req.params.id;
  try {
    const check = await pool.query(
      `SELECT t.id FROM tickets t JOIN users u ON t.agent_id=u.id WHERE t.id=$1 AND t.owner_id=$2 AND u.supervisor_id=$3`,
      [ticketId, ownerId, supervisorId]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Ticket non trouvé ou non autorisé' });
    await pool.query('UPDATE tickets SET paid=true, paid_at=NOW() WHERE id=$1', [ticketId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== ROUTES PROPRIÉTAIRE (complètes) ====================
router.get('/owner/messages', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT message FROM owner_messages WHERE owner_id=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1', [ownerId]);
    res.json({ message: result.rows[0]?.message || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/supervisors', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT id, name, username, blocked FROM users WHERE owner_id=$1 AND role=$2', [ownerId, 'supervisor']);
    res.json(result.rows.map(s => ({ ...s, email: s.username })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/agents', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.blocked, u.zone, u.cin, u.commission_percentage, s.name as supervisor_name
       FROM users u LEFT JOIN users s ON u.supervisor_id = s.id WHERE u.owner_id=$1 AND u.role=$2`,
      [ownerId, 'agent']);
    res.json(result.rows.map(a => ({ ...a, email: a.username })));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/owner/create-user', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { name, cin, username, password, role, supervisorId, zone, commissionPercentage } = req.body;
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  try {
    const quotaRes = await pool.query('SELECT quota FROM users WHERE id=$1', [ownerId]);
    const quota = quotaRes.rows[0]?.quota || 0;
    const countRes = await pool.query('SELECT COUNT(*) FROM users WHERE owner_id=$1 AND role IN ($2,$3)', [ownerId, 'agent', 'supervisor']);
    const currentCount = parseInt(countRes.rows[0].count);
    if (currentCount >= quota) return res.status(403).json({ error: 'Quota d’utilisateurs atteint.' });
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (owner_id, name, cin, username, password, role, supervisor_id, zone, commission_percentage, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id, name, username, role, cin, zone, commission_percentage`,
      [ownerId, name, cin || null, username, hashed, role, supervisorId || null, zone || null, commissionPercentage || 0]);
    const user = { ...result.rows[0], email: result.rows[0].username };
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [ownerId, 'owner', 'create_user', `Création ${role}: ${username}`, req.ip]);
    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: "Nom d'utilisateur déjà existant" });
    res.status(500).json({ error: 'Erreur création utilisateur' });
  }
});

router.post('/owner/block-user', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { userId } = req.body;
  try {
    await pool.query('UPDATE users SET blocked = NOT blocked WHERE id=$1 AND owner_id=$2', [userId, ownerId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.put('/owner/change-supervisor', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { agentId, supervisorId } = req.body;
  try {
    await pool.query('UPDATE users SET supervisor_id=$1 WHERE id=$2 AND owner_id=$3 AND role=$4', [supervisorId || null, agentId, ownerId, 'agent']);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/draws', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT id, name, time, color, active FROM draws WHERE owner_id=$1 ORDER BY time', [ownerId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/publish-results', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, numbers, lotto3 } = req.body;
  if (!drawId || !numbers || numbers.length !== 3) return res.status(400).json({ error: 'Données invalides' });
  try {
    await pool.query(`INSERT INTO winning_results (owner_id, draw_id, numbers, lotto3, date) VALUES ($1,$2,$3,$4,NOW())`,
      [ownerId, drawId, JSON.stringify(numbers), lotto3]);
    const settingsRes = await pool.query('SELECT multipliers FROM lottery_settings WHERE owner_id=$1', [ownerId]);
    let multipliers = { lot1:60, lot2:20, lot3:10, lotto3:500, lotto4:5000, lotto5:25000, mariage:500 };
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].multipliers) {
      const raw = settingsRes.rows[0].multipliers;
      multipliers = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
    const lot1 = numbers[0], lot2 = numbers[1], lot3 = numbers[2];
    const ticketsRes = await pool.query('SELECT id, bets FROM tickets WHERE owner_id=$1 AND draw_id=$2 AND checked=false', [ownerId, drawId]);
    for (const ticket of ticketsRes.rows) {
      let totalWin = 0;
      const bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
      if (Array.isArray(bets)) {
        for (const bet of bets) {
          const game = bet.game || bet.specialType;
          const cleanNumber = bet.cleanNumber || (bet.number ? bet.number.replace(/[^0-9]/g, '') : '');
          const amount = parseFloat(bet.amount) || 0;
          let gain = 0;
          if (game === 'borlette' || game === 'BO' || (game && game.startsWith('n'))) {
            if (cleanNumber.length === 2) {
              if (cleanNumber === lot2) gain = amount * multipliers.lot2;
              else if (cleanNumber === lot3) gain = amount * multipliers.lot3;
              else if (cleanNumber === lot1) gain = amount * multipliers.lot1;
            }
          } else if (game === 'lotto3') {
            if (cleanNumber.length === 3 && cleanNumber === lotto3) gain = amount * multipliers.lotto3;
          } else if (game === 'mariage' || game === 'auto_marriage') {
            if (cleanNumber.length === 4) {
              const firstPair = cleanNumber.slice(0,2), secondPair = cleanNumber.slice(2,4);
              const pairs = [lot1, lot2, lot3];
              let win = false;
              for (let i=0;i<3;i++) for (let j=0;j<3;j++) if (i!==j && firstPair===pairs[i] && secondPair===pairs[j]) win=true;
              if (win) gain = (bet.free && bet.freeType==='special_marriage') ? 1000 : amount * multipliers.mariage;
            }
          } else if (game === 'lotto4' || game === 'auto_lotto4') {
            if (cleanNumber.length === 4 && bet.option) {
              const option = bet.option;
              let expected = '';
              if (option == 1) expected = lot1+lot2;
              else if (option == 2) expected = lot2+lot3;
              else if (option == 3) expected = lot1+lot3;
              if (cleanNumber === expected) gain = amount * multipliers.lotto4;
            }
          } else if (game === 'lotto5' || game === 'auto_lotto5') {
            if (cleanNumber.length === 5 && bet.option) {
              const option = bet.option;
              let expected = '';
              if (option == 1) expected = lotto3+lot2;
              else if (option == 2) expected = lotto3+lot3;
              if (cleanNumber === expected) gain = amount * multipliers.lotto5;
            }
          }
          totalWin += gain;
        }
      }
      await pool.query('UPDATE tickets SET win_amount=$1, checked=true WHERE id=$2', [totalWin, ticket.id]);
    }
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [ownerId, 'owner', 'publish_results', `Tirage ${drawId}`, req.ip]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur publication' }); }
});

router.post('/owner/block-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, block } = req.body;
  try {
    await pool.query('UPDATE draws SET active=$1 WHERE id=$2 AND owner_id=$3', [!block, drawId, ownerId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/blocked-numbers', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number FROM blocked_numbers WHERE owner_id=$1 AND global=true', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/block-number', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  try {
    await pool.query('INSERT INTO blocked_numbers (owner_id, number, global) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ownerId, number, true]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/unblock-number', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_numbers WHERE owner_id=$1 AND number=$2 AND global=true', [ownerId, number]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/blocked-numbers-per-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT b.draw_id, d.name as draw_name, b.number FROM blocked_numbers b JOIN draws d ON b.draw_id=d.id WHERE b.owner_id=$1 AND b.global=false`,
      [ownerId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/block-number-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  try {
    await pool.query('INSERT INTO blocked_numbers (owner_id, draw_id, number, global) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [ownerId, drawId, number, false]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/unblock-number-draw', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_numbers WHERE owner_id=$1 AND draw_id=$2 AND number=$3 AND global=false', [ownerId, drawId, number]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/number-limits', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT l.draw_id, d.name as draw_name, l.number, l.limit_amount FROM number_limits l JOIN draws d ON l.draw_id=d.id WHERE l.owner_id=$1`,
      [ownerId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/number-limit', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number, limitAmount } = req.body;
  try {
    await pool.query(
      `INSERT INTO number_limits (owner_id, draw_id, number, limit_amount) VALUES ($1,$2,$3,$4)
       ON CONFLICT (owner_id, draw_id, number) DO UPDATE SET limit_amount = EXCLUDED.limit_amount`,
      [ownerId, drawId, number, limitAmount]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/remove-number-limit', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { drawId, number } = req.body;
  try {
    await pool.query('DELETE FROM number_limits WHERE owner_id=$1 AND draw_id=$2 AND number=$3', [ownerId, drawId, number]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/blocked-draws', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT id as draw_id, name as draw_name FROM draws WHERE owner_id=$1 AND active=false', [ownerId]);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/blocked-lotto3', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT number FROM blocked_lotto3_numbers WHERE owner_id=$1 ORDER BY number', [ownerId]);
    res.json({ blockedNumbers: result.rows.map(r => r.number) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/block-lotto3', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  if (!number || number.length!==3 || !/^\d{3}$/.test(number)) return res.status(400).json({ error: 'Numéro lotto3 invalide' });
  try {
    await pool.query('INSERT INTO blocked_lotto3_numbers (owner_id, number) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ownerId, number]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/unblock-lotto3', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { number } = req.body;
  try {
    await pool.query('DELETE FROM blocked_lotto3_numbers WHERE owner_id=$1 AND number=$2', [ownerId, number]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/dashboard', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const supervisors = await pool.query('SELECT id, name, username FROM users WHERE owner_id=$1 AND role=$2', [ownerId, 'supervisor']);
    const agents = await pool.query('SELECT id, name, username FROM users WHERE owner_id=$1 AND role=$2', [ownerId, 'agent']);
    const sales = await pool.query('SELECT COALESCE(SUM(total_amount),0) as total FROM tickets WHERE owner_id=$1 AND date>=CURRENT_DATE', [ownerId]);
    const agentsGainLoss = await pool.query(
      `SELECT u.id, u.name, COALESCE(SUM(t.total_amount),0) as total_bets, COALESCE(SUM(t.win_amount),0) as total_wins,
       COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result FROM users u LEFT JOIN tickets t ON u.id=t.agent_id AND t.date>=CURRENT_DATE
       WHERE u.owner_id=$1 AND u.role=$2 GROUP BY u.id`,
      [ownerId, 'agent']);
    const limitsProgress = await pool.query(
      `SELECT d.name as draw_name, l.number, l.limit_amount, COALESCE(SUM(t.total_amount),0) as current_bets,
       (COALESCE(SUM(t.total_amount),0) / l.limit_amount * 100) as progress_percent
       FROM number_limits l JOIN draws d ON l.draw_id=d.id
       LEFT JOIN tickets t ON t.draw_id=l.draw_id AND t.bets::text LIKE '%'||l.number||'%' AND DATE(t.date)=CURRENT_DATE
       WHERE l.owner_id=$1 GROUP BY d.name, l.number, l.limit_amount ORDER BY progress_percent DESC`,
      [ownerId]);
    res.json({
      connected: {
        supervisors_count: supervisors.rows.length,
        supervisors: supervisors.rows.map(s => ({ ...s, email: s.username })),
        agents_count: agents.rows.length,
        agents: agents.rows.map(a => ({ ...a, email: a.username }))
      },
      sales_today: parseFloat(sales.rows[0].total),
      limits_progress: limitsProgress.rows,
      agents_gain_loss: agentsGainLoss.rows
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/reports', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { supervisorId, agentId, drawId, period, fromDate, toDate, gainLoss } = req.query;
  let baseQuery = `SELECT COUNT(id) as tickets, COALESCE(SUM(total_amount),0) as bets, COALESCE(SUM(win_amount),0) as wins,
                   COALESCE(SUM(win_amount)-SUM(total_amount),0) as result FROM tickets WHERE owner_id=$1`;
  const params = [ownerId];
  let paramIndex = 2;
  if (supervisorId && supervisorId !== 'all') { baseQuery += ` AND agent_id IN (SELECT id FROM users WHERE supervisor_id=$${paramIndex++})`; params.push(supervisorId); }
  if (agentId && agentId !== 'all') { baseQuery += ` AND agent_id=$${paramIndex++}`; params.push(agentId); }
  if (drawId && drawId !== 'all') { baseQuery += ` AND draw_id=$${paramIndex++}`; params.push(drawId); }
  if (period === 'today') baseQuery += ` AND date>=CURRENT_DATE`;
  else if (period === 'yesterday') baseQuery += ` AND date>=CURRENT_DATE-INTERVAL '1 day' AND date<CURRENT_DATE`;
  else if (period === 'week') baseQuery += ` AND date>=DATE_TRUNC('week',CURRENT_DATE)`;
  else if (period === 'month') baseQuery += ` AND date>=DATE_TRUNC('month',CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { baseQuery += ` AND date>=$${paramIndex} AND date<=$${paramIndex+1}`; params.push(fromDate, toDate); paramIndex+=2; }
  if (gainLoss === 'gain') baseQuery += ` AND win_amount>0`;
  else if (gainLoss === 'loss') baseQuery += ` AND (win_amount=0 OR win_amount IS NULL)`;
  try {
    const summaryResult = await pool.query(baseQuery, params);
    const summary = summaryResult.rows[0];
    let detailQuery = `SELECT d.id as draw_id, d.name as draw_name, COUNT(t.id) as tickets, COALESCE(SUM(t.total_amount),0) as bets,
                       COALESCE(SUM(t.win_amount),0) as wins, COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as result
                       FROM tickets t JOIN draws d ON t.draw_id=d.id WHERE t.owner_id=$1`;
    const detailParams = [ownerId];
    let detailParamIndex = 2;
    if (supervisorId && supervisorId !== 'all') { detailQuery += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id=$${detailParamIndex++})`; detailParams.push(supervisorId); }
    if (agentId && agentId !== 'all') { detailQuery += ` AND t.agent_id=$${detailParamIndex++}`; detailParams.push(agentId); }
    if (drawId && drawId !== 'all') { detailQuery += ` AND t.draw_id=$${detailParamIndex++}`; detailParams.push(drawId); }
    if (period === 'today') detailQuery += ` AND t.date>=CURRENT_DATE`;
    else if (period === 'yesterday') detailQuery += ` AND t.date>=CURRENT_DATE-INTERVAL '1 day' AND t.date<CURRENT_DATE`;
    else if (period === 'week') detailQuery += ` AND t.date>=DATE_TRUNC('week',CURRENT_DATE)`;
    else if (period === 'month') detailQuery += ` AND t.date>=DATE_TRUNC('month',CURRENT_DATE)`;
    else if (period === 'custom' && fromDate && toDate) { detailQuery += ` AND t.date>=$${detailParamIndex} AND t.date<=$${detailParamIndex+1}`; detailParams.push(fromDate, toDate); detailParamIndex+=2; }
    if (gainLoss === 'gain') detailQuery += ` AND t.win_amount>0`;
    else if (gainLoss === 'loss') detailQuery += ` AND (t.win_amount=0 OR t.win_amount IS NULL)`;
    detailQuery += ` GROUP BY d.id, d.name ORDER BY d.name`;
    const detailResult = await pool.query(detailQuery, detailParams);
    const gainLossCount = await pool.query(
      `SELECT COUNT(CASE WHEN net_result>0 THEN 1 END) as gain_count, COUNT(CASE WHEN net_result<0 THEN 1 END) as loss_count
       FROM (SELECT u.id, COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
             FROM users u LEFT JOIN tickets t ON u.id=t.agent_id ${period==='today'?'AND t.date>=CURRENT_DATE':''}
             WHERE u.owner_id=$1 AND u.role='agent' GROUP BY u.id) sub`,
      [ownerId]);
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
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/tickets', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { page=0, limit=20, supervisorId, agentId, drawId, period, fromDate, toDate, gain, paid } = req.query;
  let query = `SELECT t.* FROM tickets t WHERE t.owner_id=$1`;
  const params = [ownerId];
  let paramIndex = 2;
  if (supervisorId && supervisorId !== 'all') { query += ` AND t.agent_id IN (SELECT id FROM users WHERE supervisor_id=$${paramIndex++})`; params.push(supervisorId); }
  if (agentId && agentId !== 'all') { query += ` AND t.agent_id=$${paramIndex++}`; params.push(agentId); }
  if (drawId && drawId !== 'all') { query += ` AND t.draw_id=$${paramIndex++}`; params.push(drawId); }
  if (period === 'today') query += ` AND t.date>=CURRENT_DATE`;
  else if (period === 'yesterday') query += ` AND t.date>=CURRENT_DATE-INTERVAL '1 day' AND t.date<CURRENT_DATE`;
  else if (period === 'week') query += ` AND t.date>=DATE_TRUNC('week',CURRENT_DATE)`;
  else if (period === 'month') query += ` AND t.date>=DATE_TRUNC('month',CURRENT_DATE)`;
  else if (period === 'custom' && fromDate && toDate) { query += ` AND t.date>=$${paramIndex} AND t.date<=$${paramIndex+1}`; params.push(fromDate, toDate); paramIndex+=2; }
  if (gain === 'win') query += ` AND t.win_amount>0`;
  else if (gain === 'nowin') query += ` AND (t.win_amount=0 OR t.win_amount IS NULL)`;
  if (paid === 'paid') query += ` AND t.paid=true`;
  else if (paid === 'unpaid') query += ` AND t.paid=false`;
  const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*)');
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);
  query += ` ORDER BY t.date DESC LIMIT $${paramIndex} OFFSET $${paramIndex+1}`;
  params.push(parseInt(limit), parseInt(page)*parseInt(limit));
  try {
    const result = await pool.query(query, params);
    res.json({ tickets: result.rows, hasMore: (parseInt(page)+1)*parseInt(limit) < total, total });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/tickets/:id', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const ticketId = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM tickets WHERE id=$1 AND owner_id=$2', [ticketId, ownerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ticket introuvable' });
    const ticket = result.rows[0];
    ticket.bets = typeof ticket.bets === 'string' ? JSON.parse(ticket.bets) : ticket.bets;
    res.json(ticket);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.delete('/owner/tickets/:id', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const ticketId = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM tickets WHERE id=$1 AND owner_id=$2', [ticketId, ownerId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé' });
    await pool.query('DELETE FROM tickets WHERE id=$1 AND owner_id=$2', [ticketId, ownerId]);
    await pool.query('INSERT INTO activity_log (user_id, user_role, action, details, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [ownerId, 'owner', 'delete_ticket', `Ticket ID: ${ticketId}`, req.ip]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.get('/owner/settings', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT * FROM lottery_settings WHERE owner_id=$1', [ownerId]);
    if (result.rows.length === 0) res.json({ name: 'LOTATO PRO', slogan: '', logoUrl: '', multipliers: {}, limits: {} });
    else { const row = result.rows[0]; row.logoUrl = row.logo_url; delete row.logo_url; res.json(row); }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur' }); }
});

router.post('/owner/settings', authenticate, requireRole('owner'), (req, res) => {
  const ownerId = req.user.id;
  let { name, slogan, logoUrl, multipliers, limits } = req.body;
  if (req.file) {
    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    logoUrl = `data:${mimeType};base64,${base64}`;
  }
  if (multipliers && typeof multipliers === 'string') try { multipliers = JSON.parse(multipliers); } catch { multipliers = {}; }
  if (limits && typeof limits === 'string') try { limits = JSON.parse(limits); } catch { limits = {}; }
  pool.query(
    `INSERT INTO lottery_settings (owner_id, name, slogan, logo_url, multipliers, limits, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (owner_id) DO UPDATE SET name=EXCLUDED.name, slogan=EXCLUDED.slogan, logo_url=EXCLUDED.logo_url,
     multipliers=EXCLUDED.multipliers, limits=EXCLUDED.limits, updated_at=NOW()`,
    [ownerId, name || 'LOTATO PRO', slogan || '', logoUrl || '', JSON.stringify(multipliers || {}), JSON.stringify(limits || {})])
    .then(() => res.json({ success: true }))
    .catch(err => { console.error(err); res.status(500).json({ error: 'Erreur' }); });
});

router.get('/owner/quota', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const quotaRes = await pool.query('SELECT quota FROM users WHERE id=$1', [ownerId]);
    const quota = quotaRes.rows[0]?.quota || 0;
    const usedRes = await pool.query('SELECT COUNT(*) FROM users WHERE owner_id=$1 AND role IN ($2,$3)', [ownerId, 'agent', 'supervisor']);
    const used = parseInt(usedRes.rows[0].count);
    res.json({ quota, used });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== ROUTES SUPERADMIN ====================
router.get('/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, u.blocked as active, u.quota, u.phone, u.created_at,
      (SELECT COUNT(*) FROM users WHERE owner_id=u.id AND role IN ('agent','supervisor')) as current_count
      FROM users u WHERE u.role=$1 ORDER BY u.created_at DESC`, ['owner']);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/superadmin/owners', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, email, password, phone, quota } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, username, password, role, phone, quota, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING id`,
      [name, email, hashed, 'owner', phone || null, quota || 0]);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur création' });
  }
});

router.put('/superadmin/owners/:id/block', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { block } = req.body;
  try {
    await pool.query('UPDATE users SET blocked=$1 WHERE id=$2 AND role=$3', [block, id, 'owner']);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur mise à jour' }); }
});

router.delete('/superadmin/owners/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id=$1 AND role=$2', [id, 'owner']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Propriétaire non trouvé' });
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur suppression' }); }
});

router.delete('/superadmin/agents/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id=$1 AND role=$2', [id, 'agent']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Agent non trouvé' });
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur suppression' }); }
});

router.delete('/superadmin/supervisors/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT id FROM users WHERE id=$1 AND role=$2', [id, 'supervisor']);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Superviseur non trouvé' });
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur suppression' }); }
});

router.post('/superadmin/messages', authenticate, requireSuperAdmin, async (req, res) => {
  const { ownerId, message } = req.body;
  if (!ownerId || !message) return res.status(400).json({ error: 'ownerId et message requis' });
  try {
    await pool.query(`INSERT INTO owner_messages (owner_id, message, created_at, expires_at)
                      VALUES ($1,$2,NOW(),NOW()+INTERVAL '10 minutes')`, [ownerId, message]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur envoi message' }); }
});

router.post('/superadmin/messages/bulk', authenticate, requireSuperAdmin, async (req, res) => {
  const { ownerIds, message } = req.body;
  if (!ownerIds || !Array.isArray(ownerIds) || ownerIds.length===0 || !message)
    return res.status(400).json({ error: 'Liste de propriétaires et message requis' });
  try {
    const values = ownerIds.map((id,idx) => `($${idx*3+1}, $${idx*3+2}, NOW(), NOW()+INTERVAL '10 minutes')`).join(',');
    const flatParams = [];
    ownerIds.forEach(id => { flatParams.push(id, message); });
    await pool.query(`INSERT INTO owner_messages (owner_id, message, created_at, expires_at) VALUES ${values}`, flatParams);
    res.json({ success: true, count: ownerIds.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur envoi messages' }); }
});

router.get('/superadmin/reports/owners', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.username as email, COUNT(DISTINCT ag.id) as agent_count,
      COUNT(t.id) as ticket_count, COALESCE(SUM(t.total_amount),0) as total_bets,
      COALESCE(SUM(t.win_amount),0) as total_wins,
      COALESCE(SUM(t.win_amount)-SUM(t.total_amount),0) as net_result
      FROM users u LEFT JOIN users ag ON u.id=ag.owner_id AND ag.role='agent'
      LEFT JOIN tickets t ON u.id=t.owner_id WHERE u.role='owner'
      GROUP BY u.id, u.name, u.username ORDER BY u.name`);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ==================== ROUTES JOUEURS ====================
router.post('/auth/player/register', async (req, res) => {
  const { name, phone, password, zone } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Nom, téléphone et mot de passe requis' });
  try {
    const ownerRes = await pool.query('SELECT id FROM users WHERE role=$1 LIMIT 1', ['owner']);
    if (ownerRes.rows.length === 0) return res.status(500).json({ error: 'Aucun propriétaire configuré' });
    const ownerId = ownerRes.rows[0].id;
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO players (name, phone, password, zone, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, phone, hashed, zone || null, ownerId]);
    const playerId = result.rows[0].id;
    const token = jwt.sign({ id: playerId, role: 'player', name, phone, ownerId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, playerId, name, balance: 0 });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Ce numéro de téléphone est déjà utilisé' });
    res.status(500).json({ error: 'Erreur inscription' });
  }
});

router.post('/auth/player/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const result = await pool.query('SELECT id, name, phone, password, balance, owner_id FROM players WHERE phone=$1', [phone]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Téléphone ou mot de passe incorrect' });
    const player = result.rows[0];
    const valid = await bcrypt.compare(password, player.password);
    if (!valid) return res.status(401).json({ error: 'Téléphone ou mot de passe incorrect' });
    const token = jwt.sign({ id: player.id, role: 'player', name: player.name, phone: player.phone, ownerId: player.owner_id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, playerId: player.id, name: player.name, balance: parseFloat(player.balance) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/player/balance', authenticate, requirePlayer, async (req, res) => {
  try {
    const result = await pool.query('SELECT balance FROM players WHERE id=$1', [req.user.id]);
    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/player/deposit', authenticate, async (req, res) => {
  const { playerId, amount, method } = req.body;
  if (!playerId || !amount || amount <= 0) return res.status(400).json({ error: 'Données invalides' });
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const updateRes = await pool.query('UPDATE players SET balance=balance+$1, updated_at=NOW() WHERE id=$2 RETURNING balance', [amount, playerId]);
    if (updateRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    const newBalance = parseFloat(updateRes.rows[0].balance);
    await pool.query('INSERT INTO transactions (player_id, type, amount, method, description) VALUES ($1,$2,$3,$4,$5)',
      [playerId, 'deposit', amount, method || 'cash', `Dépôt par ${req.user.role} ${req.user.name}`]);
    res.json({ success: true, balance: newBalance });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/player/withdraw', authenticate, async (req, res) => {
  const { playerId, amount, method } = req.body;
  if (!playerId || !amount || amount <= 0) return res.status(400).json({ error: 'Données invalides' });
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const playerRes = await pool.query('SELECT balance FROM players WHERE id=$1', [playerId]);
    if (playerRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    const currentBalance = parseFloat(playerRes.rows[0].balance);
    if (currentBalance < amount) return res.status(400).json({ error: 'Solde insuffisant' });
    const updateRes = await pool.query('UPDATE players SET balance=balance-$1, updated_at=NOW() WHERE id=$2 RETURNING balance', [amount, playerId]);
    const newBalance = parseFloat(updateRes.rows[0].balance);
    await pool.query('INSERT INTO transactions (player_id, type, amount, method, description) VALUES ($1,$2,$3,$4,$5)',
      [playerId, 'withdraw', amount, method || 'cash', `Retrait par ${req.user.role} ${req.user.name}`]);
    res.json({ success: true, balance: newBalance });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/player/transactions', authenticate, requirePlayer, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE player_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ transactions: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/users/by-phone', authenticate, async (req, res) => {
  const { phone, role } = req.query;
  if (!phone) return res.status(400).json({ error: 'Téléphone requis' });
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    if (role === 'player') {
      const result = await pool.query('SELECT id, name, phone, balance FROM players WHERE phone=$1', [phone]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur non trouvé' });
      res.json(result.rows[0]);
    } else {
      const result = await pool.query('SELECT id, name, username, role FROM users WHERE username=$1', [phone]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur non trouvé' });
      res.json(result.rows[0]);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/player/balance-by-id', authenticate, async (req, res) => {
  const { playerId } = req.query;
  const allowedRoles = ['agent', 'supervisor', 'owner', 'superadmin'];
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const result = await pool.query('SELECT balance FROM players WHERE id=$1', [playerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Gestion des joueurs par le propriétaire
router.get('/owner/players', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { search } = req.query;
  let query = `SELECT p.id, p.name, p.phone as username, p.zone, p.balance, p.created_at FROM players p WHERE p.owner_id=$1`;
  const params = [ownerId];
  if (search) { query += ` AND (p.name ILIKE $2 OR p.phone ILIKE $2)`; params.push(`%${search}%`); }
  try {
    const result = await pool.query(query, params);
    res.json({ players: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/players/:id', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;
  try {
    const result = await pool.query('SELECT id, name, phone, zone, balance, created_at FROM players WHERE id=$1 AND owner_id=$2', [id, ownerId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/owner/create-player', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { name, phone, password, zone } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'Nom, téléphone et mot de passe requis' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO players (name, phone, password, zone, owner_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [name, phone, hashed, zone || null, ownerId]);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) { console.error(err); if (err.code === '23505') return res.status(400).json({ error: 'Ce numéro de téléphone existe déjà' }); res.status(500).json({ error: 'Erreur création joueur' }); }
});

router.put('/owner/players/:id', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;
  const { name, phone, zone, password } = req.body;
  try {
    let query = 'UPDATE players SET name=$1, phone=$2, zone=$3, updated_at=NOW()';
    const params = [name, phone, zone];
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      query += ', password=$4';
      params.push(hashed);
      query += ` WHERE id=$${params.length+1} AND owner_id=$${params.length+2} RETURNING id`;
      params.push(id, ownerId);
    } else {
      query += ` WHERE id=$${params.length+1} AND owner_id=$${params.length+2} RETURNING id`;
      params.push(id, ownerId);
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur mise à jour' }); }
});

router.delete('/owner/players/:id', authenticate, requireRole('owner'), async (req, res) => {
  const { id } = req.params;
  const ownerId = req.user.id;
  try {
    await pool.query('DELETE FROM players WHERE id=$1 AND owner_id=$2', [id, ownerId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur suppression' }); }
});

router.get('/owner/player-stats', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  try {
    const result = await pool.query(`SELECT COALESCE(SUM(t.total_amount),0) as totalBets, COALESCE(SUM(t.win_amount),0) as totalWins
                                     FROM tickets t WHERE t.owner_id=$1 AND t.player_id IS NOT NULL`, [ownerId]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/player-stats/:playerId', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { playerId } = req.params;
  try {
    const result = await pool.query(`SELECT COALESCE(SUM(t.total_amount),0) as totalBets, COALESCE(SUM(t.win_amount),0) as totalWins
                                     FROM tickets t WHERE t.owner_id=$1 AND t.player_id=$2`, [ownerId, playerId]);
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/owner/player-tickets/:playerId', authenticate, requireRole('owner'), async (req, res) => {
  const ownerId = req.user.id;
  const { playerId } = req.params;
  try {
    const result = await pool.query(`SELECT * FROM tickets WHERE owner_id=$1 AND player_id=$2 ORDER BY date DESC`, [ownerId, playerId]);
    res.json({ tickets: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/owner/send-player-message', authenticate, requireRole('owner'), async (req, res) => {
  const { playerId, message } = req.body;
  const ownerId = req.user.id;
  if (!playerId || !message) return res.status(400).json({ error: 'playerId et message requis' });
  try {
    await pool.query('INSERT INTO player_messages (player_id, sender_id, message) VALUES ($1,$2,$3)', [playerId, ownerId, message]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur envoi message' }); }
});

router.get('/owner/player-messages/:playerId', authenticate, requireRole('owner'), async (req, res) => {
  const { playerId } = req.params;
  try {
    const result = await pool.query(`SELECT m.*, u.name as sender_name FROM player_messages m LEFT JOIN users u ON m.sender_id=u.id WHERE m.player_id=$1 ORDER BY m.created_at DESC`, [playerId]);
    res.json({ messages: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
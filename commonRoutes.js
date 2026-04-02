const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { authenticate, generateETag } = require('./auth');

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
  if (!ownerId) return res.status(403).json({ error: 'Propriétaire non identifié' });
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

// Tirages globaux (sans owner_id)
router.get('/draws', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, time, color, active FROM draws ORDER BY time');
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

// Sauvegarde d'un ticket (version originale + support joueur optionnel)
router.post('/tickets/save', authenticate, async (req, res) => {
  const { agentId, agentName, drawId, drawName, bets, total, playerId } = req.body;
  const ownerId = req.user.ownerId;
  const ticketId = 'T' + Date.now() + Math.floor(Math.random() * 1000);
  try {
    const drawCheck = await pool.query('SELECT active FROM draws WHERE id=$1', [drawId]);
    if (drawCheck.rows.length === 0 || !drawCheck.rows[0].active) return res.status(403).json({ error: 'Tirage bloqué ou inexistant' });

    let playerName = null;
    if (playerId) {
      const playerRes = await pool.query('SELECT name, balance FROM players WHERE id=$1 AND owner_id=$2', [playerId, ownerId]);
      if (playerRes.rows.length === 0) return res.status(404).json({ error: 'Joueur introuvable' });
      playerName = playerRes.rows[0].name;
      const balance = parseFloat(playerRes.rows[0].balance);
      if (balance < total) return res.status(403).json({ error: 'Solde insuffisant' });
      await pool.query('UPDATE players SET balance = balance - $1 WHERE id = $2', [total, playerId]);
      await pool.query('INSERT INTO transactions (player_id, type, amount, description) VALUES ($1,$2,$3,$4)',
        [playerId, 'bet', total, `Pari sur tirage ${drawName} (Ticket ${ticketId})`]);
    }

    // Récupérer blocages et limites (code original)
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
      `INSERT INTO tickets (owner_id, agent_id, agent_name, player_id, player_name, draw_id, draw_name, ticket_id, total_amount, bets, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING id`,
      [ownerId, agentId, agentName, playerId || null, playerName, drawId, drawName, ticketId, finalTotal, JSON.stringify(finalBets)]
    );
    res.json({ success: true, ticket: { id: result.rows[0].id, ticket_id: ticketId, ...req.body } });
  } catch (err) { console.error('❌ Erreur sauvegarde ticket:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Liste des tickets (agent ne voit que les siens, optionnellement filtré par playerId)
router.get('/tickets', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  const { agentId, playerId } = req.query;
  let query = 'SELECT * FROM tickets WHERE owner_id = $1';
  const params = [ownerId];
  if (req.user.role === 'agent') {
    query += ' AND agent_id = $2 ORDER BY date DESC';
    params.push(req.user.id);
  } else if (agentId) {
    query += ' AND agent_id = $2 ORDER BY date DESC';
    params.push(agentId);
  } else if (playerId) {
    query += ' AND player_id = $2 ORDER BY date DESC';
    params.push(playerId);
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

module.exports = router;
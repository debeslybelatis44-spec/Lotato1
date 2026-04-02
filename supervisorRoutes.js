const express = require('express');
const { pool } = require('./db');
const { authenticate, requireRole } = require('./auth');

const router = express.Router();

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

module.exports = router;
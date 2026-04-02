const express = require('express');
const { pool } = require('./db');
const { authenticate, requireRole } = require('./auth');

const router = express.Router();

router.post('/winners/pay/:ticketId', authenticate, requireRole('agent'), async (req, res) => {
  const ticketId = req.params.ticketId;
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const ticket = await pool.query('SELECT id FROM tickets WHERE id=$1 AND agent_id=$2 AND owner_id=$3', [ticketId, agentId, ownerId]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket non trouvé ou non autorisé' });
    await pool.query('UPDATE tickets SET paid=true, paid_at=NOW() WHERE id=$1', [ticketId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/reports', authenticate, async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT COUNT(id) as total_tickets, COALESCE(SUM(total_amount),0) as total_bets, COALESCE(SUM(win_amount),0) as total_wins,
       COALESCE(SUM(win_amount)-SUM(total_amount),0) as balance FROM tickets WHERE owner_id=$1 AND agent_id=$2 AND date>=CURRENT_DATE`,
      [ownerId, agentId]);
    const row = result.rows[0];
    res.json({
      totalTickets: parseInt(row.total_tickets),
      totalBets: parseFloat(row.total_bets),
      totalWins: parseFloat(row.total_wins),
      totalLoss: parseFloat(row.total_bets)-parseFloat(row.total_wins),
      balance: parseFloat(row.balance)
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/reports/draw', authenticate, async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  const { drawId } = req.query;
  if (!drawId) return res.status(400).json({ error: 'drawId requis' });
  try {
    const result = await pool.query(
      `SELECT COUNT(id) as total_tickets, COALESCE(SUM(total_amount),0) as total_bets, COALESCE(SUM(win_amount),0) as total_wins,
       COALESCE(SUM(win_amount)-SUM(total_amount),0) as balance FROM tickets WHERE owner_id=$1 AND agent_id=$2 AND draw_id=$3 AND date>=CURRENT_DATE`,
      [ownerId, agentId, drawId]);
    const row = result.rows[0];
    res.json({
      totalTickets: parseInt(row.total_tickets),
      totalBets: parseFloat(row.total_bets),
      totalWins: parseFloat(row.total_wins),
      totalLoss: parseFloat(row.total_bets)-parseFloat(row.total_wins),
      balance: parseFloat(row.balance)
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/winners', authenticate, async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });
  const agentId = req.user.id;
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT * FROM tickets WHERE owner_id=$1 AND agent_id=$2 AND win_amount>0 AND date>=CURRENT_DATE ORDER BY date DESC`,
      [ownerId, agentId]);
    res.json({ winners: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/winners/results', authenticate, async (req, res) => {
  const ownerId = req.user.ownerId;
  try {
    const result = await pool.query(
      `SELECT wr.*, d.name as draw_name, wr.date as published_at FROM winning_results wr JOIN draws d ON wr.draw_id=d.id
       WHERE wr.owner_id=$1 AND wr.date>=CURRENT_DATE ORDER BY wr.draw_id, wr.date DESC`,
      [ownerId]);
    const rows = result.rows.map(row => {
      let numbers = row.numbers;
      if (typeof numbers === 'string') try { numbers = JSON.parse(numbers); } catch { numbers = []; }
      return { ...row, numbers, published_at: row.published_at, name: row.draw_name };
    });
    res.json({ results: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
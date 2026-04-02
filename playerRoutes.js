const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { authenticate, requirePlayer } = require('./auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_tres_long_et_securise';

// Inscription joueur
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

// Connexion joueur
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

// Solde joueur
router.get('/player/balance', authenticate, requirePlayer, async (req, res) => {
  try {
    const result = await pool.query('SELECT balance FROM players WHERE id=$1', [req.user.id]);
    res.json({ balance: parseFloat(result.rows[0].balance) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Dépôt (agent, superviseur, owner, superadmin)
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

// Retrait (agent, superviseur, owner, superadmin)
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

// Historique des transactions (joueur)
router.get('/player/transactions', authenticate, requirePlayer, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE player_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ transactions: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Recherche d’un joueur par téléphone (agent, etc.)
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

// Solde d’un joueur par ID (agent, etc.)
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

module.exports = router;
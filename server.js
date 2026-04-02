require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { initDatabase } = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
app.locals.upload = upload;

// Routeurs
const commonRoutes = require('./commonRoutes');
const agentRoutes = require('./agentRoutes');
const supervisorRoutes = require('./supervisorRoutes');
const ownerRoutes = require('./ownerRoutes');
const playerRoutes = require('./playerRoutes');

app.use('/api', commonRoutes);      // auth, draws, lottery-settings, tickets, etc.
app.use('/api', agentRoutes);       // rapports agent, paiement, winners
app.use('/api', supervisorRoutes);  // superviseur
app.use('/api', ownerRoutes);       // propriétaire, superadmin, gestion joueurs
app.use('/api', playerRoutes);      // joueurs (inscription, login, solde, etc.)

initDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${port}`);
  });
}).catch(err => {
  console.error('❌ Impossible de démarrer le serveur:', err);
  process.exit(1);
});
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

// Import des routeurs
const agentRoutes = require('./agentRoutes');
const commonRoutes = require('./commonRoutes');
const supervisorRoutes = require('./supervisorRoutes');
const ownerRoutes = require('./ownerRoutes');
const playerRoutes = require('./playerRoutes');

app.use('/api', agentRoutes);
app.use('/api', commonRoutes);
app.use('/api', supervisorRoutes);
app.use('/api', ownerRoutes);
app.use('/api', playerRoutes);

initDatabase().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur LOTATO démarré sur http://0.0.0.0:${port}`);
  });
}).catch(err => {
  console.error('❌ Impossible de démarrer le serveur:', err);
  process.exit(1);
});
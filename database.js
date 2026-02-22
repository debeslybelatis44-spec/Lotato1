const { Sequelize } = require('sequelize');

// Utiliser la variable d'environnement DATABASE_URL fournie par Render
// Exemple: mysql://user:password@host:port/database
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'mysql',
    logging: false, // désactiver les logs SQL en production
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

module.exports = sequelize;
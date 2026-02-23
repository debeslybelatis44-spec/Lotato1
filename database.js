const { Sequelize } = require('sequelize');

// Utilisation de DATABASE_URL (ex: postgresql://user:pass@host:port/db)
// Les options SSL sont déjà gérées via dialectOptions
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: true // Mettre false si vous avez des problèmes de certificat (ex: avec Neon)
        }
    },
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

module.exports = sequelize;
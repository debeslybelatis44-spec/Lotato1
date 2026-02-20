const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

async function initializeDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('📊 Initialisation de la base de données...');
        
        // Lire et exécuter le fichier SQL
        const sql = fs.readFileSync('./sql/tables.sql', 'utf8');
        
        await pool.query(sql);
        console.log('✅ Tables créées avec succès !');
        
        // Vérifier si un master existe déjà
        const masterCheck = await pool.query(
            "SELECT * FROM users WHERE role = 'master'"
        );
        
        if (masterCheck.rows.length === 0) {
            // Créer un utilisateur master par défaut
            await pool.query(
                `INSERT INTO users (username, password, name, email, role, level) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                ['master', 'master123', 'Master Admin', 'master@novalotto.com', 'master', 1]
            );
            console.log('👑 Compte master créé (username: master, password: master123)');
        }
        
        console.log('🎉 Base de données initialisée avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
    } finally {
        await pool.end();
    }
}

initializeDatabase();
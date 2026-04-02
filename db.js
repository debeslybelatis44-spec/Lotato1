const { Pool } = require('pg');
const moment = require('moment-timezone');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'America/Port-au-Prince'", (err) => {
    if (err) console.error('❌ Erreur réglage fuseau:', err);
  });
});

const pg = require('pg');
pg.types.setTypeParser(1114, (stringValue) => {
  return moment.tz(stringValue, 'YYYY-MM-DD HH:mm:ss', 'America/Port-au-Prince').toDate();
});

async function ensureTables() {
  // Table users
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      cin VARCHAR(50),
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('owner','supervisor','agent','superadmin')),
      supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      zone VARCHAR(100),
      commission_percentage DECIMAL(5,2) DEFAULT 0,
      blocked BOOLEAN DEFAULT false,
      quota INTEGER DEFAULT 0,
      phone VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS draws (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      time TIME NOT NULL,
      color VARCHAR(20),
      active BOOLEAN DEFAULT true
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_settings (
      owner_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100),
      slogan TEXT,
      logo_url TEXT,
      multipliers JSONB,
      limits JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_numbers (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
      number VARCHAR(2) NOT NULL,
      global BOOLEAN DEFAULT false,
      UNIQUE(owner_id, draw_id, number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS number_limits (
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
      number VARCHAR(2),
      limit_amount DECIMAL(10,2) NOT NULL,
      PRIMARY KEY (owner_id, draw_id, number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS winning_results (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      draw_id INTEGER REFERENCES draws(id) ON DELETE CASCADE,
      numbers VARCHAR(3) NOT NULL,
      lotto3 VARCHAR(3),
      date TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      agent_name VARCHAR(100),
      draw_id INTEGER REFERENCES draws(id) ON DELETE SET NULL,
      draw_name VARCHAR(100),
      ticket_id VARCHAR(50) UNIQUE,
      total_amount DECIMAL(10,2) DEFAULT 0,
      win_amount DECIMAL(10,2) DEFAULT 0,
      paid BOOLEAN DEFAULT false,
      paid_at TIMESTAMP,
      checked BOOLEAN DEFAULT false,
      bets JSONB,
      date TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_role VARCHAR(20),
      action VARCHAR(100),
      details TEXT,
      ip_address VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_messages (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS blocked_lotto3_numbers (
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      number VARCHAR(3) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (owner_id, number)
    )
  `);

  // Tables joueurs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      zone VARCHAR(100),
      owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      balance DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdraw', 'bet')),
      amount DECIMAL(10,2) NOT NULL,
      method VARCHAR(20),
      description TEXT,
      reference VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_messages (
      id SERIAL PRIMARY KEY,
      player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Ajout des colonnes player_id et player_name dans tickets (si elles n'existent pas)
  try {
    await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS player_id INTEGER REFERENCES players(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS player_name VARCHAR(100)`);
  } catch (err) { /* ignoré */ }

  // Index
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_owner_date ON tickets(owner_id, date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_agent_date ON tickets(agent_id, date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_player_id ON tickets(player_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_player_id ON transactions(player_id)`);

  console.log('✅ Tables vérifiées/créées');
}

async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log('✅ Connecté à PostgreSQL');
    client.release();
    const result = await pool.query('SELECT NOW() as current_time');
    console.log(`🕒 Heure du serveur DB : ${result.rows[0].current_time}`);
    await ensureTables();
    console.log('✅ Base de données prête');
  } catch (err) {
    console.error('❌ Erreur de connexion à la base de données :', err.message);
    throw err;
  }
}

module.exports = { pool, initDatabase };
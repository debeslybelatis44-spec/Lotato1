-- Script de création des tables pour PostgreSQL (Neon)
-- Exécutez ce script une fois pour initialiser la base de données.

-- Table des sous-systèmes
CREATE TABLE IF NOT EXISTS subsystems (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    max_users INTEGER DEFAULT 10,
    subscription_type VARCHAR(50) DEFAULT 'basic',
    subscription_expires TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(50) NOT NULL CHECK (role IN ('master', 'subsystem', 'supervisor', 'agent')),
    level INTEGER, -- 1 ou 2 pour les superviseurs
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    supervisor1_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    supervisor2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    is_online BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des tirages (draws)
CREATE TABLE IF NOT EXISTS draws (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    times JSONB NOT NULL, -- { "morning": { "hour": 12, "minute": 0, "time": "12:00" }, "evening": { "hour": 18, "minute": 0, "time": "18:00" } }
    is_active BOOLEAN DEFAULT true,
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des tickets
CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    number VARCHAR(50) NOT NULL,
    draw VARCHAR(100) NOT NULL,
    draw_time VARCHAR(20) NOT NULL, -- 'morning' ou 'evening'
    total INTEGER NOT NULL,
    agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    agent_name VARCHAR(255),
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    date TIMESTAMP NOT NULL,
    is_synced BOOLEAN DEFAULT true,
    synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des paris (bets)
CREATE TABLE IF NOT EXISTS bets (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    number VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL,
    multiplier INTEGER,
    options JSONB, -- pour les options des lotto4/5
    is_group BOOLEAN DEFAULT false,
    details JSONB,
    per_option_amount INTEGER,
    is_lotto4 BOOLEAN DEFAULT false,
    is_lotto5 BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des résultats
CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    draw VARCHAR(100) NOT NULL,
    time VARCHAR(20) NOT NULL, -- 'morning' ou 'evening'
    date DATE NOT NULL,
    lot1 VARCHAR(10) NOT NULL,
    lot2 VARCHAR(10),
    lot3 VARCHAR(10),
    verified BOOLEAN DEFAULT false,
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(draw, time, date, subsystem_id)
);

-- Table des enregistrements gagnants
CREATE TABLE IF NOT EXISTS winning_records (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    winning_bets JSONB,
    total_winnings INTEGER NOT NULL,
    paid BOOLEAN DEFAULT false,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des restrictions
CREATE TABLE IF NOT EXISTS restrictions (
    id SERIAL PRIMARY KEY,
    number VARCHAR(10) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('block', 'limit')),
    limit_amount INTEGER,
    draw VARCHAR(50) DEFAULT 'all', -- 'borlette', 'lotto3', etc. ou 'all'
    time VARCHAR(20) DEFAULT 'all', -- 'morning', 'evening', 'all'
    subsystem_id INTEGER REFERENCES subsystems(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des activités (log)
CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50) DEFAULT 'info',
    read BOOLEAN DEFAULT false,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertion d'un sous-système par défaut
INSERT INTO subsystems (name, subdomain, contact_email, max_users)
VALUES ('Sous-système par défaut', 'default', 'contact@default.com', 100)
ON CONFLICT (subdomain) DO NOTHING;

-- Insertion d'un tirage par défaut (exemple)
INSERT INTO draws (name, times, subsystem_id)
VALUES (
    'Borlette',
    '{"morning": {"hour": 12, "minute": 0, "time": "12:00"}, "evening": {"hour": 18, "minute": 0, "time": "18:00"}}'::jsonb,
    (SELECT id FROM subsystems WHERE subdomain = 'default')
)
ON CONFLICT DO NOTHING;

-- Note : les utilisateurs de test seront créés par le serveur au démarrage.
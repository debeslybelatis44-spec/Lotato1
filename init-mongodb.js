// Script d'initialisation de la base de données LOTATO
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://your_username:your_password@cluster0.mongodb.net/lotato?retryWrites=true&w=majority';

async function initDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Connecté à MongoDB Atlas');

        // Modèles
        const User = mongoose.model('User', new mongoose.Schema({
            username: String, password: String, role: String, name: String,
            commissionRate: Number, isActive: Boolean, lastLogin: Date, createdAt: Date
        }));
        
        const Draw = mongoose.model('Draw', new mongoose.Schema({
            drawId: String, name: String, times: Object, isActive: Boolean, order: Number
        }));
        
        const BetType = mongoose.model('BetType', new mongoose.Schema({
            gameId: String, name: String, multiplier: Number, multiplier2: Number,
            multiplier3: Number, icon: String, description: String, category: String, isActive: Boolean
        }));
        
        const Company = mongoose.model('Company', new mongoose.Schema({
            name: String, phone: String, address: String, logoUrl: String,
            reportTitle: String, reportPhone: String, commissionRates: Object, updatedAt: Date
        }));

        // 1. Nettoyer les collections existantes
        console.log('🧹 Nettoyage des collections...');
        await User.deleteMany({});
        await Draw.deleteMany({});
        await BetType.deleteMany({});
        await Company.deleteMany({});

        // 2. Créer les utilisateurs
        console.log('👥 Création des utilisateurs...');
        const users = [
            {
                username: 'admino',
                password: 'admin123o',
                role: 'agent',
                name: 'Administrateur Principal',
                commissionRate: 10,
                isActive: true
            },
            {
                username: 'agent1o',
                password: 'agent123o',
                role: 'agent',
                name: 'Agent Jean',
                commissionRate: 10,
                isActive: true
            },
            {
                username: 'superviseur1',
                password: 'super123',
                role: 'supervisor1',
                name: 'Superviseur Niveau 1',
                commissionRate: 8,
                isActive: true
            },
            {
                username: 'superviseur2',
                password: 'super456',
                role: 'supervisor2',
                name: 'Superviseur Niveau 2',
                commissionRate: 5,
                isActive: true
            },
            {
                username: 'subsystem',
                password: 'subsystem123',
                role: 'subsystem',
                name: 'Administrateur Sous-système',
                commissionRate: 0,
                isActive: true
            },
            {
                username: 'master',
                password: 'master123',
                role: 'master',
                name: 'Administrateur Master',
                commissionRate: 0,
                isActive: true
            }
        ];

        await User.insertMany(users);
        console.log(`✅ ${users.length} utilisateurs créés`);

        // 3. Créer les tirages
        console.log('🎯 Création des tirages...');
        const draws = [
            {
                drawId: 'miami',
                name: 'Miami (Florida)',
                times: { morning: '1:30 PM', evening: '9:50 PM' },
                isActive: true,
                order: 1
            },
            {
                drawId: 'georgia',
                name: 'Georgia',
                times: { morning: '12:30 PM', evening: '7:00 PM' },
                isActive: true,
                order: 2
            },
            {
                drawId: 'newyork',
                name: 'New York',
                times: { morning: '2:30 PM', evening: '8:00 PM' },
                isActive: true,
                order: 3
            },
            {
                drawId: 'texas',
                name: 'Texas',
                times: { morning: '12:00 PM', evening: '6:00 PM' },
                isActive: true,
                order: 4
            },
            {
                drawId: 'tunisia',
                name: 'Tunisie',
                times: { morning: '10:30 AM', evening: '2:00 PM' },
                isActive: true,
                order: 5
            }
        ];

        await Draw.insertMany(draws);
        console.log(`✅ ${draws.length} tirages créés`);

        // 4. Créer les types de paris
        console.log('🎰 Création des types de paris...');
        const betTypes = [
            {
                gameId: 'lotto3',
                name: 'LOTO 3',
                multiplier: 500,
                icon: 'fas fa-list-ol',
                description: '3 chif (lot 1 + 1 chif devan)',
                category: 'lotto',
                isActive: true
            },
            {
                gameId: 'grap',
                name: 'GRAP',
                multiplier: 500,
                icon: 'fas fa-chart-line',
                description: 'Grap boule paire (111, 222, ..., 000)',
                category: 'special',
                isActive: true
            },
            {
                gameId: 'marriage',
                name: 'MARYAJ',
                multiplier: 1000,
                icon: 'fas fa-link',
                description: 'Maryaj 2 chif (ex: 12*34)',
                category: 'special',
                isActive: true
            },
            {
                gameId: 'borlette',
                name: 'BORLETTE',
                multiplier: 60,
                multiplier2: 20,
                multiplier3: 10,
                icon: 'fas fa-dice',
                description: '2 chif (1er lot ×60, 2e ×20, 3e ×10)',
                category: 'borlette',
                isActive: true
            },
            {
                gameId: 'boulpe',
                name: 'BOUL PE',
                multiplier: 60,
                multiplier2: 20,
                multiplier3: 10,
                icon: 'fas fa-circle',
                description: 'Boul pe (00-99)',
                category: 'borlette',
                isActive: true
            },
            {
                gameId: 'lotto4',
                name: 'LOTO 4',
                multiplier: 5000,
                icon: 'fas fa-list-ol',
                description: '4 chif (lot 1+2 accumulate) - 3 opsyon',
                category: 'lotto',
                isActive: true
            },
            {
                gameId: 'lotto5',
                name: 'LOTO 5',
                multiplier: 25000,
                icon: 'fas fa-list-ol',
                description: '5 chif (lot 1+2+3 accumulate) - 3 opsyon',
                category: 'lotto',
                isActive: true
            },
            {
                gameId: 'auto-marriage',
                name: 'MARYAJ OTOMATIK',
                multiplier: 1000,
                icon: 'fas fa-robot',
                description: 'Marie boules otomatik',
                category: 'special',
                isActive: true
            },
            {
                gameId: 'auto-lotto4',
                name: 'LOTO 4 OTOMATIK',
                multiplier: 5000,
                icon: 'fas fa-robot',
                description: 'Lotto 4 otomatik',
                category: 'special',
                isActive: true
            }
        ];

        await BetType.insertMany(betTypes);
        console.log(`✅ ${betTypes.length} types de paris créés`);

        // 5. Créer les informations de l'entreprise
        console.log('🏢 Création des informations entreprise...');
        await Company.create({
            name: "Nova Lotto",
            phone: "+509 32 53 49 58",
            address: "Cap Haïtien",
            logoUrl: "logo-borlette.jpg",
            reportTitle: "Nova Lotto",
            reportPhone: "40104585",
            commissionRates: {
                agent: 10,
                supervisor1: 8,
                supervisor2: 5
            }
        });
        console.log('✅ Informations entreprise créées');

        console.log('\n🎉 Base de données LOTATO initialisée avec succès!');
        console.log('\n📊 Résumé:');
        console.log(`   👥 Utilisateurs: ${users.length}`);
        console.log(`   🎯 Tirages: ${draws.length}`);
        console.log(`   🎰 Types de paris: ${betTypes.length}`);
        console.log('   🏢 Informations entreprise: 1');

        process.exit(0);

    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
        process.exit(1);
    }
}

initDatabase();
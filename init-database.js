const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lotato:lotato123@cluster0.mongodb.net/lotato?retryWrites=true&w=majority';

async function initDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('✅ Connecté à MongoDB Atlas');

        // Modèles
        const User = mongoose.model('User', new mongoose.Schema({
            username: String, 
            password: String, 
            name: String,
            role: String,
            level: Number,
            commissionRate: Number, 
            isActive: Boolean, 
            lastLogin: Date, 
            dateCreation: Date
        }));
        
        const Draw = mongoose.model('Draw', new mongoose.Schema({
            drawId: String, 
            name: String, 
            times: Object,
            isActive: Boolean, 
            order: Number
        }));

        // Vérifier et créer les utilisateurs si nécessaire
        console.log('👥 Vérification des utilisateurs...');
        
        const users = [
            {
                username: 'master',
                password: 'master123',
                name: 'Administrateur Master',
                role: 'master',
                level: 1,
                commissionRate: 0,
                isActive: true
            },
            {
                username: 'admino',
                password: 'admin123o',
                name: 'Administrateur Principal',
                role: 'subsystem',
                level: 1,
                commissionRate: 0,
                isActive: true
            },
            {
                username: 'agent1o',
                password: 'agent123o',
                name: 'Agent Jean',
                role: 'agent',
                level: 1,
                commissionRate: 10,
                isActive: true
            },
            {
                username: 'superviseur1',
                password: 'super123',
                name: 'Superviseur Niveau 1',
                role: 'supervisor1',
                level: 1,
                commissionRate: 8,
                isActive: true
            },
            {
                username: 'superviseur2',
                password: 'super456',
                name: 'Superviseur Niveau 2',
                role: 'supervisor2',
                level: 2,
                commissionRate: 5,
                isActive: true
            }
        ];

        for (const userData of users) {
            const existing = await User.findOne({ username: userData.username });
            if (!existing) {
                await User.create(userData);
                console.log(`✅ Utilisateur ${userData.username} créé`);
            }
        }

        // Créer les tirages
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

        for (const draw of draws) {
            const existing = await Draw.findOne({ drawId: draw.drawId });
            if (!existing) {
                await Draw.create(draw);
            }
        }

        console.log('\n🎉 Base de données initialisée avec succès!');
        console.log('\n📋 Comptes de test:');
        console.log('1. Master: username=master, password=master123');
        console.log('2. Admin: username=admino, password=admin123o');
        console.log('3. Agent: username=agent1o, password=agent123o');
        console.log('4. Superviseur 1: username=superviseur1, password=super123');
        console.log('5. Superviseur 2: username=superviseur2, password=super456');

        mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('❌ Erreur:', error);
        process.exit(1);
    }
}

initDatabase();
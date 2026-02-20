// save as: init-subsystems.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connexion MongoDB
const MONGODB_URI = 'mongodb+srv://your_username:your_password@cluster0.mongodb.net/lotato?retryWrites=true&w=majority';

async function initDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        console.log('✅ Connecté à MongoDB');
        
        // Modèles (copiés de server.js)
        const userSchema = new mongoose.Schema({
            username: { type: String, required: true, unique: true },
            password: { type: String, required: true },
            role: {
                type: String,
                enum: ['agent', 'supervisor1', 'supervisor2', 'subsystem', 'master'],
                required: true,
                default: 'agent'
            },
            name: { type: String, required: true },
            commissionRate: { type: Number, default: 10 },
            isActive: { type: Boolean, default: true },
            lastLogin: { type: Date },
            subsystemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' },
            assignedSubsystems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subsystem' }],
            createdAt: { type: Date, default: Date.now }
        });
        
        const subsystemSchema = new mongoose.Schema({
            name: { type: String, required: true },
            code: { type: String, required: true, unique: true },
            domain: { type: String, required: true },
            managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            maxUsers: { type: Number, default: 50 },
            isActive: { type: Boolean, default: true },
            config: {
                openingTime: { type: String, default: '08:00' },
                closingTime: { type: String, default: '22:00' },
                allowedGames: { type: [String], default: ['borlette', 'boulpe', 'lotto3', 'lotto4'] },
                multipliers: {
                    borlette: { type: Number, default: 60 },
                    boulpe: { type: Number, default: 60 },
                    lotto3: { type: Number, default: 500 },
                    lotto4: { type: Number, default: 5000 }
                }
            },
            createdAt: { type: Date, default: Date.now },
            updatedAt: { type: Date, default: Date.now }
        });
        
        const User = mongoose.model('User', userSchema);
        const Subsystem = mongoose.model('Subsystem', subsystemSchema);
        
        // Créer l'utilisateur master s'il n'existe pas
        const masterUser = await User.findOne({ username: 'master' });
        let masterId;
        
        if (!masterUser) {
            console.log('👑 Création de l\'utilisateur master...');
            const newMaster = new User({
                username: 'master',
                password: 'master123', // À changer en production!
                name: 'Administrateur Master',
                role: 'master',
                commissionRate: 0,
                isActive: true
            });
            const savedMaster = await newMaster.save();
            masterId = savedMaster._id;
            console.log('✅ Utilisateur master créé');
        } else {
            masterId = masterUser._id;
            console.log('✅ Utilisateur master existe déjà');
        }
        
        // Créer des sous-systèmes par défaut
        const defaultSubsystems = [
            {
                name: 'Borlette Port-au-Prince',
                code: 'pap',
                domain: 'pap',
                managerId: masterId,
                config: {
                    openingTime: '07:00',
                    closingTime: '22:00',
                    allowedGames: ['borlette', 'boulpe', 'lotto3', 'lotto4'],
                    multipliers: {
                        borlette: 60,
                        boulpe: 60,
                        lotto3: 500,
                        lotto4: 5000
                    }
                }
            },
            {
                name: 'Borlette Cap-Haïtien',
                code: 'cap',
                domain: 'cap',
                managerId: masterId,
                config: {
                    openingTime: '08:00',
                    closingTime: '21:00',
                    allowedGames: ['borlette', 'boulpe', 'lotto3'],
                    multipliers: {
                        borlette: 60,
                        boulpe: 60,
                        lotto3: 500,
                        lotto4: 5000
                    }
                }
            },
            {
                name: 'Borlette Delmas',
                code: 'delmas',
                domain: 'delmas',
                managerId: masterId,
                config: {
                    openingTime: '08:30',
                    closingTime: '22:30',
                    allowedGames: ['borlette', 'boulpe', 'lotto3', 'lotto4'],
                    multipliers: {
                        borlette: 60,
                        boulpe: 60,
                        lotto3: 500,
                        lotto4: 5000
                    }
                }
            }
        ];
        
        for (const subsystemData of defaultSubsystems) {
            const existing = await Subsystem.findOne({ code: subsystemData.code });
            
            if (!existing) {
                const subsystem = new Subsystem(subsystemData);
                await subsystem.save();
                console.log(`✅ Sous-système "${subsystemData.name}" créé`);
            } else {
                console.log(`⚠️ Sous-système "${subsystemData.name}" existe déjà`);
            }
        }
        
        // Créer un admin de sous-système pour le démo
        const subsystem = await Subsystem.findOne({ code: 'pap' });
        if (subsystem) {
            const existingAdmin = await User.findOne({ username: 'admin_pap' });
            if (!existingAdmin) {
                const subsystemAdmin = new User({
                    username: 'admin_pap',
                    password: 'admin123',
                    name: 'Admin Port-au-Prince',
                    role: 'subsystem',
                    subsystemId: subsystem._id,
                    isActive: true
                });
                await subsystemAdmin.save();
                
                // Assigner cet admin comme manager du sous-système
                subsystem.managerId = subsystemAdmin._id;
                await subsystem.save();
                
                console.log('✅ Admin de sous-système créé');
            }
        }
        
        console.log('\n🎉 Initialisation terminée avec succès!');
        console.log('\n📋 Informations de connexion:');
        console.log('Master: username=master, password=master123');
        console.log('Subsystem Admin: username=admin_pap, password=admin123');
        console.log('\n🔧 Pour exécuter: node init-subsystems.js');
        
        mongoose.disconnect();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'initialisation:', error);
        process.exit(1);
    }
}

initDatabase();
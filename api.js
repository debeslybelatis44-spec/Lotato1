// ==========================================
// 1. Fonction de communication API (Corrigée)
// ==========================================
async function apiCall(url, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    // CORRECTION: Utiliser 'x-auth-token' comme attendu par server.js
    if (authToken) {
        headers['x-auth-token'] = authToken;
    }

    const options = {
        method,
        headers
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        if (response.status === 401) {
            // Token invalide ou expiré
            handleLogout();
            return null;
        }

        // Gérer les réponses vides ou non-JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return { success: response.ok };
        }
    } catch (error) {
        console.error('Erreur API:', error);
        // Si erreur réseau, retourner null
        return null;
    }
}

// ==========================================
// 2. CORRECTION CRITIQUE: Fonction saveTicketAPI()
// ==========================================
async function saveTicketAPI(ticketData) {
    try {
        console.log("Envoi du ticket à l'API:", ticketData);
        
        // CORRECTION: Vérifier que le numéro de ticket n'est pas null
        if (!ticketData.number || ticketData.number === null) {
            console.error('Erreur: ticketData.number est null ou undefined');
            return { success: false, error: 'Numéro de ticket manquant' };
        }
        
        const requestData = {
            ticketNumber: ticketData.number, // Le serveur va ignorer ceci mais on l'envoie pour la compatibilité
            draw: ticketData.draw,
            draw_time: ticketData.drawTime,
            bets: ticketData.bets,
            total: ticketData.total,
            agent_id: ticketData.agent_id,
            agent_name: ticketData.agent_name,
            subsystem_id: ticketData.subsystem_id,
            date: ticketData.date || new Date().toISOString()
        };
        
        console.log("Données envoyées au serveur:", requestData);
        
        const response = await apiCall(APP_CONFIG.tickets, 'POST', requestData);
        console.log("Réponse du serveur:", response);
        return response;
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du ticket:', error);
        throw error;
    }
}

// ==========================================
// Fonctions pour les fiches multi-tirages
// ==========================================
async function saveMultiDrawTicketAPI(ticket) {
    try {
        console.log("Envoi fiche multi-tirages à l'API:", ticket);
        
        const requestData = {
            ticket: {
                bets: ticket.bets,
                draws: Array.from(ticket.draws),
                totalAmount: ticket.totalAmount,
                agent_id: ticket.agentId,
                agent_name: ticket.agentName,
                subsystem_id: ticket.subsystem_id
            }
        };
        
        const response = await apiCall(APP_CONFIG.multiDrawTickets, 'POST', requestData);
        console.log("Réponse multi-tirages:", response);
        return response;
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la fiche multi-tirages:', error);
        throw error;
    }
}

// ==========================================
// Charger les données depuis l'API
// ==========================================
async function loadDataFromAPI() {
    try {
        console.log("Chargement des données depuis l'API...");
        
        // Vérifier d'abord que l'utilisateur est connecté
        if (!currentUser) {
            if (!await checkAuth()) {
                return;
            }
        }
        
        // Charger les tickets
        const ticketsData = await apiCall(APP_CONFIG.tickets);
        console.log("Données tickets reçues:", ticketsData);
        
        if (ticketsData && ticketsData.success) {
            savedTickets = ticketsData.tickets || [];
            ticketNumber = ticketsData.nextTicketNumber || ticketNumber;
            console.log(`${savedTickets.length} tickets chargés, prochain numéro: ${ticketNumber}`);
        }
        
        // Charger les tickets gagnants
        const winningData = await apiCall(APP_CONFIG.winningTickets);
        if (winningData && winningData.success) {
            winningTickets = winningData.tickets || [];
        }
        
        // Charger les fiches multi-tirages
        const multiDrawData = await apiCall(APP_CONFIG.multiDrawTickets);
        if (multiDrawData && multiDrawData.success) {
            multiDrawTickets = multiDrawData.tickets || [];
        }
        
        // Charger les informations de l'entreprise
        const companyData = await apiCall(APP_CONFIG.companyInfo);
        if (companyData && companyData.success) {
            companyInfo = companyData;
        }
        
        // Charger le logo
        const logoData = await apiCall(APP_CONFIG.logo);
        if (logoData && logoData.success && logoData.logoUrl) {
            companyLogo = logoData.logoUrl;
        }
        
        console.log('✅ Données chargées depuis l\'API:', { 
            tickets: savedTickets.length, 
            ticketNumber, 
            winning: winningTickets.length,
            multiDraw: multiDrawTickets.length,
            user: currentUser ? currentUser.name : 'Non connecté'
        });
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données:', error);
        showNotification("Erreur de chargement des données", "error");
    }
}
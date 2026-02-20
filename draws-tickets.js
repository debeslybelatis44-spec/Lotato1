// ==========================================
// Vérifier si un tirage est bloqué
// ==========================================
function isDrawBlocked(drawId, drawTime) {
    const draw = draws[drawId];
    if (!draw || !draw.times[drawTime]) {
        return true; // Par sécurité, bloquer si non trouvé
    }

    const now = new Date();
    const drawTimeInfo = draw.times[drawTime];
    
    // Créer la date du tirage pour aujourd'hui
    const drawDate = new Date(now);
    drawDate.setHours(drawTimeInfo.hour, drawTimeInfo.minute, 0, 0);
    
    // Calculer 5 minutes avant le tirage
    const blockTime = new Date(drawDate.getTime() - (5 * 60 * 1000));
    
    // Si nous sommes entre le blocage (5 min avant) et après le tirage, bloquer
    if (now >= blockTime) {
        return true;
    }
    
    return false;
}

// ==========================================
// Vérifier le blocage avant d'ouvrir l'écran de pari
// ==========================================
function checkDrawBeforeOpening(drawId, time) {
    if (isDrawBlocked(drawId, time)) {
        const drawTime = draws[drawId].times[time].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab fè parye 5 minit avan.`, "error");
        return false;
    }
    return true;
}

// ==========================================
// 3. CORRECTION: Sauvegarder un ticket avec les informations de l'utilisateur
// ==========================================
async function saveTicket() {
    console.log("Sauvegarder fiche via API");
    
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou sove nan fiche a", "warning");
        return;
    }
    
    // Vérifier que le tirage n'est pas bloqué
    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = draws[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab sove fiche 5 minit avan.`, "error");
        return;
    }
    
    // Vérifier que l'utilisateur est connecté
    if (!currentUser) {
        showNotification("Ou pa konekte. Tanpri rekonekte.", "error");
        handleLogout();
        return;
    }
    
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    
    // Le numéro sera généré par le serveur
    const ticket = {
        number: ticketNumber, // Ce numéro sera ignoré par le serveur
        draw: currentDraw,
        drawTime: currentDrawTime,
        bets: activeBets,
        total: total,
        agent_id: currentUser.id,
        agent_name: currentUser.name,
        subsystem_id: currentUser.subsystem_id,
        date: new Date().toISOString()
    };
    
    try {
        // Sauvegarder via API
        const response = await saveTicketAPI(ticket);
        
        if (response && response.success) {
            console.log("✅ Ticket sauvegardé avec succès:", response.ticket);
            
            // Utiliser le ticket retourné par le serveur avec le numéro généré
            const savedTicket = {
                ...response.ticket,
                id: response.ticket.id || Date.now().toString()
            };
            
            // Ajouter aux tickets sauvegardés localement
            savedTickets.push(savedTicket);
            
            // Mettre à jour le numéro de ticket local avec celui du serveur + 1
            ticketNumber = response.ticket.number + 1;
            
            showNotification("Fiche sove avèk siksè!", "success");
            
            // Réinitialiser les paris actifs
            activeBets = [];
            updateBetsList();
            
            return savedTicket;
        } else {
            const errorMsg = response?.error || "Erreur inconnue";
            console.error('❌ Erreur sauvegarde:', errorMsg);
            showNotification(`Erreur lors de la sauvegarde du ticket: ${errorMsg}`, "error");
            return null;
        }
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde du ticket:', error);
        showNotification("Erreur lors de la sauvegarde du ticket", "error");
        throw error;
    }
}

// ==========================================
// 6. CORRECTION: Sauvegarder et imprimer la fiche
// ==========================================
async function saveAndPrintTicket() {
    console.log("Sauvegarder et imprimer");
    
    if (activeBets.length === 0) {
        showNotification("Pa gen okenn parye pou sove nan fiche a", "warning");
        return;
    }
    
    // Vérifier si le tirage est bloqué
    if (currentDraw && currentDrawTime && isDrawBlocked(currentDraw, currentDrawTime)) {
        const drawTime = draws[currentDraw].times[currentDrawTime].time;
        showNotification(`Tiraj sa a bloke! Li fèt à ${drawTime} epi ou pa kapab sove oswa enprime fiche 5 minit avan.`, "error");
        return;
    }
    
    const savedTicket = await saveTicket();
    
    if (savedTicket) {
        setTimeout(() => {
            printTicket(savedTicket);
        }, 100);
    }
}

// ==========================================
// 7. CORRECTION: Imprimer la fiche (utilise le ticket sauvegardé)
// ==========================================
function printTicket(ticketToPrint = null) {
    console.log("Imprimer fiche");
    
    // Utiliser le ticket passé en paramètre ou le dernier ticket sauvegardé
    let ticket = ticketToPrint;
    
    if (!ticket) {
        if (savedTickets.length === 0) {
            showNotification("Pa gen fiche ki sove pou enprime.", "warning");
            return;
        }
        ticket = savedTickets[savedTickets.length - 1];
    }

    const printContent = document.createElement('div');
    printContent.className = 'print-ticket';
    
    const groupedBets = groupBetsByType(ticket.bets);
    
    let betsHTML = '';
    let total = 0;
    
    for (const [type, bets] of Object.entries(groupedBets)) {
        betsHTML += `
            <div style="margin-bottom: 15px;">
                <div style="font-weight: bold; margin-bottom: 5px;">${type}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 5px;">
        `;
        
        bets.forEach(bet => {
            // Pour Lotto 4 et Lotto 5, afficher les options
            let betInfo = bet.number;
            if (bet.isLotto4 || bet.isLotto5) {
                const options = [];
                if (bet.options?.option1) options.push('O1');
                if (bet.options?.option2) options.push('O2');
                if (bet.options?.option3) options.push('O3');
                if (options.length > 0) {
                    betInfo += ` (${options.join(',')})`;
                }
            }
            
            betsHTML += `
                <div style="background: #f0f0f0; padding: 5px 10px; border-radius: 4px; font-size: 0.9rem;">
                    ${betInfo}<br>
                    <strong>${bet.amount} G</strong>
                </div>
            `;
            total += bet.amount;
        });
        
        betsHTML += `
                </div>
            </div>
        `;
    }
    
    printContent.innerHTML = `
        <div style="text-align: center; padding: 20px; border: 2px solid #000; font-family: Arial, sans-serif;">
            <div style="margin-bottom: 15px;">
                <img src="${companyLogo}" alt="Logo Nova Lotto" class="ticket-logo" style="max-width: 80px; height: auto;">
            </div>
            <h2>${companyInfo.name}</h2>
            <p>Fiche Parye</p>
            <p><strong>Nimewo:</strong> #${String(ticket.number).padStart(6, '0')}</p>
            <p><strong>Dat:</strong> ${new Date(ticket.date).toLocaleString('fr-FR')}</p>
            <p><strong>Tiraj:</strong> ${draws[ticket.draw].name} (${ticket.drawTime === 'morning' ? 'Maten' : 'Swè'})</p>
            <p><strong>Ajan:</strong> ${ticket.agent_name}</p>
            <p><strong>Sous-système:</strong> ${currentUser ? (currentUser.subsystem_name || 'Non spécifié') : 'Non connecté'}</p>
            <hr>
            <div style="margin: 15px 0;">
                ${betsHTML}
            </div>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-top: 15px; font-weight: bold; font-size: 1.1rem;">
                <span>Total:</span>
                <span>${total} goud</span>
            </div>
            <p style="margin-top: 20px;">Mèsi pou konfyans ou!</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 10px;">
                Fiche kreye: ${new Date().toLocaleString('fr-FR')}
            </p>
        </div>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Fiche ${companyInfo.name}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        @page { margin: 0; }
                    }
                </style>
            </head>
            <body>
                ${printContent.innerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// ==========================================
// 8. CORRECTION: Afficher l'application principale
// ==========================================
function showMainApp() {
    console.log("Affichage application principale");
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
    document.getElementById('bottom-nav').style.display = 'flex';
    document.getElementById('sync-status').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'block';
}
// cartManager.js - VERSION PROFESSIONNELLE ET STABLE

function printThermalTicket(ticket) {
    const lotteryConfig = APP_STATE.lotteryConfig || {
        LOTTERY_NAME: "BOUL PAW",
        LOTTERY_ADDRESS: "Haïti",
        LOTTERY_PHONE: ""
    };
    
    // Génération des lignes de paris bien alignées
    let betsHtml = '';
    const bets = ticket.bets || [];
    betsHtml = bets.map(b => `
        <div class="bet-row">
            <span class="bet-game">${(b.game || '').toUpperCase()} ${(b.number || b.numero)}</span>
            <span class="bet-dots">..........................</span>
            <span class="bet-amount">${(b.amount || 0)} G</span>
        </div>
    `).join('');

    const ticketId = ticket.ticket_id || ticket.id || '000000';
    const dateStr = new Date(ticket.date || Date.now()).toLocaleString('fr-FR');

    const content = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page { size: 80mm auto; margin: 0; }
            body { 
                font-family: 'Courier New', Courier, monospace; 
                width: 72mm; /* Largeur standard imprimante thermique */
                margin: 0 auto; 
                padding: 5px;
                color: #000;
            }
            .header { text-align: center; margin-bottom: 10px; }
            .header h2 { margin: 5px 0; font-size: 18px; text-transform: uppercase; }
            
            .info-box { font-size: 12px; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
            .info-line { display: flex; justify-content: space-between; margin: 2px 0; }
            
            .bets-container { margin: 10px 0; min-height: 50px; }
            .bet-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; margin: 4px 0; }
            .bet-game { font-weight: bold; white-space: nowrap; }
            .bet-dots { flex-grow: 1; overflow: hidden; margin: 0 5px; color: #555; font-size: 10px; }
            .bet-amount { font-weight: bold; white-space: nowrap; }

            .total-section { 
                margin-top: 10px; 
                border-top: 2px solid #000; 
                padding-top: 5px;
            }
            .total-row { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; }
            
            .footer { text-align: center; margin-top: 15px; font-size: 11px; font-style: italic; }
            .barcode { margin-top: 10px; font-size: 10px; letter-spacing: 2px; border-top: 1px dashed #000; padding-top: 5px; }
            
            /* Cacher à l'écran lors du débogage si nécessaire */
            @media print {
                .no-print { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h2>${lotteryConfig.LOTTERY_NAME}</h2>
            <div style="font-size: 11px;">${lotteryConfig.LOTTERY_ADDRESS}</div>
            <div style="font-size: 11px;">Tél: ${lotteryConfig.LOTTERY_PHONE}</div>
        </div>
        
        <div class="info-box">
            <div class="info-line"><span>Date:</span> <span>${dateStr}</span></div>
            <div class="info-line"><span>Tiraj:</span> <strong>${ticket.draw_name || 'N/A'}</strong></div>
            <div class="info-line"><span>Ticket #:</span> <strong>${ticketId}</strong></div>
            <div class="info-line"><span>Ajan:</span> <span>${ticket.agent_name || APP_STATE.agentName || ''}</span></div>
        </div>

        <div class="bets-container">
            ${betsHtml}
        </div>

        <div class="total-section">
            <div class="total-row">
                <span>TOTAL</span>
                <span>${(ticket.total_amount || ticket.total || 0)} Gdes</span>
            </div>
        </div>

        <div class="footer">
            <p>Mèsi pou konfyans ou!<br>Bòn Chans!</p>
            <div class="barcode">* ${ticketId} *</div>
        </div>
    </body>
    </html>
    `;

    // Ouverture de la fenêtre
    const printWindow = window.open('', '_blank', 'width=450,height=600');
    
    if (!printWindow) {
        alert("Tanpri pèmèt 'Pop-ups' nan navigatè ou a pou enprime tikè a.");
        return;
    }

    printWindow.document.write(content);
    printWindow.document.close();

    // On attend que le contenu soit rendu
    printWindow.focus();
    
    // Correction du problème de disparition : 
    // On laisse la fenêtre ouverte. L'utilisateur la fermera après l'impression physique.
    setTimeout(() => {
        printWindow.print();
        // On ne met PAS de printWindow.close() ici pour éviter que ça disparaisse trop vite
    }, 600);
}

// Assurez-vous que cette fonction est appelée dans processFinalTicket
async function processFinalTicket() {
    // ... (votre code de sauvegarde existant)
    // À la fin du succès :
    // printThermalTicket(savedTicket);
}

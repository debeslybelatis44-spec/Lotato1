// ==========================================
// Modifier la fonction addBet pour inclure la notification du total
// ==========================================
function addBet(betType) {
    console.log("Ajouter pari:", betType);
    const bet = betTypes[betType];
    let number, amount;
    
    switch(betType) {
        case 'lotto3':
            number = document.getElementById('lotto3-number').value;
            amount = parseInt(document.getElementById('lotto3-amount').value);
            
            if (!/^\d{3}$/.test(number)) {
                showNotification("Lotto 3 dwe gen 3 chif egzat (0-9)", "warning");
                return;
            }
            break;
            
        case 'marriage':
            const num1 = document.getElementById('marriage-number1').value;
            const num2 = document.getElementById('marriage-number2').value;
            number = `${num1}*${num2}`;
            amount = parseInt(document.getElementById('marriage-amount').value);
            
            if (!/^\d{2}$/.test(num1) || !/^\d{2}$/.test(num2)) {
                showNotification("Chak chif maryaj dwe gen 2 chif", "warning");
                return;
            }
            break;
            
        case 'borlette':
            number = document.getElementById('borlette-number').value;
            amount = parseInt(document.getElementById('borlette-amount').value);
            
            if (!/^\d{2}$/.test(number)) {
                showNotification("Borlette dwe gen 2 chif", "warning");
                return;
            }
            break;
            
        case 'boulpe':
            number = document.getElementById('boulpe-number').value;
            amount = parseInt(document.getElementById('boulpe-amount').value);
            
            if (!/^\d{2}$/.test(number)) {
                showNotification("Boul pe dwe gen 2 chif", "warning");
                return;
            }
            
            if (number.length === 2 && number[0] === number[1]) {
                // C'est une boule paire
            } else {
                showNotification("Pou boul pe, fòk de chif yo menm! (ex: 00, 11, 22)", "warning");
                return;
            }
            break;
            
        case 'lotto4':
            const num4_1 = document.getElementById('lotto4-number1').value;
            const num4_2 = document.getElementById('lotto4-number2').value;
            number = `${num4_1}${num4_2}`; // Concaténation simple pour 4 chiffres
            
            // Récupérer les options cochées
            const option1 = document.getElementById('lotto4-option1')?.checked || false;
            const option2 = document.getElementById('lotto4-option2')?.checked || false;
            const option3 = document.getElementById('lotto4-option3')?.checked || false;
            amount = parseInt(document.getElementById('lotto4-amount').value);
            
            if (!/^\d{2}$/.test(num4_1) || !/^\d{2}$/.test(num4_2)) {
                showNotification("Chak boule Lotto 4 dwe gen 2 chif", "warning");
                return;
            }
            
            // Calculer le montant total basé sur les options cochées
            const optionsCount = [option1, option2, option3].filter(opt => opt).length;
            if (optionsCount === 0) {
                showNotification("Tanpri chwazi omwen yon opsyon", "warning");
                return;
            }
            
            const totalAmount = amount * optionsCount;
            
            activeBets.push({
                type: betType,
                name: bet.name,
                number: number,
                amount: totalAmount,
                multiplier: bet.multiplier,
                options: {
                    option1: option1,
                    option2: option2,
                    option3: option3
                },
                perOptionAmount: amount,
                isLotto4: true
            });
            
            updateBetsList();
            showNotification("Lotto 4 ajoute avèk siksè!", "success");
            
            // Retourner à la liste des jeux après un court délai
            setTimeout(() => {
                document.getElementById('bet-form').style.display = 'none';
                document.getElementById('bet-type-nav').style.display = 'none';
                document.getElementById('auto-buttons').style.display = 'none';
                document.getElementById('games-interface').style.display = 'block';
            }, 500);
            return; // Retourner pour éviter l'exécution du code général
            
        case 'lotto5':
            const num5_1 = document.getElementById('lotto5-number1').value;
            const num5_2 = document.getElementById('lotto5-number2').value;
            number = `${num5_1}${num5_2}`;
            
            // Récupérer les options cochées pour Lotto 5
            const lotto5Option1 = document.getElementById('lotto5-option1')?.checked || false;
            const lotto5Option2 = document.getElementById('lotto5-option2')?.checked || false;
            const lotto5Option3 = document.getElementById('lotto5-option3')?.checked || false;
            amount = parseInt(document.getElementById('lotto5-amount').value);
            
            if (!/^\d{3}$/.test(num5_1) || !/^\d{2}$/.test(num5_2)) {
                showNotification("Lotto 5: Premye boule 3 chif, Dezyèm boule 2 chif", "warning");
                return;
            }
            
            // Calculer le montant total basé sur les options cochées
            const lotto5OptionsCount = [lotto5Option1, lotto5Option2, lotto5Option3].filter(opt => opt).length;
            if (lotto5OptionsCount === 0) {
                showNotification("Tanpri chwazi omwen yon opsyon", "warning");
                return;
            }
            
            const lotto5TotalAmount = amount * lotto5OptionsCount;
            
            activeBets.push({
                type: betType,
                name: bet.name,
                number: number,
                amount: lotto5TotalAmount,
                multiplier: bet.multiplier,
                options: {
                    option1: lotto5Option1,
                    option2: lotto5Option2,
                    option3: lotto5Option3
                },
                perOptionAmount: amount,
                isLotto5: true
            });
            
            updateBetsList();
            showNotification("Lotto 5 ajoute avèk siksè!", "success");
            
            // Retourner à la liste des jeux après un court délai
            setTimeout(() => {
                document.getElementById('bet-form').style.display = 'none';
                document.getElementById('bet-type-nav').style.display = 'none';
                document.getElementById('auto-buttons').style.display = 'none';
                document.getElementById('games-interface').style.display = 'block';
            }, 500);
            return; // Retourner pour éviter l'exécution du code général
    }
    
    if (!number || isNaN(amount) || amount <= 0) {
        showNotification("Tanpri rantre yon nimewo ak yon kantite valab", "warning");
        return;
    }
    
    activeBets.push({
        type: betType,
        name: bet.name,
        number: number,
        amount: amount,
        multiplier: bet.multiplier
    });
    
    updateBetsList();
    
    // Afficher la notification du total
    updateNormalBetTotalNotification();
    
    showNotification("Parye ajoute avèk siksè!", "success");
    
    // Retourner à la liste des jeux après un court délai
    setTimeout(() => {
        document.getElementById('bet-form').style.display = 'none';
        document.getElementById('bet-type-nav').style.display = 'none';
        document.getElementById('auto-buttons').style.display = 'none';
        document.getElementById('games-interface').style.display = 'block';
    }, 500);
}

// ==========================================
// Modifier la fonction updateBetsList pour inclure la notification du total
// ==========================================
function updateBetsList() {
    console.log("Mise à jour liste paris");
    const betsList = document.getElementById('bets-list');
    const betTotal = document.getElementById('bet-total');
    
    betsList.innerHTML = '';
    
    if (activeBets.length === 0) {
        betsList.innerHTML = '<p>Pa gen okenn parye aktif.</p>';
        betTotal.textContent = '0 goud';
        
        // Cacher la notification du total si aucun pari
        const notification = document.querySelector('.total-notification');
        if (notification) {
            notification.remove();
        }
        return;
    }
    
    const groupedBets = {};
    
    activeBets.forEach((bet, index) => {
        // Pour Lotto 4 et Lotto 5, on gère les options séparément
        if (bet.isLotto4 || bet.isLotto5) {
            const key = `${bet.type}_${bet.number}_${JSON.stringify(bet.options)}`;
            
            if (!groupedBets[key]) {
                groupedBets[key] = {
                    bet: bet,
                    count: 1,
                    totalAmount: bet.amount,
                    indexes: [index]
                };
            } else {
                groupedBets[key].count++;
                groupedBets[key].totalAmount += bet.amount;
                groupedBets[key].indexes.push(index);
            }
        } else {
            const key = `${bet.type}_${bet.number}`;
            
            if (!groupedBets[key]) {
                groupedBets[key] = {
                    bet: bet,
                    count: 1,
                    totalAmount: bet.amount,
                    indexes: [index]
                };
            } else {
                groupedBets[key].count++;
                groupedBets[key].totalAmount += bet.amount;
                groupedBets[key].indexes.push(index);
            }
        }
    });
    
    for (const key in groupedBets) {
        const group = groupedBets[key];
        const bet = group.bet;
        
        const betItem = document.createElement('div');
        betItem.className = 'bet-item';
        
        if (bet.isGroup) {
            betItem.innerHTML = `
                <div class="bet-details">
                    <strong>${bet.name}</strong><br>
                    ${bet.number} (${bet.details.length} parye)
                </div>
                <div class="bet-amount">
                    ${group.totalAmount} goud
                    <span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span>
                </div>
            `;
        } else if (bet.isLotto4 || bet.isLotto5) {
            let optionsText = '';
            if (bet.isLotto4) {
                const options = [];
                if (bet.options.option1) options.push('Opsyon 1');
                if (bet.options.option2) options.push('Opsyon 2');
                if (bet.options.option3) options.push('Opsyon 3');
                optionsText = options.join(', ');
            } else if (bet.isLotto5) {
                const options = [];
                if (bet.options.option1) options.push('Opsyon 1');
                if (bet.options.option2) options.push('Opsyon 2');
                if (bet.options.option3) options.push('Opsyon 3');
                optionsText = options.join(', ');
            }
            
            betItem.innerHTML = `
                <div class="bet-details">
                    <strong>${bet.name}</strong><br>
                    ${bet.number}<br>
                    <small style="color: #7f8c8d;">${optionsText}</small>
                </div>
                <div class="bet-amount">
                    ${group.totalAmount} goud
                    <span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span>
                </div>
            `;
        } else {
            betItem.innerHTML = `
                <div class="bet-details">
                    <strong>${bet.name}</strong><br>
                    ${bet.number}
                </div>
                <div class="bet-amount">
                    ${group.totalAmount} goud
                    <span class="bet-remove" data-indexes="${group.indexes.join(',')}"><i class="fas fa-times"></i></span>
                </div>
            `;
        }
        
        betsList.appendChild(betItem);
        
        // Ajouter l'événement pour supprimer
        const removeBtn = betItem.querySelector('.bet-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                const indexes = this.getAttribute('data-indexes').split(',').map(Number);
                
                indexes.sort((a, b) => b - a).forEach(index => {
                    activeBets.splice(index, 1);
                });
                
                updateBetsList();
            });
        }
    }
    
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    betTotal.textContent = `${total} goud`;
    
    // Mettre à jour la notification du total
    updateNormalBetTotalNotification();
}

// ==========================================
// Mettre à jour la notification du total pour les paris normaux
// ==========================================
function updateNormalBetTotalNotification() {
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    if (total > 0) {
        showTotalNotification(total, 'normal');
    }
}

// ==========================================
// Charger les résultats depuis la base de données
// ==========================================
async function loadResultsFromDatabase() {
    console.log("Chargement des résultats depuis la base de données...");
    
    try {
        // Appel API pour les résultats
        const resultsData = await apiCall(APP_CONFIG.results);
        if (resultsData && resultsData.results) {
            resultsDatabase = resultsData.results;
        }
        
        console.log("Utilisation des résultats:", resultsDatabase);
        
        // Mettre à jour l'affichage des résultats
        updateResultsDisplay();
        
    } catch (error) {
        console.error("Erreur lors du chargement des résultats:", error);
        showNotification("Erreur chargement résultats", "error");
    }
}

// ==========================================
// Vérifier les nouveaux résultats
// ==========================================
async function checkForNewResults() {
    console.log("Vérification des nouveaux résultats...");
    
    if (!isOnline) {
        console.log("Pas de connexion Internet");
        return;
    }
    
    try {
        const resultsData = await apiCall(APP_CONFIG.results);
        if (resultsData && resultsData.results) {
            resultsDatabase = resultsData.results;
            updateResultsDisplay();
            console.log("Résultats mis à jour");
        }
    } catch (error) {
        console.error("Erreur lors de la vérification des résultats:", error);
    }
}

// ==========================================
// Mettre à jour l'affichage des résultats
// ==========================================
function updateResultsDisplay() {
    console.log("Mise à jour affichage des résultats");
    
    // Mettre à jour les résultats dans la section principale
    const resultsGrid = document.querySelector('.results-grid');
    if (resultsGrid) {
        resultsGrid.innerHTML = '';
        
        Object.keys(draws).forEach(drawId => {
            const resultCard = document.createElement('div');
            resultCard.className = 'result-card';
            
            // Prendre le dernier résultat disponible (matin par défaut)
            const result = resultsDatabase[drawId]?.morning || { lot1: '---' };
            
            resultCard.innerHTML = `
                <h4>${draws[drawId].name}</h4>
                <div class="result-number">${result.lot1}</div>
            `;
            
            resultsGrid.appendChild(resultCard);
        });
    }
    
    // Mettre à jour l'écran de vérification des résultats
    const latestResults = document.getElementById('latest-results');
    if (latestResults) {
        latestResults.innerHTML = '';
        
        Object.keys(draws).forEach(drawId => {
            Object.keys(draws[drawId].times).forEach(time => {
                const result = resultsDatabase[drawId]?.[time];
                if (result) {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'lot-result';
                    
                    const timeName = time === 'morning' ? 'Maten' : 'Swè';
                    resultDiv.innerHTML = `
                        <div>
                            <strong>${draws[drawId].name} ${timeName}</strong><br>
                            <small>${new Date(result.date).toLocaleString()}</small>
                        </div>
                        <div style="text-align: right;">
                            <div class="lot-number">${result.lot1}</div>
                            <div>${result.lot2} (×20)</div>
                            <div>${result.lot3} (×10)</div>
                        </div>
                    `;
                    
                    latestResults.appendChild(resultDiv);
                }
            });
        });
    }
}
// MODIFICATION : utiliser APP_STATE.draws et vérifier active
function isDrawBlocked(drawTime) {
    const now = new Date();
    const [hours, minutes] = drawTime.split(':').map(Number);
    
    const drawDate = new Date();
    drawDate.setHours(hours, minutes, 0, 0);
    
    if (drawDate < now) {
        drawDate.setDate(drawDate.getDate() + 1);
    }
    
    const blockedTime = new Date(drawDate.getTime() - (3 * 60 * 1000));
    
    return now >= blockedTime && now < drawDate;
}

function checkSelectedDrawStatus() {
    const draws = APP_STATE.draws || CONFIG.DRAWS;
    const selectedDraw = draws.find(d => d.id === APP_STATE.selectedDraw);
    if (!selectedDraw) return false;
    
    // Blocage si tirage désactivé par admin OU dans la fenêtre 3 min
    const blocked = !selectedDraw.active || isDrawBlocked(selectedDraw.time);
    APP_STATE.isDrawBlocked = blocked;
    
    const warningEl = document.getElementById('draw-blocked-warning');
    const addBetBtn = document.getElementById('add-bet-btn');
    
    if (blocked) {
        warningEl.style.display = 'flex';
        addBetBtn.disabled = true;
        addBetBtn.style.opacity = '0.5';
        addBetBtn.style.cursor = 'not-allowed';
        addBetBtn.innerHTML = '<i class="fas fa-ban"></i>';
    } else {
        warningEl.style.display = 'none';
        addBetBtn.disabled = false;
        addBetBtn.style.opacity = '1';
        addBetBtn.style.cursor = 'pointer';
        addBetBtn.innerHTML = '<i class="fas fa-plus"></i>';
    }
    
    return blocked;
}

function renderDraws() {
    const container = document.getElementById('draws-container');
    const draws = APP_STATE.draws || CONFIG.DRAWS;
    container.innerHTML = draws.map(draw => {
        const timeBlocked = isDrawBlocked(draw.time);
        const adminBlocked = draw.active === false;
        const blocked = timeBlocked || adminBlocked;
        const isActive = APP_STATE.selectedDraw === draw.id && !blocked;
        
        let blockReason = '';
        if (adminBlocked) blockReason = 'BLOKÉ (admin)';
        else if (timeBlocked) blockReason = 'BLOKÉ (3 min)';
        
        return `
            <div class="draw-card ${isActive ? 'active' : ''} ${blocked ? 'blocked' : ''}" 
                 onclick="${blocked ? '' : `selectDraw('${draw.id}')`}" 
                 style="--draw-color: ${draw.color}">
                <span class="draw-name">${draw.name}</span>
                <span class="draw-time"><i class="far fa-clock"></i> ${draw.time}</span>
                ${blocked ? `<span class="blocked-badge">${blockReason}</span>` : ''}
            </div>
        `;
    }).join('');
}

function selectDraw(id) {
    if (APP_STATE.multiDrawMode) return;
    
    const draws = APP_STATE.draws || CONFIG.DRAWS;
    const draw = draws.find(d => d.id === id);
    if (!draw.active) {
        alert("Tiraj sa a bloke pa administratè a. Ou pa ka jwe li.");
        return;
    }
    if (isDrawBlocked(draw.time)) {
        alert("Tiraj sa a ap rantre nan 3 minit. Ou pa ka ajoute paray.");
        return;
    }
    
    APP_STATE.selectedDraw = id;
    APP_STATE.selectedDraws = [id];
    document.getElementById('current-draw-title').textContent = draw.name;
    
    document.getElementById('multi-draw-indicator').style.display = 'none';
    
    document.getElementById('draw-selection-screen').classList.remove('active');
    document.getElementById('betting-screen').classList.add('active');
    document.querySelector('.back-button').style.display = 'flex';
    
    updateGameSelector();
    checkSelectedDrawStatus();
}

function goBackToDraws() {
    document.getElementById('betting-screen').classList.remove('active');
    document.getElementById('draw-selection-screen').classList.add('active');
    document.querySelector('.back-button').style.display = 'none';
    
    APP_STATE.multiDrawMode = false;
    const btn = document.getElementById('multi-draw-btn');
    btn.innerHTML = '<i class="fas fa-layer-group"></i> Plizyè Tiraj';
    btn.style.background = 'rgba(0, 212, 255, 0.2)';
    btn.style.borderColor = 'var(--secondary)';
    btn.style.color = 'var(--secondary)';
    
    document.getElementById('multi-draw-container').style.display = 'none';
    document.getElementById('multi-draw-continue').style.display = 'none';
    document.getElementById('draws-container').style.display = 'grid';
    
    renderDraws();
}

function toggleMultiDrawMode() {
    APP_STATE.multiDrawMode = !APP_STATE.multiDrawMode;
    const btn = document.getElementById('multi-draw-btn');
    const multiContainer = document.getElementById('multi-draw-container');
    const continueBtn = document.getElementById('multi-draw-continue');
    const drawGrid = document.getElementById('draws-container');
    
    if (APP_STATE.multiDrawMode) {
        btn.innerHTML = '<i class="fas fa-times"></i> Sispann Plizyè Tiraj';
        btn.style.background = 'rgba(255, 77, 77, 0.2)';
        btn.style.borderColor = 'var(--danger)';
        btn.style.color = 'var(--danger)';
        multiContainer.style.display = 'grid';
        continueBtn.style.display = 'block';
        drawGrid.style.display = 'none';
        renderMultiDrawSelector();
    } else {
        btn.innerHTML = '<i class="fas fa-layer-group"></i> Plizyè Tiraj';
        btn.style.background = 'rgba(0, 212, 255, 0.2)';
        btn.style.borderColor = 'var(--secondary)';
        btn.style.color = 'var(--secondary)';
        multiContainer.style.display = 'none';
        continueBtn.style.display = 'none';
        drawGrid.style.display = 'grid';
    }
}

function renderMultiDrawSelector() {
    const container = document.getElementById('multi-draw-container');
    const draws = APP_STATE.draws || CONFIG.DRAWS;
    container.innerHTML = draws.map(draw => {
        const timeBlocked = isDrawBlocked(draw.time);
        const adminBlocked = draw.active === false;
        const blocked = timeBlocked || adminBlocked;
        const isSelected = APP_STATE.selectedDraws.includes(draw.id);
        return `
            <input type="checkbox" class="multi-draw-checkbox" id="multi-${draw.id}" 
                   value="${draw.id}" ${isSelected && !blocked ? 'checked' : ''}
                   ${blocked ? 'disabled' : ''}
                   onchange="toggleMultiDrawSelection('${draw.id}')">
            <label for="multi-${draw.id}" class="multi-draw-label" style="border-left: 3px solid ${draw.color}; ${blocked ? 'opacity: 0.5;' : ''}">
                ${draw.name} ${blocked ? '(BLOKÉ)' : ''}
            </label>
        `;
    }).join('');
    
    document.getElementById('selected-draws-count-multi').textContent = APP_STATE.selectedDraws.length;
}

function toggleMultiDrawSelection(drawId) {
    const checkbox = document.getElementById(`multi-${drawId}`);
    if (checkbox.checked) {
        if (!APP_STATE.selectedDraws.includes(drawId)) {
            APP_STATE.selectedDraws.push(drawId);
        }
    } else {
        APP_STATE.selectedDraws = APP_STATE.selectedDraws.filter(id => id !== drawId);
    }
    
    document.getElementById('selected-draws-count-multi').textContent = APP_STATE.selectedDraws.length;
    document.getElementById('selected-draws-count').textContent = APP_STATE.selectedDraws.length;
}

function continueToBettingWithMultiDraw() {
    if (APP_STATE.selectedDraws.length === 0) {
        alert("Tanpri chwazi omwen yon tiraj");
        return;
    }
    
    // Vérifier qu'aucun tirage sélectionné n'est bloqué
    const draws = APP_STATE.draws || CONFIG.DRAWS;
    for (const drawId of APP_STATE.selectedDraws) {
        const draw = draws.find(d => d.id === drawId);
        if (!draw.active || isDrawBlocked(draw.time)) {
            alert(`Tiraj ${draw.name} bloke, retire li anvan ou kontinye.`);
            return;
        }
    }
    
    APP_STATE.selectedDraw = APP_STATE.selectedDraws[0];
    const draw = draws.find(d => d.id === APP_STATE.selectedDraw);
    document.getElementById('current-draw-title').textContent = draw.name;
    
    const indicator = document.getElementById('multi-draw-indicator');
    indicator.style.display = 'block';
    document.getElementById('selected-draws-count').textContent = APP_STATE.selectedDraws.length;
    
    document.getElementById('draw-selection-screen').classList.remove('active');
    document.getElementById('betting-screen').classList.add('active');
    document.querySelector('.back-button').style.display = 'flex';
    
    updateGameSelector();
    checkSelectedDrawStatus();
}
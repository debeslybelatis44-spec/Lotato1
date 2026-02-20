// ==========================================
// CORRECTION 1: Vérifier l'authentification et charger les données de l'utilisateur
// ==========================================
async function checkAuth() {
    console.log("Vérification authentification...");
    
    // Vérifier d'abord si le token est dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    // Vérifier ensuite dans le localStorage
    const tokenFromStorage = localStorage.getItem('nova_token');
    
    // Priorité: token URL > token storage
    const token = tokenFromUrl || tokenFromStorage;
    
    if (!token) {
        console.log("Aucun token trouvé, redirection vers index.html");
        // Rediriger vers la page de connexion
        window.location.href = '/index.html';
        return false;
    }
    
    authToken = token;
    
    // Stocker le token dans localStorage s'il vient de l'URL
    if (tokenFromUrl && !tokenFromStorage) {
        localStorage.setItem('nova_token', tokenFromUrl);
        // Nettoyer l'URL du token
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
    
    // Charger les informations de l'utilisateur depuis l'API
    try {
        console.log("Vérification du token via API...");
        const response = await apiCall(APP_CONFIG.authCheck);
        console.log("Réponse authCheck:", response);
        
        if (response && response.success && response.admin) {
            currentUser = response.admin;
            console.log('✅ Utilisateur connecté:', currentUser);
            
            // Masquer l'écran de connexion intégré
            document.getElementById('login-screen').style.display = 'none';
            
            // Afficher l'application principale
            showMainApp();
            
            // Mettre à jour l'affichage du nom d'utilisateur
            updateUserDisplay();
            
            return true;
        } else {
            console.log('Token invalide ou réponse incorrecte');
            // Token invalide
            handleLogout();
            return false;
        }
    } catch (error) {
        console.error('Erreur vérification authentification:', error);
        handleLogout();
        return false;
    }
}

// Mettre à jour l'affichage de l'utilisateur
function updateUserDisplay() {
    if (currentUser) {
        const userElements = document.querySelectorAll('.user-name-display');
        userElements.forEach(element => {
            element.textContent = currentUser.name || currentUser.username;
        });
    }
}

// Gérer la déconnexion
function handleLogout() {
    console.log("Déconnexion...");
    localStorage.removeItem('nova_token');
    authToken = null;
    currentUser = null;
    window.location.href = '/index.html';
}
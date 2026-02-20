// auth-check.js - À inclure dans toutes les pages protégées
document.addEventListener('DOMContentLoaded', function() {
    // Vérifier si un cookie de session existe
    checkAuthStatus();
    
    // Vérifier périodiquement
    setInterval(checkAuthStatus, 300000); // Toutes les 5 minutes
});

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/verify-token', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            // Rediriger vers la page de connexion
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        
        if (!data.success) {
            // Rediriger vers la page de connexion
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Erreur vérification auth:', error);
        window.location.href = '/';
    }
}

// Fonction de déconnexion
async function logout() {
    try {
        await fetch('/api/auth/logout', { 
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Erreur déconnexion:', error);
    }
    window.location.href = '/';
}

// Exposer globalement
window.logout = logout;
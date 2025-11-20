// js/ui-manager.js
import { stateManager } from './state-manager.js';

export const uiManager = {
  
  init: () => {
    // Suscribirse a cambios de estado para reaccionar automáticamente
    stateManager.subscribe((state) => {
      uiManager.updateAuthUI(state.currentUserData);
      uiManager.updateTournamentsList(state.tournaments, state.loading.tournaments);
      // Aquí podríamos añadir más reacciones a cambios de estado
    });
  },

  // --- MANEJO DE MODALES ---
  
  openModal: (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('hidden');
      // Animación simple
      setTimeout(() => {
        const card = modal.querySelector('.glass-card');
        if (card) card.classList.remove('scale-95');
      }, 10);
    }
  },

  closeModal: (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      const card = modal.querySelector('.glass-card');
      if (card) card.classList.add('scale-95');
      
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 300);
    }
  },

  // --- NAVEGACIÓN ---

  showPage: (pageId) => {
    document.querySelectorAll('.page-content').forEach(page => {
      page.classList.add('hidden');
    });
    const activePage = document.getElementById(`page-${pageId}`);
    if (activePage) {
      activePage.classList.remove('hidden');
    }
    
    // Actualizar menú activo
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageId) link.classList.add('active');
    });
  },

  // --- ACTUALIZACIÓN DE UI BASADA EN ESTADO ---

  updateAuthUI: (user) => {
    const userProfile = document.getElementById('user-profile');
    const registerBtn = document.getElementById('register-btn');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
      // Usuario Logueado
      if (userProfile) userProfile.classList.remove('hidden');
      if (registerBtn) registerBtn.classList.add('hidden');
      if (loginBtn) loginBtn.classList.add('hidden');
      if (logoutBtn) logoutBtn.classList.remove('hidden');

      // Llenar datos
      const nameEl = document.getElementById('user-name');
      const initialsEl = document.getElementById('user-initials');
      const roleEl = document.getElementById('user-role');
      
      const displayName = user.name || user.email;
      if (nameEl) nameEl.textContent = displayName;
      if (initialsEl) initialsEl.textContent = displayName.charAt(0).toUpperCase();
      if (roleEl) roleEl.textContent = user.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'Jugador';
      
    } else {
      // Usuario Invitado
      if (userProfile) userProfile.classList.add('hidden');
      if (registerBtn) registerBtn.classList.remove('hidden');
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (logoutBtn) logoutBtn.classList.add('hidden');
    }
  },

  updateTournamentsList: (tournaments, isLoading) => {
    const grid = document.querySelector('#page-tournaments .grid');
    const loader = document.getElementById('tournament-loader');
    
    if (!grid) return;

    if (isLoading) {
        if (loader) loader.classList.remove('hidden');
        return; 
    } else {
        if (loader) loader.classList.add('hidden');
    }

    // Limpiar grid pero mantener la tarjeta de "Nuevo Torneo"
    const addCard = document.getElementById('add-tournament-card');
    grid.innerHTML = ''; 
    if (addCard) grid.appendChild(addCard);

    if (tournaments.length === 0) {
        // Podríamos mostrar un mensaje de "No hay torneos aún"
        return;
    }

    tournaments.forEach(tournament => {
        const card = uiManager.createTournamentCard(tournament);
        if (addCard) {
            grid.insertBefore(card, addCard);
        } else {
            grid.appendChild(card);
        }
    });
  },

  createTournamentCard: (tournament) => {
    const card = document.createElement('div');
    card.className = 'tournament-card glass-card rounded-xl p-5 shadow-lg transition-all duration-300';
    
    let displayDate = 'Fecha no especificada';
    if (tournament.startDate) {
      try {
        // Manejo seguro de fechas (string o timestamp)
        const dateObj = tournament.startDate.toDate ? tournament.startDate.toDate() : new Date(tournament.startDate);
        displayDate = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      } catch(e) { 
        console.warn("Error formateando fecha", e);
      }
    }

    const categoriesText = Array.isArray(tournament.categories) 
      ? tournament.categories.join(' - ') 
      : 'Categorías no esp.';

    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-white text-lg">${tournament.name}</h3>
          <p class="text-gray-400 text-sm mt-1">${categoriesText}</p>
        </div>
        <span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-full">${tournament.status || 'Activo'}</span>
      </div>
      <div class="flex items-center text-gray-400 text-sm mb-4">
        <i class="fas fa-calendar-alt mr-2"></i>
        <span>${displayDate}</span>
      </div>
      <div class="flex items-center text-gray-400 text-sm mb-4">
        <i class="fas fa-map-marker-alt mr-2"></i>
        <span>${tournament.location || 'Ubicación no definida'}</span>
      </div>
      <button class="mt-4 w-full btn-tertiary py-2 rounded-lg text-sm font-medium hover:text-white">Ver Detalles</button>
    `;
    return card;
  },

  // --- HELPERS DE UI ---
  
  toggleSpinner: (button, show) => {
    if (!button) return;
    const spinner = button.querySelector('.spinner');
    const text = button.querySelector('.button-text');
    
    if (show) {
        button.disabled = true;
        if (spinner) spinner.classList.remove('hidden');
        if (text) text.classList.add('hidden');
    } else {
        button.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        if (text) text.classList.remove('hidden');
    }
  },

  showError: (elementId, message) => {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
    }
  },
  
  hideError: (elementId) => {
      const el = document.getElementById(elementId);
      if (el) el.classList.add('hidden');
  }
};
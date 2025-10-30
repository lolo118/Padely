import { app, auth, db } from './firebase.js';
import { registerUser, loginUser, logoutUser, onAuthStateChanged } from './auth.js';
import { saveTournament, loadTournaments } from './tournaments.js';
import { openModal, closeModal, showPage } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  // Page navigation
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = e.currentTarget.dataset.page;
      showPage(pageId);
    });
  });

  // Modal interactions
  document.getElementById('login-btn').addEventListener('click', () => openModal('login-modal'));
  document.getElementById('register-btn').addEventListener('click', () => openModal('register-modal'));
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

  // Tournament creation
  const createTournamentBtn = document.getElementById('create-tournament-btn');
  if (createTournamentBtn) {
    createTournamentBtn.addEventListener('click', () => openModal('create-tournament-wizard'));
  }

  const wizardFinishBtn = document.getElementById('wizard-finish');
  if (wizardFinishBtn) {
    wizardFinishBtn.addEventListener('click', async () => {
      const tournamentData = {
        name: document.getElementById('wizard-tournament-name').value,
        // Collect other data from the wizard
      };
      try {
        await saveTournament(tournamentData);
        closeModal('create-tournament-wizard');
        // Optionally, refresh the tournament list
      } catch (error) {
        console.error("Error saving tournament: ", error);
      }
    });
  }

  // Authentication forms
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = e.target.username.value;
      const password = e.target.password.value;
      try {
        await loginUser(email, password);
        closeModal('login-modal');
      } catch (error) {
        console.error("Error logging in: ", error);
        // Display error message to the user
      }
    });
  }

  const registerForm = document.getElementById('register-form-player');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = e.target.email.value;
      const password = e.target.password.value;
      try {
        await registerUser(email, password);
        closeModal('register-modal');
      } catch (error) {
        console.error("Error registering: ", error);
        // Display error message to the user
      }
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logoutUser();
      } catch (error) {
        console.error("Error logging out: ", error);
      }
    });
  }

  // Listen for authentication state changes
  onAuthStateChanged((user) => {
    if (user) {
      loadAndRenderTournaments();
    }
    const userProfile = document.getElementById('user-profile');
    const registerBtn = document.getElementById('register-btn');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
      // User is signed in
      userProfile.classList.remove('hidden');
      registerBtn.classList.add('hidden');
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');

      // Update user profile information
      document.getElementById('user-name').textContent = user.email;
      document.getElementById('user-initials').textContent = user.email.charAt(0).toUpperCase();
    } else {
      // User is signed out
      userProfile.classList.add('hidden');
      registerBtn.classList.remove('hidden');
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
    }
  });

  const createTournamentCard = (tournament) => {
    const card = document.createElement('div');
    card.className = 'tournament-card glass-card rounded-xl p-5 shadow-lg transition-all duration-300';
    card.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-white text-lg">${tournament.name}</h3>
          <p class="text-gray-400 text-sm mt-1">${tournament.category || 'Categoría no especificada'}</p>
        </div>
        <span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-full">Activo</span>
      </div>
      <div class="flex items-center text-gray-400 text-sm mb-4">
        <i class="fas fa-calendar-alt mr-2"></i>
        <span>${tournament.date || 'Fecha no especificada'}</span>
      </div>
      <button class="mt-4 w-full btn-tertiary py-2 rounded-lg text-sm font-medium">Ver Detalles</button>
    `;
    return card;
  };

  const loadAndRenderTournaments = async () => {
    const tournamentsGrid = document.querySelector('#page-tournaments .grid');
    if (tournamentsGrid) {
      // Clear existing tournaments except for the "add" card
      tournamentsGrid.innerHTML = '';
      const addTournamentCard = document.getElementById('add-tournament-card');
      if (addTournamentCard) {
        tournamentsGrid.appendChild(addTournamentCard);
      }

      try {
        const querySnapshot = await loadTournaments();
        querySnapshot.forEach((doc) => {
          const tournament = doc.data();
          const card = createTournamentCard(tournament);
          tournamentsGrid.insertBefore(card, addTournamentCard);
        });
      } catch (error) {
        console.error("Error loading tournaments: ", error);
      }
    }
  };
});

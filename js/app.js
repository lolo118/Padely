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
      // Helper function to get checked values from a group of checkboxes
      const getCheckedValues = (selector) => {
        return Array.from(document.querySelectorAll(selector))
          .filter(checkbox => checkbox.checked)
          .map(checkbox => checkbox.value);
      };

      // Collect data from the wizard
      const tournamentData = {
        // Step 1: Modality
        modality: document.querySelector('.modality-card.border-green-500')?.dataset.modality,

        // Step 2: Details
        name: document.getElementById('wizard-tournament-name').value,
        startDate: document.getElementById('wizard-start-datetime').value,
        endDate: document.getElementById('wizard-end-datetime').value,
        location: document.getElementById('wizard-location').value,
        branches: getCheckedValues('input[name="branch"]:checked'),
        categories: getCheckedValues('.category-checkbox:checked'),

        // Step 3: Format
        format: {
          sets: document.getElementById('format-sets-best-of').value,
          tiebreak: document.getElementById('format-tiebreak').value,
          goldenPoint: document.getElementById('format-punto-oro').checked,
          // Modality-specific options
          americano: {
            duration: document.getElementById('format-americano-duration').value,
            teamsPerCourt: document.getElementById('format-americano-teams-per-court').value,
          },
          roundrobin: {
            teamsPerGroup: document.getElementById('format-rr-teams-per-group').value,
            teamsQualify: document.getElementById('format-rr-teams-qualify').value,
          },
          liga: {
            winPoints: document.getElementById('format-liga-win-points').value,
            drawPoints: document.getElementById('format-liga-draw-points').value,
            lossPoints: document.getElementById('format-liga-loss-points').value,
          },
          eliminatoria: {
            consuelo: document.getElementById('eliminatoria-consuelo').checked,
          },
          pozo: {
              courts: document.getElementById('format-pozo-courts').value
          }
        },

        // Step 4: Rules
        price: document.getElementById('wizard-price').value,
        deadline: document.getElementById('wizard-deadline').value,
        tiebreakRules: document.getElementById('wizard-tiebreak').value,

        // Metadata
        createdAt: new Date(),
        status: 'pending' // Or 'active' depending on the desired initial state
      };

      try {
        await saveTournament(tournamentData);
        closeModal('create-tournament-wizard');
        loadAndRenderTournaments(); // Refresh the tournament list
        // TODO: Reset wizard form
      } catch (error) {
        console.error("Error saving tournament: ", error);
        // TODO: Display error to user in the wizard
      }
    });
  }

  // Authentication forms
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const loginError = document.getElementById('login-error');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = e.target.username.value;
      const password = e.target.password.value;
      loginError.classList.add('hidden'); // Hide previous errors

      try {
        await loginUser(email, password);
        closeModal('login-modal');
      } catch (error) {
        console.error("Error logging in: ", error);
        loginError.textContent = getFirebaseAuthErrorMessage(error);
        loginError.classList.remove('hidden');
      }
    });
  }

  // Note: This only handles the player registration form for now.
  // A more robust solution would handle all registration forms.
  const registerForm = document.getElementById('register-form-player');
  if (registerForm) {
    // It's good practice to have a dedicated error element for registration
    // For now, we'll alert, but a dedicated element is better UI.
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      // This assumes the register form has inputs with these names
      const email = e.target.email.value;
      const password = e.target.password.value;

      try {
        await registerUser(email, password);
        closeModal('register-modal');
      } catch (error) {
        console.error("Error registering: ", error);
        alert(`Registration failed: ${getFirebaseAuthErrorMessage(error)}`);
      }
    });
  }

  // A helper function to translate Firebase auth error codes into user-friendly messages.
  const getFirebaseAuthErrorMessage = (error) => {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'Por favor, introduce una dirección de correo electrónico válida.';
      case 'auth/user-disabled':
        return 'Esta cuenta de usuario ha sido deshabilitada.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Correo electrónico o contraseña incorrectos. Por favor, inténtalo de nuevo.';
      case 'auth/email-already-in-use':
        return 'Esta dirección de correo electrónico ya está en uso por otra cuenta.';
      case 'auth/weak-password':
        return 'La contraseña es demasiado débil. Debe tener al menos 6 caracteres.';
      case 'auth/operation-not-allowed':
         return 'El inicio de sesión con correo electrónico y contraseña no está habilitado.';
      default:
        return 'Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo más tarde.';
    }
  };

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
      const addTournamentCard = document.getElementById('add-tournament-card');

      // Clear only the dynamically loaded tournament cards
      const existingCards = tournamentsGrid.querySelectorAll('.tournament-card:not(#add-tournament-card)');
      existingCards.forEach(card => card.remove());

      try {
        const querySnapshot = await loadTournaments();
        querySnapshot.forEach((doc) => {
          const tournament = doc.data();
          const card = createTournamentCard(tournament);
          // Insert the new card before the "add" card
          if (addTournamentCard) {
            tournamentsGrid.insertBefore(card, addTournamentCard);
          } else {
            tournamentsGrid.appendChild(card);
          }
        });
      } catch (error) {
        console.error("Error loading tournaments: ", error);
      }
    }
  };
});
